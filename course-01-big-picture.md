# Chapter 1 — The Big Picture (Part 1)

## 1.1 What is our game, in plain language?

**Junior Astronaut Mission Trainer** is a first-person 3D survival game that runs in a web browser. You are an astronaut on the Moon or on Mars. You walk around an outpost with a habitat, solar panels, a greenhouse (on Mars), a rover and a radiation shelter. You have to keep yourself and a computer-controlled teammate alive by managing **oxygen, water, food, energy, materials, health, radiation and temperature**.

There are exactly **seven missions**, defined in `src/game/levels.js` in the array `LEVELS`:

1. First Steps on the Moon
2. Power Restoration
3. Life-Support Emergency
4. Solar Storm
5. Lunar Outpost Emergency
6. First Mars Expedition
7. Mars Survival Emergency

Levels 1–5 are on the Moon, 6–7 on Mars. Each one is harder than the last [verified in the level data: `rank` goes 1,2,3,3,4,4,5; `sev` (event severity) goes 0.6, 0.8, 1.0, 1.05, 1.2, 1.25, 1.35; `timerMul` (decision time multiplier) goes 1.5 → 0.85].

### What can the player do?

From `Engine.js` (`_key`, `_sim`, `_interaction`) and the on-screen controls list in `ui/common.jsx`:

* **Walk** with W/A/S/D or arrow keys, **sprint** with Shift, **jump** with Space, **look** with the mouse.
* **Interact** with E. Quick things (open the console, talk to the companion) are a *tap*; work (repair a solar array, collect a sample, seal a leak) is a *hold* with a progress bar.
* **Choose a tool** with 1/2/3 (wrench, scanner, sampler). The tool only changes what the hands hold on screen.
* **Open the systems console** at the desk to see every resource, switch systems on and off, ration supplies and build the greenhouse.
* **Answer emergency events**: a dialog with a timer and four choices (A–D). The choice is graded Perfect / Good / Acceptable / Wrong.
* **Pause** (P/Esc), **mute** (M), **fullscreen** (F), **crew panel** (Tab).

### What makes it a *game* and not just a website?

A normal website shows information and reacts when you click. A game has:

1. **A simulation that keeps running by itself.** Every 1/60th of a second the function `step()` in `state.js` makes oxygen fall, batteries drain, temperatures drift and radiation accumulate — whether you click or not.
2. **A state that you can win or lose.** `step()` ends by checking `g.health <= 0` (fail), mission time limit (fail) and `missionWon(g)` (win).
3. **Goals and feedback.** Each level has objectives (`ob(...)` entries) and the HUD shows them with progress.
4. **Choices with consequences.** Each event choice runs a `run(g)` function that really changes the state.
5. **A real-time loop.** The `_frame` function in `Engine.js` is called ~60 times a second by the browser.

## 1.2 How the game starts when you open it

This is the real startup chain in your project [verified by reading the files]:

1. The browser opens `index.html`. It contains only `<div id="root"></div>` and `<script type="module" src="/src/main.jsx">`.
2. `src/main.jsx` (5 lines) imports `App.jsx` and `styles.css`, and calls `createRoot(document.getElementById('root')).render(<App />)`. That "mounts" the React app.
3. `App.jsx` renders a `<div ref={mount} className="stage" />` and, in a `useEffect`, executes `new Engine(mount.current, {...})`.
4. The `Engine` constructor (`src/engine/Engine.js`) creates the Three.js renderer, scene, camera and lights; builds the Moon world with `_buildPlanet('moon')`; creates a "title screen" game object with `createGame()`; registers keyboard and mouse listeners in `_bind()`; and starts the animation loop with `requestAnimationFrame`.
5. Every ~1/15 s the engine calls `_emit()`, which builds a **snapshot** (a plain object of numbers and strings) and hands it to React through `onSnapshot: setSnap`. React redraws the menus/HUD from that snapshot.
6. Because the starting phase is `'title'`, `App.jsx` shows the `Title` component while the camera slowly orbits the habitat in the background (`_cameraPose`, the `menu` branch).

## 1.3 What happens when you move, click, choose or start a mission

