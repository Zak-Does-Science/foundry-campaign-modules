// MAUL Mall Explorer: player characters in the malls (SPEC 22, 23 and wardrobes).
// - Sprite keys: pc:<slug> (or pc:<slug>:<form> from a wardrobe) from assets/sprites/live/index.json.
// - Store stand-ins (homeStores[].pcSpot) and their weekly lines (User flag weeklyLines = {week, lines}).
// - The standings board (data/standings.json), the wardrobe picker, and GM "Set up player characters".

import {MODULE, modPath, esc} from "./config.js";
import {fetchJSON} from "./data.js";
import {getWeek} from "./week.js";
import {logEvent} from "./progress.js";
import {recordWriting} from "./writings.js";
import {LIMITS, attachCounters, fitLine} from "./counter.js";
import {showDialogue} from "./dialogue.js";
import {whisperGM, whoLabel} from "./weekly.js";

const {ApplicationV2, DialogV2} = foundry.applications.api;
const INDEX = modPath("assets/sprites/live/index.json");
// Weekly lines are stored in full; only what the stand-in *says* is cut, at LIMITS.line (320) on a word break, and the
// edit dialog counts characters as they type (SPEC 28; the old 90-character save cap silently cut a punchline).

/* -------------------------------------------- */
/*  Names, slugs, sprite keys                   */
/* -------------------------------------------- */

