# Chapter 2 — Folder Structure and Every Important File (Part 2)

## 2.1 The real folder tree

```
lunar_outpost/
├── index.html              the one HTML page
├── package.json            project description + scripts + dependencies
├── package-lock.json       (NOT present yet — created by your first `npm install`)
├── vite.config.js          build-tool configuration
├── .gitignore              what Git should not track
├── README.md               the user-facing readme (not part of this course)
├── .github/workflows/deploy.yml   GitHub Actions: test → build → deploy
├── public/                 EMPTY (no static assets)
├── course/                 this study course (new, added for you)
├── src/
│   ├── main.jsx            entry point (5 lines)
│   ├── App.jsx             top React component (69 lines)
│   ├── styles.css          all CSS (336 lines)
│   ├── data/missionData.js data carried over from the Streamlit version
│   ├── game/               PURE game logic (no drawing)
│   ├── engine/             Three.js: rendering, input, sound, hands
│   └── ui/                 React components: HUD, menus, console, events, report
└── tests/                  automated tests + test helpers
```

Generated or installed folders that **do not exist until you create them**, and which you should never edit by hand:

| Folder | Created by | Why not edit |
|--------|-----------|--------------|
| `node_modules/` | `npm install` | Downloaded libraries. Any change is lost the next install, and it contains thousands of files. |
| `dist/` | `npm run build` | The generated production site. Edit the source, then rebuild. |
| `tests/dist-test/` | `node tests/build-local.mjs` | A test bundle made with a fake Three.js. |
| `tests/shots/` | the browser tests | Screenshots (67 files in my workspace). |

`.gitignore` already contains `node_modules`, `dist`, `tests/dist-test`, `tests/shots`, `*.log` and `.DS_Store`, so Git will not upload them.

### Four kinds of change — do not confuse them

| Kind | Example in our project | Risk |
|------|------------------------|------|
| **Editing a source file** | change `CFG.drainOutside` in `core.js` | Normal work. Test afterwards. |
| **Editing an asset** | (we have none — no images/sounds/models) | Not applicable here. |
| **Changing configuration** | `vite.config.js`, `package.json`, `deploy.yml` | Can break the build or the deployment even if the game code is fine. |
| **Modifying installed dependencies** | editing a file in `node_modules/three/` | **Never.** It will be silently overwritten and cannot be shared through Git. |

## 2.2 File categories (quick map)

| Category | Files |
|----------|-------|
| **Essential to run** | `index.html`, `src/main.jsx`, `src/App.jsx`, everything in `src/engine`, `src/game`, `src/ui`, `src/styles.css`, `src/data/missionData.js` |
| **Configuration** | `package.json`, `vite.config.js`, `.gitignore`, `.github/workflows/deploy.yml` |
| **Gameplay logic** | `src/game/state.js`, `events.js`, `levels.js`, `companion.js`, `core.js`, `profile.js` |
| **Create the 3D world** | `src/engine/world3d.js`, `geo.js`, `src/game/terrain.js`, `src/game/world.js` (layout data), `hands.js` |
| **Interface and controls** | `src/engine/Engine.js` (input), `src/ui/*.jsx`, `src/styles.css`, `App.jsx` |
| **Mission and event data** | `src/game/levels.js`, `src/game/events.js`, `src/data/missionData.js` |
| **Scoring and progress** | `computeEnd()` in `state.js`, `GRADE_POINTS` in `core.js`, `profile.js` (`recordResult`) |
| **Automated testing** | everything in `tests/` |

## 2.3 Entry and configuration files

### `index.html`
* **Purpose:** the only HTML page. Sets the title "Junior Astronaut - Lunar Outpost", viewport meta tag, a `<div id="root">` and loads `/src/main.jsx` as a module.
* **Receives/changes:** nothing. **Depends on:** `src/main.jsx`.
* **If you change it:** page title, language, meta tags (e.g. add an icon link).
* **Edit example:** changing the browser tab title for the competition.

