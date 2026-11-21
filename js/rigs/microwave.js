// Rig 4 — microwave. Each lane is an oven with its front taken off. The food and its container turn with the turntable
// and are coloured by temperature; in the cut-open view the front half is clipped away and the cut face shows the inside.
// The heat model lives in ../microwave/model.js and the food textures in ../microwave/looks.js; this file draws them.
import * as THREE from 'three';
import { LANE_COLORS, makeLabel, disposeGroup } from './common.js';
import { HeatField, thermal, fieldAt, DX, PERIOD } from '../microwave/model.js';
import { foodLook, containerDetail, EXTENT, TALL } from '../microwave/looks.js';

const LANE_X = [-0.148, 0.148], CW = 0.26, CH = 0.16, CD = 0.26, T_LO = -20, T_HI = 130, LUT_N = 300, STEAM = 10, FLAMES = 14, TAU = Math.PI * 2;
const CUT = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);     // keeps the half away from the viewer
const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const cookSeconds = (v) => 10 + Math.round(v * 290 / 5) * 5;
const linear = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const ICE = linear('#cfe4ff'), FROST = 0.6, TINT = 0.5;          // in real colours frozen food looks frosted; a container is tinted by its heat

// thermal palette in the renderer's working colour space
const LUT = new Float32Array(LUT_N * 3);
{ const c = new THREE.Color(), rgb = [0, 0, 0];
  for (let k = 0; k < LUT_N; k++) { thermal(T_LO + (T_HI - T_LO) * k / (LUT_N - 1), rgb); c.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace); LUT.set([c.r, c.g, c.b], k * 3); } }

// A vertex-coloured surface. For every vertex it remembers the point inside the material whose temperature it shows.
// local: the surface turns with the food, so its points are fixed in the food. Otherwise they are fixed in the oven.
class Skin {
  constructor(kind, local, look) { this.kind = kind; this.local = local; this.look = look; this.pos = []; this.pts = []; this.shade = []; this.uv = []; this.idx = []; }
  grid(nu, nv, fn) {   // fn(u, v) -> [x, y, z, sampleX, sampleY, sampleZ, shade, texU, texV]
    const base = this.pos.length / 3;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const q = fn(i / (nu - 1), j / (nv - 1)); this.pos.push(q[0], q[1], q[2]); this.pts.push(q[3], q[4], q[5]); this.shade.push(q[6]); this.uv.push(q[7], q[8]); }
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) { const a = base + j * nu + i; this.idx.push(a, a + 1, a + nu, a + 1, a + nu + 1, a + nu); }
  }
  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    this.col = new THREE.BufferAttribute(new Float32Array(this.pos.length), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('color', this.col); geo.setIndex(this.idx);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false, map: this.look.heat }));
    return this.mesh;
  }
  paint(field, heat, fire) {
    const c = this.col.array, p = this.pts, n = this.shade.length, food = this.kind === 1, own = this.look.col, gain = heat ? this.look.gain : 1;
    for (let i = 0; i < n; i++) {
      const T = fire && food ? 1000 : field.sample(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], this.kind, this.local);
      let r = 1, g = 1, b = 1;
      if (heat) { const k = Math.max(0, Math.min(LUT_N - 1, Math.round((T - T_LO) / (T_HI - T_LO) * (LUT_N - 1)))) * 3; r = LUT[k]; g = LUT[k + 1]; b = LUT[k + 2]; }
      if (!food) { const t = heat ? TINT : 0; r = r * t + own[0] * (1 - t); g = g * t + own[1] * (1 - t); b = b * t + own[2] * (1 - t); }
      else if (!heat && field.iceOut > 0) { const f = FROST * field.iceOut; r += (ICE[0] - r) * f; g += (ICE[1] - g) * f; b += (ICE[2] - b) * f; }
      const s = this.shade[i] * gain * (fire && food && !heat ? 0.22 : 1); c[i * 3] = r * s; c[i * 3 + 1] = g * s; c[i * 3 + 2] = b * s;
    }
    this.col.needsUpdate = true;
  }
}

