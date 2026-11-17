// Acorndr: Th'Tief's social media as a phone-style Foundry app, reusable across campaigns.
//
// The engine knows nothing about any campaign. Content comes from CONTENT SETS:
//   - a campaign module calls `Acorndr.register({...})` in its "setup" hook (see README.md for the full adapter), or
//   - the GM points the world setting "Content file" at a JSON file (same format as a registered set's file).
// A content set = {profiles: [...], kinds?: [[kind, label], ...]} plus optional adapter functions (week, requires,
// visible, near, sprite, playerSprite, onFollow, onWrite, blockKey, sound, anchor, prepare) that plug the app into
// that campaign's world.
//
// Per-user state: User flag `acorndr.state = {follows: {<profileId>: {how, t, week, where}}, acorned: {<postId>: t},
// seen: {<postId>: 1}}`. One player user = one character.
//
// PLAYER PROFILES (opt-in, 17 Nov 2026; Zak: "The players need to have their own Acorndr apps if they want to, their own
// profiles as well"): User flag `acorndr.profile = {handle, name, bio, pic: "token"|"portrait"|"sprite", t, updated}` and
// `acorndr.posts = {<postId>: {id, text, t, week, friends}}`. Saved at once on the writer's own User (no GM needed),
// readable by everyone. Player accounts have id `pc-<userId>`; anyone can follow them; two players who follow each other
// are friends (they see each other's friends-only posts). Follower and acorn counts on player accounts are live counts
// over all users. GM moderation: world setting `moderation = {profiles: {<userId>: t}, posts: {<postId>: t}}` hides a
// profile or a post from everyone but its owner (who sees "hidden by the GM") and GMs.

const MODULE = "acorndr";
const APP_ID = "acorndr-app";
const CHIP_ID = "acorndr-chip";
const DEFAULT_KINDS = [
  ["celeb", "Celebrities"], ["judge", "Judges"], ["leader", "World leaders"], ["brand", "Official accounts"],
  ["public", "Public accounts"], ["local", "Locals you've met"]
];
/** Caps for player writing (Zak: high caps, told before they hit them, never silently cut). */
export const LIMITS = {handle: 30, name: 120, bio: 10000, post: 10000, comment: 300};   // comment: Zak, 17 Nov 2026
/**
 * NPC comments per post: at most this many DIFFERENT NPCs, one comment each (Zak, 17 Nov 2026: "The limit on comments
 * is not for players, it's for NPCs... I meant 3 different NPCs"). Players comment freely (no pacing, no per-post cap).
 */
export const MAX_COMMENTS = 3;

const {ApplicationV2} = foundry.applications.api;
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"})[c]);

/* -------------------------------------------- */
/*  Content sets + adapter                      */
/* -------------------------------------------- */

const sets = [];                 // registered sets: {id, url?, data?, ...adapter}
let loaded = null;               // {profiles, kinds, comments} merged, cached until Acorndr.reload()
let current = null;              // the last {profiles, ...} the app rendered with (for comment authors)
const openComments = new Set();  // post ids whose comments are expanded in the feed
const warned = new Set();        // content sets the GM was already warned about

/** First registered set that defines `name` as a function (the campaign adapter), else undefined. */
function hook(name) {
  for ( const s of sets ) if ( typeof s[name] === "function" ) return s[name].bind(s);
  return undefined;
}
const adapterValue = name => sets.find(s => s[name] !== undefined)?.[name];

async function fetchJSON(url) {
  try {
    const res = await fetch(url, {cache: "no-cache"});
    return res.ok ? await res.json() : null;
  } catch(err) {
    console.warn(`${MODULE} | could not load ${url}`, err);
    return null;
  }
}

async function loadAll() {
  if ( loaded ) return loaded;
  const all = [...sets];
  const path = game.settings.get(MODULE, "contentFile");
  if ( path ) all.push({id: "world-setting", url: path});
  const profiles = [];
  const comments = {};             // postId -> [comment] from content files' top-level `comments` map
  let kinds = null;
  const seen = new Set();
  for ( const s of all ) {
    const data = s.data ?? (s.url ? await fetchJSON(s.url) : null);
    if ( !Array.isArray(data?.profiles) ) {
      console.warn(`${MODULE} | content set "${s.id}" has no profiles (${s.url ?? "inline data"})`);
      if ( game.user?.isGM && !warned.has(s.id) ) {
        warned.add(s.id);
        ui.notifications?.warn(`Acorndr: couldn't load the accounts for "${s.id}"${s.url ? ` (${s.url})` : ""}.`);
      }
      continue;
    }
    kinds ??= data.kinds ?? s.kinds ?? null;
    for ( const [postId, list] of Object.entries(data.comments ?? {}) ) {
      if ( Array.isArray(list) ) (comments[postId] ??= []).push(...list);
    }
    for ( const p of data.profiles ) {
      if ( !p?.id || seen.has(p.id) ) continue;            // first set wins on a duplicate id
      seen.add(p.id);
      profiles.push({...p, _set: s.id});
    }
  }
  loaded = {profiles, kinds: kinds ?? DEFAULT_KINDS, comments};
  return loaded;
}

/** NPC content plus every player's own profile (built fresh each time: players change theirs live). */
async function loadWithPlayers() {
  const base = await loadAll();
  current = {profiles: [...playerProfiles(), ...base.profiles], kinds: base.kinds, comments: base.comments};
  return current;
}

/* -------------------------------------------- */
/*  Player profiles                             */
/* -------------------------------------------- */

const pcId = user => `pc-${user.id}`;
const userOfProfile = p => (p?.player ? game.users.get(p.userId) : null);
const getProfile = (user = game.user) => user?.getFlag(MODULE, "profile") ?? null;
const getPosts = (user = game.user) => user?.getFlag(MODULE, "posts") ?? {};
/** A player's own comments: User flag `acorndr.comments = {<cid>: {id, post, text, t, week}}` (readable by all). */
const getComments = (user = game.user) => user?.getFlag(MODULE, "comments") ?? {};
const moderation = () => game.settings.get(MODULE, "moderation") ?? {};
const profileHidden = userId => !!moderation().profiles?.[userId];
const postHidden = postId => !!moderation().posts?.[postId];
const commentHidden = cid => !!moderation().comments?.[cid];

function playerAvatar(user, prof) {
  const actor = user.character;
  const initials = (prof.name ?? user.name).split(/\s+/).map(w => w[0]).join("").slice(0, 2);
  const av = {initials, color: user.color?.css ?? String(user.color ?? "#4a6fa5")};
  if ( prof.pic === "sprite" ) {
    const key = hook("playerSprite")?.(user);
    if ( key ) return {...av, sprite: key};
  }
  const token = actor?.prototypeToken?.texture?.src;
  const portrait = actor?.img;
  const img = prof.pic === "portrait" ? (portrait || token) : (token || portrait);
  return {...av, img: img || user.avatar || null};
}

/** Every user's opt-in profile as an account object (`player: true`). */
function playerProfiles() {
  const out = [];
  for ( const user of game.users ) {
    const prof = getProfile(user);
    if ( !prof?.handle ) continue;
    const posts = Object.values(getPosts(user)).filter(x => x?.id && x.text)
      .sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
    out.push({
      id: pcId(user), userId: user.id, player: true, kind: "player",
      handle: prof.handle, name: prof.name || user.character?.name || user.name, bio: prof.bio ?? "",
      home: user.character?.name && user.character.name !== prof.name ? user.character.name : null,
      avatar: playerAvatar(user, prof), posts
    });
  }
  return out;
}

/** How many users follow this account (player accounts: a live count). */
const liveFollowers = p => game.users.filter(u => getState(u).follows[p.id]).length;
const liveAcorns = postId => game.users.filter(u => getState(u).acorned[postId]).length;

