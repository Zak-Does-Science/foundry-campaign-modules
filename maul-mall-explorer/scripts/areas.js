// MAUL Mall Explorer: secret areas (SPEC 9). Per viewer, client-side only.
// The base map paints a secret area as plain void/rock/wall. Once the viewer passes the area's `unlock` requires (GMs
// always do), or their own token stands inside it (which sets flag entered-<id>), the real art is drawn on top from
// layout `areas`. While an area is locked for the viewer, everything inside it is hidden from them: other players'
// tokens, live NPC sprites, hints, bubbles, booth tiles. Nothing here ever writes to another user.

import {MODULE, modPath} from "./config.js";
import {toSceneTile} from "./grid.js";
import {meetsRequirements, hasFlag, setFlags} from "./progress.js";
import {getWeek} from "./week.js";
import {mapContainer, destroyContainer, pixelTexture} from "./layers.js";

export const Areas = {
  ctx: null,
  list: [],               // [{id, area, cells: Set<"x,y">, locked: boolean}]
  container: null,
  _drawn: new Set(),
  _entering: new Set(),

  /** Build the cell sets for this mall (call on canvasReady with the mall context). */
  async setup(ctx) {
    this.teardown();
    this.ctx = ctx;
    this.list = [];
    for ( const area of ctx?.mall?.secretAreas ?? [] ) {
      if ( !area?.id ) continue;
      const cells = new Set();
      for ( const r of area.rects ?? [] ) {
        for ( let y = r.y; y < r.y + (r.h ?? 1); y++ ) {
          for ( let x = r.x; x < r.x + (r.w ?? 1); x++ ) {
            const t = toSceneTile(ctx.layout, area.floor, x, y);
            if ( t ) cells.add(`${t.x},${t.y}`);
          }
        }
      }
      if ( cells.size ) this.list.push({id: area.id, area, cells, locked: true});
    }
    if ( !this.list.length ) return;
    this.container = mapContainer("maul-areas", 2);
    this.recompute();
    refreshPlaceables();          // tokens/tiles were drawn before the areas were known
  },

  teardown() {
    destroyContainer(this.container);
    this.container = null;
    this._drawn.clear();
    this.list = [];
    this.ctx = null;
  },

  /** Re-evaluate which areas are locked for this viewer (flags / week changed). Returns true if anything changed. */
  recompute() {
    if ( !this.list.length ) return false;
    const week = getWeek();
    let changed = false;
    for ( const a of this.list ) {
      const locked = !game.user.isGM && !hasFlag(`entered-${a.id}`) && !meetsRequirements(a.area.unlock ?? {flags: [`entered-${a.id}`]}, week);
      if ( locked !== a.locked ) changed = true;
      a.locked = locked;
      if ( !locked ) this._drawOverlay(a);
    }
    if ( changed ) refreshPlaceables();
    return changed;
  },

  /** Is this scene tile inside an area that's locked for this viewer? */
  isLockedAt(sx, sy) {
    if ( !this.list.length ) return false;
    const key = `${sx},${sy}`;
    return this.list.some(a => a.locked && a.cells.has(key));
  },

  /** The viewer's own token moved: entering a locked area unlocks it for them (flag entered-<id>). */
  onOwnTokenTile(tile) {
    if ( !tile || !this.list.length ) return;
    const key = `${tile.x},${tile.y}`;
    for ( const a of this.list ) {
      if ( !a.cells.has(key) || hasFlag(`entered-${a.id}`) || this._entering.has(a.id) ) continue;
      this._entering.add(a.id);
      a.locked = false;
      this._drawOverlay(a);
      refreshPlaceables();
      setFlags([`entered-${a.id}`], game.user, {kind: "notice", id: a.id, name: a.area.name ?? a.id})
        .catch(err => console.error(`${MODULE} | entered flag failed`, err))
        .finally(() => this._entering.delete(a.id));
    }
  },

  async _drawOverlay(a) {
    if ( this._drawn.has(a.id) || !this.container || !this.ctx ) return;
    this._drawn.add(a.id);
    const info = this.ctx.layout.areas?.[a.id];
    if ( !info?.file ) return;            // no overlay art (yet): the base map is all there is
    const tex = await pixelTexture(modPath(`assets/maps/${info.file}`));
    if ( !tex || !this.container || this.container.destroyed ) return;
    const t = toSceneTile(this.ctx.layout, info.floor ?? a.area.floor, info.x, info.y);
    if ( !t ) return;
    const gs = canvas.grid.size;
    const s = new PIXI.Sprite(tex);
    s.x = t.x * gs;
    s.y = t.y * gs;
    s.width = (info.w ?? 1) * gs;
    s.height = (info.h ?? 1) * gs;
    s.alpha = 0;
    this.container.addChild(s);
    fadeIn(s);
  }
};

