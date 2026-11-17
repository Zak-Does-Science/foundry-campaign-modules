// MAUL Mall Explorer: theatre shows (SPEC 29). Walk onto a seat at a venue and you're asked "Ready for the show to
// start?"; say yes and a short play runs in front of you: actors walk on from the wings (or pop up over a puppet-booth
// ledge), talk in speech bubbles, the curtain closes and opens between scenes, the audience reacts, and at the end there
// are bows and applause. Client-side only: each player watches their own performance (like ambient chats).
// Watching to the end gives a "Show Ticket Stub" once per character per week; tearing it during combat (no action)
// grants Heroic Inspiration.
//
// Data: data/shows/<mall>.json = {venue, shows: [...]} (format in SPEC.md section 29).

import {MODULE, modPath, esc} from "./config.js";
import {fetchJSON} from "./data.js";
import {toSceneTile} from "./grid.js";
import {Hint, currentMallId, getPlayerToken, tokenTile} from "./interact.js";
import {isDialogueOpen, showDialogue} from "./dialogue.js";
import {say, readTime, repositionAll} from "./ambient.js";
import {Sfx, tone, noise, voiceFor, blip} from "./audio.js";
import {Live} from "./live.js";
import {mapContainer, destroyContainer, pixelTexture} from "./layers.js";
import {getWeek} from "./week.js";
import {usedThisWeek, markUsed, whisperGM, whoLabel} from "./weekly.js";
import {setFlags} from "./progress.js";

const {DialogV2} = foundry.applications.api;

const STEP_MS = 250;           // a walking step, one tile
const PUPPET_STEP_MS = 180;
const PUPPET_CROP = 11;        // art rows of a 16-px sprite shown above the booth ledge
const LEDGE_PX = 3;            // art px from the top of the booth-front tile to the ledge
const TICKET_NAME = "Show Ticket Stub";
const TICKET_IMG = modPath("assets/ui/ticket-stub.png");
const WEEK_KEY = "show";        // weekly.<key> on the actor: one stub a week

const SKIP_KEYS = new Set(["KeyE", "Space", "Enter", "NumpadEnter"]);
const SWALLOW_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Numpad1", "Numpad2", "Numpad3", "Numpad4", "Numpad6", "Numpad7", "Numpad8", "Numpad9", "KeyF", "KeyJ", "KeyM", "KeyN"]);

const CROWD = {
  laugh: ["Ha!", "Hee hee!", "Ha ha ha!", "Pfft!", "HA!"],
  gasp: ["Oh!", "No!", "Gasp!", "Oh my."],
  aww: ["Awww.", "Aww!", "Oh, bless."],
  cheer: ["Hooray!", "Bravo!", "Yes!", "Wooo!"],
  boo: ["Boooo!", "Hiss!", "Boo!"],
  ooh: ["Oooh.", "Ooooh!", "Whoa."],
  hush: ["Shh!", "Shhh!"]
};
const BRAVO = ["Bravo!", "Encore!", "Wonderful!", "Hooray!", "More!", "Bravo, bravo!"];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shortName = name => String(name ?? "").replace(/\s*\(.*\)\s*$/, "");

class ShowStopped extends Error {}

/* -------------------------------------------- */
/*  Data                                        */
/* -------------------------------------------- */

const cache = new Map();

/** {venue, shows} for a mall, or null. */
export function getShows(mallId) {
  if ( !mallId ) return Promise.resolve(null);
  if ( !cache.has(mallId) ) {
    cache.set(mallId, fetchJSON(modPath(`data/shows/${mallId}.json`), {optional: true}).catch(() => null));
  }
  return cache.get(mallId);
}

/** The show playing this week at this venue, or null. */
export function showForWeek(data, week) {
  const shows = Array.isArray(data?.shows) ? data.shows : [];
  if ( !shows.length ) return null;
  const exact = shows.find(s => Array.isArray(s.weeks) && s.weeks.map(Number).includes(week));
  if ( exact ) return exact;
  // No show listed for this week: the latest one that started before it, else the first
  const before = shows.filter(s => Array.isArray(s.weeks) && s.weeks.some(w => Number(w) <= week))
    .sort((a, b) => Math.max(...b.weeks) - Math.max(...a.weeks));
  return before[0] ?? shows[0];
}

const inRect = (r, floor, x, y) => (!r.floor || r.floor === floor)
  && x >= r.x && y >= r.y && x < r.x + (r.w ?? 1) && y < r.y + (r.h ?? 1);

/** Floor + floor-local tile of a scene tile, or null. */
function floorLocal(layout, sx, sy) {
  for ( const [id, L] of Object.entries(layout?.floors ?? {}) ) {
    if ( sx >= L.ox && sy >= L.oy && sx < L.ox + (L.w ?? 0) && sy < L.oy + (L.h ?? 0) ) return {floor: id, x: sx - L.ox, y: sy - L.oy};
  }
  return null;
}

/** Is this floor-local tile a free seat of the venue? (a walkable `c` cell inside a seats rect, no NPC sitting there) */
function isSeat(ctx, venue, here) {
  if ( !here ) return false;
  const rects = Array.isArray(venue?.seats) ? venue.seats : [];
  if ( !rects.some(r => inRect({floor: venue.floor, ...r}, here.floor, here.x, here.y)) ) return false;
  const row = ctx.mall.floors?.find(f => f.id === here.floor)?.grid?.[here.y] ?? "";
  if ( row[here.x] !== "c" ) return false;
  return !ctx.entries.some(e => e.ia.kind === "npc" && e.ia.floor === here.floor && e.ia.x === here.x && e.ia.y === here.y);
}

/* -------------------------------------------- */
/*  Sitting down                                */
/* -------------------------------------------- */

let current = null;            // the running Performance
let promptedSeat = null;       // "F:x,y" of the seat we last asked about (ask again only after you step off it)
let asking = false;