/** "T.U.R.D." -> "turd", "Lenore Evergloom" -> "lenore-evergloom". */
export function pcSlug(name) {
  return String(name ?? "").toLowerCase().replace(/['’.]/g, "").trim()
    .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

const norm = s => String(s ?? "").trim().toLowerCase();
export const nameMatches = (name, list) => !!name && (list ?? []).some(c => norm(c) === norm(name));

/** The user whose assigned character has this name (or one of these names). */
export function userForCharacter(names) {
  const list = Array.isArray(names) ? names : [names];
  return game.users.find(u => u.character && nameMatches(u.character.name, list)) ?? null;
}

/** The wardrobe form chosen for a character (User flag form = {form, week, t}), or null. */
export function formFor(names) {
  const f = userForCharacter(names)?.getFlag(MODULE, "form")?.form;
  return f && f !== "default" ? String(f) : null;
}

let indexCache = null;
export async function spriteIndex() {
  indexCache ??= fetchJSON(INDEX, {optional: true}).catch(() => null);
  const idx = await indexCache;
  if ( !idx ) indexCache = null;
  return idx && typeof idx === "object" ? idx : null;
}

/** The pc:<slug>[:<form>] key for a character name if the index has one, else null. */
export function pcKey(index, name, form = undefined) {
  if ( !index || !name ) return null;
  let slug = pcSlug(name);
  if ( !slug ) return null;
  // "Aurelius Goldtrail III" -> also try "aurelius-goldtrail" (17 Nov 2026: the GM walker showed his portrait)
  const bare = slug.replace(/-(i{1,3}|iv|v|vi{0,3}|jr|sr|esq)$/, "");
  if ( bare !== slug && !Object.keys(index).some(k => k === `pc:${slug}` || k.startsWith(`pc:${slug}:`)) ) slug = bare;
  const f = form === undefined ? formFor([name]) : form;
  if ( f && index[`pc:${slug}:${f}`] ) return `pc:${slug}:${f}`;
  return index[`pc:${slug}`] ? `pc:${slug}` : null;
}

/** Any key -> an index key that exists: exact, else same species, else any human, else any npc. */
export function resolveKey(index, key) {
  if ( !index ) return null;
  if ( key && index[key] ) return key;
  const keys = Object.keys(index);
  const species = String(key ?? "").match(/^npc:([a-z]+)/i)?.[1];
  return (species && keys.find(k => k.startsWith(`npc:${species}:`)))
    ?? keys.find(k => k.startsWith("npc:human:")) ?? keys.find(k => k.startsWith("npc:")) ?? null;
}

/* -------------------------------------------- */
/*  Stand-ins                                   */
/* -------------------------------------------- */

/** Stand-in interactables for a mall's homeStores with a pcSpot (built into the mall context by data.js). */
export function standinEntries(mall, layout, toSceneTile) {
  const out = [];
  for ( const h of mall?.homeStores ?? [] ) {
    if ( !h?.pcSpot || !Array.isArray(h.characters) || !h.characters.length ) continue;
    const npc = (mall.interactables ?? []).find(i => i.id === h.npc);
    const floor = h.pcSpot.floor ?? npc?.floor;
    const t = floor ? toSceneTile(layout, floor, h.pcSpot.x, h.pcSpot.y) : null;
    if ( !t ) continue;
    const name = h.characters[0];
    out.push({
      ia: {id: `standin-${h.id ?? pcSlug(name)}`, kind: "standin", floor, x: h.pcSpot.x, y: h.pcSpot.y, name,
        idle: "breathe", standin: {home: h, character: name}},
      sx: t.x, sy: t.y
    });
  }
  return out;
}

/** Sprite key for a stand-in: the character's own pc sprite (with form), else the store's placeholder by species. */
export function standinKey(index, ia) {
  const s = ia.standin;
  const own = pcKey(index, s.character, formFor(s.home.characters));
  if ( own ) return own;
  return resolveKey(index, s.home.pcSprites?.[s.character] ?? Object.values(s.home.pcSprites ?? {})[0] ?? "npc:human:0");
}

/** Is the stand-in's character here in person (their token is on this scene)? Then the stand-in hides for everyone. */
export function standinAway(ia) {
  if ( ia?.kind !== "standin" || !canvas?.ready ) return false;
  const names = ia.standin.home.characters;
  return canvas.tokens.placeables.some(t => t.actor && nameMatches(t.actor.name, names));
}

/** How far (tiles) from their store spot a player's token still counts as "in the store". */
const STORE_RANGE = 4;

/** The character's own token on this scene, or null. */
export function standinToken(ia) {
  if ( ia?.kind !== "standin" || !canvas?.ready ) return null;
  const names = ia.standin.home.characters;
  return canvas.tokens.placeables.find(t => t.actor && nameMatches(t.actor.name, names)) ?? null;
}

/**
 * Player tokens stand at their own store, which hides the stand-in sprite, so the stand-in's lines move onto the
 * real token: while the character's token is on the scene, the entry sits on that token's tile (E there plays the
 * weekly lines); otherwise it goes back to the store spot. Returns the token, or null.
 */
export function syncStandin(entry) {
  if ( entry?.ia?.kind !== "standin" ) return null;
  entry.homeSx ??= entry.sx;
  entry.homeSy ??= entry.sy;
  const t = standinToken(entry.ia);
  entry.offDuty = false;
  if ( t ) {
    const gs = canvas.grid.size;
    const d = t.document;
    const x = Math.floor((d.x + (d.width * gs) / 2) / gs);
    const y = Math.floor((d.y + (d.height * gs) / 2) / gs);
    // Only at their store: out roaming the mall, they don't shout their shop lines
    entry.offDuty = Math.max(Math.abs(x - entry.homeSx), Math.abs(y - entry.homeSy)) > STORE_RANGE;
    entry.sx = entry.offDuty ? entry.homeSx : x;
    entry.sy = entry.offDuty ? entry.homeSy : y;
  } else {
    entry.sx = entry.homeSx;
    entry.sy = entry.homeSy;
  }
  return t;
}

/** This week's lines for a character, or null. */
export function weeklyLinesFor(names) {
  const wl = userForCharacter(names)?.getFlag(MODULE, "weeklyLines");
  if ( !wl || Number(wl.week) !== getWeek() ) return null;
  const lines = (wl.lines ?? []).map(l => fitLine(l, LIMITS.line)).filter(Boolean);   // stored in full, said up to 320
  return lines.length ? lines : null;
}

/**
 * Weekly lines the old 90-character cap cut off, with the full text the player gave Zak.
 * The active GM's client swaps a cut line for the full one on load; once fixed, nothing matches and it does nothing.
 */
const CUT_LINE_FIXES = [
  {character: "Hallory Clampton",
    cut: "Ladies and gentlemen, everything in this store is 50% off! Except my husband, Will Clampto",
    full: "Ladies and gentlemen, everything in this store is 50% off! Except my husband, Will Clampton. He's been giving it away for FREE!"}
];

export async function restoreCutLines() {
  if ( !game.user.isGM || game.users.activeGM?.id !== game.user.id ) return;
  for ( const fix of CUT_LINE_FIXES ) {
    const user = userForCharacter(fix.character);
    const wl = user?.getFlag(MODULE, "weeklyLines");
    if ( !Array.isArray(wl?.lines) || !wl.lines.includes(fix.cut) ) continue;
    const lines = wl.lines.map(l => (l === fix.cut ? fix.full : l));
    await user.setFlag(MODULE, "weeklyLines", {...wl, lines});
    console.log(`${MODULE} | restored ${fix.character}'s cut-off weekly line`);
  }
}

/** Clicking (E) a stand-in. */
export async function talkToStandin(entry) {
  const s = entry.ia.standin;
  const lines = weeklyLinesFor(s.home.characters);
  const pages = lines ?? [`${s.character} is busy restocking. Come back later!`];
  await showDialogue({speaker: s.character, pages, kind: "npc", id: entry.ia.id});
  await logEvent({kind: "talk", id: entry.ia.id, name: `${s.character} (stand-in)`});
}

/** Bastion: "Set what I say this week". */
export async function editWeeklyLines(home) {
  const actor = game.user.character;
  if ( !actor ) return;
  const cur = game.user.getFlag(MODULE, "weeklyLines");
  const old = Number(cur?.week) === getWeek() ? (cur.lines ?? []) : [];
  const inputs = [0, 1, 2].map(i => `<div class="form-group stacked"><input type="text" name="line${i}" data-max="${LIMITS.line}" data-soft
    data-over="your stand-in will say the first ${LIMITS.line} characters; Zak keeps the whole line."
    value="${esc(old[i] ?? "")}" placeholder="Line ${i + 1}"></div>`).join("");
  const lines = await DialogV2.prompt({
    window: {title: "What I say this week", icon: "fa-solid fa-comment"},
    position: {width: 460},
    content: `<p>Up to three short lines your stand-in at ${esc(home?.store ?? "your store")} says this week, when people click
      it or walk past. Up to about ${LIMITS.line} characters each get said; anything longer is still saved for Zak.</p>${inputs}`,
    render: (event, dialog) => attachCounters(dialog.element),
    ok: {label: "Save", callback: (event, button) => [0, 1, 2]
      .map(i => String(button.form.elements[`line${i}`]?.value ?? "").replace(/\s+/g, " ").trim())},
    rejectClose: false,
    modal: true
  });
  if ( !lines ) return;
  const kept = lines.filter(Boolean);
  await game.user.setFlag(MODULE, "weeklyLines", {week: getWeek(), lines: kept});
  await logEvent({kind: "lines", id: home?.id ?? null, name: "Set my weekly lines", lines: kept});
  if ( kept.length ) await recordWriting({form: "weekly-lines", title: `What I say this week at ${home?.store ?? "my store"}`,
    fields: Object.fromEntries(kept.map((l, i) => [`Line ${i + 1}`, l]))});
  ui.notifications.info(kept.length ? "Saved! Your stand-in will say that this week." : "Cleared your lines for this week.");
}

/* -------------------------------------------- */
/*  Wardrobe                                    */
/* -------------------------------------------- */

export async function openWardrobe(entry, pages) {
  const ia = entry.ia;
  const w = ia.wardrobe ?? {};
  const {completed} = await showDialogue({speaker: ia.name, pages, kind: ia.kind, sprite: ia.sprite, id: ia.id});
  const actor = game.user.character;
  if ( !completed || !actor || !w.character || !nameMatches(actor.name, [w.character]) ) return;
  const forms = [...new Set(["default", ...(Array.isArray(w.forms) ? w.forms.map(String) : [])])];
  const index = await spriteIndex();
  const slug = pcSlug(w.character);
  const current = game.user.getFlag(MODULE, "form")?.form ?? "default";
  const preview = f => {
    const info = index?.[f === "default" ? `pc:${slug}` : `pc:${slug}:${f}`] ?? index?.[`pc:${slug}`];
    if ( !info?.file ) return "";
    const fw = Number(info.fw) || 16, fh = Number(info.fh) || 16, n = Math.max(1, Number(info.frames) || 1);
    return `<span class="maul-form-preview" style="width:${fw * 3}px;height:${fh * 3}px;background-image:url('${esc(modPath(`assets/sprites/live/${info.file}`))}');background-size:${fw * 3 * n}px ${fh * 3}px"></span>`;
  };
  const choice = await DialogV2.wait({
    window: {title: ia.name ?? "Wardrobe", icon: "fa-solid fa-shirt"},
    content: `<p>Which look for ${esc(actor.name)}? It stays until you change it again.</p>
      <div class="maul-forms">${forms.map(f => `<div class="maul-form${f === current ? " current" : ""}">${preview(f)}<span>${esc(f)}</span></div>`).join("")}</div>`,
    buttons: [...forms.map(f => ({action: `form:${f}`, label: f, default: f === current})), {action: "cancel", label: "Never mind"}],
    rejectClose: false,
    modal: true
  });
  if ( !choice?.startsWith?.("form:") ) return;
  const form = choice.slice(5);
  await game.user.setFlag(MODULE, "form", {form, week: getWeek(), t: Date.now()});
  await logEvent({kind: "form", id: ia.id, name: `Changed look to ${form}`, form});
  whisperGM(`<h3>Wardrobe</h3><p><strong>${esc(whoLabel())}</strong> changed ${esc(actor.name)}'s look to <strong>${esc(form)}</strong>.</p>`);
}

/* -------------------------------------------- */
/*  Standings board                             */
/* -------------------------------------------- */

const TABLE_TEAM = {monday: "galleria", tuesday: "cogskill"};

export class StandingsApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "maul-standings",
    classes: ["maul-app", "maul-standings", "maul-pixel"],
    tag: "div",
    window: {title: "MALL BRAWL standings", icon: "fa-solid fa-trophy", resizable: true},
    position: {width: 560, height: 620}
  };

  async _prepareContext() {
    let data = null;
    try {                                   // always fresh: Claude updates it between sessions
      const res = await fetch(modPath("data/standings.json"), {cache: "no-cache"});
      if ( res.ok ) data = await res.json();
    } catch(err) { data = null; }
    return {data, mine: TABLE_TEAM[game.user.getFlag(MODULE, "table")] ?? null};
  }

  async _renderHTML({data, mine}) {
    if ( !data ) return `<p><em>The standings board is blank today.</em></p>`;
    const rows = [...(data.table ?? [])].sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0)
      || String(a.name).localeCompare(String(b.name)));
    const table = rows.map((r, i) => `<tr class="${r.team === mine ? "mine" : ""}">
      <td>${i + 1}</td><td><span class="maul-chip" style="background:${esc(r.color ?? "#888")}"></span> ${esc(r.name ?? r.team)}</td>
      <td>${Number(r.played) || 0}</td><td>${Number(r.points) || 0}</td><td class="maul-dim">${esc(r.note ?? "")}</td></tr>`).join("");
    const nameOf = id => rows.find(r => r.team === id)?.name ?? id;
    const weeks = [...(data.weeks ?? [])].sort((a, b) => (Number(b.week) || 0) - (Number(a.week) || 0)).map(w => {
      const res = (w.results ?? []).map(r => {
        const teams = (r.teams ?? []).map(t => `<span class="${t === mine ? "mine" : ""}">${esc(nameOf(t))}</span>`);
        const scores = (r.scores ?? []).join(" - ");
        return `<li>${teams.join(" vs ")}${scores ? ` <strong>${esc(scores)}</strong>` : ""}${r.note ? `<div class="maul-dim">${esc(r.note)}</div>` : ""}</li>`;
      }).join("");
      return `<section class="maul-week"><h3>${esc(w.title ?? `Week ${w.week}`)}${w.date ? ` <span class="maul-dim">${esc(w.date)}</span>` : ""}</h3>
        ${w.summary ? `<p>${esc(w.summary)}</p>` : ""}${res ? `<ul>${res}</ul>` : ""}</section>`;
    }).join("");
    return `<h2>${esc(data.season ?? "MALL BRAWL")}</h2>
      <table class="maul-users"><thead><tr><th>#</th><th>Team</th><th>P</th><th>Pts</th><th></th></tr></thead><tbody>${table}</tbody></table>
      ${weeks}`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }
}

