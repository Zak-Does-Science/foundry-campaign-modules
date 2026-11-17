// MAUL Mall Explorer: the Coworkers panel (SPEC 27). From their own store's Bastion menu (or the notebook's Journal tab)
// a player can, for each coworker of their home store (`homeStores[].npc` plus optional `homeStores[].coworkers: [ids]`):
//   - swap the coworker's sprite right away for another mall-folk sprite (npc:<species>:<n>... keys of
//     assets/sprites/live/index.json; seen by everyone, since Live reads every user's flags),
//   - tell Zak how they look, how they act, and anything else about them (three free-text prompts, full length).
// Stored on the player's own User: flags["maul-mall-explorer"].coworkers.<npcId> =
//   {npc, name, store, storeName, mall, sprite|null, look, act, other, t}   (`description` = the old "who they are", read
//   as `other`). Each save is also kept as a timestamped writing file (writings.js, SPEC 28).
// A swap only counts while that user's character is listed on the store (so nobody can re-skin someone else's staff).

import {MODULE, esc, modPath} from "./config.js";
import {safe, logEvent} from "./progress.js";
import {nameMatches, spriteIndex, resolveKey} from "./pc.js";
import {recordWriting} from "./writings.js";
import {LIMITS, attachCounters, withinLimits} from "./counter.js";

const {ApplicationV2} = foundry.applications.api;
/** The three prompts per coworker: [field, label, placeholder]. */
const PROMPTS = [
  ["look", "How they look", "Their body, face, hair, clothes, colours, what they carry. What would a custom sprite need?"],
  ["act", "How they act", "Personality, habits, how they talk, what they do all day, how they treat customers and you."],
  ["other", "Anything else about them", "History, family, secrets, likes, dislikes, ideas for them. It's all useful."]
];
const fieldOf = (r, f) => (f === "other" ? (r.other ?? r.description ?? "") : (r[f] ?? ""));
/** Mall folk only: no player-character or rival-team sprites (no canon characters as coworkers). */
const ALLOWED = /^npc:[a-z]+:\d/;

const homesWith = (mall, npcId) => (mall?.homeStores ?? []).filter(h => h?.npc === npcId || (h?.coworkers ?? []).includes(npcId));

/** The sprite key a player picked for this coworker (latest pick wins), or null. Used by live.js for everyone. */
export function coworkerSprite(mall, ia, index = null) {
  if ( !ia?.id ) return null;
  const homes = homesWith(mall, ia.id);
  if ( !homes.length ) return null;
  let best = null;
  for ( const u of game.users ) {
    const r = u.getFlag(MODULE, "coworkers")?.[safe(ia.id)];
    if ( !r?.sprite || !ALLOWED.test(r.sprite) || (index && !index[r.sprite]) ) continue;
    if ( !u.character || !homes.some(h => nameMatches(u.character.name, h.characters)) ) continue;
    if ( !best || (r.t ?? 0) > (best.t ?? 0) ) best = r;
  }
  return best?.sprite ?? null;
}

/** Coworker interactables of a homeStores entry. */
export function coworkersOf(mall, home) {
  const ids = [...new Set([home?.npc, ...(home?.coworkers ?? [])].filter(Boolean))];
  return ids.map(id => (mall?.interactables ?? []).find(i => i.id === id)).filter(Boolean);
}

const shortName = n => String(n ?? "").replace(/\s*\(.*\)\s*$/, "");

function preview(index, key, scale = 3) {
  const info = index?.[key];
  if ( !info?.file ) return `<span class="maul-cw-nosprite">?</span>`;
  const fw = Number(info.fw) || 16, fh = Number(info.fh) || 16, n = Math.max(1, Number(info.frames) || 1);
  return `<span class="maul-form-preview" style="width:${fw * scale}px;height:${fh * scale}px;background-image:url('${esc(modPath(`assets/sprites/live/${info.file}`))}');background-size:${fw * scale * n}px ${fh * scale}px"></span>`;
}

