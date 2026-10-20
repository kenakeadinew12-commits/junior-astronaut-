// Static world layout: structures, colliders, boulders and everything the player can interact with.
// Pure data (no rendering) so game logic, collision and the 3D engine all agree on positions.
import { mulberry32, norm3 } from './math.js';
import { heightAt, setTerrainPlanet } from './terrain.js';

export const WALL_T = 0.35;
export const SUN_DIR = norm3(0.7, 0.42, 0.55);       // direction TO the sun (low sun = long shadows)
export const EARTH_DIR = norm3(-0.42, 0.56, -0.72);  // direction TO Earth in the black sky
export const START = { x: 0, z: 26, yaw: 0 };

export const rooms = [
  { id: 'habitat', name: 'Habitat', cx: 0, cz: -6, w: 12, d: 8, h: 3.4, door: { side: 's', w: 2.4 }, shield: 0.55 },
  { id: 'shelter', name: 'Radiation Shelter', cx: 14, cz: -24, w: 6, d: 5, h: 2.6, door: { side: 's', w: 1.8 }, shield: 0.9 },
];
for (const r of rooms) {
  r.min = { x: r.cx - r.w / 2 + WALL_T, z: r.cz - r.d / 2 + WALL_T };
  r.max = { x: r.cx + r.w / 2 - WALL_T, z: r.cz + r.d / 2 - WALL_T };
}

export const arrays = [
  { id: 'array1', x: 26, z: -16 },
  { id: 'array2', x: 26, z: -6 },
  { id: 'array3', x: 26, z: 4 },
];

export const sampleSpots = [
  [-22, 14], [-34, -14], [-12, -34], [10, -46], [40, -30], [48, 6], [36, 32], [6, 44],
].map(([x, z], i) => ({ id: `sample${i + 1}`, x, z }));

// Interior equipment (x/z centre + size) -- used for both meshes and collision.
export const equipment = {
  o2gen: { x: 4.3, z: -8.8, sx: 1.8, sz: 1.6 },
  recycler: { x: 4.5, z: -5.2, sx: 1.4, sz: 2.2 },
  scrubber: { x: -4.0, z: -9.0, sx: 2.0, sz: 1.4 },
  desk: { x: 0, z: -9.2, sx: 3.0, sz: 0.9 },
  table: { x: -1.2, z: -5.0, sx: 1.8, sz: 0.9 },
  thermal: { x: 2.6, z: -9.3, sx: 0.9, sz: 0.7 },
};

// Oxygen refill station: just inside the habitat door (east of the door, back against the south wall, facing into the room).
export const refillStation = { x: 2.7, z: -2.85, sx: 0.9, sz: 0.7 };
export const greenhouse = { x: -24, z: -6, sx: 7, sz: 4.6 };
export const battery = { x: 19, z: -1, sx: 2.4, sz: 1.6 };
export const leaks = { water: { x: 5.2, y: 0.5, z: -7.1 }, o2: { x: -3.5, y: 1.4, z: -2.3 } };
export const shelterBox = { x: 14, y: 0.9, z: -26.0 };
export const rover = { x: -15, z: 9, sx: 3.2, sz: 2.0 };
export const tanks = [{ x: -12, z: -10, r: 1.1 }, { x: -12, z: -7.4, r: 1.1 }, { x: -12, z: -4.8, r: 1.1 }];
export const mast = { x: -9, z: -14, r: 0.35 };
export const lander = { x: -30, z: 24, r: 3.2 };

