// Decision events: EVENT -> PROBLEM -> TIMER -> FOUR CHOICES -> EVALUATION -> CONSEQUENCE -> SCIENCE.
// Every choice grades itself from the *current* mission state, so the same choice can be perfect in one
// situation and wrong in another (e.g. repairing needs materials; rationing only helps if you cannot repair).
import data from './missionData.js';
import { CFG, addRes, hurt, heal, toast, emit, bonuses, GRADE_ORDER } from './core.js';
import { clamp } from './math.js';
import { crisisAfterDecision, CRISES } from './crisis.js';

const R = (grade, why, consequence = '') => ({ grade, why, consequence });
const pct = (v) => `${Math.round(v)}%`;
const S = (g) => g.sevMul;
const fix = (g, key) => { g.status[key] = false; };

// ---- solar storm (rules ported from the original events.json) -----------------------------
function condMet(c, ctx) {
  if (!c) return true;
  if (c.all) return c.all.every((x) => condMet(x, ctx));
  if (c.any) return c.any.some((x) => condMet(x, ctx));
  if (c.not) return !condMet(c.not, ctx);
  if ('building' in c) return ctx.buildings[c.building] === c.state;
  if ('metric' in c) {
    const v = ctx.metrics[c.metric];
    return (c.gte === undefined || v >= c.gte) && (c.lte === undefined || v <= c.lte) && (c.gt === undefined || v > c.gt) && (c.lt === undefined || v < c.lt);
  }
  return false;
}
export function gradeStormChoice(choiceId, ctx) {
  const choice = data.solarStorm.choices.find((c) => c.id === choiceId);
  for (const rule of choice.grades) if (condMet(rule.when, ctx)) return { grade: rule.grade, why: rule.why || '' };
  return { grade: 'wrong', why: '' };
}
export const STORM_INTENSITY = { perfect: 0.55, good: 0.75, acceptable: 1.0, wrong: 1.4 };
const STORM_CONSEQ = {
  perfect: 'Emergency protocols limited the damage: storm radiation reduced to 55%.',
  good: 'Your response helped: storm radiation reduced to 75%.',
  acceptable: 'Standard exposure: the storm hits at full strength.',
  wrong: 'Electronics were hit: solar output drops and radiation is 40% stronger.',
};
const stormChoice = (c) => ({
  id: c.id, text: c.text,
  run(g) {
    const ctx = { buildings: { radiation_shelter: 'working' }, metrics: { outside_count: g.zone === 'outside' ? 1 : 0, level: 1 + (g.level.id > 2 ? 2 : 0) } };
    const { grade, why } = gradeStormChoice(c.id, ctx);
    const dur = g.level.stormSeconds || 45;
    g.hazard = { type: 'storm', state: 'active', t: 0, dur: dur * (g.diff.id === 'hard' ? 1.15 : g.diff.id === 'easy' ? 0.85 : 1), intensity: STORM_INTENSITY[grade] * clamp(S(g), 0.75, 1.3), grade };
    if (grade === 'wrong') g.stormPowerPenalty = 0.34;
    g.flags.stormStarted = true;
    return R(grade, why, STORM_CONSEQ[grade]);
  },
});

