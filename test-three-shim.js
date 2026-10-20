// ============================================================================
// TEST-ONLY. NOT PART OF THE GAME.
// A minimal WebGL2 stand-in for the small part of the Three.js API this project uses.
// Real Three.js could not be installed in the authoring workspace (npm + GitHub blocked), so this lets the
// *game code* (engine, world, HUD, controls) run in a real browser for verification. The shipped build
// (npm run build) uses the real `three` package and never imports this file.
// Differences from Three.js: no shadows, no tone mapping, simplified lighting.
// ============================================================================
export const FrontSide = 0, BackSide = 1, DoubleSide = 2;
export const PCFSoftShadowMap = 2, PCFShadowMap = 1, SRGBColorSpace = 'srgb', ACESFilmicToneMapping = 4;

const srgbToLinear = (c) => Math.pow(c, 2.2);
export class Color {
  constructor(hex = 0xffffff) { this.r = 1; this.g = 1; this.b = 1; if (typeof hex === 'number') this.setHex(hex); }
  setHex(hex) { this.r = srgbToLinear(((hex >> 16) & 255) / 255); this.g = srgbToLinear(((hex >> 8) & 255) / 255); this.b = srgbToLinear((hex & 255) / 255); return this; }
  set(v) { return typeof v === 'number' ? this.setHex(v) : this.copy(v); }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  clone() { return new Color().copy(this); }
  multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
  lerp(c, t) { this.r += (c.r - this.r) * t; this.g += (c.g - this.g) * t; this.b += (c.b - this.b) * t; return this; }
}
class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
}
class Euler {
  constructor() { this.x = 0; this.y = 0; this.z = 0; this.order = 'XYZ'; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

// ---- matrices (column-major) ------------------------------------------------
const ident = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function rotM(axis, a) {
  const c = Math.cos(a), s = Math.sin(a), m = ident();
  if (axis === 'x') { m[5] = c; m[6] = s; m[9] = -s; m[10] = c; }
  if (axis === 'y') { m[0] = c; m[2] = -s; m[8] = s; m[10] = c; }
  if (axis === 'z') { m[0] = c; m[1] = s; m[4] = -s; m[5] = c; }
  return m;
}
function compose(o) {
  const rx = rotM('x', o.rotation.x), ry = rotM('y', o.rotation.y), rz = rotM('z', o.rotation.z);
  const R = o.rotation.order === 'YXZ' ? mul(mul(ry, rx), rz) : mul(mul(rx, ry), rz);
  const m = R;
  for (let i = 0; i < 3; i++) { m[i] *= o.scale.x; m[4 + i] *= o.scale.y; m[8 + i] *= o.scale.z; }
  m[12] = o.position.x; m[13] = o.position.y; m[14] = o.position.z;
  return m;
}
function invert(m) {
  const inv = new Float32Array(16);
  const [m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33] = m;
  const b00 = m00 * m11 - m01 * m10, b01 = m00 * m12 - m02 * m10, b02 = m00 * m13 - m03 * m10, b03 = m01 * m12 - m02 * m11, b04 = m01 * m13 - m03 * m11, b05 = m02 * m13 - m03 * m12;
  const b06 = m20 * m31 - m21 * m30, b07 = m20 * m32 - m22 * m30, b08 = m20 * m33 - m23 * m30, b09 = m21 * m32 - m22 * m31, b10 = m21 * m33 - m23 * m31, b11 = m22 * m33 - m23 * m32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  det = 1 / det;
  inv[0] = (m11 * b11 - m12 * b10 + m13 * b09) * det; inv[1] = (m02 * b10 - m01 * b11 - m03 * b09) * det; inv[2] = (m31 * b05 - m32 * b04 + m33 * b03) * det; inv[3] = (m22 * b04 - m21 * b05 - m23 * b03) * det;
  inv[4] = (m12 * b08 - m10 * b11 - m13 * b07) * det; inv[5] = (m00 * b11 - m02 * b08 + m03 * b07) * det; inv[6] = (m32 * b02 - m30 * b05 - m33 * b01) * det; inv[7] = (m20 * b05 - m22 * b02 + m23 * b01) * det;
  inv[8] = (m10 * b10 - m11 * b08 + m13 * b06) * det; inv[9] = (m01 * b08 - m00 * b10 - m03 * b06) * det; inv[10] = (m30 * b04 - m31 * b02 + m33 * b00) * det; inv[11] = (m21 * b02 - m20 * b04 - m23 * b00) * det;
  inv[12] = (m11 * b07 - m10 * b09 - m12 * b06) * det; inv[13] = (m00 * b09 - m01 * b07 + m02 * b06) * det; inv[14] = (m31 * b01 - m30 * b03 - m32 * b00) * det; inv[15] = (m20 * b03 - m21 * b01 + m22 * b00) * det;
  return inv;
}
function normalMat(m) {
  // inverse-transpose of the upper 3x3
  const [a, b, c, , d, e, f, , g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C || 1;
  return new Float32Array([A / det, B / det, C / det, -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det, (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det]);
}

// ---- scene graph ------------------------------------------------------------
export class Object3D {
  constructor() { this.position = new Vec3(); this.rotation = new Euler(); this.scale = new Vec3(1, 1, 1); this.children = []; this.parent = null; this.visible = true; this.userData = {}; this.castShadow = false; this.receiveShadow = false; this.frustumCulled = true; this.world = ident(); }
  add(...o) { for (const c of o) { if (c.parent) c.parent.remove(c); c.parent = this; this.children.push(c); } return this; }
  remove(...o) { for (const c of o) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parent = null; } } return this; }
  traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); }
  updateMatrixWorld() { this.world = this.parent ? mul(this.parent.world, compose(this)) : compose(this); for (const c of this.children) c.updateMatrixWorld(); }
  _copyBase(o) { o.position.copy(this.position); o.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z); o.rotation.order = this.rotation.order; o.scale.copy(this.scale); o.visible = this.visible; return o; }
  clone() { const g = this._copyBase(new this.constructor()); for (const c of this.children) g.add(c.clone()); return g; }
}
export class Group extends Object3D {}
export class Scene extends Object3D { constructor() { super(); this.background = null; } }
export class Mesh extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; this.isMesh = true; }
  clone() { return this._copyBase(new Mesh(this.geometry, this.material)); }
}
export class Points extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; this.isPoints = true; }
}
export class PerspectiveCamera extends Object3D {
  constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) { super(); Object.assign(this, { fov, aspect, near, far }); }
  updateProjectionMatrix() {}
  proj() {
    const f = 1 / Math.tan((this.fov * Math.PI) / 360), n = this.near, fa = this.far, m = new Float32Array(16);
    m[0] = f / this.aspect; m[5] = f; m[10] = (fa + n) / (n - fa); m[11] = -1; m[14] = (2 * fa * n) / (n - fa);
    return m;
  }
}
class Light extends Object3D { constructor(color = 0xffffff, intensity = 1) { super(); this.color = new Color(color); this.intensity = intensity; this.isLight = true; } }
export class AmbientLight extends Light { constructor(c, i) { super(c, i); this.kind = 'ambient'; } }
export class HemisphereLight extends Light { constructor(sky, ground, i) { super(sky, i); this.groundColor = new Color(ground); this.kind = 'hemi'; } }
export class DirectionalLight extends Light {
  constructor(c, i) {
    super(c, i); this.kind = 'dir'; this.target = new Object3D();
    this.shadow = { mapSize: { set() {} }, camera: { left: 0, right: 0, top: 0, bottom: 0, near: 0, far: 0, updateProjectionMatrix() {} }, bias: 0, normalBias: 0 };
  }
}
export class PointLight extends Light { constructor(c, i, distance = 0, decay = 2) { super(c, i); this.distance = distance; this.decay = decay; this.kind = 'point'; } }

