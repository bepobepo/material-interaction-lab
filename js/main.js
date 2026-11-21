import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SUBSTANCES, SOLIDS } from './materials.js';
import { wetInteract, solidInteract } from './pairing.js';
import { explainHTML } from './explain.js';
import { TiltRig } from './rigs/tilt.js';
import { PullRig } from './rigs/pull.js';
import { DragRig } from './rigs/drag.js';
import { drawChart, cssVar } from './ui/chart.js';
import { syncLook, LOOK } from './rigs/common.js';
import { drawMicro } from './ui/microview.js';
import { MicrowaveRig } from './rigs/microwave.js';
import { FOODS, CONTAINERS, STARTS, amountSet } from './microwave/data.js';
import { heatInteract, thermalCSS } from './microwave/model.js';
import { MolecularView } from './molecular/view.js';
import { molecularHTML } from './molecular/captions.js';

const RIGS = {
  tilt: {
    tab: 'Tilt a plate', Rig: TiltRig, aSet: SUBSTANCES, aLabel: 'Substance', bLabel: 'Plate surface', control: 'Tilt', auto: 'Auto-tilt', sweep: 14,
    blurb: 'Put a spoonful on a plate, tilt it, and see what runs and what clings.',
    camera: [5.4, 5.2, 6.6], target: [0, 1.6, 0],
    presets: [
      { name: 'Yogurt vs water on a plate', lanes: [['yogurt', 'ceramic'], ['water', 'ceramic']] },
      { name: 'Honey: ceramic vs non-stick', lanes: [['honey', 'ceramic'], ['honey', 'teflon']] },
      { name: 'Water: glass vs non-stick', lanes: [['water', 'glass'], ['water', 'teflon']] },
      { name: 'Ketchup vs cooking oil', lanes: [['ketchup', 'ceramic'], ['oil', 'ceramic']] },
    ],
  },
  pull: {
    tab: 'Pull apart', Rig: PullRig, aSet: SUBSTANCES, aLabel: 'Substance between', bLabel: 'Surfaces', control: 'Separation', auto: 'Auto-pull', sweep: 7,
    blurb: 'Squash something between two surfaces, pull them apart, and see what stretches, tears or peels.',
    camera: [1.0, 3.2, 8.6], target: [0, 1.55, 0],
    presets: [
      { name: 'Taffy vs gum on teeth', lanes: [['taffy', 'enamel'], ['gum', 'enamel']] },
      { name: 'Taffy: teeth vs non-stick', lanes: [['taffy', 'enamel'], ['taffy', 'teflon']] },
      { name: 'Honey vs water on glass', lanes: [['honey', 'glass'], ['water', 'glass']] },
      { name: 'Gum: pavement vs steel', lanes: [['gum', 'stone'], ['gum', 'steel']] },
    ],
  },
  drag: {
    tab: 'Drag a block', Rig: DragRig, aSet: SOLIDS, aLabel: 'Block', bLabel: 'Surface', control: 'Pull handle', auto: 'Auto-pull', sweep: 6, wet: true,
    blurb: 'Pull a block across a surface with a spring and feel how much it grips.',
    camera: [5.6, 4.4, 7.4], target: [0.2, 0.2, 0.2],
    presets: [
      { name: 'Rubber vs leather on stone', lanes: [['rubber', 'stone'], ['leather', 'stone']] },
      { name: 'Rubber: stone vs ice', lanes: [['rubber', 'stone'], ['rubber', 'ice']] },
      { name: 'Steel on steel vs on non-stick', lanes: [['steel', 'steel'], ['steel', 'teflon']] },
      { name: 'Rubber: glass vs stone (try wet)', lanes: [['rubber', 'glass'], ['rubber', 'stone']] },
    ],
  },
  microwave: {
    tab: 'Microwave', Rig: MicrowaveRig, control: 'Cook time', control0: 110 / 290, noSweep: true, noZoom: true, thermal: true,
    slots: [['Food', FOODS], ['Amount', (lane) => amountSet(FOODS[lane[0]])], ['Container', CONTAINERS], ['Starts', STARTS]], inter: heatInteract,
    speeds: [1, 2, 4, 8, 16, 32], speed: 8, maxStep: 0.25, microTitle: 'Where the microwave energy went', liveMicro: true,
    blurb: 'Heat food in a microwave and see where the heat goes: into the food, the bowl, or nowhere.',
    note: 'A simplified model. The pattern of hot and cold spots is illustrative (every real oven has its own), shapes are simplified, and food values are typical figures. It shows why food heats unevenly, not exact cooking times.',
    camera: [0, 2.9, 6.7], target: [0, 0.5, 0], fitWidth: 6.3,
    presets: [
      { name: 'Frozen soup: stoneware vs glass bowl', lanes: [['soup', 300, 'stoneware', 'frozen'], ['soup', 300, 'glass', 'frozen']] },
      { name: 'Soup vs lasagne from the fridge', lanes: [['soup', 300, 'glass', 'fridge'], ['lasagne', 400, 'paper', 'fridge']] },
      { name: 'Lasagne: frozen vs fridge-cold', lanes: [['lasagne', 400, 'paper', 'frozen'], ['lasagne', 400, 'paper', 'fridge']] },
      { name: 'Soup: a little vs a lot', lanes: [['soup', 150, 'glass', 'fridge'], ['soup', 450, 'glass', 'fridge']] },
      { name: 'Bread rolls: one vs four', lanes: [['bread', 1, 'paper', 'room'], ['bread', 4, 'paper', 'room']] },
      { name: 'Half a chicken vs a pizza slice', lanes: [['chicken', 0.5, 'porcelain', 'fridge'], ['pizza', 1, 'paper', 'fridge']] },
      { name: 'Tomato vs potato', lanes: [['tomato', 1, 'paper', 'fridge'], ['potato', 1, 'paper', 'fridge']] },
      { name: 'Water vs cooking oil', lanes: [['water', 300, 'glass', 'room'], ['oil', 300, 'glass', 'room']] },
    ],
  },
};
const NOTE = 'Values are realistic orders of magnitude tuned for a clear picture, not lab measurements.';
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8], speedName = (v) => (v === 0.25 ? '¼' : v === 0.5 ? '½' : v) + '×';

