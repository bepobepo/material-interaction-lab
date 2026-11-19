// Rig 2 — pull two surfaces apart with a substance between them. The bridge necks down as it
// stretches and fails either cohesively (tears, residue on both) or adhesively (peels off clean).
import * as THREE from 'three';
import { LANE_COLORS, LANE_X, solidMaterial, substanceMaterial, swapMaterial, makeLabel, standMaterial, disposeGroup } from './common.js';

const R0 = 0.03, GAP = 0.006, MAXSEP = 0.25, V0 = Math.PI * R0 * R0 * GAP, BASE_TOP = 0.02, RINGS = 36, SEG = 28, RMIN = 0.0013;

function revolveGeometry() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((RINGS + 1) * (SEG + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for (let r = 0; r < RINGS; r++) for (let s = 0; s < SEG; s++) {
    const a = r * (SEG + 1) + s, b = a + 1, c = a + SEG + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  geo.setIndex(idx);
  return geo;
}
function updateRevolve(geo, profile, height, dir) {
  const pos = geo.attributes.position.array; let k = 0;
  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS, rad = profile(t), y = dir * t * height;
    for (let s = 0; s <= SEG; s++) { const a = s / SEG * Math.PI * 2; pos[k++] = Math.cos(a) * rad; pos[k++] = y; pos[k++] = Math.sin(a) * rad; }
  }
  geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
}
// Bridge profile r(s) = rn + (rc - rn)·|2s-1|^p ; pick the neck radius (then p) that conserves volume.
const bridgeVol = (L, rc, rn, p) => Math.PI * L * (rn * rn + 2 * rn * (rc - rn) / (p + 1) + (rc - rn) ** 2 / (2 * p + 1));
function solveNeck(L, rc) {
  let p = 2.5;
  if (bridgeVol(L, rc, RMIN, p) <= V0) {
    let lo = RMIN, hi = rc;
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (bridgeVol(L, rc, m, p) > V0) hi = m; else lo = m; }
    return { rn: (lo + hi) / 2, p };
  }
  let lo = 2.5, hi = 300;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (bridgeVol(L, rc, RMIN, m) > V0) lo = m; else hi = m; }
  return { rn: RMIN, p: (lo + hi) / 2 };
}

