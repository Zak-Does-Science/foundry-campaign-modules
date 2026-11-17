// MAUL Mall Explorer: naming moments (SPEC 13). A `kind: "muse"` interactable asks the player to write something into
// the world (a name + a description). The first answer wins for the whole world: it's saved to the world setting
// `muses` and as a page of the journal "MAUL: Player Inventions", and from then on the thing shows its `after` text.
// Answering gives Heroic Inspiration, once per character per week. Players can't write world settings or create
// journals, so the active GM's client does the saving (module socket), like the leyline.

import {MODULE, SOCKET, esc} from "./config.js";
import {showDialogue} from "./dialogue.js";
import {logEvent, markSeen} from "./progress.js";
import {recordWriting} from "./writings.js";
import {LIMITS, attachCounters} from "./counter.js";
import {usedThisWeek, markUsed, whisperGM} from "./weekly.js";
import {Sfx} from "./audio.js";

const {DialogV2} = foundry.applications.api;
const JOURNAL_NAME = "MAUL: Player Inventions";
const REPLY_TIMEOUT_MS = 15000;
const pending = new Map();

const answers = () => game.settings.get(MODULE, "muses") ?? {};

/** Fill an `after` template: {who}, {name}, {description}, any other field name. */
export function fillAfter(template, record) {
  const vals = {who: record.who ?? "Someone", ...(record.values ?? {})};
  return String(template ?? "").replace(/\{(\w+)\}/g, (m, k) => (k in vals ? String(vals[k]) : m));
}

function afterText(ia, record) {
  if ( ia.after ) return fillAfter(ia.after, record);
  const v = record.values ?? {};
  return `${record.who ?? "Someone"} named this: ${v.name ?? ""}${v.description ? `. ${v.description}` : ""}`;
}

/** Entry point from runInteraction for kind "muse". */
export async function openMuseFlow({entry, ctx, pages}) {
  const ia = entry.ia;
  const dlg = {speaker: ia.name, kind: "object", sprite: ia.sprite, id: ia.id};
  await markSeen(ia.id);
  const done = answers()[ia.id];
  if ( done ) {
    await showDialogue({...dlg, pages: [afterText(ia, done)]});
    await logEvent({kind: "talk", id: ia.id, name: ia.name ?? ia.id});
    return;
  }
  const {completed} = await showDialogue({...dlg, pages});
  if ( !completed ) return;
  const values = await askPrompt(ia);
  if ( !values ) return;
  // Kept in full straight away (SPEC 28), whether or not a GM is online to write it into the world
  const fields = Object.fromEntries(Object.entries(values).map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), v]));
  await recordWriting({form: "naming-moment", title: ia.name ?? ia.id, fields, about: `${ctx.mall.name ?? ctx.mall.id}: ${ia.id}`});
  if ( !game.user.isGM && !game.users.activeGM ) {
    await showDialogue({...dlg, pages: ["You feel a story forming... Saved for the DM, who'll write it into the world. (Nobody can claim it in the mall until a GM is online.)"]});
    await logEvent({kind: "muse", id: ia.id, name: `Wrote a naming idea for ${ia.name ?? ia.id} (no GM online)`, values});
    return;
  }
  const actor = game.user.character;
  const req = {
    type: "muse", requestId: foundry.utils.randomID(), userId: game.user.id,
    museId: ia.id, museName: ia.name ?? ia.id, mallId: ctx.mall.id, mallName: ctx.mall.name ?? ctx.mall.id,
    who: actor?.name ?? game.user.name, values, after: ia.after ?? null
  };
  const res = await requestSave(req);
  if ( !res?.ok ) {
    if ( res?.record ) {
      await showDialogue({...dlg, pages: ["Someone beat you to it!", afterText(ia, res.record)]});
    } else {
      ui.notifications.warn(`Mall Explorer: couldn't save that (${res?.error ?? "no reply from the DM's client"}). Try again later.`);
    }
    return;
  }
  Sfx.chime();
  const pagesAfter = [afterText(ia, res.record)];
  if ( actor && !usedThisWeek(actor, "muse") ) {
    try {
      await actor.update({"system.attributes.inspiration": true});
      await markUsed(actor, "muse");
      pagesAfter.push("You feel inspired. (Heroic Inspiration!)");
    } catch(err) {
      console.warn(`${MODULE} | inspiration failed`, err);
    }
  }
  await showDialogue({...dlg, pages: pagesAfter});
  await logEvent({kind: "muse", id: ia.id, name: `Named ${ia.name ?? ia.id}`, values});
}

