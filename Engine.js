// The 3D game engine: Three.js renderer, first-person controller, collision, interaction targeting,
// visual feedback for mission state, and the bridge to the React HUD (via snapshots).
import * as THREE from 'three';
import { buildWorld } from './world3d.js';
import { Viewmodel } from './hands.js';
import { speak, stopSpeaking, speechSupported, isSpeaking } from './speech.js';
import { contactsView, answerFor } from './contacts.js';
import { Sfx } from './audio.js';
import {
  createGame, createMission, step, interact, describeTarget, isActive, objectives, nextTarget, bearingTo, powerStatus,
  tickDecision, chooseOption, continueAfterDecision, eventView, consoleView, closeConsole, toggleSystem, toggleRation, deploy,
  toast, LEVEL_LIST, MAX_LEVEL, REFILL_STATION_BELOW, refillStep, refillEnd, crisisView,
} from './state.js';
import { loadSave, saveGame, sanitizeProfile, recordResult } from './profile.js';
import { weightOn } from './core.js';
import { interactables, roomAt, rooms, resolveCollisions, SUN_DIR } from './world.js';
import { heightAt, WORLD_RADIUS } from './terrain.js';
import { clamp, lerp } from './math.js';

const RADIUS = 0.45, WALK = 3.4, SPRINT = 6.2, JUMP = 2.8, FOV = 72;
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'ShiftLeft', 'ShiftRight']);
const WARN_TEXT = { storm: 'Warning. Radiation storm. Take cover.', oxygen: 'Warning. Suit oxygen critical.', health: 'Warning. Health critical.' };
const EVENT_SOUND = { objective: 'chime', collect: 'collect', repair: 'repair', power: 'power', inspect: 'inspect', refill: 'refill', warn: 'warn', clear: 'clear' };

export class Engine {
  constructor(container, opts = {}) {
    this.container = container;
    this.onSnapshot = opts.onSnapshot || (() => {});
    this.isTouch = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints || 0) > 0;
    this.quality = opts.quality ?? (this.isTouch ? 0.55 : 1);
    this.shadows = opts.shadows ?? !this.isTouch;
    this.sfx = new Sfx();
    this.frames = 0;                                    // rendered frames (the loading screen uses it as real warm-up progress)
    this.comms = { contact: null, log: [] };            // Mission Control panel: selected contact + conversation log (fictional, simulated)
    this.voice = true;
    try {
      const st = JSON.parse(localStorage.getItem('lunar_settings') || '{}');
      if (typeof st.volume === 'number') this.sfx.setVolume(st.volume);
      if (typeof st.musicVol === 'number') this.sfx.musicVol = Math.max(0, Math.min(1, st.musicVol));
      if (typeof st.muted === 'boolean') this.sfx.muted = st.muted;
      if (typeof st.voice === 'boolean') this.voice = st.voice;
    } catch { /* settings are optional */ }
    this._off = [];

