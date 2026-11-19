// Rig 1 — tilting plate. Each lane is a thin-film height field: gravity drives it downslope,
// viscosity slows it, a yield stress (Bingham) blocks it, and wetting decides how it spreads.
import * as THREE from 'three';
import { LANE_COLORS, LANE_X, solidMaterial, substanceMaterial, swapMaterial, makeLabel, standMaterial, disposeGroup } from './common.js';

const G = 9.81, W = 0.16, NX = 40, NY = 80, DX = W / NX, LEN = NY * DX, TH = 0.012;
const MAX_ANGLE = 80 * Math.PI / 180, PIVOT_Y = 0.2, SUBSTEPS = 30, WET_EPS = 4e-5;

// 5-point blur with clamped edges
function blur(src, dst) {
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i;
    dst[k] = 0.4 * src[k] + 0.15 * (src[i > 0 ? k - 1 : k] + src[i < NX - 1 ? k + 1 : k] + src[j > 0 ? k - NX : k] + src[j < NY - 1 ? k + NX : k]);
  }
}

class Lane {
  constructor(i) {
    this.i = i;
    this.root = new THREE.Group(); this.root.position.x = LANE_X[i];
    this.pivot = new THREE.Group(); this.pivot.position.y = PIVOT_Y; this.root.add(this.pivot);

    this.plate = new THREE.Mesh(new THREE.BoxGeometry(W, TH, LEN), new THREE.MeshStandardMaterial());
    this.plate.position.y = -TH / 2; this.plate.castShadow = this.plate.receiveShadow = true;
    this.pivot.add(this.plate);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.006, PIVOT_Y - 0.02, 12), standMaterial());
    post.position.y = (PIVOT_Y - 0.02) / 2; post.castShadow = true; this.root.add(post);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.008, 24), standMaterial());
    base.position.y = 0.004; base.receiveShadow = true; this.root.add(base);

    const label = makeLabel(i ? 'B' : 'A', LANE_COLORS[i]); label.position.set(0, 0.03, -LEN / 2 - 0.02); this.pivot.add(label);

    // fluid surface mesh: one vertex per cell
    this.h = new Float32Array(NX * NY); this.disp = new Float32Array(NX * NY); this.mask = new Float32Array(NX * NY); this.tmp = new Float32Array(NX * NY);
    const pos = new Float32Array(NX * NY * 3);
    for (let j = 0; j < NY; j++) for (let i2 = 0; i2 < NX; i2++) {
      const k = (j * NX + i2) * 3;
      pos[k] = (i2 + 0.5) * DX - W / 2; pos[k + 1] = 0; pos[k + 2] = (j + 0.5) * DX - LEN / 2;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(new THREE.BufferAttribute(new Uint16Array((NX - 1) * (NY - 1) * 6), 1).setUsage(THREE.DynamicDrawUsage));
    this.fluid = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial());
    this.fluid.frustumCulled = false; this.fluid.castShadow = true;
    this.pivot.add(this.fluid);
    this.lost = 0; this.v0 = 1; this.onset = null; this.c0 = 0; this.angle = 0;
  }

  setPair(sub, solid, inter) {
    this.sub = sub; this.solid = solid; this.inter = inter;
    swapMaterial(this.plate, solidMaterial(solid));
    swapMaterial(this.fluid, substanceMaterial(sub));
    this.seed();
  }

  seed() {
    const h = this.h; h.fill(0);
    const cx = NX / 2 - 0.5, cy = NY * 0.22, r = 0.03 / DX, peak = 0.010;
    let sum = 0;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const d2 = ((i - cx) ** 2 + (j - cy) ** 2) / (r * r);
      if (d2 < 1) { h[j * NX + i] = peak * (1 - d2); sum += h[j * NX + i]; }
    }
    this.v0 = sum; this.lost = 0; this.onset = null; this.c0 = this.centroid(); this.angle = 0;
    this.draw();
  }

  centroid() {
    const h = this.h; let s = 0, m = 0;
    for (let j = 0; j < NY; j++) { let row = 0; for (let i = 0; i < NX; i++) row += h[j * NX + i]; s += row; m += row * j; }
    return s > 0 ? (m / s) * DX : null;
  }

  step(dt, angle) {
    this.angle = angle; this.pivot.rotation.x = angle;
    if (!this.inter) return;
    const h = this.h, I = this.inter, S = Math.sin(angle), C = Math.cos(angle);
    const rg = this.sub.density * G, mu = Math.max(this.sub.viscosity, 0.002), tauY = I.tauEff;
    const hFront = I.hFront * Math.max(0.12, C), hEdge = hFront * 0.3, hRes = I.hRes, hMin = I.beads ? 0.0006 : 0;
    const slip = 0.025 * (1 - I.wetting) ** 2;                 // slip length (m): none on a well-wetted surface
    const dts = dt / SUBSTEPS, mMax = 0.2 * DX * DX / (rg * dts), k = dts / DX;
    let lost = 0;

    // Move fluid across one cell face. Gf > 0 pushes from cell a to cell b; -1 means off the plate.
    const move = (a, b, Gf) => {
      let d = a, r = b;
      if (Gf < 0) { d = b; r = a; Gf = -Gf; }
      if (d < 0) return;
      const hd = h[d]; if (hd <= hRes) return;
      if (r < 0 ? hd < hEdge : (h[r] < 1e-5 && hd < hFront)) return;   // contact line holds until the edge is thick enough
      const he = hd > hMin ? hd : hMin, tb = he * Gf;
      if (tb <= tauY) return;                                  // below yield stress: stays put
      const B = tauY / tb;
      let m = he * he * he / (3 * mu) * (1 - 1.5 * B + 0.5 * B * B * B) + slip * he * he / mu * (1 - B);   // second term: sliding along a surface it barely grips
      if (m > mMax) m = mMax;
      let dq = m * Gf * k; const lim = 0.25 * (hd - hRes); if (dq > lim) dq = lim;
      h[d] -= dq; if (r >= 0) h[r] += dq; else lost += dq;
    };

    for (let s = 0; s < SUBSTEPS; s++) {
      for (let j = 0; j < NY; j++) {
        const row = j * NX;
        for (let i = 0; i < NX; i++) {
          const idx = row + i, h1 = h[idx];
          const hy = j < NY - 1 ? h[idx + NX] : 0, hx = i < NX - 1 ? h[idx + 1] : 0;
          if (h1 === 0 && hy === 0 && hx === 0) continue;
          move(idx, j < NY - 1 ? idx + NX : -1, rg * (S - C * (hy - h1) / DX));   // downslope face
          move(idx, i < NX - 1 ? idx + 1 : -1, rg * (-C * (hx - h[idx]) / DX));    // sideways face
        }
        if (h[row] > 0) move(-1, row, rg * (-C * h[row] / DX));                    // left edge
      }
      for (let i = 0; i < NX; i++) if (h[i] > 0) move(-1, i, rg * (S - C * h[i] / DX)); // top edge
    }

    // Non-wetting liquids: leftover thin patches gather into beads and roll off instead of staying.
    if (I.beads && S > 0.03) {
      const thin = 0.15 * hFront;
      for (let j = NY - 1; j >= 0; j--) for (let i = 0; i < NX; i++) {
        const idx = j * NX + i, v = h[idx];
        // only trailing residue: a thin cell fed by thick liquid just above it is the advancing front, so it stays
        if (v > 0 && v < thin && (j === 0 || h[idx - NX] < thin)) { h[idx] = 0; if (j < NY - 1) h[idx + NX] += v; else lost += v; }
      }
    }
    this.lost += lost;

    const c = this.centroid();
    if (angle < 0.01) this.c0 = c ?? this.c0;
    else if (this.onset === null && (c === null || c - this.c0 > 0.012)) this.onset = angle * 180 / Math.PI;
    this.draw();
  }

  draw() {
    const h = this.h, d = this.disp, m = this.mask, t = this.tmp, pos = this.geo.attributes.position.array, idx = this.geo.index.array;
    for (let k = 0; k < h.length; k++) t[k] = h[k] > WET_EPS ? 1 : 0;
    blur(t, m); blur(m, t); blur(h, d);
    for (let k = 0; k < h.length; k++) pos[k * 3 + 1] = t[k] * d[k] + (t[k] - 0.5) * 0.0007;
    let n = 0;
    for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
      const a = j * NX + i, b = a + 1, c = a + NX, e = c + 1;
      if (t[a] > 0.05 || t[b] > 0.05 || t[c] > 0.05 || t[e] > 0.05) {
        idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = e;
      }
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true; this.geo.index.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  result() {
    let sum = 0, wet = 0;
    for (let k = 0; k < this.h.length; k++) { sum += this.h[k]; if (this.h[k] > WET_EPS) wet++; }
    return { angle: this.angle * 180 / Math.PI, onset: this.onset, onPlate: Math.min(1, sum / this.v0), wetArea: wet * DX * DX * 1e4 };
  }
}

