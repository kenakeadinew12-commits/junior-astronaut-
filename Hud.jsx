import { useEffect, useState } from 'react';
import { ROLES } from './core.js';
import { Meter, tone, trendOf, TREND_CH, fmtTime, fmtRad, fmtNum, zoneLabel } from './common.jsx';

function Compass({ compass }) {
  if (!compass) return null;
  const d = compass.delta, half = Math.PI / 2;
  const off = d > half ? 'left' : d < -half ? 'right' : '';
  const x = Math.max(-1, Math.min(1, d / half)) * -50;   // target left of centre => pin left of centre
  return (
    <div className="compass" aria-label={`Next target: ${compass.label}, ${Math.round(compass.dist)} metres`}>
      <div className="compass-track">
        <span className="tick" style={{ left: '0%' }} /><span className="tick" style={{ left: '25%' }} /><span className="tick c" style={{ left: '50%' }} /><span className="tick" style={{ left: '75%' }} /><span className="tick" style={{ left: '100%' }} />
        <span className={`pin ${off}`} style={{ left: `${50 - x}%` }}>◆</span>
      </div>
      <span className="compass-label">{compass.label} · {Math.round(compass.dist)} m</span>
    </div>
  );
}

function Vital({ label, value, rate, extra }) {
  const t = tone(value);
  const tr = rate === undefined ? null : trendOf(rate);
  return (
    <div className={`vital ${t} ${value < 25 ? 'crit' : ''}`}>
      <span className="vital-label">{label}</span>
      <Meter value={value} label={label} tone={t} />
      <span className="vital-num">{Math.round(value)}</span>
      <span className={`trend ${extra?.dir || tr || 'flat'}`} aria-hidden="true">{extra?.txt ?? (tr && tr !== 'flat' ? TREND_CH[tr] : '')}</span>
    </div>
  );
}

function radTone(r, storm) { return storm || r > 200 ? 'bad' : r > 80 ? 'warn' : ''; }

function CrewPanel({ snap }) {
  const rows = [
    { who: 'You', n: snap.me.name, role: snap.me.role, health: snap.health, zone: snap.zone, task: 'Exploring and repairing', mass: snap.me.weight, wn: snap.me.weightHere.newtons, h: snap.me.height },
  ];
  return (
    <div className="crewpanel" role="region" aria-label="Crew panel">
      <div className="hud-title">CREW · press Tab to close</div>
      {rows.map((r) => (
        <div className="crewrow" key={r.who}>
          <b>{ROLES[r.role]?.icon} {r.n}</b> <span className="muted">({ROLES[r.role]?.name})</span>
          <div className="vital"><span className="vital-label">HP</span><Meter value={r.health} label={`${r.n} health`} tone={tone(r.health)} /><span className="vital-num">{Math.round(r.health)}</span></div>
          <div className="muted">Location: {zoneLabel(r.zone)} · Task: {r.task}</div>
          <div className="muted">Mass {r.mass} kg · weight here {fmtNum(r.wn, 0)} N · height {r.h} cm</div>
        </div>
      ))}
    </div>
  );
}

