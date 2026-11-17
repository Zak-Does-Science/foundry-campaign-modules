// MAUL Mall Explorer: the Leyline Operator. A `kind: "leyline"` tube sends the player's token to another mall's
// scene. Leaving your home mall costs LEYLINE_FARE_GP (a round trip); the ride home is free.
// Token moves need GM rights (players can't delete tokens or create them on other scenes), so the player's client
// asks the active GM's client over the module socket, and refunds the fare if that fails.
// State: user.flags["maul-mall-explorer"].leyline = {home, away, paid, fare, from, at}

import {MODULE, MALLS, SOCKET, LEYLINE_FARE_GP, esc} from "./config.js";
import {getMall, getMallContext} from "./data.js";
import {markSeen, logEvent} from "./progress.js";
import {Sfx} from "./audio.js";
import {displaceToken} from "./dnd.js";
import {showDialogue} from "./dialogue.js";
import {notifyGM} from "./notify.js";
import {actorGp, spendGp} from "./shop.js";

const {DialogV2} = foundry.applications.api;

/** How long the player's client waits for the GM's client to move the token. */
const REPLY_TIMEOUT_MS = 20000;

const pending = new Map();

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/** The mall scene built for a mall id, if any. */
function sceneFor(mallId) {
  return game.scenes.find(s => s.getFlag(MODULE, "mallId") === mallId) ?? null;
}

/** The user's home mall id, from their table flag (monday -> galleria, tuesday -> cogskill), or null. */
export async function homeMallId(user = game.user) {
  const table = user?.getFlag(MODULE, "table");
  if ( !table ) return null;
  for ( const id of MALLS ) {
    const mall = await getMall(id);
    if ( mall?.table === table ) return id;
  }
  return null;
}

/** The user's leyline travel state (where they are away at, and whether their round trip is paid). */
export function getLeylineState(user = game.user) {
  return foundry.utils.deepClone(user?.getFlag(MODULE, "leyline") ?? {});
}

/**
 * Destinations listed in this mall's `leyline.destinations` that have a mall JSON with a `leyline` block
 * (the arrival tile) and a built scene.
 */
async function getDestinations(mall) {
  const out = [];
  for ( const id of mall.leyline?.destinations ?? [] ) {
    if ( id === mall.id ) continue;
    const ctx = await getMallContext(id);
    const arrive = ctx?.mall?.leyline;
    if ( !arrive ) {
      console.warn(`${MODULE} | leyline destination ${id} has no mall JSON or no "leyline" block; skipped`);
      continue;
    }
    const L = ctx.layout.floors?.[arrive.floor];
    const scene = sceneFor(id);
    if ( !L || !scene ) {
      console.warn(`${MODULE} | leyline destination ${id}: ${L ? "scene not built" : `unknown floor ${arrive.floor}`}; skipped`);
      continue;
    }
    out.push({id, name: ctx.mall.name ?? id, sceneId: scene.id, tx: L.ox + arrive.x, ty: L.oy + arrive.y,
      ownFare: Number.isFinite(arrive.fare) ? arrive.fare : null, fareNote: arrive.fareNote ?? null});
  }
  return out;
}

/* -------------------------------------------- */
/*  Player side                                 */
/* -------------------------------------------- */

