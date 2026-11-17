// MAUL Mall Explorer: food-court meal of the week (SPEC 12). A stall NPC with `meal: "<chain>"` offers the chain's
// dishes[week % length] after its pages. One meal per character per week, from any stall in any mall. Eating applies
// "Meal: <dish>" as an ActiveEffect on the character (flagged with the week; the GM client removes it when the week
// advances). Free: it's part of the job's meal plan.

import {MODULE, modPath, esc} from "./config.js";
import {fetchJSON} from "./data.js";
import {getWeek} from "./week.js";
import {showDialogue} from "./dialogue.js";
import {logEvent} from "./progress.js";
import {usedThisWeek, markUsed, whisperGM, whoLabel} from "./weekly.js";
import {Sfx} from "./audio.js";
import {effectData} from "./dnd.js";

const {DialogV2} = foundry.applications.api;
// Bonus fields are formula strings; ADD concatenates strings, so a leading "+ " keeps "+2" + "+ 1d4" a valid formula.
const bonusValue = b => `+ ${String(b ?? "1").replace(/^\s*\+\s*/, "")}`;

export async function dishOfTheWeek(chainName) {
  const data = await fetchJSON(modPath("data/meals.json"), {optional: true}).catch(() => null);
  const chain = data?.chains?.[chainName];
  const dishes = Array.isArray(chain?.dishes) ? chain.dishes : [];
  if ( !dishes.length ) return null;
  return {chain: chainName, blurb: chain.blurb ?? "", dish: dishes[getWeek() % dishes.length]};
}

/** After a stall NPC's pages: offer the special. */
export async function offerMeal(ia, {quietIfUsed = false} = {}) {
  if ( !ia?.meal ) return;
  const actor = game.user.character;
  const special = await dishOfTheWeek(ia.meal);
  if ( !special || !actor ) return;
  const {dish} = special;
  const dlg = {speaker: ia.name, kind: ia.kind, sprite: ia.sprite, id: ia.id};
  if ( usedThisWeek(actor, "meal") ) {
    if ( quietIfUsed ) return;
    await showDialogue({...dlg, pages: [`You've already had your meal-plan lunch this week. The ${dish.name} will still be here... probably.`]});
    return;
  }
  const ok = await DialogV2.confirm({
    window: {title: `${ia.meal}: special of the week`, icon: "fas fa-utensils"},
    content: `<p>Order the special?</p><p><strong>${esc(dish.name)}</strong></p><p>${esc(dish.text ?? "")}</p>
      <p class="maul-dim">Free with your meal plan. One meal a week, from any stall.</p>`,
    rejectClose: false,
    modal: true
  });
  if ( !ok ) return;
  if ( usedThisWeek(actor, "meal") ) return;
  try {
    const notes = await applyMeal(actor, dish);
    await markUsed(actor, "meal");
    Sfx.coin();
    await showDialogue({...dlg, pages: [`One ${dish.name}, coming right up! Enjoy.`, ...(notes.length ? [notes.join(" ")] : [])]});
    await logEvent({kind: "meal", id: `meal:${ia.meal}`, name: `Ate ${dish.name}`});
    whisperGM(`<h3>Food court</h3><p><strong>${esc(whoLabel())}</strong> ate <strong>${esc(dish.name)}</strong> from ${esc(ia.meal)}:
      ${esc(dish.text ?? "")}</p>${notes.length ? `<p class="maul-flags">${notes.map(esc).join(" ")}</p>` : ""}`);
  } catch(err) {
    console.error(`${MODULE} | meal failed`, err);
    ui.notifications.error(`The meal didn't go through: ${err.message}`);
  }
}

/** Apply a dish to the character. Returns short notes for the player (temp HP rolled etc.). */
export async function applyMeal(actor, dish) {
  const week = getWeek();
  const changes = [];
  const notes = [];
  const updates = {};
  for ( const fx of dish.effects ?? [] ) {
    switch ( fx?.type ) {
      case "tempHp": {
        const roll = await new Roll(String(fx.formula ?? "1")).evaluate();
        const cur = Number(actor.system?.attributes?.hp?.temp) || 0;
        if ( roll.total > cur ) updates["system.attributes.hp.temp"] = roll.total;
        notes.push(`(+${roll.total} temporary hit points${roll.total > cur ? "" : ", but you already had more"}.)`);
        break;
      }
      case "saveBonus":
        if ( fx.ability ) changes.push({key: `system.abilities.${fx.ability}.bonuses.save`, value: bonusValue(fx.bonus)});
        break;
      case "skillBonus":
        if ( fx.skill ) changes.push({key: `system.skills.${fx.skill}.bonuses.check`, value: bonusValue(fx.bonus)});
        break;
      case "initiative":
        changes.push({key: "system.attributes.init.bonus", value: bonusValue(fx.bonus)});
        break;
      case "speed":
        changes.push({key: "system.attributes.movement.walk", value: Number(fx.feet) || 5});
        break;
      case "resist":
        if ( fx.damage ) changes.push({key: "system.traits.dr.value", value: String(fx.damage)});
        break;
      case "inspiration":
        updates["system.attributes.inspiration"] = true;
        notes.push("(You have Heroic Inspiration.)");
        break;
      default: break;          // "text": description only, the GM adjudicates
    }
  }
  // One meal at a time: replace any earlier meal effect
  const old = actor.effects.filter(e => e.getFlag(MODULE, "meal")).map(e => e.id);
  if ( old.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", old);
  await actor.createEmbeddedDocuments("ActiveEffect", [effectData({
    name: `Meal: ${dish.name}`,
    img: "icons/svg/heal.svg",
    description: `<p>${esc(dish.text ?? "")}</p>`,
    changes,
    flags: {[MODULE]: {meal: true, weekly: week}}
  })]);
  if ( Object.keys(updates).length ) await actor.update(updates);
  return notes;
}
