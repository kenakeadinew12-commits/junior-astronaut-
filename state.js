// Mission simulation for all seven levels: resources, power budget, temperature, radiation, events,
// objectives, scoring and the end-of-mission report. No rendering or DOM in here, so it is unit-tested in Node.
import data from './missionData.js';
import { clamp, smoothstep, angleDiff } from './math.js';
import { arrays, sampleSpots, interactableById, roomAt, START, rooms, configureWorld } from './world.js';
import { levelById, LEVELS, MAX_LEVEL } from './levels.js';
import {
  CFG, SHIELD, DIFF, GRADE_POINTS, GRADE_LABEL, RES_KEYS, RES_NAMES, toast, emit, radio, addRes, hurt, heal, bonuses, weightOn, TEAMMATES, ROLES, say,
} from './core.js';
import { startEvent, tickEvent, resolveEvent, continueEvent, eventView, EVENTS } from './events.js';
import { mateReact, mateWatch, hazardActive } from './companion.js';
import { crisisStep, crisisView, crisisTarget, triggerCrisis, isolateBattery, CRISES } from './crisis.js';
import { DEFAULT_PROFILE, sanitizeProfile } from './profile.js';

export { CFG, SHIELD, toast, GRADE_LABEL, RES_NAMES, eventView, hazardActive, crisisView, triggerCrisis };
export const LEVEL_LIST = LEVELS;
/** The refill station only counts for the mission objective when the suit is really below this level (a genuine top-up). */
export const REFILL_STATION_BELOW = 95;
/** Seconds a completely empty suit takes to fill at the station (holding E). Less empty = proportionally shorter. */
export const REFILL_SECONDS = 12;
const SYS_KEYS = ['o2gen', 'recycler', 'scrubber', 'thermal', 'greenhouse'];
export const SYS_NAMES = { o2gen: 'Oxygen generator', recycler: 'Water recycler', scrubber: 'CO₂ scrubber', thermal: 'Thermal control', greenhouse: 'Greenhouse' };
const cnt = (o, v) => Object.values(o).filter((x) => x === v).length;

// ---- creation ------------------------------------------------------------------------------------
/** Idle state used for the title screen. */
export function createGame() {
  return createMission(1, DEFAULT_PROFILE, 'normal', 'title');
}

export function createMission(levelId, profileIn = DEFAULT_PROFILE, difficulty = 'normal', phase = 'briefing') {
  const level = levelById(levelId);
  const profile = sanitizeProfile({ ...profileIn, difficulty });
  const diff = DIFF[profile.difficulty] || DIFF.normal;
  configureWorld(level.planet);
  const st = level.start, env = level.env;
  const sys = {};
  for (const k of SYS_KEYS) { const s = st.sys[k]; sys[k] = { st: s, on: s !== 'absent', powered: false, inspected: false }; }
  const arrState = {};
  for (const a of arrays) arrState[a.id] = st.arrays === 'broken' ? 'broken' : st.arrays === 'ok' ? 'ok' : (st.arrays[a.id] || 'ok');
  const mult = diff.res;
  const g = {
    phase, time: 0, level, planet: level.planet, env, diff, profile, sevMul: diff.sev * level.sev,
    player: { x: START.x, y: 0, z: START.z, vy: 0, vx: 0, vz: 0, yaw: START.yaw, pitch: 0, onGround: true, sprinting: false, moving: false },
    health: 100, oxygen: st.oxygen, o2res: Math.min(100, st.o2res * Math.min(1.15, mult)),
    res: { water: Math.min(100, st.water * mult), food: Math.min(100, st.food * mult), battery: Math.min(100, st.battery * Math.min(1.15, mult)), materials: Math.round(st.materials * mult) },
    co2: 6, temp: st.temp, dose: 0, radRate: env.baseRad, radRateBase: env.baseRad, stormRate: 0,
    sun: env.sun, ambient: env.ambient, batteryCap: 1, stormPowerPenalty: 0, rationUntil: 0, rationing: false, o2boostUntil: 0,
    metab: clamp(Math.pow(profile.weight / 70, 0.75), 0.8, 1.25),
    sys, arrays: arrState, dust: Object.fromEntries(arrays.map((a) => [a.id, st.dust])), breaker: st.breaker,
    status: {}, flags: {}, hazard: null, event: null,
    samples: Object.fromEntries(sampleSpots.map((s) => [s.id, false])), activeSamples: st.samples, collectedTotal: 0, consoleOpens: 0, roverUsed: false,
    objDone: {}, timelineDone: {}, tlArm: {},
    flows: { prod: 0, load: 0, net: 0 }, powerOnFor: 0, rate: {}, prev: null,
    decisions: [], toasts: [], nextToastId: 1, events: [], radio: [], nextRadioId: 1, said: {},
    hurt: 0, zone: 'outside', lastDamage: null, warned: {},
    stats: { gain: {}, loss: {}, flowGain: {}, flowLoss: {}, damage: {}, eventsResolved: {}, minOxygen: st.oxygen, minO2res: 100, minWater: 100, minFood: 100, minBattery: 100, minTemp: 99, maxTemp: -99, blackoutSeconds: 0, coldSeconds: 0, co2Seconds: 0, peakRad: 0 },
    failReason: null, end: null,
  };
  g.crisis = null; g.crisisLog = [];
  g.bon = bonuses(g);
  g.radio.push({ id: g.nextRadioId++, who: 'ctrl', name: 'Mission Control', text: `Mission ${level.id}: ${level.name}. Good luck, ${profile.name}.`, ttl: 9 });
  return g;
}

// ---- derived values ------------------------------------------------------------------------------
export const arraysOk = (g) => Object.values(g.arrays).filter((s) => s !== 'broken').length;
export const fmt1 = (v) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));
export function powerStatus(g) {
  const f = g.flows;
  return { on: g.breaker, prod: f.prod, load: f.load, net: f.net, battery: g.res.battery, cap: g.batteryCap * 100, blackout: g.breaker && g.res.battery <= 0.2 && f.prod < f.load * 0.99 };
}
export function objectives(g) {
  return g.level.objectives.map((o) => ({ id: o.id, text: o.text, progress: o.progress(g), done: !!g.objDone[o.id], optional: !!o.optional }));
}
export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---- interaction -----------------------------------------------------------------------------------
const repairCost = (g, base = CFG.repairCost) => Math.round(base * g.bon.repair * 10) / 10;
const holdMul = (g) => (g.rationing ? 1.25 : 1);
function active(g, it) {
  switch (it.kind) {
    case 'sample': return g.activeSamples.includes(it.id) && !g.samples[it.id];
    case 'unit': return g.sys[it.unit].st !== 'absent';
    case 'leak': return !!g.status[it.leak + '_leak'];
    case 'comm': return true;
    default: return true;
  }
}
export const isActive = active;