/** Entry point from an interaction with a `kind: "leyline"` interactable (the tube). */
export async function openLeylineFlow({entry, ctx, token, pages}) {
  const ia = entry.ia;
  const here = ctx.mall;
  const speaker = ia.name ?? "Leyline Tube";
  const say = lines => showDialogue({speaker, pages: lines, kind: "leyline", sprite: ia.sprite, id: ia.id});
  await markSeen(ia.id);

  const {completed} = await say(pages);
  if ( !completed ) return;

  const dests = await getDestinations(here);
  if ( !dests.length ) {
    await say(["The tube hums politely, but the departures board is blank. No rides today."]);
    return;
  }

  const isGM = game.user.isGM;
  const home = await homeMallId();
  for ( const d of dests ) d.fare = (isGM || d.id === home) ? 0 : (d.ownFare ?? LEYLINE_FARE_GP);
  const actor = game.user.character;

  if ( !isGM && !game.users.activeGM ) {
    await say(["The hatch is locked. A little sign: 'BACK IN FIVE MINUTES.' (Leyline trips need the DM to be online.)"]);
    return;
  }

  const dest = await chooseDestination(here, dests, actor, home);
  if ( !dest ) return;

  if ( dest.fare > 0 ) {
    if ( !actor ) {
      ui.notifications.warn("You need an assigned character to pay the leyline fare. Ask the DM to assign yours (User Configuration).");
      return;
    }
    const gp = actorGp(actor);
    if ( gp < dest.fare ) {
      await say([`The hatch blinks red: 'FARE ${dest.fare} GP.' ${actor.name} has ${gp} gp. Maybe a closer adventure today.`]);
      return;
    }
  }

  // Pay, travel, refund if the move failed
  try {
    if ( dest.fare > 0 ) await spendGp(actor, dest.fare);
  } catch(err) {
    console.error(`${MODULE} | leyline payment failed`, err);
    ui.notifications.error(`Leyline payment failed: ${err.message}`);
    return;
  }
  const req = {
    type: "leyline",
    requestId: foundry.utils.randomID(),
    userId: game.user.id,
    actorId: token.document.actorId,
    tokenId: token.document.id,
    fromSceneId: token.document.parent?.id,
    toSceneId: dest.sceneId,
    tx: dest.tx,
    ty: dest.ty
  };
  const result = await requestTravel(req);
  if ( !result.ok ) {
    if ( dest.fare > 0 ) await spendGp(actor, -dest.fare).catch(err => console.error(`${MODULE} | refund failed`, err));
    ui.notifications.error(`The leyline fizzled: ${result.error ?? "unknown error"}.${dest.fare > 0 ? " Your fare was refunded." : ""}`);
    return;
  }

  // Remember where they are (and that the round trip is paid)
  const prev = getLeylineState();
  const goingHome = !!home && dest.id === home;
  const state = goingHome
    ? {home, away: null, paid: false, fare: 0, from: here.id, at: Date.now()}
    : {home, away: dest.id, paid: dest.fare > 0 || !!prev.paid, fare: dest.fare, from: here.id, at: Date.now()};
  await game.user.update({[`flags.${MODULE}.leyline`]: state});
  Sfx.whoosh();
  await logEvent({kind: "warp", id: ia.id, name: `Leyline to ${dest.name}`});

  const who = actor?.name ? `${game.user.name} (${actor.name})` : game.user.name;
  const how = dest.fare > 0 ? `paid ${dest.fare} gp for a round trip` : (goingHome ? "ride home, free" : "free ride");
  await notifyGM({
    text: `\u{1F687} ${who} rode the leyline from ${here.name ?? here.id} to ${dest.name} (${how}).`,
    html: `<div class="maul-chat-card"><h3>Leyline trip</h3><p><strong>${esc(who)}</strong> rode the leyline from
      <strong>${esc(here.name ?? here.id)}</strong> to <strong>${esc(dest.name)}</strong> (${esc(how)}).</p></div>`,
    webhook: false
  });

  await viewDestination(dest.sceneId, req.actorId);
}

/** Ask which mall to ride to (one button per destination). Returns the destination or null. */
async function chooseDestination(here, dests, actor, home) {
  const fareNote = d => {
    if ( d.fare > 0 ) return `${d.fare} gp round trip, paid now; the ride back home is free`;
    if ( d.id === home ) return "free: you're heading home";
    return d.fareNote ?? "free";
  };
  const rows = dests.map(d => `<li><strong>${esc(d.name)}</strong>: ${esc(fareNote(d))}</li>`).join("");
  const purse = actor ? `<p>${esc(actor.name)} has ${actorGp(actor)} gp.</p>` : "";
  const choice = await DialogV2.wait({
    window: {title: "Ride the leyline?", icon: "fas fa-train-subway"},
    content: `<p>One rider at a time from <strong>${esc(here.name ?? here.id)}</strong> to:</p><ul>${rows}</ul>${purse}`,
    buttons: [
      ...dests.map((d, i) => ({action: d.id, label: `${d.name}${d.fare > 0 ? ` (${d.fare} gp)` : ""}`, default: i === 0})),
      {action: "cancel", label: "Not today"}
    ],
    rejectClose: false,
    modal: true
  });
  return dests.find(d => d.id === choice) ?? null;
}

