// MAUL Mall Explorer: the Mall Directory, a player-facing map of the current mall with every store pinned and a
// legend of what each one sells. Opened with M, or by reading a directory sign (`"directory": true` on the interactable).
// Data: data/directory/<mall>.json + assets/maps/directory/*.webp, built by tools/build_directory.py.
// Fast travel (17 Nov 2026): the mall JSON's `fastTravel` spots show as buttons and map markers; clicking one
// teleports your own token there (same instant jump as the stairs).

import {MODULE, esc, modPath} from "./config.js";
import {fetchJSON} from "./data.js";
import {currentMallId, getPlayerToken, tokenTile, Hint, warpToken} from "./interact.js";
import {isDialogueOpen} from "./dialogue.js";
import {Sfx} from "./audio.js";
import {summonWalkerToTile} from "./gm-walker.js";
import {floorAt} from "./grid.js";

const {ApplicationV2} = foundry.applications.api;

const CAT_ICON = {
  "Clothing & Style": "fa-shirt", "Gear & Weapons": "fa-shield-halved", "Magic & Curios": "fa-hat-wizard",
  "Food & Drink": "fa-utensils", "Mounts & Travel": "fa-horse", "Home & Gifts": "fa-gift", "Fun & Games": "fa-dice",
  "Services": "fa-bell-concierge", "Arena": "fa-trophy", "Facilities": "fa-circle-info"
};
const MINOR = new Set(["Facilities"]);   // small dots on the map, listed last

