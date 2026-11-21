// Microwave heat model (no Three.js). One HeatField per lane: a grid of 5 mm cells holding the food and its container.
// Each step: the oven's standing-wave pattern and the depth below the surface decide where the power lands,
// then heat conducts between neighbouring cells, melts ice, and boils off as steam.
import { CONTAINERS, PIZZA } from './data.js';

export const DX = 0.005, NX = 36, NZ = 20, HALF = NX * DX / 2;
export const BOWL = { R: 0.08, h: 0.06, t: 0.0075 }, PLATE = { R: 0.085, t: 0.005 };
export const POWER = 800, PERIOD = 20, OMEGA = 2 * Math.PI / 10;     // W, s per on/off cycle, turntable rad/s
const L0 = 1.2e-5, AIR = 22, HCONV = 12, LATENT = 334e3, V = DX * DX * DX;
const KX = 2 * Math.PI / 0.07, KY = 2 * Math.PI / 0.08, KZ = 2 * Math.PI / 0.09;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Relative field strength at a point in the oven (x, y across, z up, metres from the turntable centre).
// Up and down it is weakest right at the metal floor, where the waves cancel, and strongest about 2 cm above the turntable.
export function fieldAt(x, y, z) {
  return 0.25 + 0.75 * (0.5 + 0.5 * Math.cos(KX * x + 1.1)) * (0.5 + 0.5 * Math.cos(KY * y + 2.4)) * (0.65 + 0.35 * Math.cos(KZ * (z - 0.02))) * 2.2;
}

// Thermal-camera palette, sRGB 0..1.
const STOPS = [[-18, 40, 46, 140], [0, 42, 111, 219], [20, 34, 195, 214], [45, 63, 191, 90], [65, 242, 213, 60], [85, 240, 138, 36], [100, 217, 33, 33], [130, 255, 233, 224]];
export function thermal(T, out = [0, 0, 0]) {
  let k = 0; while (k < STOPS.length - 2 && T > STOPS[k + 1][0]) k++;
  const a = STOPS[k], b = STOPS[k + 1], f = clamp((T - a[0]) / (b[0] - a[0]), 0, 1);
  for (let c = 0; c < 3; c++) out[c] = (a[c + 1] + (b[c + 1] - a[c + 1]) * f) / 255;
  return out;
}
export const thermalCSS = () => 'linear-gradient(90deg,' + STOPS.map((s) => `rgb(${s[1]},${s[2]},${s[3]}) ${((s[0] + 18) / 148 * 100).toFixed(1)}%`).join(',') + ')';

