// MAUL Mall Explorer: the sparring bout engine (SPEC 31). Pure rules, no Foundry calls, so it can be tested in Node.
// A bout is one player character (numbers read from their dnd5e sheet by spar.js) against one sparring partner (stat
// card from data/sparring.json, scaled to the character's level). Practice HP only: nothing here touches an actor.
//
// The caller supplies `roll(formula) -> Promise<{total:number}>` (Foundry's Roll in the module, a tiny parser in tests).

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
export const ABILITY_NAMES = {str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma"};
export const MAX_ROUNDS = 20;
export const PRACTICE_POTIONS = 2;
export const POTION_FORMULA = "2d4 + 2";

/* -------------------------------------------- */
/*  Formula helpers                             */
/* -------------------------------------------- */

const SAFE_EXPR = /^[\d\s+\-*/().,]*$/;

/** Evaluate a plain number expression with @vars and floor/ceil/min/max, e.g. "10 + 8*@lvl + floor(@lvl/2)". */
export function evalExpr(expr, vars = {}) {
  if ( typeof expr === "number" ) return expr;
  let s = String(expr ?? "0").replace(/@(\w+)/g, (m, k) => String(Number(vars[k]) || 0));
  const bare = s.replace(/\b(floor|ceil|min|max)\b/g, "");
  if ( !SAFE_EXPR.test(bare) ) throw new Error(`Bad sparring expression: ${expr}`);
  // eslint-disable-next-line no-new-func
  const v = Function("floor", "ceil", "min", "max", `"use strict"; return (${s});`)(Math.floor, Math.ceil, Math.min, Math.max);
  return Number.isFinite(v) ? Math.floor(v) : 0;
}

/**
 * A dice formula with @vars and floor(...) groups resolved to numbers: "1d8 + 2 + floor(@lvl/2)" -> "1d8 + 2 + 2".
 * Dice terms are left alone.
 */
export function resolveFormula(formula, vars = {}) {
  let s = String(formula ?? "0").replace(/@(\w+)/g, (m, k) => String(Number(vars[k]) || 0));
  let guard = 0;
  while ( /\b(floor|ceil|min|max)\(/.test(s) && guard++ < 20 ) {
    s = s.replace(/\b(floor|ceil|min|max)\(([^()]*)\)/g, m => String(evalExpr(m)));
  }
  return s.replace(/\+\s*-/g, "- ").replace(/\s+/g, " ").trim();
}

/** Double every dice term's count for a critical hit: "1d8 + 3" -> "2d8 + 3". */
export function critFormula(formula) {
  return String(formula).replace(/(\d*)d(\d+)/g, (m, n, d) => `${(Number(n) || 1) * 2}d${d}`);
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

/* -------------------------------------------- */
/*  Partner from a stat card                    */
/* -------------------------------------------- */

/**
 * Build the partner fighter from its data card, scaled to the character.
 * @param {object} card    data/sparring.json partner
 * @param {{lvl:number, prof:number}} vars
 */
export function buildFoe(card, vars) {
  const s = card.stats ?? {};
  const v = {lvl: Math.max(1, Number(vars.lvl) || 1), prof: Number(vars.prof) || 2};
  const saves = {};
  for ( const a of ABILITIES ) saves[a] = evalExpr(s.saves?.[a] ?? s.save ?? 0, v);
  const hp = Math.max(1, evalExpr(s.hp ?? "10", v));
  return {
    side: "foe",
    id: card.id,
    name: card.name,
    short: card.short ?? String(card.name).split(/\s+/)[0],
    hp, maxHp: hp,
    ac: evalExpr(s.ac ?? 10, v),
    initBonus: evalExpr(s.init ?? 0, v),
    saves,
    guard: 0,
    lines: card.lines ?? {},
    saidHurt: false,
    moves: (card.moves ?? []).map((m, i) => ({
      id: m.id ?? `m${i}`,
      name: m.name,
      type: m.type ?? "attack",               // attack | save | guard | heal | idle
      text: m.text ?? "",
      weight: Number(m.weight) || 1,
      count: Math.max(1, evalExpr(m.count ?? 1, v)),
      toHit: m.bonus !== undefined ? evalExpr(m.bonus, v) : 0,
      dmg: m.dmg ? resolveFormula(m.dmg, v) : null,
      dmgType: m.dmgType ?? "",
      ability: m.ability ?? "dex",
      dc: m.dc !== undefined ? evalExpr(m.dc, v) : 0,
      onSave: m.onSave ?? "half",
      recharge: Number(m.recharge) || 0,      // 5 = recharge 5-6 (starts charged)
      charged: true,
      uses: m.uses !== undefined ? Number(m.uses) : null,
      ac: Number(m.ac) || 2,                  // guard: AC bonus until its next turn
      whenHurt: !!m.whenHurt                  // guard/heal: only below half HP
    }))
  };
}

/* -------------------------------------------- */
/*  The bout                                    */
/* -------------------------------------------- */

export class Bout {
  /**
   * @param {object} o
   * @param {object} o.pc     {name, short, hp, maxHp, ac, initBonus, saves, moves, slots, attacks, sneak}
   * @param {object} o.foe    from buildFoe
   * @param {(f:string)=>Promise<{total:number}>} o.roll
   * @param {()=>number} [o.rng]
   */
  constructor({pc, foe, roll, rng = Math.random, maxRounds = MAX_ROUNDS}) {
    this.pc = {side: "pc", potions: PRACTICE_POTIONS, dodging: false, ...pc};
    this.pc.slots = (pc.slots ?? []).map(s => ({...s}));
    this.pc.moves = (pc.moves ?? []).map(m => ({...m, left: m.uses ?? null}));
    this.foe = foe;
    this.roll = roll;
    this.rng = rng;
    this.maxRounds = maxRounds;
    this.round = 1;
    this.log = [];
    this.over = false;
    this.winner = null;           // "pc" | "foe" | "draw" | "yield"
    this.turn = null;
    this.potionUsed = false;      // one potion per turn (bonus action)
    this.stats = {pcDealt: 0, foeDealt: 0, pcHits: 0, pcMisses: 0, crits: 0};
  }

  say(side, text, cls = "") { this.log.push({side, text, cls}); }

  async d20(mode = 0) {
    const a = (await this.roll("1d20")).total;
    if ( !mode ) return {nat: a, text: `${a}`};
    const b = (await this.roll("1d20")).total;
    const nat = mode > 0 ? Math.max(a, b) : Math.min(a, b);
    return {nat, text: `${a}/${b} ${mode > 0 ? "adv" : "dis"}`};
  }

  async dmg(formula, crit = false) {
    if ( !formula ) return 0;
    const r = await this.roll(crit ? critFormula(formula) : formula);
    return Math.max(0, Math.floor(Number(r.total) || 0));
  }

  partnerLine(key) {
    const lines = this.foe.lines?.[key];
    if ( Array.isArray(lines) && lines.length ) this.say("foe", `${this.foe.short}: "${pick(lines, this.rng)}"`, "quote");
  }

  /** Roll initiative; if the partner goes first it takes its turn. */
  async start() {
    this.partnerLine("start");
    const p = (await this.roll("1d20")).total + (this.pc.initBonus || 0);
    const f = (await this.roll("1d20")).total + (this.foe.initBonus || 0);
    const pcFirst = p >= f;
    this.say("ref", `Initiative: ${this.pc.short} ${p}, ${this.foe.short} ${f}. ${pcFirst ? `${this.pc.short} goes first.` : `${this.foe.short} goes first.`}`);
    this.say("ref", `Round 1.`, "round");
    if ( !pcFirst ) await this.foeTurn(false);
    this.turn = this.over ? null : "pc";
    return this.log;
  }

  /** The character's moves with whether they can be used right now. */
  options() {
    return this.pc.moves.map(m => {
      let ok = true, why = "";
      if ( m.left !== null && m.left !== undefined && m.left <= 0 ) { ok = false; why = "used up"; }
      if ( m.level > 0 && !this.slotFor(m.level) ) { ok = false; why = "no slots left"; }
      return {...m, ok, why};
    });
  }

  slotFor(level) {
    return this.pc.slots.filter(s => s.n > 0 && s.level >= level).sort((a, b) => a.level - b.level)[0] ?? null;
  }

  async drinkPotion() {
    if ( this.over || this.turn !== "pc" || this.potionUsed || this.pc.potions <= 0 ) return false;
    this.potionUsed = true;
    this.pc.potions -= 1;
    const heal = await this.dmg(POTION_FORMULA);
    const before = this.pc.hp;
    this.pc.hp = Math.min(this.pc.maxHp, this.pc.hp + heal);
    this.say("pc", `${this.pc.short} gulps a practice potion: +${this.pc.hp - before} HP.`, "heal");
    return true;
  }

  /** The character's action: a move id, "dodge" or "yield". Then the partner's turn. */
  async act(choice) {
    if ( this.over || this.turn !== "pc" ) return this.log;
    this.pc.dodging = false;
    if ( choice === "yield" ) {
      this.say("pc", `${this.pc.short} taps out.`);
      return this.finish("yield");
    }
    if ( choice === "dodge" ) {
      this.pc.dodging = true;
      this.say("pc", `${this.pc.short} takes the Dodge action.`);
    } else {
      const m = this.pc.moves.find(x => x.id === choice);
      const opt = m && this.options().find(x => x.id === choice);
      if ( !m || !opt?.ok ) return this.log;
      if ( m.left !== null && m.left !== undefined ) m.left -= 1;
      if ( m.level > 0 ) {
        const slot = this.slotFor(m.level);
        slot.n -= 1;
        m.slotLabel = slot.label;
      }
      await this.pcMove(m);
    }
    if ( this.over ) return this.log;
    await this.foeTurn(true);
    return this.log;
  }

  async pcMove(m) {
    const pc = this.pc, foe = this.foe;
    const slotNote = m.level > 0 ? ` (${m.slotLabel ?? `level ${m.level}`} slot)` : "";
    if ( m.kind === "heal" ) {
      const heal = await this.dmg(m.dmg);
      const before = pc.hp;
      pc.hp = Math.min(pc.maxHp, pc.hp + heal);
      this.say("pc", `${pc.short} uses ${m.name}${slotNote}: +${pc.hp - before} HP.`, "heal");
      return;
    }
    if ( m.kind === "auto" ) {
      const d = await this.dmg(m.dmg);
      this.say("pc", `${pc.short} uses ${m.name}${slotNote}. It can't miss: ${d} damage.`, "hit");
      return this.hurtFoe(d);
    }
    if ( m.kind === "save" ) {
      const save = await this.d20();
      const total = save.nat + (foe.saves[m.ability] || 0);
      const ok = total >= m.dc;
      const full = await this.dmg(m.dmg);
      const d = ok ? (m.onSave === "half" ? Math.floor(full / 2) : (m.onSave === "full" ? full : 0)) : full;
      this.say("pc", `${pc.short} uses ${m.name}${slotNote}. ${foe.short} makes a ${ABILITY_NAMES[m.ability] ?? m.ability} save: ${total} vs DC ${m.dc}, ${ok ? "saved" : "failed"}${m.dmg ? `. ${d} damage.` : "."}`,
        ok ? "miss" : "hit");
      if ( d > 0 ) return this.hurtFoe(d);
      return;
    }
    // attack (weapons get Extra Attack)
    const count = Math.max(1, m.count || 1);
    let sneakDone = false;
    for ( let i = 0; i < count && !this.over; i++ ) {
      const r = await this.d20();
      const ac = foe.ac + (foe.guard || 0);
      const total = r.nat + (m.toHit || 0);
      const crit = r.nat >= (m.critRange || 20);
      const hit = crit || (r.nat !== 1 && total >= ac);
      const label = count > 1 ? `${m.name} (${i + 1}/${count})` : m.name;
      if ( !hit ) {
        this.stats.pcMisses++;
        this.say("pc", `${pc.short}: ${label}${slotNote}. ${r.nat === 1 ? "Natural 1, a miss." : `${total} vs AC ${ac}, miss.`}`, "miss");
        continue;
      }
      this.stats.pcHits++;
      if ( crit ) this.stats.crits++;
      let d = await this.dmg(m.dmg, crit);
      let extra = "";
      if ( pc.sneak && m.sneakOk && !sneakDone ) {
        sneakDone = true;
        const s = await this.dmg(pc.sneak, crit);
        d += s;
        extra = ` (Sneak Attack +${s})`;
      }
      this.say("pc", `${pc.short}: ${label}${slotNote}. ${crit ? "CRITICAL HIT!" : `${total} vs AC ${ac}, hit:`} ${d} damage${extra}.`, crit ? "crit" : "hit");
      this.hurtFoe(d);
    }
  }

  hurtFoe(d) {
    const foe = this.foe;
    foe.hp = Math.max(0, foe.hp - d);
    this.stats.pcDealt += d;
    if ( foe.hp <= 0 ) return this.finish("pc");
    if ( !foe.saidHurt && foe.hp <= foe.maxHp / 2 ) {
      foe.saidHurt = true;
      this.partnerLine("hurt");
    }
  }

  hurtPc(d) {
    this.pc.hp = Math.max(0, this.pc.hp - d);
    this.stats.foeDealt += d;
    if ( this.pc.hp <= 0 ) this.finish("foe");
  }

  chooseFoeMove() {
    const foe = this.foe;
    const hurt = foe.hp <= foe.maxHp / 2;
    const avail = foe.moves.filter(m => m.charged && (m.uses === null || m.uses > 0)
      && (!m.whenHurt || hurt) && !(m.type === "heal" && foe.hp >= foe.maxHp));
    if ( !avail.length ) return foe.moves.find(m => m.type === "attack") ?? null;
    const total = avail.reduce((s, m) => s + m.weight, 0);
    let x = this.rng() * total;
    for ( const m of avail ) { x -= m.weight; if ( x < 0 ) return m; }
    return avail.at(-1);
  }

  async foeTurn(advanceRound) {
    const foe = this.foe, pc = this.pc;
    this.turn = "foe";
    foe.guard = 0;
    for ( const m of foe.moves ) {
      if ( !m.charged && m.recharge ) {
        const r = (await this.roll("1d6")).total;
        if ( r >= m.recharge ) m.charged = true;
      }
    }
    const m = this.chooseFoeMove();
    if ( !m ) { this.say("foe", `${foe.short} waits.`); }
    else {
      if ( m.recharge ) m.charged = false;
      if ( m.uses !== null ) m.uses -= 1;
      const intro = m.text ? m.text.replaceAll("{foe}", foe.short).replaceAll("{pc}", pc.short) : `${foe.short} uses ${m.name}.`;
      if ( m.type === "idle" ) this.say("foe", intro);
      else if ( m.type === "guard" ) {
        foe.guard = m.ac;
        this.say("foe", `${intro} (+${m.ac} AC until its next turn)`, "guard");
      } else if ( m.type === "heal" ) {
        const h = await this.dmg(m.dmg);
        const before = foe.hp;
        foe.hp = Math.min(foe.maxHp, foe.hp + h);
        this.say("foe", `${intro} +${foe.hp - before} HP.`, "heal");
      } else if ( m.type === "save" ) {
        const mode = (pc.dodging && m.ability === "dex") ? 1 : 0;
        const r = await this.d20(mode);
        const total = r.nat + (pc.saves[m.ability] || 0);
        const ok = total >= m.dc;
        const full = await this.dmg(m.dmg);
        const d = ok ? (m.onSave === "half" ? Math.floor(full / 2) : 0) : full;
        this.say("foe", `${intro} ${pc.short} makes a ${ABILITY_NAMES[m.ability] ?? m.ability} save: ${total}${mode ? ` (${r.text})` : ""} vs DC ${m.dc}, ${ok ? "saved" : "failed"}. ${d} damage.`,
          ok ? "miss" : "hit");
        if ( d > 0 ) this.hurtPc(d);
      } else {
        this.say("foe", intro);
        for ( let i = 0; i < m.count && !this.over; i++ ) {
          const r = await this.d20(pc.dodging ? -1 : 0);
          const total = r.nat + m.toHit;
          const crit = r.nat === 20;
          const hit = crit || (r.nat !== 1 && total >= pc.ac);
          const label = m.count > 1 ? `${m.name} (${i + 1}/${m.count})` : m.name;
          const dis = pc.dodging ? ` [${r.text}]` : "";
          if ( !hit ) { this.say("foe", `${label}: ${r.nat === 1 ? "natural 1" : `${total} vs AC ${pc.ac}`}${dis}, miss.`, "miss"); continue; }
          const d = await this.dmg(m.dmg, crit);
          this.say("foe", `${label}: ${crit ? "CRITICAL HIT!" : `${total} vs AC ${pc.ac}${dis}, hit:`} ${d} damage.`, crit ? "crit" : "hit");
          this.hurtPc(d);
        }
      }
    }
    if ( this.over ) return;
    if ( advanceRound ) {
      this.round += 1;
      if ( this.round > this.maxRounds ) {
        this.say("ref", `Time! ${this.maxRounds} rounds and nobody's down. The referee calls it a draw.`);
        return this.finish("draw");
      }
      this.say("ref", `Round ${this.round}.`, "round");
    }
    this.turn = "pc";
    this.potionUsed = false;
  }

  finish(winner) {
    if ( this.over ) return;
    this.over = true;
    this.winner = winner;
    this.turn = null;
    if ( winner === "pc" ) {
      this.say("ref", `${this.foe.short} is down! ${this.pc.short} wins the bout.`, "win");
      this.partnerLine("lose");
    } else if ( winner === "foe" ) {
      this.say("ref", `${this.pc.short} is down. ${this.foe.short} wins the bout.`, "loss");
      this.partnerLine("win");
    } else if ( winner === "yield" ) {
      this.say("ref", `${this.foe.short} wins by tap-out.`, "loss");
      this.partnerLine("win");
    }
  }
}