/** Move the token: directly if this user is a GM, else via the active GM's client. */
async function requestTravel(req) {
  if ( game.user.isGM ) {
    try {
      await performTravel(req);
      return {ok: true};
    } catch(err) {
      console.error(`${MODULE} | leyline travel failed`, err);
      return {ok: false, error: err.message};
    }
  }
  const reply = await new Promise(resolve => {
    const timer = setTimeout(() => {
      pending.delete(req.requestId);
      resolve({ok: false, error: "no reply from the DM's client", timedOut: true});
    }, REPLY_TIMEOUT_MS);
    pending.set(req.requestId, msg => {
      clearTimeout(timer);
      resolve(msg);
    });
    game.socket.emit(SOCKET, req);
  });
  // A late reply may still have moved the token: trust the destination scene over the timeout
  if ( reply.timedOut && game.scenes.get(req.toSceneId)?.tokens.some(t => t.actorId === req.actorId) ) return {ok: true};
  return reply;
}

/** Switch this client to the destination scene and select + centre the arrived token. */
async function viewDestination(sceneId, actorId) {
  const scene = game.scenes.get(sceneId);
  if ( !scene ) {
    ui.notifications.warn("Mall Explorer: you've arrived, but this client can't open that scene. Ask the DM to pull you to it.");
    return;
  }
  Hooks.once("canvasReady", () => {
    const t = canvas.tokens.placeables.find(p => p.document.actorId === actorId && p.document.isOwner);
    if ( !t ) return;
    t.control({releaseOthers: true});
    canvas.animatePan({x: t.center.x, y: t.center.y, duration: 250});
  });
  await scene.view();
}

/* -------------------------------------------- */
/*  GM side                                     */
/* -------------------------------------------- */

/**
 * Put the traveller's token on the destination scene at scene tile (tx, ty) and remove it from the old scene.
 * Reuses a linked token already on the destination instead of making a duplicate.
 */
async function performTravel({userId, actorId, tokenId, fromSceneId, toSceneId, tx, ty}) {
  const user = game.users.get(userId);
  const from = game.scenes.get(fromSceneId);
  const to = game.scenes.get(toSceneId);
  if ( !user ) throw new Error("unknown user");
  if ( !from?.getFlag(MODULE, "mallId") || !to?.getFlag(MODULE, "mallId") ) throw new Error("mall scene not found (rebuild the mall scenes)");
  const oldTok = from.tokens.get(tokenId) ?? null;
  const actor = oldTok?.actor ?? game.actors.get(actorId);
  if ( !actor ) throw new Error("no token or character to send");
  if ( !actor.testUserPermission(user, "OWNER") ) throw new Error(`${user.name} doesn't own ${actor.name}`);

  const gs = to.grid.size;
  const pos = {x: Math.round(tx * gs), y: Math.round(ty * gs), hidden: false};
  const linked = oldTok ? oldTok.actorLink : true;
  const already = linked ? to.tokens.find(t => t.actorLink && t.actorId === actorId) : null;
  if ( already ) await displaceToken(already, pos);
  else {
    const data = oldTok ? oldTok.toObject() : (await actor.getTokenDocument()).toObject();
    delete data._id;
    Object.assign(data, pos);
    const level = to.firstLevel?.id;               // v14 scene levels: put the token on the mall's (only) level
    if ( level ) data.level = level;
    await to.createEmbeddedDocuments("Token", [data]);
  }
  if ( oldTok ) await from.deleteEmbeddedDocuments("Token", [oldTok.id]);

  // Make sure the traveller is allowed to view the destination scene
  try {
    if ( !to.testUserPermission(user, "LIMITED") ) {
      await to.update({[`ownership.${user.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED});
    }
  } catch(err) {
    console.warn(`${MODULE} | could not grant ${user.name} access to ${to.name}`, err);
  }
}

/** Socket: the active GM moves tokens for players; players receive the reply. Call once on ready. */
export function registerLeylineSocket() {
  game.socket.on(SOCKET, async msg => {
    if ( msg?.type === "leyline-done" ) {
      if ( msg.userId !== game.user.id ) return;
      const resolve = pending.get(msg.requestId);
      pending.delete(msg.requestId);
      resolve?.(msg);
      return;
    }
    if ( msg?.type !== "leyline" ) return;
    if ( game.user !== game.users.activeGM ) return;
    let reply;
    try {
      await performTravel(msg);
      reply = {ok: true};
    } catch(err) {
      console.error(`${MODULE} | leyline travel for ${msg.userId} failed`, err);
      reply = {ok: false, error: err.message};
    }
    game.socket.emit(SOCKET, {type: "leyline-done", requestId: msg.requestId, userId: msg.userId, ...reply});
  });
}
