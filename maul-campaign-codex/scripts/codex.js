// MAUL Campaign Codex runtime (Foundry v12, dnd5e 4.0.x).
//
// 1. Sync: copies the player packs into world journals (folder "MAUL Codex"). World documents are
//    protected by the server, so per-player and per-table visibility is real, not cosmetic.
// 2. Player pages: each player owns their character's entry and their store's entry. They get an
//    "In my own words" / "Products" page to edit. Rebuilds never touch pages the build didn't make.
//    A page whose name starts with [Secret] is hidden from everyone else until someone digs it up.
// 3. Research and unlocks: locked facts (from the GM pack) unlock per table, by facing a team,
//    by a research roll, or by the GM. A mall-explorer flag (cue) unlocks the fact for the player who found it only
//    ("user:<id>" in the unlocks setting); the GM shares it with the table from Mall Explorer's Discoveries window.
//
// Tables come from the user flag maul-mall-explorer.table ("monday" | "tuesday"), set in its GM tools.

const MODULE = "maul-campaign-codex";
const EXPLORER = "maul-mall-explorer";
const PLAYER_PACKS = ["maul-season", "maul-teams", "maul-people", "maul-places", "maul-factions"];
const TABLES = ["monday", "tuesday"];
const LV = () => CONST.DOCUMENT_OWNERSHIP_LEVELS;
const SECRET_RX = /^\s*\[secret\]\s*/i;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const isActiveGM = () => game.user.isGM && game.users.activeGM?.id === game.user.id;
// Read the explorer's flag directly: getFlag throws for a scope whose module isn't active.
const tableOf = user => user?.flags?.[EXPLORER]?.table || user?.getFlag(MODULE, "table") || "";
const weekOf = table => Number(game.settings.get(MODULE, `week-${table}`)) || 0;
const USER_PREFIX = "user:";
// `tables` may hold table names ("monday"), "all", and personal unlocks ("user:<userId>").
const usersFor = tables => game.users.filter(u => !u.isGM && (tables.includes(tableOf(u)) || tables.includes(USER_PREFIX + u.id)));
const personalIds = tables => tables.filter(t => t.startsWith(USER_PREFIX)).map(t => t.slice(USER_PREFIX.length));
const cueMatches = (f, keys) => keys.some(k => k === f.cue || k === f.cue.replace(/\./g, "_"));
const worldEntry = slug => game.journal.find(j => j.getFlag(MODULE, "slug") === slug && !j.getFlag(MODULE, "lockedFor"));

/* -------------------------------------------- */
/*  Setup                                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  for (const t of TABLES) {
    game.settings.register(MODULE, `week-${t}`, {
      name: `MAUL Codex: ${cap(t)} table week`,
      hint: "0 = pre-season, N = after week N's contest. Drives research DCs and the automatic 'faced' unlocks.",
      scope: "world", config: true, type: Number, default: 0,
      onChange: () => { if (isActiveGM()) applyFacedUnlocks(); }
    });
  }
  game.settings.register(MODULE, "unlocks", {scope: "world", config: false, type: Object, default: {}});
  game.settings.register(MODULE, "syncedVersion", {scope: "world", config: false, type: String, default: ""});
});

Hooks.once("ready", () => {
  game.socket.on(`module.${MODULE}`, onSocket);
  game.modules.get(MODULE).api = {openPanel, syncToWorld, unlock, revoke, applyFacedUnlocks, research, cueFacts, shareCue, revokeCue,
    unlockRandomResearch, requestPersonalResearch, researchTeams};
});

const {DialogV2} = foundry.applications.api;

// v13+: the directory is an ApplicationV2 and `html` is an HTMLElement (no jQuery in v14)
Hooks.on("renderJournalDirectory", (app, html) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : app.element;
  const bar = root?.querySelector(".directory-header .action-buttons");
  if (!bar || bar.querySelector(".maul-codex-open")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "maul-codex-open";
  btn.innerHTML = `<i class="fa-solid fa-book-open-reader"></i> MAUL Codex`;
  btn.addEventListener("click", () => openPanel());
  bar.append(btn);
});

// v13+: journal sheets are ApplicationV2 (JournalEntrySheet); header controls come from getHeaderControls<Class>
Hooks.on("getHeaderControlsJournalEntrySheet", (sheet, controls) => {
  const je = sheet.document;
  if (game.user.isGM || !je || je.pack || !je.getFlag(MODULE, "researchable")) return;
  controls.unshift({label: "Research", icon: "fa-solid fa-magnifying-glass", action: "maulCodexResearch",
    onClick: () => research(je)});
});

/** dnd5e 4.1+/5.x take a config object and return an array of rolls; 4.0.x takes (skillId, options). */
async function rollSkillCompat(actor, skill, flavor) {
  const modern = game.system?.id === "dnd5e" && foundry.utils.isNewerVersion(String(game.system.version ?? "0"), "4.0.99");
  const result = modern
    ? await actor.rollSkill({skill}, {configure: false}, {data: {flavor}})
    : await actor.rollSkill(skill, {flavor, fastForward: true});
  return Array.isArray(result) ? (result[0] ?? null) : (result ?? null);
}

