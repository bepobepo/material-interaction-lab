// Pair model: turns two materials into the handful of numbers the rigs and the explainer share.
const G = 9.81;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// --- substance on a solid surface (tilt + pull rigs) -------------------------------------------
export function wetInteract(sub, solid) {
  // Contact angle: how strongly the surface attracts the liquid vs the liquid attracting itself (Owens–Wendt).
  // Polar attraction only works polar-to-polar, which is why water (mostly polar) beads on Teflon while oil does not.
  const gl = sub.surfaceTension, gs = solid.surfaceEnergy, lp = sub.polar * gl, sp = solid.polar * gs;
  const cos0 = clamp(2 * (Math.sqrt((gs - sp) * (gl - lp)) + Math.sqrt(sp * lp)) / gl - 1, -1, 1);
  const cos = clamp(cos0 * (1 + 0.4 * solid.roughness), -1, 1);   // roughness amplifies wetting
  const contactAngle = Math.acos(cos) * 180 / Math.PI;
  const wetting = (1 + cos) / 2;                                   // 0 beads up … 1 spreads flat

  const grip = 1 + 0.6 * solid.roughness + 0.4 * solid.porosity;   // texture to key into
  const adhesion = wetting * wetting * (0.15 + sub.tack) * grip;   // hold on the surface
  const cohesion = sub.cohesion;                                   // hold on itself
  const failure = adhesion > cohesion ? 'cohesive' : 'adhesive';

  // Tilt rig parameters
  const gamma = sub.surfaceTension * 1e-3;
  const capLen = Math.sqrt(gamma / (sub.density * G));
  const hEq = clamp(2 * capLen * Math.sin(contactAngle * Math.PI / 360), 0.0008, 0.006); // puddle thickness
  const pinStress = 60 * gamma * (0.15 + 1.5 * solid.roughness) * wetting;               // edge pinning, Pa
  const slipYield = failure === 'adhesive' ? sub.yieldStress * Math.pow(adhesion / cohesion, 2) : sub.yieldStress;

  // Pull rig parameters
  const ratio = clamp(adhesion / cohesion, 0.2, 1);
  const breakStretch = failure === 'cohesive'
    ? 1.8 + 38 * sub.stringiness
    : 1.8 + 19 * sub.stringiness * ratio * ratio;
  const peakForce = 12 * Math.min(adhesion, cohesion);             // N, for a 6 cm contact patch

  return {
    kind: 'wet', contactAngle, wetting, grip, adhesion, cohesion, failure,
    hEq, hFront: 0.6 * hEq, hRes: wetting > 0.75 ? 0.00005 : 0, beads: contactAngle > 75,
    pinStress, tauEff: slipYield + pinStress, slips: failure === 'adhesive' && sub.yieldStress > 0,
    breakStretch, peakForce,
  };
}

// --- solid on solid (drag rig) ----------------------------------------------------------------
const T = {};
const add = (a, b, s, k) => { T[[a, b].sort().join('|')] = [s, k]; };
add('rubber', 'stone', 0.9, 0.75);   add('rubber', 'ice', 0.15, 0.1);     add('rubber', 'wood', 0.8, 0.65);
add('rubber', 'steel', 0.8, 0.65);   add('rubber', 'glass', 0.95, 0.8);   add('rubber', 'ceramic', 0.85, 0.7);
add('rubber', 'teflon', 0.25, 0.2);  add('rubber', 'rubber', 1.1, 0.95);  add('leather', 'stone', 0.55, 0.45);
add('leather', 'wood', 0.5, 0.4);    add('leather', 'ice', 0.1, 0.06);    add('leather', 'steel', 0.5, 0.4);
add('wood', 'wood', 0.45, 0.3);      add('wood', 'stone', 0.55, 0.4);     add('steel', 'steel', 0.6, 0.45);
add('steel', 'ice', 0.03, 0.02);     add('steel', 'teflon', 0.05, 0.04);  add('teflon', 'teflon', 0.04, 0.04);
add('wood', 'ice', 0.05, 0.03);      add('steel', 'stone', 0.5, 0.4);     add('plastic', 'steel', 0.3, 0.25);
add('glass', 'glass', 0.9, 0.4);     add('ice', 'ice', 0.1, 0.03);        add('stone', 'stone', 0.7, 0.55);
add('wood', 'steel', 0.4, 0.3);      add('stone', 'ice', 0.05, 0.03);

export function solidInteract(a, b, { wet = false } = {}) {
  const soft = Math.max(a.softness, b.softness);
  const rough = Math.max(a.roughness, b.roughness);
  const interlock = rough * (0.3 + 0.7 * soft);                    // soft body keys into rough one
  const energy = clamp(Math.sqrt(a.surfaceEnergy * b.surfaceEnergy) / 70, 0, 1.2);
  const lowEnergy = Math.min(a.surfaceEnergy, b.surfaceEnergy) < 22;
  const selfLub = !!(a.selfLubricating || b.selfLubricating);

  let muS, muK;
  const t = T[[a.id, b.id].sort().join('|')];
  if (t) { [muS, muK] = t; }
  else {
    muS = 0.12 + 0.45 * soft * (0.4 + 0.6 * energy) + 0.35 * interlock + 0.2 * energy;
    if (lowEnergy) muS *= 0.3;
    if (selfLub) muS *= 0.15;
    muK = muS * (0.72 + 0.12 * (1 - soft));
  }

  // Water film: rough or porous surfaces let it drain away, smooth ones trap it.
  const drain = Math.max(a.roughness * 0.8 + a.porosity * 0.5, b.roughness * 0.8 + b.porosity * 0.5);
  let wetFactor = 1;
  if (wet) {
    wetFactor = clamp(0.35 + 0.5 * drain, 0.3, 0.95);
    if (selfLub || lowEnergy || muS < 0.15) wetFactor = Math.max(wetFactor, 0.85);
    muS *= wetFactor; muK *= wetFactor;
  }
  return {
    kind: 'solid', muS, muK, soft, rough, interlock, energy, lowEnergy, selfLub, wet, wetFactor, drain,
    slipAngle: Math.atan(muS) * 180 / Math.PI,
  };
}
