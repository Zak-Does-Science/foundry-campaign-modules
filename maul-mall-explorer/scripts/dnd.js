// MAUL Mall Explorer: the few dnd5e calls the module makes, written for dnd5e 5.x (Foundry v14) with a runtime
// fallback to the dnd5e 4.0.x signatures. Active-effect changes use the v14 shape (system.changes with string types).

/** dnd5e 4.1+ (and 5.x) use the config-object roll API; 4.0.x uses rollSkill(id, options). */
function newRollApi() {
  const v = String(game.system?.version ?? "0");
  return game.system?.id === "dnd5e" && foundry.utils.isNewerVersion(v, "4.0.99");
}

/**
 * Roll a skill check without the configuration dialog.
 * @param {Actor} actor
 * @param {string} skill            dnd5e skill id (prc, inv, ...)
 * @param {object} [o]
 * @param {string} [o.flavor]
 * @param {"public"|"gm"|"blind"|"self"} [o.messageMode="public"]  v14 chat message mode
 * @returns {Promise<Roll|null>}    The roll, or null if it was cancelled
 */
export async function rollSkill(actor, skill, {flavor, messageMode = "public"} = {}) {
  if ( !actor?.rollSkill ) return null;
  const legacyMode = {public: "publicroll", gm: "gmroll", blind: "blindroll", self: "selfroll"}[messageMode] ?? "publicroll";
  if ( newRollApi() ) {
    const rolls = await actor.rollSkill({skill}, {configure: false},
      {rollMode: legacyMode, messageMode, data: flavor ? {flavor} : {}});
    return Array.isArray(rolls) ? (rolls[0] ?? null) : (rolls ?? null);
  }
  const roll = await actor.rollSkill(skill, {flavor, rollMode: legacyMode, fastForward: true});
  return Array.isArray(roll) ? (roll[0] ?? null) : (roll ?? null);
}

/**
 * Active-effect change entries in the v14 shape: {key, type: "add", value}. `system.changes` on the effect.
 * @param {{key: string, value: any}[]} list
 */
export function addChanges(list) {
  return list.map(({key, value}) => ({key, type: "add", value, phase: "initial"}));
}

/** Effect data with changes in the v14 location (system.changes). */
export function effectData({name, img, description, changes = [], flags = {}, transfer, disabled = false}) {
  const data = {name, img, description, disabled, system: {changes: addChanges(changes)}, flags};
  if ( transfer !== undefined ) data.transfer = transfer;
  return data;
}

/** Remove a key with the v14 ForcedDeletion operator (replaces the deprecated "-=key" syntax). */
export const DEL = () => new foundry.data.operators.ForcedDeletion();

/**
 * Teleport a token (v14 movement API: a "displace" waypoint, through walls). Falls back to a plain position update.
 * @param {TokenDocument} doc
 * @param {{x: number, y: number}} pos   plus any extra token data (e.g. hidden)
 */
export async function displaceToken(doc, pos) {
  // animation.duration 0 makes it instant even if the "displace" action gets lost (16 Nov 2026: stair warps slid
  // across the map at walking speed). Stop any walk in progress first so the jump isn't queued behind it.
  const instant = {animate: false, animation: {duration: 0}, teleport: true,
    constrainOptions: {ignoreWalls: true, ignoreCost: true}};
  try { doc.stopMovement?.(); } catch(err) { /* nothing moving */ }
  try {
    if ( typeof doc.move === "function" ) {
      await doc.move({...pos, action: "displace"}, instant);   // single destination: may carry token data (hidden)
      return;
    }
  } catch(err) {
    console.warn("maul-mall-explorer | token move failed, falling back to update", err);
  }
  await doc.update(pos, instant);
}
