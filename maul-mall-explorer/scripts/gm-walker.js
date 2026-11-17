// MAUL Mall Explorer: the GM's one persistent walker (players.json "gm": Aurelius Goldtrail III, Orichalcum's snail rep).
// Zak (17 Nov 2026): "I don't want to keep summoning new sprites every time... I need to be able to just find my old one."
// - One actor: the walker is the GM user's assigned character. If none is assigned, the GM's walker-looking actors
//   (GM-only character actors named like players.json "gm", or assigned to a GM) are offered in a picker, and the
//   chosen one is assigned. Nothing here ever creates or renames an actor.
// - One token: summoning moves the existing token (or places one for that same actor) and deletes every other walker
//   token, on every scene, including tokens of duplicate walker actors. Player characters are never touched.
// - Follows you: opening a mall scene as GM brings your walker to that mall's start (client setting walkerFollows).

import {MODULE, modPath} from "./config.js";
import {displaceToken} from "./dnd.js";
import {fetchJSON, getMall, getLayout} from "./data.js";
import {toSceneTile} from "./grid.js";

const {DialogV2} = foundry.applications.api;
const norm = s => String(s ?? "").trim().toLowerCase();
const bareName = s => norm(s).replace(/\s+(i{1,3}|iv|v|vi{0,3}|jr\.?|sr\.?)$/, "");

export function registerWalker() {
  game.settings.register(MODULE, "walkerFollows", {
    name: "GM walker follows me between malls",
    hint: "GM only: opening a mall scene brings your walker (your assigned character) there, so you never place a new one.",
    scope: "client", config: true, type: Boolean, default: true
  });
}

/** Every actor that looks like a GM walker (never a player's character). */
async function walkerCandidates() {
  let gmName = null;
  try { gmName = (await fetchJSON(modPath("data/players.json"), {optional: true}))?.gm?.character ?? null; } catch(err) { /* none */ }
  const gmIds = new Set(game.users.filter(u => u.isGM && u.character).map(u => u.character.id));
  return game.actors.filter(a => a.type === "character" && !a.hasPlayerOwner
    && (gmIds.has(a.id) || (gmName && bareName(a.name) === bareName(gmName))));
}

/** The walker actor: your assigned character, else pick one of the candidates (and assign it). */
async function resolveWalker({ask = true} = {}) {
  const mine = game.user.character;
  if ( mine && !mine.hasPlayerOwner ) return mine;
  const list = await walkerCandidates();
  if ( !list.length ) {
    if ( ask ) ui.notifications.warn("Mall Explorer: no walker found. Run GM tools → Set up player characters, or assign your walker to your user.");
    return null;
  }
  let actor = list.length === 1 ? list[0] : null;
  if ( !actor ) {
    if ( !ask ) return null;
    const tokensOf = a => game.scenes.reduce((n, s) => n + s.tokens.filter(t => t.actorId === a.id).length, 0);
    const choice = await DialogV2.prompt({
      window: {title: "Which walker is yours?", icon: "fa-solid fa-person-walking"},
      content: `<p>There's more than one walker. Pick the one to keep; it becomes your assigned character. The others stay in
        the Actors sidebar (delete them there if you like), but their tokens are cleared off the maps.</p>
        ${list.map((a, i) => `<label style="display:block;margin:4px 0"><input type="radio" name="walker" value="${a.id}" ${i === 0 ? "checked" : ""}>
          <img src="${a.img}" width="24" height="24" style="vertical-align:middle;border:none"> ${foundry.utils.escapeHTML(a.name)}
          <span class="maul-dim">(${tokensOf(a)} token(s) on maps)</span></label>`).join("")}`,
      ok: {label: "This one", callback: (event, button) => button.form.elements.walker.value},
      rejectClose: false
    });
    actor = game.actors.get(choice) ?? null;
    if ( !actor ) return null;
  }
  await game.user.update({character: actor.id});
  return actor;
}

/**
 * Put your walker on the viewed scene at `pos` (scene px, top-left; default the centre of the view).
 * @returns {Promise<TokenDocument|null>}
 */
export async function summonWalker(pos = null, {ask = true, control = true} = {}) {
  if ( !game.user.isGM || !canvas?.ready ) return null;
  const actor = await resolveWalker({ask});
  if ( !actor ) return null;
  const scene = canvas.scene;
  const gs = canvas.grid.size;
  if ( !pos ) {
    const c = canvas.stage.pivot;
    pos = {x: Math.floor(c.x / gs) * gs, y: Math.floor(c.y / gs) * gs};
  }

  const walkerIds = new Set([actor.id, ...(await walkerCandidates()).map(a => a.id)]);
  const keep = scene.tokens.find(t => t.actorId === actor.id) ?? null;
  // Every other walker token goes, on every scene (this actor's extra copies and any duplicate walker's)
  for ( const s of game.scenes ) {
    const ids = s.tokens.filter(t => walkerIds.has(t.actorId) && t !== keep).map(t => t.id);
    if ( ids.length ) await s.deleteEmbeddedDocuments("Token", ids);
  }

  let doc = keep;
  if ( doc ) await displaceToken(doc, pos);
  else {
    const td = await actor.getTokenDocument({x: pos.x, y: pos.y, lockRotation: true, rotation: 0});
    [doc] = await scene.createEmbeddedDocuments("Token", [td.toObject()]);
  }
  if ( control ) doc?.object?.control({releaseOthers: true});
  return doc ?? null;
}

/** GM fast travel with no walker on this scene yet: bring it straight to the spot. */
export async function summonWalkerToTile(layout, spot) {
  const L = layout?.floors?.[spot.floor];
  if ( !L ) return null;
  const gs = canvas.grid.size;
  const doc = await summonWalker({x: (L.ox + spot.x) * gs, y: (L.oy + spot.y) * gs});
  if ( doc ) canvas.animatePan({x: (L.ox + spot.x + 0.5) * gs, y: (L.oy + spot.y + 0.5) * gs, duration: 250});
  return doc;
}

/** canvasReady (GM): on a mall scene without your walker, bring it to the mall's start. Never asks or creates actors. */
export async function walkerFollowsGM() {
  if ( !game.user.isGM || !canvas?.ready || !game.settings.get(MODULE, "walkerFollows") ) return;
  const mallId = canvas.scene?.getFlag(MODULE, "mallId");
  const actor = game.user.character;
  if ( !mallId || !actor || actor.hasPlayerOwner ) return;
  if ( canvas.scene.tokens.some(t => t.actorId === actor.id) ) return;
  const mall = await getMall(mallId);
  if ( !mall?.start ) return;
  const t = toSceneTile(await getLayout(mall), mall.start.floor, mall.start.x, mall.start.y);
  if ( !t ) return;
  const gs = canvas.grid.size;
  await summonWalker({x: t.x * gs, y: t.y * gs}, {ask: false, control: false});
}
