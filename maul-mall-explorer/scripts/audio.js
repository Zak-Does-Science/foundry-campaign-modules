// MAUL Mall Explorer: sound. Procedural WebAudio blips/chimes (no files) and client-side zone music.
// Everything here is local to this browser: nothing is broadcast to other users.

import {MODULE, modPath} from "./config.js";
import {getMallContext} from "./data.js";

/* -------------------------------------------- */
/*  WebAudio core                               */
/* -------------------------------------------- */

let ac = null;
let sfxBus = null;

function sfxVolume() {
  try { return Math.clamp(Number(game.settings.get(MODULE, "sfxVolume")) || 0, 0, 1); } catch { return 0; }
}

/** The AudioContext, created on demand. Returns null before the first user gesture or if WebAudio is unavailable. */
function ctx() {
  if ( !ac ) {
    if ( !userGestured ) return null;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if ( !AC ) return null;
      ac = new AC();
      sfxBus = ac.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(ac.destination);
    } catch(err) {
      console.warn(`${MODULE} | WebAudio unavailable`, err);
      ac = null;
      return null;
    }
  }
  if ( ac.state === "suspended" ) ac.resume().catch(() => {});
  return ac;
}

/** One enveloped oscillator note. */
export function tone({type = "square", freq = 440, to = null, dur = 0.06, gain = 0.15, delay = 0, attack = 0.004}) {
  const vol = sfxVolume();
  if ( vol <= 0 ) return;
  const a = ctx();
  if ( !a ) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if ( to ) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * vol), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(sfxBus);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A short burst of filtered noise (whoosh, tick). */