### `package.json`
* **Purpose:** the project's identity card. `"type": "module"` makes every `.js` file an ES module (so `import`/`export` work in Node too — that's what allows the tests to import `src/game/*.js` directly).
* **Scripts** [verified]: `dev` = `vite`, `build` = `vite build`, `preview` = `vite preview`, `test` = `node --test tests/logic.test.mjs`, `test:browser` = `node tests/e2e.mjs`.
* **Edit example:** adding a new script such as `"lint": …`. Do **not** hand-edit versions without understanding the consequences (chapter 9).

### `vite.config.js`
```js
export default defineConfig({
  base: process.env.BASE_PATH || './',
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: { chunkSizeWarningLimit: 1200 },
});
```
* `base: './'` makes links relative, so the built site works from `https://user.github.io/<repo>/`. Without it the page would try to load `/assets/…` from the domain root and show a blank page on GitHub Pages.
* `plugins: [react()]` lets Vite transform JSX.
* `server: { host: true, port: 5173 }` — dev server on port 5173 and reachable from other devices on your network.
* `chunkSizeWarningLimit: 1200` — silences the "bundle is large" warning up to 1200 kB (Three.js is big).

### `.github/workflows/deploy.yml`
Two jobs: **build** (checkout → Node 20 → `npm ci` or `npm install` → `npm test` → `npm run build` → upload `dist`) and **deploy** (publish to GitHub Pages). It triggers on every push to `main`, or manually (`workflow_dispatch`). Because `npm test` runs inside it, **a failing logic test stops the deployment** — a safety net.

## 2.4 `src/main.jsx` and `src/App.jsx`

### `main.jsx`
Five lines: import React's `createRoot`, import `App`, import `./styles.css`, render `<App />` into `#root`.

### `App.jsx`
* **Purpose:** connects React to the Engine.
* **Key parts:**
  * `useRef` for the mount `<div>` and the engine; `useState` for the latest **snapshot** (`snap`), an `error`, and which title sub-screen (`view`: main / levels / crew).
  * `useEffect(() => { …new Engine(...)… return () => engine.dispose(); }, [])` — runs once when the page loads; the returned function runs when it is removed (cleanup).
  * It reads URL flags: `?quality=`, `?scale=`, `?noshadow`, `?noaa`, `?debug` (the last one exposes `window.__lunar = engine` for tests and debugging).
  * Chooses which screen component to show from `snap.phase`: `title` → `<Title>`, `briefing` → `<Briefing>`, `paused` → `<Pause>`, `console` → `<Console>`, `decision` → `<Decision>`, `success`/`failure` → `<EndReport>`; the `<Hud>` shows during `playing/paused/console/decision`.
  * Sets `data-phase` and `data-planet` attributes on the root `<div>`; the CSS uses `data-planet='mars'` to switch to orange accents.
  * If creating the Engine throws (no WebGL), it shows a "3D graphics unavailable" panel.
* **Depends on:** `Engine`, every `ui/*.jsx`.
* **Affected if changed:** which screens appear and when.
* **Edit example:** add a new screen for "Credits".

## 2.5 `src/game/` — the rules of the world (pure logic)

### `math.js` (55 lines)
* **Purpose:** tiny reusable helpers.
* **Functions:** `clamp(v,a,b)`, `lerp(a,b,t)`, `smoothstep(a,b,x)` (an S-shaped ramp from 0 to 1), `mulberry32(seed)` (a seeded random number generator — same seed, same sequence, so the world is the same every time), `makeNoise(seed)` returning `{ noise, fbm }` (smooth random bumps used for terrain), `norm3`, `angleDiff`.
* **Used by:** nearly everything. **Edit example:** almost never; change only if a helper is wrong.

