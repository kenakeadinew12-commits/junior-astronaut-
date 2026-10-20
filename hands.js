// First-person view-model: gloved hands, a wrist display and three usable tools.
// Rendered in its own scene/camera on top of the world so it never clips into walls or terrain.
import * as THREE from 'three';
import { MeshBuilder, T, mat, basic, meshOf } from './geo.js';

const GLOVE = [0.55, 0.55, 0.53];
const GLOVE_DARK = [0.12, 0.12, 0.13];
const SLEEVE = [0.6, 0.62, 0.64];
const CUFF = [0.1, 0.18, 0.3];
const ORANGE = [0.55, 0.16, 0.03];
const STEEL = [0.22, 0.23, 0.25];

function makeHand(right) {
  const root = new THREE.Group();
  const m = mat({ roughness: 0.85 });
  const side = right ? 1 : -1;
  root.add(meshOf(new MeshBuilder().box({ y: 0 }, 0.09, 0.034, 0.1, GLOVE).box({ y: -0.019, z: 0 }, 0.075, 0.01, 0.085, GLOVE_DARK), m, { cast: false, receive: false }));
  const fingers = [];
  const lens = [0.046, 0.052, 0.05, 0.04];
  for (let i = 0; i < 4; i++) {
    const p1 = new THREE.Group();
    p1.position.set(-0.033 + i * 0.022, 0, -0.05);
    p1.add(meshOf(new MeshBuilder().box({ z: -lens[i] / 2 }, 0.02, 0.022, lens[i], GLOVE), m, { cast: false, receive: false }));
    const p2 = new THREE.Group();
    p2.position.set(0, 0, -lens[i]);
    p2.add(meshOf(new MeshBuilder().box({ z: -0.017 }, 0.018, 0.02, 0.034, GLOVE), m, { cast: false, receive: false }));
    p1.add(p2);
    root.add(p1);
    fingers.push({ p1, p2 });
  }
  const thumb = new THREE.Group();
  thumb.position.set(-side * 0.046, 0, -0.01);
  thumb.rotation.y = side * 0.5;
  thumb.add(meshOf(new MeshBuilder().box({ z: -0.028 }, 0.024, 0.024, 0.06, GLOVE), m, { cast: false, receive: false }));
  root.add(thumb);
  // cuff ring and sleeve running back toward the camera
  root.add(meshOf(new MeshBuilder().cyl({ z: 0.062, rx: Math.PI / 2 }, 0.05, 0.05, 0.03, 16, CUFF), m, { cast: false, receive: false }));
  const sleeve = new MeshBuilder().cyl({ z: 0.22, rx: Math.PI / 2 }, 0.056, 0.062, 0.32, 14, SLEEVE);
  sleeve.box({ y: 0.05, z: 0.2 }, 0.012, 0.008, 0.26, ORANGE);
  root.add(meshOf(sleeve, m, { cast: false, receive: false }));
  return { root, fingers, thumb };
}

function makeTools() {
  const m = mat({ roughness: 0.6 });
  const group = new THREE.Group();
  // wrench / repair tool
  const wrench = new THREE.Group();
  const wb = new MeshBuilder().box({ z: -0.1 }, 0.03, 0.03, 0.26, STEEL).box({ z: -0.24, y: 0.0 }, 0.1, 0.034, 0.045, [0.6, 0.62, 0.65]);
  wb.box({ x: -0.04, z: -0.27 }, 0.022, 0.034, 0.05, [0.6, 0.62, 0.65]).box({ x: 0.04, z: -0.27 }, 0.022, 0.034, 0.05, [0.6, 0.62, 0.65]);
  wb.box({ z: -0.03 }, 0.036, 0.036, 0.06, ORANGE);
  wrench.add(meshOf(wb, m, { cast: false, receive: false }));
  // scanner
  const scanner = new THREE.Group();
  const sb = new MeshBuilder().box({ z: -0.06 }, 0.075, 0.05, 0.19, [0.14, 0.15, 0.17]).box({ y: 0.032, z: -0.1, rx: -0.3 }, 0.065, 0.012, 0.08, [0.05, 0.05, 0.06]);
  sb.cyl({ x: 0.03, y: 0.06, z: -0.12 }, 0.006, 0.006, 0.1, 6, STEEL).box({ z: -0.17 }, 0.05, 0.035, 0.03, ORANGE);
  scanner.add(meshOf(sb, m, { cast: false, receive: false }));
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x40e0ff });
  const screen = new THREE.Mesh(new MeshBuilder().box(T(), 0.055, 0.004, 0.06, [1, 1, 1]).build(), new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x40e0ff }));
  screen.position.set(0, 0.04, -0.1); screen.rotation.x = -0.3;
  scanner.add(screen);
  // sample collector
  const sampler = new THREE.Group();
  const cb = new MeshBuilder().cyl({ z: -0.12, rx: Math.PI / 2 }, 0.022, 0.026, 0.3, 10, STEEL).cyl({ z: -0.03, rx: Math.PI / 2 }, 0.04, 0.04, 0.09, 12, ORANGE);
  cb.cyl({ z: -0.29, rx: Math.PI / 2 }, 0.03, 0.01, 0.05, 10, [0.6, 0.62, 0.65]);
  sampler.add(meshOf(cb, m, { cast: false, receive: false }));
  for (const t of [wrench, scanner, sampler]) { t.visible = false; group.add(t); }
  void screenMat;
  return { group, tools: { wrench, scanner, sampler }, screen };
}

