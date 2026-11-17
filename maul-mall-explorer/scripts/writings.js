// MAUL Mall Explorer: every piece of player writing, kept in full and filed as its own text file (SPEC 28).
// Zak (17 Nov 2026): "Player writings, I want to always accept at full length immediately and create its own little text
// file... time stamped... I don't want to limit or even wait for me to pick up their explicit writing."
//
// recordWriting() runs the moment a player submits anything they wrote (notebook note, journal texts and off-time
// entries, coworker notes, weekly lines, naming moments). It stores the full text straight away on the writer's own
// User (`flags.writings.<id>`: no GM needed, nothing truncated). The active GM's client then writes each one as a
// .txt file and, once the file exists, moves the entry from the user's flags to the world setting `writingsFiled`
// (id, time, who, form and the file path; the text lives in the file). With no GM online, writings wait on the user
// and are filed when a GM connects. A failed write leaves the entry where it is and is retried on the next load.
//
// Files: <Forge Assets Library, or Foundry's Data folder>/maul-writings/<YYYY-MM>/<YYYY-MM-DD_HHMMSS>_<who>_<form>_<id>.txt

import {MODULE} from "./config.js";
import {DEL} from "./dnd.js";
import {getWeek} from "./week.js";

export const WRITINGS_DIR = "maul-writings";

const slug = s => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "x";
const pad = n => String(n).padStart(2, "0");

/**
 * Keep a player's writing. `form` = a short id for where it came from ("note", "journal-shop", "coworker", ...),
 * `title` = a human label, `text` = the full text (or `fields`: {label: text} for multi-part forms), `about` = context.
 */
export async function recordWriting({form, title, text = "", fields = null, about = null}) {
  const parts = fields ? Object.entries(fields).filter(([, v]) => String(v ?? "").trim()) : [];
  if ( !String(text ?? "").trim() && !parts.length ) return null;
  const t = Date.now();
  const entry = {
    id: foundry.utils.randomID(), t, time: new Date(t).toISOString(), week: getWeek(),
    userId: game.user.id, user: game.user.name, character: game.user.character?.name ?? null,
    table: game.user.getFlag(MODULE, "table") || null,
    form: String(form ?? "writing"), title: title ?? null, about: about ?? null,
    text: String(text ?? ""), fields: parts.length ? Object.fromEntries(parts) : null
  };
  try {
    // Always on the writer's own User first (also the GM's), so nothing is lost if the file write fails
    await game.user.update({[`flags.${MODULE}.writings.${entry.id}`]: entry});
    if ( isActiveGM() ) fileWritings([game.user]);
  } catch(err) {
    console.error(`${MODULE} | keeping a writing failed`, err);
  }
  return entry;
}

/* -------------------------------------------- */
/*  GM side: write the files                    */
/* -------------------------------------------- */

const isActiveGM = () => game.user.isGM && game.users.activeGM?.id === game.user.id;
let chain = Promise.resolve();
const queued = fn => (chain = chain.then(fn, fn).catch(err => console.error(`${MODULE} | filing writings failed`, err)));

/** Active GM: file every writing still waiting on these users (default: everyone). */
export function fileWritings(users = null) {
  if ( !isActiveGM() ) return Promise.resolve();
  return queued(async () => {
    for ( const u of users ?? game.users.contents ) {
      const pending = Object.values(u.getFlag(MODULE, "writings") ?? {}).filter(w => w?.id);
      for ( const w of pending.sort((a, b) => (a.t ?? 0) - (b.t ?? 0)) ) {
        try { await fileOne(w, u); } catch(err) { console.error(`${MODULE} | filing writing ${w.id} from ${u.name} failed`, err); }
      }
    }
  });
}

function fileSource() {
  const forge = globalThis.ForgeVTT;
  return forge?.usingTheForge ? "forgevtt" : "data";
}

const madeDirs = new Set();
async function ensureDir(FP, source, path) {
  if ( madeDirs.has(`${source}:${path}`) ) return;
  let built = "";
  for ( const part of path.split("/") ) {
    built = built ? `${built}/${part}` : part;
    try { await FP.createDirectory(source, built, {}); } catch(err) { /* exists already (or the source makes folders itself) */ }
  }
  madeDirs.add(`${source}:${path}`);
}

function fileText(w) {
  const lines = [
    "MAUL player writing", "",
    `When:      ${w.time} (UTC)`,
    `Player:    ${w.user}`,
    `Character: ${w.character ?? "-"}`,
    `Table:     ${w.table ?? "-"}`,
    `Week:      ${w.week ?? "-"}`,
    `Form:      ${w.form}${w.title ? ` (${w.title})` : ""}`
  ];
  if ( w.about ) lines.push(`About:     ${w.about}`);
  lines.push(`Id:        ${w.id}`, "", "-".repeat(60), "");
  if ( w.fields ) for ( const [k, v] of Object.entries(w.fields) ) lines.push(`## ${k}`, "", String(v), "");
  if ( w.text ) lines.push(String(w.text), "");
  return lines.join("\n");
}

/** Write one writing's file; then clear it from the user's flags and note it in the world. */
async function fileOne(w, user) {
  const FP = foundry.applications.apps.FilePicker.implementation;
  const d = new Date(w.t ?? Date.now());
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  const dir = `${WRITINGS_DIR}/${stamp.slice(0, 7)}`;
  const name = `${stamp}_${slug(w.character ?? w.user)}_${slug(w.form)}_${w.id}.txt`;
  const source = fileSource();
  await ensureDir(FP, source, dir);
  const file = new File([fileText(w)], name, {type: "text/plain"});
  const res = await FP.upload(source, dir, file, {}, {notify: false});
  if ( !res || res.status === "error" ) throw new Error(res?.message ?? "upload refused or no reply");
  const path = res?.path ?? `${dir}/${name}`;
  const filed = foundry.utils.deepClone(game.settings.get(MODULE, "writingsFiled") ?? []);
  filed.push({id: w.id, t: w.t, user: w.user, character: w.character, form: w.form, title: w.title, path, source});
  await game.settings.set(MODULE, "writingsFiled", filed);
  await user.update({[`flags.${MODULE}.writings.${w.id}`]: DEL()});
  return path;
}
