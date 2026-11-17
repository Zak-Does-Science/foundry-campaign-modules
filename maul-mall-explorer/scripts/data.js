// MAUL Mall Explorer: runtime data loading (fetched from the module folder, cached per session).

import {MODULE, PATHS, GRID_PX, modPath} from "./config.js";
import {computeLayout, toSceneTile} from "./grid.js";
import {standinEntries} from "./pc.js";

const jsonCache = new Map();
const existsCache = new Map();

/** Fetch JSON from a module path. Returns null for a missing optional file. */
export async function fetchJSON(path, {optional = false} = {}) {
  if ( jsonCache.has(path) ) return jsonCache.get(path);
  const promise = (async () => {
    let res;
    try {
      res = await fetch(path, {cache: "no-cache"});
    } catch(err) {
      if ( optional ) return null;
      throw err;
    }
    if ( !res.ok ) {
      if ( optional ) return null;
      throw new Error(`${MODULE} | could not load ${path} (${res.status})`);
    }
    return res.json();
  })();
  jsonCache.set(path, promise);
  try {
    return await promise;
  } catch(err) {
    jsonCache.delete(path);
    throw err;
  }
}

/** Does a file exist on the server? (HEAD request, cached.) */
export async function fileExists(path) {
  if ( existsCache.has(path) ) return existsCache.get(path);
  let ok = false;
  try {
    const res = await fetch(path, {method: "HEAD", cache: "no-cache"});
    ok = res.ok;
  } catch(err) { ok = false; }
  existsCache.set(path, ok);
  return ok;
}

/** Forget everything loaded so far (used by the GM "rebuild" button so edited JSON is re-read). */
export function clearDataCache() {
  jsonCache.clear();
  existsCache.clear();
  mallContexts.clear();
}

export const getSchedule = () => fetchJSON(PATHS.schedule);
export const getPopupItems = () => fetchJSON(PATHS.popupItems);
export const getPlayersFile = () => fetchJSON(PATHS.players);
export const getMall = id => fetchJSON(PATHS.mall(id), {optional: true});

/**
 * Load the renderer's layout for a mall, or compute one with the same rules if it is missing.
 * Floors the renderer layout does not list are filled in from the computed layout.
 */
export async function getLayout(mall) {
  const rendered = await fetchJSON(PATHS.layout(mall.id), {optional: true});
  const computed = computeLayout(mall, GRID_PX);
  if ( !rendered?.floors ) return computed;
  const layout = foundry.utils.deepClone(rendered);
  layout.gridPx ??= GRID_PX;
  for ( const [id, f] of Object.entries(computed.floors) ) layout.floors[id] ??= f;
  layout.widthTiles ??= computed.widthTiles;
  layout.heightTiles ??= computed.heightTiles;
  return layout;
}

const mallContexts = new Map();

/**
 * Everything the interaction code needs for one mall: mall JSON, layout, and resolved interactables
 * (with scene tile coords), including a synthetic shop interactable for each pop-up booth slot that
 * has no explicit `kind: "shop"` interactable.
 * @returns {Promise<object|null>}
 */
export async function getMallContext(mallId) {
  if ( !mallId ) return null;
  if ( mallContexts.has(mallId) ) return mallContexts.get(mallId);
  const promise = (async () => {
    const mall = await getMall(mallId);
    if ( !mall ) return null;
    const layout = await getLayout(mall);
    const entries = [];
    const booths = mall.popupBooths ?? [];
    const coveredSlots = new Set();

    for ( const ia of mall.interactables ?? [] ) {
      const t = toSceneTile(layout, ia.floor, ia.x, ia.y);
      if ( !t ) {
        console.warn(`${MODULE} | interactable ${ia.id} is on unknown floor ${ia.floor}`);
        continue;
      }
      const entry = {ia, sx: t.x, sy: t.y};
      if ( ia.kind === "shop" ) {
        entry.slot = resolveShopSlot(ia, booths);
        if ( entry.slot ) coveredSlots.add(entry.slot);
      }
      entries.push(entry);
    }

    for ( const b of booths ) {
      if ( coveredSlots.has(b.slot) ) continue;
      const t = toSceneTile(layout, b.floor, b.x, b.y);
      if ( !t ) continue;
      entries.push({
        ia: {id: `${mall.id}-booth-${b.slot}`, kind: "shop", floor: b.floor, x: b.x, y: b.y, name: "Pop-up Booth", synthetic: true},
        sx: t.x, sy: t.y, slot: b.slot
      });
    }
    // Sparring host by the arena (SPEC 31, data/sparring.json), unless the mall JSON already has a `kind: "spar"` NPC
    try {
      const spar = await fetchJSON(modPath("data/sparring.json"), {optional: true}).catch(() => null);
      const host = spar?.hosts?.[mall.id];
      if ( host && !(mall.interactables ?? []).some(i => i?.kind === "spar") ) {
        const t = toSceneTile(layout, host.floor, host.x, host.y);
        if ( t ) entries.push({ia: {...host, kind: "spar"}, sx: t.x, sy: t.y});
      }
    } catch(err) { console.warn(`${MODULE} | sparring host skipped`, err); }
    // Player-character stand-ins at their stores (SPEC 22)
    try { entries.push(...standinEntries(mall, layout, toSceneTile)); } catch(err) { console.warn(`${MODULE} | stand-ins skipped`, err); }
    return {mall, layout, entries};
  })();
  mallContexts.set(mallId, promise);
  const ctx = await promise;
  if ( !ctx ) mallContexts.delete(mallId);
  return ctx;
}

/**
 * Work out which booth slot a `kind: "shop"` interactable belongs to:
 * explicit `slot` field, else the popupBooths entry on/next to it, else a "booth-N"/"slot-N" id.
 */
export function resolveShopSlot(ia, booths) {
  if ( Number.isInteger(ia.slot) ) return ia.slot;
  if ( Number.isInteger(Number(ia.slot)) && ia.slot !== undefined ) return Number(ia.slot);
  const near = booths.find(b => b.floor === ia.floor && Math.abs(b.x - ia.x) <= 1 && Math.abs(b.y - ia.y) <= 1);
  if ( near ) return near.slot;
  const m = String(ia.id ?? "").match(/(?:booth|slot)-?(\d+)/i);
  return m ? Number(m[1]) : null;
}
