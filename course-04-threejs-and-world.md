# Chapter 4 — Three.js and Our 3D World (Part 4)

## 4.1 What Three.js is, and what it is not

**WebGL** is the browser's way to talk to your graphics card. It is very low-level: you describe triangles and tiny programs (shaders). **Three.js** is a library that wraps WebGL so you can say "here is a mesh, here is a camera, draw it".

In our project, **Three.js only draws**. The *rules* (is the battery empty? are you in the habitat?) are in `src/game/`. The Engine copies the state into the picture each frame (`_visuals`). That separation means you can change how things look without breaking the rules.

Which version? `package.json` asks for `"three": "^0.170.0"` (any 0.170.x–compatible). I never ran it here **[not verified with the real package]**; what I describe is verified from *your code*, not from running real Three.js.

## 4.2 The five building blocks and where they live in our code

### Scene — the container of everything
```js
this.scene = new THREE.Scene();
this.scene.background = new THREE.Color(0x000000);
```
(`Engine.js` constructor.) Everything you add to the scene is drawn: the world group, the sky group, the sun light, the camera, the spark particles. When you switch planets, `_buildPlanet` removes the old world (`this.scene.remove(this.world.root, this.world.sky)`), calls `dispose()` to free GPU memory, builds the new one and adds it.

### Camera — the eye
```js
this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 7000);
this.camera.rotation.order = 'YXZ';
```
* `PerspectiveCamera(fov, aspect, near, far)`: 72° field of view; aspect fixed later in `_resize()`; **near = 0.05 m** (things closer are cut away); **far = 7000 m** (the horizon limit).
* `rotation.order = 'YXZ'` is the correct order for a first-person camera: *first turn left/right (yaw, around Y), then look up/down (pitch, around X)*. With the default `XYZ` order, looking up and then turning would make the camera roll sideways.

Each frame `_cameraPose()` sets it:
```js
cam.position.set(p.x + shx, p.y + this.eye + bobY + shy, p.z);
cam.rotation.set(p.pitch, p.yaw, roll);
```
* Position = player position + eye height (`this.eye`, derived from your height in the profile: `clamp(g.profile.height * 0.0099, 1.4, 2.0)` → about 1.70 m for 172 cm) + a small walking bob.
* `shx/shy` are tiny random shakes during storms or when hurt.
* `roll` is a slight sway while walking.

### Renderer — the painter
```js
this.renderer = new THREE.WebGLRenderer({ antialias: !this.isTouch && !opts.noAA, powerPreference: 'high-performance' });
this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isTouch ? 1.5 : 2) * (opts.pixelScale ?? 1));
this.renderer.autoClear = false;
```
* Antialiasing (smooth edges) on desktops only.
* Pixel ratio is capped (2 on desktop, 1.5 on touch) because high-DPI screens would otherwise draw four times as many pixels for little gain; `?scale=0.5` lowers it further.
* `autoClear = false` because the Engine draws **two scenes** per frame (world, then hands) and clears manually:

```js
_render() {
  const r = this.renderer;
  r.clear();
  r.render(this.scene, this.camera);
  const ph = this.game.phase;
  if (ph !== 'title') { r.clearDepth(); r.render(this.viewmodel.scene, this.viewmodel.camera); }
}
```
`clearDepth()` wipes the depth buffer so the gloves and tool are always drawn **on top** of the world and never clip into walls.

### Lights
```js
this.sun = new THREE.DirectionalLight(0xfff2e0, 3.4);
this.hemi = new THREE.HemisphereLight(0x7f8fb0, 0x2a2420, 0.55);
```
* **DirectionalLight** — parallel rays like the Sun. Position matters only for direction. It can cast shadows.
* **HemisphereLight** — soft "sky" colour from above and "ground" colour from below. It fakes the light bouncing off regolith and stands in for the lack of an atmosphere's scattered light.

### Mesh = Geometry + Material (see 4.5).

## 4.3 The animation loop and frame updates

