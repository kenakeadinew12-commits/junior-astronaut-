// Mission Control contacts: three FICTIONAL, simulated Earth-based specialists, reachable only through the comms panel
// (there are no physical characters in the 3D world). Every level has exactly four predefined questions and every
// contact has a hand-written answer to each one, so there are 7 x 4 x 3 = 84 authored replies and no free-text input.
// These are not real NASA people and this is not live communication.

export const CONTACTS = [
  { id: 'cmdr', name: 'Cmdr. Elena Marsh', role: 'Mission Commander', icon: '🎖️', style: 'Short, calm orders. Gives you the decision, not the lecture.',
    bio: 'Fictional flight director for this simulation. Ran dozens of imagined lunar and Mars surface shifts. Believes in clear priorities and fast decisions.' },
  { id: 'life', name: 'Dr. Raj Okafor', role: 'Life-Support Engineer', icon: '🛠️', style: 'Numbers, steps and cause-and-effect. Tells you which system to touch and why.',
    bio: 'Fictional environmental-systems engineer. Thinks in flows: what goes in, what comes out, how long it lasts.' },
  { id: 'sci', name: 'Dr. Mei Tanaka', role: 'Science Officer', icon: '🔬', style: 'Explains the science behind the problem so you can reason it out yourself.',
    bio: 'Fictional planetary scientist. Likes to connect what you are seeing to the physics of the Moon and Mars.' },
];
export const DISCLAIMER = 'Fictional simulated contacts for this game. They are not real NASA personnel and this is not live communication.';

