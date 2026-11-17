// MAUL Mall Explorer: each player's open journal (SPEC 27) and its GM-made Foundry journal mirror.
// The player writes in the Notebook's Journal tab (feedback.js) whenever they like:
//   user.flags["maul-mall-explorer"].journal = {
//     shop: {text, t, week}, character: {text, t, week},          // one living text each
//     offtime: {<key>: {text, t, week}}                          // "what I've been up to", dated entries
//   }
// plus the Coworkers panel (coworkers.js) in user flag `coworkers`. Both are exported by Export character logs and read
// by tools/read_world_logs.mjs. The active GM's client mirrors them into a journal entry per player,
// "MAUL Journal: <character>", which that player can read (Observer) and nobody else can; it's rebuilt from the flags,
// so edits go through the notebook, not the journal sheet.

import {MODULE, MALLS, esc} from "./config.js";
import {getMall} from "./data.js";
import {findHomeStoreFor} from "./bastion.js";
import {logEvent} from "./progress.js";
import {getWeek} from "./week.js";
import {DEL} from "./dnd.js";
import {recordWriting} from "./writings.js";


export function getJournal(user = game.user) {
  const j = user?.getFlag(MODULE, "journal") ?? {};
  const offtime = Object.entries(j.offtime ?? {}).filter(([, e]) => e?.text)
    .map(([key, e]) => ({key, ...e})).sort((a, b) => (b.t ?? 0) - (a.t ?? 0));
  return {shop: j.shop ?? null, character: j.character ?? null, offtime};
}

/** Save "my shop" / "my character" text. Logged (kind "journal") at most once per document per week. */
export async function saveJournalDoc(doc, text) {
  if ( !["shop", "character"].includes(doc) ) return false;
  text = String(text ?? "");                        // full length (SPEC 28)
  const prev = getJournal()[doc];
  if ( (prev?.text ?? "") === text ) return false;
  const week = getWeek();
  await game.user.update({[`flags.${MODULE}.journal.${doc}`]: {text, t: Date.now(), week}});
  if ( text.trim() ) await recordWriting({form: `journal-${doc}`, title: doc === "shop" ? "My shop" : "My character", text});
  if ( prev?.week !== week ) {
    await logEvent({kind: "journal", id: doc, name: `Journal: wrote about ${doc === "shop" ? "my shop" : "my character"}`,
      text});
  }
  return true;
}

/** Add an off-time entry ("what I've been up to"). */
export async function addOfftime(text) {
  text = String(text ?? "").trim();
  if ( !text ) return false;
  const t = Date.now();
  const key = `o${t.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  await game.user.update({[`flags.${MODULE}.journal.offtime.${key}`]: {text, t, week: getWeek()}});   // no cap (SPEC 28)
  await recordWriting({form: "journal-offtime", title: "What I've been up to", text});
  await logEvent({kind: "journal", id: key, name: "Journal: what I've been up to", text});
  return true;
}

export async function deleteOfftime(key) {
  if ( !key ) return;
  await game.user.update({[`flags.${MODULE}.journal.offtime.${key}`]: DEL()});
}

/** The user's home store in any mall: {mall, home} or null. */
export async function myHomeStore(user = game.user) {
  for ( const id of MALLS ) {
    const mall = await getMall(id).catch(() => null);
    const home = mall ? findHomeStoreFor(mall, user) : null;
    if ( home ) return {mall, home};
  }
  return null;
}

/* -------------------------------------------- */
/*  GM mirror: "MAUL Journal: <character>"      */
/* -------------------------------------------- */

const isActiveGM = () => game.user.isGM && game.users.activeGM?.id === game.user.id;
const timers = new Map();

/** Debounced: rebuild this player's journal entry from their flags (active GM only). */
export function queueJournalSync(user) {
  if ( !isActiveGM() || !user || user.isGM ) return;
  clearTimeout(timers.get(user.id));
  timers.set(user.id, setTimeout(() => {
    timers.delete(user.id);
    syncPlayerJournal(user).catch(err => console.error(`${MODULE} | journal for ${user.name} failed`, err));
  }, 1500));
}

/** On load: make sure every player who has written something has an up-to-date journal entry. */
export function syncAllJournals() {
  if ( !isActiveGM() ) return;
  for ( const u of game.users ) {
    if ( u.isGM ) continue;
    const has = u.getFlag(MODULE, "journal") || u.getFlag(MODULE, "coworkers");
    if ( has ) queueJournalSync(u);
  }
}

const para = text => esc(text).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
const day = t => (t ? new Date(t).toISOString().slice(0, 10) : "");

function pagesFor(user) {
  const j = getJournal(user);
  const cw = Object.values(user.getFlag(MODULE, "coworkers") ?? {}).filter(c => c?.npc);
  const doc = (d, empty) => (d?.text ? `<p class="maul-dim">Updated ${day(d.t)}, week ${esc(d.week ?? "?")}</p><p>${para(d.text)}</p>` : `<p><em>${empty}</em></p>`);
  return [
    {key: "shop", name: "My shop", content: doc(j.shop, "Nothing yet. Write about your shop in the notebook (J → Journal).")},
    {key: "character", name: "My character", content: doc(j.character, "Nothing yet. Write about your character in the notebook (J → Journal).")},
    {key: "offtime", name: "What I've been up to", content: j.offtime.length
      ? j.offtime.map(e => `<h3>${day(e.t)} · week ${esc(e.week ?? "?")}</h3><p>${para(e.text)}</p>`).join("")
      : "<p><em>No entries yet.</em></p>"},
    {key: "coworkers", name: "Coworkers", content: cw.length
      ? cw.map(c => `<h3>${esc(c.name ?? c.npc)}${c.storeName ? ` · ${esc(c.storeName)}` : ""}</h3>
        ${c.sprite ? `<p><strong>Sprite now:</strong> ${esc(c.sprite)}</p>` : ""}
        ${c.look ? `<p><strong>How they look:</strong> ${para(c.look)}</p>` : ""}
        ${c.act ? `<p><strong>How they act:</strong> ${para(c.act)}</p>` : ""}
        ${(c.other ?? c.description) ? `<p><strong>Anything else:</strong> ${para(c.other ?? c.description)}</p>` : ""}`).join("")
      : "<p><em>No coworker notes yet (Bastion menu → Coworkers).</em></p>"}
  ];
}

async function syncPlayerJournal(user) {
  const name = `MAUL Journal: ${user.character?.name ?? user.name}`;
  const ownership = {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER};
  let je = game.journal.find(j => j.getFlag(MODULE, "playerJournal") === user.id);
  if ( !je ) {
    je = await JournalEntry.create({name, ownership, flags: {[MODULE]: {playerJournal: user.id}}});
  } else if ( je.name !== name ) await je.update({name});
  const pages = pagesFor(user);
  const create = [];
  const update = [];
  for ( const [i, p] of pages.entries() ) {
    const page = je.pages.find(pg => pg.getFlag(MODULE, "journalPage") === p.key);
    const text = {format: 1, content: p.content};
    if ( !page ) create.push({name: p.name, type: "text", sort: (i + 1) * 1000, text, flags: {[MODULE]: {journalPage: p.key}}});
    else if ( page.text?.content !== p.content ) update.push({_id: page.id, text});
  }
  if ( create.length ) await je.createEmbeddedDocuments("JournalEntryPage", create);
  if ( update.length ) await je.updateEmbeddedDocuments("JournalEntryPage", update);
}