async function onMoveToken(doc, movement, operation, user) {
  if ( !user?.isSelf || !canvas?.ready || doc.parent !== canvas.scene ) return;
  const token = doc.object;
  if ( !token || token !== getPlayerToken() ) return;
  if ( current ) {
    // Dragging the token away mid-show: you've left your seat
    current.stop("You leave your seat. The show goes on without you.");
    return;
  }
  const ctx = Hint.ctx;
  if ( !ctx || ctx.mall.id !== currentMallId() ) return;
  await token.movementAnimationPromise?.catch?.(() => {});
  if ( token.destroyed || doc.parent !== canvas.scene ) return;
  checkSeat(ctx, token);
}

async function checkSeat(ctx, token) {
  const data = await getShows(ctx.mall.id);
  if ( !data?.venue ) return;
  const t = tokenTile(token);
  const here = floorLocal(ctx.layout, t.x, t.y);
  if ( !isSeat(ctx, data.venue, here) ) {
    promptedSeat = null;
    return;
  }
  const key = `${here.floor}:${here.x},${here.y}`;
  if ( key === promptedSeat || asking || current || isDialogueOpen() ) return;
  promptedSeat = key;
  const show = showForWeek(data, getWeek());
  if ( !show ) return;
  await offerShow(ctx, data.venue, show, token);
}

async function offerShow(ctx, venue, show, token) {
  asking = true;
  let ok = false;
  try {
    const actor = game.user.character;
    const stub = !actor ? "<p class=\"maul-dim\">(No character assigned, so no ticket stub.)</p>"
      : usedThisWeek(actor, WEEK_KEY) ? "<p class=\"maul-dim\">You've already had this week's ticket stub. Enjoy the show anyway!</p>"
        : "<p class=\"maul-dim\">Stay to the end for a <strong>Show Ticket Stub</strong> (one a week): tear it during a fight, no action needed, for Heroic Inspiration.</p>";
    ok = await DialogV2.confirm({
      window: {title: venue.name ?? "Show", icon: "fas fa-masks-theater"},
      content: `<p><strong>Ready for the show to start?</strong></p>
        <p class="maul-show-title">${esc(show.title ?? "Tonight's show")}</p>
        ${show.byline ? `<p class="maul-dim">${esc(show.byline)}</p>` : ""}
        ${show.blurb ? `<p>${esc(show.blurb)}</p>` : ""}
        ${stub}
        <p class="maul-dim">About ${minutes(show)} minutes. E or Space: skip ahead. Esc: leave.</p>`,
      yes: {label: "Yes, start the show", icon: "fas fa-check"},
      no: {label: "Not now", icon: "fas fa-xmark"},
      rejectClose: false,
      modal: true
    });
  } finally {
    asking = false;
  }
  if ( !ok || current ) return;
  Sfx.confirm();
  const perf = new Performance(ctx, venue, show, token);
  current = perf;
  try {
    await perf.run();
  } finally {
    if ( current === perf ) current = null;
  }
}

function minutes(show) {
  let ms = 9000;
  for ( const sc of show.scenes ?? [] ) {
    ms += 5000;
    const walk = beats => {
      for ( const b of beats ?? [] ) {
        if ( b.say ) ms += readTime(String(b.text ?? "")) + 300;
        else if ( b.together ) walk(b.together);
        else if ( b.wait ) ms += Number(b.wait) || 0;
        else if ( b.caption ) ms += readTime(String(b.caption));
        else ms += 700;
      }
    };
    walk(sc.beats);
  }
  return Math.max(1, Math.round((ms + 12000) / 60000));
}

/* -------------------------------------------- */
/*  A performance                               */
/* -------------------------------------------- */

class Performance {
  constructor(ctx, venue, show, token) {
    this.ctx = ctx;
    this.venue = venue;
    this.show = show;
    this.token = token;
    this.stopped = false;
    this.stopNote = null;
    this.sleepers = new Set();
    this.actors = new Map();         // cast key -> actor record
    this.puppets = !!venue.puppets;
    const L = ctx.layout.floors?.[venue.floor];
    this.L = L;
    this.gs = canvas.grid.size;
    this.scale = this.gs / 16;
    this.stage = venue.stage;
  }

  /* ---------------- control ---------------- */

  stop(note = null) {
    if ( this.stopped ) return;
    this.stopped = true;
    this.stopNote = note;
    for ( const s of this.sleepers ) s.reject(new ShowStopped());
    this.sleepers.clear();
  }

  skip() {
    for ( const s of this.sleepers ) if ( s.skippable ) s.resolve();
  }

  check() {
    if ( this.stopped || !canvas?.ready || this.token.destroyed ) throw new ShowStopped();
  }

  /** Wait ms; E/Space ends a skippable wait early; Esc / leaving throws ShowStopped. */
  sleep(ms, {skippable = false} = {}) {
    this.check();
    return new Promise((resolve, reject) => {
      const s = {skippable};
      const done = () => { clearTimeout(s.timer); this.sleepers.delete(s); };
      s.resolve = () => { done(); resolve(); };
      s.reject = err => { done(); reject(err); };
      s.timer = setTimeout(s.resolve, Math.max(0, ms));
      this.sleepers.add(s);
    });
  }

  /** Run fn(k) every frame for ms (k 0..1). Never skipped (moves have to land), but stops on Esc. */
  async tween(ms, fn) {
    const t0 = performance.now();
    while ( true ) {
      this.check();
      const k = Math.min(1, (performance.now() - t0) / ms);
      fn(k);
      if ( k >= 1 ) return;
      await new Promise(r => requestAnimationFrame(r));
    }
  }

  /* ---------------- coordinates ---------------- */

  /** Stage-relative [col, row] -> scene tile. */
  tile(at) {
    const c = Array.isArray(at) ? at : [0, 0];
    return {x: this.L.ox + this.stage.x + (Number(c[0]) || 0), y: this.L.oy + this.stage.y + (Number(c[1]) || 0)};
  }

  wingTile(side) {
    const w = this.venue.wings?.[side] ?? (side === "right" ? [this.stage.w, 0] : [-1, 0]);
    return this.tile(w);
  }

