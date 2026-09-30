// Procedural starter city so the sandbox opens on something pretty.
import { SIZE, MAXH, G_GRASS, G_ROAD, G_PLAZA, G_WATER, G_SAND } from './world.js';
import { rng } from './textures.js';
import { PROP_TYPES } from './props.js';

const P = Object.fromEntries(PROP_TYPES.map((t, i) => [t.id, i + 1]));

export function generateCity(world, seed = Date.now()) {
  const r = rng(seed);
  world.clear();
  const ROADS = [3, 15, 27, 39, 51];
  const RIVER = 58;

  for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) {
    let g = G_GRASS;
    if (z >= RIVER + 1) g = G_WATER;
    else if (z === RIVER) g = G_SAND;
    else if (ROADS.includes(x) || ROADS.includes(z)) g = G_ROAD;
    world.ground[z * SIZE + x] = g;
  }

  const cx = 31, cz = 29;
  const setB = (x, y, z, s) => { if (world.inside(x, y, z)) world.blocks[world.idx(x, y, z)] = s + 1; };
  const setP = (x, y, z, t, rot = 0) => {
    if (!world.inside(x, y, z)) return;
    const i = world.idx(x, y, z);
    if (!world.blocks[i]) { world.props[i] = t; world.rot[i] = rot; }
  };

  // City blocks between roads.
  const bounds = [];
  const edges = [...ROADS, RIVER];
  for (let i = 0; i < edges.length - 1; i++) bounds.push([edges[i] + 1, edges[i + 1] - 1]);
  bounds.unshift([0, ROADS[0] - 1]);

  for (const [x0, x1] of bounds) for (const [z0, z1] of bounds) {
    if (x1 - x0 < 2 || z1 - z0 < 2) continue;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const d = Math.hypot(mx - cx, mz - cz);
    const isPark = x0 === 16 && z0 === 28;

    // Sidewalk ring
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const ring = x === x0 || x === x1 || z === z0 || z === z1;
      if (!isPark) world.ground[z * SIZE + x] = ring ? G_PLAZA : (d < 26 ? G_PLAZA : G_GRASS);
    }

    if (isPark) { buildPark(world, r, x0, x1, z0, z1, setP); continue; }

    // Street trees and lamps along the ring
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const ring = x === x0 || x === x1 || z === z0 || z === z1;
      if (!ring) continue;
      const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
      if (corner) {
        const rot = x === x0 ? (z === z0 ? 0 : 3) : (z === z0 ? 1 : 2);
        setP(x, 0, z, P.lamp, rot);
      } else if ((x + z) % 3 === 0 && r() < 0.8) setP(x, 0, z, d < 20 ? P.tree : (r() < 0.7 ? P.tree : P.pine));
      else if ((x + z) % 3 === 1 && r() < 0.12) {
        // Face street furniture out toward the nearest road.
        const rot = z === z0 ? 2 : z === z1 ? 0 : x === x0 ? 3 : 1;
        const q = r();
        setP(x, 0, z, q < 0.35 ? P.busstop : q < 0.7 ? P.bench : P.flowers, rot);
      }
    }

    // Lots inside the ring
    const lots = splitLots(r, x0 + 1, x1 - 1, z0 + 1, z1 - 1, d);
    for (const lot of lots) buildLot(world, r, lot, d, setB, setP);
  }

  // Riverside trees
  for (let x = 1; x < SIZE; x += 3) if (r() < 0.7) setP(x, 0, RIVER, r() < 0.4 ? P.palm : r() < 0.5 ? P.pine : P.tree);
  world.markAllDirty();
}

function splitLots(r, x0, x1, z0, z1, d) {
  const lots = [];
  const minSize = d < 16 ? 4 : 3;
  const split = (a0, a1) => {
    const len = a1 - a0 + 1;
    if (len < minSize * 2 + 1 || r() < 0.15) return [[a0, a1]];
    const cut = a0 + minSize + Math.floor(r() * (len - minSize * 2));
    return [[a0, cut - 1], [cut, a1]];
  };
  for (const [ax0, ax1] of split(x0, x1)) for (const [az0, az1] of split(z0, z1)) lots.push([ax0, ax1, az0, az1]);
  return lots;
}

