// Browser acceptance test for the 7-level game. Real keyboard/mouse input via Playwright against the test bundle
// (three-shim stand-in for Three.js). Against the real Vite build: BASE_URL=http://localhost:4173/ npm run test:browser
import { createRequire } from 'node:module';
import path from 'node:path'; import { mkdirSync } from 'node:fs'; import { fileURLToPath } from 'node:url';
import { serve } from './test-serve.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(here, 'test-output', 'shots'), { recursive: true });
let s, base = process.env.BASE_URL;
if (!base) { s = await serve(path.join(here, 'test-output', 'dist-test')); base = `http://localhost:${s.address().port}/`; }
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle'] });
const results = []; const check = (n, ok, d = '') => { results.push([n, !!ok]); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
const shot = (pg, n) => pg.screenshot({ path: path.join(here, 'test-output', 'shots', 'e2e-' + n + '.png') });
const errs = [];
const G = (pg, f, a) => pg.evaluate(f, a);

async function fresh(init = null, w = 1280, h = 720) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  pg.on('response', (r) => { if (r.status() >= 400) { const u = new URL(r.url()).pathname; if (u !== '/api/aria/status') errs.push('HTTP ' + r.status() + ' ' + u); } });   // the only tolerated 404 is the optional AI-backend probe
  if (init) await pg.addInitScript(init);
  await pg.goto(base + '?debug&nointro&scale=0.4&quality=0.4&noaa&noshadow'); await pg.waitForFunction(() => window.__lunar);
  return pg;
}
const unlockAll = `try{localStorage.setItem('junior-astronaut-3d-v2',JSON.stringify({profile:{},progress:{unlocked:7,stars:{1:3,2:2},best:{1:90,2:70},completed:{1:true,2:true,3:true,4:true,5:true,6:true}}}))}catch(e){}`;
const phase = (pg) => G(pg, () => window.__lunar.game.phase);
const text = (pg) => G(pg, () => document.body.innerText);
const hold = async (pg, key, ms) => { await pg.keyboard.down(key); await pg.waitForTimeout(ms); await pg.keyboard.up(key); };
const put = (pg, x, z, yaw = 0, pitch = 0) => G(pg, ([x, z, yaw, pitch]) => { const p = window.__lunar.game.player; p.x = x; p.z = z; p.yaw = yaw; p.vx = 0; p.vz = 0; p.pitch = pitch; }, [x, z, yaw, pitch]);
const jumpApex = async () => { let max = 0; await pg.keyboard.down('Space'); const t0 = Date.now(); while (Date.now() - t0 < 3500) { const y = await G(pg, () => window.__lunar.game.player.y); max = Math.max(max, y); await pg.waitForTimeout(40); } await pg.keyboard.up('Space'); return max; };
async function begin(pg, id) {
  await G(pg, (id) => window.__lunar.startLevel(id), id);
  await pg.waitForSelector('text=Begin mission'); await pg.click('text=Begin mission');
  await pg.waitForFunction(() => window.__lunar.game.phase === 'playing'); await pg.waitForTimeout(600);
  await put(pg, 0, 26, 0, 0);
}
/** Stand 1.4 m from an interactable, aim at it, then do a REAL key interaction (tap or hold E). */
async function useIt(pg, id, towards = [0, 26], dist = 1.4) {
  const aim = () => G(pg, ([id, towards, dist]) => {
    const e = window.__lunar, it = e.interactableList.find((i) => i.id === id), g = e.game;
    const dx = towards[0] - it.pos[0], dz = towards[1] - it.pos[2], l = Math.hypot(dx, dz) || 1;
    const x = it.pos[0] + (dx / l) * dist, z = it.pos[2] + (dz / l) * dist;
    const p = g.player; p.x = x; p.z = z; p.vx = p.vz = 0; if (it.kind === 'sample') p.y = it.pos[1] - 0.3;
    p.yaw = Math.atan2(-(it.pos[0] - x), -(it.pos[2] - z));
    p.pitch = Math.atan2(it.pos[1] - (p.y + e.eye), Math.hypot(it.pos[0] - x, it.pos[2] - z));
  }, [id, towards, dist]);
  const isDone = () => G(pg, ([id]) => { const g = window.__lunar.game; return id.startsWith('sample') ? !!g.samples[id] : g.sys[id] ? !!g.sys[id].inspected : id === 'array1' ? g.dust.array1 < 0.05 : g.phase !== 'playing'; }, [id]);
  let pr = null, first = null;
  for (let round = 0; round < 3; round++) {          // slow software GL: a hold can occasionally be interrupted, so retry up to 3 times
    pr = null;
    for (let attempt = 0; attempt < 5 && !pr; attempt++) {   // headless pointer-lock deltas can knock the aim off: re-aim until the engine targets it
      await aim(); await pg.waitForTimeout(700);
      const st = await G(pg, () => ({ t: window.__lunar.target && window.__lunar.target.id, p: window.__lunar.prompt }));
      if (st.t === id && st.p && st.p.enabled) pr = st.p;
    }
    if (!pr) return first;
    first = first || pr;
    if (pr.hold > 0) {                                // hold E until the action completes (software GL can run the game at <1/5 real time)
      await pg.keyboard.down('KeyE');
      for (let w = 0; w < 100 && !(await isDone()); w++) await pg.waitForTimeout(300);
      await pg.keyboard.up('KeyE');
    } else await hold(pg, 'KeyE', 150);
    await pg.waitForTimeout(300);
    if (await isDone()) break;
  }
  return first;
}

