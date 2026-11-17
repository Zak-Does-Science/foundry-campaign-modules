// MAUL Mall Explorer: the weekly Goolax healing-potion package (Campaign.md: "Goolax covers health insurance and a
// weekly package of healing potions", issued before every match).
// The active GM's client gives each player character POTIONS_PER_WEEK Potions of Healing once per week of THEIR
// table: when the GM advances that table's week, and on load for anyone who hasn't had this week's package yet.
// Idempotent: actor flag goolaxPotionsWeek = the week last issued.

import {MODULE, esc} from "./config.js";
import {gmTableWeek, TABLES} from "./week.js";
import {itemData} from "./store.js";
import {gmIds} from "./notify.js";

export const POTIONS_PER_WEEK = 2;
const NAME = "Goolax Healing Potion";

let running = false;

export async function issueWeeklyPotions() {
  if ( !game.user.isGM || game.users.activeGM?.id !== game.user.id || running ) return;
  running = true;
  const given = [];
  try {
    for ( const user of game.users.filter(u => !u.isGM && u.character) ) {
      const table = user.getFlag(MODULE, "table");
      if ( !TABLES.includes(table) ) continue;
      const actor = user.character;
      const week = gmTableWeek(table);   // one package per match prepared for
      if ( Number(actor.getFlag(MODULE, "goolaxPotionsWeek")) === week ) continue;
      await addPotions(actor, POTIONS_PER_WEEK, week);
      await actor.setFlag(MODULE, "goolaxPotionsWeek", week);
      given.push(actor.name);
      await ChatMessage.create({
        content: `<div class="maul-chat-card"><h3>Goolax care package</h3><p>Week ${week}: ${POTIONS_PER_WEEK} Potions of
          Healing for <strong>${esc(actor.name)}</strong>, courtesy of Goolax. Stay hydrated. Stay sponsored.</p></div>`,
        whisper: [...new Set([user.id, ...gmIds()])],
        speaker: {alias: "Goolax"}
      }).catch(() => {});
    }
  } catch(err) {
    console.error(`${MODULE} | weekly potions failed`, err);
  } finally {
    running = false;
  }
  if ( given.length ) ui.notifications.info(`Mall Explorer: weekly healing potions sent to ${given.join(", ")}.`);
}

/** Stack onto the character's Goolax potions if they have some, else add a new stack. */
async function addPotions(actor, n, week) {
  const have = actor.items.find(i => i.getFlag(MODULE, "goolaxPotion"));
  if ( have ) {
    await have.update({"system.quantity": (Number(have.system?.quantity) || 0) + n});
    return;
  }
  const data = await itemData({srd: "Potion of Healing", name: NAME, type: "consumable",
    desc: "Regain 2d4 + 2 hit points. Goolax-issued: part of your weekly care package."}, {goolaxPotion: true, week});
  data.name = NAME;
  data.system ??= {};
  data.system.quantity = n;
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, {[MODULE]: {goolaxPotion: true}});
  await actor.createEmbeddedDocuments("Item", [data]);
}