class Lane {
  constructor(i) {
    this.root = new THREE.Group(); this.root.position.x = LANE_X[i];
    this.base = new THREE.Mesh(new THREE.BoxGeometry(0.13, BASE_TOP, 0.13), new THREE.MeshStandardMaterial());
    this.base.position.y = BASE_TOP / 2; this.base.receiveShadow = this.base.castShadow = true; this.root.add(this.base);
    this.top = new THREE.Group();
    this.topPlate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.1), new THREE.MeshStandardMaterial());
    this.topPlate.position.y = 0.006; this.topPlate.castShadow = true; this.top.add(this.topPlate);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 10), standMaterial()); rod.position.y = 0.072; this.top.add(rod);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 20, 14), new THREE.MeshStandardMaterial({ color: LANE_COLORS[i], roughness: 0.4 }));
    knob.position.y = 0.135; this.top.add(knob);
    this.root.add(this.top);
    this.lower = new THREE.Mesh(revolveGeometry(), new THREE.MeshStandardMaterial()); this.lower.position.y = BASE_TOP; this.lower.frustumCulled = false; this.lower.castShadow = true; this.root.add(this.lower);
    this.upper = new THREE.Mesh(revolveGeometry(), new THREE.MeshStandardMaterial()); this.upper.frustumCulled = false; this.upper.castShadow = true; this.top.add(this.upper);
    const label = makeLabel(i ? 'B' : 'A', LANE_COLORS[i]); label.position.set(0, 0.012, 0.085); this.root.add(label);
    this.reset();
  }
  setPair(sub, solid, inter) {
    this.sub = sub; this.inter = inter;
    swapMaterial(this.base, solidMaterial(solid)); swapMaterial(this.topPlate, solidMaterial(solid));
    const m = substanceMaterial(sub); swapMaterial(this.lower, m); this.upper.material = m;
    this.rate = Math.min(15, Math.max(0.5, 12 / Math.pow(1 + sub.viscosity, 0.35)));
    this.reset();
  }
  reset() { this.sep = GAP; this.broken = false; this.mode = null; this.force = 0; this.peak = 0; this.breakAt = null; this.parts = null; this.draw(); }
  step(dt, target) {
    if (!this.inter) return;
    const d = target - this.sep, max = 0.1 * dt;
    this.sep += Math.abs(d) < max ? d : Math.sign(d) * max;
    if (!this.broken) {
      const lam = this.sep / GAP, I = this.inter, lamPk = 1.3 + 2 * this.sub.stringiness;
      const x = Math.max(0, (lam - 1) / (lamPk - 1));
      this.force = I.peakForce * x * Math.exp(1 - x);
      this.peak = Math.max(this.peak, this.force);
      if (lam >= I.breakStretch) {
        this.broken = true; this.mode = I.failure; this.breakAt = this.sep; this.force = 0;
        const rc = this.rc;
        this.parts = I.failure === 'cohesive'
          ? { lo: { rc, V: V0 / 2, hd: this.sep / 2 }, up: { rc, V: V0 / 2, hd: this.sep / 2 } }
          : { lo: { rc, V: V0, hd: this.sep }, up: null };
      }
    } else {
      const f = 1 - Math.exp(-this.rate * dt);
      for (const p of [this.parts.lo, this.parts.up]) {
        if (!p) continue;
        p.rc += (R0 * 0.85 - p.rc) * f * 0.5;
        const rest = 2 * p.V / (Math.PI * p.rc * p.rc);
        p.hd += (rest - p.hd) * f;
      }
    }
    this.draw();
  }
  draw() {
    this.top.position.y = BASE_TOP + this.sep;
    if (!this.broken) {
      const rc = this.rc = R0 * Math.max(0.55, Math.pow(GAP / this.sep, 0.18));
      const { rn, p } = solveNeck(this.sep, rc);
      const prof = (t) => rn + (rc - rn) * Math.pow(1 - t, p);
      updateRevolve(this.lower.geometry, prof, this.sep / 2, 1);
      updateRevolve(this.upper.geometry, prof, this.sep / 2, -1);
      this.upper.visible = true;
    } else {
      const dome = (p) => { const q = Math.max(0.5, (Math.PI * p.rc * p.rc * p.hd / p.V - 1) / 2); return (t) => p.rc * Math.pow(1 - t, q); };
      updateRevolve(this.lower.geometry, dome(this.parts.lo), this.parts.lo.hd, 1);
      this.upper.visible = !!this.parts.up;
      if (this.parts.up) updateRevolve(this.upper.geometry, dome(this.parts.up), this.parts.up.hd, -1);
    }
  }
  result() { return { sep: this.sep * 100, force: this.force, peak: this.peak, broken: this.broken, mode: this.mode, breakAt: this.breakAt === null ? null : this.breakAt * 100 }; }
}

export class PullRig {
  constructor() {
    this.group = new THREE.Group();
    this.lanes = [new Lane(0), new Lane(1)]; this.lanes.forEach((l) => this.group.add(l.root));
    this.target = GAP; this.t = 0; this.traces = [[], []];
  }
  setPair(i, a, b, inter) { this.lanes[i].setPair(a, b, inter); }
  setControl(v) { this.target = GAP + v * (MAXSEP - GAP); }
  controlLabel(v) { return ((GAP + v * (MAXSEP - GAP)) * 100).toFixed(1) + ' cm'; }
  reset() { this.target = GAP; this.traces = [[], []]; this.lanes.forEach((l) => l.reset()); }
  step(dt) {
    this.lanes.forEach((l) => l.step(dt, this.target));
    this.t += dt;
    if (this.t > 0.03) {
      this.t = 0;
      this.lanes.forEach((l, i) => {
        const tr = this.traces[i], r = l.result(), last = tr[tr.length - 1];
        if (!last || Math.abs(last.x - r.sep) > 0.03) { tr.push({ x: r.sep, y: r.force }); if (tr.length > 1500) tr.shift(); }
      });
    }
  }
  result(i) { return this.lanes[i].result(); }
  focus() { return new THREE.Vector3(0, BASE_TOP + GAP / 2, 0); }
  live(i) {
    const r = this.result(i);
    if (r.broken) return (r.mode === 'cohesive' ? 'Tore apart' : 'Peeled off clean') + ' at ' + r.breakAt.toFixed(1) + ' cm';
    return r.force.toFixed(2) + ' N holding';
  }
  trace() { return { title: 'Force needed as you pull apart', x: 'separation (cm)', y: 'force (N)', xMax: MAXSEP * 100, yMax: 10, series: this.traces }; }
  dispose() { disposeGroup(this.group); }
}
