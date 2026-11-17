# Acorndr

Th'Tief's social media as a Foundry VTT app (v13/v14, any system). Players open a phone-style window with **P** or the
little acorn at the top of the screen:

- **Feed**: posts from everyone they follow, newest week first. A red number on the acorn = unread posts.
- **Discover**: accounts by kind (celebrities, judges, world leaders, official accounts...). Anyone can follow those
  from anywhere. **Locals** (accounts with `npc`) only show once the campaign says the player has met them, and can only be
  followed or friended in person (the campaign decides what "in person" means).
- **Following**: friends, then follows.
- **Profiles**: bio, followers, Follow / Add friend / Unfollow, a hangout hint (friends-only if you like), posts. Friends
  see friends-only posts. Every post has an acorn button.

## Players' own profiles (opt-in)

The **Me** tab lets any player make a profile for their character: handle (unique, letters/numbers/_), display name,
bio, and a picture (their token, their character portrait, or the campaign's sprite if it supplies `playerSprite`).
Then they can post (optionally friends-only), and everyone can find them under **Players** in Discover and follow them.
Two players who follow each other are **friends** and can read each other's friends-only posts. Follower and acorn
counts on player accounts are real counts. Players can edit their profile, delete their posts, or delete the profile.
Players without a profile use the app exactly as before.

- **Saved at once** on the player's own User (no GM needed): `flags.acorndr.profile = {handle, name, bio, pic, t,
  updated}`, `flags.acorndr.posts = {<postId>: {id, text, t, week, friends}}`. Player posts aren't week-gated.
- **Length:** bio and posts up to 10,000 characters, handle 30, name 120. A counter appears at 75%; over the cap it
  turns red and Save/Post refuses with a warning, and the text stays in the box (never cut).
- **Filing:** every saved bio and post is handed to the campaign's `onWrite({form, title, text, fields}, user)` hook
  (and the `acorndrWrite` Foundry hook), e.g. to file it as a text file.
- **GM moderation:** GMs see every player post (friends-only included). On a player's profile a GM can *hide profile*,
  and each player post has a hide button. Hidden things vanish for other players; the owner sees "Hidden by the GM".
  Stored in the world setting `acorndr.moderation = {profiles: {<userId>: t}, posts: {<postId>: t}}`.

## Comments (at most 3 different NPCs per post; players comment freely)

Posts can carry short comments from other accounts, shown under the post (collapsed to "3 comments" in the feed,
open on profile pages). NPC comments: at most **3 different NPCs** per post, one comment each (extra ones are
ignored; the GM button refuses a 4th NPC or a repeat). Sources, merged oldest first:
- inline on a content post: `"comments": [{"by": "<profileId>", "text": "...", "week": 2, "requires": {}}]`;
- a content file's top-level map, for posts that aren't in the file (players' posts): `"comments": {"<postId>": [...]}`;
- live, from the GM: every post has a *comment as an NPC* button (pick the account, write the comment). Stored in the
  world setting `acorndr.comments`; the GM can remove those.
Keep them few and about what the post actually says.

**Players comment too.** Anyone with a profile gets a *Write a comment* box under any post they can see (NPC posts
and other players'). Comments are saved at once on the writer's own User, `flags.acorndr.comments = {<cid>: {id, post,
text, t, week}}`, so everyone sees them and they persist (no GM needed). **Max 300 characters** (live counter; over the
cap it refuses and keeps the text). No pacing or per-post cap for players. Each is handed to `onWrite` (form `acorndr-comment`, title naming the post and its author) and
whispered to the GMs (world setting *whisper the GM about player comments*, on by default). Writers can delete their
own comments; GMs can delete anyone's, or hide one (eye button; `moderation.comments`), like posts. Deleting a profile also removes that player's comments.

Per-user state lives on the User: `flags.acorndr.state = {follows: {<profileId>: {how: "follow"|"friend", t, week,
where}}, acorned: {<postId>: t}, seen: {<postId>: 1}}`.

## Using it in a campaign

**Without code:** put a content file in your world folder (format below) and set *Configure Settings → Acorndr: content
file* to its path. Set *Acorndr: current week* as the season goes on. Locals can then be added from anywhere.

**From a campaign module** (how MAUL Mall Explorer does it): depend on `acorndr` in your module.json and register a content
set in your `setup` hook. Every adapter function is optional.

```js
Hooks.once("setup", () => globalThis.Acorndr?.register({
  id: "my-campaign",
  url: "modules/my-campaign/data/acorndr.json",      // or data: {profiles: [...]}
  kinds: [["celeb", "Celebrities"], ["local", "Locals you've met"]],   // Discover sections, in order
  anchor: "my-hud-element-id",                        // put the acorn chip just right of this element
  prepare: async () => {},                            // runs before each render (load sprite indexes etc.)
  week: () => 3,                                      // the current week for this viewer
  weekLabel: week => "19 Rest",                       // shown after "Wk 3 ·"
  requires: (req, week, user) => true,                // your `requires` rules (default: minWeek / maxWeek only)
  visible: (profile, week, user) => true,             // e.g. locals only after the player has met them
  near: (profile, user) => ({ok: true, why: "", gm: false}),   // may this user add this local right now?
  sprite: (key, profile) => ({url: "...png", frames: 2}),     // avatar.sprite -> first frame of a sheet
  playerSprite: user => "pc:my-hero",                 // optional: a sprite key players can pick as their picture
  onWrite: (writing, user) => {},                     // a player saved a bio or a post: {form, title, text, fields}
  isHere: profile => true,                            // list this local under "Locals at <placeName()>" in Discover
  placeName: () => "Cogskill Arcade",                 // where the viewer is
  whereIs: profile => "Cogskill Arcade",              // shown on a local's profile when they can't be added from here
  onFollow: (profile, how, user) => {},               // e.g. set a story flag
  blockKey: () => false,                              // true = P does nothing (e.g. a dialogue box is open)
  sound: name => {}                                   // "confirm" | "chime" | "coin"
}));
```

API: `Acorndr.register(set)`, `Acorndr.reload()` (re-read files), `Acorndr.refresh()` (redraw after your week or
knowledge changes), `Acorndr.open({profile, tab})`, `Acorndr.toggle()`, `Acorndr.state(user)`, `Acorndr.profileOf(user)`. Also on
`game.modules.get("acorndr").api`. Hooks: `acorndrInit(api)`, `acorndrFollow(profile, how, user)`,
`acorndrUnfollow(profile, user)`, `acorndrWrite(writing, user)`.

## Content format

```jsonc
{ "kinds": [["celeb", "Celebrities"]],            // optional
  "profiles": [
    { "id": "nova", "handle": "NovaSings", "name": "Nova", "kind": "celeb", "verified": true,
      "avatar": {"img": "path/to/portrait.webp", "sprite": "npc:elf:2", "initials": "N", "color": "#2f9e5b"},
      "home": "Lor'Fida", "runBy": "Team Nova",       // runBy: shown under the bio (accounts run by staff)
      "bio": "Pop. Drag.", "followers": [3400000, 3420000],   // a number, or one per week
      "npc": {"mall": "galleria", "id": "gal-L1-x"},  // makes it a local (meaning is up to the campaign adapter)
      "hangout": {"text": "By the fountain.", "friends": true},
      "requires": {},                                // hide the whole profile until this passes
      "posts": [ {"id": "nova-w0a", "week": 0, "text": "New single out Seluday.", "acorns": 205000,
                  "friends": false, "requires": {}} ] } ] }
```

Post ids must never change once players have seen them (they key acorns and read marks). Duplicate profile ids: the
first content set wins. `data/example.json` is a tiny sample.

Styling: override `--acd-font`, `--acd-ink`, `--acd-paper`, `--acd-edge`, `--acd-accent` in your own CSS.
