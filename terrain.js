// Lunar terrain as a pure height function so rendering AND collision/walking share the same ground.
import { makeNoise, mulberry32, smoothstep } from './math.js';

let N1 = makeNoise(1337);
let N2 = makeNoise(99);
let RELIEF = 1;           // large-scale relief multiplier
let planetName = 'moon';

export const BASE_FLAT_R = 44;      // dead-flat landing site / outpost
export const BASE_BLEND_R = 100;    // terrain fades back to natural relief by here
export const WORLD_RADIUS = 640;    // walkable radius (mountains rise beyond it)

function makeCraters(planet) {
  const mars = planet === 'mars';
  const rnd = mulberry32(mars ? 515 : 2024);
  const list = mars ? [
    { x: 240, z: -200, r: 90, d: 7 },
    { x: -260, z: 160, r: 64, d: 5 },
    { x: 90, z: 150, r: 26, d: 2.4 },
  ] : [
    { x: -210, z: -170, r: 72, d: 10 },
    { x: 270, z: 190, r: 58, d: 8 },
    { x: -130, z: 250, r: 40, d: 6 },
    { x: 160, z: -260, r: 46, d: 7 },
    { x: 60, z: 130, r: 22, d: 3.4 },
    { x: -95, z: -80, r: 18, d: 2.8 },
  ];
  for (let i = 0; i < (mars ? 38 : 90); i++) {
    const ang = rnd() * Math.PI * 2;
    const dist = 80 + rnd() * 520;
    const r = 3 + Math.pow(rnd(), 2.2) * 24;
    list.push({ x: Math.cos(ang) * dist, z: Math.sin(ang) * dist, r, d: r * (mars ? 0.06 + rnd() * 0.05 : 0.1 + rnd() * 0.08) });
  }
  return list;
}
export const craters = makeCraters('moon');
export const getPlanet = () => planetName;
/** Switch terrain parameters between the Moon (sharp craters, bare) and Mars (rolling dunes, shallow craters). */
export function setTerrainPlanet(planet) {
  planetName = planet === 'mars' ? 'mars' : 'moon';
  N1 = makeNoise(planetName === 'mars' ? 4242 : 1337); N2 = makeNoise(planetName === 'mars' ? 17 : 99);
  RELIEF = planetName === 'mars' ? 1.35 : 1;
  craters.length = 0; craters.push(...makeCraters(planetName));
}

function craterOffset(dist, r, d) {
  const t = dist / r;
  if (t > 1.9) return 0;
  const bowl = t < 1 ? -d * (1 - t * t) : 0;
  const rim = 0.2 * d * Math.exp(-(((t - 1.07) / 0.2) ** 2));
  const ejecta = t > 1.2 ? 0.05 * d * Math.exp(-(t - 1.2) * 2.4) : 0;
  return bowl + rim + ejecta;
}

function rawHeight(x, z) {
  let h = N1.fbm(x * 0.004, z * 0.004, 4) * 15 * RELIEF
        + (planetName === 'mars' ? Math.sin(x * 0.045 + N1.noise(x * 0.01, z * 0.01) * 5) * Math.cos(z * 0.03) * 1.1 : 0)
        + N1.fbm(x * 0.02 + 50, z * 0.02, 4) * 2.4
        + N2.fbm(x * 0.12, z * 0.12, 3) * 0.4
        + N2.noise(x * 0.55, z * 0.55) * 0.06;
  for (let i = 0; i < craters.length; i++) {
    const c = craters[i];
    const dx = x - c.x, dz = z - c.z;
    const lim = c.r * 1.9;
    if (dx > lim || dx < -lim || dz > lim || dz < -lim) continue;
    h += craterOffset(Math.hypot(dx, dz), c.r, c.d);
  }
  const r = Math.hypot(x, z);
  const m = smoothstep(560, 960, r);
  if (m > 0) {
    const ridge = 1 - Math.abs(N1.fbm(x * 0.0026 + 7, z * 0.0026 + 3, 5));
    h += m * (35 + 260 * ridge * ridge * ridge) + smoothstep(900, 1700, r) * 160;
  }
  return h;
}

/** Ground height (metres) at world x,z. The outpost site is exactly level (y = 0). */
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const blend = smoothstep(BASE_FLAT_R, BASE_BLEND_R, r);
  if (blend <= 0) return 0;
  return rawHeight(x, z) * blend;
}

/** Local crater floor / rim info for colouring: >0 near rims, <0 inside bowls. */
export function craterFactor(x, z) {
  let f = 0;
  for (let i = 0; i < craters.length; i++) {
    const c = craters[i];
    const dx = x - c.x, dz = z - c.z;
    const lim = c.r * 1.5;
    if (dx > lim || dx < -lim || dz > lim || dz < -lim) continue;
    const t = Math.hypot(dx, dz) / c.r;
    if (t < 0.95) f = Math.min(f, -(1 - t));
    else f = Math.max(f, Math.exp(-(((t - 1.08) / 0.25) ** 2)));
  }
  return f;
}
