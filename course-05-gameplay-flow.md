# Chapter 5 — The Whole Gameplay System, Traced (Part 5)

In this chapter we follow the game from the moment the page loads until a mission ends, naming the **real functions** that run. Keep `state.js` and `Engine.js` open.

## 5.1 The eight phases

The game is a **state machine**. The field `g.phase` says what the game is doing right now. Verified values: `'title'`, `'briefing'`, `'playing'`, `'paused'`, `'console'`, `'decision'`, `'success'`, `'failure'`.

```
        startLevel()           begin()
 title ───────────► briefing ─────────► playing ◄─────────────┐
   ▲                                  │  │  │  │              │
   │ toTitle()                        │  │  │  └─ pause()/resume()  ◄──► paused
   │                                  │  │  └──── interact(console) ◄──► console (close)
   │                                  │  └─────── startEvent() ─► decision ─ continue ─► playing
   │                                  ├── win(g)  ─────────────► success ┐
   └──────────────────────────────────┴── fail(g) ─────────────► failure ┴─► restart() / nextLevel() / title
```

* In every phase **except `'playing'`**, the simulation `step()` does nothing (its first line: `if (g.phase !== 'playing') return;`). That is how pausing works: nothing "is paused", the clock simply doesn't advance.
* The React app chooses which screen to show from `snap.phase` (`App.jsx`).

## 5.2 Startup sequence (recap, with phase)

1. `new Engine(...)` → `this.game = createGame()` which is `createMission(1, DEFAULT_PROFILE, 'normal', 'title')`. Phase `'title'`.
2. The title menu (`Title` in `Screens.jsx`) shows **Play/Continue**, **Select mission**, **Crew / Profile**. The camera orbits the base (`_cameraPose`, `menu` branch).

## 5.3 Menu and navigation

`App.jsx` keeps `view` (`'main' | 'levels' | 'crew'`) in React state; `Title` renders `LevelSelect` or `CrewScreen` accordingly. Level cards come from the `LEVELS` array:

```js
const locked = l.id > prog.unlocked;
…
<button … disabled={locked} onClick={() => engine.startLevel(l.id)} data-level={l.id}>
```
`prog` is `snap.save.progress`, loaded from `localStorage`. **Locked levels are disabled buttons**; the engine double-checks:

