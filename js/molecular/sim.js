// Small bead-and-spring particle model for the molecular view. Physics is 2D inside a thin slab
// (each bead keeps a fixed depth so it still renders as a 3D sphere). Periodic left-to-right.
export const POLAR = 0, OILY = 1, SURF = 2, SITE = 3, HYD = 4, RING = 5, NC = 6;   // interaction classes
export const G_SURF = 0, G_SUB = 1, G_TOP = 2;                           // groups: bottom surface, substance, top body
export const DT = 0.02;
const KR = 60, WA = 0.9, CELL = 2.8, CAP = 2400, VMAX = 9;
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;

export class Sim {
  constructor(W, yMin, yMax) {
    this.W = W; this.yMin = yMin; this.yMax = yMax; this.n = 0; this.cap = CAP;
    const f = () => new Float32Array(CAP), u = () => new Uint8Array(CAP);
    this.x = f(); this.y = f(); this.z = f(); this.vx = f(); this.vy = f(); this.fx = f(); this.fy = f(); this.r = f();
    this.ax = f(); this.ay = f(); this.tk = f(); this.tcap = f().fill(4);
    this.cls = u(); this.grp = u(); this.tg = u(); this.side = u(); this.active = u(); this.hide = u();
    this.col = new Uint32Array(CAP); this.mol = new Int32Array(CAP).fill(-1);
    this.rigid = []; this.molFirst = []; this.molCount = [];
    this.kind = []; this.area = [];                           // per molecule: which ingredient it is, and the room one of its handles takes up
    this.bonds = []; this.netStart = -1;                       // flat list: i, j, rest length, stiffness
    this.eps = new Float32Array(NC * NC); this.link = new Uint8Array(NC * NC);
    this.kT = 0.3; this.gamma = 2; this.gx = 0; this.gy = 0; this.load = 0; this.topAdh = 1;
    this.floor = null;                                         // per column: the lowest a substance bead may sit, so nothing ends up inside the solid below
    this.sq = 0; this.cx = W / 2;                              // settling only: a gentle squeeze of the substance towards the middle
    this.off = [0, 0, 0, 0, 0, 0];                             // anchor offset (x, y) per group
    this.nx = Math.max(3, Math.floor(W / CELL)); this.cw = W / this.nx; this.ny = Math.ceil((yMax - yMin) / CELL) + 1;
    this.head = new Int32Array(this.nx * this.ny); this.next = new Int32Array(CAP);
    this.adhKeys = new Set(); this.adh = []; this.coh = []; this.flashes = [];
    this.alive = 0; this.keep = Infinity;
  }
  setEps(a, b, e, link = 0) { this.eps[a * NC + b] = this.eps[b * NC + a] = e; this.link[a * NC + b] = this.link[b * NC + a] = link; }
  newMol(rigid) { this.rigid.push(rigid ? 1 : 0); this.molFirst.push(this.n); this.molCount.push(0); return this.rigid.length - 1; }
  add(x, y, o) {
    if (this.n >= CAP) return CAP - 1;
    const i = this.n++;
    this.x[i] = this.ax[i] = x; this.y[i] = this.ay[i] = y; this.z[i] = o.z || 0; this.r[i] = o.r; this.cls[i] = o.cls; this.grp[i] = this.tg[i] = o.grp;
    this.col[i] = o.color; this.tk[i] = o.tk || 0; this.active[i] = 1; this.hide[i] = o.hide ? 1 : 0; this.mol[i] = o.mol ?? -1;
    if (o.mol >= 0) this.molCount[o.mol]++;
    return i;
  }
  bond(i, j, r0, k) { this.bonds.push(i, j, r0, k); }
  kill(m) { for (let k = this.molFirst[m], e = k + this.molCount[m]; k < e; k++) this.active[k] = 0; this.alive--; }

