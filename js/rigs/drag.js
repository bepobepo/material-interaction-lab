// Rig 3 — drag a block across a surface through a spring. Coulomb friction with separate
// static and kinetic coefficients, which naturally produces stick-slip.
import * as THREE from 'three';
import { LANE_COLORS, LANE_X, solidMaterial, swapMaterial, makeLabel, standMaterial, disposeGroup } from './common.js';

const G = 9.81, SL = 0.5, SW = 0.14, STH = 0.02, BL = 0.06, BH = 0.045, MASS = 0.5, K = 60, L0 = 0.06, TRAVEL = 0.3, Z0 = -0.19;
const HANDLE0 = Z0 + BL / 2 + L0, NORMAL = MASS * G;

class Helix extends THREE.Curve {
  getPoint(t, target = new THREE.Vector3()) { const a = t * Math.PI * 2 * 9; return target.set(Math.cos(a) * 0.007, Math.sin(a) * 0.007, t); }
}

class Lane {
  constructor(i) {
    this.root = new THREE.Group(); this.root.position.x = LANE_X[i];
    this.slab = new THREE.Mesh(new THREE.BoxGeometry(SW, STH, SL), new THREE.MeshStandardMaterial());
    this.slab.position.y = STH / 2; this.slab.receiveShadow = true; this.slab.castShadow = true; this.root.add(this.slab);
    this.film = new THREE.Mesh(new THREE.BoxGeometry(SW * 0.98, 0.0012, SL * 0.98),
      new THREE.MeshPhysicalMaterial({ color: 0x7cc4f5, transparent: true, opacity: 0.45, roughness: 0.02, clearcoat: 1 }));
    this.film.position.y = STH + 0.0006; this.film.visible = false; this.root.add(this.film);
    this.block = new THREE.Mesh(new THREE.BoxGeometry(BL, BH, BL), new THREE.MeshStandardMaterial());
    this.block.position.y = STH + BH / 2; this.block.castShadow = true; this.root.add(this.block);
    this.spring = new THREE.Mesh(new THREE.TubeGeometry(new Helix(), 200, 0.0011, 5), new THREE.MeshStandardMaterial({ color: 0xc9ccd3, metalness: 0.9, roughness: 0.3 }));
    this.spring.position.y = STH + BH / 2; this.root.add(this.spring);
    this.handle = new THREE.Group();
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.011, 20, 14), new THREE.MeshStandardMaterial({ color: LANE_COLORS[i], roughness: 0.4 }));
    knob.position.y = STH + BH / 2; knob.castShadow = true; this.handle.add(knob);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 8), standMaterial()); rod.position.y = STH + BH / 2 + 0.045; this.handle.add(rod);
    this.root.add(this.handle);
    const label = makeLabel(i ? 'B' : 'A', LANE_COLORS[i]); label.position.set(0, 0.06, -SL / 2 - 0.02); this.root.add(label);
    this.reset();
  }
  setPair(a, b, inter) {
    this.inter = inter;
    swapMaterial(this.block, solidMaterial(a)); swapMaterial(this.slab, solidMaterial(b));
    this.film.visible = !!inter.wet; this.reset();
  }
  reset() { this.z = Z0; this.v = 0; this.stuck = true; this.h = HANDLE0; this.force = 0; this.breakForce = null; this.slideSum = 0; this.slideN = 0; this.sync(); }
  step(dt, target) {
    if (!this.inter) return;
    const { muS, muK } = this.inter, n = 16, dts = dt / n;
    for (let s = 0; s < n; s++) {
      const dh = target - this.h, maxH = 0.22 * dts;
      this.h += Math.abs(dh) < maxH ? dh : Math.sign(dh) * maxH;
      const F = K * Math.max(0, this.h - (this.z + BL / 2) - L0);
      this.force = F;
      if (this.stuck) {
        if (F > muS * NORMAL) { this.stuck = false; if (this.breakForce === null) this.breakForce = F; }
      } else {
        this.v += (F - muK * NORMAL) / MASS * dts;
        if (this.v <= 0) { this.v = 0; this.stuck = true; }
        else { this.z += this.v * dts; this.slideSum += F; this.slideN++; }
      }
    }
    this.sync();
  }
  sync() {
    this.block.position.z = this.z; this.handle.position.z = this.h;
    this.spring.position.z = this.z + BL / 2; this.spring.scale.z = Math.max(0.01, this.h - (this.z + BL / 2));
  }
  result() {
    return { force: this.force, breakForce: this.breakForce, slideForce: this.slideN > 200 ? this.slideSum / this.slideN : null,
      moved: (this.z - Z0) * 100, travel: (this.h - HANDLE0) * 100, moving: !this.stuck, stuck: this.stuck, speed: this.v };
  }
}

export class DragRig {
  constructor() {
    this.group = new THREE.Group();
    this.lanes = [new Lane(0), new Lane(1)]; this.lanes.forEach((l) => this.group.add(l.root));
    this.target = HANDLE0; this.t = 0; this.traces = [[], []];
  }
  setPair(i, a, b, inter) { this.lanes[i].setPair(a, b, inter); }
  setControl(v) { this.target = HANDLE0 + v * TRAVEL; }
  controlLabel(v) { return (v * TRAVEL * 100).toFixed(0) + ' cm'; }
  reset() { this.target = HANDLE0; this.traces = [[], []]; this.lanes.forEach((l) => l.reset()); }
  step(dt) {
    this.lanes.forEach((l) => l.step(dt, this.target));
    this.t += dt;
    if (this.t > 0.03) {
      this.t = 0;
      this.lanes.forEach((l, i) => {
        const tr = this.traces[i], r = l.result(), last = tr[tr.length - 1];
        if (!last || Math.abs(last.x - r.travel) > 0.05 || Math.abs(last.y - r.force) > 0.03) { tr.push({ x: r.travel, y: r.force }); if (tr.length > 1500) tr.shift(); }
      });
    }
  }
  result(i) { return this.lanes[i].result(); }
  focus() { return new THREE.Vector3(0, STH, (this.lanes[0].z + this.lanes[1].z) / 2); }
  live(i) { const r = this.result(i); return r.force.toFixed(2) + ' N pull · ' + (r.moving ? 'sliding' : 'gripping'); }
  trace() { return { title: 'Pull force as the handle moves', x: 'handle travel (cm)', y: 'force (N)', xMax: TRAVEL * 100, yMax: 6, series: this.traces }; }
  dispose() { disposeGroup(this.group); }
}