| You do… | What really happens |
|--------|---------------------|
| Press **W** | `window` `keydown` → `Engine._key()` puts `'KeyW'` into the `this.keys` set. In the next `_sim(dt)`, `fwd = 1`, so the velocity `p.vx/p.vz` is accelerated, then `resolveCollisions()` (from `world.js`) pushes you out of walls, then `p.x/p.z` is updated. |
| Move the **mouse** (pointer locked) | `mousemove` adds `movementX/Y` to `this.mdx/mdy`; `_look()` turns that into `p.yaw` and `p.pitch`. |
| Hold **E** at a solar array | `_interaction()` finds the array with the best aim score, `describeTarget()` (in `state.js`) says "hold 2.2 s", the engine counts `this.hold.t`, and when it reaches the target time it calls `interact(g, best)`. |
| **Click** a mission card | React `onClick={() => engine.startLevel(l.id)}` → `createMission(...)` builds a fresh game object → `_applyMission()` rebuilds the 3D planet if needed. Phase becomes `'briefing'`. |
| Click **Begin mission** | `engine.begin()` sets `g.phase = 'playing'` and requests pointer lock. |
| Press **A–D** in an event | `Decision` (in `ui/Event.jsx`) listens for the key → `engine.chooseEventOption(id)` → `chooseOption` → `resolveEvent` → runs that choice's `run(g)` function. |

The key idea: **React never changes the game rules and never draws the 3D scene.** React only *displays* snapshots and *calls engine methods*. The rules live in `src/game/`. The drawing lives in `src/engine/`.

## 1.4 Programming language, library, runtime, package manager, tool — five words you must not mix up

| Word | Meaning | In **our** project |
|------|---------|--------------------|
| **Programming language** | A set of rules for writing instructions | **JavaScript** (modern, ES modules) — all `.js` files. **JSX** is JavaScript with HTML-like tags, used in `.jsx` files. |
| **Library** | Ready-made code you *call* from your own code | **three** (3D graphics), **react** and **react-dom** (building the interface) |
| **Framework** | A library that calls *your* code in its own structure | React is often called a library or a framework; in our project it is used only for the interface |
| **Runtime** | A program that executes a language | **The browser** runs our game. **Node.js** runs our tests and the build tools (not the game itself). |
| **Package manager** | Downloads and tracks libraries | **npm** (comes with Node.js). It reads `package.json`, fills `node_modules/`. |
| **Development tool / build tool** | Helps you develop, not part of the game logic | **Vite** (dev server + bundler), **@vitejs/plugin-react** (teaches Vite to understand JSX), **Playwright** (drives a browser in tests), **Git/GitHub** |

A good test: *If I deleted it, would the finished game still run?* Delete Vite and you can't build, but a finished build still runs. Delete `three` and the finished game stops working (it's bundled inside).

## 1.5 Every technology actually used (verified from `package.json` and the source)

`package.json` lists:

```json
"dependencies": { "react": "^19.0.0", "react-dom": "^19.0.0", "three": "^0.170.0" },
"devDependencies": { "@vitejs/plugin-react": "^4.3.4", "playwright": "^1.48.0", "vite": "^6.0.0" }
```

