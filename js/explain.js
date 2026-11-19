// Builds the plain-language "Why?" panel from material properties, the pair model and the live result.
const low = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const short = (m) => low(m.name.replace(/ \(.*\)/, ''));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const times = (v) => v >= 1e6 ? (v / 1e6).toFixed(0) + ' million' : v >= 1000 ? Math.round(v / 1000) + ',000' : v >= 10 ? Math.round(v) : v.toFixed(1);
const logN = (v, lo, hi) => Math.min(1, Math.max(0.02, (Math.log10(v) - lo) / (hi - lo)));
const c01 = (v) => Math.min(1, Math.max(0.02, v));

function tiltLane({ a, b, inter: I, result: r }) {
  const A = cap(short(a)), B = short(b), reasons = [];
  let headline;
  if (r.onset !== null) headline = `${A} started to run at about ${Math.round(r.onset)}°. ${Math.round(r.onPlate * 100)}% is still on the ${B}.`;
  else if (r.angle < 3) headline = `${A} is resting on ${B}. Tilt the plate to test it.`;
  else headline = `${A} has not moved at ${Math.round(r.angle)}°.`;

  if (a.yieldStress >= 100) reasons.push(`It acts like a soft solid: it has a high <b>yield stress</b> (about ${a.yieldStress} Pa). Gravity on a spoonful can't push that hard, so it never starts to flow.`);
  else if (a.yieldStress > 0) reasons.push(`At rest it acts like a soft solid. It has a <b>yield stress</b> (about ${a.yieldStress} Pa): gravity must pull harder than that before it flows. Once the layer thins out, the pull drops below the threshold again, so a smear stays behind.`);
  else if (a.viscosity >= 1000) reasons.push(`It is extremely <b>viscous</b>, about ${times(a.viscosity / 0.001)} times thicker than water. It does flow, but far too slowly to see in a few seconds.`);
  else if (a.viscosity >= 1) reasons.push(`It has no yield stress, so it always flows, but it is about ${times(a.viscosity / 0.001)} times more <b>viscous</b> than water. Its molecules drag on each other, so it creeps.`);
  else reasons.push(`It has very low <b>viscosity</b> and no yield stress. Nothing inside it resists flowing, so the slightest slope sets it moving.`);

  if (I.contactAngle < 40) reasons.push(`It <b>wets</b> ${B} (contact angle about ${Math.round(I.contactAngle)}°). The surface attracts it more than it attracts itself, so it spreads thin and leaves a film behind.`);
  else if (I.contactAngle < 75) reasons.push(`It partly wets ${B} (contact angle about ${Math.round(I.contactAngle)}°), so it sits as a low puddle.`);
  else reasons.push(`It <b>beads up</b> on ${B} (contact angle about ${Math.round(I.contactAngle)}°). The surface has low energy and barely attracts it, so it gathers into drops that roll off clean.`);

  if (I.slips) reasons.push(`Its grip on ${B} is weaker than its own internal strength, so it can <b>slip</b> along the surface as a lump before it flows.`);
  else if (b.roughness > 0.4) reasons.push(`The rough texture of ${B} <b>pins</b> the edge of the liquid and gives it more area to cling to.`);
  return { headline, reasons };
}