// The container is round: the space between bot(r) and top(r) out to rmax. Returns the surface that turns with it and
// the flat cut face that stays put. Scene axes: x across, y up, z towards the viewer. Model axes: x across, y = scene z, z up.
function buildContainer(reg, look, lines) {
  const { rmax, bot, top } = reg, NR = 18, NP = 49, inset = (r) => Math.min(r, Math.max(0, rmax - 0.4 * DX)), mid = (r) => (bot(r) + top(r)) / 2;
  const uv = (r, ph, y) => [ph / TAU * 8, (r + y) / 0.045];
  const surf = new Skin(2, true, look), face = new Skin(2, false, look); face.face = true;
  const ring = (zOf, s0, s1) => surf.grid(NR, NP, (u, v) => {
    const r = u * rmax, ph = TAU * v, ri = inset(r), y = zOf(r), q = uv(r, ph, y);
    return [r * Math.cos(ph), y, r * Math.sin(ph), ri * Math.cos(ph), ri * Math.sin(ph), mid(ri), s0 + (s1 - s0) * u, q[0], q[1]];
  });
  ring(bot, 0.74, 0.9); ring(top, 0.86, 0.98);
  if (top(rmax) - bot(rmax) > 1e-3) surf.grid(2, NP, (u, v) => {                 // upright side at the outer edge
    const ph = TAU * v, ri = inset(rmax), y = bot(rmax) + u * (top(rmax) - bot(rmax)), q = uv(rmax, ph, y);
    return [rmax * Math.cos(ph), y, rmax * Math.sin(ph), ri * Math.cos(ph), ri * Math.sin(ph), mid(ri), 0.88, q[0], q[1]];
  });
  face.grid(45, 9, (u, v) => {
    const x = (2 * u - 1) * rmax, r = Math.abs(x), b = bot(r), y = b + v * (top(r) - b), ri = inset(r);
    return [x, y, 0, Math.sign(x) * ri, 0, mid(ri), 1, x / 0.045, y / 0.045];
  });
  const loop = [];
  for (let i = 0; i <= 44; i++) { const x = (2 * i / 44 - 1) * rmax; loop.push(new THREE.Vector3(x, bot(Math.abs(x)), 0.0004)); }
  for (let i = 44; i >= 0; i--) { const x = (2 * i / 44 - 1) * rmax; loop.push(new THREE.Vector3(x, top(Math.abs(x)), 0.0004)); }
  lines.push(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(loop), new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.7 })));
  return [surf, face];
}

// One piece of food (see shapes() in the model): its top, its underside and, where it has one, its upright edge.
function buildPiece(reg, p, looks) {
  const phis = p.out.phis || Array.from({ length: 49 }, (_, i) => TAU * i / 48), NP = phis.length, NR = 14, o = [0, 0];
  const at = (s, ph, f, shade, side) => {   // f: 0 underside .. 1 top
    const R = p.out.R(ph), lx = s * R * Math.cos(ph), ly = s * R * Math.sin(ph), wx = lx * p.c - ly * p.s, wy = lx * p.s + ly * p.c;
    reg.col(p, p.x + wx, p.y + wy, o); const y = o[0] + f * (o[1] - o[0]);
    const k = Math.max(0, 1 - 0.5 * DX / Math.max(1e-6, s * R)), X = p.x + wx * k, Y = p.y + wy * k;       // show the temperature a little way in
    reg.col(p, X, Y, o); const zi = o[1] - o[0] < DX ? (o[0] + o[1]) / 2 : Math.min(o[1] - 0.4 * DX, Math.max(o[0] + 0.4 * DX, y));
    return [p.x + wx, y, p.y + wy, X, Y, zi, shade, side ? side : 0.5 + lx / EXTENT, side ? (y - p.z) / TALL : 0.5 + ly / EXTENT];
  };
  const surf = new Skin(1, true, looks.top), skins = [surf], phi = (v) => phis[Math.round(v * (NP - 1))];
  surf.grid(NR, NP, (u, v) => at(Math.sin(u * Math.PI / 2), phi(v), 0, 0.74 + 0.16 * u));
  surf.grid(NR, NP, (u, v) => { const s = Math.sin(u * Math.PI / 2); return at(s, phi(v), 1, 1 - 0.2 * s ** 3); });     // a little darker towards the edge, so round things look round
  let tall = 0, round = 0; const arc = [0];
  for (let j = 0; j < NP; j++) {
    const R = p.out.R(phis[j]), x = R * Math.cos(phis[j]), y = R * Math.sin(phis[j]);
    reg.col(p, p.x + x * p.c - y * p.s, p.y + x * p.s + y * p.c, o); tall = Math.max(tall, o[1] - o[0]);
    if (j) { const R0 = p.out.R(phis[j - 1]); round += Math.hypot(x - R0 * Math.cos(phis[j - 1]), y - R0 * Math.sin(phis[j - 1])); arc.push(round); }
  }
  if (tall > 1e-3) { const wall = new Skin(1, true, looks.side); wall.grid(2, NP, (u, v) => at(1, phi(v), u, 0.88, arc[Math.round(v * (NP - 1))] / EXTENT + 0.01)); skins.push(wall); }
  return skins;
}

