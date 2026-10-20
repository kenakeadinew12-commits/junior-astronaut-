import { Engine } from './Engine.js';
const q = new URLSearchParams(location.search);
const el = document.getElementById('root'); el.style.cssText = 'position:fixed;inset:0';
window.__lunar = new Engine(el, { onSnapshot() {}, quality: q.has('quality') ? +q.get('quality') : 0.5, pixelScale: q.has('scale') ? +q.get('scale') : 0.5, shadows: false, noAA: true });

const st = document.createElement('style'); st.textContent = '#game-canvas{width:100%;height:100%;display:block}'; document.head.appendChild(st);
