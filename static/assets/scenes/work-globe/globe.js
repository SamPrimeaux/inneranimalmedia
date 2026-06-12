/* globe.js — procedural frosted/mineral globe (vanilla Three.js, no .glb).
   Exposes window.GlobeScene = { setProgress, setTint, setMotion, ready }.
   Falls back gracefully if WebGL is unavailable. */
import * as THREE from "three";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("globe-canvas");

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
} catch (e) {
  document.body.classList.add("no-webgl");
}

const API = { ready: false, setProgress() {}, setTint() {}, setMotion() {} };
window.GlobeScene = API;

if (renderer) {
  const isMobile = matchMedia("(max-width:760px)").matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 6.2);

  // ---------- noise / shader chunks ----------
  const NOISE = `
    float hash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float vnoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
      return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                     mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                     mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
    float fbm(vec3 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p=p*2.02+vec3(1.7); a*=0.5; } return v; }
  `;

  // ---------- globe ----------
  const uniforms = {
    uTint: { value: new THREE.Vector3(0.55, 0.60, 0.64) },
    uTime: { value: 0 },
  };
  const globeMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vPosL; varying vec3 vN; varying vec3 vV;
      void main(){
        vPosL = position;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      precision highp float;
      uniform vec3 uTint; uniform float uTime;
      varying vec3 vPosL; varying vec3 vN; varying vec3 vV;
      ${NOISE}
      void main(){
        // continents fixed on the sphere surface
        float n  = fbm(vPosL*1.55);
        float n2 = fbm(vPosL*3.4 + 8.0);
        float field = n*0.72 + n2*0.28;
        float land = smoothstep(0.50, 0.66, field);
        float ocean = 0.20 + 0.05*n2;
        float gray = mix(ocean, 0.78, land);
        // mineral micro-grain
        gray += (fbm(vPosL*9.0) - 0.5) * 0.05;
        vec3 base = vec3(gray) * (uTint*1.7);
        // soft key light from upper-right
        vec3 L = normalize(vec3(0.45, 0.65, 0.62));
        float diff = clamp(dot(vN, L), 0.0, 1.0);
        float lit = 0.34 + 0.78*diff;
        // fresnel frosted rim
        float fres = pow(1.0 - clamp(dot(vN, vV), 0.0, 1.0), 2.6);
        vec3 col = base*lit + fres*vec3(0.74,0.81,0.86)*0.55;
        // gentle terminator darkening at the bottom-left
        col *= 0.82 + 0.18*smoothstep(-0.6, 0.8, vN.y);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(1.4, 96, 96), globeMat);
  const globeGroup = new THREE.Group();
  globeGroup.add(globe);
  scene.add(globeGroup);

  // ---------- atmosphere glow (soft top-biased halo) ----------
  const atmoMat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uIntensity: { value: 1.0 }, uAtmoCol: { value: new THREE.Vector3(0.80, 0.87, 0.92) } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying vec3 vWorldN;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vWorldN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vN; varying vec3 vV; varying vec3 vWorldN;
      uniform float uIntensity; uniform vec3 uAtmoCol;
      void main(){
        float i = pow(0.78 - dot(vN, vV), 3.2);
        i = clamp(i, 0.0, 1.0);
        float top = smoothstep(-0.1, 1.0, vWorldN.y);
        vec3 c = uAtmoCol;
        gl_FragColor = vec4(c, i * (0.35 + 0.85*top) * uIntensity);
      }`,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.62, 64, 64), atmoMat);
  globeGroup.add(atmo);

  // ---------- orbit rings ----------
  function ringLine(radius, segs, color, opacity) {
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    return new THREE.Line(geo, mat);
  }
  const ringGroup = new THREE.Group();
  const ring1 = ringLine(2.55, 160, 0xa9b4b8, 0.0); // wide horizontal-ish
  ring1.rotation.x = Math.PI * 0.5 - 0.34;
  const ring2 = ringLine(2.15, 160, 0x8c989c, 0.0);
  ring2.rotation.x = Math.PI * 0.5 - 0.5;
  ring2.rotation.z = 0.4;
  ringGroup.add(ring1, ring2);
  scene.add(ringGroup);
  const ringMats = [ring1.material, ring2.material];

  // ---------- nodes (subtle glow points on the main ring) ----------
  function glowSprite() {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(230,238,242,0.95)");
    grd.addColorStop(0.4, "rgba(190,205,212,0.45)");
    grd.addColorStop(1, "rgba(190,205,212,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const nodeTex = glowSprite();
  const nodes = [];
  const nodeAngles = [0.4, 2.1, 3.7, 5.2];
  nodeAngles.forEach(a => {
    const m = new THREE.SpriteMaterial({ map: nodeTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(m);
    s.scale.setScalar(0.22);
    s.position.set(Math.cos(a) * 2.55, 0, Math.sin(a) * 2.55);
    s.userData.angle = a;
    ring1.add(s);
    nodes.push(s);
  });

  // ---------- state ----------
  let progress = 0, motion = 1;
  // tint + atmosphere ease smoothly toward targets so the Tweak feels seamless
  const tintTarget = uniforms.uTint.value.clone();
  const atmoTarget = atmoMat.uniforms.uAtmoCol.value.clone();
  const clock = new THREE.Clock();
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const seg = (p, a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));
  const lerp = (a, b, t) => a + (b - a) * t;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // pause when offscreen
  let visible = true;
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0 });
  io.observe(document.getElementById("globe-section"));

  function applyProgress(p) {
    const mob = matchMedia("(max-width:760px)").matches;
    // camera dolly: ease in during 0.40–0.72
    const dolly = ease(seg(p, 0.40, 0.72));
    camera.position.z = lerp(6.2, 4.75, dolly);
    // globe scale: present from the start, settles to full
    const s = lerp(0.92, 1.0, ease(seg(p, 0.0, 0.45)));
    globeGroup.scale.setScalar(s);
    // shift right late (desktop only) to open left-side text space
    const shift = mob ? 0 : lerp(0, 0.78, ease(seg(p, 0.70, 1.0)));
    globeGroup.position.x = shift;
    ringGroup.position.x = shift;
    // base rotation tied to scroll
    globeGroup.rotation.y = -0.4 + p * Math.PI * 0.62;
    globeGroup.rotation.x = lerp(0.18, 0.05, ease(seg(p, 0.2, 0.7)));
    // rings fade in 0.16–0.42
    const rf = ease(seg(p, 0.16, 0.42));
    ringMats[0].opacity = 0.42 * rf;
    ringMats[1].opacity = 0.26 * rf;
    nodes.forEach(n => { n.material.opacity = 0.9 * rf; });
    // atmosphere swells slightly then calms (visible early so the rim reads from frame one)
    atmoMat.uniforms.uIntensity.value = lerp(0.86, 1.05, ease(seg(p, 0.0, 0.4)));
  }

  let last = 0;
  function tick() {
    requestAnimationFrame(tick);
    if (!visible) return;
    const t = clock.getElapsedTime();
    uniforms.uTime.value = t;
    // seamless tint / atmosphere transitions
    uniforms.uTint.value.lerp(tintTarget, 0.07);
    atmoMat.uniforms.uAtmoCol.value.lerp(atmoTarget, 0.07);
    applyProgress(progress);
    // idle drift on top of scroll rotation
    if (!reduceMotion) {
      globeGroup.rotation.y += 0.0016 * motion;
      ringGroup.rotation.y = t * 0.04 * motion;
    }
    renderer.render(scene, camera);
  }
  tick();

  API.ready = true;
  API.setProgress = (p) => { progress = p; };
  API.setTint = (arr) => { tintTarget.set(arr[0], arr[1], arr[2]); };
  API.setAtmo = (arr) => { atmoTarget.set(arr[0], arr[1], arr[2]); };
  API.setMotion = (m) => { motion = m; };
  // render a single frame synchronously at progress p (used when rAF is throttled / for verification)
  API.renderNow = (p) => { progress = p; uniforms.uTime.value = clock.getElapsedTime(); applyProgress(p); renderer.render(scene, camera); };
}