export function describeTarget(g, it) {
  const base = { id: it.id, tool: it.tool, hold: (it.hold || 0) * holdMul(g) };
  switch (it.kind) {
    case 'sample':
      return { ...base, text: g.planet === 'mars' ? 'Collect ice / regolith sample' : 'Collect regolith sample', enabled: true };
    case 'array': {
      const s = g.arrays[it.id];
      if (s === 'broken') {
        const c = repairCost(g);
        if (g.res.materials < c) return { ...base, text: 'Repair solar array', enabled: false, reason: `Needs ${fmt1(c)} materials (you have ${fmt1(g.res.materials)})` };
        return { ...base, text: `Repair solar array (${fmt1(c)} materials)`, enabled: true };
      }
      if (s === 'stowed') return { ...base, hold: 1.2, text: 'Redeploy solar array (also wipes off dust)', enabled: true };
      if (g.level.canStow && !(g.hazard && g.hazard.state === 'active')) return { ...base, hold: 1.2, text: 'Stow solar array (protect from storm)', enabled: true, alt: g.dust[it.id] > 0.12 ? 'clean' : null };
      if (g.dust[it.id] >= 0.12) return { ...base, hold: 1.6, text: `Clean dust off the array (${Math.round(g.dust[it.id] * 100)}% covered)`, enabled: true };
      return { ...base, text: 'Solar array: operational', enabled: false, info: true };
    }
    case 'breaker':
      if (g.breaker) return { ...base, text: 'Main breaker: power ON', enabled: false, info: true };
      if (arraysOk(g) < 1) return { ...base, text: 'Restore power', enabled: false, reason: 'No working solar array yet: repair at least one first' };
      return { ...base, text: 'Restore main power', enabled: true };
    case 'unit': {
      const sys = g.sys[it.unit], name = SYS_NAMES[it.unit];
      if (sys.st === 'broken') {
        const c = repairCost(g, CFG.unitRepairCost);
        if (g.res.materials < c) return { ...base, tool: 'wrench', hold: 2.4 * holdMul(g), text: `Repair ${name}`, enabled: false, reason: `Needs ${fmt1(c)} materials (you have ${fmt1(g.res.materials)})` };
        return { ...base, tool: 'wrench', hold: 2.4 * holdMul(g), text: `Repair ${name} (${fmt1(c)} materials)`, enabled: true };
      }
      if (sys.st === 'fault') return { ...base, text: `${name} is stuck: diagnose and restart`, enabled: true };
      if (!sys.inspected) {
        if (!g.breaker) return { ...base, text: `Inspect ${name}`, enabled: false, reason: 'Unit is offline: restore power first' };
        return { ...base, text: `Inspect ${name}`, enabled: true };
      }
      return { ...base, text: `${name}: ${sys.on ? 'running' : 'switched off'} (manage at the console)`, enabled: false, info: true };
    }
    case 'refill': {
      const o = Math.round(g.oxygen);
      if (g.o2res <= 4) return { ...base, text: 'OXYGEN REFILL STATION', enabled: false, reason: 'The habitat oxygen reserve is empty: repair the oxygen generator first' };
      if (g.oxygen >= REFILL_STATION_BELOW && !(g.refillSession && !g.refillSession.done)) return { ...base, text: `OXYGEN REFILL STATION: suit oxygen is ${o}% (work outside, then come back)`, enabled: false, info: true };
      return { ...base, hold: REFILL_SECONDS, continuous: true, text: `OXYGEN REFILL STATION: refill suit oxygen (${o}% \u2192 100%, about ${Math.max(1, Math.ceil((100 - g.oxygen) / 100 * REFILL_SECONDS))} s)`, enabled: true };
    }
    case 'console': return { ...base, text: 'Open the systems console', enabled: true };
    case 'rover':
      if (g.flags.roverBroken && !(g.status.comm_down && g.flags.roverRelay)) return { ...base, text: 'Rover: out of action', enabled: false, info: true };
      if (g.status.comm_down && g.flags.roverRelay) return { ...base, text: 'Use the rover radio as a relay', enabled: true };
      if (g.roverUsed) return { ...base, text: 'Rover oxygen tank: empty', enabled: false, info: true };
      return { ...base, text: 'Refill suit oxygen from the rover', enabled: true };
    case 'comm': {
      if (!g.status.comm_down) return { ...base, text: 'Comm dish: online', enabled: false, info: true };
      const c = repairCost(g);
      if (g.res.materials < c) return { ...base, text: 'Realign the comm dish', enabled: false, reason: `Needs ${fmt1(c)} materials (you have ${fmt1(g.res.materials)})` };
      return { ...base, text: `Realign the comm dish (${fmt1(c)} materials)`, enabled: true };
    }
    case 'battery': if (g.crisis?.id === 'power_collapse') return { ...base, text: 'EMERGENCY: isolate the shorted battery cell', enabled: true };
      return { ...base, text: g.flags.batteryChecked ? 'Battery bank: checked' : 'Check the battery bank', enabled: !g.flags.batteryChecked, info: !!g.flags.batteryChecked };
    case 'leak': {
      const c = repairCost(g);
      const nm = it.leak === 'water' ? 'burst pipe' : 'hull breach';
      if (g.res.materials < c) return { ...base, text: `Seal the ${nm}`, enabled: false, reason: `Needs ${fmt1(c)} materials (you have ${fmt1(g.res.materials)})` };
      return { ...base, text: `Seal the ${nm} (${fmt1(c)} materials)`, enabled: true };
    }
    case 'shelterbox': return { ...base, text: g.flags.shelterChecked ? 'Shelter supplies: checked' : 'Inspect the shelter supplies', enabled: !g.flags.shelterChecked, info: !!g.flags.shelterChecked };
    default: return { ...base, text: it.id, enabled: false };
  }
}