// ---- shapes ----------------------------------------------------------------------------------
// The container is round about the turntable axis: the space between bot(r) and top(r) out to rmax.
// Food is one or more pieces. A piece has an outline seen from above (its radius R in each direction, about its own
// centre) and, inside that, a bottom and a top height at each point (lx, ly; s is 0 at its centre and 1 at the outline).
const TAU = Math.PI * 2, root = (v) => Math.sqrt(Math.max(0, v));
const circle = (R) => ({ R: () => R });
const oval = (a, b, wob) => ({ R: (p) => a * b / Math.hypot(b * Math.cos(p), a * Math.sin(p)) * (wob ? wob(p) : 1) });
function poly(pts) {   // corners in counter-clockwise order around the centre
  const n = pts.length, phis = [];
  const R = (p) => {
    const dx = Math.cos(p), dy = Math.sin(p);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) continue;
      const t = (a[0] * ey - a[1] * ex) / den, u = (a[0] * dy - a[1] * dx) / den; if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6) return t;
    }
    return 0;
  };
  for (let i = 0; i < n; i++) {   // directions to draw it at: every corner, and a few along each edge
    const a0 = Math.atan2(pts[i][1], pts[i][0]); let a1 = Math.atan2(pts[(i + 1) % n][1], pts[(i + 1) % n][0]); if (a1 <= a0) a1 += TAU;
    for (let k = 0; k < 6; k++) phis.push(a0 + (a1 - a0) * k / 6);
  }
  phis.push(phis[0] + TAU);
  return { R, phis };
}
// n alike pieces (half-length a, half-width b) arranged round the centre without overlapping, as far as lim allows
function ring(n, a, b, lim) {
  if (n === 1) return [{ x: 0, y: 0, rot: 0 }];
  const d = Math.min(n === 2 ? b + 0.002 : n === 3 ? a * 0.98 : a * 1.09, Math.max(0.01, lim - b));
  return Array.from({ length: n }, (_, k) => { const g = TAU * k / n + 0.5; return { x: d * Math.cos(g), y: d * Math.sin(g), rot: g + Math.PI / 2 }; });
}
// Each food shape: q is the size that is solved to match the amount (not used for foods counted in pieces).
const PIECES = {
  liquid: (q, e) => [{ x: 0, y: 0, rot: 0, out: circle(e.a), top: () => q, bot: () => -1 }],
  mound: (q, e) => (e.bowl ? [{ x: 0, y: 0, rot: 0, out: circle(e.a), top: (x, y, s) => q + 0.018 * (1 - s * s), bot: () => -1 }]
    : [{ x: 0, y: 0, rot: 0, out: circle(q), top: (x, y, s) => e.heap * q * root(1 - s * s), bot: () => 0 }]),
  slab: (q) => { const h = Math.min(q, 0.12) / 2, tall = 0.04 * Math.max(1, q / 0.12) ** 2; return [{ x: 0, y: 0, rot: 0, out: poly([[h, -h], [h, h], [-h, h], [-h, -h]]), top: () => tall, bot: () => 0 }]; },
  roll: (q, e) => ring(e.n, 0.044, 0.035, e.lim).map((p) => ({ ...p, rigid: true, out: oval(0.044, 0.035, (a) => 1 + 0.05 * Math.cos(2 * a)),
    top: (x, y, s) => 0.005 + 0.041 * Math.max(0, 1 - s * s) ** 0.42, bot: (x, y, s) => 0.005 * s ** 4 })),
  potato: (q, e) => ring(e.n, 0.043, 0.031, e.lim).map((p) => ({ ...p, rigid: true, out: oval(0.043, 0.031, (a) => 1 + 0.06 * Math.sin(2 * a + 0.7) + 0.045 * Math.sin(3 * a + 2)),
    top: (x, y, s) => 0.024 + 0.028 * (1 + 2.8 * x) * root(1 - s * s), bot: (x, y, s) => 0.024 * (1 - root(1 - s * s)) })),
  tomato: (q, e) => ring(e.n, 0.034, 0.034, e.lim).map((p) => ({ ...p, rigid: true, out: oval(0.034, 0.034, (a) => 1 + 0.03 * Math.cos(5 * a)),
    top: (x, y, s) => 0.026 + 0.029 * root(1 - s * s) * (1 - 0.1 * Math.exp(-s * s / 0.05)), bot: (x, y, s) => 0.026 * (1 - root(1 - s * s)) })),   // a dimple where the stalk was
  egg: (q, e) => ring(e.n, 0.029, 0.0215, e.lim).map((p) => ({ ...p, rigid: true, out: oval(0.029, 0.0215, (a) => 1 + 0.22 * Math.cos(a) * Math.sin(a) ** 2),
    top: (x, y, s) => 0.0204 + 0.0215 * (1 + 3.4 * x) * root(1 - s * s), bot: (x, y, s) => 0.0204 * (1 - root(1 - s * s)) })),
  pizza: (q, e) => {
    const { L, half, tip } = PIZZA, pts = [[-tip * L, 0]];
    for (let k = 0; k <= 6; k++) { const a = -half + 2 * half * k / 6; pts.push([L * Math.cos(a) - tip * L, L * Math.sin(a)]); }
    const slice = (x, y, rot) => ({ x, y, rot, rigid: true, out: poly(pts), bot: () => 0,
      top: (lx, ly) => { const f = clamp((Math.hypot(lx + tip * L, ly) - (L - 0.02)) / 0.012, 0, 1); return 0.013 + 0.008 * f * f * (3 - 2 * f); } });    // thicker at the crust
    if (e.n === 1) return [slice(0, 0, 0)];
    return [half, Math.PI + half].map((ax, k) => slice((k ? L : -L) / 2 + tip * L * Math.cos(ax), tip * L * Math.sin(ax), ax));   // two slices, top to tail
  },
  chicken: (q, e) => {
    const k = Math.cbrt(e.n / 0.5), bump = (u, v, r) => Math.exp(-(u * u + v * v) / (r * r));
    return [{ x: 0, y: 0, rot: 0.35, rigid: true, out: oval(0.08 * k, 0.054 * k, (a) => 1 + 0.2 * Math.cos(a) * Math.sin(a) ** 2 + 0.04 * Math.sin(3 * a + 1)), bot: () => 0,
      top: (x, y, s) => { const u = x / k, v = y / k, b = root(1 - s * s); return k * (0.062 * b ** 0.9 * (0.6 + 0.4 * bump(u - 0.02, v - 0.004, 0.035)) + 0.02 * Math.sqrt(b) * bump(u + 0.048, v + 0.022, 0.018)); } }];   // breast, and a drumstick
  },
};

