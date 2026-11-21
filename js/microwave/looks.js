// What each food looks like. Every food gets two small pictures: its top surface seen from above (256 px = EXTENT metres,
// centred on the piece) and its inside seen from the side (256 x 128 px = EXTENT x TALL metres, from its base up). Each comes in two versions: real colours, and a
// grey "detail" version that the heat colours are multiplied by, so soup, rice and lasagne still look different when
// they are coloured by temperature.
import { PIZZA } from './data.js';

export const EXTENT = 0.18, TALL = 0.07;
const W = 256, H = 128;

function rng(seed) { let a = seed; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// n ellipses of size a x b (px) scattered over the canvas
function scatter(g, R, n, a, b, fill, o = {}) {
  const w = g.canvas.width, h = g.canvas.height;
  for (let i = 0; i < n; i++) {
    const s = 1 + (o.vary || 0) * (R() - 0.5) * 2;
    g.save(); g.translate(R() * w, R() * h); g.rotate(R() * Math.PI); g.globalAlpha = o.alpha || 1;
    g.beginPath(); if (o.square) g.rect(-a * s, -b * s, 2 * a * s, 2 * b * s); else g.ellipse(0, 0, a * s, b * s, 0, 0, Math.PI * 2);
    g.fillStyle = Array.isArray(fill) ? fill[Math.floor(R() * fill.length)] : fill; g.fill();
    if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = 0.8; g.stroke(); }
    g.restore();
  }
}
const base = (g, col) => { g.fillStyle = col; g.fillRect(0, 0, g.canvas.width, g.canvas.height); };
function waves(g, R, n, col, width, alpha) {   // slow wavy strokes across the picture
  const w = g.canvas.width, h = g.canvas.height; g.strokeStyle = col; g.lineWidth = width; g.globalAlpha = alpha; g.lineCap = 'round';
  for (let i = 0; i < n; i++) { const y = R() * h, p = R() * 6, a = 6 + R() * 10; g.beginPath(); for (let x = -8; x <= w + 8; x += 8) g.lineTo(x, y + a * Math.sin(x / 34 + p)); g.stroke(); }
  g.globalAlpha = 1;
}