// Where the cut goes through a piece of food. The cut stays put while the food turns, so this is redrawn every frame.
class CutFace extends Skin {
  constructor(reg, p, look) {
    super(1, false, look); this.face = true; this.reg = reg; this.p = p; this.NU = 41; this.NV = 7;
    this.grid(this.NU, this.NV, () => [0, 0, 0, 0, 0, 0, 1, 0, 0]);
  }
  build() {
    const m = super.build(); m.frustumCulled = false; this.posA = m.geometry.attributes.position; this.uvA = m.geometry.attributes.uv;
    this.line = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array((2 * this.NU + 1) * 3), 3)), new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.7 }));
    this.line.frustumCulled = false; return m;
  }
  paint(field, heat, fire) {
    const { reg, p, NU, NV, pts } = this, c = field.cosT, s = field.sinT, o = [0, 0], W = 0.092, N = 64, pos = this.posA.array, uv = this.uvA.array, ln = this.line.geometry.attributes.position;
    const hit = (x) => reg.col(p, x * c, -x * s, o);          // the point at x along the cut, in the food's own frame
    let xa = null, xb = null;
    for (let i = 0; i <= N; i++) { const x = -W + 2 * W * i / N; if (hit(x)) { if (xa === null) xa = x; xb = x; } }
    if (xa === null) { pos.fill(0); ln.array.fill(0); this.posA.needsUpdate = ln.needsUpdate = true; return; }
    const edge = (inX, outX) => { for (let k = 0; k < 8; k++) { const m = (inX + outX) / 2; if (hit(m)) inX = m; else outX = m; } return inX; };
    xa = edge(xa, xa - 2 * W / N); xb = edge(xb, xb + 2 * W / N);
    const xc = p.x * c - p.y * s, half = (xb - xa) / 2, mid = (xa + xb) / 2, pad = Math.min(0.4 * DX, half);
    for (let i = 0; i < NU; i++) {
      const x = xa + (xb - xa) * i / (NU - 1), xi = mid + Math.max(-half + pad, Math.min(half - pad, x - mid)); hit(x); const b = o[0], t = o[1];
      for (let j = 0; j < NV; j++) {
        const k = j * NU + i, y = b + (t - b) * j / (NV - 1);
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = 0;
        pts[k * 3] = xi; pts[k * 3 + 1] = 0; pts[k * 3 + 2] = t - b < DX ? (b + t) / 2 : Math.min(t - 0.4 * DX, Math.max(b + 0.4 * DX, y));
        uv[k * 2] = 0.5 + (x - xc) / EXTENT; uv[k * 2 + 1] = (y - p.z) / TALL;
      }
      ln.setXYZ(i, x, t, 0.0004); ln.setXYZ(2 * NU - 1 - i, x, b, 0.0004);
    }
    ln.setXYZ(2 * NU, ln.getX(0), ln.getY(0), 0.0004);
    this.posA.needsUpdate = this.uvA.needsUpdate = ln.needsUpdate = true;
    super.paint(field, heat, fire);
  }
}

