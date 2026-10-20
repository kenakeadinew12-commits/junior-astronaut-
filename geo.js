// Procedural geometry builder: collects flat-shaded triangles with per-vertex colours into one
// THREE.BufferGeometry. Everything in the world (rocks, habitat, rover, hands...) is made with this,
// so there are no external model/texture files to download.
import * as THREE from 'three';

function mulVec(xf, v) {
  // scale -> rotate Z -> X -> Y -> translate
  let [x, y, z] = [v[0] * xf.sx, v[1] * xf.sy, v[2] * xf.sz];
  if (xf.rz) { const c = Math.cos(xf.rz), s = Math.sin(xf.rz); [x, y] = [x * c - y * s, x * s + y * c]; }
  if (xf.rx) { const c = Math.cos(xf.rx), s = Math.sin(xf.rx); [y, z] = [y * c - z * s, y * s + z * c]; }
  if (xf.ry) { const c = Math.cos(xf.ry), s = Math.sin(xf.ry); [x, z] = [x * c + z * s, -x * s + z * c]; }
  return [x + xf.x, y + xf.y, z + xf.z];
}
function rotVec(xf, v) {
  let [x, y, z] = [v[0] / xf.sx, v[1] / xf.sy, v[2] / xf.sz];
  if (xf.rz) { const c = Math.cos(xf.rz), s = Math.sin(xf.rz); [x, y] = [x * c - y * s, x * s + y * c]; }
  if (xf.rx) { const c = Math.cos(xf.rx), s = Math.sin(xf.rx); [y, z] = [y * c - z * s, y * s + z * c]; }
  if (xf.ry) { const c = Math.cos(xf.ry), s = Math.sin(xf.ry); [x, z] = [x * c + z * s, -x * s + z * c]; }
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
export const T = (o = {}) => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, ...o });

export class MeshBuilder {
  constructor() { this.p = []; this.n = []; this.c = []; }

  /** One flat-shaded triangle (a, b, c are [x,y,z], already in final space). */
  tri(a, b, c, col, nrm) {
    let n = nrm;
    if (!n) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / l, n[1] / l, n[2] / l];
    }
    for (const v of [a, b, c]) { this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); this.c.push(col[0], col[1], col[2]); }
  }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }

  /** Axis-aligned box in local space (then transformed by xf). col may be [r,g,b] or a per-face function. */
  box(xf, w, h, d, col) {
    xf = T(xf);
    const hx = w / 2, hy = h / 2, hz = d / 2;
    const faces = [
      [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz], [1, 0, 0]],
      [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz], [-1, 0, 0]],
      [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [0, 1, 0]],
      [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [0, -1, 0]],
      [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [0, 0, 1]],
      [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [0, 0, -1]],
    ];
    for (const f of faces) {
      const [a, b, c, d, nn] = [mulVec(xf, f[0]), mulVec(xf, f[1]), mulVec(xf, f[2]), mulVec(xf, f[3]), rotVec(xf, f[4])];
      const cc = typeof col === 'function' ? col(f[4]) : col;
      this.tri(a, b, c, cc, nn); this.tri(a, c, d, cc, nn);
    }
    return this;
  }

  /** Upright cylinder / cone frustum centred on the origin (then transformed). */
  cyl(xf, rTop, rBot, h, seg, col, caps = true) {
    xf = T(xf);
    const hy = h / 2;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const [c0, s0, c1, s1] = [Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1)];
      const p00 = mulVec(xf, [c0 * rBot, -hy, s0 * rBot]), p10 = mulVec(xf, [c1 * rBot, -hy, s1 * rBot]);
      const p01 = mulVec(xf, [c0 * rTop, hy, s0 * rTop]), p11 = mulVec(xf, [c1 * rTop, hy, s1 * rTop]);
      const slope = (rBot - rTop) / h;
      const n0 = rotVec(xf, [c0, slope, s0]), n1 = rotVec(xf, [c1, slope, s1]);
      this.tri(p00, p10, p11, col, n0); this.tri(p00, p11, p01, col, n1);
      if (caps) {
        if (rTop > 0) this.tri(mulVec(xf, [0, hy, 0]), p01, p11, col, rotVec(xf, [0, 1, 0]));
        if (rBot > 0) this.tri(mulVec(xf, [0, -hy, 0]), p10, p00, col, rotVec(xf, [0, -1, 0]));
      }
    }
    return this;
  }

  /** UV sphere (smooth normals). colFn(nx,ny,nz) -> [r,g,b] allows painted planets. */
  sphere(xf, r, wSeg, hSeg, col) {
    xf = T(xf);
    const pt = (i, j) => {
      const th = (j / hSeg) * Math.PI, ph = (i / wSeg) * Math.PI * 2;
      return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    };
    const emit = (a, b, c) => {
      for (const u of [a, b, c]) {
        const p = mulVec(xf, [u[0] * r, u[1] * r, u[2] * r]);
        const n = rotVec(xf, u);
        const cc = typeof col === 'function' ? col(u[0], u[1], u[2]) : col;
        this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.c.push(cc[0], cc[1], cc[2]);
      }
    };
    for (let j = 0; j < hSeg; j++) for (let i = 0; i < wSeg; i++) {
      const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
      if (j > 0) emit(a, c, b);
      if (j < hSeg - 1) emit(a, d, c);
    }
    return this;
  }

  /** Lumpy rock: subdivided icosahedron pushed around by a random field, flat shaded. */
  rock(xf, radius, rnd, col, subdiv = 1, squash = 0.7) {
    xf = T(xf);
    const t = (1 + Math.sqrt(5)) / 2;
    let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
      .map((p) => { const l = Math.hypot(...p); return [p[0] / l, p[1] / l, p[2] / l]; });
    let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let s = 0; s < subdiv; s++) {
      const cache = new Map(), nf = [];
      const mid = (a, b) => {
        const k = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (cache.has(k)) return cache.get(k);
        const m = [(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2];
        const l = Math.hypot(...m); v.push([m[0] / l, m[1] / l, m[2] / l]);
        cache.set(k, v.length - 1); return v.length - 1;
      };
      for (const [a, b, c] of f) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
      f = nf;
    }
    const stretch = [0.8 + rnd() * 0.5, squash * (0.8 + rnd() * 0.4), 0.8 + rnd() * 0.5];
    const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
    const disp = v.map((u) => {
      const lump = 1 + 0.22 * Math.sin(u[0] * 3.1 + ph[0]) * Math.cos(u[1] * 2.7 + ph[1]) + 0.12 * Math.sin(u[2] * 5.3 + ph[2]);
      return [u[0] * radius * stretch[0] * lump, u[1] * radius * stretch[1] * lump, u[2] * radius * stretch[2] * lump];
    });
    for (const [a, b, c] of f) {
      const shade = 0.82 + rnd() * 0.36;
      const cc = [col[0] * shade, col[1] * shade, col[2] * shade];
      this.tri(mulVec(xf, disp[a]), mulVec(xf, disp[b]), mulVec(xf, disp[c]), cc);
    }
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    return g;
  }
}

export const mat = (opts = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0, ...opts });
export const basic = (opts = {}) => new THREE.MeshBasicMaterial({ vertexColors: true, ...opts });
export function meshOf(builder, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(builder.build(), material);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