  nearerWing(tile) {
    const lx = this.wingTile("left").x;
    const rx = this.wingTile("right").x;
    return Math.abs(tile.x - lx) <= Math.abs(rx - tile.x) ? "left" : "right";
  }

  /* ---------------- setup / teardown ---------------- */

  async run() {
    let finished = false;
    try {
      this.setup();
      await this.loadCast();
      await this.opening();
      const scenes = Array.isArray(this.show.scenes) ? this.show.scenes : [];
      for ( let i = 0; i < scenes.length; i++ ) {
        await this.sceneBreak(scenes[i], i);
        await this.beats(scenes[i].beats);
      }
      await this.finale();
      finished = true;
    } catch(err) {
      if ( !(err instanceof ShowStopped) ) console.error(`${MODULE} | show failed`, err);
    } finally {
      this.teardown();
    }
    if ( finished ) await this.reward();
    else if ( this.stopNote ) ui.notifications.info(this.stopNote);
  }

  setup() {
    this.layer = mapContainer("maul-show", 560);        // above live NPCs (550), below tokens (700)
    this.layer.sortableChildren = true;
    this.curtainLayer = mapContainer("maul-show-curtain", 565);
    if ( this.puppets ) {
      // Puppets live above the ledge: mask everything below it so they can rise and drop
      const top = this.tile([0, 0]);
      const ledge = top.y * this.gs + LEDGE_PX * this.scale;
      const m = new PIXI.Graphics();
      m.beginFill(0xffffff).drawRect((top.x - 2) * this.gs, ledge - 3 * this.gs, (this.stage.w + 4) * this.gs, 3 * this.gs).endFill();
      this.layer.addChild(m);
      this.layer.mask = m;
      this.ledgeY = ledge;
    }
    this.buildCurtain();
    this.hideStageNpcs(true);
    this.caption = document.createElement("div");
    this.caption.id = "maul-show-caption";
    this.caption.className = "maul-pixel";
    document.body.appendChild(this.caption);
    this.keyHandler = ev => this.onKey(ev);
    document.addEventListener("keydown", this.keyHandler, {capture: true});
    // Look at the stage (the seat may be on another floor: the Cogskill balcony)
    const c = this.tile([(this.stage.w - 1) / 2, (this.stage.h ?? 1) / 2]);
    this.panBack = {x: canvas.stage.pivot.x, y: canvas.stage.pivot.y};
    canvas.animatePan({x: (c.x + 0.5) * this.gs, y: (c.y + 2.5) * this.gs, duration: 900});
  }

  teardown() {
    canvas?.app?.ticker?.remove(this.animate);
    this.hideStageNpcs(false);
    document.removeEventListener("keydown", this.keyHandler, {capture: true});
    this.caption?.remove();
    for ( const a of this.actors.values() ) a.bubbleEntry = null;
    destroyContainer(this.layer);
    destroyContainer(this.curtainLayer);
    this.layer = this.curtainLayer = null;
    if ( canvas?.ready && !this.token.destroyed ) {
      const d = this.token.document;
      canvas.animatePan({x: d.x + (d.width * this.gs) / 2, y: d.y + (d.height * this.gs) / 2, duration: 700});
    }
  }

  /** Live NPCs standing on the stage or under the curtain (the Cogskill stagehand) step out of sight during a show. */
  hideStageNpcs(hide) {
    if ( !hide ) {
      for ( const a of this.hiddenNpcs ?? [] ) {
        if ( a.sprite && !a.sprite.destroyed ) a.sprite.renderable = true;
        if ( a.shadow && !a.shadow.destroyed ) a.shadow.renderable = true;
      }
      this.hiddenNpcs = [];
      return;
    }
    const f = this.venue.floor;
    const cur = this.venue.curtain ?? this.stage;
    const rects = [{floor: f, ...this.stage}, {floor: f, x: cur.x, y: cur.y, w: cur.w, h: Math.ceil(cur.h ?? 1)}];
    this.hiddenNpcs = (Live.actors ?? []).filter(a => {
      const L = this.L;
      const x = a.entry.sx - L.ox;
      const y = a.entry.sy - L.oy;
      return rects.some(r => inRect(r, f, x, y));
    });
    for ( const a of this.hiddenNpcs ) {
      a.sprite.renderable = false;
      if ( a.shadow ) a.shadow.renderable = false;
    }
  }

  onKey(ev) {
    if ( ev.repeat && !SKIP_KEYS.has(ev.code) ) { if ( SWALLOW_KEYS.has(ev.code) ) { ev.preventDefault(); ev.stopPropagation(); } return; }
    if ( document.activeElement?.matches?.("input, textarea, [contenteditable]") ) return;
    if ( ev.code === "Escape" ) {
      ev.preventDefault();
      ev.stopPropagation();
      this.stop("You slip out of the show quietly.");
    } else if ( SKIP_KEYS.has(ev.code) ) {
      ev.preventDefault();
      ev.stopPropagation();
      this.skip();
    } else if ( SWALLOW_KEYS.has(ev.code) ) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  }

  /* ---------------- cast ---------------- */

  async loadCast() {
    let index = Live.index;
    if ( !index ) index = await fetchJSON(modPath("assets/sprites/live/index.json"), {optional: true}).catch(() => null);
    this.index = index ?? {};
    for ( const [key, who] of Object.entries(this.show.cast ?? {}) ) {
      const info = this.spriteInfo(who?.sprite);
      if ( !info?.file ) continue;
      const base = await pixelTexture(modPath(`assets/sprites/live/${info.file}`));
      if ( !base ) continue;
      this.actors.set(key, this.makeActor(key, who, info, base));
    }
  }

  /** Index entry for a sprite key; falls back to the same species, then any human (like walk-on speakers). */
  spriteInfo(key) {
    const index = this.index;
    if ( index[key] ) return index[key];
    const k = String(key ?? "");
    const species = k.match(/^npc:([a-z]+)/i)?.[1];
    const keys = Object.keys(index);
    const alt = (species && keys.find(x => x.startsWith(`npc:${species}:`)))
      ?? (k.startsWith("obj:") ? keys.find(x => x === k.split(":").slice(0, 2).join(":")) : null)
      ?? keys.find(x => x.startsWith("npc:human:")) ?? keys.find(x => x.startsWith("npc:"));
    return alt ? index[alt] : null;
  }

