// MAUL Mall Explorer: store names and shop markers (SPEC 5).
// - Key N toggles an overlay with every store's full name at its label point.
// - Walking within 2 tiles of a store's sign plaque pops its name up in a small tag above the plaque.
// - Pop-up booths (kind "shop") that are open get a little bobbing coin.
// - Shop signs (what's sold inside, 17 Nov 2026) live in signs.js; set up / torn down / refreshed from here.
// Labels come from layout `labels` (with signX/signY) when the renderer provides them, else from the mall JSON floors.

import {toSceneTile, chebyshev} from "./grid.js";
import {isConcealed} from "./progress.js";
import {getWeek} from "./week.js";
import {uiContainer, destroyContainer} from "./layers.js";
import {Areas} from "./areas.js";
import {StoreSigns, setupStoreSigns} from "./signs.js";

const TAG_RANGE = 2;
// Fonts with Latin-1 glyphs (ñ, é: "Oh Banañons!"); canvas text also falls back per glyph.
const FONT = "\"Press Start 2P\", \"VT323\", \"Lucida Console\", Consolas, \"DejaVu Sans Mono\", monospace";

function label(text, {size = 13, fill = 0xffffff, bg = 0x1c1c28, alpha = 0.85} = {}) {
  const c = new PIXI.Container();
  const t = new PIXI.Text(String(text), {fontFamily: FONT, fontSize: size, fill, stroke: 0x000000, strokeThickness: 3});
  t.anchor.set(0.5, 1);
  t.resolution = 2;
  const pad = 6;
  const g = new PIXI.Graphics();
  g.beginFill(bg, alpha).lineStyle(3, 0x000000, 0.9)
    .drawRect(-t.width / 2 - pad, -t.height - pad, t.width + pad * 2, t.height + pad * 1.5).endFill();
  c.addChild(g, t);
  return c;
}

export const Markers = {
  ctx: null,
  labels: [],          // [{text, lx, ly, sx, sy, hasSign}] scene tiles
  namesOn: false,
  namesLayer: null,
  tagLayer: null,
  coinLayer: null,
  _tagKeys: "",
  _tick: null,

  setup(ctx) {
    this.teardown();
    this.ctx = ctx;
    if ( !ctx ) return;
    this.labels = this._collectLabels(ctx);
    this.namesLayer = uiContainer("maul-store-names");
    this.tagLayer = uiContainer("maul-store-tags");
    this.coinLayer = uiContainer("maul-coins");
    this.drawNames();
    this.drawCoins();
    setupStoreSigns(ctx);
    this._tick = () => {
      if ( !this.coinLayer || this.coinLayer.destroyed ) return;
      const t = performance.now() / 1000;
      for ( const c of this.coinLayer.children ) {
        const e = c._entry;
        const gs = canvas.grid.size;
        c.x = (e.sx + 0.5) * gs;
        c.y = e.sy * gs - 10 - Math.round(Math.abs(Math.sin(t * 2.4 + c._phase)) * 8);
        c.scale.x = Math.cos(t * 3 + c._phase) >= 0 ? 1 : -1;   // little 2-frame spin
        c.children[1].visible = Math.abs(Math.cos(t * 3 + c._phase)) > 0.35;
      }
    };
    canvas.app.ticker.add(this._tick);
  },

  teardown() {
    if ( this._tick ) canvas?.app?.ticker?.remove(this._tick);
    this._tick = null;
    for ( const l of [this.namesLayer, this.tagLayer, this.coinLayer] ) destroyContainer(l);
    this.namesLayer = this.tagLayer = this.coinLayer = null;
    this.labels = [];
    this._tagKeys = "";
    this.ctx = null;
    StoreSigns.teardown();
  },

  _collectLabels(ctx) {
    const out = [];
    const fromLayout = Array.isArray(ctx.layout.labels) ? ctx.layout.labels : null;
    const src = fromLayout ?? (ctx.mall.floors ?? []).flatMap(f => (f.labels ?? []).map(l => ({...l, floor: f.id})));
    for ( const l of src ) {
      if ( !l?.text ) continue;
      const p = toSceneTile(ctx.layout, l.floor, l.x, l.y);
      if ( !p ) continue;
      const hasSign = Number.isFinite(l.signX) && Number.isFinite(l.signY);
      const s = hasSign ? toSceneTile(ctx.layout, l.floor, l.signX, l.signY) : p;
      out.push({text: String(l.text), lx: p.x, ly: p.y, sx: s.x, sy: s.y, hasSign});
    }
    return out;
  },

  toggleNames() {
    this.namesOn = !this.namesOn;
    this.drawNames();
    return true;
  },

  drawNames() {
    if ( !this.namesLayer || this.namesLayer.destroyed ) return;
    this.namesLayer.removeChildren().forEach(c => c.destroy({children: true}));
    if ( !this.namesOn ) return;
    const gs = canvas.grid.size;
    for ( const l of this.labels ) {
      if ( Areas.isLockedAt(l.lx, l.ly) ) continue;
      const c = label(l.text, {size: 14, fill: 0xffe14d});
      c.x = (l.lx + 0.5) * gs;
      c.y = (l.ly + 0.5) * gs;
      this.namesLayer.addChild(c);
    }
  },

  /** Token moved: show tags for sign plaques within reach (only with renderer sign positions). */
  updateTags(tile) {
    if ( !this.tagLayer || this.tagLayer.destroyed ) return;
    const near = tile ? this.labels.filter(l => l.hasSign && chebyshev(l.sx, l.sy, tile.x, tile.y) <= TAG_RANGE
      && !Areas.isLockedAt(l.sx, l.sy)) : [];
    const keys = near.map(l => `${l.sx},${l.sy},${l.text}`).join("|");
    if ( keys === this._tagKeys ) return;
    this._tagKeys = keys;
    this.tagLayer.removeChildren().forEach(c => c.destroy({children: true}));
    const gs = canvas.grid.size;
    for ( const l of near ) {
      const c = label(l.text, {size: 11, fill: 0xffffff, bg: 0x3c6fd8, alpha: 0.95});
      c.x = (l.sx + 0.5) * gs;
      c.y = l.sy * gs - 4;
      this.tagLayer.addChild(c);
    }
  },

  /** (Re)draw coins over open pop-up booths (week / flags / areas changed). */
  drawCoins() {
    StoreSigns.refresh();   // called whenever flags / areas change
    if ( !this.coinLayer || this.coinLayer.destroyed || !this.ctx ) return;
    this.coinLayer.removeChildren().forEach(c => c.destroy({children: true}));
    const week = getWeek();
    for ( const e of this.ctx.entries ) {
      const sells = e.ia.kind === "shop" || (Array.isArray(e.ia.store?.stock) && e.ia.store.stock.length);
      if ( !sells || (e.slot && week < e.slot) || isConcealed(e.ia) || Areas.isLockedAt(e.sx, e.sy) ) continue;
      const c = new PIXI.Container();
      const g = new PIXI.Graphics();
      g.beginFill(0x000000, 0.9).drawRect(-9, -9, 18, 18).endFill();     // chunky 8-bit coin
      g.beginFill(0xd18b00).drawRect(-7, -7, 14, 14).endFill();
      g.beginFill(0xffd34d).drawRect(-5, -7, 10, 14).drawRect(-7, -5, 14, 10).endFill();
      const shine = new PIXI.Graphics();
      shine.beginFill(0xfff6c0).drawRect(-3, -5, 2, 6).endFill();
      c.addChild(g, shine);
      c._entry = e;
      c._phase = Math.random() * Math.PI * 2;
      this.coinLayer.addChild(c);
    }
  }
};
