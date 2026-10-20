import { useEffect, useState } from 'react';
import { ROLES } from './core.js';
import { Meter, tone, fmtNum, fmtRad, fmtTime, TREND_CH } from './common.jsx';

const TRADE = {
  base: 'Costs a little power but keeps lights, sensors and the console alive. Turning the breaker off blacks out everything.',
  o2gen: 'Gives habitat oxygen (uses water and power on the Moon; splits CO₂ on Mars). Off = oxygen only falls.',
  scrubber: 'Removes exhaled CO₂. Costs power; off = CO₂ builds up and poisons the air.',
  recycler: 'Gives most of the crew\'s used water back. Costs power; off = water drains much faster.',
  thermal: 'Keeps the habitat warm. Costs more power when it is colder outside; off = the habitat cools down.',
  greenhouse: 'Gives food and some oxygen. Costs a lot of power and water; use it only when the energy budget allows.',
};
const STATE_TXT = { ok: 'OK', fault: 'FAULT', broken: 'BROKEN', absent: 'NOT BUILT' };
const TREND_TXT = { up: 'rising', down: 'falling', flat: 'steady' };

export function Console({ snap, engine }) {
  const c = snap.console;
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyE') {
        e.preventDefault();
        engine.closeConsole();
        engine.eTap = false;   // the engine latches E presses even outside 'playing': clear it so the desk does not instantly re-open
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine]);
  if (!c) return null;
  const p = c.power, e = c.env;
  const batPct = p.cap > 0 ? (p.battery / p.cap) * 100 : p.battery;
  const netTxt = `${p.net >= 0 ? '+' : ''}${p.net.toFixed(1)} kW`;
  const w = c.weight, we = c.earthWeight;
  const deploy = (id) => setMsg(engine.consoleDeploy(id));
  return (
    <div className="screen full dim console-screen">
      <div className="page console" role="dialog" aria-label="Systems console">
        <header className="page-head">
          <h2>Systems console</h2>
          <button type="button" className="btn small" autoFocus onClick={() => { engine.closeConsole(); engine.eTap = false; }}>Close (Esc / E)</button>
        </header>
        <p className="guidance"><b>Guidance:</b> {c.guidance}</p>
        <div className="console-grid">
          <section className="card">
            <h3>Resources</h3>
            <table className="rtable">
              <thead><tr><th>Resource</th><th>Level</th><th>Trend</th><th>Empty in</th></tr></thead>
              <tbody>
                {c.lines.map((l) => {
                  const mat = l.key === 'materials';
                  return (
                    <tr key={l.key} className={!mat && l.value < 25 ? 'crit' : ''}>
                      <td>{l.name}</td>
                      <td className="lv">{mat ? <b>{Math.round(l.value)}</b> : <><Meter value={l.value} label={l.name} tone={tone(l.value)} /><b>{Math.round(l.value)}%</b></>}</td>
                      <td><span className={`trend ${l.trend}`} aria-label={TREND_TXT[l.trend]}>{TREND_CH[l.trend]}</span></td>
                      <td>{typeof l.empty === 'number' ? fmtTime(l.empty) : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <h3>Energy balance</h3>
            <div className="energy">
              <div><span className="muted">Solar production</span><b>{p.prod.toFixed(1)} kW</b></div>
              <div><span className="muted">Consumption</span><b>{p.load.toFixed(1)} kW</b></div>
              <div><span className="muted">Net</span><b className={p.net >= 0 ? 'good' : 'bad'}>{netTxt}</b></div>
              <div><span className="muted">Battery</span><b>{Math.round(batPct)}%</b></div>
            </div>
            <Meter value={batPct} label="Battery charge" tone={tone(batPct)} />
            {!p.on && <p className="warn-line" role="alert">Main breaker is OFF: the base has no power.</p>}
            {p.blackout && <p className="warn-line" role="alert">BLACKOUT: the battery is empty and production is below demand. Switch off loads!</p>}
            {p.on && !p.blackout && p.net < 0 && <p className="warn-line amber">Net power is negative: the battery is draining.</p>}
            <h3>Rationing</h3>
            <button type="button" className={`toggle wide ${c.rationing ? 'on' : ''}`} role="switch" aria-checked={c.rationing} onClick={() => engine.consoleRation()}>
              Rationing {c.rationing ? 'ON' : 'OFF'}
            </button>
            <p className="muted">Trade-off: cuts water and food use by 40%, but recovery and work speed are slower.</p>
          </section>

          <section className="card">
            <h3>Systems &amp; loads</h3>
            <ul className="loads">
              {c.loads.map((l) => {
                const st = l.state || 'ok';
                return (
                  <li key={l.k} className={`load ${st}`}>
                    <div className="lhead">
                      <b>{l.name}</b>
                      <span className={`state ${st}`}>{STATE_TXT[st] || st}</span>
                      <span className="muted">{l.kw.toFixed(1)} kW</span>
                      {l.k !== 'base' && <span className={`pw ${l.powered ? 'yes' : 'no'}`}>{l.powered ? 'powered' : 'no power'}</span>}
                      {l.toggle
                        ? <button type="button" className={`toggle ${l.on ? 'on' : ''}`} role="switch" aria-checked={l.on} aria-label={`${l.name} ${l.on ? 'on' : 'off'}`} onClick={() => engine.consoleToggle(l.k)}>{l.on ? 'ON' : 'OFF'}</button>
                        : <span className="toggle disabled" aria-hidden="true">{l.k === 'base' ? (l.on ? 'ON' : 'OFF') : '-'}</span>}
                    </div>
                    <div className="muted trade">{TRADE[l.k]}{st === 'broken' ? ' It must be repaired in the field first.' : st === 'fault' ? ' It is stuck: diagnose it with the scanner first.' : ''}</div>
                  </li>
                );
              })}
            </ul>
            {c.canDeploy.length > 0 && (
              <>
                <h3>Build</h3>
                <div className="deploy">
                  {c.canDeploy.map((d) => (
                    <button key={d.id} type="button" className="btn" onClick={() => deploy(d.id)}>Build {d.name}<small>{d.cost} materials</small></button>
                  ))}
                </div>
                {msg && <p className={msg.ok ? 'okmsg' : 'warn-line amber'} role="status">{msg.text}</p>}
              </>
            )}
          </section>

          <section className="card">
            <h3>Environment · {e.planet}</h3>
            <dl className="env">
              <div><dt>Gravity</dt><dd>{e.gravity} m/s²</dd></div>
              <div><dt>Sunlight</dt><dd>{Math.round(e.sun * 100)}%</dd></div>
              <div><dt>Outside temp</dt><dd>{Math.round(e.ambient)} °C</dd></div>
              <div><dt>Habitat temp</dt><dd className={e.temp < 8 || e.temp > 32 ? 'bad' : ''}>{Math.round(e.temp)} °C</dd></div>
              <div><dt>Radiation</dt><dd className={e.rad > 200 ? 'bad' : ''}>{fmtRad(e.rad)} µSv/h</dd></div>
              <div><dt>Cabin CO₂ index</dt><dd className={e.co2 > 60 ? 'bad' : ''}>{Math.round(e.co2)} / 100 (danger above 70)</dd></div>
              <div><dt>Pressure</dt><dd>{e.pressure}</dd></div>
              <div><dt>Day length</dt><dd>{e.dayText}</dd></div>
            </dl>
            <h3>Weight here</h3>
            <p>You (mass {snap.me.weight} kg): <b>{fmtNum(w.newtons, 0)} N</b> here vs {fmtNum(we.newtons, 0)} N on Earth.</p>
            <p className="muted">Mass stays the same; weight = mass × gravity.</p>
            <h3>About {e.planet}</h3>
            <ul className="facts">{e.facts.map((f) => <li key={f}>{f}</li>)}</ul>
            <p className="muted">{ROLES[snap.me.role]?.icon} Your {ROLES[snap.me.role]?.name} bonus: {ROLES[snap.me.role]?.desc}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
