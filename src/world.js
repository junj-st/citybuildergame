// Voxel world data: dense grids for blocks, props and ground tiles, plus undo/redo.

export const SIZE = 64; // x/z extent in cells
export const MAXH = 64; // max building height in cells

export const GROUND_TYPES = ['Grass', 'Road', 'Plaza', 'Water', 'Sand'];
export const G_GRASS = 0, G_ROAD = 1, G_PLAZA = 2, G_WATER = 3, G_SAND = 4;

const VOL = SIZE * SIZE * MAXH;

export class World {
  constructor() {
    this.blocks = new Uint8Array(VOL); // 0 empty, 1..6 style + 1
    this.props = new Uint8Array(VOL); // 0 none, type + 1
    this.rot = new Uint8Array(VOL); // prop rotation 0..3
    this.ground = new Uint8Array(SIZE * SIZE);
    this.dirtyBlocks = true;
    this.dirtyProps = true;
    this.dirtyGround = new Set();
    this.groundAll = true;
    this.undoStack = [];
    this.redoStack = [];
    this.tx = null;
    this.onChange = null;
  }

  idx(x, y, z) { return (y * SIZE + z) * SIZE + x; }
  inside(x, y, z) { return x >= 0 && x < SIZE && z >= 0 && z < SIZE && y >= 0 && y < MAXH; }
  insideXZ(x, z) { return x >= 0 && x < SIZE && z >= 0 && z < SIZE; }

  // Returns block value; the ground layer (y = -1) counts as solid inside the lot.
  block(x, y, z) {
    if (y < 0) return (y === -1 && this.insideXZ(x, z)) ? 255 : 0;
    if (!this.inside(x, y, z)) return 0;
    return this.blocks[this.idx(x, y, z)];
  }
  prop(x, y, z) { return this.inside(x, y, z) ? this.props[this.idx(x, y, z)] : 0; }
  groundAt(x, z) { return this.insideXZ(x, z) ? this.ground[z * SIZE + x] : -1; }

  // --- mutation (recorded into the current transaction) ---
  begin() { if (!this.tx) this.tx = []; }
  commit() {
    const tx = this.tx; this.tx = null;
    if (tx && tx.length) {
      this.undoStack.push(tx);
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    this.onChange?.();
    return tx ? tx.length : 0;
  }
  _rec(kind, i, before, after) { if (this.tx) this.tx.push([kind, i, before, after]); }

  setBlock(x, y, z, v) {
    if (!this.inside(x, y, z)) return false;
    const i = this.idx(x, y, z);
    if (this.blocks[i] === v) return false;
    if (v && this.props[i]) this.setProp(x, y, z, 0);
    this._rec(0, i, this.blocks[i], v);
    this.blocks[i] = v;
    this.dirtyBlocks = true;
    if (!v && y + 1 < MAXH && this.props[this.idx(x, y + 1, z)]) this.setProp(x, y + 1, z, 0);
    if (y === 0) this.dirtyGround.add(z * SIZE + x); // roads under buildings change traffic
    return true;
  }

  setProp(x, y, z, type, rot = 0) {
    if (!this.inside(x, y, z)) return false;
    const i = this.idx(x, y, z);
    if (type && this.blocks[i]) return false;
    const before = this.props[i] | (this.rot[i] << 8);
    const after = type | ((type ? rot : 0) << 8);
    if (before === after) return false;
    this._rec(1, i, before, after);
    this.props[i] = type; this.rot[i] = type ? rot : 0;
    this.dirtyProps = true;
    return true;
  }

  setGround(x, z, t) {
    if (!this.insideXZ(x, z)) return false;
    const i = z * SIZE + x;
    if (this.ground[i] === t) return false;
    this._rec(2, i, this.ground[i], t);
    this.ground[i] = t;
    this.dirtyGround.add(i);
    return true;
  }

  _apply(tx, reverse) {
    const list = reverse ? [...tx].reverse() : tx;
    for (const [kind, i, before, after] of list) {
      const v = reverse ? before : after;
      if (kind === 0) { this.blocks[i] = v; this.dirtyBlocks = true; }
      else if (kind === 1) { this.props[i] = v & 255; this.rot[i] = v >> 8; this.dirtyProps = true; }
      else { this.ground[i] = v; this.dirtyGround.add(i); }
    }
    this.dirtyProps = true;
    this.groundAll = true;
    this.onChange?.();
  }
  undo() { const tx = this.undoStack.pop(); if (!tx) return false; this._apply(tx, true); this.redoStack.push(tx); return true; }
  redo() { const tx = this.redoStack.pop(); if (!tx) return false; this._apply(tx, false); this.undoStack.push(tx); return true; }

  clear() {
    this.blocks.fill(0); this.props.fill(0); this.rot.fill(0); this.ground.fill(0);
    this.undoStack.length = 0; this.redoStack.length = 0;
    this.markAllDirty();
  }
  markAllDirty() { this.dirtyBlocks = true; this.dirtyProps = true; this.groundAll = true; this.onChange?.(); }

  countBlocks() { let n = 0; for (let i = 0; i < VOL; i++) if (this.blocks[i]) n++; return n; }

  // Top of the highest block in a column (0 if empty).
  columnTop(x, z) {
    for (let y = MAXH - 1; y >= 0; y--) if (this.blocks[this.idx(x, y, z)]) return y + 1;
    return 0;
  }

  // --- serialization (run-length encoded) ---
  toJSON() {
    return { app: 'tinyopolis', v: 1, size: SIZE, maxh: MAXH,
      blocks: rle(this.blocks), props: rle(this.props), rot: rle(this.rot), ground: rle(this.ground) };
  }
  load(data) {
    if (!data || data.size !== SIZE || data.maxh !== MAXH) throw new Error('Incompatible city file');
    const b = unrle(data.blocks, VOL), p = unrle(data.props, VOL), r = unrle(data.rot, VOL), g = unrle(data.ground, SIZE * SIZE);
    this.blocks.set(b); this.props.set(p); this.rot.set(r); this.ground.set(g);
    this.undoStack.length = 0; this.redoStack.length = 0;
    this.markAllDirty();
  }
}

function rle(arr) {
  const out = [];
  let prev = arr[0], n = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === prev) n++;
    else { out.push(prev, n); prev = arr[i]; n = 1; }
  }
  out.push(prev, n);
  return out;
}
function unrle(list, len) {
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < list.length; i += 2) {
    const v = list[i], n = list[i + 1];
    if (o + n > len) throw new Error('Corrupt city data');
    out.fill(v, o, o + n); o += n;
  }
  if (o !== len) throw new Error('Corrupt city data');
  return out;
}
