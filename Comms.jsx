import { useEffect, useRef } from 'react';

/** Mission Control comms panel: three fictional contacts, four predefined questions per level, no free-text input. */
export function CommsPanel({ snap, engine }) {
  const c = snap.comms;
  const logEnd = useRef(null);
  useEffect(() => { logEnd.current?.scrollIntoView?.({ block: 'end' }); }, [c?.log?.length]);
  if (!c) return null;
  const sel = c.contacts.find((x) => x.id === c.selected) || null;
  const log = c.log.filter((m) => m.level === snap.level.id);
  return (
    <div className="screen chat" role="dialog" aria-label="Mission Control communications">
      <div className="chat-panel comms">
        <header><strong>📡 Mission Control · simulated</strong><span className="muted">Level {snap.level.id} · game is paused</span>
          <button type="button" className="btn small" onClick={() => engine.closeComms()}>Close (Esc)</button></header>
        <div className="contacts" role="radiogroup" aria-label="Choose a contact">
          {c.contacts.map((ct) => (
            <button key={ct.id} type="button" role="radio" aria-checked={sel?.id === ct.id} className={`opt contact ${sel?.id === ct.id ? 'on' : ''}`} onClick={() => engine.selectContact(ct.id)}>
              <span className="oicon" aria-hidden="true">{ct.icon}</span><b>{ct.name}</b><small>{ct.role}</small>
            </button>
          ))}
        </div>
        {sel ? <p className="muted tiny"><b>{sel.name}</b> · {sel.role}. {sel.style} {sel.bio}</p> : <p className="muted tiny">Pick one of the three contacts, then choose a question.</p>}
        <div className="quick" aria-label="Questions">
          {c.questions.map((q) => (
            <button key={q.index} type="button" className="btn small" disabled={!sel} onClick={() => engine.askContact(sel.id, q.index)}>{q.text}</button>
          ))}
        </div>
        <div className="chat-log" aria-live="polite">
          {log.map((m, i) => <p key={i} className={m.from === 'you' ? 'you' : 'aria'}><b>{m.from === 'you' ? 'You' : m.name}:</b> {m.text}</p>)}
          <div ref={logEnd} />
        </div>
        <p className="muted tiny">{c.disclaimer} {snap.speech ? (snap.voice && !snap.muted ? 'Replies are spoken aloud.' : 'Voice is off or muted: replies show as text.') : 'This browser has no speech output: replies show as text.'}</p>
      </div>
    </div>
  );
}
