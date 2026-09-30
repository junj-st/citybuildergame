// Procedural canvas textures: facade atlases for the six block styles, roofs, and ground tiles.
import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const STYLES = [
  { name: 'Concrete', kind: 'punched', wall: '#d2cdc4', trim: '#e9e5dd', glass: '#34414d', roof: '#9b968d', awning: '#b8452f' },
  { name: 'Glass', kind: 'curtain', wall: '#1f2e38', trim: '#26343d', glass: '#4f7f99', roof: '#6d747a', awning: '#2b6f8f', metal: 0.35 },
  { name: 'Brick', kind: 'brick', wall: '#9c4f3a', trim: '#ece3d3', glass: '#262c33', roof: '#6e5a50', awning: '#2f6b45' },
  { name: 'Modern', kind: 'ribbon', wall: '#eeede8', trim: '#d9d8d2', glass: '#243039', roof: '#a9a8a2', awning: '#e0a43a' },
  { name: 'Steel', kind: 'vertical', wall: '#3b3d42', trim: '#9a7f55', glass: '#1b222b', roof: '#4d4e51', awning: '#8c2f3a' },
  { name: 'Classic', kind: 'arched', wall: '#dcc59c', trim: '#f3e9d2', glass: '#30353c', roof: '#8f806a', awning: '#5a3f7a' },
];

// Atlas layout (4 x 2 cells of C px): row 0 = facade variants 0..2 + storefront, row 1 col 0 = spare.
export const ATLAS_COLS = 4, ATLAS_ROWS = 2;
const C = 256;

const LIT = ['#ffd49a', '#ffe3b8', '#fff0d8', '#ffc98a', '#ffe9c9', '#d9ecff'];