const UNIT_REPORT = {
  o2gen: () => 'The oxygen generator splits water into hydrogen and oxygen using electricity (electrolysis). It needs power AND water.',
  o2genMars: () => 'On Mars the oxygen unit splits carbon dioxide from the thin atmosphere (like NASA\'s MOXIE experiment), so it needs power but no water.',
  recycler: () => 'The water recycler cleans the crew\'s used water so most of it can be drunk again - the ISS recovers over 90%.',
  scrubber: () => 'Scrubber beds pull exhaled CO₂ out of the cabin air. Without it the crew would poison their own atmosphere, even with plenty of oxygen.',
  thermal: () => 'The thermal control unit moves heat around the habitat. With no air outside to carry heat away, temperature control is all about insulation and radiators.',
  greenhouse: () => 'The greenhouse grows food and makes oxygen from CO₂ with light - but it needs power and water.',
};

export function interact(g, it) {
  const d = describeTarget(g, it);
  if (!d.enabled) return d.reason ? (toast(g, d.reason, 'warn'), false) : false;
  switch (it.kind) {
    case 'sample': {
      g.samples[it.id] = true; g.collectedTotal += 1;
      const m = g.bon.sample;
      addRes(g, 'materials', m);
      if (g.planet === 'mars') addRes(g, 'water', 2.5);
      emit(g, 'collect', it.id);
      toast(g, `Sample secured (${g.collectedTotal} collected). Materials: ${fmt1(g.res.materials)}${g.planet === 'mars' ? '. Ice melted: +2.5% water' : ''}`, 'good', g.planet === 'mars' ? 'Ice / regolith sample' : 'Regolith sample', 3);
      break;
    }
    case 'array': {
      const s = g.arrays[it.id];
      if (s === 'broken') { addRes(g, 'materials', -repairCost(g)); g.arrays[it.id] = 'ok'; g.dust[it.id] = Math.min(g.dust[it.id], 0.2); emit(g, 'repair', it.id); toast(g, `Solar array ${it.id.slice(-1)} repaired. ${cnt(g.arrays, 'ok')}/${arrays.length} online.`, 'good', 'Repair complete', 4); }
      else if (s === 'stowed') { g.arrays[it.id] = 'ok'; g.dust[it.id] *= 0.4; emit(g, 'deploy', it.id); toast(g, `Array ${it.id.slice(-1)} redeployed and wiped (dust reduced).`, 'good', 'Solar array', 3); }
      else if (g.level.canStow && !(g.hazard && g.hazard.state === 'active')) { g.arrays[it.id] = 'stowed'; g.flags.stowedBest = Math.max(g.flags.stowedBest || 0, cnt(g.arrays, 'stowed')); emit(g, 'stow', it.id); toast(g, `Array ${it.id.slice(-1)} stowed flat (${cnt(g.arrays, 'stowed')}/3). It makes no power while stowed.`, 'info', 'Solar array', 4); }
      else { g.dust[it.id] = 0; emit(g, 'clean', it.id); toast(g, 'Panel cleaned: output restored.', 'good', 'Solar array', 3); }
      break;
    }
    case 'breaker':
      g.breaker = true; emit(g, 'power', it.id);
      toast(g, `Power restored. ${cnt(g.arrays, 'ok')} array${cnt(g.arrays, 'ok') === 1 ? '' : 's'} online. Life support is coming up.`, 'good', 'Main power', 5);
      break;
    case 'unit': {
      const sys = g.sys[it.unit], name = SYS_NAMES[it.unit];
      if (sys.st === 'broken') { addRes(g, 'materials', -repairCost(g, CFG.unitRepairCost)); sys.st = 'ok'; sys.inspected = true; emit(g, 'repair', it.id); toast(g, `${name} repaired and back online.`, 'good', 'Repair complete', 4); }
      else if (sys.st === 'fault') { sys.st = 'ok'; sys.inspected = true; emit(g, 'inspect', it.id); toast(g, `${name} restarted and running.`, 'good', 'Diagnostics', 4); }
      else { sys.inspected = true; emit(g, 'inspect', it.id); const k = it.unit === 'o2gen' && g.planet === 'mars' ? 'o2genMars' : it.unit; toast(g, UNIT_REPORT[k](), 'info', `${name}: nominal`, 9); }
      break;
    }
    case 'refill': {
      const before = g.oxygen;
      const fill = Math.min(100 - before, Math.max(0, g.o2res - 4) / CFG.refillCostPerPct);   // the air comes from the habitat reserve
      addRes(g, 'oxygen', fill); addRes(g, 'o2res', -fill * CFG.refillCostPerPct);
      if (fill > 0 && before < REFILL_STATION_BELOW) g.flags.refilled = true;
      emit(g, 'refill', it.id);
      toast(g, `Suit oxygen refilled to ${Math.round(g.oxygen)}% (+${Math.round(fill)}%). Habitat reserve: ${Math.round(g.o2res)}%.`, 'good', 'Oxygen refill station', 5);
      break;
    }
    case 'console': g.consoleOpens += 1; g.phase = 'console'; emit(g, 'console'); break;
    case 'rover':
      if (g.status.comm_down && g.flags.roverRelay) { g.status.comm_down = false; toast(g, 'Rover relay established: contact with mission control restored.', 'good', 'Communications', 5); }
      else { g.roverUsed = true; addRes(g, 'oxygen', CFG.refillRover); emit(g, 'refill', it.id); toast(g, `Suit oxygen topped up to ${Math.round(g.oxygen)}%.`, 'good', 'Rover tank', 4); }
      break;
    case 'comm': addRes(g, 'materials', -repairCost(g)); g.status.comm_down = false; emit(g, 'repair', it.id); toast(g, 'Dish realigned: link to mission control restored.', 'good', 'Communications', 5); break;
    case 'battery': if (g.crisis?.id === 'power_collapse') { isolateBattery(g); break; }
      g.flags.batteryChecked = true; toast(g, `Battery bank: ${Math.round(g.res.battery)}% charged, capacity ${Math.round(g.batteryCap * 100)}%. Batteries carry the base through the night and through storms.`, 'info', 'Battery bank', 9); break;
    case 'leak': addRes(g, 'materials', -repairCost(g)); g.status[it.leak + '_leak'] = false; emit(g, 'leakfix', it.id); toast(g, it.leak === 'water' ? 'Pipe sealed. The water leak has stopped.' : 'Breach sealed. Habitat oxygen is no longer escaping.', 'good', 'Repair complete', 4); break;
    case 'shelterbox': g.flags.shelterChecked = true; toast(g, 'Shelter checked: emergency air, water and a radiation dosimeter. Its thick walls and regolith shield block about 90% of storm radiation.', 'info', 'Radiation shelter', 9); break;
    default: return false;
  }
  return true;
}

