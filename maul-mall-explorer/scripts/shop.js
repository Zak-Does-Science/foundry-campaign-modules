// MAUL Mall Explorer: pop-up booth shop (ApplicationV2 + Handlebars).

import {MODULE, VOUCHER_NAME, esc} from "./config.js";
import {getPopupItems} from "./data.js";
import {hasFlag, markSeen, logEvent} from "./progress.js";
import {Sfx} from "./audio.js";
import {showDialogue} from "./dialogue.js";
import {notifyGM} from "./notify.js";
import {getWeek, getGmWeek} from "./week.js";
import {itemData as srdItemData} from "./store.js";

const {ApplicationV2, HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;


/** Booth record for a table + slot from popup_items.json, or null. */
async function getBooth(table, slot) {
  const data = await getPopupItems();
  return {data, booth: data?.tables?.[table]?.booths?.[String(slot)] ?? null};
}

/** Entry point from an interaction with a shop interactable / booth. */
export async function openShopFlow({entry, ctx, pages}) {
  const ia = entry.ia;
  const slot = entry.slot;
  const table = ctx.mall.table;
  const {data, booth} = await getBooth(table, slot);
  const vendor = booth?.vendor;
  const speaker = vendor?.name ?? ia.name ?? "Pop-up Booth";
  const voice = {speaker, kind: "shop", species: vendor?.species, sprite: ia.sprite, id: ia.id};
  await markSeen(ia.id);
  await logEvent({kind: "shop", id: ia.id, name: speaker});

  if ( !slot || !booth ) {
    await showDialogue({...voice, pages: ["The booth is still being set up. Check back after the next contest!"]});
    return;
  }
  const lines = vendor?.lines ?? [];
  let greeting = pages?.length && !ia.synthetic ? pages : [];
  if ( !greeting.length && lines.length ) greeting = [lines[Math.floor(Math.random() * lines.length)]];
  const {completed} = await showDialogue({...voice, pages: greeting});
  if ( !completed ) return;
  if ( !(booth.items ?? []).length ) {
    await showDialogue({...voice, pages: [booth.emptyLine ?? "Shelves are bare right now, hon. New stock soon!"]});
    return;
  }
  new ShopApp({mallId: ctx.mall.id, mallName: ctx.mall.name ?? ctx.mall.id, table, slot, vendorName: vendor?.name}).render({force: true});
}

/* -------------------------------------------- */
/*  Currency helpers                            */
/* -------------------------------------------- */

function voucherItems(actor) {
  const n = VOUCHER_NAME.toLowerCase();
  return actor?.items.filter(i => i.name.trim().toLowerCase() === n) ?? [];
}

export function countVouchers(actor) {
  return voucherItems(actor).reduce((sum, i) => sum + (Number(i.system?.quantity) || 0), 0);
}

export function actorGp(actor) {
  return Number(actor?.system?.currency?.gp) || 0;
}

/** Take gp from the character (a negative amount refunds). Shared by the shop and the Leyline Operator. */
export async function spendGp(actor, gp) {
  if ( !actor || !gp ) return;
  await actor.update({"system.currency.gp": actorGp(actor) - gp});
}

function priceLabel(price) {
  const parts = [];
  if ( price?.vouchers ) parts.push(`${price.vouchers} Premium Voucher${price.vouchers === 1 ? "" : "s"}`);
  if ( price?.gp ) parts.push(`${price.gp} gp`);
  return parts.join(" + ") || "Free";
}

function canAfford(actor, price) {
  if ( !actor ) return false;
  return actorGp(actor) >= (price?.gp ?? 0) && countVouchers(actor) >= (price?.vouchers ?? 0);
}

async function spendVouchers(actor, n) {
  let left = n;
  for ( const item of voucherItems(actor) ) {
    if ( left <= 0 ) break;
    const q = Number(item.system?.quantity) || 0;
    const take = Math.min(q, left);
    left -= take;
    if ( q - take <= 0 ) await item.delete();
    else await item.update({"system.quantity": q - take});
  }
}

/** Build dnd5e Item data for a pop-up stock entry. */
function itemData(stock, meta) {
  const service = stock.kind === "premium-service";
  const type = stock.itemType ?? (service ? "loot" : "equipment");
  const desc = [
    `<p>${esc(stock.description)}</p>`,
    stock.team ? `<p><em>Pop-up exclusive from ${esc(stock.team)}.</em></p>` : "",
    service ? "<p><strong>Service:</strong> show this to the DM to apply the effect to your character.</p>" : "",
    stock.notes ? `<p class="notes">${esc(stock.notes)}</p>` : "",
    stock.price?.vouchers && !stock.price?.gp ? "<p><em>Goolax pop-up exclusive: no resale value.</em></p>" : ""
  ].join("");
  const system = {
    description: {value: desc},
    quantity: 1,
    price: {value: stock.price?.gp ?? 0, denomination: "gp"}
  };
  if ( stock.rarity ) system.rarity = stock.rarity;
  if ( type === "equipment" ) {
    system.type = {value: "trinket"};
    if ( stock.attunement ) system.attunement = "required";
  }
  if ( type === "loot" ) system.type = {value: "gear"};
  if ( type === "consumable" ) system.type = {value: stock.consumableType ?? "potion"};
  return {
    name: stock.name,
    type,
    img: stock.img ?? (service ? "icons/svg/aura.svg" : "icons/svg/item-bag.svg"),
    system,
    flags: {[MODULE]: {popup: true, stockId: stock.id, team: stock.team ?? null, ...meta}}
  };
}

/**
 * What a purchase puts in the inventory. A kit (`grants`) gives its contents instead of one item: SRD copies where
 * `srd` names one, with the kit's name on them and no resale value.
 */
async function purchaseItems(stock, meta) {
  if ( !Array.isArray(stock.grants) || !stock.grants.length ) return [itemData(stock, meta)];
  const out = [];
  for ( const g of stock.grants ) {
    const data = await srdItemData({srd: g.srd, name: g.name, type: g.type ?? "consumable", desc: g.desc}, {});
    data.name = g.name ?? data.name;
    data.system ??= {};
    data.system.quantity = Math.max(1, Number(g.quantity) || 1);
    data.system.price = {value: 0, denomination: "gp"};
    data.flags = foundry.utils.mergeObject(data.flags ?? {}, {[MODULE]: {popup: true, stockId: stock.id, kit: stock.name, team: stock.team ?? null, ...meta}});
    out.push(data);
  }
  return out;
}

/* -------------------------------------------- */
/*  Shop window                                 */
/* -------------------------------------------- */

export class ShopApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({mallId, mallName, table, slot, vendorName}, options = {}) {
    super(options);
    this._vendorName = vendorName;
    this.mallId = mallId;
    this.mallName = mallName;
    this.table = table;
    this.slot = slot;
  }

  static DEFAULT_OPTIONS = {
    id: "maul-shop-{id}",
    classes: ["maul-app", "maul-shop", "maul-pixel"],
    tag: "div",
    window: {title: "Pop-up Booth", icon: "fas fa-store", resizable: true},
    position: {width: 520, height: "auto"},
    actions: {buy: ShopApp.#onBuy}
  };

  static PARTS = {
    main: {template: `modules/${MODULE}/templates/shop.hbs`}
  };

  get title() {
    return this._vendorName ? `${this._vendorName}'s Pop-up Booth` : "Pop-up Booth";
  }


  async _prepareContext() {
    const {booth} = await getBooth(this.table, this.slot);
    this._booth = booth;
    this._vendorName = booth?.vendor?.name;
    const actor = game.user.character;
    const week = getGmWeek();   // stock minWeek = the match being prepared for (Grade I 1, II 3, III 5)
    const items = (booth?.items ?? [])
      .filter(s => (s.minWeek ?? 0) <= week)
      .map(s => ({
        ...s,
        priceLabel: priceLabel(s.price),
        affordable: canAfford(actor, s.price),
        isService: s.kind === "premium-service",
        isPremium: s.kind?.startsWith("premium"),
        placeholder: !!s.priceStatus
      }));
    return {
      vendor: booth?.vendor ?? null,
      theme: booth?.theme ?? "",
      mallName: this.mallName,
      slot: this.slot,
      items,
      actor: actor ? {name: actor.name, gp: actorGp(actor), vouchers: countVouchers(actor)} : null,
      voucherName: VOUCHER_NAME
    };
  }

  static async #onBuy(event, target) {
    const stockId = target.dataset.itemId;
    const stock = this._booth?.items?.find(s => s.id === stockId);
    const actor = game.user.character;
    if ( !stock ) return;
    if ( !actor ) {
      ui.notifications.warn("You need an assigned character to buy things. Ask the DM to assign yours (User Configuration).");
      return;
    }
    const label = priceLabel(stock.price);
    const ok = await DialogV2.confirm({
      window: {title: "Buy from the pop-up?"},
      content: `<p>Buy <strong>${esc(stock.name)}</strong> for <strong>${esc(label)}</strong>?</p>
        <p>${esc(actor.name)} has ${actorGp(actor)} gp and ${countVouchers(actor)} Premium Voucher(s).</p>`,
      rejectClose: false,
      modal: true
    });
    if ( !ok ) return;

    // Re-check funds after the dialog (they may have changed)
    if ( !canAfford(actor, stock.price) ) {
      ui.notifications.warn(`${actor.name} can't afford ${stock.name} (${label}).`);
      return;
    }
    try {
      if ( stock.price?.gp ) await spendGp(actor, stock.price.gp);
      if ( stock.price?.vouchers ) await spendVouchers(actor, stock.price.vouchers);
      const meta = {mallId: this.mallId, slot: this.slot, week: getWeek(), boughtBy: game.user.id, boughtAt: Date.now()};
      try {
        await actor.createEmbeddedDocuments("Item", await purchaseItems(stock, meta));
      } catch(err) {
        console.warn(`${MODULE} | full item data rejected, retrying as plain loot`, err);
        await actor.createEmbeddedDocuments("Item", [{name: stock.name, type: "loot",
          system: {description: {value: `<p>${esc(stock.description)}</p>`}}, flags: {[MODULE]: {popup: true, stockId: stock.id, ...meta}}}]);
      }
    } catch(err) {
      console.error(`${MODULE} | purchase failed`, err);
      ui.notifications.error(`Purchase failed: ${err.message}`);
      return;
    }

    const vendor = this._vendorName ?? "the pop-up booth";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({actor}),
      content: `<div class="maul-chat-card"><h3>Pop-up purchase</h3>
        <p><strong>${esc(actor.name)}</strong> bought <strong>${esc(stock.name)}</strong> from ${esc(vendor)} for ${esc(label)}.</p></div>`
    });
    await notifyGM({
      text: `${game.user.name} (${actor.name}) bought ${stock.name} for ${label} at ${this.mallName}.`,
      html: `<div class="maul-chat-card"><h3>Pop-up purchase</h3><p><strong>${esc(game.user.name)}</strong> (${esc(actor.name)})
        bought <strong>${esc(stock.name)}</strong> for ${esc(label)} at ${esc(this.mallName)} (booth ${this.slot}).</p>
        ${stock.kind === "premium-service" ? "<p><strong>Service:</strong> apply the effect to the character.</p>" : ""}
        ${stock.priceStatus ? `<p><em>Price status: ${esc(stock.priceStatus)}</em></p>` : ""}</div>`,
      webhook: false
    });
    Sfx.coin();
    logEvent({kind: "buy", id: stock.id, name: `Bought ${stock.name} (${label}) at a pop-up booth`}).catch(() => {});
    ui.notifications.info(`${stock.name} added to ${actor.name}'s inventory.`);
    this.render();
  }
}
