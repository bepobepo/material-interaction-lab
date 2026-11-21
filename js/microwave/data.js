// Foods, containers and starting states for the microwave tab. Typical figures, tuned for a clear picture.
// water: fraction by weight | loss: microwave absorption relative to liquid water at 20 °C | lossHot: how that changes by 100 °C
// iceLoss: fraction of the absorption left when frozen | pen: how deep microwaves reach (m) | rho kg/m³ | c J/kg·K | k W/m·K
// mix: how much a liquid stirs itself (multiplies heat spreading) | boil °C | shape: how it sits in the oven
// unit: how its amount is measured (ml, g, or n = a number of pieces) | amounts: the choices | amount: the default
export const FOODS = {
  water:   { name: 'Water',           water: 1.0,  loss: 1.0,   lossHot: 0.35, iceLoss: 0.003, pen: 0.017, rho: 1000, c: 4180, k: 0.6,  mix: 25, boil: 100, stir: true,  shape: 'liquid', unit: 'ml', amounts: [150, 300, 450], amount: 300 },
  soup:    { name: 'Soup',            water: 0.9,  loss: 1.8,   lossHot: 1.2,  iceLoss: 0.03,  pen: 0.009, rho: 1030, c: 3900, k: 0.58, mix: 10, boil: 100, stir: true,  shape: 'liquid', salty: true, unit: 'ml', amounts: [150, 300, 450], amount: 300 },
  rice:    { name: 'Leftover rice',   water: 0.65, loss: 0.8,   lossHot: 1.0,  iceLoss: 0.03,  pen: 0.02,  rho: 800,  c: 3000, k: 0.35, mix: 1,  boil: 100, stir: true,  shape: 'mound', unit: 'g', amounts: [150, 250, 400], amount: 250 },
  pasta:   { name: 'Pasta bolognese', water: 0.68, loss: 1.4,   lossHot: 1.15, iceLoss: 0.04,  pen: 0.012, rho: 900,  c: 3400, k: 0.45, mix: 1,  boil: 100, stir: true,  shape: 'mound', heap: 0.55, salty: true, unit: 'g', amounts: [200, 350, 450], amount: 350 },
  lasagne: { name: 'Lasagne',         water: 0.7,  loss: 1.6,   lossHot: 1.2,  iceLoss: 0.05,  pen: 0.011, rho: 1050, c: 3400, k: 0.5,  mix: 1,  boil: 100, stir: false, shape: 'slab', salty: true, unit: 'g', amounts: [200, 400, 600], amount: 400 },
  pizza:   { name: 'Pizza',           water: 0.48, loss: 0.9,   lossHot: 1.1,  iceLoss: 0.06,  pen: 0.015, rho: 800,  c: 3000, k: 0.3,  mix: 1,  boil: 100, stir: false, shape: 'pizza', salty: true, unit: 'n', one: 'slice', many: 'slices', amounts: [1, 2], amount: 1 },
  potato:  { name: 'Potato',          water: 0.78, loss: 1.5,   lossHot: 1.1,  iceLoss: 0.03,  pen: 0.012, rho: 1080, c: 3500, k: 0.55, mix: 1,  boil: 100, stir: false, shape: 'potato', unit: 'n', one: 'potato', many: 'potatoes', amounts: [1, 2, 3], amount: 1 },
  tomato:  { name: 'Tomato',          water: 0.94, loss: 1.2,   lossHot: 1.0,  iceLoss: 0.03,  pen: 0.013, rho: 1000, c: 3950, k: 0.57, mix: 1,  boil: 100, stir: false, shape: 'tomato', unit: 'n', one: 'tomato', many: 'tomatoes', amounts: [1, 2, 3], amount: 1 },
  chicken: { name: 'Roast chicken',   water: 0.65, loss: 1.3,   lossHot: 1.1,  iceLoss: 0.04,  pen: 0.012, rho: 1050, c: 3300, k: 0.48, mix: 1,  boil: 100, stir: false, shape: 'chicken', unit: 'n', labels: { 0.25: '¼ chicken', 0.5: '½ chicken' }, amounts: [0.25, 0.5], amount: 0.5 },
  egg:     { name: 'Boiled eggs (peeled)', water: 0.75, loss: 1.3, lossHot: 1.1, iceLoss: 0.04, pen: 0.013, rho: 1030, c: 3300, k: 0.5,  mix: 1,  boil: 100, stir: false, shape: 'egg', unit: 'n', one: 'egg', many: 'eggs', amounts: [1, 2, 3, 4], amount: 2 },
  bread:   { name: 'Bread roll',      water: 0.36, loss: 0.25,  lossHot: 1.0,  iceLoss: 0.3,   pen: 0.04,  rho: 280,  c: 2700, k: 0.08, mix: 1,  boil: 100, stir: false, shape: 'roll', unit: 'n', one: 'roll', many: 'rolls', amounts: [1, 2, 3, 4], amount: 1 },
  oil:     { name: 'Cooking oil',     water: 0,    loss: 0.015, lossHot: 1.0,  iceLoss: 1,     pen: 0.2,   rho: 920,  c: 2000, k: 0.17, mix: 10, boil: 250, stir: true,  shape: 'liquid', freezes: false, unit: 'ml', amounts: [100, 200, 300], amount: 200 },
  honey:   { name: 'Honey',           water: 0.17, loss: 0.45,  lossHot: 1.3,  iceLoss: 1,     pen: 0.014, rho: 1400, c: 2300, k: 0.5,  mix: 2,  boil: 115, stir: true,  shape: 'liquid', freezes: false, unit: 'g', amounts: [150, 300, 500], amount: 300 },
};
export const PIZZA = { L: 0.11, half: 24 * Math.PI / 180, tip: 0.62 };   // a slice: length (m), half its angle, and how far its centre is from the tip