const $ = (id) => document.getElementById(id);
const el = { view: $('view'), tabs: $('tabs'), blurb: $('blurb'), presets: $('presets'), lanes: $('lanes'), readouts: $('readouts'), play: $('play'),
  slider: $('slider'), controlName: $('controlName'), controlValue: $('controlValue'), wetWrap: $('wetWrap'), wet: $('wet'), reset: $('reset'),
  explain: $('explain'), chart: $('chart'), chartTitle: $('chartTitle'), micro: $('micro'), zoom: $('zoom'), autoWrap: $('autoWrap'), look: $('look'), lookSheet: $('lookSheet'), turn: $('turn'), tomato: $('tomato'), tomatoWrap: $('tomatoWrap'), power: $('power'), cut: $('cut'), heat: $('heat'), guide: $('viewGuide'), guideOpen: $('guideOpen'), guideClose: $('guideClose'), stir: $('stir'), heatScale: $('heatScale'), microTitle: $('microTitle'), note: $('note'), auto: $('auto'), autoName: $('autoName'), speed: $('speed'), clock: $('clock'), fade: $('fade'), molOverlay: $('molOverlay'), molExplain: $('molExplain') };

// ---- scene -----------------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.localClippingEnabled = true;   // the microwave tab cuts its food open
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
el.view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI * 0.49; orbit.minDistance = 2.5; orbit.maxDistance = 16;

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3.5, 8, 4.5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: 1, far: 20 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.01;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xbcd4ff, 0.6); fill.position.set(-4, 3, -3); scene.add(fill);

const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const world = new THREE.Group(); world.scale.setScalar(10); scene.add(world);   // rigs are built in metres

function applyTheme() {
  scene.background = new THREE.Color(cssVar('--scene-bg') || '#e9edf3');
  floor.material.color.set(cssVar('--scene-floor') || '#d5dae3');
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); refreshStatic(); });

