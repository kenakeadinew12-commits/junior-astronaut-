// Shared tuning numbers + small helpers used by the simulation, events and companion.
// (No DOM / Three here: everything is unit-testable in Node.)
import { clamp } from './math.js';

export const CFG = {
  drainOutside: 0.16,        // suit oxygen %/s outside
  sprintDrainMult: 1.5,
  drainShelter: 0.04,
  drainHabitatNoAir: 0.05,   // habitat reserve empty: you are on suit air
  refillHabitat: 2.2,        // suit refill %/s inside the habitat
  refillCostPerPct: 0.12,    // habitat O2 reserve used per suit % refilled
  refillRover: 35,
  hypoxiaDamage: 4,
  // crew consumption per second (percent of a full store)
  crewWater: 0.045, crewFood: 0.028, crewO2: 0.09,
  recyclerRecovery: 0.85,    // share of crew water that the powered recycler gives back
  o2genOut: 0.28, o2genWater: 0.02,
  greenhouseFood: 0.05, greenhouseO2: 0.06, greenhouseWater: 0.015,
  scrubRate: 1.0, co2Rise: 0.35,
  thermalGain: 0.08, thermalDrift: 0.0015, targetTemp: 21,
  deprivation: { water: 0.35, food: 0.12, cold: 0.3, heat: 0.3, co2: 0.4 },
  regen: 0.5,
  batteryRate: 0.04,         // battery % per second per kW of surplus
  arrayKw: 3.2,
  loads: { base: 1.0, o2gen: 2.2, scrubber: 1.0, recycler: 1.4, greenhouse: 3.0 },
  thermalLoad(ambient) { return 1.0 + Math.max(0, CFG.targetTemp - ambient) * 0.012; },   // colder outside = more heating power
  stormPeak: 2200,           // game-scaled radiation (uSv/h) of a storm at intensity 1
  stormDamagePerRate: 0.0012, stormFreeRate: 120,
  doseTimeScale: 60,         // 1 s of play = 1 min of mission time when integrating dose
  repairCost: 2, unitRepairCost: 3, deployCost: 6,
  decisionSeconds: 14,
};
export const SHIELD = { outside: 0, habitat: 0.55, shelter: 0.9 };

export const DIFF = {
  easy:   { id: 'easy',   label: 'Easy',         res: 1.25, sev: 0.7, drain: 0.8, dec: 1.4, limit: 1.3 },
  normal: { id: 'normal', label: 'Intermediate', res: 1.0,  sev: 1.0, drain: 1.0, dec: 1.0, limit: 1.0 },
  hard:   { id: 'hard',   label: 'Hard',         res: 0.8,  sev: 1.3, drain: 1.2, dec: 0.7, limit: 0.85 },
};

export const GRADE_ORDER = ['perfect', 'good', 'acceptable', 'wrong'];
export const GRADE_LABEL = { perfect: 'Perfect', good: 'Good', acceptable: 'Acceptable', wrong: 'Wrong' };
export const GRADE_POINTS = { perfect: 100, good: 75, acceptable: 45, wrong: 5 };
export const RES_KEYS = ['oxygen', 'o2res', 'water', 'food', 'battery', 'materials'];
export const RES_NAMES = { oxygen: 'Suit oxygen', o2res: 'Habitat oxygen', water: 'Water', food: 'Food', battery: 'Energy', materials: 'Materials' };

export function toast(g, text, kind = 'info', title = '', ttl = 6) {
  g.toasts.push({ id: g.nextToastId++, title, text, kind, ttl });
  while (g.toasts.length > 4) g.toasts.shift();
}
export const emit = (g, type, id) => g.events.push({ type, id });

/** Companion / mission-control radio line. who: 'mate' | 'ctrl'. */
export function radio(g, who, text, ttl = 9) {
  const name = 'Mission Control (simulated)';
  if (g.radio.length && g.radio[g.radio.length - 1].text === text) return;
  g.radio.push({ id: g.nextRadioId++, who, name, text, ttl });
  while (g.radio.length > 3) g.radio.shift();
  emit(g, 'radio');
}
/** Say a line at most once per `cool` seconds per key. */
export function say(g, key, who, text, cool = 40) {
  const last = g.said[key];
  if (last !== undefined && g.time - last < cool) return;
  g.said[key] = g.time; radio(g, who, text);
}

