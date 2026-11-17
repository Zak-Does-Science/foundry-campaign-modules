// MAUL Mall Explorer: the Bastion turn (SPEC 11). Talking to your own store's coworker (mall JSON `homeStores`) as one
// of its characters: a greeting by the table's last match result, then one favour per character per week. A visible
// flat d20 luck roll decides how it went; nothing ever costs anything. Every outcome is logged and whispered to the GM.

import {MODULE, esc} from "./config.js";
import {showDialogue} from "./dialogue.js";
import {setFlags, hasFlag, meetsRequirements, logEvent} from "./progress.js";
import {getWeek} from "./week.js";
import {spendGp} from "./shop.js";
import {lastResult, usedThisWeek, markUsed, publicRoll, whisperGM, whoLabel, pickOne} from "./weekly.js";
import {Sfx} from "./audio.js";
import {effectData} from "./dnd.js";
import {openFeedback} from "./feedback.js";
import {CoworkersApp} from "./coworkers.js";
import {editWeeklyLines} from "./pc.js";

const {DialogV2} = foundry.applications.api;
const CODEX = "maul-campaign-codex";

const DEFAULT_GREET = {
  win: ["You're back! Everyone's still buzzing about the match. What can I do for our champion?"],
  loss: ["Hey. Rough one. Shake it off; the shop's still standing. Need a hand with anything?"],
  none: ["Oh good, you're on shift. Need anything before the next match?"]
};
const DUDS = [
  "Your coworker 'researched' them all afternoon and found... a coupon. Two-for-one Grab Grass. Nice?",
  "They asked around. Mostly people wanted to talk about their own cousins. Nothing useful.",
  "They came back with a team flyer. It's a flyer. Very glossy, though."
];
const ACTIONS = [
  {action: "scrounge", label: "Scrounge gold", icon: "fas fa-coins"},
  {action: "research", label: "Research a team", icon: "fas fa-magnifying-glass"},
  {action: "gossip", label: "Gather gossip", icon: "fas fa-comments"},
  {action: "tinker", label: "Tinker with gear", icon: "fas fa-wrench"}
];

const rnd = arr => arr[Math.floor(Math.random() * arr.length)];
const ARMOR_TYPES = new Set(["light", "medium", "heavy", "shield"]);

function codexApi() {
  const mod = game.modules.get(CODEX);
  return mod?.active ? mod.api ?? null : null;
}

/** The homeStores entry whose coworker is this NPC and whose characters include the user's character, or null. */
export function findHomeStore(mall, ia, user = game.user) {
  const name = String(user?.character?.name ?? "").trim().toLowerCase();
  if ( !name || !ia ) return null;
  return (mall?.homeStores ?? []).find(h => h?.npc === ia.id
    && (h.characters ?? []).some(c => String(c).trim().toLowerCase() === name)) ?? null;
}

/** The homeStores entry that lists this user's character (any coworker), or null. */
export function findHomeStoreFor(mall, user = game.user) {
  const name = String(user?.character?.name ?? "").trim().toLowerCase();
  if ( !name ) return null;
  return (mall?.homeStores ?? []).find(h => (h?.characters ?? []).some(c => String(c).trim().toLowerCase() === name)) ?? null;
}

/** Can this user take a Bastion turn with this NPC right now? */
export function bastionAvailable(mall, ia) {
  const actor = game.user.character;
  return !!actor && !!findHomeStore(mall, ia) && !usedThisWeek(actor, "bastion");
}

/**
 * Run the Bastion turn. Returns true if it ran (greeting shown), false if the player backed out at the greeting.
 */