// Marks painted on the container so you can see it turning: short ticks round the rim and one long stripe.
// Each is a strip that runs up the outside (from radius r0) and over the rim (in to radius r1).
function rimMarks(reg, r0, r1, rLong) {
  const { rmax, bot, top } = reg, N = 8, out = [[], []];              // [dark edging, white mark]
  const path = (from) => { const p = []; for (let k = 0; k <= 8; k++) { const s = 1 - (1 - k / 8) ** 2, r = from + (rmax - from) * s; p.push([r, bot(r)]); } for (let k = 0; k <= 3; k++) { const r = rmax + (r1 - rmax) * k / 3; p.push([r, top(r)]); } return p; };
  for (let m = 0; m < N; m++) {
    const big = m === 0, ph = TAU * m / N, pts = path(big ? rLong : r0);
    [(big ? 0.075 : 0.032) + 0.018, big ? 0.075 : 0.032].forEach((hw, layer) => {
      const o = out[layer], base = o.length / 3;
      for (const [r, y] of pts) for (const a of [ph - hw, ph + hw]) o.push(r * Math.cos(a), y, r * Math.sin(a));
      o.idx = o.idx || []; for (let k = 0; k < pts.length - 1; k++) { const a = base + k * 2; o.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
  }
  return out.map((o, layer) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(o, 3)); geo.setIndex(o.idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: layer ? 0xffffff : 0x0f172a, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: layer ? -6 : -4, polygonOffsetUnits: layer ? -6 : -4 }));
    m.renderOrder = 3; return m;
  });
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
function flameTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 40, 2, 32, 34, 30);
  gr.addColorStop(0, 'rgba(255,250,200,1)'); gr.addColorStop(0.35, 'rgba(255,190,40,0.95)'); gr.addColorStop(0.7, 'rgba(240,80,10,0.6)'); gr.addColorStop(1, 'rgba(200,30,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
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
    // glass turntable with ticks round its edge (one long, in the lane's colour) so its turning is easy to see
    this.table = new THREE.Group(); this.root.add(this.table);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.116, 0.116, 0.004, 48), new THREE.MeshStandardMaterial({ color: 0xcfe8f0, transparent: true, opacity: 0.3, roughness: 0.1 }));
    disc.position.y = 0.004; this.table.add(disc);
    for (let k = 0; k < 12; k++) {
      const big = k === 0, len = big ? 0.026 : 0.011, a = TAU * k / 12, r = 0.113 - len / 2;
      const t = new THREE.Mesh(new THREE.BoxGeometry(len, 0.0008, big ? 0.008 : 0.0035), new THREE.MeshBasicMaterial({ color: big ? LANE_COLORS[i] : 0x475569 }));
      t.position.set(r * Math.cos(a), 0.0066, r * Math.sin(a)); t.rotation.y = -a; this.table.add(t);
    }
    this.body = new THREE.Group(); this.body.position.y = 0.006; this.root.add(this.body);       // turns with the turntable
    this.cutG = new THREE.Group(); this.cutG.position.y = 0.006; this.root.add(this.cutG);       // the cut face stays facing the viewer
    const label = makeLabel(i ? 'B' : 'A', LANE_COLORS[i]); label.position.set(-CW / 2 + 0.02, CH + 0.025, -CD / 2); this.root.add(label);
    const tex = steamTexture(); this.steam = [];
    for (let k = 0; k < STEAM; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false })); s.visible = false; s.renderOrder = 4; this.root.add(s); this.steam.push(s); }
    const ftex = flameTexture(); this.flames = [];
    for (let k = 0; k < FLAMES; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ftex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); s.visible = false; s.renderOrder = 5; this.root.add(s); this.flames.push(s); }
    this.heated = 0; this.perceived = false;
    this.skins = []; this.marks = []; this.tex = []; this.t = 0; this.glow = 0; this.view = { cut: false, heat: false };
  }
  texture(canvas, colour) {
    const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace; this.tex.push(t); return t;
  }
  clear() {
    for (const g of [this.body, this.cutG]) { disposeGroup(g); g.clear(); }
    this.tex.forEach((t) => t.dispose()); this.tex = []; this.skins = []; this.marks = [];
  }
  setPair(food, inter) {
    const cont = inter.container; this.cont = cont;
    this.field = new HeatField(food, cont, inter.start, inter.amount); this.clear();
    const S = this.field.shape, lines = [], L = foodLook(food.id), det = containerDetail(cont.detail);
    // heat: the picture the heat colours are multiplied by · real: the picture shown in real colours
    const pic = (p) => ({ heat: this.texture(p.canvas, false), real: this.texture(p.colour, true), gain: p.gain });
    const detTex = det && this.texture(det, false), plain = { heat: detTex || null, real: detTex || null, gain: 1, col: linear(cont.col || '#ffffff') };
    if (S.cont) this.skins.push(...buildContainer(S.cont, plain, lines));
    const looks = { top: pic(L.top), side: pic(L.side) };
    for (const p of S.food.pieces) { const face = new CutFace(S.food, p, looks.side); this.skins.push(...buildPiece(S.food, p, looks), face); }
    for (const s of this.skins) { (s.face ? this.cutG : this.body).add(s.build()); if (s.line) lines.push(s.line); }
    lines.forEach((l) => this.cutG.add(l));
    if (S.cont) { const R = S.cont.rmax, bowl = cont.shape === 'bowl'; this.marks = bowl ? rimMarks(S.cont, 0.985 * R, 0.9 * R, 0.82 * R) : rimMarks(S.cont, R, 0.9 * R, 0.76 * R); this.marks.forEach((m) => this.body.add(m)); }
    this.setView(this.view);
  }
  // cut: front half taken away and the cut face shown; otherwise whole, with a see-through container. heat: heat colours or real ones.
  setView(view) {
    this.view = { ...view }; const { cut, heat } = view, clip = cut ? [CUT] : [];
    for (const s of this.skins) {
      const m = s.mesh.material, cont = s.kind === 2, op = !cont || s.face ? 1 : cut ? this.cont.clear || 1 : Math.min(0.42, this.cont.clear || 1);
      s.mesh.visible = cut || !s.face; m.clippingPlanes = s.face ? [] : clip; m.map = heat ? s.look.heat : s.look.real;
      m.transparent = op < 1; m.opacity = op; m.depthWrite = op >= 1; s.mesh.renderOrder = op < 1 ? 2 : 0;
      if (cont && !s.face) { m.polygonOffset = true; m.polygonOffsetFactor = m.polygonOffsetUnits = -1; }   // where food touches it, the container wins
      m.needsUpdate = true;
    }
    this.marks.forEach((m) => { m.material.clippingPlanes = clip; m.material.needsUpdate = true; });
    this.cutG.visible = cut;
    if (this.field) this.paint();
  }
  paint() {
    for (const s of this.skins) if (s.mesh.visible) s.paint(this.field, this.view.heat, this.fire);
    this.table.rotation.y = this.body.rotation.y = -this.field.theta;
  }
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
    // the perceived tomato on fire: flames over every piece, following it round the turntable
    const P = this.field.shape.food.pieces, c = this.field.cosT, sn = this.field.sinT, burning = this.fire;
    this.flames.forEach((s, k) => {
      s.visible = burning; if (!burning) return;
      const p = P[k % P.length], q = (this.t * (1.1 + 0.13 * (k % 5)) + k * 0.37) % 1, a = k * 2.1, r = 0.022 * ((k * 7 % 10) / 10);
      const X = p.x + r * Math.cos(a), Y = p.y + r * Math.sin(a);
      s.position.set(X * c - Y * sn, top - 0.012 + q * 0.07, X * sn + Y * c + 0.004);
      const w = 0.05 * (1 - 0.6 * q) * (0.8 + 0.2 * Math.sin(this.t * 17 + k)); s.scale.set(w, w * 1.7, 1); s.material.opacity = 0.9 * Math.min(1, q * 6) * (1 - q);
    });
    this.paint();
  }
  // Perceived mode: after 30 s of heating the tomato is, as far as your mouth can tell, on fire.
  get fire() { return this.perceived && this.field.food.id === 'tomato' && this.heated >= 30; }
}