/* -------------------------------------------- */
/*  GM data (locked facts + research setup)     */
/* -------------------------------------------- */

let gmCache = null;

async function gmData() {
  if (gmCache) return gmCache;
  // Prefer world copies (if the GM imported the GM pack), else the GM pack itself.
  let docs = game.journal.filter(j => j.getFlag(MODULE, "lockedFor") || j.getFlag(MODULE, "setup"));
  const pack = game.packs.get(`${MODULE}.maul-gm`);
  if (!docs.length && pack) docs = await pack.getDocuments();
  const facts = [];
  let setup = {faced: {}, dcByWeek: [20], rumourBelow: 5};
  for (const d of docs) {
    if (d.getFlag(MODULE, "setup")) setup = d.getFlag(MODULE, "setup");
    if (!d.getFlag(MODULE, "lockedFor")) continue;
    for (const p of d.pages) {
      const f = p.getFlag(MODULE, "fact");
      if (f) facts.push(f);
    }
  }
  gmCache = {facts, setup};
  return gmCache;
}

/** Pages players marked [Secret] on codex entries count as research facts too. */
function playerSecretFacts(slug) {
  const out = [];
  for (const je of game.journal) {
    const s = je.getFlag(MODULE, "slug");
    if (!s || (slug && s !== slug)) continue;
    for (const p of je.pages) {
      const author = p.getFlag(MODULE, "playerSecret");
      if (!author) continue;
      out.push({id: `page:${je.id}.${p.id}`, target: s, kind: "research", title: p.name.replace(SECRET_RX, ""),
                draft: false, page: {je: je.id, page: p.id, author}});
    }
  }
  return out;
}

async function allFacts() {
  const {facts} = await gmData();
  return facts.concat(playerSecretFacts());
}

/* -------------------------------------------- */
/*  Sync compendium -> world                    */
/* -------------------------------------------- */

async function ensureFolder(name, parent = null) {
  return game.folders.find(f => f.type === "JournalEntry" && f.name === name && (f.folder?.id ?? null) === parent)
    ?? Folder.create({name, type: "JournalEntry", folder: parent, color: "#3b1f4a"});
}

// Links inside the codex point at the compendium; in the world copy they should point at world entries.
const relink = html => String(html ?? "").replace(
  new RegExp(`Compendium\\.${MODULE}\\.maul-(?:season|teams|people|places|factions)\\.JournalEntry\\.(\\w{16})`, "g"),
  "JournalEntry.$1");