export const EVENTS = {
  solar_storm: {
    id: 'solar_storm', name: data.solarStorm.name, icon: data.solarStorm.icon, alert: data.solarStorm.alert, timer: 14, hint: data.solarStorm.hint,
    problem: (g) => data.solarStorm.problem.replace('{crew_location}', g.zone === 'outside' ? 'You are working outside the protected habitat.' : `You are inside the ${g.zone === 'shelter' ? 'radiation shelter' : 'habitat'}.`).replace('for the next two days', 'for the next minute'),
    choices: data.solarStorm.choices.map(stormChoice), science: data.solarStorm.science,
  },

  resource_discovery: {
    id: 'resource_discovery', name: 'Resource Discovery', icon: '💎', alert: 'Instruments detect a promising deposit.', timer: 20,
    hint: 'Extra materials are valuable, but every minute outside costs suit oxygen.',
    problem: (g) => (g.planet === 'mars'
      ? `The rover's ground-penetrating radar shows buried water ice 35 m away. Suit oxygen: ${pct(g.oxygen)}, water store: ${pct(g.res.water)}.`
      : `The spectrometer shows a mineral-rich vein 35 m away that could give extra repair materials. Suit oxygen: ${pct(g.oxygen)}.`),
    choices: [
      { id: 'A', text: 'Go and collect it now with the sampler.', run(g) {
        const safe = g.oxygen > 45;
        if (safe) { const m = Math.round(3 * bonuses(g).sample); if (g.planet === 'mars') addRes(g, 'water', 14); addRes(g, 'materials', m); addRes(g, 'oxygen', -9); return R('perfect', 'You had plenty of oxygen to make the trip safely.', `+${m} materials${g.planet === 'mars' ? ', +14% water from the ice' : ''}, -9% suit oxygen.`); }
        addRes(g, 'oxygen', -15); hurt(g, 6, 'oxygen'); return R('wrong', 'Your suit oxygen was too low for a 70 m round trip.', '-15% suit oxygen and you felt light-headed (-6 health).');
      } },
      { id: 'B', text: 'Log the coordinates and finish your current task first.', run(g) { g.flags.discoveryLogged = true; addRes(g, 'materials', 1); return R(g.oxygen > 45 ? 'good' : 'perfect', g.oxygen > 45 ? 'Safe, but you could have collected it now while oxygen was high.' : 'With low oxygen, marking it for later was the safe call.', '+1 material from the quick scan.'); } },
      { id: 'C', text: 'Grab a quick surface sample on your way back (few minutes, small haul).', run(g) { addRes(g, 'materials', 2); return R('good', 'A quick grab saved oxygen, but you can only carry a little.', '+2 materials.'); } },
      { id: 'D', text: 'Ignore it - it is not on the mission plan.', run(g) { return R(g.res.materials >= 4 ? 'acceptable' : 'wrong', g.res.materials >= 4 ? 'You had enough materials for now, but supplies are never wasted.' : 'You were short on materials and skipped a free source.', 'No change.'); } },
    ],
    science: 'In-situ resource utilisation (ISRU) means using local materials instead of launching everything from Earth. Water ice on the Moon and Mars can become drinking water, oxygen and rocket fuel.',
  },

  water_leak: {
    id: 'water_leak', name: 'Water Leak', icon: '💧', alert: 'Water pressure is dropping fast.', timer: 18,
    hint: 'Fixing the cause is best if you can afford it - otherwise slow the loss.',
    problem: (g) => `A pipe has burst in the habitat and water drains away until it is sealed. Water: ${pct(g.res.water)}. Materials on hand: ${Math.floor(g.res.materials)}.`,
    choices: [
      { id: 'A', text: 'Repair the pipe properly with spare materials.', run(g) {
        if (g.res.materials < 2) { addRes(g, 'water', -4); return R('wrong', 'You did not have enough materials to repair the pipe.', 'The leak keeps draining (-4% water).'); }
        addRes(g, 'materials', -2 * bonuses(g).repair); fix(g, 'water_leak'); return R('perfect', 'A proper repair stopped the leak for good.', 'Leak sealed. -2 materials.');
      } },
      { id: 'B', text: 'Ration water until you can fix it.', run(g) { g.rationUntil = g.time + 120; const poor = g.res.materials < 2; return R(poor ? 'perfect' : 'acceptable', poor ? 'With no spare materials, rationing was the best way to stretch the water.' : 'Rationing helps, but the pipe is still leaking and you had the materials to fix it.', 'Water use cut by 40% for two minutes. The leak is still open - repair it at the pipe.'); } },
      { id: 'C', text: 'Isolate the damaged pipe section (shuts down the water recycler loop).', run(g) { fix(g, 'water_leak'); if (g.sys.recycler.st === 'ok') g.sys.recycler.st = 'fault'; const poor = g.res.materials < 2; return R(poor ? 'perfect' : 'good', poor ? 'Without materials, isolating the section stopped the loss.' : 'It stopped the leak, but cost you the recycler - a repair would have been cleaner.', 'Leak stopped. The water recycler is offline until you restart it with the scanner.'); } },
      { id: 'D', text: 'Carry on and hope it stops by itself.', run(g) { const ok = g.res.water >= 80 && g.level.id <= 2; addRes(g, 'water', ok ? -4 : -10); return R(ok ? 'acceptable' : 'wrong', ok ? 'The tank was full and the leak small, but leaks never fix themselves.' : 'Ignoring a leak lets it drain your water supply.', `-${ok ? 4 : 10}% water, and the leak continues.`); } },
    ],
    science: 'Every litre of water must be launched from Earth or made on site, so crews recycle as much as they can. The ISS recovers over 90% of its water, and a small leak caught early is far cheaper than a lost tank.',
  },

  o2_leak: {
    id: 'o2_leak', name: 'Oxygen Leak', icon: '🫧', alert: 'Habitat pressure falling: hull breach!', timer: 16,
    hint: 'Oxygen is lost every second the breach stays open. Can you afford to seal it?',
    problem: (g) => `A micro-meteoroid has punched a hole in the habitat wall. Habitat oxygen: ${pct(g.o2res)}. Materials: ${Math.floor(g.res.materials)}. Battery: ${pct(g.res.battery)}.`,
    choices: [
      { id: 'A', text: 'Patch the breach with sealant and a plate.', run(g) {
        if (g.res.materials < 2) return R('wrong', 'You did not have the materials for a proper patch.', 'The leak continues.');
        addRes(g, 'materials', -2 * bonuses(g).repair); fix(g, 'o2_leak'); return R('perfect', 'Sealing the hull stops the loss at the source.', 'Breach sealed. -2 materials.');
      } },
      { id: 'B', text: 'Run the oxygen generator at full output to out-produce the leak.', run(g) { g.flags.o2boostUntil = g.time + 150; const ok = g.res.battery > 40 && g.sys.o2gen.st === 'ok'; return R(ok ? 'good' : 'wrong', ok ? 'It buys time, but it burns energy and water and never fixes the hole.' : 'The generator was down or the battery too low to keep up.', ok ? 'Oxygen generator output doubled for 2.5 minutes (extra power and water use).' : 'Not enough power to help.'); } },
      { id: 'C', text: 'Seal the damaged room and rely on suit oxygen.', run(g) { fix(g, 'o2_leak'); addRes(g, 'o2res', -12); return R('acceptable', 'Sealing the room stops the leak, but you lose part of the habitat and its air.', '-12% habitat oxygen, leak stopped.'); } },
      { id: 'D', text: 'Ignore it and keep working.', run(g) { return R('wrong', 'A breach never closes by itself - habitat oxygen keeps falling.', 'The leak continues.'); } },
    ],
    science: 'Habitats are pressurised vessels. Even a pin-sized hole lets air escape into vacuum, so crews carry patch kits and keep suits ready. Electrolysis can make more oxygen, but only while power and water last.',
  },

  panel_dust: {
    id: 'panel_dust', name: 'Dust on the Solar Panels', icon: '🌫️', alert: 'Solar output is dropping.', timer: 18,
    hint: 'Dust blocks sunlight. What actually removes it depends on where you are.',
    problem: (g) => `Fine ${g.planet === 'mars' ? 'Martian dust' : 'electrostatic lunar dust'} is coating the arrays and solar output has fallen. Suit oxygen: ${pct(g.oxygen)}.`,
    choices: [
      { id: 'A', text: 'Clean the panels by hand (works at each array).', run(g) { g.flags.dustAdvice = true; return R('perfect', 'Hands-on cleaning always works. It costs time and suit oxygen outside.', 'Clean each array by holding E at it.'); } },
      { id: 'B', text: 'Wait for the wind to blow the dust off.', run(g) { if (g.planet === 'mars') { for (const id of Object.keys(g.dust)) g.dust[id] = Math.max(0, g.dust[id] - 0.3); return R('good', 'Martian winds do clear dust sometimes - but not reliably.', 'Dust reduced a little on all panels.'); } return R('wrong', 'The Moon has no atmosphere and no wind. Dust stays put.', 'Nothing changes.'); } },
      { id: 'C', text: 'Make up the power loss by shutting down the greenhouse and heater.', run(g) { if (g.sys.greenhouse.st === 'ok') g.sys.greenhouse.on = false; return R('acceptable', 'It saves energy now, but food and warmth suffer and the dust is still there.', 'Greenhouse switched off.'); } },
      { id: 'D', text: 'Ignore the drop.', run(g) { for (const id of Object.keys(g.dust)) g.dust[id] = Math.min(0.9, g.dust[id] + 0.2); return R('wrong', 'Dust builds up and costs more power every hour.', 'More dust settles on the arrays.'); } },
    ],
    science: 'Apollo astronauts found that lunar dust is sharp, sticky and clings to everything. On Mars, dust blocks sunlight and slowly buries solar panels, which is why some rovers needed wind-cleaning events or ran out of power.',
  },

  equipment_overload: {
    id: 'equipment_overload', name: 'Power Overload', icon: '⚡', alert: 'Demand is higher than generation!', timer: 18,
    hint: 'Energy produced must be at least the energy used - or the battery pays the difference.',
    problem: (g) => `Every system is running but the arrays cannot keep up. Battery: ${pct(g.res.battery)}. Open the systems console (E at the desk) to see the energy balance.`,
    choices: [
      { id: 'A', text: 'Shed non-essential loads (greenhouse) and keep life support on.', run(g) { if (g.sys.greenhouse.st === 'ok') g.sys.greenhouse.on = false; return R('perfect', 'Prioritising life support is how real crews survive power shortages.', 'Greenhouse load shed; energy balance improved.'); } },
      { id: 'B', text: 'Switch off the CO₂ scrubber to save power.', run(g) { g.sys.scrubber.on = false; return R('wrong', 'CO₂ builds up quickly in a sealed habitat - you cannot skip scrubbing.', 'CO₂ will now rise. Switch the scrubber back on!'); } },
      { id: 'C', text: 'Do nothing and let the battery drain.', run(g) { return R(g.res.battery > 60 ? 'acceptable' : 'wrong', g.res.battery > 60 ? 'The battery is healthy, so you can afford it for now.' : 'The battery is low and will hit zero, shutting systems down.', 'The deficit continues.'); } },
      { id: 'D', text: 'Switch off the thermal control.', run(g) { g.sys.thermal.on = false; return R(g.ambient > 5 ? 'acceptable' : 'wrong', g.ambient > 5 ? 'It is mild outside, so the habitat will cool only slowly.' : 'It is cold outside - the habitat will freeze without heating.', 'Thermal control off.'); } },
    ],
    science: 'A power system must balance generation, storage and consumption. Spacecraft engineers draw up a priority list so that, when power is short, life support is the last thing to shut down.',
  },

  battery_failure: {
    id: 'battery_failure', name: 'Battery Failure', icon: '🔋', alert: 'Battery cells are failing.', timer: 16,
    hint: 'Half of your stored energy is gone. Think about where energy comes from and what you can spare.',
    problem: (g) => `A battery module has failed and capacity is halved. Battery: ${pct(g.res.battery)}. Sunlight: ${Math.round(g.sun * 100)}%. Materials: ${Math.floor(g.res.materials)}.`,
    choices: [
      { id: 'A', text: 'Shed non-essential loads and run on a reduced emergency plan.', run(g) { if (g.sys.greenhouse.st === 'ok') g.sys.greenhouse.on = false; g.batteryCap = 0.6; g.res.battery = Math.min(g.res.battery, 60); return R('perfect', 'Cutting demand is the fastest way to stretch a smaller battery.', 'Capacity cut to 60%; greenhouse load shed.'); } },
      { id: 'B', text: 'Rely on the solar arrays directly while the sun is up.', run(g) { g.batteryCap = 0.5; g.res.battery = Math.min(g.res.battery, 50); return R(g.sun > 0.5 ? 'good' : 'wrong', g.sun > 0.5 ? 'It works while the sun shines, but nights and storms will be a problem.' : 'There is little sunlight, so the arrays cannot carry the load.', 'Capacity halved.'); } },
      { id: 'C', text: 'Rebuild the battery pack with spare materials.', run(g) { if (g.res.materials >= 4) { addRes(g, 'materials', -4 * bonuses(g).repair); g.batteryCap = 0.8; return R('good', 'A partial rebuild restores most of the capacity but uses scarce materials.', 'Capacity 80%. -4 materials.'); } g.batteryCap = 0.5; return R('wrong', 'Not enough materials for a rebuild.', 'Capacity stays at 50%.'); } },
      { id: 'D', text: 'Keep restarting the battery bank and hope.', run(g) { g.batteryCap = 0.5; g.res.battery = Math.min(g.res.battery, 35); return R('wrong', 'Restarting a failed cell does not bring it back.', 'You lost more charge (-15%).'); } },
    ],
    science: 'Batteries are what keep a lunar base alive through the two-week lunar night. Engineers add redundancy - spare modules and diverse power sources - because a single failure must never darken life support.',
  },

  temp_failure: {
    id: 'temp_failure', name: 'Thermal Control Failure', icon: '🌡️', alert: 'Habitat temperature is dropping.', timer: 16,
    hint: 'Without a working heater, the habitat drifts toward the outside temperature.',
    problem: (g) => `The thermal control unit has stopped. Habitat: ${Math.round(g.temp)} °C, outside ambient: ${Math.round(g.ambient)} °C. Materials: ${Math.floor(g.res.materials)}.`,
    choices: [
      { id: 'A', text: 'Repair the thermal unit now.', run(g) { if (g.res.materials >= 3) { addRes(g, 'materials', -3 * bonuses(g).repair); g.sys.thermal.st = 'ok'; return R('perfect', 'Fixing the heater restores temperature control for good.', 'Thermal unit repaired. -3 materials.'); } return R('wrong', 'You did not have enough materials.', 'The habitat keeps cooling.'); } },
      { id: 'B', text: 'Move into the small radiation shelter, which stays warm longer.', run(g) { return R(g.res.materials >= 3 ? 'acceptable' : 'good', g.res.materials >= 3 ? 'It buys time, but you had the materials for a real fix.' : 'With no materials, a small insulated space is a sensible stop-gap.', 'Shelter is slower to cool - repair the unit when you can.'); } },
      { id: 'C', text: 'Run every system to make waste heat.', run(g) { for (const k of ['o2gen', 'recycler', 'scrubber', 'greenhouse']) if (g.sys[k].st === 'ok') g.sys[k].on = true; return R('acceptable', 'Equipment gives off heat, but it burns energy you may not have.', 'All systems on - watch the battery!'); } },
      { id: 'D', text: 'Ignore it - the habitat is insulated.', run(g) { return R(g.ambient > 0 ? 'acceptable' : 'wrong', g.ambient > 0 ? 'It is mild outside, so the habitat stays livable for a while.' : 'It is far below freezing outside: the habitat will get dangerously cold.', 'The habitat keeps cooling.'); } },
    ],
    science: 'Space has no air to carry heat away, so temperature control is all about radiation and insulation. Surface temperatures swing from about +117 °C to -178 °C on the Moon, and average near -60 °C on Mars.',
  },

  comm_failure: {
    id: 'comm_failure', name: 'Communication Failure', icon: '📡', alert: 'Link to mission control lost.', timer: 18,
    hint: 'Without radio you lose guidance and the compass beacon.',
    problem: () => 'The main antenna has lost its link. Mission control cannot see your data and you lose the navigation beacon until contact is restored.',
    choices: [
      { id: 'A', text: 'Realign the dish at the comm mast (needs 2 materials).', run(g) { g.status.comm_down = true; if (g.res.materials >= 2) { return R('perfect', 'Going to the antenna fixes the problem at the source.', 'Repair the dish at the mast (hold E).'); } return R('good', 'Right idea, but you need 2 materials for the parts.', 'Repair the dish when you have 2 materials.'); } },
      { id: 'B', text: 'Use the rover radio as a relay.', run(g) { g.status.comm_down = true; g.flags.roverRelay = true; return R('good', 'The rover radio is a decent backup, but it is short range.', 'Visit the rover to restore a partial link.'); } },
      { id: 'C', text: 'Wait for the next scheduled communication window.', run(g) { g.status.comm_down = true; return R('acceptable', 'Waiting is safe if nothing else is urgent, but you fly blind meanwhile.', 'No link until repaired.'); } },
      { id: 'D', text: 'Switch the power off and on again repeatedly.', run(g) { g.status.comm_down = true; addRes(g, 'battery', -3); return R('wrong', 'Random power cycling wastes energy and does not fix a misaligned dish.', '-3% energy.'); } },
    ],
    science: 'Deep-space communication uses narrow radio beams, so antennas must point precisely. Missions plan backup relays for exactly this reason - and rely on checklists rather than guesses.',
  },

  astronaut_injury: {
    id: 'astronaut_injury', name: 'Astronaut Injury', icon: '🩹', alert: 'Injury reported!', timer: 16,
    hint: 'A treated injury heals; an ignored one gets worse.',
    problem: (g) => 'You slipped on loose regolith and twisted your ankle.' + ` Materials: ${Math.floor(g.res.materials)}.`,
    choices: [
      { id: 'A', text: 'Treat it with the medical kit (1 material).', run(g) { if (g.res.materials >= 1) { addRes(g, 'materials', -1); heal(g, 18 * bonuses(g).heal); g.status.injured = false; return R('perfect', 'Prompt first aid prevents a small injury from becoming a big one.', 'Injury treated (-1 material).'); } return R('wrong', 'No medical supplies left.', 'The injury remains.'); } },
      { id: 'B', text: 'Rest in the habitat for a while.', run(g) { g.status.injured = false; heal(g, 6); return R('good', 'Rest helps, but it costs time.', 'Slow recovery in the habitat.'); } },
      { id: 'C', text: 'Take pain relief and keep working.', run(g) { g.status.injured = true; hurt(g, 8, 'injury'); return R('wrong', 'Pain relief hides the problem; working on an injury makes it worse.', '-8 health.'); } },
      { id: 'D', text: 'Ignore it.', run(g) { g.status.injured = true; return R('wrong', 'Untreated injuries slow you down and can become serious far from help.', 'Movement slowed.'); } },
    ],
    science: 'Low gravity changes the body and injuries heal differently in space. Crews train in first aid, carry medical kits, and always put an injured crew member before the schedule.',
  },

  low_sunlight: {
    id: 'low_sunlight', name: 'Lunar Sunset', icon: '🌒', alert: 'The Sun is setting - night is coming.', timer: 18,
    hint: 'The lunar night lasts about two weeks. Solar power will drop to zero.',
    problem: (g) => `Sunset is approaching and solar generation will fall to zero. Battery: ${pct(g.res.battery)}. The heater, oxygen generator and greenhouse all draw power.`,
    choices: [
      { id: 'A', text: 'Switch off the greenhouse and plan load shedding before dark.', run(g) { if (g.sys.greenhouse.st === 'ok') g.sys.greenhouse.on = false; return R('perfect', 'Cutting non-essential loads before the night is exactly how real bases plan.', 'Greenhouse off. You will need the battery for life support only.'); } },
      { id: 'B', text: 'Keep everything running at full power.', run(g) { return R(g.res.battery > 85 ? 'acceptable' : 'wrong', g.res.battery > 85 ? 'The battery is nearly full, but it will not last a whole night.' : 'The battery is not full - you will run out of power in the dark.', 'Energy demand stays high.'); } },
      { id: 'C', text: 'Turn off thermal control to save power.', run(g) { g.sys.thermal.on = false; return R('wrong', 'Without heating the habitat will freeze at night - batteries and people both suffer.', 'Thermal control off.'); } },
      { id: 'D', text: 'Wait and see what happens.', run(g) { return R('acceptable', 'Waiting is not a plan, but you still have some margin.', 'No change.'); } },
    ],
    science: 'The Moon turns once every 27 days, so most places have about 14 Earth days of sunlight followed by 14 days of darkness. Bases at the poles, with near-constant sun, are attractive for exactly that reason.',
  },

  dust_storm: {
    id: 'dust_storm', name: 'Martian Dust Storm', icon: '🌪️', alert: 'Dust storm approaching - sunlight is fading.', timer: 12,
    hint: 'Dust blocks the sun. What will you power from the battery, and where should the crew be?',
    problem: (g) => `A regional dust storm will cut sunlight to a fraction for a while. Battery: ${pct(g.res.battery)}. Sunlight: ${Math.round(g.sun * 100)}%.`,
    choices: [
      { id: 'A', text: 'Stow the panels, shed non-essential loads and conserve the battery.', run(g) { for (const id of Object.keys(g.arrays)) if (g.arrays[id] === 'ok') g.arrays[id] = 'stowed'; g.flags.stowedBest = 3; for (const k of ['greenhouse']) if (g.sys[k].st === 'ok') g.sys[k].on = false; g.hazard = { type: 'dust', state: 'active', t: 0, dur: g.level.stormSeconds || 100, intensity: 0.85 * clamp(S(g), 0.75, 1.3), grade: 'perfect' }; g.flags.stormStarted = true; const ok = g.res.battery > 35; return R(ok ? 'perfect' : 'good', ok ? 'Conserving energy through the storm is the right plan.' : 'Good plan, but the battery is already low.', 'Panels stowed (redeploy them after the storm) and greenhouse shed. Storm sunlight at 12%.'); } },
      { id: 'B', text: 'Keep everything running at full power.', run(g) { g.hazard = { type: 'dust', state: 'active', t: 0, dur: g.level.stormSeconds || 100, intensity: 1, grade: 'wrong' }; g.flags.stormStarted = true; return R('wrong', 'With sunlight blocked, full power drains the battery fast.', 'Battery will drain quickly.'); } },
      { id: 'C', text: 'Send the crew outside to clean the panels during the storm.', run(g) { g.hazard = { type: 'dust', state: 'active', t: 0, dur: g.level.stormSeconds || 100, intensity: 1.15, grade: 'wrong' }; g.flags.stormStarted = true; hurt(g, 6, 'radiation'); return R('wrong', 'Panels re-cover with dust at once, and working outside in a storm is dangerous.', '-6 health.'); } },
      { id: 'D', text: 'Keep life support on, shed some loads and wait it out in the habitat.', run(g) { g.hazard = { type: 'dust', state: 'active', t: 0, dur: g.level.stormSeconds || 100, intensity: 0.95 * clamp(S(g), 0.75, 1.3), grade: 'good' }; g.flags.stormStarted = true; if (g.sys.greenhouse.st === 'ok') g.sys.greenhouse.on = false; return R('good', 'A safe plan, though stowing the panels would protect them better.', 'Greenhouse off. Storm sunlight at 12%.'); } },
    ],
    science: 'In 2018 a global dust storm blocked so much sunlight that NASA\'s solar-powered Opportunity rover fell silent. Dust storms can last weeks, so Mars bases need big batteries, careful load planning and often nuclear power.',
  },

  rover_problem: {
    id: 'rover_problem', name: 'Rover Problem', icon: '🚙', alert: 'Rover fault detected.', timer: 18,
    hint: 'The rover carries spare suit air. Can you fix it cheaply?',
    problem: (g) => `A wheel actuator on the rover has stalled. Materials: ${Math.floor(g.res.materials)}.`,
    choices: [
      { id: 'A', text: 'Repair the actuator with spare parts (2 materials).', run(g) { if (g.res.materials >= 2) { addRes(g, 'materials', -2 * bonuses(g).repair); return R('perfect', 'A proper repair keeps the rover available for emergencies.', 'Rover repaired. -2 materials.'); } g.flags.roverBroken = true; return R('wrong', 'Not enough materials.', 'The rover is out of action.'); } },
      { id: 'B', text: 'Leave the rover and work on foot.', run(g) { g.flags.roverBroken = true; return R('acceptable', 'You save materials but lose the rover suit-air refill.', 'The rover refill is no longer available.'); } },
      { id: 'C', text: 'Drive it anyway to see what happens.', run(g) { g.flags.roverBroken = true; addRes(g, 'battery', -4); return R('wrong', 'Forcing a stalled actuator damages the drive train.', '-4% energy.'); } },
      { id: 'D', text: 'Strip a small part from the rover and restart it.', run(g) { addRes(g, 'materials', 1); return R('good', 'Cannibalising parts is clever, but it leaves the rover weaker.', '+1 material.'); } },
    ],
    science: 'Rovers extend the reach of astronauts. Mission planners carry spare parts and design vehicles so that crews can repair them in the field with simple tools.',
  },
};

