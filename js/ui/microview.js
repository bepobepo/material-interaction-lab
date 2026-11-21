// Schematic close-up of the contact for each lane: surface bumps, how the other material meets them.
import { fitCanvas, cssVar } from './chart.js';
import { LANE_COLORS } from '../rigs/common.js';
import { hex } from '../materials.js';

// deterministic bumpy profile, 0..1
function profile(x, seed) {
  return 0.5 + 0.22 * Math.sin(x * 0.21 + seed) + 0.16 * Math.sin(x * 0.53 + seed * 2.3) + 0.12 * Math.sin(x * 1.17 + seed * 4.1);
}
const visible = (c, bg) => (c.toLowerCase() === bg.toLowerCase() ? '#888' : c);

function solidPanel(g, x0, w, h, lane, seed) {
  const { a, b, inter: I } = lane, base = h * 0.62, ampB = 4 + 26 * b.roughness, ampA = 3 + 20 * a.roughness;
  const yB = (x) => base - ampB * profile(x, seed);
  let peak = Infinity; for (let x = 0; x <= w; x += 2) peak = Math.min(peak, yB(x));
  const conform = Math.min(0.95, I.soft * 1.05);
  const yA = (x) => { const hard = peak - 1 - ampA * (1 - profile(x * 1.3, seed + 9)) * 0.6; return hard + (yB(x) - 1 - hard) * conform; };
  // bottom surface
  g.fillStyle = hex(b.look.color); g.beginPath(); g.moveTo(x0, h);
  for (let x = 0; x <= w; x += 2) g.lineTo(x0 + x, yB(x)); g.lineTo(x0 + w, h); g.closePath(); g.fill();
  g.strokeStyle = cssVar('--muted'); g.lineWidth = 1; g.stroke();
  // water in the gap
  if (I.wet) { g.fillStyle = 'rgba(90,170,240,0.55)'; g.beginPath(); g.moveTo(x0, yA(0)); for (let x = 0; x <= w; x += 2) g.lineTo(x0 + x, yA(x)); for (let x = w; x >= 0; x -= 2) g.lineTo(x0 + x, yB(x)); g.closePath(); g.fill(); }
  // top body
  g.fillStyle = hex(a.look.color); g.beginPath(); g.moveTo(x0, 22);
  g.lineTo(x0 + w, 22); for (let x = w; x >= 0; x -= 2) g.lineTo(x0 + x, yA(x)); g.closePath(); g.fill(); g.stroke();
  // real contact points
  g.strokeStyle = '#ef4444'; g.lineWidth = 3; g.beginPath(); let on = false, touching = 0, n = 0;
  for (let x = 0; x <= w; x += 2) {
    const t = yB(x) - yA(x) < 3; n++; if (t) touching++;
    if (t && !on) { g.moveTo(x0 + x, yB(x) - 1); on = true; } else if (t) g.lineTo(x0 + x, yB(x) - 1); else on = false;
  }
  g.stroke();
  return `real contact ≈ ${Math.max(1, Math.round(touching / n * 100))}%`;
}

