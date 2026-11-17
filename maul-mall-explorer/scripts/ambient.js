// MAUL Mall Explorer: ambient life. NPCs mutter one-liners as you pass ("barks"), and nearby NPCs
// talk to each other while you walk by ("chats"). Speech bubbles float over the speakers; nothing
// stops the player, and nothing needs a key press. All of it runs on the player's own client.
//
// Mall JSON:  "ambient": { "barks": [...], "chats": [...] }   (see SPEC.md)

import {MODULE} from "./config.js";
import {getMallContext} from "./data.js";
import {toSceneTile, chebyshev} from "./grid.js";
import {meetsRequirements, setFlags, hasFlag, pageText, isConcealed, safe} from "./progress.js";
import {getWeek} from "./week.js";
import {isDialogueOpen} from "./dialogue.js";
import {voiceFor, blip} from "./audio.js";
import {Areas} from "./areas.js";
import {Live} from "./live.js";
import {syncStandin, weeklyLinesFor} from "./pc.js";

const BARK_RANGE = 2;            // tiles
const BARK_COOLDOWN = 75_000;    // per NPC, ms
const CHAT_COOLDOWN = 150_000;   // per chat, ms
const GLOBAL_GAP = 6_000;        // quiet time after anything plays, ms
const STORE_KEY = `${MODULE}.ambient`;

const lastPlayed = new Map();    // id -> timestamp
let playing = false;
let quietUntil = 0;
let lastCheck = 0;
let layer = null;

/* -------------------------------------------- */
/*  Rotation memory (per browser)               */
/* -------------------------------------------- */

function memory() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) ?? {}; } catch { return {}; }
}
function remember(id, value) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({...memory(), [id]: value})); } catch { /* private mode */ }
}

/** Next variant in order, so a player hears every version before any repeats. */
function nextIndex(id, count) {
  const i = ((memory()[id] ?? -1) + 1) % count;
  remember(id, i);
  return i;
}

/** A random line, never the same one twice in a row. */
function freshLine(id, lines) {
  const last = memory()[id];
  let i = Math.floor(Math.random() * lines.length);
  if ( lines.length > 1 && i === last ) i = (i + 1) % lines.length;
  remember(id, i);
  return lines[i];
}

/* -------------------------------------------- */
/*  Bubbles (DOM overlay over the canvas)       */
/* -------------------------------------------- */

function ensureLayer() {
  if ( layer?.isConnected ) return layer;
  layer = document.createElement("div");
  layer.id = "maul-bubbles";
  document.body.appendChild(layer);
  return layer;
}

function placeBubble(el) {
  if ( !canvas?.ready ) return;
  const gs = canvas.grid.size;
  const f = el._follow;              // a wandering NPC's entry: the bubble follows its current tile
  const sx = f ? f.sx : Number(el.dataset.sx);
  const sy = f ? f.sy : Number(el.dataset.sy);
  const p = canvas.clientCoordinatesFromCanvas({x: (sx + 0.5) * gs, y: sy * gs});
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
}

export function repositionAll() {
  if ( !layer ) return;
  for ( const el of layer.children ) placeBubble(el);
}

/**
 * Show a speech bubble over a scene tile.
 * @param {{x:number,y:number}} tile
 * @param {string} name
 * @param {string} text
 * @param {number} ms
 * @param {object} [o]
 * @param {object} [o.entry]   interactable entry to follow (wandering NPCs)
 * @param {object} [o.voice]   blip voice (one quiet blip); null = silent
 */
export function say(tile, name, text, ms, {entry = null, voice = null} = {}) {
  if ( !tile || Areas.isLockedAt(entry?.sx ?? tile.x, entry?.sy ?? tile.y) ) return false;   // secret area: say nothing
  const el = document.createElement("div");
  if ( entry ) el._follow = entry;
  el.className = "maul-bubble maul-pixel";
  el.dataset.sx = tile.x;
  el.dataset.sy = tile.y;
  el.innerHTML = (name ? `<span class="maul-bubble-name"></span>` : "") + `<span class="maul-bubble-text"></span>`;
  if ( name ) el.querySelector(".maul-bubble-name").textContent = name;
  el.querySelector(".maul-bubble-text").textContent = text;
  ensureLayer().appendChild(el);
  placeBubble(el);
  if ( voice ) blip(voice, {quiet: true});
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, ms);
}

export const readTime = text => Math.clamp(1800 + text.length * 55, 2200, 7000);
const wait = ms => new Promise(r => setTimeout(r, ms));
const shortName = name => String(name ?? "").replace(/\s*\(.*\)\s*$/, "");

/* -------------------------------------------- */
/*  Resolving speakers                          */
/* -------------------------------------------- */

