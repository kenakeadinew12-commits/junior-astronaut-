# Lunar Outpost (flat layout)

This copy has **every file in one folder** (no subfolders) so it can be uploaded through GitHub's website. File groups:

| Files | What they are |
|---|---|
| `index.html`, `main.jsx`, `App.jsx`, `styles.css`, `Hud.jsx`, `Screens.jsx`, `Console.jsx`, `Event.jsx`, `EndReport.jsx`, `Intro.jsx`, `Comms.jsx`, `TouchControls.jsx`, `common.jsx` | React interface |
| `Engine.js`, `world3d.js`, `geo.js`, `hands.js`, `audio.js`, `speech.js` | Three.js engine, 3D world, sound, speech |
| `core.js`, `levels.js`, `events.js`, `state.js`, `crisis.js`, `contacts.js`, `companion.js`, `profile.js`, `terrain.js`, `world.js`, `math.js`, `missionData.js` | Pure game logic (7 levels) |
| `package.json`, `vite.config.js`, `.gitignore`, `.nojekyll` | Project configuration |
| `logic.test.mjs`, `gameplay.test.mjs`, `test-*.mjs`, `test-*.js` | Tests (`npm test` runs the logic tests) |
| `github-workflow-deploy.yml` | GitHub Pages workflow. It only works if placed at `.github/workflows/deploy.yml` (see `GITHUB-UPLOAD-STEPS.md`) |
| `course-*.md` | Study-course chapters 0-5 (written for the original folder layout, so their file paths are outdated; chapters 6-18 were never written) |

Run: `npm install`, then `npm run dev`. `package-lock.json` does not exist yet: `npm install` creates it, and you should upload it afterwards.
Browser tests write screenshots and bundles into a generated `test-output/` folder (ignored by git). They need `npm install` first; set `PLAYWRIGHT_PATH`/`ESBUILD` only if your tools live elsewhere.

# Junior Astronaut Mission Trainer — Moon & Mars Outposts (first-person 3D)

A full-screen, first-person 3D survival game for the NASA Space Apps Challenge.
Stack: **Vite + React + Three.js** (procedural geometry only, no external assets).

**Exactly seven missions, getting harder each time:** five on the Moon, then two on Mars.

| # | Planet | Mission | What is new / what you must handle | Difficulty |
|---|--------|---------|-------------------------------------|-----------|
| 1 | Moon | **First Steps on the Moon** | Walk, sample regolith, inspect life support, open the systems console, refill suit oxygen; one gentle event | 1/5 |
| 2 | Moon | **Power Restoration** | No power: the habitat cools and its air falls. Repair arrays with scarce materials, restore the breaker, keep supply ≥ demand | 2/5 |
| 3 | Moon | **Life-Support Emergency** | Oxygen generator broken, recycler stuck, a burst pipe, an injury. Triage with limited materials until the supply drone arrives | 3/5 |
| 4 | Moon | **Solar Storm** | Stow arrays, check the shelter, make a timed storm decision, shelter (90 %) vs habitat (55 %), repair what the storm damaged | 3/5 |
| 5 | Moon | **Lunar Outpost Emergency** | Everything at once, plus lunar night: five timed events, load shedding, battery failure, leaks, comm loss, injury | 4/5 |
| 6 | Mars | **First Mars Expedition** | New world: weak sun (≈43 %), dust on panels, CO₂-based oxygen, ice samples, build the greenhouse and grow food without a blackout | 4/5 |
| 7 | Mars | **Mars Survival Emergency** | A dust storm cuts sunlight to a few percent while the base fails (thermal, leaks, injury). Combine every lesson, no spare materials | 5/5 |

Completing a level unlocks the next one. Any unlocked level can be replayed; best stars/score are kept (browser `localStorage`).
Easy / Intermediate / Hard scale starting resources, event severity, decision time and mission length.

## What is in the game