export class DirectoryApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "maul-directory",
    classes: ["maul-app", "maul-directory", "maul-pixel"],
    tag: "div",
    window: {title: "Mall Directory", icon: "fas fa-map", resizable: true},
    position: {width: 980, height: 680},
    actions: {floor: DirectoryApp.#onFloor, pin: DirectoryApp.#onPin, travel: DirectoryApp.#onTravel}
  };

  /** Open (or bring forward) the directory for the mall on the current scene. */
  static async open({mallId = currentMallId(), floor} = {}) {
    if ( !mallId ) {
      ui.notifications.info("The Mall Directory works inside a mall.");
      return null;
    }
    const data = await fetchJSON(modPath(`data/directory/${mallId}.json`), {optional: true});
    if ( !data ) {
      ui.notifications.warn("Mall Explorer: this mall has no directory yet.");
      return null;
    }
    let app = foundry.applications.instances.get("maul-directory");
    if ( !app ) app = new DirectoryApp();
    app.data = data;
    app.here = DirectoryApp.#whereAmI(mallId);
    app.floor = floor ?? app.here?.floor ?? (app.floor && data.floors.some(f => f.id === app.floor) ? app.floor : data.floors[0]?.id);
    app.focus = null;
    await app.render({force: true});
    return app;
  }

  static #whereAmI(mallId) {
    if ( currentMallId() !== mallId || !Hint.ctx ) return null;
    const token = getPlayerToken();
    if ( !token ) return null;
    const t = tokenTile(token);
    return floorAt(Hint.ctx.layout, t.x, t.y);
  }

  get title() {
    return this.data ? `${this.data.name}: Mall Directory` : "Mall Directory";
  }

  async _prepareContext() {
    // Fast travel only for your own token, in the mall you're standing in
    const canTravel = !!(Hint.ctx && Hint.ctx.mall.id === this.data?.mall && currentMallId() === this.data?.mall
      && (getPlayerToken() || (game.user.isGM && game.user.character)));   // GM: summons the walker if it isn't here
    const spots = canTravel ? (Hint.ctx.mall.fastTravel ?? []) : [];
    return {data: this.data, floor: this.floor, here: this.here, focus: this.focus, spots};
  }

  async _renderHTML({data, floor, here, focus, spots = []}) {
    if ( !data ) return "<p>No directory.</p>";
    const F = data.floors.find(f => f.id === floor) ?? data.floors[0];
    const tabs = data.floors.map(f => `<button type="button" class="maul-dir-tab ${f.id === F.id ? "active" : ""}"
      data-action="floor" data-floor="${esc(f.id)}">${esc(shortFloor(f))}${here?.floor === f.id ? " <i class=\"fas fa-star\" title=\"You are here\"></i>" : ""}</button>`).join("");

    const onFloor = data.pins.map((p, i) => ({...p, i})).filter(p => p.floor === F.id);
    const pinHTML = onFloor.map(p => {
      const left = ((p.x + 0.5) / F.w) * 100;
      const top = ((p.y + 0.5) / F.h) * 100;
      const minor = MINOR.has(p.category);
      const tag = p.unit ? esc(p.unit) : `<i class="fas ${CAT_ICON[p.category] ?? "fa-circle"}"></i>`;
      const tip = `${p.name}${p.sells ? ` — ${p.sells}` : ""}`;
      return `<button type="button" class="maul-dir-pin ${minor ? "minor" : ""} cat-${slug(p.category)} ${focus === p.i ? "focus" : ""}"
        style="left:${left}%;top:${top}%" data-action="pin" data-pin="${p.i}" data-tooltip="${esc(tip)}">${minor ? "" : tag}</button>`;
    }).join("");
    const travelHTML = spots.length ? `<div class="maul-dir-travel"><span><i class="fas fa-person-running"></i> Fast travel:</span>
      ${spots.map(s => `<button type="button" class="maul-btn small" data-action="travel" data-spot="${esc(s.id)}"
        data-tooltip="${esc(`${s.name} (${s.floor})`)}">${esc(s.name)}</button>`).join("")}</div>` : "";
    const spotHTML = spots.filter(s => s.floor === F.id).map(s => `<button type="button" class="maul-dir-spot"
      style="left:${((s.x + 0.5) / F.w) * 100}%;top:${((s.y + 0.5) / F.h) * 100}%" data-action="travel" data-spot="${esc(s.id)}"
      data-tooltip="Fast travel: ${esc(s.name)}"><i class="fas fa-person-running"></i></button>`).join("");
    const youHTML = (here && here.floor === F.id)
      ? `<div class="maul-dir-you" style="left:${((here.x + 0.5) / F.w) * 100}%;top:${((here.y + 0.5) / F.h) * 100}%"
          data-tooltip="You are here"><i class="fas fa-star"></i></div>` : "";

    // Legend: every floor's places, grouped by category; this floor's entries first in each group
    // One row per place: a place on several floors (anchors, stairs, WCs) shows its pin on this floor if it has one
    const byName = new Map();
    for ( const [i, p] of data.pins.entries() ) {
      const prev = byName.get(p.name);
      if ( !prev || (prev.floor !== F.id && p.floor === F.id) ) byName.set(p.name, {...p, i});
    }
    const groups = new Map();
    for ( const p of byName.values() ) {
      if ( !groups.has(p.category) ) groups.set(p.category, []);
      groups.get(p.category).push(p);
    }
    const cats = [...(data.categories ?? []), ...[...groups.keys()].filter(c => !(data.categories ?? []).includes(c))];
    const legend = cats.filter(c => groups.has(c)).map(c => {
      const rows = groups.get(c)
        .sort((a, b) => (a.floor === F.id ? 0 : 1) - (b.floor === F.id ? 0 : 1) || String(a.unit ?? "~").localeCompare(String(b.unit ?? "~"), undefined, {numeric: true}))
        .map(p => `<li class="${p.floor === F.id ? "" : "other-floor"} ${focus === p.i ? "focus" : ""}" data-action="pin" data-pin="${p.i}">
          <span class="maul-dir-unit">${p.unit ? esc(p.unit) : ""}</span>
          <span class="maul-dir-name">${esc(p.name)}${p.floor === F.id ? "" : ` <span class="maul-dir-fl">${esc(p.floor)}</span>`}</span>
          ${p.sells ? `<span class="maul-dir-sells">${esc(p.sells)}</span>` : ""}
        </li>`).join("");
      return `<section class="maul-dir-cat cat-${slug(c)}"><h4><i class="fas ${CAT_ICON[c] ?? "fa-circle"}"></i> ${esc(c)}</h4><ul>${rows}</ul></section>`;
    }).join("");

    return `<div class="maul-dir">
      <nav class="maul-dir-tabs">${tabs}</nav>
      ${travelHTML}
      <div class="maul-dir-body">
        <div class="maul-dir-mapwrap"><div class="maul-dir-map" style="aspect-ratio:${F.w}/${F.h}">
          <img src="${esc(modPath(F.img))}" alt="${esc(F.name)}">${pinHTML}${spotHTML}${youHTML}
        </div><p class="maul-dir-floorname">${esc(F.name)}</p></div>
        <aside class="maul-dir-legend">${legend}</aside>
      </div>
      <p class="maul-dir-foot">M opens this map anywhere in the mall. Click a store to find it${spots.length ? ", or a running figure to fast travel there" : ""}.</p>
    </div>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    content.querySelector(".maul-dir-legend li.focus")?.scrollIntoView({block: "nearest"});
  }

  static async #onFloor(event, target) {
    this.floor = target.dataset.floor;
    this.focus = null;
    await this.render();
  }

  static async #onTravel(event, target) {
    const ctx = Hint.ctx;
    const spot = ctx?.mall?.fastTravel?.find(s => s.id === target.dataset.spot);
    const token = getPlayerToken();
    if ( !spot || isDialogueOpen() || currentMallId() !== ctx.mall.id ) return;
    if ( !token && !(game.user.isGM && game.user.character) ) return;
    await this.close();
    Sfx.confirm();
    if ( token ) await warpToken(token, ctx, {floor: spot.floor, x: spot.x, y: spot.y});
    else await summonWalkerToTile(ctx.layout, spot);
  }

  static async #onPin(event, target) {
    const i = Number(target.dataset.pin);
    const p = this.data?.pins[i];
    if ( !p ) return;
    this.floor = p.floor;
    this.focus = (this.focus === i) ? null : i;
    await this.render();
  }
}

function shortFloor(f) {
  return String(f.name ?? f.id).split(/\s+[—–-]\s+|:/)[0] || f.id;
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Interactables with `"directory": true` open the map after their text. */
export function maybeOpenDirectory(ia, ctx) {
  if ( !ia?.directory ) return;
  DirectoryApp.open({mallId: ctx?.mall?.id ?? currentMallId(), floor: ia.floor})
    .catch(err => console.error(`${MODULE} | directory failed`, err));
}
