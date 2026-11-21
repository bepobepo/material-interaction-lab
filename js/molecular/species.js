// What each material is made of at the molecular scale: simplified but recognisable shapes.
import { POLAR, OILY, SURF, SITE, HYD, RING, G_SUB } from './sim.js';

export const C = { O: 0xe5484d, H: 0xf4f6fa, FAT: 0xe8c547, SUGAR: 0xe0a030, PROT: 0xb694e8, FIBRE: 0x7fb069, NUT: 0xc08a4a, TAFFY: 0xf28fb5, GUM: 0x58c9a6, F: 0x6fdc8c };
const WATER = { kind: 'water', frac: 1, color: C.O, label: 'water molecule' };

export const SUB_RECIPES = {
  water:   { parts: [WATER],
             blurb: 'Small molecules that cling to each other through hydrogen bonds but swap partners constantly, so it flows easily.' },
  oil:     { parts: [{ kind: 'chain', n: 5, r: 0.45, cls: OILY, color: C.FAT, frac: 1, label: 'fat chain' }],
             blurb: 'Short fatty chains that barely attract each other and slip past one another.' },
  honey:   { parts: [{ kind: 'ring', frac: 0.7, color: C.SUGAR, label: 'sugar ring' }, WATER],
             blurb: 'Packed with sugar rings, each hydrogen-bonded to several neighbours, so everything moves slowly.' },
  yogurt:  { parts: [{ kind: 'cluster', frac: 0.4, color: C.PROT, net: 4.7, label: 'milk protein clump (not to scale)' }, WATER],
             blurb: 'Water trapped in a loose net of milk-protein clumps. The net holds its shape until it is forced to give. Real clumps are hundreds of times wider than a water molecule.' },
  ketchup: { parts: [{ kind: 'chain', n: 12, r: 0.42, cls: POLAR, color: C.FIBRE, frac: 0.3, stiff: true, label: 'plant fibre' }, WATER],
             blurb: 'Water threaded with long plant fibres that tangle into a weak net.' },
  peanut:  { parts: [{ kind: 'ball', frac: 0.5, color: C.NUT, net: 2.7, label: 'peanut particle (not to scale)' }, { kind: 'chain', n: 5, r: 0.44, cls: OILY, color: C.FAT, frac: 1, label: 'fat chain' }],
             blurb: 'Solid peanut particles jammed together in oil; they have to shove past each other to move. Real particles are thousands of times bigger than drawn.' },
  taffy:   { parts: [{ kind: 'chain', n: 14, r: 0.44, cls: POLAR, color: C.TAFFY, frac: 0.45, fold: 3, label: 'syrup chain' }, { kind: 'ring', frac: 1, color: C.SUGAR, label: 'sugar ring' }],
             blurb: 'Densely packed sugar with chains that tangle, stick, and stretch before they let go.' },
  gum:     { parts: [{ kind: 'chain', n: 26, r: 0.46, cls: OILY, color: C.GUM, frac: 1, fold: 3, label: 'gum polymer chain' }],
             blurb: 'Very long rubbery chains tangled together; they stretch a long way and hold on to each other.' },
};

