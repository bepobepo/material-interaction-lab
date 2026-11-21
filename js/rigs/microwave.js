// Rig 4 — microwave. Each lane is an oven cut open at the front, with the food and its container sliced in half
// and coloured by temperature. The heat model lives in ../microwave/model.js; this file draws it.
import * as THREE from 'three';
import { LANE_COLORS, makeLabel, disposeGroup } from './common.js';
import { HeatField, shapes, thermal, fieldAt, DX, PERIOD } from '../microwave/model.js';

const LANE_X = [-0.165, 0.165], CW = 0.29, CH = 0.17, CD = 0.29, T_LO = -20, T_HI = 130, LUT_N = 300, STEAM = 10;
const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const cookSeconds = (v) => 10 + Math.round(v * 290 / 5) * 5;

// thermal palette in the renderer's working colour space
const LUT = new Float32Array(LUT_N * 3);
{ const c = new THREE.Color(), rgb = [0, 0, 0];
  for (let k = 0; k < LUT_N; k++) { thermal(T_LO + (T_HI - T_LO) * k / (LUT_N - 1), rgb); c.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace); LUT.set([c.r, c.g, c.b], k * 3); } }

// A vertex-coloured surface. For every vertex it remembers the point inside the material whose temperature it shows.
class Skin {
  constructor(kind) { this.kind = kind; this.pos = []; this.pts = []; this.shade = []; this.idx = []; }
  grid(nu, nv, fn) {   // fn(u, v) -> [x, y, z, sampleX, sampleY, sampleZ, shade]
    const base = this.pos.length / 3;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const q = fn(i / (nu - 1), j / (nv - 1)); this.pos.push(q[0], q[1], q[2]); this.pts.push(q[3], q[4], q[5]); this.shade.push(q[6]); }
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) { const a = base + j * nu + i; this.idx.push(a, a + 1, a + nu, a + 1, a + nu + 1, a + nu); }
  }
  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    this.col = new THREE.BufferAttribute(new Float32Array(this.pos.length), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('color', this.col); geo.setIndex(this.idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
    return new THREE.Mesh(geo, mat);
  }
  paint(field) {
    const c = this.col.array, p = this.pts, n = this.shade.length;
    for (let i = 0; i < n; i++) {
      const T = field.sample(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], this.kind);
      const k = Math.max(0, Math.min(LUT_N - 1, Math.round((T - T_LO) / (T_HI - T_LO) * (LUT_N - 1)))) * 3, s = this.shade[i];
      c[i * 3] = LUT[k] * s; c[i * 3 + 1] = LUT[k + 1] * s; c[i * 3 + 2] = LUT[k + 2] * s;
    }
    this.col.needsUpdate = true;
  }
}

// The back half of a round shape (space between bot(r) and top(r)) plus its flat cut face.
// Scene axes: x across, y up, z towards the viewer. Model axes: x across, y = scene z, z up.
function addRegion(skin, reg, lines) {
  const { rmax, bot, top } = reg, cont = skin.kind === 2, NR = 18, NP = 22, inset = (r) => Math.min(r, Math.max(0, rmax - 0.4 * DX));
  const inside = (r, z) => { const b = bot(r), t = top(r); return cont || t - b < DX ? (b + t) / 2 : Math.min(t - 0.4 * DX, Math.max(b + 0.4 * DX, z)); };
  const ring = (zOf, s0) => skin.grid(NR, NP, (u, v) => {
    const r = u * rmax, ph = Math.PI * (1 + v), ri = inset(r), y = zOf(r);
    return [r * Math.cos(ph), y, r * Math.sin(ph), ri * Math.cos(ph), ri * Math.sin(ph), inside(ri, y), s0 - 0.16 * (1 + Math.sin(ph))];
  });
  ring(bot, 0.86); ring(top, cont ? 0.9 : 1);
  if (top(rmax) - bot(rmax) > 1e-3) skin.grid(2, NP, (u, v) => {   // upright side at the outer edge
    const ph = Math.PI * (1 + v), ri = inset(rmax), y = bot(rmax) + u * (top(rmax) - bot(rmax));
    return [rmax * Math.cos(ph), y, rmax * Math.sin(ph), ri * Math.cos(ph), ri * Math.sin(ph), inside(ri, y), 0.9 - 0.16 * (1 + Math.sin(ph))];
  });
  skin.grid(45, 9, (u, v) => {                                       // the cut face
    const x = (2 * u - 1) * rmax, r = Math.abs(x), b = bot(r), y = b + v * (top(r) - b), ri = inset(r);
    return [x, y, 0, Math.sign(x) * ri, 0, inside(ri, y), 1];
  });
  const loop = [];
  for (let i = 0; i <= 44; i++) { const x = (2 * i / 44 - 1) * rmax; loop.push(new THREE.Vector3(x, bot(Math.abs(x)), 0.0004)); }
  for (let i = 44; i >= 0; i--) { const x = (2 * i / 44 - 1) * rmax; loop.push(new THREE.Vector3(x, top(Math.abs(x)), 0.0004)); }
  lines.push(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(loop), new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.55 })));
}