function resize() {
  const w = el.view.clientWidth, h = el.view.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (!state.zoomed) renderer.render(scene, camera);
}
new ResizeObserver(resize).observe(el.view);

// ---- state -----------------------------------------------------------------------------------
// playing: time is running · sweep: the control is being moved for us · auto: Run test sweeps the control · fresh: nothing has run since the last reset
const state = { rigId: null, rig: null, lanes: [], inter: [], control: 0, playing: false, sweep: false, auto: true, fresh: true, speed: 1, clock: 0, wet: false, zoomed: false, opts: { turntable: true, power: 1, cut: false, heat: false, perceived: false } };
const cfg = () => RIGS[state.rigId];
const autoOn = () => state.auto && !cfg().noSweep;                                          // some rigs have nothing to sweep
const slots = () => cfg().slots || [[cfg().aLabel, cfg().aSet], [cfg().bLabel, SOLIDS]];    // the pickers each lane has
const setOf = (set, i) => (typeof set === 'function' ? set(state.lanes[i]) : set);                // some pickers depend on the lane's other choices
const pick = (i) => slots().map(([, set], k) => setOf(set, i)[state.lanes[i][k]]);

function computeInter(i) {
  const [a, b] = pick(i);
  state.inter[i] = cfg().inter ? cfg().inter(...pick(i)) : state.rigId === 'drag' ? solidInteract(a, b, { wet: state.wet }) : wetInteract(a, b);
  state.rig.setPair(i, a, b, state.inter[i]);
}
function setControl(v) {
  state.control = v; el.slider.value = Math.round(v * 1000);
  state.rig.setControl(v); el.controlValue.textContent = state.rig.controlLabel(v);
}
function setPlaying(p) {
  state.playing = p; if (p) state.fresh = false; else state.sweep = false;
  el.play.textContent = p ? '❚❚ Pause' : state.fresh ? '▶ Run test' : '▶ Resume';
}
function restart() {   // fresh sample; with auto off the control keeps the value the user chose
  const keep = autoOn() ? 0 : state.control;
  state.fresh = true; state.clock = 0; setPlaying(false); state.rig.reset(); setControl(keep); lastHTML = ''; if (state.zoomed) buildMol();
}
function applyPairs() {
  el.tomatoWrap.hidden = !(state.rigId === 'microwave' && state.lanes.some((l) => l[0] === 'tomato'));   // the Real / Perceived choice is only for tomatoes
  computeInter(0); computeInter(1); restart(); refreshStatic(); }

function buildLanes() {
  el.lanes.innerHTML = '';
  [0, 1].forEach((i) => {
    const box = document.createElement('div'); box.className = 'lane' + (i ? ' b' : '');
    box.innerHTML = `<h2>${i ? 'B' : 'A'}</h2>`;
    const linked = slots().some(([, set]) => typeof set === 'function');
    slots().forEach(([label, set0], slot) => {
      const lab = document.createElement('label'); lab.textContent = label;
      const sel = document.createElement('select'), set = setOf(set0, i);
      for (const [id, m] of Object.entries(set)) sel.add(new Option(m.name, id));
      if (!(state.lanes[i][slot] in set)) state.lanes[i][slot] = (Object.values(set).find((m) => m.preferred) || Object.values(set)[0]).id;   // e.g. a new food: its usual amount
      sel.value = state.lanes[i][slot];
      sel.addEventListener('change', () => { state.lanes[i][slot] = sel.value; if (linked) buildLanes(); applyPairs(); });
      lab.appendChild(sel); box.appendChild(lab);
    });
    el.lanes.appendChild(box);
  });
}

