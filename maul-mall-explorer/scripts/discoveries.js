// MAUL Mall Explorer: the character "save file" tools for the GM (SPEC 3).
// - Discoveries: every codex-cue / clue / noticed flag per character with the time found, and "Share with table".
// - Export character logs: one JSON with every player's log + flags (for Zak to hand to Claude after a session).
// - Apply update file: reads data/updates/index.json + listed files, previews, applies on confirm.

import {MODULE, MALLS, OFFICE_FLAG, modPath, esc} from "./config.js";
import {getMall} from "./data.js";
import {getProgress, getLog, setFlags, unsetFlags, hasFlag, safe} from "./progress.js";
import {getWeek} from "./week.js";

const {ApplicationV2, DialogV2} = foundry.applications.api;
const CODEX = "maul-campaign-codex";
const SKIP_PREFIXES = ["met-", "heard-", "shared-", "entered-"];

const players = () => game.users.filter(u => !u.isGM);
const tableOf = u => u?.getFlag(MODULE, "table") || "";
const charName = u => u?.character?.name ?? u?.name ?? "";
const fmt = ts => (ts ? new Date(ts).toLocaleString() : "");

function codexApi() {
  const mod = game.modules.get(CODEX);
  return mod?.active ? mod.api ?? null : null;
}

/** Codex cue flags -> [{title, target}] (empty if the codex isn't active). */
async function codexCues() {
  const map = new Map();
  try {
    for ( const f of (await codexApi()?.cueFacts?.()) ?? [] ) {
      if ( !f.cue ) continue;
      const k = safe(f.cue);
      if ( !map.has(k) ) map.set(k, []);
      map.get(k).push(f);
    }
  } catch(err) {
    console.warn(`${MODULE} | codex cue list unavailable`, err);
  }
  return map;
}

/** Every flag any mall's content can set (clue flags), stored-key form. */
async function clueFlags() {
  const out = new Set([safe(OFFICE_FLAG)]);
  const addSets = sets => (Array.isArray(sets) ? sets : []).forEach(f => f && out.add(safe(f)));
  const addPages = pages => (Array.isArray(pages) ? pages : []).forEach(p => p && typeof p === "object" && addSets(p.sets));
  for ( const id of MALLS ) {
    const mall = await getMall(id).catch(() => null);
    if ( !mall ) continue;
    for ( const ia of mall.interactables ?? [] ) {
      addSets(ia.sets);
      addPages(ia.pages);
      addPages(ia.lockedPages);
      for ( const pages of Object.values(ia.weekPages ?? {}) ) addPages(pages);
    }
    for ( const chat of mall.ambient?.chats ?? [] ) {
      addSets(chat.sets);
      for ( const v of chat.variants ?? [] ) addSets(v.sets);
    }
    for ( const g of mall.ambient?.gossip ?? [] ) {
      for ( const it of g.items ?? [] ) { addSets(it.sets); addPages(it.pages); }
    }
  }
  return out;
}

/* -------------------------------------------- */
/*  Share                                       */
/* -------------------------------------------- */

/**
 * Tell the whole table: the codex fact unlocks for the table, every table member gets the flag plus shared-<flag>,
 * and each gets a log entry saying who told them.
 */
export async function shareWithTable(flag, fromUser, {why = null, table = null, kind = "share"} = {}) {
  if ( !game.user.isGM ) return 0;
  table ||= tableOf(fromUser);
  if ( !table ) {
    ui.notifications.warn(`Mall Explorer: ${fromUser?.name ?? "that player"} isn't on a table, so there's no one to share with.`);
    return 0;
  }
  try {
    await codexApi()?.shareCue?.(flag, table, fromUser?.id ?? null);
  } catch(err) {
    console.error(`${MODULE} | codex share failed`, err);
  }
  const from = fromUser ? charName(fromUser) : null;
  let n = 0;
  for ( const m of players().filter(u => tableOf(u) === table) ) {
    await setFlags([flag, `shared-${flag}`], m, {kind, id: flag, name: from ? `Told by ${from}` : "Shared with the table",
      from: fromUser?.id ?? null, why});
    n++;
  }
  return n;
}

/* -------------------------------------------- */
/*  Discoveries window                          */
/* -------------------------------------------- */

