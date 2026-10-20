import { useEffect } from 'react';
import { GRADE_LABEL } from './core.js';
import { GradeChip, Meter, tone, fmtTime } from './common.jsx';

const LETTERS = ['A', 'B', 'C', 'D'];

function StatusStrip({ snap }) {
  const items = [
    ['Health', snap.health], ['Suit O₂', snap.oxygen], ['Habitat O₂', snap.o2res], ['Water', snap.res.water], ['Food', snap.res.food], ['Energy', snap.res.battery],
  ];
  return (
    <div className="strip" aria-label="Current status">
      {items.map(([n, v]) => (
        <span key={n} className={`strip-item ${tone(v)}`}><span>{n}</span><Meter value={v} label={n} tone={tone(v)} /><b>{Math.round(v)}</b></span>
      ))}
    </div>
  );
}

export function Decision({ snap, engine }) {
  const ev = snap.event;
  const view = ev?.view, result = ev?.result;

  useEffect(() => {
    if (!view) return undefined;
    const onKey = (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      let i = -1;
      if (/^Key[A-D]$/.test(e.code)) i = 'ABCD'.indexOf(e.code[3]);
      else if (/^Digit[1-4]$/.test(e.code)) i = Number(e.code[5]) - 1;
      else if (/^Numpad[1-4]$/.test(e.code)) i = Number(e.code[6]) - 1;
      if (i >= 0 && view.choices[i]) { e.preventDefault(); engine.chooseEventOption(view.choices[i].id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, engine]);

  if (!ev) return null;
  if (result) {
    return (
      <div className="screen center alert">
        <div className="panel decision result" role="dialog" aria-label="Decision evaluation">
          <div className="eyebrow">EVALUATION · {result.icon} {result.name}</div>
          <div className="gradeline"><GradeChip grade={result.grade} large /><span className="muted">{GRADE_LABEL[result.grade]} decision</span></div>
          {result.timedOut && <p className="timedout" role="status">Time ran out! No choice was made, so the do-nothing default was applied and the grade dropped one level.</p>}
          <p className="yourchoice"><span className="muted">You chose</span><br /><b>{result.choice}</b></p>
          <p><b>Why this grade:</b> {result.why}</p>
          <p className="consequence"><b>Consequence:</b> {result.consequence}</p>
          {result.crisisName && <p className="consequence crisisline" role="alert"><b>⚠ This decision started an emergency: {result.crisisName}.</b> Solve it before it escalates, or the mission fails.</p>}
          <div className="science"><b>SCIENCE</b><br />{result.science}</div>
          <StatusStrip snap={snap} />
          <div className="actions"><button type="button" className="btn primary big" autoFocus onClick={() => engine.continueEvent()}>Continue</button></div>
        </div>
      </div>
    );
  }
  const frac = view.total > 0 ? Math.max(0, Math.min(1, view.remaining / view.total)) : 0;
  const urgent = frac < 0.25;
  return (
    <div className="screen center alert">
      <div className="panel decision" role="alertdialog" aria-label={`Emergency: ${view.name}`}>
        <div className="alertbar"><span className="aicon" aria-hidden="true">{view.icon}</span><span><span className="eyebrow red">{view.alert || 'ALERT'}</span><br /><b className="aname">{view.name}</b></span></div>
        <p className="problem">{view.problem}</p>
        <div className={`timer ${urgent ? 'urgent' : ''}`} role="progressbar" aria-label="Time left to decide" aria-valuemin={0} aria-valuemax={Math.round(view.total)} aria-valuenow={Math.round(view.remaining)}>
          <i style={{ width: `${frac * 100}%` }} /><span>{fmtTime(Math.ceil(view.remaining))} left · choose A-D or 1-4</span>
        </div>
        <div className="choices">
          {view.choices.map((c, i) => (
            <button key={c.id} type="button" className="btn choice" onClick={() => engine.chooseEventOption(c.id)}>
              <b>{LETTERS[i]}</b><span>{c.text}</span>
            </button>
          ))}
        </div>
        {view.hint && <p className="radiohint" aria-live="polite"><span className="rlabel">📻 Mission Control (simulated)</span> {view.hint}</p>}
        <StatusStrip snap={snap} />
      </div>
    </div>
  );
}
