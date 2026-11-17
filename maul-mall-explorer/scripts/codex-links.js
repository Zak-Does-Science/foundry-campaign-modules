// MAUL Mall Explorer: turn names in dialogue text into links to MAUL Codex journal entries.
// The index is built from world JournalEntries that carry maul-campaign-codex flags (the "MAUL Codex" folder after
// the GM syncs), using each entry's name plus flags["maul-campaign-codex"].aliases. Only entries this user can see.

import {MODULE, esc} from "./config.js";

const CODEX = "maul-campaign-codex";
let index = [];          // [{name, id, rx}] longest name first
let rebuildTimer = null;

const escapeRx = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function rebuildCodexIndex() {
  const out = [];
  try {
    for ( const je of game.journal ?? [] ) {
      const flags = je.flags?.[CODEX];
      if ( !flags || flags.lockedFor || !flags.slug && !flags.aliases ) continue;
      if ( !je.testUserPermission(game.user, "OBSERVER") ) continue;
      const names = new Set([je.name, ...(Array.isArray(flags.aliases) ? flags.aliases : [])]);
      for ( const n of names ) {
        const name = String(n ?? "").trim();
        if ( name.length < 3 ) continue;
        // Whole word, case-sensitive; letters/digits/apostrophes on either side mean "part of another word".
        const rx = new RegExp(`(?<![\\p{L}\\p{N}_'’])${escapeRx(name)}(?![\\p{L}\\p{N}_])`, "u");
        out.push({name, id: je.id, rx});
      }
    }
  } catch(err) {
    console.warn(`${MODULE} | codex link index failed`, err);
  }
  out.sort((a, b) => b.name.length - a.name.length);
  index = out;
}

/** Debounced rebuild (journal hooks can fire in bursts during a codex sync). */
export function scheduleCodexIndex() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuildCodexIndex, 300);
}

/**
 * Escaped HTML for a plain-text page with codex names linked (first mention of each entry only, longest names first,
 * no overlaps). Returns null when nothing links, so callers can keep using textContent.
 */
export function linkCodexNames(text) {
  if ( !index.length || !text ) return null;
  const claimed = [];   // [{start, end, id, name}]
  const usedIds = new Set();
  for ( const e of index ) {
    if ( usedIds.has(e.id) ) continue;
    const m = e.rx.exec(text);
    if ( !m ) continue;
    const start = m.index;
    const end = start + m[0].length;
    if ( claimed.some(c => start < c.end && end > c.start) ) continue;
    claimed.push({start, end, id: e.id});
    usedIds.add(e.id);
  }
  if ( !claimed.length ) return null;
  claimed.sort((a, b) => a.start - b.start);
  let html = "";
  let pos = 0;
  for ( const c of claimed ) {
    html += esc(text.slice(pos, c.start));
    html += `<a class="maul-codex-link" data-codex-id="${esc(c.id)}">${esc(text.slice(c.start, c.end))}</a>`;
    pos = c.end;
  }
  return html + esc(text.slice(pos));
}

/** Open a linked entry's sheet. */
export function openCodexEntry(id) {
  const je = game.journal?.get(id);
  if ( je?.testUserPermission(game.user, "OBSERVER") ) je.sheet.render({force: true});
}

export function registerCodexLinks() {
  for ( const h of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry"] ) Hooks.on(h, scheduleCodexIndex);
}
