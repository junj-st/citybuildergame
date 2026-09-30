import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { World, SIZE } from './world.js';
import { BlockRenderer } from './blocks.js';
import { PropRenderer, PROP_TYPES } from './props.js';
import { Ground } from './ground.js';
import { Traffic } from './traffic.js';
import { Environment } from './env.js';
import { Post } from './post.js';
import { Tools, TOOL_LIST } from './tools.js';
import { Walker } from './walk.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { generateCity } from './citygen.js';
import { STYLES } from './textures.js';

const SAVE_KEY = 'citybuildergame-city-v1';
const LEGACY_SAVE_KEY = 'tinyopolis-city-v1';
const SETTINGS_KEY = 'citybuildergame-settings-v1';
const LEGACY_SETTINGS_KEY = 'tinyopolis-settings-v1';

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 5000);
camera.position.set(SIZE / 2 + 52, 44, SIZE / 2 + 62);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(SIZE / 2, 4, SIZE / 2 - 2);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 2;
controls.maxDistance = 220;
controls.screenSpacePanning = false;
controls.zoomToCursor = true;
controls.update();

// ---------- systems ----------
const world = new World();
const env = new Environment(renderer, scene);
const blocks = new BlockRenderer(scene, renderer, world);
const props = new PropRenderer(scene, world);
const ground = new Ground(scene, renderer, world);
const traffic = new Traffic(scene, world);
const post = new Post(renderer, scene, camera);
const audio = new Audio();
const tools = new Tools({ world, camera, dom: renderer.domElement, scene, props, audio });
const walker = new Walker(camera, renderer.domElement, world);

const app = { world, env, blocks, props, ground, traffic, post, audio, tools, walker, cycle: false };

env.listeners.push(e => {
  blocks.setNight(e.night); props.setNight(e.night); traffic.setNight(e.night);
  blocks.setWet(e.wet); ground.setWet(e.wet);
});

// ---------- load ----------
let loaded = false;
try {
  const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(LEGACY_SAVE_KEY);
  if (raw) { world.load(JSON.parse(raw)); loaded = true; }
} catch (err) { console.warn('Could not load saved city', err); }
if (!loaded) generateCity(world, 1337);

let settings = null;
try { settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem(LEGACY_SETTINGS_KEY) ?? 'null'); } catch { settings = null; }
if (settings) {
  if (settings.env) env.set(settings.env);
  if (settings.post) post.apply(settings.post);
  if (settings.grid === false) ground.grid.visible = false;
  if (settings.traffic === false) traffic.enabled = false;
  if (settings.sound === false) audio.setMuted(true);
}
env.apply();

const ui = new UI(app);
ui.syncSettings(settings);

// ---------- app actions ----------
let saveTimer = 0, statsTimer = 0;
world.onChange = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveLocal, 800);
  clearTimeout(statsTimer);
  statsTimer = setTimeout(() => ui.setStats(world.countBlocks()), 150);
  ui?.refresh();
};
function saveLocal() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(world.toJSON())); }
  catch (err) { console.warn('Autosave failed', err); }
}
ui.setStats(world.countBlocks());

app.saveSettings = () => {
  const s = {
    env: { ...env.state }, post: { ...post.settings },
    grid: ground.grid.visible, traffic: traffic.enabled, sound: !audio.muted,
  };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
};
app.undo = () => { if (world.undo()) { audio.remove(); ui.toast('Undo'); } };
app.redo = () => { if (world.redo()) { audio.place(1); ui.toast('Redo'); } };
app.newCity = (gen) => {
  if (!confirmReset()) return;
  tools.clearSelection();
  if (gen) generateCity(world, (Math.random() * 1e9) | 0); else world.clear();
  saveLocal();
  ui.toast(gen ? 'Generated a new city' : 'Fresh empty lot');
};
function confirmReset() {
  // Avoid modal dialogs: require a second click within 3 seconds.
  const now = performance.now();
  if (app._resetArm && now - app._resetArm < 3000) { app._resetArm = 0; return true; }
  app._resetArm = now;
  ui.toast('Click again to replace the current city');
  return false;
}
app.saveFile = () => {
  const blob = new Blob([JSON.stringify(world.toJSON())], { type: 'application/json' });
  download(URL.createObjectURL(blob), `citybuildergame-${stamp()}.json`);
  ui.toast('City saved');
};
app.loadFile = async (file) => {
  try {
    world.load(JSON.parse(await file.text()));
    tools.clearSelection(); saveLocal(); ui.toast('City loaded');
  } catch (err) { ui.toast('Could not load: ' + err.message); }
};
let wantShot = false;
app.screenshot = () => { wantShot = true; };
app.toggleWalk = () => {
  if (walker.active) { walker.exit(); return; }
  tools.cancelDrag(); tools.clearSelection();
  controls.enabled = false; tools.enabled = false;
  post.walking = true; post.apply();
  document.getElementById('walkhint').classList.remove('hidden'); document.body.classList.add('walking');
  walker.enter(controls.target.clone(), camera.position.clone());
};
walker.onExit = () => {
  controls.enabled = true; tools.enabled = true;
  post.walking = false; post.apply();
  document.getElementById('walkhint').classList.add('hidden'); document.body.classList.remove('walking');
};
let timeAnim = null;
app.animateTime = (to) => {
  let from = env.state.time;
  if (to - from > 12) from += 24; else if (from - to > 12) from -= 24;
  timeAnim = { from, to, t: 0 };
};

