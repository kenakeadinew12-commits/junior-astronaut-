// Radio reactions and threshold warnings from (fictional, simulated) mission control. There is no astronaut teammate any more:
// createMate only keeps a small hidden data record so older code paths keep working; nothing is simulated or drawn for it.
import { clamp } from './math.js';
import { rooms, roomAt, resolveCollisions } from './world.js';
import { heightAt } from './terrain.js';
import { SHIELD, CFG, radio, say, hurt, TEAMMATES, ROLES } from './core.js';

const HAB = rooms[0], SHEL = rooms[1];
const doorOut = (r) => ({ x: r.cx, z: r.cz + r.d / 2 + 1.7 });
const doorIn = (r) => ({ x: r.cx, z: r.cz + r.d / 2 - 1.0 });
const REST = { habitat: { x: -1.6, z: -3.7 }, shelter: { x: 15.6, z: -23.2 } };

export function createMate(id, start) {
  const t = TEAMMATES.find((x) => x.id === id) || TEAMMATES[0];
  return { id: t.id, name: t.name, role: t.role, weight: t.weight, height: t.height, bio: t.bio, health: 100, x: start.x + 2.5, z: start.z + 2, y: 0, yaw: 0, moving: false, speed: 0, task: 'Following you', zone: 'outside', injured: false, path: [], stuck: 0, lastX: 0, lastZ: 0 };
}

function route(from, to) {
  const a = roomAt(from.x, from.z), b = roomAt(to.x, to.z);
  const pts = [];
  if (a && a !== b) pts.push(doorIn(a), doorOut(a));
  if (b && a !== b) pts.push(doorOut(b), doorIn(b));
  pts.push(to);
  return pts;
}

export function hazardActive(g) { return !!(g.hazard && g.hazard.state === 'active') || (g.event && g.event.id === 'solar_storm' && g.event.state === 'decision'); }

/** The astronaut teammate was removed from the game; mission control (fictional, radio only) talks instead. Kept as a no-op so callers stay simple. */
export function mateStep() {}

// ---- radio -----------------------------------------------------------------------------------
const roleLine = {
  engineer: { repair: 'Nice work. A tidy repair like that restores the circuit - electricity needs a complete loop to flow.', },
  medic: { warn: 'Keep an eye on your own health bar - dehydration and cold slow your thinking long before they hurt.' },
  botanist: { deploy: 'Plants turn CO₂ and light into food and oxygen. They are a living part of the life-support loop.' },
  geologist: { collect: 'Good find. Regolith holds metals and oxides we can use as building and repair material.' },
  commander: { alarm: 'Stay calm. Use your checklist: protect people first, then equipment.' },
};

export function mateReact(g) {
  for (const ev of g.events) {
    const role = g.profile.role;
    switch (ev.type) {
      case 'collect': say(g, 'collect', 'ctrl', roleLine[role]?.collect || (g.planet === 'mars' ? 'Good sample. Ice and soil on Mars can be turned into water and oxygen on site (ISRU).' : 'Sample secured. Materials are precious - each one has to be launched from Earth or found here.'), 60); break;
      case 'repair': say(g, 'repair', 'ctrl', roleLine[role]?.repair || 'Repair complete. Always repair what keeps people alive first.', 45); break;
      case 'power': say(g, 'power', 'ctrl', 'Power is back. Watch the console: generation has to cover consumption, otherwise the battery drains.', 40); break;
      case 'inspect': say(g, 'inspect', 'ctrl', 'Good. Inspecting equipment before it fails is how real crews avoid emergencies.', 50); break;
      case 'deploy': say(g, 'deploy', 'ctrl', roleLine[role]?.deploy || 'Greenhouse deployed. Remember it needs power, and on Mars the sunlight is weak.', 40); break;
      case 'stow': say(g, 'stow', 'ctrl', 'Stowing panels folds them flat so storm particles and wind cannot damage the cells.', 50); break;
      case 'clean': say(g, 'clean', 'ctrl', g.planet === 'mars' ? 'Cleaner panels, more power. Dust blocks sunlight - on Mars that is a big deal.' : 'Lunar dust is sharp and sticky, so cleaning matters even without wind.', 50); break;
      case 'leakfix': say(g, 'leakfix', 'ctrl', 'Leak sealed. In space every drop of water and every breath of air is imported or made.', 40); break;
      case 'refill': say(g, 'refill', 'ctrl', 'Suit topped up. Never go out with less than half a tank.', 60); break;
      case 'alarm': say(g, 'alarm', 'ctrl', roleLine[g.profile.role]?.alarm || 'Alert! Read the options carefully - there is a timer.', 30); break;
      default: break;
    }
  }
}

/** Threshold warnings + advice (called every step; each line has a cooldown). */
export function mateWatch(g) {
  const warn = (k, t, c = 45) => say(g, k, 'ctrl', t, c);
  if (g.oxygen < 30 && g.zone === 'outside') warn('lowO2', `Your suit oxygen is at ${Math.round(g.oxygen)}%. Head back to the habitat and use the Oxygen Refill Station by the door (hold E).`, 25);
  if (g.o2res < 22) warn('lowRes', `Habitat oxygen is at ${Math.round(g.o2res)}%. The oxygen generator needs power and water to make more.`, 50);
  if (g.res.water < 22) warn('lowWater', `Water is at ${Math.round(g.res.water)}%. Check for leaks, run the recycler, and consider rationing at the console.`, 60);
  if (g.res.food < 20) warn('lowFood', `Food is at ${Math.round(g.res.food)}%. The greenhouse makes food - but it needs power.`, 70);
  if (g.res.battery < 18 && g.breaker) warn('lowBat', `The battery is at ${Math.round(g.res.battery)}%. Turn off loads you do not need at the console.`, 45);
  if (g.temp < 6 && g.breaker !== undefined) warn('cold', `It is ${Math.round(g.temp)} °C in the habitat. With no heating it drifts toward the cold outside.`, 50);
  if (g.temp > 36) warn('hot', 'The habitat is overheating. Check thermal control.', 50);
  if (g.co2 > 55) warn('co2', 'CO₂ is building up. Run the scrubber - oxygen alone does not keep you safe.', 50);
  if (g.health < 40) warn('lowHealth', 'Your health is low. Get inside and rest, and check oxygen, water, heat and radiation.', 40);
  if (g.status.comm_down) warn('comm', 'We have lost the link to mission control. The comm mast needs a dish repair.', 90);
  if (g.hazard && g.hazard.state === 'active' && g.hazard.type === 'storm' && g.zone === 'outside') warn('stormOut', 'Radiation is spiking! Get inside - the shelter blocks about 90%.', 12);
  if (g.hazard && g.hazard.state === 'active' && g.hazard.type === 'dust' && g.time - (g.hazard.startedAt || 0) < 8) warn('dust', 'The dust storm is cutting our sunlight to a few percent. Conserve the battery.', 120);
  if (g.level.id === 7 && g.time > 100) warn('recall', 'Remember the lessons: shed loads like the night mission, seal leaks like the life-support mission.', 150);
}

export const roleInfo = (id) => ROLES[id];
void hurt; void HAB; void SHEL;
