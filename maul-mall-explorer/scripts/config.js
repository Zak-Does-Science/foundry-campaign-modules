// MAUL Mall Explorer: shared constants.

export const MODULE = "maul-mall-explorer";

/** Mall ids the module knows about. Add a new id here (plus data/malls/<id>.json) to add a mall. */
export const MALLS = ["galleria", "cogskill", "immia"];   // immia = Immia Beach (W2 host, visiting mall, no table)

/** Foundry grid size in px (16 px art x4). */
export const GRID_PX = 64;

/** Path helper: module-relative path -> URL path Foundry serves. */
export const modPath = p => `modules/${MODULE}/${p}`;

export const PATHS = {
  mall: id => modPath(`data/malls/${id}.json`),
  layout: id => modPath(`assets/maps/${id}_layout.json`),
  map: id => modPath(`assets/maps/${id}.png`),
  boothSprite: slot => modPath(`assets/sprites/booths/booth_${slot}.png`),
  boothPlaceholder: modPath("assets/ui/booth_placeholder.svg"),
  schedule: modPath("data/schedule.json"),
  popupItems: modPath("data/shop/popup_items.json"),
  players: modPath("data/players.json")
};

/** Flag every player needs before pop-up booths will sell to them. */
export const OFFICE_FLAG = "office-found";

/** Name of the dnd5e item that counts as a Premium Voucher. */
export const VOUCHER_NAME = "Goolax Premium Voucher";

/**
 * Leyline Operator fare in gp: a round trip, paid when a player leaves their home mall (the ride home is free).
 * The one place to change the price.
 */
export const LEYLINE_FARE_GP = 50;

export const SOCKET = `module.${MODULE}`;

/** Escape text for safe insertion into HTML. */
export function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"})[c]);
}
