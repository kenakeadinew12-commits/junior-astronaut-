// Survival crises: a wrong decision (or a scripted failure) can start an emergency that gets worse in three stages
// and ends the mission if the player does not solve it in time. Pure simulation, no rendering, unit-tested in Node.
//
//   triggerCrisis(g, id, cause)  - start (or escalate) a crisis
//   crisisStep(g, dt)            - apply its effects, escalate it, resolve it, or return a failure reason
//   crisisView(g)                - numbers for the HUD banner
//   crisisTarget(g)              - compass target for the emergency task
import { toast, say, emit } from './core.js';
import { clamp } from './math.js';
import { refillStation, leaks, equipment, battery, rooms } from './world.js';

const pt = (x, z, label) => ({ x, z, label });
const STAGE_MUL = [1, 1.7, 2.6];            // how much worse the effect gets at each stage
const STAGE_SECONDS = 30;                   // base seconds per stage, scaled by the level's timer multiplier

/** Each crisis: what goes wrong, what the player must do, and what happens if they do not. */
export const CRISES = {
  suit_breach: {
    name: 'Suit breach', icon: '🫁', alert: 'SUIT OXYGEN IS FALLING FAST',
    task: 'Run to the Oxygen Refill Station and refill your suit (hold E)',
    fail: 'suit_breach',
    stageText: ['A micro-leak in your suit is venting oxygen.', 'The leak is widening. Oxygen is falling much faster.', 'FINAL WARNING: your suit is nearly empty.'],
    target: () => pt(refillStation.x, refillStation.z, 'Oxygen Refill Station (emergency)'),
    start(g) { g.flags.crisisSuit = g.oxygen; if (g.o2res < 30) g.o2res = 30; },
    effect(g, dt, mul) { g.oxygen = clamp(g.oxygen - 0.45 * mul * dt, 0, 100); },
    done: (g) => g.oxygen >= 97 && g.zone !== 'outside' && g.time - (g.crisis?.t0 ?? 0) > 3,
  },
  o2_runaway: {
    name: 'Hull breach', icon: '💨', alert: 'HABITAT AIR IS ESCAPING',
    task: 'Seal the hull breach on the habitat wall (hold E, uses materials)',
    fail: 'decompression',
    stageText: ['Air is escaping through the breach.', 'The breach is tearing wider. Air loss is doubling.', 'FINAL WARNING: the habitat is about to lose its air.'],
    target: () => pt(leaks.o2.x, leaks.o2.z + 1.8, 'Hull breach (emergency)'),
    start(g, c) { g.status.o2_leak = true; needMaterials(g, 2); },
    effect(g, dt, mul) { g.o2res = clamp(g.o2res - 0.35 * mul * dt, 0, 100); },
    done: (g) => !g.status.o2_leak,
  },
  water_burst: {
    name: 'Burst water line', icon: '🚰', alert: 'WATER IS DRAINING AWAY',
    task: 'Seal the burst water pipe in the habitat (hold E, uses materials)',
    fail: 'dehydration',
    stageText: ['A water line has failed and the tank is draining.', 'The pipe is splitting. Water loss is doubling.', 'FINAL WARNING: the water tank is almost empty.'],
    target: () => pt(leaks.water.x, leaks.water.z + 1.8, 'Burst pipe (emergency)'),
    start(g) { g.status.water_leak = true; needMaterials(g, 2); },
    effect(g, dt, mul) { g.res.water = clamp(g.res.water - 0.4 * mul * dt, 0, 100); },
    done: (g) => !g.status.water_leak,
  },
  heat_loss: {
    name: 'Heating failure', icon: '🥶', alert: 'HABITAT IS FREEZING',
    task: 'Repair the thermal control unit in the habitat (hold E, uses materials)',
    fail: 'freeze',
    stageText: ['The heater is down and the habitat is cooling.', 'It is getting dangerously cold inside.', 'FINAL WARNING: the cold is about to become fatal.'],
    target: () => pt(equipment.thermal.x, equipment.thermal.z, 'Thermal unit (emergency)'),
    start(g) { if (g.sys.thermal.st !== 'absent') g.sys.thermal.st = 'broken'; g.flags.thermalFailed = true; needMaterials(g, 3); },
    effect(g, dt, mul) { g.temp = clamp(g.temp - 0.22 * mul * dt, -120, 60); },
    done: (g) => g.sys.thermal.st === 'ok',
  },
  radiation_spike: {
    name: 'Radiation spike', icon: '☢️', alert: 'DEADLY RADIATION OUTSIDE SHELTER',
    task: 'Get inside the habitat or radiation shelter and stay there',
    fail: 'radiation',
    stageText: ['Radiation is surging. Get under cover.', 'The dose rate is climbing. Every second outside counts.', 'FINAL WARNING: a lethal dose is building.'],
    target: (g) => (g.zone === 'outside' ? pt(rooms[1].cx, rooms[1].cz + rooms[1].d / 2, 'Radiation Shelter (emergency)') : null),
    start(g) { g.crisis.safeFor = 0; },
    effect(g, dt, mul) { g.stormRate += 700 * mul; },
    done: (g) => (g.crisis.safeFor || 0) >= 6,
    tick(g, dt) { g.crisis.safeFor = g.zone !== 'outside' ? (g.crisis.safeFor || 0) + dt : 0; },
  },
  power_collapse: {
    name: 'Power collapse', icon: '⚡', alert: 'BATTERY IS DRAINING FAST',
    task: 'Go to the battery bank and isolate the shorted cell (hold E)',
    fail: 'power_loss',
    stageText: ['A shorted cell is draining the battery.', 'The short is spreading. Energy is vanishing.', 'FINAL WARNING: the battery is about to go flat.'],
    target: () => pt(battery.x - 1.4, battery.z, 'Battery bank (emergency)'),
    start() {},
    effect(g, dt, mul) { if (g.breaker) g.res.battery = clamp(g.res.battery - 0.5 * mul * dt, 0, 100); },
    done: (g) => !!g.crisis?.isolated,
  },
};