* **Resources with consequences:** suit oxygen, habitat oxygen, water, food, battery energy, materials, health, radiation dose, habitat temperature, CO₂, sunlight, local gravity, and your astronaut's weight/height. Nothing goes below 0 without a defined rule (running out of something damages health, trips a blackout, or fails the mission).
* **Energy is a budget:** solar arrays (sun × dust × storm) feed a battery; loads are base electronics, oxygen generator, CO₂ scrubber, thermal control, water recycler and greenhouse. When demand exceeds supply the battery drains; at zero a brown-out sheds loads in priority order. You manage it in the **systems console** (toggle systems, ration supplies, build the greenhouse), where every trade-off is shown (cost, benefit, time-to-empty).
* **Buildings and equipment, introduced progressively:** habitat, oxygen refill station (glowing cyan, just inside the habitat door: hold **E** to refill your suit from the habitat reserve), solar arrays + battery bank, oxygen generator, water recycler, CO₂ scrubber, thermal control, greenhouse (Mars), radiation shelter, rover, comm mast, repairable equipment and leaks.
* **No in-world characters:** the astronaut follower and the robot were removed. Mission Control (three fictional, simulated contacts) is reachable only through the comms panel (press **C**).
* **Event system:** EVENT → PROBLEM → TIMER → FOUR CHOICES → EVALUATION (perfect / good / acceptable / wrong) → CONSEQUENCE → SCIENCE. 13 events (solar storm, resource discovery, water leak, oxygen leak, panel dust, equipment overload, battery failure, thermal failure, comm failure, injury, low sunlight, dust storm, rover problem). The grade depends on the situation (same choice, different grade when you are rich or poor in materials, on the Moon or on Mars). A timeout counts as the last choice, one grade worse.
* **End report:** success/failure, why, health of you and the companion, remaining resources, radiation dose and temperatures, local weight vs Earth weight, key events and decisions, best and most costly decision, resources gained and lost, score breakdown, stars, science lessons, replay / next mission.
* **Mars looks and plays differently:** rust-coloured dunes, butterscotch sky, small Sun, no Earth, two tiny moons, drifting dust, dust-storm haze; gravity 3.71 (jumps are shorter, walking slightly slower), weaker sunlight, dust that coats panels, oxygen from CO₂, ice in the soil.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build -> dist/
npm run preview      # serve dist/ locally
npm test             # pure game-logic tests (Node, no browser)
```

Controls: **WASD / arrows** move, **mouse** look (click to capture the pointer), **Shift** sprint, **Space** jump,
**E** interact (hold for repairs/sampling/inspection; tap for console/talk), **1/2/3** tool, **Tab** crew panel,
**Esc/P** pause, **F** fullscreen, **M** mute. Event dialogs: click or press **A–D** / **1–4**.
Touch devices (landscape): left stick, right-side look pad, USE / JUMP / RUN buttons.
Debug URL flags: `?quality=0.5`, `?scale=0.5`, `?noshadow`, `?noaa`, `?debug` (FPS + `window.__lunar`).

## Deploy to GitHub Pages

1. Push to a GitHub repo, branch `main`.
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. `.github/workflows/deploy.yml` runs tests, builds, and publishes `dist/` (`vite.config.js` uses a relative base, so it works under `https://<user>.github.io/<repo>/`).
(Run `npm install` once and commit the generated `package-lock.json`; the workflow then uses `npm ci`.)

## Science: real measurements vs game simplifications

Real values used (from public NASA / peer-reviewed sources; checked from memory of the published figures, **not re-verified online in this workspace** — please double-check before you cite them):