export default function Hud({ snap, engine }) {
  const s = snap;
  const [crew, setCrew] = useState(false);
  const live = s.phase === 'playing';
  const debug = typeof window !== 'undefined' && window.location.search.includes('debug');

  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Tab') return;
      if (s.phase === 'playing') { e.preventDefault(); if (!e.repeat) setCrew((c) => !c); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.phase]);

  const hz = s.hazard && s.hazard.state === 'active' ? s.hazard : null;
  const storm = hz?.type === 'storm', dust = hz?.type === 'dust';
  const p = s.prompt;
  const net = s.power.net;
  const netDir = net > 0.05 ? 'up' : net < -0.05 ? 'down' : 'flat';
  const sunPct = Math.round((s.sun || 0) * 100);
  const rr = radTone(s.radRate, storm);
  const O = s.objectives;

  return (
    <div className="hud">
      <div className="visor" />
      {storm && <div className="storm-vignette" />}
      {s.oxygen < 20 && <div className="lowo2" />}
      <div className="hurt" style={{ opacity: Math.min(0.8, s.hurt || 0) }} />
      {s.fade > 0 && <div className="fade" style={{ opacity: s.fade }} />}

      <div className="hud-top-left">
        <div className="hud-level"><span className={`lvl-chip ${s.level.planet}`}>L{s.level.id}</span> {s.level.name}</div>
        <div className="hud-clock">{fmtTime(s.time)} <span className="muted">/ {fmtTime(s.limit)}</span></div>
        <ul className="objectives" aria-label="Objectives">
          {O.map((o) => (
            <li key={o.id} className={o.done ? 'done' : ''}>
              <span className="box" aria-hidden="true">{o.done ? '✓' : ''}</span>
              <span className="otext">{o.text}{o.optional && <em className="opt"> (optional)</em>}</span>
              <span className="oprog">{o.progress}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="hud-top-center">
        {live && <Compass compass={s.compass} />}
        {hz && (
          <div className={`hazard ${storm ? 'storm' : 'dust'}`} role="alert">
            {storm ? `SOLAR STORM — take cover! ${fmtTime(Math.ceil(hz.remaining))}` : `DUST STORM — power is low ${fmtTime(Math.ceil(hz.remaining))}`}
          </div>
        )}
        <div className="toasts" aria-live="polite">
          {s.toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`} style={{ opacity: Math.min(1, t.ttl ?? 1) }}>
              {t.title && <b>{t.title}</b>}
              <span>{t.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="hud-top-right">
        <div className="hud-buttons">
          <button type="button" onClick={() => engine.toggleFullscreen()} title="Fullscreen (F)" aria-label="Toggle fullscreen">⛶</button>
          <button type="button" onClick={() => engine.setMuted(!s.muted)} title="Sound (M)" aria-label={s.muted ? 'Unmute' : 'Mute'}>{s.muted ? '🔇' : '🔊'}</button>
          <button type="button" onClick={() => setCrew((c) => !c)} title="Crew (Tab)" aria-label="Toggle crew panel">👥</button>
          {live && <button type="button" onClick={() => engine.pause()} title="Pause (P)" aria-label="Pause">⏸</button>}
        </div>
        <div className="chips">
          <span className={`chip zone ${s.zone}`}>{zoneLabel(s.zone)}</span>
          <span className="chip" title="Habitat temperature">🌡 {Math.round(s.temp)}°C</span>
          <span className={`chip ${rr} ${storm ? 'pulse' : ''}`} title="Radiation dose rate">☢ {fmtRad(s.radRate)} µSv/h</span>
          <span className="chip" title="Sunlight">☀ {sunPct}%</span>
          <span className="chip" title="Gravity">g {s.me.gravity}</span>
          {s.co2 > 40 && <span className={`chip ${s.co2 > 60 ? 'bad' : 'warn'}`} title="Cabin CO₂ index (danger above 70)">CO₂ {Math.round(s.co2)}</span>}
          {s.status.comm_down && <span className="chip warn">NO COMMS</span>}
          {debug && <span className="chip">{s.fps} fps</span>}
        </div>
      </div>

      <div className="hud-bottom-left" aria-label="Vitals">
        <Vital label="Health" value={s.health} />
        <Vital label="Suit O₂" value={s.oxygen} rate={s.rate.oxygen} />
        <Vital label="Hab O₂" value={s.o2res} rate={s.rate.o2res} />
        <Vital label="Water" value={s.res.water} rate={s.rate.water} />
        <Vital label="Food" value={s.res.food} rate={s.rate.food} />
        <Vital label="Energy" value={s.res.battery} extra={{ dir: netDir, txt: `${TREND_CH[netDir]} ${net >= 0 ? '+' : ''}${net.toFixed(1)}kW` }} />
        <div className="stats"><span>⛏ Materials <b>{Math.round(s.res.materials)}</b></span>{s.power.blackout && <span className="bad">BLACKOUT</span>}{!s.power.on && <span className="bad">POWER OFF</span>}</div>
      </div>

      <div className="hud-bottom-right">
        {crew && <CrewPanel snap={s} />}
        <button type="button" className="btn small comms-btn" onClick={() => engine.openComms()} aria-label="Open Mission Control communications">📡 C · Mission Control</button>
      </div>

      {live && <div className={`crosshair ${p ? (p.enabled ? 'hot' : 'cold') : ''}`}><i /></div>}
      {live && p && (
        <div className={`prompt ${p.enabled ? '' : 'disabled'} ${p.info ? 'info' : ''}`}>
          {!p.info && <span className="key">{engine.isTouch ? 'USE' : 'E'}</span>}
          <span className="ptext">{p.text}{p.hold > 0 && p.enabled ? (engine.isTouch ? ' (hold)' : ' (hold E)') : ''}</span>
          {p.enabled && p.hold > 0 && <span className="pbar" role="progressbar" aria-label="Task progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((p.progress || 0) * 100)}><i style={{ width: `${(p.progress || 0) * 100}%` }} /></span>}
          {p.enabled && p.continuous && (p.progress || 0) > 0 && <span className="pct" aria-live="off">Refilling… {Math.round((p.progress || 0) * 100)}%</span>}
          {!p.enabled && p.reason && <span className="preason">{p.reason}</span>}
        </div>
      )}

      {s.crisis && (
        <div className={`crisis stage${s.crisis.stage}`} role="alert" aria-label={`Emergency: ${s.crisis.name}`}>
          <div className="chead"><span aria-hidden="true">{s.crisis.icon}</span> <b>EMERGENCY · {s.crisis.name}</b> <span className="cstage">Stage {s.crisis.stage}/{s.crisis.stages}</span></div>
          <div className="ctext">{s.crisis.text}</div>
          <div className="ctask">▶ {s.crisis.task}</div>
          <div className="cbar" role="progressbar" aria-label="Time before the emergency becomes fatal" aria-valuemin={0} aria-valuemax={Math.round(s.crisis.total)} aria-valuenow={Math.round(s.crisis.left)}><i style={{ width: `${(s.crisis.left / s.crisis.total) * 100}%` }} /><span>{Math.ceil(s.crisis.left)} s until mission failure</span></div>
        </div>
      )}

      <div className="radio" aria-live="polite">
        {s.radio.map((r) => (
          <div key={r.id} className={`rline ${r.who}`}>
            <span className="avatar" aria-hidden="true">🛰</span>
            <span><b>{r.name}</b> <span className="rtext">{r.text}</span></span>
          </div>
        ))}
      </div>

      {live && !s.isTouch && !s.locked && <div className="lockhint">Click the game to capture the mouse · or drag to look</div>}
    </div>
  );
}
