// ─────────────────────────────────────────────────────────────
//  STREET FREQUENCY — cena 3D (three.js)
//  Show do DJ KRISS no centro da Ceilândia, com a caixa d'água ao fundo.
//  Paredões, carros de som, multidão, LED, neon, lasers e fagulhas,
//  tudo reagindo ao grave do player.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

export function initScene(canvas, SF, onReady) {
  const coarse = matchMedia('(pointer:coarse)').matches || innerWidth < 760;
  const cores = navigator.hardwareConcurrency || 4;
  let tier = coarse ? (cores >= 8 ? 1 : 0) : 2; // 0 leve · 1 médio · 2 alto
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Renderer ────────────────────────────────────────────
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch (e) {
    document.documentElement.classList.add('no-webgl');
    onReady && onReady();
    return null;
  }
  const maxDpr = tier === 2 ? 1.75 : tier === 1 ? 1.4 : 1.15;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxDpr));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const NIGHT = new THREE.Color('#03050c');
  scene.background = new THREE.Color('#000000');
  scene.fog = new THREE.FogExp2('#050816', 0.013);

  const camera = new THREE.PerspectiveCamera(coarse ? 64 : 48, innerWidth / innerHeight, 0.1, 400);

  const accent = new THREE.Color(SF.accent);
  const accentTarget = new THREE.Color(SF.accent);
  const WHITE = new THREE.Color('#ffffff');

  // ── Texturas utilitárias ────────────────────────────────
  const loader = new THREE.TextureLoader();
  let pending = 0;
  const done = () => { if (--pending === 0) onReady && onReady(); };
  const tex = (url, srgb = true) => {
    pending++;
    const t = loader.load(url, done, undefined, done);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const canvasTex = (w, h, draw, srgb = true) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const glowTex = canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  const speakerTex = canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#0c0d10'; g.fillRect(0, 0, w, w);
    const cone = g.createRadialGradient(c, c, 8, c, c, c * 0.92);
    cone.addColorStop(0, '#3a3d44'); cone.addColorStop(0.18, '#121318');
    cone.addColorStop(0.6, '#24262c'); cone.addColorStop(0.9, '#08090b'); cone.addColorStop(1, '#2b2d33');
    g.fillStyle = cone; g.beginPath(); g.arc(c, c, c * 0.96, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.08)';
    for (let r = 30; r < c * 0.9; r += 14) { g.beginPath(); g.arc(c, c, r, 0, TAU); g.stroke(); }
    g.fillStyle = '#4a4d55'; g.beginPath(); g.arc(c, c, 26, 0, TAU); g.fill();
    g.fillStyle = '#9aa0aa';
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; g.beginPath(); g.arc(c + Math.cos(a) * c * 0.98 * 0.94, c + Math.sin(a) * c * 0.94, 4, 0, TAU); g.fill(); }
  });
  const ringTex = canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
    g.strokeStyle = '#fff'; g.lineWidth = 7;
    g.shadowColor = '#fff'; g.shadowBlur = 16;
    g.beginPath(); g.arc(c, c, c * 0.9, 0, TAU); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(c, c, 26, 0, TAU); g.stroke();
  });

  // ── Fundo: a caixa d'água da Ceilândia à noite ──────────
  const SKY_TOP = new THREE.Color('#03050d');
  const backMat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex('assets/ceilandia-noite.webp') },
      mask: { value: tex('assets/ceilandia-torre-mask.png', false) },
      accent: { value: accent },
      skyTop: { value: SKY_TOP },
      bass: { value: 0 },
      time: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      uniform sampler2D map, mask; uniform vec3 accent, skyTop; uniform float bass, time; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(map, vUv).rgb;
        float m = texture2D(mask, vUv).r;
        // neon na caixa d'água
        float sweep = 0.65 + 0.35*sin(vUv.x*60. - time*3.);
        c += accent * m * (0.22 + 0.9*bass) * sweep;
        // halo ao redor da taça
        vec2 d = (vUv - vec2(0.628, 0.84)) * vec2(1.5, 1.0);
        c += accent * exp(-dot(d,d)*70.) * (0.05 + 0.2*bass);
        c += vec3(0.35,0.45,1.0) * exp(-dot(d,d)*8.) * 0.05;
        // luzes de sinalização vermelhas piscando
        for (int i = 0; i < 3; i++) {
          vec2 p = vec2(0.59 + 0.038*float(i), 0.892);
          float blink = step(0.55, fract(time*0.8 + float(i)*0.27));
          float l = length((vUv - p) * vec2(1.5,1.0));
          c += vec3(1.,0.06,0.04) * (smoothstep(0.004, 0.0, l)*3. + exp(-l*l*30000.)*0.6) * blink;
        }
        // estrelas
        vec2 sv = vUv*vec2(330.,220.);
        vec2 sg = floor(sv);
        float h = fract(sin(dot(sg, vec2(12.9898,78.233)))*43758.5453);
        float dot2 = smoothstep(0.16, 0.0, length(fract(sv)-0.5));
        float star = step(0.993, h) * dot2 * smoothstep(0.66, 0.95, vUv.y) * (0.45+0.55*sin(time*2.+h*40.));
        c += vec3(star*0.6);
        c = mix(c, skyTop, smoothstep(0.86, 1.0, vUv.y));
        gl_FragColor = vec4(c, 1.);
      }`,
    fog: false,
    depthWrite: false,
  });
  const BH = 120, BW = BH * 1.5066;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), backMat);
  back.position.set(6 - (0.628 - 0.5) * BW, -13, -62);
  back.renderOrder = -1;
  scene.add(back);
  // céu acima da foto
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { a: { value: SKY_TOP }, b: { value: new THREE.Color('#000000') } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 a,b; varying vec2 vUv; void main(){ gl_FragColor=vec4(mix(a,b,smoothstep(0.,1.,vUv.y)),1.); }`,
    fog: false, depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(700, 160), skyMat);
  sky.position.set(0, back.position.y + BH / 2 + 80 - 0.5, -62.5);
  sky.renderOrder = -2;
  scene.add(sky);

  // névoa do horizonte (une o chão 3D com a foto)
  const horizon = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 18),
    new THREE.ShaderMaterial({
      uniforms: { col: { value: new THREE.Color('#050816') } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform vec3 col; varying vec2 vUv; void main(){ gl_FragColor=vec4(col, pow(1.-vUv.y, 1.6)); }`,
      transparent: true, depthWrite: false, fog: false,
    })
  );
  horizon.position.set(0, 3, -54);
  scene.add(horizon);

  // ── Chão (asfalto molhado) ──────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 112),
    new THREE.MeshStandardMaterial({ color: '#0a0b10', roughness: 0.42, metalness: 0.55 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 0;
  scene.add(ground);
  // faixas de pedestre
  const zebraMat = new THREE.MeshBasicMaterial({ color: '#2a2d36' });
  for (let i = 0; i < 9; i++) {
    const z = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 5), zebraMat);
    z.rotation.x = -Math.PI / 2;
    z.position.set(-6 + i * 1.5, 0.01, 31);
    scene.add(z);
  }

  // ── Luzes ───────────────────────────────────────────────
  scene.add(new THREE.HemisphereLight('#24345f', '#050505', 0.7));
  const moon = new THREE.DirectionalLight('#6f86ff', 0.6);
  moon.position.set(-20, 30, -30);
  scene.add(moon);
  const keyLight = new THREE.PointLight(accent, 120, 60, 1.6);
  keyLight.position.set(0, 7, 6);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight('#ffffff', 50, 30, 1.6);
  rimLight.position.set(0, 5, -3);
  scene.add(rimLight);
  const crowdLight = new THREE.PointLight(accent, 60, 45, 1.4);
  crowdLight.position.set(0, 9, 18);
  scene.add(crowdLight);

  // ── Palco ───────────────────────────────────────────────
  const dark = new THREE.MeshStandardMaterial({ color: '#0d0e12', roughness: 0.6, metalness: 0.4 });
  const steel = new THREE.MeshStandardMaterial({ color: '#8e939c', roughness: 0.35, metalness: 0.9 });
  const stage = new THREE.Mesh(new THREE.BoxGeometry(17, 1.2, 7), dark);
  stage.position.set(0, 0.6, -1.5);
  scene.add(stage);

  const ledStripMat = new THREE.ShaderMaterial({
    uniforms: { accent: { value: accent }, time: { value: 0 }, bass: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 accent; uniform float time,bass; varying vec2 vUv;
      void main(){
        float x = vUv.x*48.;
        float cell = step(0.18, fract(x)) * step(0.2, fract(vUv.y*3.));
        float wave = 0.5+0.5*sin(floor(x)*0.7 - time*6.);
        float lvl = step(abs(vUv.y-0.5)*2., wave*(0.4+bass*1.4));
        gl_FragColor = vec4(accent*cell*(0.15+lvl*2.2), 1.);
      }`,
  });
  const ledStrip = new THREE.Mesh(new THREE.PlaneGeometry(17, 0.9), ledStripMat);
  ledStrip.position.set(0, 0.6, 2.01);
  scene.add(ledStrip);

  // cabine do DJ
  const booth = new THREE.Group();
  booth.position.set(0, 1.2, 0.4);
  scene.add(booth);
  const boothBox = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.15, 1.5), dark);
  boothBox.position.y = 0.575;
  booth.add(boothBox);
  const boothFrontMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const boothFront = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 1.05), boothFrontMat);
  boothFront.position.set(0, 0.575, 0.76);
  booth.add(boothFront);
  function paintBooth() {
    const t = canvasTex(1024, 256, (g, w, h) => {
      g.fillStyle = '#050507'; g.fillRect(0, 0, w, h);
      const gr = g.createLinearGradient(0, 40, 0, 210);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#c9ccd3'); gr.addColorStop(0.55, '#7d838d'); gr.addColorStop(1, '#eef0f4');
      g.fillStyle = gr;
      g.font = '900 150px Cinzel, Georgia, serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = 'rgba(255,255,255,.6)'; g.shadowBlur = 18;
      g.fillText('DJ KRISS', w / 2, h / 2 + 8);
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 3; g.strokeRect(8, 8, w - 16, h - 16);
    });
    boothFrontMat.map = t; boothFrontMat.needsUpdate = true;
  }
  paintBooth();
  if (document.fonts) document.fonts.ready.then(paintBooth);

  const platters = [];
  for (const x of [-1.35, 1.35]) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 1.1), steel);
    deck.position.set(x, 1.2, 0);
    booth.add(deck);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 32), new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.3, metalness: 0.2 }));
    plat.position.set(x, 1.28, 0);
    const label = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), new THREE.MeshBasicMaterial({ color: accent }));
    label.rotation.x = -Math.PI / 2; label.position.y = 0.03;
    plat.add(label);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 8), new THREE.MeshBasicMaterial({ color: '#fff' }));
    dot.rotation.x = -Math.PI / 2; dot.position.set(0.34, 0.031, 0);
    plat.add(dot);
    booth.add(plat);
    platters.push(plat);
  }
  const mixer = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 1), new THREE.MeshStandardMaterial({ color: '#111', emissive: accent, emissiveIntensity: 0.4 }));
  mixer.position.set(0, 1.22, 0);
  booth.add(mixer);

  // ── DJ KRISS ────────────────────────────────────────────
  const dj = new THREE.Group();
  dj.position.set(0, 1.2, -0.75);
  scene.add(dj);
  const leather = new THREE.MeshStandardMaterial({ color: '#0b0b0d', roughness: 0.28, metalness: 0.35 });
  const skin = new THREE.MeshStandardMaterial({ color: '#9b6c4f', roughness: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: '#030303', roughness: 0.15, metalness: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: '#d9b25a', roughness: 0.25, metalness: 1, emissive: '#3a2a08' });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.05, 0.34), dark); legs.position.y = 0.52; dj.add(legs);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.95, 10), leather); torso.position.y = 1.5; dj.add(torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 8), skin); neck.position.y = 2.03; dj.add(neck);
  const head = new THREE.Group(); head.position.y = 2.25; dj.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), skin));
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.205, 16, 8, 0, TAU, 0, 1.1), new THREE.MeshStandardMaterial({ color: '#0a0806', roughness: 0.9 }));
  head.add(hair);
  const shades = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.06), black); shades.position.set(0, 0.02, 0.17); head.add(shades);
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8, 0, TAU, 1.6, 1.3), new THREE.MeshStandardMaterial({ color: '#0d0a08', roughness: 1 }));
  beard.position.set(0, -0.06, 0.05); head.add(beard);
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 24), gold); chain.rotation.x = 1.25; chain.position.set(0, 1.82, 0.16); dj.add(chain);
  function arm(side) {
    const sh = new THREE.Group(); sh.position.set(side * 0.46, 1.88, 0); dj.add(sh);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.55, 8), leather); up.position.y = -0.27; sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.55; sh.add(el);
    const fo = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.5, 8), leather); fo.position.y = -0.25; el.add(fo);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), skin); hand.position.y = -0.53; el.add(hand);
    return { sh, el };
  }
  const armL = arm(-1), armR = arm(1);

  // ── Painel de LED (capa) ────────────────────────────────
  const ledMat = new THREE.ShaderMaterial({
    uniforms: {
      a: { value: tex('assets/album-cover.webp') }, b: { value: null }, mixv: { value: 0 },
      bass: { value: 0 }, time: { value: 0 }, accent: { value: accent },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D a,b; uniform float mixv,bass,time; uniform vec3 accent; varying vec2 vUv;
      void main(){
        vec3 ca = texture2D(a, vUv).rgb;
        vec3 cb = mixv > 0. ? texture2D(b, vUv).rgb : ca;
        float wipe = smoothstep(vUv.y-0.08, vUv.y+0.08, mixv*1.2-0.1);
        vec3 c = mix(ca, cb, wipe);
        vec2 px = fract(vUv*vec2(150.));
        float led = smoothstep(0.5, 0.25, length(px-0.5));
        float scan = 0.88 + 0.12*sin(vUv.y*600. - time*20.);
        c *= (0.55 + 0.9*led) * scan * (0.85 + bass*0.9);
        c += accent * 0.06;
        gl_FragColor = vec4(c, 1.);
      }`,
    toneMapped: false,
  });
  const LW = 8.2;
  const led = new THREE.Mesh(new THREE.PlaneGeometry(LW, LW), ledMat);
  led.position.set(0, 7.1, -4.6);
  scene.add(led);
  const ledFrame = new THREE.Mesh(new THREE.BoxGeometry(LW + 0.5, LW + 0.5, 0.3), dark);
  ledFrame.position.set(0, 7.1, -4.8);
  scene.add(ledFrame);
  // colunas de LED laterais (equalizador)
  const eqMat = new THREE.ShaderMaterial({
    uniforms: { accent: { value: accent }, time: { value: 0 }, bass: { value: 0 }, mid: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 accent; uniform float time,bass,mid; varying vec2 vUv;
      void main(){
        vec2 g = vec2(6., 28.);
        vec2 id = floor(vUv*g); vec2 f = fract(vUv*g);
        float cell = step(0.12,f.x)*step(0.12,f.x*0.0+f.y)*step(f.x,0.88)*step(f.y,0.82);
        float h = 0.25 + 0.75*abs(sin(id.x*1.7 + time*2.3))*(0.3+bass*1.1+mid*0.4);
        float on = step(vUv.y, h);
        vec3 col = mix(accent, vec3(1.), step(0.8, vUv.y)*on);
        gl_FragColor = vec4(col*cell*(0.07+on*1.6), 1.);
      }`,
    toneMapped: false,
  });
  for (const x of [-6.6, 6.6]) {
    const col = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 8.2), eqMat);
    col.position.set(x, 7.1, -4.5);
    scene.add(col);
  }

  // ── Treliça + moving heads (feixes de luz) ──────────────
  const trussMat = steel;
  const trussTop = new THREE.Mesh(new THREE.BoxGeometry(20, 0.35, 0.35), trussMat);
  trussTop.position.set(0, 12.6, -1.5);
  scene.add(trussTop);
  for (const x of [-10, 10]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 12.6, 0.35), trussMat);
    leg.position.set(x, 6.3, -1.5);
    scene.add(leg);
  }
  const beamGeo = new THREE.ConeGeometry(2.4, 26, 24, 1, true);
  beamGeo.translate(0, -13, 0);
  const beams = [];
  const beamCount = tier === 0 ? 4 : 6;
  for (let i = 0; i < beamCount; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color() }, intensity: { value: 0.5 } },
      vertexShader: `varying float vV; varying vec3 vN; varying vec3 vP;
        void main(){ vV=uv.y; vec4 mv=modelViewMatrix*vec4(position,1.); vP=mv.xyz; vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 color; uniform float intensity; varying float vV; varying vec3 vN; varying vec3 vP;
        void main(){
          float edge = pow(abs(dot(vN, normalize(-vP))), 1.6);
          float a = pow(vV, 2.2) * edge * intensity;
          gl_FragColor = vec4(color*a, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const g = new THREE.Group();
    const x = -8.5 + (17 / (beamCount - 1)) * i;
    g.position.set(x, 12.3, -1.2);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.45), dark);
    g.add(head);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.17, 12), new THREE.MeshBasicMaterial({ color: '#fff', toneMapped: false }));
    lens.rotation.x = Math.PI / 2; lens.position.y = -0.26;
    g.add(lens);
    const beam = new THREE.Mesh(beamGeo, mat);
    g.add(beam);
    scene.add(g);
    beams.push({ g, mat, lens, phase: i * 0.9, white: i % 2 === 1 });
  }

  // ── Lasers ──────────────────────────────────────────────
  const laserGeo = new THREE.BoxGeometry(0.035, 0.035, 70);
  laserGeo.translate(0, 0, 35);
  const lasers = new THREE.Group();
  lasers.position.set(0, 12.2, -1.2);
  scene.add(lasers);
  const laserMats = [];
  const LCOUNT = tier === 0 ? 6 : 10;
  for (let i = 0; i < LCOUNT; i++) {
    const m = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? '#36ff7a' : '#ff3355', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const l = new THREE.Mesh(laserGeo, m);
    l.userData.k = (i / (LCOUNT - 1)) * 2 - 1;
    lasers.add(l);
    laserMats.push(m);
  }

  // ── Paredões ────────────────────────────────────────────
  const cabGeo = new THREE.BoxGeometry(1.6, 1.6, 1.15);
  const coneGeo = new THREE.CircleGeometry(0.66, 28);
  const cabMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, metalness: 0.1 });
  const coneMat = new THREE.MeshStandardMaterial({ map: speakerTex, emissiveMap: ringTex, emissive: accent, emissiveIntensity: 0.6, roughness: 0.5 });
  const walls = [
    { x: -9.4, z: -2.4, ry: 0.32, cols: 3, rows: 5 },
    { x: 9.4, z: -2.4, ry: -0.32, cols: 3, rows: 5 },
    { x: -14.2, z: 1.2, ry: 0.62, cols: 2, rows: 4 },
    { x: 14.2, z: 1.2, ry: -0.62, cols: 2, rows: 4 },
  ];
  let cabTotal = 0;
  walls.forEach((w) => (cabTotal += w.cols * w.rows));
  const cabs = new THREE.InstancedMesh(cabGeo, cabMat, cabTotal);
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, cabTotal);
  const coneBase = [];
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    const cW = new THREE.Color('#c9ccd2'), cB = new THREE.Color('#141518');
    let k = 0;
    for (const w of walls) {
      const wq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), w.ry);
      for (let c = 0; c < w.cols; c++) for (let r = 0; r < w.rows; r++) {
        const off = new THREE.Vector3((c - (w.cols - 1) / 2) * 1.64, 0.8 + r * 1.64, 0).applyQuaternion(wq);
        p.set(w.x + off.x, off.y, w.z + off.z);
        m.compose(p, wq, s);
        cabs.setMatrixAt(k, m);
        cabs.setColorAt(k, (r + c) % 3 === 0 ? cW : cB);
        const front = new THREE.Vector3(0, 0, 0.58).applyQuaternion(wq);
        const cp = p.clone().add(front);
        coneBase.push({ p: cp, q: wq.clone(), ph: Math.random() * 0.3 });
        m.compose(cp, wq, s);
        cones.setMatrixAt(k, m);
        k++;
      }
    }
  }
  scene.add(cabs, cones);

  // ── Carros de som ───────────────────────────────────────
  const pulsers = [];
  const glowMats = [];
  function makeCar(paint) {
    const car = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.22, metalness: 0.75 });
    const glass = new THREE.MeshStandardMaterial({ color: '#05070b', roughness: 0.05, metalness: 0.9 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.78, 2), body); b.position.y = 0.72; car.add(b);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.72, 1.84), glass); cab.position.set(0.35, 1.45, 0); car.add(cab);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 1.86), body); roof.position.set(0.35, 1.84, 0); car.add(roof);
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 18);
    const rim = new THREE.MeshStandardMaterial({ color: '#cfd3da', roughness: 0.2, metalness: 1 });
    for (const [x, z] of [[1.55, 1], [1.55, -1], [-1.55, 1], [-1.55, -1]]) {
      const w = new THREE.Mesh(wheelGeo, [new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.9 }), rim, rim]);
      w.rotation.x = Math.PI / 2; w.position.set(x, 0.42, z); car.add(w);
    }
    // porta-malas aberto com som
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 1.95), body);
    lid.geometry.translate(-0.65, 0, 0);
    lid.position.set(-1.0, 1.15, 0); lid.rotation.z = -1.15; car.add(lid);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 1.8), dark); box.position.set(-2.05, 1.2, 0); car.add(box);
    for (const z of [-0.45, 0.45]) {
      const sp = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24), coneMat);
      sp.rotation.y = -Math.PI / 2; sp.position.set(-2.31, 1.2, z); car.add(sp);
      pulsers.push(sp);
    }
    const tail = new THREE.MeshBasicMaterial({ color: '#ff1a1a', toneMapped: false });
    for (const z of [-0.8, 0.8]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.38), tail); t.position.set(-2.41, 0.86, z); car.add(t); }
    const headl = new THREE.MeshBasicMaterial({ color: '#e9f1ff', toneMapped: false });
    for (const z of [-0.72, 0.72]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.34), headl); h.position.set(2.41, 0.86, z); car.add(h); }
    // underglow neon
    const gm = new THREE.MeshBasicMaterial({ map: glowTex, color: accent, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    glowMats.push(gm);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 3.6), gm);
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.03; car.add(glow);
    return car;
  }
  const carSpots = [
    { x: -12.5, z: 8.5, ry: 2.15, c: '#0b0c10' },
    { x: 12.5, z: 8.5, ry: 0.99, c: '#14161c' },
    { x: -15.5, z: 17, ry: 2.35, c: '#1c1f26' },
    { x: 15.5, z: 17, ry: 0.79, c: '#08090c' },
  ];
  for (const s of carSpots) {
    const car = makeCar(s.c);
    car.position.set(s.x, 0, s.z);
    car.rotation.y = s.ry;
    scene.add(car);
  }

  // ── Multidão ────────────────────────────────────────────
  function merge(parts) {
    const pos = [], nor = [];
    for (const [g, m] of parts) {
      const ng = g.index ? g.toNonIndexed() : g.clone();
      ng.applyMatrix4(m);
      pos.push(...ng.attributes.position.array);
      nor.push(...ng.attributes.normal.array);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return out;
  }
  const M = (x, y, z, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(1, 1, 1));
  const base = [
    [new THREE.BoxGeometry(0.36, 0.82, 0.22), M(0, 0.41, 0)],
    [new THREE.CylinderGeometry(0.21, 0.25, 0.74, 7), M(0, 1.18, 0)],
    [new THREE.SphereGeometry(0.15, 8, 6), M(0, 1.72, 0)],
  ];
  const armsUpGeo = merge([...base,
    [new THREE.BoxGeometry(0.09, 0.66, 0.09), M(-0.33, 1.84, 0, 0.42)],
    [new THREE.BoxGeometry(0.09, 0.66, 0.09), M(0.33, 1.84, 0, -0.42)]]);
  const armsDownGeo = merge([...base,
    [new THREE.BoxGeometry(0.09, 0.66, 0.09), M(-0.29, 1.15, 0, -0.12)],
    [new THREE.BoxGeometry(0.09, 0.66, 0.09), M(0.29, 1.15, 0, 0.12)]]);
  const oneUpGeo = merge([...base,
    [new THREE.BoxGeometry(0.09, 0.66, 0.09), M(-0.29, 1.15, 0, -0.12)],
    [new THREE.BoxGeometry(0.09, 0.7, 0.09), M(0.3, 1.9, 0, -0.2)]]);
  const crowdMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75, metalness: 0.15 });
  const CROWD = [320, 560, 950][tier];
  const people = [];
  for (let i = 0; i < CROWD; i++) {
    let x, z, ok = false, tries = 0;
    while (!ok && tries++ < 30) {
      z = 3.2 + Math.pow(Math.random(), 0.8) * 27;
      const half = 6 + z * 0.42;
      x = rand(-half, half);
      ok = carSpots.every((c) => (x - c.x) ** 2 + (z - c.z) ** 2 > 10) && !(z > 26 && Math.abs(x) < 3);
    }
    people.push({ x, z, ph: Math.random() * TAU, amp: rand(0.12, 0.38), s: rand(0.9, 1.1), ry: Math.atan2(-x, -z + 40) * 0.4 + rand(-0.3, 0.3), kind: Math.random() });
  }
  const groups = [
    { geo: armsUpGeo, list: people.filter((p) => p.kind < 0.42) },
    { geo: oneUpGeo, list: people.filter((p) => p.kind >= 0.42 && p.kind < 0.66) },
    { geo: armsDownGeo, list: people.filter((p) => p.kind >= 0.66) },
  ].map(({ geo, list }) => {
    const mesh = new THREE.InstancedMesh(geo, crowdMat, list.length);
    const tones = ['#121318', '#1a1b21', '#0e0f13', '#2a2b31', '#1b1814', '#c8c9cc'];
    list.forEach((p, k) => mesh.setColorAt(k, new THREE.Color(tones[Math.random() < 0.08 ? 5 : (Math.random() * 5) | 0])));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    return { mesh, list };
  });

  // flashes de celular
  const phones = people.filter(() => Math.random() < 0.09);
  const phoneGeo = new THREE.BufferGeometry();
  phoneGeo.setAttribute('position', new THREE.Float32BufferAttribute(phones.flatMap((p) => [p.x + 0.3, 2.35 * p.s, p.z]), 3));
  const phoneMat = new THREE.PointsMaterial({ map: glowTex, size: 0.3, color: '#dfe8ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  scene.add(new THREE.Points(phoneGeo, phoneMat));

  // ── Fumaça / névoa de palco ─────────────────────────────
  const HAZE = [40, 70, 110][tier];
  const hazeGeo = new THREE.BufferGeometry();
  const hp = new Float32Array(HAZE * 3);
  for (let i = 0; i < HAZE; i++) { hp[i * 3] = rand(-18, 18); hp[i * 3 + 1] = rand(0.3, 6); hp[i * 3 + 2] = rand(-4, 22); }
  hazeGeo.setAttribute('position', new THREE.BufferAttribute(hp, 3));
  const hazeMat = new THREE.PointsMaterial({ map: glowTex, size: 9, color: accent, transparent: true, opacity: 0.03, blending: THREE.AdditiveBlending, depthWrite: false });
  const haze = new THREE.Points(hazeGeo, hazeMat);
  scene.add(haze);

  // ── Fagulhas (sparkulars) ───────────────────────────────
  const SP = [160, 260, 420][tier];
  const spPos = new Float32Array(SP * 3).fill(-100);
  const spVel = new Float32Array(SP * 3);
  const spLife = new Float32Array(SP);
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  const spMat = new THREE.PointsMaterial({ map: glowTex, size: 0.26, color: '#ffd28a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  scene.add(new THREE.Points(spGeo, spMat));
  let spHead = 0;
  function burst(x, z, n) {
    for (let k = 0; k < n; k++) {
      const i = spHead++ % SP;
      spPos[i * 3] = x + rand(-0.2, 0.2); spPos[i * 3 + 1] = 1.25; spPos[i * 3 + 2] = z + rand(-0.2, 0.2);
      spVel[i * 3] = rand(-0.6, 0.6); spVel[i * 3 + 1] = rand(7, 11); spVel[i * 3 + 2] = rand(-0.6, 0.6);
      spLife[i] = rand(0.9, 1.5);
    }
  }

  // ── Pós-processamento (bloom neon) ──────────────────────
  let composer, bloom, useBloom = true;
  function buildComposer() {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const f = tier === 2 ? 0.5 : 0.35;
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth * f, innerHeight * f), 0.72, 0.5, 0.3);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  buildComposer();

  // ── Câmera guiada pelo scroll ───────────────────────────
  const camPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 5.5, 31),
    new THREE.Vector3(-11, 6, 25),
    new THREE.Vector3(7, 5, 21),
    new THREE.Vector3(0, 9, 28),
    new THREE.Vector3(0, 16, 44),
  ]);
  const lookPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 8.5, -10),
    new THREE.Vector3(2, 6, -4),
    new THREE.Vector3(-1, 5, -3),
    new THREE.Vector3(4, 15, -40),
    new THREE.Vector3(0, 6, -6),
  ]);
  const INTRO_P = new THREE.Vector3(0, 34, 80), INTRO_L = new THREE.Vector3(0, 14, -20);
  const camPos = new THREE.Vector3(0, 34, 80);
  const camLook = new THREE.Vector3(0, 10, 0);
  const tmpP = new THREE.Vector3(), tmpL = new THREE.Vector3();
  let scrollT = 0, scrollSmooth = 0;
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    scrollT = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  addEventListener('pointermove', (e) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; }, { passive: true });

  // ── Resize ──────────────────────────────────────────────
  let portrait = false, wide = false;
  function resize() {
    const w = innerWidth, h = innerHeight;
    portrait = w / h < 0.8;
    wide = w >= 900 && w / h > 1.2;
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 66 : w / h < 1.2 ? 56 : 46;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
  }
  addEventListener('resize', resize);
  resize();

  // ── Troca de faixa: LED + cor ───────────────────────────
  let ledMix = 0, ledMixing = false;
  window.addEventListener('sf:track', (e) => {
    accentTarget.set(e.detail.accent);
    loader.load(e.detail.cover, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      if (ledMixing) { ledMat.uniforms.a.value = ledMat.uniforms.b.value; }
      ledMat.uniforms.b.value = t; ledMix = 0; ledMixing = true;
    });
  });

  // ── Loop ────────────────────────────────────────────────
  const clock = new THREE.Clock();
  const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), vv = new THREE.Vector3(), sc = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  let t = 0, intro = 0, frames = 0, slowAcc = 0, beatCount = 0, lastBeat = 0, raise = 0;
  let running = true;
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { clock.getDelta(); loop(); } });

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    const bass = SF.bass, mid = SF.mid, high = SF.high;

    accent.lerp(accentTarget, 0.06);
    keyLight.color.copy(accent);
    crowdLight.color.copy(accent);
    keyLight.intensity = 55 + bass * 200;
    crowdLight.intensity = 30 + bass * 140;
    coneMat.emissiveIntensity = 0.35 + bass * 3.2;
    mixer.material.emissiveIntensity = 0.3 + bass * 2;
    hazeMat.opacity = 0.02 + bass * 0.035;
    for (const g of glowMats) g.opacity = 0.45 + bass * 0.9;

    backMat.uniforms.time.value = t;
    backMat.uniforms.bass.value = bass;
    ledStripMat.uniforms.time.value = t; ledStripMat.uniforms.bass.value = bass;
    eqMat.uniforms.time.value = t; eqMat.uniforms.bass.value = bass; eqMat.uniforms.mid.value = mid;
    ledMat.uniforms.time.value = t; ledMat.uniforms.bass.value = bass;
    if (ledMixing) {
      ledMix += dt * 1.1;
      ledMat.uniforms.mixv.value = Math.min(1, ledMix);
      if (ledMix >= 1) { ledMat.uniforms.a.value = ledMat.uniforms.b.value; ledMat.uniforms.mixv.value = 0; ledMixing = false; }
    }

    // batida
    if (SF.beat > 0.95 && t - lastBeat > 0.25) {
      lastBeat = t; beatCount++;
      if (beatCount % 2 === 0) { burst(-7.8, 1.6, tier === 0 ? 10 : 18); burst(7.8, 1.6, tier === 0 ? 10 : 18); }
    }
    if (!SF.playing && t - lastBeat > 2.6) { lastBeat = t; burst(-7.8, 1.6, 8); burst(7.8, 1.6, 8); }

    // paredões pulsando
    for (let k = 0; k < coneBase.length; k++) {
      const c = coneBase[k];
      const s = 1 + bass * (0.16 + c.ph * 0.2);
      sc.set(s, s, 1);
      mtx.compose(c.p, c.q, sc);
      cones.setMatrixAt(k, mtx);
    }
    cones.instanceMatrix.needsUpdate = true;
    for (const p of pulsers) p.scale.setScalar(1 + bass * 0.22);

    // multidão
    const bt = t * (92 / 60) * TAU;
    for (const { mesh, list } of groups) {
      for (let k = 0; k < list.length; k++) {
        const p = list[k];
        const jump = Math.max(0, Math.sin(bt + p.ph)) * p.amp * (0.25 + bass * 1.6);
        vv.set(p.x, jump, p.z);
        qq.setFromAxisAngle(yAxis, p.ry + Math.sin(t * 1.3 + p.ph) * 0.15);
        sc.setScalar(p.s);
        mtx.compose(vv, qq, sc);
        mesh.setMatrixAt(k, mtx);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    phoneMat.opacity = 0.55 + 0.45 * Math.sin(t * 3.1);

    // DJ
    raise += ((Math.floor(t / 7) % 2 === 1 ? 1 : 0) - raise) * 0.06;
    head.rotation.x = 0.08 + bass * 0.32;
    dj.position.y = 1.2 + bass * 0.05;
    dj.rotation.y = Math.sin(t * 0.6) * 0.18;
    armL.sh.rotation.z = THREE.MathUtils.lerp(-0.15, -2.75, raise) - bass * 0.15 * raise;
    armR.sh.rotation.z = THREE.MathUtils.lerp(0.15, 2.75, raise) + bass * 0.15 * raise;
    armL.sh.rotation.x = THREE.MathUtils.lerp(-0.9, 0, raise);
    armR.sh.rotation.x = THREE.MathUtils.lerp(-0.9 + Math.sin(t * 9) * 0.08, 0, raise);
    armL.el.rotation.x = THREE.MathUtils.lerp(-0.6, 0, raise);
    armR.el.rotation.x = THREE.MathUtils.lerp(-0.6, 0, raise);
    platters.forEach((p, i) => (p.rotation.y -= dt * (i ? 3.5 : 3.49)));

    // feixes
    beams.forEach((b, i) => {
      const sp = 0.6 + mid * 0.8;
      b.g.rotation.z = Math.sin(t * sp + b.phase) * 0.55;
      b.g.rotation.x = 0.35 + Math.sin(t * sp * 0.7 + b.phase * 1.7) * 0.4;
      b.mat.uniforms.color.value.copy(b.white ? WHITE : accent);
      b.mat.uniforms.intensity.value = (b.white ? 0.18 : 0.32) + bass * 0.55;
    });
    // lasers
    const lOn = Math.max(0, high * 2 - 0.12) + (Math.floor(t / 4) % 3 === 0 ? 0.25 : 0);
    lasers.children.forEach((l) => {
      l.rotation.y = l.userData.k * (0.6 + Math.sin(t * 0.8) * 0.25);
      l.rotation.x = 0.28 + Math.sin(t * 1.3 + l.userData.k * 2) * 0.12;
    });
    laserMats.forEach((m) => (m.opacity = Math.min(0.32, lOn)));

    // fagulhas
    for (let i = 0; i < SP; i++) {
      if (spLife[i] <= 0) continue;
      spLife[i] -= dt;
      spVel[i * 3 + 1] -= 9.8 * dt;
      spPos[i * 3] += spVel[i * 3] * dt;
      spPos[i * 3 + 1] += spVel[i * 3 + 1] * dt;
      spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt;
      if (spLife[i] <= 0 || spPos[i * 3 + 1] < 0) { spPos[i * 3 + 1] = -100; spLife[i] = 0; }
    }
    spGeo.attributes.position.needsUpdate = true;

    // névoa derivando
    for (let i = 0; i < HAZE; i++) { hp[i * 3] += Math.sin(t * 0.2 + i) * 0.01; }
    hazeGeo.attributes.position.needsUpdate = true;

    // câmera
    intro = Math.min(1, intro + dt / 3.6);
    const ie = 1 - Math.pow(1 - intro, 3);
    scrollSmooth += (scrollT - scrollSmooth) * (reduce ? 1 : 0.06);
    camPath.getPoint(scrollSmooth, tmpP);
    lookPath.getPoint(scrollSmooth, tmpL);
    pointer.sx += (pointer.x - pointer.sx) * 0.05;
    pointer.sy += (pointer.y - pointer.sy) * 0.05;
    const sway = reduce ? 0 : 1;
    tmpP.x += (pointer.sx * 2.4 + Math.sin(t * 0.25) * 0.8) * sway;
    tmpP.y += (-pointer.sy * 1.2 + Math.sin(t * 0.31) * 0.3) * sway;
    camPos.lerpVectors(INTRO_P, tmpP, ie);
    camLook.lerpVectors(INTRO_L, tmpL, ie);
    { const k = 1 - Math.min(1, scrollSmooth * 4);
      if (portrait) { camLook.y -= 11 * k; camPos.y += 3.5 * k; camPos.z += 9 * k; }
      else if (wide) { camLook.x -= 9 * k; camPos.x -= 9 * k; } }
    camera.position.copy(camPos);
    if (!reduce) camera.position.y += bass * 0.06 * Math.sin(t * 40);
    camera.lookAt(camLook);

    if (useBloom) composer.render(dt); else renderer.render(scene, camera);

    // qualidade adaptativa
    if (intro >= 1 && frames < 120) {
      frames++;
      slowAcc += dt;
      if (frames === 120) {
        const avg = slowAcc / 120;
        if (avg > 0.034) {
          renderer.setPixelRatio(Math.max(0.75, renderer.getPixelRatio() * 0.75));
          composer.setSize(innerWidth, innerHeight);
          if (avg > 0.045) useBloom = false;
        }
      }
    }
  }
  SF.camera = camera;
  loop();
  if (pending === 0) onReady && onReady();
  return { scene, camera };
}
