// UI browser test: drives the real React UI in headless Chromium (test bundle with three-shim). Screenshots -> test-output/shots/ui-*.png
import { createRequire } from 'node:module';
import path from 'node:path'; import { mkdirSync } from 'node:fs'; import { fileURLToPath } from 'node:url';
import { serve } from './test-serve.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(here, 'test-output', 'shots'), { recursive: true });
const s = await serve(path.join(here, 'test-output', 'dist-test')); const base = `http://localhost:${s.address().port}/?debug&nointro&quality=0.4&scale=0.5&noshadow&noaa`;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle'] });
const errs = []; const results = [];
const check = (n, ok, d = '') => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
const W = process.argv[2] ? Number(process.argv[2]) : 1280, H = process.argv[3] ? Number(process.argv[3]) : 720;
const pg = await b.newPage({ viewport: { width: W, height: H } });
pg.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
pg.on('console', (m) => { if (m.type() === 'error') errs.push('console.error ' + m.text()); });
const shot = (n) => pg.screenshot({ path: path.join(here, 'test-output', 'shots', `ui-${W}-${n}.png`), timeout: 90000 });
const E = (f, a) => pg.evaluate(f, a);
let fallbacks = 0;
// real mouse click; if the (CPU-starved, software-GL) page keeps re-laying out so Playwright's hit test fails, fall back to a DOM click() on the same element
const click = async (sel) => { try { await pg.click(sel, { timeout: 4000 }); } catch { fallbacks++; await pg.locator(sel).first().evaluate((el) => el.click()); } };
const phase = () => E(() => window.__lunar.game.phase);
const txt = () => E(() => document.body.innerText);
await pg.goto(base); await pg.waitForFunction(() => window.__lunar); await pg.waitForTimeout(800);

// ---- title
await shot('01-title');
let t = await txt();
check('title: name, Play, Crew, Select, credit', /JUNIOR/.test(t) && /Play/.test(t) && /Crew \/ Profile/.test(t) && /Select mission/.test(t) && /NASA SPACE APPS CHALLENGE/i.test(t) && /Wrench/.test(t));

// ---- level select with progress
await E(() => { const e = window.__lunar; e.save.progress = { unlocked: 3, stars: { 1: 3, 2: 2 }, best: { 1: 91, 2: 72 }, completed: { 1: true, 2: true } }; e._emit(true); });
await click('text=Select mission');
await pg.waitForSelector('.lcard');
await shot('02-levels');
check('7 level cards', (await E(() => document.querySelectorAll('.lcard').length)) === 7);
check('locked cards (4-7) disabled', (await E(() => [...document.querySelectorAll('.lcard')].map((c) => c.disabled).join())) === 'false,false,false,true,true,true,true');
check('unlock hint text', /Complete level 3 to unlock/.test(await txt()));
check('best score shown', /Best 91/.test(await txt()));
await click('button[role=radio]:has-text("Hard")');
check('difficulty Hard saved', (await E(() => window.__lunar.save.profile.difficulty)) === 'hard' && /Fewer supplies/.test(await txt()));
await click('button[role=radio]:has-text("Intermediate")');
check('difficulty back to normal', (await E(() => window.__lunar.save.profile.difficulty)) === 'normal');
await click('text=← Back');