```js
this.raf = requestAnimationFrame(this._frame);
…
_frame(now) {
  this.raf = requestAnimationFrame(this._frame);
  const dt = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
  this.last = now;
  …
  this._update(dt);
  this._render();
}
```
* The browser calls `_frame` before every screen refresh (usually 60 times a second). `now` is in milliseconds.
* `dt` = seconds since the last frame, capped at **0.25 s**, so if the tab freezes for a few seconds the game doesn't "jump" 10 s of survival time in one go.
* Then **update** (logic) and **render** (drawing).

Inside `_update`, in the `'playing'` phase, **a fixed time step** is used:

```js
this.acc += dt;
let n = 0;
while (this.acc >= 1 / 60 && n++ < 20) { this._sim(1 / 60); this.acc -= 1 / 60; if (g.phase !== 'playing') break; }
```

Why? Physics and resource formulas behave the same at 30 fps and 144 fps only if they always use the same small step. The accumulator collects real time and consumes it in 1/60-second slices (at most 20 per frame so a slow machine doesn't spiral). Unit tests use the same `step(g, dt)` function, so tests and the real game follow the same rules.

## 4.4 Coordinates, position, rotation, scale

* Three.js: **x** = right, **y** = **up**, **z** = towards you (toward the viewer). Looking along −z is "forward" by default.
* Our world (`world.js`): the habitat is centred at `(0, −6)`; the player starts at `START = { x: 0, z: 26, yaw: 0 }` — 32 m south of the habitat, facing north (−z). The solar arrays are at x = 26. Distances are in **metres**.
* **Yaw** is rotation around Y (turn left/right). **Pitch** is rotation around X (look up/down). Forward direction from the angles (`_interaction`):

```js
const fx = -Math.sin(p.yaw) * Math.cos(p.pitch), fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
```
At yaw = 0, pitch = 0: `fx = 0, fy = 0, fz = −1` → forward is −z. ✔.

* **Position** `(x, y, z)`, **rotation** (radians, `rx, ry, rz`), **scale** (`sx, sy, sz`). In our custom `MeshBuilder` the transform helper is `T({ x, y, z, rx, ry, rz, sx, sy, sz })` — it defaults everything to 0 / 1.

**Exercise 4.A (paper):** the arrays are at x = 26, z ∈ {−16, −6, 4}; the interaction point for each is `[a.x − 2, 1.0, a.z]` (2 m to the west of the panel). If you stand at (20, 4) facing yaw = π/2, which way are you looking? `fx = −sin(π/2) = −1` → towards −x (west).

## 4.5 Geometry and materials — how our objects are made

Normally a Three.js project loads models (`.glb`) or builds geometry with `BoxGeometry` etc. **Ours builds everything triangle by triangle** with `MeshBuilder` in `geo.js`:

```js
export class MeshBuilder {
  constructor() { this.p = []; this.n = []; this.c = []; }   // positions, normals, colours
  tri(a, b, c, col, nrm) { … }
  box(xf, w, h, d, col) { … }
  cyl(xf, rTop, rBot, h, seg, col, caps = true) { … }
  sphere(xf, r, wSeg, hSeg, col) { … }
  …
}
export const mat = (opts = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0, ...opts });
```

* The builder stores arrays of **positions**, **normals** (the direction each triangle faces — needed for lighting) and **colours** (one per vertex).
* `mat()` creates a **MeshStandardMaterial** (physically-based shading) with `vertexColors: true` — the colour comes from the vertices, so **no texture images are needed**. `roughness: 0.9` makes surfaces matte.
* `meshOf(builder, material, { cast, receive })` makes a `THREE.Mesh` from a builder and sets whether it casts/receives shadows.
* Many objects are merged into one mesh (for example all small rocks in `buildRocks`) — fewer "draw calls" means better performance.

**Why flat-shaded triangles?** It gives a deliberate low-poly look and is easy to generate procedurally. A judge may ask why the models aren't realistic: the honest answer is *"we generate everything with code so there are no external assets; the trade-off is a stylised look"*.

## 4.6 Lighting and shadows

Static setup (above) and **dynamic** changes in `_visuals`:

```js
const base = this.envBase, sunFrac = clamp(g.sun / (g.env.sun || 1), 0.02, 1);
…
this.sun.intensity = base.sunI * sunFrac * (1 - 0.55 * dm) * (1 + m * (0.18 * Math.sin(t * 19) * Math.sin(t * 7.3)));
this.hemi.intensity = base.hemiI * (0.45 + 0.55 * sunFrac) * (1 + 0.3 * dm) + m * (0.25 + 0.15 * Math.sin(t * 5));
```

* `sunFrac` = how much sunlight the *simulation* says exists right now (night in level 5, dust storm in level 7). The picture dims accordingly — the 3D world is **driven by the simulation state**.
* `dm` = smoothed dust-storm mix; `m` = smoothed solar-storm mix (flickering light).
* Per-planet presets live in `buildWorld`: Moon sun intensity 3.4, Mars 2.0, with different sky colours.

**Shadows:**
```js
if (this.shadows) { this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
this.sun.shadow.mapSize.set(2048, 2048);
sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 1; sc.far = 320;
```
* Shadows are on for desktop, off on touch devices (`this.shadows = opts.shadows ?? !this.isTouch`).
* The shadow camera covers a 96 × 96 m square around the player; in `_visuals` the sun and its target follow the player in 2 m steps (`Math.round(cam.position.x / 2) * 2`) to **reduce shimmering** when the shadow window moves.

**Unverified:** shadows, brightness and fog look were never seen with real Three.js [not verified]. That's the first thing to check on your computer.

## 4.7 Textures and assets

**None.** No textures, models, images or sounds are loaded; `public/` is empty. Colours are per-vertex values. The Earth in the lunar sky is **painted procedurally** onto a sphere using noise (`buildMoonSky`: "Earth: painted procedurally on a sphere, lit from the sun's direction so it shows a phase"). Stars are a `THREE.Points` cloud of 5200 points with a denser band (a Milky Way look). The Mars sky has a gradient dome, a smaller Sun disc, a halo, faint stars, two small grey moons (Phobos and Deimos — "not to scale"), a translucent haze dome whose opacity follows the dust storm, and ~700 drifting dust specks.

## 4.8 Terrain, craters, rocks, structures

### Terrain height — one function for look **and** collision
`terrain.js`:

```js
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const blend = smoothstep(BASE_FLAT_R, BASE_BLEND_R, r);
  if (blend <= 0) return 0;
  return rawHeight(x, z) * blend;
}
```
* Within `BASE_FLAT_R = 44` m of the origin the ground is exactly 0 (so buildings sit on a flat pad); from 44 to 100 m the natural relief fades in (`smoothstep`).
* `rawHeight` sums layers of noise at different scales (`N1.fbm(x*0.004…)*15*RELIEF` = big hills, `…0.02…*2.4` medium, `N2.fbm(x*0.12…)*0.4` small bumps, tiny grain), then adds **craters** and, beyond ~560 m, rising mountains (`smoothstep(560, 960, r)`).
* On Mars an extra sine term makes rolling dunes and `RELIEF = 1.35`.

### Craters
`makeCraters(planet)` returns a list `{x, z, r, d}`. Moon: 6 hand-placed craters + 90 random ones; Mars: 3 + 38, shallower (`d = r * (0.06..0.11)` vs `0.10..0.18` on the Moon). Shape from `craterOffset`:

```js
const bowl = t < 1 ? -d * (1 - t * t) : 0;                          // parabolic bowl inside the rim
const rim = 0.2 * d * Math.exp(-(((t - 1.07) / 0.2) ** 2));        // raised ring just outside
const ejecta = t > 1.2 ? 0.05 * d * Math.exp(-(t - 1.2) * 2.4) : 0; // thrown-out debris fading with distance
```
(`t = distance / radius`.) A Gaussian bump for the rim, a parabola for the bowl.

### The terrain mesh
`buildTerrain(quality, planet)` builds a **polar grid**: `rings = round(130 * quality)` rings and `segs = round(300 * quality)` segments, with ring radii growing **exponentially** (`r = r0 * k^i`, `r0 = 0.6`, up to `rMax = 2400`). Detail is dense near you and sparse at the horizon. At each vertex it calls `heightAt` and picks a colour: grain noise, bright fresh crater rims, darker floors; on Mars dunes ripples and drifts. Then `computeVertexNormals()` for lighting.

### Rocks and boulders
`buildRocks`: ~1300 small rocks (`× quality`) with a seeded random generator, plus the **boulders** list from `world.js` (`makeBoulders`: 110 on the Moon, 150 on Mars, kept clear of buildings and sample sites via a `keepClear` list). **Seeded** randomness means the world is identical each run.

### Structures
`buildWorld` adds: habitat and shelter (`roomMeshes`), habitat interior (`addHabitatInterior`), sliding doors (cosmetic: "the gap is always passable"), solar arrays with three versions each (`damaged`, `fixed`, `stowed` meshes toggled by state), samples (glowing rocks + light beam), the greenhouse (Mars structure; visible only when `g.sys.greenhouse.st !== 'absent'`), leak effects (visible only when the leak status is true), battery bank, thermal unit, shelter supply box, comm mast, rover, lander and the teammate model.

## 4.9 Player movement, keyboard and mouse — a real walkthrough

`Engine._sim(dt)` (simplified):

```js
let fwd = (W or ↑ ? 1 : 0) - (S or ↓ ? 1 : 0) - t.moveY;        // touch joystick adds t.moveY / t.moveX
let str = (D or → ? 1 : 0) - (A or ← ? 1 : 0) + t.moveX;
const len = Math.hypot(fwd, str);
if (len > 1) { fwd /= len; str /= len; }                            // diagonal is not faster
const speed = (wantsSprint ? SPRINT : WALK) * this.speedMul * (g.status.injured ? 0.65 : 1);
const wx = -sy * fwd + cy * str, wz = -cy * fwd - sy * str;         // rotate input by yaw
const accel = p.onGround ? 12 : 2.5;
p.vx = (p.vx ?? 0) + (wx * speed - (p.vx ?? 0)) * Math.min(1, accel * dt);
```
* Input → desired world-space velocity (`wx, wz`), rotated by the camera yaw.
* Instead of snapping to full speed, velocity **eases** towards the target (`accel` 12 on ground, 2.5 in the air — you can't steer well while jumping).
* `speedMul` is 0.92 on Mars; being injured slows you to 65 %.
* World edge: beyond `WORLD_RADIUS - 2` (638 m) you are pushed back and told "You are at the edge of the mapped area".

## 4.10 Collision detection — implemented, simple, and what it is not

**Implemented** (`world.js`, `resolveCollisions(x, z, radius)`): the player is a **circle** (radius 0.45 m) in the ground plane. The world has two collider types: `box` (walls, equipment, arrays, rover, greenhouse, battery) and `circle` (tanks, mast, lander, boulders with radius > 0.75). For every collider the function finds the closest point and, if the circle overlaps, **pushes the position out**. It does up to 3 passes so corners work.

```js
const px = Math.max(c.minX, Math.min(x, c.maxX));
const pz = Math.max(c.minZ, Math.min(z, c.maxZ));
const dx = x - px, dz = z - pz, d2 = dx * dx + dz * dz;
if (d2 < radius * radius) { … push out along (dx, dz) … }
```
That "closest point on a box, then compare distance with the radius" trick is the standard circle-vs-rectangle test.

**Not implemented (be honest with judges):**
* No vertical collision with objects (you cannot stand on a boulder; the ground height is purely `heightAt`, or 0.08 inside rooms).
* Small boulders (r ≤ 0.75) and the ~1300 small rocks have **no** collision (they are decorative).
* I found no player↔companion collision; the teammate only collides with the static colliders.
* No rigid-body physics engine.

## 4.11 Gravity — implemented, but simple

```js
if (!p.onGround) {
  p.vy -= this.gravity * dt; p.y += p.vy * dt;
  if (p.y <= gy) { p.y = gy; p.vy = 0; p.onGround = true; }
}
```
`this.gravity` is set in `_applyMission` from the planet: **1.62** (Moon) or **3.71** (Mars). `JUMP = 2.8` m/s is applied when you press Space on the ground. So: `peak height = v² / (2g)`. That is *real* ballistic physics for jumping — but only vertical, with no air drag. Walking speed is **not** scaled by gravity (except the Mars 0.92 factor, a design choice). There's also a ceiling clamp inside rooms (`room.h - 1.95`) so you cannot jump through the roof.

## 4.12 Interaction targeting (what E acts on)

`_interaction()` loops through the `interactables` list (plus the teammate). For each active one it computes the distance `d` and `cos`, the cosine of the angle between your view direction and the direction to the object. It skips objects that are too far (`d > it.reach + 0.6`) or outside a view cone (`cos < 0.72`; `0.2` if very close; `0.9` for the teammate). The **score** is `d * (2 - cos)` — closer and more centred is better; the teammate's score is multiplied by 1.8 so equipment wins when she/he stands in front of it. The lowest score becomes `this.target`, which becomes the on-screen prompt.

## 4.13 Performance and frame rate

What I can **verify from code**: fixed-step simulation; the `dt` cap; merged meshes; pixel-ratio cap; quality parameter (`this.quality = opts.quality ?? (this.isTouch ? 0.55 : 1)` scaling terrain ring/segment counts and rock counts); shadows off on touch; URL flags `?quality=`, `?scale=`, `?noshadow`, `?noaa`; and an FPS counter shown with `?debug`.

What I could **not** measure: the real frame rate. My test machine used a software renderer at a few frames per second, which says nothing about a normal GPU **[not verified]**. If your demo laptop is slow: start with `?quality=0.6&noshadow`.

## 4.14 Implemented vs. possible improvements

| Implemented | Not implemented (possible future work) |
|-------------|--------------------------------------|
| First-person camera with bob/shake | Third-person camera, cut-scenes |
| Procedural Moon + Mars terrain, craters, rocks, skies | Real NASA terrain data (DEMs), textures |
| Circle-vs-box/circle collision | Vertical/step collision, physics engine |
| Gravity affecting jumps | Gravity affecting walking speed/object throws |
| Day/night & dust lighting from simulation | A moving Sun across the sky |
| Teammate model and animation | Multi-player |
| Procedural audio | Voice acting |

## Check yourself — Chapter 4

1. Why is the camera's `rotation.order` set to `'YXZ'`?
2. What does `PerspectiveCamera(72, aspect, 0.05, 7000)` mean for `0.05` and `7000`?
3. Why does the Engine use a fixed 1/60 s step and an accumulator?
4. What decides the ground height under the player, and what is special within 44 m of the origin?
5. Why does `_render()` call `clearDepth()` before drawing the hands?
6. Which objects have no collision?
7. Compute the jump height on the Moon (1.62) and Mars (3.71) with `JUMP = 2.8`.
8. Name two things the simulation changes in the 3D picture every frame.
9. What would happen if you called `_buildPlanet('mars')` *before* `createMission`?
10. Why is "we measured 60 fps" an unsafe claim right now?

**Exercises**

* E4.1 In `Engine.js` set `FOV = 90`, reload, observe the wide view, then restore 72.
* E4.2 In `world3d.js` change Mars' `reg` colour in `PLANET`, reload level 6, observe. Restore.
* E4.3 In the browser console (`?debug`) run `__lunar.camera.position` and `__lunar.game.player` and compare their x, z.

*Answers: `17-answers.md`, "Chapter 4".*
