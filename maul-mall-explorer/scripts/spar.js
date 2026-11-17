// MAUL Mall Explorer: practice bouts (SPEC 31). Each mall has a sparring host by the arena (data/sparring.json, added
// to the mall context by data.js). Talking to them opens the Sparring window: pick a partner, then a turn-by-turn bout
// in a Pokémon-style window using the character's real numbers (AC, HP, saves, weapon and spell attacks, save DCs,
// spell slots), resolved by scripts/spar-engine.js. Practice HP, slots and potions only: the character sheet is never
// damaged. Works with no GM online (it only writes the player's own actor flags, their gp and chat messages).
// Wins pay a little gp by partner tier, at most `weeklyCapGp` (250) per character per week. Logged `kind: "spar"`.

import {MODULE, esc, modPath} from "./config.js";
import {fetchJSON} from "./data.js";
import {showDialogue} from "./dialogue.js";
import {setFlags, markSeen, hasFlag, logEvent} from "./progress.js";
import {getWeek} from "./week.js";
import {whisperGM, whoLabel} from "./weekly.js";
import {spendGp} from "./shop.js";
import {Sfx} from "./audio.js";
import {spriteIndex, pcKey, resolveKey} from "./pc.js";
import {Bout, buildFoe, ABILITIES, PRACTICE_POTIONS, MAX_ROUNDS} from "./spar-engine.js";

const {ApplicationV2} = foundry.applications.api;
const DATA = modPath("data/sparring.json");
const ORD = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

export const getSparring = () => fetchJSON(DATA, {optional: true}).catch(() => null);