const MAXV = { oxygen: 100, o2res: 100, water: 100, food: 100, battery: 100, materials: 99 };
/** Change a resource with a defined floor/ceiling rule and keep the gain/loss ledger for the report. */
export function addRes(g, key, delta) {
  const before = key === 'oxygen' || key === 'o2res' ? g[key] : g.res[key];
  const after = clamp(before + delta, 0, MAXV[key]);
  if (key === 'oxygen' || key === 'o2res') g[key] = after; else g.res[key] = after;
  const d = after - before;
  if (d > 0) g.stats.gain[key] = (g.stats.gain[key] || 0) + d; else if (d < 0) g.stats.loss[key] = (g.stats.loss[key] || 0) - d;
  return d;
}
export function hurt(g, amount, cause) {
  if (amount <= 0) return;
  g.health = clamp(g.health - amount, 0, 100);
  g.hurt = Math.max(g.hurt, 0.6); g.lastDamage = cause;
  g.stats.damage[cause] = (g.stats.damage[cause] || 0) + amount;
}
export function heal(g, amount) { g.health = clamp(g.health + amount, 0, 100); }

// ---- crew roles (from the original crew.json) ----------------------------------------
export const ROLES = {
  engineer:  { name: 'Engineer',  icon: '🛠️', ability: 'Field Repairs',     desc: 'Repairs cost 20% fewer materials.' },
  medic:     { name: 'Medic',     icon: '🩺', ability: 'Medical Training',  desc: 'Health recovers faster and treatments heal more.' },
  botanist:  { name: 'Botanist',  icon: '🌿', ability: 'Green Thumb',       desc: 'The greenhouse produces 25% more food and oxygen.' },
  geologist: { name: 'Geologist', icon: '🪨', ability: "Prospector's Eye",  desc: 'Samples give 30% more materials.' },
  commander: { name: 'Commander', icon: '🎖️', ability: 'Calm Under Pressure', desc: 'Emergency decisions get 20% more time.' },
};
export const TEAMMATES = [
  { id: 'okafor', name: 'Cmdr. Maya Okafor', role: 'commander', weight: 64, height: 168, bio: 'A veteran mission commander who stays calm when alarms go off.' },
  { id: 'marchetti', name: 'Dr. Leo Marchetti', role: 'medic', weight: 78, height: 181, bio: 'A flight surgeon who keeps the crew healthy and explains the biology.' },
  { id: 'tanaka', name: 'Eng. Aiko Tanaka', role: 'engineer', weight: 58, height: 163, bio: 'A systems engineer who can fix almost anything with the right parts.' },
  { id: 'reyes', name: 'Dr. Sofia Reyes', role: 'botanist', weight: 62, height: 170, bio: 'A plant scientist who grows food and oxygen in the greenhouse.' },
  { id: 'novak', name: 'Dr. Jan Novak', role: 'geologist', weight: 80, height: 183, bio: 'A geologist who finds the best samples and explains the terrain.' },
];
/** Combined specialty bonuses of the player's role and the teammate's role. */
export function bonuses(g) {
  const roles = [g.profile.role];
  const n = (r) => roles.filter((x) => x === r).length;
  return {
    repair: Math.pow(0.8, n('engineer')),
    sample: 1 + 0.3 * n('geologist'),
    garden: 1 + 0.25 * n('botanist'),
    heal: 1 + 0.5 * n('medic'),
    regen: 1 + 0.6 * n('medic'),
    timer: 1 + 0.2 * n('commander'),
  };
}
/** Educational weight: W = m * g (newtons) and the "kg-equivalent" a scale would show. */
export function weightOn(massKg, gravity) { return { newtons: massKg * gravity, kgEquiv: massKg * gravity / 9.81 }; }
