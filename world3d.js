// Builds every static and animated 3D object of the lunar outpost.
import * as THREE from 'three';
import { MeshBuilder, T, mat, basic, meshOf } from './geo.js';
import { heightAt, craterFactor, WORLD_RADIUS } from './terrain.js';
import { makeNoise, mulberry32, smoothstep, clamp } from './math.js';
import { SUN_DIR, EARTH_DIR, rooms, WALL_T, arrays, sampleSpots, equipment, rover, tanks, mast, lander, boulders, greenhouse as GH, refillStation as RS, battery as BAT, leaks as LEAKS, shelterBox as SBOX } from './world.js';

// Linear-space albedo palette (sunlit regolith ends up mid grey).
const REGOLITH = [0.135, 0.13, 0.125];
const WHITE = [0.62, 0.64, 0.66];
const PANEL_WHITE = [0.5, 0.52, 0.55];
const STEEL = [0.2, 0.21, 0.23];
const DARK = [0.04, 0.045, 0.05];
const ORANGE = [0.55, 0.16, 0.03];
const CELL = [0.012, 0.03, 0.12];
const CELL_LINE = [0.1, 0.13, 0.22];
const GLOVE = [0.62, 0.62, 0.6];
// Per-planet surface palettes (linear albedo). Mars: iron-oxide dust, darker basalt rock.
const PLANET = {
  moon: { reg: REGOLITH, dust: REGOLITH, rock: [0.125, 0.12, 0.115], berm: [0.14, 0.135, 0.13] },
  mars: { reg: [0.30, 0.112, 0.056], dust: [0.44, 0.235, 0.12], rock: [0.105, 0.06, 0.047], berm: [0.27, 0.105, 0.052] },
};
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------------------------------------------------------------- terrain
export function buildTerrain(quality = 1, planet = 'moon') {
  const noise = makeNoise(5);
  const P = PLANET[planet], mars = planet === 'mars';
  const rings = Math.round(130 * quality), segs = Math.round(300 * quality);
  const r0 = 0.6, rMax = 2400, k = Math.pow(rMax / r0, 1 / (rings - 1));
  const pos = [], col = [];
  pos.push(0, heightAt(0, 0), 0); col.push(...P.reg);
  for (let i = 0; i < rings; i++) {
    const r = r0 * Math.pow(k, i);
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = heightAt(x, z);
      pos.push(x, y, z);
      const cf = craterFactor(x, z);
      const grain = noise.fbm(x * 0.35, z * 0.35, 3) * 0.5 + noise.noise(x * 1.9, z * 1.9) * 0.25;
      const patch = noise.fbm(x * 0.02 + 20, z * 0.02, 3);
      let g = 1 + grain * 0.28 + patch * 0.22;
      g *= cf > 0 ? 1 + cf * 0.45 : 1 + cf * 0.3;        // bright fresh rims, darker floors
      const warm = 1 + patch * 0.06;
      if (mars) {
        // iron-oxide dust with lighter drifts, dune ripples and darker wind-scoured patches
        const rip = Math.sin(x * 0.55 + noise.fbm(x * 0.04, z * 0.04, 2) * 11) * 0.5 + 0.5;
        const drift = clamp((patch + 0.25) * 1.3, 0, 1);
        const base = lerp3(P.reg, P.dust, drift * 0.75);
        const gm = g * (0.88 + 0.24 * rip * (0.4 + drift));
        col.push(base[0] * gm, base[1] * gm, base[2] * gm);
      } else col.push(REGOLITH[0] * g * warm, REGOLITH[1] * g, REGOLITH[2] * g / warm);
    }
  }
  const idx = [];
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);        // centre fan (wound upwards)
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = 1 + i * segs + j, b = 1 + i * segs + ((j + 1) % segs);
      const c = 1 + (i + 1) * segs + j, d = 1 + (i + 1) * segs + ((j + 1) % segs);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat({ roughness: 1 }));
  m.receiveShadow = true; m.frustumCulled = false;
  return m;
}

// ---------------------------------------------------------------- rocks
export function buildRocks(quality = 1, planet = 'moon') {
  const rnd = mulberry32(31);
  const P = PLANET[planet], mars = planet === 'mars';
  const small = new MeshBuilder(), big = new MeshBuilder();
  const n = Math.round(1300 * quality);
  for (let i = 0; i < n; i++) {
    const ang = rnd() * Math.PI * 2, dist = 5 + Math.pow(rnd(), 0.75) * 330;
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    if (Math.hypot(x, z) < 14 && Math.abs(x) < 20) continue;              // keep the landing strip tidy
    const r = 0.08 + Math.pow(rnd(), 3) * 0.55;
    const tint = 0.8 + rnd() * 0.5;
    small.rock({ x, y: heightAt(x, z) + r * 0.15, z, ry: rnd() * 6 }, r, rnd, mars ? [P.rock[0] * tint * 1.2, P.rock[1] * tint * 1.2, P.rock[2] * tint * 1.2] : [0.12 * tint, 0.115 * tint, 0.11 * tint], 0);
  }
  for (const b of boulders) {
    const tint = 0.75 + (b.seed % 100) / 160;
    const rr = mulberry32(b.seed);
    big.rock({ x: b.x, y: heightAt(b.x, b.z) + b.r * 0.1, z: b.z, ry: rr() * 6 }, b.r, rr, mars ? [P.rock[0] * tint * 1.3, P.rock[1] * tint * 1.3, P.rock[2] * tint * 1.3] : [0.13 * tint, 0.125 * tint, 0.12 * tint], b.r > 1.2 ? 2 : 1, 0.75);
  }
  const g = new THREE.Group();
  g.add(meshOf(small, mat({ roughness: 1 }), { cast: false }), meshOf(big, mat({ roughness: 1 })));
  return g;
}