async function syncToWorld() {
  if (!game.user.isGM) return;
  const root = await ensureFolder("MAUL Codex");
  let created = 0, updated = 0;
  for (const name of PLAYER_PACKS) {
    const pack = game.packs.get(`${MODULE}.${name}`);
    if (!pack) continue;
    const folder = await ensureFolder(pack.metadata.label.replace(/^MAUL · /, ""), root.id);
    const subs = {};
    for (const src of await pack.getDocuments()) {
      const data = src.toObject();
      const pages = data.pages.map(p => ({...p, text: {...p.text, content: relink(p.text?.content)},
                                          ownership: {default: LV().OBSERVER}}));
      // Sub-folders (e.g. Places → Nations / Cogskill Arcade / Galleria Overlook) come from the build's flag.
      const subName = data.flags?.[MODULE]?.folder;
      const target = subName ? (subs[subName] ??= await ensureFolder(subName, folder.id)) : folder;
      const je = game.journal.get(data._id);
      if (!je) {
        await JournalEntry.create({...data, pages, folder: target.id, ownership: {default: LV().OBSERVER}}, {keepId: true});
        created++;
        continue;
      }
      const move = (je.folder?.id === folder.id && target.id !== folder.id) ? {folder: target.id} : {};
      await je.update({name: data.name, flags: data.flags, ...move});
      const fresh = new Set(pages.map(p => p._id));
      const stale = je.pages.filter(p => p.getFlag(MODULE, "generated") && !fresh.has(p.id)).map(p => p.id);
      const changed = pages.filter(p => je.pages.has(p._id)).map(p => ({_id: p._id, name: p.name, text: p.text, sort: p.sort}));
      const added = pages.filter(p => !je.pages.has(p._id));
      if (stale.length) await je.deleteEmbeddedDocuments("JournalEntryPage", stale);
      if (changed.length) await je.updateEmbeddedDocuments("JournalEntryPage", changed);
      if (added.length) await je.createEmbeddedDocuments("JournalEntryPage", added, {keepId: true});
      updated++;
    }
  }
  await assignOwners();
  await reapplyUnlocks();
  await applyFacedUnlocks();
  ui.notifications.info(`MAUL Codex: ${created} entries added, ${updated} refreshed. Player pages were left alone.`);
}

/** Players own their character's entry and their store's entry, each with a page that's theirs to write. */
async function assignOwners() {
  for (const user of game.users.filter(u => !u.isGM && u.character)) {
    const name = user.character.name.toLowerCase();
    const pc = game.journal.find(j => j.getFlag(MODULE, "pc")
      && (j.getFlag(MODULE, "names") ?? []).some(n => n.toLowerCase() === name));
    if (!pc) continue;
    await giveOwner(pc, user, "In my own words",
      "Write anything about your character here: everyone can read it. Want a page only you can see until someone digs it up? Add a page and start its name with [Secret].");
    const slug = pc.getFlag(MODULE, "slug");
    for (const store of game.journal.filter(j => [].concat(j.getFlag(MODULE, "ownerPc") ?? []).includes(slug))) {
      await giveOwner(store, user, "Products",
        "List what your store sells, with prices if you like. Start a page name with [Secret] to hide the back-room stock.");
    }
  }
}

async function giveOwner(je, user, pageName, hint) {
  if (je.ownership[user.id] !== LV().OWNER) await je.update({[`ownership.${user.id}`]: LV().OWNER});
  if (je.pages.some(p => p.getFlag(MODULE, "playerPage") === user.id)) return;
  await je.createEmbeddedDocuments("JournalEntryPage", [{
    name: pageName, type: "text", sort: 900000, ownership: {default: LV().INHERIT},
    text: {content: `<p><em>${esc(hint)}</em></p>`, format: 1},
    flags: {[MODULE]: {playerPage: user.id}}
  }]);
}

/* -------------------------------------------- */
/*  Player [Secret] pages                       */
/* -------------------------------------------- */

Hooks.on("createJournalEntryPage", (page, options, userId) => handleSecretPage(page, userId));
Hooks.on("updateJournalEntryPage", (page, changes, options, userId) => {
  if ("name" in changes) handleSecretPage(page, userId);
});