// ---- Interactables -----------------------------------------------------------
// kind decides behaviour in state.js; tool is the equipment the astronaut brings out.
// Sample positions are computed lazily because the terrain height depends on the planet.
const sampleInteractable = (s) => ({ id: s.id, kind: 'sample', tool: 'sampler', hold: 0.8, reach: 2.6, get pos() { return [s.x, heightAt(s.x, s.z) + 0.3, s.z]; } });
export const interactables = [
  ...sampleSpots.map(sampleInteractable),
  ...arrays.map((a) => ({ id: a.id, kind: 'array', tool: 'wrench', hold: 2.2, reach: 3.0, pos: [a.x - 2.0, 1.0, a.z] })),
  { id: 'breaker', kind: 'breaker', tool: null, hold: 0, reach: 2.4, pos: [-5.35, 1.3, -6.0] },
  { id: 'o2gen', kind: 'unit', unit: 'o2gen', tool: 'scanner', hold: 1.6, reach: 2.6, pos: [equipment.o2gen.x, 1.2, equipment.o2gen.z] },
  { id: 'recycler', kind: 'unit', unit: 'recycler', tool: 'scanner', hold: 1.6, reach: 2.6, pos: [equipment.recycler.x, 1.2, equipment.recycler.z] },
  { id: 'scrubber', kind: 'unit', unit: 'scrubber', tool: 'scanner', hold: 1.6, reach: 2.6, pos: [equipment.scrubber.x, 1.2, equipment.scrubber.z] },
  { id: 'thermal', kind: 'unit', unit: 'thermal', tool: 'scanner', hold: 1.6, reach: 2.4, pos: [equipment.thermal.x, 1.0, equipment.thermal.z] },
  { id: 'greenhouse', kind: 'unit', unit: 'greenhouse', tool: 'scanner', hold: 1.6, reach: 3.2, pos: [greenhouse.x + greenhouse.sx / 2 + 0.3, 1.2, greenhouse.z] },
  { id: 'refillstation', kind: 'refill', tool: null, hold: 1.5, reach: 2.8, pos: [refillStation.x, 1.1, refillStation.z] },
  { id: 'console', kind: 'console', tool: null, hold: 0, reach: 2.6, pos: [0, 1.2, -9.0] },
  { id: 'rover', kind: 'rover', tool: null, hold: 0, reach: 3.2, pos: [rover.x, 1.0, rover.z] },
  { id: 'comm', kind: 'comm', tool: 'wrench', hold: 2.0, reach: 3.0, pos: [mast.x, 1.4, mast.z + 0.8] },
  { id: 'batterybank', kind: 'battery', tool: 'scanner', hold: 1.4, reach: 3.0, pos: [battery.x - 1.4, 1.0, battery.z] },
  { id: 'waterleak', kind: 'leak', leak: 'water', tool: 'wrench', hold: 2.2, reach: 2.8, pos: [leaks.water.x, leaks.water.y, leaks.water.z] },
  { id: 'o2leak', kind: 'leak', leak: 'o2', tool: 'wrench', hold: 2.4, reach: 2.8, pos: [leaks.o2.x, leaks.o2.y, leaks.o2.z] },
  { id: 'shelterbox', kind: 'shelterbox', tool: 'scanner', hold: 1.2, reach: 2.8, pos: [shelterBox.x, shelterBox.y, shelterBox.z] },
];
export const interactableById = Object.fromEntries(interactables.map((i) => [i.id, i]));

// ---- Boulders + colliders (rebuilt when the planet changes; arrays are mutated in place) -------------
function makeBoulders(planet) {
  const rnd = mulberry32(planet === 'mars' ? 4711 : 777);
  const keepClear = [
    [START.x, START.z, 7], [0, -6, 12], [14, -24, 7], [rover.x, rover.z, 5], [lander.x, lander.z, 7],
    [-12, -7, 6], [mast.x, mast.z, 3], [26, -6, 17], [greenhouse.x, greenhouse.z, 6.5], [battery.x, battery.z, 4],
    ...sampleSpots.map((s) => [s.x, s.z, 5]),
  ];
  const out = [];
  let guard = 0;
  const want = planet === 'mars' ? 150 : 110;
  while (out.length < want && guard++ < 5000) {
    const ang = rnd() * Math.PI * 2;
    const dist = 16 + Math.pow(rnd(), 0.7) * 300;
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    const r = 0.6 + Math.pow(rnd(), 2.4) * 2.0;
    if (keepClear.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr + r)) continue;
    out.push({ x, z, r, seed: Math.floor(rnd() * 1e6) });
  }
  return out;
}
export const boulders = [];