// ---------------------------------------------------------------- sky
function buildMoonSky() {
  const group = new THREE.Group();
  // stars: a uniform field plus a denser, bluer Milky Way band
  const rnd = mulberry32(8);
  const N = 5200, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const bandN = [0.35, 0.82, 0.45], bl = Math.hypot(...bandN);
  for (let i = 0; i < N; i++) {
    let x, y, z;
    do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; } while (x * x + y * y + z * z > 1 || x * x + y * y + z * z < 0.05);
    const l = Math.hypot(x, y, z);
    [x, y, z] = [x / l, y / l, z / l];
    const band = Math.exp(-Math.pow((x * bandN[0] + y * bandN[1] + z * bandN[2]) / bl / 0.18, 2));
    if (i > N * 0.55 && rnd() > band + 0.04) { i--; continue; }
    pos.set([x * 3000, y * 3000, z * 3000], i * 3);
    const bright = 0.35 + Math.pow(rnd(), 3) * 0.65, tint = rnd();
    col.set([bright * (0.85 + tint * 0.15), bright * (0.9 + (1 - tint) * 0.1), bright * (tint > 0.7 ? 1 : 0.9)], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.9, sizeAttenuation: false, vertexColors: true }));
  stars.frustumCulled = false;
  group.add(stars);

  // Earth: painted procedurally on a sphere, lit from the sun's direction so it shows a phase.
  const en = makeNoise(77), cl = makeNoise(12);
  const earthCol = (nx, ny, nz) => {
    const land = en.fbm(nx * 2.4 + 5, nz * 2.4 + ny * 2.0, 5) + en.fbm(ny * 2.2, nx * 1.8, 3) * 0.4;
    const cloud = clamp((cl.fbm(nx * 3.1, nz * 3.1 + ny * 2.7, 4) - 0.02) * 3, 0, 1);
    let c = land > 0.06 ? [0.08 + (land - 0.06) * 0.2, 0.2 - (land - 0.06) * 0.1, 0.05] : [0.01, 0.06 + land * 0.1, 0.32];
    if (Math.abs(ny) > 0.86) c = [0.7, 0.72, 0.75];
    c = [c[0] + (0.8 - c[0]) * cloud * 0.85, c[1] + (0.82 - c[1]) * cloud * 0.85, c[2] + (0.85 - c[2]) * cloud * 0.85];
    const lit = Math.max(0.05, nx * SUN_DIR[0] * 0 + (nx * 0.75 + ny * 0.2 + nz * 0.63));        // sun from the (mostly) +x side
    return [c[0] * lit * 2.4, c[1] * lit * 2.4, c[2] * lit * 2.4];
  };
  const eb = new MeshBuilder().sphere(T(), 60, 64, 32, earthCol);
  const earth = new THREE.Mesh(eb.build(), basic());
  earth.position.set(EARTH_DIR[0] * 1500, EARTH_DIR[1] * 1500, EARTH_DIR[2] * 1500);
  earth.rotation.y = 0.6;
  const glowB = new MeshBuilder().sphere(T(), 64, 40, 20, [0.18, 0.4, 0.95]);
  const glow = new THREE.Mesh(glowB.build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false }));
  glow.position.copy(earth.position);
  group.add(earth, glow);

  // Sun: a hard white disc (no atmosphere, so no sky glow)
  const sb = new MeshBuilder().sphere(T(), 22, 24, 12, [8, 8, 7]);
  const sun = new THREE.Mesh(sb.build(), basic());
  sun.position.set(SUN_DIR[0] * 2800, SUN_DIR[1] * 2800, SUN_DIR[2] * 2800);
  group.add(sun);
  group.userData = { earth, stars, sunDisc: sun };
  return group;
}


// Mars: butterscotch sky (pink-orange horizon, dusty tan zenith, bluish glow around a smaller Sun), faint stars only
// at very high altitude, two tiny moons and no Earth.
function buildMarsSky(quality) {
  const group = new THREE.Group();
  const SUNV = SUN_DIR;
  const domeCol = (nx, ny, nz) => {
    const up = clamp(ny, -0.2, 1), h = Math.pow(1 - clamp(up, 0, 1), 1.6);
    const base = lerp3([0.34, 0.2, 0.13], [0.62, 0.34, 0.2], h);                // zenith -> horizon (linear)
    const sd = clamp(nx * SUNV[0] + ny * SUNV[1] + nz * SUNV[2], 0, 1);
    const glow = Math.pow(sd, 18) * 0.5 + Math.pow(sd, 90) * 0.9;               // blue-white halo is a real Mars effect
    return [base[0] * (1 + 0.1 * sd) + glow * 0.45, base[1] + glow * 0.62, base[2] * (1 - 0.15 * h) + glow * 0.9];
  };
  const dome = new THREE.Mesh(new MeshBuilder().sphere(T(), 2950, 48, 24, domeCol).build(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, depthWrite: false }));
  dome.frustumCulled = false;
  group.add(dome);
  // faint stars (only visible at the zenith through the thin air)
  const rnd = mulberry32(81), N = 900, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    let x, y, z; do { x = rnd() * 2 - 1; y = rnd(); z = rnd() * 2 - 1; } while (x * x + y * y + z * z > 1 || y < 0.35);
    const l = Math.hypot(x, y, z); pos.set([x / l * 2900, y / l * 2900, z / l * 2900], i * 3);
    const b = 0.12 + rnd() * 0.18; col.set([b, b * 0.9, b * 0.8], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, vertexColors: true }));
  stars.frustumCulled = false; group.add(stars);
  // Sun: from Mars it looks about 2/3 the width it has from Earth, so it is drawn smaller than the lunar Sun
  const sunDisc = new THREE.Mesh(new MeshBuilder().sphere(T(), 15, 20, 10, [8, 7.2, 6.2]).build(), basic());
  sunDisc.position.set(SUNV[0] * 2800, SUNV[1] * 2800, SUNV[2] * 2800);
  const sunHalo = new THREE.Mesh(new MeshBuilder().sphere(T(), 70, 24, 12, [1.0, 0.8, 0.55]).build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false }));
  sunHalo.position.copy(sunDisc.position);
  group.add(sunDisc, sunHalo);
  // Phobos and Deimos (not to scale: just two small lumpy grey moons)
  const mk = (r, dir, seed) => {
    const rr = mulberry32(seed), mb = new MeshBuilder().rock(T(), r, rr, [0.22, 0.2, 0.19], 2, 0.8);
    const m = new THREE.Mesh(mb.build(), basic()); m.position.set(dir[0] * 2600, dir[1] * 2600, dir[2] * 2600); return m;
  };
  group.add(mk(20, [-0.45, 0.62, -0.64], 3), mk(9, [0.1, 0.8, -0.59], 9));
  // dust-storm haze: a translucent ochre dome whose opacity follows the storm
  const haze = new THREE.Mesh(new MeshBuilder().sphere(T(), 2900, 24, 12, [0.46, 0.26, 0.15]).build(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false }));
  haze.frustumCulled = false; group.add(haze);
  // wind-blown dust motes around the camera (the sky group follows the camera)
  const PN = Math.round(700 * Math.min(1, quality + 0.2));
  const pg = new THREE.BufferGeometry(), pp = new Float32Array(PN * 3), seeds = [];
  for (let i = 0; i < PN; i++) { seeds.push([rnd(), rnd(), rnd(), 0.5 + rnd()]); }
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const motes = new THREE.Points(pg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, color: 0xd9a07a, transparent: true, opacity: 0.0, depthWrite: false }));
  motes.frustumCulled = false; group.add(motes);
  group.userData = { mars: true, stars, sunDisc, sunHalo, haze, motes, seeds, pp, PN };
  return group;
}
export function buildSky(planet = 'moon', quality = 1) {
  return planet === 'mars' ? buildMarsSky(quality) : buildMoonSky();
}