export class TiltRig {
  constructor() {
    this.group = new THREE.Group();
    this.lanes = [new Lane(0), new Lane(1)];
    this.lanes.forEach((l) => this.group.add(l.root));
    this.target = 0; this.angle = 0; this.t = 0; this.clock = 0; this.traces = [[], []];
  }
  setPair(i, a, b, inter) { this.lanes[i].setPair(a, b, inter); }
  setControl(v) { this.target = v * MAX_ANGLE; }
  controlLabel(v) { return Math.round(v * 80) + '°'; }
  reset() { this.angle = this.target = 0; this.clock = 0; this.traces = [[], []]; this.lanes.forEach((l) => { l.pivot.rotation.x = 0; if (l.sub) l.seed(); }); }
  step(dt) {
    const d = this.target - this.angle, max = 1.2 * dt;
    this.angle += Math.abs(d) < max ? d : Math.sign(d) * max;
    this.lanes.forEach((l) => l.step(dt, this.angle));
    this.t += dt; this.clock += dt;
    if (this.t > 0.1) {
      this.t = 0;
      this.lanes.forEach((l, i) => {
        const tr = this.traces[i], x = this.angle * 180 / Math.PI, y = l.result().onPlate * 100, last = tr[tr.length - 1];
        if (!last || Math.abs(last.x - x) > 0.2 || Math.abs(last.y - y) > 0.5) { tr.push({ x, y, s: this.clock }); if (tr.length > 800) tr.shift(); }
      });
    }
  }
  result(i) { return this.lanes[i].result(); }
  focus() { return new THREE.Vector3(0, PIVOT_Y + 0.006, 0); }
  live(i) { const r = this.result(i); return Math.round(r.onPlate * 100) + '% still on the plate'; }
  trace(byTime) {   // against tilt for a sweep; against time when the tilt is held
    if (!byTime) return { title: 'How much stays on the plate', x: 'tilt (°)', y: '% on plate', xMax: 80, yMax: 100, series: this.traces };
    const series = this.traces.map((tr, i) => tr.length ? [...tr.map((p) => ({ x: p.s, y: p.y })), { x: this.clock, y: this.lanes[i].result().onPlate * 100 }] : []);
    return { title: 'How much stays on the plate over time', x: 'time (s)', y: '% on plate', xMax: Math.max(20, Math.ceil(this.clock / 20) * 20), yMax: 100, series };
  }
  dispose() { disposeGroup(this.group); }
}