async function handleSecretPage(page, userId) {
  if (!isActiveGM()) return;
  const je = page.parent;
  if (!je?.getFlag(MODULE, "slug") || page.getFlag(MODULE, "generated") || page.getFlag(MODULE, "factId")) return;
  const secret = SECRET_RX.test(page.name);
  const was = page.getFlag(MODULE, "playerSecret");
  if (secret && !was) {
    await setOwnership(page, {default: LV().NONE, [userId]: LV().OWNER});
    await page.setFlag(MODULE, "playerSecret", userId);
    const author = game.users.get(userId);
    if (author && !author.isGM) {
      await whisper([author.id], `<p>🔒 <strong>${esc(page.name)}</strong> is now secret. Only you (and Zak) can see it until someone researches ${esc(je.name)} and digs it up.</p>`);
    }
  } else if (!secret && was) {
    await setOwnership(page, {default: LV().INHERIT, [was]: LV().OWNER});
    await page.unsetFlag(MODULE, "playerSecret");
  }
}

/** Replace a document's whole ownership map (a normal update would merge, and never drop a user). */
async function setOwnership(doc, ownership) {
  await doc.update({ownership}, {diff: false, recursive: false});
}

/* -------------------------------------------- */
/*  Unlocking                                   */
/* -------------------------------------------- */

// Unlock / revoke read-modify-write one world setting; run them one at a time so parallel cues can't drop each other.
let unlockQueue = Promise.resolve();
const queued = fn => {
  const run = unlockQueue.then(fn, fn);
  unlockQueue = run.catch(() => {});
  return run;
};

/** Unlock a fact for a table ("monday" | "tuesday" | "all") or one player ("user:<userId>"). */
function unlock(factId, table) {
  return queued(() => unlockNow(factId, table));
}

function revoke(factId, table) {
  return queued(() => revokeNow(factId, table));
}

async function unlockNow(factId, table) {
  const unlocks = foundry.utils.deepClone(game.settings.get(MODULE, "unlocks"));
  const tables = new Set(unlocks[factId] ?? []);
  tables.add(table);
  unlocks[factId] = [...tables];
  await game.settings.set(MODULE, "unlocks", unlocks);
  const f = (await allFacts()).find(x => x.id === factId);
  if (f) await applyFact(f, unlocks[factId]);
  return f;
}

async function revokeNow(factId, table) {
  const unlocks = foundry.utils.deepClone(game.settings.get(MODULE, "unlocks"));
  unlocks[factId] = (unlocks[factId] ?? []).filter(t => t !== table);
  if (!unlocks[factId].length) delete unlocks[factId];
  await game.settings.set(MODULE, "unlocks", unlocks);
  const f = (await allFacts()).find(x => x.id === factId);
  if (f) await applyFact(f, unlocks[factId] ?? []);
}

/** Make a fact's page match the tables it's unlocked for (create, re-permission or remove it). */
async function applyFact(f, tables) {
  const everyone = tables.includes("all");
  const ownership = {default: everyone ? LV().OBSERVER : LV().NONE};
  for (const u of usersFor(tables)) ownership[u.id] = LV().OBSERVER;

  if (f.page) {                                   // a player's own [Secret] page
    const page = game.journal.get(f.page.je)?.pages.get(f.page.page);
    if (page) await setOwnership(page, {...ownership, [f.page.author]: LV().OWNER});
    return;
  }
  const je = worldEntry(f.target);
  if (!je) return ui.notifications.warn(`MAUL Codex: no world entry for "${f.target}". Run Sync first.`);
  const page = je.pages.find(p => p.getFlag(MODULE, "factId") === f.id);
  if (!tables.length) {
    if (page) await page.delete();
    return;
  }
  const people = personalIds(tables).map(id => game.users.get(id)?.character?.name ?? game.users.get(id)?.name).filter(Boolean);
  const who = everyone ? "everyone" : [
    ...tables.filter(t => TABLES.includes(t)).map(t => `the ${cap(t)} table`),
    ...people
  ].join(" and ") || "someone";
  const content = `<p class="maul-sub"><em>Dug up by ${esc(who)}.</em></p>${f.html ?? ""}`;
  if (page) {
    await page.update({"text.content": content});
    await setOwnership(page, ownership);
  } else await je.createEmbeddedDocuments("JournalEntryPage", [{
    name: f.title, type: "text", sort: 800000, ownership, text: {content, format: 1},
    flags: {[MODULE]: {factId: f.id}}
  }]);
}