function pickStyle(r, d) {
  // Downtown favours glass/steel/modern/deco towers; the edges favour brick/classic/timber/stucco.
  const down = [1, 1, 4, 3, 0, 3, 8], mid = [0, 3, 5, 2, 1, 4, 8, 7], edge = [2, 2, 5, 0, 5, 3, 6, 6, 7];
  const set = d < 14 ? down : d < 24 ? mid : edge;
  return set[Math.floor(r() * set.length)];
}

function buildLot(world, r, [x0, x1, z0, z1], d, setB, setP) {
  const style = pickStyle(r, d);
  const falloff = Math.exp(-((d / 19) ** 2));
  let h = Math.max(1, Math.round((2 + r() * 3) + falloff * (10 + r() * 30)));
  h = Math.min(h, MAXH - 4);
  const w = x1 - x0 + 1, dep = z1 - z0 + 1;
  // Podium
  const podH = Math.min(h, 1 + Math.floor(r() * 2));
  for (let y = 0; y < podH; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) setB(x, y, z, style);
  let top = podH, fx0 = x0, fx1 = x1, fz0 = z0, fz1 = z1;
  let tStyle = r() < 0.75 ? style : pickStyle(r, d);
  if (h > podH) {
    // Tower, inset from the podium, with optional setbacks.
    if (w > 3 && dep > 3) { fx0++; fx1--; fz0++; fz1--; }
    let y = podH;
    while (y < h) {
      const seg = Math.min(h - y, 4 + Math.floor(r() * 10));
      for (let yy = y; yy < y + seg; yy++) for (let z = fz0; z <= fz1; z++) for (let x = fx0; x <= fx1; x++) setB(x, yy, z, tStyle);
      y += seg;
      if (fx1 - fx0 >= 2 && fz1 - fz0 >= 2 && r() < 0.5) { fx0++; fx1--; } else if (fz1 - fz0 >= 2 && r() < 0.5) { fz0++; fz1--; }
    }
    top = h;
  }
  // Roof clutter
  const rx = fx0 + Math.floor(r() * (fx1 - fx0 + 1)), rz = fz0 + Math.floor(r() * (fz1 - fz0 + 1));
  const roll = r();
  if (top > 18 && roll < 0.6) setP(rx, top, rz, P.antenna);
  else if (roll < 0.4) setP(rx, top, rz, P.ac, Math.floor(r() * 4));
  else if (roll < 0.65) setP(rx, top, rz, P.tank);
  else if (roll < 0.85 && top < 8) setP(rx, top, rz, P.solar, Math.floor(r() * 4));
  else if (top > 4 && top < 14) setP(rx, top, rz, P.billboard, Math.floor(r() * 4));
  if (fx1 - fx0 >= 2 && r() < 0.6) setP(fx1, top, fz1, P.ac, Math.floor(r() * 4));
  if (top > 24 && fx1 > fx0 && r() < 0.4) setP(fx0, top, fz0, P.flag, Math.floor(r() * 4));
  // Podium roof garden
  if (podH < top && r() < 0.5) for (let x = x0; x <= x1; x += 2) setP(x, podH, z0, r() < 0.6 ? P.hedge : P.flowers);
}

function buildPark(world, r, x0, x1, z0, z1, setP) {
  const mx = Math.round((x0 + x1) / 2), mz = Math.round((z0 + z1) / 2);
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const path = x === mx || z === mz || x === x0 || x === x1 || z === z0 || z === z1;
    const pond = Math.hypot(x - (mx + 3), z - (mz - 3)) < 2.2;
    world.ground[z * SIZE + x] = pond ? G_WATER : path ? G_PLAZA : G_GRASS;
    if (pond) continue;
    if (x === mx && z === mz) { setP(x, 0, z, P.fountain); continue; }
    if (path) {
      if ((x === mx && z === mz - 2) || (z === mz && x === mx + 2) || (x === mx && z === mz + 2) || (z === mz && x === mx - 2)) setP(x, 0, z, P.lamp, 0);
      else if ((x === mx && Math.abs(z - mz) === 3) || (z === mz && Math.abs(x - mx) === 3)) setP(x, 0, z, P.bench, x === mx ? 1 : 0);
      continue;
    }
    const q = r();
    if (q < 0.35) setP(x, 0, z, P.tree); else if (q < 0.5) setP(x, 0, z, P.pine); else if (q < 0.56) setP(x, 0, z, P.hedge); else if (q < 0.62) setP(x, 0, z, P.flowers);
  }
  for (let x = x0; x <= x1; x += 3) { setP(x, 0, z0, 1); setP(x, 0, z1, 1); }
}