// The food pieces standing on whatever holds them up (sup: the height of the support at distance r from the axis).
function region(pieces, sup, z0, rest) {
  const CEIL = NZ * DX - 0.001;
  for (const p of pieces) {
    p.c = Math.cos(p.rot); p.s = Math.sin(p.rot); p.z = z0;
    if (rest && p.rigid) {   // a firm piece in a bowl rests a little way up its curved inside
      let lift = 0;
      for (const s of [0.35, 0.7, 0.95]) for (let j = 0; j < 12; j++) {
        const ph = TAU * j / 12, R = s * p.out.R(ph), lx = R * Math.cos(ph), ly = R * Math.sin(ph);
        lift = Math.max(lift, sup(Math.hypot(p.x + lx * p.c - ly * p.s, p.y + lx * p.s + ly * p.c)) - z0 - p.bot(lx, ly, s));
      }
      p.z += Math.min(0.025, lift);
    }
  }
  // The column of piece p above the point (X, Y), fixed in the food: o = [bottom, top]. True where there is food.
  const col = (p, X, Y, o) => {
    const dx = X - p.x, dy = Y - p.y, lx = dx * p.c + dy * p.s, ly = dy * p.c - dx * p.s, r = Math.hypot(lx, ly), R = p.out.R(Math.atan2(ly, lx)), s = Math.min(1, r / R);
    const b = Math.max(p.z + p.bot(lx, ly, s), sup(Math.hypot(X, Y))), t = Math.min(CEIL, p.z + p.top(lx, ly, s));
    o[0] = b; o[1] = Math.max(b, t); return r <= R && t - b > 1e-4;
  };
  return { pieces, col };
}
function volume(reg) {
  const o = [0, 0], h = DX / 2; let v = 0;
  for (let y = -HALF + h / 2; y < HALF; y += h) for (let x = -HALF + h / 2; x < HALF; x += h) for (const p of reg.pieces) if (reg.col(p, x, y, o)) v += o[1] - o[0];
  return v * h * h;
}

