// MAUL Mall Explorer: once-a-week things per character (Bastion turn, meal, naming-moment inspiration), the effects
// that last "until the week advances", the table's last match result, and small shared UI helpers.
// Weekly use is stored on the character (actor flags), so it counts across malls.

import {MODULE, esc} from "./config.js";
import {getWeek} from "./week.js";
import {gmIds} from "./notify.js";

const {DialogV2} = foundry.applications.api;

export const RESULTS = ["none", "win", "loss"];

/** The table's last match result ("win" | "loss" | "none"). */
export function lastResult(table) {
  const all = game.settings.get(MODULE, "lastResult") ?? {};
  const r = all?.[table];
  return RESULTS.includes(r) ? r : "none";
}

export async function setLastResult(table, result) {
  if ( !game.user.isGM || !table ) return;
  const all = foundry.utils.deepClone(game.settings.get(MODULE, "lastResult") ?? {});
  all[table] = RESULTS.includes(result) ? result : "none";
  await game.settings.set(MODULE, "lastResult", all);
}

/** Has this character already used `kind` (bastion | meal | muse) this week? */
export function usedThisWeek(actor, kind) {
  return actor?.getFlag(MODULE, `weekly.${kind}`) === getWeek();
}

export async function markUsed(actor, kind) {
  if ( actor ) await actor.setFlag(MODULE, `weekly.${kind}`, getWeek());
}

/** A visible flat roll posted to chat (everyone sees it). Returns the evaluated Roll. */
export async function publicRoll(formula, flavor, actor = game.user.character) {
  const roll = await new Roll(formula).evaluate();
  try {
    await roll.toMessage({flavor, speaker: actor ? ChatMessage.getSpeaker({actor}) : {alias: game.user.name}}, {messageMode: "public"});
  } catch(err) {
    console.warn(`${MODULE} | roll message failed`, err);
  }
  return roll;
}

export function whisperGM(html) {
  return ChatMessage.create({content: `<div class="maul-chat-card">${html}</div>`, whisper: gmIds(), speaker: {alias: "MAUL Mall Explorer"}})
    .catch(err => console.warn(`${MODULE} | GM whisper failed`, err));
}

export const whoLabel = () => (game.user.character?.name ? `${game.user.name} (${game.user.character.name})` : game.user.name);

/**
 * Ask the player to pick one option. Returns the option value or null.
 * @param {string} title
 * @param {string} html     intro HTML (already escaped)
 * @param {{value:string,label:string}[]} options
 */
export async function pickOne(title, html, options, {okLabel = "OK"} = {}) {
  if ( !options.length ) return null;
  const opts = options.map((o, i) => `<option value="${esc(o.value)}" ${i === 0 ? "selected" : ""}>${esc(o.label)}</option>`).join("");
  return DialogV2.prompt({
    window: {title},
    content: `${html}<div class="form-group"><select name="maulPick">${opts}</select></div>`,
    ok: {label: okLabel, callback: (event, button) => button.form.elements.maulPick.value},
    rejectClose: false,
    modal: true
  });
}

/* -------------------------------------------- */
/*  Week rollover                               */
/* -------------------------------------------- */

/** GM: delete every "until the week advances" effect (meals on actors, Tuned on items) from an earlier week. */
export async function clearWeeklyEffects() {
  if ( !game.user.isGM ) return;
  const stale = (e, week) => {
    const f = e.getFlag(MODULE, "weekly");
    return f !== undefined && f !== null && Number(f) !== week;
  };
  let n = 0;
  for ( const actor of game.actors ) {
    // Each character runs on their own table's week
    const owner = game.users.find(u => !u.isGM && u.character?.id === actor.id);
    const week = getWeek(owner?.getFlag(MODULE, "table") || undefined);
    const ids = actor.effects.filter(e => stale(e, week)).map(e => e.id);
    if ( ids.length ) { await actor.deleteEmbeddedDocuments("ActiveEffect", ids).catch(err => console.warn(err)); n += ids.length; }
    for ( const item of actor.items ) {
      const iids = item.effects.filter(e => stale(e, week)).map(e => e.id);
      if ( iids.length ) { await item.deleteEmbeddedDocuments("ActiveEffect", iids).catch(err => console.warn(err)); n += iids.length; }
    }
  }
  if ( n ) ui.notifications.info(`Mall Explorer: cleared ${n} meal / Tuned effect${n === 1 ? "" : "s"} from last week.`);
}
