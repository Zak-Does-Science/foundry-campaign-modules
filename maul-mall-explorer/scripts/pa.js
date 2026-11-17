// MAUL Mall Explorer: the PA "closing for an update" announcement (Zak, 17 Nov 2026).
// GM tools → "PA: closing for update" asks for minutes; every client hears the PA chime, gets a chat card, and sees a
// countdown bar at the top of the screen until the deadline: finish anything you want saved before it hits zero,
// because the DM uploads a module update to The Forge then. World setting `paClosing` = {until, minutes, at} or {}.

import {MODULE, esc} from "./config.js";
import {Sfx} from "./audio.js";

const {DialogV2} = foundry.applications.api;
let timer = null;

export function registerPA() {
  game.settings.register(MODULE, "paClosing", {scope: "world", config: false, type: Object, default: {},
    onChange: value => { if ( value?.until ) Sfx.chime(); renderPA(); }});
}

function mallName() {
  const id = canvas?.scene?.getFlag?.(MODULE, "mallId");
  return {galleria: "Galleria Overlook", cogskill: "Cogskill Arcade"}[id] ?? "The mall";
}

const clock = ms => new Date(ms).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});

/** GM: ask for the minutes and announce. */
export async function announceClosing() {
  if ( !game.user.isGM ) return;
  const minutes = await DialogV2.prompt({
    window: {title: "PA: closing for an update", icon: "fa-solid fa-bullhorn"},
    content: `<p>Every player hears the PA, gets a chat message and sees a countdown. When it runs out, upload the update.</p>
      <div class="form-group"><label>Minutes until you upload</label>
      <input type="number" name="minutes" value="10" min="1" max="240" step="1" autofocus></div>`,
    ok: {label: "Announce", callback: (event, button) => Number(button.form.elements.minutes.value)},
    rejectClose: false
  });
  if ( !Number.isFinite(minutes) || minutes <= 0 ) return;
  const until = Date.now() + Math.round(minutes * 60_000);
  await game.settings.set(MODULE, "paClosing", {until, minutes, at: Date.now()});
  await ChatMessage.create({
    speaker: {alias: "Goolax PA"},
    content: `<div class="maul-chat-card maul-pa-card"><h3><i class="fa-solid fa-bullhorn"></i> Attention, shoppers!</h3>
      <p><em>*Ding-dong*</em> The mall will be closing temporarily in <strong>${minutes} minute${minutes === 1 ? "" : "s"}</strong>.
      Please finish your shopping and make your way to the exits.</p>
      <p class="maul-dim">(The Dungeon Master is uploading an update to this server at about <strong>${esc(clock(until))}</strong>.
      Finish anything you want saved before then: notes, purchases, Bastion turns, weekly lines.)</p></div>`
  });
}

/** GM: call it off. */
export async function cancelClosing() {
  if ( !game.user.isGM ) return;
  await game.settings.set(MODULE, "paClosing", {});
  ui.notifications.info("Mall Explorer: PA announcement cancelled.");
}

/** Draw / update / remove the countdown bar on this client. */
export function renderPA() {
  const pa = game.settings.get(MODULE, "paClosing") ?? {};
  let el = document.getElementById("maul-pa-bar");
  if ( !pa.until ) {
    el?.remove();
    if ( timer ) { clearInterval(timer); timer = null; }
    return;
  }
  if ( !el ) {
    el = document.createElement("div");
    el.id = "maul-pa-bar";
    el.className = "maul-pixel";
    document.body.appendChild(el);
  }
  const tick = () => {
    const left = pa.until - Date.now();
    if ( left <= 0 ) {
      el.classList.add("closed");
      el.innerHTML = `<i class="fa-solid fa-bullhorn"></i> ${esc(mallName())} is closed for an update.
        <span class="maul-pa-sub">(The DM is uploading now. Log back in in a few minutes.)</span>`;
      if ( game.user.isGM ) el.innerHTML += ` <button type="button" class="maul-btn small" data-pa-clear>Clear</button>`;
      el.querySelector("[data-pa-clear]")?.addEventListener("click", () => cancelClosing());
      return;
    }
    const s = Math.ceil(left / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    el.classList.toggle("urgent", s <= 60);
    el.innerHTML = `<i class="fa-solid fa-bullhorn"></i> ${esc(mallName())} closes in <span class="maul-pa-clock">${mm}:${ss}</span>
      <span class="maul-pa-sub">(The DM is uploading an update at ${esc(clock(pa.until))}. Save anything you want to keep before then.)</span>`;
  };
  tick();
  if ( timer ) clearInterval(timer);
  timer = setInterval(() => {
    tick();
    if ( Date.now() > pa.until ) { clearInterval(timer); timer = null; }
  }, 1000);
}
