// Gameplay-upgrade tests (no browser): node --test gameplay.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createMission, step, interact, describeTarget, refillStep, refillEnd, REFILL_SECONDS, LEVEL_LIST, chooseOption, continueAfterDecision, eventView, nextTarget,
} from './state.js';
import { interactableById, rooms } from './world.js';
import { DEFAULT_PROFILE } from './profile.js';
import { EVENTS, startEvent, gradeChoices, LETTERS } from './events.js';
import { GRADE_ORDER } from './core.js';
import { triggerCrisis, crisisView, stageSeconds, CRISES } from './crisis.js';
import { CONTACTS, levelQuestions, answerFor, DISCLAIMER } from './contacts.js';
import { Sfx } from './audio.js';

const mk = (lv) => createMission(lv, { ...DEFAULT_PROFILE, name: 'Tester' }, 'normal', 'playing');
const it = (id) => interactableById[id];
const run = (g, secs, dt = 0.1) => { for (let t = 0; t < secs && g.phase === 'playing'; t += dt) step(g, dt); };
const inHab = (g) => { g.player.x = 0; g.player.z = -6; };
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

// ------------------------------------------------------------------ refill
test('refill: an empty suit fills in about 12 s with visible progress, then play continues', () => {
  const g = mk(1); inHab(g); g.oxygen = 0; g.stats.minOxygen = 0; g.o2res = 90;
  assert.equal(REFILL_SECONDS, 12);
  const d = describeTarget(g, it('refillstation'));
  assert.equal(d.enabled, true); assert.equal(d.continuous, true); assert.ok(d.hold >= 10 && d.hold <= 15);
  let t = 0, last = 0, prog;
  while (g.oxygen < 99.9 && t < 30) { prog = refillStep(g, 0.05); assert.ok(prog >= last - 1e-9, 'progress never goes backwards'); last = prog; t += 0.05; }
  assert.ok(t >= 11.5 && t <= 12.6, `took ${t.toFixed(2)} s`);
  assert.ok(prog > 0.99); assert.ok(g.flags.refilled);
  assert.ok(g.o2res < 90, 'the air comes from the habitat reserve');
  refillEnd(g);
  assert.equal(g.phase, 'playing'); run(g, 1); assert.equal(g.phase, 'playing');
});
test('refill: the prompt stays enabled while a refill is in progress, even above 95% (so the hold can finish)', () => {
  const g = mk(1); inHab(g); g.oxygen = 60; g.stats.minOxygen = 60; g.o2res = 90;
  let n = 0; while (g.oxygen < 96 && n++ < 1000) { assert.equal(describeTarget(g, it('refillstation')).enabled, true); refillStep(g, 0.05); }
  assert.ok(g.oxygen >= 96 && !g.refillSession.done);
  assert.equal(describeTarget(g, it('refillstation')).enabled, true, 'still enabled at 96%');
  while (g.oxygen < 99.9 && n++ < 2000) refillStep(g, 0.05);
  assert.ok(g.flags.refilled); assert.equal(describeTarget(g, it('refillstation')).enabled, false, 'full suit: nothing left to do');
});
test('refill: letting go keeps the oxygen gained so far; a half-empty suit takes about half the time', () => {
  const g = mk(1); inHab(g); g.oxygen = 50; g.stats.minOxygen = 50; g.o2res = 90;
  for (let i = 0; i < 40; i++) refillStep(g, 0.05);     // 2 s
  refillEnd(g);
  assert.ok(Math.abs(g.oxygen - (50 + 100 / 12 * 2)) < 0.5, `oxygen ${g.oxygen}`);
  assert.ok(!g.flags.refilled, 'a short top-up is not the full refill');
  let t = 0; while (g.oxygen < 99.9 && t < 30) { refillStep(g, 0.05); t += 0.05; }
  assert.ok(t > 3 && t < 5, `remaining time ${t.toFixed(2)}`); assert.ok(g.flags.refilled);
});

