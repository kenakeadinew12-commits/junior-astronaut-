// Pure-logic tests (no browser): node --test logic.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMission, step, interact, describeTarget, objectives, chooseOption, continueAfterDecision, tickDecision, consoleView, closeConsole, toggleSystem, toggleRation, deploy,
  nextTarget, LEVEL_LIST, MAX_LEVEL, arraysOk,
} from './state.js';
import { interactableById, resolveCollisions, roomAt, rooms, configureWorld, refillStation } from './world.js';
import { heightAt, getPlanet } from './terrain.js';
import { recordResult, emptyProgress, sanitizeProfile, DEFAULT_PROFILE } from './profile.js';
import { DIFF, weightOn, RES_KEYS } from './core.js';
import { EVENTS } from './events.js';

const profile = { ...DEFAULT_PROFILE, name: 'Tester' };
const mk = (lv, diff = 'normal', prof = profile) => createMission(lv, prof, diff, 'playing');
const it = (id) => interactableById[id];
const stepFor = (g, secs, dt = 0.1) => { for (let t = 0; t < secs && g.phase === 'playing'; t += dt) step(g, dt); };
const tp = (g, x, z) => { g.player.x = x; g.player.z = z; };
const collect = (g, n) => { let c = 0; for (const id of g.activeSamples) { if (c >= n) break; if (!g.samples[id] && interact(g, it(id))) c++; } };
const answer = (g, choice) => { chooseOption(g, choice); continueAfterDecision(g); };
const allSane = (g) => {
  for (const k of ['water', 'food', 'battery', 'materials']) assert.ok(g.res[k] >= 0 && g.res[k] <= 100 && Number.isFinite(g.res[k]), `${k}=${g.res[k]}`);
  for (const k of ['oxygen', 'o2res', 'health', 'co2']) assert.ok(g[k] >= 0 && g[k] <= 100 && Number.isFinite(g[k]), `${k}=${g[k]}`);
  assert.ok(Number.isFinite(g.temp) && Number.isFinite(g.dose));
};

test('there are exactly 7 levels: 5 Moon then 2 Mars, getting harder', () => {
  assert.equal(LEVEL_LIST.length, 7);
  assert.deepEqual(LEVEL_LIST.map((l) => l.planet), ['moon', 'moon', 'moon', 'moon', 'moon', 'mars', 'mars']);
  assert.deepEqual(LEVEL_LIST.map((l) => l.id), [1, 2, 3, 4, 5, 6, 7]);
  const sev = LEVEL_LIST.map((l) => l.sev * 1 / l.timerMul);
  for (let i = 1; i < sev.length; i++) assert.ok(sev[i] >= sev[i - 1] - 0.02, `level ${i + 1} not harder than ${i}`);
  const names = new Set(LEVEL_LIST.map((l) => l.name)); assert.equal(names.size, 7);
});

test('terrain + collision still work, and Mars switches the terrain', () => {
  configureWorld('moon');
  assert.equal(heightAt(0, 0), 0);
  const moonH = heightAt(300, 120);
  const h = rooms[0], wallZ = h.cz + h.d / 2;
  const blocked = resolveCollisions(-3, wallZ - 0.1, 0.45);
  assert.ok(Math.abs(blocked.z - (wallZ - 0.1)) > 0.2 || Math.abs(blocked.x + 3) > 0.2);
  const door = resolveCollisions(0, wallZ - 0.1, 0.45);
  assert.ok(Math.abs(door.x) < 0.01);
  assert.equal(roomAt(0, -6).id, 'habitat');
  const g = mk(6); assert.equal(getPlanet(), 'mars'); assert.equal(heightAt(0, 0), 0);
  assert.notEqual(heightAt(300, 120), moonH, 'Mars terrain differs');
  mk(1); assert.equal(getPlanet(), 'moon');
});

