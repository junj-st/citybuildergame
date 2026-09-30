// First-person street-level walking with simple voxel collision.
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { SIZE } from './world.js';

const EYE = 0.19, RADIUS = 0.07;

export class Walker {
  constructor(camera, dom, world) {
    this.camera = camera; this.world = world;
    this.controls = new PointerLockControls(camera, dom);
    this.active = false;
    this.keys = {};
    this.bob = 0;
    this.onExit = null;
    this.controls.addEventListener('unlock', () => { if (this.active) this.exit(); });
    window.addEventListener('keydown', e => { this.keys[e.code] = true; });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
  }

  blocked(x, z) {
    if (x < 0.05 || z < 0.05 || x > SIZE - 0.05 || z > SIZE - 0.05) return true;
    const w = this.world;
    for (const [dx, dz] of [[-RADIUS, -RADIUS], [RADIUS, -RADIUS], [RADIUS, RADIUS], [-RADIUS, RADIUS]]) {
      const cx = Math.floor(x + dx), cz = Math.floor(z + dz);
      if (w.block(cx, 0, cz)) return true;
    }
    return false;
  }

  enter(target, fromCamera) {
    this.saved = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), near: this.camera.near, fov: this.camera.fov };
    // Find a free spot near the orbit target.
    let sx = Math.min(SIZE - 1, Math.max(1, target.x)), sz = Math.min(SIZE - 1, Math.max(1, target.z));
    if (this.blocked(sx, sz)) {
      outer: for (let r = 1; r < SIZE; r++) for (let a = 0; a < 16; a++) {
        const x = sx + Math.cos(a / 16 * Math.PI * 2) * r, z = sz + Math.sin(a / 16 * Math.PI * 2) * r;
        if (!this.blocked(x, z)) { sx = x; sz = z; break outer; }
      }
    }
    const dir = target.clone().sub(fromCamera); dir.y = 0; dir.normalize();
    this.camera.position.set(sx, EYE, sz);
    this.camera.lookAt(sx + dir.x, EYE + 0.02, sz + dir.z);
    this.camera.near = 0.01; this.camera.fov = 70; this.camera.updateProjectionMatrix();
    this.active = true;
    this.controls.lock();
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    if (this.controls.isLocked) this.controls.unlock();
    const s = this.saved;
    this.camera.position.copy(s.pos); this.camera.quaternion.copy(s.quat);
    this.camera.near = s.near; this.camera.fov = s.fov; this.camera.updateProjectionMatrix();
    this.onExit?.();
  }

  update(dt) {
    if (!this.active) return;
    const k = this.keys;
    const run = k.ShiftLeft || k.ShiftRight;
    const speed = (run ? 1.6 : 0.65) * dt;
    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const side = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const f = new THREE.Vector3(); this.camera.getWorldDirection(f); f.y = 0; f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const mv = f.multiplyScalar(fwd).add(r.multiplyScalar(side));
    if (mv.lengthSq() > 0) {
      mv.normalize().multiplyScalar(speed);
      const p = this.camera.position;
      if (!this.blocked(p.x + mv.x, p.z)) p.x += mv.x;
      if (!this.blocked(p.x, p.z + mv.z)) p.z += mv.z;
      this.bob += dt * (run ? 14 : 9);
    }
    this.camera.position.y = EYE + Math.sin(this.bob) * 0.004;
  }
}
