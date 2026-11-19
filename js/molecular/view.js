// Molecular view: two live particle scenes (lane A and B) drawn into split viewports of the main
// renderer. Each scene is built from the pair model and driven by the rig's live state.
import * as THREE from 'three';
import { Sim, POLAR, OILY, SURF, SITE, HYD, RING, G_SURF, G_SUB, G_TOP, DT } from './sim.js';
import { buildSurface, fillSubstance, fillParts, dynamics, ampRows, WATER_PART } from './species.js';
import { stateLine, countsLine } from './captions.js';
import { hex } from '../materials.js';

const BG = 0x0b1020, FOV = 20, ELEV = 9 * Math.PI / 180, NM = 3.3, FLOOR = -3.6;
const IDEAL = { tilt: 3, drag: 3, pull: 1.05 }, HNEED = { tilt: 15, drag: 15, pull: 27 };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sphere = new THREE.SphereGeometry(1, 16, 12);
const tmpColor = new THREE.Color();

function rng32(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Pull rig: the bridge between the surfaces. Half-width profile along its height (0 bottom … 1 top),
// chosen so the area stays the same as it stretches by a factor f.
const ease = (t) => t * t * (3 - 2 * t);
function bridgeShape(hw, f) {
  if (f <= 1) return { wc: hw / f, wn: hw / f, p: 2 };
  const p = 2 + 1.2 * (f - 1), mean = hw / f;                    // feet stay wide, the middle draws into a thread
  let wc = hw * Math.max(0.72, Math.pow(f, -0.12)), wn = (mean - wc / (p + 1)) * (p + 1) / p;
  if (wn < 1) { wn = 1; wc = Math.max(wn, (mean - wn * p / (p + 1)) * (p + 1)); }
  return { wc, wn, p };
}
const bridgeW = (S, s) => S.wn + (S.wc - S.wn) * Math.pow(Math.abs(2 * s - 1), S.p);
function cumulative(width) {      // table of the area fraction below each height
  const N = 49, c = new Float32Array(N); let acc = 0;
  for (let k = 1; k < N; k++) { acc += (width((k - 1) / (N - 1)) + width(k / (N - 1))) / 2; c[k] = acc; }
  for (let k = 1; k < N; k++) c[k] /= acc;
  return c;
}
function invert(c, q) {           // height at which the area fraction below is q
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] < q) lo = m; else hi = m; }
  const d = c[hi] - c[lo]; return (lo + (d > 0 ? (q - c[lo]) / d : 0)) / (c.length - 1);
}
const DOME = cumulative((s) => 1 - s * s + 0.02);   // the mound it relaxes into after letting go

function lines(capacity, color, opacity) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 6), 3).setUsage(THREE.DynamicDrawUsage));
  const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  l.frustumCulled = false; l.userData.cap = capacity;
  return l;
}