function pullLane({ a, b, inter: I, result: r }) {
  const A = cap(short(a)), B = short(b), reasons = [];
  let headline;
  if (r.broken) headline = r.mode === 'cohesive'
    ? `${A} tore through the middle after stretching to ${r.breakAt.toFixed(1)} cm. Residue is left on both surfaces. Peak pull: ${r.peak.toFixed(1)} N.`
    : `${A} peeled off the ${B} in one piece at ${r.breakAt.toFixed(1)} cm. The top surface came away clean. Peak pull: ${r.peak.toFixed(1)} N.`;
  else if (r.sep < 0.8) headline = `${A} is sandwiched between two pieces of ${B}. Pull them apart to test it.`;
  else headline = `${A} is stretching: ${r.force.toFixed(1)} N at ${r.sep.toFixed(1)} cm.`;

  if (I.failure === 'cohesive') reasons.push(`It grips ${B} harder than it holds itself together (<b>adhesion beats cohesion</b>). The weak point is inside the material, so it tears there and both sides stay coated.`);
  else reasons.push(`It holds itself together better than it grips ${B} (<b>cohesion beats adhesion</b>). The weak point is the contact, so it lets go of the surface and comes away whole.`);

  if (a.stringiness > 0.5) reasons.push(`It is made of long, tangled molecules. Pulling drags them past each other instead of snapping them, so it draws out into <b>strands</b> and keeps resisting over a long distance.`);
  else if (a.stringiness < 0.15 && a.viscosity < 1) reasons.push(`Its molecules are small and slide freely, so the bridge thins and pinches off almost immediately.`);
  else reasons.push(`It is thick but not stretchy. The bridge necks down and breaks after a short pull.`);

  if (b.surfaceEnergy < 22) reasons.push(`${cap(B)} has very <b>low surface energy</b>: its molecules barely attract anything, so even tacky materials get little hold.`);
  else if (b.roughness > 0.4 || b.porosity > 0.3) reasons.push(`${cap(B)} is rough and porous. The material flows into the pits and has to be pulled back out, which adds grip.`);
  else if (I.wetting > 0.85) reasons.push(`It wets ${B} well, so it makes close contact over the whole area, and close contact is what lets molecular attraction act.`);
  return { headline, reasons };
}

function dragLane({ a, b, inter: I, result: r }) {
  const A = cap(short(a)), B = short(b), reasons = [];
  const word = I.muS > 0.7 ? 'very high' : I.muS > 0.4 ? 'moderate' : I.muS > 0.15 ? 'low' : 'almost none';
  let headline = `${A} on ${I.wet ? 'wet ' : ''}${B}: grip is ${word} (friction coefficient about ${I.muS.toFixed(2)}).`;
  if (r.breakForce !== null) headline += ` It broke loose at ${r.breakForce.toFixed(1)} N` + (r.slideForce ? ` and slides at about ${r.slideForce.toFixed(1)} N.` : '.');
  else headline += ` Pull the handle to test it.`;

  if (I.selfLub) reasons.push(`Ice makes its own lubricant. Pressure and rubbing melt a film of water a few molecules thick, so the block rides on liquid.`);
  if (I.lowEnergy) reasons.push(`Teflon has very <b>low surface energy</b>. Other molecules barely attract to it, so almost no bonds form across the contact.`);
  if (!I.selfLub && !I.lowEnergy) {
    if (I.soft > 0.6) reasons.push(`One side is soft, so it squashes into the tiny hills and valleys of the other. The <b>real contact area</b> becomes large, and friction grows with real contact area.`);
    else if (I.soft < 0.1) reasons.push(`Both are hard, so they only touch at the tips of microscopic bumps, often about 1% of the area you see. Little real contact means less grip.`);
    else reasons.push(`The softer side gives a little and makes fair contact with the other surface, more than two hard materials would.`);
    if (I.interlock > 0.35) reasons.push(`The rough surface gives the soft one something to <b>key into</b>. To slide, it has to deform around every bump, and that costs energy.`);
    else if (I.rough < 0.1) reasons.push(`Both surfaces are smooth, so there is no interlocking. Any grip comes from molecular attraction across the contact.`);
  }
  if (I.wet) reasons.push(I.wetFactor < 0.6
    ? `Water gets trapped between the smooth surfaces and keeps them apart. Grip dropped to ${Math.round(I.wetFactor * 100)}% of dry.`
    : `Water is present, but the rough or porous texture lets it drain away from the contact points, so most of the grip survives (${Math.round(I.wetFactor * 100)}% of dry).`);
  reasons.push(`It grips harder standing still than once moving (${I.muS.toFixed(2)} static vs ${I.muK.toFixed(2)} sliding), which is why it moves in jerks. On a ramp it would start to slide at about ${Math.round(I.slipAngle)}°.`);
  return { headline, reasons: reasons.slice(0, 4) };
}