/** Can this viewer see this player account / post at all (GM moderation)? */
const canSeePlayer = p => !p.player || game.user.isGM || p.userId === game.user.id || !profileHidden(p.userId);
const canSeePost = (p, post) => !p.player || game.user.isGM || p.userId === game.user.id || !postHidden(post.id);

/* -------------------------------------------- */
/*  World rules (adapter, with plain defaults)  */
/* -------------------------------------------- */

function getWeek() {
  const fn = hook("week");
  if ( fn ) return Number(fn()) || 0;
  return Number(game.settings.get(MODULE, "week")) || 0;
}

/** `requires` blocks on profiles and posts. Default understands minWeek / maxWeek only. */
function meets(req, week) {
  if ( !req || typeof req !== "object" ) return true;
  const fn = hook("requires");
  if ( fn ) return !!fn(req, week, game.user);
  if ( Number.isFinite(req.minWeek) && week < req.minWeek ) return false;
  if ( Number.isFinite(req.maxWeek) && week > req.maxWeek ) return false;
  return true;
}

export function getState(user = game.user) {
  const s = user?.getFlag(MODULE, "state") ?? {};
  return {follows: s.follows ?? {}, acorned: s.acorned ?? {}, seen: s.seen ?? {}};
}

const isLocal = p => !!p.npc;                        // an in-person account: met and added face to face (adapter decides)
const isSelf = p => !!p.player && p.userId === game.user.id;
const followOf = (p, st) => st.follows[p.id] ?? null;
/** Friends: NPC locals by "Add friend"; players when both follow each other. */
function isFriend(p, st) {
  if ( p.player ) {
    const them = userOfProfile(p);
    return !!followOf(p, st) && !!them && !!getState(them).follows[pcId(game.user)];
  }
  return followOf(p, st)?.how === "friend";
}
const kindOf = p => p.kind ?? (isLocal(p) ? "local" : "public");

function followersAt(p, week) {
  if ( p.player ) return liveFollowers(p);
  const f = p.followers;
  const base = Array.isArray(f) ? Number(f[Math.min(week, f.length - 1)] ?? f[f.length - 1] ?? 0) : (Number(f) || 0);
  return base;
}

function profileVisible(p, week, st) {
  if ( p.player ) return canSeePlayer(p);
  if ( !meets(p.requires, week) ) return false;
  if ( followOf(p, st) ) return true;
  const fn = hook("visible");
  return fn ? fn(p, week, game.user) !== false : true;
}

/** Can this user add this profile right now? {ok, why, gm}. Non-locals always; locals per the adapter's `near`. */
function nearness(p) {
  if ( !isLocal(p) ) return {ok: true};
  const fn = hook("near");
  if ( fn ) return fn(p, game.user) ?? {ok: false, why: "You can't add them from here."};
  return {ok: true};
}

function visiblePosts(p, week, st, {lockedToo = false} = {}) {
  const friend = isFriend(p, st) || isSelf(p) || (p.player && game.user.isGM);   // GMs read every player post (moderation)
  const out = [];
  for ( const post of p.posts ?? [] ) {
    if ( p.player ) {
      if ( !canSeePost(p, post) ) continue;            // player posts aren't week-gated (tables can be on different weeks)
    } else {
      if ( !Number.isFinite(post.week) || post.week > week ) continue;
      if ( !meets(post.requires, week) ) continue;
    }
    if ( post.friends && !friend ) {
      if ( lockedToo ) out.push({...post, locked: true});
      continue;
    }
    out.push(post);
  }
  return out.reverse().sort((a, b) => ((b.week ?? 0) - (a.week ?? 0)) || ((b.t ?? 0) - (a.t ?? 0)));
}

function feedPosts(data, week, st) {
  const posts = [];
  for ( const p of data.profiles ) {
    if ( !(followOf(p, st) || isSelf(p)) || !profileVisible(p, week, st) ) continue;
    if ( !p.player && !meets(p.requires, week) ) continue;
    visiblePosts(p, week, st).forEach((post, i) => posts.push({post, p, order: i}));
  }
  return posts.sort((a, b) => ((b.post.week ?? 0) - (a.post.week ?? 0)) || ((b.post.t ?? 0) - (a.post.t ?? 0))
    || (a.order - b.order) || a.p.name.localeCompare(b.p.name));
}

function nearbyLocals(data, week, st) {
  return data.profiles.filter(p => {
    if ( !isLocal(p) || !profileVisible(p, week, st) ) return false;
    const n = nearness(p);
    return n.ok && !n.gm && n.near !== false;
  });
}

const sound = name => { try { hook("sound")?.(name); } catch(err) { /* optional */ } };

/** Whisper the GMs (best effort; a world setting turns it off). */
function whisperGMs(content) {
  if ( !game.settings.get(MODULE, "whisperGM") ) return;
  const gms = game.users.filter(u => u.isGM && u.id !== game.user.id).map(u => u.id);
  if ( !gms.length ) return;
  ChatMessage.create({content, whisper: gms, speaker: {alias: "Acorndr"}}).catch(err => console.warn(`${MODULE} | whisper`, err));
}

/** Hand a player's writing to the campaign (MAUL files it as a .txt). Never blocks saving. */
async function fileWriting(w) {
  try { await hook("onWrite")?.(w, game.user); } catch(err) { console.warn(`${MODULE} | onWrite`, err); }
  Hooks.callAll("acorndrWrite", w, game.user);
}

/* -------------------------------------------- */
/*  Writes                                      */
/* -------------------------------------------- */

async function setFollow(p, how) {
  const week = getWeek();
  await game.user.update({[`flags.${MODULE}.state.follows.${p.id}`]: {how, t: Date.now(), week, where: canvas?.scene?.name ?? null}});
  try { await hook("onFollow")?.(p, how, game.user); } catch(err) { console.warn(`${MODULE} | onFollow`, err); }
  Hooks.callAll("acorndrFollow", p, how, game.user);
}

const DEL = () => (foundry.data?.operators?.ForcedDeletion ? new foundry.data.operators.ForcedDeletion() : null);
const delKey = (base, key) => (DEL() ? {[`${base}.${key}`]: DEL()} : {[`${base}.-=${key}`]: null});

async function unfollow(p) {
  await game.user.update(delKey(`flags.${MODULE}.state.follows`, p.id));
  Hooks.callAll("acorndrUnfollow", p, game.user);
}

async function toggleAcorn(postId) {
  const st = getState();
  if ( st.acorned[postId] ) await game.user.update(delKey(`flags.${MODULE}.state.acorned`, postId));
  else await game.user.update({[`flags.${MODULE}.state.acorned.${postId}`]: Date.now()});
}

async function markSeen(posts) {
  const st = getState();
  const fresh = posts.filter(({post, p}) => !st.seen[post.id] && !isSelf(p));
  if ( !fresh.length ) return false;
  const update = {};
  for ( const {post} of fresh ) update[`flags.${MODULE}.state.seen.${post.id}`] = 1;
  await game.user.update(update);
  return true;
}

/** Handles: letters, digits, underscore; unique across NPC and player accounts (case-insensitive). */
function handleProblem(handle, profiles) {
  if ( !/^[A-Za-z0-9_]{2,30}$/.test(handle) ) return "Handles are 2 to 30 letters, numbers or underscores (no spaces).";
  const taken = profiles.some(p => !isSelf(p) && String(p.handle ?? "").toLowerCase() === handle.toLowerCase());
  return taken ? `@${handle} is taken. Try another.` : null;
}

/* -------------------------------------------- */
/*  Length counters                             */
/* -------------------------------------------- */

const num = n => Number(n).toLocaleString();