function noise(ctx, x, y, w, h, r, amount, dark = '0,0,0', light = '255,255,255') {
  const n = Math.floor(w * h / 18);
  for (let i = 0; i < n; i++) {
    const a = r() * amount;
    ctx.fillStyle = r() < 0.5 ? `rgba(${dark},${a})` : `rgba(${light},${a})`;
    ctx.fillRect(x + r() * w, y + r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

// Returns the window rectangles for a style inside a cell of size C (3 floors).
function windowLayout(style) {
  const fh = C / 3, out = [];
  for (let f = 0; f < 3; f++) {
    const top = f * fh;
    switch (style.kind) {
      case 'punched':
        for (let c = 0; c < 3; c++) out.push({ x: c * C / 3 + 16, y: top + 18, w: C / 3 - 32, h: fh - 38, floor: f });
        break;
      case 'curtain':
        for (let c = 0; c < 4; c++) out.push({ x: c * C / 4 + 3, y: top + 3, w: C / 4 - 6, h: fh - 14, floor: f });
        break;
      case 'brick':
        for (let c = 0; c < 2; c++) out.push({ x: c * C / 2 + 34, y: top + 16, w: C / 2 - 68, h: fh - 34, floor: f });
        break;
      case 'ribbon':
        for (let c = 0; c < 6; c++) out.push({ x: c * C / 6 + 1, y: top + 20, w: C / 6 - 2, h: fh - 42, floor: f });
        break;
      case 'vertical':
        for (let c = 0; c < 6; c++) out.push({ x: c * C / 6 + 12, y: top + 6, w: C / 6 - 24, h: fh - 12, floor: f });
        break;
      case 'arched':
        for (let c = 0; c < 3; c++) out.push({ x: c * C / 3 + 20, y: top + 18, w: C / 3 - 40, h: fh - 34, floor: f, arch: true });
        break;
    }
  }
  return out;
}

function pathWindow(ctx, w, x0, y0) {
  ctx.beginPath();
  if (w.arch) {
    const r = w.w / 2;
    ctx.moveTo(x0 + w.x, y0 + w.y + w.h);
    ctx.lineTo(x0 + w.x, y0 + w.y + r);
    ctx.arc(x0 + w.x + r, y0 + w.y + r, r, Math.PI, 0);
    ctx.lineTo(x0 + w.x + w.w, y0 + w.y + w.h);
    ctx.closePath();
  } else ctx.rect(x0 + w.x, y0 + w.y, w.w, w.h);
}

function drawWall(ctx, s, x0, y0, r, rows = 3) {
  ctx.fillStyle = s.wall;
  ctx.fillRect(x0, y0, C, C);
  const fh = C / rows;
  if (s.kind === 'brick') {
    ctx.fillStyle = 'rgba(40,20,10,0.35)';
    for (let y = 0; y < C; y += 8) {
      ctx.fillRect(x0, y0 + y, C, 1.5);
      const off = (y / 8) % 2 ? 0 : 9;
      for (let x = off; x < C; x += 18) ctx.fillRect(x0 + x, y0 + y, 1.5, 8);
    }
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? '60,20,10' : '200,120,90'},${r() * 0.25})`;
      ctx.fillRect(x0 + Math.floor(r() * 14) * 18 + ((Math.floor(r() * 32) % 2) ? 9 : 0), y0 + Math.floor(r() * 32) * 8, 17, 7);
    }
  } else if (s.kind === 'arched') {
    ctx.fillStyle = 'rgba(90,70,40,0.18)';
    for (let y = 0; y < C; y += 16) ctx.fillRect(x0, y0 + y, C, 1);
    for (let f = 0; f < rows; f++) { ctx.fillStyle = s.trim; ctx.fillRect(x0, y0 + f * fh + fh - 8, C, 6); }
  } else if (s.kind === 'punched') {
    for (let f = 0; f < rows; f++) { ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(x0, y0 + f * fh + fh - 6, C, 6); }
  } else if (s.kind === 'ribbon') {
    for (let f = 0; f < rows; f++) { ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(x0, y0 + f * fh + fh - 3, C, 3); }
  } else if (s.kind === 'vertical') {
    ctx.fillStyle = s.trim;
    for (let c = 0; c <= 6; c++) ctx.fillRect(x0 + c * C / 6 - 3, y0, 6, C);
  } else if (s.kind === 'curtain') {
    for (let f = 0; f < rows; f++) { ctx.fillStyle = '#16222a'; ctx.fillRect(x0, y0 + f * fh + fh - 11, C, 8); }
  }
  noise(ctx, x0, y0, C, C, r, 0.12);
}

function drawFacade(ctxs, s, col, row, seed, storefront) {
  const [alb, emi, rough] = ctxs;
  const x0 = col * C, y0 = row * C;
  const r = rng(seed);
  drawWall(alb, s, x0, y0, r);
  emi.fillStyle = '#000'; emi.fillRect(x0, y0, C, C);
  rough.fillStyle = s.kind === 'curtain' ? '#666' : '#e6e6e6'; rough.fillRect(x0, y0, C, C);

  const wins = windowLayout(s);
  // Office-style floors are lit together; residential windows are independent.
  const floorLit = [r() < 0.55, r() < 0.55, r() < 0.55];
  for (const w of wins) {
    if (storefront && w.floor === 2) continue;
    // albedo: glass with a subtle sky gradient, occasionally curtains
    const g = alb.createLinearGradient(0, y0 + w.y, 0, y0 + w.y + w.h);
    const curtain = s.kind !== 'curtain' && r() < 0.25;
    g.addColorStop(0, shade(s.glass, 1.45));
    g.addColorStop(0.55, s.glass);
    g.addColorStop(1, shade(s.glass, 0.8));
    alb.fillStyle = g; pathWindow(alb, w, x0, y0); alb.fill();
    if (curtain) { alb.fillStyle = 'rgba(225,210,185,0.55)'; alb.fillRect(x0 + w.x, y0 + w.y, w.w, w.h * (0.3 + r() * 0.5)); }
    if (s.kind === 'punched' || s.kind === 'brick' || s.kind === 'arched') {
      alb.strokeStyle = s.trim; alb.lineWidth = 4; pathWindow(alb, w, x0, y0); alb.stroke();
      alb.fillStyle = s.trim; alb.fillRect(x0 + w.x - 5, y0 + w.y + w.h, w.w + 10, 5);
      alb.fillStyle = 'rgba(0,0,0,0.25)'; alb.fillRect(x0 + w.x + w.w / 2 - 1, y0 + w.y, 2, w.h);
    }
    rough.fillStyle = '#262626'; pathWindow(rough, w, x0, y0); rough.fill();

    // emissive: lit windows at night
    const officeLike = s.kind === 'curtain' || s.kind === 'ribbon' || s.kind === 'vertical';
    const lit = officeLike ? (floorLit[w.floor] ? r() < 0.85 : r() < 0.12) : r() < 0.42;
    if (lit) {
      const c = LIT[Math.floor(r() * LIT.length)];
      const b = 0.55 + r() * 0.45;
      emi.fillStyle = shade(c, b); pathWindow(emi, w, x0, y0); emi.fill();
      if (curtain || r() < 0.2) { emi.fillStyle = 'rgba(0,0,0,0.55)'; emi.fillRect(x0 + w.x, y0 + w.y, w.w, w.h * (0.2 + r() * 0.5)); }
    }
  }

  if (storefront) {
    const top = y0 + C * 2 / 3;
    alb.fillStyle = shade(s.wall, 0.8); alb.fillRect(x0, top, C, C / 3);
    alb.fillStyle = s.awning; alb.fillRect(x0, top + 4, C, 14);
    alb.fillStyle = 'rgba(255,255,255,0.25)';
    for (let x = 0; x < C; x += 16) alb.fillRect(x0 + x, top + 4, 8, 14);
    const g = alb.createLinearGradient(0, top + 22, 0, y0 + C);
    g.addColorStop(0, '#5b6a74'); g.addColorStop(1, '#1f262c');
    alb.fillStyle = g; alb.fillRect(x0 + 10, top + 24, C - 20, C / 3 - 26);
    alb.fillStyle = shade(s.wall, 0.6);
    for (let x = 10; x <= C - 10; x += (C - 20) / 4) alb.fillRect(x0 + x - 2, top + 24, 4, C / 3 - 26);
    rough.fillStyle = '#202020'; rough.fillRect(x0 + 10, top + 24, C - 20, C / 3 - 26);
    // interior glow and a sign band
    const eg = emi.createLinearGradient(0, top + 24, 0, y0 + C);
    eg.addColorStop(0, '#ffe2b0'); eg.addColorStop(1, '#b98b52');
    emi.fillStyle = eg; emi.fillRect(x0 + 10, top + 24, C - 20, C / 3 - 26);
    emi.fillStyle = shade(s.awning, 1.6); emi.fillRect(x0 + 40, top + 7, C - 80, 8);
  }
}

export function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * f); c.g = Math.min(1, c.g * f); c.b = Math.min(1, c.b * f);
  return '#' + c.getHexString();
}

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function tex(canvas, srgb, renderer) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export function buildStyleTextures(renderer) {
  return STYLES.map((s, si) => {
    const canv = [makeCanvas(C * ATLAS_COLS, C * ATLAS_ROWS), makeCanvas(C * ATLAS_COLS, C * ATLAS_ROWS), makeCanvas(C * ATLAS_COLS, C * ATLAS_ROWS)];
    const ctxs = canv.map(c => c.getContext('2d'));
    for (let v = 0; v < 3; v++) drawFacade(ctxs, s, v, 0, 1000 + si * 97 + v * 13, false);
    drawFacade(ctxs, s, 3, 0, 5000 + si * 31, true);
    drawFacade(ctxs, s, 0, 1, 7000 + si * 31, false);
    return {
      map: tex(canv[0], true, renderer),
      emissiveMap: tex(canv[1], true, renderer),
      roughnessMap: tex(canv[2], false, renderer),
      preview: canv[0],
    };
  });
}

export function buildRoofTexture(renderer) {
  const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d'), r = rng(42);
  ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, S, S);
  noise(ctx, 0, 0, S, S, r, 0.22);
  noise(ctx, 0, 0, S, S, r, 0.12);
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(0, 0, S, 2); ctx.fillRect(0, 0, 2, S);
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  ctx.fillRect(S / 2, 0, 1, S); ctx.fillRect(0, S / 2, S, 1);
  const t = tex(c, true, renderer);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- ground tiles ----------
export const TILE_PX = 48;
const ROAD_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W in canvas space (z maps to canvas y)

export function drawGroundTile(ctx, rctx, world, x, z) {
  const T = TILE_PX, px = x * T, py = z * T;
  const t = world.groundAt(x, z);
  const r = rng(x * 7919 + z * 104729 + t * 13);
  const isRoad = (gx, gz) => world.groundAt(gx, gz) === 1;
  let rough = '#f0f0f0';
  switch (t) {
    case 0: { // grass
      ctx.fillStyle = '#6d8c4a'; ctx.fillRect(px, py, T, T);
      noise(ctx, px, py, T, T, r, 0.35, '30,50,10', '170,200,110');
      break;
    }
    case 2: { // plaza pavers
      ctx.fillStyle = '#bdb6a8'; ctx.fillRect(px, py, T, T);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < T; i += T / 4) { ctx.fillRect(px + i, py, 1, T); ctx.fillRect(px, py + i, T, 1); }
      noise(ctx, px, py, T, T, r, 0.15);
      rough = '#c8c8c8';
      break;
    }
    case 3: { // water
      ctx.fillStyle = '#2d5a73'; ctx.fillRect(px, py, T, T);
      ctx.fillStyle = 'rgba(180,220,240,0.18)';
      for (let i = 0; i < 5; i++) ctx.fillRect(px + r() * T, py + r() * T, 6 + r() * 10, 1.5);
      rough = '#141414';
      // shoreline
      for (let d = 0; d < 4; d++) {
        const [dx, dz] = ROAD_DIRS[d];
        const n = world.groundAt(x + dx, z + dz);
        if (n !== 3 && n !== -1) {
          ctx.fillStyle = 'rgba(210,230,235,0.35)';
          if (dx === 0) ctx.fillRect(px, py + (dz < 0 ? 0 : T - 3), T, 3);
          else ctx.fillRect(px + (dx < 0 ? 0 : T - 3), py, 3, T);
        }
      }
      break;
    }
    case 4: { // sand
      ctx.fillStyle = '#d6c498'; ctx.fillRect(px, py, T, T);
      noise(ctx, px, py, T, T, r, 0.2, '120,100,60');
      break;
    }
    case 1: { // road with auto-connecting markings
      ctx.fillStyle = '#3e4045'; ctx.fillRect(px, py, T, T);
      noise(ctx, px, py, T, T, r, 0.18);
      rough = '#bbbbbb';
      const conn = ROAD_DIRS.map(([dx, dz]) => isRoad(x + dx, z + dz));
      const deg = conn.filter(Boolean).length;
      const sw = 7; // sidewalk width
      ctx.fillStyle = '#aaa59b';
      if (!conn[0]) ctx.fillRect(px, py, T, sw);
      if (!conn[2]) ctx.fillRect(px, py + T - sw, T, sw);
      if (!conn[3]) ctx.fillRect(px, py, sw, T);
      if (!conn[1]) ctx.fillRect(px + T - sw, py, sw, T);
      // corner curbs
      const corners = [[0, 3, 0, 0], [0, 1, T - sw, 0], [2, 1, T - sw, T - sw], [2, 3, 0, T - sw]];
      for (const [a, b, cx, cy] of corners) if (conn[a] && conn[b]) ctx.fillRect(px + cx, py + cy, sw, sw);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      if (!conn[0]) ctx.fillRect(px, py + sw, T, 1);
      if (!conn[2]) ctx.fillRect(px, py + T - sw - 1, T, 1);
      if (!conn[3]) ctx.fillRect(px + sw, py, 1, T);
      if (!conn[1]) ctx.fillRect(px + T - sw - 1, py, 1, T);
      const c = T / 2;
      if (deg >= 3) {
        ctx.fillStyle = 'rgba(235,235,230,0.85)';
        for (let d = 0; d < 4; d++) {
          if (!conn[d]) continue;
          for (let i = sw + 2; i < T - sw - 2; i += 5) {
            if (d === 0) ctx.fillRect(px + i, py + 1, 3, 6);
            if (d === 2) ctx.fillRect(px + i, py + T - 7, 3, 6);
            if (d === 3) ctx.fillRect(px + 1, py + i, 6, 3);
            if (d === 1) ctx.fillRect(px + T - 7, py + i, 6, 3);
          }
        }
      } else {
        ctx.fillStyle = '#e6c25a';
        for (let d = 0; d < 4; d++) {
          if (!conn[d]) continue;
          const [dx, dz] = ROAD_DIRS[d];
          for (let s = 3; s < c; s += 8) {
            const ax = px + c + dx * s, ay = py + c + dz * s;
            if (dx === 0) ctx.fillRect(ax - 1, ay - 2, 2, 4); else ctx.fillRect(ax - 2, ay - 1, 4, 2);
          }
        }
        if (deg === 0) { ctx.fillStyle = '#aaa59b'; ctx.fillRect(px + sw, py + sw, T - 2 * sw, T - 2 * sw); }
      }
      break;
    }
  }
  rctx.fillStyle = rough; rctx.fillRect(px, py, T, T);
}

export function makeGroundCanvases(size) {
  return [makeCanvas(size * TILE_PX, size * TILE_PX), makeCanvas(size * TILE_PX, size * TILE_PX)];
}

export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const S = 128, c = makeCanvas(S, S), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
