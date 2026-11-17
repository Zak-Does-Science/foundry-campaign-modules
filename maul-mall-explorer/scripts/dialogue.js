// MAUL Mall Explorer: bottom-of-screen 8-bit dialogue box with typewriter text.
// One box at a time. E / Space / Enter / click advances (or finishes the current page instantly);
// Esc closes. While open, the box swallows those keys and the movement keys so tokens don't wander.
// Pages may be strings or {text, requires, sets} objects: failing pages are skipped, `sets` are set when shown.
// Names with a MAUL Codex entry become links once a page has finished typing.

import {MODULE, esc, modPath} from "./config.js";
import {filterPages, pageText, setFlags, logEvent} from "./progress.js";
import {getWeek} from "./week.js";
import {voiceFor, blip, Sfx} from "./audio.js";
import {linkCodexNames, openCodexEntry} from "./codex-links.js";

const ADVANCE_KEYS = new Set(["KeyE", "Space", "Enter", "NumpadEnter"]);
const SWALLOW_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Numpad1", "Numpad2", "Numpad3", "Numpad4", "Numpad6", "Numpad7", "Numpad8", "Numpad9"]);

let active = null;

export function isDialogueOpen() {
  return !!active;
}

/** Show a module image (poster, map, note) to this player only, pixel-crisp. Logged as kind "image". */
export function showImage(src, {title, id} = {}) {
  if ( !src ) return;
  const path = /^(https?:|\/|modules\/|systems\/|worlds\/)/.test(src) ? src : modPath(src);
  try {
    const {ImagePopout} = foundry.applications.apps;
    new ImagePopout({src: path, classes: ["maul-image"], window: {title: title ?? ""}}).render({force: true});
    logEvent({kind: "image", id: id ?? src, name: title ?? src, src}).catch(() => {});
  } catch(err) {
    console.warn(`${MODULE} | image popout failed`, err);
  }
}

/**
 * Show a sequence of pages.
 * @param {object} o
 * @param {string} o.speaker      Name shown on the tab
 * @param {Array<string|object>} o.pages  Pages (strings or {text, requires, sets})
 * @param {string} [o.kind]       Interactable kind (adds a CSS modifier, e.g. sign / npc; picks the blip voice)
 * @param {string} [o.sprite]     Interactable sprite (npc:<species>:<n>) for the blip voice
 * @param {string} [o.species]    Species word for the blip voice (pop-up vendors)
 * @param {string} [o.id]         Interactable / gossip id, for the character log when a page sets flags
 * @returns {Promise<{completed: boolean, shown: number}>} completed = false if the player pressed Esc early
 */
export function showDialogue({speaker, pages, kind, sprite, species, id}) {
  if ( active ) active.close(false);
  pages = filterPages(pages, getWeek()).map(p => (typeof p === "string" ? {text: p} : {text: pageText(p), sets: p.sets, image: p.image}));
  if ( !pages.length ) return Promise.resolve({completed: true, shown: 0});
  const voice = voiceFor({name: speaker, sprite, species, kind});
  return new Promise(resolve => {
    active = new DialogueBox({speaker, pages, kind, voice, id, resolve});
    active.open();
  });
}

class DialogueBox {
  constructor({speaker, pages, kind, voice, id, resolve}) {
    this.speaker = speaker;
    this.pages = pages;
    this.kind = kind;
    this.voice = voice;
    this.id = id;
    this.resolve = resolve;
    this.index = 0;
    this.timer = null;
    this.typing = false;
    this.onKey = this.#onKey.bind(this);
  }