function speakerTile(ctx, who, chat) {
  if ( who && typeof who === "object" && Number.isFinite(who.x) ) {
    return toSceneTile(ctx.layout, who.floor ?? chat?.floor, who.x, who.y);
  }
  const entry = ctx.entries.find(e => e.ia.id === who);
  return entry ? {x: entry.sx, y: entry.sy} : null;
}

/** The interactable entry for a speaker id (for following + voice), or null. */
function speakerEntry(ctx, who) {
  return typeof who === "string" ? (ctx.entries.find(e => e.ia.id === who) ?? null) : null;
}

function speakerVoice(ctx, who, name) {
  const e = speakerEntry(ctx, who);
  return voiceFor({name: e?.ia.name ?? name, sprite: e?.ia.sprite, kind: e?.ia.kind ?? "npc"});
}

function speakerName(ctx, who, line) {
  if ( line.name ) return line.name;
  if ( who && typeof who === "object" ) return who.name ?? "";
  return shortName(ctx.entries.find(e => e.ia.id === who)?.ia.name);
}

/* -------------------------------------------- */
/*  Main loop: called whenever the player's token moves                   */
/* -------------------------------------------- */

export async function ambientTick(token) {
  const now = Date.now();
  if ( playing || now < quietUntil || now - lastCheck < 400 ) return;
  if ( !game.settings.get(MODULE, "ambientChatter") || isDialogueOpen() ) return;
  lastCheck = now;
  const mallId = canvas.scene?.getFlag(MODULE, "mallId");
  const ctx = await getMallContext(mallId);
  const amb = ctx?.mall?.ambient;
  if ( !amb ) return;
  const gs = canvas.grid.size;
  const d = token.document;
  const at = {x: Math.floor((d.x + d.width * gs / 2) / gs), y: Math.floor((d.y + d.height * gs / 2) / gs)};
  const week = getWeek();
  const cool = (id, ms) => now - (lastPlayed.get(id) ?? 0) > ms;

  // Chats first: they're the good stuff.
  for ( const chat of amb.chats ?? [] ) {
    if ( !cool(chat.id, chat.cooldown ?? CHAT_COOLDOWN) || !meetsRequirements(chat.requires, week) ) continue;
    const c = toSceneTile(ctx.layout, chat.floor, chat.x, chat.y);
    if ( !c || chebyshev(c.x, c.y, at.x, at.y) > (chat.radius ?? 3) ) continue;
    const variants = (chat.variants ?? []).filter(v => meetsRequirements(v.requires, week));
    if ( !variants.length ) continue;
    lastPlayed.set(chat.id, now);
    return playChat(ctx, chat, variants[nextIndex(chat.id, variants.length)]);
  }

  // Then one bark from the nearest NPC that has something to say.
  const candidates = [];
  for ( const bark of amb.barks ?? [] ) {
    const npcEntry = speakerEntry(ctx, bark.npc);
    if ( npcEntry && isConcealed(npcEntry.ia) ) continue;   // hidden critters stay quiet until noticed
    let lines = (bark.lines ?? []).concat(bark.weekLines?.[week] ?? [])
      .filter(l => typeof l === "string" || meetsRequirements(l?.requires, week))
      .map(pageText).filter(Boolean);
    const gossip = nextGossip(ctx.mall, bark.npc, week);      // a gossip with news says so
    if ( gossip ) lines = (gossip.gossip.lures ?? DEFAULT_LURES).map(pageText).filter(Boolean);
    if ( !lines.length || !cool(bark.npc, BARK_COOLDOWN) || !meetsRequirements(bark.requires, week) ) continue;
    const t = speakerTile(ctx, bark.npc);
    if ( !t || Areas.isLockedAt(t.x, t.y) ) continue;
    const dist = chebyshev(t.x, t.y, at.x, at.y);
    if ( dist <= BARK_RANGE ) candidates.push({bark, t, dist, lines});
  }
  // Player-character stand-ins bark their weekly lines (SPEC 22)
  for ( const e of ctx.entries ) {
    if ( e.ia.kind !== "standin" ) continue;
    if ( syncStandin(e) === token || e.offDuty || !cool(e.ia.id, BARK_COOLDOWN) || Areas.isLockedAt(e.sx, e.sy) ) continue;
    const lines = weeklyLinesFor(e.ia.standin.home.characters);
    const dist = chebyshev(e.sx, e.sy, at.x, at.y);
    if ( lines && dist <= BARK_RANGE ) candidates.push({bark: {npc: e.ia.id, chance: 0.6}, t: {x: e.sx, y: e.sy}, dist, lines});
  }
  if ( !candidates.length ) return;
  candidates.sort((a, b) => a.dist - b.dist);
  const {bark, t, lines} = candidates[0];
  if ( Math.random() > (bark.chance ?? 0.6) ) { lastPlayed.set(bark.npc, now - BARK_COOLDOWN / 2); return; }
  lastPlayed.set(bark.npc, now);
  const text = freshLine(`bark:${bark.npc}`, lines);
  say(t, "", text, readTime(text), {entry: speakerEntry(ctx, bark.npc), voice: speakerVoice(ctx, bark.npc)});
  quietUntil = now + GLOBAL_GAP;
}