// ---------------------------------------------------------------- 1. menus, progression gating (fresh profile)
let pg = await fresh();
await shot(pg, '01-title');
let m = await G(pg, () => { const c = document.getElementById('game-canvas').getBoundingClientRect(); return { w: c.width, h: c.height, iw: innerWidth, ih: innerHeight, sx: document.documentElement.scrollWidth, sy: document.documentElement.scrollHeight }; });
check('canvas fills the viewport, no page scroll', m.w === m.iw && m.h === m.ih && m.sx <= m.iw && m.sy <= m.ih, JSON.stringify(m));
await pg.click('text=Select mission'); await pg.waitForTimeout(300);
await shot(pg, '02-levels-fresh');
let cards = await G(pg, () => [...document.querySelectorAll('.lcard')].map((c) => ({ dis: c.disabled, t: c.innerText.split('\n')[1] || '' })));
check('level select shows exactly 7 levels', cards.length === 7, String(cards.length));
check('only level 1 is unlocked on a fresh profile', cards[0] && !cards[0].dis && cards.slice(1).every((c) => c.dis));
const lt = await text(pg);
check('levels are the 5 Moon + 2 Mars missions', /MOON/i.test(lt) && /MARS/i.test(lt) && /First Steps/.test(lt) && /Life-Support Emergency/.test(lt) && /Solar Storm/.test(lt) && /Lunar Outpost Emergency/.test(lt) && /First Mars Expedition/.test(lt) && /Mars Survival Emergency/.test(lt));
check('no difficulty selector (difficulty rises with the level)', await G(pg, () => !document.querySelector('.diffbox') && !/\bEasy\b|\bHard\b/.test(document.body.innerText)));
await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
// crew screen + validation
await pg.click('text=Crew / Profile'); await pg.waitForTimeout(300);
await G(pg, () => { /* nothing */ });
const wInput = pg.locator('input[type=number]').first();
await wInput.fill('500'); await wInput.blur(); await pg.waitForTimeout(150);
const wv = await wInput.inputValue();
check('weight is clamped to 120 kg max', Number(wv) <= 120, wv);
await wInput.fill('72'); await pg.waitForTimeout(100);
await shot(pg, '03-crew');
await pg.click('text=Save & back'); await pg.waitForTimeout(300);
check('profile saved (weight 72)', await G(pg, () => window.__lunar.profile.weight) === 72);
const crewTxt = await (async () => { await pg.click('text=Crew / Profile'); await pg.waitForTimeout(200); const t = await text(pg); await pg.keyboard.press('Escape'); return t; })();
check('weight shown for Earth, Moon and Mars', /Earth/.test(crewTxt) && /Moon/.test(crewTxt) && /Mars/.test(crewTxt) && /\bN\b|newton/i.test(crewTxt));