export async function runBastion({ia, ctx, home}) {
  const actor = game.user.character;
  const dlg = {speaker: ia.name, kind: "npc", sprite: ia.sprite, id: ia.id};
  const table = game.user.getFlag(MODULE, "table") || ctx.mall.table;
  const result = lastResult(table);
  const greet = home.greet?.[result]?.length ? home.greet[result] : DEFAULT_GREET[result];
  const {completed} = await showDialogue({...dlg, pages: greet});
  if ( !completed ) return false;

  const action = await DialogV2.wait({
    window: {title: `${home.store ?? "Your store"}: your Bastion turn`, icon: "fas fa-store"},
    content: `<p>Once a week, ask ${esc(shortName(ia.name))} for one favour.</p>`,
    buttons: [...ACTIONS.map((a, i) => ({...a, default: i === 0})),
      {action: "lines", label: "Set what I say this week", icon: "fa-solid fa-comment"},
      {action: "suggest", label: "Suggest a change to our store", icon: "fa-solid fa-pen"},
      {action: "coworkers", label: "Coworkers", icon: "fa-solid fa-people-group"},
      {action: "later", label: "Not now"}],
    rejectClose: false,
    modal: true
  });
  if ( action === "lines" ) {                        // doesn't use the weekly turn either
    await editWeeklyLines(home);
    return true;
  }
  if ( action === "coworkers" ) {                    // doesn't use the weekly turn (SPEC 27)
    await CoworkersApp.open({mall: ctx.mall, home});
    return true;
  }
  if ( action === "suggest" ) {                      // doesn't use the weekly turn
    await openFeedback({home});
    return true;
  }
  if ( !action || action === "later" || usedThisWeek(actor, "bastion") ) return true;

  // Choose a target first where the favour needs one (a back-out here doesn't use the turn)
  let target = null;
  if ( action === "research" ) {
    const teams = researchTargets(ctx.mall);
    if ( teams.length ) {
      target = await pickOne("Research a team", "<p>Which team should your coworker look into?</p>",
        teams.map(t => ({value: t.slug, label: t.name})), {okLabel: "Look into them"});
      if ( !target ) return true;
      target = teams.find(t => t.slug === target);
    }
  }
  if ( action === "tinker" ) {
    const gear = tinkerableItems(actor);
    if ( !gear.length ) {
      await showDialogue({...dlg, pages: ["You don't have any weapons or armour on you to tinker with. Bring something next time!"]});
      return true;
    }
    const id = await pickOne("Tinker with gear", "<p>Which piece of gear?</p>",
      gear.map(i => ({value: i.id, label: i.name})), {okLabel: "Tinker"});
    if ( !id ) return true;
    target = actor.items.get(id);
    if ( !target ) return true;
  }

  await markUsed(actor, "bastion");
  Sfx.confirm();
  const flavour = home.flavour?.[action];
  if ( Array.isArray(flavour) && flavour.length ) await showDialogue({...dlg, pages: [rnd(flavour)]});
  const label = ACTIONS.find(a => a.action === action)?.label ?? action;
  const luck = (await publicRoll("1d20", `Bastion turn at ${home.store ?? "the store"}: ${label} (luck roll)`, actor)).total;

  let outcome;
  try {
    if ( action === "scrounge" ) outcome = await scrounge(actor, luck, home);
    else if ( action === "research" ) outcome = await research(target, luck, ctx);
    else if ( action === "gossip" ) outcome = await gossip(ctx, luck, dlg);
    else outcome = await tinker(actor, target, luck);
  } catch(err) {
    console.error(`${MODULE} | Bastion ${action} failed`, err);
    outcome = {pages: ["Something went sideways. (Mall Explorer error: tell the DM.)"], gm: `failed: ${err.message}`};
  }
  if ( outcome.pages?.length ) await showDialogue({...dlg, pages: outcome.pages});
  await logEvent({kind: "bastion", id: home.id ?? ia.id, name: `Bastion turn: ${label}`, bastion: action, luck, result: outcome.gm});
  whisperGM(`<h3>Bastion turn</h3><p><strong>${esc(whoLabel())}</strong> at ${esc(home.store ?? home.id ?? "their store")}:
    ${esc(label)}, luck <strong>${luck}</strong>. ${esc(outcome.gm ?? "")}</p>`);
  return true;
}

const shortName = name => String(name ?? "your coworker").replace(/\s*\(.*\)\s*$/, "");

/* -------------------------------------------- */
/*  Favours                                     */
/* -------------------------------------------- */

async function scrounge(actor, luck) {
  const formula = luck >= 20 ? "50" : luck >= 15 ? "1d4 * 10 + 10" : luck >= 6 ? "4d6" : "2d4";
  const gp = Number((await publicRoll(formula, "Scrounged gold (gp)", actor)).total) || 0;
  await spendGp(actor, -gp);
  Sfx.coin();
  const line = luck >= 20 ? `Jackpot! A forgotten float bag in the back: ${gp} gp, all yours.`
    : luck >= 15 ? `A good haul from the lost-and-found and some overtime: ${gp} gp.`
    : luck >= 6 ? `Some tips, some couch coins: ${gp} gp.`
    : `A handful of coins from under the counter: ${gp} gp. Better than nothing!`;
  return {pages: [line], gm: `+${gp} gp to ${actor.name}.`};
}

/** Rival teams to research: codex team entries this user can see, else the team ids the mall's gossip mentions. */
function researchTargets(mall) {
  try {
    const teams = codexApi()?.researchTeams?.(game.user);
    if ( Array.isArray(teams) && teams.length ) return teams;
  } catch(err) { console.warn(`${MODULE} | codex team list failed`, err); }
  const ids = new Set();
  for ( const g of mall?.ambient?.gossip ?? [] ) for ( const it of g.items ?? [] ) if ( it.team ) ids.add(it.team);
  return [...ids].sort().map(slug => ({slug, name: slug.replace(/^team-/, "")}));
}