// ---- crew screen
await click('text=Crew / Profile');
await pg.waitForSelector('.crew-grid');
await pg.fill('input[aria-label="Astronaut name"]', 'A'.repeat(30));
check('name max 20', (await E(() => document.querySelector('input[aria-label="Astronaut name"]').value.length)) === 20);
await pg.fill('input[type=number] >> nth=0', '500');
check('weight error shown', /Weight must be between 40 and 120/.test(await txt()));
check('save disabled on error', await E(() => document.querySelector('.actions .btn.primary').disabled));
await shot('03-crew-error');
await pg.locator('input[type=number]').nth(0).blur();
check('weight clamped on blur to 120', (await E(() => document.querySelectorAll('input[type=number]')[0].value)) === '120');
await pg.fill('input[type=number] >> nth=1', '100');
await pg.locator('input[type=number]').nth(1).blur();
check('height clamped on blur to 140', (await E(() => document.querySelectorAll('input[type=number]')[1].value)) === '140');
await pg.fill('input[type=number] >> nth=0', '70'); await pg.locator('input[type=number]').nth(0).blur();
check('weight panel in newtons (70 kg Moon = 113 N)', /113 N/.test(await txt()) && /687 N/.test(await txt()) && /260 N/.test(await txt()));
await click('button[role=radio]:has-text("Medic")');
await pg.fill('input[aria-label="Astronaut name"]', 'Cadet Test');
await click('text=Save profile');
const prof = await E(() => ({ ...window.__lunar.save.profile }));
check('profile saved via engine', prof.name === 'Cadet Test' && prof.role === 'medic' && prof.weight === 70 && prof.height === 140, JSON.stringify(prof));
await shot('04-crew');
await click('text=← Back');

// ---- Moon briefing -> HUD
await click('text=Select mission'); await click('.lcard[data-level="1"]');
await pg.waitForFunction(() => window.__lunar.game.phase === 'briefing');
await shot('05-briefing-moon');
t = await txt();
check('briefing content', /you will learn/i.test(t) && /starting resources/i.test(t) && /begin mission/i.test(t) && /tips/i.test(t) && /Cadet Test/.test(t));
await click('text=Begin mission');
await pg.waitForFunction(() => window.__lunar.game.phase === 'playing'); await pg.waitForTimeout(1500);
await E(() => { const g = window.__lunar.game; g.fade = 0; });
await shot('06-hud-moon');
t = await txt();
check('HUD: level title + objectives + vitals', /L1/.test(t) && /First Steps on the Moon/.test(t) && /Open the systems console/.test(t) && /Suit O₂/.test(t) && /Materials/.test(t));
// radio + hazard + crew panel
await E(() => { const g = window.__lunar.game; g.radio.push({ id: 901, who: 'ctrl', name: 'Mission Control', text: 'Test mission control call.', ttl: 9 });
  g.hazard = { type: 'storm', state: 'active', t: 5, dur: 60, intensity: 1 }; g.res.water = 10; g.radRate = 900; });
await pg.waitForTimeout(300);
await pg.keyboard.press('Tab'); await pg.waitForTimeout(300);
await shot('07-hud-storm-crew');
t = await txt();
check('HUD hazard banner', /SOLAR STORM — take cover!/.test(t));
check('HUD radio subtitles', (await E(() => document.querySelectorAll('.radio .rline').length)) > 0 && /Mission Control/.test(t));
check('crew panel via Tab', /CREW · press Tab/.test(t) && /Task:/.test(t) && /Mass 70 kg/.test(t));
check('low water pulses (crit class)', await E(() => !!document.querySelector('.vital.crit')));
await pg.keyboard.press('Tab'); await pg.waitForTimeout(200);
check('Tab closes crew panel', !/CREW · press Tab/.test(await txt()));
await E(() => { const g = window.__lunar.game; g.hazard = null; g.res.water = 80; g.radRate = 57; });

// ---- prompt (hold ring): inject a prompt object
await E(() => { const e = window.__lunar; e._interaction = function () { this.prompt = { text: 'Repair solar array (2 materials)', enabled: true, hold: 1.2, progress: 0.6 }; }; });
await pg.waitForTimeout(150);
await shot('08-hud-prompt');
check('prompt with hold bar', await E(() => !!document.querySelector('.prompt .pbar')));
await E(() => { window.__lunar._interaction = Object.getPrototypeOf(window.__lunar)._interaction; delete window.__lunar._interaction; });