export async function openStandings(entry, pages) {
  const ia = entry.ia;
  const {completed} = await showDialogue({speaker: ia.name, pages, kind: "sign", sprite: ia.sprite, id: ia.id});
  if ( !completed ) return;
  const open = foundry.applications.instances.get("maul-standings");
  if ( open ) await open.render({force: true});
  else await new StandingsApp().render({force: true});
  await logEvent({kind: "standings", id: ia.id, name: "Read the standings board"});
}

/* -------------------------------------------- */
/*  GM: Set up player characters                */
/* -------------------------------------------- */

/**
 * Walking characters never turn to face where they move (Zak, 17 Nov 2026: tokens spun and looked upside down).
 * Active GM, on load: lock rotation and reset it to 0 on every player character's (and the GM walker's) prototype
 * and placed tokens. Cheap no-op once done.
 */
export async function lockCharacterRotation() {
  if ( !game.user.isGM || game.users.activeGM?.id !== game.user.id ) return;
  const walkers = new Set(game.users.filter(u => u.character).map(u => u.character.id));
  for ( const a of game.actors ) if ( a.type === "character" && a.hasPlayerOwner ) walkers.add(a.id);
  for ( const id of walkers ) {
    const actor = game.actors.get(id);
    if ( actor && !actor.prototypeToken?.lockRotation ) await actor.update({"prototypeToken.lockRotation": true});
  }
  for ( const scene of game.scenes ) {
    const updates = scene.tokens.filter(t => walkers.has(t.actorId) && (!t.lockRotation || t.rotation))
      .map(t => ({_id: t.id, lockRotation: true, rotation: 0}));
    if ( updates.length ) await scene.updateEmbeddedDocuments("Token", updates, {animate: false});
  }
}