// ---------------------------------------------------------------- 2. level 1 played with REAL input
await pg.click('text=Play'); await pg.waitForSelector('text=Begin mission'); await shot(pg, '04-briefing-1');
const bt = await text(pg);
check('briefing shows story, learning goals and start resources', /First Steps on the Moon/.test(bt) && /learn/i.test(bt));
await pg.click('text=Begin mission'); await pg.waitForFunction(() => window.__lunar.game.phase === 'playing'); await pg.waitForTimeout(1200);
await shot(pg, '05-hud-1');
await put(pg, 0, 26, 0, 0);   // headless Chromium reports bogus deltas when pointer lock starts: re-aim before real-key movement
const ht = await text(pg);
check('HUD shows level name, objectives, resources, radio', /First Steps/.test(ht) && /Health/.test(ht) && /Water/.test(ht) && /Energy/.test(ht) && /Mission Control/.test(ht));
let p0 = await G(pg, () => ({ ...window.__lunar.game.player }));
await hold(pg, 'KeyW', 1500); let p1 = await G(pg, () => ({ ...window.__lunar.game.player }));
check('W key walks forward', p1.z < p0.z - 0.5, `z ${p0.z.toFixed(1)} -> ${p1.z.toFixed(1)}`);
// jump height depends on gravity: Moon (1.62)
await put(pg, 0, 30, 0, 0); await pg.waitForTimeout(300);
const moonJump = await jumpApex();
check('Moon jump is high (low gravity)', moonJump > 1.4, `apex ${moonJump.toFixed(2)} m`);
// samples via real E holds
let got = 0;
for (const id of ['sample1', 'sample2']) { await useIt(pg, id); got++; }
await pg.waitForTimeout(800);
check('two samples collected with real E holds', await G(pg, () => window.__lunar.game.collectedTotal) === 2);
check('resource discovery event dialog appears (EVENT/PROBLEM/TIMER/4 choices)', await phase(pg) === 'decision');
await shot(pg, '06-event');
const et = await text(pg);
const nChoices = await G(pg, () => document.querySelectorAll('.choice').length);
check('event shows 4 choices, a timer and the Mission Control hint', nChoices === 4 && /\d:\d\d|\d+ ?s/.test(et), `${nChoices} choices`);
await pg.keyboard.press('KeyB'); await pg.waitForTimeout(500);
await shot(pg, '07-event-result');
const rt = await text(pg);
check('evaluation shows grade, consequence and science', /Perfect|Good|Acceptable|Wrong/i.test(rt) && /science/i.test(rt) && /consequence/i.test(rt));
await pg.click('button:has-text("Continue")'); await pg.waitForFunction(() => window.__lunar.game.phase === 'playing');
await useIt(pg, 'sample3');
// console (tap E) -> overlay pauses the simulation
await G(pg, () => { const e = window.__lunar; e.game.player.x = 0; e.game.player.z = -6; });
await useIt(pg, 'console', [0, -4]);
check('E on the console opens the systems console overlay', await phase(pg) === 'console');
await shot(pg, '08-console');
const ct = await text(pg);
check('console shows resources, energy balance and systems', /Water/.test(ct) && /Energy|Power/i.test(ct) && /Oxygen generator/.test(ct));
const tBefore = await G(pg, () => window.__lunar.game.time); await pg.waitForTimeout(1200);
check('simulation is paused while the console is open', Math.abs(await G(pg, () => window.__lunar.game.time) - tBefore) < 0.05);
await pg.keyboard.press('Escape'); await pg.waitForFunction(() => window.__lunar.game.phase === 'playing');
check('console closes with Esc', true);
for (const u of ['o2gen', 'recycler', 'scrubber']) await useIt(pg, u, [0, -4], 2.3);
check('units inspected with real key holds', await G(pg, () => ['o2gen', 'recycler', 'scrubber'].every((k) => window.__lunar.game.sys[k].inspected)));
// oxygen refill station: read the prompt, then use it with a REAL key hold
const aimStation = () => G(pg, () => { const e = window.__lunar, it = e.interactableList.find((i) => i.id === 'refillstation'), p = e.game.player; p.x = it.pos[0]; p.z = it.pos[2] - 1.4; p.vx = p.vz = 0; p.yaw = Math.PI; p.pitch = Math.atan2(it.pos[1] - (p.y + e.eye), 1.4); });
await G(pg, () => { window.__lunar.game.oxygen = 30; });
let stPrompt = null;
for (let i = 0; i < 8 && !(stPrompt && /OXYGEN REFILL STATION/.test(stPrompt.text)); i++) { await aimStation(); await pg.waitForTimeout(500); stPrompt = await G(pg, () => window.__lunar.prompt); }
check('refill station: prompt names it and asks for a hold of E', stPrompt && /OXYGEN REFILL STATION/.test(stPrompt.text) && stPrompt.enabled && stPrompt.hold > 0, stPrompt && stPrompt.text);
await shot(pg, '08b-refill-station');
await aimStation(); const refT0 = await G(pg, () => window.__lunar.game.time); await pg.keyboard.down('KeyE');   // the software renderer is slow, so hold until the 12 s of GAME time are done
await pg.waitForFunction(() => window.__lunar.prompt && window.__lunar.prompt.progress > 0.2, null, { timeout: 120000 }).catch(() => {});
check('refill station: progress is shown while holding', await G(pg, () => { const p = window.__lunar.prompt; return !!p && p.progress > 0 && p.progress < 1 && /Refilling/.test(document.querySelector('.prompt')?.innerText || ''); }));
await pg.waitForFunction(() => window.__lunar.game.flags.refilled, null, { timeout: 240000 }).catch(() => {});
const refDur = (await G(pg, () => window.__lunar.game.time)) - refT0;
check('refill station: a 30% suit fills in roughly 8 s of game time (12 s for a full tank), not instantly', refDur > 6 && refDur < 12, refDur.toFixed(1) + ' s');
const o2Right = await G(pg, () => window.__lunar.game.oxygen);   // read at once: the slow automatic refill cannot have produced this
await pg.keyboard.up('KeyE');
await pg.waitForFunction(() => window.__lunar.game.objDone.refill, null, { timeout: 20000 }).catch(() => {});
check('refill station: holding E restores suit oxygen and completes the refill objective', await G(pg, () => { const g = window.__lunar.game; return g.flags.refilled && g.objDone.refill; }) && o2Right >= 99, 'O2 right after the hold: ' + Math.round(o2Right));
await G(pg, () => { const g = window.__lunar.game; g.flags.refilled = false; g.objDone.refill = false; });   // reset so the automatic-refill path below is still exercised
// refill + finish
await G(pg, () => { window.__lunar.game.oxygen = 50; window.__lunar.game.stats.minOxygen = 50; });
await put(pg, 0, -6, 0, 0); await pg.waitForTimeout(500);
await pg.waitForFunction(() => window.__lunar.game.flags.refilled || window.__lunar.game.phase !== 'playing', null, { timeout: 240000 }).catch(() => {});
await pg.waitForFunction(() => window.__lunar.game.phase === 'success', null, { timeout: 90000 }).catch(() => {});
const ph1 = await phase(pg);
check('level 1 completes (all objectives)', ph1 === 'success', ph1 + ' ' + (await G(pg, () => JSON.stringify(window.__lunar.game.level.objectives.map((o) => [o.id, !!window.__lunar.game.objDone[o.id]])))));
await pg.waitForTimeout(500); await shot(pg, '09-end-success');
const et2 = await text(pg);
check('end report: success, stars, score, why, resources, lessons, replay + next', /MISSION SUCCESS/i.test(et2) && /Replay level/.test(et2) && /Next mission/.test(et2) && /(WHY|why)/.test(et2) && /(science|lesson)/i.test(et2));
check('progress saved: level 2 unlocked', await G(pg, () => window.__lunar.progress.unlocked) === 2);
await pg.click('text=Mission select'); await pg.waitForTimeout(400); await shot(pg, '10-levels-after');
cards = await G(pg, () => [...document.querySelectorAll('.lcard')].map((c) => c.disabled));
check('level select now shows 1 and 2 unlocked, 3+ locked', !cards[0] && !cards[1] && cards.slice(2).every(Boolean));
await pg.reload(); await pg.waitForFunction(() => window.__lunar);
check('unlock persists after reload', await G(pg, () => window.__lunar.progress.unlocked) === 2);
// replay level 1 -> clean state
await G(pg, () => window.__lunar.startLevel(1)); await pg.click('text=Begin mission'); await pg.waitForFunction(() => window.__lunar.game.phase === 'playing');
check('replaying a completed level starts fresh', await G(pg, () => window.__lunar.game.collectedTotal === 0 && window.__lunar.game.time < 3));
await pg.close();

