// MAUL Mall Explorer: coach practice (SPEC 16). A `kind: "coach"` NPC: players of the coach's team (galleria = monday,
// cogskill = tuesday, read from that mall's JSON `table`) may practise once per character per week for Heroic
// Inspiration. Each practice adds to a per-character visit count that unlocks the coach's backstory `stages`.

import {MODULE, esc} from "./config.js";
import {getMall} from "./data.js";
import {showDialogue} from "./dialogue.js";
import {setFlags, markSeen, safe} from "./progress.js";
import {usedThisWeek, markUsed, whisperGM, whoLabel} from "./weekly.js";
import {Sfx} from "./audio.js";

const {DialogV2} = foundry.applications.api;
const FALLBACK_TABLE = {galleria: "monday", cogskill: "tuesday"};

async function teamTable(team) {
  if ( !team ) return null;
  const mall = await getMall(team).catch(() => null);
  return mall?.table ?? FALLBACK_TABLE[team] ?? null;
}

/** The highest backstory stage this many practices has reached, or null. */
function stageFor(ia, visits) {
  const stages = (Array.isArray(ia.stages) ? ia.stages : []).filter(s => (Number(s?.minVisits) || 0) <= visits);
  stages.sort((a, b) => (Number(a.minVisits) || 0) - (Number(b.minVisits) || 0));
  return stages.at(-1) ?? null;
}

export async function openCoachFlow({entry, pages}) {
  const ia = entry.ia;
  const actor = game.user.character;
  const dlg = {speaker: ia.name, kind: "npc", sprite: ia.sprite, id: ia.id};
  await markSeen(ia.id);
  const weekKey = `coach_${safe(ia.id).replace(/[^\w-]/g, "_")}`;
  const table = game.user.getFlag(MODULE, "table") || null;
  const canPractise = !!actor && !!ia.practice && !!table && table === await teamTable(ia.team) && !usedThisWeek(actor, weekKey);

  const {completed} = await showDialogue({...dlg, pages});
  await setFlags([`met-${ia.id}`], game.user, {kind: "talk", id: ia.id, name: ia.name ?? ia.id});
  if ( !completed || !canPractise ) return;

  const ok = await DialogV2.confirm({
    window: {title: ia.name ?? "Coach", icon: "fas fa-dumbbell"},
    content: "<p>Practise with the coach?</p><p class=\"maul-dim\">Once a week. You'll leave inspired.</p>",
    rejectClose: false,
    modal: true
  });
  if ( !ok || usedThisWeek(actor, weekKey) ) return;
  await markUsed(actor, weekKey);
  Sfx.confirm();
  await showDialogue({...dlg, pages: ia.practice.pages ?? []});

  const visitKey = `coachVisits.${safe(ia.id)}`;
  const visits = (Number(actor.getFlag(MODULE, visitKey)) || 0) + 1;
  await actor.setFlag(MODULE, visitKey, visits);
  const notes = [];
  if ( ia.practice.inspiration !== false ) {
    try {
      await actor.update({"system.attributes.inspiration": true});
      Sfx.chime();
      notes.push("You feel inspired. (Heroic Inspiration!)");
    } catch(err) {
      console.warn(`${MODULE} | coach inspiration failed`, err);
    }
  }
  const stage = stageFor(ia, visits);
  await showDialogue({...dlg, pages: [...notes, ...(stage?.pages ?? [])]});
  await setFlags([], game.user, {kind: "coach", id: ia.id, name: `Practice with ${ia.name ?? ia.id}`, visits});
  whisperGM(`<h3>Coach practice</h3><p><strong>${esc(whoLabel())}</strong> practised with <strong>${esc(ia.name ?? ia.id)}</strong>
    (practice #${visits}${ia.practice.inspiration !== false ? ", Heroic Inspiration" : ""}).</p>`);
}
