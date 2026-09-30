// Tiny synthesized UI sounds and an ambient rain bed (WebAudio, no assets).
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.rainOn = false;
    this.lastTick = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    // Rain: filtered noise loop.
    const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
    this.rainGain = this.ctx.createGain(); this.rainGain.gain.value = 0;
    src.connect(lp).connect(hp).connect(this.rainGain).connect(this.master);
    src.start();
    this.setRain(this.rainOn);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  setRain(on) {
    this.rainOn = on;
    if (this.rainGain) this.rainGain.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.6);
  }

  _blip(freq, dur, type = 'triangle', vol = 0.18, slide = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  tick(n = 0, down = false) {
    const now = performance.now();
    if (now - this.lastTick < 25) return;
    this.lastTick = now;
    const f = down ? 520 - Math.min(n, 60) * 4 : 620 + Math.min(n, 60) * 12;
    this._blip(f, 0.05, 'sine', 0.08);
  }
  place(n = 1) { this._blip(300, 0.12, 'triangle', 0.2, 1.8); if (n > 8) this._blip(180, 0.18, 'sine', 0.12, 1.3); }
  remove() { this._blip(260, 0.14, 'triangle', 0.18, 0.45); }
  click() { this._blip(900, 0.03, 'sine', 0.05); }
}