export class MicrowaveRig {
  constructor() {
    this.group = new THREE.Group();
    this.lanes = [new Lane(0), new Lane(1)]; this.lanes.forEach((l) => this.group.add(l.root));
    this.cook = 120; this.clock = 0; this.acc = 0; this.on = false; this.opts = { turntable: true, power: 1, cut: false, heat: false, perceived: false };
    this.traces = [[], []]; this.extra = [[], []];
  }
  setPair(i, a, b, inter) { this.lanes[i].setPair(a, inter); }
  setOptions(o) {
    Object.assign(this.opts, o);
    this.lanes.forEach((l) => { if (l.perceived !== !!this.opts.perceived) { l.perceived = !!this.opts.perceived; if (l.field) l.draw(0, this.on); } });
    this.lanes.forEach((l) => { if (l.view.cut !== this.opts.cut || l.view.heat !== this.opts.heat) l.setView(this.opts); });
  }
  setControl(v) { this.cook = cookSeconds(v); }
  controlLabel(v) { return mmss(cookSeconds(v)); }
  reset() {
    this.clock = 0; this.acc = 0; this.on = false; this.traces = [[], []]; this.extra = [[], []];
    this.lanes.forEach((l) => { if (!l.field) return; l.field.reset(); l.glow = 0; l.heated = 0; l.draw(0, false); });
    this.record();
  }
  record() {
    this.lanes.forEach((l, i) => {
      if (!l.field) return; const s = l.field.s;
      this.traces[i].push({ x: this.clock, y: l.fire ? 1000 : s.avg }); if (s.contAvg !== null) this.extra[i].push({ x: this.clock, y: s.contAvg });
      if (this.traces[i].length > 2400) { this.traces[i] = this.traces[i].filter((p, k) => k % 2 === 0); this.extra[i] = this.extra[i].filter((p, k) => k % 2 === 0); }
    });
  }
  step(dt) {
    const cooking = this.clock < this.cook, p = this.opts.power;
    this.on = cooking && (p >= 1 || (this.clock % PERIOD) < PERIOD * p);     // lower power = the same magnetron, pulsed
    this.clock += dt;
    this.lanes.forEach((l) => { if (cooking) l.heated += dt; l.field.step(dt, this.on, cooking && this.opts.turntable); l.draw(dt, this.on); });     // heated counts cooking time at any power level
    this.acc += dt; if (this.acc >= 1) { this.acc = 0; this.record(); }
  }
  stir() { this.lanes.forEach((l) => { l.field.stir(); l.paint(); }); }
  result(i) {
    const l = this.lanes[i], f = l.field, E = f.E, fire = l.fire;
    return { ...f.s, ...(fire ? { avg: 1000, mid: 1000, hot: 1000, cold: 1000, frozen: 0 } : {}), fire, perceived: l.perceived && f.food.id === 'tomato', t: this.clock, cook: this.cook, phase: this.clock === 0 ? 'ready' : this.clock < this.cook ? 'cooking' : 'standing', on: this.on,
      split: { food: E.food, cont: E.cont, lost: E.lost }, steam: E.steam, turntable: this.opts.turntable, power: this.opts.power, canStir: f.food.stir };
  }
  focus() { return new THREE.Vector3(0, 0.04, 0); }
  live(i) {
    const r = this.result(i), d = (v) => Math.round(v) + ' °C', noun = this.lanes[i].field.cont.noun;
    if (r.fire) return `🔥 On fire · ${d(1000)}` + (r.contAvg !== null ? ` · ${noun} ${d(r.contAvg)}` : '');
    return `Middle ${d(r.mid)} · hottest ${d(r.hot)}` + (r.contAvg !== null ? ` · ${noun} ${d(r.contAvg)}` : '') + (r.frozen > 0.03 ? ` · ${Math.round(r.frozen * 100)}% frozen` : '');
  }
  trace() {
    return { title: 'Temperature over time (solid: food average · dashed: container)', x: 'time (s)', y: '°C', xMax: Math.max(120, Math.ceil(Math.max(this.clock, this.cook) / 60) * 60), yMin: -20, yMax: this.lanes.some((l) => l.fire) ? 1000 : 100, series: this.traces, extra: this.extra };
  }
  dispose() { this.lanes.forEach((l) => l.clear()); disposeGroup(this.group); }
}
