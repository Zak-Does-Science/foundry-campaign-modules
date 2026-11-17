// MAUL Mall Explorer: per-player progress flags and the character log, stored on the User document.
// Layout: user.flags["maul-mall-explorer"] = {
//   flags: {<flagId>: timestamp}, seen: {<interactableId>: count},
//   log: {<key>: {t, week, mall, id, kind, name, flags, ...}}   (keyed so each write sends only the new entry;
//        capped at LOG_CAP, oldest trimmed; an old array-shaped log is converted on the next write)
// }
// The log keeps only the bigger events (17 Nov 2026, SPEC 25): routine talk, chat overheard, stairs and the like
// leave their mark in `flags` (met-<id>, heard-<id>, with the time first set) and `seen` (counts), not in the log.
// See shouldLog() for the rule and compactLog() for the one-time clean-up of older logs.

import {MODULE} from "./config.js";
import {DEL} from "./dnd.js";

export const LOG_CAP = 600;

/** Kinds always worth a log line (discoveries, secrets, purchases, Bastion turns, trips between malls, notes...). */
export const MAJOR_KINDS = new Set(["notice", "search", "gossip", "buy", "bastion", "warp", "meal", "muse", "coach", "lines",
  "form", "share", "update", "note", "coworker", "journal", "spar"]);
/** Flags that only record routine contact: being set doesn't make a log line on its own. */
const ROUTINE_FLAG = /^(met|heard|codex-read)-/;
const storyFlags = ids => (ids ?? []).filter(id => !ROUTINE_FLAG.test(String(id)));

/**
 * Should this event get a log line? `once: true` = only the first time (when it sets a new flag, e.g. codex reads);
 * a major kind always; anything else (talk, chat, shop, image, standings...) only when it set a new story flag.
 */
export function shouldLog(entry, fresh) {
  if ( entry?.once ) return fresh.length > 0;
  if ( entry && MAJOR_KINDS.has(entry.kind) ) return true;
  return storyFlags(fresh).length > 0;
}

/** Flag ids are free-form; dots would nest objects, so they are stored with "_" instead. */
export const safe = id => String(id).replace(/\./g, "_").replace(/^-=/, "");

export function getProgress(user = game.user) {
  return {
    flags: foundry.utils.deepClone(user?.getFlag(MODULE, "flags") ?? {}),
    seen: foundry.utils.deepClone(user?.getFlag(MODULE, "seen") ?? {})
  };
}

/** The character log, oldest first. Stored as an object of entries so writes are small deltas. */
export function getLog(user = game.user) {
  const log = user?.getFlag(MODULE, "log");
  if ( Array.isArray(log) ) return log;
  if ( !log || typeof log !== "object" ) return [];
  return Object.values(log).filter(e => e && typeof e === "object").sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
}

export function hasFlag(id, user = game.user) {
  return !!user?.getFlag(MODULE, "flags")?.[safe(id)];
}

/* -------------------------------------------- */
/*  Writes (queued so log appends never race)   */
/* -------------------------------------------- */

