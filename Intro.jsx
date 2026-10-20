import { useEffect, useRef, useState } from 'react';

// Entry sequence: real warm-up progress -> "click to launch" (needed so the browser allows sound) ->
// countdown + rocket launch -> hand over to the main menu. Skippable at any time.
const WARMUP_FRAMES = 90;          // rendered frames; the bar follows the engine's real frame counter

export default function Intro({ engine, frames, ready, onDone }) {
  const [stage, setStage] = useState('loading');   // loading | ready | launch
  const [count, setCount] = useState(3);
  const timers = useRef([]);
  const pct = ready ? Math.max(1, Math.min(100, Math.round(((ready ? 12 : 0) + Math.min(1, frames / WARMUP_FRAMES) * 88)))) : 1;
  const label = !ready ? 'Starting 3D renderer' : frames < WARMUP_FRAMES * 0.4 ? 'Building lunar terrain and habitat' : frames < WARMUP_FRAMES ? 'Compiling shaders and warming up' : 'Systems ready';

  useEffect(() => { if (stage === 'loading' && pct >= 100) setStage('ready'); }, [pct, stage]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const finish = () => { timers.current.forEach(clearTimeout); onDone(); };
  const launch = () => {
    if (stage !== 'ready') return;
    setStage('launch');
    engine?.uiSound('beep'); setCount(3);
    const at = (ms, fn) => timers.current.push(setTimeout(fn, ms));
    at(1000, () => { setCount(2); engine?.uiSound('beep'); });
    at(2000, () => { setCount(1); engine?.uiSound('beep'); });
    at(3000, () => { setCount(0); engine?.uiSound('go'); engine?.uiSound('launch'); });
    at(8200, finish);
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Escape') { e.preventDefault(); finish(); }
      else if (stage === 'ready' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); launch(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const lifted = stage === 'launch' && count === 0;
  return (
    <div className={`screen intro ${stage} ${lifted ? 'lifted' : ''}`} role="dialog" aria-label="Launch sequence">
      <div className="stars-bg" aria-hidden="true" />
      <div className="intro-title"><h1>JUNIOR ASTRONAUT</h1></div>
      <div className="pad" aria-hidden="true">
        <svg className="rocket" viewBox="0 0 60 160" width="90" height="240">
          <path d="M30 4 C44 28 46 60 44 104 L16 104 C14 60 16 28 30 4Z" fill="#e8edf3" stroke="#9aa6b4" strokeWidth="1" />
          <path d="M30 4 C37 16 41 28 42 38 L18 38 C19 28 23 16 30 4Z" fill="#e0483a" />
          <circle cx="30" cy="62" r="8" fill="#1b3a55" stroke="#9fd3ff" strokeWidth="2" />
          <path d="M16 84 L2 120 L16 108Z M44 84 L58 120 L44 108Z" fill="#e0483a" />
          <rect x="22" y="104" width="16" height="8" fill="#555e69" />
        </svg>
        <div className="flame" />
        <div className="smoke" />
      </div>
      <div className="intro-bottom">
        {stage === 'loading' && <><div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div><div className="pct">{pct}% · {label}</div></>}
        {stage === 'ready' && <><div className="pct">100% · {label}</div><button type="button" className="btn primary" autoFocus onClick={launch}>Launch<small>Click or press Enter (this also enables sound)</small></button></>}
        {stage === 'launch' && <div className="count" aria-live="assertive">{count > 0 ? count : ''}</div>}
      </div>
      <button type="button" className="btn small skip" onClick={finish}>Skip ⏭</button>
    </div>
  );
}
