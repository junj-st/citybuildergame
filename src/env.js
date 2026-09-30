// Time of day, sky, sun/moon lighting, fog, clouds, rain and stars.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { SIZE } from './world.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerpC = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

export class Environment {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.state = { time: 16.5, fog: 0.15, clouds: 0.35, rain: false, wind: 0.3 };
    this.center = new THREE.Vector3(SIZE / 2, 0, SIZE / 2);

    this.sky = new Sky();
    this.sky.scale.setScalar(1800);
    this.sky.renderOrder = -2;
    scene.add(this.sky);

    // Atmosphere dome: blends the sky toward the fog colour and into night.
    this.domeMat = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, aTop: { value: 0 }, aBottom: { value: 0 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform float aTop; uniform float aBottom; varying vec3 vDir;
        void main(){ float h = smoothstep(-0.02, 0.55, vDir.y); gl_FragColor = vec4(mix(bottom, top, h), mix(aBottom, aTop, h)); }`,
      side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), this.domeMat);
    this.dome.renderOrder = -1;
    scene.add(this.dome);

    // Stars
    const sp = [];
    for (let i = 0; i < 1500; i++) {
      const v = new THREE.Vector3().randomDirection();
      if (v.y < 0.05) v.y = Math.abs(v.y) + 0.05;
      v.normalize().multiplyScalar(700); sp.push(v.x, v.y, v.z);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = 0;
    scene.add(this.stars);

    // Lights
    this.sun = new THREE.DirectionalLight('#fff', 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera;
    sc.left = -52; sc.right = 52; sc.top = 52; sc.bottom = -52; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.target.position.copy(this.center);
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#bcd3ea', '#4a4038', 0.6);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2('#c9d6e0', 0.006);

    // Rain: GPU-animated streaks around the camera target.
    const N = 9000, seeds = [], ends = [];
    for (let i = 0; i < N; i++) {
      const sx = Math.random() * 2 - 1, sy = Math.random(), sz = Math.random() * 2 - 1;
      seeds.push(sx, sy, sz, sx, sy, sz); ends.push(0, 1);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(seeds, 3));
    rg.setAttribute('endpt', new THREE.Float32BufferAttribute(ends, 1));
    this.rainMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, center: { value: new THREE.Vector3() }, opacity: { value: 0.0 }, wind: { value: 0.3 } },
      vertexShader: `attribute float endpt; uniform float time; uniform vec3 center; uniform float wind;
        void main(){
          float H = 50.0, A = 45.0;
          vec3 p = vec3(center.x + position.x*A, 0.0, center.z + position.z*A);
          p.y = mod(position.y*H - time*22.0, H) - 2.0;
          p.y += endpt*0.55; p.x += endpt*wind*0.25;
          gl_Position = projectionMatrix * viewMatrix * vec4(p,1.0);
        }`,
      fragmentShader: `uniform float opacity; void main(){ gl_FragColor = vec4(0.72,0.78,0.85, opacity); }`,
      transparent: true, depthWrite: false,
    });
    this.rain = new THREE.LineSegments(rg, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);

    // Environment map from the sky, regenerated when the look changes.
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    const skyClone = new Sky(); skyClone.material = this.sky.material; skyClone.scale.setScalar(1800);
    this.envScene.add(skyClone, new THREE.Mesh(this.dome.geometry, this.domeMat));
    this.envRT = null;
    this.envDirty = true;
    this.envTimer = 0;
    this.night = 0;
    this.listeners = [];
    this.apply();
  }

  set(patch) { Object.assign(this.state, patch); this.apply(); }

  apply() {
    const s = this.state;
    const th = (s.time - 6) / 12 * Math.PI;
    const dir = new THREE.Vector3(Math.cos(th), Math.sin(th) * 0.92, 0.42).normalize();
    this.sunDir = dir;
    const elev = dir.y;
    const day = smooth(-0.06, 0.2, elev);
    const golden = elev > -0.1 ? 1 - smooth(0.02, 0.4, elev) : 0;
    const night = 1 - smooth(-0.14, 0.04, elev);
    const rain = s.rain ? 1 : 0;
    this.night = night;

    // Sky shader
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(dir);
    u.turbidity.value = 2.2 + rain * 10 + golden * 2;
    u.rayleigh.value = 1.2 + golden * 1.6;
    u.mieCoefficient.value = 0.004 + golden * 0.004;
    u.mieDirectionalG.value = 0.82;
    u.cloudCoverage.value = rain ? 0.92 : s.clouds;
    u.cloudDensity.value = rain ? 0.8 : 0.45;
    u.showSunDisc.value = rain ? 0 : 1;

    // Colours
    let horizon = lerpC('#cdd9e2', '#f0b489', golden);
    horizon = horizon.lerp(new THREE.Color('#1b2236'), night);
    if (rain) horizon.lerp(new THREE.Color(night > 0.5 ? '#171b24' : '#8c949c'), 0.75);
    this.fogColor = horizon;
    const nightTop = new THREE.Color('#070b18'), nightBottom = new THREE.Color('#1d2438');

    const fogA = Math.min(1, s.fog * 1.1 + rain * 0.45);
    const aB = Math.max(fogA, night * 0.97), aT = Math.max(fogA * 0.55, night * 0.97);
    this.domeMat.uniforms.bottom.value.copy(horizon);
    this.domeMat.uniforms.top.value.copy(night > 0.5 ? nightTop : horizon).lerp(nightTop, night);
    this.domeMat.uniforms.aBottom.value = aB;
    this.domeMat.uniforms.aTop.value = aT;
    this.scene.fog.color.copy(horizon);
    this.scene.fog.density = 0.0025 + s.fog * s.fog * 0.05 + rain * 0.008;

    this.starMat.opacity = night * (1 - fogA) * (rain ? 0 : 1);

    // Sun / moon
    const moonDir = new THREE.Vector3(-dir.x, Math.max(0.35, -dir.y), 0.3).normalize();
    const lightDir = elev > -0.04 ? dir : moonDir;
    this.lightDir = lightDir;
    const sunCol = lerpC('#fff3e2', '#ff9448', golden);
    if (elev > -0.04) {
      this.sun.color.copy(sunCol);
      this.sun.intensity = (0.3 + 3.2 * day) * (rain ? 0.28 : 1) * (1 - golden * 0.25);
    } else {
      this.sun.color.set('#9fb4e0');
      this.sun.intensity = 0.45 * (rain ? 0.4 : 1);
    }
    this.hemi.color.copy(lerpC('#c4d7ea', '#e9b594', golden).lerp(new THREE.Color('#34436a'), night));
    this.hemi.groundColor.copy(lerpC('#5a5046', '#3b2a22', golden).lerp(new THREE.Color('#161820'), night));
    this.hemi.intensity = (0.55 + night * 0.5) * (rain ? 0.8 : 1) + (rain && night < 0.5 ? 0.5 : 0);
    this.renderer.toneMappingExposure = 0.95 + night * 0.35;

    this.rain.visible = !!rain;
    this.rainMat.uniforms.opacity.value = night > 0.5 ? 0.22 : 0.35;
    this.rainMat.uniforms.wind.value = s.wind;
    this.wet = rain;
    this.envDirty = true;
    for (const fn of this.listeners) fn(this);
  }

  update(dt, target) {
    this.rainMat.uniforms.time.value += dt;
    this.rainMat.uniforms.center.value.copy(target);
    this.sky.material.uniforms.time.value += dt;
    // Keep the shadow frustum centred on the lot, not the camera, for stable shadows.
    this.sun.position.copy(this.center).addScaledVector(this.lightDir, 150);
    this.envTimer -= dt;
    if (this.envDirty && this.envTimer <= 0) {
      this.envDirty = false; this.envTimer = 0.4;
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 3000);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt;
      this.scene.environment = rt.texture;
      this.scene.environmentIntensity = 0.6 * (1 - this.night * 0.7);
    }
  }

  followCamera(camera) {
    this.dome.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.sky.position.copy(camera.position);
  }
}