async function reapplyUnlocks() {
  const unlocks = game.settings.get(MODULE, "unlocks");
  const facts = await allFacts();
  for (const [id, tables] of Object.entries(unlocks)) {
    const f = facts.find(x => x.id === id);
    if (f) await applyFact(f, tables);
  }
}

/** Once a table has faced a team, that team's "faced" facts unlock for that table. */
async function applyFacedUnlocks() {
  if (!game.user.isGM) return;
  gmCache = null;
  const {facts, setup} = await gmData();
  const unlocks = game.settings.get(MODULE, "unlocks");
  for (const table of TABLES) {
    const week = weekOf(table);
    for (const [team, w] of Object.entries(setup.faced?.[table] ?? {})) {
      if (w > week) continue;
      for (const f of facts.filter(x => x.target === team && x.kind === "faced" && !x.draft)) {
        if (!(unlocks[f.id] ?? []).includes(table)) await unlock(f.id, table);
      }
    }
  }
}

// Cues: a locked fact with cue=<flag> unlocks for the player who found it (only them) when mall-explorer sets that
// flag on them. The table learns it when the GM shares it (Mall Explorer: Discoveries -> Share with table -> shareCue).
Hooks.on("updateUser", async (user, changes) => {
  if (!isActiveGM() || user.isGM) return;
  const set = foundry.utils.getProperty(changes, `flags.${EXPLORER}.flags`);
  if (!set) return;
  // Newly set flags carry a timestamp; deletions (v14 ForcedDeletion operators) don't
  await unlockCuesFor(user, Object.entries(set).filter(([k, v]) => !k.startsWith("-=") && typeof v === "number").map(([k]) => k));
});

// After each module update (new version), refresh the world copy of the codex automatically. The very first sync
// is run by maul-mall-explorer's first-time setup once players and characters exist (so owners get assigned).
Hooks.once("ready", async () => {
  if (!isActiveGM()) return;
  const v = game.modules.get(MODULE)?.version ?? "";
  const last = game.settings.get(MODULE, "syncedVersion");
  const mall = game.modules.get("maul-mall-explorer");
  const mallFirstRun = !!mall?.active && game.settings.settings.has("maul-mall-explorer.autoSetupDone")
    && !game.settings.get("maul-mall-explorer", "autoSetupDone");
  if (v === last || mallFirstRun) return;
  try {
    await syncToWorld();
    await game.settings.set(MODULE, "syncedVersion", v);
  } catch (err) { console.error(`${MODULE} | automatic sync failed`, err); }
});

// Cue flags set while no GM was online never fired the hook above: catch up when the GM logs in.
Hooks.once("ready", async () => {
  if (!isActiveGM()) return;
  for (const user of game.users.filter(u => !u.isGM)) {
    const keys = Object.keys(user.flags?.[EXPLORER]?.flags ?? {});
    try { await unlockCuesFor(user, keys); } catch (err) { console.error(`${MODULE} | cue catch-up failed`, err); }
  }
});

async function unlockCuesFor(user, keys) {
  if (!keys.length) return;
  const {facts} = await gmData();
  const table = tableOf(user);
  for (const f of facts.filter(x => x.cue && !x.draft && cueMatches(x, keys))) {
    const has = game.settings.get(MODULE, "unlocks")[f.id] ?? [];
    if (has.includes("all") || (table && has.includes(table)) || has.includes(USER_PREFIX + user.id)) continue;
    await unlock(f.id, USER_PREFIX + user.id);
    await whisper(gmIds(), `<p>MAUL Codex: ${esc(user.name)} found <strong>${esc(f.title)}</strong> (${esc(f.target)}). Unlocked for them only; share it from Mall Explorer's Discoveries when they tell the table.</p>`);
  }
}

