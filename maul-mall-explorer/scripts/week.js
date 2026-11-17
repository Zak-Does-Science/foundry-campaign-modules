// MAUL Mall Explorer: the current week, the date HUD chip, and pop-up booth Tiles.

import {MODULE, PATHS, esc} from "./config.js";
import {getSchedule, getMall, getLayout, fileExists} from "./data.js";
import {toSceneTile} from "./grid.js";

export const MAX_WEEK = 6;

// Each table runs on its own week (17 Nov 2026: the tables are staggered, so one world-wide week was wrong for one of
// them). World setting weekByTable = {monday: n, tuesday: n}; the old single currentWeek is only the fallback.
export const TABLES = ["monday", "tuesday"];
export const TABLE_OF_MALL = {galleria: "monday", cogskill: "tuesday"};
export const MALL_OF_TABLE = {monday: "galleria", tuesday: "cogskill"};

// TWO NUMBERS (Zak, 17 Nov 2026: "the week is up until the combat. After they complete week 2's combat, I'll turn it to
// week 3"):
// - the GM's week (what GM tools sets and the chip shows) = the match the table is PREPARING for, 1..MAX_WEEK+1;
// - the content week (getWeek / tableWeek / mallWeek) = matches already PLAYED = GM's week - 1, 0..MAX_WEEK.
// All content (booth N opens at content week >= N, weekPages, weekLines, minWeek/maxWeek) was written as "after match N",
// so it reads the content week and stays right.
const clampWeek = w => Math.clamp(Math.round(Number(w) || 0), 0, MAX_WEEK);
export const GM_WEEK_MIN = 1;
export const GM_WEEK_MAX = MAX_WEEK + 1;
const clampGmWeek = w => Math.clamp(Math.round(Number(w) || GM_WEEK_MIN), GM_WEEK_MIN, GM_WEEK_MAX);

function legacyWeek() {
  const w = Number(game.settings.get(MODULE, "currentWeek"));
  return Number.isFinite(w) ? clampWeek(w) : 0;
}

/** One table's GM week: the match they're preparing for. */
export function gmTableWeek(table) {
  const w = Number(game.settings.get(MODULE, "weekByTable")?.[table]);
  return Number.isFinite(w) ? clampGmWeek(w) : clampGmWeek(legacyWeek() + 1);
}

/** One table's content week: matches played. */
export function tableWeek(table) {
  return clampWeek(gmTableWeek(table) - 1);
}

/** A mall's week = its home table's week. */
export function mallWeek(mallId) {
  const table = TABLE_OF_MALL[mallId];
  return table ? tableWeek(table) : legacyWeek();
}

/** Whose week applies here: the mall scene you're on, else your own table. */
export function contextTable() {
  const mallId = canvas?.scene?.getFlag?.(MODULE, "mallId");
  if ( mallId && TABLE_OF_MALL[mallId] ) return TABLE_OF_MALL[mallId];
  const own = game.user?.getFlag?.(MODULE, "table");
  return TABLES.includes(own) ? own : null;
}

/** The content week (matches played) that applies to this client right now (see contextTable). */
export function getWeek(table = contextTable()) {
  return table ? tableWeek(table) : legacyWeek();
}

/** The GM week (match being prepared for) that applies here, for the chip. */
export function getGmWeek(table = contextTable()) {
  return table ? gmTableWeek(table) : clampGmWeek(legacyWeek() + 1);
}

/** GM: set one table's GM week (or both, with no table). */
export async function setWeek(gmWeek, table = null) {
  if ( !game.user.isGM ) return;
  const cur = {...(game.settings.get(MODULE, "weekByTable") ?? {})};
  for ( const t of (table ? [table] : TABLES) ) cur[t] = clampGmWeek(gmWeek);
  cur._prep = true;
  await game.settings.set(MODULE, "weekByTable", cur);
}

/**
 * Once: switch weekByTable to "preparing for match N" values. 17 Nov 2026: Monday has played match 1 and Tuesday plays
 * match 2 tonight, so both are preparing for match 2. The GM advances each table after its match.
 */
export async function migrateWeeks() {
  if ( !game.user.isGM || game.users.activeGM?.id !== game.user.id ) return;
  const cur = game.settings.get(MODULE, "weekByTable") ?? {};
  if ( cur._prep ) return;
  await game.settings.set(MODULE, "weekByTable", {monday: 2, tuesday: 2, _prep: true});
}