| Quantity | Value in game | Source |
|----------|---------------|--------|
| Gravity | Earth 9.81, Moon 1.62 (≈ 1/6), Mars 3.71 m/s² (≈ 38 %) | NASA planetary fact sheets |
| Weight = mass × local gravity | newtons shown for Earth/Moon/Mars | physics |
| Surface radiation dose rate | Moon ≈ 57 µSv/h (Chang'e-4 LND, Zhang et al. 2020, Science Advances); Mars ≈ 28 µSv/h (MSL RAD, Hassler et al. 2014, Science) | published instrument data |
| Sunlight at Mars | ≈ 43 % of Earth's | NASA Mars fact sheet (orbital distance) |
| Mars atmosphere | < 1 % of Earth's pressure, mostly CO₂ | NASA Mars fact sheet |
| Oxygen from Mars CO₂ | modelled on the MOXIE experiment on Perseverance | NASA |
| Water recycling | recycler recovers 85 % (ISS recovers roughly 90 %+) | NASA ISS ECLSS |
| Dust storms | cut sunlight and power; global storms end solar missions | NASA Mars rover missions |

**Simplified / invented for gameplay (not real measurements):** all time scales (1 game second ≈ 1 minute of dose; missions last minutes, not days), solar-storm dose rates (scaled up so a storm is dangerous within a short mission), resource percentages, repair costs, power numbers in kW, the five astronaut roles and their bonuses, event outcomes and grades, shelter/habitat shielding factors (55 % / 90 % are teaching values), and the metabolic scaling of resource use by body mass. The in-game text says so where it matters.

## IMPORTANT — what was and was not verified (read this)

The workspace this was written in **could not reach npm or GitHub** (HTTP 403 by policy), so **`three`, `vite` and
`@vitejs/plugin-react` were never installed here**:

* The shipped code imports the **real `three` package**; nothing in the source files is a homemade renderer.
* **`npm run build` / `vite build` has NOT been run**, nor the GitHub Actions workflow. Run them on a network-enabled machine.
* `test-three-shim.js` implements the small slice of Three.js this project uses on top of raw WebGL2 so the game could be
  exercised in a real (headless) browser. It is **test-only** and is never imported by the real build. It has no shadows, no
  tone-mapping and no **fog**. Therefore **unverified against real Three.js**: the Mars dust-storm fog (`scene.fog`, guarded by `if (THREE.Fog)`), shadows, colour management/brightness, PointLight units, and real-GPU performance.
  Lighting numbers may need tweaking (`sunIntensity`, `hemiIntensity` in `world3d.js` `env`, and `Engine.js`).
* Test GPU was software (SwiftShader, a few fps): **frame-rate on real hardware was not measured**.
* Touch controls were only tested in an emulated viewport, never on a phone.

### What was tested

* `npm test` (`logic.test.mjs`, 30 tests): the 7 levels exist and ramp up; every level can be completed by a scripted bot; failure paths (no oxygen/water, unfixed leaks, storm without cover, dust-storm blackout); resources never go negative or NaN under random play across all levels; event grading depends on state; all 13 events have 4 choices, a timer and science text; timeout rule; difficulty scaling; companion following/sheltering; role bonuses; weight vs gravity; profile validation; unlock/replay/best-score rules; the end report contains every required field; restarts share no state.
* `npm run test:browser` (`test-e2e.mjs`, 44 checks, all passing on the last run) drives headless Chromium with real keyboard input against the shim bundle (`node tests/build-local.mjs` first): menus, 7 level cards with locks, difficulty and crew validation, level 1 played with real E-holds (samples, console overlay, inspections, event dialog with timer/4 choices/evaluation), success report, unlock + persistence across reload, replay, failure and restart, Mars rendering (orange sky), gravity-dependent jump height (Moon vs Mars), dust cleaning, companion in the scene/following/giving advice, solar-storm and dust-storm events. See the results section of the final report for the last run. Screenshots go to `tests/shots/`. The pointer-lock quirk of headless Chromium (bogus mouse deltas) is worked around by re-aiming in the test.
* `test-world-shots.mjs` renders the Moon/Mars world (arrays, greenhouse, leaks, battery, companion, dust) for visual inspection.

## Migration notes / preserved work

* The original Streamlit game is untouched at `junior_astronaut/` with a backup at `junior_astronaut_streamlit_backup/`.
  Disclosure: its `data/levels.json` was overwritten once earlier in development and was rebuilt.
* Reused from it: the graded solar-storm decision rules, scoring weights and star thresholds, lesson text (`missionData.js`).
* Game logic (`src/game/*`) is pure JS with no DOM/Three dependency; rendering lives in `src/engine/*`; React draws only HUD/menus.

## Layout

```
(original folder layout, now flattened)
src/game      pure logic: core (tuning), levels (7 missions), events, companion, state (simulation), profile, terrain, world
src/engine    Three.js: Moon/Mars world, sky, structures, companion model, first-person tools, WebAudio sfx, Engine loop
src/ui        React: HUD, menus (title/level select/crew/briefing/pause), console, event dialog, end report, touch controls
tests         logic tests, browser e2e, world screenshots, test-only three shim + local bundler
```

## Gameplay upgrade (latest)

- **Shorter missions:** each level is sized for about 5-7 minutes (`par` 300-420 s; the three "survive until rescue" levels last 330/380/420 s). Events come earlier and tasks were trimmed.
- **Refill:** hold **E** at the Oxygen Refill Station; an empty suit fills in 12 s (a half-empty one in 6 s). The prompt shows a progress bar and a percentage; letting go keeps what you gained; play continues at once.
- **Survival crises (`crisis.js`):** a *wrong* decision (or timeout) can start an emergency: suit breach, hull breach, burst water line, heating failure, radiation spike or power collapse. Each has an emergency task (shown on the HUD and the compass), gets worse in three stages and ends the mission if not solved in time. A second failure escalates the running one. Emergency spares are issued if you have no materials, so recovery is hard but possible. Levels 6 and 7 also script an emergency.
- **Countdown tick:** a short tick each second during a timed question (twice a second in the last 5 s), on the sound-effects bus (not the music), stopped on answer/timeout, silent when muted.
- **Shuffled answers:** the four choices of every decision are shown in a random order; the best answer is placed with a per-mission "bag" so it lands on A, B, C and D evenly. Grading is by the authored choice, so shuffling cannot mark a wrong answer correct.
- **Mission Control comms (`contacts.js`, `Comms.jsx`, key C):** three fictional contacts (Mission Commander, Life-Support Engineer, Science Officer) with different styles; four predefined questions per level; 84 authored answers; no free-text input; replies are spoken by one voice. They are not real NASA personnel and this is not live communication.
- **Intro:** the "LIFTOFF" text and the NASA banner were removed; the rocket is the focus.
- **Removed:** the follower astronaut, the in-world robot, the optional AI backend (`aria-server.mjs`, `robot.js`, `Robot.jsx`).
- Tests: `npm test` runs `logic.test.mjs` (30) and `gameplay.test.mjs` (22). Browser tests: `test-entry.mjs`, `test-ui.mjs`, `test-e2e.mjs` (see the report for what was actually run).

