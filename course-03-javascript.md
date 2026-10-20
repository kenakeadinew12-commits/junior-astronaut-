# Chapter 3 — JavaScript, Taught With Our Own Code (Part 3)

You do not need all of JavaScript. You need the parts that this game uses. For each concept below you get: **a simple explanation → a real excerpt → a line-by-line walk-through → "what if I change it?" → a practice exercise.**

> Tip: keep two windows open — this chapter and the real file in VS Code. Use Ctrl/Cmd+F to find the excerpt.

---

## 3.1 Variables and constants — `const`, `let`

**Simple:** a variable is a named box that holds a value. `const` means "the box is never re-pointed to something else". `let` means "I will reassign it". (Old code uses `var`; this project does not.)

**Real example** (`src/engine/Engine.js`, top of the file):

```js
const RADIUS = 0.45, WALK = 3.4, SPRINT = 6.2, JUMP = 2.8, FOV = 72;
```

Line by line:
* `const` — declare constants.
* `RADIUS = 0.45` — the player is a circle of radius 0.45 metres for collision.
* `WALK = 3.4`, `SPRINT = 6.2` — speeds in metres per second.
* `JUMP = 2.8` — upward launch speed in m/s. Together with gravity it decides jump height.
* `FOV = 72` — camera field of view in degrees.
* Commas let you declare several constants in one statement.

**What if I change it?** `WALK = 6` makes you walk as fast as you sprint now. `JUMP = 2.8` on the Moon (gravity 1.62) gives a high jump; on Mars (3.71) a lower one — gravity does the difference. Physics: height = v² / (2g) → Moon: 2.8² / (2·1.62) ≈ 2.4 m, Mars: 2.8² / (2·3.71) ≈ 1.06 m. (My browser test measured 2.40 m and 1.03 m — it matches.)

**`let` example** (`state.js`, `updatePower`): `let sun = g.env.sun;` is reassigned later with `sun *= 1 - …` — that's why it is `let`.

**Practice:** find three `const` and one `let` in `core.js` or `state.js`. Why can a `const` object still have its properties changed? (Answer in chapter 17.)

---

## 3.2 Data types

JavaScript values you will see:

| Type | Example from our code | Meaning |
|------|----------------------|---------|
| Number | `CFG.arrayKw = 3.2` | All numbers are one type (decimals allowed) |
| String | `'Moon'`, `` `Mission ${level.id}` `` | Text. Backticks allow `${…}` inserts (template literals). |
| Boolean | `breaker: true` | true / false |
| Array | `samples: ids(1, 7, 8, 2, 6, 3)` | An ordered list |
| Object | `{ x: 0, z: 26, yaw: 0 }` | Named properties |
| Function | `hintFn: (g) => …` | Yes, functions are values too |
| `null` / `undefined` | `g.hazard: null` before any storm | "nothing" |