    // renderer ---------------------------------------------------------------
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.isTouch && !opts.noAA, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isTouch ? 1.5 : 2) * (opts.pixelScale ?? 1));
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.autoClear = false;
    if (this.shadows) { this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game-canvas';
    container.appendChild(this.canvas);

    // scene ------------------------------------------------------------------
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 7000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.sun = new THREE.DirectionalLight(0xfff2e0, 3.4);
    this.sun.castShadow = this.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 1; sc.far = 320;
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x7f8fb0, 0x2a2420, 0.55);
    this.scene.add(this.hemi);

    this.world = null;
    this._buildPlanet('moon');

    // sparks / scan particles shown at the object being worked on
    this.sparkN = 48;
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.sparkN * 3), 3));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.sparkN * 3).fill(1), 3));
    this.sparks = new THREE.Points(this.sparkGeo, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true }));
    this.sparks.frustumCulled = false; this.sparks.visible = false;
    this.scene.add(this.sparks);

    this.viewmodel = new Viewmodel();

    // state ------------------------------------------------------------------
    this.save = loadSave();
    this.game = createGame();
    this.gravity = 1.62; this.eye = 1.7; this.speedMul = 1;
    this.keys = new Set();
    this.mdx = 0; this.mdy = 0; this.dragging = false;
    this.touch = { moveX: 0, moveY: 0, lookDX: 0, lookDY: 0, interact: false, jump: false, sprint: false };
    this.eWasDown = false; this.eLatch = false; this.eTap = false; this.jumpWas = false;
    this.hold = null; this.target = null; this.prompt = null;
    this.bob = 0; this.moving = false;
    this.clock = 0; this.acc = 0; this.snapT = 0; this.last = performance.now();
    this.stormMix = 0; this.dustMix = 0; this.fade = 0; this.expectUnlock = false; this.warnedBoundary = 0;
    this.fps = 60; this._fpsAcc = 0; this._fpsN = 0;

    this._bind();
    this._resize();
    this._frame = this._frame.bind(this);
    this.raf = requestAnimationFrame(this._frame);
  }

  // ------------------------------------------------------------- public API
  get phase() { return this.game.phase; }
  get interactableList() { return interactables; } // debug/test hook
  get locked() { return document.pointerLockElement === this.canvas; }

  /** (Re)build the 3D world for a planet. Must be called AFTER createMission (it reconfigures terrain/colliders). */
  _buildPlanet(planet, force = false) {
    if (this.world && this.world.planet === planet && !force) return;
    if (this.world) { this.scene.remove(this.world.root, this.world.sky); this.world.dispose?.(); }
    this.world = buildWorld(this.quality, planet);
    this.scene.add(this.world.root, this.world.sky);
    const e = this.world.env || {};
    this.envBase = { sunI: e.sunIntensity ?? 3.4, hemiI: e.hemiIntensity ?? 0.55, sunColor: e.sunColor ?? 0xfff2e0, hemiSky: e.hemiSky ?? 0x7f8fb0, hemiGround: e.hemiGround ?? 0x2a2420 };
    this.hemi.color.setHex(this.envBase.hemiSky); this.hemi.groundColor.setHex(this.envBase.hemiGround);
    this.sun.color.setHex(this.envBase.sunColor);
  }
  _applyMission(g) {
    this.game = g;
    this._buildPlanet(g.planet);
    this.gravity = g.env.gravity;
    this.eye = clamp(g.profile.height * 0.0099, 1.4, 2.0);
    this.speedMul = g.planet === 'mars' ? 0.92 : 1;
    this.hold = null; this.target = null; this.prompt = null; this.stormMix = 0; this.dustMix = 0; this.bob = 0;
    this.sfx.setStorm(false);
  }
  get profile() { return this.save.profile; }
  get progress() { return this.save.progress; }
  setProfile(p) { this.save.profile = sanitizeProfile({ ...this.save.profile, ...p }); saveGame(this.save.profile, this.save.progress); this._emit(true); return this.save.profile; }
  /** Open the briefing for a level (must be unlocked). */
  startLevel(levelId, difficulty) {
    const id = Math.min(MAX_LEVEL, Math.max(1, levelId | 0));
    if (id > this.save.progress.unlocked) return false;
    saveGame(this.save.profile, this.save.progress);
    this.comms = { contact: null, log: [] };
    this._applyMission(createMission(id, this.save.profile, 'normal', 'briefing'));   // one difficulty: it rises with the level number
    this._emit(true);
    return true;
  }
  newMission() { return this.startLevel(this.game.level.id); }
  begin() {
    const g = this.game;
    if (g.phase !== 'briefing') return;
    g.phase = 'playing';
    this.fade = 1;
    this.sfx.start(); this.sfx.play('click');
    this.requestLock();
    toast(g, g.level.tips?.[0] || 'Complete the objectives on the left.', 'info', `Mission ${g.level.id}: ${g.level.name}`, 8);
    this._emit(true);
  }
  restart() { if (this.startLevel(this.game.level.id)) this.begin(); }
  nextLevel() { const n = this.game.level.id + 1; if (n <= MAX_LEVEL && this.startLevel(n)) this.begin(); }
  toTitle() { this.exitLock(); this._applyMission(createGame()); this._emit(true); }
  pause() {
    if (this.game.phase !== 'playing') return;
    this.game.phase = 'paused';
    this.exitLock();
    this._emit(true);
  }
  resume() {
    if (this.game.phase !== 'paused') return;
    this.game.phase = 'playing';
    this.sfx.start();
    this.requestLock();
    this._emit(true);
  }
  chooseEventOption(choiceId) { chooseOption(this.game, choiceId); this.sfx.play('click'); this._emit(true); }
  continueEvent() {
    continueAfterDecision(this.game);
    this.requestLock();
    this._emit(true);
  }
  closeConsole() { closeConsole(this.game); this.requestLock(); this._emit(true); }
  consoleToggle(k) { toggleSystem(this.game, k); this.sfx.play('click'); this._emit(true); }
  consoleRation() { toggleRation(this.game); this.sfx.play('click'); this._emit(true); }
  consoleDeploy(id) { const r = deploy(this.game, id); this.sfx.play(r.ok ? 'repair' : 'warn'); this._emit(true); return r; }
  requestLock() {
    if (this.isTouch || !this.canvas.requestPointerLock) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* lock is optional: drag-to-look still works */ }
  }
  exitLock() {
    if (this.locked) { this.expectUnlock = true; try { document.exitPointerLock(); } catch { /* ignore */ } }
  }
  toggleFullscreen() {
    const d = document, el = d.documentElement;
    const inFs = d.fullscreenElement || d.webkitFullscreenElement;
    if (inFs) { (d.exitFullscreen || d.webkitExitFullscreen)?.call(d); return; }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    const p = req.call(el);
    const lockOrient = () => { try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* optional */ } };
    if (p && p.then) p.then(lockOrient).catch(() => {}); else lockOrient();
  }
  _saveSettings() { try { localStorage.setItem('lunar_settings', JSON.stringify({ volume: this.sfx.volume, musicVol: this.sfx.musicVol, muted: this.sfx.muted, voice: this.voice })); } catch { /* optional */ } }
  setMuted(m) { this.sfx.setMuted(m); if (m) stopSpeaking(); this._saveSettings(); this._emit(true); }
  setMusicVolume(v) { this.sfx.setMusicVolume(v); this._saveSettings(); this._emit(true); }
  setVolume(v) { this.sfx.setVolume(v); this._saveSettings(); this._emit(true); }
  setVoice(on) { this.voice = !!on; if (!on) stopSpeaking(); this._saveSettings(); this._emit(true); }
  /** Play a UI sound (menus, intro). Starts audio on the first call, which is always inside a user gesture. */
  uiSound(name) { this.sfx.start(); this.sfx.play(name); }
  // ---- Mission Control contacts panel (fictional, simulated; the sim is paused while it is open, like the console) ----
  openComms() {
    const g = this.game;
    if (g.phase !== 'playing') return;
    g.phase = 'comms'; this.exitLock(); this.keys.clear(); this.sfx.start(); this.sfx.play('open');
    this._emit(true);
  }
  closeComms() { if (this.game.phase !== 'comms') return; this.game.phase = 'playing'; stopSpeaking(); this.requestLock(); this._emit(true); }
  selectContact(id) { this.comms.contact = id; this.sfx.play('click'); this._emit(true); }
  /** Ask one of the four predefined questions of this level to one of the three contacts. */
  askContact(contactId, qIndex) {
    const g = this.game;
    if (g.phase !== 'comms') return;
    const ans = answerFor(g.level.id, contactId, qIndex);
    if (!ans) return;
    this.comms.contact = contactId;
    this.comms.log.push({ from: 'you', text: ans.question, level: g.level.id });
    this.sfx.play('send');
    this.comms.log.push({ from: contactId, name: ans.contact.name, text: ans.text, level: g.level.id });
    if (this.comms.log.length > 24) this.comms.log.splice(0, this.comms.log.length - 24);
    this.sfx.play('recv');
    if (this.voice && !this.sfx.muted) {
      const hooks = { onstart: () => { this.sfx.play('talk'); this.sfx.duck(true); }, onend: () => this.sfx.duck(false) };
      speak(ans.text, this.sfx.volume, hooks);          // speak() cancels earlier speech first, so replies never overlap
    }
    this._emit(true);
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this._off.forEach((f) => f());
    this.renderer.dispose();
    this.canvas.remove();
  }

  // ------------------------------------------------------------- input
  _bind() {
    const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); this._off.push(() => t.removeEventListener(type, fn, o)); };
    on(window, 'keydown', (e) => this._key(e, true));
    on(window, 'keyup', (e) => this._key(e, false));
    on(window, 'blur', () => { this.keys.clear(); if (this.game.phase === 'playing' && !this.isTouch) this.pause(); });
    on(window, 'resize', () => this._resize());
    on(window, 'orientationchange', () => setTimeout(() => this._resize(), 200));
    on(document, 'fullscreenchange', () => { this._resize(); this._emit(true); });
    on(document, 'mousemove', (e) => {
      if (this.game.phase !== 'playing') return;
      if (this.locked || this.dragging) { this.mdx += e.movementX || 0; this.mdy += e.movementY || 0; }
    });
    on(this.canvas, 'mousedown', () => {
      if (this.game.phase !== 'playing') return;
      this.dragging = true;
      if (!this.locked) this.requestLock();
    });
    on(window, 'mouseup', () => { this.dragging = false; });
    on(document, 'pointerlockchange', () => {
      if (!this.locked) {
        if (this.expectUnlock) { this.expectUnlock = false; return; }
        if (this.game.phase === 'playing') this.pause();
      }
      this._emit(true);
    });
    on(document, 'visibilitychange', () => { if (document.hidden && this.game.phase === 'playing') this.pause(); });
  }

  _key(e, down) {
    const c = e.code;
    if (GAME_KEYS.has(c) && this.game.phase === 'playing') e.preventDefault();
    if (down) this.keys.add(c); else this.keys.delete(c);
    if (down && c === 'Escape' && this.game.phase === 'comms') { e.preventDefault(); this.closeComms(); return; }
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (down && c === 'KeyE' && !e.repeat) this.eTap = true; // survives a tap shorter than one frame
    if (!down) return;
    const ph = this.game.phase;
    if (c === 'Escape' && ph === 'playing' && !this.locked) this.pause();
    else if (c === 'KeyP') { if (ph === 'playing') this.pause(); else if (ph === 'paused') this.resume(); }
    else if (c === 'KeyC' && ph === 'playing' && !e.repeat) { e.preventDefault(); this.openComms(); }
    else if (c === 'KeyC' && ph === 'comms' && !e.repeat) { e.preventDefault(); this.closeComms(); }
    else if (c === 'KeyF' && !e.repeat) this.toggleFullscreen();
    else if (c === 'KeyM' && !e.repeat) this.setMuted(!this.sfx.muted);
    else if (ph === 'playing' && (c === 'Digit1' || c === 'Digit2' || c === 'Digit3')) {
      this.viewmodel.setTool({ Digit1: 'wrench', Digit2: 'scanner', Digit3: 'sampler' }[c]);
    }
  }

  _resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    this.renderer.setSize(w, h, false);          // CSS (#game-canvas) makes the canvas fill the whole viewport
    this.camera.aspect = w / h;
    // on very narrow (portrait) screens widen the vertical FOV so the world stays readable
    this.camera.fov = w / h < 1 ? Math.min(100, FOV + (1 - w / h) * 40) : FOV;
    this.camera.updateProjectionMatrix();
    this.viewmodel.resize(w / h);
  }

  // ------------------------------------------------------------- main loop
  _frame(now) {
    this.raf = requestAnimationFrame(this._frame);
    this.frames++;
    const dt = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc >= 1) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }
    this._update(dt);
    this._render();
  }

  _update(dt) {
    const g = this.game;
    this.clock += dt;
    if (g.phase === 'playing') {
      this._look();
      this.acc += dt;
      let n = 0;
      while (this.acc >= 1 / 60 && n++ < 20) { this._sim(1 / 60); this.acc -= 1 / 60; if (g.phase !== 'playing') break; }
      if (g.phase !== 'playing') this._onPhaseChange();
    } else if (g.phase === 'decision') {
      const before = g.event?.state;
      tickDecision(g, dt);
      this.sfx.countdown(g.event?.left ?? 0, g.event?.state === 'decision');
      if (before === 'decision' && g.event?.state === 'result') this._emit(true);
    } else {
      this.acc = 0; this.holdProgress = -1; this.hold = null;
    }
    if (g.phase !== 'decision') this.sfx.countdown(0, false);   // no ticking outside a timed question (answered, timed out, paused, ended)
    this.fade = Math.max(0, this.fade - dt * 0.6);
    const ph = g.phase, want = ph === 'title' || ph === 'briefing' ? 'menu' : ph === 'success' || ph === 'failure' ? 'off' : 'game';
    if (this._musicWant !== want) { this._musicWant = want; this.sfx.setMusic(want); }
    this._cameraPose(dt);
    this._visuals(dt);
    this.snapT += dt;
    if (this.snapT > 1 / 15) { this.snapT = 0; this._emit(); }
  }

  _onPhaseChange() {
    const g = this.game;
    if (g.phase === 'decision') { this.exitLock(); this.sfx.setStorm(true); this.sfx.play('warn'); }
    if (g.phase === 'console') { this.exitLock(); this.sfx.play('click'); }
    if (g.phase === 'success' || g.phase === 'failure') {
      this.exitLock(); this.sfx.setStorm(false); this.sfx.play(g.phase === 'success' ? 'success' : 'fail');
      if (g.end) { this.save.progress = recordResult(this.save.progress, g.level.id, g.end, MAX_LEVEL); saveGame(this.save.profile, this.save.progress); }
    }
    this._emit(true);
  }

  _look() {
    const p = this.game.player, t = this.touch;
    const arrows = (this.keys.has('KeyQ') ? 1 : 0) - (this.keys.has('KeyZ') ? 1 : 0);
    p.yaw -= this.mdx * 0.0022 + t.lookDX * 0.0055 - arrows * 0.03;
    p.pitch = clamp(p.pitch - this.mdy * 0.0022 - t.lookDY * 0.0055, -1.45, 1.45);
    this.mdx = this.mdy = 0; t.lookDX = t.lookDY = 0;
  }

  _groundAt(x, z) {
    return roomAt(x, z) ? 0.08 : heightAt(x, z);
  }

  _sim(dt) {
    const g = this.game, p = g.player, k = this.keys, t = this.touch;
    // --- movement ---------------------------------------------------------
    let fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - t.moveY;
    let str = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + t.moveX;
    const len = Math.hypot(fwd, str);
    if (len > 1) { fwd /= len; str /= len; }
    const wantsSprint = (k.has('ShiftLeft') || k.has('ShiftRight') || t.sprint) && fwd > 0.1;
    const speed = (wantsSprint ? SPRINT : WALK) * this.speedMul * (g.status.injured ? 0.65 : 1);
    p.sprinting = wantsSprint && p.onGround;
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    const wx = -sy * fwd + cy * str, wz = -cy * fwd - sy * str;
    const accel = p.onGround ? 12 : 2.5;
    p.vx = (p.vx ?? 0) + (wx * speed - (p.vx ?? 0)) * Math.min(1, accel * dt);
    p.vz = (p.vz ?? 0) + (wz * speed - (p.vz ?? 0)) * Math.min(1, accel * dt);
    const ox = p.x, oz = p.z;
    let nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
    const r = Math.hypot(nx, nz), lim = WORLD_RADIUS - 2;
    if (r > lim) { nx *= lim / r; nz *= lim / r; if (this.clock - this.warnedBoundary > 6) { this.warnedBoundary = this.clock; toast(g, 'You are at the edge of the mapped area. Turn back to the outpost.', 'warn', 'Out of range', 4); } }
    const res = resolveCollisions(nx, nz, RADIUS);
    p.x = res.x; p.z = res.z;
    p.vx = (p.x - ox) / dt; p.vz = (p.z - oz) / dt;
    const hs = Math.hypot(p.vx, p.vz);
    this.moving = hs > 0.4 && p.onGround;
    p.moving = this.moving;
    if (this.moving) { this.bob += (hs / 1.9) * Math.PI * dt; this.sfx.step(p.sprinting); }

    // --- vertical (local gravity: Moon 1.62, Mars 3.71 m/s^2) ---------------
    const gy = this._groundAt(p.x, p.z);
    const jumpDown = k.has('Space') || t.jump;
    if (jumpDown && !this.jumpWas && p.onGround) { p.vy = JUMP; p.onGround = false; this.sfx.play('jump'); }
    this.jumpWas = jumpDown;
    if (p.onGround) {
      if (p.y - gy > 0.35) p.onGround = false;
      else { p.y += (gy - p.y) * Math.min(1, 20 * dt); p.vy = 0; }
    }
    if (!p.onGround) {
      p.vy -= this.gravity * dt; p.y += p.vy * dt;
      if (p.y <= gy) { p.y = gy; p.vy = 0; p.onGround = true; }
    }
    const room = roomAt(p.x, p.z);
    if (room) { const maxY = room.h - 1.95; if (p.y > maxY) { p.y = maxY; if (p.vy > 0) p.vy = 0; } }

    // --- survival / mission -------------------------------------------------
    step(g, dt);
    this._interaction(dt);
    for (const ev of g.events) { if (ev.type === 'alarm') { this.sfx.setStorm(true); this.sfx.play('warn'); } else if (EVENT_SOUND[ev.type]) this.sfx.play(EVENT_SOUND[ev.type]); }
    g.events.length = 0;
    this.sfx.setStorm(g.hazard?.state === 'active');
    const fresh = this.sfx.alarms(this.clock, { storm: g.hazard?.state === 'active' && g.hazard.type === 'storm', oxygen: g.oxygen < 20, health: g.health < 25 });
    if (fresh && this.voice && !this.sfx.muted && !isSpeaking()) speak(WARN_TEXT[fresh], this.sfx.volume, { onstart: () => this.sfx.duck(true), onend: () => this.sfx.duck(false) });
  }

  _interaction(dt) {
    const g = this.game, p = g.player;
    const eyeY = p.y + this.eye;
    const fx = -Math.sin(p.yaw) * Math.cos(p.pitch), fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
    let best = null, bestScore = Infinity;
    const list = interactables;
    for (const it of list) {
      if (!isActive(g, it)) continue;
      const dx = it.pos[0] - p.x, dy = it.pos[1] - eyeY, dz = it.pos[2] - p.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > it.reach + 0.6) continue;
      const cos = (dx * fx + dy * fy + dz * fz) / (d || 1);
      if (cos < (d < 1.2 ? 0.2 : 0.72)) continue;
      const score = d * (2 - cos);
      if (score < bestScore) { bestScore = score; best = it; }
    }
    this.target = best;
    if (g.refillSession && (!best || best.id !== 'refillstation')) refillEnd(g);
    const eDown = this.keys.has('KeyE') || this.touch.interact;
    const edge = (eDown && !this.eWasDown) || this.eTap;
    this.eTap = false;
    if (!eDown) this.eLatch = false;
    this.eWasDown = eDown;
    this.holdProgress = -1;
    if (!best) { if (this.hold?.id === 'refillstation') refillEnd(g); this.hold = null; this.prompt = null; if (!eDown) this.viewmodel.setTool(this.viewmodel.want === 'none' ? 'none' : this.viewmodel.want); return; }
    const d = describeTarget(g, best);
    this.prompt = { ...d, progress: 0 };
    if (d.enabled && d.tool) this.viewmodel.setTool(d.tool);
    if (!d.enabled) { this.hold = null; if (edge && d.reason) interact(g, best); return; }
    if (d.continuous) {                                 // refill: oxygen rises while E is held; letting go keeps what was gained
      if (eDown && !this.eLatch) {
        this.hold = { id: best.id, t: 0 };
        this.holdProgress = refillStep(g, dt);
        this.prompt.progress = this.holdProgress;
      } else { if (this.hold?.id === best.id) refillEnd(g); this.hold = null; }
    } else if (d.hold > 0) {
      if (eDown && !this.eLatch) {
        if (!this.hold || this.hold.id !== best.id) this.hold = { id: best.id, t: 0 };
        this.hold.t += dt;
        this.holdProgress = clamp(this.hold.t / d.hold, 0, 1);
        this.prompt.progress = this.holdProgress;
        if (this.hold.t >= d.hold) { interact(g, best); this.hold = null; this.eLatch = true; this.holdProgress = -1; }
      } else this.hold = null;
    } else if (edge) {
      interact(g, best);
    }
  }

  // ------------------------------------------------------------- camera + visuals
  _cameraPose(dt) {
    const g = this.game, cam = this.camera, p = g.player;
    const menu = g.phase === 'title' || g.phase === 'briefing';
    if (menu) {
      const a = this.clock * 0.06 + 0.7, cx = 0, cz = -6;
      const px = cx + Math.cos(a) * 46, pz = cz + Math.sin(a) * 46, py = 7 + Math.sin(this.clock * 0.2) * 1.2;
      const dx = cx - px, dz = cz - pz, dy = 3.2 - py;
      cam.position.set(px, py, pz);
      cam.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)) + 0.12, Math.atan2(-dx, -dz), 0);
      return;
    }
    let bobY = 0, roll = 0;
    if (this.moving) { bobY = Math.abs(Math.sin(this.bob)) * 0.05 - 0.02; roll = Math.sin(this.bob) * 0.006; }
    let shx = 0, shy = 0;
    if (g.hazard?.state === 'active' && g.zone === 'outside') { shx = (Math.random() - 0.5) * 0.02; shy = (Math.random() - 0.5) * 0.02; }
    if (g.hurt > 0) { shx += (Math.random() - 0.5) * 0.03 * g.hurt; shy += (Math.random() - 0.5) * 0.03 * g.hurt; }
    cam.position.set(p.x + shx, p.y + this.eye + bobY + shy, p.z);
    cam.rotation.set(p.pitch, p.yaw, roll);
    void dt;
  }

  _visuals(dt) {
    const g = this.game, w = this.world, t = this.clock;
    const cam = this.camera;
    // sky follows the camera so stars/Earth/Sun stay infinitely far away
    w.sky.position.copy(cam.position);
    // sun + shadow frustum follow the player in 2 m steps (reduces shimmer)
    const sx = Math.round(cam.position.x / 2) * 2, sz = Math.round(cam.position.z / 2) * 2;
    this.sun.position.set(sx + SUN_DIR[0] * 140, SUN_DIR[1] * 140, sz + SUN_DIR[2] * 140);
    this.sun.target.position.set(sx, 0, sz);
    this.sun.target.updateMatrixWorld?.();

    // lighting follows the level's sunlight (night on L5, dust storm on L7) and the hazard look
    const base = this.envBase, sunFrac = clamp(g.sun / (g.env.sun || 1), 0.02, 1);
    const storm = g.hazard?.state === 'active' && g.hazard.type === 'storm' ? 1 : 0;
    const dust = g.hazard?.state === 'active' && g.hazard.type === 'dust' ? 1 : 0;
    this.stormMix += (storm - this.stormMix) * Math.min(1, dt * 1.5);
    this.dustMix += (dust - this.dustMix) * Math.min(1, dt * 1.2);
    const m = this.stormMix, dm = this.dustMix;
    this.sun.intensity = base.sunI * sunFrac * (1 - 0.55 * dm) * (1 + m * (0.18 * Math.sin(t * 19) * Math.sin(t * 7.3)));
    this.sun.color.setRGB(1, 0.95 - 0.25 * m - 0.15 * dm, 0.88 - 0.5 * m - 0.3 * dm);
    this.hemi.intensity = base.hemiI * (0.45 + 0.55 * sunFrac) * (1 + 0.3 * dm) + m * (0.25 + 0.15 * Math.sin(t * 5));
    this.hemi.color.setRGB(0.5 + 0.5 * m, 0.56 - 0.2 * m, 0.69 - 0.4 * m);
    w.setWeather?.({ dust: dm, storm: m, sun: sunFrac, time: t });
    // dust-storm visibility: real Three fog (the test shim has no Fog, so the browser test build skips this)
    if (THREE.Fog) {
      if (g.planet === 'mars') {
        if (!this.scene.fog) this.scene.fog = new THREE.Fog(0x8a5a3c, 200, 1e5);
        this.scene.fog.near = lerp(200, 3, dm); this.scene.fog.far = lerp(1e5, 240, dm);
        this.scene.fog.color.setRGB(0.45 - 0.15 * dm * (1 - sunFrac), 0.27 - 0.09 * dm, 0.17 - 0.06 * dm);
      } else if (this.scene.fog) this.scene.fog = null;
    }

    // arrays: broken / deployed / stowed, dust layer
    for (const id of Object.keys(w.arrayViews)) {
      const v = w.arrayViews[id], st = g.arrays[id];
      v.damaged.visible = st === 'broken'; v.fixed.visible = st === 'ok';
      if (v.stowed) v.stowed.visible = st === 'stowed';
      if (v.dust) v.dust.material.opacity = clamp(g.dust[id] * 0.9, 0, 0.8);
      v.lamp.material.color.setHex(st === 'ok' ? 0x30ff60 : st === 'stowed' ? 0xffc030 : (Math.sin(t * 6 + id.length) > 0 ? 0xff3300 : 0x551100));
    }
    // samples (only the ones this level uses)
    for (const id of Object.keys(w.sampleViews)) {
      const v = w.sampleViews[id];
      v.group.visible = !g.samples[id] && g.activeSamples.includes(id);
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + id.length);
      v.glow.material.opacity = 0.35 + 0.35 * pulse; v.beam.material.opacity = 0.18 + 0.2 * pulse;
    }
    // power: breaker lever, ceiling lights, point lights, unit lamps
    const a = w.anim, on = g.breaker, lvl = clamp(g.res.battery / 100, 0, 1);
    const lit = on && (g.res.battery > 0.2 || g.flows.prod >= g.flows.load * 0.99);
    if (a.breaker) { a.breaker.lever.rotation.z = on ? 0.9 : -0.9; a.breaker.lamp.material.color.setHex(on ? 0x30ff60 : 0xff2200); }
    if (a.ceilingLights) a.ceilingLights.color.setHex(lit ? (lvl < 0.25 ? 0xffd9a0 : 0xfff2d8) : 0x1a1a1a);
    if (a.pointLights) for (const l of a.pointLights) l.intensity = lit ? (14 + 24 * Math.max(0.3, lvl)) * (g.hazard?.state === 'active' ? 0.75 + 0.25 * Math.sin(t * 23) : 1) : 0;
    if (a.unitLamps) for (const id of Object.keys(a.unitLamps)) {
      const u = g.sys[id]; if (!u) continue;
      const c = u.st === 'broken' ? (Math.sin(t * 6) > 0 ? 0xff3300 : 0x440800) : u.st === 'fault' ? (Math.sin(t * 4) > 0 ? 0xffb020 : 0x553300) : u.st === 'absent' ? 0x000000 : !lit ? 0x330000 : u.on && u.powered ? 0x30ff60 : u.on ? 0xffb020 : 0x6a6a6a;
      a.unitLamps[id].color.setHex(c);
    }
    // new structures + faults
    const wg = w.greenhouse; if (wg) { wg.group.visible = g.sys.greenhouse.st !== 'absent'; wg.setActive?.(g.sys.greenhouse.on && g.sys.greenhouse.powered, t); }
    if (w.leaks) { if (w.leaks.water) w.leaks.water.group.visible = !!g.status.water_leak; if (w.leaks.o2) w.leaks.o2.group.visible = !!g.status.o2_leak; }
    if (w.shelterBox?.setOpen) w.shelterBox.setOpen(!!g.flags.shelterChecked);
    w.batteryBank?.setLevel?.(g.res.battery / 100);
    w.comm?.setState?.(g.status.comm_down ? 'down' : 'ok', t);
    w.thermalView?.setState?.(g.sys.thermal.st, t);
    w.refillStation?.update?.(g.oxygen < REFILL_STATION_BELOW, g.o2res > 4 && g.oxygen < REFILL_STATION_BELOW, t);
    // sliding doors
    if (a.doors) for (const d of a.doors) {
      const dx = cam.position.x - d.room.cx, dz = cam.position.z - (d.room.cz + d.room.d / 2);
      const near = Math.hypot(dx, dz) < 5.5 ? 1 : 0;
      d.open += (near - d.open) * Math.min(1, dt * 4);
      const shift = d.open * (d.room.door.w / 2 + 0.05);
      d.a.position.x = d.room.cx - d.room.door.w / 4 - shift;
      d.b.position.x = d.room.cx + d.room.door.w / 4 + shift;
    }

    // work particles at the target
    const working = this.holdProgress >= 0 && this.target && this.prompt;
    this.sparks.visible = !!working;
    if (working) {
      const pos = this.sparkGeo.attributes.position, col = this.sparkGeo.attributes.color;
      const tool = this.prompt.tool;
      const tx = this.target.pos[0], ty = this.target.pos[1] + (tool === 'wrench' ? 0.9 : 0.1), tz = this.target.pos[2];
      for (let i = 0; i < this.sparkN; i++) {
        pos.setXYZ(i, tx + (Math.random() - 0.5) * 0.6, ty + Math.random() * 0.7, tz + (Math.random() - 0.5) * 0.6);
        if (tool === 'scanner') col.setXYZ(i, 0.3, 0.9, 1);
        else if (tool === 'sampler') col.setXYZ(i, 0.7, 0.6, 0.45);
        else col.setXYZ(i, 1, 0.5 + Math.random() * 0.5, 0.15);
      }
      pos.needsUpdate = true; col.needsUpdate = true;
    }

    // view-model (hands + tool)
    const sun = SUN_DIR, cyaw = Math.cos(g.player.yaw), syaw = Math.sin(g.player.yaw);
    const x1 = sun[0] * cyaw - sun[2] * syaw, z1 = sun[0] * syaw + sun[2] * cyaw;
    const cp = Math.cos(g.player.pitch), sp = Math.sin(g.player.pitch);
    this.viewmodel.setSun(x1, sun[1] * cp + z1 * sp, -sun[1] * sp + z1 * cp);
    this.viewmodel.update(dt, {
      moving: this.moving, bob: this.bob, holding: this.holdProgress ?? -1,
      oxygen: g.oxygen, suit: g.health, hurt: g.hurt,
    });
  }

  _render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    const ph = this.game.phase;
    if (ph !== 'title') { r.clearDepth(); r.render(this.viewmodel.scene, this.viewmodel.camera); }
  }

  // ------------------------------------------------------------- snapshot for React
  _emit() {
    const g = this.game;
    let compass = null;
    if (g.phase === 'playing') {
      const tgt = nextTarget(g);
      if (tgt) { const b = bearingTo(g, tgt); compass = { label: tgt.label, delta: b.delta, dist: b.dist }; }
    }
    const ev = g.event;
    const lvl = g.level;
    const snap = {
      phase: g.phase, time: g.time, limit: lvl.limit * g.diff.limit,
      level: { id: lvl.id, name: lvl.name, planet: g.planet, tagline: lvl.tagline, story: lvl.story, teaches: lvl.teaches, tips: lvl.tips, par: lvl.par, rank: lvl.rank },
      difficulty: g.diff.id, planet: g.env.name,
      health: g.health, oxygen: g.oxygen, o2res: g.o2res, res: { ...g.res }, co2: g.co2, temp: g.temp, ambient: g.ambient, dose: g.dose, radRate: g.radRate, sun: g.sun,
      rate: { ...g.rate }, power: powerStatus(g), rationing: g.rationing, status: { ...g.status },
      zone: g.zone, objectives: objectives(g), compass,
      sys: Object.fromEntries(Object.entries(g.sys).map(([k, v]) => [k, { st: v.st, on: v.on, powered: v.powered }])),
      me: { name: g.profile.name, role: g.profile.role, weight: g.profile.weight, height: g.profile.height, weightHere: weightOn(g.profile.weight, g.env.gravity), weightEarth: weightOn(g.profile.weight, 9.81), gravity: g.env.gravity },
      hazard: g.hazard ? { type: g.hazard.type, state: g.hazard.state, remaining: Math.max(0, g.hazard.dur - g.hazard.t), intensity: g.hazard.intensity } : null,
      radio: g.radio.map((r) => ({ id: r.id, who: r.who, name: r.name, text: r.text })),
      toasts: g.toasts.map((x) => ({ ...x })), hurt: g.hurt, fade: this.fade,
      prompt: this.prompt && g.phase === 'playing' ? this.prompt : null,
      event: g.phase === 'decision' && ev ? (ev.state === 'result' ? { result: ev.result } : { view: eventView(g) }) : null,
      console: g.phase === 'console' ? consoleView(g) : null,
      end: g.end, failReason: g.failReason,
      save: this.save, levels: LEVEL_LIST.length,
      locked: this.locked, isTouch: this.isTouch, muted: this.sfx.muted, volume: this.sfx.volume, musicVol: this.sfx.musicVol, voice: this.voice, speech: speechSupported(), frames: this.frames,
      comms: g.phase === 'comms' ? { ...contactsView(g.level.id), selected: this.comms.contact, log: this.comms.log.map((m) => ({ ...m })) } : null,
      crisis: crisisView(g),
      fullscreen: !!(document.fullscreenElement || document.webkitFullscreenElement), fps: Math.round(this.fps),
      sprinting: g.player.sprinting,
    };
    this.onSnapshot(snap);
  }
}