### `core.js` (115 lines) — *the tuning knobs*
* **Purpose:** shared constants and small helpers.
* **Important items:**
  * `CFG` — **all the numbers that decide how fast things drain or charge** (drain rates, loads in kW, storm radiation, repair costs…). Chapter 6 explains each.
  * `SHIELD = { outside: 0, habitat: 0.55, shelter: 0.9 }` — fraction of radiation blocked.
  * `DIFF` — easy / normal / hard multipliers.
  * `GRADE_ORDER`, `GRADE_LABEL`, `GRADE_POINTS`, `RES_KEYS`, `RES_NAMES`.
  * Functions: `addRes(g,key,delta)` (change a resource with floor/ceiling and a ledger), `hurt`, `heal`, `toast`, `radio`, `say`, `emit`, `bonuses(g)`, `weightOn(mass, gravity)`.
  * `ROLES` (5 astronaut roles) and `TEAMMATES` (5 named companions).
* **Receives:** the game object `g`. **Changes:** `g.res`, `g.health`, `g.toasts`, `g.radio`, `g.events`.
* **Affected if changed:** the difficulty of the **entire** game.
* **Edit example:** the game feels too hard → reduce `CFG.drainOutside`.

### `levels.js` (222 lines)
* **Purpose:** defines the **7 levels** as data.
* **Items:** `MOON` and `MARS` environment objects (gravity, base radiation, sun, ambient temperature, text facts), the `LEVELS` array, `levelById(id)`, `MAX_LEVEL`.
* **One level object contains:** `id, planet, name, tagline, rank, sev, timerMul, par, limit, story[], teaches[], tips[], env, start{…}, timeline[], objectives[], lessons[], hintFn`, and optionally `win`, `failIf`, `surviveAt`, `sunset`, `stormSeconds`, `canStow`, `arrayScale`, `onHazardEnd`.
* **Depends on:** `world.js` (positions for objective compass targets).
* **Affected if changed:** a level's story, starting resources, events and win rule.
* **Edit example:** give level 3 more starting water.

### `events.js` (293 lines)
* **Purpose:** the **13 emergency events** and the machinery that runs them.
* **Items:** `EVENTS` (object keyed by event id), `startEvent`, `tickEvent`, `resolveEvent`, `continueEvent`, `eventView`, `gradeStormChoice` (the old rule-table grader for the solar storm), `STORM_INTENSITY`, `ON_START`.
* **Each event:** `{ id, name, icon, alert, timer, hint, problem(g), choices[4], science }`; each choice is `{ id, text, run(g) }` where `run` returns `R(grade, why, consequence)` after changing state.
* **Depends on:** `missionData.js` (only the solar storm), `core.js`, `math.js`.
* **Edit example:** change a consequence number, or add a fourteenth event (chapter 7).

### `state.js` (569 lines) — *the simulation*
* **Purpose:** the heart of the game. Creates a mission and advances it one tick.
* **Main functions:**
  * `createMission(levelId, profile, difficulty, phase)` — builds the huge game object `g`.
  * `step(g, dt)` — one simulation tick. Calls `runTimeline`, `updatePower`, `updateLife`, `updateHazard`, `updateBody`, `mateStep`, `trackStats`, `warnings`, `updateObjectives`, then the end-condition checks.
  * `describeTarget(g, it)` and `interact(g, it)` — what a thing in the world says and does when you use it.
  * Console functions: `toggleSystem`, `toggleRation`, `deploy`, `consoleView`, `closeConsole`.
  * `nextTarget` + `bearingTo` — compass.
  * `computeEnd(g, success)` and `pickLessons` — score, stars and report.
  * Wrapper functions used by the engine: `tickDecision`, `chooseOption`, `continueAfterDecision`.
* **Receives:** `g` and `dt`. **Changes:** nearly every field in `g`. **Returns:** mostly nothing (it mutates `g`); `computeEnd` returns the report object.
* **Depends on:** `levels.js`, `events.js`, `companion.js`, `core.js`, `world.js`, `profile.js`, `missionData.js`.
* **Affected if changed:** everything about gameplay. **Edit example:** change how fast the habitat cools (`CFG.thermalDrift`, or the formula in `updateLife`).

