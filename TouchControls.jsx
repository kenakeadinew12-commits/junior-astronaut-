import { useRef } from 'react';

// On-screen controls for phones/tablets (landscape): left stick = move, right side drag = look.
export default function TouchControls({ engine }) {
  const stick = useRef({ id: null, cx: 0, cy: 0 });
  const look = useRef({ id: null, x: 0, y: 0 });
  const knob = useRef(null);
  const t = engine.touch;

  const stickDown = (e) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    stick.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    e.currentTarget.setPointerCapture(e.pointerId);
    stickMove(e);
  };
  const stickMove = (e) => {
    if (stick.current.id !== e.pointerId) return;
    const dx = e.clientX - stick.current.cx, dy = e.clientY - stick.current.cy, max = 55;
    const len = Math.hypot(dx, dy) || 1, k = Math.min(1, len / max);
    t.moveX = (dx / len) * k; t.moveY = (dy / len) * k;
    if (knob.current) knob.current.style.transform = `translate(${t.moveX * 40}px, ${t.moveY * 40}px)`;
  };
  const stickUp = (e) => {
    if (stick.current.id !== e.pointerId) return;
    stick.current.id = null; t.moveX = t.moveY = 0;
    if (knob.current) knob.current.style.transform = 'translate(0,0)';
  };
  const lookDown = (e) => { look.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); };
  const lookMove = (e) => {
    if (look.current.id !== e.pointerId) return;
    t.lookDX += e.clientX - look.current.x; t.lookDY += e.clientY - look.current.y;
    look.current.x = e.clientX; look.current.y = e.clientY;
  };
  const lookUp = (e) => { if (look.current.id === e.pointerId) look.current.id = null; };
  const hold = (key) => ({
    onPointerDown: (e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); t[key] = true; },
    onPointerUp: () => { t[key] = false; },
    onPointerCancel: () => { t[key] = false; },
  });

  return (
    <div className="touch">
      <div className="look-pad" onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookUp} onPointerCancel={lookUp} />
      <div className="stick" onPointerDown={stickDown} onPointerMove={stickMove} onPointerUp={stickUp} onPointerCancel={stickUp}>
        <div className="knob" ref={knob} />
      </div>
      <button type="button" className="tbtn use" {...hold('interact')}>USE</button>
      <button type="button" className="tbtn jump" {...hold('jump')}>JUMP</button>
      <button type="button" className="tbtn run" {...hold('sprint')}>RUN</button>
    </div>
  );
}