export function shapes(food, cont, amount = food.amount) {
  const bowl = cont.shape === 'bowl', plate = cont.shape === 'plate', { R, h, t } = BOWL, a = R - t, c = h - t;
  const ell = (r, rr) => Math.sqrt(Math.max(0, 1 - (r / rr) ** 2));
  const outerBot = (r) => h - h * ell(r, R), cavBot = (r) => (r >= a ? h : t + c - c * ell(r, a));
  const C = bowl ? { rmax: R, bot: outerBot, top: cavBot } : plate ? { rmax: PLATE.R, bot: () => 0, top: () => PLATE.t } : null;
  const z0 = bowl ? t : plate ? PLATE.t : 0, sup = bowl ? cavBot : () => z0;
  const env = { bowl, a, lim: bowl ? 0.93 * a : 1, n: amount, heap: food.heap || 0.7 };
  const make = (q) => region(PIECES[food.shape](q, env), sup, z0, bowl);
  const want = food.unit === 'ml' ? amount * 1e-6 : food.unit === 'g' ? amount / 1000 / food.rho : 0;
  let q = 0;
  if (want) {   // grow the shape until it holds the amount asked for
    let lo = food.shape === 'slab' ? 0.02 : bowl ? -0.017 : 0.01, hi = food.shape === 'slab' ? 0.3 : bowl ? c - 0.001 : 0.088;
    for (let k = 0; k < 18; k++) { q = (lo + hi) / 2; if (volume(make(q)) < want) lo = q; else hi = q; }
  }
  return { cont: C, food: make(q), want };
}

// The pair numbers the rig and the explainer share.
export function heatInteract(food, amt, cont0, start) {
  const swapped = food.shape === 'liquid' && cont0.shape !== 'bowl', cont = swapped ? CONTAINERS.glass : cont0;
  const freezes = food.freezes !== false && food.water > 0, frozen = freezes && start.T < 0;
  const low = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const where = cont.shape === 'none' ? 'on its own' : (cont.shape === 'plate' ? 'on a ' : 'in a ') + low(cont.name);
  return {
    kind: 'heat', container: cont, swapped, start, freezes, frozen, where, amount: amt.value, amountName: amt.name,
    title: `${frozen ? 'Frozen ' + low(food.name) : food.name} (${amt.name}) ${where}`,
    loss: food.loss, lossStart: food.loss * (frozen ? food.iceLoss : 1), pen: food.pen, selfMix: food.mix > 1,
    contAbsorbs: (cont.loss || 0) >= 0.05, spread: food.k * food.mix,
  };
}

const NB6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const NB26 = []; for (let c = -1; c <= 1; c++) for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) if (a || b || c) NB26.push([a, b, c, Math.hypot(a, b, c)]);

