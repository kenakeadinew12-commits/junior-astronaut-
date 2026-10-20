// Player profile + campaign progress, saved in localStorage (safe if storage is unavailable).
import { TEAMMATES } from './core.js';
const KEY = 'junior-astronaut-3d-v2';
export const DEFAULT_PROFILE = { name: 'Cadet Nova', role: 'engineer', weight: 68, height: 172, mate: 'okafor', difficulty: 'normal' };
export const LIMITS = { weight: [40, 120], height: [140, 205] };
export const emptyProgress = () => ({ unlocked: 1, stars: {}, best: {}, completed: {} });

export function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) return { profile: { ...DEFAULT_PROFILE, ...raw.profile }, progress: { ...emptyProgress(), ...raw.progress } };
  } catch { /* storage unavailable */ }
  return { profile: { ...DEFAULT_PROFILE }, progress: emptyProgress() };
}
export function saveGame(profile, progress) {
  try { localStorage.setItem(KEY, JSON.stringify({ profile, progress })); } catch { /* ignore */ }
}
export function sanitizeProfile(p) {
  const num = (v, [a, b], d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
  return {
    name: String(p.name || DEFAULT_PROFILE.name).replace(/[<>]/g, '').slice(0, 20) || DEFAULT_PROFILE.name,
    role: ['engineer', 'medic', 'botanist', 'geologist', 'commander'].includes(p.role) ? p.role : 'engineer',
    weight: num(p.weight, LIMITS.weight, 68), height: num(p.height, LIMITS.height, 172),
    mate: TEAMMATES.some((t) => t.id === p.mate) ? p.mate : 'okafor',
    difficulty: ['easy', 'normal', 'hard'].includes(p.difficulty) ? p.difficulty : 'normal',
  };
}
/** Record a finished level: unlock the next one (only on success), keep best score/stars. */
export function recordResult(progress, levelId, end, maxLevel = 7) {
  const p = { ...progress, stars: { ...progress.stars }, best: { ...progress.best }, completed: { ...progress.completed } };
  if (end.success) {
    p.completed[levelId] = true;
    p.stars[levelId] = Math.max(p.stars[levelId] || 0, end.stars);
    p.best[levelId] = Math.max(p.best[levelId] || 0, end.score);
    p.unlocked = Math.max(p.unlocked, Math.min(maxLevel, levelId + 1));
  }
  return p;
}
