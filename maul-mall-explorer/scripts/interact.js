// MAUL Mall Explorer: finding interactables next to the player's token, running them, and the
// on-canvas "!" hints that can also be clicked.

import {MODULE, OFFICE_FLAG, esc} from "./config.js";
import {getMallContext} from "./data.js";
import {chebyshev} from "./grid.js";
import {meetsRequirements, setFlags, markSeen, filterPages, isConcealed} from "./progress.js";
import {showDialogue, isDialogueOpen, showImage} from "./dialogue.js";
import {notifyGM} from "./notify.js";
import {getWeek} from "./week.js";
import {openShopFlow} from "./shop.js";
import {openLeylineFlow} from "./leyline.js";
import {tellGossip} from "./ambient.js";
import {Sfx} from "./audio.js";
import {displaceToken} from "./dnd.js";
import {Areas} from "./areas.js";
import {findHomeStore, bastionAvailable, runBastion} from "./bastion.js";
import {offerMeal} from "./meals.js";
import {offerStore} from "./store.js";
import {openMuseFlow} from "./muse.js";
import {openCoachFlow} from "./coach.js";
import {openSparFlow} from "./spar.js";
import {syncStandin, talkToStandin, openStandings, openWardrobe} from "./pc.js";
import {nextGossip} from "./ambient.js";
import {safe, pageText} from "./progress.js";
import {maybeOpenDirectory} from "./directory.js";

let busy = false;

/* -------------------------------------------- */
/*  Token + context helpers                     */
/* -------------------------------------------- */

export function currentMallId(scene = canvas?.scene) {
  return scene?.getFlag(MODULE, "mallId") ?? null;
}

/** The token this user walks around with: a controlled token they own, else their assigned character's token. */
export function getPlayerToken() {
  if ( !canvas?.ready ) return null;
  const controlled = canvas.tokens.controlled.find(t => t.document.isOwner);
  if ( controlled ) return controlled;
  const actor = game.user.character;
  if ( !actor ) return null;
  return actor.getActiveTokens(false, false).find(t => t.document?.parent === canvas.scene) ?? null;
}

/** Scene tile under the token's centre. */
export function tokenTile(token) {
  const gs = canvas.grid.size;
  const d = token.document;
  return {
    x: Math.floor((d.x + (d.width * gs) / 2) / gs),
    y: Math.floor((d.y + (d.height * gs) / 2) / gs)
  };
}

/** Is this entry something the player can currently interact with (shows a hint / responds to E)? */
function isAvailable(entry, week) {
  const ia = entry.ia;
  if ( entry.slot && week < entry.slot ) return false;     // booth not arrived yet (week = matches played)
  if ( isConcealed(ia) ) return false;                     // hidden and not noticed yet
  if ( ia.kind === "standin" && (entry.offDuty || (entry.token && entry.token === getPlayerToken())) ) return false;   // out of the store, or you
  if ( Areas.isLockedAt(entry.sx, entry.sy) ) return false; // inside a secret area this viewer hasn't found
  if ( meetsRequirements(ia.requires, week) ) return true;
  return Array.isArray(ia.lockedPages) && ia.lockedPages.length > 0;
}

/** Interactables within 1 tile (incl. diagonal) of the token, nearest first (on-tile, orthogonal, diagonal). */
export function findNearby(ctx, token) {
  if ( !ctx || !token ) return [];
  const {x, y} = tokenTile(token);
  const week = getWeek();
  for ( const e of ctx.entries ) if ( e.ia.kind === "standin" ) e.token = syncStandin(e);   // lines follow the real token
  return ctx.entries
    .filter(e => chebyshev(e.sx, e.sy, x, y) <= 1 && isAvailable(e, week))
    .map(e => ({entry: e, d: Math.abs(e.sx - x) + Math.abs(e.sy - y)}))
    .sort((a, b) => a.d - b.d)
    .map(o => o.entry);
}

/* -------------------------------------------- */
/*  Interact                                     */
/* -------------------------------------------- */