export class HeatField {
  constructor(food, cont, start, amount) {
    this.food = food; this.cont = cont; this.start = start;
    const S = this.shape = shapes(food, cont, amount), F = S.food, P = F.pieces.length, o = [0, 0];
    const N = NX * NX * NZ, map = this.map = new Int32Array(N).fill(-1), list = [], kinds = [];
    const lo = new Float32Array(NX * NX * P).fill(1), hi = new Float32Array(NX * NX * P); this.foodTop = 0;     // each piece's column above every grid square
    for (let iy = 0; iy < NX; iy++) for (let ix = 0; ix < NX; ix++) F.pieces.forEach((p, k) => {
      if (!F.col(p, (ix + 0.5) * DX - HALF, (iy + 0.5) * DX - HALF, o)) return;
      const j = (iy * NX + ix) * P + k; lo[j] = o[0]; hi[j] = o[1]; this.foodTop = Math.max(this.foodTop, o[1]);
    });
    for (let iz = 0; iz < NZ; iz++) for (let iy = 0; iy < NX; iy++) for (let ix = 0; ix < NX; ix++) {
      const x = (ix + 0.5) * DX - HALF, y = (iy + 0.5) * DX - HALF, z = (iz + 0.5) * DX, r = Math.hypot(x, y);
      const inC = S.cont && r <= S.cont.rmax && z >= S.cont.bot(r) && z <= S.cont.top(r);
      let inF = false; if (!inC) for (let k = 0, j = (iy * NX + ix) * P; k < P; k++) if (z >= lo[j + k] && z <= hi[j + k]) inF = true;
      if (inC || inF) { map[(iz * NX + iy) * NX + ix] = kinds.length; list.push(ix, iy, iz); kinds.push(inF ? 1 : 2); }
    }
    const n = this.n = kinds.length;
    this.kind = Uint8Array.from(kinds);
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.nb = new Int32Array(n * 6); this.nb26 = new Int32Array(n * 26);
    const at = (ix, iy, iz) => (ix < 0 || iy < 0 || iz < 0 || ix >= NX || iy >= NX || iz >= NZ ? -1 : map[(iz * NX + iy) * NX + ix]);
    for (let i = 0; i < n; i++) {
      const ix = list[i * 3], iy = list[i * 3 + 1], iz = list[i * 3 + 2];
      this.px[i] = (ix + 0.5) * DX - HALF; this.py[i] = (iy + 0.5) * DX - HALF; this.pz[i] = (iz + 0.5) * DX;
      NB6.forEach((d, q) => { this.nb[i * 6 + q] = at(ix + d[0], iy + d[1], iz + d[2]); });
      NB26.forEach((d, q) => { this.nb26[i * 26 + q] = at(ix + d[0], iy + d[1], iz + d[2]); });
    }
    this.H = new Float64Array(n); this.T = new Float32Array(n); this.ice = new Float32Array(n); this.kc = new Float32Array(n);
    this.w = new Float32Array(n); this.dH = new Float64Array(n); this.tau = new Float32Array(n); this.inc = new Float32Array(n);
    // material numbers
    const fz = food.freezes !== false && food.water > 0 ? 1 : 0;
    this.rcT = food.rho * food.c; this.rcF = this.rcT * (1 - 0.45 * food.water * fz); this.lat = LATENT * food.rho * food.water * fz;
    this.kT = food.k * food.mix; this.kF = food.k * (1 + 2.6 * food.water * fz);
    this.rcC = cont.rc || 1; this.kC = cont.k || 0; this.lossC = cont.loss || 0; this.penC = cont.pen || 1;
    // "the middle": the cells at the centre of the first piece, half way up
    const p0 = F.pieces[0]; F.col(p0, p0.x, p0.y, o); const zMid = (o[0] + o[1]) / 2; this.mid = [];
    for (let i = 0; i < n; i++) if (this.kind[i] === 1 && Math.hypot(this.px[i] - p0.x, this.py[i] - p0.y) < DX * 1.5 && Math.abs(this.pz[i] - zMid) < DX * 1.1) this.mid.push(i);
    this.nFood = 0; for (let i = 0; i < n; i++) if (this.kind[i] === 1) this.nFood++;
    this.nCont = n - this.nFood;
    // the lowest and highest thirds of the food, to tell whether its underside or its top is hotter
    let zLo = 1, zHi = 0; for (let i = 0; i < n; i++) if (this.kind[i] === 1) { zLo = Math.min(zLo, this.pz[i]); zHi = Math.max(zHi, this.pz[i]); }
    this.band = new Int8Array(n); this.tall = zHi - zLo + DX;
    for (let i = 0; i < n; i++) if (this.kind[i] === 1) this.band[i] = this.pz[i] < zLo + (zHi - zLo) / 3 ? 1 : this.pz[i] > zHi - (zHi - zLo) / 3 ? 2 : 0;
    // 5 mm cells can't follow a shape exactly, so each food cell is made to count for a little more or less until they add up to the amount asked for
    this.fill = S.want ? clamp(S.want / (this.nFood * V), 0.7, 1.4) : 1; this.grams = this.nFood * V * this.fill * food.rho * 1000;
    this.rcT *= this.fill; this.rcF *= this.fill; this.lat *= this.fill;
    this.reset();
  }