let CUR = 'moon';   // planet being built (module-level so helper builders can pick palettes)
// ---------------------------------------------------------------- rooms (habitat, shelter)
function roomMeshes(r, material) {
  const walls = new MeshBuilder();
  const { cx, cz, w, d, h } = r, t = WALL_T;
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const wall = r.id === 'habitat' ? WHITE : [0.3, 0.3, 0.32];
  walls.box({ x: cx, y: h / 2, z: z0 + t / 2 }, w, h, t, wall);
  walls.box({ x: x0 + t / 2, y: h / 2, z: cz }, t, h, d, wall);
  walls.box({ x: x1 - t / 2, y: h / 2, z: cz }, t, h, d, wall);
  const gw = r.door.w, sideW = (w - gw) / 2;
  walls.box({ x: x0 + sideW / 2, y: h / 2, z: z1 - t / 2 }, sideW, h, t, wall);
  walls.box({ x: x1 - sideW / 2, y: h / 2, z: z1 - t / 2 }, sideW, h, t, wall);
  walls.box({ x: cx, y: h - 0.35, z: z1 - t / 2 }, gw, 0.7, t, wall);                          // lintel over the door
  walls.box({ x: cx - gw / 2 - 0.1, y: h / 2 - 0.2, z: z1 + 0.02 }, 0.2, h - 0.4, 0.35, STEEL);   // door frame
  walls.box({ x: cx + gw / 2 + 0.1, y: h / 2 - 0.2, z: z1 + 0.02 }, 0.2, h - 0.4, 0.35, STEEL);
  // orange hazard band + panel seams
  walls.box({ x: cx, y: 0.5, z: z0 - 0.01 }, w + 0.02, 0.28, t + 0.02, ORANGE);
  walls.box({ x: x0 - 0.01, y: 0.5, z: cz }, t + 0.02, 0.28, d + 0.02, ORANGE);
  walls.box({ x: x1 + 0.01, y: 0.5, z: cz }, t + 0.02, 0.28, d + 0.02, ORANGE);
  for (let i = 1; i < 6; i++) {
    const sx = x0 + (w / 6) * i;
    walls.box({ x: sx, y: h / 2, z: z0 - 0.03 }, 0.06, h, 0.05, STEEL);
    walls.box({ x: sx, y: h / 2, z: z1 + 0.03 }, 0.06, h, 0.05, STEEL);
  }
  // floor
  const floor = new MeshBuilder().box({ x: cx, y: 0.04, z: cz }, w - 2 * t, 0.08, d - 2 * t, [0.16, 0.17, 0.18]);
  for (let i = 0; i <= 8; i++) floor.box({ x: x0 + t + ((w - 2 * t) / 8) * i, y: 0.085, z: cz }, 0.04, 0.01, d - 2 * t, DARK);
  // roof: flat slab for shelter, shallow vault for the habitat
  const roof = new MeshBuilder();
  if (r.id === 'habitat') {
    const seg = 14, R = (w * 0.62), cy = h - R * 0.62 + 0.35;
    for (let i = 0; i < seg; i++) {
      const a0 = -0.9 + (1.8 * i) / seg, a1 = -0.9 + (1.8 * (i + 1)) / seg;
      const p = (a, zz) => [cx + Math.sin(a) * R, cy + Math.cos(a) * R, zz];
      roof.quad(p(a0, z0), p(a0, z1), p(a1, z1), p(a1, z0), [0.55, 0.57, 0.6]);
      roof.quad(p(a1, z0), p(a1, z1), p(a0, z1), p(a0, z0), [0.3, 0.3, 0.32]);
    }
    // end caps so there is no gap above the walls
    roof.box({ x: cx, y: h + 0.1, z: z0 + t / 2 }, w, 0.2, t, WHITE);
    roof.box({ x: cx, y: h + 0.1, z: z1 - t / 2 }, w, 0.2, t, WHITE);
    roof.box({ x: cx, y: h - 0.05, z: cz }, w, 0.12, d, [0.3, 0.3, 0.32]);
    // rooftop kit: antenna dish, vents
    roof.cyl({ x: cx - 3, y: h + 0.95, z: cz - 1, rx: 0.7 }, 0.9, 0.05, 0.25, 18, [0.6, 0.62, 0.64]);
    roof.cyl({ x: cx - 3, y: h + 0.55, z: cz - 1 }, 0.06, 0.06, 0.9, 6, STEEL);
    roof.box({ x: cx + 3.5, y: h + 0.45, z: cz + 1 }, 1.4, 0.35, 1.0, STEEL);
  } else {
    roof.box({ x: cx, y: h + 0.15, z: cz }, w + 0.3, 0.3, d + 0.3, [0.28, 0.28, 0.3]);
    roof.box({ x: cx, y: h + 0.35, z: cz }, w - 1, 0.15, d - 1, ORANGE);
    // regolith berm piled around the shelter
    for (let i = 0; i < 26; i++) {
      const rr = mulberry32(i + 5);
      const side = i % 3 === 0 ? -1 : 1;
      roof.rock({ x: cx + (i % 2 ? side * (w / 2 + 0.7) : (rr() - 0.5) * w), y: 0.2, z: cz - d / 2 - 0.5 + (i % 2 ? rr() * d : 0) }, 1.0 + rr() * 0.7, rr, PLANET[CUR].berm, 1, 0.8);
    }
  }
  const g = new THREE.Group();
  g.add(meshOf(walls, material), meshOf(floor, material, { cast: false }), meshOf(roof, material));
  return g;
}