### `companion.js` (136 lines)
* **Purpose:** the teammate: movement, taking cover, radiation exposure, radio lines.
* **Functions:** `createMate`, `mateStep(g,dt)` (goal choice → path → movement → collision → radiation/recovery), `mateReact(g)` (radio lines after events like `collect`, `repair`), `mateWatch(g)` (threshold warnings), `mateAdvice(g)` (what you hear when you press E on her/him), `hazardActive`.
* **Edit example:** change the text of a radio line.

### `world.js` (167 lines) — *the layout*
* **Purpose:** *where things are*. Pure data used by both the logic and the 3D engine.
* **Items:** `rooms` (habitat and shelter), `arrays` (3 solar arrays), `sampleSpots` (8 spots), `equipment` (oxygen generator, recycler, scrubber, desk, table, thermal unit), `greenhouse`, `battery`, `leaks`, `shelterBox`, `rover`, `tanks`, `mast`, `lander`, `interactables` (list of everything E can target), `boulders`, `colliders`, `configureWorld(planet)`, `roomAt(x,z)`, `resolveCollisions(x,z,radius)`.
* **Edit example:** move the rover; both its picture and its collision box follow, because both read `rover` from here.

### `terrain.js` (98 lines)
* **Purpose:** `heightAt(x, z)` — the ground height at any point. Both walking and rendering use it.
* **Items:** `setTerrainPlanet(planet)`, craters lists for Moon and Mars, `craterOffset`, `rawHeight`, `craterFactor`, constants `BASE_FLAT_R = 44`, `BASE_BLEND_R = 100`, `WORLD_RADIUS = 640`.

### `profile.js` (38 lines)
* **Purpose:** the player's profile (name, role, weight, height, teammate, difficulty) and campaign progress saved in `localStorage` under the key `junior-astronaut-3d-v2`.
* **Functions:** `loadSave`, `saveGame`, `sanitizeProfile` (validates and clamps input; removes `<` `>` from names), `recordResult` (unlock next level on success, keep best score/stars).

### `src/data/missionData.js` (563 lines)
* **Purpose:** data exported from the earlier Streamlit version. **Only parts are used today** [verified by grep]: `solarStorm` (the storm event text, choices and grading rules), `lessons` (15 science lessons), `failureReasons.health`, `scoring.labels`, `scoring.stars`. The rest (`buildings`, `moon`, `rules`, `scoring.weights`) is unused.

## 2.6 `src/engine/` — drawing and input

### `Engine.js` (571 lines) — *the conductor*
* **Purpose:** owns Three.js, input, the main loop, interaction targeting, visuals that mirror state, and the React snapshot.
* **Class `Engine`; key methods:** constructor, `_buildPlanet`, `_applyMission`, `startLevel`, `begin`, `restart`, `nextLevel`, `toTitle`, `pause/resume`, the console and event wrappers, `_bind`/`_key` (input), `_frame`, `_update`, `_look`, `_sim` (movement + gravity + calls `step`), `_interaction`, `_cameraPose`, `_visuals`, `_render`, `_emit` (snapshot).
* **Constants at the top:** `RADIUS = 0.45`, `WALK = 3.4`, `SPRINT = 6.2`, `JUMP = 2.8`, `FOV = 72`.
* **Depends on:** nearly everything. **If changed:** controls, camera, feel.

### `world3d.js` (745 lines)
* **Purpose:** builds every 3D object. **Functions:** `buildTerrain`, `buildRocks`, `buildMoonSky`, `buildMarsSky`, `buildSky`, `roomMeshes`, `addHabitatInterior`, `buildArray`, `buildRover`, `buildMisc`, `buildSample`, `buildGreenhouse`, `buildLeaks`, `buildBatteryBank`, `buildThermalUnit`, `buildShelterBox`, `buildComm`, `buildMate`, and the exported **`buildWorld(quality, planet)`**, which assembles them and returns handles (`arrayViews`, `sampleViews`, `anim`, `setWeather`, `dispose`, …) for the Engine to animate.
* **Edit example:** change the colour of the Mars sand in the `PLANET` palette at the top.

