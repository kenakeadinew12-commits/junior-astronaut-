// The seven missions: 5 on the Moon, 2 on Mars. Each one has its own briefing, objectives, starting
// resources, environment, scripted faults/events, win and fail rules. Later levels are harder: less
// slack in resources, shorter decision timers and more simultaneous problems.
import { arrays, equipment, greenhouse, battery, mast, rover, rooms, shelterBox, sampleSpots, leaks, refillStation } from './world.js';

export const MOON = { name: 'Moon', gravity: 1.62, baseRad: 57, ambient: -20, sun: 1.0, dayText: '≈ 29.5 Earth days (about 14 days of sunlight, then 14 of night)', pressure: 'vacuum', sampleName: 'regolith sample', facts: ["Gravity is about 1/6 of Earth's (1.62 m/s²).", 'There is no atmosphere: no air, no wind, no weather, and no shield against radiation.', 'Surface temperature swings from about +117 °C by day to -178 °C by night at the equator.'] };
export const MARS = { name: 'Mars', gravity: 3.71, baseRad: 28, ambient: -63, sun: 0.43, dayText: '24 h 39 min (a "sol")', pressure: 'about 0.6% of Earth (mostly CO₂)', sampleName: 'ice / regolith sample', facts: ["Gravity is about 38% of Earth's (3.71 m/s²).", 'The thin CO₂ atmosphere is under 1% of Earth\'s pressure, so you still need a pressure suit, but wind can carry fine dust.', 'Sunlight is only about 43% as strong as at Earth, and global dust storms can block most of it.', 'Average surface temperature is around -60 °C.'] };

// ---- tiny helpers for objectives ---------------------------------------------------------------
const cnt = (o, v) => Object.values(o).filter((x) => x === v).length;
const arrOk = (g) => Object.values(g.arrays).filter((s) => s !== 'broken').length;
const sysOk = (g, k) => g.sys[k].st === 'ok';
const nearest = (list, g) => list.reduce((b, c) => (!b || Math.hypot(c.x - g.player.x, c.z - g.player.z) < Math.hypot(b.x - g.player.x, b.z - g.player.z) ? c : b), null);
const sampleTarget = (g) => { const l = sampleSpots.filter((s) => g.activeSamples.includes(s.id) && !g.samples[s.id]); const n = nearest(l, g); return n && { x: n.x, z: n.z, label: g.planet === 'mars' ? 'Ice / regolith sample' : 'Regolith sample' }; };
const pt = (x, z, label) => ({ x, z, label });
const desk = pt(0, -8, 'Systems console');
const breaker = pt(-4.6, -6, 'Main breaker');
const brokenArray = (g) => { const l = arrays.filter((a) => g.arrays[a.id] === 'broken').map((a) => ({ x: a.x - 2, z: a.z })); const n = nearest(l, g); return n && { ...n, label: 'Damaged solar array' }; };
const unitTarget = (k, label) => () => pt(equipment[k].x, equipment[k].z, label);
const ob = (id, text, progress, done, extra = {}) => ({ id, text, progress, done, ...extra });
const S = (n) => sampleSpots.slice(0, 8).map((s) => s.id).slice(0, n);
const ids = (...n) => n.map((i) => `sample${i}`);

const defaultSys = { o2gen: 'ok', recycler: 'ok', scrubber: 'ok', thermal: 'ok', greenhouse: 'absent' };