// ---- geometry ---------------------------------------------------------------
export class BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array.length / itemSize; this.version = 0; }
  set needsUpdate(v) { if (v) this.version++; }
  setXYZ(i, x, y, z) { this.array[i * 3] = x; this.array[i * 3 + 1] = y; this.array[i * 3 + 2] = z; return this; }
}
export class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; }
  setAttribute(n, a) { this.attributes[n] = a; return this; }
  setIndex(a) { this.index = a; return this; }
  computeVertexNormals() {
    const pos = this.attributes.position.array, n = new Float32Array(pos.length), idx = this.index ? this.index.array : null;
    const tris = idx ? idx.length / 3 : pos.length / 9;
    for (let t = 0; t < tris; t++) {
      const [a, b, c] = idx ? [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]] : [t * 3, t * 3 + 1, t * 3 + 2];
      const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
      const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const i of [a, b, c]) { n[i * 3] += nx; n[i * 3 + 1] += ny; n[i * 3 + 2] += nz; }
    }
    for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
    this.attributes.normal = new BufferAttribute(n, 3);
  }
  dispose() {}
}

// ---- materials ----------------------------------------------------------------
class Material {
  constructor(opts = {}, basic = false) {
    this.color = new Color(0xffffff); this.emissive = new Color(0x000000); this.emissiveIntensity = 1;
    this.vertexColors = false; this.side = FrontSide; this.transparent = false; this.opacity = 1; this.depthWrite = true; this.basic = basic;
    for (const [k, v] of Object.entries(opts)) {
      if ((k === 'color' || k === 'emissive') && typeof v === 'number') this[k].setHex(v); else this[k] = v;
    }
  }
}
export class MeshStandardMaterial extends Material { constructor(o) { super(o, false); } }
export class MeshBasicMaterial extends Material { constructor(o) { super(o, true); } }
export class PointsMaterial extends Material { constructor(o) { super({ size: 1, sizeAttenuation: true, ...o }, true); } }