/** Build the on-screen view of an event (React renders this). */
export function eventView(g) {
  const ev = EVENTS[g.event.id];
  return {
    id: ev.id, name: ev.name, icon: ev.icon, alert: ev.alert, problem: ev.problem(g), hint: ev.hint,
    choices: choicesInOrder(g).map((c, i) => ({ id: c.id, letter: LETTERS[i], text: c.text })), remaining: g.event.left, total: g.event.total,
  };
}

// ---- randomised answer positions ------------------------------------------------------------------
// The authored choices keep their ids (A-D) internally so grading never changes. Each time a decision starts the
// displayed order is shuffled, and the best answer is placed using a per-mission bag so it lands on A, B, C and D evenly.
export const LETTERS = ['A', 'B', 'C', 'D'];
const rnd = (g) => (typeof g.rng === 'function' ? g.rng() : Math.random());
function shuffled(arr, g) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(g) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
/** Grade of every choice, found by dry-running it on a copy of the state (the real state is never touched). */
export function gradeChoices(g, ev) {
  return ev.choices.map((c) => {
    try {
      const copy = JSON.parse(JSON.stringify(g, (k, v) => (typeof v === 'function' ? undefined : v)));
      copy.level = g.level; copy.event = null; copy.rng = undefined;
      return GRADE_ORDER.indexOf(c.run(copy).grade);
    } catch { return 3; }
  });
}
export function makeOrder(g, ev) {
  const n = ev.choices.length;
  const grades = gradeChoices(g, ev);
  let best = 0; grades.forEach((v, i) => { if (v < grades[best]) best = i; });
  g.shuffleBag = g.shuffleBag || [];
  g.shuffleBag = g.shuffleBag.filter((p) => p < n);
  if (!g.shuffleBag.length) g.shuffleBag = shuffled([...Array(n).keys()], g);
  const pos = g.shuffleBag.shift();
  const others = shuffled(ev.choices.map((_, i) => i).filter((i) => i !== best), g);
  const order = new Array(n);
  order[pos] = best;
  for (let p = 0, k = 0; p < n; p++) if (p !== pos) order[p] = others[k++];
  g.bestPositions = g.bestPositions || [];
  g.bestPositions.push(pos);
  return order;
}
function choicesInOrder(g) {
  const ev = EVENTS[g.event.id];
  const order = g.event.order || ev.choices.map((_, i) => i);
  return order.map((i) => ev.choices[i]);
}