function wetPanel(g, x0, w, h, lane, seed, strands) {
  const { a, b, inter: I } = lane, base = h * 0.7, amp = 3 + 16 * b.roughness;
  const yB = (x) => base - amp * profile(x, seed) + amp * 0.5;
  const th = Math.max(10, Math.min(150, I.contactAngle)) * Math.PI / 180, half = w * (0.36 - 0.12 * (th / Math.PI)), cx = x0 + w / 2;
  const R = half / Math.sin(th), cy = base + R * Math.cos(th);
  // drop
  g.fillStyle = hex(a.look.color); g.globalAlpha = Math.max(0.75, a.look.opacity);
  g.beginPath(); g.arc(cx, cy, R, Math.PI + (Math.PI / 2 - th), -(Math.PI / 2 - th)); g.closePath(); g.fill();
  if (I.wetting > 0.6) g.fillRect(cx - half, base - 1, half * 2, amp + 2);   // fills the pits
  g.globalAlpha = 1; g.strokeStyle = cssVar('--muted'); g.lineWidth = 1;
  g.beginPath(); g.arc(cx, cy, R, Math.PI + (Math.PI / 2 - th), -(Math.PI / 2 - th)); g.stroke();
  // polymer chains
  if (strands && a.stringiness > 0.4) {
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.2;
    for (let k = 0; k < 5; k++) { g.beginPath(); const sx = cx - half * 0.6 + k * half * 0.3; for (let t = 0; t <= 26; t++) { const x = sx + Math.sin(t * 0.9 + k) * 5, y = base - 4 - t * Math.min(1.6, (base - cy + R - 8) / 26); t ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  }
  // surface
  g.fillStyle = hex(b.look.color); g.strokeStyle = cssVar('--muted'); g.beginPath(); g.moveTo(x0, h);
  for (let x = 0; x <= w; x += 2) g.lineTo(x0 + x, yB(x)); g.lineTo(x0 + w, h); g.closePath(); g.fill(); g.stroke();
  // contact angle marker
  g.strokeStyle = '#ef4444'; g.lineWidth = 2; g.beginPath(); g.arc(cx + half, base, 13, Math.PI, Math.PI + th); g.stroke();
  return `contact angle ≈ ${Math.round(I.contactAngle)}°`;
}

// Microwave tab: how the oven's output so far was shared between the food, its container, and nothing at all.
function energyPanel(g, w, lanes) {
  const x0 = 30, bw = w - x0 - 12, bh = 24, font = 'Nunito, Helvetica, Arial, sans-serif', grey = '#8b5cf6', pale = 'rgba(148,163,184,0.3)';
  g.textBaseline = 'middle';
  lanes.forEach((l, i) => {
    const y = 14 + i * 44, s = l.result.split, tot = s.food + s.cont + s.lost;
    g.fillStyle = LANE_COLORS[i]; g.font = 'bold 13px ' + font; g.textAlign = 'left'; g.fillText(i ? 'B' : 'A', 10, y + bh / 2);
    if (!tot) { g.strokeStyle = cssVar('--line'); g.strokeRect(x0, y, bw, bh); g.fillStyle = cssVar('--muted'); g.font = '11px ' + font; g.fillText('Press Run to see where the energy goes', x0 + 8, y + bh / 2); return; }
    let x = x0;
    [[s.food, LANE_COLORS[i], '#2c2144'], [s.cont, grey, '#fff'], [s.lost, pale, cssVar('--ink')]].forEach(([v, fill, ink]) => {
      const sw = bw * v / tot; g.fillStyle = fill; g.fillRect(x, y, sw, bh);
      if (sw > 30) { g.fillStyle = ink; g.font = '11px ' + font; g.textAlign = 'center'; g.fillText(Math.round(v / tot * 100) + '%', x + sw / 2, y + bh / 2); }
      x += sw;
    });
  });
  let x = x0; g.font = '11px ' + font; g.textAlign = 'left';
  [['food (lane colour)', LANE_COLORS[0]], ['container', grey], ['not absorbed', pale]].forEach(([label, fill]) => {
    g.fillStyle = fill; g.fillRect(x, 108, 10, 10); g.fillStyle = cssVar('--muted'); g.fillText(label, x + 14, 114); x += g.measureText(label).width + 30;
  });
}

export function drawMicro(canvas, rig, lanes) {
  const { g, w, h } = fitCanvas(canvas);
  if (!w) return;
  if (rig === 'microwave') return energyPanel(g, w, lanes);
  const half = w / 2;
  lanes.forEach((lane, i) => {
    g.save(); g.beginPath(); g.rect(i * half, 0, half, h); g.clip();
    const note = rig === 'drag' ? solidPanel(g, i * half, half, h, lane, 1.7 + i * 3.1) : wetPanel(g, i * half, half, h, lane, 1.7 + i * 3.1, rig === 'pull');
    g.fillStyle = LANE_COLORS[i]; g.font = '800 12px Nunito, Helvetica, Arial, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(i ? 'B' : 'A', i * half + 8, 6);
    g.fillStyle = cssVar('--ink'); g.font = '700 11px Nunito, Helvetica, Arial, sans-serif'; g.fillText(note, i * half + 22, 7);
    g.restore();
  });
  g.strokeStyle = cssVar('--line'); g.lineWidth = 1; g.beginPath(); g.moveTo(half, 0); g.lineTo(half, h); g.stroke();
}