// ---- pause
await pg.keyboard.press('KeyP'); await pg.waitForTimeout(400);
await shot('09-pause');
check('pause screen', (await phase()) === 'paused' && /Resume/.test(await txt()) && /Restart level/.test(await txt()));
await click('text=Resume'); await pg.waitForTimeout(300);
check('resume', (await phase()) === 'playing');

// ---- event dialog
await E(() => { const g = window.__lunar.game; g.event = { id: 'water_leak', state: 'decision', left: 14, total: 20, result: null }; g.phase = 'decision'; });
await pg.waitForSelector('.btn.choice'); await pg.waitForTimeout(300);
await shot('10-event-question');
check('event: 4 choices A-D', (await E(() => document.querySelectorAll('.btn.choice').length)) === 4 && /Water leak|leak/i.test(await txt()));
check("event: Mission Control hint", /Mission Control \(simulated\)/i.test(await txt()));
await E(() => { window.__lunar.game.event.left = 3; });
check('event: timer turns urgent <25%', await pg.waitForSelector('.timer.urgent', { timeout: 8000 }).then(() => true, () => false));
await shot('10b-event-urgent');
await pg.keyboard.press('KeyB'); await pg.waitForTimeout(400);
check('keyboard B chose option', await E(() => window.__lunar.game.event?.state === 'result'));
await shot('11-event-result');
t = await txt();
check('result: grade, why, consequence, SCIENCE', /Why this grade/.test(t) && /Consequence/.test(t) && /SCIENCE/.test(t) && /EVALUATION/.test(t));
await pg.keyboard.press('Enter'); await pg.waitForTimeout(400);
check('continue returns to play', (await phase()) === 'playing');
// timed out path
await E(() => { const g = window.__lunar.game; g.event = { id: 'water_leak', state: 'decision', left: 0.2, total: 20, result: null }; g.phase = 'decision'; });
await pg.waitForFunction(() => window.__lunar.game.event?.state === 'result'); await pg.waitForTimeout(300);
check('timed-out message', /Time ran out/.test(await txt()));
await shot('11b-event-timedout');
console.log(await E(() => { const b = document.querySelector('.decision .btn.primary').getBoundingClientRect(); const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return JSON.stringify({ b: b.toJSON(), el: el && el.outerHTML.slice(0, 80), panel: document.querySelector('.decision').getBoundingClientRect().toJSON() }); }));
await pg.locator('.decision .btn.primary').evaluate((el) => el.click()); await pg.waitForTimeout(300);

// ---- console
await E(() => { const g = window.__lunar.game; g.phase = 'console'; });
await pg.waitForSelector('.console'); await pg.waitForTimeout(400);
await shot('12-console');
t = await txt();
check('console sections', /resources/i.test(t) && /energy balance/i.test(t) && /systems & loads/i.test(t) && /environment/i.test(t) && /guidance/i.test(t) && /weight here/i.test(t));
const before = await E(() => window.__lunar.game.sys.scrubber.on);
await click('button[aria-label^="CO₂ scrubber"]'); await pg.waitForTimeout(300);
const after = await E(() => window.__lunar.game.sys.scrubber.on);
check('console toggle scrubber', before !== after, `${before} -> ${after}`);
await click('button[role=switch]:has-text("Rationing")'); await pg.waitForTimeout(200);
check('rationing toggle', await E(() => window.__lunar.game.rationing));
await shot('12b-console-toggled');
await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
check('Esc closes console', (await phase()) === 'playing');
await E(() => { const g = window.__lunar.game; g.phase = 'console'; }); await pg.waitForSelector('.console');
await pg.keyboard.press('KeyE'); await pg.waitForTimeout(400);
check('E closes console and engine.eTap cleared', (await phase()) === 'playing' && (await E(() => window.__lunar.eTap)) === false);