// ------------------------------------------------------------------ answer positions
test('every decision has four choices on letters A-D and the original grading ids are kept', () => {
  for (const ev of Object.values(EVENTS)) assert.equal(ev.choices.length, 4, ev.id);
  assert.deepEqual(LETTERS, ['A', 'B', 'C', 'D']);
});
test('answer shuffle: the best answer lands on A, B, C and D evenly and shuffling never changes grading', () => {
  const counts = [0, 0, 0, 0]; let checked = 0;
  for (const lv of [1, 3, 5, 7]) {
    const g = mk(lv); g.rng = seeded(lv * 7 + 1);
    for (let n = 0; n < 60; n++) {
      for (const id of Object.keys(EVENTS)) {
        g.event = null; g.phase = 'playing'; g.res.materials = n % 5; g.oxygen = 30 + (n * 7) % 70; g.res.battery = 10 + (n * 11) % 90;
        assert.ok(startEvent(g, id, 20));
        const ev = EVENTS[id];
        const grades = gradeChoices(g, ev);                      // dry-run grade of each authored choice
        const view = eventView(g);
        assert.equal(view.choices.length, 4);
        assert.deepEqual(view.choices.map((c) => c.letter), ['A', 'B', 'C', 'D']);
        assert.deepEqual([...view.choices.map((c) => c.id)].sort(), ['A', 'B', 'C', 'D'], 'same four authored choices');
        const best = Math.min(...grades);
        const bestPos = view.choices.findIndex((c) => grades[ev.choices.findIndex((x) => x.id === c.id)] === best);
        if (id === 'resource_discovery') counts[bestPos]++;
        // pick a displayed position and check the graded result equals the dry-run grade of that very choice
        const pick = (n + lv) % 4;
        const picked = view.choices[pick];
        const expected = GRADE_ORDER[grades[ev.choices.findIndex((x) => x.id === picked.id)]];
        const rec = chooseOption(g, picked.id);
        assert.equal(rec.grade, expected, `${id} pos ${pick}`);
        assert.equal(rec.choice, picked.text, 'the text the player saw is the text that was graded');
        checked++;
      }
    }
  }
  assert.ok(checked > 1000);
  const total = counts.reduce((a, b) => a + b, 0);
  for (const c of counts) assert.ok(c >= total * 0.2 && c <= total * 0.3, `best-answer positions ${counts}`);
});
test('answer shuffle: the best answer is not always in the same place within one mission (bag of four)', () => {
  const g = mk(5); g.rng = seeded(3); const pos = [];
  for (let i = 0; i < 8; i++) {
    g.event = null; g.phase = 'playing'; startEvent(g, 'resource_discovery', 20);
    pos.push(g.bestPositions[g.bestPositions.length - 1]);
  }
  assert.deepEqual([...pos.slice(0, 4)].sort(), [0, 1, 2, 3]); assert.deepEqual([...pos.slice(4)].sort(), [0, 1, 2, 3]);
});
test('timeout still applies the do-nothing default (original last choice) one grade worse', () => {
  const g = mk(3); g.res.materials = 5; g.rng = seeded(9);
  startEvent(g, 'water_leak', 5);
  const base = GRADE_ORDER.indexOf(EVENTS.water_leak.choices[3].run(JSON.parse(JSON.stringify(g)) && Object.assign(JSON.parse(JSON.stringify(g)), { level: g.level })).grade);
  const rec = chooseOption(g, null);
  assert.equal(rec.timedOut, true); assert.equal(rec.grade, GRADE_ORDER[Math.min(3, base + 1)]);
});