export const LEVELS = [
  // =========================================================================================== 1
  {
    id: 1, planet: 'moon', name: 'First Steps on the Moon', tagline: 'Learn to move, explore and monitor your supplies.', rank: 1, sev: 0.6, timerMul: 1.5, par: 300, limit: 600,
    story: [
      'Welcome to the Lunar Outpost, Cadet. Your lander has just touched down and the habitat is intact. Your job today is to learn the ropes: walk the site, inspect the life-support equipment and read your resource levels.',
      'Mission control (fictional, simulated) will talk to you over the radio. Watch the bars in the corner of the screen - oxygen, water, food, energy, materials and your health - because every one of them can run out.',
    ],
    teaches: ['Moving and interacting (WASD, mouse, hold E)', 'Reading oxygen, water, food, energy and materials', 'How the habitat life-support systems work'],
    tips: ['Your suit oxygen drains outside. Inside the habitat, hold E at the glowing cyan Oxygen Refill Station (just right of the door) for about 12 seconds to refill it; the bar shows your progress.', 'Hold E on blue-glowing rocks to collect samples: they become repair materials.', 'Open the console at the desk (E) to see every resource and system.'],
    env: { ...MOON, ambient: -5 },
    start: { oxygen: 92, o2res: 85, water: 85, food: 80, battery: 78, materials: 0, health: 100, temp: 21, sys: { ...defaultSys }, arrays: 'ok', breaker: true, samples: ids(1, 7, 8, 2, 6, 3), dust: 0 },
    timeline: [{ id: 'discovery', when: (g) => g.collectedTotal >= 2 || g.time > 100, event: 'resource_discovery', timer: 25 }],
    objectives: [
      ob('console', 'Open the systems console (E at the desk) and read your resources', (g) => (g.consoleOpens > 0 ? 'done' : 'open'), (g) => g.consoleOpens > 0, { target: () => desk }),
      ob('inspect', 'Inspect the O₂ generator, water recycler and CO₂ scrubber', (g) => `${['o2gen', 'recycler', 'scrubber'].filter((k) => g.sys[k].inspected).length}/3`, (g) => ['o2gen', 'recycler', 'scrubber'].every((k) => g.sys[k].inspected), { target: (g) => nearest(['o2gen', 'recycler', 'scrubber'].filter((k) => !g.sys[k].inspected).map((k) => equipment[k]), g) && { ...nearest(['o2gen', 'recycler', 'scrubber'].filter((k) => !g.sys[k].inspected).map((k) => equipment[k]), g), label: 'Life-support unit' } }),
      ob('samples', 'Collect 3 regolith samples (blue glow) for materials', (g) => `${Math.min(3, g.collectedTotal)}/3`, (g) => g.collectedTotal >= 3, { target: sampleTarget }),
      ob('refill', 'Refill your suit oxygen at the Oxygen Refill Station (just inside the habitat door)', (g) => (g.flags.refilled ? 'done' : `O\u2082 ${Math.round(g.oxygen)}%`), (g) => !!g.flags.refilled, { target: () => pt(refillStation.x, refillStation.z, 'Oxygen Refill Station') }),
      ob('discovery', 'Answer the resource-discovery report', (g) => (g.stats.eventsResolved.resource_discovery ? 'done' : 'soon'), (g) => !!g.stats.eventsResolved.resource_discovery),
    ],
    lessons: ['connected', 'water_recycling', 'oxygen_low', 'low_gravity'],
    mateTasks: [], hintFn: (g) => (g.consoleOpens === 0 ? 'Open the systems console at the desk inside the habitat to see all your resources.' : g.collectedTotal < 3 ? 'Collect the glowing samples - watch your suit oxygen.' : 'Finish inspecting the life-support units and answer the discovery report.'),
  },
  // =========================================================================================== 2
  {
    id: 2, planet: 'moon', name: 'Power Restoration', tagline: 'The solar arrays are down. Restore electrical power before the habitat shuts down.', rank: 2, sev: 0.8, timerMul: 1.3, par: 340, limit: 640,
    story: [
      'A micrometeorite shower has damaged the solar array field and tripped the main breaker. The habitat is on emergency reserve: the battery is almost empty, the oxygen generator and heater are dead, and the habitat is slowly getting cold.',
      'Find materials, repair the arrays, flip the breaker and then manage the energy budget so you do not overload the grid.',
    ],
    teaches: ['Power = generation - consumption', 'Battery reserves and priorities', 'What happens when power stays off'],
    tips: ['Each array is worth about 3.2 kW at full sun; each system uses power. The console shows the balance.', 'Repairs cost materials (2 per array).', 'Without power the habitat oxygen falls and the temperature drops.'],
    env: { ...MOON, ambient: -25 },
    start: { oxygen: 85, o2res: 52, water: 70, food: 70, battery: 25, materials: 0, health: 100, temp: 12, sys: { ...defaultSys }, arrays: 'broken', breaker: false, samples: ids(1, 2, 3, 6, 7, 8), dust: 0.25 },
    timeline: [
      { id: 'dust', when: (g) => cnt(g.arrays, 'ok') >= 1, event: 'panel_dust', timer: 20 },
      { id: 'overload', when: (g) => g.breaker && g.powerOnFor > 12 && g.flows.net < -0.4, event: 'equipment_overload', timer: 20 },
    ],
    objectives: [
      ob('samples', 'Collect 4 regolith samples (repair materials)', (g) => `${Math.min(4, g.collectedTotal)}/4`, (g) => g.collectedTotal >= 4, { target: sampleTarget }),
      ob('arrays', 'Repair at least 2 solar arrays (2 materials each)', (g) => `${arrOk(g)}/3`, (g) => arrOk(g) >= 2, { target: (g) => (g.res.materials < 2 * g.bon.repair && g.collectedTotal < 6 ? sampleTarget(g) : brokenArray(g)) }),
      ob('power', 'Flip the main breaker to restore power', (g) => (g.breaker ? 'ON' : 'OFF'), (g) => g.breaker, { target: () => breaker }),
      ob('battery', 'Charge the battery to 40% (watch your energy balance)', (g) => `${Math.round(g.res.battery)}%`, (g) => g.res.battery >= 40, { target: () => desk }),
      ob('warm', 'Warm the habitat above 15 °C', (g) => `${Math.round(g.temp)}°C`, (g) => g.temp >= 15),
    ],
    lessons: ['blackout', 'battery_night', 'temperature', 'maintenance'],
    mateTasks: [], hintFn: (g) => (arrOk(g) < 2 ? 'No power means no heat and no oxygen generation. Get materials and fix the arrays first.' : !g.breaker ? 'Flip the main breaker inside the habitat.' : 'Open the console: turn off loads you do not need until the battery climbs.'),
  },
  // =========================================================================================== 3
  {
    id: 3, planet: 'moon', name: 'Life-Support Emergency', tagline: 'Oxygen, water and food are all in trouble. You cannot fix everything - choose.', rank: 3, sev: 1.0, timerMul: 1.1, par: 330, limit: 620, surviveAt: 330,
    story: [
      'The oxygen generator has failed, the water recycler is stuck and supplies are lower than planned. A supply drone will arrive in a few minutes, but until then you have to keep the crew alive on what you have.',
      'Materials are limited. Repairs, rationing and conserving all cost something. Decide what matters most.',
    ],
    teaches: ['Prioritising life-support needs', 'Trade-offs between repair, rationing and conserving', 'How resources depend on each other (water → oxygen)'],
    tips: ['The oxygen generator uses water and power; the recycler gives water back.', 'The console has a rationing switch: it cuts water and food use but slows recovery.', 'A repair costs materials; samples are the only source.'],
    env: { ...MOON, ambient: -15 },
    start: { oxygen: 80, o2res: 38, water: 40, food: 30, battery: 70, materials: 3, health: 100, temp: 20, sys: { ...defaultSys, o2gen: 'broken', recycler: 'fault' }, arrays: 'ok', breaker: true, samples: ids(1, 2, 3, 4, 7, 8), dust: 0 },
    timeline: [
      { id: 'leak', at: 40, event: 'water_leak', timer: 20 },
      { id: 'o2', at: 120, event: 'o2_leak', timer: 18 },
      { id: 'injury', at: 220, event: 'astronaut_injury', timer: 18 },
    ],
    objectives: [
      ob('o2gen', 'Repair the oxygen generator (3 materials)', (g) => (sysOk(g, 'o2gen') ? 'online' : 'broken'), (g) => sysOk(g, 'o2gen'), { target: unitTarget('o2gen', 'Oxygen generator') }),
      ob('recycler', 'Restart the water recycler (scanner)', (g) => (sysOk(g, 'recycler') ? 'online' : 'stuck'), (g) => sysOk(g, 'recycler'), { target: unitTarget('recycler', 'Water recycler') }),
      ob('leak', 'Seal the water leak', (g) => (!g.flags.seen_water_leak ? 'soon' : g.status.water_leak ? 'leaking' : 'sealed'), (g) => !!g.flags.seen_water_leak && !g.status.water_leak, { target: (g) => (g.status.water_leak ? pt(leaks.water.x - 1.5, leaks.water.z, 'Burst pipe') : null) }),
      ob('stock', 'Keep water and food above 10% until the drone arrives', (g) => `${Math.round(Math.min(g.res.water, g.res.food))}% min`, (g) => g.time >= g.level.surviveAt && g.res.water >= 10 && g.res.food >= 10),
      ob('survive', 'Survive until the supply drone arrives', (g) => `${Math.max(0, Math.ceil((g.level.surviveAt - g.time)))}s`, (g) => g.time >= g.level.surviveAt && g.health > 0),
    ],
    lessons: ['water_recycling', 'oxygen_low', 'redundancy', 'connected'],
    mateTasks: [], hintFn: (g) => (!sysOk(g, 'o2gen') ? 'Habitat oxygen is falling. The generator needs 3 materials - collect samples.' : !sysOk(g, 'recycler') ? 'Use the scanner on the water recycler to restart it.' : 'Watch water and food; ration if the stores are low.'),
  },
  // =========================================================================================== 4
  {
    id: 4, canStow: true, planet: 'moon', name: 'Solar Storm', tagline: 'A dangerous particle storm is coming. Prepare, decide, protect the crew and equipment.', rank: 3, sev: 1.05, timerMul: 1.0, par: 380, limit: 650, stormSeconds: 45,
    story: [
      'Space-weather forecasters have spotted a coronal mass ejection heading your way. The storm will arrive in minutes. Radiation outside the habitat will become deadly.',
      'You have a short window to protect equipment (stow the solar arrays) and inspect the shelter. When the storm hits you must choose a response fast.',
    ],
    teaches: ['Radiation, shielding and dose', 'Why solar arrays are stowed in a storm', 'Shelter versus habitat (90% vs 55% shielding)'],
    tips: ['The habitat blocks about 55% of storm radiation; the shelter about 90%.', 'Stowed arrays survive a storm but make no power during it.', 'In the shelter your suit oxygen is not refilled - keep it topped up before the storm.'],
    env: { ...MOON, ambient: -10 },
    start: { oxygen: 85, o2res: 80, water: 75, food: 72, battery: 75, materials: 4, health: 100, temp: 21, sys: { ...defaultSys }, arrays: 'ok', breaker: true, samples: ids(1, 7, 8, 2), dust: 0 },
    timeline: [
      { id: 'watch', at: 20, say: 'Space-weather desk: a radiation storm is forecast. Stow the arrays and check the shelter before it arrives.' },
      { id: 'storm', when: (g) => g.time >= 150 || (g.time >= 90 && (g.flags.stowedBest || 0) >= 3 && g.flags.shelterChecked), event: 'solar_storm', timer: 14, delay: 8 },
    ],
    onHazardEnd(g) {
      // Equipment left deployed is damaged: the worse your decision, the more arrays fail.
      const n = { perfect: 0, good: 1, acceptable: 2, wrong: 3 }[g.hazard.grade] ?? 1;
      let broke = 0;
      for (const a of arrays) if (broke < n && g.arrays[a.id] === 'ok') { g.arrays[a.id] = 'broken'; broke++; }
      return broke ? `${broke} deployed solar array${broke > 1 ? 's were' : ' was'} damaged by the storm.` : 'Your equipment came through undamaged.';
    },
    objectives: [
      ob('stow', 'Stow all 3 solar arrays before the storm', (g) => (g.flags.stowedBest >= 3 ? 'done' : `${cnt(g.arrays, 'stowed')}/3`), (g) => (g.flags.stowedBest || 0) >= 3, { target: (g) => { const l = arrays.filter((a) => g.arrays[a.id] === 'ok').map((a) => ({ x: a.x - 2, z: a.z })); const n = nearest(l, g); return n && { ...n, label: 'Stow this array' }; } }),
      ob('shelterbox', 'Inspect the radiation shelter supplies', (g) => (g.flags.shelterChecked ? 'done' : 'todo'), (g) => !!g.flags.shelterChecked, { target: () => pt(shelterBox.x, shelterBox.z + 1.5, 'Radiation shelter') }),
      ob('storm', 'Survive the solar storm (take cover!)', (g) => (g.hazard?.type === 'storm' && g.hazard.state === 'active' ? `${Math.max(0, Math.ceil(g.hazard.dur - g.hazard.t))}s` : g.hazard?.state === 'over' ? 'cleared' : 'incoming'), (g) => g.hazard?.type === 'storm' && g.hazard.state === 'over'),
      ob('redeploy', 'Redeploy and repair all 3 solar arrays', (g) => `${cnt(g.arrays, 'ok')}/3`, (g) => g.hazard?.state === 'over' && cnt(g.arrays, 'ok') === 3, { target: (g) => (g.hazard?.state === 'over' ? (brokenArray(g) || (() => { const l = arrays.filter((a) => g.arrays[a.id] === 'stowed').map((a) => ({ x: a.x - 2, z: a.z })); const n = nearest(l, g); return n && { ...n, label: 'Redeploy array' }; })()) : null) }),
      ob('battery', 'Bring the battery back above 40%', (g) => `${Math.round(g.res.battery)}%`, (g) => g.hazard?.state === 'over' && g.res.battery >= 40),
    ],
    lessons: ['radiation_good', 'radiation_bad', 'dose_adds_up', 'battery_night'],
    mateTasks: [], hintFn: (g) => (g.hazard?.state === 'over' ? 'The storm has passed: redeploy and repair the arrays, then recharge.' : cnt(g.arrays, 'stowed') < 3 ? 'Stow all three solar arrays (hold E). Then check the shelter.' : 'Inspect the shelter supplies, top up your suit oxygen and wait for the storm.'),
  },
  // =========================================================================================== 5
  {
    id: 5, planet: 'moon', name: 'Lunar Outpost Emergency', tagline: 'Night is falling and everything goes wrong at once. Prioritise or lose the base.', rank: 4, sev: 1.2, timerMul: 0.95, par: 380, limit: 560, surviveAt: 380, sunset: [190, 250],
    story: [
      'Sunset is approaching and the relief ship cannot arrive for several more minutes. One solar array is already damaged. During the night the base runs only on its batteries.',
      'More problems are coming: a failing battery, a hull leak, a heater fault and a communications outage. You cannot fix everything at once - decide what to fix first and what to shut down to survive.',
    ],
    teaches: ['Load shedding and energy priorities', 'Interconnected failures: power → heat → water → air', 'Triage under pressure'],
    tips: ['At night there is no solar power at all - the battery is your only energy.', 'Switch off the greenhouse and other non-essential systems in the console before dark.', 'You only need to solve 3 of the 4 emergencies - and you must stay alive until the relief ship arrives.'],
    env: { ...MOON, ambient: -40 },
    start: { oxygen: 90, o2res: 70, water: 65, food: 60, battery: 85, materials: 6, health: 100, temp: 21, sys: { ...defaultSys, greenhouse: 'ok' }, arrays: { array3: 'broken' }, breaker: true, samples: ids(1, 2, 3, 6, 7, 8), dust: 0.1 },
    timeline: [
      { id: 'battery', at: 30, event: 'battery_failure', timer: 16 },
      { id: 'sunset', at: 85, event: 'low_sunlight', timer: 18 },
      { id: 'o2', at: 135, event: 'o2_leak', timer: 16 },
      { id: 'thermal', at: 205, event: 'temp_failure', timer: 16 },
      { id: 'comm', at: 265, event: 'comm_failure', timer: 18 },
      { id: 'injury', at: 310, event: 'astronaut_injury', timer: 16 },
    ],
    objectives: [
      ob('survive', 'Stay alive until the relief ship arrives', (g) => `${Math.max(0, Math.ceil(g.level.surviveAt - g.time))}s`, (g) => g.time >= g.level.surviveAt && g.health > 0),
      ob('gen', 'Repair solar array 3', (g) => (g.arrays.array3 !== 'broken' ? 'online' : 'broken'), (g) => g.arrays.array3 !== 'broken', { optional: true, target: brokenArray }),
      ob('leak', 'Seal the hull breach', (g) => (!g.flags.seen_o2_leak ? 'soon' : g.status.o2_leak ? 'leaking' : 'sealed'), (g) => !!g.flags.seen_o2_leak && !g.status.o2_leak, { optional: true, target: (g) => (g.status.o2_leak ? pt(leaks.o2.x, leaks.o2.z + 1.8, 'Hull breach') : null) }),
      ob('thermal', 'Repair the thermal control unit', (g) => (!g.flags.thermalFailed ? 'soon' : sysOk(g, 'thermal') ? 'online' : 'failed'), (g) => !!g.flags.thermalFailed && sysOk(g, 'thermal'), { optional: true, target: unitTarget('thermal', 'Thermal unit') }),
      ob('comm', 'Restore the communications dish', (g) => (!g.flags.commFailed ? 'soon' : g.status.comm_down ? 'down' : 'online'), (g) => !!g.flags.commFailed && !g.status.comm_down, { optional: true, target: (g) => (g.status.comm_down ? pt(mast.x, mast.z + 2, 'Comm mast') : null) }),
    ],
    win: (g) => g.objDone.survive && ['gen', 'leak', 'thermal', 'comm'].filter((k) => g.objDone[k]).length >= 3,
    lessons: ['battery_night', 'blackout', 'temperature', 'redundancy'],
    mateTasks: [], hintFn: (g) => (g.time < 300 ? 'Daylight is your last chance to recharge. Fix generation and shed loads before dark.' : 'Night: battery only. Shut down what you do not need and keep heat, air and the scrubber alive.'),
  },
  // =========================================================================================== 6
  {
    id: 6, planet: 'mars', name: 'First Mars Expedition', tagline: 'A different world: red dust, weak sunlight and a thin atmosphere. Establish the base.', rank: 4, sev: 1.25, timerMul: 0.92, par: 420, limit: 700,
    story: [
      'You have landed on Mars. Sunlight here is less than half as strong as at Earth, the air is a thin carbon-dioxide haze, and it is far colder than the Moon. Fine red dust covers everything.',
      'Your first job is to make the outpost work: clean the dust off the arrays, restart the water recycler, collect ice and rock and build the greenhouse - while keeping a power budget that Mars sunlight can actually support.',
    ],
    teaches: ['Gravity, sunlight and temperature on Mars', 'ISRU: oxygen from Martian CO₂ and water from ice', 'Why you cannot run every system at once on Mars'],
    tips: ['On Mars the oxygen unit splits CO₂ from the atmosphere, so it uses no water.', 'The greenhouse (deploy it at the console, 6 materials) makes food and oxygen but needs 3 kW.', 'Dust cuts solar power; clean the arrays (hold E).'],
    env: { ...MARS },
    start: { oxygen: 90, o2res: 70, water: 60, food: 70, battery: 55, materials: 3, health: 100, temp: 21, sys: { ...defaultSys, recycler: 'fault' }, arrays: 'ok', breaker: true, samples: ids(1, 2, 3, 7, 8, 6), dust: 0.4, deploy: ['greenhouse'] },
    timeline: [
      { id: 'dust', at: 60, event: 'panel_dust', timer: 20 },
      { id: 'ice', when: (g) => g.collectedTotal >= 2, event: 'resource_discovery', timer: 22 },
      { id: 'rover', at: 170, event: 'rover_problem', timer: 20 },
      { id: 'micro', at: 240, crisis: 'suit_breach' },
    ],
    objectives: [
      ob('brief', 'Open the console and read the Martian conditions', (g) => (g.consoleOpens > 0 ? 'done' : 'open'), (g) => g.consoleOpens > 0, { target: () => desk }),
      ob('clean', 'Clean the dust off all 3 solar arrays', (g) => `${Object.values(g.dust).filter((d) => d < 0.12).length}/3`, (g) => Object.values(g.dust).every((d) => d < 0.12), { target: (g) => { const l = arrays.filter((a) => g.dust[a.id] >= 0.12).map((a) => ({ x: a.x - 2, z: a.z })); const n = nearest(l, g); return n && { ...n, label: 'Dusty array' }; } }),
      ob('recycler', 'Restart the water recycler', (g) => (sysOk(g, 'recycler') ? 'online' : 'stuck'), (g) => sysOk(g, 'recycler'), { target: unitTarget('recycler', 'Water recycler') }),
      ob('ice', 'Collect 4 ice / regolith samples', (g) => `${Math.min(4, g.collectedTotal)}/4`, (g) => g.collectedTotal >= 4, { target: sampleTarget }),
      ob('deploy', 'Deploy the greenhouse (console, 6 materials)', (g) => (g.sys.greenhouse.st === 'absent' ? 'not built' : 'built'), (g) => g.sys.greenhouse.st !== 'absent', { target: () => desk }),
      ob('grow', 'Grow food: run the greenhouse for 60 s without a blackout', (g) => `${Math.min(60, Math.round(g.flags.ghSeconds || 0))}/60 s`, (g) => (g.flags.ghSeconds || 0) >= 60 && g.res.battery > 5),
    ],
    lessons: ['dust', 'water_recycling', 'connected', 'temperature'],
    mateTasks: [], hintFn: (g) => (g.sys.greenhouse.st === 'absent' ? 'Collect samples for materials, then deploy the greenhouse from the console (6 materials).' : 'Power is tight: run the greenhouse only when the battery can afford it, and clean the dust.'),
  },
  // =========================================================================================== 7
  {
    id: 7, arrayScale: 1.7, canStow: true, planet: 'mars', name: 'Mars Survival Emergency', tagline: 'A global dust storm blots out the Sun and the base starts to fail. Use everything you have learned.', rank: 5, sev: 1.35, timerMul: 0.85, par: 420, limit: 600, surviveAt: 420, stormSeconds: 130,
    story: [
      'A dust storm is sweeping across the region. Sunlight will fade to a few percent, the temperature will fall and one of the arrays is already broken. This is the hardest mission yet.',
      'Combine what you learned: shed loads like in the storm and night missions, protect your crew, fix the life-support leaks, and keep the battery alive until the storm passes and the relief crew can reach you.',
    ],
    teaches: ['Putting all six earlier lessons together', 'Dust storms, power starvation and heat', 'Time-critical decisions with little spare material'],
    tips: ['Stow or conserve power before the storm hits - there is almost no sunlight.', 'The greenhouse and recycler are luxuries in a storm.', 'You need to fix 3 of the 4 emergencies and stay alive.'],
    env: { ...MARS, ambient: -70 },
    start: { oxygen: 88, o2res: 60, water: 55, food: 55, battery: 70, materials: 5, health: 100, temp: 21, sys: { ...defaultSys, greenhouse: 'ok' }, arrays: { array2: 'broken' }, breaker: true, samples: ids(1, 2, 3, 6, 7, 8), dust: 0.2 },
    timeline: [
      { id: 'dust', at: 25, event: 'dust_storm', timer: 12 },
      { id: 'thermal', at: 90, event: 'temp_failure', timer: 14 },
      { id: 'o2', at: 150, event: 'o2_leak', timer: 14 },
      { id: 'injury', at: 210, event: 'astronaut_injury', timer: 14 },
      { id: 'leak', at: 270, event: 'water_leak', timer: 14 },
      { id: 'short', at: 340, crisis: 'power_collapse' },
    ],
    objectives: [
      ob('survive', 'Stay alive until the relief crew arrives', (g) => `${Math.max(0, Math.ceil(g.level.surviveAt - g.time))}s`, (g) => g.time >= g.level.surviveAt && g.health > 0),
      ob('storm', 'Get through the dust storm without a blackout', (g) => (g.hazard?.type === 'dust' && g.hazard.state === 'active' ? `${Math.max(0, Math.ceil(g.hazard.dur - g.hazard.t))}s` : g.hazard?.state === 'over' ? 'cleared' : 'incoming'), (g) => g.hazard?.type === 'dust' && g.hazard.state === 'over'),
      ob('arrays', 'Repair and redeploy all arrays, then clean the dust', (g) => `${cnt(g.arrays, 'ok')}/3`, (g) => g.hazard?.state === 'over' && cnt(g.arrays, 'ok') === 3 && Object.values(g.dust).every((d) => d < 0.3), { optional: true, target: brokenArray }),
      ob('leak', 'Seal the hull breach', (g) => (!g.flags.seen_o2_leak ? 'soon' : g.status.o2_leak ? 'leaking' : 'sealed'), (g) => !!g.flags.seen_o2_leak && !g.status.o2_leak, { optional: true, target: (g) => (g.status.o2_leak ? pt(leaks.o2.x, leaks.o2.z + 1.8, 'Hull breach') : null) }),
      ob('thermal', 'Repair the thermal control unit', (g) => (!g.flags.thermalFailed ? 'soon' : sysOk(g, 'thermal') ? 'online' : 'failed'), (g) => !!g.flags.thermalFailed && sysOk(g, 'thermal'), { optional: true, target: unitTarget('thermal', 'Thermal unit') }),
      ob('water', 'Seal the water leak', (g) => (!g.flags.seen_water_leak ? 'soon' : g.status.water_leak ? 'leaking' : 'sealed'), (g) => !!g.flags.seen_water_leak && !g.status.water_leak, { optional: true, target: (g) => (g.status.water_leak ? pt(leaks.water.x - 1.5, leaks.water.z, 'Burst pipe') : null) }),
    ],
    win: (g) => g.objDone.survive && g.objDone.storm && ['arrays', 'leak', 'thermal', 'water'].filter((k) => g.objDone[k]).length >= 3,
    failIf: (g) => (g.stats.blackoutSeconds > 45 ? 'blackout' : null),
    lessons: ['dust', 'blackout', 'temperature', 'redundancy'],
    mateTasks: [], hintFn: (g) => (g.hazard?.type === 'dust' && g.hazard.state === 'active' ? 'Storm: sunlight is almost zero. Keep only life support running and fix what you can inside.' : 'Check the console: loads, battery and temperature. Prioritise air, heat and the scrubber.'),
  },
];
export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[0];
export const MAX_LEVEL = LEVELS.length;
void S; void battery; void greenhouse; void rover; void rooms;