  makeActor(key, who, info, base) {
    const fw = Number(info.fw) || 16;
    const fh = Number(info.fh) || 16;
    const n = Math.max(1, Math.min(Number(info.frames) || 1, Math.floor(base.width / fw) || 1));
    const crop = this.puppets ? Math.min(fh, PUPPET_CROP) : fh;
    const frames = [];
    for ( let i = 0; i < n; i++ ) {
      frames.push(new PIXI.Texture(base.baseTexture, new PIXI.Rectangle(base.frame.x + i * fw, base.frame.y, fw, crop)));
    }
    const footY = this.puppets ? crop - 1 : (Number.isFinite(Number(info.footY)) ? Number(info.footY) : fh - 1);
    const sprite = new PIXI.Sprite(frames[0]);
    sprite.anchor.set(0.5, (footY + 1) / crop);
    sprite.scale.set(this.scale);
    sprite.visible = false;
    let shadow = null;
    if ( !this.puppets ) {
      shadow = new PIXI.Graphics();
      shadow.beginFill(0x000000, who?.ghost ? 0.12 : 0.28).drawEllipse(0, 0, fw * this.scale * 0.32, 2 * this.scale).endFill();
      shadow.visible = false;
      this.layer.addChild(shadow);
    }
    if ( who?.ghost ) sprite.tint = 0xa8ecff;
    this.layer.addChild(sprite);
    const a = {
      key, who, name: shortName(who?.name ?? key), sprite, shadow, frames, frame: 0, nextFrame: 0,
      tx: 0, ty: 0, px: 0, py: 0, lift: 0, sink: 0, on: false, dir: 1, ghost: !!who?.ghost,
      voice: voiceFor({name: who?.name ?? key, sprite: who?.sprite, kind: "npc"}),
      bubbleEntry: {sx: 0, sy: 0}
    };
    return a;
  }

  place(a) {
    const gs = this.gs;
    const x = (a.px + 0.5) * gs;
    let foot;
    if ( this.puppets ) foot = this.ledgeY + a.sink * PUPPET_CROP * this.scale;
    else foot = (a.py + 1) * gs - this.scale;
    a.sprite.x = Math.round(x);
    a.sprite.y = Math.round(foot - a.lift);
    a.sprite.zIndex = a.sprite.y;
    if ( a.shadow ) {
      a.shadow.x = Math.round(x);
      a.shadow.y = Math.round(foot - this.scale);
      a.shadow.zIndex = a.sprite.y - 1;
      a.shadow.visible = a.sprite.visible;
    }
    a.bubbleEntry.sx = Math.round(a.px);
    a.bubbleEntry.sy = Math.round(a.py) - (this.puppets ? 1 : 0);
  }

  /** Idle frames + ghost flicker; called by a ticker while the show runs. */
  animate = () => {
    const now = performance.now();
    for ( const a of this.actors.values() ) {
      if ( !a.on || a.sprite.destroyed ) continue;
      if ( a.frames.length > 1 && now >= a.nextFrame ) {
        a.frame = (a.frame + 1) % a.frames.length;
        a.sprite.texture = a.frames[a.frame];
        a.nextFrame = now + (a.frame === 0 ? rand(700, 1200) : rand(250, 400));
      }
      if ( a.ghost ) a.sprite.alpha = 0.62 + 0.18 * Math.sin(now / 90 + a.px) + (Math.random() < 0.02 ? -0.3 : 0);
    }
  };

  /* ---------------- the frame of the show ---------------- */

  async opening() {
    canvas.app.ticker.add(this.animate);
    this.curtainSet(1);
    await this.sleep(900);
    Sfx.chime();
    await this.showCaption(`${this.venue.name ?? "The theatre"} presents`, 1800);
    tone({type: "triangle", freq: 523, dur: 0.18, gain: 0.1});
    tone({type: "triangle", freq: 659, dur: 0.18, gain: 0.1, delay: 0.16});
    tone({type: "triangle", freq: 784, dur: 0.4, gain: 0.12, delay: 0.32});
    await this.showCaption(this.show.title ?? "Tonight's show", 2400, this.show.byline);
  }

  async sceneBreak(scene, i) {
    if ( i > 0 ) {
      await this.curtain(0, 1, 1100);
      await this.clearStage();
      await this.sleep(400);
    }
    if ( scene?.title ) await this.showCaption(scene.title, 1900);
    await this.curtain(1, 0, 1300);
    await this.sleep(300);
  }

  async finale() {
    await this.sleep(700);
    await this.curtain(0, 1, 1100);
    await this.clearStage();
    await this.sleep(700);
    // Curtain call: everyone in a line along the front row
    const order = (Array.isArray(this.show.bow) && this.show.bow.length ? this.show.bow : [...this.actors.keys()])
      .map(k => this.actors.get(k)).filter(Boolean);
    const row = this.puppets ? 0 : Math.max(0, (this.stage.h ?? 1) - 1);
    const shown = order.slice(0, this.stage.w);
    shown.forEach((a, i) => {
      const col = shown.length === 1 ? Math.floor(this.stage.w / 2)
        : Math.round(((i + 0.5) * this.stage.w) / shown.length - 0.5);
      this.appear(a, [Math.max(0, Math.min(this.stage.w - 1, col)), row], true);
    });
    await this.curtain(1, 0, 1200);
    this.applause(4200);
    for ( const a of shown ) {
      this.act(a, "bow").catch(() => {});
      await this.sleep(220);
    }
    await this.sleep(1600);
    for ( const a of shown ) this.act(a, "bow").catch(() => {});
    await this.sleep(2200);
    await this.curtain(0, 1, 1200);
    await this.showCaption("The End", 1600);
    canvas.app.ticker.remove(this.animate);
  }

  /* ---------------- curtain ---------------- */