  reset() {
    const T0 = this.start.T;
    for (let i = 0; i < this.n; i++) this.H[i] = this.kind[i] === 1 ? (T0 < 0 ? T0 * this.rcF : this.lat + T0 * this.rcT) : T0 * this.rcC;
    this.theta = 0; this.cosT = 1; this.sinT = 0; this.sinceTau = 1e9; this.steamRate = 0;
    this.E = { food: 0, cont: 0, lost: 0, steam: 0, air: 0 };
    this.s = null; this.unpack(); this.stats(); this.unpack(); this.H0 = this.heat();
  }

  // temperature and ice fraction from stored heat
  unpack() {
    const { H, T, ice, kc, kind, rcT, rcF, lat, kF } = this, thawed = 1 - (this.s ? this.s.frozen : 0);
    const kT = this.food.k * (1 + (this.food.mix - 1) * thawed * thawed);     // a liquid can't stir itself while it is mostly ice
    for (let i = 0; i < this.n; i++) {
      if (kind[i] === 2) { T[i] = H[i] / this.rcC; ice[i] = 0; kc[i] = this.kC; continue; }
      const h = H[i];
      if (h < 0) { T[i] = h / rcF; ice[i] = lat > 0 ? 1 : 0; } else if (h <= lat) { T[i] = 0; ice[i] = 1 - h / lat; } else { T[i] = (h - lat) / rcT; ice[i] = 0; }
      kc[i] = ice[i] * kF + (1 - ice[i]) * kT;
    }
  }
  heat() { let s = 0; for (let i = 0; i < this.n; i++) s += this.H[i]; return s * V; }      // total heat content, J
  // how strongly a cell absorbs, relative to its thawed 20 °C value
  factor(i) { const f = this.food, lf = 1 + (f.lossHot - 1) * clamp(this.T[i] / 100, 0, 1); return (1 - this.ice[i]) * lf + this.ice[i] * f.iceLoss; }

  // how much the layers above each cell have already taken out of the beam
  depth() {
    const { n, tau, inc, nb26, kind } = this, f = this.food;
    for (let i = 0; i < n; i++) { inc[i] = kind[i] === 1 ? DX * this.factor(i) / f.pen : DX / this.penC; tau[i] = 1e9; }
    for (let pass = 0; pass < 4; pass++) {
      for (let q = 0; q < n; q++) {
        const i = pass & 1 ? n - 1 - q : q; let best = tau[i];
        for (let d = 0; d < 26; d++) {
          const j = nb26[i * 26 + d], wd = NB26[d][3], cand = j < 0 ? wd * inc[i] * 0.5 : tau[j] + wd * (inc[i] + inc[j]) * 0.5;
          if (cand < best) best = cand;
        }
        tau[i] = best;
      }
    }
    this.sinceTau = 0;
  }

  step(dt, on, turning) {
    const { n, T, kind, nb, kc, dH, w, px, py, pz, tau } = this, f = this.food, E = this.E;
    if (turning) { this.theta += OMEGA * dt; this.cosT = Math.cos(this.theta); this.sinT = Math.sin(this.theta); }
    this.sinceTau += dt; if (this.sinceTau > 0.75) this.depth();
    dH.fill(0);
    if (on) {
      const c = this.cosT, s = this.sinT; let sum = 0;
      for (let i = 0; i < n; i++) {
        const a = kind[i] === 1 ? f.loss * this.fill * this.factor(i) : this.lossC;
        w[i] = a * fieldAt(px[i] * c - py[i] * s, px[i] * s + py[i] * c, pz[i]) * Math.exp(-tau[i]); sum += w[i];
      }
      const L = sum * V, P = POWER * L / (L + L0), q = sum > 0 ? P / L * dt : 0;     // J/m³ per unit weight
      for (let i = 0; i < n; i++) { dH[i] = w[i] * q; if (kind[i] === 1) E.food += dH[i] * V; else E.cont += dH[i] * V; }
      E.lost += (POWER - P) * dt;
    }
    const kcond = dt / (DX * DX);
    for (let i = 0; i < n; i++) {
      const Ti = T[i], ki = kc[i]; let flow = 0;
      for (let d = 0; d < 6; d++) {
        const j = nb[i * 6 + d];
        if (j >= 0) { const kj = kc[j]; flow += 2 * ki * kj / (ki + kj) * (T[j] - Ti); } else { const a = HCONV * DX * (AIR - Ti); flow += a; E.air -= a * kcond * V; }
      }
      dH[i] += flow * kcond;
    }
    let steam = 0;
    const cap = this.lat + f.boil * this.rcT;
    for (let i = 0; i < n; i++) { this.H[i] += dH[i]; if (kind[i] === 1 && this.H[i] > cap) { steam += (this.H[i] - cap) * V; this.H[i] = cap; } }
    E.steam += steam; this.steamRate += (steam / Math.max(dt, 1e-6) - this.steamRate) * Math.min(1, dt * 2);
    this.unpack(); this.stats();
  }