/** A neutral tidbit from the mall's `bastionTidbits` (unheard first). */
async function tidbit(mall) {
  const list = (mall?.bastionTidbits ?? []).map((t, i) => (typeof t === "string" ? {id: `${mall.id}-tidbit-${i}`, text: t}
    : {id: t?.id ?? `${mall.id}-tidbit-${i}`, text: t?.text, requires: t?.requires}))
    .filter(t => t.text && meetsRequirements(t.requires, getWeek()));
  if ( !list.length ) return null;
  const fresh = list.filter(t => !hasFlag(`tidbit-${t.id}`));
  const t = rnd(fresh.length ? fresh : list);
  await setFlags([`tidbit-${t.id}`]);
  return t.text;
}

async function research(team, luck, ctx) {
  const name = team?.name ?? "the other teams";
  if ( luck <= 4 ) return {pages: [rnd(DUDS)], gm: `dud (${name}).`};
  if ( luck >= 12 && team && codexApi()?.requestPersonalResearch ) {
    const fact = await codexApi().requestPersonalResearch(team.slug);
    if ( fact ) {
      Sfx.chime();
      return {pages: [`Your coworker dug up something real about ${name}: "${fact.title}". It's in your codex now, on their page.`],
        gm: `unlocked "${fact.title}" (${team.slug}) for this player.`};
    }
  }
  const text = await tidbit(ctx.mall);
  if ( text ) return {pages: [`Nothing secret about ${name}, but they did hear this:`, text], gm: `tidbit: ${text}`};
  return {pages: [`They asked around about ${name}. Nothing new this week.`], gm: "nothing left to find."};
}

async function gossip(ctx, luck, dlg) {
  const week = getWeek();
  const want = luck >= 15 ? 2 : 1;
  const pool = [];
  for ( const g of ctx.mall?.ambient?.gossip ?? [] ) {
    for ( const it of g.items ?? [] ) {
      if ( it?.id && meetsRequirements(it.requires, week) && !hasFlag(`heard-${it.id}`) ) pool.push(it);
    }
  }
  if ( !pool.length ) return {pages: ["Honestly? It's been quiet. No new rumours this week."], gm: "no unheard rumours left."};
  const told = [];
  for ( let i = 0; i < want && pool.length; i++ ) {
    const it = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    await showDialogue({...dlg, pages: it.pages, id: it.id});
    await setFlags([`heard-${it.id}`, ...(it.sets ?? [])], game.user, {kind: "gossip", id: it.id, name: dlg.speaker ?? ""});
    told.push(it.id);
  }
  return {pages: [], gm: `rumours: ${told.join(", ")}.`};
}

/* -------------------------------------------- */
/*  Tinker                                      */
/* -------------------------------------------- */

function isArmor(item) {
  return item.type === "equipment" && (ARMOR_TYPES.has(item.system?.type?.value) || Number(item.system?.armor?.value) > 0);
}

function tinkerableItems(actor) {
  return (actor?.items ?? []).filter(i => i.type === "weapon" || isArmor(i)).sort((a, b) => a.name.localeCompare(b.name));
}

async function tinker(actor, item, luck) {
  if ( luck <= 9 ) return {pages: [`You polish the ${item.name} until it gleams. Looks great! (No game effect.)`], gm: `polished ${item.name}.`};
  // One Tuned item at a time
  for ( const i of actor.items ) {
    const old = i.effects.filter(e => e.getFlag(MODULE, "tuned")).map(e => e.id);
    if ( old.length ) await i.deleteEmbeddedDocuments("ActiveEffect", old);
  }
  const armor = isArmor(item);
  const ranged = /R$/.test(String(item.system?.type?.value ?? "")) || item.system?.actionType === "rwak";
  const key = armor ? "system.attributes.ac.bonus" : `system.bonuses.${ranged ? "rwak" : "mwak"}.attack`;
  const reroll = luck >= 18;
  const text = armor ? "+1 AC while you wear it, until the week advances."
    : `+1 to attack rolls with it (applied to your ${ranged ? "ranged" : "melee"} weapon attacks while it's equipped), until the week advances.`;
  await item.createEmbeddedDocuments("ActiveEffect", [effectData({
    name: "Tuned",
    img: "icons/svg/upgrade.svg",
    description: `<p>Tuned at your store: ${esc(text)}${reroll ? " Once this match, you may reroll a 1 on an attack with it (tell the GM)." : ""}</p>`,
    transfer: true,
    changes: [{key, value: "+ 1"}],
    flags: {[MODULE]: {tuned: true, weekly: getWeek(), reroll}}
  })]);
  Sfx.chime();
  const pages = [`You and your coworker fine-tune the ${item.name}. It's Tuned: ${text}`];
  if ( reroll ) pages.push("It feels perfect in your hands. Once this match, you may reroll a 1 on an attack with it. (Tell the DM when you use it.)");
  return {pages, gm: `${item.name} Tuned (${armor ? "+1 AC" : "+1 attack"})${reroll ? " + one reroll of a 1 this match" : ""}.`};
}