/** Every [data-max] field gets a counter that shows from 75% of the cap; over the cap it turns red (nothing is cut). */
function attachCounters(root) {
  for ( const el of root.querySelectorAll("input[data-max], textarea[data-max]") ) {
    const box = document.createElement("div");
    box.className = "acd-count-box";
    el.insertAdjacentElement("afterend", box);
    const update = () => {
      const max = Number(el.dataset.max) || 0;
      const n = el.value.length;
      if ( !max || n < max * 0.75 ) { box.textContent = ""; box.className = "acd-count-box"; return; }
      const over = n > max;
      box.className = `acd-count-box ${over ? "over" : "near"}`;
      box.textContent = over ? `${num(n)} / ${num(max)}: ${num(n - max)} over. Trim it or split it; nothing is lost.`
        : `${num(n)} / ${num(max)} characters`;
    };
    el.addEventListener("input", update);
    update();
  }
}

/** [[label, text, max], ...] -> true if all fit, else warns (text stays in the box). */
function withinLimits(checks) {
  for ( const [label, text, max] of checks ) {
    if ( String(text ?? "").length > max ) {
      ui.notifications.warn(`${label} is ${num(String(text).length - max)} characters over the ${num(max)} limit. It's still in the box: trim it, or split it.`);
      return false;
    }
  }
  return true;
}

/* -------------------------------------------- */
/*  Rendering helpers                           */
/* -------------------------------------------- */

const fmt = n => {
  n = Number(n) || 0;
  if ( n >= 1e6 ) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if ( n >= 1e4 ) return `${Math.round(n / 1e3)}K`;
  return n.toLocaleString("en-GB");
};

function avatarHTML(p, size = "s") {
  const a = p.avatar ?? {};
  const initials = esc(a.initials ?? p.name.split(/\s+/).map(w => w[0]).join("").slice(0, 2));
  const bg = `background-color:${esc(a.color ?? "#7a5a2f")}`;
  const sprite = a.sprite ? hook("sprite")?.(a.sprite, p) : null;       // {url, frames} from the campaign's sprite sheets
  if ( sprite?.url ) {
    const frames = Number(sprite.frames) || 1;
    return `<span class="acd-av acd-av-${size} acd-av-sprite" style="${bg}"><span class="acd-av-px" style="background-image:url('${esc(sprite.url)}');background-size:${frames * 100}% 100%"></span></span>`;
  }
  if ( a.img ) return `<span class="acd-av acd-av-${size}" style="${bg}"><img src="${esc(a.img)}" alt="" data-fallback="${initials}"></span>`;
  return `<span class="acd-av acd-av-${size}" style="${bg}"><b>${initials}</b></span>`;
}

const tick = p => (p.verified ? ` <i class="fas fa-circle-check acd-tick" title="Verified"></i>`
  : (p.player ? ` <i class="fas fa-user acd-pc" title="A player character"></i>` : ""));
const nameLine = p => `<a class="acd-name" data-action="profile" data-id="${esc(p.id)}">${esc(p.name)}${tick(p)}</a> <span class="acd-handle">@${esc(p.handle ?? p.id)}</span>`;

function weekText(week) {
  const fn = hook("weekLabel");
  const label = fn ? fn(week) : "";
  return `Wk ${week}${label ? ` · ${esc(label)}` : ""}`;
}

function whenText(post) {
  if ( !post.t ) return weekText(post.week ?? 0);
  const d = new Date(post.t);
  const day = d.toLocaleDateString(undefined, {day: "numeric", month: "short"});
  const time = d.toLocaleTimeString(undefined, {hour: "2-digit", minute: "2-digit"});
  return `${Number.isFinite(post.week) ? `Wk ${post.week} · ` : ""}${day} ${time}`;
}

/** Paragraph breaks kept for player posts (up to 10,000 characters). */
const textHTML = t => esc(t).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");

/**
 * Comments on a post, oldest first. NPC comments: at most MAX_COMMENTS different NPCs, one comment each. Inline `post.comments` (content), the content file's
 * top-level `comments[postId]` (e.g. written between sessions for players' posts), then GM-added ones (world setting
 * `comments`). Each comment = {by: <profileId>, text, week?, requires?, t?, id?}. Comments by accounts this viewer
 * can't see, or not yet due this week, are skipped.
 */
function commentsFor(post) {
  if ( !current ) return [];
  const week = getWeek();
  const gmAdded = (game.settings.get(MODULE, "comments") ?? {})[post.id] ?? [];
  const all = [...(post.comments ?? []), ...(current.comments?.[post.id] ?? []), ...gmAdded.map(c => ({...c, gm: true}))];
  const out = [];
  const npcs = new Set();
  for ( const c of all ) {
    if ( !c?.text || !c.by ) continue;
    if ( npcs.has(c.by) ) continue;                  // one comment per NPC per post
    if ( npcs.size >= MAX_COMMENTS ) break;
    if ( Number.isFinite(c.week) && c.week > week ) continue;
    if ( c.requires && !meets(c.requires, week) ) continue;
    const by = current.profiles.find(x => x.id === c.by);
    if ( !by || (by.player && !canSeePlayer(by)) ) continue;
    npcs.add(c.by);
    out.push({...c, byProfile: by});
  }
  // Players' own comments (any number), oldest first, after the NPC ones
  const players = [];
  for ( const user of game.users ) {
    for ( const c of Object.values(getComments(user)) ) {
      if ( c?.post !== post.id || !c.text ) continue;
      const by = current.profiles.find(x => x.id === pcId(user));
      if ( !by || !canSeePlayer(by) ) continue;
      const hidden = commentHidden(c.id);
      if ( hidden && !game.user.isGM && user.id !== game.user.id ) continue;
      players.push({...c, by: by.id, byProfile: by, userId: user.id, player: true, hidden});
    }
  }
  return [...out, ...players.sort((a, b) => (a.t ?? 0) - (b.t ?? 0))];
}

function commentsHTML(post, list, expanded) {
  const npcCount = list.filter(c => !c.player).length;
  const add = game.user.isGM && npcCount < MAX_COMMENTS
    ? `<button type="button" class="acd-mini" data-action="gmComment" data-post="${esc(post.id)}" title="GM: comment as an NPC"><i class="fas fa-comment-medical"></i></button>` : "";
  const label = list.length ? `${list.length} comment${list.length === 1 ? "" : "s"}` : "Comment";
  const toggle = `<button type="button" class="acd-ctoggle" data-action="toggleComments" data-post="${esc(post.id)}">
    <i class="fas fa-comment"></i> ${label}</button>`;
  if ( !expanded ) return `<div class="acd-comments ${list.length ? "" : "acd-comments-empty"}">${toggle}${add}</div>`;
  const rows = list.map(c => {
    let del = "";
    if ( c.gm && game.user.isGM ) del = `<button type="button" class="acd-mini" data-action="gmUncomment" data-post="${esc(post.id)}" data-cid="${esc(c.id)}" title="Remove this comment"><i class="fas fa-xmark"></i></button>`;
    else if ( c.player && (c.userId === game.user.id || game.user.isGM) ) del = `<button type="button" class="acd-mini" data-action="deleteComment" data-user="${esc(c.userId)}" data-cid="${esc(c.id)}" title="${c.userId === game.user.id ? "Delete your comment" : "GM: delete this comment"}"><i class="fas fa-xmark"></i></button>`;
    if ( c.player && game.user.isGM ) del += `<button type="button" class="acd-mini" data-action="modComment" data-cid="${esc(c.id)}" title="${c.hidden ? "Show this comment again" : "Hide this comment from other players"}"><i class="fas fa-eye${c.hidden ? "" : "-slash"}"></i></button>`;
    const hid = c.hidden ? `<span class="acd-tag acd-tag-hid">${game.user.isGM ? "hidden" : "hidden by the GM"}</span>` : "";
    return `<li class="acd-comment">${avatarHTML(c.byProfile, "xs")}<div><a class="acd-name" data-action="profile" data-id="${esc(c.byProfile.id)}">${esc(c.byProfile.name)}</a>${tick(c.byProfile)}${del}
${hid}
      <span class="acd-ctext">${esc(c.text)}</span></div></li>`;
  }).join("");
  // Reply box: players with a profile (and GMs with one) comment as themselves
  let box;
  if ( getProfile()?.handle ) {
    box = `<div class="acd-creply"><textarea data-draft="c:${esc(post.id)}" data-max="${LIMITS.comment}" rows="2" placeholder="Write a comment..."></textarea>
      <button type="button" class="acd-btn" data-action="comment" data-post="${esc(post.id)}">Reply</button></div>`;
  } else {
    box = `<p class="acd-note"><a data-action="acdTab" data-tab="me">Make a profile</a> to comment.</p>`;
  }
  return `<div class="acd-comments">${toggle}${add}${rows ? `<ul>${rows}</ul>` : ""}${box}</div>`;
}