/** Keybinding handler. Returns true if the key press was used (so Space still pauses / measures otherwise). */
export function onInteractKey() {
  if ( isDialogueOpen() ) return true;
  if ( busy ) return false;
  const ctx = Hint.ctx;
  if ( !ctx || ctx.mall.id !== currentMallId() ) return false;
  const token = getPlayerToken();
  if ( !token ) return false;
  const near = findNearby(ctx, token);
  if ( !near.length ) return false;
  runInteraction(near[0], ctx, token);
  return true;
}

/** Pick the pages to show for this interactable this week. */
export function pickPages(ia, week) {
  let pages = filterPages(ia.weekPages?.[String(week)] ?? ia.pages ?? [], week);
  if ( ia.random && pages.length > 1 ) pages = [pages[Math.floor(Math.random() * pages.length)]];
  return pages;
}

export async function runInteraction(entry, ctx, token) {
  if ( busy || isDialogueOpen() ) return;
  busy = true;
  try {
    const ia = entry.ia;
    const week = getWeek();
    if ( isConcealed(ia) ) return;
    Sfx.confirm();
    const dlg = {speaker: ia.name, kind: ia.kind, sprite: ia.sprite, id: ia.id};

    if ( !meetsRequirements(ia.requires, week) ) {
      if ( ia.lockedPages?.length ) {
        await showDialogue({...dlg, pages: ia.lockedPages});
        await setFlags(ia.kind === "npc" ? [`met-${ia.id}`] : [], game.user, {kind: "talk", id: ia.id, name: ia.name ?? ia.id, locked: true});
      }
      return;
    }

    // Directory signs: straight to the map, no store list read out first (Zak, 17 Nov 2026)
    if ( ia.directory ) {
      await applyEffects(ia, ctx, token, true);
      maybeOpenDirectory(ia, ctx);
      return;
    }

    if ( ia.kind === "shop" ) {
      await openShopFlow({entry, ctx, token, pages: pickPages(ia, week)});
      return;
    }

    if ( ia.kind === "leyline" ) {
      await openLeylineFlow({entry, ctx, token, pages: pickPages(ia, week)});
      return;
    }

    if ( ia.kind === "standin" ) {
      await talkToStandin(entry);
      return;
    }

    if ( ia.kind === "standings" ) {
      await openStandings(entry, pickPages(ia, week));
      return;
    }

    if ( ia.kind === "wardrobe" ) {
      await openWardrobe(entry, pickPages(ia, week));
      return;
    }

    if ( ia.kind === "coach" ) {
      await openCoachFlow({entry, ctx, pages: pickPages(ia, week)});
      return;
    }

    if ( ia.kind === "spar" ) {
      await openSparFlow({entry, ctx, pages: pickPages(ia, week)});
      return;
    }

    if ( ia.kind === "muse" ) {
      await openMuseFlow({entry, ctx, pages: pickPages(ia, week)});
      return;
    }

    // Your own store's coworker: the weekly Bastion turn replaces the normal chat (until it's used this week)
    if ( ia.kind === "npc" && bastionAvailable(ctx.mall, ia) ) {
      await runBastion({ia, ctx, home: findHomeStore(ctx.mall, ia)});
      await applyEffects(ia, ctx, token, false);
      if ( ia.store ) await offerStore(ia, ctx);
      return;
    }

    // Pacing (SPEC 17): from the 3rd talk with the same NPC in a week, they share any rumour still due, else brush you off
    if ( ia.kind === "npc" ) {
      const visits = await bumpTalks(ia.id, week);
      if ( visits >= 3 ) {
        if ( nextGossip(ctx.mall, ia.id, week) ) await tellGossip(ctx.mall, ia, week, showDialogue);
        else await showDialogue({...dlg, pages: [brushoff(ia, visits)]});
        if ( ia.meal ) await offerMeal(ia, {quietIfUsed: true});
        if ( ia.store ) await offerStore(ia, ctx);          // brush-offs never block browsing
        return;
      }
    }

    const {completed} = await showDialogue({...dlg, pages: pickPages(ia, week)});
    await applyEffects(ia, ctx, token, completed);
    if ( completed && ia.kind === "npc" ) await tellGossip(ctx.mall, ia, week, showDialogue);
    if ( completed && ia.image ) showImage(ia.image, {title: ia.name, id: ia.id});
    if ( completed && ia.meal ) await offerMeal(ia);
    if ( completed && ia.store ) await offerStore(ia, ctx);
    if ( completed ) maybeOpenDirectory(ia, ctx);
  } catch(err) {
    console.error(`${MODULE} | interaction failed`, err);
  } finally {
    busy = false;
    Hint.refresh();
  }
}

