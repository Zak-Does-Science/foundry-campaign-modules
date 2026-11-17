// MAUL Mall Explorer: entry point. Registers settings, keybindings, controls and hooks.

import {MODULE} from "./config.js";
import {registerSocket} from "./notify.js";
import {onInteractKey, Hint, registerCanvasClick, currentMallId, getPlayerToken, tokenTile} from "./interact.js";
import {registerAmbient, ambientTick, repositionAll} from "./ambient.js";
import {renderWeekChip, syncBoothTiles, migrateWeeks} from "./week.js";
import {issueWeeklyPotions} from "./potions.js";
import {summonWalker, registerWalker, walkerFollowsGM} from "./gm-walker.js";
import {registerPA, renderPA} from "./pa.js";
import {GMToolsApp, createPlayerUsers} from "./gm-tools.js";
import {setupPlayerCharacters, restoreCutLines, lockCharacterRotation} from "./pc.js";
import {buildAllMallScenes} from "./scene-builder.js";
import {registerLeylineSocket, homeMallId} from "./leyline.js";
import {getMallContext} from "./data.js";
import {isDialogueOpen} from "./dialogue.js";
import {Areas, applyTokenConcealment, applyTileConcealment} from "./areas.js";
import {Hidden} from "./hidden.js";
import {Live} from "./live.js";
import {Markers} from "./markers.js";
import {Music, registerAudioGesture} from "./audio.js";
import {DiscoveriesApp, exportCharacterLogs, applyUpdateFiles, shareWithTable} from "./discoveries.js";
import {registerCodexLinks, rebuildCodexIndex} from "./codex-links.js";
import {clearWeeklyEffects} from "./weekly.js";
import {registerMuseSocket} from "./muse.js";
import {queueJournalSync, syncAllJournals} from "./journal.js";
import {fileWritings} from "./writings.js";
import {openFeedback, NotebookApp, flushPendingFeedback, setFeedbackContext, storeChipTick, resetStoreChip} from "./feedback.js";
import {setFlags, hasFlag, compactLog} from "./progress.js";
import {registerStairs} from "./stairs.js";
import {registerShows} from "./show.js";
import {DirectoryApp} from "./directory.js";
import "./acorndr.js";                               // MAUL content for the standalone Acorndr module (SPEC 32)

registerStairs();
registerShows();