```js
startLevel(levelId, difficulty) {
  const id = Math.min(MAX_LEVEL, Math.max(1, levelId | 0));
  if (id > this.save.progress.unlocked) return false;
  …
  this._applyMission(createMission(id, this.save.profile, this.save.profile.difficulty, 'briefing'));
```
(UI hiding isn't security; the engine enforces the rule.)

## 5.4 Level loading

`createMission(levelId, profileIn, difficulty, phase)` in `state.js`:

1. `levelById(levelId)` → the level data.
2. `sanitizeProfile(...)` — validated profile (name, role, weight 40–120, height 140–205, teammate, difficulty).
3. `DIFF[profile.difficulty]` → multipliers.
4. `configureWorld(level.planet)` — **switches terrain, craters, boulders and colliders to Moon or Mars** (mutating the shared arrays).
5. Builds the giant object `g`: resources from the level's `start` multiplied by the difficulty (`res: { water: Math.min(100, st.water * mult), … }`), systems (`sys`), arrays, dust, flags, stats, etc.
6. `g.mate = createMate(...)` and `g.bon = bonuses(g)` (role bonuses).
7. A first radio line from Mission Control.

Then `Engine._applyMission(g)`: `this.game = g; this._buildPlanet(g.planet)` (rebuild 3D if planet changed), sets gravity, eye height, speed multiplier, clears interaction state.

The **briefing** (`Briefing` in `Screens.jsx`) displays story, "You will learn", tips, starting resources, crew and controls. **Begin mission** calls `engine.begin()`:

```js
begin() {
  const g = this.game;
  if (g.phase !== 'briefing') return;
  g.phase = 'playing';
  this.fade = 1;
  this.sfx.start(); this.sfx.play('click');
  this.requestLock();
  toast(g, g.level.tips?.[0] || 'Complete the objectives on the left.', 'info', …);
  this._emit(true);
}
```

## 5.5 The main loop (what happens in one tick)

Each real frame → `_update(dt)` → (playing) up to a few `_sim(1/60)`:

1. **Movement, jump, gravity** (chapter 4).
2. `step(g, dt)` — the simulation. In order (verified in `state.js`):
   1. `g.time += dt`; `g.zone` = `'habitat' | 'shelter' | 'outside'` from `roomAt(p.x, p.z)`.
   2. `runTimeline(g)` — are any scripted events due?
   3. `updatePower(g, dt)` — sunlight, dust, generation, loads, battery, brown-out.
   4. `updateLife(g, dt)` — water, food, habitat oxygen, CO₂, temperature.
   5. `updateHazard(g, dt)` — storm timer and radiation rate.
   6. `updateBody(g, dt)` — suit oxygen, radiation dose, damage from deprivation, healing.
   7. `mateStep(g, dt)` — the companion moves and is exposed to radiation.
   8. `trackStats(g, dt)` — min/max values, resource trends, ledger.
   9. `warnings(g)` — toasts when values get low.
   10. `updateObjectives(g)` — mark objectives done; toast "Objective complete".
   11. `mateReact(g)`, `mateWatch(g)` — radio lines.
   12. Timers for toasts/radio.
   13. **End checks:** health ≤ 0 → fail; teammate health ≤ 0 → fail (`'mate'`); level `failIf` (level 7: blackout > 45 s); time over the limit (`level.limit * diff.limit`) → fail `'time'`; `missionWon(g)` → win.
3. `_interaction(dt)` — what you are aiming at, hold-to-work progress.
4. Sound from `g.events`, then `g.events.length = 0`.

Then `_cameraPose`, `_visuals` (lights, arrays, lamps, doors, mate model, sparks), `_render`, and every ~1/15 s `_emit()` → React.

## 5.6 Mission clock — "days"?

**The game has no in-game days.** Time is in **real seconds** of play (`g.time`) with a `limit` per level. The mission lengths are the `limit` values times the difficulty factor (for example level 1: 900 s normal, 1170 s on Easy (×1.3), 765 s on Hard (×0.85) — I printed those from the real code). The one place where "mission time" differs from play time is **radiation dose**: `CFG.doseTimeScale = 60` — one second of play counts as one minute of mission time when integrating dose (so µSv/h × (1/60) h per second). That is a **gameplay simplification** [chapter 6].

The **lunar night** in level 5 is a scripted `sunset: [300, 360]` window: between 300 and 360 s the sunlight multiplier ramps from 1 to 0 (`smoothstep`).

## 5.7 Objectives

Each level has `objectives`, built by the helper `ob(id, text, progress, done, extra)`. Every tick `updateObjectives` calls each `o.done(g)`; when true it sets `g.objDone[id] = true`. **Required** objectives are those without `optional: true`. Default win rule:

```js
function missionWon(g) {
  if (g.level.win) return g.level.win(g);
  return g.level.objectives.filter((o) => !o.optional).every((o) => g.objDone[o.id]);
}
```
Levels 5 and 7 define a custom `win`, e.g. level 5: `survive` **and at least 3 of the 4** emergency fixes (`gen`, `leak`, `thermal`, `comm`).

`nextTarget(g)` feeds the on-screen **compass**: the first unfinished required objective that has a `target` function; if none, an optional one; during a solar storm it points to the nearest room door (take cover).

## 5.8 Events and decisions

*Selecting* an event: `runTimeline` looks through `level.timeline`. A timeline entry is either time-based (`at: 40`) or condition-based (`when: (g) => g.collectedTotal >= 2 || g.time > 150`), has an `event` id and a `timer`. When ready and nothing else is active it calls `startEvent(g, id, timer)`:

```js
export function startEvent(g, id, timer) {
  const ev = EVENTS[id];
  if (!ev || g.event) return false;
  g.flags['seen_' + id] = true;
  ON_START[id]?.(g);
  const base = (timer || ev.timer || CFG.decisionSeconds) * g.diff.dec * g.level.timerMul * bonuses(g).timer;
  g.event = { id, state: 'decision', left: base, total: base, result: null };
  g.phase = 'decision';
  emit(g, 'alarm');
  return true;
}
```
* `if (… || g.event) return false` — **only one decision at a time**. `runTimeline` also uses `g.timelineDone[t.id]` so each timeline entry fires once.
* `ON_START` applies the event's immediate effect (a leak begins, thermal unit breaks, comm goes down, you get hurt).
* The decision time = event timer × difficulty (`dec`: 1.4 easy, 1.0 normal, 0.7 hard) × level `timerMul` × commander bonus (1.2). Example: L3 `water_leak` timer 20 × 1.0 × 1.1 = 22 s on Intermediate with no commander.

**While in the decision phase the world is frozen** (no `step`). Only the timer counts: `tickDecision(g, dt)` → `tickEvent` reduces `e.left`; at 0 it calls `resolveEvent(g, null)` — a **timeout** that applies the **last choice (D)** and lowers the grade by one step.

**Evaluation:** `resolveEvent` runs the chosen option's `run(g)`, which returns `{grade, why, consequence}` after changing the state. It saves a record in `g.decisions` including `loss` (the sum of resource decreases) — later used to find the "most costly decision". The UI then shows the **result** card: grade chip, *why*, *consequence* and **SCIENCE** text. `continueEvent` returns to `'playing'` and shows the consequence as a toast. This is the required chain **EVENT → PROBLEM → TIMER → FOUR CHOICES → EVALUATION → CONSEQUENCE → SCIENCE** — I verified each stage exists: `alert`/`problem` (`eventView`), the timer, four choices (a unit test checks "every event has exactly four choices, a timer, and science text"), grading, consequences, science.

## 5.9 Crew and teammate

At `createMission`, `createMate(profile.mate, START)` makes the teammate (`companion.js`). Every tick `mateStep` chooses a goal: shelter in a solar storm; stay inside during a dust storm; rest if injured; stay inside if you are inside; otherwise **follow** you at an offset 2.4 m ahead/1.7 m beside (`goal = { x: p.x + sy * 2.4 - cy * 1.7, … }`). She/he walks through door points (`route`), speed 3–6 m/s depending on distance, and is teleported to the target if stuck >3 s or more than 60 m away. **She/he never repairs, collects or completes objectives** — only *talks* (`mateReact`, `mateWatch`, `mateAdvice`) and adds the **role bonus** (`bonuses(g)` combines your role and the teammate's role: e.g. engineer → repairs cost ×0.8 per engineer).

## 5.10 Scoring, rewards, stars

When the game ends, `computeEnd(g, success)` builds the report. **Score** = weighted average of seven components (each 0–100):

| Component | Weight | Formula (from the code) |
|-----------|-------|-------------------------|
| crew | 0.20 | average of your health and the teammate's health |
| life_support | 0.30 | `25 × (clamp(minOxygen/50) + clamp(minO2res/40) + clamp(minWater/30) + clamp(minFood/30))` where `clamp` limits to 0–1 |
| energy | 0.15 | `100 × (1 − clamp(blackoutSeconds/60)) × (0.5 + 0.5·clamp(minBattery/30))` |
| infrastructure | 0.10 | 40 % arrays working, 40 % systems working, 20 % no open leak |
| efficiency | 0.05 | on success: `clamp(1 − (time − par)/(par × 1.2), 0.1, 1) × 100`; on failure 20 |
| objectives | 0.05 | share of required (and half-weight optional) objectives done |
| decisions | 0.15 | average of `GRADE_POINTS` (perfect 100, good 75, acceptable 45, wrong 5); 70 if no decisions |

Then **difficulty adjustment**: Hard +4, Easy −3 (clamped 0–100). **If the mission failed the score is capped at 59.** Stars: success and `score ≥ 80` and health ≥ 50 → 3 stars; `score ≥ 60` → 2; otherwise 1; failure → 0.

> The weights in `missionData.js` (`scoring.weights`) are **not used**; `state.js` has its own `WEIGHTS` object. If someone tells you "the scoring uses missionData.json", they are wrong for this version.

## 5.11 Completion, failure, restart

* **Win:** `win(g)` sets `g.phase = 'success'`, `g.end = computeEnd(g, true)`. The Engine notices the phase change (`_onPhaseChange`), plays the success sound, and records progress:

```js
if (g.end) { this.save.progress = recordResult(this.save.progress, g.level.id, g.end, MAX_LEVEL); saveGame(this.save.profile, this.save.progress); }
```
`recordResult` (in `profile.js`) unlocks the next level **only on success** and keeps the best score and stars.
* **Fail:** `fail(g, reason)` stores `g.failReason` (`radiation`, `oxygen`, `water`, `food`, `temperature`, `co2`, `injury`, `health`, `mate`, `time`, `blackout`) and the report explains it with `FAIL_TEXT`.
* **Report:** `EndReport.jsx` shows success/failure, why, health, resources, dose, temperatures, your local weight vs Earth weight, decisions, best/worst decision, gains/losses, score components, stars, science lessons and buttons.
* **Restart:** `restart()` = `startLevel(currentId)` then `begin()` — creates a **brand-new `g`** (`createMission`), so nothing leaks from the previous attempt (a unit test checks "game objects are not shared between missions").
* **Next mission:** `nextLevel()`.
* **Back to title:** `toTitle()` → `createGame()`.

## 5.12 What is missing or partial (be honest)

* No in-game calendar of "days".
* The teammate cannot do tasks for you (by design) — and the teammate-injury event is unreachable (chapter 0).
* No save of a mission **in progress**; only profile and campaign progress persist.
* No online leaderboard or multi-player.
* Sound/touch have not been tested on real devices.

## Check yourself — Chapter 5

1. List the eight phases. In which phase does `step()` actually advance the simulation?
2. What happens to the world while an event dialog is open?
3. What does a timeout do to the choice and the grade?
4. Why does `startEvent` return `false` when `g.event` already exists?
5. Where is the rule "unlock the next level only on success" implemented?
6. Compute the decision time for the `water_leak` event (timer 20) on level 3, Hard difficulty, no commander.
7. Why is the failed-mission score capped at 59?
8. Name the three ways a mission can fail that do not involve you dying.
9. Why is `restart()` safe against leftovers from the previous run?
10. Which file's weights are *actually* used for scoring?

**Exercise E5.1:** Trace by reading code: you press **E** on the console desk. List every function that runs, from `_interaction` to the phase becoming `'console'` and the React `Console` appearing. (Hint: `describeTarget` → `interact` → `case 'console'` → `_onPhaseChange` → `_emit` → `App.jsx`.)

*Answers: `17-answers.md`, "Chapter 5".*
