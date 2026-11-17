// MAUL Mall Explorer: GM notifications (socket toast + persistent GM whisper + optional Discord webhook).

import {MODULE, SOCKET, esc} from "./config.js";

export function gmIds() {
  return game.users.filter(u => u.isGM).map(u => u.id);
}

export function registerSocket() {
  game.socket.on(SOCKET, msg => {
    if ( !msg || msg.type !== "notify" ) return;
    if ( !game.user.isGM ) return;
    ui.notifications.info(msg.text, {permanent: !!msg.important});
  });
}

/**
 * Tell the GM(s) something happened.
 * - socket -> toast for any GM online right now
 * - whispered ChatMessage to all GMs, created from this client so it persists with no GM online
 * - optional Discord webhook (world setting)
 * @param {object} o
 * @param {string} o.text        Plain one-line text (toast + Discord)
 * @param {string} [o.html]      Chat card HTML (defaults to text)
 * @param {boolean} [o.important] Make the toast sticky
 * @param {boolean} [o.webhook]  Also post to Discord if a webhook is configured
 */
export async function notifyGM({text, html, important = false, webhook = true}) {
  game.socket.emit(SOCKET, {type: "notify", text, important, from: game.user.id});
  if ( game.user.isGM ) ui.notifications.info(text, {permanent: important});
  try {
    await ChatMessage.create({
      content: html ?? `<p>${esc(text)}</p>`,
      whisper: gmIds(),
      speaker: {alias: "MAUL Mall Explorer"},
      flags: {[MODULE]: {notify: true}}
    });
  } catch(err) {
    console.error(`${MODULE} | GM whisper failed`, err);
  }
  if ( webhook ) await postWebhook(text);
}

/** POST a short message to the Discord webhook, if one is set. Failures only log. */
export async function postWebhook(content) {
  const url = String(game.settings.get(MODULE, "discordWebhook") ?? "").trim();
  if ( !url ) return;
  if ( !/^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\//.test(url) ) {
    console.warn(`${MODULE} | Discord webhook URL doesn't look like a Discord webhook; skipped.`);
    return;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({content: content.slice(0, 1900), username: "MAUL Mall Explorer"})
    });
  } catch(err) {
    console.warn(`${MODULE} | Discord webhook failed`, err);
  }
}