// ---- console actions (phase 'console') -------------------------------------------------------------
/** Called every frame while the player holds E at the refill station. Returns the refill progress 0..1 of this session. */
export function refillStep(g, dt) {
  const ses = g.refillSession || (g.refillSession = { start: g.oxygen, done: false });
  if (ses.done) return 1;
  const fill = Math.min((100 / REFILL_SECONDS) * dt, 100 - g.oxygen, Math.max(0, g.o2res - 4) / CFG.refillCostPerPct);
  if (fill > 0) { addRes(g, 'oxygen', fill); addRes(g, 'o2res', -fill * CFG.refillCostPerPct); }
  const full = g.oxygen >= 99.9, empty = g.o2res <= 4.05;
  if (full || empty) {
    ses.done = true;
    if (ses.start < REFILL_STATION_BELOW && (full || g.oxygen - ses.start >= 5)) g.flags.refilled = true;
    emit(g, 'refill', 'refillstation');
    toast(g, full ? `Suit oxygen refilled to 100%. Habitat reserve: ${Math.round(g.o2res)}%. Back to work!` : `Reserve nearly empty: suit oxygen is ${Math.round(g.oxygen)}%. Repair the oxygen generator.`, full ? 'good' : 'warn', 'Oxygen refill station', 5);
  }
  return ses.start >= 99.9 ? 1 : clamp((g.oxygen - ses.start) / (100 - ses.start), 0, 1);
}
/** The player let go of E (or walked away): the oxygen gained so far is kept. */
export function refillEnd(g) { g.refillSession = null; }
export function closeConsole(g) { if (g.phase === 'console') g.phase = 'playing'; }
export function toggleSystem(g, k) {
  const s = g.sys[k];
  if (!s || s.st !== 'ok') return false;
  s.on = !s.on; return true;
}
export function toggleRation(g) { g.rationing = !g.rationing; toast(g, g.rationing ? 'Rationing ON: water and food use -40%, recovery and work speed slower.' : 'Rationing OFF.', 'info', 'Supplies', 4); return g.rationing; }
export function deploy(g, id) {
  const s = g.sys[id];
  const c = Math.round(CFG.deployCost * g.bon.repair * 10) / 10;
  if (!s || s.st !== 'absent' || !(g.level.start.deploy || []).includes(id)) return { ok: false, text: 'Not available on this mission.' };
  if (g.res.materials < c) return { ok: false, text: `Needs ${fmt1(c)} materials (you have ${fmt1(g.res.materials)}).` };
  addRes(g, 'materials', -c); s.st = 'ok'; s.on = true; s.inspected = false; g.flags.deployed = true; emit(g, 'deploy', id);
  toast(g, `${SYS_NAMES[id]} deployed (-${fmt1(c)} materials). It uses power - check the energy balance.`, 'good', 'Construction', 5);
  return { ok: true, text: 'Deployed.' };
}
export function consoleView(g) {
  const lines = RES_KEYS.map((k) => {
    const v = k === 'oxygen' ? g.oxygen : k === 'o2res' ? g.o2res : g.res[k];
    const r = g.rate[k] || 0;
    const t = r < -0.004 && k !== 'materials' ? v / -r : null;
    return { key: k, name: RES_NAMES[k], value: v, trend: r > 0.004 ? 'up' : r < -0.004 ? 'down' : 'flat', empty: t };
  });
  const loads = [{ k: 'base', name: 'Base electronics', kw: CFG.loads.base, on: g.breaker }];
  for (const k of SYS_KEYS) { const s = g.sys[k]; if (s.st === 'absent') continue; loads.push({ k, name: SYS_NAMES[k], kw: loadKw(g, k), on: s.on && s.st === 'ok', state: s.st, powered: s.powered, toggle: s.st === 'ok' }); }
  const canDeploy = (g.level.start.deploy || []).filter((id) => g.sys[id].st === 'absent').map((id) => ({ id, name: SYS_NAMES[id], cost: Math.round(CFG.deployCost * g.bon.repair * 10) / 10 }));
  return {
    lines, loads, canDeploy, power: powerStatus(g), rationing: g.rationing,
    env: { planet: g.env.name, gravity: g.env.gravity, sun: g.sun, ambient: g.ambient, temp: g.temp, rad: g.radRate, co2: g.co2, pressure: g.env.pressure, dayText: g.env.dayText, facts: g.env.facts },
    weight: weightOn(g.profile.weight, g.env.gravity), earthWeight: weightOn(g.profile.weight, 9.81), guidance: g.status.comm_down ? 'No link to mission control.' : g.level.hintFn(g),
  };
}
function loadKw(g, k) {
  if (k === 'thermal') return CFG.thermalLoad(g.ambient);
  if (k === 'o2gen') return CFG.loads.o2gen * (g.time < g.o2boostUntil ? 2 : 1);
  return CFG.loads[k] || 0;
}

// ---- compass target ----------------------------------------------------------------------------------
const nearestOf = (list, p) => list.reduce((best, c) => (!best || Math.hypot(c.x - p.x, c.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z) ? c : best), null);
export function nextTarget(g) {
  const p = g.player;
  const ct = crisisTarget(g);
  if (ct) return ct;
  if (g.status.comm_down && g.level.id >= 5) return null;
  if ((g.hazard?.state === 'active' && g.hazard.type === 'storm') || (g.event && g.event.id === 'solar_storm')) {
    if (g.zone !== 'outside') return null;
    const doors = rooms.map((r) => ({ x: r.cx, z: r.cz + r.d / 2, label: r.name }));
    return { ...nearestOf(doors, p), label: `${nearestOf(doors, p).label} (take cover)` };
  }
  const objs = g.level.objectives;
  for (const pass of [false, true]) {
    for (const o of objs) {
      if (g.objDone[o.id] || !o.target || !!o.optional !== pass) continue;
      const t = o.target(g);
      if (t) return t;
    }
  }
  return null;
}
export function bearingTo(g, t) {
  const p = g.player;
  const want = Math.atan2(-(t.x - p.x), -(t.z - p.z));   // yaw 0 faces -z; positive yaw turns left
  return { delta: angleDiff(p.yaw, want), dist: Math.hypot(t.x - p.x, t.z - p.z) };
}

