// MAUL Mall Explorer: ordinary store shopping (SPEC 19). Any interactable with a `store` block offers "Browse the
// wares?" after its pages. No office pass, any week, as often as you like. Prices come out of the assigned character's
// coins (making change across pp/gp/ep/sp/cp); items are copied from the dnd5e SRD compendium when `srd` matches,
// else created as a plain item of `type`.

import {MODULE, esc} from "./config.js";
import {getWeek, getGmWeek} from "./week.js";
import {logEvent} from "./progress.js";
import {whisperGM, whoLabel} from "./weekly.js";
import {Sfx} from "./audio.js";

const {ApplicationV2, HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;
const SRD_PACK = "dnd5e.items";
const COIN = {pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1};
const ASCENDING = ["cp", "sp", "ep", "gp", "pp"];
const TYPES = new Set(["consumable", "equipment", "weapon", "loot"]);

/** Price of a stock line in copper: gp (may be fractional) plus optional pp/sp/cp fields. */
export function priceCp(s) {
  return Math.max(0, Math.round((Number(s?.gp) || 0) * 100 + (Number(s?.pp) || 0) * 1000
    + (Number(s?.sp) || 0) * 10 + (Number(s?.cp) || 0)));
}

/** "2 gp 5 sp" style label for a copper amount. */
export function coinLabel(cp) {
  if ( cp <= 0 ) return "Free";
  const gp = Math.floor(cp / 100);
  const sp = Math.floor((cp % 100) / 10);
  const c = cp % 10;
  return [gp && `${gp} gp`, sp && `${sp} sp`, c && `${c} cp`].filter(Boolean).join(" ");
}

function purse(actor) {
  const cur = actor?.system?.currency ?? {};
  const out = {};
  for ( const d of ASCENDING ) out[d] = Math.max(0, Math.floor(Number(cur[d]) || 0));
  return out;
}

const wealthCp = actor => Object.entries(purse(actor)).reduce((s, [d, n]) => s + n * COIN[d], 0);

function purseLabel(actor) {
  const p = purse(actor);
  return ["pp", "gp", "ep", "sp", "cp"].filter(d => p[d]).map(d => `${p[d]} ${d}`).join(" ") || "0 gp";
}

/**
 * Pay `cp` copper from the actor's coins: smallest coins first, breaking a bigger coin when needed, with change
 * given back in gp/sp/cp. Returns false (and changes nothing) if they can't afford it.
 */
async function payCp(actor, cp) {
  if ( cp <= 0 ) return true;
  const cur = purse(actor);
  if ( wealthCp(actor) < cp ) return false;
  let need = cp;
  for ( const d of ASCENDING ) {
    if ( need <= 0 ) break;
    const take = Math.min(cur[d], Math.ceil(need / COIN[d]));
    cur[d] -= take;
    need -= take * COIN[d];
  }
  if ( need > 0 ) return false;
  let change = -need;
  cur.gp += Math.floor(change / 100); change %= 100;
  cur.sp += Math.floor(change / 10); change %= 10;
  cur.cp += change;
  const update = {};
  for ( const d of ASCENDING ) update[`system.currency.${d}`] = cur[d];
  await actor.update(update);
  return true;
}

/** Item data: an SRD copy when `srd` names a compendium item, else a plain item. */
export async function itemData(stock, meta) {
  const flags = {[MODULE]: {store: true, ...meta}};
  if ( stock.srd ) {
    try {
      const pack = game.packs.get(SRD_PACK);
      const index = await pack?.getIndex({fields: ["name"]});
      const want = String(stock.srd).trim();
      const hit = index?.find(i => i.name === want) ?? index?.find(i => i.name.toLowerCase() === want.toLowerCase());
      if ( hit ) {
        const doc = await pack.getDocument(hit._id);
        const data = doc.toObject();
        delete data._id;
        data.flags = foundry.utils.mergeObject(data.flags ?? {}, flags);
        if ( data.system ) data.system.quantity = 1;
        return data;
      }
      console.warn(`${MODULE} | SRD item "${want}" not found in ${SRD_PACK}; creating a plain item`);
    } catch(err) {
      console.warn(`${MODULE} | SRD lookup failed`, err);
    }
  }
  const type = TYPES.has(stock.type) ? stock.type : "loot";
  const system = {
    description: {value: stock.desc ? `<p>${esc(stock.desc)}</p>` : ""},
    quantity: 1,
    price: {value: priceCp(stock) / 100, denomination: "gp"}
  };
  if ( type === "equipment" ) system.type = {value: "trinket"};
  if ( type === "loot" ) system.type = {value: "gear"};
  return {name: stock.name, type, img: stock.img ?? "icons/svg/item-bag.svg", system, flags};
}

/** After an interactable's pages: offer the store. */
export async function offerStore(ia, ctx) {
  const store = ia?.store;
  if ( !store || !Array.isArray(store.stock) || !store.stock.length ) return;
  const ok = await DialogV2.confirm({
    window: {title: store.title ?? ia.name ?? "Store", icon: "fas fa-bag-shopping"},
    content: "<p>Browse the wares?</p>",
    rejectClose: false,
    modal: true
  });
  if ( !ok ) return;
  Sfx.confirm();
  const open = foundry.applications.instances.get(`maul-store-${String(ia.id).replace(/[^\w-]/g, "_")}`);
  if ( open ) {
    open.render({force: true});
    open.bringToFront?.();
    return;
  }
  new StoreApp({ia, mallId: ctx?.mall?.id, mallName: ctx?.mall?.name ?? ctx?.mall?.id}).render({force: true});
}

export class StoreApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ia, mallId, mallName}, options = {}) {
    super({...options, id: `maul-store-${String(ia.id).replace(/[^\w-]/g, "_")}`});
    this.ia = ia;
    this.mallId = mallId;
    this.mallName = mallName;
  }

  static DEFAULT_OPTIONS = {
    classes: ["maul-app", "maul-shop", "maul-store", "maul-pixel"],
    tag: "div",
    window: {title: "Store", icon: "fas fa-bag-shopping", resizable: true},
    position: {width: 520, height: "auto"},
    actions: {buy: StoreApp.#onBuy}
  };

  static PARTS = {main: {template: `modules/${MODULE}/templates/store.hbs`}};

  get title() {
    return this.ia?.store?.title ?? this.ia?.name ?? "Store";
  }


  _stock() {
    const week = getGmWeek();   // stock minWeek = the match being prepared for (Grade I 1, II 3, III 5)
    return (this.ia.store?.stock ?? []).map((s, index) => ({s, index})).filter(({s}) => s?.name && (Number(s.minWeek) || 0) <= week);
  }

  async _prepareContext() {
    const actor = game.user.character;
    const wealth = actor ? wealthCp(actor) : 0;
    return {
      title: this.title,
      keeper: this.ia.name && this.ia.name !== this.title ? this.ia.name : "",
      actor: actor ? {name: actor.name, purse: purseLabel(actor)} : null,
      items: this._stock().map(({s, index}) => ({
        index, name: s.name, desc: s.desc ?? "", homologated: !!s.homologated,
        priceLabel: coinLabel(priceCp(s)), affordable: !!actor && wealth >= priceCp(s)
      }))
    };
  }

  static async #onBuy(event, target) {
    const stock = this.ia.store?.stock?.[Number(target.dataset.index)];
    const actor = game.user.character;
    if ( !stock ) return;
    if ( !actor ) {
      ui.notifications.warn("You need an assigned character to buy things. Ask the DM to assign yours (User Configuration).");
      return;
    }
    const cp = priceCp(stock);
    const label = coinLabel(cp);
    const ok = await DialogV2.confirm({
      window: {title: `Buy from ${this.title}?`},
      content: `<p>Buy <strong>${esc(stock.name)}</strong> for <strong>${esc(label)}</strong>?</p>
        <p>${esc(actor.name)} has ${esc(purseLabel(actor))}.</p>`,
      rejectClose: false,
      modal: true
    });
    if ( !ok ) return;
    if ( wealthCp(actor) < cp ) {
      ui.notifications.warn(`Sorry, ${actor.name} is a little short for the ${stock.name} (${label}). Come back after payday!`);
      return;
    }
    try {
      if ( !(await payCp(actor, cp)) ) {
        ui.notifications.warn(`Sorry, ${actor.name} is a little short for the ${stock.name} (${label}).`);
        return;
      }
      const meta = {mallId: this.mallId, shop: this.ia.id, week: getWeek(), boughtBy: game.user.id, boughtAt: Date.now()};
      try {
        await actor.createEmbeddedDocuments("Item", [await itemData(stock, meta)]);
      } catch(err) {
        console.warn(`${MODULE} | item data rejected, retrying as plain loot`, err);
        await actor.createEmbeddedDocuments("Item", [{name: stock.name, type: "loot",
          system: {description: {value: `<p>${esc(stock.desc ?? "")}</p>`}}, flags: {[MODULE]: {store: true, ...meta}}}]);
      }
    } catch(err) {
      console.error(`${MODULE} | store purchase failed`, err);
      ui.notifications.error(`Purchase failed: ${err.message}`);
      return;
    }
    Sfx.coin();
    ui.notifications.info(`${stock.name} added to ${actor.name}'s inventory.`);
    logEvent({kind: "buy", id: this.ia.id, name: `Bought ${stock.name} (${label}) at ${this.title}`}).catch(() => {});
    whisperGM(`<h3>Store purchase</h3><p><strong>${esc(whoLabel())}</strong> bought <strong>${esc(stock.name)}</strong>
      for ${esc(label)} at ${esc(this.title)}${this.mallName ? ` (${esc(this.mallName)})` : ""}.</p>`);
    this.render();
  }
}
