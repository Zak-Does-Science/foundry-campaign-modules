// MAUL Mall Explorer: live NPC sprites (SPEC 4). Sprite sheets from assets/sprites/live/index.json are drawn as PIXI
// sprites at x4 (nearest-neighbour) on each interactable's tile, with a shadow and an idle style; `wander` NPCs walk
// tile by tile between their points, and the interactable's current tile follows them (so "!", bubbles and E work
// where the NPC actually is). Client-side only. If index.json is missing, nothing is drawn and nothing breaks.

import {MODULE, modPath} from "./config.js";
import {fetchJSON} from "./data.js";
import {toSceneTile} from "./grid.js";
import {isConcealed} from "./progress.js";
import {mapContainer, destroyContainer, pixelTexture} from "./layers.js";
import {Areas} from "./areas.js";
import {standinKey, standinAway, pcKey} from "./pc.js";
import {coworkerSprite} from "./coworkers.js";

const INDEX = modPath("assets/sprites/live/index.json");
const STEP_MS = 250;

const rand = (a, b) => a + Math.random() * (b - a);

// Soft drop shadow (depth tier, 17 Nov 2026): a 12x4 two-step ellipse at the art's own pixel size, scaled up with
// nearest-neighbour, so it reads as pixel art rather than a smooth blob. Darker core, lighter rim.
let _shadowTex = null;
function shadowTexture() {
  if ( _shadowTex?.baseTexture && !_shadowTex.baseTexture.destroyed ) return _shadowTex;
  const rows = ["...oooooo...", ".ooiiiiiioo.", ".ooiiiiiioo.", "...oooooo..."];
  const c = document.createElement("canvas");
  c.width = 12; c.height = 4;
  const g = c.getContext("2d");
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if ( ch === "." ) return;
    g.fillStyle = ch === "i" ? "rgba(10,6,20,0.30)" : "rgba(10,6,20,0.14)";
    g.fillRect(x, y, 1, 1);
  }));
  _shadowTex = PIXI.Texture.from(c);
  _shadowTex.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  return _shadowTex;
}

/**
 * Sprite sheets are loaded into textures this module owns (17 Nov 2026 fix). Through Foundry's shared TextureLoader
 * cache they could be unloaded while still on screen (the cache expires and destroys entries it thinks are unused),
 * which left NPCs invisible with only their shadows showing. Falls back to the shared loader if the image won't load.
 */
async function ownTexture(src) {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    await img.decode();
    const bt = new PIXI.BaseTexture(img, {scaleMode: PIXI.SCALE_MODES.NEAREST});
    return new PIXI.Texture(bt);
  } catch(err) {
    return pixelTexture(src);
  }
}

const dead = tex => !tex || !tex.baseTexture || tex.baseTexture.destroyed;

function makeShadow(scale) {
  const s = new PIXI.Sprite(shadowTexture());
  s.anchor.set(0.5, 0.5);
  s.scale.set(scale);
  return s;
}