// ---- the simulation step -------------------------------------------------------------------------------
function runTimeline(g) {
  if (g.phase !== 'playing') return;
  for (const t of g.level.timeline) {
    if (g.timelineDone[t.id]) continue;
    const ready = t.at !== undefined ? g.time >= t.at : t.when(g);
    if (!ready) continue;
    if (t.delay) { if (g.tlArm[t.id] === undefined) { g.tlArm[t.id] = g.time + t.delay; if (t.event === 'solar_storm') { toast(g, 'Particle event detected! Take cover now.', 'bad', 'Space weather', 6); emit(g, 'alarm'); radio(g, 'ctrl', 'Warning: solar particle event in seconds. Get to shelter.'); } } if (g.time < g.tlArm[t.id]) continue; }
    if (t.crisis) { if (g.event || g.crisis) continue; triggerCrisis(g, t.crisis, 'scripted'); g.timelineDone[t.id] = true; continue; }
    if (t.say) { radio(g, 'ctrl', t.say, 12); g.timelineDone[t.id] = true; continue; }
    if (g.event || g.phase !== 'playing') return;   // one decision at a time
    if (startEvent(g, t.event, t.timer)) { g.timelineDone[t.id] = true; t.run?.(g); return; }
  }
}

function updatePower(g, dt) {
  const f = g.flows;
  // sunlight: level schedule x hazards
  let sun = g.env.sun;
  if (g.level.sunset) { const [a, b] = g.level.sunset; sun *= 1 - smoothstep(a, b, g.time); }
  let amb = g.env.ambient - (g.level.sunset ? 45 * (1 - sun / g.env.sun) : 0);
  if (g.hazard && g.hazard.type === 'dust' && g.hazard.state === 'active') {
    const h = g.hazard, ramp = Math.min(smoothstep(0, 10, h.t), 1 - smoothstep(h.dur - 12, h.dur, h.t) * 0.9);
    sun *= 1 - (h.intensity > 1 ? 0.92 : 0.88) * ramp; amb -= 8 * ramp;
  }
  g.sun = sun; g.ambient = amb;
  // dust builds up (fast on Mars, faster in a dust storm)
  const dRate = (g.planet === 'mars' ? 0.0006 : 0.00012) * (g.hazard && g.hazard.type === 'dust' && g.hazard.state === 'active' ? 8 : 1);
  for (const id of Object.keys(g.dust)) if (g.arrays[id] === 'ok') g.dust[id] = Math.min(0.9, g.dust[id] + dRate * dt);
  // generation
  let prod = 0;
  if (g.breaker) for (const a of arrays) if (g.arrays[a.id] === 'ok') prod += CFG.arrayKw * (g.level.arrayScale || 1) * sun * (1 - g.dust[a.id] * 0.75) * (1 - g.stormPowerPenalty);
  // demand
  const want = [['base', CFG.loads.base]];
  for (const k of ['o2gen', 'scrubber', 'thermal', 'recycler', 'greenhouse']) { const s = g.sys[k]; if (s.st === 'ok' && s.on) want.push([k, loadKw(g, k)]); }
  const total = g.breaker ? want.reduce((a, [, kw]) => a + kw, 0) : 0;
  f.prod = prod; f.load = total; f.net = prod - total;
  for (const k of SYS_KEYS) g.sys[k].powered = false;
  if (!g.breaker) { g.powerOnFor = 0; g.res.battery = clamp(g.res.battery, 0, 100 * g.batteryCap); return; }
  g.powerOnFor += dt;
  const battery = g.res.battery;
  if (battery > 0.2 || prod >= total) {
    for (const [k] of want) if (k !== 'base') g.sys[k].powered = true;
    const before = g.res.battery;
    g.res.battery = clamp(g.res.battery + (prod - total) * CFG.batteryRate * dt, 0, 100 * g.batteryCap);
    if (g.res.battery < before) g.stats.flowLoss.battery = (g.stats.flowLoss.battery || 0) + before - g.res.battery; else g.stats.flowGain.battery = (g.stats.flowGain.battery || 0) + g.res.battery - before;
  } else {                                                // brownout: only what the arrays can carry, in priority order
    let avail = prod - CFG.loads.base;
    for (const [k, kw] of want) { if (k === 'base') continue; if (avail >= kw) { g.sys[k].powered = true; avail -= kw; } }
    g.res.battery = 0;
    g.stats.blackoutSeconds += dt;
    if (!g.warned.brown) { g.warned.brown = true; toast(g, 'Brownout! The battery is empty: only some systems have power.', 'bad', 'Power', 7); emit(g, 'warn'); }
  }
  if (g.res.battery > 12) g.warned.brown = false;
  g.res.battery = Math.min(g.res.battery, 100 * g.batteryCap);
}