// ---- renderer ---------------------------------------------------------------------
const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aCol;
uniform mat4 uModel, uView, uProj; uniform mat3 uNormalMat; uniform float uPointSize;
out vec3 vWorld; out vec3 vNor; out vec3 vCol;
void main(){ vec4 w = uModel*vec4(aPos,1.0); vWorld=w.xyz; vNor=normalize(uNormalMat*aNor); vCol=aCol; gl_Position=uProj*uView*w; gl_PointSize=uPointSize; }`;
const FS = `#version 300 es
precision highp float;
in vec3 vWorld; in vec3 vNor; in vec3 vCol; out vec4 outColor;
uniform vec3 uColor, uEmissive; uniform float uOpacity, uSideSign; uniform int uUseVC, uUnlit, uIsPoints;
uniform vec3 uAmb; uniform vec3 uHemiSky, uHemiGround; uniform vec3 uSunDir, uSunCol;
uniform vec3 uPLPos[4], uPLCol[4]; uniform vec2 uPLParams[4]; uniform int uPLCount;
void main(){
  vec3 albedo = uColor * (uUseVC==1 ? vCol : vec3(1.0));
  vec3 col;
  if (uUnlit==1) { col = albedo; }
  else {
    vec3 n = normalize(vNor) * uSideSign; if (!gl_FrontFacing) n = -n;
    vec3 irr = uAmb + mix(uHemiGround, uHemiSky, 0.5+0.5*n.y) + uSunCol*max(dot(n,uSunDir),0.0);
    for (int i=0;i<4;i++){ if(i>=uPLCount) break; vec3 d=uPLPos[i]-vWorld; float dist=length(d); vec3 l=d/dist;
      float fall = 1.0/pow(max(dist,0.1), uPLParams[i].y); float win = uPLParams[i].x>0.0 ? pow(clamp(1.0-pow(dist/uPLParams[i].x,4.0),0.0,1.0),2.0) : 1.0;
      irr += uPLCol[i]*fall*win*max(dot(n,l),0.0); }
    col = albedo*irr/3.14159265 + uEmissive;
  }
  outColor = vec4(pow(max(col,0.0), vec3(1.0/2.2)), uOpacity);
}`;

export class WebGLRenderer {
  constructor(opts = {}) {
    this.domElement = document.createElement('canvas');
    const gl = this.domElement.getContext('webgl2', { antialias: !!opts.antialias, alpha: false, powerPreference: opts.powerPreference });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl; this.shadowMap = { enabled: false, type: 0 }; this.autoClear = true; this.pr = 1; this.w = 1; this.h = 1;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    this.prog = p; this.u = {};
    for (const n of ['uModel', 'uView', 'uProj', 'uNormalMat', 'uPointSize', 'uColor', 'uEmissive', 'uOpacity', 'uSideSign', 'uUseVC', 'uUnlit', 'uIsPoints', 'uAmb', 'uHemiSky', 'uHemiGround', 'uSunDir', 'uSunCol', 'uPLPos', 'uPLCol', 'uPLParams', 'uPLCount']) this.u[n] = gl.getUniformLocation(p, n);
    this.bufs = new WeakMap(); this.clear_ = [0, 0, 0];
  }
  setPixelRatio(r) { this.pr = r; }
  setClearColor(hex) { const c = new Color(hex); this.clear_ = [Math.pow(c.r, 1 / 2.2), Math.pow(c.g, 1 / 2.2), Math.pow(c.b, 1 / 2.2)]; }
  setSize(w, h) { this.w = w; this.h = h; this.domElement.width = Math.max(1, Math.floor(w * this.pr)); this.domElement.height = Math.max(1, Math.floor(h * this.pr)); }
  clear() { const gl = this.gl; gl.clearColor(...this.clear_, 1); gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); }
  clearDepth() { const gl = this.gl; gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT); }
  dispose() {}
  _buf(attr, target) {
    const gl = this.gl; let rec = this.bufs.get(attr);
    if (!rec) { rec = { buf: gl.createBuffer(), v: -1 }; this.bufs.set(attr, rec); }
    gl.bindBuffer(target, rec.buf);
    if (rec.v !== attr.version) { gl.bufferData(target, attr.array, gl.STATIC_DRAW); rec.v = attr.version; }
    return rec;
  }
  render(scene, camera) {
    const gl = this.gl, u = this.u;
    scene.updateMatrixWorld();
    if (!camera.parent) camera.updateMatrixWorld();
    const view = invert(camera.world), proj = camera.proj();
    const camPos = [camera.world[12], camera.world[13], camera.world[14]];
    // collect lights + drawables
    const L = { amb: [0, 0, 0], sky: [0, 0, 0], gnd: [0, 0, 0], sunDir: [0, 1, 0], sunCol: [0, 0, 0], pl: [] }, draws = [];
    const walk = (o) => {
      if (!o.visible) return;
      if (o.isLight) {
        const c = o.color, k = o.intensity;
        if (o.kind === 'ambient') { L.amb[0] += c.r * k; L.amb[1] += c.g * k; L.amb[2] += c.b * k; }
        else if (o.kind === 'hemi') { L.sky = [c.r * k, c.g * k, c.b * k]; L.gnd = [o.groundColor.r * k, o.groundColor.g * k, o.groundColor.b * k]; }
        else if (o.kind === 'dir') {
          o.target.updateMatrixWorld?.(); const tp = o.target.position;
          const d = [o.position.x - tp.x, o.position.y - tp.y, o.position.z - tp.z], l = Math.hypot(...d) || 1;
          L.sunDir = [d[0] / l, d[1] / l, d[2] / l]; L.sunCol = [c.r * k, c.g * k, c.b * k];
        } else if (o.kind === 'point' && k > 0) L.pl.push({ pos: [o.world[12], o.world[13], o.world[14]], col: [c.r * k, c.g * k, c.b * k], dist: o.distance, decay: o.decay });
      }
      if ((o.isMesh || o.isPoints) && o.geometry.attributes.position) draws.push(o);
      for (const c of o.children) walk(c);
    };
    walk(scene);
    const opaque = draws.filter((d) => !d.material.transparent);
    const trans = draws.filter((d) => d.material.transparent)
      .map((d) => ({ d, z: Math.hypot(d.world[12] - camPos[0], d.world[13] - camPos[1], d.world[14] - camPos[2]) })).sort((a, b) => b.z - a.z).map((x) => x.d);

    gl.viewport(0, 0, this.domElement.width, this.domElement.height);
    gl.useProgram(this.prog); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.uniformMatrix4fv(u.uView, false, view); gl.uniformMatrix4fv(u.uProj, false, proj);
    gl.uniform3fv(u.uAmb, L.amb); gl.uniform3fv(u.uHemiSky, L.sky); gl.uniform3fv(u.uHemiGround, L.gnd);
    gl.uniform3fv(u.uSunDir, L.sunDir); gl.uniform3fv(u.uSunCol, L.sunCol);
    const pl = L.pl.slice(0, 4), pp = new Float32Array(12), pc = new Float32Array(12), pr = new Float32Array(8);
    pl.forEach((l, i) => { pp.set(l.pos, i * 3); pc.set(l.col, i * 3); pr[i * 2] = l.dist; pr[i * 2 + 1] = l.decay; });
    gl.uniform3fv(u.uPLPos, pp); gl.uniform3fv(u.uPLCol, pc); gl.uniform2fv(u.uPLParams, pr); gl.uniform1i(u.uPLCount, pl.length);

    const draw = (o) => {
      const m = o.material, g = o.geometry, a = g.attributes;
      gl.uniformMatrix4fv(u.uModel, false, o.world); gl.uniformMatrix3fv(u.uNormalMat, false, normalMat(o.world));
      gl.uniform3f(u.uColor, m.color.r, m.color.g, m.color.b);
      const e = m.emissive, ei = m.emissiveIntensity; gl.uniform3f(u.uEmissive, e.r * ei, e.g * ei, e.b * ei);
      gl.uniform1f(u.uOpacity, m.transparent ? m.opacity : 1);
      gl.uniform1f(u.uSideSign, m.side === BackSide ? -1 : 1);
      gl.uniform1i(u.uUseVC, m.vertexColors && a.color ? 1 : 0); gl.uniform1i(u.uUnlit, m.basic ? 1 : 0);
      gl.uniform1f(u.uPointSize, o.isPoints ? (m.size || 1) * this.pr : 1);
      gl.depthMask(m.depthWrite !== false);
      if (m.transparent) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND);
      if (o.isMesh) {
        if (m.side === DoubleSide) gl.disable(gl.CULL_FACE); else { gl.enable(gl.CULL_FACE); gl.cullFace(m.side === BackSide ? gl.FRONT : gl.BACK); }
      } else gl.disable(gl.CULL_FACE);
      this._buf(a.position, gl.ARRAY_BUFFER); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      if (a.normal) { this._buf(a.normal, gl.ARRAY_BUFFER); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0); } else { gl.disableVertexAttribArray(1); gl.vertexAttrib3f(1, 0, 1, 0); }
      if (a.color) { this._buf(a.color, gl.ARRAY_BUFFER); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0); } else { gl.disableVertexAttribArray(2); gl.vertexAttrib3f(2, 1, 1, 1); }
      if (o.isPoints) { gl.drawArrays(gl.POINTS, 0, a.position.count); return; }
      if (g.index) { this._buf(g.index, gl.ELEMENT_ARRAY_BUFFER); gl.drawElements(gl.TRIANGLES, g.index.array.length, g.index.array instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0); }
      else gl.drawArrays(gl.TRIANGLES, 0, a.position.count);
    };
    for (const o of opaque) draw(o);
    for (const o of trans) draw(o);
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
}