**Real example** (`levels.js`, a level's `start`):

```js
start: { oxygen: 92, o2res: 85, water: 85, food: 80, battery: 78, materials: 0, health: 100, temp: 21, sys: { ...defaultSys }, arrays: 'ok', breaker: true, samples: ids(1, 7, 8, 2, 6, 3), dust: 0 },
```

An object (`{ }`) containing numbers, a boolean, a nested object (`sys`), a string (`'ok'`) and an array (the result of `ids(...)`). **Notice** `arrays` is sometimes a string `'ok'` / `'broken'` and sometimes an object like `{ array3: 'broken' }` (levels 5 and 7) — `createMission` handles both. That is a place where a future bug could hide.

**Practice:** what type is `g.arrays`, after `createMission`? (Look at `arrState`.)

---

## 3.3 Functions, parameters and return values

**Simple:** a function is a named recipe. Parameters are the ingredients; `return` is the dish.

**Real example** (`core.js`):

```js
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
```
(that one is in `math.js`), and here is a classic function in `core.js`:

```js
export function weightOn(massKg, gravity) { return { newtons: massKg * gravity, kgEquiv: massKg * gravity / 9.81 }; }
```

Line by line:
* `export function weightOn(...)` — define a function and make it importable elsewhere.
* Parameters: `massKg` (the astronaut's mass), `gravity` (m/s² of the planet).
* `return { newtons: …, kgEquiv: … }` — returns an object with two computed properties. Weight in newtons is `m × g`. `kgEquiv` divides by 9.81: "what a bathroom scale on Earth would read".

**What if I change it?** Remove `/ 9.81` and the "kg-equivalent" would equal newtons — the end report and the console would show nonsense. The browser test "weight on Mars is lower than on Earth" depends on this.

**Practice:** call `weightOn(68, 1.62)` in your head: 110.16 N. (Check: my experiment printed 110.16.)

### Functions that change an object instead of returning

Most of the simulation functions return nothing — they **modify `g`**:

```js
export function hurt(g, amount, cause) {
  if (amount <= 0) return;
  g.health = clamp(g.health - amount, 0, 100);
  g.hurt = Math.max(g.hurt, 0.6); g.lastDamage = cause;
  g.stats.damage[cause] = (g.stats.damage[cause] || 0) + amount;
}
```

* `if (amount <= 0) return;` — "guard clause": leave early if there's nothing to do.
* `g.health = clamp(…, 0, 100)` — reduce health but never below 0.
* `g.hurt` is the red-flash timer for the screen; `g.lastDamage` remembers the cause for the failure message.
* `g.stats.damage[cause] = (… || 0) + amount` — add to a running total; `|| 0` supplies 0 the first time the key doesn't exist.

**Practice:** why does `hurt` store `cause`? Where is `lastDamage` read? (`step()` → `fail(g, g.lastDamage || 'health')`.)

---

## 3.4 If / else, and the `?:` shortcut

**Real example** (`state.js`, `updateBody`) — suit oxygen depends on where you are:

```js
if (zone === 'outside') o2 -= CFG.drainOutside * g.diff.drain * g.metab * (p.sprinting ? CFG.sprintDrainMult : 1) * dt;
else if (zone === 'habitat') {
  if (g.o2res > 4) { const fill = Math.min(CFG.refillHabitat * dt, 100 - o2); o2 += fill; g.o2res = Math.max(0, g.o2res - fill * CFG.refillCostPerPct); }
  else o2 -= CFG.drainHabitatNoAir * dt;
} else o2 -= CFG.drainShelter * dt;
```

Walk-through:
* Outside: oxygen decreases by `drainOutside` (0.16) × the difficulty drain × your metabolic factor × (1.5 if sprinting) × `dt` (time slice).
* In the habitat: if the habitat reserve (`o2res`) is above 4, refill the suit at up to 2.2 %/s *and* pay for it from the reserve (`fill × 0.12`). If the reserve is empty you're on suit air and slowly drain.
* In the shelter: slow drain 0.04 %/s (no refill!).
* `(p.sprinting ? CFG.sprintDrainMult : 1)` is the **ternary operator**: "if sprinting then 1.5 else 1".
* Multiplying by `dt` makes the result **independent of frame rate**: 60 slices of 1/60 s give the same total as 30 slices of 1/30 s.

**What if I change it?** Replace `'outside'` by `'habitat'` and you'd lose oxygen indoors and refill outdoors — instantly broken. The logic test for level 1's refill objective would fail.

**Practice:** what happens to `o2` in the habitat when `o2res` is exactly 4? (`o2res > 4` is false → the `else` branch.)

---

## 3.5 Loops

**Real example** (`state.js`, `updatePower`): add up the power from each working array:

```js
if (g.breaker) for (const a of arrays) if (g.arrays[a.id] === 'ok') prod += CFG.arrayKw * (g.level.arrayScale || 1) * sun * (1 - g.dust[a.id] * 0.75) * (1 - g.stormPowerPenalty);
```

* `for (const a of arrays)` — repeat for every array object in the list (`array1`, `array2`, `array3`).
* `if (g.arrays[a.id] === 'ok')` — only arrays in the `'ok'` state count (not `'broken'` or `'stowed'`).
* The formula: base 3.2 kW × level scale × sunlight × (1 − 0.75 × dust cover) × (1 − storm damage penalty).
* `prod += …` adds to the running total.

**Another loop style** — `.filter`, `.map`, `.every`, `.reduce`:

```js
const arrOk = (g) => Object.values(g.arrays).filter((s) => s !== 'broken').length;
```
`Object.values` gets the values of an object as an array; `.filter` keeps the matching ones; `.length` counts them.

**What if I change it?** Change `'ok'` to `!== 'broken'` and stowed arrays would produce power during storms — wrong, and tests would catch it.

**Practice:** with dust 0.4, sun 0.43, one array, scale 1, no storm penalty: output = 3.2 × 0.43 × (1 − 0.3) = 0.963 kW. Verify.

---

## 3.6 Arrays

An array is an ordered list: `[a, b, c]`. Examples: `LEVELS` (7 level objects), `arrays` in `world.js` (3 arrays), `g.decisions` (every decision you made), `g.toasts` (messages on screen).

```js
export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[0];
```
* `.find` returns the first element for which the arrow function is true; `|| LEVELS[0]` is a safe fallback to level 1 if the id doesn't exist.

```js
g.toasts.push({ id: g.nextToastId++, title, text, kind, ttl });
while (g.toasts.length > 4) g.toasts.shift();
```
(from `toast()` in `core.js`) — `push` adds to the end; `shift` removes from the front; the `while` keeps at most 4.

**Practice:** how would you make the game show 6 toasts instead of 4? (Change `4` — and check the CSS can show them.)

---

## 3.7 Objects, and "the big object `g`"

An object is a collection of named values. The most important object in the game is **`g`**, built by `createMission` in `state.js`. A trimmed look:

```js
const g = {
  phase, time: 0, level, planet: level.planet, env, diff, profile, sevMul: diff.sev * level.sev,
  player: { x: START.x, y: 0, z: START.z, vy: 0, vx: 0, vz: 0, yaw: START.yaw, pitch: 0, onGround: true, … },
  health: 100, oxygen: st.oxygen, o2res: …,
  res: { water: …, food: …, battery: …, materials: … },
  …
};
```

* `g.res.water` — dot notation walks into nested objects.
* **Why one big object?** It is the single source of truth ("state"). Every system reads and writes it. To save/inspect/test the game you only need `g`. The unit tests create a mission and poke `g` directly.
* **Spread syntax** `{ ...profileIn, difficulty }` copies an object's properties into a new one.

**What if I change it?** If you add a new resource you must add it to `g`, to `RES_KEYS`, to `addRes`'s `MAXV`, to the HUD, to `computeEnd`… That is why chapter 6 shows the full checklist.

**Practice:** open the browser console with `?debug` in the URL and type `__lunar.game.res` to see the live object.

---

## 3.8 Classes

A class is a blueprint for objects that have both data and methods. Three classes in the project: **`Engine`** (`Engine.js`), **`Viewmodel`** (`hands.js`), **`Sfx`** (`audio.js`), and **`MeshBuilder`** (`geo.js`).

```js
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; this.stormOn = false; this.lastStep = 0; }
  start() { … }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; }
```

* `constructor` runs once at `new Sfx()` and creates the starting fields.
* `this` means "this particular object".
* `start()` creates the Web Audio context — browsers only allow this after a user gesture (that's why it's called inside `begin()`).
* Note that **the simulation in `src/game` has no classes** — it uses plain objects and functions, which are simpler to test.

**What if I change it?** Remove the `if (this.master)` check and calling `setMuted` before `start()` would crash (`this.master` is undefined until `start`).

**Practice:** where is `new Engine(...)` called? (`App.jsx`.)

---

## 3.9 Imports, exports and modules

Each file is a **module** with private variables. You choose what to share with `export`, and other files bring it with `import`.

```js
// core.js
export const CFG = { … };
// state.js
import { CFG, SHIELD, DIFF, … } from './core.js';
```

* `./core.js` means "the file next to me". `../game/state.js` means "go up a folder, then into game".
* **Named exports** (`export const x`) are imported with braces. **Default exports** (`export default`) without: `import App from './App.jsx'`.
* `state.js` also **re-exports** (`export { CFG, SHIELD, toast, … }`) so that `Engine.js` can import many things from just one place.
* `import * as THREE from 'three'` imports everything from the library as an object called `THREE`.
* The file name ends in `.js`/`.jsx` in our imports — required by Node's module system (the tests rely on it).

**What if I change it?** A typo in an import path gives the error "Failed to resolve import …" in Vite or `ERR_MODULE_NOT_FOUND` in Node. An *unused* import is only a warning in most tools; a *missing* named export gives "does not provide an export named …".

**Practice:** find where `levelById` is exported and where it's imported.

---

## 3.10 Arrow functions

```js
const nearest = (list, g) => list.reduce((b, c) => (!b || Math.hypot(c.x - g.player.x, c.z - g.player.z) < Math.hypot(b.x - g.player.x, b.z - g.player.z) ? c : b), null);
```

* `(list, g) => …` is an **arrow function**: parameters, `=>`, result.
* `.reduce` walks through the list keeping the "best so far" `b`; `c` is the current element. `Math.hypot(dx, dz)` is the straight-line distance. So `nearest` returns the closest item to the player.
* Arrow functions are everywhere in `levels.js`: each objective has `(g) => …` functions for `progress` and `done`:

```js
ob('samples', 'Collect 3 regolith samples (blue glow) for materials',
   (g) => `${Math.min(3, g.collectedTotal)}/3`,     // progress text
   (g) => g.collectedTotal >= 3,                      // done?
   { target: sampleTarget })                           // compass target
```

This is a powerful design: **a level is data that contains small functions.** The engine just calls `o.done(g)` each tick.

**Practice:** change "3" to "2" in both places of one objective (don't ship it!) and see the HUD change. Then undo.

---

## 3.11 Events and callbacks

**Simple:** an *event* is something that happens (key pressed, button clicked). A *callback* is the function you give to be called when it happens.

```js
const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); this._off.push(() => t.removeEventListener(type, fn, o)); };
on(window, 'keydown', (e) => this._key(e, true));
on(window, 'keyup', (e) => this._key(e, false));
```

* `addEventListener('keydown', fn)` — the browser calls `fn(e)` whenever a key goes down; `e.code` is the physical key (`'KeyW'`).
* The helper `on` also stores an "undo" function in `this._off`, which `dispose()` runs, so listeners don't pile up if the engine is recreated.
* `requestAnimationFrame(this._frame)` is also a callback: "call me before the next screen repaint".

```js
_key(e, down) {
  const c = e.code;
  if (GAME_KEYS.has(c) && this.game.phase === 'playing') e.preventDefault();
  if (down) this.keys.add(c); else this.keys.delete(c);
  if (down && c === 'KeyE' && !e.repeat) this.eTap = true; // survives a tap shorter than one frame
```

* `preventDefault()` stops the browser from scrolling the page when you press Space.
* `this.keys` is a `Set` of currently held keys; the loop checks `k.has('KeyW')`.
* `!e.repeat` ignores the automatic repeats while a key is held.
* `eTap` solves a real bug class: a very quick tap could begin and end between two frames and be missed — so `keydown` also sets a flag.

**React callbacks:** `onClick={() => engine.startLevel(l.id)}` in `Screens.jsx`.

**Practice:** why does `blur` (window loses focus) call `this.keys.clear()`? (Otherwise a key released while you were in another window would stay "stuck" down.)

---

## 3.12 Asynchronous code and promises (only a little)

Most of the game is synchronous. The only promise-like code:

```js
try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* lock is optional: drag-to-look still works */ }
```

* `requestPointerLock()` may return a promise in some browsers and `undefined` in others; if it's a promise and it fails, `.catch(() => {})` quietly ignores the failure.
* The fullscreen code uses `p.then(lockOrient).catch(() => {})`.
* The test scripts use `await` heavily (`await pg.waitForFunction(...)`) — that's async code inside Playwright tests.

**Why it matters:** if you forget `.catch`, a refused pointer lock could print "Uncaught (in promise)" errors in the console.

---

## 3.13 Error handling — `try` / `catch`

```js
export function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) return { profile: { ...DEFAULT_PROFILE, ...raw.profile }, progress: { ...emptyProgress(), ...raw.progress } };
  } catch { /* storage unavailable */ }
  return { profile: { ...DEFAULT_PROFILE }, progress: emptyProgress() };
}
```

* `localStorage` can throw (private browsing, blocked storage) and `JSON.parse` can throw (corrupted data). The `catch` makes the game **start fresh instead of crashing**.
* `{ ...DEFAULT_PROFILE, ...raw.profile }` merges saved data *over* the defaults, so an old save missing a new field still works.

In `App.jsx`, creating the `Engine` is wrapped in `try/catch`, so a browser without WebGL shows a friendly panel instead of a blank page.

**Practice:** in the browser console run `localStorage.setItem('junior-astronaut-3d-v2','not json')` then reload — the game should still start (it falls back to defaults). Then `localStorage.removeItem('junior-astronaut-3d-v2')` to clean up.

---

## 3.14 State management and updating the interface

**Two separate states exist:**

1. **Game state** — the object `g` in `Engine.game` (mutated in place 60 times a second).
2. **React state** — `const [snap, setSnap] = useState(null)` in `App.jsx`.

React does **not** watch `g` (it changes too fast, and React only re-draws when told). Instead the Engine builds a **snapshot** ~15 times a second:

```js
this.snapT += dt;
if (this.snapT > 1 / 15) { this.snapT = 0; this._emit(); }
```

and `_emit()` calls `this.onSnapshot(snap)`, which is `setSnap`. React then re-renders `Hud` etc. from the new `snap`. Important events (`phase` changes, starting a level, pausing…) call `this._emit(true)` directly, so menus don't wait for the next 1/15 s tick. (Small curiosity I verified: `_emit()` is declared without any parameter, so the `true` you see in those calls is simply ignored — the "immediately" comes from calling `_emit` straight away, not from the `true`.)

```js
const snap = {
  phase: g.phase, time: g.time, limit: lvl.limit * g.diff.limit,
  …
  health: g.health, oxygen: g.oxygen, o2res: g.o2res, res: { ...g.res }, …
};
```

Notice `res: { ...g.res }` — a **copy**. If you handed React the live object it could change mid-render.

**What if I change it?** Raising the 15 to 60 makes the HUD smoother but costs CPU. Lowering to 5 makes bars jumpy.

**React's `useEffect`** (`Event.jsx`) attaches a key listener while an event dialog is open and returns a cleanup function that removes it:

```js
useEffect(() => {
  if (!view) return undefined;
  const onKey = (e) => { … };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [view, engine]);
```

The array `[view, engine]` says "re-run this effect only if one of those changes".

---

## 3.15 How keyboard and mouse input reach the game

Full chain for mouse look:

1. `document` `mousemove` → if the pointer is locked (or you are dragging), add `e.movementX/Y` to `this.mdx/mdy`.
2. Each frame `_look()` does `p.yaw -= this.mdx * 0.0022 + …` and `p.pitch = clamp(p.pitch - this.mdy * 0.0022 …, -1.45, 1.45)` then resets `mdx/mdy` to 0.
3. `_cameraPose()` sets the camera rotation from `p.pitch/p.yaw`.

The **sensitivity** is the constant `0.0022` radians per mouse count. The pitch clamp 1.45 rad (~83°) prevents flipping upside-down.

**Practice:** make the mouse twice as sensitive (change both `0.0022`s), then undo.

---

## 3.16 How functions in different files communicate

Three ways:

1. **Direct calls through imports** — `Engine._sim` calls `step(g, dt)` from `state.js`.
2. **Shared data** — `world.js` exports arrays (`colliders`, `boulders`) that are **mutated in place** by `configureWorld(planet)`; every file that imported them sees the change. This is why `Engine._buildPlanet` must be called *after* `createMission`, otherwise the 3D rocks would be built from the previous planet's data.
3. **Message queue** — `g.events` is an array of small events (`emit(g, 'collect', id)`). Systems that care (`mateReact`, the Engine's sound code) read and then clear it: `g.events.length = 0` at the end of `_sim`.

```js
for (const ev of g.events) { if (ev.type === 'alarm') {…} else if (EVENT_SOUND[ev.type]) this.sfx.play(EVENT_SOUND[ev.type]); }
g.events.length = 0;
```

That decoupling means `state.js` can say "a repair happened" without knowing anything about audio.

---

## 3.17 A note about JSX

`.jsx` files mix JavaScript and HTML-like tags:

```jsx
<span className={`strip-item ${tone(v)}`}><span>{n}</span><Meter value={v} label={n} tone={tone(v)} /><b>{Math.round(v)}</b></span>
```

* `{ … }` inserts a JavaScript expression.
* `className` (not `class`) — because `class` is a JavaScript keyword.
* `<Meter … />` is your own component (a function returning JSX).
* `key={…}` on list items helps React track which item is which.

Vite + `@vitejs/plugin-react` turn this into ordinary JavaScript at build time.

---

## Check yourself — Chapter 3

1. In `Engine.js`, what do `WALK`, `SPRINT` and `JUMP` measure, and in what units?
2. Why does the suit-oxygen formula multiply by `dt`?
3. `const o = { a: 1 }; o.a = 2;` — allowed or error? Why?
4. What does `Object.values(g.arrays).filter((s) => s !== 'broken').length` compute?
5. What is the purpose of the `eTap` flag?
6. Why does `loadSave()` use `try/catch`?
7. Why does the snapshot copy `g.res` with `{ ...g.res }`?
8. Name the three ways code in different files communicate in this project.
9. Which constant controls mouse sensitivity?
10. Why must `_buildPlanet` run after `createMission`?

**Small exercises (change, observe, undo):**

* E3.1 In `core.js` change `CFG.drainOutside` from `0.16` to `0.32` and start level 1. Watch suit oxygen. Undo. *Expected: suit O₂ falls twice as fast outside.*
* E3.2 In `levels.js` change level 1's `start.materials` from `0` to `10`. *Expected: the briefing and HUD show 10 materials.* Undo.
* E3.3 Open the browser console on `?debug` and run `__lunar.game.res.water = 5`. *Expected: the water bar drops and the water warning appears soon.* Reload to undo.

*Answers: `17-answers.md`, "Chapter 3".*