function postHTML(post, p, st, {showWho = true, expand = false} = {}) {
  if ( post.locked ) {
    const why = p.player ? "Only people they follow back can read it." : (isLocal(p) ? "Add them as a friend to read it." : "");
    return `<article class="acd-post acd-locked"><i class="fas fa-lock"></i> A friends-only post. ${why}</article>`;
  }
  const mine = !!st.acorned[post.id];
  const count = p.player ? liveAcorns(post.id) : (Number(post.acorns) || 0) + (mine ? 1 : 0);
  const who = showWho ? `<header>${avatarHTML(p)}<div>${nameLine(p)}</div></header>` : "";
  const hidden = p.player && postHidden(post.id);
  let tools = "";
  if ( p.player && isSelf(p) ) tools += `<button type="button" class="acd-mini" data-action="deletePost" data-post="${esc(post.id)}" title="Delete this post (Zak keeps a copy)"><i class="fas fa-trash"></i></button>`;
  if ( p.player && game.user.isGM ) tools += `<button type="button" class="acd-mini" data-action="modPost" data-post="${esc(post.id)}" title="${hidden ? "Show this post again" : "Hide this post from other players"}"><i class="fas fa-eye${hidden ? "" : "-slash"}"></i></button>`;
  const hiddenNote = hidden ? `<div class="acd-modnote"><i class="fas fa-eye-slash"></i> Hidden by the GM${game.user.isGM ? "" : ": only you can see it"}.</div>` : "";
  return `<article class="acd-post ${post.friends ? "acd-friends-only" : ""} ${hidden ? "acd-hidden" : ""}">${who}${hiddenNote}
    <p>${textHTML(post.text)}</p>
    <footer><button type="button" class="acd-acorn ${mine ? "on" : ""}" data-action="acorn" data-post="${esc(post.id)}"
      title="${mine ? "Take your acorn back" : "Give an acorn"}"><span class="acd-acorn-ico"></span> ${fmt(count)}</button>
      ${post.friends ? `<span class="acd-tag" title="Only friends see this">friends</span>` : ""}<span class="acd-when">${whenText(post)}</span>${tools}</footer>
    ${commentsHTML(post, commentsFor(post), expand ? !openComments.has(`x:${post.id}`) : openComments.has(post.id))}
  </article>`;
}

function rowHTML(p, st, week) {
  const f = followOf(p, st);
  const friend = isFriend(p, st);
  const label = f ? (friend ? "Friends" : "Following") : (isLocal(p) ? "View" : "Follow");
  const act = f || isLocal(p) ? "profile" : "follow";
  const side = isSelf(p) ? `<span class="acd-tag">you</span>`
    : `<button type="button" class="acd-btn ${f ? "on" : ""}" data-action="${act}" data-id="${esc(p.id)}">${label}</button>`;
  const hidden = p.player && profileHidden(p.userId) ? ` <span class="acd-tag acd-tag-hid">hidden</span>` : "";
  return `<li class="acd-row">${avatarHTML(p)}<div class="acd-row-main">${nameLine(p)}${hidden}
      <div class="acd-row-bio">${esc(p.bio ?? "")}</div></div>
    <div class="acd-row-side"><span class="acd-count">${fmt(followersAt(p, week))}</span>${side}</div></li>`;
}

function unreadCount(data, week, st) {
  return feedPosts(data, week, st).filter(({post, p}) => !st.seen[post.id] && !isSelf(p)).length;
}

function unreadBadge(data, week, st) {
  const n = unreadCount(data, week, st);
  return n ? ` <span class="acd-badge">${n > 99 ? "99+" : n}</span>` : "";
}

/* -------------------------------------------- */
/*  App                                         */
/* -------------------------------------------- */

