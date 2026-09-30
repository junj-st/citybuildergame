// Mouse tools: select-and-extrude building, paint, props, ground painting and erasing.
import * as THREE from 'three';
import { SIZE, MAXH } from './world.js';

export const TOOL_LIST = [
  { id: 'build', name: 'Build', key: 'B' },
  { id: 'paint', name: 'Paint', key: 'P' },
  { id: 'prop', name: 'Details', key: 'T' },
  { id: 'ground', name: 'Ground', key: 'G' },
  { id: 'erase', name: 'Erase', key: 'X' },
];

const ACCENT = new THREE.Color('#ff9a2e');
const ADD = new THREE.Color('#7ee08a');
const SUB = new THREE.Color('#ff5a4a');
const LIMITS = [[0, SIZE], [0, MAXH], [0, SIZE]];
const OTHER = [[1, 2], [0, 2], [0, 1]];

export class Tools {
  constructor({ world, camera, dom, scene, props, audio }) {
    Object.assign(this, { world, camera, dom, scene, propsRenderer: props, audio });
    this.tool = 'build';
    this.style = 0;
    this.propType = 0;
    this.propRot = 0;
    this.groundType = 1;
    this.sel = null;
    this.drag = null;
    this.enabled = true;
    this.listeners = [];
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.mousePx = new THREE.Vector2();
    this._buildVisuals();
    dom.addEventListener('pointerdown', e => this.onDown(e));
    window.addEventListener('pointermove', e => this.onMove(e));
    window.addEventListener('pointerup', e => this.onUp(e));
  }

  emit() { for (const fn of this.listeners) fn(this); }

  setTool(t) {
    this.tool = t;
    this.cancelDrag();
    if (t !== 'build') this.clearSelection();
    this._updateGhost();
    this.emit();
  }

