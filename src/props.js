// Decorative props (trees, lights, utility blocks) rendered with instancing.
import * as THREE from 'three';
import { SIZE, MAXH } from './world.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { radialTexture } from './textures.js';

export const PROP_TYPES = [
  { id: 'tree', name: 'Oak tree' },
  { id: 'pine', name: 'Pine tree' },
  { id: 'hedge', name: 'Hedge' },
  { id: 'lamp', name: 'Street lamp' },
  { id: 'antenna', name: 'Antenna' },
  { id: 'tank', name: 'Water tank' },
  { id: 'ac', name: 'AC unit' },
  { id: 'solar', name: 'Solar panel' },
  // Appended so existing saves keep their prop indices.
  { id: 'palm', name: 'Palm tree' },
  { id: 'flowers', name: 'Flower bed' },
  { id: 'bench', name: 'Bench' },
  { id: 'fountain', name: 'Fountain' },
  { id: 'flag', name: 'Flagpole' },
  { id: 'billboard', name: 'Billboard' },
  { id: 'busstop', name: 'Bus stop' },
];

const ORGANIC = new Set(['tree', 'pine', 'palm']);

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

export class PropRenderer {
  constructor(scene, world) {
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mats = {
      bark: std('#5a4130'),
      leaf: std('#ffffff', { flatShading: true }),
      pineLeaf: std('#ffffff', { flatShading: true }),
      hedge: std('#4f7a3a', { flatShading: true }),
      metal: std('#6f7479', { roughness: 0.5, metalness: 0.4 }),
      darkMetal: std('#2d3135', { roughness: 0.5, metalness: 0.3 }),
      bulb: std('#fff2d0', { emissive: '#ffcf8a', emissiveIntensity: 0.2 }),
      beacon: std('#ff3b30', { emissive: '#ff2a1a', emissiveIntensity: 0.5 }),
      wood: std('#7b5a3e'),
      tankRoof: std('#4a3a2c'),
      ac: std('#c9ccce', { roughness: 0.6 }),
      solar: std('#1d2d4a', { roughness: 0.25, metalness: 0.5 }),
      palmBark: std('#8a6f4d'),
      bloom: std('#ffffff', { flatShading: true, roughness: 0.7 }),
      stone: std('#c4bdb0', { roughness: 0.9 }),
      water: std('#5fa8c9', { roughness: 0.1, metalness: 0.1, emissive: '#1b4d66', emissiveIntensity: 0.25 }),
      cloth: std('#ffffff', { roughness: 0.9 }),
      sign: std('#ffffff', { roughness: 0.5, emissive: '#fff1d6', emissiveIntensity: 0 }),
      shelter: std('#bcd6e0', { roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.45, depthWrite: false }),
      busSign: std('#2b6fc7', { emissive: '#2b6fc7', emissiveIntensity: 0.1 }),
    };
    this.poolMat = new THREE.MeshBasicMaterial({
      map: radialTexture('rgba(255,210,140,1)', 'rgba(255,190,110,0)'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
      polygonOffset: true, polygonOffsetFactor: -2,
    });
    this.parts = this._defineParts();
    this.meshes = [];
    this.time = 0;
  }

  _defineParts() {
    const M = this.mats;
    const at = (geo, x, y, z) => { geo.translate(x, y, z); return geo; };
    const P = {};
    P.tree = [
      { geo: at(new THREE.CylinderGeometry(0.035, 0.05, 0.32, 6), 0, 0.16, 0), mat: M.bark },
      { geo: at(new THREE.IcosahedronGeometry(0.26, 0), 0, 0.5, 0), mat: M.leaf, tint: ['#5f8f3e', '#7aa04a', '#4c7a35', '#8aa84f', '#6b8f2e'] },
      { geo: at(new THREE.IcosahedronGeometry(0.17, 0), 0.1, 0.66, -0.05), mat: M.leaf, tint: ['#6c9a44', '#86ad55', '#5a8a3a'] },
    ];
    P.pine = [
      { geo: at(new THREE.CylinderGeometry(0.03, 0.04, 0.2, 6), 0, 0.1, 0), mat: M.bark },
      { geo: at(new THREE.ConeGeometry(0.22, 0.42, 7), 0, 0.38, 0), mat: M.pineLeaf, tint: ['#2f5a36', '#3a6b3f', '#2a4f31'] },
      { geo: at(new THREE.ConeGeometry(0.15, 0.34, 7), 0, 0.64, 0), mat: M.pineLeaf, tint: ['#36653d', '#427547', '#305a36'] },
    ];
    P.hedge = [
      { geo: at(new THREE.BoxGeometry(0.86, 0.2, 0.86), 0, 0.1, 0), mat: M.hedge },
    ];
    P.lamp = [
      { geo: at(new THREE.CylinderGeometry(0.012, 0.02, 0.58, 6), -0.3, 0.29, -0.3), mat: M.darkMetal },
      { geo: at(new THREE.BoxGeometry(0.16, 0.014, 0.014), -0.23, 0.575, -0.3), mat: M.darkMetal },
      { geo: at(new THREE.BoxGeometry(0.07, 0.022, 0.04), -0.15, 0.565, -0.3), mat: M.bulb },
    ];
    P.antenna = [
      { geo: at(new THREE.CylinderGeometry(0.012, 0.03, 1.5, 6), 0, 0.75, 0), mat: M.metal },
      { geo: at(new THREE.BoxGeometry(0.22, 0.012, 0.012), 0, 0.95, 0), mat: M.metal },
      { geo: at(new THREE.BoxGeometry(0.012, 0.012, 0.16), 0, 1.15, 0), mat: M.metal },
      { geo: at(new THREE.SphereGeometry(0.03, 8, 6), 0, 1.51, 0), mat: M.beacon, noShadow: true },
    ];
    const legs = [];
    for (const [lx, lz] of [[-0.15, -0.15], [0.15, -0.15], [0.15, 0.15], [-0.15, 0.15]])
      legs.push({ geo: at(new THREE.BoxGeometry(0.025, 0.26, 0.025), lx, 0.13, lz), mat: M.darkMetal });
    P.tank = [
      ...legs,
      { geo: at(new THREE.CylinderGeometry(0.22, 0.22, 0.32, 14), 0, 0.42, 0), mat: M.wood },
      { geo: at(new THREE.ConeGeometry(0.24, 0.13, 14), 0, 0.645, 0), mat: M.tankRoof },
    ];
    P.ac = [
      { geo: at(new THREE.BoxGeometry(0.56, 0.22, 0.38), 0, 0.11, 0), mat: M.ac },
      { geo: at(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 14), -0.13, 0.226, 0), mat: M.darkMetal },
      { geo: at(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 14), 0.13, 0.226, 0), mat: M.darkMetal },
    ];
    const panel = new THREE.BoxGeometry(0.8, 0.02, 0.42);
    panel.rotateX(-0.45); panel.translate(0, 0.17, 0);
    P.solar = [
      { geo: panel, mat: M.solar },
      { geo: at(new THREE.BoxGeometry(0.03, 0.24, 0.03), -0.35, 0.12, 0.12), mat: M.metal },
      { geo: at(new THREE.BoxGeometry(0.03, 0.24, 0.03), 0.35, 0.12, 0.12), mat: M.metal },
      { geo: at(new THREE.BoxGeometry(0.03, 0.08, 0.03), -0.35, 0.04, -0.12), mat: M.metal },
      { geo: at(new THREE.BoxGeometry(0.03, 0.08, 0.03), 0.35, 0.04, -0.12), mat: M.metal },
    ];
    // Palm: slim trunk topped by drooping fronds.
    const fronds = [];
    for (let k = 0; k < 7; k++) {
      const f = new THREE.BoxGeometry(0.36, 0.015, 0.09);
      f.translate(0.18, 0, 0); f.rotateZ(-0.4 - (k % 2) * 0.15); f.rotateY(k * Math.PI * 2 / 7); f.translate(0, 0.74, 0);
      fronds.push(f);
    }
    P.palm = [
      { geo: at(new THREE.CylinderGeometry(0.028, 0.045, 0.76, 6), 0, 0.38, 0), mat: M.palmBark },
      { geo: mergeGeometries(fronds), mat: M.leaf, tint: ['#4f8f3a', '#5f9e43', '#3f7f34'] },
    ];
    const blooms = [];
    for (let k = 0; k < 6; k++) blooms.push(at(new THREE.IcosahedronGeometry(0.06, 0), -0.25 + k * 0.1, 0.22 + (k % 2) * 0.03, (k % 2) * 0.06 - 0.03));
    P.flowers = [
      { geo: at(new THREE.BoxGeometry(0.7, 0.14, 0.3), 0, 0.07, 0), mat: M.stone },
      { geo: at(new THREE.BoxGeometry(0.64, 0.06, 0.24), 0, 0.16, 0), mat: M.hedge },
      { geo: mergeGeometries(blooms), mat: M.bloom, tint: ['#e0506a', '#f2c14e', '#b56ad8', '#f08a3c', '#f4f0e8'] },
    ];
    P.bench = [
      { geo: at(new THREE.BoxGeometry(0.6, 0.03, 0.18), 0, 0.16, 0.2), mat: M.wood },
      { geo: at(new THREE.BoxGeometry(0.6, 0.12, 0.03), 0, 0.26, 0.12), mat: M.wood },
      { geo: at(new THREE.BoxGeometry(0.03, 0.16, 0.18), -0.26, 0.08, 0.2), mat: M.darkMetal },
      { geo: at(new THREE.BoxGeometry(0.03, 0.16, 0.18), 0.26, 0.08, 0.2), mat: M.darkMetal },
    ];
    P.fountain = [
      { geo: at(new THREE.CylinderGeometry(0.42, 0.44, 0.14, 20), 0, 0.07, 0), mat: M.stone },
      { geo: at(new THREE.CylinderGeometry(0.37, 0.37, 0.02, 20), 0, 0.13, 0), mat: M.water },
      { geo: at(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 10), 0, 0.25, 0), mat: M.stone },
      { geo: at(new THREE.CylinderGeometry(0.16, 0.08, 0.06, 14), 0, 0.41, 0), mat: M.stone },
      { geo: at(new THREE.ConeGeometry(0.05, 0.16, 8), 0, 0.51, 0), mat: M.water, noShadow: true },
    ];
    P.flag = [
      { geo: at(new THREE.BoxGeometry(0.1, 0.04, 0.1), -0.3, 0.02, 0), mat: M.stone },
      { geo: at(new THREE.CylinderGeometry(0.012, 0.018, 1.1, 6), -0.3, 0.55, 0), mat: M.metal },
      { geo: at(new THREE.BoxGeometry(0.32, 0.19, 0.008), -0.13, 0.98, 0), mat: M.cloth, tint: ['#c8102e', '#1f4fa3', '#f2b705', '#2e8b57', '#f4f0e8'] },
    ];
    P.billboard = [
      { geo: at(new THREE.BoxGeometry(0.04, 0.62, 0.04), -0.3, 0.31, 0), mat: M.darkMetal },
      { geo: at(new THREE.BoxGeometry(0.04, 0.62, 0.04), 0.3, 0.31, 0), mat: M.darkMetal },
      { geo: at(new THREE.BoxGeometry(0.84, 0.42, 0.04), 0, 0.8, 0), mat: M.darkMetal },
      { geo: at(new THREE.BoxGeometry(0.78, 0.36, 0.01), 0, 0.8, 0.025), mat: M.sign, tint: ['#ff9a2e', '#3aa0d8', '#e04a6a', '#7ac74f', '#f2c14e'] },
    ];
    const posts = [];
    for (const [px, pz] of [[-0.37, -0.15], [0.37, -0.15], [-0.37, 0.15], [0.37, 0.15]]) posts.push(at(new THREE.BoxGeometry(0.03, 0.5, 0.03), px, 0.25, pz));
    P.busstop = [
      { geo: mergeGeometries(posts), mat: M.darkMetal },
      { geo: at(new THREE.BoxGeometry(0.84, 0.03, 0.4), 0, 0.515, 0), mat: M.darkMetal },
      { geo: at(new THREE.BoxGeometry(0.74, 0.36, 0.015), 0, 0.3, -0.15), mat: M.shelter, noShadow: true },
      { geo: at(new THREE.BoxGeometry(0.5, 0.03, 0.12), 0, 0.15, -0.07), mat: M.wood },
      { geo: at(new THREE.CylinderGeometry(0.01, 0.01, 0.7, 6), 0.46, 0.35, 0.15), mat: M.metal },
      { geo: at(new THREE.BoxGeometry(0.02, 0.12, 0.12), 0.46, 0.66, 0.15), mat: M.busSign },
    ];
    return PROP_TYPES.map(t => P[t.id]);
  }

  // Build a ghost preview group of a prop type (used by the placement tool).
  makeGhost(typeIndex) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#ffb24d', transparent: true, opacity: 0.55, depthWrite: false });
    for (const p of this.parts[typeIndex]) g.add(new THREE.Mesh(p.geo, mat));
    return g;
  }

  setNight(k) {
    this.night = k;
    this.mats.bulb.emissiveIntensity = 0.15 + k * 6;
    this.poolMat.opacity = k * 0.75;
    this.mats.sign.emissiveIntensity = k * 0.3;
    this.mats.busSign.emissiveIntensity = 0.1 + k * 1.5;
    this.mats.water.emissiveIntensity = 0.25 + k * 0.6;
  }

  update(dt) {
    this.time += dt;
    const blink = (Math.sin(this.time * 3) > 0.2) ? 1 : 0.15;
    this.mats.beacon.emissiveIntensity = 0.4 + (this.night || 0) * 6 * blink;
  }

  rebuild() {
    const w = this.world;
    for (const m of this.meshes) { this.group.remove(m); m.dispose?.(); }
    this.meshes = [];
    const lists = this.parts.map(() => []);
    for (let y = 0; y < MAXH; y++) for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + z) * SIZE + x;
      const p = w.props[i];
      if (p) lists[p - 1].push([x, y, z, w.rot[i]]);
    }
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const pools = [];
    lists.forEach((list, t) => {
      if (!list.length) return;
      const id = PROP_TYPES[t].id;
      const matrices = list.map(([x, y, z, r]) => {
        const hsh = ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0;
        const organic = ORGANIC.has(id);
        const sc = organic ? 0.8 + (hsh % 100) / 250 : 1;
        const ang = organic ? (hsh % 628) / 100 : r * Math.PI / 2;
        q.setFromAxisAngle(up, ang);
        s.set(sc, sc * (organic ? 0.9 + (hsh % 37) / 120 : 1), sc);
        pos.set(x + 0.5, y, z + 0.5);
        if (id === 'lamp') {
          const off = new THREE.Vector3(-0.15, 0, -0.3).applyQuaternion(q);
          pools.push([x + 0.5 + off.x, y + 0.012, z + 0.5 + off.z]);
        }
        return { m: new THREE.Matrix4().compose(pos, q, s), hsh };
      });
      for (const part of this.parts[t]) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, matrices.length);
        matrices.forEach((e, k) => {
          im.setMatrixAt(k, e.m);
          if (part.tint) im.setColorAt(k, col.set(part.tint[e.hsh % part.tint.length]));
        });
        im.castShadow = !part.noShadow; im.receiveShadow = true;
        this.group.add(im); this.meshes.push(im);
      }
    });
    if (pools.length) {
      const geo = new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2);
      const im = new THREE.InstancedMesh(geo, this.poolMat, pools.length);
      pools.forEach(([x, y, z], k) => im.setMatrixAt(k, mtx.makeTranslation(x, y, z)));
      im.renderOrder = 2;
      this.group.add(im); this.meshes.push(im);
    }
  }
}