function addHabitatInterior(g, mats, anim) {
  const b = new MeshBuilder();
  // O2 generator: tank bank + control face
  const o = equipment.o2gen;
  b.box({ x: o.x, y: 0.4, z: o.z }, o.sx, 0.8, o.sz, STEEL);
  for (let i = 0; i < 3; i++) b.cyl({ x: o.x - 0.55 + i * 0.55, y: 1.5, z: o.z + 0.1 }, 0.24, 0.24, 1.5, 14, [0.55, 0.57, 0.6]);
  b.box({ x: o.x, y: 0.9, z: o.z + o.sz / 2 + 0.02 }, 1.5, 0.45, 0.06, [0.05, 0.05, 0.06]);
  // water recycler: cabinet with pipes
  const w = equipment.recycler;
  b.box({ x: w.x, y: 1.1, z: w.z }, w.sx, 2.2, w.sz, [0.3, 0.32, 0.36]);
  b.cyl({ x: w.x - 0.25, y: 1.2, z: w.z - w.sz / 2 - 0.2, rx: 0 }, 0.14, 0.14, 2.0, 10, [0.08, 0.3, 0.55]);
  b.cyl({ x: w.x + 0.2, y: 2.18, z: w.z, rz: Math.PI / 2 }, 0.06, 0.06, 1.4, 8, STEEL);
  // CO2 scrubber: louvred unit
  const s = equipment.scrubber;
  b.box({ x: s.x, y: 1.0, z: s.z }, s.sx, 2.0, s.sz, [0.28, 0.3, 0.33]);
  for (let i = 0; i < 6; i++) b.box({ x: s.x, y: 0.5 + i * 0.25, z: s.z + s.sz / 2 + 0.02 }, 1.6, 0.06, 0.05, DARK);
  // desk + console
  const d = equipment.desk;
  b.box({ x: d.x, y: 0.42, z: d.z }, d.sx, 0.84, d.sz, [0.25, 0.26, 0.28]);
  b.box({ x: d.x, y: 1.0, z: d.z - 0.1, rx: -0.5 }, 2.4, 0.5, 0.06, DARK);
  // table + stools
  const t = equipment.table;
  b.box({ x: t.x, y: 0.75, z: t.z }, t.sx, 0.07, t.sz, [0.4, 0.4, 0.42]);
  b.cyl({ x: t.x, y: 0.37, z: t.z }, 0.07, 0.07, 0.74, 8, STEEL);
  for (const dx of [-1.6, 1.6]) b.cyl({ x: t.x + dx, y: 0.25, z: t.z }, 0.25, 0.25, 0.5, 10, ORANGE);
  // bunks along the NE wall and storage crates
  b.box({ x: -5.1, y: 0.35, z: -3.5 }, 1.0, 0.7, 0.9, [0.22, 0.24, 0.26]);
  b.box({ x: -5.1, y: 0.9, z: -3.5 }, 1.0, 0.14, 0.9, ORANGE);
  b.box({ x: 5.1, y: 0.4, z: -3.3 }, 0.9, 0.8, 0.9, [0.3, 0.3, 0.2]);
  b.box({ x: 5.1, y: 1.0, z: -3.3 }, 0.8, 0.4, 0.8, [0.24, 0.26, 0.2]);
  g.add(meshOf(b, mats.std, { cast: true }));

  // breaker panel on the west wall with a status lamp
  const panel = new MeshBuilder().box({ x: -5.55, y: 1.3, z: -6.0 }, 0.14, 1.1, 0.8, [0.12, 0.12, 0.13]);
  panel.box({ x: -5.45, y: 1.5, z: -6.0 }, 0.04, 0.4, 0.12, STEEL);      // fixed lever slot
  g.add(meshOf(panel, mats.std));
  const lever = new THREE.Mesh(new MeshBuilder().box(T(), 0.07, 0.34, 0.1, [0.6, 0.1, 0.05]).build(), mats.std);
  lever.position.set(-5.4, 1.5, -6.0); g.add(lever);
  const lamp = new THREE.Mesh(new MeshBuilder().sphere(T(), 0.07, 10, 6, [1, 1, 1]).build(), new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xff2200 }));
  lamp.position.set(-5.42, 1.0, -6.0); g.add(lamp);
  anim.breaker = { lever, lamp };

  // ceiling light strips + status lights over each unit (emissive, switched with power)
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x222222 });
  const lb = new MeshBuilder();
  for (const x of [-3.5, 0, 3.5]) lb.box({ x, y: 3.12, z: -6 }, 0.35, 0.05, 6.4, [1, 1, 1]);
  g.add(new THREE.Mesh(lb.build(), lightMat));
  anim.ceilingLights = lightMat;
  const unitLamps = {};
  for (const [id, e, dy] of [['o2gen', equipment.o2gen, 2.35], ['recycler', equipment.recycler, 2.3], ['scrubber', equipment.scrubber, 2.1], ['thermal', equipment.thermal, 1.9]]) {
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x330000 });
    const l = new THREE.Mesh(new MeshBuilder().sphere(T(), 0.09, 10, 6, [1, 1, 1]).build(), m);
    l.position.set(e.x, dy, e.z + e.sz / 2 + 0.05); g.add(l); unitLamps[id] = m;
  }
  anim.unitLamps = unitLamps;
  // interior point lights (dark until power is restored)
  const pl = [];
  for (const [x, z] of [[-3, -6], [3, -6]]) {
    const light = new THREE.PointLight(0xfff1dd, 0, 11, 1.6);
    light.position.set(x, 2.9, z); g.add(light); pl.push(light);
  }
  anim.pointLights = pl;
}

// ---------------------------------------------------------------- solar arrays
function buildArray(a, mats) {
  const group = new THREE.Group();
  group.position.set(a.x, 0, a.z);
  const frame = new MeshBuilder();
  frame.box({ y: 0.06 }, 2.6, 0.12, 7.2, STEEL);
  frame.cyl({ y: 1.0, z: -2.4 }, 0.08, 0.1, 2.0, 8, STEEL);
  frame.cyl({ y: 1.0, z: 2.4 }, 0.08, 0.1, 2.0, 8, STEEL);
  frame.box({ x: -2.0, y: 0.55, z: 0 }, 0.6, 1.1, 0.7, [0.1, 0.1, 0.11]);          // control cabinet the astronaut works at
  group.add(meshOf(frame, mats.std));

  const makePanel = (damaged) => {
    const p = new MeshBuilder();
    const cols = 6, rows = 4, cw = 4.2 / cols, rh = 7.0 / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const dead = damaged && (((r * 7 + c * 3) % 5 === 0) || (r === 1 && c > 2));
      const colr = dead ? [0.02, 0.02, 0.025] : damaged ? [0.008, 0.02, 0.07] : CELL;
      p.box({ x: -2.1 + (c + 0.5) * cw, y: 0, z: -3.5 + (r + 0.5) * rh }, cw - 0.06, 0.05, rh - 0.06, colr);
    }
    p.box({ y: -0.04, z: 0 }, 4.3, 0.03, 7.1, CELL_LINE);                           // backing + frame lines
    const m = meshOf(p, mats.std);
    m.position.set(0.2, 2.45, 0);
    m.rotation.z = damaged ? -0.62 : -0.9;                                           // intact panels tilt up to face the sun
    if (damaged) { m.rotation.x = 0.1; m.position.y = 2.2; }
    return m;
  };
  const damaged = makePanel(true), fixed = makePanel(false);
  fixed.visible = false;
  // stowed: panel folded flat and lowered onto its frame so storm particles and wind cannot catch it
  const stowed = makePanel(false);
  stowed.rotation.z = 0; stowed.position.set(0, 1.2, 0); stowed.scale.set(1, 1, 0.55);
  stowed.visible = false;
  // dust layer: a translucent dusty plane over the deployed panel (opacity is driven by the dust level)
  const dust = new THREE.Mesh(new MeshBuilder().box(T(), 4.3, 0.02, 7.1, [0.6, 0.38, 0.22]).build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false }));
  dust.position.set(0, 0.07, 0);
  fixed.add(dust);
  group.add(damaged, fixed, stowed);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
  const lamp = new THREE.Mesh(new MeshBuilder().sphere(T(), 0.1, 10, 6, [1, 1, 1]).build(), new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xff3300 }));
  lamp.position.set(-1.7, 1.0, 0.36);
  group.add(lamp);
  void lampMat;
  return { group, damaged, fixed, stowed, dust, lamp };
}