export class AcorndrApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: APP_ID,
    classes: ["acorndr-app"],
    tag: "div",
    window: {title: "Acorndr", icon: "fas fa-seedling", resizable: true},
    position: {width: 400, height: 660},
    actions: {
      acdTab: AcorndrApp.#onTab, /* not "tab": ApplicationV2 reserves it for its own tab groups */ profile: AcorndrApp.#onProfile, back: AcorndrApp.#onBack, follow: AcorndrApp.#onFollow,
      friend: AcorndrApp.#onFriend, unfollow: AcorndrApp.#onUnfollow, acorn: AcorndrApp.#onAcorn,
      saveProfile: AcorndrApp.#onSaveProfile, editProfile: AcorndrApp.#onEditProfile, cancelEdit: AcorndrApp.#onCancelEdit,
      post: AcorndrApp.#onPost, deletePost: AcorndrApp.#onDeletePost, deleteProfile: AcorndrApp.#onDeleteProfile,
      modPost: AcorndrApp.#onModPost, modProfile: AcorndrApp.#onModProfile,
      toggleComments: AcorndrApp.#onToggleComments, gmComment: AcorndrApp.#onGMComment, gmUncomment: AcorndrApp.#onGMUncomment,
      comment: AcorndrApp.#onComment, deleteComment: AcorndrApp.#onDeleteComment, modComment: AcorndrApp.#onModComment
    }
  };

  tab = "feed";             // feed | discover | mine | me
  profileId = null;
  data = null;
  editing = false;          // Me tab: profile form open
  drafts = {};              // unsent text, kept across re-renders: {post, handle, name, bio, pic, friends}

  static async open({profile, tab} = {}) {
    let app = foundry.applications.instances.get(APP_ID);
    if ( !app ) app = new AcorndrApp();
    if ( profile ) app.profileId = profile;
    if ( tab ) { app.tab = tab; app.profileId = null; }
    await app.render({force: true});
    app.bringToFront?.();
    return app;
  }

  static toggle() {
    const app = foundry.applications.instances.get(APP_ID);
    if ( app?.rendered ) return app.close();
    return AcorndrApp.open();
  }

  /** Redraw, unless the player is typing in the app (then redraw when they leave the field). */
  static refresh() {
    const app = foundry.applications.instances.get(APP_ID);
    if ( !app?.rendered ) return;
    const active = document.activeElement;
    if ( active && app.element?.contains(active) && /^(TEXTAREA|INPUT|SELECT)$/.test(active.tagName) ) {
      app._stale = true;
      return;
    }
    app.render();
  }

  async _prepareContext() {
    await Promise.all(sets.filter(s => typeof s.prepare === "function").map(s => s.prepare().catch(() => null)));
    this.data = await loadWithPlayers();
    return {week: getWeek(), st: getState()};
  }

  async _renderHTML({week, st}) {
    const data = this.data;
    const p = this.profileId ? data.profiles.find(x => x.id === this.profileId) : null;
    const tabs = [["feed", "Feed"], ["discover", "Discover"], ["mine", "Following"], ["me", "Me"]].map(([id, label]) =>
      `<button type="button" class="acd-tab ${this.tab === id && !p ? "active" : ""}" data-action="acdTab" data-tab="${id}">${label}${
        id === "feed" ? unreadBadge(data, week, st) : ""}</button>`).join("");
    const top = `<div class="acd-top"><span class="acd-logo"><span class="acd-acorn-ico"></span> ACORNDR</span>
      <span class="acd-wk">Wk ${week}</span></div><nav class="acd-tabs">${tabs}</nav>`;
    let body;
    if ( p && profileVisible(p, week, st) ) body = this.#profileBody(p, week, st);
    else if ( this.tab === "me" ) body = this.#meBody(data, week, st);
    else if ( !data.profiles.length ) body = `<div class="acd-empty"><p>No accounts yet.</p><p>Make your own in <a data-action="acdTab" data-tab="me">Me</a>, or the GM can load a content file in the module settings.</p></div>`;
    else if ( this.tab === "discover" ) body = this.#discoverBody(data, week, st);
    else if ( this.tab === "mine" ) body = this.#mineBody(data, week, st);
    else body = this.#feedBody(data, week, st);
    return `<div class="acd-phone">${top}<div class="acd-screen">${body}</div></div>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    this._stale = false;
    for ( const img of content.querySelectorAll(".acd-av img") ) {
      img.addEventListener("error", () => { img.replaceWith(Object.assign(document.createElement("b"), {textContent: img.dataset.fallback})); }, {once: true});
    }
    // Drafts survive re-renders (other players posting redraws the window)
    for ( const el of content.querySelectorAll("[data-draft]") ) {
      const key = el.dataset.draft;
      if ( this.drafts[key] !== undefined ) {
        if ( el.type === "checkbox" ) el.checked = !!this.drafts[key];
        else el.value = this.drafts[key];
      }
      el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input",
        () => { this.drafts[key] = el.type === "checkbox" ? el.checked : el.value; });
      el.addEventListener("blur", () => { if ( this._stale ) setTimeout(() => AcorndrApp.refresh(), 50); });
    }
    attachCounters(content);
    if ( this.tab === "feed" && !this.profileId ) {
      const posts = feedPosts(this.data, getWeek(), getState());
      markSeen(posts).then(wrote => { renderChip(); if ( wrote ) this.render(); }).catch(err => console.warn(`${MODULE} | seen`, err));
    }
  }

  #feedBody(data, week, st) {
    const posts = feedPosts(data, week, st);
    if ( !posts.length ) {
      return `<div class="acd-empty"><p>Your feed is empty.</p><p>Follow people in <a data-action="acdTab" data-tab="discover">Discover</a>.
        Anyone can browse locals there; you add them in person.</p></div>`;
    }
    return posts.map(({post, p}) => postHTML(post, p, st)).join("");
  }

  #discoverBody(data, week, st) {
    const near = nearbyLocals(data, week, st);
    let html = "";
    if ( near.length ) html += `<h3 class="acd-h">Right next to you</h3><ul class="acd-list">${near.map(p => rowHTML(p, st, week)).join("")}</ul>`;
    const players = data.profiles.filter(p => p.player && !isSelf(p) && profileVisible(p, week, st));
    if ( players.length ) html += `<h3 class="acd-h">Players</h3><ul class="acd-list">${players.map(p => rowHTML(p, st, week)).join("")}</ul>`;
    // Locals of the place the viewer is in come first (adapter `isHere` / `placeName`); the rest follow their kind
    const isHere = hook("isHere");
    const shown = new Set(near.map(p => p.id));
    if ( isHere ) {
      const here = data.profiles.filter(p => isLocal(p) && !shown.has(p.id) && profileVisible(p, week, st) && isHere(p));
      if ( here.length ) {
        const place = hook("placeName")?.() || "here";
        html += `<h3 class="acd-h">Locals at ${esc(place)}</h3><ul class="acd-list">${here.map(p => rowHTML(p, st, week)).join("")}</ul>`;
        here.forEach(p => shown.add(p.id));
      }
    }
    const kinds = [...data.kinds];
    for ( const p of data.profiles ) if ( !p.player && !kinds.some(([k]) => k === kindOf(p)) ) kinds.push([kindOf(p), kindOf(p)]);
    for ( const [kind, title] of kinds ) {
      const list = data.profiles.filter(p => !p.player && !shown.has(p.id) && kindOf(p) === kind && profileVisible(p, week, st));
      if ( !list.length ) continue;
      list.sort((a, b) => followersAt(b, week) - followersAt(a, week));
      const label = kind === "local" && isHere && shown.size ? `${title}: elsewhere` : title;
      html += `<h3 class="acd-h">${esc(label)}</h3><ul class="acd-list">${list.map(p => rowHTML(p, st, week)).join("")}</ul>`;
    }
    if ( data.profiles.some(p => isLocal(p) && !profileVisible(p, week, st)) ) {
      html += `<p class="acd-note">More people around here are on Acorndr. Talk to them to find out who.</p>`;
    }
    if ( !data.profiles.some(p => !p.player) && game.user.isGM ) {
      html += `<p class="acd-note">GM: no accounts are loaded. Check that the campaign module is active, or set a content file in the module settings.</p>`;
    }
    return html || `<div class="acd-empty"><p>Nobody here yet.</p></div>`;
  }

  #mineBody(data, week, st) {
    const list = data.profiles.filter(p => followOf(p, st) && profileVisible(p, week, st));
    if ( !list.length ) return `<div class="acd-empty"><p>You're not following anyone yet.</p></div>`;
    const friends = list.filter(p => isFriend(p, st));
    const rest = list.filter(p => !isFriend(p, st));
    let html = "";
    if ( friends.length ) html += `<h3 class="acd-h">Friends</h3><ul class="acd-list">${friends.map(p => rowHTML(p, st, week)).join("")}</ul>`;
    if ( rest.length ) html += `<h3 class="acd-h">Following</h3><ul class="acd-list">${rest.map(p => rowHTML(p, st, week)).join("")}</ul>`;
    return html;
  }

  /** Me: make or edit your own profile, write posts, see your posts. */
  #meBody(data, week, st) {
    const prof = getProfile();
    if ( !prof?.handle || this.editing ) return this.#profileForm(prof);
    const me = data.profiles.find(p => isSelf(p));
    const hidden = profileHidden(game.user.id)
      ? `<div class="acd-modnote"><i class="fas fa-eye-slash"></i> The GM has hidden your profile from other players for now.</div>` : "";
    const posts = me ? visiblePosts(me, week, st) : [];
    return `<div class="acd-profile">
      <div class="acd-prof-head">${avatarHTML(me, "l")}<div><div class="acd-prof-name">${esc(me.name)}${tick(me)}</div>
        <div class="acd-handle">@${esc(me.handle)}</div>${me.home ? `<div class="acd-home">${esc(me.home)}</div>` : ""}</div></div>
      <p class="acd-bio">${textHTML(me.bio)}</p>${hidden}
      <div class="acd-stats"><span><b>${fmt(liveFollowers(me))}</b> followers</span></div>
      <div class="acd-buttons"><button type="button" class="acd-btn on" data-action="editProfile">Edit profile</button></div>
    </div>
    <div class="acd-compose">
      <textarea data-draft="post" data-max="${LIMITS.post}" rows="4" placeholder="What's happening, @${esc(me.handle)}?"></textarea>
      <div class="acd-compose-row"><label><input type="checkbox" data-draft="friends"> Friends only</label>
        <button type="button" class="acd-btn" data-action="post">Post</button></div>
    </div>
    ${posts.length ? posts.map(post => postHTML(post, me, st, {showWho: false, expand: true})).join("") : `<div class="acd-empty"><p>No posts yet. Say hello!</p></div>`}`;
  }

  #profileForm(prof) {
    const fresh = !prof?.handle;
    const ch = game.user.character;
    const v = (key, fallback) => esc(this.drafts[key] ?? fallback ?? "");
    const spriteOk = !!hook("playerSprite")?.(game.user);
    const pic = this.drafts.pic ?? prof?.pic ?? "token";
    const opt = (val, label) => `<option value="${val}" ${pic === val ? "selected" : ""}>${label}</option>`;
    return `<div class="acd-form">
      <h3 class="acd-h">${fresh ? "Make your Acorndr profile" : "Edit your profile"}</h3>
      ${fresh ? `<p class="acd-note">Optional, and just for fun: a profile lets you post, and lets other players follow you. Everything you write is saved the moment you press the button${hook("onWrite") ? ", and the GM keeps a copy" : ""}.</p>` : ""}
      <label>Handle <span class="acd-hint">(letters, numbers, _)</span>
        <input type="text" data-draft="handle" data-max="${LIMITS.handle}" value="${v("handle", prof?.handle ?? (ch?.name ?? game.user.name).replace(/[^A-Za-z0-9_]+/g, ""))}"></label>
      <label>Display name <input type="text" data-draft="name" data-max="${LIMITS.name}" value="${v("name", prof?.name ?? ch?.name ?? game.user.name)}"></label>
      <label>Bio <textarea data-draft="bio" data-max="${LIMITS.bio}" rows="5" placeholder="Who are you on here?">${v("bio", prof?.bio)}</textarea></label>
      <label>Picture <select data-draft="pic">${opt("token", "My token")}${opt("portrait", "My character portrait")}${spriteOk ? opt("sprite", "My 8-bit sprite") : ""}</select></label>
      <div class="acd-buttons"><button type="button" class="acd-btn" data-action="saveProfile">${fresh ? "Create profile" : "Save"}</button>
        ${fresh ? "" : `<button type="button" class="acd-btn on" data-action="cancelEdit">Cancel</button>
        <button type="button" class="acd-btn on acd-danger" data-action="deleteProfile">Delete profile</button>`}</div>
    </div>`;
  }

  #profileBody(p, week, st) {
    const f = followOf(p, st);
    const friend = isFriend(p, st);
    const near = nearness(p);
    const id = esc(p.id);
    const dis = near.ok ? "" : "disabled";
    let buttons;
    if ( isSelf(p) ) buttons = `<button type="button" class="acd-btn on" data-action="acdTab" data-tab="me">This is you: open Me</button>`;
    else if ( isLocal(p) ) {
      if ( !f ) buttons = `<button type="button" class="acd-btn" data-action="follow" data-id="${id}" ${dis}>Follow</button>
        <button type="button" class="acd-btn" data-action="friend" data-id="${id}" ${dis}>Add friend</button>`;
      else if ( !friend ) buttons = `<button type="button" class="acd-btn" data-action="friend" data-id="${id}" ${dis}>Add friend</button>
        <button type="button" class="acd-btn on" data-action="unfollow" data-id="${id}">Following</button>`;
      else buttons = `<button type="button" class="acd-btn on" data-action="unfollow" data-id="${id}" title="Unfriend and unfollow">Friends <i class="fas fa-check"></i></button>`;
    } else {
      buttons = f ? `<button type="button" class="acd-btn on" data-action="unfollow" data-id="${id}">${friend ? "Friends <i class=\"fas fa-check\"></i>" : "Following"}</button>`
        : `<button type="button" class="acd-btn" data-action="follow" data-id="${id}">Follow</button>`;
    }
    if ( p.player && game.user.isGM && !isSelf(p) ) {
      const hid = profileHidden(p.userId);
      buttons += `<button type="button" class="acd-btn on" data-action="modProfile" data-id="${id}">${hid ? "Show profile again" : "GM: hide profile"}</button>`;
    }
    const whereText = isLocal(p) && !friend ? hook("whereIs")?.(p) : null;
    const needNear = isLocal(p) && !friend && !near.ok && near.why
      ? `<p class="acd-note">${esc(near.why)}${whereText ? ` They're at ${esc(whereText)}.` : ""}</p>` : "";
    const gmNote = near.gm && isLocal(p) && !friend ? `<p class="acd-note">GM: you can add locals from anywhere (players add them in person).</p>` : "";
    const pcNote = p.player && f && !friend && !isSelf(p) ? `<p class="acd-note">If they follow you back, you're friends and can read each other's friends-only posts.</p>` : "";
    const modNote = p.player && profileHidden(p.userId) ? `<div class="acd-modnote"><i class="fas fa-eye-slash"></i> Hidden from other players by the GM.</div>` : "";
    let hang = "";
    if ( p.hangout?.text ) {
      hang = (!p.hangout.friends || friend)
        ? `<div class="acd-hang"><i class="fas fa-location-dot"></i> <b>Often at:</b> ${esc(p.hangout.text)}</div>`
        : `<div class="acd-hang acd-locked"><i class="fas fa-lock"></i> Friends can see where ${esc(p.name.split(" ")[0])} hangs out.</div>`;
    }
    const posts = visiblePosts(p, week, st, {lockedToo: true});
    const runBy = p.runBy ? `<div class="acd-runby">Run by ${esc(p.runBy)}</div>` : "";
    return `<div class="acd-profile">
      <button type="button" class="acd-back" data-action="back"><i class="fas fa-chevron-left"></i> Back</button>
      <div class="acd-prof-head">${avatarHTML(p, "l")}<div><div class="acd-prof-name">${esc(p.name)}${tick(p)}</div>
        <div class="acd-handle">@${esc(p.handle ?? p.id)}</div>${p.home ? `<div class="acd-home">${esc(p.home)}</div>` : ""}</div></div>
      <p class="acd-bio">${p.player ? textHTML(p.bio) : esc(p.bio ?? "")}</p>${runBy}${modNote}
      <div class="acd-stats"><span><b>${fmt(followersAt(p, week))}</b> followers</span>${friend ? `<span class="acd-tag">friend</span>` : ""}</div>
      <div class="acd-buttons">${buttons}</div>${needNear}${gmNote}${pcNote}${hang}
    </div>${posts.length ? posts.map(post => postHTML(post, p, st, {showWho: false, expand: true})).join("") : `<div class="acd-empty"><p>No posts yet.</p></div>`}`;
  }

  static #onTab(event, target) {
    this.tab = target.dataset.tab;
    this.profileId = null;
    sound("confirm");
    this.render();
  }

  static #onProfile(event, target) {
    this.profileId = target.dataset.id;
    this.render();
  }

  static #onBack() {
    this.profileId = null;
    this.render();
  }

  static async #onFollow(event, target) {
    const p = this.data.profiles.find(x => x.id === target.dataset.id);
    if ( !p || isSelf(p) ) return;
    const near = nearness(p);
    if ( !near.ok ) return ui.notifications.info(near.why ?? "You can't add them from here.");
    await setFollow(p, "follow");
    sound("confirm");
    ui.notifications.info(`Following ${p.name} on Acorndr.`);
    this.render();
  }

  static async #onFriend(event, target) {
    const p = this.data.profiles.find(x => x.id === target.dataset.id);
    if ( !p || !isLocal(p) ) return;
    const near = nearness(p);
    if ( !near.ok ) return ui.notifications.info(near.why ?? "You can't add them from here.");
    await setFollow(p, "friend");
    sound("chime");
    ui.notifications.info(`You and ${p.name} are friends on Acorndr.`);
    this.render();
  }

  static async #onUnfollow(event, target) {
    const p = this.data.profiles.find(x => x.id === target.dataset.id);
    if ( !p ) return;
    const friend = isFriend(p, getState());
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: {title: "Acorndr"},
      content: `<p>${friend && !p.player ? "Unfriend and unfollow" : "Unfollow"} <b>${esc(p.name)}</b>?${isLocal(p) ? " You'd need to find them in person to add them again." : ""}</p>`
    }).catch(() => false);
    if ( !ok ) return;
    await unfollow(p);
    this.render();
  }

  static async #onAcorn(event, target) {
    await toggleAcorn(target.dataset.post);
    sound("coin");
    this.render();
  }

  static async #onSaveProfile() {
    const root = this.element;
    const val = key => (root.querySelector(`[data-draft="${key}"]`)?.value ?? "");
    const handle = val("handle").trim().replace(/^@/, "");
    const name = val("name").trim();
    const bio = val("bio");
    const pic = val("pic") || "token";
    if ( !withinLimits([["The handle", handle, LIMITS.handle], ["The display name", name, LIMITS.name], ["The bio", bio, LIMITS.bio]]) ) return;
    const problem = handleProblem(handle, this.data.profiles);
    if ( problem ) return ui.notifications.warn(problem);
    if ( !name ) return ui.notifications.warn("Give your profile a display name.");
    const old = getProfile();
    const now = Date.now();
    const prof = {handle, name, bio, pic, t: old?.t ?? now, updated: now};
    await game.user.update({[`flags.${MODULE}.profile`]: prof});   // saved at once, on the player's own User
    if ( !old || old.bio !== bio || old.name !== name || old.handle !== handle ) {
      await fileWriting({form: "acorndr-profile", title: `Acorndr profile @${handle}`, text: bio,
        fields: {Handle: `@${handle}`, "Display name": name, Bio: bio}});
    }
    for ( const k of ["handle", "name", "bio", "pic"] ) delete this.drafts[k];
    this.editing = false;
    sound("chime");
    ui.notifications.info(old ? "Profile saved." : `Welcome to Acorndr, @${handle}!`);
    AcorndrApp.refresh();
    renderChip();
  }

  static #onEditProfile() {
    this.editing = true;
    this.render();
  }

  static #onCancelEdit() {
    this.editing = false;
    for ( const k of ["handle", "name", "bio", "pic"] ) delete this.drafts[k];
    this.render();
  }

  static async #onPost() {
    const box = this.element.querySelector('[data-draft="post"]');
    const text = String(box?.value ?? "");
    if ( !text.trim() ) return ui.notifications.info("Write something first.");
    if ( !withinLimits([["Your post", text, LIMITS.post]]) ) return;
    const friends = !!this.element.querySelector('[data-draft="friends"]')?.checked;
    const id = `p-${game.user.id}-${foundry.utils.randomID(8)}`;
    const post = {id, text, t: Date.now(), week: getWeek(), friends};
    await game.user.update({[`flags.${MODULE}.posts.${id}`]: post});     // saved at once
    await fileWriting({form: "acorndr-post", title: `Acorndr post by @${getProfile()?.handle ?? "?"}${friends ? " (friends only)" : ""}`, text});
    delete this.drafts.post;
    delete this.drafts.friends;
    sound("coin");
    this.render();
  }

  static async #onDeletePost(event, target) {
    const postId = target.dataset.post;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: {title: "Acorndr"}, content: "<p>Delete this post? It disappears from Acorndr (the GM still keeps a copy).</p>"
    }).catch(() => false);
    if ( !ok ) return;
    await game.user.update(delKey(`flags.${MODULE}.posts`, postId));
    this.render();
  }

  static async #onDeleteProfile() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: {title: "Acorndr"},
      content: "<p>Delete your Acorndr profile and all your posts and comments? Others stop seeing them. (The GM keeps the copies already filed.)</p>"
    }).catch(() => false);
    if ( !ok ) return;
    await game.user.update({...delKey(`flags.${MODULE}`, "profile"), ...delKey(`flags.${MODULE}`, "posts"), ...delKey(`flags.${MODULE}`, "comments")});
    this.editing = false;
    this.render();
  }

  static async #onModPost(event, target) {
    if ( !game.user.isGM ) return;
    const id = target.dataset.post;
    const mod = foundry.utils.deepClone(moderation());
    mod.posts ??= {};
    if ( mod.posts[id] ) delete mod.posts[id];
    else mod.posts[id] = Date.now();
    await game.settings.set(MODULE, "moderation", mod);
  }

  static #onToggleComments(event, target) {
    const id = target.dataset.post;
    // Feed: collapsed unless opened. Profile pages and Me: open unless closed (tracked as "x:<id>").
    const onProfile = !!this.profileId || this.tab === "me";
    const key = onProfile ? `x:${id}` : id;
    if ( openComments.has(key) ) openComments.delete(key);
    else openComments.add(key);
    this.render();
  }

  /**
   * A player comments as themselves on any post they can see. Saved at once on their own User (shared with everyone,
   * no GM needed), filed as player writing (onWrite form "acorndr-comment"), GMs whispered. No pacing for players.
   */
  static async #onComment(event, target) {
    const postId = target.dataset.post;
    const me = getProfile();
    if ( !me?.handle ) return ui.notifications.info("Make a profile in Me to comment.");
    const box = this.element.querySelector(`[data-draft="c:${CSS.escape(postId)}"]`);
    const text = String(box?.value ?? "").trim();
    if ( !text ) return ui.notifications.info("Write something first.");
    if ( !withinLimits([["Your comment", text, LIMITS.comment]]) ) return;
    const found = this.data.profiles.map(pr => ({pr, post: (pr.posts ?? []).find(x => x.id === postId)})).find(x => x.post);
    const id = `c-${game.user.id}-${foundry.utils.randomID(8)}`;
    await game.user.update({[`flags.${MODULE}.comments.${id}`]: {id, post: postId, text, t: Date.now(), week: getWeek()}});
    delete this.drafts[`c:${postId}`];
    const author = found?.pr ? `${found.pr.name} (@${found.pr.handle ?? found.pr.id})` : "a post";
    const snippet = String(found?.post?.text ?? "").replace(/\s+/g, " ").slice(0, 60);
    await fileWriting({form: "acorndr-comment", title: `Acorndr comment by @${me.handle} on ${author}'s post "${snippet}${snippet.length >= 60 ? "..." : ""}"`, text});
    whisperGMs(`<b>Acorndr</b>: @${esc(me.handle)} commented on ${esc(author)}'s post:<br>"${esc(text)}"`);
    sound("coin");
    openComments.add(postId);
    openComments.delete(`x:${postId}`);
    this.render();
  }

  /** Delete a player comment: your own, or any as GM (GMs can update every User). */
  static async #onDeleteComment(event, target) {
    const {user: userId, cid} = target.dataset;
    const user = game.users.get(userId);
    if ( !user || (user.id !== game.user.id && !game.user.isGM) ) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: {title: "Acorndr"}, content: `<p>Delete this comment?${user.id === game.user.id ? " (The GM keeps a copy.)" : ""}</p>`
    }).catch(() => false);
    if ( !ok ) return;
    await user.update(delKey(`flags.${MODULE}.comments`, cid));
    this.render();
  }

  /** GM: add a comment as one of the NPC accounts (world setting `comments`, shown to everyone at once). */
  static async #onGMComment(event, target) {
    if ( !game.user.isGM ) return;
    const postId = target.dataset.post;
    const post = this.data.profiles.flatMap(x => x.posts ?? []).find(x => x.id === postId) ?? {id: postId};
    const already = new Set(commentsFor(post).filter(c => !c.player).map(c => c.by));
    if ( already.size >= MAX_COMMENTS ) {
      return ui.notifications.warn(`This post already has comments from ${MAX_COMMENTS} different NPCs, the most it takes.`);
    }
    const owner = this.data.profiles.find(x => (x.posts ?? []).some(y => y.id === postId));
    const npcs = this.data.profiles.filter(x => !x.player && !already.has(x.id) && x.id !== owner?.id).sort((a, b) => a.name.localeCompare(b.name));
    const content = `<p>Comment on this post as an NPC. Keep it about what they wrote. Up to ${MAX_COMMENTS} different NPCs per post, one comment each (${already.size} so far).</p>
      <label>Who <select name="by">${npcs.map(x => `<option value="${esc(x.id)}">${esc(x.name)} (@${esc(x.handle ?? x.id)})</option>`).join("")}</select></label>
      <label>Comment <textarea name="text" rows="4"></textarea></label>`;
    const res = await foundry.applications.api.DialogV2.prompt({
      window: {title: "Acorndr: comment as an NPC"}, content,
      ok: {label: "Post comment", callback: (ev, button) => ({by: button.form.elements.by.value, text: button.form.elements.text.value})}
    }).catch(() => null);
    if ( !res?.text?.trim() || !res.by ) return;
    if ( already.has(res.by) ) return ui.notifications.warn("That NPC has already commented on this post.");
    if ( !withinLimits([["The comment", res.text, LIMITS.comment]]) ) return;
    const all = foundry.utils.deepClone(game.settings.get(MODULE, "comments") ?? {});
    (all[postId] ??= []).push({id: foundry.utils.randomID(8), by: res.by, text: res.text.trim(), t: Date.now(), week: getWeek()});
    openComments.add(postId);
    await game.settings.set(MODULE, "comments", all);
  }

  static async #onGMUncomment(event, target) {
    if ( !game.user.isGM ) return;
    const {post, cid} = target.dataset;
    const all = foundry.utils.deepClone(game.settings.get(MODULE, "comments") ?? {});
    all[post] = (all[post] ?? []).filter(c => c.id !== cid);
    if ( !all[post].length ) delete all[post];
    await game.settings.set(MODULE, "comments", all);
  }

  static async #onModComment(event, target) {
    if ( !game.user.isGM ) return;
    const id = target.dataset.cid;
    const mod = foundry.utils.deepClone(moderation());
    mod.comments ??= {};
    if ( mod.comments[id] ) delete mod.comments[id];
    else mod.comments[id] = Date.now();
    await game.settings.set(MODULE, "moderation", mod);
  }

  static async #onModProfile(event, target) {
    if ( !game.user.isGM ) return;
    const p = this.data.profiles.find(x => x.id === target.dataset.id);
    if ( !p?.player ) return;
    const mod = foundry.utils.deepClone(moderation());
    mod.profiles ??= {};
    if ( mod.profiles[p.userId] ) delete mod.profiles[p.userId];
    else mod.profiles[p.userId] = Date.now();
    await game.settings.set(MODULE, "moderation", mod);
  }
}

