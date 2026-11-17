// MAUL Mall Explorer: the player notebook (notes, feedback and store change requests; SPEC 21, notebook SPEC 25).
// Key J (anyone, anywhere), the "your store" chip and the Bastion menu open the Notebook window. A note is about a
// target (where I stand, a spot / person / thing picked on the map, a store, an item, or nothing in particular), has a
// category and text, and records who, where and when. Players can't create world documents, so a note is put in the
// player's own user flags (`pendingFeedback.<id>`); the active GM's client picks it up straight away (or when a GM next
// connects), appends it to the world setting `feedback` and as a page of the GM-only journal "MAUL: Feedback & Requests",
// then clears it from the player's flags. The notebook lists the player's own notes from both places.

import {MODULE, esc, modPath} from "./config.js";
import {chebyshev, floorAt, toSceneTile} from "./grid.js";
import {logEvent, isConcealed, hasFlag} from "./progress.js";
import {getWeek} from "./week.js";
import {findHomeStoreFor} from "./bastion.js";
import {DEL} from "./dnd.js";
import {fetchJSON} from "./data.js";
import {Areas} from "./areas.js";
import {getJournal, saveJournalDoc, addOfftime, deleteOfftime, myHomeStore} from "./journal.js";
import {recordWriting} from "./writings.js";
import {LIMITS, attachCounters, withinLimits} from "./counter.js";
import {CoworkersApp} from "./coworkers.js";

const {ApplicationV2} = foundry.applications.api;
const JOURNAL_NAME = "MAUL: Feedback & Requests";
const STORE_RADIUS = 6;

/** Note categories: [value, label]. The store ones (layout..sign) are the old store change request list. */
const CATEGORIES = [
  ["idea", "Idea"], ["problem", "Something's wrong / a bug"], ["wording", "Wording / typo"], ["lore", "Lore / a question"],
  ["layout", "Store: layout"], ["stock", "Store: stock"], ["decor", "Store: decor"], ["staff", "Store: staff"],
  ["sign", "Store: sign"], ["other", "Other"]
];
const CAT_LABEL = Object.fromEntries(CATEGORIES);
const PEOPLE = new Set(["npc", "coach", "standin", "spar"]);

/* -------------------------------------------- */
/*  Where am I?                                 */
/* -------------------------------------------- */

let currentCtx = null;
let currentToken = null;
/** main.js keeps these current (canvas ready / own token moved). */
export function setFeedbackContext(ctx, token) {
  currentCtx = ctx ?? null;
  currentToken = token ?? null;
}

function tileOf(token) {
  if ( !token?.document || !canvas?.ready ) return null;
  const gs = canvas.grid.size;
  const d = token.document;
  return {x: Math.floor((d.x + d.width * gs / 2) / gs), y: Math.floor((d.y + d.height * gs / 2) / gs)};
}

/** The user's own store if their token is in it: the homeStores `area` if given, else within 6 tiles of the coworker. */
export function ownStoreAt(ctx, tile) {
  if ( !ctx || !tile ) return null;
  const home = findHomeStoreFor(ctx.mall, game.user);
  if ( !home ) return null;
  const a = home.area;
  if ( a && Number.isFinite(a.x) ) {
    const o = toSceneTile(ctx.layout, a.floor, a.x, a.y);
    if ( o && tile.x >= o.x && tile.y >= o.y && tile.x < o.x + (a.w ?? 1) && tile.y < o.y + (a.h ?? 1) ) return home;
    return null;
  }
  const npc = ctx.entries.find(e => e.ia.id === home.npc);
  return npc && chebyshev(npc.sx, npc.sy, tile.x, tile.y) <= STORE_RADIUS ? home : null;
}

/** Nearest store sign (layout label) on this floor-local tile's floor, within `range` tiles. */
function labelNear(ctx, where, range = 99) {
  if ( !ctx || !where ) return null;
  let best = Infinity, label = null;
  for ( const l of ctx.layout?.labels ?? [] ) {
    if ( l.floor !== where.floor ) continue;
    const d = chebyshev(l.x, l.y, where.x, where.y);
    if ( d < best && d <= range ) { best = d; label = {text: l.text, dist: d}; }
  }
  return label;
}

