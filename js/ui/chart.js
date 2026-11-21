import { LANE_COLORS, LOOK } from '../rigs/common.js';

export function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  return { g, w, h };
}
export const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export function drawChart(canvas, tr) {
  const { g, w, h } = fitCanvas(canvas);
  if (!w) return;
  const L = 38, R = 10, T = 10, B = 28, pw = w - L - R, ph = h - T - B;
  let yMax = tr.yMax; const yMin = tr.yMin || 0;
  if (tr.yMax !== 100) { let m = 0.5; for (const s of tr.series) for (const p of s) if (p.y > m) m = p.y; yMax = Math.ceil(m * 1.15 * 2) / 2; }
  const ink = cssVar('--muted'), line = cssVar('--line');
  g.font = LOOK.weight + ' 11px ' + LOOK.font; g.fillStyle = ink; g.strokeStyle = line; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = T + ph * (1 - i / 4);
    g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke();
    g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText((yMin + (yMax - yMin) * i / 4).toFixed(yMax < 10 ? 1 : 0), L - 6, y);
  }
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (let i = 0; i <= 4; i++) g.fillText((tr.xMax * i / 4).toFixed(0), L + pw * i / 4, T + ph + 4);
  g.fillText(tr.x, L + pw / 2, h - 13);
  g.save(); g.translate(10, T + ph / 2); g.rotate(-Math.PI / 2); g.textBaseline = 'middle'; g.fillText(tr.y, 0, 0); g.restore();
  const plot = (dash, width) => (s, i) => {
    if (!s.length) return;
    g.strokeStyle = LANE_COLORS[i]; g.lineWidth = width; g.lineJoin = 'round'; g.setLineDash(dash); g.beginPath();
    s.forEach((p, k) => { const x = L + pw * Math.min(1, p.x / tr.xMax), y = T + ph * (1 - Math.min(1, Math.max(0, (p.y - yMin) / (yMax - yMin)))); k ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke(); g.setLineDash([]);
  };
  (tr.extra || []).forEach(plot([5, 4], 1.5));   // secondary, dashed lines (the microwave's container)
  tr.series.forEach(plot([], 2));
}