class LaneScene {
  constructor(i) {
    this.i = i; this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(BG);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 800);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3350, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-0.5, 1, 0.9); this.scene.add(sun);
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.t = 0; this.fh = 0; this.sim = null;
  }
  clear() {
    for (const o of [...this.group.children]) { this.group.remove(o); if (o.geometry !== sphere) o.geometry.dispose(); o.material.dispose(); if (o.dispose) o.dispose(); }
  }

  build(rigId, lane, W) {
    this.clear(); this.rigId = rigId; this.W = W;
    const rng = rng32(977 + this.i * 131 + W * 7), { a, b, inter: I } = lane;
    const sim = this.sim = new Sim(W, -6, rigId === 'pull' ? 46 : 26);
    this.statics = []; this.decos = []; this.legend = []; this.broken = false; this.carry = 0; this.yT = 0; this.fh = 0;
    const note = (items) => { for (const l of items) if (!this.legend.some((q) => q.label === l.label)) this.legend.push(l); };
    const take = (s) => { this.statics.push(...s.statics); this.decos.push(...s.decos); note(s.legend); return s; };
    const bot = take(buildSurface(sim, b, { W, base: 0, dir: 1, grp: G_SURF, rng, depth: true, minAmp: rigId === 'drag' ? 1 : 0 }));   // even 'smooth' solids have atomic steps

    if (rigId === 'drag') {
      const film = I.wet ? 1.3 * (1 - Math.min(1, I.drain)) : 0;
      this.ampSum = bot.amp + Math.max(1, ampRows(a)); this.yT = this.ampSum * 0.87 + 1.0 + film;
      const top = take(buildSurface(sim, a, { W, base: this.yT, dir: -1, grp: G_TOP, rng, body: true, minAmp: 1 }));
      this.hb = bot.h; this.ht = top.h; sim.off[5] = this.ride(0);
      const e = I.selfLub ? 0.25 : I.lowEnergy ? 0.12 : 0.4 + 2.2 * I.energy;
      const grips = e >= 0.3 ? 1 : 0;                                      // slippery pairs touch without gripping
      sim.setEps(SURF, SURF, e, grips); sim.setEps(SURF, SITE, e * 1.2, grips); sim.setEps(SITE, SITE, e * 1.5, grips);
      sim.kT = 0.16; sim.gamma = 1.5; sim.load = 1.8;
      if (I.wet) {
        sim.setEps(POLAR, POLAR, 1.07); sim.setEps(POLAR, SURF, 0.8); sim.setEps(POLAR, SITE, 1.4);
        const part = { ...WATER_PART, frac: clamp(1 - 0.7 * I.drain, 0.25, 1) };
        const inside = (x, y, s) => y > bot.topY(x) + 0.5 + s && y < top.topY(x) - 0.5 - s;
        note(fillParts(sim, [part], inside, { x0: 0, x1: W, y0: 0, y1: this.yT }, rng).legend);
      }
      this.legendLines = [['#ffd75e', 'contact gripping']];
    } else {
      const dyn = dynamics(a), pull = rigId === 'pull'; sim.kT = dyn.kT; sim.gamma = dyn.gamma;
      // Pull rig: kept liquid enough to neck, and anchored to both surfaces until the rig says it fails.
      const ec = pull ? 0.45 + 0.25 * a.cohesion : 1 + 1.5 * a.cohesion;
      const aS = pull ? 1.8 : ec * (0.3 + 1.7 * I.wetting), aP = pull ? 1.2 : ec * 0.9 * I.wetting;
      if (pull) { sim.kT = Math.max(dyn.kT, 0.2); sim.gamma = 4; }
      sim.setEps(POLAR, POLAR, ec, 2); sim.setEps(OILY, OILY, ec * 0.9, 2); sim.setEps(POLAR, OILY, ec * 0.6, 2);
      sim.setEps(POLAR, SITE, aS, 1); sim.setEps(OILY, SITE, aS * 0.8, 1); sim.setEps(POLAR, SURF, aP); sim.setEps(OILY, SURF, aP);
      // a sugar ring is six beads, so each bead carries a share of the molecule's attraction
      sim.setEps(RING, RING, ec / 3, 2); sim.setEps(RING, POLAR, ec / 1.8, 2); sim.setEps(RING, OILY, ec / 3, 2); sim.setEps(RING, SITE, aS / 2.5, 1); sim.setEps(RING, SURF, aP / 2.5);
      const cx = W / 2; let inside, box;
      if (rigId === 'tilt') {
        sim.gy = -0.22;
        const A = W * (1.5 + 4.5 * I.wetting), th = clamp(I.contactAngle, 30, 118) * Math.PI / 180;
        const R0 = Math.sqrt(A / (th - Math.sin(th) * Math.cos(th))), film = th < Math.PI / 2 && R0 * Math.sin(th) > 0.42 * W, R = Math.min(8, R0), half = R * Math.sin(th);
        const fw = 0.42 * W, ft = A / (2 * fw);
        inside = (x, y, s) => {
          const yy = y - bot.topY(x) - 0.5 - s, dx = x - cx; if (yy < 0) return false;
          if (film) { const e = fw - Math.abs(dx); return e > 0 && yy < ft * Math.min(1, Math.sqrt(e / ft)); }
          return dx * dx + (yy + R * Math.cos(th)) ** 2 < R * R;
        };
        const reach = film ? fw : Math.max(half, R);
        box = { x0: cx - reach - 0.5, x1: cx + reach + 0.5, y0: 0, y1: bot.amp * 0.87 + (film ? ft : R * (1 - Math.cos(th))) + 2.5 };
      } else {
        this.g0 = 7.5; this.yT = this.g0 + bot.amp * 2 * 0.87; this.H0 = this.g0 - 1.8;
        const top = this.top = take(buildSurface(sim, b, { W, base: this.yT, dir: -1, grp: G_TOP, rng }));
        const hw = 0.3 * W;
        inside = (x, y, s) => Math.abs(x - cx) < hw && y > bot.topY(x) + 0.5 + s && y < top.topY(x) - 0.5 - s;
        box = { x0: cx - hw, x1: cx + hw, y0: 0, y1: this.yT };
        sim.off[5] = -0.9;                                                   // start squashed so it grips both surfaces
      }
      const start = sim.n;
      const info = fillSubstance(sim, a, inside, box, rng, pull); note(info.legend); sim.alive = info.mols;
      if (pull) {                                                          // remember where each molecule sits in the bridge
        const M = this.M = { cx, hw: 0.3 * W, ids: [], t: [], u: [], lo: [], hi: [], half: [] };
        for (let i = start; i < sim.n; i++) {
          const m = sim.mol[i]; if (sim.cls[i] === HYD || (sim.rigid[m] && i !== sim.molFirst[m])) continue;
          const lo = bot.topY(sim.x[i]) + 0.9, hi = this.top.topY(sim.x[i]) - 0.9;
          M.ids.push(i); M.t.push(clamp((sim.y[i] - lo) / (hi - lo), 0, 1)); M.u.push(clamp((sim.x[i] - cx) / M.hw, -1, 1)); M.lo.push(lo); M.hi.push(hi); M.half.push(0);
          const n = sim.rigid[m] ? sim.molCount[m] : 1; sim.tk[i] = 4 * n; sim.tcap[i] = 4 * n;   // one handle moves the whole molecule
        }
      }
      this.legendLines = [['#ffd75e', 'bond to the surface'], ['#8fb4ff', 'attraction between molecules']];
    }
    this.n0 = sim.alive;
    this.makeMeshes();
    for (let k = 0; k < 60; k++) sim.step(DT, k === 59);
    sim.flashes.length = 0;
    this.sync();
  }

  makeMeshes() {
    const s = this.sim, total = s.n + this.statics.length + this.decos.length;
    const mesh = this.mesh = new THREE.InstancedMesh(sphere, new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.05 }), total);
    mesh.frustumCulled = false; let o = 0;
    for (let i = 0; i < s.n; i++) mesh.setColorAt(o++, tmpColor.setHex(s.col[i]));
    for (const q of this.statics) mesh.setColorAt(o++, tmpColor.setHex(q.color));
    for (const q of this.decos) mesh.setColorAt(o++, tmpColor.setHex(q.color));
    this.bondLines = lines(Math.max(1, s.bonds.length / 4), 0xdfe6f5, 0.45);
    this.cohLines = lines(800, 0x8fb4ff, 0.32);
    this.adhLines = lines(500, 0xffd75e, 0.95);
    this.flash = new THREE.InstancedMesh(sphere, new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthTest: false }), 48);
    this.flash.frustumCulled = false; this.flash.count = 0; this.flash.renderOrder = 5;
    this.group.add(mesh, this.bondLines, this.cohLines, this.adhLines, this.flash);
  }

  // push the rig's live state into the particle model
  drive(dt, lane, simT) {
    const s = this.sim, r = lane.result, I = lane.inter;
    if (this.rigId === 'tilt') {
      const moving = r.onset !== null;
      s.gx = (moving ? 1 : 0.12) * 2 * Math.sin(r.angle * Math.PI / 180);
      s.keep = Math.ceil(this.n0 * r.onPlate);
      if (moving && s.netStart >= 0) this.cutNet();
    } else if (this.rigId === 'pull') {
      const lam = r.sep / 0.6, bs = I.breakStretch, fB = 1.5 + 2.2 * clamp((bs - 1.8) / 36, 0, 1);
      const target = -0.6 + this.g0 * ((fB - 1) * clamp((lam - 1) / (bs - 1), 0, 1) + (r.broken ? Math.min(1.2, 0.25 + (lam - bs) / bs * 3) : 0));
      s.off[5] += (target - s.off[5]) * Math.min(1, dt * 10);
      const M = this.M, H0 = this.H0, coh = r.mode === 'cohesive';
      if (r.broken && !this.broken) {
        this.broken = true; this.rel = 0; this.fBreak = (H0 + s.off[5]) / H0;
        const A0 = 2 * M.hw * H0; this.wd = (coh ? 0.8 : 0.9) * M.hw; this.hd = 3 * A0 / ((coh ? 8 : 4) * this.wd);
        if (coh) {                                                         // tears through the middle: each molecule goes with its half
          for (let k = 0; k < M.ids.length; k++) {
            const m = s.mol[M.ids[k]]; let sum = 0, n = 0;
            if (s.rigid[m]) { sum = M.t[k]; n = 1; } else for (let q = 0; q < M.ids.length; q++) if (s.mol[M.ids[q]] === m) { sum += M.t[q]; n++; }
            M.half[k] = sum / n < 0.5 ? 1 : 2;
            for (let q = s.molFirst[m], e = q + s.molCount[m]; q < e; q++) s.side[q] = M.half[k];
          }
          this.cutNet();
        } else s.topAdh = 0;                                               // lets go of the top surface
      }
      const f = this.broken ? this.fBreak : Math.max(0.6, (H0 + s.off[5]) / H0), S = bridgeShape(M.hw, f), tab = cumulative((q) => bridgeW(S, q));
      if (this.broken) this.rel = Math.min(1, this.rel + dt / 0.9);
      const e = this.broken ? ease(this.rel) : 0;
      for (let k = 0; k < M.ids.length; k++) {
        const i = M.ids[k], t = M.t[k], u = M.u[k], lo = M.lo[k], hi = M.hi[k] + s.off[5], tau = invert(tab, t);
        let tx = M.cx + u * bridgeW(S, tau), ty = lo + tau * (hi - lo);
        if (e > 0) {
          const up = coh && M.half[k] === 2, q = coh ? (up ? (1 - t) * 2 : t * 2) : t, sg = invert(DOME, clamp(q, 0, 1));
          const dx = M.cx + u * this.wd * (1 - sg * sg), dy = up ? hi - sg * this.hd : lo + sg * this.hd;
          tx += (dx - tx) * e; ty += (dy - ty) * e;
        }
        s.ax[i] = tx; s.ay[i] = ty;
      }
    } else {
      const Fs = Math.max(0.05, I.muS * 4.905);
      if (!r.stuck) this.carry += clamp(r.speed * 60, 2, 8) * dt;
      const target = this.carry + 0.8 * Math.min(1, r.force / Fs);
      s.off[4] += (target - s.off[4]) * Math.min(1, dt * 14);
      s.off[5] += (this.ride(s.off[4]) - s.off[5]) * Math.min(1, dt * 12);
    }
  }
  // Drag rig: how far the block sits down, given how the two bumpy profiles line up after sliding by `shift`.
  ride(shift) {
    const W = this.W, k = Math.round(shift); let most = 0;
    for (let c = 0; c < W; c++) most = Math.max(most, this.hb[c] + this.ht[(((c - k) % W) + W) % W]);
    return -(this.ampSum - most) * 0.87;
  }
  cutNet() {
    const s = this.sim; if (s.netStart < 0) return;
    for (let k = s.netStart; k < s.bonds.length && s.flashes.length < 40; k += 4) { const i = s.bonds[k], j = s.bonds[k + 1]; if (Math.abs(s.x[i] - s.x[j]) < 8) s.flashes.push({ x: (s.x[i] + s.x[j]) / 2, y: (s.y[i] + s.y[j]) / 2, life: 1 }); }
    s.bonds.length = s.netStart; s.netStart = -1;
  }

  step(dt, lane) {
    const s = this.sim, steps = clamp(Math.round(dt * 240), 1, 8);
    this.drive(dt, lane, steps * DT);
    for (let k = 0; k < steps; k++) s.step(DT, k === steps - 1);
    for (const f of s.flashes) f.life -= dt / 0.35;
    s.flashes = s.flashes.filter((f) => f.life > 0);
    this.t += dt; this.sync();
  }

  sync() {
    const s = this.sim, W = s.W, hW = W / 2, m = this.mesh.instanceMatrix.array; let o = 0;
    const put = (x, y, z, r) => { m[o] = m[o + 5] = m[o + 10] = r; m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1; o += 16; };
    for (let i = 0; i < s.n; i++) put(s.x[i], s.y[i], s.z[i], s.active[i] && !s.hide[i] ? s.r[i] : 0);
    for (const q of this.statics) { let x = q.x + s.off[q.grp * 2]; x -= W * Math.floor(x / W); put(x, q.y + s.off[q.grp * 2 + 1], q.z, q.r); }
    for (const q of this.decos) { const p = q.parent; put(s.x[p] + q.dx, s.y[p] + q.dy, s.z[p] + 0.06, q.r); }
    this.mesh.instanceMatrix.needsUpdate = true;
    const seg = (line, list, stride, zLift) => {
      const pos = line.geometry.attributes.position.array, cap = line.userData.cap; let k = 0;
      for (let q = 0; q < list.length && k < cap; q += stride) {
        const i = list[q], j = list[q + 1]; if (!s.active[i] || !s.active[j] || Math.abs(s.x[i] - s.x[j]) > hW) continue;
        pos[k * 6] = s.x[i]; pos[k * 6 + 1] = s.y[i]; pos[k * 6 + 2] = s.z[i] + zLift; pos[k * 6 + 3] = s.x[j]; pos[k * 6 + 4] = s.y[j]; pos[k * 6 + 5] = s.z[j] + zLift; k++;
      }
      line.geometry.setDrawRange(0, k * 2); line.geometry.attributes.position.needsUpdate = true;
    };
    seg(this.bondLines, s.bonds, 4, 0.3); seg(this.cohLines, s.coh, 2, 0.4); seg(this.adhLines, s.adh, 2, 0.6);
    const fm = this.flash.instanceMatrix.array, nf = Math.min(48, s.flashes.length);
    for (let k = 0; k < nf; k++) { const f = s.flashes[k], r = (0.16 + (1 - f.life) * 0.4) * Math.min(1, f.life * 2.5), q = k * 16; fm.fill(0, q, q + 16); fm[q] = fm[q + 5] = fm[q + 10] = r; fm[q + 12] = f.x; fm[q + 13] = f.y; fm[q + 14] = 0.8; fm[q + 15] = 1; }
    this.flash.count = nf; this.flash.instanceMatrix.needsUpdate = true;
  }

  // point the camera at the action; returns the height of the framed region in sim units
  frame(aspect) {
    const maxH = (this.W - 3) / aspect; let fh = maxH, cy;
    if (this.rigId === 'pull') {
      const top = this.yT + this.sim.off[5], want = Math.min(maxH, Math.max(13, top + 7.5));
      this.fh = this.fh ? this.fh + (want - this.fh) * 0.12 : want; fh = this.fh; cy = top / 2;
    } else cy = this.rigId === 'drag' ? Math.max(FLOOR + fh / 2, this.yT / 2 + 1.3) : FLOOR + fh / 2;   // drag: keep the interface in the middle
    const dist = fh / 2 / Math.tan(FOV * Math.PI / 360), cx = this.W / 2 + Math.sin(this.t * 0.35) * 0.5;
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    this.camera.position.set(cx, cy + dist * Math.sin(ELEV), dist * Math.cos(ELEV)); this.camera.lookAt(this.W / 2, cy, 0);
    return fh;
  }
}