// order of the answers in each row: [Commander, Life-Support Engineer, Science Officer]
const LEVELS = {
  1: [
    { q: 'What should I do first?', a: [
      'Open the console at the desk and read every bar. Then inspect the three life-support units, collect your three samples, and top up your suit. One thing at a time, Cadet.',
      'Start at the desk console: it shows oxygen, water, food, energy and materials as percentages. Then walk to the O₂ generator, water recycler and CO₂ scrubber and hold E on each to inspect it.',
      'Begin by reading your instruments. Every number on that console is a store that something is slowly using up, so knowing the numbers tells you which job is most urgent.' ] },
    { q: 'How do I refill my suit oxygen?', a: [
      'Walk into the habitat and go to the cyan refill station just right of the door. Hold E and keep holding until the suit reads 100%. About twelve seconds from empty, then you are back on the job.',
      'The refill station draws air from the habitat oxygen reserve, about 0.12% of reserve for every 1% of suit. Hold E and watch the progress bar. If the reserve is empty, repair the O₂ generator first.',
      'Your suit tank is only a small bottle; the habitat tank is the big one. The station moves air from one to the other, which is why it only works inside and why the reserve falls as you fill.' ] },
    { q: 'What do the resource bars mean?', a: [
      'Oxygen, water, food, energy, materials, health. If any one hits zero you are in trouble. Watch the lowest bar and fix that one first.',
      'Each bar is a store with an input and an output. Oxygen comes from the generator, water is recycled, food is stored, energy comes from the arrays. The arrow next to a bar tells you if it is rising or falling.',
      'Think of them as a budget. On Earth, air, water and power arrive for free. Here every one is a finite supply that the habitat systems must keep topping up, and your body is the customer.' ] },
    { q: 'How do I get repair materials?', a: [
      'Hold E on the blue-glowing rocks outside. Three samples is the target. Do not wander: every minute outside costs suit oxygen.',
      'Regolith samples turn into repair materials, which pay for repairs: array, unit and leak fixes each cost materials. Collect a few before you need them, then return and refill.',
      'Lunar soil contains metals and oxides that can be used as building material. That idea, using local resources instead of launching everything from Earth, is called in-situ resource utilisation.' ] },
  ],
  2: [
    { q: 'Where do I start restoring power?', a: [
      'Solar arrays first. Find a broken one, repair it, then throw the main breaker. Power before anything else.',
      'Check the arrays outside; each repair costs materials. Once at least one array works, go to the main breaker inside the habitat and restore power. The life-support units come back online in priority order.',
      'Everything in the habitat is an electrical load. The arrays are the only source, so repair generation first and only then close the circuit to the loads.' ] },
    { q: 'Why must I repair an array before the breaker?', a: [
      'Because the breaker does nothing with no power behind it. Fix a generator, then flip the switch. Order matters.',
      'With every array dead there is zero generation, so closing the breaker would just connect the habitat to an empty battery. The breaker prompt stays locked until at least one array is working.',
      'Power is generation minus consumption. If generation is zero, any switch you close only drains the battery faster, so repair the source before you reconnect the load.' ] },
    { q: 'How long will the battery last?', a: [
      'Not long enough to waste time. Treat it as a countdown and get an array online.',
      'It depends on net power. The console shows production and load in kW. If load is higher than production the battery falls. At zero battery you get a brownout and only some systems stay powered.',
      'The battery is a buffer, not a source. It smooths the difference between sunlight and demand, but once it is empty the habitat can only use what the arrays make right now.' ] },
    { q: 'What if I run short of materials?', a: [
      'Go and get more. Samples are your supply line. Repair the cheapest critical item first, then collect more.',
      'Prioritise: one working array beats three half-repairs. Repairs cost materials, so repair generation first, then life-support units, and keep a small reserve for emergencies.',
      'That is a real constraint of surface missions. Spare parts are limited, so engineers make hard choices about which failure gives the biggest gain for the fewest parts.' ] },
  ],
  3: [
    { q: 'Which failing system is most urgent?', a: [
      'Air kills fastest, then water, then food. Fix the one that runs out first and do not touch anything else until it is safe.',
      'Compare time to empty: the console trend arrows give a rate. Oxygen runs out in minutes, water in more, food in far more. The shortest clock is the priority.',
      'A person survives about three minutes without air, three days without water and three weeks without food. That order is the whole triage rule.' ] },
    { q: 'How do I stretch my water and food?', a: [
      'Turn on rationing in the console. It cuts use by 40% but you recover slower. Use it when you cannot repair yet.',
      'Rationing lowers consumption to 60%. Keep the water recycler powered and repaired: it returns most of the crew water. A greenhouse produces food, but it is a big power load.',
      'Rationing trades comfort for time. It stretches stores, but a tired, under-fed crew works slower, so it buys time to fix the real problem, not a permanent solution.' ] },
    { q: 'What does rationing do?', a: [
      'It slows your drain, and slows your recovery too. Good for a short crisis, bad for a long one.',
      'Water and food use drop 40%, and hold times for repairs rise. Health recovery is cut in half. Use it while a repair is pending, then switch it off.',
      'Physiology: a lower intake means a lower metabolic load, but the body cannot heal as quickly. It is a trade-off, not a free fix.' ] },
    { q: 'When should I refill my suit?', a: [
      'Before you go out, not after. Below half, top up at the station. Never walk out on low air.',
      'Use the station whenever the suit drops below about 60% and you are heading outside. It takes up to twelve seconds and draws on the habitat reserve, so keep the generator running.',
      'The suit is your lifeline outside, and the outside drain is steady. A full tank gives you the longest margin if something goes wrong.' ] },
  ],
  4: [
    { q: 'When will the storm hit?', a: [
      'Soon. Space weather alerts come with little warning. Prepare now, do not wait for the siren.',
      'Watch the radio and the HUD alerts: you get a short warning, then the radiation rate climbs in seconds. Use the warning time to stow arrays and move.',
      'Solar storms are bursts of fast charged particles. The first warning can arrive within minutes of the flare, so there is very little time to react.' ] },
    { q: 'Should I stow the arrays or keep power?', a: [
      'Stow them if you can do it safely, then get under cover. Power can be restored later. You cannot be restored.',
      'Stowed arrays do not take radiation damage, but they make no power, so check the battery first. If the battery is healthy, stow them and ride out the storm.',
      'Solar cells are sensitive to energetic particle damage and surge currents. Stowing protects hardware, and the trade is lost generation until the storm ends.' ] },
    { q: 'Habitat or shelter?', a: [
      'The shelter. Ninety percent shielding against fifty-five. Go there and stay there.',
      'The habitat blocks about 55% of radiation, the shelter about 90%. If the storm is long, the shelter is the safer room, but it has less supplies, so inspect the box and plan for it.',
      'Shielding depends on mass and material between you and the particles. A small, dense shelter stops far more radiation than a larger, lighter habitat shell.' ] },
    { q: 'What if I am caught outside?', a: [
      'Move. Sprint to the nearest cover. Do not stop to finish a task. Dose adds up every second.',
      'Radiation harm is dose times time. Every second outside counts, so take the shortest route to the shelter or habitat door. Watch your suit oxygen on the way.',
      'There is no shielding outside, so your body absorbs the whole dose. Reaching any shielded room quickly matters more than which room is best.' ] },
  ],
  5: [
    { q: 'What do I fix first?', a: [
      'Whatever keeps you alive in the next two minutes: air leak, then heat, then power. Comms last.',
      'Triage by life support: seal the hull breach, restore the thermal unit, then repair generation. The comm dish matters least. You only need three of the four.',
      'Rank by how fast each failure harms the crew. Air loss and cold are immediate, power loss is slower but feeds both, and communications do not harm the body at all.' ] },
    { q: 'How do I survive the night on battery?', a: [
      'Shed everything you do not need before dark. Keep air, heat and scrubber. Then wait out the clock.',
      'At night there is no solar generation. Check the battery percentage and the load in the console, then cut non-essential loads so the battery lasts until the relief ship arrives.',
      'The Moon has two weeks of night. Missions with solar arrays need big batteries or other power sources, because the Sun simply is not there to help.' ] },
    { q: 'Which loads can I shut off?', a: [
      'Greenhouse first. Then anything that is not oxygen, heat or CO₂. Switch it off in the console.',
      'The greenhouse draws the most power and is not needed for a short emergency. Keep the O₂ generator, scrubber and thermal control. The recycler can pause briefly if the battery is critical.',
      'Plants are lovely but they are also big power consumers. For a short emergency, living off stored food is better than losing heat or air.' ] },
    { q: 'How many emergencies must I solve?', a: [
      'Three of the four, and you must stay alive until the relief ship arrives. Choose which three wisely.',
      'Three of the four repairs plus survival. That leaves room for one failure, so pick the three that protect air, heat and power, and let the fourth go if materials run short.',
      'Real mission planning accepts that not everything can be fixed. Redundancy and priorities exist so that losing one system is survivable.' ] },
  ],
  6: [
    { q: 'How is Mars different from the Moon?', a: [
      'More gravity, weaker sunlight, thin air full of dust. Same rules: air, water, power first.',
      'Mars has about 38% of Earth gravity, roughly 43% of the Moon-level sunlight per array in this simulation, and a cold, thin CO₂ atmosphere. Expect less power and more dust on the panels.',
      'Mars is farther from the Sun, so sunlight is weaker, and it has a thin atmosphere that carries fine dust. Gravity is higher than on the Moon, so you feel heavier.' ] },
    { q: 'How do I make oxygen and water here?', a: [
      'Run the oxygen generator and the recycler. Collect ice samples for water. Do not skip either.',
      'The Mars generator makes oxygen from atmospheric CO₂, so it needs no water. Ice and regolith samples add water. Keep both systems powered, and check the energy balance in the console.',
      'The Martian atmosphere is mostly carbon dioxide, which contains oxygen. A device can split it. Ice under the soil is the water source. That is in-situ resource utilisation.' ] },
    { q: 'Why is power weaker here?', a: [
      'Distance and dust. Clean panels, repair arrays, and do not run everything at once.',
      'Less sunlight reaches the arrays, and dust builds up on them quickly, which lowers output. Check dust on the panels and prioritise loads so the battery never hits zero.',
      'Mars is about 1.5 times farther from the Sun, so each square metre of panel gets less than half the light. Add dust and generation drops further.' ] },
    { q: 'What is my first priority?', a: [
      'Establish the base: power, then air, then water. Get the objectives done and keep your suit topped up.',
      'Bring the systems up in order: power, oxygen generation, scrubber, recycler. Then inspect and top up. One failed system can cascade into the others.',
      'Establish the power supply first, because everything else depends on it. A stable base lets you do the science afterwards.' ] },
  ],
  7: [
    { q: 'How long will the dust storm last?', a: [
      'Longer than you want. Plan for the whole thing, not the best case. Keep the base alive until it clears.',
      'Global dust storms can last weeks in reality. In this simulation it is a few minutes. Plan your battery and loads as if it will last the full timer.',
      'Dust storms on Mars can grow to cover the whole planet and last weeks, dimming sunlight so much that solar-powered missions struggle.' ] },
    { q: 'How do I keep the base from blacking out?', a: [
      'Cut loads early, stow arrays if told, and keep the battery above zero. A long blackout ends the mission.',
      'Reduce the load until production plus battery covers it. Turn off the greenhouse, keep the generator, scrubber and heat. If the battery empties for too long, the mission fails.',
      'During the storm the arrays make a small fraction of their usual power. Every kilowatt you save at the load side extends the battery directly.' ] },
    { q: 'What should I shut down first?', a: [
      'Greenhouse. Then the recycler if you have to. Never the oxygen generator, scrubber or heat.',
      'Order of shutdown: greenhouse, then optional systems, then the recycler. Keep thermal control and the scrubber. Check the console after each change to see the load fall.',
      'Plants can wait; air and warmth cannot. Switching the greenhouse off saves the biggest block of power for the least immediate harm.' ] },
    { q: 'What if the repair materials run out?', a: [
      'Then you fix only what matters. Pick air, heat or power and let the rest go. Collect samples if you can reach them.',
      'Plan your remaining materials: one repair for the system that fails soonest. Strip what you can, and avoid new damage by stowing arrays and keeping loads low.',
      'Engineers keep spares and accept risk. When parts run out, the question is which failure the crew can survive longest, and fix the other one.' ] },
  ],
};

export const QUESTIONS_PER_LEVEL = 4;
export function levelQuestions(levelId) { return (LEVELS[levelId] || []).map((x, i) => ({ index: i, text: x.q })); }
export function contactsView(levelId) {
  return { contacts: CONTACTS.map((c) => ({ ...c })), questions: levelQuestions(levelId), disclaimer: DISCLAIMER };
}
/** The authored answer of one contact to one of the level's four questions, or null if the ids are not valid. */
export function answerFor(levelId, contactId, qIndex) {
  const row = LEVELS[levelId]?.[qIndex];
  const ci = CONTACTS.findIndex((c) => c.id === contactId);
  if (!row || ci < 0) return null;
  return { question: row.q, text: row.a[ci], contact: CONTACTS[ci] };
}
export const ALL_ANSWERS = LEVELS;