/** Make sure the emergency repair is possible: issue spare parts from the lander locker if the player has none. */
function needMaterials(g, n) {
  if (g.res.materials < n) {
    const add = n - Math.floor(g.res.materials);
    g.res.materials += add;
    g.crisis.sparesIssued = add;
  }
}

const scale = (g) => (g.level.timerMul || 1) * (g.diff?.limit ? Math.min(1.15, Math.max(0.85, g.diff.limit)) : 1);
export const stageSeconds = (g) => STAGE_SECONDS * scale(g);

/** Start a crisis. A second one while one is running makes the first worse instead of stacking. Returns true if something started or escalated. */
export function triggerCrisis(g, id, cause = '') {
  const def = CRISES[id];
  if (!def || g.phase === 'success' || g.phase === 'failure') return false;
  if (g.crisis) {
    if (g.crisis.id === id) return false;
    escalate(g, `Another failure compounds the ${CRISES[g.crisis.id].name.toLowerCase()}!`);
    return true;
  }
  g.crisis = { id, stage: 0, t: 0, stageT: 0, t0: g.time, cause, isolated: false };
  def.start(g);
  g.crisisLog = g.crisisLog || [];
  g.crisisLog.push({ id, cause, startedAt: Math.round(g.time), outcome: 'active', stage: 1 });
  toast(g, `${def.alert}. ${def.task}.`, 'bad', `EMERGENCY: ${def.name}`, 9);
  say(g, 'crisis_' + id, 'ctrl', `Emergency! ${def.stageText[0]} ${def.task}.`, 0);
  emit(g, 'alarm');
  return true;
}

function escalate(g, text) {
  const c = g.crisis, def = CRISES[c.id];
  if (c.stage >= 2) return;
  c.stage += 1; c.stageT = 0;
  const log = g.crisisLog?.[g.crisisLog.length - 1]; if (log) log.stage = c.stage + 1;
  toast(g, `${text ? text + ' ' : ''}${def.stageText[c.stage]}`, 'bad', `ESCALATION ${c.stage + 1}/3: ${def.name}`, 8);
  say(g, `crisis_${c.id}_${c.stage}`, 'ctrl', `${def.stageText[c.stage]} ${def.task}.`, 0);
  emit(g, 'alarm');
}

export function resolveCrisis(g, how = 'solved') {
  const c = g.crisis; if (!c) return;
  const def = CRISES[c.id];
  const log = g.crisisLog?.[g.crisisLog.length - 1];
  if (log) { log.outcome = 'resolved'; log.seconds = Math.round(c.t); log.stage = c.stage + 1; }
  g.stats.crisesSolved = (g.stats.crisesSolved || 0) + 1;
  g.crisis = null;
  toast(g, `${def.name} under control. Check your supplies: the damage was real.`, 'good', 'Emergency resolved', 7);
  say(g, 'crisis_ok_' + c.id, 'ctrl', `Good work. The ${def.name.toLowerCase()} is under control. Recover your supplies.`, 0);
  emit(g, 'clear');
}

/** Called every simulation step (before the body/resource updates so the extra drain counts). Returns a failure reason or null. */
export function crisisStep(g, dt) {
  const c = g.crisis; if (!c) return null;
  const def = CRISES[c.id];
  c.t += dt; c.stageT += dt;
  def.tick?.(g, dt);
  if (def.done(g)) { resolveCrisis(g); return null; }
  def.effect(g, dt, STAGE_MUL[c.stage]);
  if (c.stageT >= stageSeconds(g)) {
    if (c.stage >= 2) {
      const log = g.crisisLog?.[g.crisisLog.length - 1]; if (log) log.outcome = 'failed';
      return def.fail;
    }
    escalate(g, '');
  }
  return null;
}

/** HUD numbers. */
export function crisisView(g) {
  const c = g.crisis; if (!c) return null;
  const def = CRISES[c.id], len = stageSeconds(g);
  const total = len * 3, elapsed = c.stage * len + c.stageT;
  return { id: c.id, name: def.name, icon: def.icon, alert: def.alert, stage: c.stage + 1, stages: 3, text: def.stageText[c.stage], task: def.task, left: Math.max(0, total - elapsed), total, stageLeft: Math.max(0, len - c.stageT) };
}
export function crisisTarget(g) { const c = g.crisis; return c ? CRISES[c.id].target(g) : null; }
export const isolateBattery = (g) => { if (g.crisis?.id === 'power_collapse') g.crisis.isolated = true; };

/** Which crisis (if any) a bad decision starts. Only 'wrong' grades (and timeouts, which are graded down) can cause one. */
export const CRISIS_FOR_EVENT = {
  resource_discovery: 'suit_breach', o2_leak: 'o2_runaway', water_leak: 'water_burst', temp_failure: 'heat_loss',
  solar_storm: 'radiation_spike', battery_failure: 'power_collapse', equipment_overload: 'power_collapse',
  low_sunlight: 'power_collapse', dust_storm: 'power_collapse', panel_dust: 'power_collapse',
};
export function crisisAfterDecision(g, eventId, grade) {
  const id = CRISIS_FOR_EVENT[eventId];
  if (id && grade === 'wrong') return triggerCrisis(g, id, eventId);
  return false;
}