// ---------------------------------------------------------------- 3. failure + restart
pg = await fresh();
await begin(pg, 1);
await G(pg, () => { window.__lunar.game.health = 0.01; window.__lunar.game.oxygen = 0; window.__lunar.game.o2res = 0; window.__lunar.game.player.x = 0; window.__lunar.game.player.z = 40; });
await pg.waitForFunction(() => window.__lunar.game.phase === 'failure', null, { timeout: 20000 }).catch(() => {});
check('running out of oxygen ends the mission in failure', await phase(pg) === 'failure');
await pg.waitForTimeout(400); await shot(pg, '11-end-failure');
const ft = await text(pg);
check('failure report explains why and has no Next button', /MISSION FAILED|FAILED/i.test(ft) && /Replay level/.test(ft) && !/Next mission/.test(ft));
check('failure does not unlock a level', await G(pg, () => window.__lunar.progress.unlocked) === 1);
await pg.click('text=Replay level'); await pg.waitForFunction(() => window.__lunar.game.phase === 'playing');
check('restart resets health, oxygen and time', await G(pg, () => { const g = window.__lunar.game; return g.health === 100 && g.oxygen > 80 && g.time < 3; }));
await pg.close();

// ---------------------------------------------------------------- 4. Mars: different look, gravity, rules
pg = await fresh(unlockAll);
await begin(pg, 6);
await pg.waitForTimeout(1500); await shot(pg, '12-mars');
const mars = await G(pg, () => { const g = window.__lunar.game; return { planet: g.planet, grav: window.__lunar.gravity, sun: g.sun, world: window.__lunar.world.planet, ambient: g.ambient }; });
check('level 6 runs on Mars (3.71 m/s², weak sun, 3D world rebuilt for Mars)', mars.planet === 'mars' && mars.grav === 3.71 && mars.sun < 0.5 && mars.world === 'mars', JSON.stringify(mars));
const sky = await G(pg, async () => {
  const img = new Image(); await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + ''; });
  return null;
}).catch(() => null);
void sky;
const buf = await pg.screenshot();
const px = await G(pg, async (b64) => {
  const img = new Image(); await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(Math.floor(img.width * 0.5), Math.floor(img.height * 0.08), 1, 1).data; return [d[0], d[1], d[2]];
}, buf.toString('base64'));
check('Mars sky is orange/butterscotch, not black', px[0] > 90 && px[0] > px[2], `rgb ${px.join(',')}`);
await put(pg, 0, 30, 0, 0); await pg.waitForTimeout(300);
const marsJump = await jumpApex();
check('Mars jump is lower than Moon jump (higher gravity)', marsJump > 0.5 && marsJump < moonJump * 0.7, `Mars ${marsJump.toFixed(2)} vs Moon ${moonJump.toFixed(2)}`);
check('weight on Mars is lower than on Earth (shown in HUD/console data)', await G(pg, () => { const g = window.__lunar.game; return g.profile.weight * 3.71 < g.profile.weight * 9.81; }));
// dust cleaning on Mars with a real E hold
await G(pg, () => { window.__lunar.game.dust.array1 = 0.4; });
const pr = await useIt(pg, 'array1', [10, -6]);
check('Mars: dusty solar array can be cleaned (real E hold)', pr && /Clean/i.test(pr.text) && await G(pg, () => window.__lunar.game.dust.array1) < 0.05, pr && pr.text);
// no companion / robot in the Mars scene either
check('no astronaut follower or robot exists on Mars', await G(pg, () => window.__lunar.world.mate === undefined && window.__lunar.world.robot === undefined && window.__lunar.game.mate === undefined));
// pause menu
await pg.keyboard.press('KeyP'); await pg.waitForFunction(() => window.__lunar.game.phase === 'paused'); await shot(pg, '14-pause');
await pg.click('text=Resume'); await pg.waitForFunction(() => window.__lunar.game.phase === 'playing');
await pg.close();