function switchRig(id, keep) {   // keep: rebuild the same experiment with the visitor's choices left as they are
  if (state.rig) { world.remove(state.rig.group); state.rig.dispose(); }
  state.rigId = id; const c = cfg();
  if (c.noZoom && (state.zoomed || zoom.phase)) { showMol(false); zoom.phase = null; el.fade.style.opacity = 0; orbit.enabled = true; el.zoom.textContent = '🔬 Zoom to molecules'; }
  state.rig = new c.Rig(); world.add(state.rig.group);
  if (state.rig.setOptions) state.rig.setOptions(state.opts);
  el.speed.innerHTML = ''; (c.speeds || SPEEDS).forEach((v) => el.speed.add(new Option(speedName(v), v)));
  if (!keep) state.speed = c.speed || 1;
  el.speed.value = state.speed;
  el.autoWrap.hidden = !!c.noSweep; el.zoom.hidden = !!c.noZoom; el.heatScale.hidden = !c.thermal || !state.opts.heat;
  el.microTitle.textContent = c.microTitle || 'Zoomed in on the contact';
  el.note.textContent = c.note || NOTE;
  document.querySelectorAll('[data-rig]').forEach((e) => { e.hidden = e.dataset.rig !== id; });
  showGuide(id === 'microwave' && !guideSeen());
  if (!keep) { state.lanes = c.presets[0].lanes.map((l) => [...l]); state.wet = false; el.wet.checked = false; state.control = c.control0 || 0; }
  [...el.tabs.children].forEach((b) => b.setAttribute('aria-selected', b.dataset.id === id));
  el.blurb.textContent = c.blurb; el.controlName.textContent = c.control; el.autoName.textContent = c.auto; el.wetWrap.hidden = !c.wet;
  el.presets.innerHTML = '';
  c.presets.forEach((p) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = p.name;
    b.addEventListener('click', () => { state.lanes = p.lanes.map((l) => [...l]); buildLanes(); applyPairs(); });
    el.presets.appendChild(b);
  });
  buildLanes(); applyPairs();
  if (!keep) {
    camera.position.set(...c.camera); orbit.target.set(...c.target);
    if (c.fitWidth) {   // on a narrow screen, step back far enough to keep both lanes in view
      const need = c.fitWidth / (2 * Math.tan(camera.fov * Math.PI / 360) * camera.aspect), off = camera.position.clone().sub(orbit.target);
      if (off.length() < need) camera.position.copy(orbit.target).add(off.setLength(Math.min(15.5, need)));
    }
  }
  orbit.update();
  if (state.zoomed) markHome();
}

for (const [id, c] of Object.entries(RIGS)) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = c.tab; b.dataset.id = id; b.setAttribute('role', 'tab');
  b.addEventListener('click', () => switchRig(id)); el.tabs.appendChild(b);
}
el.slider.addEventListener('input', () => {   // by hand: live in auto mode; with auto off and time stopped it only picks the value to hold
  state.sweep = false; setControl(el.slider.value / 1000);
  if (autoOn() && !state.playing) setPlaying(true);
});
el.play.addEventListener('click', () => {
  if (state.playing) return setPlaying(false);
  setPlaying(true); state.sweep = autoOn() && state.control < 0.999;
});
el.auto.addEventListener('change', () => {
  state.auto = el.auto.checked;
  if (!state.auto) state.sweep = false;
  else if (state.fresh) setControl(0);
  else if (state.playing) state.sweep = state.control < 0.999;
  refreshLive();
});
el.speed.addEventListener('change', () => { state.speed = +el.speed.value; });
// The Microwave tab opens showing the food as it really looks; this card explains the two view switches until the visitor closes it
const guideSeen = () => { try { return localStorage.getItem('mwGuide') === 'seen'; } catch (e) { return false; } };
const syncGuide = () => el.guide.querySelectorAll('[data-for]').forEach((b) => { const on = el[b.dataset.for].checked; b.textContent = on ? 'Turn off' : 'Turn on'; b.setAttribute('aria-pressed', on); });
function showGuide(show) { el.guide.hidden = !show; el.guideOpen.setAttribute('aria-expanded', show); if (show) syncGuide(); }
el.guide.querySelectorAll('[data-for]').forEach((b) => b.addEventListener('click', () => { const box = el[b.dataset.for]; box.checked = !box.checked; box.dispatchEvent(new Event('change')); }));
el.guideClose.addEventListener('click', () => { try { localStorage.setItem('mwGuide', 'seen'); } catch (e) { } showGuide(false); });
el.guideOpen.addEventListener('click', () => showGuide(el.guide.hidden));
const setOpts = () => { Object.assign(state.opts, { turntable: el.turn.checked, power: +el.power.value, cut: el.cut.checked, heat: el.heat.checked, perceived: el.tomato.value === 'perceived' }); el.heatScale.hidden = !cfg().thermal || !state.opts.heat; if (state.rig.setOptions) state.rig.setOptions(state.opts); syncGuide(); lastHTML = ''; refreshLive(); };
[el.turn, el.power, el.cut, el.heat, el.tomato].forEach((e) => e.addEventListener('change', setOpts));
el.stir.addEventListener('click', () => { if (state.rig.stir) { state.rig.stir(); refreshLive(); } });
el.heatScale.innerHTML = `<div class="bar" style="background:${thermalCSS()}"></div><div class="ticks">` + [-18, 0, 20, 60, 100].map((t) => `<span style="left:${((t + 18) / 148 * 100).toFixed(1)}%">${t}${t === 100 ? ' °C' : ''}</span>`).join('') + '</div><div class="key">Food: full colour · Container: its own colour, tinted by its heat</div>';
el.reset.addEventListener('click', restart);
el.wet.addEventListener('change', () => { state.wet = el.wet.checked; applyPairs(); });

