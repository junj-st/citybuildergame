// Builds face-culled block meshes (one side mesh + one roof mesh per style) with voxel AO.
import * as THREE from 'three';
import { SIZE, MAXH } from './world.js';
import { STYLES, ATLAS_COLS, ATLAS_ROWS, buildStyleTextures, buildRoofTexture } from './textures.js';

// Face definitions: normal, u, v tangents and origin corner (u x v = n).
const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], o: [1, 0, 1], side: true },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], o: [0, 0, 0], side: true },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], o: [0, 0, 1], side: true },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], o: [1, 0, 0], side: true },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], o: [0, 1, 1], side: false },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], o: [0, 0, 0], side: false },
];
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const AO_CURVE = [0.5, 0.68, 0.85, 1.0];

function hash(a, b, c, d = 0) {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2147483647) + Math.imul(d, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0);
}

export class BlockRenderer {
  constructor(scene, renderer, world) {
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.textures = buildStyleTextures(renderer);
    const roofTex = buildRoofTexture(renderer);
    this.sideMats = STYLES.map((s, i) => new THREE.MeshStandardMaterial({
      map: this.textures[i].map,
      emissiveMap: this.textures[i].emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: 0,
      roughnessMap: this.textures[i].roughnessMap,
      roughness: 1,
      metalness: s.metal || 0,
      vertexColors: true,
    }));
    this.roofMats = STYLES.map(s => new THREE.MeshStandardMaterial({
      map: roofTex, color: new THREE.Color(s.roof), roughness: 0.95, vertexColors: true,
    }));
    this.meshes = [];
    this.labels = new Int32Array(SIZE * SIZE * MAXH);
  }

  setNight(k) { for (const m of this.sideMats) m.emissiveIntensity = k * 0.8; }
  setWet(k) { for (const m of this.roofMats) m.roughness = 0.95 - k * 0.55; }

  // Label connected same-style components so each building gets a consistent tint.
  _label() {
    const w = this.world, B = w.blocks, L = this.labels;
    L.fill(-1);
    const queue = new Int32Array(B.length);
    const SS = SIZE * SIZE;
    for (let i = 0; i < B.length; i++) {
      if (!B[i] || L[i] !== -1) continue;
      const style = B[i];
      let qh = 0, qt = 0;
      queue[qt++] = i; L[i] = i;
      while (qh < qt) {
        const c = queue[qh++];
        const x = c % SIZE, z = ((c / SIZE) | 0) % SIZE, y = (c / SS) | 0;
        const nb = [x > 0 ? c - 1 : -1, x < SIZE - 1 ? c + 1 : -1, z > 0 ? c - SIZE : -1, z < SIZE - 1 ? c + SIZE : -1,
          y > 0 ? c - SS : -1, y < MAXH - 1 ? c + SS : -1];
        for (const n of nb) if (n >= 0 && L[n] === -1 && B[n] === style) { L[n] = i; queue[qt++] = n; }
      }
    }
  }

  rebuild() {
    const w = this.world, B = w.blocks;
    this._label();
    const buckets = STYLES.map(() => ({ side: newBuf(), top: newBuf() }));
    const solid = (x, y, z) => w.block(x, y, z) !== 0;
    const tint = new THREE.Color();

    for (let y = 0; y < MAXH; y++) for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + z) * SIZE + x;
      const v = B[i];
      if (!v) continue;
      const style = v - 1;
      const h = hash(this.labels[i], 7, 13);
      const bri = 0.9 + ((h & 255) / 255) * 0.16;
      const warm = (((h >> 8) & 255) / 255 - 0.5) * 0.06;
      tint.setRGB(bri + warm, bri, bri - warm);

      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
        if (solid(nx, ny, nz)) continue;
        const buf = F.side ? buckets[style].side : buckets[style].top;
        const base = buf.pos.length / 3;
        const ao = [];
        for (let c = 0; c < 4; c++) {
          const [cu, cv] = CORNERS[c];
          const su = cu ? 1 : -1, sv = cv ? 1 : -1;
          const s1 = solid(nx + F.u[0] * su, ny + F.u[1] * su, nz + F.u[2] * su);
          const s2 = solid(nx + F.v[0] * sv, ny + F.v[1] * sv, nz + F.v[2] * sv);
          const cc = solid(nx + F.u[0] * su + F.v[0] * sv, ny + F.u[1] * su + F.v[1] * sv, nz + F.u[2] * su + F.v[2] * sv);
          const a = (s1 && s2) ? 0 : 3 - (s1 + s2 + cc);
          ao.push(a);
          const px = x + F.o[0] + F.u[0] * cu + F.v[0] * cv;
          const py = y + F.o[1] + F.u[1] * cu + F.v[1] * cv;
          const pz = z + F.o[2] + F.u[2] * cu + F.v[2] * cv;
          buf.pos.push(px, py, pz);
          buf.nor.push(F.n[0], F.n[1], F.n[2]);
          const k = AO_CURVE[a];
          buf.col.push(tint.r * k, tint.g * k, tint.b * k);
          if (F.side) {
            let col, row = 0;
            if (y === 0) col = 3;
            else col = hash(x, y, z, f) % 3;
            const inset = 0.002;
            const uu = inset + cu * (1 - 2 * inset), vv = inset + cv * (1 - 2 * inset);
            buf.uv.push((col + uu) / ATLAS_COLS, 1 - (row + 1 - vv) / ATLAS_ROWS);
          } else {
            buf.uv.push(px, pz);
          }
        }
        // Flip the quad diagonal to avoid AO anisotropy.
        if (ao[0] + ao[2] > ao[1] + ao[3]) buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      }
    }

    for (const m of this.meshes) { this.group.remove(m); m.geometry.dispose(); }
    this.meshes = [];
    buckets.forEach((b, s) => {
      for (const kind of ['side', 'top']) {
        const buf = b[kind];
        if (!buf.idx.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
        g.setIndex(buf.idx);
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, kind === 'side' ? this.sideMats[s] : this.roofMats[s]);
        m.castShadow = true; m.receiveShadow = true;
        this.group.add(m); this.meshes.push(m);
      }
    });
  }
}

function newBuf() { return { pos: [], nor: [], uv: [], col: [], idx: [] }; }
