import * as THREE from 'three';

// Colours and fonts the drawings share with the page. They come from the stylesheet of the look in use
// (css/style.css or css/playful.css); syncLook() re-reads them when the visitor switches look.
export const LANE_COLORS = ['#3b82f6', '#f97316'];
export const LOOK = { onLane: '#ffffff', font: '-apple-system, Helvetica, Arial, sans-serif', display: '-apple-system, Helvetica, Arial, sans-serif', weight: '400' };
export function syncLook() {
  const css = getComputedStyle(document.documentElement), v = (name, or) => css.getPropertyValue(name).trim() || or;
  LANE_COLORS[0] = v('--a', LANE_COLORS[0]); LANE_COLORS[1] = v('--b', LANE_COLORS[1]);
  LOOK.onLane = v('--on-lane', LOOK.onLane); LOOK.font = v('--canvas-font', LOOK.font); LOOK.display = v('--canvas-display', LOOK.display); LOOK.weight = v('--canvas-weight', LOOK.weight);
}
export const LANE_X = [-0.1, 0.1];

export function solidMaterial(s) {
  const l = s.look, op = l.opacity ?? 1;
  return new THREE.MeshStandardMaterial({ color: l.color, roughness: l.roughness, metalness: l.metalness || 0, transparent: op < 1, opacity: op });
}

export function substanceMaterial(s) {
  const l = s.look;
  return new THREE.MeshPhysicalMaterial({
    color: l.color, roughness: l.roughness, metalness: 0, clearcoat: l.roughness < 0.2 ? 1 : 0.25, clearcoatRoughness: 0.1,
    transparent: l.opacity < 1, opacity: l.opacity, side: THREE.DoubleSide,
  });
}

export function swapMaterial(mesh, mat) { if (mesh.material) mesh.material.dispose(); mesh.material = mat; }

export function makeLabel(text, color) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
  g.fillStyle = LOOK.onLane; g.font = 'bold 72px ' + LOOK.display; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.setScalar(0.03); s.renderOrder = 10;
  return s;
}

export const standMaterial = () => new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.6, metalness: 0.4 });

export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
  });
}
