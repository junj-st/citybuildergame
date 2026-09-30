// DOM HUD: toolbar, contextual palette, settings panel, hints and toasts.
import { TOOL_LIST } from './tools.js';
import { STYLES, ATLAS_COLS, ATLAS_ROWS } from './textures.js';
import { PROP_TYPES } from './props.js';
import { GROUND_TYPES } from './world.js';

const ICONS = {
  build: '<path d="M12 3l7.5 4.2v8.6L12 20l-7.5-4.2V7.2z"/><path d="M4.5 7.2L12 11.4l7.5-4.2M12 11.4V20"/>',
  paint: '<path d="M18.5 3.5a2.1 2.1 0 013 3L13 15l-4-4z"/><path d="M9 11c-3 0-5 2-5 5 0 1.5-.8 2.5-2 3 3 1.5 8 .8 9.5-2.5.6-1.3.4-2.7-.5-3.5"/>',
  prop: '<path d="M12 21v-6"/><path d="M12 15c-4 0-6.5-2.3-6.5-5.5S8.4 3 12 3s6.5 3.3 6.5 6.5S16 15 12 15z"/><path d="M9 21h6"/>',
  ground: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M3 12h18M12 3v18"/>',
  erase: '<path d="M20 20H9L3.5 14.5a2 2 0 010-2.8L12.7 2.5a2 2 0 012.8 0l5 5a2 2 0 010 2.8L11 20"/><path d="M7.5 10.5l6 6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>',
  walk: '<circle cx="13" cy="4" r="2"/><path d="M11 21l2-6 3 3v3M8 12l2-4 3.5 1 2.5 3M10 8l-1.5 7"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
const svg = p => `<svg viewBox="0 0 24 24">${p}</svg>`;

const PROP_EMOJI = {
  tree: '🌳', pine: '🌲', hedge: '🟩', lamp: '💡', antenna: '📡', tank: '🛢️', ac: '❄️', solar: '🔋',
  palm: '🌴', flowers: '🌷', bench: '🪑', fountain: '⛲', flag: '🚩', billboard: '🪧', busstop: '🚏',
};
const GROUND_COLORS = ['#6d8c4a', '#3e4045', '#bdb6a8', '#2d5a73', '#d6c498'];

const HINTS = {
  build: ['<kbd>Drag</kbd> on any surface to select an area', 'Pull the <b>orange arrow</b> or press <kbd>E</kbd>/<kbd>Q</kbd> to extrude or dig', '<kbd>1</kbd>–<kbd>9</kbd> pick a block style · <kbd>Esc</kbd> clears'],
  paint: ['<kbd>Click</kbd> or drag over blocks to repaint', '<kbd>Shift</kbd>+click repaints a whole building'],
  prop: ['<kbd>Click</kbd> a flat surface to place · drag to scatter', '<kbd>R</kbd> rotates · <kbd>1</kbd>–<kbd>9</kbd>, <kbd>0</kbd> pick a detail · more in the palette'],
  ground: ['<kbd>Drag</kbd> a rectangle to paint the ground', 'Roads connect automatically and get traffic'],
  erase: ['<kbd>Click</kbd> or drag to remove blocks and details'],
};
const CAMERA_HINT = '<kbd>Right-drag</kbd> rotate · <kbd>Shift</kbd>+right-drag pan · <kbd>Scroll</kbd> zoom · <kbd>WASD</kbd> move · <kbd>V</kbd> walk · <kbd>H</kbd> hide UI';

export class UI {
  constructor(app) {
    this.app = app;
    this.$ = id => document.getElementById(id);
    this._toolbar();
    this._panel();
    app.tools.listeners.push(() => this.refresh());
    this.refresh();
  }

  _toolbar() {
    const { tools, world } = this.app;
    const bar = this.$('toolbar');
    bar.classList.add('glass');
    this.toolButtons = {};
    for (const t of TOOL_LIST) {
      const b = document.createElement('button');
      b.innerHTML = svg(ICONS[t.id]) + `<span class="tip">${t.name}<kbd>${t.key}</kbd></span>`;
      b.onclick = () => { tools.setTool(t.id); this.app.audio.click(); };
      bar.appendChild(b); this.toolButtons[t.id] = b;
    }
    bar.appendChild(Object.assign(document.createElement('div'), { className: 'sep' }));
    const mk = (icon, tip, key, fn) => {
      const b = document.createElement('button');
      b.innerHTML = svg(ICONS[icon]) + `<span class="tip">${tip}<kbd>${key}</kbd></span>`;
      b.onclick = fn; bar.appendChild(b); return b;
    };
    this.undoBtn = mk('undo', 'Undo', '⌘Z', () => this.app.undo());
    this.redoBtn = mk('redo', 'Redo', '⇧⌘Z', () => this.app.redo());
    bar.appendChild(Object.assign(document.createElement('div'), { className: 'sep' }));
    mk('walk', 'Walk the streets', 'V', () => this.app.toggleWalk());
    mk('eye', 'Hide interface', 'H', () => document.body.classList.toggle('hide-ui'));
    world.onChangeUI = () => this.refresh();
  }

  _palette() {
    const { tools } = this.app;
    const items = this.$('pal-items');
    items.innerHTML = '';
    let title = '', sub = '';
    const add = (label, faceHTML, active, onClick, faceNode) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (active ? ' active' : '');
      const face = document.createElement('div'); face.className = 'face';
      if (faceNode) face.appendChild(faceNode); else face.innerHTML = faceHTML;
      b.appendChild(face);
      b.appendChild(Object.assign(document.createElement('span'), { textContent: label }));
      b.onclick = () => { onClick(); this.app.audio.click(); };
      items.appendChild(b);
    };
    if (tools.tool === 'build' || tools.tool === 'paint') {
      title = tools.tool === 'build' ? 'Building blocks' : 'Paint style';
      sub = STYLES[tools.style].name;
      STYLES.forEach((s, i) => add(s.name, '', i === tools.style, () => { tools.style = i; tools.emit(); }, this._stylePreview(i)));
    } else if (tools.tool === 'prop') {
      title = 'Details'; sub = PROP_TYPES[tools.propType].name + ' · rot ' + tools.propRot * 90 + '°';
      PROP_TYPES.forEach((p, i) => add(p.name, PROP_EMOJI[p.id], i === tools.propType, () => tools.setPropType(i)));
    } else if (tools.tool === 'ground') {
      title = 'Ground'; sub = GROUND_TYPES[tools.groundType];
      GROUND_TYPES.forEach((g, i) => add(g, `<div style="width:100%;height:100%;background:${GROUND_COLORS[i]}"></div>`, i === tools.groundType, () => { tools.groundType = i; tools.emit(); }));
    } else {
      title = 'Erase'; sub = 'Blocks & details';
    }
    this.$('pal-title').textContent = title;
    this.$('pal-sub').textContent = sub;
    this.$('palette').classList.toggle('hidden', tools.tool === 'erase');
  }

  _stylePreview(i) {
    this._previews = this._previews || [];
    if (!this._previews[i]) {
      const src = this.app.blocks.textures[i].preview;
      const c = document.createElement('canvas'); c.width = c.height = 116;
      const cw = src.width / ATLAS_COLS, ch = src.height / ATLAS_ROWS;
      c.getContext('2d').drawImage(src, 0, 0, cw, ch, 0, 0, 116, 116);
      this._previews[i] = c;
    }
    const copy = document.createElement('canvas'); copy.width = copy.height = 116;
    copy.getContext('2d').drawImage(this._previews[i], 0, 0);
    return copy;
  }

  refresh() {
    const { tools, world } = this.app;
    for (const [id, b] of Object.entries(this.toolButtons)) b.classList.toggle('active', id === tools.tool);
    this.undoBtn.disabled = !world.undoStack.length;
    this.redoBtn.disabled = !world.redoStack.length;
    const key = [tools.tool, tools.style, tools.propType, tools.propRot, tools.groundType].join();
    if (key !== this._palKey) { this._palKey = key; this._palette(); }
    this.$('hint').innerHTML = HINTS[tools.tool].map(h => `<p>${h}</p>`).join('') + `<p style="opacity:.7">${CAMERA_HINT}</p>`;
    const si = tools.selectionInfo();
    const el = this.$('selinfo');
    el.classList.add('glass');
    if (si && tools.tool === 'build') {
      const h = si.h ? ` · <b>${si.h > 0 ? '+' : ''}${si.h}</b> ${si.h > 0 ? 'extrude' : 'dig'}` : '';
      el.innerHTML = `${si.w} × ${si.d}${h} &nbsp;<span style="color:var(--muted)">E / Q · Esc</span>`;
      el.classList.remove('hidden');
    } else el.classList.add('hidden');
  }

  setStats(n) { this.$('stats').textContent = `${n.toLocaleString()} blocks`; }

  toast(msg) {
    const t = this.$('toast');
    t.classList.add('glass');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 1800);
  }

  _panel() {
    const { env, post, ground, traffic, audio } = this.app;
    const $ = this.$;
    $('panel-body').classList.add('glass');
    $('panel-toggle').onclick = () => $('panel').classList.toggle('collapsed');
    if (window.innerWidth < 900) $('panel').classList.add('collapsed');

    const fmt = t => { const h = Math.floor(t) % 24, m = Math.floor((t % 1) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
    const setTime = t => { env.set({ time: t }); $('time').value = t; $('time-out').textContent = fmt(t); };
    this.setTimeDisplay = t => { $('time').value = t; $('time-out').textContent = fmt(t); };
    $('time').oninput = e => setTime(+e.target.value);
    for (const b of $('time-presets').querySelectorAll('button')) b.onclick = () => this.app.animateTime(+b.dataset.t);
    $('cycle').onchange = e => { this.app.cycle = e.target.checked; };
    $('clouds').oninput = e => env.set({ clouds: +e.target.value });
    $('fog').oninput = e => env.set({ fog: +e.target.value });
    $('rain').onchange = e => { env.set({ rain: e.target.checked }); audio.unlock(); audio.setRain(e.target.checked); };

    $('mini').onchange = e => post.apply({ miniature: e.target.checked });
    $('mini-str').oninput = e => post.apply({ tiltStrength: +e.target.value });
    $('dof').onchange = e => post.apply({ dof: e.target.checked });
    $('aperture').oninput = e => post.apply({ aperture: +e.target.value });
    $('bloom').oninput = e => post.apply({ bloom: +e.target.value });
    $('filter').onchange = e => post.apply({ filter: e.target.value });

    $('grid').onchange = e => { ground.grid.visible = e.target.checked; };
    $('traffic').onchange = e => { traffic.enabled = e.target.checked; };
    $('sound').onchange = e => audio.setMuted(!e.target.checked);

    $('btn-new').onclick = () => this.app.newCity(false);
    $('btn-gen').onclick = () => this.app.newCity(true);
    $('btn-save').onclick = () => this.app.saveFile();
    $('btn-load').onclick = () => $('file').click();
    $('file').onchange = e => { const f = e.target.files[0]; if (f) this.app.loadFile(f); e.target.value = ''; };
    $('btn-shot').onclick = () => this.app.screenshot();

    for (const el of document.querySelectorAll('#panel input, #panel select, #panel button')) el.addEventListener('change', () => this.app.saveSettings());
  }

  // Sync controls from saved settings.
  syncSettings(s) {
    const $ = this.$;
    if (!s) return;
    const set = (id, v, prop = 'value') => { if (v !== undefined) $(id)[prop] = v; };
    set('time', s.env?.time); set('clouds', s.env?.clouds); set('fog', s.env?.fog); set('rain', s.env?.rain, 'checked');
    set('mini', s.post?.miniature, 'checked'); set('mini-str', s.post?.tiltStrength); set('dof', s.post?.dof, 'checked');
    set('aperture', s.post?.aperture); set('bloom', s.post?.bloom); set('filter', s.post?.filter);
    set('grid', s.grid, 'checked'); set('traffic', s.traffic, 'checked'); set('sound', s.sound, 'checked');
    this.setTimeDisplay(+$('time').value);
  }
}