/** Locked facts that have a mall-explorer cue flag (for Mall Explorer's Discoveries window). */
async function cueFacts() {
  gmCache = null;
  const {facts} = await gmData();
  return facts.filter(f => f.cue && !f.draft).map(f => ({id: f.id, cue: f.cue, title: f.title, target: f.target}));
}

/** Share a cue's facts with a whole table (the player told the team). Returns the facts unlocked. */
async function shareCue(flag, table, fromUserId = null) {
  if (!game.user.isGM || !table) return [];
  const {facts} = await gmData();
  const from = game.users.get(fromUserId);
  const out = [];
  for (const f of facts.filter(x => x.cue && !x.draft && cueMatches(x, [flag]))) {
    if ((game.settings.get(MODULE, "unlocks")[f.id] ?? []).includes(table)) continue;
    await unlock(f.id, table);
    out.push(f);
    await whisper(gmIds(), `<p>MAUL Codex: <strong>${esc(f.title)}</strong> (${esc(f.target)}) shared with the ${cap(table)} table${from ? ` by ${esc(from.character?.name ?? from.name)}` : ""}.</p>`);
  }
  return out;
}

/** Take back a player's personal unlock of a cue's facts (an update file revoked the flag). Table unlocks stay. */
async function revokeCue(flag, userId) {
  if (!game.user.isGM || !userId) return;
  const {facts} = await gmData();
  for (const f of facts.filter(x => x.cue && cueMatches(x, [flag]))) {
    if ((game.settings.get(MODULE, "unlocks")[f.id] ?? []).includes(USER_PREFIX + userId)) await revoke(f.id, USER_PREFIX + userId);
  }
}

/* -------------------------------------------- */
/*  Research                                    */
/* -------------------------------------------- */

async function research(je) {
  const user = game.user;
  const table = tableOf(user);
  const actor = user.character;
  if (!table) return ui.notifications.warn("Your Foundry user isn't on a table yet. Ask Zak.");
  if (!actor) return ui.notifications.warn("You need an assigned character to research.");
  if (!game.users.activeGM) return ui.notifications.warn("A GM has to be online to research.");
  const slug = je.getFlag(MODULE, "slug");
  const week = weekOf(table);
  if (user.getFlag(MODULE, "research")?.[slug] === week) {
    return ui.notifications.info(`You've already researched ${je.name} this week. Try again after your next match.`);
  }
  const ok = await DialogV2.confirm({
    window: {title: `Research: ${je.name}`},
    content: `<p>Spend some time digging up dirt on <strong>${esc(je.name)}</strong>? You'll roll Investigation. One try per week. Anything you find is shared with your table.</p>`,
    rejectClose: false
  });
  if (!ok) return;
  const roll = await rollSkillCompat(actor, "inv", `Research: ${je.name}`);
  if (!roll) return;
  game.socket.emit(`module.${MODULE}`, {action: "research", userId: user.id, slug, total: roll.total});
}

/* -------------------------------------------- */
/*  Personal research (Mall Explorer's Bastion turn)                      */
/* -------------------------------------------- */