function spotTexture() {   // where the oven's field is strong, at food height
  const N = 64, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = Math.max(0, (fieldAt((i / (N - 1) - 0.5) * CW, (j / (N - 1) - 0.5) * CD, 0.03) - 0.25) / 1.65), k = (j * N + i) * 4;
    img.data[k] = 255; img.data[k + 1] = 120; img.data[k + 2] = 30; img.data[k + 3] = 255 * Math.pow(v, 1.4);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function steamTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

class Lane {
  constructor(i) {
    this.root = new THREE.Group(); this.root.position.x = LANE_X[i];
    const wall = new THREE.MeshStandardMaterial({ color: 0xe6eaf0, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide });
    const add = (geo, mat, x, y, z, rx = 0, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); this.root.add(m); return m; };
    add(new THREE.PlaneGeometry(CW, CD), wall, 0, 0.001, 0, -Math.PI / 2).receiveShadow = true;
    add(new THREE.PlaneGeometry(CW, CH), wall, 0, CH / 2, -CD / 2);
    add(new THREE.PlaneGeometry(CD, CH), wall, -CW / 2, CH / 2, 0, 0, Math.PI / 2);
    add(new THREE.PlaneGeometry(CD, CH), wall, CW / 2, CH / 2, 0, 0, -Math.PI / 2);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(CW, CH, CD)), new THREE.LineBasicMaterial({ color: 0x64748b }));
    edges.position.y = CH / 2; this.root.add(edges);
    this.port = add(new THREE.BoxGeometry(0.07, 0.03, 0.004), new THREE.MeshStandardMaterial({ color: 0x4b5563, emissive: 0xff7a1a, emissiveIntensity: 0 }), CW / 2 - 0.055, CH - 0.03, -CD / 2 + 0.003);   // where the microwaves come in
    this.spots = add(new THREE.PlaneGeometry(CW, CD), new THREE.MeshBasicMaterial({ map: spotTexture(), transparent: true, opacity: 0, depthWrite: false }), 0, 0.002, 0, -Math.PI / 2);
    this.table = new THREE.Group(); this.root.add(this.table);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.004, 48), new THREE.MeshStandardMaterial({ color: 0xcfe8f0, transparent: true, opacity: 0.3, roughness: 0.1 }));
    disc.position.y = 0.004; this.table.add(disc);
    for (let k = 0; k < 3; k++) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.005, 12), new THREE.MeshStandardMaterial({ color: 0x334155 })); d.position.set(0.112 * Math.cos(k * 2.094), 0.005, 0.112 * Math.sin(k * 2.094)); this.table.add(d); }
    this.body = new THREE.Group(); this.body.position.y = 0.006; this.root.add(this.body);
    const label = makeLabel(i ? 'B' : 'A', LANE_COLORS[i]); label.position.set(-CW / 2 + 0.02, CH + 0.025, -CD / 2); this.root.add(label);
    const tex = steamTexture(); this.steam = [];
    for (let k = 0; k < STEAM; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false })); s.visible = false; this.root.add(s); this.steam.push(s); }
    this.skins = []; this.t = 0; this.glow = 0;
  }
  setPair(food, inter) {
    this.field = new HeatField(food, inter.container, inter.start);
    disposeGroup(this.body); this.body.clear(); this.skins = [];
    const S = shapes(food, inter.container), lines = [];
    for (const [reg, kind] of [[S.cont, 2], [S.food, 1]]) { if (!reg) continue; const skin = new Skin(kind); addRegion(skin, reg, lines); this.body.add(skin.build()); this.skins.push(skin); }
    lines.forEach((l) => this.body.add(l));
    this.paint();
  }
  paint() { for (const s of this.skins) s.paint(this.field); this.table.rotation.y = -this.field.theta; }
  draw(dt, on) {
    this.t += dt; this.glow += ((on ? 1 : 0) - this.glow) * Math.min(1, dt * 4);
    this.port.material.emissiveIntensity = 2.2 * this.glow; this.spots.material.opacity = 0.45 * this.glow;
    const n = Math.min(STEAM, this.field.steamRate / 25), top = 0.006 + this.field.foodTop;
    this.steam.forEach((s, k) => {
      s.visible = k < n; if (!s.visible) return;
      const p = (this.t * 0.45 + k / STEAM) % 1;
      s.position.set(Math.sin(k * 2.4 + p * 3) * 0.02 + (k % 3 - 1) * 0.012, top + 0.006 + p * 0.08, -0.012 - (k % 4) * 0.008);
      s.scale.setScalar(0.022 + 0.035 * p); s.material.opacity = 0.5 * Math.sin(Math.PI * p);
    });
    this.paint();
  }
}

