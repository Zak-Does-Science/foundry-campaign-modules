// MAUL Mall Explorer: GM scene builder. One Scene per mall, movement walls generated from the grid.

import {MODULE, MALLS, PATHS, GRID_PX} from "./config.js";
import {getMall, getLayout, fileExists, clearDataCache} from "./data.js";
import {buildBlockMask, mergeWalls, toSceneTile} from "./grid.js";
import {syncBoothTiles, deleteBoothTiles} from "./week.js";

const FALLBACK_BG = "#23233a";

/** Build or rebuild every mall scene. Returns a short summary per mall. */
export async function buildAllMallScenes() {
  if ( !game.user.isGM ) return [];
  clearDataCache();
  const results = [];
  for ( const id of MALLS ) {
    try {
      results.push(await buildMallScene(id));
    } catch(err) {
      console.error(`${MODULE} | building ${id} failed`, err);
      results.push({id, ok: false, msg: `${id}: failed (${err.message})`});
    }
  }
  await syncBoothTiles();
  for ( const r of results ) (r.ok ? ui.notifications.info : ui.notifications.warn).call(ui.notifications, `Mall Explorer: ${r.msg}`);
  return results;
}

export async function buildMallScene(id) {
  const mall = await getMall(id);
  if ( !mall ) return {id, ok: false, msg: `${id}: data/malls/${id}.json not found, skipped.`};
  if ( !mall.floors?.length ) return {id, ok: false, msg: `${id}: mall has no floors, skipped.`};

  const layout = await getLayout(mall);
  const gs = GRID_PX;
  const W = layout.widthTiles;
  const H = layout.heightTiles;
  const mapPath = PATHS.map(id);
  const hasMap = await fileExists(mapPath);

  // Initial view: centred on the start tile
  const start = mall.start ? toSceneTile(layout, mall.start.floor, mall.start.x, mall.start.y) : null;
  const initial = start
    ? {x: Math.round(start.x * gs + gs / 2), y: Math.round(start.y * gs + gs / 2), scale: 1}
    : {x: Math.round(W * gs / 2), y: Math.round(H * gs / 2), scale: 0.5};

  const sceneData = {
    name: mall.name ?? id,
    navName: mall.name ?? id,
    navigation: true,
    ownership: {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED},   // every player may open the malls
    width: W * gs,
    height: H * gs,
    padding: 0,
    grid: {type: CONST.GRID_TYPES.SQUARE, size: gs, alpha: hasMap ? 0 : 0.25, color: "#ffffff"},
    tokenVision: false,
    fog: {mode: CONST.FOG_EXPLORATION_MODES.DISABLED},
    environment: {darknessLevel: 0, darknessLock: true, globalLight: {enabled: true}},
    initial,
    flags: {[MODULE]: {mallId: id, table: mall.table ?? null, builtAt: Date.now(), layoutComputed: !!layout.computed}}
  };

  // v14: the map image and backdrop colour live on the scene's Level (one level per mall scene)
  const levelData = {background: {src: hasMap ? mapPath : null, color: FALLBACK_BG}};
  let scene = game.scenes.find(s => s.getFlag(MODULE, "mallId") === id);
  if ( scene ) {
    await scene.update(sceneData);
    const level = scene.firstLevel;
    if ( level ) await scene.updateEmbeddedDocuments("Level", [{_id: level.id, ...levelData}]);
    else await scene.createEmbeddedDocuments("Level", [{name: mall.name ?? id, ...levelData}]);
  } else {
    const levelId = foundry.documents.BaseScene.metadata.defaultLevelId;
    scene = await Scene.create({...sceneData, levels: [{_id: levelId, name: mall.name ?? id, ...levelData}], initialLevel: levelId},
      {keepEmbeddedIds: true});
  }

  // Walls: delete our own, then recreate
  const old = scene.walls.filter(w => w.getFlag(MODULE, "generated")).map(w => w.id);
  if ( old.length ) await scene.deleteEmbeddedDocuments("Wall", old);
  const {mask} = buildBlockMask(mall, layout);
  const segs = mergeWalls(mask, W, H);
  const walls = segs.map(([x1, y1, x2, y2]) => ({
    c: [x1 * gs, y1 * gs, x2 * gs, y2 * gs],
    move: CONST.WALL_MOVEMENT_TYPES.NORMAL,
    sight: CONST.EDGE_SENSE_TYPES.NONE,
    light: CONST.EDGE_SENSE_TYPES.NONE,
    sound: CONST.EDGE_SENSE_TYPES.NONE,
    flags: {[MODULE]: {generated: true}}
  }));
  for ( let i = 0; i < walls.length; i += 500 ) {
    await scene.createEmbeddedDocuments("Wall", walls.slice(i, i + 500));
  }

  // Booth tiles get recreated by syncBoothTiles (positions / sprites may have changed)
  await deleteBoothTiles(scene);

  const bits = [`${walls.length} walls`, `${W}x${H} tiles`];
  const lit = await syncLights(scene, layout);
  if ( lit !== null ) bits.push(`${lit} lights`);
  if ( !hasMap ) bits.push("no map png yet (plain background)");
  if ( layout.computed ) bits.push("layout computed (no _layout.json)");
  return {id, ok: true, sceneId: scene.id, msg: `${scene.name} built: ${bits.join(", ")}.`};
}