Hooks.once("init", () => {
  registerAmbient();
  registerCodexLinks();
  registerAudioGesture();
  registerPA();
  registerWalker();

  const onWeekChange = () => {
    renderWeekChip();
    Hint.refresh();
    onKnowledgeChanged();
    if ( game.user === game.users.activeGM ) {
      syncBoothTiles();
      clearWeeklyEffects().catch(err => console.error(`${MODULE} | clearing weekly effects failed`, err));
      issueWeeklyPotions().catch(err => console.error(`${MODULE} | weekly potions failed`, err));
    }
    GMToolsApp.refresh();
  };

  // Legacy single week: only the fallback for weekByTable now
  game.settings.register(MODULE, "currentWeek", {
    name: "MAUL.Settings.CurrentWeek.Name",
    hint: "MAUL.Settings.CurrentWeek.Hint",
    scope: "world",
    config: false,
    type: Number,
    default: 0,
    onChange: onWeekChange
  });

  // Each table's week, {monday: n, tuesday: n} (17 Nov 2026): the Galleria runs on Monday's, Cogskill on Tuesday's
  game.settings.register(MODULE, "weekByTable", {scope: "world", config: false, type: Object, default: {},
    onChange: onWeekChange});

  // Each table's last match result ("win" | "loss" | "none"), set in GM tools; drives the Bastion turn greeting
  game.settings.register(MODULE, "lastResult", {scope: "world", config: false, type: Object,
    default: {monday: "none", tuesday: "none"}, onChange: () => GMToolsApp.refresh()});

  // Naming moments: {museId: {who, userId, values, at, mall, name}}; written by the GM client only
  game.settings.register(MODULE, "muses", {scope: "world", config: false, type: Object, default: {}});

  // Notes / feedback / store change requests (SPEC 21): append-only, written by the active GM's client
  game.settings.register(MODULE, "feedback", {scope: "world", config: false, type: Array, default: [],
    onChange: () => NotebookApp.refresh()});
  // Version of the one-time character-log clean-up already run (SPEC 25: routine talk/chat/scene spam dropped)
  // Player writings already written out as .txt files (SPEC 28): [{id, t, user, character, form, title, path, source}]
  game.settings.register(MODULE, "writingsFiled", {scope: "world", config: false, type: Array, default: []});
  game.settings.register(MODULE, "logCompacted", {scope: "world", config: false, type: Number, default: 0});

  game.settings.register(MODULE, "discordWebhook", {
    name: "MAUL.Settings.Webhook.Name",
    hint: "MAUL.Settings.Webhook.Hint",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  game.settings.register(MODULE, "showHints", {
    name: "MAUL.Settings.ShowHints.Name",
    hint: "MAUL.Settings.ShowHints.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => Hint.refresh()
  });

  game.settings.register(MODULE, "showWeekChip", {
    name: "MAUL.Settings.ShowWeekChip.Name",
    hint: "MAUL.Settings.ShowWeekChip.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => renderWeekChip()
  });

  game.settings.register(MODULE, "textSpeed", {
    name: "MAUL.Settings.TextSpeed.Name",
    hint: "MAUL.Settings.TextSpeed.Hint",
    scope: "client",
    config: true,
    type: Number,
    range: {min: 0, max: 120, step: 5},
    default: 45
  });

  game.settings.register(MODULE, "sfxVolume", {
    name: "MAUL.Settings.SfxVolume.Name",
    hint: "MAUL.Settings.SfxVolume.Hint",
    scope: "client",
    config: true,
    type: Number,
    range: {min: 0, max: 1, step: 0.05},
    default: 0.5
  });

  game.settings.register(MODULE, "musicVolume", {
    name: "MAUL.Settings.MusicVolume.Name",
    hint: "MAUL.Settings.MusicVolume.Hint",
    scope: "client",
    config: true,
    type: Number,
    range: {min: 0, max: 1, step: 0.05},
    default: 0.35,
    onChange: () => Music.onVolumeChange()
  });

  // Ids of data/updates files the GM has applied: {id: timestamp}
  game.settings.register(MODULE, "appliedUpdates", {scope: "world", config: false, type: Object, default: {}});
  game.settings.register(MODULE, "autoSetupDone", {scope: "world", config: false, type: Boolean, default: false});

  game.settings.registerMenu(MODULE, "gmTools", {
    name: "MAUL.Menu.Name",
    label: "MAUL.Menu.Label",
    hint: "MAUL.Menu.Hint",
    icon: "fas fa-store",
    type: GMToolsApp,
    restricted: true
  });

  game.keybindings.register(MODULE, "interact", {
    name: "MAUL.Keybindings.Interact.Name",
    hint: "MAUL.Keybindings.Interact.Hint",
    editable: [{key: "KeyE"}, {key: "Space"}],
    // Inside a mall the key is always ours, so Space never falls through to Foundry's pause (Zak, 17 Nov 2026)
    onDown: () => onInteractKey() || !!currentMallId(),
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY
  });

  // GM pause toggle on its own key, since plain Space is the talk key inside malls (Zak, 17 Nov 2026)
  game.keybindings.register(MODULE, "togglePause", {
    name: "MAUL.Keybindings.TogglePause.Name",
    hint: "MAUL.Keybindings.TogglePause.Hint",
    editable: [{key: "Space", modifiers: ["Shift"]}, {key: "Pause"}],
    onDown: () => {
      if ( !game.user.isGM ) return false;
      game.togglePause(!game.paused, {broadcast: true});
      return true;
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY
  });

  game.keybindings.register(MODULE, "search", {
    name: "MAUL.Keybindings.Search.Name",
    hint: "MAUL.Keybindings.Search.Hint",
    editable: [{key: "KeyF"}],
    onDown: () => onSearchKey(),
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  game.keybindings.register(MODULE, "feedback", {
    name: "MAUL.Keybindings.Feedback.Name",
    hint: "MAUL.Keybindings.Feedback.Hint",
    editable: [{key: "KeyJ"}],
    onDown: () => {
      if ( isDialogueOpen() ) return false;
      openFeedback().catch(err => console.error(`${MODULE} | note dialog failed`, err));
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  game.keybindings.register(MODULE, "mallMap", {
    name: "MAUL.Keybindings.MallMap.Name",
    hint: "MAUL.Keybindings.MallMap.Hint",
    editable: [{key: "KeyM"}],
    onDown: () => {
      if ( !currentMallId() || isDialogueOpen() ) return false;
      const open = foundry.applications.instances.get("maul-directory");
      if ( open?.rendered ) open.close();
      else DirectoryApp.open().catch(err => console.error(`${MODULE} | directory failed`, err));
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  game.keybindings.register(MODULE, "storeNames", {
    name: "MAUL.Keybindings.StoreNames.Name",
    hint: "MAUL.Keybindings.StoreNames.Hint",
    editable: [{key: "KeyN"}],
    onDown: () => (currentMallId() && !isDialogueOpen() ? Markers.toggleNames() : false),
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
});

/* -------------------------------------------- */
/*  Keys                                        */
/* -------------------------------------------- */

let searching = false;
function onSearchKey() {
  if ( searching || isDialogueOpen() || !currentMallId() ) return false;
  const token = getPlayerToken();
  if ( !token ) return false;
  searching = true;
  Hidden.search(token, tokenTile(token))
    .catch(err => console.error(`${MODULE} | search failed`, err))
    .finally(() => { searching = false; });
  return true;
}

/* -------------------------------------------- */
/*  Canvas lifecycle                            */
/* -------------------------------------------- */

let canvasGen = 0;

async function onCanvasReady() {
  const gen = ++canvasGen;
  teardownAll();
  const mallId = currentMallId();
  let ctx = null;
  if ( mallId ) {
    try { ctx = await getMallContext(mallId); } catch(err) { console.error(`${MODULE} | mall data failed to load`, err); }
  }
  if ( gen !== canvasGen || !canvas?.ready ) return;
  Areas.setup(ctx);
  Hint.onCanvasReady(ctx);
  if ( ctx ) {
    for ( const [name, fn] of [["hidden", () => Hidden.setup(ctx)], ["markers", () => Markers.setup(ctx)]] ) {
      try { fn(); } catch(err) { console.error(`${MODULE} | ${name} setup failed`, err); }
    }
    Live.setup(ctx).catch(err => console.error(`${MODULE} | live sprites failed`, err));
  }
  const token = ctx ? getPlayerToken() : null;
  setFeedbackContext(ctx, token);
  resetStoreChip();
  if ( token ) onOwnMove(token, {force: true});
  else Music.update(mallId, null, {force: true});
}

function teardownAll() {
  setFeedbackContext(null, null);
  for ( const sys of [Live, Markers, Hidden, Areas] ) {
    try { sys.teardown(); } catch(err) { console.warn(`${MODULE} | teardown failed`, err); }
  }
  Hint.teardown();
}

/** The viewer's own token moved (or the canvas just loaded). */
function onOwnMove(token, {force = false} = {}) {
  const mallId = currentMallId();
  if ( !mallId || !Hint.ctx ) return;
  const tile = tokenTile(token);
  setFeedbackContext(Hint.ctx, token);
  storeChipTick(Hint.ctx, tile);
  Areas.onOwnTokenTile(tile);
  Hidden.passiveTick(token, tile);
  Markers.updateTags(tile);
  Music.update(mallId, tile, {force});
  ambientTick(token);
}

/** Flags or week changed: areas may unlock, hidden things may be noticed, booths may open. */
function onKnowledgeChanged() {
  Areas.recompute();
  Hidden.sync();
  Markers.drawCoins();
  Markers.drawNames();
  Hint.refresh();
}

Hidden.onNotice = () => onKnowledgeChanged();
Live.onMove = () => { Hint.refresh(); repositionAll(); };

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

// v13+: controls is a record keyed by control name ("tokens"), each with a record of tools
Hooks.on("getSceneControlButtons", controls => {
  if ( !game.user?.isGM ) return;
  const tokenControls = controls.tokens ?? controls.token;
  if ( !tokenControls?.tools ) return;
  const order = Object.keys(tokenControls.tools).length;
  tokenControls.tools["maul-gm-tools"] = {
    name: "maul-gm-tools",
    title: "MAUL Mall Explorer: GM tools",
    icon: "fa-solid fa-store",
    order,
    button: true,
    visible: game.user.isGM,
    onChange: () => new GMToolsApp().render({force: true})
  };
  tokenControls.tools["maul-summon-walker"] = {
    name: "maul-summon-walker",
    title: "MAUL: Bring my walker here (your one walker; extra copies removed)",
    icon: "fa-solid fa-person-walking-arrow-right",
    order: order + 0.5,
    button: true,
    visible: game.user.isGM,
    onChange: () => summonWalker()
  };
  tokenControls.tools["maul-build-scenes"] = {
    name: "maul-build-scenes",
    title: "MAUL: Build / rebuild mall scenes",
    icon: "fa-solid fa-hammer",
    order: order + 1,
    button: true,
    visible: game.user.isGM,
    onChange: () => buildAllMallScenes()
  };
});

Hooks.once("ready", () => {
  registerSocket();
  registerLeylineSocket();
  registerMuseSocket();
  registerCanvasClick();
  renderWeekChip();
  renderPA();
  rebuildCodexIndex();
  // A module API for macros: game.modules.get("maul-mall-explorer").api
  const mod = game.modules.get(MODULE);
  if ( mod ) {
    mod.api = {
      openGMTools: () => new GMToolsApp().render({force: true}),
      openDiscoveries: () => new DiscoveriesApp().render({force: true}),
      buildAllMallScenes, syncBoothTiles, exportCharacterLogs, openDirectory: o => DirectoryApp.open(o), applyUpdateFiles, shareWithTable,
      createPlayerUsers, setupPlayerCharacters, setUpEverything
    };
  }
  // First time the GM opens the world: make the player users, their characters (with tokens, ownership,
  // assignment) and the mall scenes, so nothing has to be made by hand.
  if ( game.user.isGM && game.users.activeGM?.id === game.user.id && !game.settings.get(MODULE, "autoSetupDone") ) {
    setUpEverything({first: true}).catch(err => console.error(`${MODULE} | first-time setup failed`, err));
  }
  if ( canvas?.ready ) onCanvasReady();
  if ( !game.user.isGM ) goToMyMall().catch(err => console.error(`${MODULE} | opening the player's mall failed`, err));
  flushPendingFeedback().catch(err => console.error(`${MODULE} | flushing notes failed`, err));
  migrateWeeks().then(() => issueWeeklyPotions())
    .catch(err => console.error(`${MODULE} | splitting the week per table failed`, err))
    // Booth tiles only changed on a week change, so an uploaded / rebuilt world could show coins over hidden booths.
    // The active GM re-syncs them on every load (17 Nov 2026).
    .then(() => (game.user === game.users.activeGM ? syncBoothTiles() : null))
    .catch(err => console.error(`${MODULE} | syncing booth tiles failed`, err));
  restoreCutLines().catch(err => console.error(`${MODULE} | restoring cut lines failed`, err));
  syncAllJournals();
  fileWritings();                                    // anything written while no GM was online
  lockCharacterRotation().catch(err => console.error(`${MODULE} | locking token rotation failed`, err));
  compactOldLogs().catch(err => console.error(`${MODULE} | compacting character logs failed`, err));
});

/** Active GM, once per world: drop the routine entries older versions logged (flags and seen counts stay). */
async function compactOldLogs() {
  const VERSION = 1;
  if ( !game.user.isGM || game.users.activeGM?.id !== game.user.id ) return;
  if ( (Number(game.settings.get(MODULE, "logCompacted")) || 0) >= VERSION ) return;
  let removed = 0;
  for ( const u of game.users.contents ) {
    try { removed += await compactLog(u); } catch(err) { console.error(`${MODULE} | compacting ${u.name}'s log failed`, err); }
  }
  await game.settings.set(MODULE, "logCompacted", VERSION);
  if ( removed ) console.log(`${MODULE} | character logs compacted: ${removed} routine entries removed`);
}

// Codex entries opened: one log line the first time each entry is read (flag codex-read-<slug> remembers it)
Hooks.on("renderJournalEntrySheet", app => {
  const je = app?.document ?? app?.object;
  const slug = je?.flags?.["maul-campaign-codex"]?.slug;
  if ( game.user.isGM || !slug || hasFlag(`codex-read-${slug}`) ) return;
  setFlags([`codex-read-${slug}`], game.user, {kind: "codex", once: true, id: slug, name: `Read codex: ${je.name}`}).catch(() => {});
});

Hooks.on("canvasReady", () => {
  onCanvasReady();
  renderWeekChip();
  walkerFollowsGM().catch(err => console.error(`${MODULE} | walker follow failed`, err));   // GM: your walker comes along
});   // the chip shows this mall's week
Hooks.on("canvasTearDown", () => teardownAll());

// Keep hints, secret areas, notices, tags and music in step with the token; hide tokens in locked secret areas
Hooks.on("refreshToken", token => {
  applyTokenConcealment(token);
  if ( !currentMallId() || !token.document.isOwner ) return;
  Hint.refresh();
  if ( token === getPlayerToken() ) onOwnMove(token);
});
Hooks.on("refreshTile", tile => applyTileConcealment(tile));
Hooks.on("controlToken", () => Hint.refresh());

// Stand-ins hide while their character's token is on the scene; refresh hints when tokens come and go
Hooks.on("createToken", () => Hint.refresh());
Hooks.on("deleteToken", () => Hint.refresh());

Hooks.on("updateUser", (user, changes) => {
  // A wardrobe change re-skins that character's store stand-in (token sprites re-check by themselves)
  // ...and a Coworkers-panel swap re-skins that coworker for everyone (SPEC 27)
  const has = key => foundry.utils.hasProperty(changes, `flags.${MODULE}.${key}`);
  if ( (has("form") || has("coworkers")) && Hint.ctx ) {
    Live.setup(Hint.ctx).catch(err => console.error(`${MODULE} | live sprites failed`, err));
  }
  if ( has("writings") && game.user.isGM ) fileWritings([user]);   // active GM writes each new writing's .txt file
  if ( has("journal") || has("coworkers") ) {
    queueJournalSync(user);                          // active GM rebuilds "MAUL Journal: <character>"
    if ( user.isSelf ) NotebookApp.refresh();
  }
  if ( game.user.isGM && foundry.utils.hasProperty(changes, `flags.${MODULE}.pendingFeedback`)
    && Object.values(foundry.utils.getProperty(changes, `flags.${MODULE}.pendingFeedback`) ?? {}).some(v => v?.text) ) {
    flushPendingFeedback(user).catch(err => console.error(`${MODULE} | flushing notes failed`, err));
  }
  if ( user.isSelf && foundry.utils.hasProperty(changes, `flags.${MODULE}`) ) onKnowledgeChanged();
  if ( user.isSelf && foundry.utils.hasProperty(changes, `flags.${MODULE}.pendingFeedback`) ) NotebookApp.refresh();
  GMToolsApp.refresh();
  DiscoveriesApp.refresh();
});


/** Users from players.json, their characters, and the mall scenes, in one go (GM only). */
async function setUpEverything({first = false} = {}) {
  if ( !game.user.isGM ) return;
  ui.notifications.info(first ? "MAUL: first-time setup. Making player users, characters and the malls..."
    : "MAUL: setting up players, characters and the malls...");
  await createPlayerUsers();
  await setupPlayerCharacters();
  await buildAllMallScenes();
  // nobody should land on Foundry's default scene: make a mall the active scene if it isn't one already
  const mallScenes = game.scenes.filter(sc => sc.getFlag(MODULE, "mallId"));
  if ( mallScenes.length && !game.scenes.active?.getFlag(MODULE, "mallId") ) await mallScenes[0].activate();
  await game.settings.set(MODULE, "autoSetupDone", true);
  const codex = game.modules.get("maul-campaign-codex");      // then the codex, now that characters are assigned
  if ( codex?.active && codex.api?.syncToWorld ) {
    try {
      await codex.api.syncToWorld();
      await game.settings.set("maul-campaign-codex", "syncedVersion", codex.version ?? "");
    } catch(err) { console.error(`${MODULE} | codex sync failed`, err); }
  }
  ui.notifications.info("MAUL: setup done. Players can log in and find their characters ready.");
}


/** Players open straight into the mall where their character stands (or their home mall), not the default scene. */
async function goToMyMall() {
  const isMall = sc => !!sc?.getFlag(MODULE, "mallId");
  const actor = game.user.character;
  // where their token is right now (they may be away at the other mall after the leyline)
  const here = actor ? game.scenes.find(sc => isMall(sc) && sc.tokens.some(t => t.actorId === actor.id)) : null;
  let target = here;
  if ( !target ) {
    const home = await homeMallId(game.user);
    target = home ? game.scenes.find(sc => sc.getFlag(MODULE, "mallId") === home) : null;
  }
  if ( !target || canvas?.scene?.id === target.id ) return;
  if ( !target.testUserPermission(game.user, "LIMITED") && !target.active ) return;
  await target.view();
}
