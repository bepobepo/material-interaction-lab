// Plain-language text for the molecular view: what each lane is made of and what is happening now.
import { SUB_RECIPES, SOLID_RECIPES, siteFraction } from './species.js';

const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);

export function stateLine(rigId, lane) {
  const { a, b, inter: I, result: r } = lane;
  if (rigId === 'tilt') {
    if (r.angle < 1) return 'At rest: the molecules jostle but stay where they are.';
    if (r.onset === null) return 'Bonds are holding against the pull of gravity.';
    if (I.beads || I.slips || siteFraction(b) < 0.1) return 'Too few anchor points: the whole blob slides over the surface.';
    return 'The bottom layer stays bonded to the surface while the layers above slide over it.';
  }
  if (rigId === 'pull') {
    if (r.broken) return r.mode === 'cohesive'
      ? 'The surfaces held on harder than the molecules hold each other, so it tore and left some on both.'
      : 'The molecules held each other harder than the surface held them, so it let go cleanly.';
    if (r.sep < 0.75) return 'Squashed together: the molecules settle onto both surfaces.';
    return a.stringiness > 0.4 ? 'Long chains uncoil and line up, bridging the gap.' : 'Small molecules cannot bridge far, so the bridge thins quickly.';
  }
  const water = I.wet && I.wetFactor < 0.8 ? ' Water molecules wedged in between keep the surfaces apart.' : '';
  if (r.force < 0.05) return (I.soft > 0.6 ? 'Resting: the soft block has moulded itself into the bumps.' : 'Resting: only the high points of the two surfaces touch.') + water;
  if (r.stuck) return 'Contact points are locked together and stretching as the pull builds.' + water;
  return 'Contacts snap and re-form as the block slides.' + water;
}

export function countsLine(rigId, sim) {
  const adh = sim.adh.length / 2, coh = sim.coh.length / 2;
  return rigId === 'drag' ? `${adh} contact points gripping` : `${adh} bonds to the surface · ${coh} between molecules`;
}

// Right-hand panel: what each material looks like close up.
export function molecularHTML(rigId, lanes) {
  const item = (m, text) => `<li><b>${m.name}.</b> ${text}</li>`;
  return '<h3>At the molecular scale</h3>' + lanes.map((l, i) => {
    const top = rigId === 'drag' ? SOLID_RECIPES[l.a.id].blurb : SUB_RECIPES[l.a.id].blurb;
    const same = rigId === 'drag' && l.a.id === l.b.id;
    return `<div class="card ${i ? 'b' : ''}"><h4>${i ? 'B' : 'A'} · ${l.a.name} on ${lc(l.b.name)}</h4><ul>${item(l.a, top)}${same ? '' : item(l.b, SOLID_RECIPES[l.b.id].blurb)}</ul></div>`;
  }).join('') + '<p class="note">A stylised slice a few nanometres wide. Shapes are simplified, motion is slowed enormously and forces are exaggerated so you can see them.</p>';
}