export async function setupPlayerCharacters() {
  if ( !game.user.isGM ) return;
  let file;
  try {
    const res = await fetch(modPath("data/players.json"), {cache: "no-cache"});
    if ( !res.ok ) throw new Error(String(res.status));
    file = await res.json();
  } catch(err) { ui.notifications.error("Mall Explorer: data/players.json could not be read."); return; }
  const L = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const report = [];
  for ( const p of file?.players ?? [] ) {
    const user = game.users.getName(String(p.name ?? "").trim());
    if ( !p.character ) { report.push(`${p.name}: no character in players.json, skipped`); continue; }
    if ( !user ) { report.push(`${p.name}: no Foundry user yet (press Create player users first)`); continue; }
    let actor = game.actors.find(a => a.type === "character" && norm(a.name) === norm(p.character));
    const proto = {name: p.character, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
      displayName: CONST.TOKEN_DISPLAY_MODES.HOVER, lockRotation: true};
    if ( p.token ) proto.texture = {src: p.token};
    let what;
    if ( !actor ) {
      actor = await Actor.create({name: p.character, type: "character", img: p.token || undefined, prototypeToken: proto,
        ownership: {default: L.LIMITED, [user.id]: L.OWNER}});
      what = "created";
    } else {
      const update = {[`ownership.${user.id}`]: L.OWNER, "ownership.default": L.LIMITED,
        "prototypeToken.actorLink": true, "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.FRIENDLY,
        "prototypeToken.displayName": CONST.TOKEN_DISPLAY_MODES.HOVER, "prototypeToken.lockRotation": true};
      if ( p.token && !actor.prototypeToken?.texture?.src?.includes(p.token) ) update["prototypeToken.texture.src"] = p.token;
      await actor.update(update);
      what = "updated";
    }
    if ( user.character?.id !== actor.id ) {
      let ok = true;
      if ( user.character ) {
        ok = await DialogV2.confirm({window: {title: "Replace assigned character?"},
          content: `<p>${esc(user.name)} is assigned <strong>${esc(user.character.name)}</strong>. Replace with <strong>${esc(actor.name)}</strong>?</p>`,
          rejectClose: false});
      }
      if ( ok ) { await user.update({character: actor.id}); what += ", assigned"; }
      else what += ", NOT assigned (kept their current character)";
    }
    report.push(`${user.name}: ${actor.name} ${what}`);
  }
  // The GM's own walker (players.json "gm"): a character only GMs own, assigned to the GM running this.
  const g = file?.gm;
  if ( g?.character ) {
    let actor = game.actors.find(a => a.type === "character" && norm(a.name) === norm(g.character));
    const proto = {name: g.character, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
      displayName: CONST.TOKEN_DISPLAY_MODES.HOVER, lockRotation: true};
    if ( g.token ) proto.texture = {src: g.token};
    if ( !actor ) {
      actor = await Actor.create({name: g.character, type: "character", img: g.token || undefined, prototypeToken: proto,
        ownership: {default: L.LIMITED}});
      report.push(`GM: ${actor.name} created`);
    } else report.push(`GM: ${actor.name} found`);
    if ( !game.user.character ) { await game.user.update({character: actor.id}); report.push(`GM: assigned to ${game.user.name}`); }
  }
  await DialogV2.prompt({window: {title: "Player characters"}, content: `<ul>${report.map(r => `<li>${esc(r)}</li>`).join("")}</ul>`,
    rejectClose: false});
}