  buildCurtain() {
    const r = this.venue.curtain ?? {x: this.stage.x, y: this.stage.y - 1, w: this.stage.w, h: (this.stage.h ?? 1) + 1};
    const gs = this.gs;
    const s = this.scale;
    const x0 = (this.L.ox + r.x) * gs;
    const y0 = (this.L.oy + r.y) * gs;
    const W = r.w * gs;
    const H = Math.round(r.h * 16) * s;
    const cols = (this.venue.curtainColors ?? ["#b0203a", "#7a1028", "#e0506a"])
      .map(c => Number.parseInt(String(c).replace("#", ""), 16) || 0xb0203a);
    const gold = 0xe8b830;
    const half = side => {
      const g = new PIXI.Graphics();
      const w = W / 2;
      const artW = Math.ceil(w / s);
      for ( let i = 0; i < artW; i++ ) {
        const c = (i % 4 === 0) ? cols[1] : (i % 4 === 2 ? cols[2] : cols[0]);
        g.beginFill(c).drawRect(i * s, 0, s, H).endFill();
      }
      g.beginFill(gold).drawRect(0, H - 2 * s, artW * s, s).endFill();
      for ( let i = 0; i < artW; i += 2 ) g.beginFill(gold).drawRect(i * s, H - s, s, s).endFill();
      g.beginFill(0x000000, 0.25).drawRect(side === "left" ? artW * s - s : 0, 0, s, H).endFill();
      g.y = y0;
      g.pivot.x = side === "left" ? 0 : w;
      g.x = side === "left" ? x0 : x0 + W;
      return g;
    };
    this.curL = half("left");
    this.curR = half("right");
    const valance = new PIXI.Graphics();
    valance.beginFill(cols[1]).drawRect(x0 - s, y0 - 2 * s, W + 2 * s, 3 * s).endFill();
    valance.beginFill(gold).drawRect(x0 - s, y0 + s, W + 2 * s, s).endFill();
    this.curtainLayer.addChild(this.curL, this.curR, valance);
    this.curtainSet(1);
  }

  /** 1 = closed, 0 = open (gathered at the sides). */
  curtainSet(k) {
    if ( !this.curL || this.curL.destroyed ) return;
    const sx = 0.1 + 0.9 * k;
    this.curL.scale.x = sx;
    this.curR.scale.x = sx;
  }

  async curtain(from, to, ms) {
    noise({dur: ms / 1000, gain: 0.05, from: 300, to: 900, q: 0.8});
    await this.tween(ms, k => this.curtainSet(from + (to - from) * (0.5 - Math.cos(k * Math.PI) / 2)));
  }

  /* ---------------- captions ---------------- */

  async showCaption(text, ms, sub = null) {
    if ( !this.caption ) return;
    this.caption.innerHTML = `<span class="maul-show-cap"></span>${sub ? "<span class=\"maul-show-sub\"></span>" : ""}`;
    this.caption.querySelector(".maul-show-cap").textContent = text;
    if ( sub ) this.caption.querySelector(".maul-show-sub").textContent = sub;
    this.caption.classList.add("show");
    try {
      await this.sleep(Math.max(ms, readTime(String(text)) * 0.6), {skippable: true});
    } finally {
      this.caption?.classList.remove("show");
    }
    await this.sleep(250);
  }

  /* ---------------- actors ---------------- */

  appear(a, at, instant = false) {
    const t = this.tile(at);
    a.px = a.tx = t.x;
    a.py = a.ty = t.y;
    a.on = true;
    a.lift = 0;
    a.sink = instant || !this.puppets ? 0 : 1;
    a.sprite.visible = true;
    a.sprite.alpha = a.ghost ? 0.7 : 1;
    a.sprite.rotation = 0;
    a.sprite.scale.set(this.scale * a.dir, this.scale);
    this.place(a);
  }

  vanish(a) {
    a.on = false;
    a.sprite.visible = false;
    if ( a.shadow ) a.shadow.visible = false;
  }

  async clearStage() {
    for ( const a of this.actors.values() ) this.vanish(a);
  }

  face(a, dir) {
    a.dir = dir === "left" ? -1 : 1;
    a.sprite.scale.x = Math.abs(a.sprite.scale.x) * a.dir;
  }

  async walkTo(a, tile) {
    const ms = this.puppets ? PUPPET_STEP_MS : STEP_MS;
    while ( a.tx !== tile.x || a.ty !== tile.y ) {
      const dx = Math.sign(tile.x - a.tx);
      const dy = dx ? 0 : Math.sign(tile.y - a.ty);
      if ( dx ) this.face(a, dx < 0 ? "left" : "right");
      const fx = a.tx, fy = a.ty;
      a.tx += dx;
      a.ty += dy;
      await this.tween(ms, k => {
        a.px = fx + (a.tx - fx) * k;
        a.py = fy + (a.ty - fy) * k;
        a.lift = (this.puppets ? 1.5 : 1) * Math.abs(Math.sin(k * Math.PI)) * this.scale;
        this.place(a);
      });
    }
    a.lift = 0;
    this.place(a);
    repositionAll();
  }

  async enter(a, b) {
    if ( a.on ) this.vanish(a);
    const at = b.at ?? [Math.floor(this.stage.w / 2), 0];
    if ( this.puppets ) {
      this.appear(a, at);
      noise({dur: 0.12, gain: 0.06, from: 900, to: 2400, q: 2});
      await this.tween(260, k => { a.sink = 1 - k; this.place(a); });
      return;
    }
    const target = this.tile(at);
    const side = b.from === "left" || b.from === "right" ? b.from : this.nearerWing(target);
    const w = this.wingTile(side);
    this.appear(a, [w.x - this.L.ox - this.stage.x, w.y - this.L.oy - this.stage.y]);
    this.face(a, side === "left" ? "right" : "left");
    const startAlpha = a.sprite.alpha;
    a.sprite.alpha = 0;
    await this.tween(200, k => { a.sprite.alpha = startAlpha * k; });
    // Walk along the wing's row first, then up/down to the mark
    await this.walkTo(a, {x: target.x, y: w.y});
    await this.walkTo(a, target);
  }

