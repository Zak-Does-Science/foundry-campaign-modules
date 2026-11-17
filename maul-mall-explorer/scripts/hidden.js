// MAUL Mall Explorer: hidden things (SPEC 1). Interactables with `hidden` get no "!", can't be used and don't show their
// live sprite until this character notices them: passively (passive Perception vs hidden.dc within hidden.radius) or by
// searching (key F: a Perception roll vs every unnoticed thing within 3 tiles). Noticing draws the reveal overlay from
// layout `reveals`, a sparkle, the chime, the hint bubble, sets flag noticed-<id> and logs it.

import {MODULE, modPath, esc} from "./config.js";
import {toSceneTile, chebyshev} from "./grid.js";
import {setFlags, isConcealed, hasFlag, logEvent} from "./progress.js";
import {mapContainer, uiContainer, destroyContainer, pixelTexture} from "./layers.js";
import {Sfx} from "./audio.js";
import {say, readTime} from "./ambient.js";
import {Areas} from "./areas.js";
import {gmIds} from "./notify.js";
import {rollSkill} from "./dnd.js";

const SEARCH_RANGE = 3;
const SEARCH_COOLDOWN = 60_000;
const DEFAULT_HINT = "You notice something...";

export const Hidden = {
  ctx: null,
  revealLayer: null,
  fxLayer: null,
  _revealed: new Set(),
  _checked: new Map(),       // `${actorId}:${id}` -> passive value already tested
  _searches: new Map(),      // `${actorId}:${areaKey}` -> timestamp
  _noticing: new Set(),
  _last: 0,
  onNotice: null,            // callback(entry) set by main.js (redraw hints / live sprites)

  setup(ctx) {
    this.teardown();
    this.ctx = ctx;
    if ( !ctx?.entries.some(e => e.ia.hidden) ) return;
    this.revealLayer = mapContainer("maul-reveals", 3);
    this.fxLayer = uiContainer("maul-sparkles");
    for ( const e of ctx.entries ) {
      if ( e.ia.hidden && !isConcealed(e.ia) ) this.drawReveal(e, false);
    }
  },

  teardown() {
    destroyContainer(this.revealLayer);
    destroyContainer(this.fxLayer);
    this.revealLayer = this.fxLayer = null;
    this._revealed.clear();
    this.ctx = null;
  },

  /** Flags changed (e.g. a GM update file granted noticed-<id>): draw any reveals that are now due. */
  sync() {
    if ( !this.ctx || !this.revealLayer ) return;
    for ( const e of this.ctx.entries ) {
      if ( e.ia.hidden && !isConcealed(e.ia) ) this.drawReveal(e, false);
    }
  },

  /** Passive Perception, called as the player's token moves. */
  passiveTick(token, tile) {
    const now = Date.now();
    if ( !this.ctx || now - this._last < 250 ) return;
    this._last = now;
    const actor = token.actor;
    const passive = Number(actor?.system?.skills?.prc?.passive);
    if ( !Number.isFinite(passive) ) return;
    for ( const e of this.ctx.entries ) {
      const h = e.ia.hidden;
      if ( !h || !isConcealed(e.ia) || Areas.isLockedAt(e.sx, e.sy) ) continue;
      if ( chebyshev(e.sx, e.sy, tile.x, tile.y) > (Number(h.radius) || 2) ) continue;
      const key = `${actor.id}:${e.ia.id}`;
      if ( this._checked.get(key) === passive ) continue;    // once per character per thing per passive value
      this._checked.set(key, passive);
      if ( passive >= (Number(h.dc) || 10) ) this.notice(e, {kind: "notice", passive});
    }
  },

  /** Active search (key F). Returns true if the key press was used. */
  async search(token, tile) {
    if ( !this.ctx || !token ) return false;
    const actor = token.actor ?? game.user.character;
    if ( !actor ) {
      ui.notifications.warn("You need a character to search with.");
      return true;
    }
    const areaKey = `${Math.floor(tile.x / SEARCH_RANGE)},${Math.floor(tile.y / SEARCH_RANGE)}`;
    const key = `${actor.id}:${areaKey}`;
    const last = this._searches.get(key) ?? 0;
    if ( Date.now() - last < SEARCH_COOLDOWN ) {
      const s = Math.ceil((SEARCH_COOLDOWN - (Date.now() - last)) / 1000);
      ui.notifications.info(`You've just searched around here. Try again in ${s}s, or look somewhere else.`);
      return true;
    }
    this._searches.set(key, Date.now());
    Sfx.search();
    let roll;
    try {
      roll = await rollSkill(actor, "prc", {flavor: "Mall Explorer: searching the area", messageMode: "gm"});
    } catch(err) {
      console.error(`${MODULE} | search roll failed`, err);
      return true;
    }
    if ( !roll ) {                      // roll dialog cancelled: give the search back
      this._searches.delete(key);
      return true;
    }
    const total = Number(roll.total);
    const found = [];
    for ( const e of this.ctx.entries ) {
      const h = e.ia.hidden;
      if ( !h || !isConcealed(e.ia) || Areas.isLockedAt(e.sx, e.sy) ) continue;
      if ( chebyshev(e.sx, e.sy, tile.x, tile.y) > SEARCH_RANGE ) continue;
      if ( total >= (Number(h.dc) || 10) ) found.push(e);
    }
    await logEvent({kind: "search", id: `search:${tile.x},${tile.y}`, name: "Searched the area", roll: total,
      found: found.map(e => e.ia.id)}).catch(() => {});
    for ( const e of found ) await this.notice(e, {kind: "search", roll: total});
    if ( !found.length ) say(tile, "", "Nothing out of the ordinary here.", 2500);
    const who = actor.name ? `${game.user.name} (${actor.name})` : game.user.name;
    ChatMessage.create({
      content: `<div class="maul-chat-card"><h3>Search</h3><p><strong>${esc(who)}</strong> searched at
        ${esc(this.ctx.mall.name ?? this.ctx.mall.id)}: Perception <strong>${total}</strong>.
        ${found.length ? `Found: ${found.map(e => esc(e.ia.name ?? e.ia.id)).join(", ")}.` : "Found nothing."}</p></div>`,
      whisper: gmIds(),
      speaker: {alias: "MAUL Mall Explorer"}
    }).catch(err => console.warn(`${MODULE} | search whisper failed`, err));
    return true;
  },

  /** Reveal a hidden thing for this character. */
  async notice(entry, {kind = "notice", roll, passive} = {}) {
    const id = entry.ia.id;
    if ( this._noticing.has(id) || hasFlag(`noticed-${id}`) ) return;
    this._noticing.add(id);
    try {
      this.drawReveal(entry, true);
      this.sparkle(entry);
      Sfx.chime();
      const hint = String(entry.ia.hidden?.hint || DEFAULT_HINT);
      say({x: entry.sx, y: entry.sy}, "", hint, readTime(hint), {entry});
      const extra = {};
      if ( roll !== undefined ) extra.roll = roll;
      if ( passive !== undefined ) extra.passive = passive;
      await setFlags([`noticed-${id}`], game.user, {kind, id, name: entry.ia.name ?? id, ...extra});
      this.onNotice?.(entry);
    } catch(err) {
      console.error(`${MODULE} | notice failed`, err);
    } finally {
      this._noticing.delete(id);
    }
  },

  /** Draw the reveal overlay (true tiles) from layout `reveals`, if RENDER exported one. */
  async drawReveal(entry, fade) {
    const id = entry.ia.id;
    if ( this._revealed.has(id) || !this.revealLayer || !this.ctx ) return;
    this._revealed.add(id);
    const info = this.ctx.layout.reveals?.[id];
    if ( !info?.file ) return;
    const tex = await pixelTexture(modPath(`assets/maps/${info.file}`));
    if ( !tex || !this.revealLayer || this.revealLayer.destroyed ) return;
    const t = toSceneTile(this.ctx.layout, info.floor ?? entry.ia.floor, info.x, info.y);
    if ( !t ) return;
    const gs = canvas.grid.size;
    const s = new PIXI.Sprite(tex);
    s.x = t.x * gs;
    s.y = t.y * gs;
    s.width = (info.w ?? 1) * gs;
    s.height = (info.h ?? 1) * gs;
    this.revealLayer.addChild(s);
    if ( fade ) {
      s.alpha = 0;
      const t0 = performance.now();
      const step = () => {
        if ( s.destroyed ) return;
        s.alpha = Math.min(1, (performance.now() - t0) / 800);
        if ( s.alpha < 1 ) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  },

  /** A burst of little pixel stars on the tile. */
  sparkle(entry) {
    if ( !this.fxLayer || this.fxLayer.destroyed ) return;
    const gs = canvas.grid.size;
    const cx = (entry.sx + 0.5) * gs;
    const cy = (entry.sy + 0.5) * gs;
    const g = new PIXI.Graphics();
    this.fxLayer.addChild(g);
    const stars = Array.from({length: 9}, (_, i) => ({a: (i / 9) * Math.PI * 2 + Math.random() * 0.4, r0: 6 + Math.random() * 8, sp: 30 + Math.random() * 40}));
    const t0 = performance.now();
    const DUR = 1200;
    const step = () => {
      if ( g.destroyed ) return;
      const k = (performance.now() - t0) / DUR;
      if ( k >= 1 ) { g.destroy(); return; }
      g.clear();
      for ( const s of stars ) {
        const r = s.r0 + s.sp * k;
        const x = Math.round(cx + Math.cos(s.a) * r);
        const y = Math.round(cy + Math.sin(s.a) * r - 10 * k);
        const size = k < 0.5 ? 8 : 4;
        g.beginFill(k < 0.3 ? 0xffffff : 0xffe14d, 1 - k);
        g.drawRect(x - size / 2, y - 1, size, 2);
        g.drawRect(x - 1, y - size / 2, 2, size);
        g.endFill();
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
};