// ---- panels ----------------------------------------------------------------------------------
let lastHTML = '';
const laneData = () => [0, 1].map((i) => {
  const [a, b] = pick(i), inter = state.inter[i];
  return { a, b: inter.container || b, inter, result: state.rig.result(i), title: inter.title || `${a.name} on ${b.name}` };
});
function refreshStatic() { drawMicro(el.micro, state.rigId, laneData()); refreshLive(); }
function refreshLive() {
  const data = laneData();
  el.readouts.innerHTML = data.map((l, i) => `<div class="chip ${i ? 'b' : ''}"><b>${i ? 'B' : 'A'} · ${l.title}</b><span>${state.rig.live(i)}</span></div>`).join('');
  const html = explainHTML(state.rigId, data);
  if (html !== lastHTML) { el.explain.innerHTML = html; lastHTML = html; }
  const tr = state.rig.trace(!autoOn()); el.chartTitle.textContent = tr.title; drawChart(el.chart, tr);
  if (cfg().liveMicro) drawMicro(el.micro, state.rigId, data);
  el.clock.textContent = state.clock < 60 ? state.clock.toFixed(1) + ' s' : Math.floor(state.clock / 60) + ':' + String(Math.floor(state.clock % 60)).padStart(2, '0');
  el.stir.disabled = !data.some((l) => l.result.canStir);
}
window.addEventListener('resize', refreshStatic);

// ---- molecular zoom --------------------------------------------------------------------------
const mol = new MolecularView(renderer, el.molOverlay);
const zoom = { phase: null, t: 0, pos: new THREE.Vector3(), target: new THREE.Vector3(), near: new THREE.Vector3(), focus: new THREE.Vector3() };
const ease = (t) => t * t * (3 - 2 * t);
function buildMol() { const d = laneData(); mol.build(state.rigId, d); el.molExplain.innerHTML = molecularHTML(state.rigId, d); }
function markHome() {   // where the camera returns to on zoom out, and the contact point it dives into
  zoom.pos.copy(camera.position); zoom.target.copy(orbit.target);
  zoom.focus.copy(state.rig.focus()).multiplyScalar(10);
  zoom.near.copy(zoom.pos).sub(zoom.focus).setLength(1.1).add(zoom.focus);
}
function showMol(on) {
  state.zoomed = on; el.molOverlay.hidden = !on; el.molExplain.hidden = !on;
  if (on) buildMol(); else renderer.setViewport(0, 0, el.view.clientWidth, el.view.clientHeight);
}
function toggleZoom() {
  if (zoom.phase) return;
  if (!state.zoomed) { markHome(); orbit.enabled = false; zoom.phase = 'in'; } else zoom.phase = 'out';
  zoom.t = 0; el.zoom.textContent = state.zoomed ? '🔬 Zoom to molecules' : '↩ Zoom back out';
}
function flyCamera(from, to, tFrom, tTo, e) { camera.position.lerpVectors(from, to, e); orbit.target.lerpVectors(tFrom, tTo, e); camera.lookAt(orbit.target); }
function stepZoom(dt) {
  const z = zoom; if (!z.phase) return;
  if (z.phase === 'in') {              // dive towards the contact, fading out at the end
    z.t = Math.min(1, z.t + dt / 0.8); flyCamera(z.pos, z.near, z.target, z.focus, ease(z.t));
    el.fade.style.opacity = Math.max(0, (z.t - 0.5) / 0.5);
    if (z.t >= 1) { showMol(true); z.phase = 'reveal'; z.t = 0; }
  } else if (z.phase === 'reveal') {
    z.t = Math.min(1, z.t + dt / 0.35); el.fade.style.opacity = 1 - z.t; if (z.t >= 1) z.phase = null;
  } else if (z.phase === 'out') {
    z.t = Math.min(1, z.t + dt / 0.25); el.fade.style.opacity = z.t;
    if (z.t >= 1) { showMol(false); z.phase = 'back'; z.t = 0; }
  } else {                             // fly back to where the camera was
    z.t = Math.min(1, z.t + dt / 0.8); flyCamera(z.near, z.pos, z.focus, z.target, ease(z.t));
    el.fade.style.opacity = Math.max(0, 1 - z.t / 0.5);
    if (z.t >= 1) { orbit.enabled = true; z.phase = null; }
  }
}
el.zoom.addEventListener('click', toggleZoom);