function captureContext(ctx, token) {
  const tile = tileOf(token);
  const where = tile && ctx ? floorAt(ctx.layout, tile.x, tile.y) : null;
  let nearest = null;
  if ( tile && ctx ) {
    let best = Infinity;
    for ( const e of ctx.entries ) {
      const d = chebyshev(e.sx, e.sy, tile.x, tile.y);
      if ( d < best ) { best = d; nearest = {id: e.ia.id, name: e.ia.name ?? e.ia.id, dist: d}; }
    }
  }
  return {
    user: game.user.name, userId: game.user.id, character: game.user.character?.name ?? null,
    table: game.user.getFlag(MODULE, "table") || null,
    mall: ctx?.mall?.id ?? null, mallName: ctx?.mall?.name ?? null, scene: canvas?.scene?.name ?? null,
    floor: where?.floor ?? null, x: where?.x ?? null, y: where?.y ?? null,
    nearest, label: labelNear(ctx, where), week: getWeek(), time: new Date().toISOString(), t: Date.now()
  };
}

/* -------------------------------------------- */
/*  Targets                                     */
/* -------------------------------------------- */

/** Can this viewer see this interactable right now? (Never let a note target give away a hidden thing.) */
function visibleEntry(e, week) {
  if ( game.user.isGM ) return true;
  if ( e.slot && week < e.slot ) return false;
  if ( e.ia.kind === "standin" && e.offDuty ) return false;
  if ( isConcealed(e.ia) ) return false;
  return !Areas.isLockedAt(e.sx, e.sy);
}

/** The name a player sees: people they haven't met stay anonymous (Zak still gets the real name and id). */
function shownName(ia) {
  if ( PEOPLE.has(ia.kind) && ia.kind !== "standin" && !game.user.isGM && !hasFlag(`met-${ia.id}`) ) return "someone you haven't met yet";
  return ia.name ?? ia.id;
}

/**
 * What's at this scene tile? An interactable on it (else one next to it, people first), a token on it, else the spot.
 * @returns {object} target {type, id, name, shown, iaKind, mall, mallName, floor, x, y, place}
 */
function targetAtTile(ctx, sx, sy, {radius = 1} = {}) {
  const where = ctx ? floorAt(ctx.layout, sx, sy) : null;
  const base = {mall: ctx?.mall?.id ?? null, mallName: ctx?.mall?.name ?? null, scene: canvas?.scene?.name ?? null,
    floor: where?.floor ?? null, x: where?.x ?? null, y: where?.y ?? null, place: labelNear(ctx, where, 6)?.text ?? null};
  const week = getWeek();
  let best = null, bestScore = Infinity;
  for ( const e of ctx?.entries ?? [] ) {
    const d = chebyshev(e.sx, e.sy, sx, sy);
    if ( d > radius || !visibleEntry(e, week) ) continue;
    const score = d * 10 + (PEOPLE.has(e.ia.kind) ? 0 : 1);
    if ( score < bestScore ) { bestScore = score; best = e; }
  }
  const gs = canvas.grid.size;
  const tok = canvas.tokens?.placeables?.find(t => t.visible && !t.document.hidden
    && Math.floor((t.document.x + t.document.width * gs / 2) / gs) === sx
    && Math.floor((t.document.y + t.document.height * gs / 2) / gs) === sy);
  if ( best && (bestScore < 10 || !tok) ) {
    const ia = best.ia;
    return {...base, type: PEOPLE.has(ia.kind) ? "npc" : "thing", id: ia.id, iaKind: ia.kind ?? null,
      name: ia.name ?? ia.id, shown: shownName(ia)};
  }
  if ( tok ) return {...base, type: "character", id: tok.document.actorId ?? tok.id, name: tok.document.name, shown: tok.document.name};
  return {...base, type: "spot", id: null, name: null, shown: null};
}

