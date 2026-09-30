// Little cars that wander the road network.
import * as THREE from 'three';
import { SIZE, G_ROAD } from './world.js';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // +x, +z, -x, -z
const LANE = 0.2;
const COLORS = ['#d8d8d4', '#1e2227', '#b3261e', '#2f5f9e', '#e0b43a', '#6e7478', '#3f7a52', '#f2f0ea', '#8a2f55'];
const MAX_CARS = 140;

export class Traffic {
  constructor(scene, world) {
    this.world = world;
    this.enabled = true;
    this.cars = [];
    const body = new THREE.BoxGeometry(0.34, 0.07, 0.15).translate(0, 0.055, 0);
    const cabin = new THREE.BoxGeometry(0.17, 0.065, 0.13).translate(-0.02, 0.12, 0);
    const lights = new THREE.BoxGeometry(0.01, 0.02, 0.12).translate(0.172, 0.06, 0);
    const tail = new THREE.BoxGeometry(0.01, 0.02, 0.12).translate(-0.172, 0.06, 0);
    this.headMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff4d6', emissiveIntensity: 0.2 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: '#700', emissive: '#ff2010', emissiveIntensity: 0.2 });
    this.bodyMesh = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.3 }), MAX_CARS);
    this.cabinMesh = new THREE.InstancedMesh(cabin, new THREE.MeshStandardMaterial({ color: '#27313a', roughness: 0.2, metalness: 0.5 }), MAX_CARS);
    this.headMesh = new THREE.InstancedMesh(lights, this.headMat, MAX_CARS);
    this.tailMesh = new THREE.InstancedMesh(tail, this.tailMat, MAX_CARS);
    const c = new THREE.Color();
    for (let i = 0; i < MAX_CARS; i++) this.bodyMesh.setColorAt(i, c.set(COLORS[i % COLORS.length]));
    this.meshes = [this.bodyMesh, this.cabinMesh, this.headMesh, this.tailMesh];
    for (const m of this.meshes) { m.count = 0; m.castShadow = m === this.bodyMesh; m.frustumCulled = false; scene.add(m); }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
  }

  isRoad(x, z) {
    const w = this.world;
    return w.groundAt(x, z) === G_ROAD && !w.blocks[w.idx(x, 0, z)];
  }

  setNight(k) { this.headMat.emissiveIntensity = 0.2 + k * 5; this.tailMat.emissiveIntensity = 0.2 + k * 3; }

  // Called when the ground or blocks change.
  refresh() {
    const roads = [];
    for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) if (this.isRoad(x, z)) roads.push([x, z]);
    this.roads = roads;
    const target = Math.min(MAX_CARS, Math.floor(roads.length / 6));
    this.cars = this.cars.filter(c => this.isRoad(c.x, c.z));
    while (this.cars.length > target) this.cars.pop();
    while (this.cars.length < target) {
      const [x, z] = roads[Math.floor(Math.random() * roads.length)];
      const car = { x, z, din: Math.floor(Math.random() * 4), t: Math.random(), speed: 0.9 + Math.random() * 0.6 };
      car.dout = this._pickExit(car);
      this.cars.push(car);
    }
  }

  _pickExit(car) {
    const opts = [];
    for (let d = 0; d < 4; d++) {
      if (d === (car.din + 2) % 4) continue;
      if (this.isRoad(car.x + DIRS[d][0], car.z + DIRS[d][1])) opts.push(d);
    }
    if (!opts.length) return (car.din + 2) % 4;
    // Prefer going straight a bit more often.
    if (opts.includes(car.din) && Math.random() < 0.5) return car.din;
    return opts[Math.floor(Math.random() * opts.length)];
  }

  update(dt) {
    const show = this.enabled && this.cars.length;
    for (const m of this.meshes) m.visible = !!show;
    if (!show) return;
    let n = 0;
    for (const car of this.cars) {
      if (!this.isRoad(car.x, car.z)) continue;
      car.t += dt * car.speed * 0.9;
      while (car.t >= 1) {
        car.t -= 1;
        const nx = car.x + DIRS[car.dout][0], nz = car.z + DIRS[car.dout][1];
        if (this.isRoad(nx, nz)) { car.x = nx; car.z = nz; car.din = car.dout; }
        else car.din = (car.din + 2) % 4;
        car.dout = this._pickExit(car);
      }
      this._place(car, n++);
    }
    for (const m of this.meshes) { m.count = n; m.instanceMatrix.needsUpdate = true; }
  }

  _place(car, i) {
    // Quadratic bezier from entry edge to exit edge, offset to the right-hand lane.
    const cx = car.x + 0.5, cz = car.z + 0.5;
    const di = DIRS[car.din], dout = DIRS[car.dout];
    const offIn = [-di[1] * LANE, di[0] * LANE], offOut = [-dout[1] * LANE, dout[0] * LANE];
    const E = [cx - di[0] * 0.5 + offIn[0], cz - di[1] * 0.5 + offIn[1]];
    const X = [cx + dout[0] * 0.5 + offOut[0], cz + dout[1] * 0.5 + offOut[1]];
    let Cp;
    if (car.din === car.dout) Cp = [cx + offIn[0], cz + offIn[1]];
    else if ((car.din + 2) % 4 === car.dout) Cp = [cx + di[0] * 0.3, cz + di[1] * 0.3];
    else Cp = [cx + offIn[0] + offOut[0], cz + offIn[1] + offOut[1]];
    const t = car.t, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    const x = a * E[0] + b * Cp[0] + c * X[0], z = a * E[1] + b * Cp[1] + c * X[1];
    const tx = 2 * (1 - t) * (Cp[0] - E[0]) + 2 * t * (X[0] - Cp[0]);
    const tz = 2 * (1 - t) * (Cp[1] - E[1]) + 2 * t * (X[1] - Cp[1]);
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-tz, tx));
    this._p.set(x, 0, z);
    this._m.compose(this._p, this._q, this._s);
    for (const m of this.meshes) m.setMatrixAt(i, this._m);
  }
}
