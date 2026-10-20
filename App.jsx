import { useEffect, useRef, useState } from 'react';
import { Engine } from './Engine.js';
import Hud from './Hud.jsx';
import TouchControls from './TouchControls.jsx';
import { Title, Briefing, Pause } from './Screens.jsx';
import { Decision } from './Event.jsx';
import { Console } from './Console.jsx';
import { EndReport } from './EndReport.jsx';
import Intro from './Intro.jsx';
import { CommsPanel } from './Comms.jsx';

export default function App() {
  const mount = useRef(null);
  const engineRef = useRef(null);
  const [snap, setSnap] = useState(null);
  const [error, setError] = useState(null);
  const [intro, setIntro] = useState(() => !new URLSearchParams(window.location.search).has('nointro'));
  const [view, setView] = useState('main');   // title sub-screen: 'main' | 'levels' | 'crew'

  useEffect(() => {
    let engine;
    try {
      const q = new URLSearchParams(window.location.search);
      engine = new Engine(mount.current, {
        onSnapshot: setSnap,
        quality: q.has('quality') ? Number(q.get('quality')) : undefined,
        pixelScale: q.has('scale') ? Number(q.get('scale')) : undefined,
        shadows: q.has('noshadow') ? false : undefined,
        noAA: q.has('noaa'),
      });
      engineRef.current = engine;
      if (q.has('debug')) window.__lunar = engine;
    } catch (e) {
      console.error(e);
      setError(String(e && e.message ? e.message : e));
    }
    return () => engine && engine.dispose();
  }, []);

  const e = engineRef.current;
  const phase = snap?.phase;
  const inGame = phase === 'playing' || phase === 'paused' || phase === 'console' || phase === 'decision' || phase === 'comms';
  const planet = phase === 'title' || !snap ? 'moon' : snap.level.planet;
  const goLevels = () => setView('levels'), goMenu = () => setView('main');

  return (
    <div className="app" data-phase={phase || 'loading'} data-planet={planet}>
      <div ref={mount} className="stage" />
      {error && (
        <div className="screen center">
          <div className="panel">
            <h1>3D graphics unavailable</h1>
            <p>This game needs WebGL. Please use a current version of Chrome, Edge, Safari or Firefox with hardware acceleration enabled.</p>
            <p className="muted">{error}</p>
          </div>
        </div>
      )}
      {intro && !error && <Intro engine={e} frames={snap?.frames || 0} ready={!!snap} onDone={() => setIntro(false)} />}
      {snap && e && !intro && (
        <>
          {inGame && <Hud snap={snap} engine={e} />}
          {snap.isTouch && phase === 'playing' && <TouchControls engine={e} />}
          {phase === 'title' && <Title snap={snap} engine={e} view={view} setView={setView} />}
          {phase === 'briefing' && <Briefing key={snap.level.id} snap={snap} engine={e} goLevels={goLevels} />}
          {phase === 'paused' && <Pause snap={snap} engine={e} goMenu={goMenu} />}
          {phase === 'comms' && <CommsPanel snap={snap} engine={e} />}
          {phase === 'console' && <Console snap={snap} engine={e} />}
          {phase === 'decision' && snap.event && <Decision snap={snap} engine={e} />}
          {(phase === 'success' || phase === 'failure') && <EndReport snap={snap} engine={e} goLevels={goLevels} goMenu={goMenu} />}
        </>
      )}
    </div>
  );
}
