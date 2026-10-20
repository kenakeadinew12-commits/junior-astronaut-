import { RES_KEYS, RES_NAMES } from './core.js';
import { Stars, Meter, GradeChip, PlanetBadge, DiffBadge, fmtTime, fmtNum, fmtRad, tone } from './common.jsx';
import { LEVELS } from './levels.js';

function DecisionLine({ d, title }) {
  if (!d) return <div className="card"><h3>{title}</h3><p className="muted">No costly decision: nothing went badly wrong.</p></div>;
  return (
    <div className="card">
      <h3>{title}</h3>
      <p><span aria-hidden="true">{d.icon}</span> <b>{d.name}</b> <GradeChip grade={d.grade} /></p>
      <p className="muted">You chose: {d.choice}</p>
      <p>{d.consequence}</p>
    </div>
  );
}

export function EndReport({ snap, engine, goLevels, goMenu }) {
  const e = snap.end;
  if (!e) return null;
  const win = e.success;
  const planet = LEVELS[e.level - 1]?.planet || 'moon';
  const buttons = (first) => (
    <div className="actions center">
      <button type="button" className="btn" onClick={() => engine.restart()}>Replay level</button>
      {e.hasNext && <button type="button" className="btn primary" autoFocus={first} onClick={() => engine.nextLevel()}>Next mission</button>}
      <button type="button" className="btn" onClick={() => { engine.toTitle(); goLevels(); }}>Mission select</button>
      <button type="button" className="btn" onClick={() => { engine.toTitle(); goMenu(); }}>Main menu</button>
    </div>
  );
  return (
    <div className={`screen full end ${win ? 'win' : 'lose'}`}>
      <div className="page report" role="main" aria-label="Mission report">
        <header className="report-head">
          <div className="eyebrow">MISSION REPORT · LEVEL {e.level} · <PlanetBadge planet={planet} /></div>
          <h1 className={win ? 'good' : 'bad'}>{win ? 'MISSION SUCCESS' : 'MISSION FAILED'}</h1>
          <p className="muted">{e.levelName} · time {fmtTime(e.time)} (par {fmtTime(e.par)})</p>
          <Stars n={e.stars} size="lg" />
          <div className="score">{e.score}<small> / 100</small></div>
          {buttons(true)}
        </header>

        <section className="card">
          <h3>{win ? 'Why you succeeded' : 'Why the mission failed'}</h3>
          <ul className="why">
            {e.reasonText && <li><b>{e.reasonText}</b></li>}
            {e.why.map((w) => <li key={w}>{w}</li>)}
          </ul>
          <p className="muted">Strongest area: <b>{e.strongest?.label}</b> ({e.strongest?.score}). Weakest area: <b>{e.weakest?.label}</b> ({e.weakest?.score}).</p>
        </section>

        <div className="rep-grid">
          <section className="card">
            <h3>Crew health</h3>
            <div className="hrow"><span>You</span><Meter value={e.health} label="Your final health" tone={tone(e.health)} /><b>{Math.round(e.health)}%</b></div>
            <h3>Remaining resources</h3>
            {RES_KEYS.map((k) => {
              const v = e.resources[k];
              return (
                <div className="hrow" key={k}><span>{RES_NAMES[k]}</span>
                  {k === 'materials' ? <span /> : <Meter value={v} label={RES_NAMES[k]} tone={tone(v)} />}
                  <b>{k === 'materials' ? Math.round(v) : `${Math.round(v)}%`}</b></div>
              );
            })}
          </section>
          <section className="card">
            <h3>Environment exposure</h3>
            <dl className="env">
              <div><dt>Radiation dose</dt><dd>{fmtRad(e.doseUSv)} µSv</dd></div>
              <div><dt>Peak dose rate</dt><dd>{fmtRad(e.peakRad)} µSv/h</dd></div>
              <div><dt>Habitat temperature</dt><dd>{Math.round(e.minTemp)} to {Math.round(e.maxTemp)} °C</dd></div>
              <div><dt>Gravity on {e.planet}</dt><dd>{e.gravity} m/s²</dd></div>
              <div><dt>Your weight here</dt><dd>{fmtNum(e.weightHere, 0)} N</dd></div>
              <div><dt>Your weight on Earth</dt><dd>{fmtNum(e.weightEarth, 0)} N</dd></div>
              <div><dt>Your mass</dt><dd>{e.mass} kg (unchanged)</dd></div>
            </dl>
            <p className="muted">Real-world context: measured surface dose rates are about 57 µSv/h on the Moon and about 28 µSv/h on Mars (Earth's surface is roughly 0.1 µSv/h). Storm values in this game are scaled up and time is compressed so you can feel the danger; they are not real forecasts.</p>
          </section>
        </div>

        <section className="card">
          <h3>Score breakdown</h3>
          <div className="comps">
            {e.components.map((c) => (
              <div className="comp" key={c.key}>
                <span>{c.label} <span className="muted">(×{Math.round(c.weight * 100)}%)</span></span>
                <Meter value={c.score} label={c.label} tone={tone(c.score)} /><b>{c.score}</b>
              </div>
            ))}
          </div>
        </section>

        {e.crises?.length > 0 && (
          <section className="card">
            <h3>Emergencies caused by decisions</h3>
            <ul>{e.crises.map((c, i) => <li key={i}>{c.icon} <b>{c.name}</b> at {fmtTime(c.startedAt)}: {c.outcome === 'resolved' ? `solved in ${c.seconds}s (reached stage ${c.stage}/3)` : c.outcome === 'failed' ? 'not solved in time: mission failed' : 'still unresolved'}</li>)}</ul>
          </section>
        )}

        <section className="card">
          <h3>Decisions</h3>
          {e.decisions.length === 0 ? <p className="muted">No emergency decisions were made.</p> : (
            <div className="tscroll"><table className="dtable">
              <thead><tr><th>Event</th><th>Your choice</th><th>Grade</th><th>Consequence</th></tr></thead>
              <tbody>
                {e.decisions.map((d, i) => (
                  <tr key={`${d.id}-${i}`}>
                    <td><span aria-hidden="true">{d.icon}</span> {d.name}{d.timedOut && <span className="muted"> (timed out)</span>}</td>
                    <td>{d.choice}</td><td><GradeChip grade={d.grade} /></td><td>{d.consequence}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>

        <div className="rep-grid">
          <DecisionLine d={e.best} title="Best decision" />
          <DecisionLine d={e.worst && e.worst.grade !== 'perfect' ? e.worst : null} title="Most costly decision" />
        </div>

        <section className="card">
          <h3>Resources gained and lost</h3>
          <div className="tscroll"><table className="dtable">
            <thead><tr><th>Resource</th><th>Gained</th><th>Lost</th></tr></thead>
            <tbody>{RES_KEYS.map((k) => <tr key={k}><td>{RES_NAMES[k]}</td><td className="good">+{fmtNum(e.gains[k])}</td><td className="bad">-{fmtNum(e.losses[k])}</td></tr>)}</tbody>
          </table></div>
          <p className="muted">Totals over the whole mission, in percentage points of a full store (materials in units): production, consumption, repairs and events all count.</p>
        </section>

        <section className="card">
          <h3>Science lessons</h3>
          <div className="lessons">{e.lessons.map((l) => <div className="lesson" key={l.topic + l.text.slice(0, 12)}><b>{l.topic}</b> {l.text}</div>)}</div>
        </section>

        <p className="muted honesty">Honesty note: this is a learning game. Mechanics, rates, radiation numbers and timings are simplified and compressed; real missions are far more complex and safety-critical.</p>
        {buttons(false)}
      </div>
    </div>
  );
}