// ---- loop ------------------------------------------------------------------------------------
let last = performance.now(), acc = 0;
function advance(dt) {
  if (state.playing) {                 // simulated time = real time x speed, in steps no longer than one frame
    const n = cfg().maxStep ? Math.ceil(dt * state.speed / cfg().maxStep) : Math.ceil(state.speed), h = dt * state.speed / n;
    for (let k = 0; k < n; k++) {
      if (state.sweep) { const v = Math.min(1, state.control + h / cfg().sweep); setControl(v); if (v >= 1) state.sweep = false; }
      state.rig.step(h);
    }
    state.clock += dt * state.speed;
  }
  stepZoom(dt);
  if (state.zoomed) { mol.step(state.playing ? Math.min(0.05, dt * state.speed) : dt, laneData(), !state.playing); mol.render(); }
  else { if (!zoom.phase) orbit.update(); renderer.render(scene, camera); }
  acc += dt; if (acc > 0.15) { acc = 0; refreshLive(); }
}
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  advance(dt);
  requestAnimationFrame(frame);
}
// ---- look (Professional / Playful) -----------------------------------------------------------
// Each look is one stylesheet. The drawings (3D labels, chart, small panels) take their colours and fonts from it too,
// so after a switch they are rebuilt once the stylesheet and its fonts have arrived.
const LOOKS = { professional: 'css/style.css', playful: 'css/playful.css' };
const within = (promise, ms) => Promise.race([promise, new Promise((r) => setTimeout(r, ms))]);
const sheetLoaded = () => new Promise((r) => el.lookSheet.addEventListener('load', r, { once: true }));
async function lookReady() {
  if (!el.lookSheet.sheet) await within(sheetLoaded(), 3000);
  syncLook();
  await within(Promise.all([document.fonts.load('bold 72px ' + LOOK.display), document.fonts.load(LOOK.weight + ' 11px ' + LOOK.font)]).catch(() => {}), 2000);
  applyTheme();
}
async function setLook(look) {
  if (!LOOKS[look] || document.documentElement.dataset.look === look) return;
  document.documentElement.dataset.look = look; el.look.value = look;
  try { localStorage.setItem('look', look); } catch (e) { /* storage blocked: the choice lasts until the page is closed */ }
  const loaded = sheetLoaded(); el.lookSheet.href = LOOKS[look]; await within(loaded, 3000);
  await lookReady(); switchRig(state.rigId, true); resize();
}
el.look.value = document.documentElement.dataset.look || 'professional';
el.look.addEventListener('change', () => setLook(el.look.value));

await lookReady();
switchRig('tilt'); resize();
requestAnimationFrame(frame);
window.lab = { state, RIGS, mol, zoom, toggleZoom, advance, setLook };   // handy for debugging in the console
