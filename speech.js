// Text-to-speech through the browser's built-in speechSynthesis (no network, no key).
// If the browser has no speech support, speak() quietly does nothing and the reply is still shown as text.
export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
let speaking = false;
let chosen = null;
// one consistent voice: pick it once (voices load asynchronously) and always use the same pitch/rate
function pickVoice() {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
  if (!voices.length) return null;
  const en = voices.filter((x) => /^en/i.test(x.lang));
  return en.find((x) => /google uk english female|zira|samantha|aria|jenny/i.test(x.name)) || en.find((x) => /female/i.test(x.name)) || en[0] || voices[0];
}
if (speechSupported() && window.speechSynthesis.addEventListener) window.speechSynthesis.addEventListener('voiceschanged', () => { chosen = pickVoice(); });
export const isSpeaking = () => speaking;
export function stopSpeaking() { if (speechSupported()) { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } } speaking = false; }
export function speak(text, volume = 1, hooks = {}) {
  if (!speechSupported() || !text) return false;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.rate = 1.0; u.pitch = 1.2; u.lang = 'en-US'; u.volume = volume;
    if (!chosen) chosen = pickVoice();
    if (chosen) u.voice = chosen;
    u.onstart = () => { speaking = true; hooks.onstart?.(); };
    u.onend = u.onerror = () => { speaking = false; hooks.onend?.(); };
    synth.speak(u);
    return true;
  } catch { return false; }
}
