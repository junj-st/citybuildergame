// The city lot: a painted tile surface on top of a diorama slab, plus the far terrain.
import * as THREE from 'three';
import { SIZE } from './world.js';
import { drawGroundTile, makeGroundCanvases } from './textures.js';

export class Ground {
  constructor(scene, renderer, world) {
    this.world = world;
    [this.canvas, this.rcanvas] = makeGroundCanvases(SIZE);
    this.ctx = this.canvas.getContext('2d');
    this.rctx = this.rcanvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    this.rtex = new THREE.CanvasTexture(this.rcanvas);
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, roughnessMap: this.rtex, roughness: 1, metalness: 0 });
    const plane = new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2).translate(SIZE / 2, 0, SIZE / 2);
    this.mesh = new THREE.Mesh(plane, this.mat);
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    // Diorama slab with a thin rim.
    const slabMat = new THREE.MeshStandardMaterial({ color: '#3a3936', roughness: 0.9 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(SIZE + 1.2, 1.6, SIZE + 1.2), slabMat);
    slab.position.set(SIZE / 2, -0.805, SIZE / 2);
    slab.receiveShadow = true; slab.castShadow = true;
    scene.add(slab);
    const rimMat = new THREE.MeshStandardMaterial({ color: '#6b6a66', roughness: 0.7 });
    const rimGeo = [
      [SIZE + 1.2, 0.12, 0.6, SIZE / 2, -SIZE * 0 - 0.3], [SIZE + 1.2, 0.12, 0.6, SIZE / 2, SIZE + 0.3],
      [0.6, 0.12, SIZE, -0.3, SIZE / 2], [0.6, 0.12, SIZE, SIZE + 0.3, SIZE / 2],
    ];
    for (const [w, h, d, x, z] of rimGeo) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rimMat);
      m.position.set(x, 0.0, z); m.receiveShadow = true; m.castShadow = true;
      scene.add(m);
    }

    // Far terrain fading into fog.
    const far = new THREE.Mesh(new THREE.CircleGeometry(900, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#58624f', roughness: 1 }));
    far.position.set(SIZE / 2, -1.6, SIZE / 2);
    far.receiveShadow = true;
    scene.add(far);
    this.far = far;

    // Build grid overlay.
    const pts = [];
    for (let i = 0; i <= SIZE; i++) { pts.push(i, 0, 0, i, 0, SIZE, 0, 0, i, SIZE, 0, i); }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.09, depthWrite: false }));
    this.grid.position.y = 0.004;
    this.grid.renderOrder = 1;
    scene.add(this.grid);
  }

  setWet(k) { this.mat.roughness = 1 - k * 0.55; }

  refresh() {
    const w = this.world;
    if (w.groundAll) {
      for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) drawGroundTile(this.ctx, this.rctx, w, x, z);
      w.groundAll = false;
    } else {
      const done = new Set();
      for (const i of w.dirtyGround) {
        const x = i % SIZE, z = (i / SIZE) | 0;
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz, k = nz * SIZE + nx;
          if (!w.insideXZ(nx, nz) || done.has(k)) continue;
          done.add(k); drawGroundTile(this.ctx, this.rctx, w, nx, nz);
        }
      }
    }
    w.dirtyGround.clear();
    this.tex.needsUpdate = true;
    this.rtex.needsUpdate = true;
  }
}