const shortName = n => String(n ?? "").replace(/\s*\(.*\)\s*$/, "");
const pickOne = arr => (Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/* -------------------------------------------- */
/*  Reading the character sheet (dnd5e 4.x/5.x)  */
/* -------------------------------------------- */

function activitiesOf(item) {
  const c = item?.system?.activities;
  if ( !c ) return [];
  try { return typeof c.values === "function" ? Array.from(c.values()) : Array.from(c); } catch(err) { return []; }
}

const firstOf = v => (v instanceof Set ? v.first?.() ?? [...v][0] : (Array.isArray(v) ? v[0] : v));

/** A damage/healing formula with roll data filled in, or null. */
function damageFormula(activity) {
  try {
    const cfg = activity.getDamageConfig?.({});
    const parts = [];
    for ( const r of cfg?.rolls ?? [] ) {
      if ( !r?.parts?.length ) continue;
      parts.push(Roll.replaceFormulaData(r.parts.join(" + "), r.data ?? {}, {missing: "0", warn: false}));
    }
    const f = parts.join(" + ").trim();
    if ( f && Roll.validate(f) ) return {formula: f, type: firstOf(cfg.rolls[0]?.options?.type) ?? ""};
  } catch(err) { /* fall through to labels */ }
  try {
    const labels = activity.labels?.damage ?? [];
    const f = labels.map(d => d?.formula).filter(Boolean).join(" + ").trim();
    if ( f && Roll.validate(f) ) return {formula: f, type: labels[0]?.damageType ?? ""};
  } catch(err) { /* nothing usable */ }
  return null;
}

function attackBonus(activity, actor) {
  const t = parseInt(activity.labels?.toHit);
  if ( Number.isFinite(t) ) return t;
  try {
    const {data, parts} = activity.getAttackData();
    const f = Roll.replaceFormulaData(parts.join(" + "), data, {missing: "0", warn: false});
    const r = new Roll(f);
    const v = r.evaluateSync?.({strict: false})?.total;
    if ( Number.isFinite(v) ) return v;
  } catch(err) { /* fallback below */ }
  const abil = activity.item?.system?.abilityMod ?? "str";
  return num(actor.system.abilities?.[abil]?.mod) + num(actor.system.attributes?.prof, 2);
}

function saveBonus(actor, a) {
  const ab = actor.system.abilities?.[a];
  if ( !ab ) return 0;
  if ( typeof ab.save === "number" ) return ab.save;
  return num(ab.save?.value ?? ab.save?.total ?? ab.mod);
}

/** Is this spell ready to cast (cantrip, prepared, or always/innate/at-will/pact)? */
function spellReady(item) {
  const s = item.system ?? {};
  if ( !num(s.level) ) return true;
  const method = s.method ?? s.preparation?.mode;
  if ( ["always", "innate", "atwill", "pact"].includes(method) ) return true;
  if ( method === "ritual" ) return false;
  if ( s.prepared !== undefined && typeof s.prepared !== "object" ) return !!s.prepared;
  if ( s.preparation ) return !!s.preparation.prepared;
  return true;
}

function extraAttacks(actor) {
  const names = actor.items.filter(i => i.type === "feat").map(i => i.name.toLowerCase());
  if ( names.some(n => n.includes("three extra attacks") || n.includes("extra attack (3)")) ) return 4;
  if ( names.some(n => n.includes("two extra attacks") || n.includes("extra attack (2)")) ) return 3;
  if ( names.some(n => n.startsWith("extra attack")) ) return 2;
  return 1;
}

function sneakDice(actor) {
  if ( !actor.items.some(i => i.type === "feat" && /^sneak attack/i.test(i.name)) ) return null;
  const lv = num(actor.classes?.rogue?.system?.levels);
  return lv ? `${Math.ceil(lv / 2)}d6` : null;
}

function critRange(actor) {
  const names = actor.items.filter(i => i.type === "feat").map(i => i.name.toLowerCase());
  if ( names.includes("superior critical") ) return 18;
  if ( names.includes("improved critical") ) return 19;
  return 20;
}

function practiceSlots(actor) {
  const sp = actor.system.spells ?? {};
  const out = [];
  for ( let l = 1; l <= 9; l++ ) {
    const n = num(sp[`spell${l}`]?.max);
    if ( n > 0 ) out.push({level: l, n, label: ORD[l]});
  }
  const pact = sp.pact;
  if ( num(pact?.max) > 0 && num(pact?.level) > 0 ) out.push({level: num(pact.level), n: num(pact.max), label: `pact ${ORD[num(pact.level)]}`});
  return out;
}

/**
 * The character as a practice fighter: real AC, max HP, saves, initiative, and a move per usable attack / save /
 * damage / healing activity on equipped weapons, ready spells and features. Things the window can't do are listed.
 */
export function buildPcFighter(actor) {
  const sys = actor.system ?? {};
  const prof = num(sys.attributes?.prof, 2);
  const lvl = Math.max(1, num(sys.details?.level, 1));
  const maxHp = Math.max(1, num(sys.attributes?.hp?.max, 10) + num(sys.attributes?.hp?.tempmax));
  const saves = {};
  for ( const a of ABILITIES ) saves[a] = saveBonus(actor, a);
  const attacks = extraAttacks(actor);
  const crit = critRange(actor);
  const spellDc = num(sys.attributes?.spell?.dc, 8 + prof);

  const weapons = actor.items.filter(i => i.type === "weapon");
  const equipped = weapons.filter(i => i.system?.equipped);
  const usable = [...(equipped.length ? equipped : weapons),
    ...actor.items.filter(i => i.type === "spell" && spellReady(i)),
    ...actor.items.filter(i => i.type === "feat")];

  const moves = [];
  const skipped = [];
  const seen = new Set();
  for ( const item of usable ) {
    const acts = activitiesOf(item).filter(a => ["attack", "save", "damage", "heal"].includes(a.type));
    let added = 0;
    for ( const a of acts ) {
      const d = damageFormula(a);
      if ( !d ) continue;
      const isSpell = item.type === "spell";
      const method = item.system?.method ?? item.system?.preparation?.mode;
      const slotLevel = isSpell && !["innate", "atwill"].includes(method) ? num(item.system.level) : 0;
      const usesMax = num(item.system?.uses?.max);
      const name = acts.length > 1 && a.name && a.name !== item.name ? `${item.name}: ${a.name}` : item.name;
      if ( seen.has(name) ) continue;
      const m = {
        id: `${item.id}.${a.id ?? added}`, name, itemType: item.type, img: item.img,
        level: slotLevel, uses: (!slotLevel && usesMax > 0) ? usesMax : null,
        dmg: d.formula, dmgType: d.type ?? ""
      };
      if ( a.type === "attack" ) {
        Object.assign(m, {kind: "attack", toHit: attackBonus(a, actor), count: item.type === "weapon" ? attacks : 1, critRange: item.type === "weapon" ? crit : 20});
        const props = item.system?.properties;
        const ranged = /ranged/.test(String(a.attack?.type?.value ?? item.system?.actionType ?? "")) || item.system?.actionType === "rwak";
        m.sneakOk = item.type === "weapon" && (ranged || !!props?.has?.("fin"));
      } else if ( a.type === "save" ) {
        const ability = firstOf(a.save?.ability) || "dex";
        Object.assign(m, {kind: "save", ability, dc: num(a.save?.dc?.value, spellDc) || spellDc, onSave: a.damage?.onSave ?? "half"});
      } else if ( a.type === "heal" ) {
        m.kind = "heal";
      } else {
        m.kind = "auto";
      }
      seen.add(name);
      moves.push(m);
      added++;
    }
    if ( !added && (item.type === "spell" || item.type === "weapon") && activitiesOf(item).length ) skipped.push(item.name);
  }
  // Fallback so nobody is left with nothing: an unarmed strike
  if ( !moves.some(m => m.kind === "attack") ) {
    const str = num(sys.abilities?.str?.mod);
    moves.unshift({id: "unarmed", name: "Unarmed Strike", kind: "attack", toHit: str + prof, dmg: `${Math.max(1, 1 + str)}`,
      count: attacks, level: 0, uses: null, critRange: crit, itemType: "weapon"});
  }
  const order = {weapon: 0, feat: 1, spell: 2};
  moves.sort((a, b) => (order[a.itemType] ?? 3) - (order[b.itemType] ?? 3) || a.level - b.level || a.name.localeCompare(b.name));
  return {
    fighter: {
      name: actor.name, short: String(actor.name).split(/\s+/)[0], hp: maxHp, maxHp,
      ac: num(sys.attributes?.ac?.value, 10),
      initBonus: num(sys.attributes?.init?.total ?? sys.attributes?.init?.mod ?? sys.abilities?.dex?.mod),
      saves, moves, slots: practiceSlots(actor), sneak: sneakDice(actor)
    },
    vars: {lvl, prof},
    skipped: [...new Set(skipped)]
  };
}

/* -------------------------------------------- */
/*  Record and rewards                          */
/* -------------------------------------------- */

export function sparRecord(actor) {
  const r = foundry.utils.deepClone(actor?.getFlag(MODULE, "spar") ?? {});
  r.wins = num(r.wins); r.losses = num(r.losses); r.draws = num(r.draws);
  r.streak = num(r.streak); r.best = num(r.best);
  r.beaten ??= {}; r.lost ??= {};
  const week = getWeek();
  if ( r.week !== week ) { r.week = week; r.gp = 0; }
  r.gp = num(r.gp);
  return r;
}

const beatenCount = (rec, id) => num(rec.beaten?.[id]);

function unlocked(rec, card) {
  return !card.after || beatenCount(rec, card.after) > 0;
}

/* -------------------------------------------- */
/*  The window                                  */
/* -------------------------------------------- */

const hpBar = (hp, max) => {
  const pct = Math.max(0, Math.min(100, Math.round(100 * hp / Math.max(1, max))));
  const tone = pct > 50 ? "ok" : (pct > 20 ? "mid" : "low");
  return `<div class="maul-spar-hp"><div class="maul-spar-hpfill ${tone}" style="width:${pct}%"></div></div>
    <div class="maul-spar-hptext">HP ${hp} / ${max}</div>`;
};

function spriteHTML(index, key, img, scale = 4) {
  const info = key ? index?.[key] : null;
  if ( info?.file ) {
    const fw = num(info.fw, 16), fh = num(info.fh, 16), n = Math.max(1, num(info.frames, 1));
    return `<span class="maul-spar-sprite" style="--w:${fw * scale}px;--h:${fh * scale}px;--sheet:${fw * scale * n}px;--frames:${n};background-image:url('${esc(modPath(`assets/sprites/live/${info.file}`))}')"></span>`;
  }
  if ( img ) return `<img class="maul-spar-portrait" src="${esc(img)}" alt="">`;
  return `<span class="maul-spar-sprite none">?</span>`;
}

function moveSub(m) {
  const fx = m.kind === "attack" ? `${m.toHit >= 0 ? "+" : ""}${m.toHit}${m.count > 1 ? ` ×${m.count}` : ""} · ${m.dmg}`
    : m.kind === "save" ? `DC ${m.dc} ${String(m.ability).toUpperCase()} · ${m.dmg}`
    : m.kind === "heal" ? `heal ${m.dmg}` : `auto · ${m.dmg}`;
  const cost = m.level > 0 ? ` · ${ORD[m.level]}+ slot` : (m.uses ? ` · ${m.left ?? m.uses}/${m.uses} left` : "");
  return `${fx}${cost}`;
}

export class SparApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "maul-spar",
    classes: ["maul-app", "maul-spar", "maul-pixel"],
    tag: "div",
    window: {title: "Practice Bouts", icon: "fas fa-hand-fist", resizable: true},
    position: {width: 640, height: 720},
    actions: {
      fight: SparApp.#onFight, move: SparApp.#onMove, dodge: SparApp.#onDodge, potion: SparApp.#onPotion,
      yield: SparApp.#onYield, back: SparApp.#onBack, rematch: SparApp.#onRematch
    }
  };

  /** Open for a host interactable in a mall: {mall, host, actor}. */
  static async open({mall, host, actor}) {
    const data = await getSparring();
    if ( !data ) return ui.notifications.warn("Practice bouts aren't set up (data/sparring.json is missing).");
    let app = foundry.applications.instances.get("maul-spar");
    if ( app?.bout && !app.bout.over ) { app.bringToFront?.(); return app; }
    if ( !app ) app = new SparApp();
    Object.assign(app, {data, mall, host, actor, bout: null, card: null, result: null, busy: false, last: null});
    app.partners = data.partners?.[mall.id] ?? [];
    app.index = await spriteIndex();
    await app.render({force: true});
    app.bringToFront?.();
    return app;
  }

  get title() {
    return `Practice Bouts: ${shortName(this.host?.name) || "Sparring"}`;
  }

  get cap() { return num(this.data?.weeklyCapGp, 250); }

  tierOf(card) { return this.data?.tiers?.[card.tier] ?? {label: card.tier, gp: 0}; }

  async _renderHTML() {
    if ( !this.actor ) return "<p>You need a character to spar.</p>";
    if ( this.bout ) return this.#fightHTML();
    return this.#pickHTML();
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  _onRender() {
    const log = this.element?.querySelector(".maul-spar-log");
    if ( log ) log.scrollTop = log.scrollHeight;
    // Shake whoever just lost HP
    if ( this.bout && this.last ) {
      for ( const side of ["pc", "foe"] ) {
        if ( this.bout[side].hp < this.last[side] ) this.element.querySelector(`.maul-spar-side.${side} .maul-spar-art`)?.classList.add("maul-spar-shake");
      }
    }
    if ( this.bout ) this.last = {pc: this.bout.pc.hp, foe: this.bout.foe.hp};
  }

  #pickHTML() {
    const rec = sparRecord(this.actor);
    const {fighter, skipped} = buildPcFighter(this.actor);
    const left = Math.max(0, this.cap - rec.gp);
    const cards = this.partners.map(card => {
      const tier = this.tierOf(card);
      const open = unlocked(rec, card);
      const after = card.after ? this.partners.find(p => p.id === card.after) : null;
      const pay = Math.min(num(tier.gp), left);
      const w = beatenCount(rec, card.id), l = num(rec.lost?.[card.id]);
      return `<section class="maul-spar-card ${open ? "" : "locked"}">
        <div class="maul-spar-card-art">${spriteHTML(this.index, resolveKey(this.index, card.sprite), null, 3)}</div>
        <div class="maul-spar-card-body">
          <h3>${esc(card.name)} <span class="maul-spar-tier ${esc(card.tier)}">${esc(tier.label)}</span></h3>
          <p>${esc(card.blurb ?? "")}</p>
          <div class="maul-spar-card-foot">
            <span class="maul-dim">${w || l ? `You: ${w} win${w === 1 ? "" : "s"}, ${l} loss${l === 1 ? "" : "es"}` : "Not fought yet"}
              · ${open ? (pay > 0 ? `win pays ${pay} gp` : "purse empty this week") : `beat ${esc(after?.short ?? after?.name ?? "the last partner")} first`}</span>
            <button type="button" class="maul-btn small" data-action="fight" data-id="${esc(card.id)}" ${open ? "" : "disabled"}>
              <i class="fas fa-hand-fist"></i> Fight</button>
          </div>
        </div>
      </section>`;
    }).join("");
    const moves = fighter.moves.map(m => `<li><strong>${esc(m.name)}</strong> <span class="maul-dim">${esc(moveSub(m))}</span></li>`).join("");
    const slots = fighter.slots.length ? fighter.slots.map(s => `${s.label} ×${s.n}`).join(", ") : "none";
    return `<div class="maul-spar-head">
        <div><strong>${esc(this.actor.name)}</strong> · record ${rec.wins}-${rec.losses}${rec.draws ? `-${rec.draws}` : ""}
          · streak ${rec.streak} (best ${rec.best})</div>
        <div class="maul-spar-purse ${left ? "" : "empty"}">Practice purse this week: <strong>${rec.gp} / ${this.cap} gp</strong></div>
        ${left ? "" : `<p class="maul-dim">${esc(this.data.hosts?.[this.mall.id]?.capped ?? "The purse is empty for you this week. You can still fight for fun.")}</p>`}
      </div>
      <p class="maul-dim">Your real numbers, practice HP: nothing on your sheet is used up or damaged. ${PRACTICE_POTIONS} practice
        potions per bout (2d4 + 2, one per turn, free). ${MAX_ROUNDS} rounds at most.</p>
      ${cards}
      <details class="maul-spar-numbers"><summary>Your numbers in practice</summary>
        <p>AC ${fighter.ac} · HP ${fighter.maxHp} · initiative ${fighter.initBonus >= 0 ? "+" : ""}${fighter.initBonus}
          ${fighter.sneak ? ` · Sneak Attack ${fighter.sneak}` : ""} · spell slots: ${esc(slots)}</p>
        <ul>${moves}</ul>
        ${skipped.length ? `<p class="maul-dim">Not in practice (no damage or healing to roll): ${esc(skipped.join(", "))}.</p>` : ""}
        <p class="maul-dim">Something missing or wrong? Tell Zak in your notebook (J).</p>
      </details>`;
  }

  #fightHTML() {
    const b = this.bout, pc = b.pc, foe = b.foe;
    const pcKeyFound = pcKey(this.index, this.actor.name);
    const side = (who, art) => `<div class="maul-spar-side ${who}">
        <div class="maul-spar-art">${art}</div>
        <div class="maul-spar-info">
          <div class="maul-spar-name">${esc(b[who].name)}</div>
          ${hpBar(b[who].hp, b[who].maxHp)}
          <div class="maul-dim">AC ${b[who].ac}${who === "foe" && foe.guard ? ` (+${foe.guard} guard)` : ""}${who === "pc" && pc.dodging ? " · dodging" : ""}</div>
        </div></div>`;
    const log = b.log.map(e => `<div class="maul-spar-line ${esc(e.side)} ${esc(e.cls ?? "")}">${esc(e.text)}</div>`).join("");
    let controls;
    if ( b.over ) {
      const r = this.result ?? {};
      const head = b.winner === "pc" ? "You win!" : (b.winner === "draw" ? "Draw" : "You lose");
      controls = `<div class="maul-spar-result ${esc(b.winner)}"><h2>${head}</h2>
          ${r.pay ? `<p>+${r.pay} gp from the Goolax practice purse (${r.gp} / ${this.cap} this week).</p>` : ""}
          ${b.winner === "pc" && !r.pay ? `<p class="maul-dim">The practice purse is empty for you this week. Glory only.</p>` : ""}
          ${r.unlocked ? `<p>New partner unlocked: <strong>${esc(r.unlocked)}</strong>.</p>` : ""}
          <p class="maul-dim">Record ${r.record ?? ""}. Your sheet is untouched: practice HP and slots reset.</p>
          <div class="maul-spar-buttons">
            <button type="button" class="maul-btn" data-action="rematch"><i class="fas fa-rotate-right"></i> Rematch</button>
            <button type="button" class="maul-btn" data-action="back"><i class="fas fa-people-arrows"></i> Other partners</button>
          </div></div>`;
    } else {
      const dis = this.busy || b.turn !== "pc" ? "disabled" : "";
      const opts = b.options().map(m => `<button type="button" class="maul-btn maul-spar-move ${esc(m.kind)}" data-action="move" data-id="${esc(m.id)}"
          ${m.ok && !dis ? "" : "disabled"} data-tooltip="${esc(m.ok ? moveSub(m) : m.why)}">
          <span>${esc(m.name)}</span><small>${esc(m.ok ? moveSub(m) : m.why)}</small></button>`).join("");
      const slots = pc.slots.length ? `<span class="maul-dim">Slots: ${pc.slots.map(s => `${s.label} ${s.n}`).join(" · ")}</span>` : "";
      controls = `<div class="maul-spar-moves">${opts}</div>
        <div class="maul-spar-buttons">
          <button type="button" class="maul-btn small" data-action="dodge" ${dis}><i class="fas fa-shield-halved"></i> Dodge</button>
          <button type="button" class="maul-btn small" data-action="potion" ${dis || b.potionUsed || pc.potions <= 0 ? "disabled" : ""}>
            <i class="fas fa-flask"></i> Potion (${pc.potions})</button>
          <button type="button" class="maul-btn small danger" data-action="yield" ${dis}><i class="fas fa-flag"></i> Tap out</button>
          ${slots}
        </div>`;
    }
    return `<div class="maul-spar-arena">
        ${side("foe", spriteHTML(this.index, resolveKey(this.index, this.card.sprite), null, 4))}
        ${side("pc", spriteHTML(this.index, pcKeyFound, this.actor.img, 4))}
      </div>
      <div class="maul-spar-log">${log}</div>
      ${controls}`;
  }

  /* ---------------- actions ---------------- */

  async #run(fn) {
    if ( this.busy ) return;
    this.busy = true;
    try { await fn(); } catch(err) { console.error(`${MODULE} | sparring`, err); ui.notifications.error("Sparring hit a snag; see the console (F12)."); }
    this.busy = false;
    if ( this.bout?.over && !this.result ) await this.#finish();
    await this.render();
  }

  async #start(card) {
    const {fighter, vars} = buildPcFighter(this.actor);
    this.card = card;
    this.result = null;
    this.last = null;
    const roll = async f => ({total: (await new Roll(f).evaluate()).total});
    this.bout = new Bout({pc: fighter, foe: buildFoe(card, vars), roll});
    this.vars = vars;
    Sfx.confirm();
    await this.#run(() => this.bout.start());
  }

  static async #onFight(event, target) {
    const card = this.partners.find(p => p.id === target.dataset.id);
    if ( !card || !unlocked(sparRecord(this.actor), card) ) return;
    await this.#start(card);
  }

  static async #onRematch() {
    if ( this.card ) await this.#start(this.card);
  }

  static async #onBack() {
    this.bout = null;
    this.card = null;
    this.result = null;
    await this.render();
  }

  static async #onMove(event, target) {
    const id = target.dataset.id;
    await this.#run(async () => {
      Sfx.confirm();
      await this.bout.act(id);
    });
  }

  static async #onDodge() {
    await this.#run(() => this.bout.act("dodge"));
  }

  static async #onPotion() {
    await this.#run(async () => { if ( await this.bout.drinkPotion() ) Sfx.coin(); });
  }

  static async #onYield() {
    await this.#run(() => this.bout.act("yield"));
  }

  /** Record the result on the character, pay the purse, log, tell the GM. Runs once per bout. */
  async #finish() {
    const b = this.bout, card = this.card, actor = this.actor;
    this.result = {};
    const rec = sparRecord(actor);
    const tier = this.tierOf(card);
    let pay = 0;
    let unlockedName = null;
    if ( b.winner === "pc" ) {
      const wasLocked = this.partners.filter(p => !unlocked(rec, p)).map(p => p.id);
      rec.wins += 1;
      rec.streak += 1;
      rec.best = Math.max(rec.best, rec.streak);
      rec.beaten[card.id] = beatenCount(rec, card.id) + 1;
      pay = Math.max(0, Math.min(num(tier.gp), this.cap - rec.gp));
      rec.gp += pay;
      unlockedName = this.partners.find(p => wasLocked.includes(p.id) && unlocked(rec, p))?.name ?? null;
    } else if ( b.winner === "draw" ) {
      rec.draws += 1;
    } else {
      rec.losses += 1;
      rec.streak = 0;
      rec.lost[card.id] = num(rec.lost?.[card.id]) + 1;
    }
    rec.lastT = Date.now();
    try {
      await actor.setFlag(MODULE, "spar", rec);
      if ( pay ) await spendGp(actor, -pay);
    } catch(err) {
      console.error(`${MODULE} | sparring record failed`, err);
      pay = 0;
    }
    const record = `${rec.wins}-${rec.losses}${rec.draws ? `-${rec.draws}` : ""}`;
    Object.assign(this.result, {pay, gp: rec.gp, unlocked: unlockedName, record});
    if ( b.winner === "pc" ) { Sfx.chime(); if ( pay ) Sfx.coin(); }

    const verb = {pc: "beat", foe: "lost to", draw: "drew with", yield: "tapped out against"}[b.winner] ?? "fought";
    const summary = `${actor.name} ${verb} ${card.name} (${tier.label}) in ${Math.min(b.round, MAX_ROUNDS)} round${b.round === 1 ? "" : "s"}`;
    const word = {pc: "won", foe: "lost", draw: "draw", yield: "tapped out"}[b.winner] ?? b.winner;
    await logEvent({kind: "spar", id: card.id, name: `Sparring vs ${card.name}: ${word}${pay ? `, +${pay} gp` : ""}`, result: b.winner, rounds: b.round,
      gp: pay, pcHp: `${b.pc.hp}/${b.pc.maxHp}`, foeHp: `${b.foe.hp}/${b.foe.maxHp}`});
    try {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor}),
        content: `<div class="maul-chat-card maul-spar-chat"><h3><i class="fas fa-hand-fist"></i> Practice bout</h3>
          <p>${esc(summary)}.${pay ? ` +${pay} gp.` : ""}</p>
          <p class="maul-dim">${esc(shortName(this.host?.name))} times it. Practice HP only.</p></div>`
      });
    } catch(err) { console.warn(`${MODULE} | sparring chat card failed`, err); }
    whisperGM(`<h3>Practice bout</h3><p><strong>${esc(whoLabel())}</strong>: ${esc(summary)}.
      ${pay ? `+${pay} gp (${rec.gp}/${this.cap} this week).` : "No gp."} Record ${esc(record)}, streak ${rec.streak}.</p>`);
  }

  _onClose(options) {
    // Leaving mid-bout just abandons it (nothing recorded, nothing paid).
    super._onClose?.(options);
    this.bout = null;
  }
}

/* -------------------------------------------- */
/*  The host NPC                                */
/* -------------------------------------------- */

/** Talking to a sparring host (`kind: "spar"`): greeting (full the first time, then a short ready line), then the window. */
export async function openSparFlow({entry, ctx, pages}) {
  const ia = entry.ia;
  const dlg = {speaker: ia.name, kind: "npc", sprite: ia.sprite, id: ia.id};
  await markSeen(ia.id);
  const met = hasFlag(`met-${ia.id}`);
  const shown = met && ia.ready?.length ? [pickOne(ia.ready)] : pages;
  const {completed} = await showDialogue({...dlg, pages: shown});
  await setFlags([`met-${ia.id}`], game.user, {kind: "talk", id: ia.id, name: ia.name ?? ia.id});
  if ( !completed ) return;
  const actor = game.user.character;
  if ( !actor ) {
    await showDialogue({...dlg, pages: ["No character sheet, no bout. Ask the DM to link your character, then come back."]});
    return;
  }
  await SparApp.open({mall: ctx.mall, host: ia, actor});
}