function hereTarget() {
  const tile = tileOf(currentToken);
  if ( !currentCtx || !tile ) return {type: "general", shown: null};
  const t = targetAtTile(currentCtx, tile.x, tile.y, {radius: 1});
  return t.type === "character" ? {...t, type: "spot", id: null, name: null, shown: null} : {...t, here: true};
}

/** One-line description of a target, for the player and for Zak. */
function targetLabel(t, {forGM = false} = {}) {
  if ( !t || t.type === "general" ) return "General note";
  if ( t.type === "store" ) return `Store: ${t.name}`;
  if ( t.type === "item" ) return `Item: ${t.name}`;
  const who = forGM ? t.name : (t.shown ?? t.name);
  const at = [t.mallName ?? t.mall, t.floor, Number.isFinite(t.x) ? `${t.x},${t.y}` : null].filter(Boolean).join(" ");
  const near = t.place ? ` by ${t.place}` : "";
  if ( t.type === "npc" ) return `${who}${forGM && t.id ? ` [${t.id}]` : ""} (${at}${near})`;
  if ( t.type === "thing" ) return `${who}${forGM && t.id ? ` [${t.id}]` : ""} (${at}${near})`;
  if ( t.type === "character" ) return `${who} (${at})`;
  return `${t.here ? "Where I stand" : "A spot"}: ${at || "not on a mall map"}${near}`;
}

/* -------------------------------------------- */
/*  Pick on the map                             */
/* -------------------------------------------- */

let picking = null;   // {resolve}

/** Let the player click a tile / sprite on the canvas. Resolves with a target, or null if cancelled. */
function pickOnMap() {
  if ( picking ) return Promise.resolve(null);
  return new Promise(resolve => {
    const banner = document.createElement("div");
    banner.id = "maul-pick-banner";
    banner.className = "maul-pixel";
    banner.innerHTML = `Click a spot, a person or a thing on the map. <button type="button">Cancel (Esc)</button>`;
    document.body.appendChild(banner);
    document.body.classList.add("maul-picking");
    const finish = target => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("contextmenu", onMenu, true);
      banner.remove();
      document.body.classList.remove("maul-picking");
      picking = null;
      resolve(target);
    };
    // window capture runs before the document-level click-to-interact listener, so a pick never also triggers an NPC
    const onDown = ev => {
      if ( banner.contains(ev.target) ) { ev.preventDefault(); finish(null); return; }
      if ( ev.target !== canvas?.app?.view ) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if ( ev.button !== 0 ) { finish(null); return; }
      const p = canvas.canvasCoordinatesFromClient({x: ev.clientX, y: ev.clientY});
      const gs = canvas.grid.size;
      finish(targetAtTile(currentCtx, Math.floor(p.x / gs), Math.floor(p.y / gs), {radius: 0}));
    };
    const onKey = ev => {
      if ( ev.key !== "Escape" ) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      finish(null);
    };
    const onMenu = ev => { if ( ev.target === canvas?.app?.view ) ev.preventDefault(); };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("contextmenu", onMenu, true);
    picking = {resolve: finish};
  });
}

/* -------------------------------------------- */
/*  The notebook window                         */
/* -------------------------------------------- */

/** This user's notes: delivered ones from the world setting, plus any still waiting for a GM. Newest first. */
function myNotes() {
  const sent = (game.settings.get(MODULE, "feedback") ?? []).filter(n => n?.userId === game.user.id);
  const pending = Object.values(game.user.getFlag(MODULE, "pendingFeedback") ?? {}).filter(n => n?.id)
    .map(n => ({...n, pending: true}));
  const ids = new Set(sent.map(n => n.id));
  return sent.concat(pending.filter(n => !ids.has(n.id)))
    .sort((a, b) => noteTime(b) - noteTime(a));
}
const noteTime = n => Number(n?.t) || Date.parse(n?.time ?? "") || 0;