function updateLife(g, dt) {
  const ration = (g.rationing || g.time < g.rationUntil) ? 0.6 : 1;
  const m = g.metab * g.diff.drain;
  const S = g.sys, r = g.res;
  const use = CFG.crewWater * m * ration * dt;
  r.water -= use;
  const frozen = g.temp < 0;
  if (S.recycler.powered && S.recycler.st === 'ok' && !frozen) r.water += use * CFG.recyclerRecovery;
  if (g.status.water_leak) r.water -= 0.10 * g.sevMul * dt;
  const boost = g.time < g.o2boostUntil ? 2 : 1;
  if (S.o2gen.powered && S.o2gen.st === 'ok') { g.o2res += CFG.o2genOut * boost * dt; if (g.planet !== 'mars') r.water -= CFG.o2genWater * boost * dt; }
  if (S.greenhouse.powered && S.greenhouse.st === 'ok' && g.temp > 3) {
    const gar = g.bon.garden, light = 0.4 + 0.6 * Math.min(1, g.sun);
    r.food += CFG.greenhouseFood * gar * light * dt; g.o2res += CFG.greenhouseO2 * gar * dt; r.water -= CFG.greenhouseWater * dt;
    g.flags.ghSeconds = (g.flags.ghSeconds || 0) + dt;
  }
  r.food -= CFG.crewFood * m * ration * dt;
  g.o2res -= CFG.crewO2 * m * (g.co2 > 60 ? 1.4 : 1) * dt;
  if (g.status.o2_leak) g.o2res -= 0.30 * g.sevMul * dt;
  if (S.scrubber.powered && S.scrubber.st === 'ok') g.co2 -= CFG.scrubRate * dt; else g.co2 += CFG.co2Rise * dt;
  g.co2 = clamp(g.co2, 3, 100);
  r.water = clamp(r.water, 0, 100); r.food = clamp(r.food, 0, 100); g.o2res = clamp(g.o2res, 0, 100);
  // temperature: the habitat drifts toward the outside, thermal control pulls it to 21 C
  g.temp += (g.ambient - g.temp) * CFG.thermalDrift * dt;
  if (S.thermal.powered && S.thermal.st === 'ok') g.temp += (CFG.targetTemp - g.temp) * CFG.thermalGain * dt;
  g.temp = clamp(g.temp, -120, 60);
}

function updateHazard(g, dt) {
  const h = g.hazard;
  g.stormRate = 0;
  if (!h || h.state !== 'active') return;
  if (h.startedAt === undefined) { h.startedAt = g.time; g.flags.stowedAtStorm = cnt(g.arrays, 'stowed'); g.flags.stowedBest = Math.max(g.flags.stowedBest || 0, g.flags.stowedAtStorm); emit(g, 'alarm'); toast(g, h.type === 'storm' ? 'Take cover! The habitat blocks about 55% of the radiation, the shelter about 90%.' : 'Dust storm: sunlight is fading. Conserve power.', 'bad', h.type === 'storm' ? 'Solar storm' : 'Dust storm', 7); }
  h.t += dt;
  if (h.type === 'storm') g.stormRate = CFG.stormPeak * h.intensity * smoothstep(0, 3, h.t);
  if (h.t >= h.dur) {
    h.state = 'over'; g.stormRate = 0;
    const note = g.level.onHazardEnd ? g.level.onHazardEnd(g) : '';
    toast(g, `${h.type === 'storm' ? 'Radiation is back to normal.' : 'The dust storm has passed.'} ${note}`.trim(), 'good', 'All clear', 7);
    emit(g, 'clear');
  }
}

function updateBody(g, dt) {
  const p = g.player;
  const zone = g.zone;
  // suit oxygen
  let o2 = g.oxygen;
  if (zone === 'outside') o2 -= CFG.drainOutside * g.diff.drain * g.metab * (p.sprinting ? CFG.sprintDrainMult : 1) * dt;
  else if (zone === 'habitat') {
    // Inside the habitat the suit is NOT refilled automatically (that used to snap oxygen back to 100% and skipped the
    // objective). Refilling needs a deliberate interaction at the Oxygen Refill Station (see interact 'refill').
    if (g.o2res <= 4) o2 -= CFG.drainHabitatNoAir * dt;
  } else o2 -= CFG.drainShelter * dt;
  g.oxygen = clamp(o2, 0, 100);
  // radiation
  const sh = SHIELD[zone];
  g.radRateBase = g.env.baseRad;
  g.radRate = (g.env.baseRad + g.stormRate) * (1 - sh);
  g.stats.peakRad = Math.max(g.stats.peakRad, g.radRate);
  g.dose += g.radRate * dt / CFG.doseTimeScale;
  let dmg = false;
  const rad = Math.max(0, g.radRate - CFG.stormFreeRate) * CFG.stormDamagePerRate * dt;
  if (rad > 0) { hurt(g, rad, 'radiation'); dmg = true; }
  if (g.oxygen <= 0) { hurt(g, CFG.hypoxiaDamage * dt, 'oxygen'); dmg = true; }
  if (g.res.water <= 0.01) { hurt(g, CFG.deprivation.water * dt, 'water'); dmg = true; }
  if (g.res.food <= 0.01) { hurt(g, CFG.deprivation.food * dt, 'food'); dmg = true; }
  if (zone === 'habitat') {
    if (g.temp < 5) { hurt(g, CFG.deprivation.cold * clamp((5 - g.temp) / 10, 0.2, 2) * dt, 'temperature'); dmg = true; g.stats.coldSeconds += dt; }
    else if (g.temp > 38) { hurt(g, CFG.deprivation.heat * clamp((g.temp - 38) / 10, 0.2, 2) * dt, 'temperature'); dmg = true; }
    if (g.co2 > 70) { hurt(g, CFG.deprivation.co2 * dt, 'co2'); dmg = true; g.stats.co2Seconds += dt; }
  }
  if (!dmg && zone !== 'outside' && g.res.water > 0 && g.res.food > 0 && g.health < 100) heal(g, CFG.regen * g.bon.regen * (g.rationing ? 0.5 : 1) * dt);
}

function warnings(g) {
  const w = (k, cond, reset, text, title = 'Warning') => { if (cond && !g.warned[k]) { g.warned[k] = true; toast(g, text, 'bad', title, 6); emit(g, 'warn'); } if (reset) g.warned[k] = false; };
  w('o2', g.oxygen < 25, g.oxygen > 45, 'Suit oxygen low: use the Oxygen Refill Station in the habitat (hold E) or the rover tank.');
  w('health', g.health < 35, g.health > 55, 'Health critical! Find shelter, air, warmth.');
  w('water', g.res.water < 15, g.res.water > 30, 'Water is running out: find the leak, run the recycler, ration.');
  w('food', g.res.food < 12, g.res.food > 25, 'Food is running low: the greenhouse needs power and light.');
  w('res', g.o2res < 15, g.o2res > 30, 'Habitat oxygen is low: repair the generator or seal leaks.');
  w('temp', g.temp < 5 && g.zone === 'habitat', g.temp > 9, 'The habitat is freezing. Restore heating.');
}

