// Procedural sound (WebAudio): suit breathing + life-support hum, footsteps, tool sounds, alarms.
// No audio files are needed. Everything starts only after the first user gesture.
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; this.volume = 0.8; this.musicVol = 0.5; this.musicMode = 'off'; this.ducked = false; this.alarmKind = null; this.alarmUntil = 0; this.alarmSeen = {}; this.alarmLast = {}; this.stormOn = false; this.lastStep = 0; }

  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.volume; this.master.connect(c.destination);
    this.noiseBuf = this._noise(2);
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicVol; this.musicBus.connect(this.master);
    this._applyMusicMode();
    // breathing: band-limited noise with a slow level LFO
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 520; lp.Q.value = 0.7;
    const g = c.createGain(); g.gain.value = 0.03;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.22; const lg = c.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain);
    n.connect(lp); lp.connect(g); g.connect(this.master); n.start(); lfo.start();
    // low hum (suit pump)
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 58;
    this.hum = c.createGain(); this.hum.gain.value = 0.018; o.connect(this.hum); this.hum.connect(this.master); o.start();
  }


  // ---------------------------------------------------------------- music (procedural, no files)
  setMusicVolume(v) { this.musicVol = Math.max(0, Math.min(1, v)); this._musicGain(); }
  duck(on) { this.ducked = !!on; this._musicGain(); }
  _musicGain() { if (this.musicBus) this.musicBus.gain.setTargetAtTime(this.musicVol * (this.ducked ? 0.3 : 1), this.ctx.currentTime, 0.4); }
  /** 'menu' | 'game' | 'off'. Safe to call before the audio context exists (it starts at the first user gesture). */
  setMusic(mode) { if (mode === this.musicMode) return; this.musicMode = mode; this._applyMusicMode(); }
  _applyMusicMode() {
    if (!this.ctx) return;
    clearInterval(this._musicTimer); this._musicTimer = null;
    if (this.musicMode === 'off') return;
    this._chord = 0; this._nextChord = this.ctx.currentTime + 0.1; this._nextNote = this.ctx.currentTime + 1.5;
    const tick = () => this._musicSchedule();
    tick(); this._musicTimer = setInterval(tick, 400);
  }
  _musicSchedule() {
    const c = this.ctx; if (!c || this.musicMode === 'off') return;
    const menu = this.musicMode === 'menu';
    // slow pad chords (A minor / F / C / G colours for the calm menu, darker D minor / Bb / F / C in missions)
    const prog = menu ? [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 261.6, 329.6], [196, 246.9, 293.7]]
      : [[146.8, 220, 261.6], [116.5, 174.6, 233.1], [130.8, 196, 261.6], [130.8, 196, 246.9]];
    const bar = menu ? 8 : 10;
    while (this._nextChord < c.currentTime + 1.0) {
      const t0 = this._nextChord, chord = prog[this._chord % prog.length];
      chord.forEach((f, i) => this._pad(f * (i === 0 ? 0.5 : 1), t0, bar + 2, menu ? 0.05 : 0.04, i));
      this._chord++; this._nextChord += bar;
    }
    // sparse bell notes
    const scale = menu ? [440, 523.3, 587.3, 659.3, 784, 880] : [293.7, 349.2, 440, 523.3];
    while (this._nextNote < c.currentTime + 1.0) {
      const f = scale[Math.floor(Math.random() * scale.length)];
      this._bell(f, this._nextNote, menu ? 0.05 : 0.03);
      this._nextNote += (menu ? 2.2 : 4.5) + Math.random() * (menu ? 2.5 : 5);
    }
  }
  _pad(freq, t0, dur, vol, i) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'triangle'; o.frequency.value = freq; o2.frequency.value = freq * 1.004;
    lp.type = 'lowpass'; lp.frequency.value = 700 + i * 120; lp.Q.value = 0.4;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.musicBus); o.start(t0); o2.start(t0); o.stop(t0 + dur + 0.1); o2.stop(t0 + dur + 0.1);
  }
  _bell(freq, t0, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2);
    o.connect(g); g.connect(this.musicBus); o.start(t0); o.stop(t0 + 3.3);
  }

  // ---------------------------------------------------------------- alarms (one at a time, never stacked)
  /** active = { storm, oxygen, health }. Plays a 3-beat pattern when a warning STARTS, then a reminder every 25 s while it lasts.
   *  Only the highest-priority active alarm sounds, and a new one waits for the current pattern to finish. Returns the kind that just started, or null. */
  alarms(t, active) {
    if (!this.ctx) return null;
    for (const k of ['storm', 'oxygen', 'health']) { if (!active[k]) this.alarmSeen[k] = false; }
    const kind = ['storm', 'oxygen', 'health'].find((k) => active[k]);
    if (!kind || t < this.alarmUntil) return null;
    const fresh = !this.alarmSeen[kind];
    if (!fresh && t - (this.alarmLast[kind] || 0) < 25) return null;
    this.alarmSeen[kind] = true; this.alarmLast[kind] = t;
    this.alarmUntil = t + 3.2;
    for (let i = 0; i < 3; i++) {
      if (kind === 'storm') { this._tone(740, 0.4, 'square', 0.05, i * 1.0, 520); this._tone(520, 0.4, 'square', 0.05, i * 1.0 + 0.45, 740); }
      else if (kind === 'oxygen') { this._tone(980, 0.12, 'square', 0.07, i * 1.0); this._tone(980, 0.12, 'square', 0.07, i * 1.0 + 0.2); }
      else { this._tone(110, 0.25, 'sine', 0.2, i * 1.0); this._tone(110, 0.25, 'sine', 0.2, i * 1.0 + 0.3); }
    }
    return fresh ? kind : null;
  }

  _noise(seconds) {
    const c = this.ctx, len = c.sampleRate * seconds, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); if (this.master && !this.muted) this.master.gain.value = this.volume; }
  /** Slow critical-oxygen / hazard warning beep. */
  tickCritical(t, on) {
    if (!this.ctx || !on) return;
    if (!this._nextCrit || t >= this._nextCrit) { this._nextCrit = t + 1.0; this._tone(980, 0.12, 'square', 0.07); this._tone(980, 0.12, 'square', 0.07, 0.18); }
  }

  /**
   * Countdown ticking for a timed question. Call every frame with the seconds left and whether a countdown is running.
   * One short tick per second (two per second in the last 5 s). It plays straight to the master bus, so it follows
   * mute and volume but is independent of the music bus. Returns true when a tick was due this call.
   */
  countdown(remaining, on) {
    if (!on || !(remaining > 0)) { this._cdKey = null; return false; }
    const fast = remaining <= 5;
    const key = (fast ? 'f' : 's') + (fast ? Math.ceil(remaining * 2) : Math.ceil(remaining));
    if (key === this._cdKey) return false;
    this._cdKey = key;
    this.ticksDue = (this.ticksDue || 0) + 1;
    if (this.ctx && !this.muted && this.volume > 0) { this.ticksSounded = (this.ticksSounded || 0) + 1; this._tone(fast ? 1500 : 1100, 0.04, 'square', fast ? 0.07 : 0.05); }
    return true;
  }

  _tone(freq, dur, type = 'sine', vol = 0.15, when = 0, slideTo = null) {
    const c = this.ctx; if (!c) return;
    const t0 = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  _burst(dur, freq, vol, q = 1, type = 'lowpass') {
    const c = this.ctx; if (!c) return;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); const t0 = c.currentTime;
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  step(sprinting) {
    const now = performance.now();
    if (now - this.lastStep < (sprinting ? 280 : 420)) return;
    this.lastStep = now;
    this._burst(0.13, 260 + Math.random() * 80, 0.35, 0.8);         // soft regolith crunch
  }
  setStorm(on) { this.stormOn = on; }
  tickAlarm(t) {
    if (!this.ctx || !this.stormOn) return;
    if (!this._nextAlarm || t >= this._nextAlarm) { this._nextAlarm = t + 1.2; this._tone(740, 0.45, 'square', 0.05, 0, 520); this._tone(520, 0.45, 'square', 0.05, 0.5, 740); }
  }
  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'collect': this._tone(660, 0.12, 'triangle', 0.18); this._tone(990, 0.16, 'triangle', 0.15, 0.1); break;
      case 'repair': this._burst(0.5, 3200, 0.3, 2, 'highpass'); this._tone(220, 0.4, 'sawtooth', 0.08, 0, 880); this._tone(880, 0.2, 'triangle', 0.15, 0.45); break;
      case 'power': this._tone(70, 1.2, 'sawtooth', 0.12, 0, 160); this._tone(440, 0.3, 'triangle', 0.15, 0.9); this._tone(660, 0.4, 'triangle', 0.15, 1.1); break;
      case 'inspect': this._tone(880, 0.1, 'sine', 0.14); this._tone(1320, 0.14, 'sine', 0.14, 0.12); break;
      case 'refill': this._burst(0.8, 1800, 0.25, 1, 'bandpass'); break;
      case 'warn': this._tone(520, 0.14, 'square', 0.07); this._tone(520, 0.14, 'square', 0.07, 0.2); break;
      case 'clear': this._tone(523, 0.25, 'triangle', 0.15); this._tone(659, 0.25, 'triangle', 0.15, 0.2); this._tone(784, 0.4, 'triangle', 0.15, 0.4); break;
      case 'success': [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.5, 'triangle', 0.16, i * 0.16)); break;
      case 'fail': this._tone(300, 1.2, 'sawtooth', 0.12, 0, 80); break;
      case 'click': this._tone(900, 0.05, 'square', 0.05); break;
      case 'jump': this._burst(0.12, 500, 0.15, 1); break;
      case 'chime': [784, 1175].forEach((f, i) => this._tone(f, 0.35, 'sine', 0.14, i * 0.12)); break;
      case 'beep': this._tone(880, 0.18, 'square', 0.08); break;
      case 'go': this._tone(1320, 0.5, 'square', 0.1); break;
      case 'launch': this._burst(5.0, 700, 0.5, 0.7); this._tone(45, 4.5, 'sawtooth', 0.14, 0, 110); this._burst(4.0, 2500, 0.12, 0.5, 'highpass'); break;
      case 'open': this._tone(500, 0.08, 'triangle', 0.1); this._tone(750, 0.12, 'triangle', 0.1, 0.07); break;
      case 'send': this._tone(700, 0.06, 'sine', 0.1); this._tone(1000, 0.06, 'sine', 0.08, 0.05); break;
      case 'recv': this._tone(880, 0.07, 'triangle', 0.1); this._tone(660, 0.1, 'triangle', 0.1, 0.07); break;
      case 'talk': this._tone(1200, 0.04, 'sine', 0.07); break;
      case 'robot': this._tone(660, 0.07, 'triangle', 0.12); this._tone(990, 0.09, 'triangle', 0.12, 0.08); break;
      default: break;
    }
  }
}