/* -------------------------------------------- */
/*  HUD chip                                    */
/* -------------------------------------------- */

let chipObserver = null;

function placeChip(el) {
  const anchorId = adapterValue("anchor");
  const anchor = anchorId ? document.getElementById(anchorId) : null;
  const r = anchor?.getBoundingClientRect();
  if ( r && r.width > 0 ) {                         // (offsetParent is always null for position: fixed, so use the rect)
    el.classList.remove("acd-chip-free");
    el.style.left = `${Math.round(r.right + 6)}px`;
    el.style.top = `${Math.round(r.top)}px`;
    el.style.transform = "none";
  } else {
    el.classList.add("acd-chip-free");
    el.style.left = el.style.top = el.style.transform = "";
  }
  if ( anchor && !chipObserver ) {
    chipObserver = new MutationObserver(() => placeChip(el));
    chipObserver.observe(anchor, {childList: true, subtree: true, characterData: true});
  }
}

export async function renderChip() {
  if ( !game.ready ) return;
  let el = document.getElementById(CHIP_ID);
  if ( !game.settings.get(MODULE, "showChip") ) return el?.remove();
  if ( !el ) {
    el = document.createElement("button");
    el.id = CHIP_ID;
    el.type = "button";
    el.title = "Acorndr (P)";
    el.addEventListener("click", () => AcorndrApp.toggle());
    document.body.appendChild(el);
    window.addEventListener("resize", () => placeChip(el));
  }
  const data = await loadWithPlayers();
  const n = data.profiles.length ? unreadCount(data, getWeek(), getState()) : 0;
  el.innerHTML = `<span class="acd-acorn-ico"></span>${n ? `<span class="acd-badge">${n > 99 ? "99+" : n}</span>` : ""}`;
  placeChip(el);
}

