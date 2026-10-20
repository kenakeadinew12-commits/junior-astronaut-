import { RES_NAMES, DIFF } from './core.js';

/** Static helpers + tiny shared components for the React UI. No engine access here. */

export const PLANET_ACCENT = { moon: 'Moon', mars: 'Mars' };
export const DIFF_LIST = [DIFF.easy, DIFF.normal, DIFF.hard];
export const DIFF_TEXT = {
  easy: 'More starting supplies (+25%), gentler emergencies, 40% more time to answer, 30% longer mission clock.',
  normal: 'The standard mission: balanced supplies, emergency severity and decision time.',
  hard: 'Fewer supplies (-20%), 30% harsher emergencies, faster resource drain, 30% less decision time, 15% shorter clock.',
};
export const ROLE_ORDER = ['engineer', 'medic', 'botanist', 'geologist', 'commander'];

export const CONTROLS = [
  ['W A S D', 'Move'], ['Shift', 'Sprint'], ['Space', 'Jump'], ['Mouse', 'Look (click to capture)'],
  ['E', 'Interact (hold for repairs)'], ['1 / 2 / 3', 'Wrench / scanner / sampler'], ['Tab', 'Crew panel'], ['C', 'Mission Control comms (4 questions)'],
  ['P / Esc', 'Pause'], ['M', 'Mute'], ['F', 'Fullscreen'],
];

export const clamp01 = (v) => Math.max(0, Math.min(100, v));
export const fmtTime = (sec) => { const s = Math.max(0, Math.floor(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const fmtNum = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '-');
export const fmtRad = (v) => (v < 1 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString('en-US'));
export const tone = (v) => (v < 25 ? 'bad' : v < 50 ? 'warn' : 'ok');
export const trendOf = (rate, eps = 0.004) => (rate > eps ? 'up' : rate < -eps ? 'down' : 'flat');
export const TREND_CH = { up: '▲', down: '▼', flat: '■' };
export const ZONE_LABEL = { outside: 'Outside', habitat: 'Habitat', shelter: 'Shelter' };
export const zoneLabel = (z) => ZONE_LABEL[z] || (z ? String(z).replace(/^./, (c) => c.toUpperCase()) : '-');

export function Kbd({ children }) { return <kbd>{children}</kbd>; }

export function ControlsList({ compact = false }) {
  return (
    <div className={`controls ${compact ? 'compact' : ''}`}>
      {CONTROLS.map(([k, t]) => <div key={k}><kbd>{k}</kbd><span>{t}</span></div>)}
    </div>
  );
}

/** Horizontal progress bar with proper ARIA. */
export function Meter({ value, label, tone: t = 'ok', max = 100 }) {
  const v = Math.max(0, Math.min(max, value));
  return (
    <span className={`meter ${t}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(v)}>
      <i style={{ width: `${(v / max) * 100}%` }} />
    </span>
  );
}

export function Stars({ n = 0, size = 'md' }) {
  return (
    <span className={`stars ${size}`} role="img" aria-label={`${n} of 3 stars`}>
      {[1, 2, 3].map((i) => <span key={i} className={i <= n ? 'on' : ''} aria-hidden="true">★</span>)}
    </span>
  );
}

export function PlanetBadge({ planet }) {
  return <span className={`planet-badge ${planet}`}>{planet === 'mars' ? 'MARS' : 'MOON'}</span>;
}

export function DiffBadge({ id, label }) {
  const l = label || DIFF[id]?.label || id;
  return <span className={`diff-badge ${String(id || l).toLowerCase()}`}>{l}</span>;
}

export function GradeChip({ grade, large }) {
  const labels = { perfect: 'Perfect', good: 'Good', acceptable: 'Acceptable', wrong: 'Wrong' };
  return <span className={`grade ${grade} ${large ? 'large' : ''}`}>{labels[grade] || grade}</span>;
}

export const resName = (k) => RES_NAMES[k] || k;

/** Starting resource list for a level (static data merged with difficulty multiplier shown in the briefing). */
export const START_ROWS = [
  ['oxygen', 'Suit oxygen', '%'], ['o2res', 'Habitat oxygen', '%'], ['water', 'Water', '%'], ['food', 'Food', '%'], ['battery', 'Energy', '%'], ['materials', 'Materials', ''],
];

export function Rank({ rank }) {
  const n = Math.max(1, Math.min(5, Math.round(rank || 1)));
  return <span className="rank" role="img" aria-label={`Difficulty ${n} of 5`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}</span>;
}