| Technology | Used for | Where |
|-----------|----------|-------|
| JavaScript (ES modules) | All game logic and engine | `src/**/*.js` |
| JSX / React 19 | HUD, menus, console, end report | `src/App.jsx`, `src/ui/*.jsx` |
| Three.js (0.170 requested) | 3D rendering with WebGL | `src/engine/*.js` |
| WebGL | What Three.js draws with (the browser's 3D API) | indirectly |
| Web Audio API | Procedural sound (no audio files) | `src/engine/audio.js` |
| `localStorage` | Saving profile and progress | `src/game/profile.js` |
| Pointer Lock API, Fullscreen API | Mouse-look and fullscreen | `Engine.js` |
| CSS | Styling the UI — **a real, separate file** `src/styles.css` imported by `main.jsx` | `src/styles.css` |
| Vite | Dev server and production build | `vite.config.js` |
| Node.js built-in test runner (`node:test`) | Logic tests | `tests/logic.test.mjs` |
| Playwright | Browser tests | `tests/e2e.mjs`, others |
| GitHub Actions | Build and deploy to GitHub Pages | `.github/workflows/deploy.yml` |

**CSS is not generated by JavaScript here.** The styling lives in `src/styles.css` (336 lines) and is imported by `src/main.jsx`. React components attach `className`s. A few values are set inline — for example `<i style={{ width: `${(v / max) * 100}%` }} />` in the `Meter` component — because the bar width depends on a number.

**There are no image, model, texture or sound files.** The folder `public/` is empty [verified]. Everything is generated by code: the terrain by math, the objects by the `MeshBuilder` class (triangles with per-vertex colour), the sounds by oscillators and noise. That is why the game is small and loads quickly, and also why it is not photo-realistic.

## 1.6 The architecture map

```
                      ┌──────────────────────────────────────────────┐
                      │                 BROWSER                      │
                      │                                              │
  index.html ──► main.jsx ──► App.jsx                                 │
                              │  (React)                              │
        ┌─────────────────────┼───────────────────────────┐           │
        │ draws UI            │ creates                   │           │
        ▼                     ▼                           │           │
   src/ui/*.jsx          src/engine/Engine.js ◄── input   │           │
   (HUD, menus,          (the "conductor")     keyboard,  │           │
    console, events)      │  │  │  │           mouse,     │           │
        ▲                 │  │  │  │           touch      │           │
        │ snapshot        │  │  │  └──► audio.js (sound)  │           │
        │ (15×/second)    │  │  └─────► hands.js (hands/tools on screen)
        └─────────────────┘  └────────► world3d.js + geo.js (build 3D objects)
                              │                   │
                              │ calls             │ reads positions/heights
                              ▼                   ▼
                    ┌──────────────────────────────────────┐
                    │          src/game  (PURE LOGIC)       │
                    │  state.js  ◄── levels.js, events.js,  │
                    │   │  │        companion.js, core.js   │
                    │   │  └──► world.js ◄── terrain.js     │
                    │   └─────► profile.js (localStorage)   │
                    │  math.js (helpers)                     │
                    └──────────────────────────────────────┘
                              ▲
                              │ imported directly by
                      tests/logic.test.mjs (Node, no browser)
```

Read it like this:

* **`src/game` knows nothing about drawing.** It has no `import 'three'`, no `document`, no `window` (except `localStorage` in `profile.js`, wrapped in try/catch). That's why the 25 logic tests can run in plain Node.
* **`Engine.js` is the conductor.** It owns the renderer, reads the keyboard, calls `step()` every 1/60 s, updates 3D objects to match the state, and sends snapshots to React.
* **`world.js` is shared** by the logic and the engine, so that "where the wall is" for collision is exactly "where the wall is" in the picture.

## 1.7 How the browser, JavaScript, Three.js, Node.js, npm and Vite work together **in this project**

*While developing (on your computer):*

1. **Node.js** is installed on your computer. It's a program that can run JavaScript outside the browser.
2. **npm** reads `package.json` and downloads `react`, `three`, `vite`, … into the folder `node_modules/`.
3. **Vite** (started by `npm run dev`) is a small web server that serves your source files to the browser, translating JSX into plain JavaScript and refreshing the page when you save a file.
4. The **browser** loads the page, runs `main.jsx` → React → `Engine` → **Three.js**, which asks the **GPU** (through WebGL) to draw triangles.

*When publishing:*

1. `npm run build` makes Vite **bundle** all the code (yours plus `react` and `three`) into a few files inside `dist/`. These are plain static files.
2. Any static web host (GitHub Pages) can serve `dist/`. Visitors' browsers need neither Node nor npm. [recommendation — I could not run the build here.]

## Check yourself — Chapter 1

1. In which folder is the code that decides whether you win or lose, and why does it not import Three.js?
2. What is the difference between `Engine.js` and `state.js`?
3. Which file contains `<div id="root">`, and which one starts React?
4. Is Vite part of the game the player runs? Explain.
5. Name two things in this game that are generated by code rather than loaded from a file.
6. What is a "snapshot", and who creates and who consumes it?

*Answers: `17-answers.md`, section "Chapter 1".*