### `geo.js` (152 lines)
`MeshBuilder` — a helper that collects triangles with a colour per vertex: methods `tri`, `quad`, `box`, `cyl`, `sphere`, `rock`, `build()`; plus `mat()`, `basic()`, `meshOf()`.

### `hands.js` (157 lines)
`Viewmodel` — the first-person gloves, tools (wrench, scanner, sampler) and wrist display, drawn in a **second scene** on top of the world so they never poke into walls.

### `audio.js` (79 lines)
`Sfx` — procedural sound with the Web Audio API: breathing, hum, footsteps, tool and alarm sounds. Starts only after a user click (browser rule).

## 2.7 `src/ui/` — React components

| File | Component(s) | Job |
|------|--------------|-----|
| `common.jsx` | `Meter`, `Stars`, `PlanetBadge`, `DiffBadge`, `GradeChip`, `Rank`, `Kbd`, `ControlsList` + helpers (`tone`, `fmtTime`, …) and constants (`CONTROLS`, `DIFF_TEXT`) | Small shared building blocks |
| `Hud.jsx` | `Hud` (+ `Compass`, `Vital`, `CrewPanel`) | Objectives, vitals, chips, toasts, radio, prompt, crosshair |
| `Screens.jsx` | `Title`, `LevelSelect`, `CrewScreen`, `Briefing`, `Pause` | Menus before and between play |
| `Console.jsx` | `Console` | The systems console overlay |
| `Event.jsx` | `Decision` (+ `StatusStrip`) | The emergency dialog: timer, A–D, result |
| `EndReport.jsx` | `EndReport` | The full mission report |
| `TouchControls.jsx` | `TouchControls` | Phone controls |

All of them **receive `snap` (the snapshot) and `engine`** as props. They read numbers from `snap` and call methods like `engine.startLevel(id)`.

## 2.8 `tests/`

| File | Role |
|------|------|
| `logic.test.mjs` | 25 pure-logic tests — the safety net (chapter 10) |
| `e2e.mjs` | Full browser test (44 checks) |
| `ui-test.mjs`, `smoke.mjs` | Older/smaller browser scripts (I did not re-run these in the final pass) |
| `world-shots.mjs`, `build-world.mjs`, `world-entry.js` | Render the 3D world to screenshots for visual inspection |
| `three-shim.js` | **Test-only** stand-in for Three.js (not part of the game) |
| `build-local.mjs`, `serve.mjs` | Bundle the test build and serve it |

## 2.9 Who depends on whom (dependency summary)

```
levels.js ──► world.js ──► terrain.js ──► math.js
events.js ──► core.js ──► math.js
state.js  ──► levels, events, companion, core, world, profile, missionData
companion.js ──► world, terrain, core, math
profile.js ──► core.js
Engine.js ──► state, profile, core, world, terrain, math, world3d, hands, audio, three
world3d.js ──► geo, terrain, world, math, three
ui/*.jsx ──► core, levels, profile, common   (and receive `engine` as a prop)
```

A very useful habit: **before you change a file, ask "who imports it?"** In an editor, search the project for its name (VS Code: Ctrl/Cmd + Shift + F).

## Check yourself — Chapter 2

1. Which file holds `CFG`, and why is it the first place to look if the game feels too hard?
2. If you move the rover's position in `world.js`, why do both the picture and the collision change?
3. Why must you never edit files inside `node_modules/`?
4. Which two things does `package.json` define that decide what `npm test` does?
5. Which sections of `missionData.js` does the game still use?
6. Name three methods of `Engine` that React components call.
7. What does `base: './'` in `vite.config.js` fix?

*Answers: `17-answers.md`, "Chapter 2".*