async function playChat(ctx, chat, variant) {
  playing = true;
  const walkOns = [];
  try {
    const week = getWeek();
    let heard = 0;
    // Nobody talks from thin air (SPEC 18): bare-tile speakers get a temporary walk-on sprite for the chat
    const bare = new Map();
    for ( const line of variant.lines ?? [] ) {
      const who = line?.who;
      if ( !who || typeof who !== "object" || !Number.isFinite(who.x) || !meetsRequirements(line.requires, week) ) continue;
      const t = speakerTile(ctx, who, chat);
      if ( t && !Areas.isLockedAt(t.x, t.y) && !bare.has(`${t.x},${t.y}`) ) bare.set(`${t.x},${t.y}`, {t, sprite: who.sprite});
    }
    if ( bare.size ) {
      const spawned = await Promise.all([...bare.values()].map(b => Live.walkOn(b.t, b.sprite ?? "npc:human:0").catch(() => null)));
      walkOns.push(...spawned.filter(Boolean));
      if ( walkOns.length ) await wait(500);       // let them step in before the first line
    }
    for ( const line of variant.lines ?? [] ) {
      if ( !line?.say || !meetsRequirements(line.requires, week) ) continue;
      const t = speakerTile(ctx, line.who, chat);
      if ( !t ) continue;
      const ms = readTime(line.say);
      const name = speakerName(ctx, line.who, line);
      if ( say(t, name, line.say, ms, {entry: speakerEntry(ctx, line.who), voice: speakerVoice(ctx, line.who, name)}) === false ) continue;
      heard += 1;
      await wait(ms * 0.85);
    }
    const sets = (chat.sets ?? []).concat(variant.sets ?? []);
    if ( heard ) await setFlags(sets, game.user, {kind: "chat", id: chat.id, name: chat.id});
  } finally {
    if ( walkOns.length ) setTimeout(() => walkOns.forEach(w => w.dismiss()), 2500);
    playing = false;
    quietUntil = Date.now() + GLOBAL_GAP;
  }
}

/* -------------------------------------------- */
/*  Gossips: NPCs who pass on rival-team rumours                          */
/* -------------------------------------------- */

const DEFAULT_LURES = ["Psst. Got a minute? I heard something.", "You didn't hear this from me...", "Oh, have I got news for you."];

/** The next rumour this NPC has for this player (in list order, skipping ones they've heard), or null. */
/** Rumours this NPC has told this character this week (pacing, SPEC 17). */
function gossipToldThisWeek(npcId) {
  const r = game.user.getFlag(MODULE, `gossipPace.${safe(npcId)}`);
  return r?.w === getWeek() ? (Number(r.n) || 0) : 0;
}

export function nextGossip(mall, npcId, week) {
  const g = (mall?.ambient?.gossip ?? []).find(x => x.npc === npcId);
  if ( !g ) return null;
  const perWeek = Number.isFinite(Number(g.perWeek)) ? Number(g.perWeek) : 1;
  if ( gossipToldThisWeek(npcId) >= perWeek ) return null;
  const item = (g.items ?? []).find(it => meetsRequirements(it.requires, week) && !hasFlag(`heard-${it.id}`));
  return item ? {gossip: g, item} : null;
}

/** After an NPC's normal lines: share one new rumour, then mark it heard (and set its clue flags). */
export async function tellGossip(mall, ia, week, show) {
  const next = nextGossip(mall, ia.id, week);
  if ( !next ) return false;
  const {shown} = await show({speaker: ia.name, pages: next.item.pages, kind: "npc", sprite: ia.sprite, id: next.item.id});
  if ( !shown ) {                     // every page gated off: skip this rumour quietly, without its clue
    await setFlags([`heard-${next.item.id}`]);
    return false;
  }
  await setFlags([`heard-${next.item.id}`, ...(next.item.sets ?? [])], game.user,
    {kind: "gossip", id: next.item.id, name: ia.name ?? ia.id});
  await game.user.update({[`flags.${MODULE}.gossipPace.${safe(ia.id)}`]: {w: getWeek(), n: gossipToldThisWeek(ia.id) + 1}});
  return true;
}

/* -------------------------------------------- */
/*  Wiring                                      */
/* -------------------------------------------- */

export function registerAmbient() {
  game.settings.register(MODULE, "ambientChatter", {
    name: "MAUL: ambient chatter",
    hint: "NPCs say little things as you walk past, and you overhear conversations. Turn off for a quiet mall.",
    scope: "client", config: true, type: Boolean, default: true
  });
  Hooks.on("canvasPan", repositionAll);
  Hooks.on("canvasTearDown", () => { layer?.replaceChildren(); playing = false; });
}