export const SOLID_RECIPES = {
  ceramic: { color: 0x7f9fbf, atom: 'glaze atom',
             blurb: 'A hard glassy lattice dotted with –OH groups that polar molecules latch onto.' },
  glass:   { color: 0x8fd3c8, atom: 'glass atom',
             blurb: 'A very smooth lattice crowded with –OH groups, so polar molecules grab it readily.' },
  teflon:  { color: 0x566178, style: 'chain', top: C.F, topLabel: 'fluorine sheath', atom: 'carbon backbone', noSites: true,
             blurb: 'Carbon chains sheathed in fluorine, which gives other molecules almost nothing to hold.' },
  steel:   { color: 0xc0c5ce, atom: 'metal atom',
             blurb: 'Metal atoms under a thin oxide skin with a moderate number of sticky sites.' },
  wood:    { color: 0xb98455, style: 'chain', atom: 'cellulose fibre',
             blurb: 'Cellulose fibres carrying –OH groups, with a rough, open surface to key into.' },
  stone:   { color: 0x9a9da0, atom: 'mineral atom',
             blurb: 'A hard mineral lattice with sticky sites and atomic-scale steps that give extra footholds.' },
  ice:     { color: 0xa5d8ff, atom: 'frozen water', loose: true,
             blurb: 'A water crystal whose top layer is loose and almost liquid, so things skate on it.' },
  enamel:  { color: 0xe8dfc0, atom: 'enamel crystal',
             blurb: 'A hard mineral crystal with some sticky sites and fine pits.' },
  rubber:  { color: 0x7d89a6, style: 'chain', atom: 'rubber chain',
             blurb: 'Floppy cross-linked chains that mould themselves around whatever they touch.' },
  leather: { color: 0x9a6846, style: 'chain', atom: 'collagen fibre',
             blurb: 'Bundles of protein fibres: fairly soft, with a few sticky groups.' },
  plastic: { color: 0x4f8fe0, style: 'chain', atom: 'plastic chain',
             blurb: 'Stiff chains with few sticky groups.' },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const shade = (c, f) => (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f);

// How lively the molecules are: thick substances are damped and jiggle less.
export function dynamics(sub) {
  const d = Math.log10(Math.max(sub.viscosity, 0.001) / 0.001);
  return { gamma: clamp(1 + d, 1, 8), kT: clamp(0.25 - 0.02 * d, 0.1, 0.25) };
}

// ---- solids: a lattice (or layered chains) with a bumpy top and sticky sites ------------------
const ROW = 0.87, DEEP = 3;
export const ampRows = (solid) => Math.round(solid.roughness * 5);
export const siteFraction = (solid) => (SOLID_RECIPES[solid.id].noSites ? 0 : clamp((solid.surfaceEnergy - 22) / 60, 0, 0.8));

export function buildSurface(sim, solid, { W, base, dir, grp, rng, depth = false, body = false, minAmp = 0 }) {
  const R = SOLID_RECIPES[solid.id], amp = Math.max(minAmp, ampRows(solid)), chain = R.style === 'chain', pSite = siteFraction(solid);
  const k1 = Math.max(1, Math.round(W / 15)), k2 = Math.max(2, Math.round(W / 6.5)), p1 = rng() * 6.283, p2 = rng() * 6.283;
  const h = [];
  for (let c = 0; c < W; c++) { const u = c / W * Math.PI * 2; h.push(Math.round(amp * (0.5 + 0.3 * Math.sin(u * k1 + p1) + 0.2 * Math.sin(u * k2 + p2)))); }
  const soft = solid.softness, simAll = body && soft > 0.3, idx = new Map(), statics = [], decos = [];
  const key = (c, r) => ((c + W) % W) * 64 + (r + 8);
  for (let r = -DEEP; r <= amp; r++) for (let c = 0; c < W; c++) {
    if (r > h[c]) continue;
    const x = c + 0.25 + (r & 1 ? 0.5 : 0), y = base + dir * r * ROW, top = r === h[c];
    const exposed = r >= Math.min(h[(c + W - 1) % W], h[c], h[(c + 1) % W]) - 1, site = top && rng() < pSite;
    const plain = top && R.top ? R.top : shade(R.color, top ? 1 : body ? 0.86 : r < h[c] - 1 ? 0.62 : 0.8), color = site ? C.O : plain;
    if (exposed || simAll) {
      let k = body ? (r === -DEEP ? 45 : soft > 0.7 ? 0.75 : 45 * (1 - soft) + 0.3) : 45 * (1 - 0.8 * soft) + 2;   // very soft bodies hang loose and drape
      if (R.loose && top) k = 3;
      const i = sim.add(x, y, { r: 0.5, cls: site ? SITE : SURF, grp, color, tk: k });
      idx.set(key(c, r), i);
      if (site) decos.push({ parent: i, dx: 0.2, dy: dir * 0.52, r: 0.24, color: C.H });
    } else statics.push({ x, y, z: 0, r: 0.5, color, grp });
    if (depth && r >= h[c] - 1) for (let d = 1; d <= 4; d++) {
      const back = top && rng() < pSite ? C.O : plain;
      statics.push({ x: x + (d & 1 ? 0.5 : 0), y, z: -d * 0.9, r: 0.5, color: shade(back, Math.pow(0.82, d)), grp });
    }
  }
  const kb = simAll ? 30 * (1 - soft) + 12 : 30;                          // stretchy links in soft bodies
  if (chain || simAll) for (const [kk, i] of idx) {
    const c = Math.floor(kk / 64), r = (kk % 64) - 8, right = idx.get(key(c + 1, r));
    if (right !== undefined) sim.bond(i, right, 1, kb);
    if (simAll || (chain && c % 4 === 0)) for (const cc of r & 1 ? [c, c + 1] : [c - 1, c]) { const below = idx.get(key(cc, r - 1)); if (below !== undefined) sim.bond(i, below, 1, kb); }
  }
  const legend = [{ color: R.color, label: R.atom }];
  if (R.top) legend.push({ color: R.top, label: R.topLabel });
  if (pSite > 0) legend.push({ color: C.O, label: '–OH sticky site' });
  const at = (c) => h[((c % W) + W) % W];
  // y of the outermost bead centres near x (takes the highest of the neighbouring columns)
  const topY = (x) => { const c = Math.round(x - 0.5); return base + dir * Math.max(at(c - 1), at(c), at(c + 1)) * ROW; };
  return { h, amp, statics, decos, legend, topY };
}

// ---- substances -------------------------------------------------------------------------------
const SIZE = { water: 0.56, ring: 0.84, cluster: 1.36, ball: 0.85 };
const MAKE = {
  water(sim, x, y, a, z) {
    const m = sim.newMol(true), o = sim.add(x, y, { r: 0.42, cls: POLAR, grp: G_SUB, color: C.O, mol: m, z });
    const hs = [a - 0.91, a + 0.91].map((t) => sim.add(x + Math.cos(t) * 0.5, y + Math.sin(t) * 0.5, { r: 0.25, cls: HYD, grp: G_SUB, color: C.H, mol: m, z: z + 0.05 }));
    sim.bond(o, hs[0], 0.5, 90); sim.bond(o, hs[1], 0.5, 90); sim.bond(hs[0], hs[1], 0.79, 70);
  },
  ring(sim, x, y, a, z, p) {
    const m = sim.newMol(true), ids = [];
    for (let k = 0; k < 6; k++) { const t = a + k * Math.PI / 3; ids.push(sim.add(x + Math.cos(t) * 0.5, y + Math.sin(t) * 0.5, { r: 0.3, cls: RING, grp: G_SUB, color: k ? p.color : C.O, mol: m, z })); }
    const hub = sim.add(x, y, { r: 0.3, cls: HYD, grp: G_SUB, color: p.color, mol: m, z, hide: true });   // unseen filler: stops rings threading through each other
    for (let k = 0; k < 6; k++) { sim.bond(ids[k], ids[(k + 1) % 6], 0.5, 90); sim.bond(ids[k], ids[(k + 2) % 6], 0.866, 60); sim.bond(ids[k], hub, 0.5, 60); }
  },
  cluster(sim, x, y, a, z, p, centres) {
    const m = sim.newMol(true), c = sim.add(x, y, { r: 0.5, cls: POLAR, grp: G_SUB, color: p.color, mol: m, z }), ids = [];
    for (let k = 0; k < 6; k++) { const t = a + k * Math.PI / 3; ids.push(sim.add(x + Math.cos(t) * 0.86, y + Math.sin(t) * 0.86, { r: 0.5, cls: POLAR, grp: G_SUB, color: shade(p.color, k & 1 ? 0.86 : 1), mol: m, z })); }
    for (let k = 0; k < 6; k++) { sim.bond(c, ids[k], 0.86, 80); sim.bond(ids[k], ids[(k + 1) % 6], 0.86, 80); }
    centres.push(c);
  },
  ball(sim, x, y, a, z, p, centres) { const m = sim.newMol(true); centres.push(sim.add(x, y, { r: 0.85, cls: POLAR, grp: G_SUB, color: p.color, mol: m, z })); },
};

const NUDGE = [[0, 0.3], [0, -0.3], [0.3, 0], [-0.3, 0], [0, 0.6], [0, -0.6], [0.6, 0], [-0.6, 0], [0.45, 0.45], [-0.45, 0.45], [0.45, -0.45], [-0.45, -0.45]];
// Fill the region `inside(x, y, clearance)` with the parts, largest first, on jittered hex grids.
export function fillParts(sim, parts, inside, box, rng, vertical = false) {
  const start = sim.n, legend = [], nets = []; let mols = 0;
  let own = start;                                                         // where the ingredient being placed begins
  const clash = (px, py, s, end) => {                                      // only earlier ingredients can be in the way: the grid already spaces an ingredient from itself
    for (let j = start; j < end; j++) { const dx = sim.x[j] - px, dy = sim.y[j] - py, d = s + sim.r[j] * 0.9; if (dx * dx + dy * dy < d * d) return true; }
    return false;
  };
  parts.forEach((p, pi) => {
    const size = SIZE[p.kind] || p.r, pitch = size * (p.kind === 'chain' ? 1.95 : 2.08), rowH = pitch * 0.88, centres = [];
    let left = 0, prev = -1, pp = -1, m = -1, zc = 0, skip = 0, quota = rng();
    legend.push({ color: p.color, label: p.label }); own = sim.n;
    const o0 = vertical ? box.x0 : box.y0, o1 = vertical ? box.x1 : box.y1, i0 = vertical ? box.y0 : box.x0, i1 = vertical ? box.y1 : box.x1;
    // The order the places are visited in. It snakes, so a chain carries on from one row into the next. A long flexible
    // chain (fold: 3) zigzags along a band three rows deep instead: a loose coil that can open out when it is pulled.
    const rows = [], path = [], fold = p.fold || 1, cols = Math.floor((i1 - i0 - 2 * size) / pitch) + 1;
    for (let oo = o0 + size; oo < o1; oo += rowH) rows.push(oo);
    for (let band = 0; band * fold < rows.length; band++) for (let n = 0; n < cols; n++) {
      const c = band & 1 ? cols - 1 - n : n, r0 = band * fold, r1 = Math.min(rows.length, r0 + fold);
      for (let q = 0; q < r1 - r0; q++) {
        const r = n & 1 ? r1 - 1 - q : r0 + q, ii = i0 + size + (r & 1 ? pitch / 2 : 0) + c * pitch;
        if (ii <= i1 - size) path.push(rows[r], ii);
      }
    }
    {
      for (let q = 0; q < path.length; q += 2) {
        const oo = path[q], ii = path[q + 1];
        if (sim.n > sim.cap - 40) break;
        let px = (vertical ? oo : ii) + (rng() - 0.5) * 0.1, py = (vertical ? ii : oo) + (rng() - 0.5) * 0.1;
        let ok = inside(px, py, size) && !clash(px, py, size, own);
        if (!ok && own > start && p.kind !== 'chain') for (const [ax, ay] of NUDGE) {   // a later ingredient shuffles sideways into the pockets left by the earlier ones
          if (inside(px + ax, py + ay, size) && !clash(px + ax, py + ay, size, sim.n)) { px += ax; py += ay; ok = true; break; }
        }
        if (!ok) continue;
        if (p.kind === 'chain') {
          if (left > 0 && Math.hypot(sim.x[prev] - px, sim.y[prev] - py) > pitch * 1.5) left = 0;   // something is in the way: the chain ends here
          if (left === 0) {
            if (skip > 0) { skip--; continue; }
            quota += p.frac; if (quota < 1) { skip = p.n - 1; continue; }   // leave room for the other ingredients
            quota -= 1;
            m = sim.newMol(false); sim.kind[m] = pi; sim.area[m] = pitch * rowH; mols++; left = p.n; prev = pp = -1; zc = (rng() - 0.5) * 0.9;
          }
          const i = sim.add(px, py, { r: p.r, cls: p.cls, grp: G_SUB, color: p.color, mol: m, z: zc });
          if (prev >= 0) sim.bond(prev, i, p.r * 1.75, 80);
          if (p.stiff && pp >= 0) sim.bond(pp, i, p.r * 3.45, 25);
          pp = prev; prev = i; left--;
        } else {
          quota += p.frac; if (quota + (p.frac < 1 ? (rng() - 0.5) * 0.9 : 0) < 1) continue;   // random place by place, but an even share overall, so a minor ingredient is spread through the whole sample
          quota -= 1; mols++; MAKE[p.kind](sim, px, py, rng() * 6.283, (rng() - 0.5) * 0.9, p, centres);
          sim.kind[sim.rigid.length - 1] = pi; sim.area[sim.rigid.length - 1] = pitch * rowH;
        }
      }
    }
    if (p.net) nets.push([centres, p.net]);
  });
  for (const [centres, reach] of nets) {                                  // weak links between neighbours: a gel network (added last so it can be cut)
    if (sim.netStart < 0) sim.netStart = sim.bonds.length;
    for (let a = 0; a < centres.length; a++) for (let b = a + 1; b < centres.length; b++) {
      const d = Math.hypot(sim.x[centres[a]] - sim.x[centres[b]], sim.y[centres[a]] - sim.y[centres[b]]);
      if (d < reach) sim.bond(centres[a], centres[b], d, 3);
    }
  }
  return { legend, mols };
}
export const fillSubstance = (sim, sub, inside, box, rng, vertical) => fillParts(sim, SUB_RECIPES[sub.id].parts, inside, box, rng, vertical);
export const WATER_PART = WATER;