const PAINT = {
  water(g, R) { base(g, '#cfe6f5'); waves(g, R, 4, '#ffffff', 5, 0.6); scatter(g, R, 14, 4, 4, '#f2fafe', { stroke: '#7fb2cf', vary: 0.4 }); },
  soup(g, R) {      // chunky: carrot cubes, pasta, herbs
    base(g, '#d6622a'); scatter(g, R, 9, 34, 22, '#e88a3c', { alpha: 0.35 });
    scatter(g, R, 34, 7, 7, ['#f9bd4f', '#f5a93c'], { square: true, vary: 0.25, stroke: '#b9541f' });
    scatter(g, R, 22, 9, 5, '#f6e6bd', { vary: 0.3, stroke: '#b9541f' }); scatter(g, R, 46, 5.5, 2.2, ['#456f2c', '#365c22']);
  },
  rice(g, R) { base(g, '#cfc3a6'); scatter(g, R, 520, 8, 3.3, ['#fbf8ef', '#f4eee0', '#fffdf6'], { stroke: '#a89a7a', vary: 0.2 }); },
  lasagne(g, R) {   // melted cheese with browned patches and sauce showing through
    base(g, '#e2ae45'); scatter(g, R, 30, 15, 10, '#f5dd94', { alpha: 0.75, vary: 0.5 });
    scatter(g, R, 34, 14, 9, ['#a9581a', '#8f4614'], { alpha: 0.8, vary: 0.6 }); scatter(g, R, 16, 8, 6, '#96291a', { vary: 0.5 });
  },
  lasagneSide(g, R) {      // layers of pasta and sauce
    const w = g.canvas.width, h = g.canvas.height; base(g, '#8e311d');
    scatter(g, R, 120, 4, 2.6, ['#6f2313', '#b4502c', '#5f1d10'], { vary: 0.5 });
    for (let y = 5; y < h; y += 22) { g.fillStyle = '#f1dba6'; g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + 2 * Math.sin(x / 19 + y)); for (let x = w; x >= 0; x -= 8) g.lineTo(x, y + 8 + 2 * Math.sin(x / 19 + y)); g.fill(); }
  },
  potato(g, R) { base(g, '#b98a55'); scatter(g, R, 260, 1.8, 1.8, '#9a6f41', { alpha: 0.5 }); scatter(g, R, 34, 5, 3.6, ['#7c5229', '#684420'], { vary: 0.4 }); },
  potatoSide(g, R) { base(g, '#f1e2b0'); scatter(g, R, 40, 16, 9, '#e3cc88', { alpha: 0.5 }); scatter(g, R, 60, 2, 2, '#d3bb74'); },
  bread(g, R) {     // crust dusted with flour and scored across the top
    const w = g.canvas.width, h = g.canvas.height; base(g, '#c0792f'); scatter(g, R, 14, 40, 26, '#d99a4c', { alpha: 0.4 });
    scatter(g, R, 320, 2.2, 2.2, '#f6ead2', { alpha: 0.7 });
    g.strokeStyle = '#f0d3a0'; g.lineWidth = 9; g.lineCap = 'round';
    for (const o of [-24, 0, 24]) { g.beginPath(); g.moveTo(w / 2 - 28 + o * 0.3, h / 2 + o - 13); g.lineTo(w / 2 + 28 + o * 0.3, h / 2 + o + 13); g.stroke(); }
  },
  breadSide(g, R) { base(g, '#f0e0bb'); scatter(g, R, 95, 8, 5, ['#cdb27c', '#bfa46e'], { vary: 0.7 }); },
  oil(g, R) { base(g, '#f0cf45'); waves(g, R, 2, '#fff6c2', 11, 0.5); },
  pasta(g, R) {     // strands of pasta with meat sauce on top in the middle
    base(g, '#c99a3c'); waves(g, R, 26, '#f3d98a', 6, 0.95); waves(g, R, 14, '#e2bd62', 5, 0.9);
    const gr = g.createRadialGradient(128, 128, 20, 128, 128, 92); gr.addColorStop(0, '#8f2f17'); gr.addColorStop(0.75, '#a03a1c'); gr.addColorStop(1, 'rgba(160,58,28,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.save(); g.beginPath(); g.arc(128, 128, 74, 0, Math.PI * 2); g.clip(); scatter(g, R, 150, 5, 4, ['#5e2413', '#74301a', '#c4532a'], { vary: 0.5 }); scatter(g, R, 30, 4, 1.8, '#3f6a2a'); g.restore();
  },
  pastaSide(g, R) { base(g, '#b9552a'); waves(g, R, 16, '#f3d98a', 6, 0.95); scatter(g, R, 70, 4, 3, ['#5e2413', '#74301a'], { vary: 0.5 }); },
  pizza(g, R) {     // drawn to match the slice's outline: tip on the left, crust on the right
    const px = 256 / EXTENT, tx = 128 - PIZZA.tip * PIZZA.L * px, L = PIZZA.L * px, a = PIZZA.half + 0.2;
    const wedge = (r, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(tx, 128); g.arc(tx, 128, r, -a, a); g.fill(); };
    base(g, '#c58a45'); scatter(g, R, 60, 6, 4, '#a96f30', { alpha: 0.5 });
    wedge(L - 0.017 * px, '#b53a1d'); wedge(L - 0.022 * px, '#f0c75c');
    g.save(); g.beginPath(); g.moveTo(tx, 128); g.arc(tx, 128, L - 0.024 * px, -a, a); g.clip();
    scatter(g, R, 40, 13, 8, '#f7dc8e', { alpha: 0.6, vary: 0.5 }); scatter(g, R, 26, 7, 5, '#d99a3a', { alpha: 0.7, vary: 0.5 });
    for (const [d, t] of [[0.36, 0], [0.6, -0.2], [0.62, 0.22], [0.8, 0.02]]) { g.fillStyle = '#9c2418'; g.strokeStyle = '#6f150d'; g.lineWidth = 2; g.beginPath(); g.arc(tx + d * L * Math.cos(t), 128 + d * L * Math.sin(t), 11, 0, Math.PI * 2); g.fill(); g.stroke(); }
    scatter(g, R, 70, 3.5, 1.5, '#3f6a2a'); g.restore();
  },
  pizzaSide(g, R) { base(g, '#e6c88f'); scatter(g, R, 120, 5, 3, ['#c9a566', '#bb9658'], { vary: 0.6 }); g.fillStyle = '#b53a1d'; g.fillRect(0, 102, 256, 5); g.fillStyle = '#f0c75c'; g.fillRect(0, 98, 256, 5); },
  tomato(g, R) {    // shiny red skin with the green stalk scar in the middle
    base(g, '#d42a1c'); scatter(g, R, 10, 40, 26, '#e8503a', { alpha: 0.45 });
    g.fillStyle = '#3f7a2a'; g.strokeStyle = '#2c5a1c'; g.lineWidth = 1.5; g.beginPath();
    for (let k = 0; k < 10; k++) { const a = Math.PI * k / 5, r = k % 2 ? 6 : 19; g.lineTo(128 + r * Math.cos(a), 128 + r * Math.sin(a)); }
    g.closePath(); g.fill(); g.stroke();
  },
  tomatoSide(g) {   // flesh, a pale core and two seed pockets
    base(g, '#e2452c'); const cy = 128 - 0.026 / TALL * 128;
    g.fillStyle = '#f0907a'; g.beginPath(); g.ellipse(128, cy, 9, 30, 0, 0, Math.PI * 2); g.fill();
    for (const sx of [-1, 1]) {
      g.fillStyle = '#f2b23c'; g.beginPath(); g.ellipse(128 + sx * 24, cy, 12, 24, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f7e6a8'; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(128 + sx * (20 + (k % 2) * 8), cy - 16 + k * 8, 2.5, 4, 0, 0, Math.PI * 2); g.fill(); }
    }
  },
  egg(g) { base(g, '#f6f1e6'); },
  eggSide(g) {      // the yolk, in the middle of the egg
    base(g, '#f6f1e6'); g.fillStyle = '#eda91f'; g.strokeStyle = '#c98510'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(128, 128 - 0.0204 / TALL * 128, 0.0125 / EXTENT * 256, 0.0125 / TALL * 128, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  },
  chicken(g, R) {   // roasted skin
    base(g, '#b8702a'); scatter(g, R, 16, 40, 26, '#d49645', { alpha: 0.55 }); scatter(g, R, 22, 16, 10, ['#8a4a17', '#7a3d12'], { alpha: 0.6, vary: 0.6 });
    scatter(g, R, 160, 2, 1.6, '#6b3410', { alpha: 0.6 }); scatter(g, R, 40, 3, 1.4, '#3f5a24');
  },
  chickenSide(g, R) { base(g, '#ecdcc3'); waves(g, R, 14, '#cdb38f', 3, 0.8); scatter(g, R, 10, 30, 12, '#dcc6a4', { alpha: 0.6 }); },
  honey(g, R) { base(g, '#d4860f'); waves(g, R, 5, '#f6bd4a', 8, 0.6); waves(g, R, 4, '#9c5a06', 5, 0.55); },
};

// The grey detail version. Heat colours are already as bright as the screen goes, so detail can only darken them:
// the food's main colour stays untouched and everything that differs from it (lighter or darker) is drawn darker.
function detail(src) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d'), img = src.getContext('2d').getImageData(0, 0, src.width, src.height), d = img.data, n = d.length / 4;
  const L = new Float32Array(n), hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) { L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; hist[Math.round(L[i])]++; }
  let main = 0, seen = 0; while (seen + hist[main] < n / 2) seen += hist[main++];        // the median brightness
  for (let i = 0; i < n; i++) { const v = 1 - 0.38 * Math.min(1, Math.abs(L[i] - main) / 45); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.round(255 * v); d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  return { canvas: c, gain: 1 };
}

const cache = new Map();
export function foodLook(id) {
  if (cache.has(id)) return cache.get(id);
  const make = (name, h, seed) => {
    const c = document.createElement('canvas'); c.width = W; c.height = h;
    PAINT[name](c.getContext('2d'), rng(seed)); return { colour: c, ...detail(c) };
  };
  const look = { top: make(id, W, 7), side: make(PAINT[id + 'Side'] ? id + 'Side' : id, H, 19) };
  cache.set(id, look); return look;
}

// Containers keep one plain colour, so they only need a detail picture (white = untouched): speckles or pleats.
export function containerDetail(kind) {
  if (!kind) return null;
  if (cache.has(kind)) return cache.get(kind);
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), R = rng(3);
  base(g, '#ffffff');
  if (kind === 'speckle') { scatter(g, R, 150, 1.6, 1.3, ['#7d7d7d', '#9a9a9a', '#5e5e5e'], { vary: 0.6 }); }
  else { g.fillStyle = '#b4b4b4'; for (let x = 0; x < 128; x += 16) g.fillRect(x, 0, 5, 128); }   // pleats
  cache.set(kind, c); return c;
}