export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.02, 10);
    this.scene.add(this.camera);
    this.sun = new THREE.DirectionalLight(0xfff2e0, 3.0);
    this.sun.position.set(0.5, 1, 0.6);
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0x8fa0c0, 0x3a3530, 1.0));

    this.left = makeHand(false);
    this.right = makeHand(true);
    this.leftRoot = new THREE.Group(); this.leftRoot.add(this.left.root);
    this.rightRoot = new THREE.Group(); this.rightRoot.add(this.right.root);
    this.scene.add(this.leftRoot, this.rightRoot);

    const tl = makeTools();
    this.toolGroup = tl.group; this.tools = tl.tools; this.scanScreen = tl.screen;
    this.right.root.add(this.toolGroup);
    this.toolGroup.position.set(0, 0.02, -0.02);

    // wrist display on the left forearm: two bars (oxygen, suit)
    const base = new THREE.Mesh(new MeshBuilder().box(T(), 0.075, 0.012, 0.09, [0.04, 0.045, 0.05]).build(), mat());
    base.position.set(0, 0.058, 0.2);
    this.left.root.add(base);
    this.barO2 = new THREE.Mesh(new MeshBuilder().box(T(), 1, 1, 1, [1, 1, 1]).build(), new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x40d0ff }));
    this.barSuit = new THREE.Mesh(new MeshBuilder().box(T(), 1, 1, 1, [1, 1, 1]).build(), new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x40e060 }));
    for (const b of [this.barO2, this.barSuit]) { b.scale.set(0.06, 0.006, 0.014); this.left.root.add(b); }
    this.barO2.position.set(0, 0.066, 0.18); this.barSuit.position.set(0, 0.066, 0.215);

    this.t = 0; this.lower = 0; this.shown = 'none'; this.want = 'none';
  }
  setTool(name) { this.want = name; }
  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
  setSun(x, y, z) { this.sun.position.set(x, y, z); }

  update(dt, c) {
    this.t += dt;
    const t = this.t;
    // tool swap: lower the hand, swap, raise
    const target = this.want !== this.shown ? 1 : 0;
    this.lower += Math.sign(target - this.lower) * Math.min(Math.abs(target - this.lower), dt * 6);
    if (this.lower >= 0.98 && this.want !== this.shown) {
      this.shown = this.want;
      for (const k of Object.keys(this.tools)) this.tools[k].visible = k === this.shown;
    }
    const holding = c.holding >= 0;
    const bobX = c.moving ? Math.sin(c.bob) * 0.012 : Math.sin(t * 1.1) * 0.003;
    const bobY = c.moving ? Math.abs(Math.cos(c.bob)) * 0.012 : Math.sin(t * 1.7) * 0.003;
    const hurt = c.hurt > 0 ? (Math.random() - 0.5) * 0.01 * c.hurt : 0;

    // left hand: relaxed, wrist display visible
    this.leftRoot.position.set(-0.23 + bobX + hurt, -0.27 + bobY * 0.7, -0.42);
    this.leftRoot.rotation.set(0.15, 0.32, 0.12);
    const gripL = 0.45 + Math.sin(t * 1.2) * 0.04;
    this.left.fingers.forEach((f, i) => { f.p1.rotation.x = -gripL * (0.9 + i * 0.05); f.p2.rotation.x = -gripL * 0.8; });
    this.left.thumb.rotation.x = -0.1;

    // right hand: grips the tool
    let rx = 0.25 + bobX, ry = -0.27 + bobY - this.lower * 0.3, rz = -0.46;
    let rot = [0.2, -0.25, -0.1];
    const tool = this.tools[this.shown];
    let toolRot = [0, 0, 0], toolPos = [0, 0, 0];
    if (holding && this.shown === 'wrench') { toolRot = [0, 0, Math.sin(t * 16) * 0.45]; rz -= 0.03; rot[0] += 0.15; }
    if (holding && this.shown === 'scanner') { toolPos = [0, Math.sin(t * 3) * 0.02, 0]; rx -= 0.04; rot[2] -= 0.1; }
    if (holding && this.shown === 'sampler') { toolPos = [0, 0, -(0.5 + 0.5 * Math.sin(t * 11)) * 0.06]; rot[0] += 0.3; }
    this.rightRoot.position.set(rx + hurt, ry, rz);
    this.rightRoot.rotation.set(rot[0], rot[1], rot[2]);
    this.toolGroup.rotation.set(toolRot[0], toolRot[1], toolRot[2]);
    this.toolGroup.position.set(toolPos[0], 0.02 + toolPos[1], -0.02 + toolPos[2]);
    void tool;
    const gripR = this.shown === 'none' ? 0.4 : 1.0;
    this.right.fingers.forEach((f, i) => { f.p1.rotation.x = -gripR * (0.95 + i * 0.03); f.p2.rotation.x = -gripR * 0.85; });
    this.right.thumb.rotation.x = this.shown === 'none' ? -0.1 : -0.55;

    // screen glow of the scanner pulses while scanning
    this.scanScreen.material.color.setHex(holding && this.shown === 'scanner' ? (Math.sin(t * 20) > 0 ? 0xffffff : 0x40e0ff) : 0x40e0ff);

    // wrist bars
    const o2 = Math.max(0.02, c.oxygen / 100), su = Math.max(0.02, c.suit / 100);
    this.barO2.scale.x = 0.06 * o2; this.barO2.position.x = -0.03 + 0.03 * o2;
    this.barSuit.scale.x = 0.06 * su; this.barSuit.position.x = -0.03 + 0.03 * su;
    this.barO2.material.color.setHex(c.oxygen < 25 ? 0xff4030 : 0x40d0ff);
    this.barSuit.material.color.setHex(c.suit < 35 ? 0xff4030 : c.suit < 65 ? 0xf0c040 : 0x40e060);
  }
}