  stir() {
    if (!this.food.stir) return false;
    let s = 0; for (let i = 0; i < this.n; i++) if (this.kind[i] === 1) s += this.H[i];
    s /= this.nFood; for (let i = 0; i < this.n; i++) if (this.kind[i] === 1) this.H[i] = s;
    this.unpack(); this.stats(); return true;
  }

  stats() {
    const { n, T, kind, ice, band } = this, bs = [0, 0, 0], bn = [0, 0, 0]; let fs = 0, hot = -1e9, cold = 1e9, fi = 0, cs = 0, ch = -1e9;
    for (let i = 0; i < n; i++) {
      if (kind[i] === 1) { fs += T[i]; fi += ice[i]; bs[band[i]] += T[i]; bn[band[i]]++; if (T[i] > hot) hot = T[i]; if (T[i] < cold) cold = T[i]; } else { cs += T[i]; if (T[i] > ch) ch = T[i]; }
    }
    let mid = 0; for (const i of this.mid) mid += T[i]; mid = this.mid.length ? mid / this.mid.length : fs / this.nFood;
    this.s = { low: bn[1] ? bs[1] / bn[1] : fs / this.nFood, high: bn[2] ? bs[2] / bn[2] : fs / this.nFood, tall: this.tall, avg: fs / this.nFood, hot, cold, mid, frozen: fi / this.nFood, contAvg: this.nCont ? cs / this.nCont : null, contHot: this.nCont ? ch : null };
    return this.s;
  }

  // Temperature at a point; kind 1 food, 2 container. By default the point is fixed in the oven (the food turns
  // underneath it); with local set it is fixed in the food. Also leaves the ice fraction there in this.iceOut.
  sample(x, y, z, kind, local) {
    const c = local ? 1 : this.cosT, s = local ? 0 : this.sinT, fx = (x * c + y * s + HALF) / DX - 0.5, fy = (-x * s + y * c + HALF) / DX - 0.5, fz = z / DX - 0.5;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz), tx = fx - ix, ty = fy - iy, tz = fz - iz;
    let sum = 0, ws = 0, ice = 0;
    for (let q = 0; q < 8; q++) {
      const a = ix + (q & 1), b = iy + (q >> 1 & 1), d = iz + (q >> 2);
      if (a < 0 || b < 0 || d < 0 || a >= NX || b >= NX || d >= NZ) continue;
      const i = this.map[(d * NX + b) * NX + a]; if (i < 0 || this.kind[i] !== kind) continue;
      const wt = (q & 1 ? tx : 1 - tx) * (q >> 1 & 1 ? ty : 1 - ty) * (q >> 2 ? tz : 1 - tz) + 1e-4;
      sum += wt * this.T[i]; ice += wt * this.ice[i]; ws += wt;
    }
    this.iceOut = ws > 0 ? ice / ws : kind === 1 ? this.s.frozen : 0;
    return ws > 0 ? sum / ws : (kind === 1 ? this.s.avg : this.s.contAvg);
  }
}
