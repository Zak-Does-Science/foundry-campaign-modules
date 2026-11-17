// MAUL Mall Explorer: walk-on stairs.
//
// Stairs: stepping onto any tile of a staircase (a connected block of `^` or `v` on the mall grid) sends the token to
// that staircase's warp landing, with no dialogue and no E press. Only plain warps qualify: `kind: "warp"`, no
// `requires`, no `hidden`. A warp can opt in or out with `"step": true | false`. Lifts, the chute, secret ladders and
// doors still use E. Teleports never re-trigger a staircase, and a staircase only fires when you step onto it from
// off it, so a landing next to (or on) stairs can't bounce you back.
//
// (17 Nov 2026: the faster-walking experiment is gone; on The Forge it never felt faster. Players fast-travel from
// the Mall Directory instead, see scripts/directory.js.)

import {MODULE} from "./config.js";
import {Hint, currentMallId, getPlayerToken, warpToken} from "./interact.js";
import {isDialogueOpen} from "./dialogue.js";
import {Sfx} from "./audio.js";

const STAIR_CHARS = new Set(["^", "v"]);

/* -------------------------------------------- */
/*  Stair index                                 */
/* -------------------------------------------- */

/** Floor-local "F:x,y" -> warp entry, for every tile of every walk-on staircase. Cached on the mall context. */
function stairIndex(ctx) {
  if ( ctx._stairs ) return ctx._stairs;
  const map = new Map();
  const grids = Object.fromEntries((ctx.mall.floors ?? []).map(f => [f.id, f.grid ?? []]));
  const charAt = (f, x, y) => grids[f]?.[y]?.[x] ?? " ";
  for ( const entry of ctx.entries ) {
    const ia = entry.ia;
    if ( ia.kind !== "warp" || !ia.warp || ia.step === false ) continue;
    if ( ia.step !== true && (ia.requires || ia.hidden) ) continue;
    const ch = charAt(ia.floor, ia.x, ia.y);
    if ( !STAIR_CHARS.has(ch) ) {
      if ( ia.step === true ) map.set(`${ia.floor}:${ia.x},${ia.y}`, entry);
      continue;
    }
    // Flood-fill the staircase: same glyph, 4-connected
    const todo = [[ia.x, ia.y]];
    const seen = new Set();
    while ( todo.length ) {
      const [x, y] = todo.pop();
      const key = `${ia.floor}:${x},${y}`;
      if ( seen.has(key) || charAt(ia.floor, x, y) !== ch ) continue;
      seen.add(key);
      if ( !map.has(key) ) map.set(key, entry);
      todo.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }
  ctx._stairs = map;
  return map;
}

/** The walk-on staircase entry under a scene-pixel position (token top-left), or null. */
function stairAt(ctx, doc, px, py) {
  const gs = canvas.grid.size;
  const sx = Math.floor((px + (doc.width * gs) / 2) / gs);
  const sy = Math.floor((py + (doc.height * gs) / 2) / gs);
  for ( const [id, L] of Object.entries(ctx.layout?.floors ?? {}) ) {
    if ( sx < L.ox || sy < L.oy || sx >= L.ox + (L.w ?? 0) || sy >= L.oy + (L.h ?? 0) ) continue;
    return stairIndex(ctx).get(`${id}:${sx - L.ox},${sy - L.oy}`) ?? null;
  }
  return null;
}

/* -------------------------------------------- */
/*  Walk-on trigger                             */
/* -------------------------------------------- */

let warping = false;

async function onMoveToken(doc, movement, operation, user) {
  if ( warping || !user?.isSelf || !canvas?.ready || doc.parent !== canvas.scene ) return;
  const ctx = Hint.ctx;
  if ( !ctx || ctx.mall.id !== currentMallId() ) return;
  const token = doc.object;
  if ( !token || token !== getPlayerToken() ) return;
  const passed = movement?.passed?.waypoints ?? [];
  if ( !passed.length || passed.every(w => w.action === "displace") ) return;   // our own teleports

  // First passed waypoint that steps ONTO a staircase from somewhere that isn't that staircase
  let prev = stairAt(ctx, doc, movement.origin?.x ?? doc.x, movement.origin?.y ?? doc.y);
  let hit = null;
  for ( const w of passed ) {
    const here = stairAt(ctx, doc, w.x, w.y);
    if ( here && here !== prev && w.action !== "displace" ) { hit = here; break; }
    prev = here;
  }
  if ( !hit || isDialogueOpen() ) return;

  warping = true;
  try {
    try { doc.stopMovement?.(); } catch(err) { /* already finished */ }
    await token.movementAnimationPromise?.catch?.(() => {});
    if ( token.destroyed || doc.parent !== canvas.scene ) return;
    Sfx.confirm();
    await warpToken(token, ctx, hit.ia.warp);
  } catch(err) {
    console.error(`${MODULE} | stair warp failed`, err);
  } finally {
    warping = false;
    Hint.refresh();
  }
}

export function registerStairs() {
  Hooks.on("moveToken", (...args) => { onMoveToken(...args); });
}
