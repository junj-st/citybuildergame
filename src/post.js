// Post-processing stack: DOF, tilt-shift miniature, bloom, tone mapping, colour grade, FXAA.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';

const TiltShiftShader = {
  uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, focusY: { value: 0.5 }, band: { value: 0.18 }, strength: { value: 9 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float focusY; uniform float band; uniform float strength; varying vec2 vUv;
    void main(){
      float d = abs(vUv.y - focusY);
      float r = smoothstep(band, band + 0.38, d) * strength;
      vec4 sum = vec4(0.0);
      if (r < 0.25) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      for (int i = 0; i < 28; i++) {
        float fi = float(i);
        float rr = sqrt((fi + 0.5) / 28.0) * r;
        float a = fi * 2.39996323;
        sum += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * rr / resolution);
      }
      gl_FragColor = sum / 28.0;
    }`,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, saturation: { value: 1 }, contrast: { value: 1 }, brightness: { value: 0 },
    tint: { value: new THREE.Vector3(1, 1, 1) }, vignette: { value: 0.2 }, grain: { value: 0 }, mono: { value: 0 }, time: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float saturation, contrast, brightness, vignette, grain, mono, time; uniform vec3 tint; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(l), col, saturation);
      col = mix(col, vec3(l), mono);
      col = (col - 0.5) * contrast + 0.5 + brightness;
      col *= tint;
      vec2 q = vUv - 0.5;
      col *= 1.0 - vignette * smoothstep(0.25, 0.85, length(q) * 1.3);
      col += (rnd(vUv * 1000.0) - 0.5) * grain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

export const FILTERS = {
  None: { saturation: 1.05, contrast: 1.02, tint: [1, 1, 1], vignette: 0.18, grain: 0, mono: 0 },
  Vivid: { saturation: 1.35, contrast: 1.1, tint: [1, 1, 1], vignette: 0.22, grain: 0, mono: 0 },
  Film: { saturation: 0.88, contrast: 1.06, tint: [1.05, 1.0, 0.9], vignette: 0.4, grain: 0.05, mono: 0 },
  Noir: { saturation: 1, contrast: 1.28, tint: [1, 1, 1], vignette: 0.5, grain: 0.06, mono: 1 },
  Warm: { saturation: 1.1, contrast: 1.04, tint: [1.08, 1.0, 0.86], vignette: 0.25, grain: 0.01, mono: 0 },
  Cool: { saturation: 0.95, contrast: 1.05, tint: [0.9, 0.98, 1.1], vignette: 0.25, grain: 0.01, mono: 0 },
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.bokeh = new BokehPass(scene, camera, { focus: 60, aperture: 0.0015, maxblur: 0.012 });
    this.bokeh.enabled = false;
    this.tilt = new ShaderPass(TiltShiftShader);
    this.tilt.enabled = false;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.35, 0.55, 0.92);
    this.output = new OutputPass();
    this.grade = new ShaderPass(GradeShader);
    this.fxaa = new FXAAPass();
    for (const p of [this.renderPass, this.bokeh, this.tilt, this.bloom, this.output, this.grade, this.fxaa]) this.composer.addPass(p);
    this.settings = { miniature: false, tiltStrength: 9, dof: false, aperture: 0.4, bloom: 0.5, filter: 'None' };
    this.setFilter('None');
  }

  setFilter(name) {
    const f = FILTERS[name] || FILTERS.None;
    const u = this.grade.uniforms;
    u.saturation.value = f.saturation * (this.settings.miniature ? 1.18 : 1);
    u.contrast.value = f.contrast * (this.settings.miniature ? 1.05 : 1);
    u.tint.value.set(...f.tint);
    u.vignette.value = f.vignette;
    u.grain.value = f.grain;
    u.mono.value = f.mono;
    this.settings.filter = name;
  }

  apply(patch = {}) {
    Object.assign(this.settings, patch);
    const s = this.settings;
    this.tilt.enabled = s.miniature && !this.walking;
    this.tilt.uniforms.strength.value = s.tiltStrength;
    this.bokeh.enabled = s.dof;
    this.bokeh.uniforms.aperture.value = s.aperture * 0.004;
    this.setFilter(s.filter);
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    const px = this.renderer.getPixelRatio();
    this.tilt.uniforms.resolution.value.set(w * px, h * px);
  }

  render(dt, camera, focusDist, night) {
    this.bokeh.uniforms.focus.value = focusDist;
    this.bokeh.uniforms.aspect.value = camera.aspect;
    this.bloom.strength = this.settings.bloom * (0.2 + night * 0.55);
    this.grade.uniforms.time.value = (this.grade.uniforms.time.value + dt) % 100;
    this.composer.render(dt);
  }
}