/* -------------------------------------------- */
/*  Public API                                  */
/* -------------------------------------------- */

export const Acorndr = {
  /**
   * Add a content set. Call from your module's "setup" hook (or later; the app reloads).
   * @param {object} set  {id, url | data, kinds?, week?, weekLabel?, requires?, visible?, near?, sprite?, playerSprite?,
   *                       prepare?, onFollow?, onWrite?, blockKey?, sound?, anchor?}
   */
  register(set) {
    if ( !set?.id ) throw new Error(`${MODULE} | a content set needs an id`);
    const i = sets.findIndex(s => s.id === set.id);
    if ( i >= 0 ) sets.splice(i, 1, set);
    else sets.push(set);
    Acorndr.reload();
  },
  /** Forget loaded content (e.g. after editing a JSON file) and redraw. */
  reload() {
    loaded = null;
    if ( game.ready ) { renderChip(); AcorndrApp.refresh(); }
  },
  /** Redraw the app and the chip (call when your campaign's week or knowledge changes). */
  refresh() {
    if ( game.ready ) { renderChip(); AcorndrApp.refresh(); }
  },
  open: opts => AcorndrApp.open(opts),
  toggle: () => AcorndrApp.toggle(),
  state: getState,
  /** A user's own profile and posts (null / {} if they haven't made one). */
  profileOf: user => ({profile: getProfile(user), posts: getPosts(user), comments: getComments(user)}),
  get sets() { return sets.map(s => s.id); }
};
globalThis.Acorndr = Acorndr;

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.modules.get(MODULE).api = Acorndr;

  game.settings.register(MODULE, "week", {
    name: "Acorndr: current week",
    hint: "Posts appear from their week on. Ignored when a campaign module supplies its own week.",
    scope: "world", config: true, type: Number, default: 0,
    onChange: () => Acorndr.refresh()
  });
  game.settings.register(MODULE, "contentFile", {
    name: "Acorndr: content file",
    hint: "Optional path to a JSON file of profiles and posts (for campaigns without their own module), e.g. worlds/my-world/acorndr.json.",
    scope: "world", config: true, type: String, default: "",
    filePicker: "any",
    onChange: () => Acorndr.reload()
  });
  game.settings.register(MODULE, "moderation", {
    name: "Acorndr: hidden player profiles and posts",
    scope: "world", config: false, type: Object, default: {profiles: {}, posts: {}, comments: {}},
    onChange: () => Acorndr.refresh()
  });
  game.settings.register(MODULE, "comments", {
    name: "Acorndr: comments the GM added as NPCs",
    scope: "world", config: false, type: Object, default: {},
    onChange: () => Acorndr.refresh()
  });
  game.settings.register(MODULE, "whisperGM", {
    name: "Acorndr: whisper the GM about player comments",
    hint: "Each new player comment is whispered to the GMs.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE, "showChip", {
    name: "Acorndr: show the acorn button",
    hint: "The little acorn at the top of the screen (red number = unread posts). P opens Acorndr either way.",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: () => renderChip()
  });

  game.keybindings.register(MODULE, "open", {
    name: "Open Acorndr",
    hint: "Open Acorndr on your phone.",
    editable: [{key: "KeyP"}],
    onDown: () => {
      if ( hook("blockKey")?.() ) return false;
      AcorndrApp.toggle();
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
  Hooks.callAll("acorndrInit", Acorndr);
});

Hooks.once("ready", () => renderChip());
Hooks.on("canvasReady", () => Acorndr.refresh());
Hooks.on("updateUser", (user, changes) => {
  if ( !foundry.utils.hasProperty(changes, `flags.${MODULE}`) ) return;
  const f = foundry.utils.getProperty(changes, `flags.${MODULE}`) ?? {};
  // Anyone's profile, posts or follows/acorns can change what this viewer sees (live counts, friends, new posts)
  if ( user.isSelf && !("profile" in f || "posts" in f || "comments" in f) ) return renderChip();
  Acorndr.refresh();
});
Hooks.on("updateToken", (doc, changes) => {
  if ( !("x" in changes || "y" in changes) ) return;
  const app = foundry.applications.instances.get(APP_ID);
  if ( !app?.rendered || (app.tab === "feed" && !app.profileId) ) return;
  if ( !doc.isOwner ) return;
  clearTimeout(app._moveT);
  app._moveT = setTimeout(() => AcorndrApp.refresh(), 300);
});
