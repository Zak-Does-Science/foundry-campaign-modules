// MAUL Mall Explorer: plugs the MAUL content set into the standalone Acorndr module (SPEC 32).
// The app itself (window, key P, acorn chip, follow/friend state) lives in the `acorndr` module, reusable across
// campaigns. This file only supplies MAUL's world: data/acorndr.json, the table's week, `requires` (met-, flags...),
// locals listed by mall (browsable by anyone), "stand next to them to add them", 8-bit sprite avatars, sounds, and the story flags
// acorndr-follow-<id> / acorndr-friend-<id> (logged once, kind "acorndr"). Players' own Acorndr profiles and posts
// (built into the acorndr module) are filed like all player writing (SPEC 28): `onWrite` -> recordWriting, so each bio
// and post becomes a timestamped .txt in maul-writings; `playerSprite` offers the character's 8-bit pc: sprite as a picture.

import {MODULE, modPath} from "./config.js";
import {fetchJSON} from "./data.js";
import {getWeek} from "./week.js";
import {meetsRequirements, setFlags} from "./progress.js";
import {currentMallId, getPlayerToken, tokenTile, Hint} from "./interact.js";
import {chebyshev} from "./grid.js";
import {isDialogueOpen} from "./dialogue.js";
import {Sfx} from "./audio.js";
import {recordWriting} from "./writings.js";
import {pcKey} from "./pc.js";

const SPRITES = "assets/sprites/live/";
const MALL_NAMES = {galleria: "Galleria Overlook", cogskill: "Cogskill Arcade"};
const NEAR = 2;                                      // tiles (Chebyshev) to add a local
const KINDS = [
  ["celeb", "Celebrities"], ["judge", "MALL BRAWL judges"], ["leader", "World leaders"], ["brand", "Official accounts"],
  ["local", "Mall locals"]
];

let sprites = null;
let dates = null;

async function prepare() {
  if ( !sprites ) sprites = await fetchJSON(modPath(`${SPRITES}index.json`), {optional: true}).catch(() => null) ?? {};
  if ( !dates ) {
    const s = await fetchJSON(modPath("data/schedule.json"), {optional: true}).catch(() => null);
    dates = {};
    for ( const w of s?.weeks ?? [] ) dates[w.week] = w.day ? `${w.day} ${w.month}` : (w.label ?? "");
  }
}

/** Is the player's token within NEAR tiles of this local right now (in that local's own mall)? */
function near(p) {
  if ( game.user.isGM ) return {ok: true, gm: true};
  const mall = currentMallId();
  const why = "Find them in the mall to add them.";
  if ( !mall || mall !== p.npc?.mall || Hint.ctx?.mall?.id !== mall ) return {ok: false, why};
  const token = getPlayerToken();
  const entry = Hint.ctx.entries.find(e => e.ia.id === p.npc.id);   // wanderers: entry tracks their current tile
  if ( !token || !entry ) return {ok: false, why};
  const t = tokenTile(token);
  return chebyshev(entry.sx, entry.sy, t.x, t.y) <= NEAR ? {ok: true} : {ok: false, why: "Get closer to add them (stand next to them)."};
}

const content = {
  id: "maul",
  url: modPath("data/acorndr.json"),
  kinds: KINDS,
  anchor: "maul-week-chip",
  prepare,
  week: () => getWeek(),
  weekLabel: w => dates?.[w] ?? "",
  requires: (req, week, user) => meetsRequirements(req, week, user),
  // Locals are browsable by anyone at once (Zak, 17 Nov 2026: "you should be able to just view locals"); adding them still
  // needs you standing next to them. The mall you're in lists first.
  isHere: p => !!p.npc?.mall && p.npc.mall === currentMallId(),
  placeName: () => MALL_NAMES[currentMallId()] ?? null,
  whereIs: p => MALL_NAMES[p.npc?.mall] ?? null,
  near,
  sprite: key => {
    const info = sprites?.[key];
    return info?.file ? {url: modPath(SPRITES + info.file), frames: info.frames} : null;
  },
  playerSprite: user => pcKey(sprites, user?.character?.name),
  onWrite: w => recordWriting({form: w.form, title: w.title, text: w.fields ? "" : w.text, fields: w.fields ?? null, about: "Acorndr"}),
  onFollow: (p, how, user) => setFlags([`acorndr-${how}-${p.id}`], user,
    {kind: "acorndr", id: p.id, name: `${how === "friend" ? "Friended" : "Followed"} ${p.name} on Acorndr`}),
  blockKey: () => isDialogueOpen(),
  sound: name => Sfx[name]?.()
};

/** One-time move of the 17 Nov test-build state (flags.maul-mall-explorer.acorndr) into the acorndr module's flag. */
async function migrateOldState() {
  const old = game.user.getFlag(MODULE, "acorndr");
  if ( !old || game.user.getFlag("acorndr", "state") ) return;
  await game.user.update({"flags.acorndr.state": old});
}

Hooks.once("setup", () => {
  const api = game.modules.get("acorndr")?.active ? globalThis.Acorndr : null;
  if ( !api ) {
    console.warn(`${MODULE} | the Acorndr module isn't active: no social media app this session`);
    return;
  }
  api.register(content);
});

Hooks.once("ready", () => {
  if ( !globalThis.Acorndr ) {
    if ( game.user.isGM ) ui.notifications.warn("MAUL Mall Explorer: turn on the Acorndr module for the players' social media app.");
    return;
  }
  migrateOldState().catch(err => console.warn(`${MODULE} | acorndr migration`, err));
});

// What a player knows (met-, flags) and the week change which accounts and posts they see
Hooks.on("updateUser", (user, changes) => {
  if ( user.isSelf && foundry.utils.hasProperty(changes, `flags.${MODULE}.flags`) ) globalThis.Acorndr?.refresh();
});
Hooks.on("updateSetting", setting => {
  if ( String(setting.key ?? "").startsWith(`${MODULE}.`) ) globalThis.Acorndr?.refresh();
});