export class CoworkersApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "maul-coworkers",
    classes: ["maul-app", "maul-coworkers", "maul-pixel"],
    tag: "div",
    window: {title: "Coworkers", icon: "fas fa-people-group", resizable: true},
    position: {width: 620, height: 680},
    actions: {choose: CoworkersApp.#onChoose, pick: CoworkersApp.#onPick, reset: CoworkersApp.#onReset,
      save: CoworkersApp.#onSave, closePicker: CoworkersApp.#onClosePicker}
  };

  /** Open for a home store: {mall, home} (mall = the mall JSON). */
  static async open({mall, home}) {
    if ( !mall || !home ) return null;
    let app = foundry.applications.instances.get("maul-coworkers");
    if ( !app ) app = new CoworkersApp();
    app.mall = mall;
    app.home = home;
    app.index = await spriteIndex();
    app.picking = null;
    app.drafts = {};
    await app.render({force: true});
    app.bringToFront?.();
    return app;
  }

  get title() {
    return `Coworkers: ${this.home?.store ?? "your store"}`;
  }

  #record(id) {
    return game.user.getFlag(MODULE, "coworkers")?.[safe(id)] ?? {};
  }

  #readDrafts() {
    for ( const el of this.element?.querySelectorAll("[data-cw]") ?? [] ) {
      const id = el.dataset.cw;
      this.drafts[id] ??= {};
      this.drafts[id][el.name] = el.value;
    }
  }

  async _renderHTML() {
    const list = coworkersOf(this.mall, this.home);
    if ( !list.length ) return "<p>This store has no coworkers listed yet. Tell Zak in your notebook (J).</p>";
    const cards = list.map(ia => {
      const r = this.#record(ia.id);
      const d = this.drafts[ia.id] ?? {};
      const current = coworkerSprite(this.mall, ia, this.index) ?? resolveKey(this.index, ia.sprite);
      const picker = this.picking === ia.id ? this.#pickerHTML(ia, current) : "";
      return `<section class="maul-cw-card">
        <div class="maul-cw-head">${preview(this.index, current)}
          <div><h3>${esc(shortName(ia.name ?? ia.id))}</h3>
            <div class="maul-cw-buttons">
              <button type="button" class="maul-btn small" data-action="choose" data-npc="${esc(ia.id)}"><i class="fas fa-shuffle"></i> Swap sprite</button>
              ${r.sprite ? `<button type="button" class="maul-btn small" data-action="reset" data-npc="${esc(ia.id)}"><i class="fas fa-rotate-left"></i> Original</button>` : ""}
            </div></div></div>
        ${picker}
        ${PROMPTS.map(([f, label, hint]) => `<label>${label}</label>
        <textarea data-cw="${esc(ia.id)}" name="${f}" data-max="${LIMITS.long}" rows="3" placeholder="${esc(hint)}">${esc(d[f] ?? fieldOf(r, f))}</textarea>`).join("")}
      </section>`;
    }).join("");
    return `<p class="maul-dim">Sprite swaps show for everyone straight away. Your descriptions go to Zak (and your journal).
        Someone else should work here? Write it in your notebook: J → Journal → My shop.</p>
      ${cards}
      <div class="maul-nb-send"><span></span><button type="button" class="maul-btn" data-action="save"><i class="fas fa-floppy-disk"></i> Save notes</button></div>`;
  }

  #pickerHTML(ia, current) {
    const keys = Object.keys(this.index ?? {}).filter(k => ALLOWED.test(k));
    const species = [...new Set(keys.map(k => k.split(":")[1]))].sort();
    const want = this.species ?? String(current ?? ia.sprite ?? "").split(":")[1] ?? species[0];
    const shown = keys.filter(k => k.split(":")[1] === want);
    return `<div class="maul-cw-picker">
      <div class="maul-cw-species">${species.map(s => `<button type="button" class="maul-btn small ${s === want ? "active" : ""}"
        data-action="choose" data-npc="${esc(ia.id)}" data-species="${esc(s)}">${esc(s)}</button>`).join("")}
        <button type="button" class="maul-btn small" data-action="closePicker"><i class="fas fa-xmark"></i></button></div>
      <div class="maul-forms">${shown.map(k => `<button type="button" class="maul-form maul-cw-option ${k === current ? "current" : ""}"
        data-action="pick" data-npc="${esc(ia.id)}" data-key="${esc(k)}" data-tooltip="${esc(k)}">${preview(this.index, k)}</button>`).join("")}</div>
    </div>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    attachCounters(content);
  }

  static async #onChoose(event, button) {
    this.#readDrafts();
    const id = button.dataset.npc;
    if ( button.dataset.species ) this.species = button.dataset.species;
    else if ( this.picking === id ) { this.picking = null; return this.render(); }
    else this.species = null;
    this.picking = id;
    await this.render();
  }

  static async #onClosePicker() {
    this.#readDrafts();
    this.picking = null;
    await this.render();
  }

  async #write(ia, changes) {
    const r = this.#record(ia.id);
    await game.user.update({[`flags.${MODULE}.coworkers.${safe(ia.id)}`]: {
      npc: ia.id, name: shortName(ia.name ?? ia.id), store: this.home.id ?? null, storeName: this.home.store ?? null,
      mall: this.mall.id, sprite: r.sprite ?? null, look: fieldOf(r, "look"), act: fieldOf(r, "act"), other: fieldOf(r, "other"),
      description: null, ...changes, t: Date.now()
    }});
  }

  static async #onPick(event, button) {
    this.#readDrafts();
    const ia = coworkersOf(this.mall, this.home).find(i => i.id === button.dataset.npc);
    const key = button.dataset.key;
    if ( !ia || !ALLOWED.test(key) || !this.index?.[key] ) return;
    await this.#write(ia, {sprite: key});
    this.picking = null;
    await logEvent({kind: "coworker", id: ia.id, name: `Swapped ${shortName(ia.name)}'s sprite to ${key}`, sprite: key});
    whisper(`swapped <strong>${esc(shortName(ia.name))}</strong>'s sprite to <code>${esc(key)}</code>`, this.home);
    await this.render();
  }

  static async #onReset(event, button) {
    this.#readDrafts();
    const ia = coworkersOf(this.mall, this.home).find(i => i.id === button.dataset.npc);
    if ( !ia ) return;
    await this.#write(ia, {sprite: null});
    await logEvent({kind: "coworker", id: ia.id, name: `Put ${shortName(ia.name)}'s original sprite back`, sprite: null});
    await this.render();
  }

  static async #onSave() {
    this.#readDrafts();
    const checks = [];
    for ( const ia of coworkersOf(this.mall, this.home) ) {
      for ( const [f, label] of PROMPTS ) checks.push([`${shortName(ia.name ?? ia.id)}: ${label}`, this.drafts[ia.id]?.[f] ?? "", LIMITS.long]);
    }
    if ( !withinLimits(checks) ) return this.render();
    let changed = 0;
    for ( const ia of coworkersOf(this.mall, this.home) ) {
      const d = this.drafts[ia.id];
      if ( !d ) continue;
      const r = this.#record(ia.id);
      const now = Object.fromEntries(PROMPTS.map(([f]) => [f, String(d[f] ?? fieldOf(r, f)).trim()]));   // full length (SPEC 28)
      if ( PROMPTS.every(([f]) => now[f] === fieldOf(r, f)) ) continue;
      await this.#write(ia, now);
      await recordWriting({form: "coworker", title: `${shortName(ia.name ?? ia.id)} at ${this.home.store ?? "my store"}`,
        about: `${this.mall.name ?? this.mall.id}: ${ia.id}`, fields: Object.fromEntries(PROMPTS.map(([f, label]) => [label, now[f]]))});
      await logEvent({kind: "coworker", id: ia.id, name: `Described ${shortName(ia.name)}`, ...now});
      changed++;
    }
    this.drafts = {};
    if ( changed ) {
      ui.notifications.info("Saved. Zak will see it.");
      whisper(`updated notes on ${changed} coworker${changed === 1 ? "" : "s"}`, this.home);
    } else ui.notifications.info("Nothing new to save.");
    await this.render();
  }
}

function whisper(what, home) {
  const gms = game.users.filter(u => u.isGM).map(u => u.id);
  if ( !gms.length ) return;
  const who = game.user.character?.name ? `${game.user.name} (${game.user.character.name})` : game.user.name;
  ChatMessage.create({
    content: `<div class="maul-chat-card"><h3>Coworkers</h3><p><strong>${esc(who)}</strong> ${what} at ${esc(home?.store ?? "their store")}.</p></div>`,
    whisper: gms, speaker: {alias: "MAUL Mall Explorer"}
  }).catch(err => console.warn(`${MODULE} | coworker whisper failed`, err));
}