export class NotebookApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "maul-notebook",
    classes: ["maul-app", "maul-notebook", "maul-pixel"],
    tag: "div",
    window: {title: "Notebook", icon: "fas fa-book", resizable: true},
    position: {width: 540, height: 640},
    actions: {target: NotebookApp.#onTarget, send: NotebookApp.#onSend, nbTab: NotebookApp.#onTab,   /* not "tab": reserved by ApplicationV2 */
      saveJournal: NotebookApp.#onSaveJournal, addOfftime: NotebookApp.#onAddOfftime, delOfftime: NotebookApp.#onDelOfftime,
      coworkers: NotebookApp.#onCoworkers}
  };

  tab = "notes";                                   // "notes" (for Zak) | "journal" (my shop, my character, off-time)
  jdraft = {shop: null, character: null, offtime: ""};

  mode = "here";
  target = null;
  draft = {text: "", category: "", store: "", item: ""};
  stores = [];

  /** Open (or bring forward). `home` = the user's own store (pre-selects it as the target, category "layout" etc.). */
  static async open({home, tab} = {}) {
    let app = foundry.applications.instances.get("maul-notebook");
    const fresh = !app;
    if ( !app ) app = new NotebookApp();
    if ( tab ) app.tab = tab;
    else if ( home ) app.tab = "notes";
    app.myHome = await myHomeStore().catch(() => null);
    home ??= ownStoreAt(currentCtx, tileOf(currentToken));
    if ( home ) {
      app.mode = "store";
      app.draft.store = home.store ?? "";
      app.home = home;
    } else if ( fresh || app.mode === "here" ) {
      app.mode = "here";
      app.target = hereTarget();
    }
    app.stores = await storeNames(currentCtx);
    if ( app.draft.store && !app.stores.includes(app.draft.store) ) app.stores.unshift(app.draft.store);
    await app.render({force: true});
    app.bringToFront?.();
    return app;
  }

  static refresh() {
    const app = foundry.applications.instances.get("maul-notebook");
    if ( !app?.rendered || picking ) return;
    app.syncDraft();                      // keep what they're typing when a note arrives / is delivered
    app.render();
  }

  syncDraft() {
    this.#readDraft();
  }

  #readDraft() {
    const el = this.element;
    if ( !el ) return;
    const v = sel => el.querySelector(sel)?.value;
    this.draft.text = String(v("[name=text]") ?? this.draft.text);
    this.draft.category = v("[name=category]") ?? this.draft.category;
    this.draft.store = v("[name=store]") ?? this.draft.store;
    this.draft.item = v("[name=item]") ?? this.draft.item;
    this.jdraft.shop = v("[name=jshop]") ?? this.jdraft.shop;
    this.jdraft.character = v("[name=jcharacter]") ?? this.jdraft.character;
    this.jdraft.offtime = v("[name=joff]") ?? this.jdraft.offtime;
  }

  /** The target the note will be saved with, from the current mode. */
  #currentTarget() {
    const where = {mall: currentCtx?.mall?.id ?? null, mallName: currentCtx?.mall?.name ?? null};
    switch ( this.mode ) {
      case "store": return this.draft.store ? {type: "store", ...where, name: this.draft.store,
        id: this.home && this.home.store === this.draft.store ? (this.home.id ?? null) : null} : null;
      case "item": return this.draft.item.trim() ? {type: "item", ...where, name: this.draft.item.trim()} : null;
      case "general": return {type: "general"};
      default: return this.target;
    }
  }

  async _renderHTML() {
    const tabs = `<nav class="maul-nb-tabs">
        <button type="button" class="maul-btn small ${this.tab === "notes" ? "active" : ""}" data-action="nbTab" data-tab="notes"><i class="fas fa-paper-plane"></i> Notes for Zak</button>
        <button type="button" class="maul-btn small ${this.tab === "journal" ? "active" : ""}" data-action="nbTab" data-tab="journal"><i class="fas fa-book-open"></i> My journal</button>
      </nav>`;
    return tabs + (this.tab === "journal" ? this.#journalHTML() : this.#notesHTML());
  }

  #journalHTML() {
    const j = getJournal();
    const docArea = (doc, title, hint) => `<section class="maul-nb-jdoc"><h3>${title}</h3>
        ${j[doc]?.t ? `<p class="maul-dim">Last saved ${esc(new Date(j[doc].t).toISOString().slice(0, 10))}</p>` : ""}
        <textarea name="j${doc}" data-max="${LIMITS.long}" rows="6" placeholder="${esc(hint)}">${esc(this.jdraft[doc] ?? j[doc]?.text ?? "")}</textarea></section>`;
    const entries = j.offtime.length ? j.offtime.map(e => `<li>
        <div class="maul-nb-meta">${esc(new Date(e.t).toISOString().slice(0, 10))} · week ${esc(e.week ?? "?")}
          <button type="button" class="maul-nb-del" data-action="delOfftime" data-key="${esc(e.key)}" data-tooltip="Delete this entry"><i class="fas fa-trash"></i></button></div>
        <div class="maul-nb-text">${esc(e.text).replace(/\n/g, "<br>")}</div></li>`).join("") : `<li class="maul-dim">No entries yet.</li>`;
    const cw = this.myHome ? `<p><button type="button" class="maul-btn small" data-action="coworkers"><i class="fas fa-people-group"></i>
        Coworkers at ${esc(this.myHome.home.store ?? "my store")}</button> <span class="maul-dim">describe them, swap their sprites</span></p>` : "";
    return `<section class="maul-nb-journal">
        <p class="maul-dim">Your own space: write whenever you like. Zak reads it, and it's copied into your journal entry
          "MAUL Journal: ${esc(game.user.character?.name ?? game.user.name)}" (only you and Zak can see it).</p>
        ${cw}
        ${docArea("shop", "My shop", "What your shop is like, what you want it to be, plans, staff, stock...")}
        ${docArea("character", "My character", "Who they are, what they want, what's changed lately...")}
        <div class="maul-nb-send"><span></span><button type="button" class="maul-btn" data-action="saveJournal"><i class="fas fa-floppy-disk"></i> Save</button></div>
        <section><h3>What I've been up to</h3>
          <textarea name="joff" data-max="${LIMITS.long}" rows="4" placeholder="Off-time between sessions: where you went, who you saw, what you did...">${esc(this.jdraft.offtime ?? "")}</textarea>
          <div class="maul-nb-send"><span></span><button type="button" class="maul-btn" data-action="addOfftime"><i class="fas fa-plus"></i> Add entry</button></div>
          <ul class="maul-nb-list">${entries}</ul></section>
      </section>`;
  }

  #notesHTML() {
    const t = this.#currentTarget();
    const canPick = !!currentCtx && canvas?.ready;
    const modeBtn = (mode, icon, label, {disabled = false, tip = ""} = {}) => `<button type="button" class="maul-btn small ${this.mode === mode ? "active" : ""}"
      data-action="target" data-mode="${mode}" ${disabled ? "disabled" : ""} ${tip ? `data-tooltip="${esc(tip)}"` : ""}><i class="fas ${icon}"></i> ${label}</button>`;
    const items = [...new Set((game.user.character?.items ?? []).map(i => i.name))].sort();
    let picker = "";
    if ( this.mode === "store" ) {
      picker = `<select name="store"><option value="">(pick a store)</option>${this.stores.map(s =>
        `<option value="${esc(s)}" ${s === this.draft.store ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>`;
    } else if ( this.mode === "item" ) {
      picker = `<input type="text" name="item" list="maul-nb-items" data-max="${LIMITS.short}" placeholder="Item name (yours, or one you saw)"
        value="${esc(this.draft.item)}"><datalist id="maul-nb-items">${items.map(n => `<option value="${esc(n)}">`).join("")}</datalist>`;
    }
    const cats = CATEGORIES.map(([v, l]) => `<option value="${v}" ${v === this.draft.category ? "selected" : ""}>${esc(l)}</option>`).join("");
    const notes = myNotes();
    const list = notes.length ? notes.map(n => `<li>
        <div class="maul-nb-meta">${esc(String(n.time ?? "").slice(0, 10))} · week ${esc(n.week ?? "?")}${n.category ? ` · ${esc(CAT_LABEL[n.category] ?? n.category)}` : ""}
          <span class="maul-nb-status ${n.pending ? "pending" : ""}">${n.pending ? "waiting for Zak to come online" : "sent"}</span></div>
        <div class="maul-nb-about">${esc(targetLabel(n.target ?? legacyTarget(n)))}</div>
        <div class="maul-nb-text">${esc(n.text).replace(/\n/g, "<br>")}</div></li>`).join("")
      : `<li class="maul-dim">No notes yet.</li>`;
    return `<section class="maul-nb-new">
        <h3>New note</h3>
        <div class="maul-nb-modes">
          ${modeBtn("here", "fa-location-dot", "Where I stand", {disabled: !currentToken, tip: "The spot your token is on, and what's next to it"})}
          ${modeBtn("pick", "fa-crosshairs", "Pick on map", {disabled: !canPick, tip: canPick ? "Click a tile, a person or a thing" : "Works inside a mall"})}
          ${modeBtn("store", "fa-store", "A store")}
          ${modeBtn("item", "fa-box-open", "An item")}
          ${modeBtn("general", "fa-pen", "General")}
        </div>
        <p class="maul-nb-target"><strong>About:</strong> ${t ? esc(targetLabel(t)) : `<em>${this.mode === "pick" ? "nothing picked yet" : "choose one below"}</em>`}</p>
        ${picker ? `<div class="maul-nb-picker">${picker}</div>` : ""}
        <select name="category"><option value="">(category, optional)</option>${cats}</select>
        <textarea name="text" data-max="${LIMITS.long}" rows="5" placeholder="What would you like Zak to know?">${esc(this.draft.text)}</textarea>
        <div class="maul-nb-send"><span class="maul-dim">Only Zak reads these.</span>
          <button type="button" class="maul-btn" data-action="send"><i class="fas fa-paper-plane"></i> Send to Zak</button></div>
      </section>
      <section class="maul-nb-mine"><h3>My notes (${notes.length})</h3><ul class="maul-nb-list">${list}</ul></section>`;
  }

  static async #onTab(event, button) {
    this.#readDraft();
    this.tab = button.dataset.tab === "journal" ? "journal" : "notes";
    await this.render();
  }

  static async #onSaveJournal() {
    this.#readDraft();
    if ( !withinLimits([["My shop", this.jdraft.shop, LIMITS.long], ["My character", this.jdraft.character, LIMITS.long]]) ) return;
    let saved = 0;
    try {
      for ( const doc of ["shop", "character"] ) {
        if ( this.jdraft[doc] === null ) continue;
        if ( await saveJournalDoc(doc, this.jdraft[doc]) ) saved++;
        this.jdraft[doc] = null;
      }
    } catch(err) {
      console.error(`${MODULE} | saving the journal failed`, err);
      return ui.notifications.error("Mall Explorer: your journal couldn't be saved. Copy your text somewhere safe and tell Zak.");
    }
    ui.notifications.info(saved ? "Journal saved." : "Nothing new to save.");
    await this.render();
  }

  static async #onAddOfftime() {
    this.#readDraft();
    if ( !String(this.jdraft.offtime ?? "").trim() ) return ui.notifications.warn("Write something first.");
    if ( !withinLimits([["This entry", this.jdraft.offtime, LIMITS.long]]) ) return;
    try {
      if ( await addOfftime(this.jdraft.offtime) ) this.jdraft.offtime = "";
    } catch(err) {
      console.error(`${MODULE} | saving the journal entry failed`, err);
      return ui.notifications.error("Mall Explorer: the entry couldn't be saved. Copy it somewhere safe and tell Zak.");
    }
    await this.render();
  }

  static async #onDelOfftime(event, button) {
    this.#readDraft();
    const ok = await foundry.applications.api.DialogV2.confirm({window: {title: "Delete entry?"},
      content: "<p>Delete this entry from your journal?</p>", rejectClose: false, modal: true});
    if ( !ok ) return;
    await deleteOfftime(button.dataset.key);
    await this.render();
  }

  static async #onCoworkers() {
    this.#readDraft();
    if ( this.myHome ) await CoworkersApp.open(this.myHome);
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    attachCounters(content);                         // live "n / 10,000" once they get near a cap
  }

  static async #onTarget(event, button) {
    this.#readDraft();
    const mode = button.dataset.mode;
    if ( mode === "pick" ) {
      this.element.style.display = "none";
      try {
        const picked = await pickOnMap();
        if ( picked ) { this.mode = "pick"; this.target = picked; }
      } finally {
        if ( this.element ) this.element.style.display = "";
      }
    } else {
      this.mode = mode;
      if ( mode === "here" ) this.target = hereTarget();
    }
    await this.render();
  }

  static async #onSend() {
    this.#readDraft();
    const text = this.draft.text.trim();             // full length, never cut (SPEC 28)
    const target = this.#currentTarget();
    if ( !text ) return ui.notifications.warn("Write something first.");
    if ( !withinLimits([["Your note", text, LIMITS.long], ["The item name", this.mode === "item" ? this.draft.item : "", LIMITS.short]]) ) return;
    if ( !target ) return ui.notifications.warn(this.mode === "pick" ? "Pick something on the map first (or choose General)."
      : this.mode === "store" ? "Pick a store first." : "Name the item first.");
    const storeTarget = target.type === "store" ? target : null;
    const note = {
      id: foundry.utils.randomID(),
      ...captureContext(currentCtx, currentToken),
      target,
      store: storeTarget ? {id: storeTarget.id ?? null, name: storeTarget.name} : null,
      category: this.draft.category || null,
      text
    };
    if ( await submitNote(note) ) {
      this.draft.text = "";
      this.draft.category = "";
      await this.render();
    }
  }
}

/** Store names for the "A store" list: this mall's directory (else the mall's store signs). */
async function storeNames(ctx) {
  if ( !ctx ) return [];
  const dir = await fetchJSON(modPath(`data/directory/${ctx.mall.id}.json`), {optional: true}).catch(() => null);
  const names = (dir?.pins ?? []).filter(p => p.category !== "Facilities").map(p => p.name);
  const fallback = (ctx.layout?.labels ?? []).map(l => l.text);
  return [...new Set((names.length ? names : fallback).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** Notes from before the notebook had no `target`: rebuild one from the store / position fields. */
function legacyTarget(n) {
  if ( n.store?.name ) return {type: "store", name: n.store.name};
  if ( n.mall ) return {type: "spot", here: true, mall: n.mall, mallName: n.mallName, floor: n.floor, x: n.x, y: n.y, place: n.label?.text ?? null};
  return {type: "general"};
}

/** Kept for bastion.js and the store chip: open the notebook (on the user's store if `home` is given). */
export function openFeedback({home} = {}) {
  if ( picking ) return Promise.resolve(null);
  return NotebookApp.open({home});
}
export const openNotebook = openFeedback;

async function submitNote(note) {
  try {
    await recordWriting({form: "note", title: targetLabel(note.target, {forGM: true}),
      about: note.category ? `category: ${CAT_LABEL[note.category] ?? note.category}` : null, text: note.text});
    if ( game.user.isGM ) await saveNotes([note]);
    else await game.user.update({[`flags.${MODULE}.pendingFeedback.${note.id}`]: note});
    ui.notifications.info("Noted! Zak will see this.");
    await logEvent({kind: "note", id: note.id, name: `Note: ${targetLabel(note.target, {forGM: true})}`,
      category: note.category, text: note.text});
    return true;
  } catch(err) {
    console.error(`${MODULE} | saving the note failed`, err);
    ui.notifications.error("Mall Explorer: the note couldn't be saved. Please copy it somewhere and tell Zak.");
    return false;
  }
}

/* -------------------------------------------- */
/*  GM side                                     */
/* -------------------------------------------- */

let saving = Promise.resolve();
function saveNotes(notes) {
  const run = saving.then(() => saveNotesNow(notes));
  saving = run.catch(() => {});
  return run;
}

async function saveNotesNow(notes) {
  const all = foundry.utils.deepClone(game.settings.get(MODULE, "feedback") ?? []);
  const list = Array.isArray(all) ? all : [];
  const have = new Set(list.map(n => n?.id));
  const fresh = notes.filter(n => n?.id && !have.has(n.id));
  if ( !fresh.length ) return 0;
  await game.settings.set(MODULE, "feedback", list.concat(fresh));
  try {
    let je = game.journal.find(j => j.getFlag(MODULE, "feedbackLog")) ?? game.journal.getName(JOURNAL_NAME);
    if ( !je ) {
      je = await JournalEntry.create({name: JOURNAL_NAME, ownership: {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE},
        flags: {[MODULE]: {feedbackLog: true}}});
    }
    await je.createEmbeddedDocuments("JournalEntryPage", fresh.map(n => ({
      name: `${(n.time ?? "").slice(0, 16).replace("T", " ")} · ${n.character ?? n.user}${n.store ? ` · ${n.store.name}` : ""}`,
      type: "text",
      text: {format: 1, content: noteHTML(n)},
      flags: {[MODULE]: {feedbackId: n.id}}
    })));
  } catch(err) {
    console.error(`${MODULE} | feedback journal failed`, err);
  }
  return fresh.length;
}

function noteHTML(n) {
  const where = [n.mallName ?? n.mall, n.floor && `floor ${n.floor}`, Number.isFinite(n.x) && `tile ${n.x},${n.y}`].filter(Boolean).join(", ");
  return `<p><strong>${esc(n.user)}</strong>${n.character ? ` (${esc(n.character)})` : ""}${n.table ? `, ${esc(n.table)} table` : ""},
    week ${esc(n.week)}, ${esc(n.time)}</p>
    <p><strong>About:</strong> ${esc(targetLabel(n.target ?? legacyTarget(n), {forGM: true}))}${n.category ? ` (${esc(CAT_LABEL[n.category] ?? n.category)})` : ""}</p>
    <blockquote>${esc(n.text).replace(/\n/g, "<br>")}</blockquote>
    <p class="maul-dim">Written at: ${esc(where || "not on a mall scene")}${n.nearest ? `; near ${esc(n.nearest.name)}` : ""}${n.label ? `; by ${esc(n.label.text)}` : ""}</p>`;
}

/** Active GM: move a user's queued notes into the world log. */
export async function flushPendingFeedback(user) {
  if ( !game.user.isGM || game.users.activeGM?.id !== game.user.id ) return;
  const users = user ? [user] : game.users.contents;
  for ( const u of users ) {
    const pending = u.getFlag(MODULE, "pendingFeedback");
    const notes = pending && typeof pending === "object" ? Object.values(pending).filter(n => n?.id) : [];
    if ( !notes.length ) continue;
    try {
      const n = await saveNotes(notes);
      const update = {};
      for ( const note of notes ) update[`flags.${MODULE}.pendingFeedback.${note.id}`] = DEL();
      await u.update(update);
      if ( n ) ui.notifications.info(`Mall Explorer: ${n} new note${n === 1 ? "" : "s"} from ${u.name} (MAUL: Feedback & Requests).`);
    } catch(err) {
      console.error(`${MODULE} | flushing notes from ${u.name} failed`, err);
    }
  }
}

/* -------------------------------------------- */
/*  "Your store" chip                           */
/* -------------------------------------------- */

let inStore = null;
let chipTimer = null;

/** Own token moved: show the chip once per visit to the user's own store. */
export function storeChipTick(ctx, tile) {
  const home = ownStoreAt(ctx, tile);
  const id = home ? (home.id ?? home.npc) : null;
  if ( id === inStore ) return;
  inStore = id;
  if ( home ) showChip(home);
  else hideChip();
}

function showChip(home) {
  hideChip();
  const el = document.createElement("div");
  el.id = "maul-store-chip";
  el.className = "maul-pixel";
  el.innerHTML = `${esc(home.store ?? "Your store")}. Want to change something? (press <strong>J</strong>)`;
  el.addEventListener("click", () => { hideChip(); openFeedback({home}); });
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  chipTimer = setTimeout(hideChip, 9000);
}

function hideChip() {
  clearTimeout(chipTimer);
  const el = document.getElementById("maul-store-chip");
  if ( el ) { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }
}

export function resetStoreChip() {
  inStore = null;
  hideChip();
}