  async exit(a, b) {
    if ( !a.on ) return;
    if ( this.puppets ) {
      noise({dur: 0.12, gain: 0.06, from: 2400, to: 900, q: 2});
      await this.tween(240, k => { a.sink = k; this.place(a); });
      this.vanish(a);
      return;
    }
    const side = b?.to === "left" || b?.to === "right" ? b.to : this.nearerWing({x: a.tx, y: a.ty});
    const w = this.wingTile(side);
    await this.walkTo(a, {x: a.tx, y: w.y});
    await this.walkTo(a, w);
    const startAlpha = a.sprite.alpha;
    await this.tween(200, k => { a.sprite.alpha = startAlpha * (1 - k); });
    this.vanish(a);
  }

  async act(a, act) {
    if ( !a?.on ) return;
    const s = this.scale;
    switch ( act ) {
      case "hop":
        tone({type: "square", freq: 520, to: 900, dur: 0.12, gain: 0.05});
        await this.tween(320, k => { a.lift = Math.sin(k * Math.PI) * 5 * s; this.place(a); });
        break;
      case "bow":
        await this.tween(260, k => { a.sprite.scale.y = s * (1 - 0.25 * k); });
        await this.sleep(350);
        await this.tween(260, k => { a.sprite.scale.y = s * (0.75 + 0.25 * k); });
        break;
      case "spin":
        noise({dur: 0.5, gain: 0.05, from: 600, to: 2400});
        for ( let i = 0; i < 4; i++ ) { this.face(a, a.dir > 0 ? "left" : "right"); await this.sleep(120); }
        break;
      case "shake": {
        const x0 = a.px;
        await this.tween(500, k => { a.px = x0 + Math.sin(k * Math.PI * 10) * 0.06; this.place(a); });
        a.px = x0;
        this.place(a);
        break;
      }
      case "flip":
        this.face(a, a.dir > 0 ? "left" : "right");
        break;
      case "faint":
        tone({type: "triangle", freq: 600, to: 150, dur: 0.6, gain: 0.07});
        await this.tween(450, k => { a.sprite.rotation = -a.dir * (Math.PI / 2) * k; });
        break;
      case "rise":
        await this.tween(350, k => { a.sprite.rotation = -a.dir * (Math.PI / 2) * (1 - k); });
        a.sprite.rotation = 0;
        break;
      default:
        break;
    }
  }

  async speak(a, text, sing) {
    const line = sing ? `♪ ${text} ♪` : String(text);
    const ms = readTime(line) + (sing ? 600 : 0);
    if ( a?.on ) say({x: a.bubbleEntry.sx, y: a.bubbleEntry.sy}, a.name, line, ms, {entry: a.bubbleEntry});
    // Talk blips (or a little tune) while the bubble is up
    const voice = a?.voice;
    if ( voice ) {
      const n = Math.min(18, Math.ceil(line.length / 4));
      const scale = [0, 2, 4, 7, 9, 12];
      for ( let i = 0; i < n; i++ ) {
        if ( sing ) {
          const f = voice.freq * Math.pow(2, pick(scale) / 12);
          tone({type: "triangle", freq: f, dur: 0.16, gain: 0.06, delay: i * 0.18});
        } else {
          setTimeout(() => { if ( !this.stopped ) blip(voice); }, i * 85);
        }
      }
    }
    try {
      await this.sleep(ms, {skippable: true});
    } finally {
      if ( this.stopped ) document.querySelectorAll("#maul-bubbles .maul-bubble").forEach(el => el._follow === a?.bubbleEntry && el.remove());
    }
    await this.sleep(150);
  }

  /* ---------------- audience ---------------- */

  /** Live NPC actors sitting in the venue's audience area. */
  audience() {
    const rects = Array.isArray(this.venue.audience) ? this.venue.audience : [];
    return (Live.actors ?? []).filter(a => {
      const ia = a.entry?.ia;
      if ( !ia || ia.kind !== "npc" || a.walkOn ) return false;
      return rects.some(r => inRect(r, ia.floor, ia.x, ia.y));
    });
  }

  crowdSound(kind) {
    switch ( kind ) {
      case "laugh":
        for ( let i = 0; i < 7; i++ ) tone({type: "square", freq: rand(260, 520), dur: 0.07, gain: 0.04, delay: i * 0.09 + rand(0, 0.04)});
        break;
      case "gasp":
        noise({dur: 0.35, gain: 0.08, from: 900, to: 3000, q: 1.5});
        break;
      case "aww":
        tone({type: "sine", freq: 520, to: 360, dur: 0.6, gain: 0.06});
        tone({type: "sine", freq: 660, to: 450, dur: 0.6, gain: 0.04, delay: 0.05});
        break;
      case "cheer":
        noise({dur: 0.9, gain: 0.08, from: 700, to: 2600, q: 0.7});
        this.clapBurst(1200);
        break;
      case "boo":
        tone({type: "sawtooth", freq: 180, to: 140, dur: 0.7, gain: 0.05});
        break;
      case "ooh":
        tone({type: "sine", freq: 300, to: 520, dur: 0.7, gain: 0.06});
        break;
      case "hush":
        noise({dur: 0.5, gain: 0.05, from: 3000, to: 5000, q: 2});
        break;
      default:
        break;
    }
  }

  clapBurst(ms) {
    const claps = Math.round(ms / 45);
    for ( let i = 0; i < claps; i++ ) {
      noise({dur: 0.03, gain: 0.07 * (1 - i / claps / 2), from: 1200, to: 2600, q: 3, delay: i * 0.045 + rand(0, 0.03)});
    }
  }