// ------------------------------------------------------------------ crises
const wrongId = (g, ev) => { const gr = gradeChoices(g, ev); return ev.choices[gr.indexOf(Math.max(...gr))].id; };
test('a wrong decision starts an emergency that names its consequence', () => {
  const g = mk(3); g.res.materials = 0; startEvent(g, 'o2_leak', 20);
  const rec = chooseOption(g, wrongId(g, EVENTS.o2_leak));
  assert.equal(rec.grade, 'wrong'); assert.equal(rec.crisis, 'o2_runaway'); assert.ok(rec.crisisName);
  assert.ok(g.crisis && g.status.o2_leak && g.res.materials >= 2, 'emergency spares are issued so recovery is possible');
  continueAfterDecision(g);
  assert.ok(crisisView(g).task.length > 10 && crisisView(g).left > 30);
});
test('a good decision starts no emergency', () => {
  const g = mk(3); g.res.materials = 5; startEvent(g, 'o2_leak', 20);
  const gr = gradeChoices(g, EVENTS.o2_leak);
  const rec = chooseOption(g, EVENTS.o2_leak.choices[gr.indexOf(Math.min(...gr))].id);
  assert.notEqual(rec.grade, 'wrong'); assert.equal(g.crisis, null);
});
test('crisis escalates in three stages and gets worse each stage', () => {
  const g = mk(3); inHab(g); g.o2res = 90; g.status.o2_leak = false;
  for (const t of g.level.timeline) g.timelineDone[t.id] = true;     // no scripted events interrupting this test
  triggerCrisis(g, 'o2_runaway', 'test');
  const seg = stageSeconds(g); const drops = [];
  for (let s = 0; s < 3; s++) {
    assert.equal(g.crisis.stage, s);
    const a = g.o2res; run(g, 5); drops.push(a - g.o2res);
    while (g.crisis && g.crisis.stage === s && g.phase === 'playing') step(g, 0.1);
  }
  assert.ok(drops[1] > drops[0] * 1.2 && drops[2] > drops[1] * 1.2, `loss per 5 s by stage ${drops.map((d) => d.toFixed(2))}`);
});
test('each of the six emergencies ends the mission if ignored, with its own failure text', () => {
  const expect = { suit_breach: 'suit_breach', o2_runaway: 'decompression', water_burst: 'dehydration', heat_loss: 'freeze', radiation_spike: 'radiation', power_collapse: 'power_loss' };
  for (const [id, reason] of Object.entries(expect)) {
    const g = mk(5); g.res.battery = 100; g.res.water = 100; g.o2res = 100; g.oxygen = 100; g.health = 100;
    g.player.x = 0; g.player.z = 26;                       // outside, far from every fix
    triggerCrisis(g, id, 'test');
    for (let t = 0; t < 400 && g.phase === 'playing'; t += 0.1) { step(g, 0.1); g.health = Math.max(g.health, 50); if (g.phase === 'decision') { g.phase = 'playing'; g.event = null; } }
    assert.equal(g.phase, 'failure', id); assert.equal(g.failReason, reason, id);
    assert.ok(g.end.reasonText.length > 20); assert.equal(g.end.crises[0].outcome, 'failed');
  }
});
test('each emergency can be solved in time with its emergency task, and the mission continues', () => {
  const solve = {
    suit_breach: (g) => { inHab(g); g.player.x = 2.7; g.player.z = -4; for (let i = 0; i < 400 && g.crisis; i++) { refillStep(g, 0.05); step(g, 0.05); } refillEnd(g); },
    o2_runaway: (g) => { interact(g, it('o2leak')); },
    water_burst: (g) => { interact(g, it('waterleak')); },
    heat_loss: (g) => { interact(g, it('thermal')); },
    radiation_spike: (g) => { inHab(g); run(g, 7); },
    power_collapse: (g) => { interact(g, it('batterybank')); step(g, 0.1); },
  };
  for (const [id, fn] of Object.entries(solve)) {
    const g = mk(3); g.player.x = 0; g.player.z = 26; g.oxygen = 60; g.stats.minOxygen = 60;
    triggerCrisis(g, id, 'test'); run(g, 10);
    assert.ok(g.crisis, `${id} still running`);
    fn(g); run(g, 0.3);
    assert.equal(g.crisis, null, `${id} resolved`);
    assert.equal(g.phase, 'playing', id); assert.equal(g.crisisLog[0].outcome, 'resolved');
    run(g, 5); assert.equal(g.phase, 'playing');
  }
});
test('a second failure while an emergency is running escalates it instead of stacking', () => {
  const g = mk(5); triggerCrisis(g, 'o2_runaway', 'a'); assert.equal(g.crisis.stage, 0);
  triggerCrisis(g, 'heat_loss', 'b'); assert.equal(g.crisis.id, 'o2_runaway'); assert.equal(g.crisis.stage, 1);
});
test('the compass points at the emergency task, and the failure deadline is shown', () => {
  const g = mk(3); triggerCrisis(g, 'water_burst', 't');
  const t = nextTarget(g); assert.match(t.label, /emergency/i);
  const v = crisisView(g); assert.equal(v.stages, 3); assert.ok(v.total > 60 && v.total < 160, `total ${v.total}`);
});
test('emergencies exist for the decision events they belong to (consequence is relevant to the decision)', () => {
  const map = { o2_leak: 'o2_runaway', water_leak: 'water_burst', temp_failure: 'heat_loss', solar_storm: 'radiation_spike', battery_failure: 'power_collapse', resource_discovery: 'suit_breach' };
  for (const [ev, c] of Object.entries(map)) assert.ok(EVENTS[ev] && CRISES[c], ev);
});
test('scripted emergencies appear on the late levels and wrong choices on early ones can already hurt', () => {
  const scripted = LEVEL_LIST.map((l) => l.timeline.filter((t) => t.crisis).length);
  assert.deepEqual(scripted.slice(0, 5), [0, 0, 0, 0, 0]); assert.ok(scripted[5] >= 1 && scripted[6] >= 1);
});

// ------------------------------------------------------------------ level length
test('missions are sized for roughly 5-7 minutes', () => {
  for (const l of LEVEL_LIST) {
    assert.ok(l.par >= 300 && l.par <= 420, `L${l.id} par ${l.par}`);
    assert.ok(l.limit >= l.par + 150 && l.limit <= 760, `L${l.id} limit ${l.limit}`);
    if (l.surviveAt) assert.ok(l.surviveAt >= 300 && l.surviveAt <= 420, `L${l.id} surviveAt ${l.surviveAt}`);
  }
});