let queue = Promise.resolve();
function queued(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

/** Current week + mall, read lazily (avoids importing week.js / interact.js here). */
function context() {
  const mall = canvas?.scene?.getFlag?.(MODULE, "mallId") ?? null;
  // Same rule as week.js getWeek(): this mall's table, else your own table (each table has its own week)
  const table = {galleria: "monday", cogskill: "tuesday"}[mall] ?? game.user?.getFlag?.(MODULE, "table");
  // weekByTable holds the GM week (match being prepared for); the log uses the content week = matches played
  const byTable = Number(game.settings.get(MODULE, "weekByTable")?.[table]);
  const w = Number.isFinite(byTable) ? Math.max(0, byTable - 1) : Number(game.settings.get(MODULE, "currentWeek"));
  return {week: Number.isFinite(w) ? w : 0, mall};
}

let logSeq = 0;
const logKey = e => `e${(e.t ?? Date.now()).toString(36)}${(logSeq++ % 1296).toString(36).padStart(2, "0")}${Math.random().toString(36).slice(2, 5)}`;

/** Add update keys that append `entries` to the log (only the new entries travel), trimming the oldest past the cap. */
function addLogUpdate(update, user, entries) {
  const raw = user.getFlag(MODULE, "log");
  if ( Array.isArray(raw) ) {                       // one-time conversion from the old array format
    const all = raw.concat(entries).slice(-LOG_CAP);
    // an object replaces an array outright in Foundry's update merge, so no separate delete is needed
    const obj = {};
    for ( const e of all ) obj[logKey(e)] = e;
    update[`flags.${MODULE}.log`] = foundry.data.operators.ForcedReplacement.create(obj);
    return;
  }
  for ( const e of entries ) update[`flags.${MODULE}.log.${logKey(e)}`] = e;
  const keys = Object.keys(raw ?? {});
  const over = keys.length + entries.length - LOG_CAP;
  if ( over > 50 ) {                                // trim in batches, not on every write
    const oldest = keys.sort((a, b) => (raw[a]?.t ?? 0) - (raw[b]?.t ?? 0)).slice(0, over);
    for ( const k of oldest ) update[`flags.${MODULE}.log.${k}`] = DEL();
  }
}

/**
 * Set several flags at once and (optionally) write a log entry in the same update.
 * Whether a log entry is written is up to shouldLog(): major kinds always, others only when they set a story flag.
 * @param {string[]} ids
 * @param {User} [user]
 * @param {object} [entry]  {kind, id, name, ...} merged into the log entry
 * @returns {Promise<string[]>} the ids that were newly set
 */
export function setFlags(ids, user = game.user, entry = null) {
  return queued(async () => {
    if ( !user ) return [];
    const current = user.getFlag(MODULE, "flags") ?? {};
    const fresh = [...new Set((ids ?? []).filter(id => id && !current[safe(id)]))];
    const log = shouldLog(entry, fresh);
    if ( !fresh.length && !log ) return [];
    const update = {};
    const now = Date.now();
    for ( const id of fresh ) update[`flags.${MODULE}.flags.${safe(id)}`] = now;
    if ( log ) {
      const {once, ...rest} = entry ?? {};
      addLogUpdate(update, user, [{t: now, ...context(), kind: "flag", ...rest, flags: fresh}]);
    }
    await user.update(update);
    return fresh;
  });
}

/** Append a log entry with no flag change (dropped unless shouldLog() says it's worth keeping). */
export function logEvent(entry, user = game.user) {
  return setFlags([], user, entry);
}

/** Remove flags (GM update files). Returns the ids that were actually removed. */
export function unsetFlags(ids, user, entry = null) {
  return queued(async () => {
    const current = user.getFlag(MODULE, "flags") ?? {};
    const gone = (ids ?? []).filter(id => id && current[safe(id)]);
    const update = {};
    for ( const id of gone ) update[`flags.${MODULE}.flags.${safe(id)}`] = DEL();
    addLogUpdate(update, user, [{t: Date.now(), ...context(), kind: "update", ...(entry ?? {}), flags: [], removed: gone}]);
    await user.update(update);
    return gone;
  });
}

/* -------------------------------------------- */
/*  One-time compaction of older, chattier logs */
/* -------------------------------------------- */

/** Would this already-written entry still be logged under today's rule? (Old stairs/fast-travel warps were routine.) */
function keepOld(e, codexSeen) {
  if ( !e || typeof e !== "object" ) return false;
  if ( e.kind === "codex" ) {                       // codex reads: first read of each entry only
    if ( codexSeen.has(e.id) ) return false;
    codexSeen.add(e.id);
    return true;
  }
  if ( e.kind === "warp" ) return /^Leyline/i.test(String(e.name ?? "")) || storyFlags(e.flags).length > 0;
  if ( e.kind === "talk" && /^Practice with /.test(String(e.name ?? "")) ) return true;    // coach practice, before it got its own kind
  if ( MAJOR_KINDS.has(e.kind) ) return true;
  return storyFlags(e.flags).length > 0;
}

/**
 * Drop routine entries (talk, chat, scene, floor, shop open/close, directory, image, stairs...) from a user's log.
 * Flags and seen counts are untouched, so "has met / has heard" is kept. Returns the number of entries removed.
 */
export function compactLog(user) {
  return queued(async () => {
    const raw = user?.getFlag(MODULE, "log");
    if ( !raw || typeof raw !== "object" ) return 0;
    const codexSeen = new Set();
    if ( Array.isArray(raw) ) {
      const sorted = raw.slice().sort((a, b) => (a?.t ?? 0) - (b?.t ?? 0));
      const kept = sorted.filter(e => keepOld(e, codexSeen)).slice(-LOG_CAP);
      if ( kept.length === raw.length ) return 0;
      const obj = {};
      for ( const e of kept ) obj[logKey(e)] = e;
      await user.update({[`flags.${MODULE}.log`]: foundry.data.operators.ForcedReplacement.create(obj)});
      return raw.length - kept.length;
    }
    const keys = Object.keys(raw).sort((a, b) => (raw[a]?.t ?? 0) - (raw[b]?.t ?? 0));
    const drop = keys.filter(k => !keepOld(raw[k], codexSeen));
    if ( !drop.length ) return 0;
    const update = {};
    for ( const k of drop ) update[`flags.${MODULE}.log.${k}`] = DEL();
    await user.update(update);
    return drop.length;
  });
}

/** Count an interaction. Returns true if this was the first time the user triggered it. */
export async function markSeen(interactableId, user = game.user) {
  const key = safe(interactableId);
  const count = user.getFlag(MODULE, "seen")?.[key] ?? 0;
  await user.update({[`flags.${MODULE}.seen.${key}`]: count + 1});
  return count === 0;
}

/** Wipe a player's progress (GM tool). The character log is kept (it's the save file's history). */
export async function resetProgress(user) {
  await user.update({[`flags.${MODULE}.flags`]: DEL(), [`flags.${MODULE}.seen`]: DEL()});
}

/* -------------------------------------------- */
/*  Requirements + knowledge-aware text         */
/* -------------------------------------------- */

/** Do the `requires` pass for this user and week? Supports flags, notFlags, minWeek, maxWeek, met, any. */
export function meetsRequirements(req, week, user = game.user) {
  if ( !req || typeof req !== "object" ) return true;
  if ( (req.flags ?? []).some(f => !hasFlag(f, user)) ) return false;
  if ( (req.notFlags ?? []).some(f => hasFlag(f, user)) ) return false;
  if ( (req.met ?? []).some(id => !hasFlag(`met-${id}`, user)) ) return false;
  if ( Array.isArray(req.character) && req.character.length ) {
    const name = String(user?.character?.name ?? "").trim().toLowerCase();
    if ( !name || !req.character.some(c => String(c).trim().toLowerCase() === name) ) return false;
  }
  if ( Number.isFinite(req.minWeek) && week < req.minWeek ) return false;
  if ( Number.isFinite(req.maxWeek) && week > req.maxWeek ) return false;
  if ( Array.isArray(req.any) && req.any.length && !req.any.some(r => meetsRequirements(r, week, user)) ) return false;
  return true;
}

/** Page text, whether the page is a string or a {text, requires, sets} object. */
export const pageText = p => (typeof p === "string" ? p : (p && typeof p.text === "string" ? p.text : ""));

/** Keep the pages this user may see this week (string pages always pass). */
export function filterPages(pages, week, user = game.user) {
  return (Array.isArray(pages) ? pages : []).filter(p => {
    if ( !pageText(p) ) return false;
    return typeof p === "string" || meetsRequirements(p.requires, week, user);
  });
}

/** Has this (hidden) interactable not been noticed yet by this user? Things without `hidden` are never concealed. */
export function isConcealed(ia, user = game.user) {
  return !!ia?.hidden && !hasFlag(`noticed-${ia.id}`, user);
}