/** Team entries this user can see: [{slug, name}] (for pickers). */
function researchTeams(user = game.user) {
  return game.journal.filter(j => j.getFlag(MODULE, "team") && j.getFlag(MODULE, "slug") && !j.getFlag(MODULE, "lockedFor")
      && j.testUserPermission(user, "OBSERVER"))
    .map(j => ({slug: j.getFlag(MODULE, "slug"), name: j.name}))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * GM: unlock one random locked `research` fact of a team for ONE player (not their table).
 * Skips facts already known to that player, their table or everyone. Returns {id, title, html} or null.
 */
async function unlockRandomResearch(slug, userId) {
  if (!game.user.isGM) return null;
  const user = game.users.get(userId);
  if (!user || !slug) return null;
  gmCache = null;
  const {facts} = await gmData();
  const table = tableOf(user);
  const unlocks = game.settings.get(MODULE, "unlocks");
  const known = f => (unlocks[f.id] ?? []).some(t => t === "all" || (table && t === table) || t === USER_PREFIX + userId);
  const pool = facts.filter(f => f.target === slug && f.kind === "research" && !f.draft && !known(f));
  if (!pool.length) return null;
  const f = pick(pool);
  await unlock(f.id, USER_PREFIX + userId);
  await whisper(gmIds(), `<p>MAUL Codex: ${esc(user.name)}'s coworker dug up <strong>${esc(f.title)}</strong> (${esc(slug)}). Unlocked for them only.</p>`);
  return {id: f.id, title: f.title, html: f.html ?? ""};
}

const researchReplies = new Map();

/** Any client: ask the GM for unlockRandomResearch(slug, me). Resolves to the fact or null (also on timeout). */
async function requestPersonalResearch(slug) {
  if (game.user.isGM) return unlockRandomResearch(slug, game.user.id);
  if (!game.users.activeGM) return null;
  const requestId = foundry.utils.randomID();
  return new Promise(resolve => {
    const timer = setTimeout(() => { researchReplies.delete(requestId); resolve(null); }, 15000);
    researchReplies.set(requestId, fact => { clearTimeout(timer); resolve(fact); });
    game.socket.emit(`module.${MODULE}`, {action: "personalResearch", requestId, userId: game.user.id, slug});
  });
}

async function onSocket(msg) {
  if (msg?.action === "personalResearchDone") {
    if (msg.userId !== game.user.id) return;
    const done = researchReplies.get(msg.requestId);
    researchReplies.delete(msg.requestId);
    done?.(msg.fact ?? null);
    return;
  }
  if (msg?.action === "personalResearch") {
    if (!isActiveGM()) return;
    let fact = null;
    try { fact = await unlockRandomResearch(msg.slug, msg.userId); } catch (err) { console.error(`${MODULE} | personal research failed`, err); }
    game.socket.emit(`module.${MODULE}`, {action: "personalResearchDone", requestId: msg.requestId, userId: msg.userId, fact});
    return;
  }
  if (msg?.action !== "research" || !isActiveGM()) return;
  const user = game.users.get(msg.userId);
  const table = tableOf(user);
  if (!user || !table) return;
  const week = weekOf(table);
  const name = worldEntry(msg.slug)?.name ?? msg.slug;
  if (user.getFlag(MODULE, "research")?.[msg.slug] === week) return;
  await user.setFlag(MODULE, `research.${msg.slug}`, week);

  gmCache = null;
  const {setup} = await gmData();
  const facts = (await allFacts()).filter(f => f.target === msg.slug);
  const unlocks = game.settings.get(MODULE, "unlocks");
  const known = f => (unlocks[f.id] ?? []).some(t => t === table || t === "all");
  const facedWeek = setup.faced?.[table]?.[msg.slug];
  const faced = facedWeek !== undefined && facedWeek <= week;
  // Before facing: research and faced facts. After facing: faced ones are already open, secrets join the pool.
  const pool = facts.filter(f => !f.draft && !known(f) && f.page?.author !== user.id
    && (f.kind === "research" || f.kind === "faced" || (f.kind === "secret" && faced)));
  const rumours = facts.filter(f => f.kind === "rumour");
  const dcs = setup.dcByWeek ?? [20];
  const dc = dcs[Math.min(week, dcs.length - 1)];

  if (msg.total >= dc && pool.length) {
    const f = pick(pool);
    await unlock(f.id, table);
    await whisper([user.id], `<p>🔍 You dug something up about <strong>${esc(name)}</strong>: <em>${esc(f.title)}</em>. It's on their page now, for your whole table.</p>`);
    await whisper(gmIds(), `<p>MAUL Codex: ${esc(user.name)} researched ${esc(name)} (${msg.total} vs DC ${dc}) and unlocked <strong>${esc(f.title)}</strong> for the ${cap(table)} table.</p>`);
  } else if (msg.total >= dc) {
    await whisper([user.id], `<p>🔍 You've turned up everything there is to find about <strong>${esc(name)}</strong> for now.</p>`);
  } else if (msg.total <= dc - (setup.rumourBelow ?? 5) && rumours.length) {
    const r = pick(rumours);
    await whisper([user.id], `<p>🗣️ A rumour about <strong>${esc(name)}</strong> (unverified):</p>${r.html ?? ""}`);
    await whisper(gmIds(), `<p>MAUL Codex: ${esc(user.name)} researched ${esc(name)} (${msg.total} vs DC ${dc}) and heard a <strong>${r.truth ? "true" : "false"}</strong> rumour.</p>`);
  } else {
    await whisper([user.id], `<p>🔍 Nothing useful about <strong>${esc(name)}</strong> this week.</p>`);
    await whisper(gmIds(), `<p>MAUL Codex: ${esc(user.name)} researched ${esc(name)} (${msg.total} vs DC ${dc}) and found nothing.</p>`);
  }
}

const gmIds = () => game.users.filter(u => u.isGM).map(u => u.id);
const whisper = (ids, content) => ChatMessage.create({content, whisper: ids, speaker: {alias: "MAUL Codex"}});

/* -------------------------------------------- */
/*  GM panel                                    */
/* -------------------------------------------- */

async function openPanel() {
  gmCache = null;
  const facts = (await allFacts()).filter(f => f.kind !== "rumour");
  const unlocks = game.settings.get(MODULE, "unlocks");
  const rows = facts.map(f => {
    const t = unlocks[f.id] ?? [];
    const boxes = ["monday", "tuesday", "all"].map(tb =>
      `<td><input type="checkbox" data-fact="${esc(f.id)}" data-table="${tb}" ${t.includes(tb) ? "checked" : ""} ${f.draft ? "disabled" : ""}></td>`).join("");
    const where = worldEntry(f.target)?.name ?? f.target;
    const tag = f.page ? "player secret" : f.kind + (f.cue ? ` (cue: ${f.cue})` : "");
    const mine = personalIds(t).map(id => game.users.get(id)?.name ?? id).join(", ");
    return `<tr><td>${esc(where)}</td><td>${esc(f.title)}${f.draft ? " <em>(draft)</em>" : ""}</td><td>${esc(tag)}</td>${boxes}<td>${esc(mine)}</td></tr>`;
  }).join("");
  const players = game.users.filter(u => !u.isGM).map(u =>
    `${esc(u.name)}: ${tableOf(u) ? cap(tableOf(u)) : "<em>no table</em>"}${u.character ? ` (${esc(u.character.name)})` : ""}`).join(" · ");
  const content = `
    <div class="maul-codex-panel">
      <p><strong>Weeks:</strong> Monday ${weekOf("monday")}, Tuesday ${weekOf("tuesday")} (change them in Configure Settings).<br>
         <strong>Players:</strong> ${players || "<em>none yet</em>"}</p>
      <p><button type="button" data-act="sync"><i class="fa-solid fa-rotate"></i> Sync codex to world</button>
         <button type="button" data-act="faced"><i class="fa-solid fa-handshake"></i> Apply "faced" unlocks</button></p>
      ${facts.length ? "" : "<p><em>No locked facts found. Build with --gm, or import the GM pack into the world.</em></p>"}
      <table><thead><tr><th>Entry</th><th>Fact</th><th>Kind</th><th>Mon</th><th>Tue</th><th>All</th><th title="Found personally (cue flags)">Players</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>`;
  DialogV2.wait({
    window: {title: "MAUL Codex: unlocks", resizable: true},
    position: {width: 760, height: 640},
    content,
    buttons: [{action: "close", label: "Close", default: true}],
    rejectClose: false,
    render: (event, dialog) => {
      const el = dialog.element;
      el.querySelector("[data-act=sync]")?.addEventListener("click", () => syncToWorld());
      el.querySelector("[data-act=faced]")?.addEventListener("click", () => applyFacedUnlocks());
      for (const box of el.querySelectorAll("input[data-fact]")) {
        box.addEventListener("change", async ev => {
          const {fact, table} = ev.currentTarget.dataset;
          if (ev.currentTarget.checked) await unlock(fact, table);
          else await revoke(fact, table);
        });
      }
    }
  });
}