export const Live = {
  ctx: null,
  layer: null,
  actors: [],          // [{entry, sprite, shadow, frames, idle, ...}]
  _tick: null,
  onMove: null,        // callback() when a wandering NPC changes tile (main.js: refresh hints)

  _gen: 0,

  async setup(ctx) {
    this.teardown();
    const gen = ++this._gen;
    this.ctx = ctx;
    if ( !ctx ) return;
    const index = await fetchJSON(INDEX, {optional: true}).catch(() => null);
    if ( !index || typeof index !== "object" || gen !== this._gen ) return;
    this.index = index;
    // Sprite key: the renderer's layout `liveSprites` (id -> key, incl. default species), else the interactable's own `sprite`
    // Stand-ins (SPEC 22) use their character's pc sprite or the store's placeholder.
    // A coworker the store's player re-skinned (Coworkers panel, SPEC 27) uses their pick first.
    // Sitters (`pose: "sit"`, on a bench or chair) use the seated sheet `<key>|sit` when the renderer made one.
    const baseKey = ia => (ia.kind === "standin" ? standinKey(index, ia)
      : (coworkerSprite(ctx.mall, ia, index) ?? ctx.layout.liveSprites?.[ia.id] ?? ia.sprite));
    const keyOf = ia => {
      const k = baseKey(ia);
      return (ia.pose === "sit" && k && index[`${k}|sit`]) ? `${k}|sit` : k;
    };
    const wanted = ctx.entries.filter(e => !e.ia.synthetic && (index[keyOf(e.ia)] || index[e.ia.id]));
    this._ensureLayer();
    this._ensureTicker();                            // also drives player-character token sprites (SPEC 23)
    await this._addDepth(ctx.layout, gen);
    if ( gen !== this._gen ) return;
    for ( const entry of wanted ) {
      const info = index[keyOf(entry.ia)] ?? index[entry.ia.id];
      if ( !info?.file ) continue;
      const base = await this._texture(info.file);
      if ( gen !== this._gen ) return;
      if ( !base || !this.layer ) continue;
      try {
        this._add(entry, info, base);
      } catch(err) {
        console.warn(`${MODULE} | live sprite for ${entry.ia.id} failed`, err);
      }
    }
  },

  index: null,
  _texCache: new Map(),

  /**
   * Depth tier y-sorting (17 Nov 2026): big trees are redrawn from the layout's `depth` atlas into this layer with
   * zIndex = their sort line, so anyone standing behind a tree (feet above the line) is drawn under its canopy and
   * anyone in front stays on top. Pieces are 16-px art, scaled like the map. Missing atlas = nothing happens.
   */
  async _addDepth(layout, gen) {
    const d = layout?.depth;
    if ( !d?.file || !Array.isArray(d.pieces) || !d.pieces.length ) return;
    const base = await ownTexture(modPath(`assets/maps/${d.file}`));
    if ( !base || gen !== this._gen || !this.layer ) return;
    const s = canvas.grid.size / (Number(layout.tilePx) || 16);
    for ( const p of d.pieces ) {
      try {
        const tex = new PIXI.Texture(base.baseTexture, new PIXI.Rectangle(base.frame.x + p.ax, base.frame.y + p.ay, p.w, p.h));
        const spr = new PIXI.Sprite(tex);
        spr.scale.set(s);
        spr.x = p.x * s;
        spr.y = p.y * s;
        spr.zIndex = p.base * s;
        this.layer.addChild(spr);
      } catch(err) {
        console.warn(`${MODULE} | depth piece failed`, err);
      }
    }
  },

  _ensureLayer() {
    if ( this.layer && !this.layer.destroyed ) return;
    this.layer = mapContainer("maul-live", 550);   // above booth tiles (500), below tokens (700)
    this.layer.sortableChildren = true;
  },

  _ensureTicker() {
    if ( this._tick ) return;
    this._tick = () => this._update();
    canvas.app.ticker.add(this._tick);
  },

  async _texture(file) {
    if ( !this._texCache.has(file) ) this._texCache.set(file, ownTexture(modPath(`assets/sprites/live/${file}`)));
    let tex = await this._texCache.get(file);
    if ( dead(tex) ) {                                   // unloaded since: load it once more
      this._texCache.set(file, ownTexture(modPath(`assets/sprites/live/${file}`)));
      tex = await this._texCache.get(file);
    }
    if ( dead(tex) ) { this._texCache.delete(file); return null; }
    return tex;
  },

  /** A sheet was unloaded under a live sprite: reload it and swap the frames in (the sprite keeps its place). */
  async _heal(a) {
    if ( a.healing ) return;
    a.healing = true;
    try {
      const base = await this._texture(a.info.file);
      if ( !base || a.sprite.destroyed ) return;
      a.frames = a.frames.map((f, i) => new PIXI.Texture(base.baseTexture,
        new PIXI.Rectangle(base.frame.x + i * a.fw, base.frame.y, a.fw, a.fh)));
      a.frame = 0;
      a.sprite.texture = a.frames[0];
    } finally {
      a.healing = false;
    }
  },

  /**
   * A temporary walk-on sprite for a chat speaker given as a bare tile (SPEC 18). Fades in now; call dismiss() to fade
   * it out. Unknown sprite keys fall back to the same species, then any human, then any NPC. Null if no sprites exist.
   */
  async walkOn(tile, key) {
    if ( !this.ctx || !canvas?.ready || !this.index || !tile ) return null;
    const gen = this._gen;
    const index = this.index;
    let info = index[key];
    if ( !info ) {
      const species = String(key ?? "").match(/^npc:([a-z]+)/i)?.[1];
      const keys = Object.keys(index);
      const alt = (species && keys.find(k => k.startsWith(`npc:${species}:`)))
        ?? keys.find(k => k.startsWith("npc:human:")) ?? keys.find(k => k.startsWith("npc:"));
      info = alt ? index[alt] : null;
    }
    if ( !info?.file ) return null;
    const base = await this._texture(info.file);
    if ( !base || gen !== this._gen ) return null;
    this._ensureLayer();
    const entry = {ia: {id: `walkon-${foundry.utils.randomID()}`, kind: "npc", idle: "look"}, sx: tile.x, sy: tile.y};
    const a = this._add(entry, info, base);
    a.alpha = 0;
    a.walkOn = true;
    this._ensureTicker();
    return {dismiss: () => { a.dismissed = true; }};
  },

  teardown() {
    this._gen++;
    this._clearPcTokens();
    if ( this._tick ) canvas?.app?.ticker?.remove(this._tick);
    this._tick = null;
    // Put wandering NPCs back home so the cached mall context starts clean next time
    for ( const a of this.actors ) {
      a.entry.sx = a.homeX;
      a.entry.sy = a.homeY;
    }
    this.actors = [];
    destroyContainer(this.layer);
    this.layer = null;
    this.ctx = null;
  },

  /** Concealment / area locks changed: visibility is re-evaluated every frame, nothing to do but keep the API. */
  refresh() {},

  _add(entry, info, base) {
    const gs = canvas.grid.size;
    const fw = Number(info.fw) || 16;
    const fh = Number(info.fh) || 16;
    const n = Math.max(1, Math.min(Number(info.frames) || 1, Math.floor(base.width / fw) || 1));
    const frames = [];
    for ( let i = 0; i < n; i++ ) frames.push(new PIXI.Texture(base.baseTexture, new PIXI.Rectangle(base.frame.x + i * fw, base.frame.y, fw, fh)));
    const scale = gs / 16;
    const footY = Number.isFinite(Number(info.footY)) ? Number(info.footY) : fh - 1;

    const shadow = makeShadow(scale);
    const sprite = new PIXI.Sprite(frames[0]);
    sprite.anchor.set(0.5, (footY + 1) / fh);
    sprite.scale.set(scale);
    this.layer.addChild(shadow, sprite);

    const ia = entry.ia;
    const sitting = ia.pose === "sit";
    let idle = ia.idle ?? (ia.kind === "npc" ? "breathe" : (n > 1 ? "breathe" : "still"));
    if ( sitting && (idle === "bob" || idle === "fidget") ) idle = "look";   // sitters don't hop off the bench
    const path = sitting ? null : this._wanderPath(ia);
    if ( sitting ) shadow.renderable = false;                                // the bench casts the shadow
    const a = {
      entry, sprite, shadow, frames, idle, scale, info, fw, fh, footY, nextPuff: performance.now() + rand(200, 1500),
      homeX: entry.sx, homeY: entry.sy,
      px: entry.sx, py: entry.sy,             // drawn position in tiles (tweened)
      frame: 0, nextFrame: performance.now() + rand(0, 1400),
      nextLook: performance.now() + rand(2000, 7000), hop: 0, nextHop: performance.now() + rand(4000, 12000),
      phase: Math.random() * Math.PI * 2,
      path, target: 0, step: null, waitUntil: performance.now() + rand(3000, 8000),
      alpha: isConcealed(ia) ? 0 : 1
    };
    this.actors.push(a);
    this._place(a);
    return a;
  },

  /** Wander points (floor-local) -> scene tiles. Needs 2+ points. */
  _wanderPath(ia) {
    if ( !Array.isArray(ia.wander) || ia.wander.length < 2 ) return null;
    const pts = ia.wander.map(p => (Array.isArray(p) ? toSceneTile(this.ctx.layout, ia.floor, p[0], p[1]) : null)).filter(Boolean);
    return pts.length >= 2 ? pts : null;
  },

  _place(a) {
    const gs = canvas.grid.size;
    const x = (a.px + 0.5) * gs;
    const footY = (a.py + 1) * gs - a.scale;
    let lift = 0;
    if ( a.idle === "bob" ) lift = Math.round((Math.sin(performance.now() / 300 + a.phase) + 1) * 1.5) * a.scale;
    if ( a.hop > 0 ) lift += Math.round(Math.sin(a.hop * Math.PI) * 3) * a.scale;
    a.sprite.x = Math.round(x);
    a.sprite.y = Math.round(footY - lift);
    a.sprite.zIndex = a.sprite.y;
    a.shadow.x = Math.round(x);
    a.shadow.y = Math.round(footY - a.scale);
    a.shadow.zIndex = a.sprite.y - 1;
  },

  _tileFree(x, y) {
    const gs = canvas.grid.size;
    for ( const t of canvas.tokens?.placeables ?? [] ) {
      const d = t.document;
      const tx = Math.floor((d.x + d.width * gs / 2) / gs);
      const ty = Math.floor((d.y + d.height * gs / 2) / gs);
      if ( tx === x && ty === y ) return false;
    }
    return true;
  },

  _update() {
    if ( !this.layer || this.layer.destroyed ) return;
    const now = performance.now();
    const dt = canvas.app.ticker.deltaMS;
    for ( const a of this.actors ) {
      const e = a.entry;
      // Visibility: hidden until noticed (fade in), and never shown inside a secret area that's locked for this viewer
      const want = (a.dismissed || isConcealed(e.ia) || Areas.isLockedAt(e.sx, e.sy) || standinAway(e.ia)) ? 0 : 1;
      if ( a.alpha !== want ) {
        if ( want > a.alpha ) a.alpha = Math.min(1, a.alpha + dt / 600);
        else a.alpha = a.dismissed ? Math.max(0, a.alpha - dt / 600) : 0;
      }
      a.sprite.alpha = a.alpha;
      a.shadow.alpha = a.alpha;
      a.sprite.visible = a.shadow.visible = a.alpha > 0;
      if ( dead(a.sprite.texture) ) { a.sprite.visible = a.shadow.visible = false; this._heal(a); }   // never a lone shadow

      // Idle animation
      if ( a.frames.length > 1 && a.idle !== "still" && now >= a.nextFrame ) {
        a.frame = (a.frame + 1) % a.frames.length;
        a.sprite.texture = a.frames[a.frame];
        a.nextFrame = now + (a.frame === 0 ? rand(800, 1400) : rand(250, 450));
      }
      if ( (a.idle === "look" || a.idle === "fidget") && now >= a.nextLook ) {
        a.sprite.scale.x = -a.sprite.scale.x;
        a.nextLook = now + rand(2000, 7000);
      }
      if ( a.idle === "fidget" && now >= a.nextHop && a.hop <= 0 ) {
        a.hop = 0.0001;
        a.nextHop = now + rand(4000, 12000);
      }
      if ( a.hop > 0 ) {
        a.hop += dt / 300;
        if ( a.hop >= 1 ) a.hop = 0;
      }

      if ( a.dismissed && a.alpha <= 0 ) { a.gone = true; continue; }
      if ( a.path ) this._walk(a, now);
      this._place(a);
      this._smoke(a, now);
    }
    this._syncPcTokens(now, dt);
    this._updatePuffs(dt);
    if ( this.actors.some(a => a.gone) ) {
      for ( const a of this.actors.filter(x => x.gone) ) {
        if ( !a.sprite.destroyed ) a.sprite.destroy();
        if ( !a.shadow.destroyed ) a.shadow.destroy();
      }
      this.actors = this.actors.filter(x => !x.gone);
    }
  },

  /* ------------------------------------------ */
  /*  Player characters walk as their sprites    */
  /* ------------------------------------------ */

  pcs: new Map(),          // tokenId -> {token, key, sprite, shadow, frames, scale, fh, footY, frame, nextFrame, lastX, pending}
  _pcCheck: 0,

  _clearPcTokens() {
    for ( const rec of this.pcs.values() ) this._dropPc(rec);
    this.pcs.clear();
  },

  _dropPc(rec) {
    if ( rec.sprite && !rec.sprite.destroyed ) rec.sprite.destroy();
    if ( rec.shadow && !rec.shadow.destroyed ) rec.shadow.destroy();
    const mesh = rec.token?.mesh;
    if ( mesh && !mesh.destroyed ) mesh.renderable = true;      // give the portrait back
  },

  /** Is this token a walking character? (a character actor with a player owner, or one with its own pc sprite,
   *  e.g. the GM's Orichalcum rep) */
  _isPc(token) {
    const actor = token?.actor;
    if ( !actor || actor.type !== "character" ) return false;
    return !!actor.hasPlayerOwner || !!pcKey(this.index, actor.name);
  },

  _syncPcTokens(now, dt) {
    if ( !this.index || !this.layer || !canvas?.ready ) return;
    // Re-check which tokens are PCs and their sprite keys (forms can change) a few times a second
    if ( now >= this._pcCheck ) {
      this._pcCheck = now + 500;
      const seen = new Set();
      for ( const token of canvas.tokens.placeables ) {
        if ( !this._isPc(token) ) continue;
        const key = pcKey(this.index, token.actor.name);
        if ( !key ) continue;
        seen.add(token.id);
        const rec = this.pcs.get(token.id);
        if ( rec && rec.key === key && rec.token === token ) continue;
        if ( rec ) this._dropPc(rec);
        this.pcs.set(token.id, {token, key, pending: true});
        this._makePc(token.id, key);
      }
      for ( const [id, rec] of this.pcs ) {
        if ( !seen.has(id) ) { this._dropPc(rec); this.pcs.delete(id); }
      }
    }
    const gs = canvas.grid.size;
    for ( const rec of this.pcs.values() ) {
      const token = rec.token;
      if ( rec.pending || !rec.sprite || token.destroyed || !token.mesh ) continue;
      if ( dead(rec.sprite.texture) ) {               // sheet unloaded: hide, and rebuild on the next check
        rec.sprite.visible = rec.shadow.visible = false;
        rec.key = null;
        continue;
      }
      token.mesh.renderable = false;                  // hide the portrait; Foundry recreates meshes on redraw
      const show = token.visible && token.renderable !== false;   // false for hidden tokens (players) and locked secret areas
      rec.sprite.visible = rec.shadow.visible = !!show;
      if ( !show ) continue;
      const alpha = (token.alpha ?? 1) * (token.document.alpha ?? 1);
      rec.sprite.alpha = alpha;
      rec.shadow.alpha = alpha;
      const c = token.mesh.position;                  // animated centre
      const footY = c.y + (token.document.height * gs) / 2 - rec.scale;
      const moving = Math.abs(c.x - (rec.lastX ?? c.x)) > 0.01 || Math.abs(c.y - (rec.lastY ?? c.y)) > 0.01;
      if ( c.x - (rec.lastX ?? c.x) > 0.5 ) rec.sprite.scale.x = Math.abs(rec.sprite.scale.x);
      else if ( c.x - (rec.lastX ?? c.x) < -0.5 ) rec.sprite.scale.x = -Math.abs(rec.sprite.scale.x);
      rec.lastX = c.x;
      rec.lastY = c.y;
      if ( rec.frames.length > 1 && now >= rec.nextFrame ) {
        rec.frame = (rec.frame + 1) % rec.frames.length;
        rec.sprite.texture = rec.frames[rec.frame];
        rec.nextFrame = now + (moving ? 160 : (rec.frame === 0 ? rand(800, 1400) : rand(250, 450)));
      }
      rec.sprite.x = Math.round(c.x);
      rec.sprite.y = Math.round(footY);
      rec.sprite.zIndex = rec.sprite.y + 0.5;
      rec.shadow.x = Math.round(c.x);
      rec.shadow.y = Math.round(footY - rec.scale);
      rec.shadow.zIndex = rec.sprite.y - 1;
      this._smoke(rec, now);
    }
  },

  /* ------------------------------------------ */
  /*  Pipe smoke: sprites whose index entry has smoke: [x, y] (pixel in the frame) puff now and then */
  /* ------------------------------------------ */

  puffs: [],

  _smoke(a, now) {
    const pt = a.info?.smoke;
    if ( !Array.isArray(pt) || !a.sprite?.visible || !(a.sprite.alpha > 0.5) || now < a.nextPuff || !this.layer ) return;
    a.nextPuff = now + rand(900, 1700);
    const dir = Math.sign(a.sprite.scale.x) || 1;
    const x = a.sprite.x + (pt[0] + 0.5 - a.fw / 2) * a.scale * dir;
    const y = a.sprite.y - (a.footY - pt[1]) * a.scale;
    const g = new PIXI.Graphics();
    g.beginFill(0xe8e4ee, 1).drawRect(-a.scale / 2, -a.scale / 2, a.scale, a.scale).endFill();
    g.x = x; g.y = y; g.alpha = 0.55; g.zIndex = a.sprite.zIndex + 1;
    this.layer.addChild(g);
    this.puffs.push({g, age: 0, life: rand(1400, 2000), drift: rand(-0.6, 0.6) * a.scale, rise: 7 * a.scale, x0: x, y0: y});
  },

  _updatePuffs(dt) {
    if ( !this.puffs.length ) return;
    for ( const p of this.puffs ) {
      p.age += dt;
      const k = Math.min(1, p.age / p.life);
      if ( p.g.destroyed ) { p.done = true; continue; }
      p.g.x = p.x0 + p.drift * k * 3 + Math.sin(k * 6) * p.drift;
      p.g.y = p.y0 - p.rise * k;
      p.g.alpha = 0.55 * (1 - k);
      p.g.scale.set(1 + k * 0.8);
      if ( k >= 1 ) { p.g.destroy(); p.done = true; }
    }
    this.puffs = this.puffs.filter(p => !p.done);
  },

  async _makePc(tokenId, key) {
    const gen = this._gen;
    const info = this.index?.[key];
    const base = info?.file ? await this._texture(info.file) : null;
    const rec = this.pcs.get(tokenId);
    if ( gen !== this._gen || !rec || rec.key !== key || !this.layer ) return;
    if ( !base ) { this.pcs.delete(tokenId); return; }
    const gs = canvas.grid.size;
    const fw = Number(info.fw) || 16;
    const fh = Number(info.fh) || 16;
    const n = Math.max(1, Math.min(Number(info.frames) || 1, Math.floor(base.width / fw) || 1));
    const frames = [];
    for ( let i = 0; i < n; i++ ) frames.push(new PIXI.Texture(base.baseTexture, new PIXI.Rectangle(base.frame.x + i * fw, base.frame.y, fw, fh)));
    const scale = gs / 16;
    const footY = Number.isFinite(Number(info.footY)) ? Number(info.footY) : fh - 1;
    const shadow = makeShadow(scale);
    const sprite = new PIXI.Sprite(frames[0]);
    sprite.anchor.set(0.5, (footY + 1) / fh);
    sprite.scale.set(scale);
    this.layer.addChild(shadow, sprite);
    Object.assign(rec, {sprite, shadow, frames, scale, info, fw, fh, footY, nextPuff: performance.now() + rand(200, 1500),
      frame: 0, nextFrame: performance.now() + rand(0, 1200), pending: false});
  },

  _walk(a, now) {
    const e = a.entry;
    if ( a.step ) {                                   // mid-step tween
      const k = Math.min(1, (now - a.step.t0) / STEP_MS);
      a.px = a.step.fx + (a.step.tx - a.step.fx) * k;
      a.py = a.step.fy + (a.step.ty - a.step.fy) * k;
      if ( k >= 1 ) a.step = null;
      return;
    }
    if ( now < a.waitUntil ) return;
    const goal = a.path[a.target];
    if ( e.sx === goal.x && e.sy === goal.y ) {
      a.target = (a.target + 1) % a.path.length;
      a.waitUntil = now + rand(3000, 8000);
      return;
    }
    const dx = Math.sign(goal.x - e.sx);
    const dy = Math.sign(goal.y - e.sy);
    // Step along the longer axis first; try the other axis if a player is standing in the way
    const options = Math.abs(goal.x - e.sx) >= Math.abs(goal.y - e.sy)
      ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
    const move = options.find(([mx, my]) => (mx || my) && this._tileFree(e.sx + mx, e.sy + my));
    if ( !move ) {
      a.waitUntil = now + 600;                        // blocked by a player: wait politely
      return;
    }
    const [mx, my] = move;
    if ( mx ) a.sprite.scale.x = Math.abs(a.sprite.scale.x) * (mx < 0 ? -1 : 1);
    a.step = {fx: e.sx, fy: e.sy, tx: e.sx + mx, ty: e.sy + my, t0: now};
    e.sx += mx;
    e.sy += my;
    this.onMove?.(e);
  }
};