const DEFAULT_BRUSHOFFS = [
  "Isn't there someone else you could be bothering?",
  "We've covered this, love.",
  "GUARDS! ...Kidding. Mostly. Shoo."
];

/** Count this week's talks with an NPC (per user = per character). Returns the count including this one. */
async function bumpTalks(id, week) {
  const key = `talkPace.${safe(id)}`;
  const r = game.user.getFlag(MODULE, key);
  const n = (r?.w === week ? (Number(r.n) || 0) : 0) + 1;
  await game.user.setFlag(MODULE, key, {w: week, n});
  return n;
}

/** Escalating brush-off: 3rd talk -> line 1, 4th -> line 2, 5th+ -> last line. Never sets flags. */
function brushoff(ia, visits) {
  const own = (Array.isArray(ia.brushoffs) ? ia.brushoffs : []).map(pageText).filter(Boolean);
  const lines = own.length ? own : DEFAULT_BRUSHOFFS;
  return lines[Math.min(visits - 3, lines.length - 1)];
}

async function applyEffects(ia, ctx, token, completed) {
  const sets = [...(ia.sets ?? [])];
  if ( ia.kind === "office" && !sets.includes(OFFICE_FLAG) ) sets.push(OFFICE_FLAG);
  if ( ia.kind === "npc" ) sets.push(`met-${ia.id}`);       // knowledge-aware text: "you've met them"
  const kind = (ia.warp && completed) ? "move" : "talk";     // stairs/lifts: routine (only trips between malls are "warp")
  const fresh = await setFlags(sets, game.user, {kind, id: ia.id, name: ia.name ?? ia.id});
  const first = await markSeen(ia.id);

  if ( ia.notifyGM && (first || fresh.length) ) {
    const who = game.user.character?.name ? `${game.user.name} (${game.user.character.name})` : game.user.name;
    const mallName = ctx.mall.name ?? ctx.mall.id;
    const isOffice = ia.kind === "office" || fresh.includes(OFFICE_FLAG);
    const text = isOffice
      ? `\u{1F5DD}️ ${who} found the secret office at ${mallName}!`
      : `\u{1F514} ${who} triggered "${ia.name ?? ia.id}" at ${mallName}.`;
    const html = `<div class="maul-chat-card"><h3>${isOffice ? "Secret office found!" : "Mall Explorer"}</h3>
      <p><strong>${esc(who)}</strong> ${isOffice ? "found the secret office" : `triggered <em>${esc(ia.name ?? ia.id)}</em>`}
      at <strong>${esc(mallName)}</strong>.</p>
      ${fresh.length ? `<p class="maul-flags">Flags set: ${fresh.map(esc).join(", ")}</p>` : ""}</div>`;
    await notifyGM({text, html, important: isOffice});
  }

  if ( completed && ia.warp ) await warpToken(token, ctx, ia.warp);
}

/** Teleport the token to a floor-local tile (direct document update, no animation). */
export async function warpToken(token, ctx, warp) {
  const L = ctx.layout.floors?.[warp.floor];
  if ( !L ) {
    ui.notifications.warn(`Mall Explorer: warp target floor "${warp.floor}" not found.`);
    return;
  }
  const gs = canvas.grid.size;
  const x = (L.ox + warp.x) * gs;
  const y = (L.oy + warp.y) * gs;
  await displaceToken(token.document, {x, y});
  canvas.animatePan({x: x + gs / 2, y: y + gs / 2, duration: 250});
}

/* -------------------------------------------- */
/*  Hints ("!" over interactables within reach) */
/* -------------------------------------------- */

