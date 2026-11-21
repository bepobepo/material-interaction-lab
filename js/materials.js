// Material database. Numbers are real-world orders of magnitude, tuned for a clear picture.
// viscosity: Pa·s | yieldStress: Pa | surfaceTension / surfaceEnergy: mN/m | density: kg/m³
// polar: the share of that surface tension or energy that comes from polar attraction (hydrogen bonds and the like);
// the rest is the weak attraction every molecule has. Water is mostly polar, oil and Teflon hardly at all.
// cohesion, tack, stringiness, roughness, softness, porosity: 0..1 relative scales.

export const SUBSTANCES = {
  water:   { name: 'Water',         viscosity: 0.001, yieldStress: 0,   surfaceTension: 72, polar: 0.70, cohesion: 0.01, tack: 0.02, stringiness: 0.02, density: 1000, look: { color: 0x4aa8f0, opacity: 0.6,  roughness: 0.05 } },
  oil:     { name: 'Cooking oil',   viscosity: 0.06,  yieldStress: 0,   surfaceTension: 32, polar: 0.02, cohesion: 0.012, tack: 0.05, stringiness: 0.03, density: 920,  look: { color: 0xe8c547, opacity: 0.7,  roughness: 0.05 } },
  honey:   { name: 'Honey',         viscosity: 10,    yieldStress: 0,   surfaceTension: 60, polar: 0.55, cohesion: 0.3,  tack: 0.5,  stringiness: 0.6,  density: 1400, look: { color: 0xd98a11, opacity: 0.88, roughness: 0.08 } },
  yogurt:  { name: 'Yogurt',        viscosity: 1,     yieldStress: 22,  surfaceTension: 50, polar: 0.55, cohesion: 0.2,  tack: 0.3,  stringiness: 0.1,  density: 1050, look: { color: 0xf7f3ea, opacity: 1,    roughness: 0.45 } },
  ketchup: { name: 'Ketchup',       viscosity: 0.8,   yieldStress: 14,  surfaceTension: 50, polar: 0.55, cohesion: 0.18, tack: 0.25, stringiness: 0.08, density: 1100, look: { color: 0xb3261e, opacity: 1,    roughness: 0.3 } },
  peanut:  { name: 'Peanut butter', viscosity: 30,    yieldStress: 300, surfaceTension: 35, polar: 0.05, cohesion: 0.5,  tack: 0.6,  stringiness: 0.15, density: 1090, look: { color: 0xb07a3b, opacity: 1,    roughness: 0.6 } },
  taffy:   { name: 'Taffy',         viscosity: 5000,  yieldStress: 0,   surfaceTension: 45, polar: 0.30, cohesion: 0.8,  tack: 0.9,  stringiness: 0.9,  density: 1300, look: { color: 0xf2a7c3, opacity: 1,    roughness: 0.35 } },
  gum:     { name: 'Chewing gum',   viscosity: 20000, yieldStress: 0,   surfaceTension: 40, polar: 0.10, cohesion: 0.95, tack: 0.6,  stringiness: 1.0,  density: 1200, look: { color: 0x9ad6c0, opacity: 1,    roughness: 0.4 } },
};

export const SOLIDS = {
  ceramic: { name: 'Glazed ceramic',   surfaceEnergy: 60, polar: 0.45, roughness: 0.05, softness: 0.02, porosity: 0,    look: { color: 0x6c8aa3, roughness: 0.15 } },
  glass:   { name: 'Glass',            surfaceEnergy: 72, polar: 0.58, roughness: 0.02, softness: 0.02, porosity: 0,    look: { color: 0xbfe3df, roughness: 0.05, opacity: 0.6 } },
  teflon:  { name: 'Teflon (non-stick)', surfaceEnergy: 18, polar: 0.03, roughness: 0.05, softness: 0.2, porosity: 0,   look: { color: 0x2b2b2e, roughness: 0.35 } },
  steel:   { name: 'Stainless steel',  surfaceEnergy: 45, polar: 0.25, roughness: 0.08, softness: 0.01, porosity: 0,    look: { color: 0xb9bec4, roughness: 0.3, metalness: 0.9 } },
  wood:    { name: 'Wood',             surfaceEnergy: 45, polar: 0.25, roughness: 0.5,  softness: 0.2,  porosity: 0.5,  look: { color: 0xa9744a, roughness: 0.8 } },
  stone:   { name: 'Rough stone',      surfaceEnergy: 55, polar: 0.40, roughness: 0.7,  softness: 0.02, porosity: 0.3,  look: { color: 0x8a8d8f, roughness: 0.95 } },
  ice:     { name: 'Ice',              surfaceEnergy: 75, polar: 0.60, roughness: 0.03, softness: 0.05, porosity: 0, selfLubricating: true, look: { color: 0xd6efff, roughness: 0.08, opacity: 0.85 } },
  enamel:  { name: 'Tooth enamel',     surfaceEnergy: 40, polar: 0.25, roughness: 0.15, softness: 0.01, porosity: 0.05, look: { color: 0xf4efdf, roughness: 0.25 } },
  rubber:  { name: 'Rubber',           surfaceEnergy: 25, polar: 0.04, roughness: 0.3,  softness: 0.9,  porosity: 0,    look: { color: 0x1d1d1f, roughness: 0.9 } },
  leather: { name: 'Leather',          surfaceEnergy: 35, polar: 0.15, roughness: 0.5,  softness: 0.5,  porosity: 0.5,  look: { color: 0x6b4226, roughness: 0.7 } },
  plastic: { name: 'Hard plastic',     surfaceEnergy: 36, polar: 0.12, roughness: 0.1,  softness: 0.25, porosity: 0,    look: { color: 0x3f7fd1, roughness: 0.4 } },
};

for (const [id, m] of Object.entries(SUBSTANCES)) m.id = id;
for (const [id, m] of Object.entries(SOLIDS)) m.id = id;

export const hex = (c) => '#' + c.toString(16).padStart(6, '0');