  step(dt, collect) {
    const { n, x, y, vx, vy, fx, fy, r, cls, grp, side, active, mol, W, off, tk, eps, link, rigid } = this, hW = W / 2;
    // external forces and tethers
    for (let i = 0; i < n; i++) {
      if (!active[i]) continue;
      const g = grp[i]; let Fx = 0, Fy = 0;
      if (g === G_SUB) { Fx = this.gx; Fy = this.gy; if (this.sq) Fx -= this.sq * (x[i] - this.cx); }
      else if (g === G_TOP) Fy = -this.load;
      const k = tk[i];
      if (k) {
        const t = this.tg[i] * 2; let dx = x[i] - (this.ax[i] + off[t]); dx -= W * Math.round(dx / W);
        let tx = -k * dx, ty = -k * (y[i] - (this.ay[i] + off[t + 1]));
        if (g === G_SUB) { const cap = this.tcap[i], m2 = tx * tx + ty * ty; if (m2 > cap * cap) { const q = cap / Math.sqrt(m2); tx *= q; ty *= q; } }   // a guide, never strong enough to push molecules through each other
        Fx += tx; Fy += ty;
      }
      fx[i] = Fx; fy[i] = Fy;
    }
    // bonds
    const b = this.bonds;
    for (let k = 0; k < b.length; k += 4) {
      const i = b[k], j = b[k + 1]; if (!active[i] || !active[j]) continue;
      let dx = x[j] - x[i]; if (dx > hW) dx -= W; else if (dx < -hW) dx += W;
      const dy = y[j] - y[i], d = Math.sqrt(dx * dx + dy * dy) || 1e-6, f = b[k + 3] * (d - b[k + 2]) / d;
      fx[i] += f * dx; fy[i] += f * dy; fx[j] -= f * dx; fy[j] -= f * dy;
    }
    // pair forces through a cell list
    const { nx, ny, cw, head, next, yMin } = this; head.fill(-1);
    for (let i = 0; i < n; i++) {
      if (!active[i]) continue;
      let cx = Math.floor(x[i] / cw); if (cx < 0) cx = 0; else if (cx >= nx) cx = nx - 1;
      let cy = Math.floor((y[i] - yMin) / CELL); if (cy < 0) cy = 0; else if (cy >= ny) cy = ny - 1;
      const c = cy * nx + cx; next[i] = head[c]; head[c] = i;
    }
    const adh = collect ? [] : null, coh = collect ? [] : null, topAdh = this.topAdh;
    const pair = (i, j) => {
      let dx = x[j] - x[i]; if (dx > hW) dx -= W; else if (dx < -hW) dx += W;
      const dy = y[j] - y[i], d = r[i] + r[j], rc = d + WA, r2 = dx * dx + dy * dy;
      if (r2 >= rc * rc) return;
      const gi = grp[i], gj = grp[j];
      if (gi === gj && gi !== G_SUB) return;                              // a lattice holds itself through tethers and bonds
      const mi = mol[i];
      if (mi >= 0 && mi === mol[j] && (rigid[mi] || j - i === 1 || i - j === 1)) return;
      const ci = cls[i], cj = cls[j]; let e = eps[ci * NC + cj];
      if (e && side[i] && side[j] && side[i] !== side[j]) e = 0;
      if (e && (gi === G_TOP || gj === G_TOP)) e *= topAdh;
      const dist = Math.sqrt(r2) || 1e-6; let f;
      if (dist < d) f = KR * (d - dist);
      else { if (!e) return; const s = (dist - d) / WA; f = -e * (6 / WA) * s * (1 - s); }
      if (collect && e && dist < d + 0.4) {
        const t = link[ci * NC + cj];
        if (t === 1) adh.push(i, j); else if (t === 2 && coh.length < 1600) coh.push(i, j);
      }
      const ux = dx / dist * f, uy = dy / dist * f;
      fx[i] -= ux; fy[i] -= uy; fx[j] += ux; fy[j] += uy;
    };
    for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) {
      const xr = (cx + 1) % nx, xl = (cx + nx - 1) % nx, up = cy + 1 < ny;
      for (let i = head[cy * nx + cx]; i >= 0; i = next[i]) {
        for (let j = next[i]; j >= 0; j = next[j]) pair(i, j);
        for (let j = head[cy * nx + xr]; j >= 0; j = next[j]) pair(i, j);
        if (up) {
          const row = (cy + 1) * nx;
          for (let j = head[row + xl]; j >= 0; j = next[j]) pair(i, j);
          for (let j = head[row + cx]; j >= 0; j = next[j]) pair(i, j);
          for (let j = head[row + xr]; j >= 0; j = next[j]) pair(i, j);
        }
      }
    }
    // integrate with a Langevin thermostat
    const gam = this.gamma, sig = Math.sqrt(2 * gam * this.kT * dt), lo = this.yMin + 0.5, hi = this.yMax - 0.5, floor = this.floor;
    for (let i = 0; i < n; i++) {
      if (!active[i]) continue;
      const sub = grp[i] === G_SUB, tame = sub ? 1 : 0.5;
      let ax = vx[i] + (fx[i] - gam * vx[i]) * dt + sig * tame * gauss();
      let ay = vy[i] + (fy[i] - gam * vy[i]) * dt + sig * tame * gauss();
      if (ax > VMAX) ax = VMAX; else if (ax < -VMAX) ax = -VMAX;
      if (ay > VMAX) ay = VMAX; else if (ay < -VMAX) ay = -VMAX;
      vx[i] = ax; vy[i] = ay; x[i] += ax * dt; y[i] += ay * dt;
      if (x[i] >= W) {
        const m = mol[i];
        if (sub && m >= 0 && this.alive > this.keep && this.molCount[m] <= 7) { this.kill(m); continue; }   // drained off the plate
        x[i] -= W;
      } else if (x[i] < 0) x[i] += W;
      if (y[i] < lo) { y[i] = lo; vy[i] = 0; } else if (y[i] > hi) { y[i] = hi; vy[i] = 0; }
      if (sub && floor) { const c = Math.round(x[i] - 0.5), f = floor[c < 0 ? c + W : c >= W ? c - W : c]; if (y[i] < f) { y[i] = f; if (vy[i] < 0) vy[i] = 0; } }
    }
    if (collect) {
      const keys = new Set(); let fresh = 0;
      for (let k = 0; k < adh.length; k += 2) keys.add(Math.min(adh[k], adh[k + 1]) * CAP + Math.max(adh[k], adh[k + 1]));
      for (const key of this.adhKeys) {                                   // bonds stretch before they snap
        if (keys.has(key)) continue;
        const i = Math.floor(key / CAP), j = key % CAP; if (!active[i] || !active[j]) continue;
        let dx = x[j] - x[i]; if (dx > hW) dx -= W; else if (dx < -hW) dx += W;
        const dy = y[j] - y[i], d2 = dx * dx + dy * dy, lim = r[i] + r[j] + 0.85;
        const cut = (side[i] && side[j] && side[i] !== side[j]) || (!topAdh && (grp[i] === G_TOP || grp[j] === G_TOP));
        if (d2 < lim * lim && !cut) { keys.add(key); adh.push(i, j); }
        else if (d2 < 12 && fresh++ < 2 && this.flashes.length < 14) this.flashes.push({ x: x[i] + dx / 2, y: y[i] + dy / 2, life: 1 });
      }
      this.adhKeys = keys; this.adh = adh; this.coh = coh;
    }
  }
}
