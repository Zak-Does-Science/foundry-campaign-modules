// MAUL Mall Explorer: GM tools window (build scenes, week control, player users, progress viewer/reset).

import {MODULE, OFFICE_FLAG, esc} from "./config.js";
import {getPlayersFile, clearDataCache} from "./data.js";
import {getProgress, resetProgress} from "./progress.js";
import {buildAllMallScenes, placePlayerTokens, sendPlayersToStores} from "./scene-builder.js";
import {getWeek, setWeek, weekLabel, syncBoothTiles, MAX_WEEK, TABLES as WEEK_TABLES, gmTableWeek, GM_WEEK_MIN, GM_WEEK_MAX} from "./week.js";
import {announceClosing, cancelClosing} from "./pa.js";
import {DiscoveriesApp, exportCharacterLogs, applyUpdateFiles} from "./discoveries.js";
import {getLog} from "./progress.js";
import {lastResult, setLastResult, RESULTS} from "./weekly.js";
import {setupPlayerCharacters} from "./pc.js";

const {ApplicationV2, HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;

const TABLES = ["", "monday", "tuesday"];

/** Create a User for every players.json entry that has no User yet (role PLAYER, no password). */
export async function createPlayerUsers() {
  if ( !game.user.isGM ) return;
  let file;
  try {                                     // fresh read without dropping the cached mall data in use on the canvas
    const res = await fetch(`modules/${MODULE}/data/players.json`, {cache: "no-cache"});
    if ( !res.ok ) throw new Error(String(res.status));
    file = await res.json();
  } catch(err) {
    ui.notifications.error("Mall Explorer: data/players.json could not be read.");
    return;
  }
  const created = [];
  const tagged = [];
  for ( const p of file?.players ?? [] ) {
    const name = String(p.name ?? "").trim();
    if ( !name ) continue;
    const table = TABLES.includes(p.table) ? p.table : "";
    const existing = game.users.getName(name);
    if ( existing ) {
      if ( table && !existing.getFlag(MODULE, "table") ) {
        await existing.setFlag(MODULE, "table", table);
        tagged.push(name);
      }
      continue;
    }
    await User.create({
      name,
      role: CONST.USER_ROLES.PLAYER,
      flags: {[MODULE]: {table: table || null, discord: p.discord ?? null}}
    });
    created.push(name);
  }
  const msg = [`created ${created.length} user(s)${created.length ? `: ${created.join(", ")}` : ""}`];
  if ( tagged.length ) msg.push(`tagged table on ${tagged.join(", ")}`);
  ui.notifications.info(`Mall Explorer: ${msg.join("; ")}. Set their passwords in Configure Players.`);
}

export class GMToolsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "maul-gm-tools",
    classes: ["maul-app", "maul-gm-tools", "maul-pixel"],
    tag: "div",
    window: {title: "MAUL Mall Explorer: GM tools", icon: "fas fa-store", resizable: true},
    position: {width: 600, height: "auto"},
    actions: {
      build: GMToolsApp.#onBuild,
      syncBooths: GMToolsApp.#onSyncBooths,
      weekPrev: GMToolsApp.#onWeekPrev,
      weekNext: GMToolsApp.#onWeekNext,
      weekSet: GMToolsApp.#onWeekSet,
      createUsers: GMToolsApp.#onCreateUsers,
      placeTokens: GMToolsApp.#onPlaceTokens,
      sendToStores: async function() { await sendPlayersToStores(); },
      cycleTable: GMToolsApp.#onCycleTable,
      viewFlags: GMToolsApp.#onViewFlags,
      resetUser: GMToolsApp.#onResetUser,
      cycleResult: GMToolsApp.#onCycleResult,
      setupCharacters: async function() { await setupPlayerCharacters(); this.render(); },
      clearLines: GMToolsApp.#onClearLines,
      discoveries: () => new DiscoveriesApp().render({force: true}),
      exportLogs: () => exportCharacterLogs(),
      paClosing: () => announceClosing(),
      paCancel: () => cancelClosing(),
      applyUpdates: () => applyUpdateFiles()
    }
  };

  static PARTS = {
    main: {template: `modules/${MODULE}/templates/gm-tools.hbs`}
  };

  /** Re-render the open window, if any (called from hooks). */
  static refresh() {
    const app = foundry.applications.instances.get("maul-gm-tools");
    if ( app?.rendered ) app.render();
  }

  async _prepareContext() {
    const week = getWeek();
    const MALL_LABEL = {monday: "Monday · Galleria Overlook", tuesday: "Tuesday · Cogskill Arcade"};
    const tableWeeks = [];
    for ( const t of WEEK_TABLES ) {
      const w = gmTableWeek(t);   // the match this table is preparing for
      const options = [];
      for ( let i = GM_WEEK_MIN; i <= GM_WEEK_MAX; i++ ) options.push({value: i, label: `${i}`, selected: i === w});
      tableWeeks.push({table: t, name: MALL_LABEL[t], week: w, weekLabel: await weekLabel(w), options,
        atMin: w === GM_WEEK_MIN, atMax: w === GM_WEEK_MAX});
    }
    const users = game.users.filter(u => !u.isGM).map(u => {
      const {flags} = getProgress(u);
      const leyline = u.getFlag(MODULE, "leyline") ?? {};
      return {
        away: leyline.away ?? "",
        awayPaid: !!leyline.paid,
        id: u.id,
        name: u.name,
        active: u.active,
        table: u.getFlag(MODULE, "table") || "",
        character: u.character?.name ?? "",
        flagCount: Object.keys(flags).length,
        logCount: getLog(u).length,
        hasLines: Number(u.getFlag(MODULE, "weeklyLines")?.week) === getWeek(u.getFlag(MODULE, "table") || undefined) && !!u.getFlag(MODULE, "weeklyLines")?.lines?.length,
        office: !!flags[OFFICE_FLAG]
      };
    }).sort((a, b) => (a.table || "z").localeCompare(b.table || "z") || a.name.localeCompare(b.name));
    const results = ["monday", "tuesday"].map(t => ({table: t, label: t.charAt(0).toUpperCase() + t.slice(1), result: lastResult(t)}));
    return {week, tableWeeks, users, maxWeek: MAX_WEEK, results};
  }

  static async #onBuild() {
    await buildAllMallScenes();
    this.render();
  }

  static async #onSyncBooths() {
    await syncBoothTiles();
    ui.notifications.info("Mall Explorer: booth tiles synced to the current week.");
  }

  static async #onWeekPrev(event, target) {
    const t = target.dataset.table;
    if ( t ) await setWeek(gmTableWeek(t) - 1, t);
  }

  static async #onWeekNext(event, target) {
    const t = target.dataset.table;
    if ( t ) await setWeek(gmTableWeek(t) + 1, t);
  }

  static async #onWeekSet(event, target) {
    const t = target.dataset.table;
    const sel = this.element.querySelector(`select[name="week-${t}"]`);
    if ( t && sel ) await setWeek(Number(sel.value), t);
  }

  static async #onClearLines(event, target) {
    const user = game.users.get(target.closest("[data-user-id]")?.dataset.userId);
    if ( !user ) return;
    await user.unsetFlag(MODULE, "weeklyLines");
    ui.notifications.info(`Mall Explorer: cleared ${user.name}'s weekly lines.`);
    this.render();
  }

  static async #onCycleResult(event, target) {
    const table = target.dataset.table;
    const next = RESULTS[(RESULTS.indexOf(lastResult(table)) + 1) % RESULTS.length];
    await setLastResult(table, next);
  }

  static async #onCreateUsers() {
    await createPlayerUsers();
    this.render();
  }

  static async #onPlaceTokens() {
    await placePlayerTokens();
  }

  static async #onCycleTable(event, target) {
    const user = game.users.get(target.closest("[data-user-id]")?.dataset.userId);
    if ( !user ) return;
    const cur = user.getFlag(MODULE, "table") || "";
    const next = TABLES[(TABLES.indexOf(cur) + 1) % TABLES.length];
    await user.setFlag(MODULE, "table", next || null);
    this.render();
  }

  static async #onViewFlags(event, target) {
    const user = game.users.get(target.closest("[data-user-id]")?.dataset.userId);
    if ( !user ) return;
    const {flags, seen} = getProgress(user);
    const fmt = ts => (ts ? new Date(ts).toLocaleString() : "");
    const flagRows = Object.entries(flags).sort((a, b) => a[1] - b[1])
      .map(([k, v]) => `<li><code>${esc(k)}</code> <span class="maul-dim">${esc(fmt(v))}</span></li>`).join("");
    const seenRows = Object.entries(seen).sort()
      .map(([k, v]) => `<li><code>${esc(k)}</code> &times;${Number(v)}</li>`).join("");
    await DialogV2.prompt({
      window: {title: `Mall progress: ${user.name}`},
      position: {width: 480},
      content: `<div class="maul-flags-view">
        <h3>Flags (${Object.keys(flags).length})</h3><ul>${flagRows || "<li><em>none</em></li>"}</ul>
        <h3>Interactions (${Object.keys(seen).length})</h3><ul class="maul-seen">${seenRows || "<li><em>none</em></li>"}</ul></div>`,
      rejectClose: false
    });
  }

  static async #onResetUser(event, target) {
    const user = game.users.get(target.closest("[data-user-id]")?.dataset.userId);
    if ( !user ) return;
    const ok = await DialogV2.confirm({
      window: {title: "Reset mall progress?"},
      content: `<p>Clear <strong>all</strong> Mall Explorer flags and interaction counts for <strong>${esc(user.name)}</strong>?
        This includes <code>${OFFICE_FLAG}</code>. Items they bought stay on their character.</p>`,
      rejectClose: false,
      modal: true
    });
    if ( !ok ) return;
    await resetProgress(user);
    ui.notifications.info(`Mall Explorer: progress reset for ${user.name}.`);
    this.render();
  }
}