function compare(rig, [L0, L1]) {
  const n = [cap(short(L0.a)) + ' on ' + short(L0.b), short(L1.a) + ' on ' + short(L1.b)];
  if (rig === 'drag') {
    const [hi, lo, k] = L0.inter.muS >= L1.inter.muS ? [0, 1, L0.inter.muS / L1.inter.muS] : [1, 0, L1.inter.muS / L0.inter.muS];
    return k < 1.1 ? `Both pairs grip about equally.` : `${cap(n[hi])} needs about ${k.toFixed(1)}× more force to slide than ${low(n[lo])}.`;
  }
  if (rig === 'pull') {
    if (L0.inter.failure !== L1.inter.failure) {
      const t = L0.inter.failure === 'cohesive' ? 0 : 1;
      return `${cap(n[t])} tears and leaves residue behind, while ${low(n[1 - t])} peels off clean.`;
    }
    const [hi, lo] = L0.inter.peakForce >= L1.inter.peakForce ? [0, 1] : [1, 0];
    const k = L0.inter.peakForce / L1.inter.peakForce;
    return (k > 0.9 && k < 1.1) ? `Both take about the same force to pull apart.` : `${cap(n[hi])} sticks about ${(hi === 0 ? k : 1 / k).toFixed(1)}× harder than ${low(n[lo])}.`;
  }
  const d = L0.result.onPlate - L1.result.onPlate;
  if (Math.abs(d) < 0.08) return L0.result.angle < 3 ? `Tilt the plate and watch which one lets go first.` : `Both are holding on about equally so far.`;
  const [hi, lo] = d > 0 ? [0, 1] : [1, 0];
  return `${cap(n[hi])} is clinging on while ${low(n[lo])} runs off.`;
}

function bars(rig, [L0, L1]) {
  const pair = (label, f, t) => ({ label, a: f(L0), b: f(L1), aText: t(L0), bText: t(L1) });
  if (rig === 'drag') return [
    pair('Friction (static)', (l) => c01(l.inter.muS / 1.1), (l) => l.inter.muS.toFixed(2)),
    pair('Softness of the softer side', (l) => c01(l.inter.soft), (l) => l.inter.soft > 0.6 ? 'soft' : l.inter.soft > 0.15 ? 'medium' : 'hard'),
    pair('Roughness', (l) => c01(l.inter.rough), (l) => l.inter.rough > 0.4 ? 'rough' : l.inter.rough > 0.12 ? 'textured' : 'smooth'),
    pair('Molecular attraction', (l) => c01(l.inter.energy), (l) => l.inter.lowEnergy ? 'very low' : l.inter.energy > 0.7 ? 'high' : 'medium'),
  ];
  const common = [
    pair('Wetting of the surface', (l) => c01(l.inter.wetting), (l) => Math.round(l.inter.contactAngle) + '° angle'),
    pair('Adhesion (grip on surface)', (l) => c01(l.inter.adhesion / 1.2), (l) => l.inter.adhesion.toFixed(2)),
  ];
  if (rig === 'pull') return [
    ...common,
    pair('Cohesion (grip on itself)', (l) => c01(l.a.cohesion), (l) => l.a.cohesion.toFixed(2)),
    pair('Stretchiness', (l) => c01(l.a.stringiness), (l) => l.a.stringiness > 0.5 ? 'stringy' : l.a.stringiness > 0.12 ? 'some' : 'none'),
  ];
  return [
    pair('Viscosity (thickness)', (l) => logN(l.a.viscosity, -3.3, 4.5), (l) => '×' + times(l.a.viscosity / 0.001)),
    pair('Yield stress', (l) => c01(l.a.yieldStress / 300), (l) => l.a.yieldStress ? l.a.yieldStress + ' Pa' : 'none'),
    ...common,
  ];
}

export function explainHTML(rig, lanes) {
  const fn = rig === 'drag' ? dragLane : rig === 'pull' ? pullLane : tiltLane;
  let html = `<div class="compare">${compare(rig, lanes)}</div>`;
  lanes.forEach((l, i) => {
    const e = fn(l);
    html += `<div class="card ${i ? 'b' : ''}"><h4>${i ? 'B' : 'A'} · ${l.a.name} on ${l.b.name}</h4><p>${e.headline}</p><ul>${e.reasons.map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
  });
  html += `<h3>What drives it</h3><div class="bars">` + bars(rig, lanes).map((b) =>
    `<div class="bar"><div class="lbl"><span>${b.label}</span></div>
      <div class="row"><div class="track"><div class="fill" style="width:${(b.a * 100).toFixed(0)}%"></div></div><span>${b.aText}</span></div>
      <div class="row"><div class="track"><div class="fill b" style="width:${(b.b * 100).toFixed(0)}%"></div></div><span>${b.bText}</span></div></div>`).join('') + `</div>`;
  return html;
}