/** Text for a GM week (the upcoming match), e.g. "Seluday, 14 Rest 2026 SC · Week 2". */
export async function weekLabel(week = getWeek()) {
  let schedule;
  try { schedule = await getSchedule(); } catch(err) { schedule = null; }
  const w = schedule?.weeks?.find(x => x.week === week);
  if ( !w ) return `Week ${week}`;
  if ( w.chip ) return w.chip;
  const cal = schedule.calendar ?? {};
  const date = w.holiday ? `${w.holiday}, ${w.weekday} ${w.day} ${w.month}` : `${w.weekday}, ${w.day} ${w.month}`;
  const tag = w.label ? ` (${w.label})` : "";
  return `${date} ${cal.year ?? 2026} ${cal.era ?? "SC"} · Week ${week}${tag}`;
}

/* -------------------------------------------- */
/*  HUD chip                                    */
/* -------------------------------------------- */

export async function renderWeekChip() {
  let el = document.getElementById("maul-week-chip");
  if ( !game.settings.get(MODULE, "showWeekChip") ) {
    el?.remove();
    return;
  }
  if ( !el ) {
    el = document.createElement("div");
    el.id = "maul-week-chip";
    el.className = "maul-pixel";
    document.body.appendChild(el);
  }
  const week = getGmWeek();   // the match coming up
  el.innerHTML = `<span class="maul-chip-icon">&#9788;</span> ${esc(await weekLabel(week))}`;
  el.title = game.user.isGM ? "MAUL week (GM: change it in MAUL GM tools)" : "MAUL Mall Brawl calendar";
}

/* -------------------------------------------- */
/*  Booth tiles                                 */
/* -------------------------------------------- */

/** Scenes built by the scene builder, keyed by mall id. */
export function mallScenes() {
  return game.scenes.filter(s => s.getFlag(MODULE, "mallId"));
}

/** Size of a booth sprite in scene px. Art under 64 px wide is assumed to be raw 16 px/tile art and is scaled x4. */
async function spriteSize(src, gs) {
  try {
    const tex = await foundry.canvas.loadTexture(src);
    let w = tex?.width || gs;
    let h = tex?.height || gs;
    if ( w < gs ) {
      const k = gs / 16;
      w *= k;
      h *= k;
    }
    return {w, h};
  } catch(err) {
    return {w: gs, h: gs};
  }
}

/**
 * Create / show / hide booth Tiles on every mall scene: booth N shows once that mall's week > N (match N played).
 * GM only (Tiles need GM rights). Safe to run repeatedly.
 */
export async function syncBoothTiles() {
  if ( !game.user.isGM ) return;
  for ( const scene of mallScenes() ) {
    const mallId = scene.getFlag(MODULE, "mallId");
    if ( !mallId ) continue;
    const week = mallWeek(mallId);
    const mall = await getMall(mallId);
    if ( !mall ) continue;
    const layout = await getLayout(mall);
    const gs = scene.grid.size;
    const creates = [];
    const updates = [];
    for ( const booth of mall.popupBooths ?? [] ) {
      const t = toSceneTile(layout, booth.floor, booth.x, booth.y);
      if ( !t ) continue;
      const hidden = booth.slot > week;   // week = matches played, so booth N opens after match N
      const existing = scene.tiles.find(tile => tile.getFlag(MODULE, "boothSlot") === booth.slot);
      if ( existing ) {
        if ( existing.hidden !== hidden ) updates.push({_id: existing.id, hidden});
        continue;
      }
      const sprite = PATHS.boothSprite(booth.slot);
      const src = (await fileExists(sprite)) ? sprite : PATHS.boothPlaceholder;
      const {w, h} = await spriteSize(src, gs);
      // Anchor bottom-centre of the sprite on the bottom-centre of the booth tile
      const x = Math.round(t.x * gs + gs / 2 - w / 2);
      const y = Math.round(t.y * gs + gs - h);
      creates.push({
        texture: {src}, x, y, width: w, height: h, hidden, locked: true,
        flags: {[MODULE]: {boothSlot: booth.slot, mallId}}
      });
    }
    if ( creates.length ) await scene.createEmbeddedDocuments("Tile", creates);
    if ( updates.length ) await scene.updateEmbeddedDocuments("Tile", updates);
  }
}

/** Remove all booth tiles (used before a rebuild so changed positions / sprites are picked up). */
export async function deleteBoothTiles(scene) {
  const ids = scene.tiles.filter(t => t.getFlag(MODULE, "boothSlot") !== undefined).map(t => t.id);
  if ( ids.length ) await scene.deleteEmbeddedDocuments("Tile", ids);
}