// ---------------------------------------------------------------- misc props
function buildRover(mats) {
  const b = new MeshBuilder();
  const body = [0.5, 0.52, 0.55];
  b.box({ y: 0.85 }, 3.0, 0.35, 1.7, body);
  b.box({ y: 0.65 }, 2.6, 0.2, 1.5, STEEL);
  b.box({ x: -0.2, y: 1.2, z: 0 }, 1.1, 0.35, 1.3, [0.35, 0.37, 0.4]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.cyl({ x: sx * 1.15, y: 0.46, z: sz * 1.0, rx: Math.PI / 2 }, 0.46, 0.46, 0.34, 16, [0.05, 0.05, 0.055]);
    b.cyl({ x: sx * 1.15, y: 0.46, z: sz * 1.0, rx: Math.PI / 2 }, 0.18, 0.18, 0.4, 8, STEEL);
    b.box({ x: sx * 1.15, y: 0.75, z: sz * 0.86 }, 0.1, 0.3, 0.1, STEEL);
  }
  b.cyl({ x: 1.0, y: 1.8, z: 0.4 }, 0.05, 0.05, 1.6, 6, STEEL);                       // mast
  b.cyl({ x: 1.0, y: 2.65, z: 0.4, rx: 0.4 }, 0.5, 0.05, 0.16, 16, [0.65, 0.66, 0.68]); // dish
  b.box({ x: -1.5, y: 1.3, z: 0 }, 0.05, 0.8, 1.4, CELL);                              // folded panel
  b.box({ x: 1.5, y: 1.0, z: 0 }, 0.1, 0.25, 1.2, [0.7, 0.7, 0.2]);                    // light bar
  const g = new THREE.Group();
  g.add(meshOf(b, mats.std));
  return g;
}
function buildMisc(mats) {
  const b = new MeshBuilder();
  for (const t of tanks) {
    b.cyl({ x: t.x, y: 1.1, z: t.z }, t.r, t.r, 2.2, 16, [0.55, 0.57, 0.6]);
    b.cyl({ x: t.x, y: 2.25, z: t.z }, 0.2, 0.2, 0.2, 8, STEEL);
    b.box({ x: t.x + 1.5, y: 0.35, z: t.z }, 1.6, 0.14, 0.14, STEEL);
  }
  b.box({ x: -12, y: 0.4, z: -7.4 }, 0.2, 0.2, 6, STEEL);                              // manifold between tanks
  b.cyl({ x: mast.x, y: 4.5, z: mast.z }, 0.1, 0.18, 9, 8, [0.55, 0.56, 0.58]);        // comm mast
  b.cyl({ x: mast.x + 0.6, y: 8.2, z: mast.z, rz: -0.9, rx: 0 }, 0.9, 0.06, 0.2, 18, [0.7, 0.7, 0.72]);
  for (let i = 0; i < 4; i++) b.box({ x: mast.x, y: 2 + i * 1.9, z: mast.z }, 0.7, 0.05, 0.05, STEEL);
  // lander: descent stage with legs
  const L = lander;
  b.cyl({ x: L.x, y: 2.4, z: L.z }, 2.3, 2.6, 2.0, 8, [0.45, 0.38, 0.14]);
  b.cyl({ x: L.x, y: 3.8, z: L.z }, 1.6, 2.2, 1.1, 8, [0.55, 0.57, 0.6]);
  b.cyl({ x: L.x, y: 1.2, z: L.z }, 0.7, 1.0, 0.8, 10, STEEL);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4, c = Math.cos(a), s = Math.sin(a);
    b.box({ x: L.x + c * 2.8, y: 1.15, z: L.z + s * 2.8, ry: -a, rz: 0.62 }, 0.12, 3.2, 0.12, STEEL);
    b.cyl({ x: L.x + c * 3.6, y: 0.06, z: L.z + s * 3.6 }, 0.5, 0.55, 0.12, 10, STEEL);
  }
  // landing-pad lamp posts along the path to the habitat
  for (let z = 22; z > 2; z -= 5) for (const x of [-3.2, 3.2]) b.cyl({ x, y: 0.5, z }, 0.05, 0.05, 1.0, 6, STEEL);
  // cable run to the solar field
  b.box({ x: 12, y: 0.03, z: -6 }, 24, 0.05, 0.12, DARK);
  const g = new THREE.Group();
  g.add(meshOf(b, mats.std));
  const lampB = new MeshBuilder();
  for (let z = 22; z > 2; z -= 5) for (const x of [-3.2, 3.2]) lampB.sphere({ x, y: 1.05, z }, 0.09, 8, 5, [1, 0.85, 0.5]);
  g.add(new THREE.Mesh(lampB.build(), new THREE.MeshBasicMaterial({ vertexColors: true })));
  return g;
}

// ---------------------------------------------------------------- collectable samples
function buildSample(s, planet = 'moon') {
  const group = new THREE.Group();
  const y = heightAt(s.x, s.z);
  group.position.set(s.x, y, s.z);
  const rnd = mulberry32(s.x * 13 + s.z * 7 + 3);
  const b = new MeshBuilder();
  if (planet === 'mars') {
    // rust-red rock with veins of water ice (white-blue crystals)
    b.rock({ y: 0.2 }, 0.38, rnd, [0.26, 0.1, 0.06], 1, 0.8);
    b.rock({ x: 0.3, y: 0.12, z: 0.2 }, 0.2, rnd, [0.5, 0.62, 0.72], 0, 0.8);
    b.rock({ x: -0.25, y: 0.1, z: -0.15 }, 0.16, rnd, [0.55, 0.68, 0.78], 0, 0.8);
    b.cyl({ x: 0.05, y: 0.52, z: 0.1, rz: 0.3 }, 0.0, 0.07, 0.34, 5, [0.7, 0.85, 0.95]);
    b.cyl({ x: -0.1, y: 0.46, z: -0.05, rz: -0.35 }, 0.0, 0.06, 0.28, 5, [0.65, 0.8, 0.92]);
  } else {
    b.rock({ y: 0.2 }, 0.38, rnd, [0.05, 0.12, 0.2], 1, 0.8);
    b.rock({ x: 0.3, y: 0.12, z: 0.2 }, 0.2, rnd, [0.07, 0.16, 0.25], 0, 0.8);
    b.rock({ x: -0.25, y: 0.1, z: -0.15 }, 0.16, rnd, [0.06, 0.14, 0.22], 0, 0.8);
  }
  group.add(meshOf(b, mat({ roughness: 0.4 })));
  const glow = new THREE.Mesh(new MeshBuilder().sphere(T({ y: 0.32 }), 0.2, 10, 6, [0.2, 0.7, 1]).build(),
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }));
  group.add(glow);
  const beam = new THREE.Mesh(new MeshBuilder().cyl(T({ y: 1.6 }), 0.03, 0.03, 3.2, 6, [0.3, 0.8, 1], false).build(),
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  group.add(beam);
  return { group, glow, beam };
}