function fadeIn(obj, ms = 600) {
  const t0 = performance.now();
  const step = () => {
    if ( obj.destroyed ) return;
    obj.alpha = Math.min(1, (performance.now() - t0) / ms);
    if ( obj.alpha < 1 ) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* -------------------------------------------- */
/*  Hiding tokens + booth tiles                 */
/* -------------------------------------------- */

function placeableTile(p) {
  const gs = canvas.grid.size;
  const d = p.document;
  const isToken = p instanceof foundry.canvas.placeables.Token;
  const w = (d.width ?? 1) * (isToken ? gs : 1);
  const h = (d.height ?? 1) * (isToken ? gs : 1);
  return {x: Math.floor((d.x + w / 2) / gs), y: Math.floor((d.y + h / 2) / gs)};
}

/** Render flags differ a little between v12 builds: try the precise flag, fall back to a full state refresh. */
function requestRefresh(p, flag) {
  try { p.renderFlags.set({[flag]: true}); } catch { try { p.renderFlags.set({refreshState: true}); } catch {} }
}

function hidePlaceable(p) {
  p.visible = false;
  p.renderable = false;
  if ( p.mesh ) p.mesh.visible = false;
  p._maulHidden = true;
}

/** Undo our hiding and let Foundry recompute visibility on the next frame. */
function restorePlaceable(p, flag) {
  if ( !p._maulHidden ) return;
  p._maulHidden = false;
  p.renderable = true;
  requestRefresh(p, flag);
}

/** refreshToken hook: hide other people's tokens standing in a locked area. */
export function applyTokenConcealment(token) {
  const hide = Areas.list.length && !game.user.isGM && !token.document.isOwner
    && Areas.isLockedAt(...Object.values(placeableTile(token)));
  if ( hide ) hidePlaceable(token);
  else restorePlaceable(token, "refreshVisibility");
}

/** refreshTile hook: hide booth tiles in a locked area. */
export function applyTileConcealment(tile) {
  if ( tile.document.getFlag(MODULE, "boothSlot") === undefined ) return;
  let hide = false;
  if ( Areas.list.length && !game.user.isGM ) {
    // Booth tiles are anchored bottom-centre on the booth cell
    const gs = canvas.grid.size;
    const d = tile.document;
    hide = Areas.isLockedAt(Math.floor((d.x + d.width / 2) / gs), Math.floor((d.y + d.height - 1) / gs));
  }
  if ( hide ) hidePlaceable(tile);
  else restorePlaceable(tile, "refreshVisibility");
}

/** Ask Foundry to redraw token / tile visibility (after an area locks or unlocks). */
export function refreshPlaceables() {
  if ( !canvas?.ready ) return;
  for ( const t of canvas.tokens?.placeables ?? [] ) requestRefresh(t, "refreshVisibility");
  for ( const t of canvas.tiles?.placeables ?? [] ) {
    if ( t.document.getFlag(MODULE, "boothSlot") !== undefined ) requestRefresh(t, "refreshVisibility");
  }
}
