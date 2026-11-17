// MAUL Mall Explorer: high length caps with a live counter, so nobody is surprised (SPEC 28, Zak 17 Nov 2026).
// "If you're going to have a cap, it should be high, and then they should be told that they're approaching the cap."
// Any <input>/<textarea> with data-max gets a small counter under it. It stays hidden until 75% of the cap, then shows
// "1,234 / 10,000" (amber), and red with an explanation once over. Fields never use `maxlength`, so typing or pasting is
// never silently cut: the player always sees what they wrote.
//   data-max="320"  the cap
//   data-soft       over the cap is allowed: everything is kept, and data-over says what happens (e.g. lines are cut
//                   when spoken). Without data-soft the app refuses to save until it's trimmed (text stays in the box).

/** Caps. LONG = notes, journal, coworker prompts, naming descriptions. LINE = what a stand-in says. */
export const LIMITS = {long: 10000, line: 320, name: 120, short: 200};

const fmt = n => Number(n).toLocaleString();

/** Hook every [data-max] field under `root` up to a counter. Safe to call again after a re-render. */
export function attachCounters(root) {
  for ( const el of root?.querySelectorAll?.("input[data-max], textarea[data-max]") ?? [] ) {
    if ( el.dataset.counted ) continue;
    el.dataset.counted = "1";
    const box = document.createElement("div");
    box.className = "maul-count";
    el.insertAdjacentElement("afterend", box);
    const update = () => {
      const max = Number(el.dataset.max) || 0;
      const n = el.value.length;
      if ( !max || n < max * 0.75 ) { box.textContent = ""; box.className = "maul-count"; return; }
      const over = n > max;
      box.className = `maul-count ${over ? "over" : "near"}`;
      if ( !over ) box.textContent = `${fmt(n)} / ${fmt(max)} characters`;
      else if ( el.dataset.soft !== undefined ) box.textContent = `${fmt(n)} / ${fmt(max)}: ${el.dataset.over ?? "everything you write is still saved for Zak."}`;
      else box.textContent = `${fmt(n)} / ${fmt(max)}: ${fmt(n - max)} over. Trim it, or split it into two. Nothing is lost; it stays here until you save.`;
    };
    el.addEventListener("input", update);
    update();
  }
}

/**
 * Hard caps check before saving: [[label, text, max], ...]. Warns and returns false if any is over (the text stays
 * in the field), else true.
 */
export function withinLimits(checks) {
  const over = checks.filter(([, text, max]) => String(text ?? "").length > max);
  if ( !over.length ) return true;
  const what = over.map(([label, text, max]) => `${label} is ${fmt(String(text).length - max)} characters over the ${fmt(max)} limit`).join("; ");
  ui.notifications.warn(`${what}. Nothing was lost: trim it or split it into two, then save again.`);
  return false;
}

/** A spoken line trimmed to `max` at a word break, with an ellipsis (the full text stays stored). */
export function fitLine(text, max = LIMITS.line) {
  const s = String(text ?? "").trim();
  if ( s.length <= max ) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}