// ---------------------------------------------------------------- new structures
const GREEN = [0.06, 0.32, 0.07], LEAF = [0.09, 0.42, 0.1];
const glassMat = (op = 0.22) => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide });

function buildGreenhouse(mats, anim) {
  const g = new THREE.Group();
  const { x, z, sx, sz } = GH;
  g.position.set(x, 0, z);
  const fr = new MeshBuilder(), shell = new MeshBuilder(), plants = new MeshBuilder(), lights = new MeshBuilder();
  const R = sz / 2, L = sx;
  fr.box({ y: 0.1 }, sx + 0.3, 0.2, sz + 0.3, [0.28, 0.3, 0.33]);                         // base slab
  const arc = (a) => [Math.sin(a) * R, 0.2 + Math.cos(a) * R * 0.95];
  const ribs = 5, seg = 12;
  for (let r = 0; r < ribs; r++) {
    const zz = -L / 2 + (L / (ribs - 1)) * r;                                             // ribs run along x (length), arch over z
    for (let i = 0; i < seg; i++) {
      const a0 = -1.5 + (3.0 * i) / seg, a1 = -1.5 + (3.0 * (i + 1)) / seg;
      const [y0, h0] = arc(a0), [y1, h1] = arc(a1);
      fr.cyl({ x: zz, y: (h0 + h1) / 2, z: (y0 + y1) / 2, rx: Math.atan2(y1 - y0, h1 - h0) }, 0.05, 0.05, Math.hypot(y1 - y0, h1 - h0) + 0.02, 5, [0.6, 0.62, 0.65], false);
    }
  }
  // translucent shell (arch swept along x)
  for (let i = 0; i < seg; i++) {
    const a0 = -1.5 + (3.0 * i) / seg, a1 = -1.5 + (3.0 * (i + 1)) / seg;
    const [z0, h0] = arc(a0), [z1, h1] = arc(a1);
    shell.quad([-L / 2, h0, z0], [L / 2, h0, z0], [L / 2, h1, z1], [-L / 2, h1, z1], [0.45, 0.8, 0.7]);
  }
  shell.quad([-L / 2, 0.2, -R], [-L / 2, 0.2, R], [-L / 2, 0.2 + R * 0.95, 0], [-L / 2, 0.2, -R], [0.45, 0.8, 0.7]);
  // planter beds, plants, grow-lights
  for (const pz of [-0.95, 0.95]) {
    plants.box({ x: 0, y: 0.45, z: pz }, L - 1.0, 0.5, 0.8, [0.2, 0.14, 0.1]);
    for (let i = 0; i < 9; i++) {
      const px = -L / 2 + 0.7 + i * ((L - 1.4) / 8), rr = mulberry32(i * 3 + (pz > 0 ? 1 : 2));
      plants.cyl({ x: px, y: 1.0 + rr() * 0.1, z: pz, }, 0.0, 0.2 + rr() * 0.08, 0.7 + rr() * 0.25, 6, rr() > 0.5 ? LEAF : GREEN);
      plants.sphere({ x: px + 0.12, y: 0.82, z: pz + 0.1 }, 0.1, 6, 4, [0.55, 0.12, 0.1]);   // tomato-like fruit
    }
  }
  plants.box({ x: 0, y: 0.25, z: 0 }, L - 1.0, 0.2, 0.6, [0.16, 0.18, 0.2]);               // water trough
  for (const lz of [-0.95, 0.95]) lights.box({ x: 0, y: 2.15 - Math.abs(lz) * 0.55, z: lz }, L - 1.4, 0.06, 0.18, [1, 1, 1]);
  const frameMesh = meshOf(fr, mats.std);
  const shellMesh = new THREE.Mesh(shell.build(), glassMat(0.2));
  const plantMat = mat({ roughness: 0.8 });
  const plantMesh = meshOf(plants, plantMat);
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x333333 });
  const lightMesh = new THREE.Mesh(lights.build(), lightMat);
  g.add(frameMesh, plantMesh, lightMesh, shellMesh);
  const pl = new THREE.PointLight(0xff66dd, 0, 10, 1.6); pl.position.set(0, 1.8, 0); g.add(pl);
  // status lamp on the east end (where the player works)
  const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x330000 });
  const lamp = new THREE.Mesh(new MeshBuilder().sphere(T(), 0.1, 10, 6, [1, 1, 1]).build(), lampMat);
  lamp.position.set(L / 2 + 0.2, 1.4, 0); g.add(lamp);
  const panel = new THREE.Mesh(new MeshBuilder().box(T(), 0.14, 0.9, 0.7, [0.12, 0.12, 0.13]).build(), mats.std);
  panel.position.set(L / 2 + 0.1, 1.1, 0); g.add(panel);
  anim.unitLamps.greenhouse = lampMat;
  // pipe back to the habitat
  const pipe = new THREE.Mesh(new MeshBuilder().box(T(), 17.5, 0.14, 0.14, [0.12, 0.35, 0.6]).build(), mats.std);
  pipe.position.set(L / 2 + 8.9, 0.1, 0.6); g.add(pipe);
  return {
    group: g,
    setActive(active, t) {
      lightMat.color.setHex(active ? (Math.sin(t * 3) > -0.8 ? 0xff80e8 : 0xffb0f0) : 0x333333);
      plantMat.color.setRGB(active ? 1 : 0.55, active ? 1 : 0.5, active ? 1 : 0.5);
      pl.intensity = active ? 18 : 0;
    },
  };
}

function buildLeaks() {
  const mk = (pos, color, op) => {
    const g = new THREE.Group(); g.position.set(pos.x, 0, pos.z); g.visible = false;
    const jets = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new MeshBuilder().cyl(T(), 0.02, 0.1, 0.9, 6, color, false).build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: op, depthWrite: false }));
      m.position.set((i - 1) * 0.12, pos.y, 0); m.rotation.z = (i - 1) * 0.35; g.add(m); jets.push(m);
    }
    return { g, jets };
  };
  const w = mk(LEAKS.water, [0.4, 0.7, 1], 0.55);
  const puddle = new THREE.Mesh(new MeshBuilder().cyl(T(), 0.9, 0.9, 0.01, 18, [0.15, 0.4, 0.75]).build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false }));
  puddle.position.set(0, 0.1, 0.3); w.g.add(puddle);
  const o = mk(LEAKS.o2, [0.9, 0.95, 1], 0.35);
  const puffs = [];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new MeshBuilder().sphere(T(), 0.25, 8, 5, [1, 1, 1]).build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.25, depthWrite: false }));
    o.g.add(p); puffs.push(p);
  }
  return {
    water: { group: w.g }, o2: { group: o.g },
    update(t) {
      w.jets.forEach((m, i) => { m.scale.set(1 + 0.3 * Math.sin(t * 20 + i), 0.9 + 0.25 * Math.sin(t * 13 + i * 2), 1); });
      puddle.scale.set(1 + 0.06 * Math.sin(t * 2), 1, 1 + 0.06 * Math.cos(t * 2));
      puffs.forEach((p, i) => { const ph = (t * 0.9 + i / 4) % 1; p.position.set(0.1 + ph * 0.9, LEAKS.o2.y - 0.2 + ph * 0.5 + Math.sin(i) * 0.1, 0.15 * Math.sin(i * 3)); { const k = 0.5 + ph * 2; p.scale.set(k, k, k); } p.material.opacity = 0.35 * (1 - ph); });
    },
  };
}