  react(b) {
    const kind = String(b.audience ?? "laugh");
    this.crowdSound(kind);
    const crowd = this.audience();
    let speaker = null;
    if ( b.who ) speaker = crowd.find(a => a.entry.ia.id === b.who) ?? null;
    if ( !speaker && crowd.length ) speaker = pick(crowd);
    const text = b.say ? String(b.say) : pick(CROWD[kind] ?? CROWD.laugh);
    if ( speaker ) {
      const ia = speaker.entry.ia;
      say({x: speaker.entry.sx, y: speaker.entry.sy}, shortName(ia.name), text, Math.max(1600, readTime(text) * 0.8),
        {entry: speaker.entry, voice: voiceFor({name: ia.name, sprite: ia.sprite, kind: "npc"})});
    }
    if ( ["laugh", "cheer", "gasp"].includes(kind) ) {
      for ( const a of crowd ) if ( Math.random() < 0.5 && !(a.hop > 0) ) a.hop = 0.0001;
    }
    return b.say ? this.sleep(Math.max(1200, readTime(text) * 0.8), {skippable: true}) : this.sleep(900, {skippable: true});
  }

  applause(ms) {
    this.clapBurst(ms);
    noise({dur: ms / 1000 * 0.6, gain: 0.06, from: 800, to: 2400, q: 0.6, delay: 0.3});
    const crowd = this.audience();
    const t0 = performance.now();
    const hopper = setInterval(() => {
      if ( this.stopped || performance.now() - t0 > ms ) { clearInterval(hopper); return; }
      for ( const a of crowd ) if ( Math.random() < 0.35 && !(a.hop > 0) ) a.hop = 0.0001;
    }, 260);
    crowd.sort(() => Math.random() - 0.5).slice(0, 3).forEach((sp, i) => {
      setTimeout(() => {
        if ( this.stopped ) return;
        const ia = sp.entry.ia;
        say({x: sp.entry.sx, y: sp.entry.sy}, shortName(ia.name), pick(BRAVO), 1800, {entry: sp.entry});
      }, 300 + i * 700);
    });
  }

  /* ---------------- beats ---------------- */

  async beats(list) {
    for ( const b of Array.isArray(list) ? list : [] ) {
      this.check();
      await this.beat(b);
    }
  }

  actor(key) {
    const a = this.actors.get(key);
    if ( !a ) console.warn(`${MODULE} | show ${this.show.id}: no cast member "${key}"`);
    return a ?? null;
  }

  async beat(b) {
    if ( !b || typeof b !== "object" ) return;
    if ( Array.isArray(b.together) ) {
      await Promise.all(b.together.map(x => this.beat(x)));
      return;
    }
    if ( b.audience ) { await this.react(b); return; }   // first: audience beats carry `say` text too
    if ( b.enter ) { const a = this.actor(b.enter); if ( a ) await this.enter(a, b); return; }
    if ( b.move ) {
      const a = this.actor(b.move);
      if ( a?.on ) await this.walkTo(a, this.tile(b.to));
      return;
    }
    if ( b.exit ) { const a = this.actor(b.exit); if ( a ) await this.exit(a, b); return; }
    if ( b.say ) { const a = this.actor(b.say); await this.speak(a, b.text ?? "", !!b.sing); return; }
    if ( b.do ) { await this.act(this.actor(b.do), b.act); return; }
    if ( b.face ) { const a = this.actor(b.face); if ( a ) this.face(a, b.dir); await this.sleep(150); return; }
    if ( b.caption ) { await this.showCaption(String(b.caption), readTime(String(b.caption))); return; }
    if ( b.sfx ) { playSfx(b.sfx); await this.sleep(350); return; }
    if ( b.curtain ) {
      if ( b.curtain === "close" ) await this.curtain(0, 1, 1000);
      else await this.curtain(1, 0, 1000);
      return;
    }
    if ( b.wait ) { await this.sleep(Math.min(4000, Number(b.wait) || 0), {skippable: true}); return; }
  }

  /* ---------------- the ticket ---------------- */

  async reward() {
    const actor = game.user.character;
    const title = this.show.title ?? "the show";
    await setFlags([`saw-${this.show.id}`], game.user, {kind: "show", id: this.show.id, name: `Watched ${title}`});
    if ( !actor ) {
      ui.notifications.info("What a show! (Assign a character to collect ticket stubs.)");
      return;
    }
    if ( usedThisWeek(actor, WEEK_KEY) ) {
      await showDialogue({speaker: this.venue.name, kind: "sign", pages: [
        `The crowd files out humming. You've already got this week's stub in your pocket, but nobody can take the show off you.`
      ]});
      return;
    }
    await markUsed(actor, WEEK_KEY);
    try {
      await addTicket(actor, this.show, getWeek());
    } catch(err) {
      console.error(`${MODULE} | ticket stub failed`, err);
      ui.notifications.warn("Mall Explorer: the ticket stub couldn't be added. Tell the GM.");
      return;
    }
    Sfx.coin();
    await showDialogue({speaker: this.venue.name, kind: "sign", pages: [
      `On the way out, someone presses a ticket stub into your hand: "${title}". (Show Ticket Stub added.)`,
      "Keep it for a fight: tear it any time during combat, no action needed, and you gain Heroic Inspiration."
    ]});
    whisperGM(`<h3>Show watched</h3><p><strong>${esc(whoLabel())}</strong> watched <em>${esc(title)}</em> at
      ${esc(this.venue.name ?? "the theatre")} and got a Show Ticket Stub.</p>`);
  }
}

/* -------------------------------------------- */
/*  Sound effects for `sfx` beats               */
/* -------------------------------------------- */