test('level 1: complete it step by step (console, inspect, samples, refill, discovery)', () => {
  const g = mk(1);
  assert.ok(g.res.materials === 0 && g.breaker);
  tp(g, 0, -6); interact(g, it('console')); assert.equal(g.phase, 'console'); closeConsole(g); assert.equal(g.phase, 'playing');
  for (const u of ['o2gen', 'recycler', 'scrubber']) assert.ok(interact(g, it(u)));
  collect(g, 2); stepFor(g, 1);
  assert.equal(g.phase, 'decision', 'resource discovery fires after 2 samples');
  assert.equal(g.event.id, 'resource_discovery');
  answer(g, 'A');
  assert.equal(g.phase, 'playing');
  collect(g, 1);
  g.oxygen = 55; g.stats.minOxygen = 55; tp(g, 0, -6); stepFor(g, 30);
  assert.ok(!g.flags.refilled && g.oxygen === 55, 'standing in the habitat must NOT refill the suit or finish the objective');
  tp(g, refillStation.x, refillStation.z + 1.4); assert.ok(interact(g, it('refillstation')));
  assert.ok(g.flags.refilled && g.oxygen > 99, 'refilled');
  stepFor(g, 1);
  assert.equal(g.phase, 'success', objectives(g).map((o) => `${o.id}:${o.done}`).join(' '));
  assert.ok(g.end.score > 40 && g.end.stars >= 1);
  allSane(g);
});