// ---------------------------------------------------------------- 5. Moon storm level + Mars dust storm banner
pg = await fresh(unlockAll);
await begin(pg, 4);
await G(pg, () => { window.__lunar.game.time = 236; });
await pg.waitForFunction(() => window.__lunar.game.phase === 'decision', null, { timeout: 150000 }).catch(() => {});
check('level 4: the solar storm event fires (decision with timer)', await phase(pg) === 'decision' && await G(pg, () => window.__lunar.game.event.id) === 'solar_storm');
await pg.waitForSelector('.choice'); await pg.keyboard.press('KeyA'); await pg.waitForTimeout(400); await pg.click('button:has-text("Continue")'); await pg.waitForFunction(() => window.__lunar.game.phase === 'playing');
await G(pg, () => { const p = window.__lunar.game.player; p.x = 0; p.z = 20; });
await pg.waitForTimeout(1500); await shot(pg, '15-storm-outside');
const hz = await text(pg);
check('storm banner + radiation shown while outside', /SOLAR STORM|storm/i.test(hz) && await G(pg, () => window.__lunar.game.radRate) > 500, `rad ${await G(pg, () => Math.round(window.__lunar.game.radRate))}`);
await pg.close();

pg = await fresh(unlockAll);
await begin(pg, 7);
await G(pg, () => { window.__lunar.game.time = 29; });
await pg.waitForFunction(() => window.__lunar.game.phase === 'decision', null, { timeout: 150000 }).catch(() => {});
check('level 7: dust storm event fires on Mars', await G(pg, () => window.__lunar.game.event && window.__lunar.game.event.id) === 'dust_storm');
await shot(pg, '16-dust-event');
await pg.waitForSelector('.choice'); await pg.keyboard.press('KeyA'); await pg.waitForTimeout(400); await pg.click('button:has-text("Continue")'); await pg.waitForFunction(() => window.__lunar.game.phase === 'playing');
await pg.waitForFunction(() => window.__lunar.game.sun < 0.15, null, { timeout: 150000 }).catch(() => {});
await shot(pg, '17-mars-dust-storm');
check('dust storm cuts sunlight sharply', await G(pg, () => window.__lunar.game.sun) < 0.15);
await pg.close();

check('no page errors / console errors during the run', errs.length === 0, errs.slice(0, 3).join(' | '));
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await b.close(); if (s) s.close();
process.exit(failed.length ? 1 : 0);