// ---- failure report (real logic)
await E(() => { const g = window.__lunar.game; g.health = 0; });
await pg.waitForFunction(() => window.__lunar.game.phase === 'failure', null, { timeout: 8000 }); await pg.waitForTimeout(400);
await shot('13-failure-top');
await E(() => { document.querySelector('.screen.end').scrollTo(0, 99999); }); await pg.waitForTimeout(200);
await shot('13b-failure-bottom');
t = await txt();
check('failure report', /MISSION FAILED/.test(t) && /why the mission failed/i.test(t) && /radiation dose/i.test(t) && /score breakdown/i.test(t) && /science lessons/i.test(t) && /Honesty note/.test(t) && !/Next mission/.test(t));
await click('.report-head >> text=Mission select'); await pg.waitForSelector('.lcard');
check('Mission select returns to level select', (await phase()) === 'title');
await click('text=← Back');

// ---- success report (real logic: satisfy level-1 objectives, let the simulation call win())
await click('text=Select mission'); await click('.lcard[data-level="1"]'); await pg.waitForFunction(() => window.__lunar.game.phase === 'briefing');
await click('text=Begin mission'); await pg.waitForFunction(() => window.__lunar.game.phase === 'playing');
await E(() => { const g = window.__lunar.game; g.consoleOpens = 1; g.collectedTotal = 3; for (const k of ['o2gen', 'recycler', 'scrubber']) g.sys[k].inspected = true; g.flags.refilled = true; g.timelineDone.discovery = true; g.stats.eventsResolved.resource_discovery = 'good';
  g.decisions.push({ id: 'resource_discovery', name: 'Resource discovery', icon: '🔎', choice: 'Collect samples first', grade: 'good', why: 'test', consequence: 'Test consequence.', science: 's', timedOut: false, at: 100, loss: 2 }); });
await pg.waitForFunction(() => window.__lunar.game.phase === 'success', null, { timeout: 8000 }); await pg.waitForTimeout(400);
await shot('14-success-top');
await E(() => { document.querySelector('.screen.end').scrollTo(0, 700); }); await pg.waitForTimeout(200);
await shot('14b-success-mid');
t = await txt();
check('success report', /MISSION SUCCESS/.test(t) && /Next mission/.test(t) && /best decision/i.test(t) && /most costly decision/i.test(t) && /resources gained and lost/i.test(t));
check('progress unlocked level 2+', (await E(() => window.__lunar.save.progress.unlocked)) >= 3);
await click('.report-head >> text=Next mission'); await pg.waitForFunction(() => window.__lunar.game.phase === 'playing' && window.__lunar.game.level.id === 2);
check('Next mission starts level 2 directly', true);

// ---- Mars briefing + HUD
await E(() => { const e = window.__lunar; e.save.progress.unlocked = 7; e.startLevel(6); });
await pg.waitForFunction(() => window.__lunar.game.phase === 'briefing'); await pg.waitForTimeout(500);
await shot('15-briefing-mars');
check('Mars briefing: planet badge + data-planet', /MARS/.test(await txt()) && (await E(() => document.querySelector('.app').dataset.planet)) === 'mars');
await click('text=Begin mission'); await pg.waitForFunction(() => window.__lunar.game.phase === 'playing'); await pg.waitForTimeout(1200);
await E(() => { const g = window.__lunar.game; g.fade = 0; window.__lunar.fade = 0; g.hazard = { type: 'dust', state: 'active', t: 5, dur: 120, intensity: 1 }; g.radio.push({ id: 950, who: 'ctrl', name: g.mate.name, text: 'Dust is rolling in. Check the arrays.', ttl: 9 }); });
await pg.waitForTimeout(300);
await shot('16-hud-mars-dust');
check('Mars HUD dust banner', /DUST STORM — power is low/.test(await txt()) && /L6/.test(await txt()));
await E(() => { const g = window.__lunar.game; g.hazard = null; });

console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page/console errors');
check('no page errors', errs.length === 0);
console.log(`${results.filter(Boolean).length}/${results.length} checks passed; ${fallbacks} clicks used the DOM fallback`);
await b.close(); s.close();
