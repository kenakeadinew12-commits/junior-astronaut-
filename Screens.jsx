import { useEffect, useState } from 'react';
import { LEVELS } from './levels.js';
import { ROLES, DIFF, weightOn } from './core.js';
import { LIMITS, DEFAULT_PROFILE } from './profile.js';
import { ControlsList, DIFF_LIST, DIFF_TEXT, ROLE_ORDER, Stars, PlanetBadge, DiffBadge, Rank, Meter, fmtNum, fmtTime, tone, START_ROWS } from './common.jsx';

const GRAV = { earth: 9.81, moon: 1.62, mars: 3.71 };
const MAX = LEVELS.length;

// ------------------------------------------------------------------------------------------------ title
export function Title({ snap, engine, view, setView }) {
  useEffect(() => {
    const onKey = (e) => { if (e.code === 'Escape' && view !== 'main') setView('main'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, setView]);

  if (view === 'levels') return <LevelSelect snap={snap} engine={engine} onBack={() => setView('main')} />;
  if (view === 'settings') return <SettingsScreen snap={snap} engine={engine} onBack={() => setView('main')} />;
  if (view === 'about') return <AboutScreen onBack={() => setView('main')} />;
  if (view === 'crew') return <CrewScreen snap={snap} engine={engine} onBack={() => setView('main')} />;

  const prog = snap.save.progress;
  const next = Math.min(MAX, prog.unlocked);
  const nl = LEVELS[next - 1];
  const done = Object.keys(prog.completed || {}).length;
  return (
    <div className="screen title">
      <div className="title-block">
        <div className="eyebrow">NASA SPACE APPS CHALLENGE</div>
        <h1>JUNIOR<br />ASTRONAUT</h1>
        <div className="subtitle">MISSION TRAINER · MOON &amp; MARS OUTPOSTS</div>
        <nav className="menu" aria-label="Main menu">
          <button type="button" className="btn primary" autoFocus onClick={() => engine.startLevel(next)}>
            Play<small>{done === 0 ? 'Mission 1: ' : 'Continue: '}{nl.name}</small>
          </button>
          <button type="button" className="btn" onClick={() => setView('levels')}>Select mission<small>{done}/{MAX} completed</small></button>
          <button type="button" className="btn" onClick={() => setView('settings')}>Settings<small>Volume · voice</small></button>
          <button type="button" className="btn" onClick={() => setView('about')}>About<small>What this is and what is simplified</small></button>
          <button type="button" className="btn" onClick={() => setView('crew')}>Crew / Profile<small>{snap.save.profile.name} · {ROLES[snap.save.profile.role]?.name}</small></button>
        </nav>
        <p className="fact">Seven missions: five on the Moon, two on Mars. Keep your crew alive, manage oxygen, water, food and power, and learn the real science behind life on another world.</p>
      </div>
      <aside className="title-controls" aria-label="Controls">
        <div className="eyebrow">CONTROLS</div>
        <ControlsList />
        <p className="muted credit">NASA Space Apps Challenge project · mechanics are simplified for learning</p>
      </aside>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ level select
export function LevelSelect({ snap, engine, onBack }) {
  const prog = snap.save.progress;
    const moon = LEVELS.filter((l) => l.planet === 'moon'), mars = LEVELS.filter((l) => l.planet === 'mars');
  const card = (l) => {
    const locked = l.id > prog.unlocked;
    const stars = prog.stars?.[l.id] || 0, best = prog.best?.[l.id];
    return (
      <button key={l.id} type="button" className={`lcard ${l.planet} ${locked ? 'locked' : ''}`} disabled={locked} aria-disabled={locked}
        onClick={() => engine.startLevel(l.id)} data-level={l.id}>
        <span className="lnum">{locked ? '🔒' : l.id}</span>
        <span className="lbody">
          <span className="lname">{l.name}</span>
          <span className="ltag">{locked ? `Complete level ${l.id - 1} to unlock` : l.tagline}</span>
          <span className="lmeta">
            <Rank rank={l.rank} /><span className="muted">Difficulty {l.rank}/5</span>
            {prog.completed?.[l.id] && <span className="done-chip">Completed</span>}
          </span>
        </span>
        <span className="lscore">
          <Stars n={stars} size="sm" />
          <span className="muted">{best ? `Best ${best}` : locked ? 'Locked' : 'Not played'}</span>
        </span>
      </button>
    );
  };
  return (
    <div className="screen full dim" role="dialog" aria-label="Select mission">
      <div className="page">
        <header className="page-head">
          <button type="button" className="btn small" onClick={onBack}>← Back</button>
          <h2>Select mission</h2>
        </header>
        <h3 className="group moon">MOON · levels 1-5</h3>
        <div className="lgrid">{moon.map(card)}</div>
        <h3 className="group mars">MARS · levels 6-7</h3>
        <div className="lgrid">{mars.map(card)}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ crew / profile
const numOrNaN = (s) => (s === '' || s == null ? NaN : Number(s));
function rangeError(label, s, [lo, hi], unit) {
  const n = numOrNaN(s);
  if (!Number.isFinite(n)) return `${label} must be a number between ${lo} and ${hi} ${unit}.`;
  if (n < lo || n > hi) return `${label} must be between ${lo} and ${hi} ${unit}.`;
  return null;
}

export function CrewScreen({ snap, engine, onBack }) {
  const p0 = snap.save.profile;
  const [name, setName] = useState(p0.name);
  const [role, setRole] = useState(p0.role);
  const [weight, setWeight] = useState(String(p0.weight));
  const [height, setHeight] = useState(String(p0.height));
  const [saved, setSaved] = useState(false);
  const wErr = rangeError('Weight', weight, LIMITS.weight, 'kg'), hErr = rangeError('Height', height, LIMITS.height, 'cm');
  const clampBlur = (v, set, [lo, hi], def) => {
    const n = Math.round(numOrNaN(v));
    set(String(Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def));
  };
  const wNum = Math.min(LIMITS.weight[1], Math.max(LIMITS.weight[0], Math.round(numOrNaN(weight)) || DEFAULT_PROFILE.weight));
  const touch = () => setSaved(false);
  const canSave = !wErr && !hErr && name.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    engine.setProfile({ name: name.trim().slice(0, 20), role, weight: Math.round(Number(weight)), height: Math.round(Number(height)) });
    setSaved(true);
  };
  const rows = [['Earth', GRAV.earth], ['Moon', GRAV.moon], ['Mars', GRAV.mars]].map(([n, g]) => ({ n, g, w: weightOn(wNum, g) }));
  return (
    <div className="screen full dim" role="dialog" aria-label="Crew and profile">
      <div className="page">
        <header className="page-head">
          <button type="button" className="btn small" onClick={onBack}>← Back</button>
          <h2>Crew / Profile</h2>
        </header>
        <div className="crew-grid">
          <section className="card">
            <h3>You</h3>
            <label className="field"><span>Name (max 20 characters)</span>
              <input type="text" value={name} maxLength={20} onChange={(e) => { setName(e.target.value.replace(/[<>]/g, '')); touch(); }} aria-label="Astronaut name" />
            </label>
            <div className="two">
              <label className="field"><span>Weight (kg) · {LIMITS.weight[0]}-{LIMITS.weight[1]}</span>
                <input type="number" inputMode="numeric" value={weight} min={LIMITS.weight[0]} max={LIMITS.weight[1]} aria-invalid={!!wErr} aria-describedby="werr"
                  onChange={(e) => { setWeight(e.target.value); touch(); }} onBlur={() => clampBlur(weight, setWeight, LIMITS.weight, DEFAULT_PROFILE.weight)} />
                <em id="werr" className="err" role="alert">{wErr || ''}</em>
              </label>
              <label className="field"><span>Height (cm) · {LIMITS.height[0]}-{LIMITS.height[1]}</span>
                <input type="number" inputMode="numeric" value={height} min={LIMITS.height[0]} max={LIMITS.height[1]} aria-invalid={!!hErr} aria-describedby="herr"
                  onChange={(e) => { setHeight(e.target.value); touch(); }} onBlur={() => clampBlur(height, setHeight, LIMITS.height, DEFAULT_PROFILE.height)} />
                <em id="herr" className="err" role="alert">{hErr || ''}</em>
              </label>
            </div>
            <p className="muted">Your weight and height shape how much air you use and how tall you stand in the world.</p>
            <h3>Your role</h3>
            <div className="opts" role="radiogroup" aria-label="Role">
              {ROLE_ORDER.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={role === r} className={`opt ${role === r ? 'on' : ''}`} onClick={() => { setRole(r); touch(); }}>
                  <span className="oicon" aria-hidden="true">{ROLES[r].icon}</span>
                  <span><b>{ROLES[r].name}</b> · {ROLES[r].ability}<br /><span className="muted">{ROLES[r].desc}</span></span>
                </button>
              ))}
            </div>
          </section>
          <section className="card weightcard" aria-label="What you weigh">
            <h3>What you weigh</h3>
            <table className="wtable">
              <thead><tr><th>Where</th><th>Gravity</th><th>Weight</th><th>A scale would read</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.n} className={r.n.toLowerCase()}>
                    <td>{r.n}</td><td>{r.g} m/s²</td><td><b>{fmtNum(r.w.newtons, 0)} N</b></td><td>{fmtNum(r.w.kgEquiv, 1)} kg-force</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p><b>Weight = mass × gravity.</b> Your <b>mass</b> is {wNum} kg everywhere. Only your <b>weight</b> (the pull of gravity on that mass) changes: on the Moon you feel about {Math.round((GRAV.moon / GRAV.earth) * 100)}% of your Earth weight, on Mars about {Math.round((GRAV.mars / GRAV.earth) * 100)}%.</p>
            <p className="muted">A newton (N) is the unit of force. "kg-force" is what a bathroom scale would show for that pull.</p>
          </section>
        </div>
        <div className="actions">
          <button type="button" className="btn primary" disabled={!canSave} onClick={save}>Save profile</button>
          <button type="button" className="btn" onClick={() => { save(); onBack(); }} disabled={!canSave}>Save &amp; back</button>
          <span className="saved" role="status">{saved ? 'Saved ✓' : ''}</span>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ briefing
export function Briefing({ snap, engine, goLevels }) {
  const lvl = LEVELS[snap.level.id - 1];
  const g = engine.game;
  const me = snap.me;
  const rows = [['oxygen', g.oxygen], ['o2res', g.o2res], ['water', g.res.water], ['food', g.res.food], ['battery', g.res.battery]];
  const goBack = () => { engine.toTitle(); goLevels(); };
  return (
    <div className={`screen briefing ${lvl.planet}`}>
      <div className="brief-panel" role="dialog" aria-label={`Mission ${lvl.id} briefing`}>
        <div className="brief-scroll">
          <div className="brief-head">
            <PlanetBadge planet={lvl.planet} />
            <span className="muted">Difficulty {lvl.rank}/5 · par {fmtTime(lvl.par)}</span>
          </div>
          <div className="eyebrow">MISSION {lvl.id} BRIEFING</div>
          <h1>{lvl.name}</h1>
          <p className="tagline">{lvl.tagline}</p>
          {lvl.story.map((s, i) => <p key={i}>{s}</p>)}
          <div className="brief-cols">
            <div>
              <h3>You will learn</h3>
              <ul className="brief-list">{lvl.teaches.map((t) => <li key={t}>{t}</li>)}</ul>
              <h3>Tips</h3>
              <ul className="brief-list">{lvl.tips.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div>
              <h3>Starting resources</h3>
              <div className="startres">
                {rows.map(([k, v]) => {
                  const nm = START_ROWS.find((r) => r[0] === k)[1];
                  return <div key={k} className="srow"><span>{nm}</span><Meter value={v} label={`${nm} at start`} tone={tone(v)} /><b>{Math.round(v)}%</b></div>;
                })}
                <div className="srow"><span>Materials</span><span /><b>{Math.round(g.res.materials)}</b></div>
                <div className="srow"><span>Health</span><Meter value={100} label="Health at start" /><b>100%</b></div>
              </div>
              <p className="muted">Mission clock limit {fmtTime(snap.limit)}.</p>
              <h3>Your crew</h3>
              <div className="crewcards">
                <div className="mini"><b>{me.name}</b><span>{ROLES[me.role]?.icon} {ROLES[me.role]?.name} · {me.weight} kg · {me.height} cm</span><span className="muted">{ROLES[me.role]?.ability}: {ROLES[me.role]?.desc}</span></div>
              </div>
            </div>
          </div>
          <h3>Controls</h3>
          <ControlsList compact />
        </div>
        <div className="brief-actions">
          <button type="button" className="btn" onClick={goBack}>Back</button>
          <button type="button" className="btn primary big" autoFocus onClick={() => engine.begin()}>Begin mission</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ pause
export function Pause({ snap, engine, goMenu }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const onKey = (e) => { if (e.code === 'Escape') engine.resume(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine]);
  return (
    <div className="screen center dim">
      <div className="panel pausepanel" role="dialog" aria-label="Paused">
        <div className="eyebrow">PAUSED · MISSION {snap.level.id}</div>
        <h2>{snap.level.name}</h2>
        <div className="menu">
          <button type="button" className="btn primary" autoFocus onClick={() => engine.resume()}>Resume</button>
          <button type="button" className="btn" onClick={() => engine.restart()}>Restart level</button>
          <button type="button" className="btn" onClick={() => engine.setMuted(!snap.muted)}>Sound: {snap.muted ? 'muted' : 'on'} (M)</button>
          <button type="button" className="btn" onClick={() => engine.toggleFullscreen()}>Fullscreen: {snap.fullscreen ? 'on' : 'off'} (F)</button>
          {confirm
            ? <button type="button" className="btn danger" onClick={() => { engine.toTitle(); goMenu(); }}>Really quit? Progress in this level is lost</button>
            : <button type="button" className="btn" onClick={() => setConfirm(true)}>Quit to title</button>}
        </div>
        <h3>Controls</h3>
        <ControlsList compact />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ settings / about
export function SettingsScreen({ snap, engine, onBack }) {
  return (
    <div className="screen full dim" role="dialog" aria-label="Settings">
      <div className="page narrow">
        <header className="page-head"><button type="button" className="btn small" onClick={onBack}>← Back</button><h2>Settings</h2></header>
        <label className="setrow">Master volume
          <input type="range" min="0" max="100" value={Math.round(snap.volume * 100)} onChange={(e) => { engine.setVolume(Number(e.target.value) / 100); engine.uiSound('click'); }} aria-label="Master volume" />
          <span>{Math.round(snap.volume * 100)}%</span></label>
        <label className="setrow">Music volume
          <input type="range" min="0" max="100" value={Math.round(snap.musicVol * 100)} onChange={(e) => engine.setMusicVolume(Number(e.target.value) / 100)} aria-label="Music volume" />
          <span>{Math.round(snap.musicVol * 100)}%</span></label>
        <label className="setrow">Mute all sound (M in game)
          <input type="checkbox" checked={snap.muted} onChange={(e) => engine.setMuted(e.target.checked)} /></label>
        <label className="setrow">Mission Control replies are spoken aloud {snap.speech ? '' : '(not supported by this browser)'}
          <input type="checkbox" checked={snap.voice} disabled={!snap.speech} onChange={(e) => engine.setVoice(e.target.checked)} /></label>
        <p className="muted">Settings are saved in this browser. Difficulty is chosen under Select mission.</p>
      </div>
    </div>
  );
}

export function AboutScreen({ onBack }) {
  return (
    <div className="screen full dim" role="dialog" aria-label="About">
      <div className="page narrow">
        <header className="page-head"><button type="button" className="btn small" onClick={onBack}>← Back</button><h2>About</h2></header>
        <p>Junior Astronaut Mission Trainer is a first-person 3D educational game made for the NASA Space Apps Challenge. Seven missions (five on the Moon, two on Mars) teach how crews manage oxygen, water, food, power, radiation and temperature.</p>
        <p>Mechanics and numbers are simplified for learning and are not real NASA operating data. Everything is generated by code: no downloaded art or sound files.</p>
        <p>Mission Control (Cmdr. Elena Marsh, Dr. Raj Okafor and Dr. Mei Tanaka) are fictional, simulated contacts reachable from the comms panel (press C). They are not real NASA personnel and this is not live communication.</p>
      </div>
    </div>
  );
}