export const Hint = {
  container: null,
  lastNearby: [],
  ctx: null,
  _pending: false,
  _tick: null,

  /** Set up for the mall context main.js loaded for this canvas (null = not a mall scene). */
  onCanvasReady(ctx) {
    this.teardown();
    this.ctx = ctx ?? null;
    this.lastNearby = [];
    if ( !this.ctx ) return;
    this.container = new PIXI.Container();
    this.container.eventMode = "none";
    canvas.interface.addChild(this.container);
    this._tick = () => {
      if ( !this.container || this.container.destroyed ) return;
      const t = performance.now() / 1000;
      for ( const c of this.container.children ) {
        c.alpha = 0.55 + 0.45 * Math.sin(t * 4);
        const bang = c.getChildByName?.("bang");
        if ( bang ) bang.y = c.baseY - 6 - Math.abs(Math.sin(t * 3)) * 6;
      }
    };
    canvas.app.ticker.add(this._tick);
    this.refresh();
  },

  teardown() {
    if ( this._tick ) canvas?.app?.ticker?.remove(this._tick);
    this._tick = null;
    if ( this.container && !this.container.destroyed ) this.container.destroy({children: true});
    this.container = null;
    this._key = null;
  },

  /** Debounced redraw (called on token refresh, week change, flag change). */
  refresh() {
    if ( this._pending ) return;
    this._pending = true;
    requestAnimationFrame(() => {
      this._pending = false;
      this.draw();
    });
  },

  draw() {
    if ( !this.container || this.container.destroyed || !this.ctx ) return;
    const token = getPlayerToken();
    this.lastNearby = token ? findNearby(this.ctx, token) : [];
    const show = game.settings.get(MODULE, "showHints");
    // refreshToken fires every animation frame: only rebuild the PIXI.Text hints when what's hinted actually changed
    const key = show ? this.lastNearby.map(e => `${e.ia.id}@${e.sx},${e.sy}`).join("|") : "";
    if ( key === this._key && this.container.children.length === (show ? this.lastNearby.length : 0) ) return;
    this._key = key;
    this.container.removeChildren().forEach(c => c.destroy({children: true}));
    if ( !show ) return;
    const gs = canvas.grid.size;
    for ( const e of this.lastNearby ) {
      const c = new PIXI.Container();
      const g = new PIXI.Graphics();
      g.lineStyle(4, 0xffe14d, 1).drawRect(e.sx * gs + 2, e.sy * gs + 2, gs - 4, gs - 4);
      c.addChild(g);
      const bang = new PIXI.Text("!", {fontFamily: "monospace", fontSize: 34, fontWeight: "bold", fill: 0xffffff,
        stroke: 0x000000, strokeThickness: 6});
      bang.name = "bang";
      bang.anchor.set(0.5, 1);
      bang.x = e.sx * gs + gs / 2;
      c.baseY = e.sy * gs;
      bang.y = c.baseY - 6;
      c.addChild(bang);
      this.container.addChild(c);
    }
  },

  /** Which hinted entry (if any) is at this canvas point? */
  entryAt(point) {
    const gs = canvas.grid.size;
    const tx = Math.floor(point.x / gs);
    const ty = Math.floor(point.y / gs);
    return this.lastNearby.find(e => e.sx === tx && e.sy === ty) ?? null;
  }
};

/**
 * Click-to-interact: a capture-phase pointer listener on the canvas element so that a click on a hinted
 * tile triggers it without Foundry also treating it as a "click on empty canvas" (which would release the token).
 */
export function registerCanvasClick() {
  document.addEventListener("pointerdown", ev => {
    if ( ev.button !== 0 || !canvas?.ready ) return;
    if ( ev.target !== canvas.app?.view ) return;
    if ( !Hint.lastNearby.length || isDialogueOpen() ) return;
    const point = canvas.canvasCoordinatesFromClient({x: ev.clientX, y: ev.clientY});
    const entry = Hint.entryAt(point);
    if ( !entry ) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const token = getPlayerToken();
    if ( token && Hint.ctx ) runInteraction(entry, Hint.ctx, token);
  }, {capture: true});
}