const ON_START = {
  water_leak: (g) => { g.status.water_leak = true; },
  o2_leak: (g) => { g.status.o2_leak = true; },
  temp_failure: (g) => { if (g.sys.thermal.st === 'ok') g.sys.thermal.st = 'broken'; g.flags.thermalFailed = true; },
  comm_failure: (g) => { g.status.comm_down = true; g.flags.commFailed = true; },
  astronaut_injury: (g) => {
    hurt(g, 12, 'injury'); g.status.injured = true;
  },
};
export function startEvent(g, id, timer) {
  const ev = EVENTS[id];
  if (!ev || g.event) return false;
  g.flags['seen_' + id] = true;
  ON_START[id]?.(g);
  const base = (timer || ev.timer || CFG.decisionSeconds) * g.diff.dec * g.level.timerMul * bonuses(g).timer;
  g.event = { id, state: 'decision', left: base, total: base, result: null, order: null };
  g.event.order = makeOrder(g, ev);
  g.phase = 'decision';
  emit(g, 'alarm');
  return true;
}

export function resolveEvent(g, choiceId) {
  const e = g.event;
  if (!e || e.state !== 'decision') return null;
  const ev = EVENTS[e.id];
  const timedOut = choiceId === null;
  const choice = timedOut ? ev.choices[ev.choices.length - 1] : ev.choices.find((c) => c.id === choiceId);
  const before = { ...g.res, oxygen: g.oxygen, o2res: g.o2res, health: g.health };
  let { grade, why, consequence } = choice.run(g);
  if (timedOut) {
    grade = GRADE_ORDER[Math.min(GRADE_ORDER.length - 1, GRADE_ORDER.indexOf(grade) + 1)];
    why = `You ran out of time, so the crew carried on as normal. ${why}`;
  }
  const after = { ...g.res, oxygen: g.oxygen, o2res: g.o2res, health: g.health };
  let loss = 0;
  for (const k of Object.keys(before)) loss += Math.max(0, before[k] - after[k]);
  const rec = { id: ev.id, name: ev.name, icon: ev.icon, choice: choice.text, grade, why, consequence, science: ev.science, timedOut, at: g.time, loss: Math.round(loss) };
  g.decisions.push(rec);
  e.state = 'result'; e.result = rec;
  g.stats.eventsResolved[ev.id] = grade;
  emit(g, grade === 'perfect' || grade === 'good' ? 'clear' : 'warn');
  rec.crisis = crisisAfterDecision(g, ev.id, grade) ? g.crisis.id : null;
  rec.crisisName = rec.crisis ? CRISES[rec.crisis].name : null;
  return rec;
}

export function tickEvent(g, dt) {
  const e = g.event;
  if (!e || e.state !== 'decision') return;
  e.left -= dt;
  if (e.left <= 0) resolveEvent(g, null);
}

export function continueEvent(g) {
  const e = g.event;
  if (!e || e.state !== 'result') return;
  g.event = null; g.phase = 'playing';
  toast(g, e.result.consequence || 'Decision applied.', e.result.grade === 'wrong' ? 'bad' : 'good', e.result.name, 5);
}
