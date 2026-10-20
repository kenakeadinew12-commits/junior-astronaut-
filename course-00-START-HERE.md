# Junior Astronaut Mission Trainer — Your Personal Study Course

**Read this page first.** It tells you how the course works, what I actually checked in your project, what I could *not* check, and two real bugs I found while reading your code.

---

## 0.1 Who this course is for and how to use it

You told me you are a student, that you have some programming experience, and that Claude generated a lot of this game. You and your teammate now want to **understand, maintain, improve and honestly present** it at the NASA Space Apps Challenge.

So this is not a README and not a summary. It is a set of chapters written to you, as a tutor, using **your real files, real function names and real numbers**.

How to work through it:

1. Read the chapters in order the first time. Each one builds on the one before it.
2. Every chapter ends with **Check yourself** questions. Try them *before* you open `17-answers.md`.
3. Whenever I show a code excerpt, **open the real file next to it** and find the same lines. Seeing the excerpt in its real surroundings is half of the learning.
4. Do the small exercises. Most of them tell you to change a number and watch what happens — and **always change it back** (or use Git, chapter 12, so you can undo with one command).

### The chapters

| File | What you learn |
|------|----------------|
| `01-big-picture.md` | What the game is, what technologies it uses, the architecture map |
| `02-folders-and-files.md` | Every important file: purpose, functions, who depends on whom |
| `03-javascript.md` | The JavaScript you need, taught with your own code |
| `04-threejs-and-world.md` | How the 3D world, camera, terrain, lighting and collision work |
| `05-gameplay-flow.md` | One full trace: start → mission → success/failure → restart |
| `06-resources.md` | Every resource: formulas, numbers, what happens at zero |
| `07-levels-events-difficulty.md` | How levels and events are defined; how to add one safely |
| `08-interface.md` | HTML, CSS, React and the HUD |
| `09-node-npm-vite.md` | Running the project, errors, building |
| `10-testing-debugging.md` | What each test does and doesn't prove; how to debug |
| `11-using-claude-safely.md` | How to ask Claude for changes without breaking the game |
| `12-git-and-github.md` | Version control, GitHub Pages deployment, teamwork |
| `13-science-and-nasa.md` | What is real science, what is simplified, official challenge rules |
| `14-presenting-to-judges.md` | Pitches, demo script, honest answers to judge questions |
| `15-two-person-study-plan.md` | A day-by-day plan for the two of you |
| `16-exercises-and-final-test.md` | Larger exercises, debugging challenges, final exam |
| `17-answers.md` | Answers to all questions (don't peek!) |
| `18-reference-guide.md` | Glossary, file map, commands, checklists, open risks |

---

## 0.2 What I inspected (and how)

I did **not** guess. In preparing this course I read, in full or in the relevant parts:

* `package.json`, `vite.config.js`, `index.html`, `.gitignore`, `.github/workflows/deploy.yml`
* All of `src/game/` — `core.js`, `math.js`, `profile.js`, `levels.js`, `events.js`, `state.js`, `companion.js`, `world.js`, `terrain.js`
* `src/data/missionData.js` (structure, and the parts the code really uses)
* `src/engine/Engine.js` (completely), the structure and key sections of `world3d.js` (terrain, rocks, both skies, `buildWorld`), the `MeshBuilder` class in `geo.js`, the head of `hands.js` and `audio.js`
* `src/main.jsx`, `src/App.jsx`, `src/ui/common.jsx`, `Event.jsx`, `Hud.jsx`, `Screens.jsx` (the parts quoted), `Console.jsx` (head), the start of `styles.css`
* The test folder: the list of all 25 logic tests, the structure and helpers of `e2e.mjs`, and the headers of the other test scripts
* I ran small numerical experiments with your real `createMission()` and `step()` functions to produce the worked examples in chapter 6 (the numbers there are *observed outputs*, not hand-waving).
* I checked the official Space Apps website pages online (details and dates in chapter 13).

### What I did **not** fully read line by line

Being honest: a few files I only skimmed for their structure and did not read every line — the internal drawing code of `world3d.js` (about 700 lines of geometry for the habitat, rover, greenhouse, companion body, etc.), `hands.js`, `audio.js`, most of `styles.css`, and the lower halves of `Screens.jsx`, `Console.jsx` and `EndReport.jsx`. Where this course talks about them, it only claims what I verified (function names, what they are called from, and what they are for). If a sentence in this course is about something I did not verify, I say so.

---

## 0.3 What was and was not **run**

| Thing | Status |
|-------|--------|
| `node --test tests/logic.test.mjs` (the 25 logic tests; this is what the `npm test` script runs) | **I ran it. 25 of 25 passed.** |
| `tests/e2e.mjs` browser test, against a *test bundle* made with a stand-in for Three.js | **I ran it. 44 of 44 checks passed** (in a headless browser, software rendering). |
| `npm install`, `npm run dev`, `npm run build`, `npm run preview` | **Never run in my workspace** (it could not reach the npm registry). Commands in this course for them are labelled *recommendation*, not *confirmed*. |
| The game with the **real** `three` package | **Never run by me.** The shadows, fog, brightness and real GPU speed are unverified. |
| The GitHub Actions workflow | **Never run.** |
| Touch controls on a real phone | **Never tested** (only an emulated viewport). |

Keep this table in mind. When you present, you must not say "we tested X on real hardware" if X is in the "never run" rows.

---

## 0.4 Two real bugs I found while reading (please read!)

You asked me **not to change your files**, so I have not. But while reading `events.js` and `state.js` I found two genuine defects. They are good learning material, and you should know about them before you present.

### Bug 1 — "Run the oxygen generator at full output" never boosts anything

In `src/game/events.js`, the `o2_leak` event, choice **B**:

```js
{ id: 'B', text: 'Run the oxygen generator at full output to out-produce the leak.', run(g) { g.flags.o2boostUntil = g.time + 150; ...
```

It stores the boost end time in **`g.flags.o2boostUntil`**. But the simulation in `src/game/state.js` reads a *different* variable, **`g.o2boostUntil`** (no `flags.`):

```js
const boost = g.time < g.o2boostUntil ? 2 : 1;
```

`g.o2boostUntil` is created as `0` in `createMission` and nothing ever sets it. So the player is told "Oxygen generator output doubled for 2.5 minutes", and graded "Good", but the generator output is never actually doubled. Fix idea (when you are ready, with Claude, using the safe process of chapter 11): make both places use the same variable. Then add a unit test that proves the boost works.

### Bug 2 — The "teammate is injured" branch can never happen

`events.js` has code like `g.level.injured === 'mate'` to hurt the companion instead of you. But **no level in `levels.js` defines an `injured` property**, so that comparison is always false. Every `astronaut_injury` event therefore injures *you*, never the teammate. The teammate-injury code, and the matching consequences in `companion.js`, are currently unreachable by normal play. (They are not dangerous, just dead code. If you claim "the companion can be hurt" to the judges, note that she/he *can* lose health from radiation — I verified that code in `companion.js` `mateStep` — but not through this injury event.)

### Smaller oddities worth knowing

* `state.js` has `if (!o.optional || true)` in `updateObjectives` — the `|| true` makes the condition always true. Harmless, but confusing.
* `g.flags.mateAdvice = true` is set in the `temp_failure` event, but nothing reads it.
* `src/data/missionData.js` contains `buildings`, `moon`, `rules` and `scoring.weights` sections that the current code never uses (the code only reads `solarStorm`, `lessons`, `failureReasons`, `scoring.labels` and `scoring.stars`). They are leftovers from the earlier Streamlit version.
* `levels.js` imports `battery, greenhouse, rover, rooms` and defines `S` only to silence them with `void` statements at the bottom. Leftovers again.
* The browser test scripts hard-code a Playwright path from my workspace (`/home/claude/.npm-global/lib/node_modules/playwright`). On your computer you must set `PLAYWRIGHT_PATH` (see chapter 10) or those scripts will not start.

None of this stops the game from working. Part of becoming the owner of this code is knowing where it is not perfect.

---

## 0.5 How certain is each statement? My labels

Throughout the course I use these tags where it matters:

* **[verified]** — I read it in your code or ran it.
* **[recommendation]** — advice, or a command I believe is right but did not run here.
* **[not verified]** — I could not check it.
* **[science-real]**, **[science-simplified]**, **[science-invented]** — used in chapter 6 and 13 to separate real facts from game design.

Now go to `01-big-picture.md`.