function box(cx, cz, sx, sz) {
  return { type: 'box', minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2 };
}
function roomWalls(r) {
  const x0 = r.cx - r.w / 2, x1 = r.cx + r.w / 2, z0 = r.cz - r.d / 2, z1 = r.cz + r.d / 2, t = WALL_T;
  const out = [
    { type: 'box', minX: x0, maxX: x1, minZ: z0, maxZ: z0 + t },               // north
    { type: 'box', minX: x0, maxX: x0 + t, minZ: z0, maxZ: z1 },               // west
    { type: 'box', minX: x1 - t, maxX: x1, minZ: z0, maxZ: z1 },               // east
  ];
  const gx0 = r.cx - r.door.w / 2, gx1 = r.cx + r.door.w / 2;                 // south wall with a door gap
  out.push({ type: 'box', minX: x0, maxX: gx0, minZ: z1 - t, maxZ: z1 });
  out.push({ type: 'box', minX: gx1, maxX: x1, minZ: z1 - t, maxZ: z1 });
  return out;
}
export const colliders = [];
export function configureWorld(planet = 'moon') {
  setTerrainPlanet(planet);
  boulders.length = 0; boulders.push(...makeBoulders(planet));
  colliders.length = 0;
  colliders.push(
    ...rooms.flatMap(roomWalls),
    ...Object.values(equipment).map((e) => box(e.x, e.z, e.sx, e.sz)),
    box(rover.x, rover.z, rover.sx, rover.sz),
    box(refillStation.x, refillStation.z, refillStation.sx, refillStation.sz),
    box(greenhouse.x, greenhouse.z, greenhouse.sx, greenhouse.sz),
    box(battery.x, battery.z, battery.sx, battery.sz),
    ...arrays.map((a) => box(a.x, a.z, 2.4, 7.4)),
    ...tanks.map((t) => ({ type: 'circle', x: t.x, z: t.z, r: t.r })),
    { type: 'circle', x: mast.x, z: mast.z, r: mast.r },
    { type: 'circle', x: lander.x, z: lander.z, r: lander.r },
    ...boulders.filter((b) => b.r > 0.75).map((b) => ({ type: 'circle', x: b.x, z: b.z, r: b.r * 0.85 })),
  );
}
configureWorld('moon');

export function roomAt(x, z) {
  for (const r of rooms) {
    if (x > r.min.x && x < r.max.x && z > r.min.z && z < r.max.z) return r;
  }
  return null;
}

/** Push a circle (the player) out of every collider. Returns the corrected position. */
export function resolveCollisions(x, z, radius) {
  for (let pass = 0; pass < 3; pass++) {
    for (const c of colliders) {
      if (c.type === 'circle') {
        const dx = x - c.x, dz = z - c.z, rr = radius + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1e-6;
          x = c.x + (dx / d) * rr; z = c.z + (dz / d) * rr;
        }
      } else {
        const px = Math.max(c.minX, Math.min(x, c.maxX));
        const pz = Math.max(c.minZ, Math.min(z, c.maxZ));
        const dx = x - px, dz = z - pz, d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          if (d2 > 1e-9) {
            const d = Math.sqrt(d2);
            x = px + (dx / d) * radius; z = pz + (dz / d) * radius;
          } else {                                    // centre is inside the box: leave by the nearest face
            const l = x - c.minX, r = c.maxX - x, t = z - c.minZ, b = c.maxZ - z;
            const m = Math.min(l, r, t, b);
            if (m === l) x = c.minX - radius; else if (m === r) x = c.maxX + radius;
            else if (m === t) z = c.minZ - radius; else z = c.maxZ + radius;
          }
        }
      }
    }
  }
  return { x, z };
}