function trackStats(g, dt) {
  const s = g.stats;
  s.minOxygen = Math.min(s.minOxygen, g.oxygen); s.minO2res = Math.min(s.minO2res, g.o2res);
  s.minWater = Math.min(s.minWater, g.res.water); s.minFood = Math.min(s.minFood, g.res.food); s.minBattery = Math.min(s.minBattery, g.res.battery);
  s.minTemp = Math.min(s.minTemp, g.temp); s.maxTemp = Math.max(s.maxTemp, g.temp);
  // smoothed rate of change for the console forecast
  const cur = { oxygen: g.oxygen, o2res: g.o2res, water: g.res.water, food: g.res.food, battery: g.res.battery, materials: g.res.materials };
  if (g.prev) for (const k of RES_KEYS) { const inst = (cur[k] - g.prev[k]) / Math.max(dt, 1e-6); g.rate[k] = (g.rate[k] ?? inst) * 0.985 + inst * 0.015; }
  g.prev = cur;
  // flow ledger for the report (continuous changes only)
  if (g.prevFlow) for (const k of ['water', 'food']) { const d = cur[k] - g.prevFlow[k]; if (Math.abs(d) < 1) { if (d > 0) s.flowGain[k] = (s.flowGain[k] || 0) + d; else s.flowLoss[k] = (s.flowLoss[k] || 0) - d; } }
  g.prevFlow = cur;
}

function updateObjectives(g) {
  for (const o of g.level.objectives) if (!g.objDone[o.id] && o.done(g)) {
    g.objDone[o.id] = true;
    if (!o.optional || true) { toast(g, o.text, 'good', 'Objective complete', 4); emit(g, 'objective', o.id); }
  }
}
function missionWon(g) {
  if (g.level.win) return g.level.win(g);
  return g.level.objectives.filter((o) => !o.optional).every((o) => g.objDone[o.id]);
}

export function step(g, dt) {
  if (g.phase !== 'playing') return;
  const p = g.player;
  g.time += dt;
  const room = roomAt(p.x, p.z);
  g.zone = room ? room.id : 'outside';
  g.rationing = g.rationing && true;
  g.bon = g.bon || bonuses(g);
  runTimeline(g);
  if (g.phase !== 'playing') return;
  updatePower(g, dt);
  updateLife(g, dt);
  updateHazard(g, dt);
  const crisisFail = crisisStep(g, dt);
  if (crisisFail) return fail(g, crisisFail);
  updateBody(g, dt);
  trackStats(g, dt);
  warnings(g);
  updateObjectives(g);
  mateReact(g);
  mateWatch(g);
  g.hurt = Math.max(0, g.hurt - dt * 1.5);
  for (const t of g.toasts) t.ttl -= dt;
  g.toasts = g.toasts.filter((t) => t.ttl > 0);
  for (const r of g.radio) r.ttl -= dt;
  g.radio = g.radio.filter((r) => r.ttl > 0);
  // ---- end conditions ----
  if (g.health <= 0) return fail(g, g.lastDamage || 'health');
  const lf = g.level.failIf && g.level.failIf(g);
  if (lf) return fail(g, lf);
  if (g.time >= g.level.limit * g.diff.limit) return fail(g, 'time');
  if (missionWon(g)) return win(g);
}

/** Decisions pause the clock-driven simulation; the engine ticks the event timer separately. */
export function tickDecision(g, dt) { tickEvent(g, dt); }
export function chooseOption(g, id) { return resolveEvent(g, id); }
export function continueAfterDecision(g) { continueEvent(g); }

function fail(g, reason) { g.phase = 'failure'; g.failReason = reason; g.end = computeEnd(g, false); }
function win(g) { g.phase = 'success'; g.end = computeEnd(g, true); }

// ---- scoring + report -----------------------------------------------------------------------------------
const FAIL_TEXT = {
  radiation: 'Radiation exposure outside shelter pushed your health to zero (or you never reached cover during a radiation spike).',
  oxygen: 'Your suit oxygen ran out and stayed empty.',
  water: 'Dehydration: water ran out and stayed empty.',
  food: 'Starvation: food ran out and stayed empty.',
  temperature: 'The habitat got dangerously cold or hot.',
  co2: 'Carbon dioxide built up in the habitat air.',
  injury: 'An injury was left untreated.',
  health: data.failureReasons.health,
  suit_breach: 'A suit breach was never dealt with: your suit oxygen drained away because you did not get back to the refill station in time.',
  decompression: 'The hull breach was never sealed and the habitat lost its air.',
  dehydration: 'The burst water line was never sealed and the water ran out.',
  freeze: 'The heating failure was never repaired and the habitat froze.',
  power_loss: 'The shorted battery cell was never isolated and the base lost its power reserve.',
  time: 'Time ran out before the mission objectives were complete.',
  blackout: 'The base was without power for too long.',
};
const EXTRA_LESSONS = {
  mars_dust: { topic: 'Mars', text: 'Mars has a thin CO₂ atmosphere under 1% of Earth\'s pressure, yet winds can lift fine dust that dims the Sun for weeks. Dust storms are a major threat to solar-powered Mars missions.' },
  mars_isru: { topic: 'ISRU', text: 'In-situ resource utilisation means making oxygen from Martian CO₂ (as NASA\'s MOXIE did) and water from ice, instead of launching everything from Earth.' },
  gravity: { topic: 'Gravity', text: 'Weight is mass × gravity. The same astronaut weighs about 1/6 as much on the Moon and 38% as much on Mars - but their mass, and the energy they need, stay the same.' },
  triage: { topic: 'Triage', text: 'When you cannot fix everything, protect life first (air, water, heat), then power, then comfort. Engineers write a priority list before the emergency.' },
  rationing: { topic: 'Rationing', text: 'Rationing stretches supplies but costs recovery and performance. It is a trade-off, not a free fix.' },
};
const WEIGHTS = { crew: 0.20, life_support: 0.30, energy: 0.15, infrastructure: 0.10, efficiency: 0.05, objectives: 0.05, decisions: 0.15 };
const LABELS = { ...data.scoring.labels, decisions: 'Decision quality' };