  // ---------- visuals ----------
  _buildVisuals() {
    const g = new THREE.Group();
    this.scene.add(g);
    this.vis = g;
    const lineMat = c => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.95, depthTest: false });
    const fillMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 });

    this.selLine = new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3)), lineMat(ACCENT));
    this.selLine.renderOrder = 10;
    this.selFill = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3)).setIndex([0, 1, 2, 0, 2, 3]), fillMat(ACCENT, 0.22));
    this.hoverLine = new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3)), lineMat('#ffffff'));
    this.hoverLine.material.opacity = 0.7;
    this.hoverLine.renderOrder = 10;
    for (const o of [this.selLine, this.selFill, this.hoverLine]) { o.visible = false; o.frustumCulled = false; g.add(o); }

    const box = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);
    this.preview = new THREE.Mesh(box, fillMat(ADD, 0.28));
    this.previewEdges = new THREE.LineSegments(new THREE.EdgesGeometry(box), lineMat(ADD));
    this.previewEdges.renderOrder = 11;
    this.preview.visible = this.previewEdges.visible = false;
    g.add(this.preview, this.previewEdges);

    // Extrude handle: arrow pointing along the face normal.
    this.handle = new THREE.Group();
    const hm = new THREE.MeshBasicMaterial({ color: ACCENT, depthTest: false, transparent: true });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 10).translate(0, 0.55, 0), hm);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 16).translate(0, 1.3, 0), hm);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 24).rotateX(Math.PI / 2), hm);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.8, 8).translate(0, 0.8, 0),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    for (const m of [shaft, cone, ring]) m.renderOrder = 12;
    this.handle.add(shaft, cone, ring, hit);
    this.handleHit = hit;
    this.handle.visible = false;
    g.add(this.handle);

    this.ghost = null;
  }

  _setQuad(geo, pts) {
    const a = geo.attributes.position.array;
    pts.forEach((p, i) => { a[i * 3] = p.x; a[i * 3 + 1] = p.y; a[i * 3 + 2] = p.z; });
    geo.attributes.position.needsUpdate = true;
    geo.computeBoundingSphere();
  }

  _facePoints(axis, sign, layer, a0, a1, b0, b1, lift = 0.012) {
    const [oa, ob] = OTHER[axis];
    const mk = (a, b) => { const v = [0, 0, 0]; v[axis] = layer + sign * lift; v[oa] = a; v[ob] = b; return new THREE.Vector3(...v); };
    return [mk(a0, b0), mk(a1 + 1, b0), mk(a1 + 1, b1 + 1), mk(a0, b1 + 1)];
  }

  _refreshSelectionVisuals() {
    const s = this.sel;
    const show = !!s && this.tool === 'build';
    this.selLine.visible = this.selFill.visible = this.handle.visible = show;
    if (!show) return;
    const pts = this._facePoints(s.axis, s.sign, s.layer, s.a0, s.a1, s.b0, s.b1);
    this._setQuad(this.selLine.geometry, pts);
    this._setQuad(this.selFill.geometry, pts);
    const c = pts[0].clone().add(pts[2]).multiplyScalar(0.5);
    this.handle.position.copy(c);
    const n = new THREE.Vector3(); n.setComponent(s.axis, s.sign);
    this.handle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  }

  _showPreview(region, adding) {
    if (!region) { this.preview.visible = this.previewEdges.visible = false; return; }
    const [min, max] = region;
    const size = max.clone().sub(min);
    const inflate = 0.015;
    for (const o of [this.preview, this.previewEdges]) {
      o.visible = true;
      o.position.copy(min).subScalar(inflate);
      o.scale.copy(size).addScalar(inflate * 2);
    }
    this.preview.material.color.copy(adding ? ADD : SUB);
    this.previewEdges.material.color.copy(adding ? ADD : SUB);
  }

  update() {
    // Keep the handle a constant size on screen.
    if (this.handle.visible) {
      const d = this.camera.position.distanceTo(this.handle.position);
      this.handle.scale.setScalar(Math.max(0.35, d * 0.028));
    }
  }

  // ---------- ray helpers ----------
  _setMouse(e) {
    const r = this.dom.getBoundingClientRect();
    this.mousePx.set(e.clientX - r.left, e.clientY - r.top);
    this.mouse.set((this.mousePx.x / r.width) * 2 - 1, -(this.mousePx.y / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.mouse, this.camera);
  }

  // Amanatides-Woo voxel traversal. Ground is a solid layer at y = -1.
  raycastVoxel(withProps = false) {
    const o = this.raycaster.ray.origin.toArray(), d = this.raycaster.ray.direction.toArray();
    const min = [0, -1, 0], max = [SIZE, MAXH, SIZE];
    let t0 = 0, t1 = Infinity, enter = -1;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < min[a] || o[a] > max[a]) return null; continue; }
      let ta = (min[a] - o[a]) / d[a], tb = (max[a] - o[a]) / d[a];
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) { t0 = ta; enter = a; }
      if (tb < t1) t1 = tb;
      if (t0 > t1) return null;
    }
    const cell = [0, 0, 0];
    for (let a = 0; a < 3; a++) cell[a] = Math.min(max[a] - 1, Math.max(min[a], Math.floor(o[a] + d[a] * (t0 + 1e-6))));
    let axis = enter, sign = enter >= 0 ? -Math.sign(d[enter]) : 0;
    const step = [0, 0, 0], tMax = [0, 0, 0], tDelta = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      step[a] = d[a] > 0 ? 1 : -1;
      if (Math.abs(d[a]) < 1e-9) { tMax[a] = Infinity; tDelta[a] = Infinity; continue; }
      const bound = d[a] > 0 ? cell[a] + 1 : cell[a];
      tMax[a] = (bound - o[a]) / d[a];
      tDelta[a] = Math.abs(1 / d[a]);
    }
    const w = this.world;
    for (let i = 0; i < 800; i++) {
      const [x, y, z] = cell;
      const solid = y === -1 || w.blocks[w.idx(x, y, z)];
      const prop = withProps && y >= 0 && w.props[w.idx(x, y, z)];
      if (solid || prop) {
        if (axis < 0) { // started inside a solid cell
          axis = 1; sign = 1;
        }
        return { x, y, z, axis, sign, layer: sign > 0 ? cell[axis] + 1 : cell[axis], prop: !solid && !!prop, ground: y === -1 };
      }
      let a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      if (tMax[a] > t1) return null;
      cell[a] += step[a];
      axis = a; sign = -step[a];
      tMax[a] += tDelta[a];
      if (cell[a] < min[a] || cell[a] >= max[a]) return null;
    }
    return null;
  }

  _planeCell(axis, layer) {
    const o = this.raycaster.ray.origin, d = this.raycaster.ray.direction;
    const dv = d.getComponent(axis);
    if (Math.abs(dv) < 1e-6) return null;
    const t = (layer - o.getComponent(axis)) / dv;
    if (t <= 0) return null;
    const p = o.clone().addScaledVector(d, t);
    const [oa, ob] = OTHER[axis];
    const cl = (v, a) => Math.min(LIMITS[a][1] - 1, Math.max(LIMITS[a][0], Math.floor(v)));
    return [cl(p.getComponent(oa), oa), cl(p.getComponent(ob), ob)];
  }

  _cellOnFace(hit) {
    const [oa, ob] = OTHER[hit.axis];
    const c = [hit.x, hit.y, hit.z];
    return [c[oa], c[ob]];
  }

  // ---------- selection / extrusion ----------
  clearSelection() { this.sel = null; this._refreshSelectionVisuals(); this.emit(); }

  _hRange(s) {
    const [lo, hi] = LIMITS[s.axis];
    return s.sign > 0 ? [lo - s.layer, hi - s.layer] : [s.layer - hi, s.layer - lo];
  }

  _region(s, h) {
    const [oa, ob] = OTHER[s.axis];
    const min = new THREE.Vector3(), max = new THREE.Vector3();
    const l2 = s.layer + s.sign * h;
    min.setComponent(s.axis, Math.min(s.layer, l2)); max.setComponent(s.axis, Math.max(s.layer, l2));
    min.setComponent(oa, s.a0); max.setComponent(oa, s.a1 + 1);
    min.setComponent(ob, s.b0); max.setComponent(ob, s.b1 + 1);
    return [min, max];
  }

  extrude(h) {
    const s = this.sel;
    if (!s || !h) return 0;
    const [hmin, hmax] = this._hRange(s);
    h = Math.max(hmin, Math.min(hmax, h));
    if (!h) return 0;
    const [oa, ob] = OTHER[s.axis];
    const w = this.world;
    w.begin();
    const n = Math.abs(h);
    for (let k = 0; k < n; k++) {
      const layerCell = h > 0 ? (s.sign > 0 ? s.layer + k : s.layer - 1 - k) : (s.sign > 0 ? s.layer - 1 - k : s.layer + k);
      for (let a = s.a0; a <= s.a1; a++) for (let b = s.b0; b <= s.b1; b++) {
        const c = [0, 0, 0]; c[s.axis] = layerCell; c[oa] = a; c[ob] = b;
        if (h > 0) { if (!w.block(c[0], c[1], c[2])) w.setBlock(c[0], c[1], c[2], this.style + 1); }
        else if (c[1] >= 0) w.setBlock(c[0], c[1], c[2], 0);
      }
    }
    const changed = w.commit();
    s.layer += s.sign * h;
    this._refreshSelectionVisuals();
    if (changed) (h > 0 ? this.audio?.place(n) : this.audio?.remove(n));
    this.emit();
    return h;
  }

  // Screen-space pixels per world unit along the selection normal.
  _axisScreen() {
    const s = this.sel;
    const p0 = this.handle.position.clone();
    const p1 = p0.clone(); p1.setComponent(s.axis, p1.getComponent(s.axis) + s.sign);
    const r = this.dom.getBoundingClientRect();
    const toPx = p => { p.project(this.camera); return new THREE.Vector2((p.x + 1) / 2 * r.width, (1 - p.y) / 2 * r.height); };
    const a = toPx(p0), b = toPx(p1);
    const v = b.sub(a);
    if (v.length() < 12) v.set(0, -28);
    return v;
  }

  // ---------- events ----------
  onDown(e) {
    if (!this.enabled || e.button !== 0 || this.orbitOverride) return;
    this._setMouse(e);
    this.audio?.unlock();
    const w = this.world;
    this.downPx = this.mousePx.clone();

    if (this.tool === 'build') {
      if (this.sel && this.raycaster.intersectObject(this.handle, true).length) { this._startExtrude(); return; }
      const hit = this.raycastVoxel(false);
      if (!hit) { this.clearSelection(); return; }
      const [ca, cb] = this._cellOnFace(hit);
      const s = this.sel;
      if (s && s.axis === hit.axis && s.sign === hit.sign && s.layer === hit.layer && ca >= s.a0 && ca <= s.a1 && cb >= s.b0 && cb <= s.b1) {
        this._startExtrude(true, [ca, cb]);
        return;
      }
      this.sel = { axis: hit.axis, sign: hit.sign, layer: hit.layer, a0: ca, a1: ca, b0: cb, b1: cb };
      this.drag = { mode: 'select', anchor: [ca, cb] };
      this.audio?.tick(0);
      this._refreshSelectionVisuals();
      this.emit();
    } else if (this.tool === 'paint') {
      w.begin();
      this.drag = { mode: 'paint' };
      this._paintAt(e.shiftKey);
    } else if (this.tool === 'erase') {
      w.begin();
      this.drag = { mode: 'erase', last: null, lastPx: this.mousePx.clone() };
      this._eraseAt();
    } else if (this.tool === 'prop') {
      w.begin();
      this.drag = { mode: 'prop', last: null };
      this._placeProp();
    } else if (this.tool === 'ground') {
      const c = this._planeCell(1, 0);
      if (!c) return;
      this.drag = { mode: 'ground', anchor: c, cur: c };
      this._groundPreview();
    }
  }

  _startExtrude(fromFace = false, cell = null) {
    this.drag = { mode: 'extrude', start: this.mousePx.clone(), h: 0, axisPx: this._axisScreen(), fromFace, cell };
    this.hoverLine.visible = false;
  }

  onMove(e) {
    if (!this.enabled) return;
    if (e.target !== this.dom && !this.drag) { this.hoverLine.visible = false; if (this.ghost) this.ghost.visible = false; return; }
    this._setMouse(e);
    const d = this.drag;
    if (!d) { this._hover(); return; }
    if (d.mode === 'select') {
      const s = this.sel;
      const c = this._planeCell(s.axis, s.layer);
      if (!c) return;
      const a0 = Math.min(d.anchor[0], c[0]), a1 = Math.max(d.anchor[0], c[0]);
      const b0 = Math.min(d.anchor[1], c[1]), b1 = Math.max(d.anchor[1], c[1]);
      if (a0 !== s.a0 || a1 !== s.a1 || b0 !== s.b0 || b1 !== s.b1) {
        Object.assign(s, { a0, a1, b0, b1 });
        this.audio?.tick((a1 - a0 + 1) * (b1 - b0 + 1));
        this._refreshSelectionVisuals();
        this.emit();
      }
    } else if (d.mode === 'extrude') {
      const delta = this.mousePx.clone().sub(d.start);
      const v = d.axisPx;
      let h = Math.round(delta.dot(v) / v.lengthSq());
      const [hmin, hmax] = this._hRange(this.sel);
      h = Math.max(hmin, Math.min(hmax, h));
      if (h !== d.h) { d.h = h; this.audio?.tick(Math.abs(h) * 3, h < 0); this.emit(); }
      this._showPreview(h ? this._region(this.sel, h) : null, h > 0);
    } else if (d.mode === 'paint') this._paintAt(e.shiftKey);
    else if (d.mode === 'erase') {
      if (this.mousePx.distanceTo(d.lastPx) > 8) { d.lastPx.copy(this.mousePx); this._eraseAt(); }
    } else if (d.mode === 'prop') { this._hover(); this._placeProp(); }
    else if (d.mode === 'ground') {
      const c = this._planeCell(1, 0);
      if (c) { d.cur = c; this._groundPreview(); }
    }
  }

  onUp(e) {
    const d = this.drag;
    if (!d || e.button !== 0) return;
    this.drag = null;
    const w = this.world;
    if (d.mode === 'extrude') {
      this._showPreview(null);
      if (d.h) this.extrude(d.h);
      else if (d.fromFace && this.mousePx.distanceTo(this.downPx) < 4) {
        // Plain click inside the selection: reselect that single cell.
        const s = this.sel;
        Object.assign(s, { a0: d.cell[0], a1: d.cell[0], b0: d.cell[1], b1: d.cell[1] });
        this._refreshSelectionVisuals();
      }
      this.emit();
    } else if (d.mode === 'paint' || d.mode === 'erase' || d.mode === 'prop') {
      w.commit();
    } else if (d.mode === 'ground') {
      this._showPreview(null);
      const [x0, x1] = [Math.min(d.anchor[0], d.cur[0]), Math.max(d.anchor[0], d.cur[0])];
      const [z0, z1] = [Math.min(d.anchor[1], d.cur[1]), Math.max(d.anchor[1], d.cur[1])];
      w.begin();
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) w.setGround(x, z, this.groundType);
      if (w.commit()) this.audio?.place(1);
    }
    this._hover();
  }

  cancelDrag() {
    if (this.drag && ['paint', 'erase', 'prop'].includes(this.drag.mode)) this.world.commit();
    this.drag = null;
    this._showPreview(null);
  }

  _hover() {
    this.hoverLine.visible = false;
    if (this.ghost) this.ghost.visible = false;
    if (this.tool === 'build' || this.tool === 'paint' || this.tool === 'erase') {
      const hit = this.raycastVoxel(this.tool === 'erase');
      if (!hit || (this.tool !== 'build' && hit.ground)) return;
      if (this.tool === 'build' && this.sel && this.raycaster.intersectObject(this.handle, true).length) { this.dom.style.cursor = 'ns-resize'; return; }
      this.dom.style.cursor = '';
      const [ca, cb] = this._cellOnFace(hit);
      this._setQuad(this.hoverLine.geometry, this._facePoints(hit.axis, hit.sign, hit.layer, ca, ca, cb, cb, 0.02));
      this.hoverLine.material.color.set(this.tool === 'erase' ? '#ff6a5a' : '#ffffff');
      this.hoverLine.visible = true;
    } else if (this.tool === 'prop') {
      const t = this._propTarget();
      if (!t || !this.ghost) return;
      this.ghost.visible = true;
      this.ghost.position.set(t[0] + 0.5, t[1], t[2] + 0.5);
      this.ghost.rotation.y = this.propRot * Math.PI / 2;
    }
  }

  _propTarget() {
    const hit = this.raycastVoxel(true);
    if (!hit || hit.prop || hit.axis !== 1 || hit.sign !== 1) return null;
    const x = hit.x, y = hit.y + 1, z = hit.z;
    const w = this.world;
    if (!w.inside(x, y, z) || w.blocks[w.idx(x, y, z)] || w.props[w.idx(x, y, z)]) return null;
    return [x, y, z];
  }

  _placeProp() {
    const t = this._propTarget();
    if (!t) return;
    const key = t.join(',');
    if (this.drag && this.drag.last === key) return;
    if (this.drag) this.drag.last = key;
    if (this.world.setProp(t[0], t[1], t[2], this.propType + 1, this.propRot)) this.audio?.place(1);
  }

  _paintAt(flood) {
    const hit = this.raycastVoxel(false);
    if (!hit || hit.ground) return;
    const w = this.world, target = this.style + 1;
    const from = w.blocks[w.idx(hit.x, hit.y, hit.z)];
    if (from === target) return;
    if (!flood) { w.setBlock(hit.x, hit.y, hit.z, target); this.audio?.tick(2); return; }
    const stack = [[hit.x, hit.y, hit.z]];
    let n = 0;
    while (stack.length && n < 60000) {
      const [x, y, z] = stack.pop();
      if (!w.inside(x, y, z) || w.blocks[w.idx(x, y, z)] !== from) continue;
      w.setBlock(x, y, z, target); n++;
      stack.push([x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z], [x, y, z + 1], [x, y, z - 1]);
    }
    this.audio?.place(n);
  }

  _eraseAt() {
    const hit = this.raycastVoxel(true);
    if (!hit || hit.ground) return;
    const w = this.world;
    if (hit.prop) w.setProp(hit.x, hit.y, hit.z, 0);
    else w.setBlock(hit.x, hit.y, hit.z, 0);
    this.audio?.remove(1);
  }

  _groundPreview() {
    const d = this.drag;
    const x0 = Math.min(d.anchor[0], d.cur[0]), x1 = Math.max(d.anchor[0], d.cur[0]);
    const z0 = Math.min(d.anchor[1], d.cur[1]), z1 = Math.max(d.anchor[1], d.cur[1]);
    this._showPreview([new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1 + 1, 0.06, z1 + 1)], true);
  }

  setPropType(i) { this.propType = i; this._updateGhost(); this.emit(); }
  rotateProp() { this.propRot = (this.propRot + 1) % 4; this._hover(); this.emit(); }

  _updateGhost() {
    if (this.ghost) { this.vis.remove(this.ghost); this.ghost = null; }
    if (this.tool !== 'prop') return;
    this.ghost = this.propsRenderer.makeGhost(this.propType);
    this.ghost.visible = false;
    this.vis.add(this.ghost);
  }

  // Selection size for the HUD.
  selectionInfo() {
    const s = this.sel;
    if (!s) return null;
    const w = s.a1 - s.a0 + 1, d = s.b1 - s.b0 + 1;
    return { w, d, h: this.drag?.mode === 'extrude' ? this.drag.h : 0, axis: s.axis };
  }
}