export class MicrowaveRig {
  constructor() {
    this.group = new THREE.Group();
    this.lanes = [new Lane(0), new Lane(1)]; this.lanes.forEach((l) => this.group.add(l.root));
    this.cook = 120; this.clock = 0; this.acc = 0; this.on = false; this.opts = { turntable: true, power: 1 };
    this.traces = [[], []]; this.extra = [[], []];
  }
  setPair(i, a, b, inter) { this.lanes[i].setPair(a, inter); }
  setOptions(o) { Object.assign(this.opts, o); }
  setControl(v) { this.cook = cookSeconds(v); }
  controlLabel(v) { return mmss(cookSeconds(v)); }
  reset() {
    this.clock = 0; this.acc = 0; this.on = false; this.traces = [[], []]; this.extra = [[], []];
    this.lanes.forEach((l) => { if (!l.field) return; l.field.reset(); l.glow = 0; l.draw(0, false); });
    this.record();
  }
  record() {
    this.lanes.forEach((l, i) => {
      if (!l.field) return; const s = l.field.s;
      this.traces[i].push({ x: this.clock, y: s.avg }); if (s.contAvg !== null) this.extra[i].push({ x: this.clock, y: s.contAvg });
      if (this.traces[i].length > 2400) { this.traces[i] = this.traces[i].filter((p, k) => k % 2 === 0); this.extra[i] = this.extra[i].filter((p, k) => k % 2 === 0); }
    });
  }
  step(dt) {
    const cooking = this.clock < this.cook, p = this.opts.power;
    this.on = cooking && (p >= 1 || (this.clock % PERIOD) < PERIOD * p);     // lower power = the same magnetron, pulsed
    this.clock += dt;
    this.lanes.forEach((l) => { l.field.step(dt, this.on, cooking && this.opts.turntable); l.draw(dt, this.on); });
    this.acc += dt; if (this.acc >= 1) { this.acc = 0; this.record(); }
  }
  stir() { this.lanes.forEach((l) => { l.field.stir(); l.paint(); }); }
  result(i) {
    const f = this.lanes[i].field, E = f.E;
    return { ...f.s, t: this.clock, cook: this.cook, phase: this.clock === 0 ? 'ready' : this.clock < this.cook ? 'cooking' : 'standing', on: this.on,
      split: { food: E.food, cont: E.cont, lost: E.lost }, steam: E.steam, turntable: this.opts.turntable, power: this.opts.power, canStir: f.food.stir };
  }
  focus() { return new THREE.Vector3(0, 0.04, 0); }
  live(i) {
    const r = this.result(i), d = (v) => Math.round(v) + ' °C', noun = this.lanes[i].field.cont.noun;
    return `Middle ${d(r.mid)} · hottest ${d(r.hot)}` + (r.contAvg !== null ? ` · ${noun} ${d(r.contAvg)}` : '') + (r.frozen > 0.03 ? ` · ${Math.round(r.frozen * 100)}% frozen` : '');
  }
  trace() {
    return { title: 'Temperature over time (solid: food average · dashed: container)', x: 'time (s)', y: '°C', xMax: Math.max(120, Math.ceil(Math.max(this.clock, this.cook) / 60) * 60), yMin: -20, yMax: 100, series: this.traces, extra: this.extra };
  }
  dispose() { disposeGroup(this.group); }
}