// The amount choices for a food, as a picker set.
export const amountName = (food, v) => (food.labels ? food.labels[v] : food.unit === 'n' ? `${v} ${v === 1 ? food.one : food.many}` : `${v} ${food.unit}`);
export function amountSet(food) {
  const set = {}; for (const v of food.amounts) set[v] = { id: String(v), value: v, name: amountName(food, v), preferred: v === food.amount };
  return set;
}

// col: its own colour | detail: surface pattern | clear: how see-through it is (1 = solid)
// loss / pen as above | rc: heat capacity per volume of the wall as modelled (J/m³·K, scaled down for thin walls) | k W/m·K
export const CONTAINERS = {
  none:      { name: 'None (on the turntable)', noun: 'turntable', shape: 'none' },
  glass:     { name: 'Glass bowl',     noun: 'bowl',  shape: 'bowl',  col: '#bcd9e2', clear: 0.5, loss: 0.002, pen: 2,    rc: 1.25e6, k: 1.1 },
  porcelain: { name: 'Porcelain bowl', noun: 'bowl',  shape: 'bowl',  col: '#f3f1ea', loss: 0.006, pen: 1,    rc: 1.45e6, k: 1.5 },
  stoneware: { name: 'Stoneware bowl', noun: 'bowl',  shape: 'bowl',  col: '#b08a5c', detail: 'speckle', loss: 0.2,   pen: 0.04, rc: 2.0e6,  k: 1.3 },
  plastic:   { name: 'Plastic tub',    noun: 'tub',   shape: 'bowl',  col: '#e4e8ef', clear: 0.75, loss: 0.001, pen: 5,    rc: 3.4e5,  k: 0.2 },
  paper:     { name: 'Paper plate',    noun: 'plate', shape: 'plate', col: '#ece2cc', detail: 'pleat', loss: 0.004, pen: 2,    rc: 2.0e5,  k: 0.08 },
};

export const STARTS = {
  frozen: { name: 'Frozen (−18 °C)', T: -18 },
  fridge: { name: 'From the fridge (4 °C)', T: 4 },
  room:   { name: 'Room temperature (20 °C)', T: 20 },
};

for (const set of [FOODS, CONTAINERS, STARTS]) for (const [id, m] of Object.entries(set)) m.id = id;