export function computeEnd(g, success) {
  const s = g.stats, lvl = g.level;
  const objs = lvl.objectives;
  const req = objs.filter((o) => !o.optional), opt = objs.filter((o) => o.optional);
  const doneReq = req.filter((o) => g.objDone[o.id]).length, doneOpt = opt.filter((o) => g.objDone[o.id]).length;
  const presentSys = SYS_KEYS.filter((k) => g.sys[k].st !== 'absent');
  const comps = {
    crew: g.health,
    life_support: 100 * 0.25 * (clamp(s.minOxygen / 50, 0, 1) + clamp(s.minO2res / 40, 0, 1) + clamp(s.minWater / 30, 0, 1) + clamp(s.minFood / 30, 0, 1)),
    energy: 100 * (1 - clamp(s.blackoutSeconds / 60, 0, 1)) * (0.5 + 0.5 * clamp(s.minBattery / 30, 0, 1)),
    infrastructure: 100 * (0.4 * arraysOk(g) / arrays.length + 0.4 * (presentSys.filter((k) => g.sys[k].st === 'ok').length / Math.max(1, presentSys.length)) + 0.2 * (g.status.water_leak || g.status.o2_leak ? 0 : 1)),
    efficiency: success ? clamp(1 - (g.time - lvl.par) / (lvl.par * 1.2), 0.1, 1) * 100 : 20,
    objectives: 100 * ((doneReq + 0.5 * doneOpt) / Math.max(1, req.length + 0.5 * opt.length)),
    decisions: g.decisions.length ? g.decisions.reduce((a, d) => a + GRADE_POINTS[d.grade], 0) / g.decisions.length : 70,
  };
  const wsum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  let score = Object.keys(WEIGHTS).reduce((a, k) => a + WEIGHTS[k] * comps[k], 0) / wsum;
  score = clamp(score + (g.diff.id === 'hard' ? 4 : g.diff.id === 'easy' ? -3 : 0), 0, 100);
  if (!success) score = Math.min(score, 59);
  const st = data.scoring.stars;
  const stars = !success ? 0 : score >= st.three && g.health >= st.three_min_health ? 3 : score >= st.two ? 2 : 1;
  const comp = Object.keys(WEIGHTS).map((k) => ({ key: k, label: LABELS[k], weight: WEIGHTS[k], score: Math.round(comps[k]) }));
  const sorted = [...comp].sort((a, b) => b.score - a.score);
  // best / most costly decisions
  const gp = (d) => GRADE_POINTS[d.grade];
  const best = g.decisions.length ? [...g.decisions].sort((a, b) => gp(b) - gp(a) || a.at - b.at)[0] : null;
  const worst = g.decisions.length ? [...g.decisions].sort((a, b) => gp(a) - gp(b) || b.loss - a.loss)[0] : null;
  const gains = {}, losses = {};
  for (const k of RES_KEYS) { gains[k] = Math.round((s.gain[k] || 0) + (s.flowGain[k] || 0)); losses[k] = Math.round((s.loss[k] || 0) + (s.flowLoss[k] || 0)); }
  const why = [];
  if (success) {
    why.push(`You completed all required objectives (${doneReq}/${req.length}${opt.length ? `, optional ${doneOpt}/${opt.length}` : ''}) in ${formatTime(g.time)}.`);
    if (s.blackoutSeconds < 5) why.push('You kept the base powered without a significant blackout.');
    if (g.health >= 80) why.push('You protected your health: radiation, air, water, heat and food stayed under control.');
  } else {
    why.push(FAIL_TEXT[g.failReason] || 'The mission ended.');
    if (s.blackoutSeconds > 20) why.push(`The base was without power for about ${Math.round(s.blackoutSeconds)} s.`);
    const hardest = g.decisions.filter((d) => d.grade === 'wrong');
    if (hardest.length) why.push(`${hardest.length} decision${hardest.length > 1 ? 's were' : ' was'} graded Wrong - see below.`);
  }
  const w = weightOn(g.profile.weight, g.env.gravity), wE = weightOn(g.profile.weight, 9.81);
  return {
    success, score: Math.round(score), stars, time: g.time, par: lvl.par, health: g.health,
    resources: { oxygen: g.oxygen, o2res: g.o2res, water: g.res.water, food: g.res.food, battery: g.res.battery, materials: g.res.materials },
    doseUSv: g.dose, peakRad: s.peakRad, minTemp: s.minTemp, maxTemp: s.maxTemp, sunNow: g.sun, planet: g.env.name, gravity: g.env.gravity,
    weightHere: w.newtons, weightEarth: wE.newtons, mass: g.profile.weight,
    components: comp, strongest: sorted[0], weakest: sorted[sorted.length - 1],
    decisions: g.decisions, best, worst, gains, losses, why, crises: (g.crisisLog || []).map((c) => ({ ...c, name: CRISES[c.id].name, icon: CRISES[c.id].icon, outcome: c.outcome === 'active' ? 'unresolved' : c.outcome })),
    reason: success ? null : g.failReason, reasonText: success ? null : FAIL_TEXT[g.failReason] || 'The mission ended.',
    lessons: pickLessons(g, success), level: lvl.id, levelName: lvl.name, difficulty: g.diff.label, hasNext: success && lvl.id < MAX_LEVEL,
  };
}

export function pickLessons(g) {
  const byId = { ...Object.fromEntries(data.lessons.map((l) => [l.id, l])), ...EXTRA_LESSONS };
  const ids = [];
  const stormGrade = g.decisions.find((d) => d.id === 'solar_storm')?.grade;
  if (stormGrade) ids.push(stormGrade === 'perfect' || stormGrade === 'good' ? 'radiation_good' : 'radiation_bad');
  if (g.stats.damage.radiation >= 40) ids.push('dose_adds_up');
  if (g.stats.minOxygen < 25) ids.push('oxygen_low');
  if (g.stats.blackoutSeconds > 5) ids.push('blackout');
  if (g.stats.minTemp < 3) ids.push('temperature');
  if (g.planet === 'mars') ids.push('mars_dust', 'mars_isru');
  if (g.decisions.some((d) => d.grade === 'wrong')) ids.push('triage');
  ids.push(...g.level.lessons, 'gravity');
  return [...new Set(ids)].map((id) => byId[id]).filter(Boolean).slice(0, 5).map((l) => ({ topic: l.topic, text: l.text }));
}
export { MAX_LEVEL, DIFF, TEAMMATES, ROLES, interactableById };
void START; void toast;