export class DiscoveriesApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "maul-discoveries",
    classes: ["maul-app", "maul-gm-tools", "maul-discoveries", "maul-pixel"],
    tag: "div",
    window: {title: "MAUL: Discoveries", icon: "fas fa-lightbulb", resizable: true},
    position: {width: 640, height: 600},
    actions: {share: DiscoveriesApp.#onShare}
  };

  /** Debounced: every player flag write fires updateUser, and a render re-reads the codex GM pack. */
  static refresh() {
    clearTimeout(DiscoveriesApp._refreshTimer);
    DiscoveriesApp._refreshTimer = setTimeout(() => {
      const app = foundry.applications.instances.get("maul-discoveries");
      if ( app?.rendered ) app.render();
    }, 1000);
  }

  async _prepareContext() {
    const cues = await codexCues();
    const clues = await clueFlags();
    const users = players().map(u => {
      const {flags} = getProgress(u);
      const rows = Object.entries(flags)
        .filter(([k]) => !SKIP_PREFIXES.some(p => k.startsWith(p)))
        .map(([k, ts]) => {
          const facts = cues.get(k) ?? [];
          const type = facts.length ? "codex" : (k.startsWith("noticed-") ? "noticed" : (clues.has(k) ? "clue" : null));
          if ( !type ) return null;
          const table = tableOf(u);
          const shared = !!table && players().some(m => tableOf(m) === table && hasFlag(`shared-${k}`, m));
          return {flag: k, ts, type, facts, shared};
        })
        .filter(Boolean)
        .sort((a, b) => a.ts - b.ts);
      return {user: u, rows};
    }).filter(x => x.rows.length);
    return {users, codex: !!codexApi()};
  }

  async _renderHTML(context) {
    const body = context.users.map(({user, rows}) => {
      const table = tableOf(user);
      const trs = rows.map(r => `<tr data-user-id="${esc(user.id)}" data-flag="${esc(r.flag)}">
        <td><code>${esc(r.flag)}</code>${r.facts.length ? `<div class="maul-dim">${r.facts.map(f => esc(`${f.target}: ${f.title}`)).join("<br>")}</div>` : ""}</td>
        <td>${esc(r.type)}</td>
        <td class="maul-dim">${esc(fmt(r.ts))}</td>
        <td>${r.shared ? "<em>shared</em>" : `<button type="button" class="maul-btn small" data-action="share" ${table ? "" : "disabled title=\"No table\""}>Share with table</button>`}</td>
      </tr>`).join("");
      return `<h3>${esc(user.name)}${user.character ? ` <span class="maul-dim">(${esc(user.character.name)})</span>` : ""}
        <span class="maul-dim">${table ? esc(table) : "no table"}</span></h3>
        <table class="maul-users"><thead><tr><th>Flag</th><th>Type</th><th>Found</th><th></th></tr></thead><tbody>${trs}</tbody></table>`;
    }).join("");
    const note = context.codex ? "" : `<p class="maul-dim">MAUL Campaign Codex isn't active, so codex facts aren't listed or unlocked.</p>`;
    return `<section class="maul-gm-body">${note}${body || "<p><em>No discoveries yet.</em></p>"}</section>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  static async #onShare(event, target) {
    const row = target.closest("[data-flag]");
    const user = game.users.get(row?.dataset.userId);
    const flag = row?.dataset.flag;
    if ( !user || !flag ) return;
    target.disabled = true;
    const n = await shareWithTable(flag, user);
    if ( n ) ui.notifications.info(`Mall Explorer: shared ${flag} with the ${tableOf(user)} table (${n} player${n === 1 ? "" : "s"}).`);
    this.render();
  }
}

/* -------------------------------------------- */
/*  Export                                      */
/* -------------------------------------------- */

export function exportCharacterLogs() {
  if ( !game.user.isGM ) return;
  const data = {
    exported: new Date().toISOString(),
    world: game.world?.id ?? null,
    week: getWeek(),
    weekByTable: game.settings.get(MODULE, "weekByTable") ?? {},
    feedback: game.settings.get(MODULE, "feedback") ?? [],
    writingsFiled: game.settings.get(MODULE, "writingsFiled") ?? [],   // .txt files already written (SPEC 28)
    users: players().map(u => ({
      id: u.id,
      name: u.name,
      table: tableOf(u) || null,
      character: u.character?.name ?? null,
      flags: getProgress(u).flags,
      seen: getProgress(u).seen,
      leyline: u.getFlag(MODULE, "leyline") ?? null,
      pendingNotes: Object.values(u.getFlag(MODULE, "pendingFeedback") ?? {}).filter(n => n?.id),   // not yet delivered to a GM
      journal: u.getFlag(MODULE, "journal") ?? null,             // my shop / my character / off-time (SPEC 27)
      coworkers: u.getFlag(MODULE, "coworkers") ?? null,         // coworker look / act / other notes, sprite swaps
      acorndr: {profile: u.getFlag("acorndr", "profile") ?? null, posts: u.getFlag("acorndr", "posts") ?? {},   // SPEC 32: comment on
        comments: u.getFlag("acorndr", "comments") ?? {},                                                      // their own comments
        follows: Object.keys(u.getFlag("acorndr", "state")?.follows ?? {})},                                   // these between sessions
      writingsPending: Object.values(u.getFlag(MODULE, "writings") ?? {}).filter(w => w?.id),   // full text, file not written yet
      log: getLog(u)
    }))
  };
  const day = new Date().toISOString().slice(0, 10);
  foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "application/json", `maul-character-logs-${day}.json`);
}

/* -------------------------------------------- */
/*  Apply update files                          */
/* -------------------------------------------- */

async function fetchFresh(path) {
  try {
    const res = await fetch(path, {cache: "no-cache"});
    return res.ok ? await res.json() : null;
  } catch(err) {
    return null;
  }
}

function findCharacterUser(name) {
  const n = String(name ?? "").trim().toLowerCase();
  if ( !n ) return null;
  return players().find(u => u.character?.name?.trim().toLowerCase() === n)
    ?? players().find(u => u.name.trim().toLowerCase() === n) ?? null;
}

function previewHTML(file, upd) {
  const li = (label, flags, who, why) => `<li><strong>${esc(label)}</strong> ${who} &larr; ${(flags ?? []).map(f => `<code>${esc(f)}</code>`).join(" ")}
    ${why ? `<div class="maul-dim">${esc(why)}</div>` : ""}</li>`;
  const userTag = name => {
    const u = findCharacterUser(name);
    return u ? esc(`${name} (${u.name})`) : `<span class="maul-warn">${esc(name)} (no matching player: skipped)</span>`;
  };
  const tableTag = t => {
    const n = players().filter(u => tableOf(u) === t).length;
    return n ? esc(`${t} table (${n} players)`) : `<span class="maul-warn">${esc(t)} table (no players: skipped)</span>`;
  };
  const items = [
    ...(upd.grant ?? []).map(g => li("Grant", g.flags, userTag(g.character), g.why)),
    ...(upd.share ?? []).map(s => li("Share", s.flags, tableTag(s.table), s.why)),
    ...(upd.revoke ?? []).map(r => li("Revoke", r.flags, userTag(r.character), r.why))
  ].join("");
  return `<div class="maul-flags-view"><p><strong>${esc(upd.id ?? file)}</strong> <span class="maul-dim">${esc(file)}</span></p>
    ${upd.note ? `<p>${esc(upd.note)}</p>` : ""}<ul>${items || "<li><em>No changes in this file.</em></li>"}</ul></div>`;
}

async function applyUpdate(upd) {
  const entry = why => ({kind: "update", id: upd.id ?? null, name: upd.note ? String(upd.note).slice(0, 80) : "Update file", why: why ?? null});
  let changes = 0;
  for ( const g of upd.grant ?? [] ) {
    const u = findCharacterUser(g.character);
    if ( !u ) continue;
    changes += (await setFlags(g.flags ?? [], u, entry(g.why))).length;
  }
  for ( const s of upd.share ?? [] ) {
    if ( !players().some(u => tableOf(u) === s.table) ) continue;
    for ( const flag of s.flags ?? [] ) {
      changes += await shareWithTable(flag, findCharacterUser(s.from) ?? null, {why: s.why, table: s.table, kind: "update"});
    }
  }
  for ( const r of upd.revoke ?? [] ) {
    const u = findCharacterUser(r.character);
    if ( !u ) continue;
    const gone = await unsetFlags(r.flags ?? [], u, entry(r.why));
    changes += gone.length;
    for ( const f of gone ) {
      try { await codexApi()?.revokeCue?.(f, u.id); } catch(err) { console.warn(`${MODULE} | codex revoke failed`, err); }
    }
  }
  return changes;
}

export async function applyUpdateFiles() {
  if ( !game.user.isGM ) return;
  const index = await fetchFresh(modPath("data/updates/index.json"));
  const files = Array.isArray(index?.files) ? index.files : [];
  if ( !files.length ) {
    ui.notifications.info("Mall Explorer: no update files listed in data/updates/index.json.");
    return;
  }
  const applied = foundry.utils.deepClone(game.settings.get(MODULE, "appliedUpdates") ?? {});
  let pending = 0;
  for ( const file of files ) {
    const name = String(file).replace(/^.*[\\/]/, "");
    const upd = await fetchFresh(modPath(`data/updates/${name}`));
    if ( !upd ) {
      ui.notifications.warn(`Mall Explorer: update file ${name} couldn't be read; skipped.`);
      continue;
    }
    const id = upd.id ?? name;
    if ( applied[id] ) continue;
    pending++;
    const choice = await DialogV2.wait({
      window: {title: `Apply update: ${id}`, icon: "fas fa-file-import"},
      position: {width: 520},
      content: previewHTML(name, upd),
      buttons: [
        {action: "apply", label: "Apply", icon: "fas fa-check", default: true},
        {action: "skip", label: "Not now"},
        {action: "stop", label: "Stop"}
      ],
      rejectClose: false,
      modal: true
    });
    if ( choice === "stop" || !choice ) break;
    if ( choice !== "apply" ) continue;
    const n = await applyUpdate(upd);
    applied[id] = Date.now();
    await game.settings.set(MODULE, "appliedUpdates", applied);
    ui.notifications.info(`Mall Explorer: applied ${id} (${n} change${n === 1 ? "" : "s"}).`);
  }
  if ( !pending ) ui.notifications.info("Mall Explorer: every listed update file has already been applied.");
  DiscoveriesApp.refresh();
}