function playSfx(name) {
  switch ( String(name) ) {
    case "drum": for ( let i = 0; i < 8; i++ ) tone({type: "triangle", freq: 110, to: 60, dur: 0.08, gain: 0.12, delay: i * 0.07}); break;
    case "cymbal": noise({dur: 1.1, gain: 0.12, from: 5000, to: 9000, q: 0.6}); break;
    case "bell": [1568, 1976].forEach((f, i) => tone({type: "sine", freq: f, dur: 1.2, gain: 0.08, delay: i * 0.02})); break;
    case "thunder": noise({dur: 1.6, gain: 0.25, from: 60, to: 300, q: 0.7}); break;
    case "whoosh": Sfx.whoosh(); break;
    case "chime": Sfx.chime(); break;
    case "honk": tone({type: "sawtooth", freq: 220, to: 200, dur: 0.35, gain: 0.1}); tone({type: "square", freq: 330, dur: 0.3, gain: 0.05}); break;
    case "pop": tone({type: "sine", freq: 300, to: 1400, dur: 0.08, gain: 0.12}); break;
    case "fanfare": [523, 659, 784, 1047].forEach((f, i) => tone({type: "square", freq: f, dur: i === 3 ? 0.5 : 0.14, gain: 0.07, delay: i * 0.13})); break;
    case "crash": noise({dur: 0.7, gain: 0.25, from: 200, to: 1600, q: 0.8}); tone({type: "square", freq: 90, to: 40, dur: 0.4, gain: 0.1}); break;
    case "splash": noise({dur: 0.8, gain: 0.18, from: 2500, to: 600, q: 0.9}); break;
    case "squeak": tone({type: "square", freq: 1400, to: 2200, dur: 0.1, gain: 0.06}); tone({type: "square", freq: 2000, to: 1500, dur: 0.1, gain: 0.05, delay: 0.1}); break;
    case "harp": [523, 659, 784, 988, 1175, 1319].forEach((f, i) => tone({type: "triangle", freq: f, dur: 0.5, gain: 0.06, delay: i * 0.06})); break;
    case "horn": tone({type: "sawtooth", freq: 392, dur: 0.5, gain: 0.07}); tone({type: "sawtooth", freq: 523, dur: 0.7, gain: 0.07, delay: 0.45}); break;
    case "clank": tone({type: "square", freq: 1800, to: 1200, dur: 0.06, gain: 0.08}); noise({dur: 0.15, gain: 0.1, from: 3000, to: 6000, q: 4}); break;
    default: Sfx.confirm();
  }
}

/* -------------------------------------------- */
/*  Show Ticket Stub (item)                      */
/* -------------------------------------------- */

const STUB_DESC = `<p>A torn-edged ticket stub from a MAUL mall show, still smelling faintly of popcorn and curtain dust.</p>
<p><strong>Tear it during combat (no action needed) to gain Heroic Inspiration.</strong> Use the item while you're in a
fight; one stub is used up.</p><p>You get one stub for each week you watch a show to the end.</p>`;

/** Stack a stub onto the character's existing stubs, else make the item. */
async function addTicket(actor, show, week) {
  const seen = {id: show.id, title: show.title ?? show.id, week};
  const have = actor.items.find(i => i.getFlag(MODULE, "showTicket"));
  if ( have ) {
    const shows = [...(have.getFlag(MODULE, "shows") ?? []), seen];
    await have.update({"system.quantity": (Number(have.system?.quantity) || 0) + 1, [`flags.${MODULE}.shows`]: shows});
    return have;
  }
  const actId = foundry.utils.randomID();
  const data = {
    name: TICKET_NAME,
    type: "consumable",
    img: TICKET_IMG,
    system: {
      description: {value: STUB_DESC},
      quantity: 1,
      weight: {value: 0, units: "lb"},
      price: {value: 0, denomination: "gp"},
      type: {value: "trinket"},
      activities: {
        [actId]: {
          _id: actId, type: "utility", name: "Tear the stub",
          activation: {type: "special", value: null, condition: "During combat; no action needed"},
          consumption: {targets: [], scaling: {allowed: false}},
          description: {chatFlavor: "tears a show ticket stub and feels inspired!"}
        }
      }
    },
    flags: {[MODULE]: {showTicket: true, shows: [seen]}}
  };
  const [item] = await actor.createEmbeddedDocuments("Item", [data]);
  return item;
}

const isTicket = item => !!item?.getFlag?.(MODULE, "showTicket");

/** Is this actor fighting right now? (a started combat with a combatant for this actor) */
function inCombat(actor) {
  return game.combats?.some(c => c.started && c.combatants.some(cb => cb.actor?.id === actor.id
    || (cb.actor?.isToken && cb.actor?.baseActor?.id === actor.id))) ?? false;
}

/** Tearing a stub: only in combat, only if not already inspired. Returns false to cancel the use. */
function preUse(item) {
  const actor = item?.actor;
  if ( !actor ) return true;
  if ( !inCombat(actor) ) {
    ui.notifications.warn("Save the stub for a fight: it can only be torn during combat.");
    return false;
  }
  if ( actor.system?.attributes?.inspiration ) {
    ui.notifications.warn(`${actor.name} already has Heroic Inspiration. Keep the stub for later.`);
    return false;
  }
  return true;
}

async function tearStub(item) {
  const actor = item?.actor;
  if ( !actor || !actor.isOwner ) return;
  await actor.update({"system.attributes.inspiration": true});
  const left = (Number(item.system?.quantity) || 1) - 1;
  if ( left > 0 ) await item.update({"system.quantity": left});
  else await item.delete();
  Sfx.chime();
  await ChatMessage.create({
    content: `<div class="maul-chat-card"><h3>Ticket stub torn</h3><p><strong>${esc(actor.name)}</strong> tears a show
      ticket stub, remembers the applause, and gains <strong>Heroic Inspiration</strong>.</p></div>`,
    speaker: ChatMessage.getSpeaker({actor})
  }).catch(() => {});
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

export function registerShows() {
  Hooks.on("moveToken", (...args) => { onMoveToken(...args); });
  Hooks.on("canvasTearDown", () => { current?.stop(null); promptedSeat = null; });
  // dnd5e 4.x / 5.x activities
  Hooks.on("dnd5e.preUseActivity", activity => {
    const item = activity?.item;
    if ( !isTicket(item) ) return;
    return preUse(item);
  });
  Hooks.on("dnd5e.postUseActivity", activity => {
    const item = activity?.item;
    if ( isTicket(item) ) tearStub(item).catch(err => console.error(`${MODULE} | ticket stub failed`, err));
  });
}

/** Is a show playing for this user right now? */
export const isShowRunning = () => !!current;