function buildBatteryBank(mats) {
  const g = new THREE.Group(); g.position.set(BAT.x, 0, BAT.z);
  const b = new MeshBuilder();
  b.box({ y: 0.08 }, BAT.sx + 0.4, 0.16, BAT.sz + 0.4, [0.22, 0.23, 0.25]);
  for (let i = 0; i < 4; i++) {
    const px = -BAT.sx / 2 + 0.3 + i * (BAT.sx - 0.6) / 3;
    b.box({ x: px, y: 0.9, z: 0 }, 0.5, 1.5, BAT.sz - 0.2, [0.3, 0.32, 0.36]);
    b.box({ x: px, y: 1.7, z: 0 }, 0.4, 0.1, BAT.sz - 0.3, ORANGE);
  }
  b.box({ x: 0, y: 1.9, z: 0 }, BAT.sx, 0.08, 0.1, STEEL);
  b.box({ x: -BAT.sx / 2 - 1.2, y: 0.05, z: 0 }, 2.4, 0.06, 0.14, DARK);                   // cable to the arrays
  g.add(meshOf(b, mats.std));
  const leds = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x30ff60 });
    const l = new THREE.Mesh(new MeshBuilder().box(T(), 0.14, 0.1, 0.05, [1, 1, 1]).build(), m);
    l.position.set(-BAT.sx / 2 - 0.05 + 0.0, 0.5 + i * 0.22, BAT.sz / 2 - 0.08); l.position.x = -0.5 + i * 0.0; l.position.set(-0.5, 0.55 + i * 0.17, BAT.sz / 2 - 0.08 + 0.1);
    g.add(l); leds.push(m);
  }
  return { group: g, setLevel(f) { leds.forEach((m, i) => m.color.setHex(f > i / 5 + 0.04 ? (f < 0.25 ? 0xff3010 : f < 0.5 ? 0xffc030 : 0x30ff60) : 0x222222)); } };
}

function buildThermalUnit(mats) {
  const e = equipment.thermal;
  const g = new THREE.Group(); g.position.set(e.x, 0, e.z);
  const b = new MeshBuilder();
  b.box({ y: 0.7 }, e.sx, 1.4, e.sz, [0.3, 0.32, 0.36]);
  b.box({ y: 1.45, z: 0 }, e.sx * 0.9, 0.1, e.sz * 0.9, STEEL);
  for (let i = 0; i < 6; i++) b.box({ x: -0.36 + i * 0.145, y: 1.85, z: 0 }, 0.04, 0.7, e.sz * 0.85, [0.55, 0.57, 0.6]);   // radiator fins
  b.cyl({ x: 0, y: 1.0, z: e.sz / 2 + 0.02, rx: Math.PI / 2 }, 0.22, 0.22, 0.06, 14, DARK);                                // fan grille
  const fins = meshOf(b, mats.std);
  g.add(fins);
  return { group: g, setState(st, t) { fins.visible = true; void st; void t; } };
}

// Oxygen refill station: two cyan O2 cylinders on a rack against the habitat's south wall, a glowing sign with an "O" icon
// and a thin light column (behind the tanks, so it never hides them) that pulses whenever the suit needs air. Drawn inside the habitat, just east of the door.
function buildRefillStation(mats) {
  const g = new THREE.Group(); g.position.set(RS.x, 0.08, RS.z);
  const CYAN = [0.05, 0.5, 0.65], TANK = [0.08, 0.42, 0.55];
  const b = new MeshBuilder();
  b.box({ y: 0.12 }, RS.sx, 0.24, RS.sz, STEEL);                                          // base plate
  b.box({ y: 1.0, z: RS.sz / 2 - 0.08 }, RS.sx, 1.6, 0.14, [0.22, 0.24, 0.27]);           // back rack against the wall
  for (const dx of [-0.24, 0.24]) {
    b.cyl({ x: dx, y: 0.85, z: -0.02 }, 0.16, 0.16, 1.2, 14, TANK);                       // O2 cylinders
    b.cyl({ x: dx, y: 1.5, z: -0.02 }, 0.05, 0.05, 0.14, 8, STEEL);                      // valves
    b.box({ x: dx, y: 1.2, z: -0.18 }, 0.2, 0.05, 0.02, [0.9, 0.9, 0.92]);               // label band
  }
  b.box({ y: 0.55, z: -RS.sz / 2 - 0.03 }, 0.5, 0.2, 0.06, [0.15, 0.17, 0.2]);            // control box on the front
  b.cyl({ x: 0.45, y: 0.55, z: -0.1, rz: Math.PI / 2 }, 0.03, 0.03, 0.4, 8, DARK);        // hose
  g.add(meshOf(b, mats.std));
  // glowing sign (always bright so it reads even in the dark): a plate with a white "O" ring
  const signMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x30d8ff });
  const sign = new THREE.Mesh(new MeshBuilder().box(T({ y: 2.15, z: -0.05 }), 1.05, 0.5, 0.06, [1, 1, 1]).build(), signMat);
  const ring = new THREE.Mesh(new MeshBuilder().cyl(T({ x: -0.3, y: 2.15, z: -0.1, rx: Math.PI / 2 }), 0.17, 0.17, 0.03, 18, [1, 1, 1], true).build(), new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff }));
  const hole = new THREE.Mesh(new MeshBuilder().cyl(T({ x: -0.3, y: 2.15, z: -0.115, rx: Math.PI / 2 }), 0.09, 0.09, 0.03, 18, [1, 1, 1], true).build(), new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x0a4a66 }));
  const bar = new THREE.Mesh(new MeshBuilder().box(T({ x: 0.2, y: 2.15, z: -0.1 }), 0.5, 0.1, 0.03, [1, 1, 1]).build(), new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff }));
  g.add(sign, ring, hole, bar);
  // light column
  const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new MeshBuilder().cyl(T({ y: 1.7, z: 0.18 }), 0.1, 0.1, 3.2, 8, [0.3, 0.85, 1], false).build(), beamMat);
  g.add(beam);
  return {
    group: g,
    /** needs: the suit is below the refill threshold; ready: the station can be used right now. */
    update(needs, ready, t) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      signMat.color.setHex(ready ? (pulse > 0.5 ? 0x30ffb0 : 0x20c0ff) : needs ? 0xff8a30 : 0x30d8ff);
      beam.visible = ready;
      beamMat.opacity = 0.16 + 0.2 * pulse;
    },
  };
}