/**
 * Depth tier (17 Nov 2026): one AmbientLight per lamp / crystal from the layout's `lights` (render_mall.py, in 16-px
 * map pixels). The scene stays globally lit; these only add a soft coloured pool (crystals pulse slowly, candles
 * flicker). Our own lights (flag `generated`) are replaced on every rebuild; hand-placed lights are left alone.
 * Returns the count, or null if the layout has none / lights can't be made (never blocks the build).
 */
async function syncLights(scene, layout) {
  try {
    const old = scene.lights.filter(l => l.getFlag(MODULE, "generated")).map(l => l.id);
    if ( old.length ) await scene.deleteEmbeddedDocuments("AmbientLight", old);
    const list = Array.isArray(layout.lights) ? layout.lights : [];
    if ( !list.length ) return null;
    const k = scene.grid.size / (Number(layout.tilePx) || 16);
    const dist = Number(scene.grid.distance) || 1;           // light radii are in scene distance units
    const data = list.map(l => ({
      x: Math.round(l.x * k),
      y: Math.round(l.y * k),
      walls: false,
      vision: false,
      config: {
        dim: (Number(l.dim) || 2) * dist,
        bright: (Number(l.bright) || 0) * dist,
        color: l.color ?? "#ffd27a",
        alpha: Number(l.alpha) || 0.3,
        luminosity: 0.5,
        attenuation: 0.8,
        coloration: 1,
        animation: l.anim ? {type: l.anim, speed: l.anim === "torch" ? 3 : 1, intensity: l.anim === "torch" ? 2 : 3} : {type: null}
      },
      flags: {[MODULE]: {generated: true, kind: l.kind ?? null}}
    }));
    for ( let i = 0; i < data.length; i += 200 ) {
      await scene.createEmbeddedDocuments("AmbientLight", data.slice(i, i + 200));
    }
    return data.length;
  } catch(err) {
    console.warn(`${MODULE} | ambient lights for ${scene.name} failed (the scene still works without them)`, err);
    return null;
  }
}

/** The scene tile where this character stands "on shift": their homeStores pcSpot in this mall, or null. */
function storeSpot(mall, layout, actor) {
  const norm = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const hs = (mall.homeStores ?? []).find(h => (h.characters ?? []).some(c => norm(c) === norm(actor.name)));
  if ( !hs?.pcSpot ) return null;
  const npc = (mall.interactables ?? []).find(i => i.id === hs.npc);
  const floor = hs.pcSpot.floor ?? npc?.floor;
  return floor ? toSceneTile(layout, floor, hs.pcSpot.x, hs.pcSpot.y) : null;
}

/**
 * Put a token for every player of this mall's table (users flagged table=monday|tuesday with an assigned
 * character) at their own store (homeStores pcSpot), or at the mall's start tile if they have no store,
 * if that character has no token on any mall scene yet (so a player who rode the leyline to the other mall
 * doesn't get a second token back home).
 */
export async function placePlayerTokens() {
  if ( !game.user.isGM ) return;
  let placed = 0;
  const mallSceneList = game.scenes.filter(s => s.getFlag(MODULE, "mallId"));
  const onAMall = actor => mallSceneList.some(s => s.tokens.some(t => t.actorId === actor.id));
  for ( const scene of mallSceneList ) {
    const mall = await getMall(scene.getFlag(MODULE, "mallId"));
    if ( !mall?.start ) continue;
    const layout = await getLayout(mall);
    const start = toSceneTile(layout, mall.start.floor, mall.start.x, mall.start.y);
    if ( !start ) continue;
    const gs = scene.grid.size;
    const users = game.users.filter(u => !u.isGM && u.character && u.getFlag(MODULE, "table") === mall.table);
    const data = [];
    let i = 0;
    for ( const u of users ) {
      const actor = u.character;
      if ( onAMall(actor) ) continue;
      let spot = storeSpot(mall, layout, actor);
      if ( !spot ) { spot = {x: start.x + (i % 4), y: start.y + Math.floor(i / 4)}; i++; }
      const td = await actor.getTokenDocument({x: spot.x * gs, y: spot.y * gs});
      data.push(td.toObject());
    }
    if ( data.length ) await scene.createEmbeddedDocuments("Token", data);
    placed += data.length;
  }
  ui.notifications.info(`Mall Explorer: placed ${placed} player token(s), each at their own store.`);
}

/** Move every player's token in their home mall to their own store (homeStores pcSpot). Away players stay put. */
export async function sendPlayersToStores() {
  if ( !game.user.isGM ) return;
  let moved = 0;
  for ( const scene of game.scenes.filter(s => s.getFlag(MODULE, "mallId")) ) {
    const mall = await getMall(scene.getFlag(MODULE, "mallId"));
    if ( !mall ) continue;
    const layout = await getLayout(mall);
    const gs = scene.grid.size;
    const updates = [];
    for ( const u of game.users.filter(u => !u.isGM && u.character && u.getFlag(MODULE, "table") === mall.table) ) {
      const tok = scene.tokens.find(t => t.actorId === u.character.id);
      const spot = tok ? storeSpot(mall, layout, u.character) : null;
      if ( spot ) updates.push({_id: tok.id, x: spot.x * gs, y: spot.y * gs});
    }
    if ( updates.length ) await scene.updateEmbeddedDocuments("Token", updates, {animate: false, teleport: true});
    moved += updates.length;
  }
  ui.notifications.info(`Mall Explorer: sent ${moved} player token(s) to their stores.`);
}