function download(url, name) {
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function stamp() { return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); }

// ---------- keyboard ----------
const keys = {};
const typing = e => ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox';
window.addEventListener('keydown', e => {
  if (typing(e)) return;
  keys[e.code] = true;
  if (walker.active) { if (e.code === 'KeyV') walker.exit(); return; }
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); return; }
  if (mod && e.code === 'KeyY') { e.preventDefault(); app.redo(); return; }
  if (mod) return;
  if (e.code === 'Space') {
    e.preventDefault();
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE; tools.orbitOverride = true;
    return;
  }
  const tool = TOOL_LIST.find(t => t.key === e.key.toUpperCase());
  if (tool) { tools.setTool(tool.id); return; }
  if (/^Digit[0-9]$/.test(e.code)) {
    const n = (+e.code.slice(5) + 9) % 10; // 1..9 -> 0..8, 0 -> 9
    if ((tools.tool === 'build' || tools.tool === 'paint') && n < STYLES.length) { tools.style = n; tools.emit(); }
    else if (tools.tool === 'prop' && n < PROP_TYPES.length) tools.setPropType(n);
    else if (tools.tool === 'ground' && n < 5) { tools.groundType = n; tools.emit(); }
    return;
  }
  switch (e.code) {
    case 'KeyE': if (tools.sel) tools.extrude(1); break;
    case 'KeyQ': if (tools.sel) tools.extrude(-1); break;
    case 'Escape': tools.cancelDrag(); tools.clearSelection(); break;
    case 'KeyR': tools.rotateProp(); break;
    case 'KeyH': document.body.classList.toggle('hide-ui'); break;
    case 'KeyV': app.toggleWalk(); break;
    case 'KeyK': app.screenshot(); break;
    case 'KeyF': if (tools.sel) focusSelection(); break;
  }
});
window.addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Space') { controls.mouseButtons.LEFT = null; tools.orbitOverride = false; }
});
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; controls.mouseButtons.LEFT = null; tools.orbitOverride = false; });

function focusSelection() {
  const c = tools.handle.position.clone();
  const off = camera.position.clone().sub(controls.target);
  controls.target.copy(c); camera.position.copy(c).add(off);
}

// ---------- resize ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  post.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

// ---------- loop ----------
const timer = new THREE.Timer(); timer.connect(document);
let trafficDirty = true;
function frame() {
  requestAnimationFrame(frame);
  timer.update(); const dt = Math.min(0.1, timer.getDelta());

  if (world.dirtyBlocks) { world.dirtyBlocks = false; blocks.rebuild(); trafficDirty = true; }
  if (world.dirtyProps) { world.dirtyProps = false; props.rebuild(); }
  if (world.groundAll || world.dirtyGround.size) { ground.refresh(); trafficDirty = true; }
  if (trafficDirty) { trafficDirty = false; traffic.refresh(); }

  if (timeAnim) {
    timeAnim.t = Math.min(1, timeAnim.t + dt / 1.6);
    const k = timeAnim.t * timeAnim.t * (3 - 2 * timeAnim.t);
    const t = ((timeAnim.from + (timeAnim.to - timeAnim.from) * k) % 24 + 24) % 24;
    env.set({ time: t }); ui.setTimeDisplay(t);
    if (timeAnim.t >= 1) { timeAnim = null; app.saveSettings(); }
  } else if (app.cycle) {
    const t = (env.state.time + dt * 0.2) % 24;
    env.set({ time: t }); ui.setTimeDisplay(t);
  }

  if (!walker.active) {
    // Keyboard panning relative to the view.
    const mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    const mz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    if (mx || mz) {
      const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
      const r = new THREE.Vector3(-f.z, 0, f.x);
      const sp = camera.position.distanceTo(controls.target) * 0.9 * dt;
      const mv = f.multiplyScalar(mz * sp).add(r.multiplyScalar(mx * sp));
      controls.target.add(mv); camera.position.add(mv);
    }
    controls.update();
    const t = controls.target;
    const cx = Math.min(SIZE + 10, Math.max(-10, t.x)) - t.x, cz = Math.min(SIZE + 10, Math.max(-10, t.z)) - t.z;
    const cy = Math.min(60, Math.max(0, t.y)) - t.y;
    if (cx || cy || cz) { t.x += cx; t.y += cy; t.z += cz; camera.position.x += cx; camera.position.y += cy; camera.position.z += cz; }
  }
  walker.update(dt);
  tools.update();
  props.update(dt);
  traffic.update(dt);
  env.update(dt, walker.active ? camera.position : controls.target);
  env.followCamera(camera);

  const focus = walker.active ? 3 : camera.position.distanceTo(controls.target);
  post.render(dt, camera, focus, env.night);

  if (wantShot) {
    wantShot = false;
    renderer.domElement.toBlob(b => { if (b) { download(URL.createObjectURL(b), `citybuildergame-${stamp()}.png`); ui.toast('Screenshot saved'); } });
  }
}
frame();

window.addEventListener('beforeunload', saveLocal);
window.__app = app; // handy for debugging in the console
