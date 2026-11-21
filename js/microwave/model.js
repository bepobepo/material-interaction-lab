// Microwave heat model (no Three.js). One HeatField per lane: a grid of 5 mm cells holding the food and its container.
// Each step: the oven's standing-wave pattern and the depth below the surface decide where the power lands,
// then heat conducts between neighbouring cells, melts ice, and boils off as steam.
import { CONTAINERS } from './data.js';

export const DX = 0.005, NX = 36, NZ = 20, HALF = NX * DX / 2;
export const BOWL = { R: 0.08, h: 0.06, t: 0.0075 }, PLATE = { R: 0.085, t: 0.005 };
export const POWER = 800, PERIOD = 20, OMEGA = 2 * Math.PI / 10;     // W, s per on/off cycle, turntable rad/s
const L0 = 1.2e-5, AIR = 22, HCONV = 12, LATENT = 334e3, V = DX * DX * DX;
const KX = 2 * Math.PI / 0.07, KY = 2 * Math.PI / 0.08, KZ = 2 * Math.PI / 0.09;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Relative field strength at a point in the oven (x, y across, z up, metres from the turntable centre).
export function fieldAt(x, y, z) {
  return 0.25 + 0.75 * (0.5 + 0.5 * Math.cos(KX * x + 1.1)) * (0.5 + 0.5 * Math.cos(KY * y + 2.4)) * (0.65 + 0.35 * Math.cos(KZ * z + 0.6)) * 2.2;
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

// Shapes are round about the turntable axis: each is the space between bot(r) and top(r) out to rmax.
export function shapes(food, cont) {
  const bowl = cont.shape === 'bowl', plate = cont.shape === 'plate', { R, h, t } = BOWL, a = R - t, c = h - t;
  const ell = (r, rr) => Math.sqrt(Math.max(0, 1 - (r / rr) ** 2));
  const outerBot = (r) => h - h * ell(r, R), cavBot = (r) => (r >= a ? h : t + c - c * ell(r, a));
  const C = bowl ? { rmax: R, bot: outerBot, top: cavBot } : plate ? { rmax: PLATE.R, bot: () => 0, top: () => PLATE.t } : null;
  const z0 = bowl ? t : plate ? PLATE.t : 0, sup = bowl ? cavBot : () => z0;
  let F;
  if (food.shape === 'liquid') F = { top: () => t + 0.033 };
  else if (food.shape === 'mound') F = bowl ? { top: (r) => t + 0.03 + 0.018 * (1 - (r / a) ** 2) } : { rmax: 0.065, top: (r) => z0 + 0.045 * ell(r, 0.065) };
  else if (food.shape === 'slab') F = bowl ? { top: () => t + 0.038 } : { rmax: 0.055, top: () => z0 + 0.04 };
  else if (food.shape === 'spheroid') F = { rmax: 0.036, top: (r) => z0 + 0.03 + 0.03 * ell(r, 0.036), bot: (r) => z0 + 0.03 - 0.03 * ell(r, 0.036) };
  else { const zb = z0 + (bowl ? 0.012 : 0); F = { rmax: 0.045, top: (r) => zb + 0.045 * ell(r, 0.045), bot: () => zb }; }
  const own = F.bot || (() => z0), bot = (r) => Math.max(own(r), sup(r));
  let rmax = 0; for (let r = 0; r <= (F.rmax || a) + 1e-9; r += 0.00025) if (F.top(r) - bot(r) > 1e-4) rmax = r;
  return { cont: C, food: { rmax, bot, top: F.top } };
}

// The pair numbers the rig and the explainer share.
export function heatInteract(food, cont0, start) {
  const swapped = food.shape === 'liquid' && cont0.shape !== 'bowl', cont = swapped ? CONTAINERS.glass : cont0;
  const freezes = food.freezes !== false && food.water > 0, frozen = freezes && start.T < 0;
  const low = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const where = cont.shape === 'none' ? 'on its own' : (cont.shape === 'plate' ? 'on a ' : 'in a ') + low(cont.name);
  return {
    kind: 'heat', container: cont, swapped, start, freezes, frozen, where, title: `${frozen ? 'Frozen ' + low(food.name) : food.name} ${where}`,
    loss: food.loss, lossStart: food.loss * (frozen ? food.iceLoss : 1), pen: food.pen, selfMix: food.mix > 1,
    contAbsorbs: (cont.loss || 0) >= 0.05, spread: food.k * food.mix,
  };
}

const NB6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const NB26 = []; for (let c = -1; c <= 1; c++) for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) if (a || b || c) NB26.push([a, b, c, Math.hypot(a, b, c)]);

export class HeatField {
  constructor(food, cont, start) {
    this.food = food; this.cont = cont; this.start = start;
    const S = shapes(food, cont), N = NX * NX * NZ, map = this.map = new Int32Array(N).fill(-1), list = [], kinds = [];
    for (let iz = 0; iz < NZ; iz++) for (let iy = 0; iy < NX; iy++) for (let ix = 0; ix < NX; ix++) {
      const x = (ix + 0.5) * DX - HALF, y = (iy + 0.5) * DX - HALF, z = (iz + 0.5) * DX, r = Math.hypot(x, y);
      const inC = S.cont && r <= S.cont.rmax && z >= S.cont.bot(r) && z <= S.cont.top(r);
      const inF = !inC && r <= S.food.rmax && z >= S.food.bot(r) && z <= S.food.top(r);
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
    // the cells on the axis at mid height: "the middle"
    const zMid = (S.food.bot(0) + S.food.top(0)) / 2; this.mid = [];
    for (let i = 0; i < n; i++) if (this.kind[i] === 1 && Math.hypot(this.px[i], this.py[i]) < DX * 1.5 && Math.abs(this.pz[i] - zMid) < DX * 1.1) this.mid.push(i);
    this.nFood = 0; for (let i = 0; i < n; i++) if (this.kind[i] === 1) this.nFood++;
    this.nCont = n - this.nFood; this.foodTop = S.food.top(0);
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
        const a = kind[i] === 1 ? f.loss * this.factor(i) : this.lossC;
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
    const { n, T, kind, ice } = this; let fs = 0, hot = -1e9, cold = 1e9, fi = 0, cs = 0, ch = -1e9;
    for (let i = 0; i < n; i++) {
      if (kind[i] === 1) { fs += T[i]; fi += ice[i]; if (T[i] > hot) hot = T[i]; if (T[i] < cold) cold = T[i]; } else { cs += T[i]; if (T[i] > ch) ch = T[i]; }
    }
    let mid = 0; for (const i of this.mid) mid += T[i]; mid = this.mid.length ? mid / this.mid.length : fs / this.nFood;
    this.s = { avg: fs / this.nFood, hot, cold, mid, frozen: fi / this.nFood, contAvg: this.nCont ? cs / this.nCont : null, contHot: this.nCont ? ch : null };
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