export function noise({dur = 0.4, gain = 0.2, from = 300, to = 3000, q = 1.2, delay = 0}) {
  const vol = sfxVolume();
  if ( vol <= 0 ) return;
  const a = ctx();
  if ( !a ) return;
  const t0 = a.currentTime + delay;
  const len = Math.ceil(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for ( let i = 0; i < len; i++ ) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * vol), t0 + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/* -------------------------------------------- */
/*  Voices                                      */
/* -------------------------------------------- */

const SPECIES = {
  automaton: {type: "square", base: 520, spread: 0.05},
  pixie: {type: "triangle", base: 1150, spread: 0.18},
  mole: {type: "triangle", base: 150, spread: 0.12},
  dwarf: {type: "square", base: 170, spread: 0.12},
  gnome: {type: "square", base: 640, spread: 0.15},
  goblin: {type: "square", base: 560, spread: 0.2},
  kobold: {type: "square", base: 600, spread: 0.18},
  halfling: {type: "triangle", base: 470, spread: 0.15},
  hobgoblin: {type: "sawtooth", base: 230, spread: 0.12},
  orc: {type: "sawtooth", base: 190, spread: 0.12},
  dragonborn: {type: "sawtooth", base: 210, spread: 0.1},
  lizardfolk: {type: "sawtooth", base: 260, spread: 0.15},
  fishfolk: {type: "sine", base: 380, spread: 0.25},
  snail: {type: "sine", base: 240, spread: 0.08},
  mushroomfolk: {type: "triangle", base: 330, spread: 0.1},
  tiefling: {type: "square", base: 330, spread: 0.14},
  elf: {type: "triangle", base: 420, spread: 0.12},
  human: {type: "square", base: 330, spread: 0.15}
};

function hash(s) {
  let h = 2166136261;
  for ( const ch of String(s ?? "") ) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

/**
 * Voice for a speaker: species from an `npc:<species>:<n>` sprite (or a plain species word), else by kind.
 * @returns {{type, freq, spread, tick?: boolean}}
 */
export function voiceFor({name, sprite, species, kind} = {}) {
  let sp = species;
  const m = String(sprite ?? "").match(/^npc:([a-z]+)/i);
  if ( m ) sp = m[1];
  sp = String(sp ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const h = hash(name);
  if ( !sp && ["sign", "object", "secret", "warp", "office"].includes(kind) ) return {tick: true, freq: 1800 + (h % 600)};
  if ( kind === "leyline" && !sp ) sp = "automaton";
  const v = SPECIES[sp] ?? SPECIES.human;
  const shift = 1 + (((h % 1000) / 1000) - 0.5) * 0.5;   // +-25 % per name
  return {type: v.type, freq: v.base * shift, spread: v.spread};
}

/** One talk blip in a voice. */
export function blip(voice, {quiet = false} = {}) {
  if ( !voice ) return;
  const gain = quiet ? 0.05 : 0.11;
  if ( voice.tick ) return noise({dur: 0.03, gain: gain * 0.8, from: voice.freq, to: voice.freq * 1.4, q: 8});
  const f = voice.freq * (1 + (Math.random() - 0.5) * voice.spread);
  tone({type: voice.type, freq: f, dur: 0.045, gain});
}

/* -------------------------------------------- */
/*  Sound effects                               */
/* -------------------------------------------- */

export const Sfx = {
  confirm: () => { tone({freq: 880, dur: 0.05, gain: 0.08}); tone({freq: 1320, dur: 0.06, gain: 0.07, delay: 0.05}); },
  chime: () => [988, 1319, 1568, 1976].forEach((f, i) => tone({type: "triangle", freq: f, dur: 0.35, gain: 0.12, delay: i * 0.08})),
  coin: () => { tone({freq: 1976, dur: 0.07, gain: 0.1}); tone({freq: 2637, dur: 0.25, gain: 0.1, delay: 0.07}); },
  whoosh: () => { noise({dur: 0.9, gain: 0.35, from: 200, to: 4000}); tone({type: "sine", freq: 180, to: 900, dur: 0.9, gain: 0.08}); },
  search: () => noise({dur: 0.25, gain: 0.12, from: 800, to: 2400, q: 3})
};

/* -------------------------------------------- */
/*  Autoplay gate                               */
/* -------------------------------------------- */

let userGestured = false;
const gestureWaiters = [];

/** Call once (ready). The first key/click unlocks audio (browser autoplay rules). */
export function registerAudioGesture() {
  const unlock = () => {
    if ( userGestured ) return;
    userGestured = true;
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    ctx();
    for ( const fn of gestureWaiters.splice(0) ) try { fn(); } catch(err) { console.warn(err); }
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

/* -------------------------------------------- */
/*  Music                                       */
/* -------------------------------------------- */

const FADE_MS = 1500;

function musicVolume() {
  try { return Math.clamp(Number(game.settings.get(MODULE, "musicVolume")) || 0, 0, 1); } catch { return 0; }
}

const resolveSrc = src => (/^(https?:|\/|modules\/|systems\/|worlds\/)/.test(src) ? src : modPath(src));

export const Music = {
  current: null,      // {src, el, level}
  fading: [],         // elements fading out
  failed: new Set(),  // srcs that errored (missing files): never retried this session
  _timer: null,
  _last: 0,

  /** Pick the src for a scene tile in this mall context (first matching zone, else default). */
  srcFor(ctx, tile) {
    const music = ctx?.mall?.music;
    if ( !music ) return null;
    if ( tile ) {
      for ( const z of music.zones ?? [] ) {
        const L = ctx.layout.floors?.[z.floor];
        if ( !L || !z.src ) continue;
        const fx = tile.x - L.ox;
        const fy = tile.y - L.oy;
        if ( fx >= (z.x ?? 0) && fy >= (z.y ?? 0) && fx < (z.x ?? 0) + (z.w ?? L.w) && fy < (z.y ?? 0) + (z.h ?? L.h) ) return z.src;
      }
    }
    return music.default ?? null;
  },

  /** Called (throttled) as the player's token moves, and on canvasReady. */
  async update(mallId, tile, {force = false} = {}) {
    const now = Date.now();
    if ( !force && now - this._last < 500 ) return;
    this._last = now;
    if ( !mallId ) return this.play(null);
    const c = await getMallContext(mallId);
    this.play(this.srcFor(c, tile));
  },

  /** Crossfade to a src (null = fade out). */
  play(src) {
    if ( src && this.failed.has(src) ) src = null;
    if ( (this.current?.src ?? null) === (src ?? null) ) return;
    if ( this.current ) this.fading.push(this.current);
    this.current = null;
    if ( src && musicVolume() > 0 ) {
      const el = new Audio();
      el.loop = true;
      el.preload = "auto";
      el.volume = 0;
      const entry = {src, el, level: 0};
      el.addEventListener("error", () => {
        this.failed.add(src);
        if ( this.current === entry ) this.current = null;
        try { el.pause(); el.removeAttribute("src"); } catch {}
      }, {once: true});
      el.src = resolveSrc(src);
      this.current = entry;
      this._start(entry);
    } else if ( src ) {
      this.current = {src, el: null, level: 0};    // remember the zone even while muted
    }
    this._ensureTimer();
  },

  _start(entry) {
    const go = () => {
      if ( this.current !== entry || !entry.el ) return;
      entry.el.play().catch(err => {
        if ( err?.name === "NotAllowedError" ) gestureWaiters.push(go);
        // Other errors (missing / unsupported file) surface through the "error" event; stay quiet.
      });
    };
    if ( userGestured ) go();
    else gestureWaiters.push(go);
  },

  _ensureTimer() {
    if ( this._timer ) return;
    const stepMs = 50;
    const step = stepMs / FADE_MS;
    this._timer = setInterval(() => {
      const target = musicVolume();
      const cur = this.current;
      if ( cur?.el ) {
        cur.level = Math.min(1, cur.level + step);
        cur.el.volume = Math.clamp(cur.level * target, 0, 1);
      }
      for ( const f of this.fading ) {
        f.level = Math.max(0, f.level - step);
        if ( f.el ) f.el.volume = Math.clamp(f.level * target, 0, 1);
      }
      for ( const f of this.fading.filter(x => x.level <= 0) ) {
        try { f.el?.pause(); f.el?.removeAttribute("src"); f.el?.load(); } catch {}
      }
      this.fading = this.fading.filter(x => x.level > 0);
      if ( !this.fading.length && (!cur?.el || cur.level >= 1) ) {
        clearInterval(this._timer);
        this._timer = null;
      }
    }, stepMs);
  },

  /** Music volume setting changed: re-apply (0 stops, >0 restarts the current zone). */
  onVolumeChange() {
    const vol = musicVolume();
    const src = this.current?.src ?? null;
    if ( vol <= 0 ) {
      if ( this.current?.el ) { this.fading.push(this.current); this.current = {src, el: null, level: 0}; this._ensureTimer(); }
      return;
    }
    if ( this.current && !this.current.el && src ) {
      this.current = null;
      this.play(src);
      return;
    }
    if ( this.current?.el ) this.current.el.volume = Math.clamp(this.current.level * vol, 0, 1);
  }
};