export class MolecularView {
  constructor(renderer, overlay) {
    this.renderer = renderer; this.overlay = overlay; this.lanes = [new LaneScene(0), new LaneScene(1)];
    this.rects = []; this.size = [0, 0]; this.acc = 0; this.rigId = null; this.data = null;
    this.ui = [0, 1].map((i) => {
      const box = document.createElement('div'); box.className = 'mol-lane' + (i ? ' b' : '');
      box.innerHTML = '<div class="mol-head"><b></b><div class="legend"></div></div><div class="mol-foot"><p></p><div class="mol-side"><div class="counts"></div><div class="scale"><span></span>1 nanometre</div></div></div>';
      overlay.appendChild(box);
      return { box, title: box.querySelector('b'), legend: box.querySelector('.legend'), cap: box.querySelector('p'), counts: box.querySelector('.counts'), bar: box.querySelector('.scale span') };
    });
  }
  layout() {
    const el = this.renderer.domElement, w = el.clientWidth, h = el.clientHeight, ideal = IDEAL[this.rigId];
    const side = Math.abs(Math.log(w / 2 / h / ideal)) < Math.abs(Math.log(w / (h / 2) / ideal));
    this.rects = side ? [[0, 0, w / 2, h], [w / 2, 0, w / 2, h]] : [[0, 0, w, h / 2], [0, h / 2, w, h / 2]];
    this.size = [w, h];
    this.ui.forEach((u, i) => { const [x, y, rw, rh] = this.rects[i]; Object.assign(u.box.style, { left: x + 'px', top: y + 'px', width: rw + 'px', height: rh + 'px' }); });
    return clamp(Math.round(HNEED[this.rigId] * this.rects[0][2] / this.rects[0][3]) + 3, 26, 62);
  }
  build(rigId, data) {
    this.rigId = rigId; this.data = data; this.W = this.layout();
    this.lanes.forEach((l, i) => {
      l.build(rigId, data[i], this.W);
      const u = this.ui[i], d = data[i];
      u.title.textContent = `${i ? 'B' : 'A'} · ${d.a.name} on ${d.b.name}`;
      u.legend.innerHTML = l.legend.map((q) => `<span><i style="background:${hex(q.color)}"></i>${q.label}</span>`).join('')
        + l.legendLines.map(([c, label]) => `<span><i class="ln" style="background:${c}"></i>${label}</span>`).join('');
    });
    this.acc = 1;
  }
  step(dt, data) {
    const el = this.renderer.domElement;
    if (el.clientWidth !== this.size[0] || el.clientHeight !== this.size[1]) { if (this.layout() !== this.W) { this.build(this.rigId, data); } }
    this.data = data;
    this.lanes.forEach((l, i) => l.step(dt, data[i]));
    this.acc += dt;
    if (this.acc > 0.2) {
      this.acc = 0;
      this.lanes.forEach((l, i) => {
        const u = this.ui[i], text = stateLine(this.rigId, data[i]), counts = countsLine(this.rigId, l.sim);
        if (u.cap.textContent !== text) u.cap.textContent = text;
        if (u.counts.textContent !== counts) u.counts.textContent = counts;
        if (l.fh) u.bar.style.width = Math.round(NM * this.rects[i][3] / l.fh) + 'px';
      });
    }
  }
  render() {
    const r = this.renderer, H = this.size[1]; r.setScissorTest(true);
    this.lanes.forEach((l, i) => {
      const [x, y, w, h] = this.rects[i]; r.setViewport(x, H - y - h, w, h); r.setScissor(x, H - y - h, w, h);
      l.fh = l.frame(w / h) || l.fh; r.render(l.scene, l.camera);
    });
    r.setScissorTest(false);
  }
}