  open() {
    const el = document.createElement("div");
    el.id = "maul-dialogue";
    el.className = `maul-dialogue maul-pixel${this.kind ? ` maul-kind-${esc(this.kind)}` : ""}`;
    el.innerHTML = `
      ${this.speaker ? `<div class="maul-dlg-name">${esc(this.speaker)}</div>` : ""}
      <div class="maul-dlg-box" role="dialog" aria-live="polite">
        <div class="maul-dlg-text"></div>
        <div class="maul-dlg-next" aria-hidden="true">&#9660;</div>
        <div class="maul-dlg-count"></div>
      </div>`;
    el.addEventListener("pointerdown", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      this.advance();
    });
    document.body.appendChild(el);
    this.el = el;
    this.textEl = el.querySelector(".maul-dlg-text");
    this.nextEl = el.querySelector(".maul-dlg-next");
    this.countEl = el.querySelector(".maul-dlg-count");
    // Codex links: open the entry, never advance or close the box
    this.textEl.addEventListener("pointerdown", ev => {
      const a = ev.target instanceof Element ? ev.target.closest("a.maul-codex-link") : null;
      if ( !a ) return;
      ev.preventDefault();
      ev.stopPropagation();
      openCodexEntry(a.dataset.codexId);
    });
    this.textEl.addEventListener("click", ev => {
      if ( ev.target instanceof Element && ev.target.closest("a.maul-codex-link") ) ev.preventDefault();
    });
    window.addEventListener("keydown", this.onKey, {capture: true});
    requestAnimationFrame(() => el.classList.add("open"));
    this.showPage();
  }

  showPage() {
    const page = this.pages[this.index];
    const text = page.text;
    if ( page.image ) showImage(page.image, {title: this.speaker, id: this.id});
    if ( page.sets?.length ) {
      setFlags(page.sets, game.user, {kind: "talk", id: this.id ?? null, name: this.speaker ?? ""})
        .catch(err => console.error(`${MODULE} | page flags failed`, err));
    }
    this.countEl.textContent = this.pages.length > 1 ? `${this.index + 1}/${this.pages.length}` : "";
    this.nextEl.classList.remove("visible");
    this.nextEl.innerHTML = this.index < this.pages.length - 1 ? "&#9660;" : "&#9632;";
    const cps = Number(game.settings.get(MODULE, "textSpeed")) || 0;
    if ( cps <= 0 ) {
      blip(this.voice);
      this.finishTyping();
      return;
    }
    this.textEl.textContent = "";
    this.typing = true;
    let i = 0;
    let sinceBlip = 99;
    const every = 2 + Math.floor(Math.random() * 2);
    const step = Math.max(10, Math.round(1000 / cps));
    this.timer = setInterval(() => {
      i += 1;
      this.textEl.textContent = text.slice(0, i);
      sinceBlip += 1;
      const ch = text[i - 1];
      if ( sinceBlip >= every && ch && /\S/.test(ch) ) {
        blip(this.voice);
        sinceBlip = 0;
      }
      if ( i >= text.length ) this.finishTyping();
    }, step);
  }

  finishTyping() {
    clearInterval(this.timer);
    this.timer = null;
    this.typing = false;
    const text = this.pages[this.index].text;
    const html = linkCodexNames(text);
    if ( html ) this.textEl.innerHTML = html;
    else this.textEl.textContent = text;
    this.nextEl.classList.add("visible");
  }

  advance() {
    if ( this.typing ) return this.finishTyping();
    Sfx.confirm();
    if ( this.index < this.pages.length - 1 ) {
      this.index += 1;
      return this.showPage();
    }
    this.close(true);
  }

  close(completed) {
    clearInterval(this.timer);
    window.removeEventListener("keydown", this.onKey, {capture: true});
    const el = this.el;
    if ( el ) {
      el.classList.remove("open");
      setTimeout(() => el.remove(), 120);
    }
    if ( active === this ) active = null;
    this.resolve({completed, shown: this.index + 1});
  }

  #onKey(ev) {
    // Leave typing in chat / inputs alone
    const t = ev.target;
    if ( t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) ) return;
    if ( ev.code === "Escape" ) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.close(false);
      return;
    }
    if ( ADVANCE_KEYS.has(ev.code) ) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if ( !ev.repeat ) this.advance();
      return;
    }
    if ( SWALLOW_KEYS.has(ev.code) ) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    }
  }
}
