// MAUL Mall Explorer: shop signs (17 Nov 2026). Little 8-bit hanging boards beside store doors showing what's sold
// inside (sword, potion, mug, shirt...). Data-driven: tools/build_directory.py gives every store pin in
// data/directory/<mall>.json a `sign: {icon, x, y}` (floor-local wall cell beside the door) and draws the icon sheets
// assets/sprites/signs/<theme>.png (+ index.json). A new mall gets signs as soon as its directory is built.
// Drawn client-side above the map, below booth tiles, NPCs and tokens; hidden inside secret areas still locked for the viewer.

import {MODULE, modPath} from "./config.js";
import {fetchJSON} from "./data.js";
import {toSceneTile} from "./grid.js";
import {mapContainer, destroyContainer, pixelTexture} from "./layers.js";
import {Areas} from "./areas.js";

export const StoreSigns = {
  layer: null,
  signs: [],        // [{sx, sy, sprite}]
  _gen: 0,

  async setup(ctx) {
    this.teardown();
    const gen = ++this._gen;
    if ( !ctx?.mall?.id ) return;
    const [dir, index] = await Promise.all([
      fetchJSON(modPath(`data/directory/${ctx.mall.id}.json`), {optional: true}),
      fetchJSON(modPath("assets/sprites/signs/index.json"), {optional: true})
    ]);
    const pins = (dir?.pins ?? []).filter(p => p?.sign?.icon);
    if ( gen !== this._gen || !pins.length || !index?.icons?.length || !canvas?.ready ) return;
    const theme = (index.themes ?? []).includes(ctx.mall.theme) ? ctx.mall.theme : (index.themes?.[0] ?? "galleria");
    const tex = await pixelTexture(modPath(`assets/sprites/signs/${theme}.png`));
    if ( gen !== this._gen || !tex ) return;
    const fw = index.frame ?? 16;
    const gs = canvas.grid.size;
    const frames = new Map();
    this.layer = mapContainer("maul-shop-signs", 4);   // above reveals (3), below booth tiles (500) and NPCs (550)
    for ( const p of pins ) {
      const i = index.icons.indexOf(p.sign.icon);
      const t = toSceneTile(ctx.layout, p.floor, p.sign.x, p.sign.y);
      if ( i < 0 || !t ) continue;
      if ( !frames.has(i) ) frames.set(i, new PIXI.Texture(tex.baseTexture, new PIXI.Rectangle(i * fw, 0, fw, fw)));
      const s = new PIXI.Sprite(frames.get(i));
      s.x = t.x * gs;
      s.y = t.y * gs;
      s.scale.set(gs / fw);
      s.eventMode = "none";
      this.layer.addChild(s);
      this.signs.push({sx: t.x, sy: t.y, sprite: s});
    }
    this.refresh();
  },

  /** Areas locked / unlocked for the viewer: hide signs inside locked secret areas. */
  refresh() {
    for ( const s of this.signs ) s.sprite.visible = !Areas.isLockedAt(s.sx, s.sy);
  },

  teardown() {
    this._gen++;
    destroyContainer(this.layer);
    this.layer = null;
    this.signs = [];
  }
};

export function setupStoreSigns(ctx) {
  StoreSigns.setup(ctx).catch(err => console.error(`${MODULE} | shop signs failed`, err));
}