/** The two-field prompt. Returns {field: value} or null. */
async function askPrompt(ia) {
  const prompt = ia.prompt ?? {};
  const fields = Array.isArray(prompt.fields) && prompt.fields.length ? prompt.fields : ["name", "description"];
  const inputs = fields.map(f => {
    const label = esc(f.charAt(0).toUpperCase() + f.slice(1));
    return f === "name"
      ? `<div class="form-group stacked"><label>${label}</label><input type="text" name="${esc(f)}" required data-max="${LIMITS.name}" data-soft
          data-over="that's a long name! It's all saved, but it may not fit on the plaque."></div>`
      : `<div class="form-group stacked"><label>${label}</label><textarea name="${esc(f)}" rows="4" data-max="${LIMITS.long}" data-soft
          data-over="that's a lot! It's all saved for Zak."></textarea></div>`;
  }).join("");
  const values = await DialogV2.prompt({
    window: {title: ia.name ?? "A naming moment", icon: "fas fa-feather"},
    position: {width: 460},
    content: `<p>${esc(prompt.ask ?? "What is it called, and what's special about it?")}</p>${inputs}`,
    render: (event, dialog) => attachCounters(dialog.element),
    ok: {
      label: "Write it into the world",
      callback: (event, button) => {
        const out = {};
        for ( const f of fields ) {
          const raw = String(button.form.elements[f]?.value ?? "");     // full length (SPEC 28); names on one line
          out[f] = f === "name" ? raw.replace(/\s+/g, " ").trim() : raw.trim();
        }
        return out;
      }
    },
    rejectClose: false,
    modal: true
  });
  if ( !values || !Object.values(values).some(Boolean) ) return null;
  if ( fields.includes("name") && !values.name ) return null;
  return values;
}

async function requestSave(req) {
  if ( game.user.isGM ) return saveAnswer(req);
  return new Promise(resolve => {
    const timer = setTimeout(() => { pending.delete(req.requestId); resolve({ok: false, error: "no reply from the DM's client"}); }, REPLY_TIMEOUT_MS);
    pending.set(req.requestId, msg => { clearTimeout(timer); resolve(msg); });
    game.socket.emit(SOCKET, req);
  });
}

/** GM: save the first answer for a muse (setting + journal page). */
let saving = Promise.resolve();
function saveAnswer(req) {
  const run = saving.then(() => saveAnswerNow(req));
  saving = run.catch(() => {});
  return run;
}

async function saveAnswerNow(req) {
  const all = foundry.utils.deepClone(answers());
  if ( all[req.museId] ) return {ok: false, record: all[req.museId]};
  const values = {};
  for ( const [k, v] of Object.entries(req.values ?? {}) ) {
    if ( !/^\w{1,30}$/.test(k) ) continue;
    values[k] = String(v ?? "");
  }
  const record = {who: String(req.who ?? "Someone"), userId: req.userId, values, at: Date.now(),
    mall: req.mallId, name: req.museName};
  all[req.museId] = record;
  await game.settings.set(MODULE, "muses", all);
  try {
    let je = game.journal.find(j => j.getFlag(MODULE, "inventions")) ?? game.journal.getName(JOURNAL_NAME);
    const OBS = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    if ( !je ) je = await JournalEntry.create({name: JOURNAL_NAME, ownership: {default: OBS}, flags: {[MODULE]: {inventions: true}}});
    const text = req.after ? fillAfter(req.after, record) : "";
    const rest = Object.entries(values).filter(([k]) => k !== "name")
      .map(([k, v]) => `<p><strong>${esc(k.charAt(0).toUpperCase() + k.slice(1))}:</strong> ${esc(v)}</p>`).join("");
    await je.createEmbeddedDocuments("JournalEntryPage", [{
      name: `${values.name || req.museName} (${record.who})`,
      type: "text",
      text: {format: 1, content: `<p><em>${esc(req.museName)}, ${esc(req.mallName ?? req.mallId ?? "")}. Named by ${esc(record.who)}.</em></p>
        ${values.name ? `<h3>${esc(values.name)}</h3>` : ""}${rest}${text ? `<p class="maul-dim">${esc(text)}</p>` : ""}`},
      flags: {[MODULE]: {muse: req.museId}}
    }]);
  } catch(err) {
    console.error(`${MODULE} | saving the invention journal failed`, err);
  }
  const user = game.users.get(req.userId);
  whisperGM(`<h3>Naming moment</h3><p><strong>${esc(user?.name ?? "?")}</strong> (${esc(record.who)}) named
    <em>${esc(req.museName)}</em>: <strong>${esc(values.name ?? "")}</strong>. ${esc(values.description ?? "")}</p>`);
  return {ok: true, record};
}

/** Socket: the active GM saves answers; players get the reply. Call once on ready. */
export function registerMuseSocket() {
  game.socket.on(SOCKET, async msg => {
    if ( msg?.type === "muse-done" ) {
      if ( msg.userId !== game.user.id ) return;
      const done = pending.get(msg.requestId);
      pending.delete(msg.requestId);
      done?.(msg);
      return;
    }
    if ( msg?.type !== "muse" || game.user !== game.users.activeGM ) return;
    let reply;
    try { reply = await saveAnswer(msg); } catch(err) { reply = {ok: false, error: err.message}; }
    game.socket.emit(SOCKET, {type: "muse-done", requestId: msg.requestId, userId: msg.userId, ...reply});
  });
}