function buildShelterBox() {
  const g = new THREE.Group(); g.position.set(SBOX.x, 0, SBOX.z);
  const body = new MeshBuilder().box({ y: 0.35 }, 0.9, 0.7, 0.6, [0.45, 0.5, 0.3]);
  body.box({ y: 0.35, z: 0.31 }, 0.5, 0.2, 0.02, [0.6, 0.1, 0.08]);                       // red cross-ish label
  body.box({ y: 0.35, z: 0.31 }, 0.2, 0.5, 0.02, [0.6, 0.1, 0.08]);
  g.add(meshOf(body, mat({ roughness: 0.8 })));
  const lid = new THREE.Group(); lid.position.set(0, 0.72, -0.3);
  const lm = new THREE.Mesh(new MeshBuilder().box({ y: 0.04, z: 0.3 }, 0.94, 0.08, 0.62, [0.5, 0.55, 0.33]).build(), mat({ roughness: 0.8 }));
  lid.add(lm); g.add(lid);
  const glow = new THREE.Mesh(new MeshBuilder().sphere(T({ y: 0.9 }), 0.15, 8, 5, [0.3, 1, 0.5]).build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false }));
  g.add(glow);
  return { group: g, setOpen(open) { lid.rotation.x = open ? -1.6 : 0; glow.visible = !open; } };
}

function buildComm() {
  const g = new THREE.Group(); g.position.set(mast.x, 9.4, mast.z);
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x30ff60 });
  g.add(new THREE.Mesh(new MeshBuilder().sphere(T(), 0.14, 8, 5, [1, 1, 1]).build(), m));
  return { group: g, setState(st, t) { m.color.setHex(st === 'down' ? (Math.sin(t * 7) > 0 ? 0xff2200 : 0x330800) : 0x30ff60); } };
}

// ---------------------------------------------------------------- the companion astronaut

// ---------------------------------------------------------------- everything together
export function buildWorld(quality = 1, planet = 'moon') {
  CUR = planet === 'mars' ? 'mars' : 'moon';
  const mars = CUR === 'mars';
  const root = new THREE.Group();
  const mats = { std: mat({ roughness: 0.75 }) };
  const anim = {};
  root.add(buildTerrain(quality, CUR), buildRocks(quality, CUR));
  const sky = buildSky(CUR, quality);
  root.add(buildMisc(mats));
  const roverG = buildRover(mats);
  roverG.position.set(rover.x, heightAt(rover.x, rover.z), rover.z);
  root.add(roverG);

  for (const r of rooms) {
    const rm = roomMeshes(r, mats.std);
    root.add(rm);
    if (r.id === 'habitat') addHabitatInterior(rm, mats, anim);
  }
  // sliding doors (cosmetic; the gap is always passable)
  anim.doors = [];
  for (const r of rooms) {
    const door = new THREE.Mesh(new MeshBuilder().box(T(), r.door.w / 2, r.h - 0.5, 0.12, [0.28, 0.3, 0.33]).build(), mats.std);
    const door2 = door.clone();
    const z = r.cz + r.d / 2 - 0.1;
    door.position.set(r.cx - r.door.w / 4, (r.h - 0.5) / 2, z); door2.position.set(r.cx + r.door.w / 4, (r.h - 0.5) / 2, z);
    root.add(door, door2);
    anim.doors.push({ room: r, a: door, b: door2, open: 0 });
  }

  const arrayViews = {};
  for (const a of arrays) { const v = buildArray(a, mats); root.add(v.group); arrayViews[a.id] = v; }
  const sampleViews = {};
  for (const s of sampleSpots) { const v = buildSample(s, CUR); root.add(v.group); sampleViews[s.id] = v; }

  // new structures
  const greenhouse = buildGreenhouse(mats, anim); root.add(greenhouse.group);
  const leaks = buildLeaks(); root.add(leaks.water.group, leaks.o2.group);
  const batteryBank = buildBatteryBank(mats); root.add(batteryBank.group);
  const thermalView = buildThermalUnit(mats); root.add(thermalView.group);
  const refillStation = buildRefillStation(mats); root.add(refillStation.group);
  const shelterBox = buildShelterBox(); root.add(shelterBox.group);
  const comm = buildComm(); root.add(comm.group);

  // lighting presets for the Engine
  const env = mars
    ? { sunColor: 0xffe2c0, sunIntensity: 2.0, hemiSky: 0xc99a7a, hemiGround: 0x4a2a1c, hemiIntensity: 0.8 }
    : { sunColor: 0xfff2e0, sunIntensity: 3.4, hemiSky: 0x7f8fb0, hemiGround: 0x2a2420, hemiIntensity: 0.55 };

  const U = sky.userData;
  function setWeather({ dust = 0, storm = 0, sun = 1, time = 0 } = {}) {
    leaks.update(time);
    if (mars) {
      U.haze.material.opacity = clamp(dust * 0.9, 0, 0.9);
      U.sunDisc.visible = dust < 0.75; U.sunHalo.visible = dust < 0.9;
      U.sunHalo.material.opacity = 0.16 * (1 - dust);
      U.stars.visible = dust < 0.2;
      const wind = 0.12 + dust;                                              // a little dust is always drifting on Mars
      U.motes.material.opacity = clamp(0.25 + 0.6 * dust, 0, 0.85);
      U.motes.material.size = 1.6 + 2.4 * dust;
      const n = U.PN, pp = U.pp, S = U.seeds;
      for (let i = 0; i < n; i++) {
        const sd = S[i], spd = 4 * wind * sd[3];
        const x = ((sd[0] * 80 + time * spd) % 80) - 40, y = ((sd[1] * 30 + time * 0.3 * sd[3]) % 30) - 6, zz = ((sd[2] * 80 + time * spd * 0.35) % 80) - 40;
        pp[i * 3] = x; pp[i * 3 + 1] = y; pp[i * 3 + 2] = zz;
      }
      U.motes.geometry.attributes.position.needsUpdate = true;
    } else {
      U.sunDisc.visible = sun > 0.15;                                        // lunar night: the Sun is below the horizon
      const night = clamp(1 - sun, 0, 1);
      U.stars.material.size = 1.9 + night * 0.9 + storm * 0.4;
    }
  }
  function dispose() {
    root.traverse?.((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.()); });
    sky.traverse?.((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  }
  return {
    planet: CUR, root, sky, anim, arrayViews, sampleViews, roverG, env, setWeather, dispose,
    greenhouse, leaks, batteryBank, thermalView, refillStation, shelterBox, comm,
  };
}