// ------------------------------------------------------------------ countdown tick sound
test('countdown tick: one tick per second (faster in the last 5 s), stops on answer, silent when muted, separate from music', () => {
  const s = new Sfx(); let tones = 0; s.ctx = {}; s._tone = () => { tones++; };
  let due = 0; for (let left = 14; left > 0; left -= 0.05) if (s.countdown(left, true)) due++;
  assert.ok(due >= 18 && due <= 21, `ticks ${due}`); assert.equal(tones, due);
  const before = tones; assert.equal(s.countdown(10, false), false); s.countdown(0, false); assert.equal(tones, before, 'no tick once answered or timed out');
  s.setMuted(true); let n0 = tones; for (let left = 6; left > 0; left -= 0.05) s.countdown(left, true); assert.equal(tones, n0, 'muted: no sound');
  s.setMuted(false); s.countdown(0, false); s.countdown(3, true); assert.equal(tones, n0 + 1);
  assert.ok(!fs.readFileSync('./audio.js', 'utf8').includes('musicBus, this.countdown'), 'tick does not use the music bus');
});
test('engine wires the tick to timed questions only', () => {
  const e = fs.readFileSync('./Engine.js', 'utf8');
  assert.match(e, /countdown\(g\.event\?\.left \?\? 0, g\.event\?\.state === 'decision'\)/);
  assert.match(e, /if \(g\.phase !== 'decision'\) this\.sfx\.countdown\(0, false\)/);
});

// ------------------------------------------------------------------ contacts
test('three distinct fictional contacts, four predefined questions per level, 84 distinct authored answers', () => {
  assert.equal(CONTACTS.length, 3);
  assert.deepEqual(CONTACTS.map((c) => c.role), ['Mission Commander', 'Life-Support Engineer', 'Science Officer']);
  assert.equal(new Set(CONTACTS.map((c) => c.name)).size, 3);
  for (const c of CONTACTS) assert.ok(c.bio.length > 30 && c.style.length > 20 && /fictional/i.test(c.bio));
  assert.match(DISCLAIMER, /Fictional/); assert.match(DISCLAIMER, /not real NASA/i); assert.match(DISCLAIMER, /not live/i);
  const texts = new Set(); const qs = new Set();
  for (let lv = 1; lv <= 7; lv++) {
    const q = levelQuestions(lv); assert.equal(q.length, 4, `level ${lv}`);
    for (const x of q) { assert.ok(x.text.endsWith('?')); qs.add(x.text); }
    for (let i = 0; i < 4; i++) {
      const per = CONTACTS.map((c) => answerFor(lv, c.id, i).text);
      assert.equal(new Set(per).size, 3, `L${lv} Q${i}: contacts answer differently`);
      for (const t of per) { assert.ok(t.length > 60, t); texts.add(t); }
    }
  }
  assert.equal(texts.size, 84, 'no answer is reused'); assert.equal(qs.size, 28, 'no question is reused between levels');
  assert.equal(answerFor(1, 'nobody', 0), null); assert.equal(answerFor(1, 'cmdr', 4), null); assert.equal(answerFor(8, 'cmdr', 0), null);
});
test('answers are mission-specific', () => {
  const all = (lv) => CONTACTS.flatMap((c) => [0, 1, 2, 3].map((i) => answerFor(lv, c.id, i).text)).join(' ');
  assert.match(all(1), /refill station/i); assert.match(all(2), /breaker/i); assert.match(all(3), /ration/i); assert.match(all(4), /shelter/i);
  assert.match(all(5), /night|battery/i); assert.match(all(6), /Mars/); assert.match(all(7), /dust storm/i);
});
test('comms panel has no free-text input and no in-world helper exists', () => {
  const ui = fs.readFileSync('./Comms.jsx', 'utf8');
  assert.ok(!/<input|<textarea|contentEditable/i.test(ui));
  assert.ok(!fs.existsSync('./robot.js') && !fs.existsSync('./Robot.jsx') && !fs.existsSync('./aria-server.mjs'));
  const w = fs.readFileSync('./world3d.js', 'utf8'); assert.ok(!/buildMate|buildRobot/.test(w));
  const g = mk(1); assert.equal(g.mate, undefined);
  for (const f of ['Hud.jsx', 'Engine.js', 'Screens.jsx']) assert.ok(!/snap\.mate|g\.mate|askRobot|openChat/.test(fs.readFileSync(`./${f}`, 'utf8')), f);
});
test('rocket intro has no LIFTOFF text', () => {
  const s = fs.readFileSync('./Intro.jsx', 'utf8'); assert.ok(!/lift\s*off/i.test(s.replace(/lifted|\.lift/g, '')) );
  assert.ok(!/NASA SPACE APPS/.test(s)); assert.match(s, /rocket/);
});