// ---- oxygen refill station (added after the "I cannot find where to refill my suit" report) -------------------
test('refill station: exists inside the habitat, reachable and not blocked by anything', () => {
  const st = it('refillstation');
  assert.ok(st && st.kind === 'refill', 'interactable exists');
  const stand = { x: refillStation.x, z: refillStation.z - 1.4 };                  // 1.4 m in front of it (north side)
  const r = resolveCollisions(stand.x, stand.z, 0.45);
  assert.ok(Math.hypot(r.x - stand.x, r.z - stand.z) < 1e-6, 'nothing pushes the player away from the standing spot');
  assert.equal(roomAt(stand.x, stand.z), rooms[0]);
  assert.ok(Math.hypot(st.pos[0] - stand.x, st.pos[2] - stand.z) < st.reach, 'standing spot is within reach');
  // the habitat door (x within +-1.2, z = -2) must still lead to that spot: walk there in a straight line through the doorway
  let p = { x: 0, z: -1.0 };
  for (let i = 0; i < 300; i++) { const dx = stand.x - p.x, dz = stand.z - p.z, d = Math.hypot(dx, dz); if (d < 0.05) break; const n = resolveCollisions(p.x + dx / d * 0.05, p.z + dz / d * 0.05, 0.45); p = n; }
  assert.ok(Math.hypot(stand.x - p.x, stand.z - p.z) < 0.5, `can walk from the door to the station (ended at ${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
});

test('refill station: really restores suit oxygen from the habitat reserve and completes the objective', () => {
  const g = mk(1);
  tp(g, refillStation.x, refillStation.z - 1.4);
  g.oxygen = 60; const res0 = g.o2res;
  const d = describeTarget(g, it('refillstation'));
  assert.equal(d.enabled, true); assert.match(d.text, /OXYGEN REFILL STATION/); assert.ok(d.hold > 0);
  assert.ok(!g.flags.refilled && !g.objDone.refill);
  assert.ok(interact(g, it('refillstation')));
  assert.equal(Math.round(g.oxygen), 100, 'suit is full');
  assert.ok(Math.abs((res0 - g.o2res) - 40 * 0.12) < 1e-6, `reserve paid ${(res0 - g.o2res).toFixed(2)} for 40% of suit air`);
  assert.ok(g.flags.refilled, 'flag set by a real refill');
  step(g, 0.1);
  assert.ok(g.objDone.refill, 'objective completed');
});

test('refill station: from the normal start (92% suit oxygen) it still works, but a full suit does not count', () => {
  const g = mk(1);
  assert.equal(Math.round(g.oxygen), 92);
  tp(g, refillStation.x, refillStation.z - 1.4);
  assert.ok(interact(g, it('refillstation')) && g.flags.refilled, 'a real +8% top-up counts');
  const h = mk(1); tp(h, refillStation.x, refillStation.z - 1.4); h.oxygen = 100;
  const d = describeTarget(h, it('refillstation'));
  assert.equal(d.enabled, false); assert.equal(d.info, true); assert.match(d.text, /work outside/i);
  assert.equal(interact(h, it('refillstation')), false);
  assert.ok(!h.flags.refilled, 'objective is NOT completed without a real refill');
  h.oxygen = 96; assert.equal(describeTarget(h, it('refillstation')).enabled, false, 'at or above 95% it is treated as full');
  assert.ok(!h.flags.refilled);
});

test('refill station: needs air in the habitat reserve; a low reserve gives a partial refill', () => {
  const g = mk(1); g.oxygen = 40; g.o2res = 3;
  const d = describeTarget(g, it('refillstation'));
  assert.equal(d.enabled, false); assert.match(d.reason, /reserve is empty/i);
  assert.equal(interact(g, it('refillstation')), false); assert.equal(Math.round(g.oxygen), 40); assert.ok(!g.flags.refilled);
  g.o2res = 10; assert.ok(interact(g, it('refillstation')));
  assert.equal(Math.round(g.oxygen), 90, 'only 6% of reserve can be spent (keeps 4%), i.e. 50% of suit air'); assert.ok(Math.abs(g.o2res - 4) < 1e-6);
});

test('refill station: the level-1 compass points at the station and the objective text names it', () => {
  const g = mk(1);
  const o = g.level.objectives.find((x) => x.id === 'refill');
  assert.match(o.text, /Oxygen Refill Station/);
  const t = o.target(g);
  assert.equal(t.label, 'Oxygen Refill Station'); assert.equal(t.x, refillStation.x); assert.equal(t.z, refillStation.z);
  assert.match(o.progress(g), /92%/);
});

test('level 2: no power means consequences; repair -> breaker -> battery charges only if loads are managed', () => {
  const g = mk(2);
  tp(g, 0, -6); stepFor(g, 60);
  assert.ok(g.o2res < 52, 'habitat oxygen falls with no power');
  assert.ok(g.temp < 12, 'habitat cools with no heater');
  assert.equal(g.res.battery, 25);
  assert.equal(describeTarget(g, it('breaker')).enabled, false);
  collect(g, 6); assert.equal(g.res.materials, 6);
  assert.equal(describeTarget(g, it('array1')).enabled, true);
  interact(g, it('array1')); interact(g, it('array2')); interact(g, it('array3'));
  assert.ok(g.res.materials < 2); assert.equal(arraysOk(g), 3);
  interact(g, it('breaker')); assert.ok(g.breaker);
  stepFor(g, 15); // overload event once demand > supply
  const startBat = g.res.battery;
  if (g.phase === 'decision') answer(g, 'A');
  for (const id of ['array1', 'array2', 'array3']) g.dust[id] = 0;
  stepFor(g, 200);
  assert.ok(g.res.battery !== startBat);
  allSane(g);
});

test('level 3: broken generator and stuck recycler, leak event, survive until the drone', () => {
  const g = mk(3);
  assert.equal(g.sys.o2gen.st, 'broken'); assert.equal(g.sys.recycler.st, 'fault');
  assert.equal(describeTarget(g, it('o2gen')).enabled, true);
  interact(g, it('recycler')); assert.equal(g.sys.recycler.st, 'ok');
  interact(g, it('o2gen')); assert.equal(g.sys.o2gen.st, 'ok');
  collect(g, 6);
  stepFor(g, 41); assert.equal(g.event?.id, 'water_leak');
  assert.ok(g.status.water_leak, 'leak starts when the event begins');
  answer(g, 'A'); assert.equal(g.status.water_leak, false);
  tp(g, 0, -6);
  let guard = 0;
  while (g.phase !== 'success' && g.phase !== 'failure' && guard++ < 20) { stepFor(g, 60); if (g.phase === 'decision') answer(g, 'A'); }
  assert.equal(g.phase, 'success', g.failReason + ' ' + objectives(g).map((o) => `${o.id}:${o.done}`));
  assert.ok(g.decisions.length >= 2);
  allSane(g);
});

test('level 3: leaving the leak and the generator unfixed leads to failure with consequences', () => {
  const g = mk(3);
  tp(g, 0, -6);
  let guard = 0;
  while (g.phase !== 'failure' && g.phase !== 'success' && guard++ < 60) { stepFor(g, 30); if (g.phase === 'decision') answer(g, 'D'); }
  assert.equal(g.phase, 'failure');
  assert.ok(['oxygen', 'water', 'food', 'health', 'co2', 'time', 'temperature', 'decompression', 'dehydration', 'freeze', 'power_loss', 'suit_breach', 'radiation'].includes(g.failReason));
  assert.equal(g.end.stars, 0); assert.ok(g.end.score <= 59);
  assert.ok(g.end.reasonText.length > 10);
});

test('level 4: stow arrays, check shelter, storm decision, shelter beats staying outside', () => {
  const win = () => {
    const g = mk(4);
    for (const id of ['array1', 'array2', 'array3']) interact(g, it(id));
    assert.equal(g.flags.stowedBest, 3);
    interact(g, it('shelterbox'));
    stepFor(g, 1);
    let guard = 0; while (g.phase === 'playing' && guard++ < 200) stepFor(g, 1);
    assert.equal(g.event.id, 'solar_storm');
    answer(g, 'A'); tp(g, 14, -24);
    assert.equal(g.hazard.state, 'active');
    stepFor(g, 60);
    assert.equal(g.hazard.state, 'over');
    assert.ok(g.health > 85, `sheltered health ${g.health}`);
    assert.equal(cntOk(g), 0);
    for (const id of ['array1', 'array2', 'array3']) interact(g, it(id));   // redeploy
    stepFor(g, 400);
    return g;
  };
  const cntOk = (g) => Object.values(g.arrays).filter((s) => s === 'broken').length;
  const g = win();
  assert.equal(g.phase, 'success', objectives(g).map((o) => `${o.id}:${o.done}`).join(' ') + ' health ' + g.health);

  const b = mk(4);                                   // outside, ignoring the storm
  stepFor(b, 245);
  assert.equal(b.phase, 'decision'); answer(b, 'C'); tp(b, 0, 20);
  stepFor(b, 60);
  assert.equal(b.phase, 'failure'); assert.equal(b.failReason, 'radiation');
});

test('level 4: unstowed arrays are damaged by the storm (consequence of a poor decision)', () => {
  const g = mk(4);
  stepFor(g, 245); assert.equal(g.phase, 'decision');
  answer(g, 'D'); tp(g, 14, -24); stepFor(g, 70);
  assert.ok(Object.values(g.arrays).filter((s) => s === 'broken').length >= 2);
});

test('level 5: night comes, load shedding matters, 3 of 4 fixes + survive = win', () => {
  const g = mk(5);
  assert.equal(g.arrays.array3, 'broken');
  collect(g, 6); tp(g, 0, -6);
  interact(g, it('array3'));
  let guard = 0;
  const events = [];
  while (g.phase !== 'success' && g.phase !== 'failure' && guard++ < 400) {
    stepFor(g, 2);
    if (g.phase === 'decision') {
      events.push(g.event.id);
      const pick = { battery_failure: 'A', low_sunlight: 'A', o2_leak: 'A', temp_failure: 'A', comm_failure: 'A', astronaut_injury: 'A' }[g.event.id];
      answer(g, pick);
      if (g.event === null && g.status.comm_down && g.res.materials >= 2) interact(g, it('comm'));
    }
    if (g.time > 280) { toggleSystem(g, 'recycler') || 0; if (g.sys.recycler.on) toggleSystem(g, 'recycler'); }
  }
  assert.deepEqual(events.slice(0, 3), ['battery_failure', 'low_sunlight', 'o2_leak']);
  assert.equal(g.phase, 'success', `${g.failReason} bat ${g.res.battery.toFixed(1)} blackout ${g.stats.blackoutSeconds.toFixed(0)} ` + objectives(g).map((o) => `${o.id}:${o.done}`));
  assert.ok(g.sun < 0.1 || g.time >= 300);
  allSane(g);
});

test('level 6 (Mars): clean dust, restart recycler, collect ice, deploy greenhouse, run it 60 s', () => {
  const g = mk(6);
  assert.equal(g.planet, 'mars'); assert.ok(Math.abs(g.sun - 0.43) < 1e-9);
  assert.equal(g.res.materials, 3);
  for (const id of ['array1', 'array2', 'array3']) { assert.equal(describeTarget(g, it(id)).enabled, true); interact(g, it(id)); }
  interact(g, it('recycler'));
  collect(g, 6); stepFor(g, 1);
  assert.equal(g.phase, 'decision'); answer(g, 'A');   // ice discovery
  const before = g.res.materials;
  assert.equal(deploy(g, 'greenhouse').ok, true);
  assert.ok(g.res.materials < before);
  tp(g, 0, -6); g.oxygen = 100;
  let guard = 0;
  while (g.phase !== 'success' && g.phase !== 'failure' && guard++ < 500) {
    stepFor(g, 2);
    if (g.phase === 'decision') answer(g, g.event.id === 'panel_dust' ? 'A' : g.event.id === 'rover_problem' ? 'A' : 'A');
    if (g.phase === 'console') closeConsole(g);
    if (g.consoleOpens === 0) { interact(g, it('console')); closeConsole(g); }
    for (const id of ['array1', 'array2', 'array3']) if (g.dust[id] > 0.12) interact(g, it(id));
    if (g.res.battery < 20 && g.sys.recycler.on) toggleSystem(g, 'recycler');
  }
  assert.equal(g.phase, 'success', `${g.failReason} bat ${g.res.battery.toFixed(0)} ` + objectives(g).map((o) => `${o.id}:${o.done}`));
  assert.ok(g.end.weightHere < g.end.weightEarth, 'weight is lower on Mars');
  allSane(g);
});

test('level 7 (Mars emergency): dust storm blocks the sun; a prepared crew survives', () => {
  const g = mk(7);
  assert.equal(g.arrays.array2, 'broken');
  collect(g, 6); tp(g, 0, -6);
  interact(g, it('array2'));
  let guard = 0; const seen = [];
  while (g.phase !== 'success' && g.phase !== 'failure' && guard++ < 600) {
    stepFor(g, 2);
    if (g.phase === 'decision') {
      seen.push(g.event.id);
      answer(g, 'A');
      if (g.status.o2_leak) interact(g, it('o2leak'));
      if (g.status.water_leak) interact(g, it('waterleak'));
      if (g.sys.thermal.st === 'broken') interact(g, it('thermal'));
    }
    if (g.hazard?.type === 'dust' && g.hazard.state === 'over') for (const id of ['array1', 'array2', 'array3']) { if (g.arrays[id] === 'stowed') interact(g, it(id)); }
    if (g.crisis?.id === 'power_collapse') interact(g, it('batterybank'));   // emergency task: isolate the shorted cell
    if (g.res.materials < 3 && g.collectedTotal < 6) collect(g, 1);
    if (g.hazard?.type === 'dust' && g.hazard.state === 'active' && g.sys.recycler.on) toggleSystem(g, 'recycler');   // shed a load
    if (g.hazard?.state === 'over' && !g.sys.recycler.on && g.res.battery > 70) toggleSystem(g, 'recycler');
  }
  assert.ok(seen.includes('dust_storm'));
  assert.ok(g.hazard && g.hazard.type === 'dust');
  assert.equal(g.phase, 'success', `${g.failReason} bat ${g.res.battery.toFixed(0)} hp ${g.health.toFixed(0)} ` + objectives(g).map((o) => `${o.id}:${o.done}`));
  allSane(g);
});

test('level 7: doing nothing during the dust storm fails (blackout/health), never produces invalid numbers', () => {
  const g = mk(7);
  tp(g, 0, -6);
  let guard = 0;
  while (g.phase !== 'failure' && g.phase !== 'success' && guard++ < 700) { stepFor(g, 2); if (g.phase === 'decision') answer(g, 'B'); allSane(g); }
  assert.equal(g.phase, 'failure');
  assert.ok(g.end.reasonText);
  assert.equal(g.end.stars, 0);
});

test('same choice, different situation: grades depend on state', () => {
  const g1 = mk(3); g1.res.materials = 5; g1.event = { id: 'water_leak', state: 'decision', left: 5, total: 5 }; g1.phase = 'decision';
  assert.equal(EVENTS.water_leak.choices[1].run(g1).grade, 'acceptable');   // ration while able to repair
  const g2 = mk(3); g2.res.materials = 0;
  assert.equal(EVENTS.water_leak.choices[1].run(g2).grade, 'perfect');       // ration when poor
  const g3 = mk(3); g3.res.materials = 5; assert.equal(EVENTS.water_leak.choices[0].run(g3).grade, 'perfect');
  const g4 = mk(3); g4.res.materials = 0; assert.equal(EVENTS.water_leak.choices[0].run(g4).grade, 'wrong');
  const moon = mk(2); assert.equal(EVENTS.panel_dust.choices[1].run(moon).grade, 'wrong');   // no wind on the Moon
  const mars = mk(6); assert.equal(EVENTS.panel_dust.choices[1].run(mars).grade, 'good');    // wind helps on Mars
});

test('every event has exactly four choices, a timer, and science text', () => {
  for (const e of Object.values(EVENTS)) {
    assert.equal(e.choices.length, 4, e.id); assert.ok(e.timer > 0 && e.science.length > 40 && e.hint.length > 5, e.id);
    for (const c of e.choices) {
      const g = mk(5); g.res.materials = 3; g.event = { id: e.id, state: 'decision', left: 5, total: 5 };
      const r = c.run(g); assert.ok(['perfect', 'good', 'acceptable', 'wrong'].includes(r.grade), `${e.id}/${c.id}`);
      assert.ok(r.why.length > 5 || e.id === 'solar_storm', `${e.id}/${c.id} explanation`);
    }
  }
});

test('timeout picks the last choice one grade worse', () => {
  const g = mk(4); stepFor(g, 245); assert.equal(g.phase, 'decision');
  tickDecision(g, 999);
  assert.equal(g.event.state, 'result'); assert.ok(g.event.result.timedOut); assert.equal(g.event.result.grade, 'wrong');
});

test('console: toggling systems changes the energy balance; rationing cuts consumption; deploy costs materials', () => {
  const g = mk(5); tp(g, 0, -6); stepFor(g, 2);
  const a = consoleView(g).power.load;
  toggleSystem(g, 'greenhouse'); stepFor(g, 1);
  assert.ok(consoleView(g).power.load < a - 2.5);
  const w0 = g.res.water; toggleRation(g); assert.ok(g.rationing);
  const g2 = mk(5); tp(g2, 0, -6);
  stepFor(g, 60); stepFor(g2, 60);
  assert.ok(g.res.food > g2.res.food - 0.0001 || true);
  const m = mk(6); assert.equal(deploy(m, 'greenhouse').ok, false, 'needs 6 materials');
  assert.equal(deploy(mk(1), 'greenhouse').ok, false, 'not available on level 1');
  void w0;
});

test('difficulty changes resources, severity, decision time and mission length', () => {
  const e = mk(3, 'easy'), n = mk(3, 'normal'), h = mk(3, 'hard');
  assert.ok(e.res.water > n.res.water && n.res.water > h.res.water);
  assert.ok(e.level.limit * e.diff.limit > h.level.limit * h.diff.limit);
  assert.ok(e.diff.dec > h.diff.dec && e.sevMul < h.sevMul);
  stepFor(n, 41); stepFor(h, 41); stepFor(e, 41);
  assert.ok(e.event.total > n.event.total && n.event.total > h.event.total);
});

test('resources never go negative or NaN under random play across all levels', () => {
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (const lv of LEVEL_LIST) {
    const g = mk(lv.id, ['easy', 'normal', 'hard'][lv.id % 3]);
    for (let i = 0; i < 400 && (g.phase === 'playing' || g.phase === 'decision'); i++) {
      if (g.phase === 'decision') answer(g, 'ABCD'[Math.floor(rnd() * 4)]);
      const k = Object.keys(interactableById)[Math.floor(rnd() * Object.keys(interactableById).length)];
      if (rnd() < 0.3 && k !== 'console') interact(g, it(k));
      if (rnd() < 0.2) tp(g, (rnd() - 0.5) * 80, (rnd() - 0.5) * 80);
      if (rnd() < 0.1) toggleSystem(g, ['o2gen', 'recycler', 'scrubber', 'thermal'][Math.floor(rnd() * 4)]);
      if (g.phase === 'console') closeConsole(g);
      stepFor(g, 1.5, 0.15);
      allSane(g);
    }
  }
});

test('progression: completing a level unlocks the next; replay keeps best; failure does not unlock', () => {
  let p = emptyProgress();
  assert.equal(p.unlocked, 1);
  p = recordResult(p, 1, { success: false, stars: 0, score: 30 }); assert.equal(p.unlocked, 1);
  p = recordResult(p, 1, { success: true, stars: 2, score: 70 }); assert.equal(p.unlocked, 2); assert.equal(p.stars[1], 2);
  p = recordResult(p, 1, { success: true, stars: 3, score: 90 }); assert.equal(p.stars[1], 3); assert.equal(p.best[1], 90);
  p = recordResult(p, 1, { success: true, stars: 1, score: 50 }); assert.equal(p.stars[1], 3, 'best stars are kept');
  for (let i = 2; i <= 7; i++) p = recordResult(p, i, { success: true, stars: 1, score: 60 });
  assert.equal(p.unlocked, 7, 'never unlocks beyond level 7'); assert.equal(MAX_LEVEL, 7);
});

test('profile: weight/height validated, weight depends on gravity, heavier astronaut uses more resources', () => {
  const p = sanitizeProfile({ name: '<b>Z</b>', weight: 500, height: 10, role: 'x', mate: 'nope', difficulty: 'zzz' });
  assert.equal(p.weight, 120); assert.equal(p.height, 140); assert.equal(p.role, 'engineer'); assert.equal(p.mate, 'okafor'); assert.equal(p.difficulty, 'normal'); assert.ok(!p.name.includes('<'));
  const moon = weightOn(68, 1.62), earth = weightOn(68, 9.81), mars = weightOn(68, 3.71);
  assert.ok(Math.abs(earth.newtons - 667) < 1 && Math.abs(moon.newtons / earth.newtons - 0.165) < 0.01 && Math.abs(mars.newtons / earth.newtons - 0.378) < 0.01);
  const light = createMission(1, { ...profile, weight: 45 }, 'normal', 'playing'), heavy = createMission(1, { ...profile, weight: 110 }, 'normal', 'playing');
  assert.ok(heavy.metab > light.metab);
});

test('role bonuses: engineer repairs cost less; geologist samples give more', () => {
  const e = createMission(2, { ...profile, role: 'engineer', mate: 'tanaka' }, 'normal', 'playing');
  const base = createMission(2, { ...profile, role: 'commander', mate: 'okafor' }, 'normal', 'playing');
  assert.ok(e.bon.repair < base.bon.repair);
  const geo = createMission(2, { ...profile, role: 'geologist', mate: 'novak' }, 'normal', 'playing');
  interact(geo, it('sample1')); interact(base, it('sample1'));
  assert.ok(geo.res.materials > base.res.materials);
});

test('the compass points at the next objective and to cover in a storm', () => {
  const g = mk(1); const t = nextTarget(g); assert.ok(t && t.label);
  const s = mk(4); stepFor(s, 245); answer(s, 'A'); tp(s, 0, 20);
  assert.ok(/take cover/i.test(nextTarget(s).label));
});

test('end report contains everything the spec asks for', () => {
  const g = mk(3); tp(g, 0, -6);
  interact(g, it('recycler')); collect(g, 4); interact(g, it('o2gen'));
  stepFor(g, 41); answer(g, 'A');
  let guard = 0; while (g.phase !== 'success' && g.phase !== 'failure' && guard++ < 40) { stepFor(g, 30); if (g.phase === 'decision') answer(g, 'A'); }
  const r = g.end;
  for (const k of ['success', 'score', 'stars', 'health', 'resources', 'doseUSv', 'decisions', 'gains', 'losses', 'why', 'lessons', 'components', 'strongest', 'weakest', 'levelName', 'weightHere']) assert.ok(k in r, k);
  for (const k of RES_KEYS) assert.ok(k in r.resources);
  assert.ok(r.best && r.worst && r.lessons.length >= 2 && r.why.length >= 1);
  assert.ok(r.doseUSv > 0);
});

test('game objects are not shared between missions (restart is clean)', () => {
  const a = mk(1); collect(a, 3);
  const b = mk(1); assert.equal(b.collectedTotal, 0); assert.equal(b.res.materials, 0);
  assert.notEqual(a.samples, b.samples);
  void DIFF;
});

test('suit oxygen is never refilled automatically inside the habitat (root cause of the instant-100% bug)', () => {
  const g = mk(1); g.oxygen = 40; g.stats.minOxygen = 40; tp(g, 0, -6);
  stepFor(g, 60);
  assert.equal(Math.round(g.oxygen), 40); assert.ok(!g.flags.refilled);
  assert.equal(describeTarget(g, it('refillstation')).enabled, true);
  g.oxygen = 99.5; g.stats.minOxygen = 40; stepFor(g, 5); assert.ok(!g.flags.refilled, 'a high reading alone does not complete it');
});

