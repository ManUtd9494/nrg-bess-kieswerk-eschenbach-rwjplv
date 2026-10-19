// NRG Solution | BESS Gemeindekieswerk Eschenbach LU | 3D-Machbarkeitsstudie
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import * as EN from './engine.js';

const Q = new URLSearchParams(location.search);
const CAPTURE = Q.has('capture');
const $ = (s) => document.querySelector(s);
const DEG = Math.PI / 180, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const fmt = (v, d = 0) => { const s = Number(v).toFixed(d); const [i, f] = s.split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, "'") + (f ? '.' + f : ''); };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function mulberry32(a) { return function () { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const setL = (p, m) => { const b = $('#lbar'); if (b) b.style.width = p + '%'; const t = $('#lmsg'); if (t) t.textContent = m; };
if (CAPTURE) document.body.classList.add('cap'); if (Q.has('legend')) document.body.classList.add('legend');

// ------------------------------------------------------------------ Daten laden
setL(5, 'Gelände, Gebäude und Luftbild werden geladen ...');
const [META, SITE, TBUF, DBUF, BBUF] = await Promise.all([
  fetch('data/terrain.json').then(r => r.json()), fetch('data/site.json').then(r => r.json()),
  fetch('data/terrain_u16.bin').then(r => r.arrayBuffer()), fetch('data/dtm_u16.bin').then(r => r.arrayBuffer()), fetch('data/buildings.bin').then(r => r.arrayBuffer())]);
const HU16 = new Uint16Array(TBUF), DU16 = new Uint16Array(DBUF);
const heightAt = EN.makeHeight(META, HU16), dtmAt = EN.makeHeight(META, DU16);
setL(30, 'Standorte werden bewertet ...');
let PARAMS = JSON.parse(JSON.stringify(EN.DEFAULTS));
let RES = EN.computeAll(SITE, PARAMS, dtmAt, dtmAt);
let curCand = Q.get('cand') || RES.best.cand.id;
const evalFor = (id) => RES.ranked.find(r => r.cand.id === id) || RES.best;

// ------------------------------------------------------------------ Renderer / Szene
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, CAPTURE ? 1 : 2)); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.5;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('#app').appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer(); labelRenderer.setSize(innerWidth, innerHeight); Object.assign(labelRenderer.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 5 }); document.body.appendChild(labelRenderer.domElement);
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xcdd7e2, 520, 1900);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.15, 6000);
camera.position.set(-160, 170, 260);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = 88 * DEG; controls.minDistance = 4; controls.maxDistance = 1500; controls.target.set(40, 0, 10);
const walk = new PointerLockControls(camera, renderer.domElement);
// Himmel und Umgebung
const sky = new Sky(); sky.scale.setScalar(45000); scene.add(sky);
const skyU = sky.material.uniforms; skyU.turbidity.value = 5; skyU.rayleigh.value = 1.4; skyU.mieCoefficient.value = 0.004; skyU.mieDirectionalG.value = 0.82;
const pmrem = new THREE.PMREMGenerator(renderer); const envScene = new THREE.Scene(); const envSky = new Sky(); envSky.scale.setScalar(45000); envScene.add(envSky); let envRT = null;
const sun = new THREE.DirectionalLight(0xfff1dc, 3.0); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera; sc.left = -170; sc.right = 170; sc.top = 170; sc.bottom = -170; sc.near = 10; sc.far = 1200; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun); scene.add(sun.target); sun.target.position.set(40, 0, 0);
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6b6b55, 0.55); scene.add(hemi);
// Nachpass: dezentes Bloom für Lichter und Energiefluss
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.45, 1.6); composer.addPass(bloom); composer.addPass(new OutputPass());
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight); });
const world = new THREE.Group(); scene.add(world);
const bessGroup = new THREE.Group(); scene.add(bessGroup);
const arGroup = new THREE.Group(); scene.add(arGroup);
const flowGroup = new THREE.Group(); scene.add(flowGroup);
const labelGroup = new THREE.Group(); scene.add(labelGroup);
const pickables = [];
const texLoader = new THREE.TextureLoader();
const loadTex = (u) => new Promise((res) => texLoader.load(u, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); res(t); }, undefined, () => res(null)));
function canvasTex(w, h, draw, srgb = true, rep = null) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; }
function noiseCanvas(g, w, h, base, amp, seed = 1, grain = 1) { const r = mulberry32(seed); const im = g.createImageData(w, h); for (let i = 0; i < w * h; i++) { const n = (r() - 0.5) * amp; im.data[i * 4] = clamp(base[0] + n, 0, 255); im.data[i * 4 + 1] = clamp(base[1] + n, 0, 255); im.data[i * 4 + 2] = clamp(base[2] + n * 0.9, 0, 255); im.data[i * 4 + 3] = 255; } g.putImageData(im, 0, 0); }
function makeLabel(html, cls, x, y, z, parent = labelGroup) { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; const o = new CSS2DObject(d); o.position.set(x, y, z); parent.add(o); return o; }
function clearGroup(g) { while (g.children.length) { const c = g.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.isCSS2DObject && o.element) o.element.remove(); }); } }
function setVis(g, v) { g.visible = v; g.traverse(o => { if (o.isCSS2DObject) o.visible = v; }); }
// ------------------------------------------------------------------ Gelände (DTM + Vegetation/Anlagen aus DSM), Luftbild 10 cm
setL(40, 'Luftbild 10 cm wird geladen ...');
const [TEX_BASE, TEX_CORE] = await Promise.all([loadTex(Q.has('lowres') ? 'data/ortho_base_1k.jpg' : 'data/ortho_base.jpg'), loadTex('data/ortho_core.jpg')]);
const N = META.n, X0 = META.x0, Z0 = META.z0, W = (N - 1) * META.step;
const C = SITE.core; const ub0 = (C.x0 - X0) / W, ub1 = (C.x1 - X0) / W, vb0 = 1 - (C.z1 - Z0) / W, vb1 = 1 - (C.z0 - Z0) / W;
if (TEX_CORE) { TEX_CORE.repeat.set(1 / (ub1 - ub0), 1 / (vb1 - vb0)); TEX_CORE.offset.set(-ub0 / (ub1 - ub0), -vb0 / (vb1 - vb0)); TEX_CORE.wrapS = TEX_CORE.wrapT = THREE.ClampToEdgeWrapping; }
const detailTex = canvasTex(256, 256, (g, w, h) => { noiseCanvas(g, w, h, [128, 128, 128], 120, 7); g.globalAlpha = 0.35; for (let i = 0; i < 900; i++) { const r = Math.random() * 2.2 + 0.4; g.fillStyle = Math.random() < 0.5 ? '#3a3a3a' : '#e0e0e0'; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, 7); g.fill(); } }, false, [1, 1]);
detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping;
function addDetail(mat, scale = 0.45, fadeDist = 90, strength = 0.56) {
  mat.onBeforeCompile = (sh) => { sh.uniforms.dMap = { value: detailTex };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vDUv; varying float vDist;').replace('#include <fog_vertex>', '#include <fog_vertex>\nvDUv = (modelMatrix*vec4(transformed,1.0)).xz*' + scale.toFixed(3) + '; vDist = length((modelViewMatrix*vec4(transformed,1.0)).xyz);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D dMap; varying vec2 vDUv; varying float vDist;').replace('#include <map_fragment>', '#include <map_fragment>\nfloat dt = texture2D(dMap,vDUv).r*0.55+texture2D(dMap,vDUv*0.21).r*0.45; diffuseColor.rgb *= mix(1.0, 1.0-' + (strength / 2).toFixed(3) + '+' + strength.toFixed(3) + '*dt, clamp(1.0-vDist/' + fadeDist.toFixed(1) + ',0.0,1.0));'); };
  return mat; }
const matBase = addDetail(new THREE.MeshStandardMaterial({ map: TEX_BASE, roughness: 0.96, metalness: 0, envMapIntensity: 0.35 }));
const matCore = addDetail(new THREE.MeshStandardMaterial({ map: TEX_CORE, roughness: 0.94, metalness: 0, envMapIntensity: 0.35 }));
let terrainMesh;
{ const pos = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; pos[k * 3] = X0 + i * META.step; pos[k * 3 + 1] = HU16[k] / 100 + META.hmin - 476; pos[k * 3 + 2] = Z0 + j * META.step; uv[k * 2] = i / (N - 1); uv[k * 2 + 1] = 1 - j / (N - 1); }
  const core = [], base = [];
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) { const a = j * N + i, b = a + 1, c = a + N, d = c + 1; const x = X0 + i + 0.5, z = Z0 + j + 0.5; const arr = (x > C.x0 + 1 && x < C.x1 - 1 && z > C.z0 + 1 && z < C.z1 - 1) ? core : base; arr.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const idx = new Uint32Array(core.length + base.length); idx.set(core, 0); idx.set(base, core.length); g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.addGroup(0, core.length, 0); g.addGroup(core.length, base.length, 1); g.computeVertexNormals();
  terrainMesh = new THREE.Mesh(g, [matCore, matBase]); terrainMesh.receiveShadow = true; terrainMesh.castShadow = true; terrainMesh.name = 'terrain'; world.add(terrainMesh); pickables.push(terrainMesh); }
// Umland ausserhalb des Ausschnitts (Fernbereich, im Dunst)
{ const g = new THREE.RingGeometry(520, 6000, 64, 1); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x6f7d55, roughness: 1 })); m.position.set(0, -8, -50); world.add(m);
  const g2 = new THREE.PlaneGeometry(1200, 1200); g2.rotateX(-Math.PI / 2); const m2 = new THREE.Mesh(g2, new THREE.MeshStandardMaterial({ color: 0x74825a, roughness: 1 })); m2.position.set(0, -9.5, -50); world.add(m2); }

// ------------------------------------------------------------------ Gebäude (swissBUILDINGS3D 3.0, 2024)
setL(55, 'Gebäudemodelle werden aufgebaut ...');
function parseBin(buf) { const dv = new DataView(buf); const hl = dv.getUint32(0, true); const hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))); const base = 4 + hl; const out = {};
  for (const [k, [off, n, dt]] of Object.entries(hdr)) { const T = dt === 'float32' ? Float32Array : dt === 'int8' ? Int8Array : Uint8Array; out[k] = new T(buf.slice(base + off, base + off + n * T.BYTES_PER_ELEMENT)); } return out; }
const BLD = parseBin(BBUF);
function wallTex(kind) {
  if (kind === 'house') return canvasTex(512, 512, (g, w, h) => { noiseCanvas(g, w, h, [226, 219, 205], 16, 3); const s = w / 6;
    for (const fl of [0, 1]) for (let k = 0; k < 2; k++) { const x = (0.9 + k * 3) * s, y = h - (0.95 + fl * 2.9 + 1.45) * s; const gw = 1.2 * s, gh = 1.45 * s; g.fillStyle = '#f4f2ee'; g.fillRect(x - 6, y - 6, gw + 12, gh + 12); const gr = g.createLinearGradient(x, y, x + gw, y + gh); gr.addColorStop(0, '#5d7084'); gr.addColorStop(1, '#2b3540'); g.fillStyle = gr; g.fillRect(x, y, gw, gh); g.fillStyle = '#f4f2ee'; g.fillRect(x + gw / 2 - 3, y, 6, gh); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x - 6, y + gh + 6, gw + 12, 5); } }, true, [1 / 6, 1 / 6]);
  if (kind === 'metal') return canvasTex(256, 256, (g, w, h) => { noiseCanvas(g, w, h, [196, 201, 206], 10, 5); for (let i = 0; i < 8; i++) { const x = i * w / 8; g.fillStyle = 'rgba(70,80,90,.35)'; g.fillRect(x, 0, 4, h); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 5, 0, 3, h); } }, true, [1 / 2, 1 / 2]);
  if (kind === 'wood') return canvasTex(256, 256, (g, w, h) => { noiseCanvas(g, w, h, [150, 132, 112], 26, 9); for (let i = 0; i < 16; i++) { const x = i * w / 16; g.fillStyle = 'rgba(40,30,20,.45)'; g.fillRect(x, 0, 2, h); g.fillStyle = `rgba(${120 + Math.random() * 40},${105 + Math.random() * 30},${85 + Math.random() * 25},.25)`; g.fillRect(x + 2, 0, w / 16 - 2, h); } }, true, [1 / 2, 1 / 2]);
  return canvasTex(256, 256, (g, w, h) => noiseCanvas(g, w, h, [178, 176, 170], 22, 4), true, [1 / 3, 1 / 3]); }
const WALLMAT = [new THREE.MeshStandardMaterial({ map: wallTex('house'), roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.45 }), new THREE.MeshStandardMaterial({ map: wallTex('metal'), roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide, envMapIntensity: 0.45 }), new THREE.MeshStandardMaterial({ map: wallTex('concrete'), roughness: 0.95, side: THREE.DoubleSide, envMapIntensity: 0.45 }), new THREE.MeshStandardMaterial({ map: wallTex('wood'), roughness: 0.85, side: THREE.DoubleSide, envMapIntensity: 0.45 })];
{ // Wände nach Klasse
  const P = BLD.wall_pos, Nn = BLD.wall_nrm, U = BLD.wall_uv, Cl = BLD.wall_cls; const nT = P.length / 9;
  for (let cls = 0; cls < 4; cls++) { const pos = [], nrm = [], uv = [];
    for (let t = 0; t < nT; t++) { if (Cl[t * 3] !== cls) continue; for (let v = 0; v < 3; v++) { const k = t * 3 + v; pos.push(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]); nrm.push(Nn[k * 3] / 127, Nn[k * 3 + 1] / 127, Nn[k * 3 + 2] / 127); uv.push(U[k * 2], U[k * 2 + 1]); } }
    if (!pos.length) continue; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, WALLMAT[cls]); m.castShadow = true; m.receiveShadow = true; m.name = 'bld'; world.add(m); pickables.push(m); } }
const roofMeshes = [];
{ // Dächer mit Luftbild-Textur (Kern 10 cm bzw. Umgebung)
  const P = BLD.roof_pos, Nn = BLD.roof_nrm; const nT = P.length / 9; const sets = [[[], [], []], [[], [], []]];
  for (let t = 0; t < nT; t++) { const cx = (P[t * 9] + P[t * 9 + 3] + P[t * 9 + 6]) / 3, cz = (P[t * 9 + 2] + P[t * 9 + 5] + P[t * 9 + 8]) / 3; const s = (cx > C.x0 && cx < C.x1 && cz > C.z0 && cz < C.z1) ? sets[0] : sets[1];
    for (let v = 0; v < 3; v++) { const k = t * 3 + v; const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2]; s[0].push(x, y, z); s[1].push(Nn[k * 3] / 127, Nn[k * 3 + 1] / 127, Nn[k * 3 + 2] / 127); s[2].push((x - X0) / W, 1 - (z - Z0) / W); } }
  sets.forEach((s, i) => { if (!s[0].length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(s[0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(s[1], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(s[2], 2));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: i === 0 ? TEX_CORE : TEX_BASE, roughness: 0.75, metalness: 0.1, envMapIntensity: 0.4, side: THREE.DoubleSide })); m.castShadow = true; m.receiveShadow = true; m.name = 'roof'; world.add(m); roofMeshes.push(m); pickables.push(m); }); }

// ------------------------------------------------------------------ Bestehende PV-Anlagen als 3D-Module (Lage aus Luftbild, Leistung aus BFE-Register)
const pvTex = canvasTex(256, 384, (g, w, h) => { g.fillStyle = '#c9ced4'; g.fillRect(0, 0, w, h); g.fillStyle = '#121a2b'; g.fillRect(6, 6, w - 12, h - 12); const cw = (w - 12) / 6, ch = (h - 12) / 10;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 10; j++) { const gr = g.createLinearGradient(0, 6 + j * ch, 0, 6 + (j + 1) * ch); gr.addColorStop(0, '#1d2c4a'); gr.addColorStop(1, '#0f1729'); g.fillStyle = gr; g.fillRect(8 + i * cw, 8 + j * ch, cw - 3, ch - 3); g.fillStyle = 'rgba(180,190,210,.25)'; g.fillRect(8 + i * cw + cw / 2 - 1, 8 + j * ch, 1, ch - 3); } });
const pvMat = new THREE.MeshPhysicalMaterial({ map: pvTex, roughness: 0.22, metalness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 0.9 });
const pvFrameMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.35 });
const PV_FIELDS = [];
{ const ray = new THREE.Raycaster(); const mods = []; const down = V3(0, -1, 0); const modG = new THREE.BoxGeometry(1.72, 0.035, 1.13); const q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const f of SITE.pv) { const a = f.ang * DEG; const ux = Math.cos(a), uz = Math.sin(a); const vx = -uz, vz = ux; const nU = Math.max(1, Math.floor(f.w / 1.76)), nV = Math.max(1, Math.floor(f.h / (f.flat ? 1.9 : 1.16)));
    const field = { ...f, mods: 0, top: -999 };
    for (let iu = 0; iu < nU; iu++) for (let iv = 0; iv < nV; iv++) { const du = (iu - (nU - 1) / 2) * 1.76, dv = (iv - (nV - 1) / 2) * (f.flat ? 1.9 : 1.16); const x = f.c[0] + ux * du + vx * dv, z = f.c[1] + uz * du + vz * dv;
      ray.set(V3(x, f.y + 30, z), down); const hit = ray.intersectObjects(roofMeshes, false)[0]; if (!hit) continue; const n = hit.face.normal.clone(); if (n.y < 0) n.negate();
      const m = new THREE.Matrix4(); const up = n.y > 0.995 ? V3(0, 1, 0) : n;
      // Ausrichtung: Modul-Längsachse entlang des Feldes, Neigung = Dachneigung bzw. 15 Grad Süd auf Flachdach
      const base = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), up); const rotY = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), -a);
      q.copy(base).multiply(rotY); if (f.flat) q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), 15 * DEG));
      m.compose(V3(x, hit.point.y + (f.flat ? 0.45 : 0.14), z), q, V3(1, 1, 1)); mods.push(m); field.mods++; field.top = Math.max(field.top, hit.point.y + 0.2); }
    PV_FIELDS.push(field); }
  const im = new THREE.InstancedMesh(modG, [pvFrameMat, pvFrameMat, pvMat, pvFrameMat, pvFrameMat, pvFrameMat], mods.length); mods.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; im.name = 'pv'; world.add(im); pickables.push(im); }

// ------------------------------------------------------------------ Sonne und Himmel
function sunPos(hour, season) { const lat = 47.13 * DEG; const decl = (season === 'winter' ? -20 : 21) * DEG; const H = (hour - 13.3) * 15 * DEG; // Ortszeit MEZ/MESZ grob
  const el = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H)); const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)); return { el, az }; }
let lastEnvKey = '';
function applySky(hour, season) { const { el, az } = sunPos(hour, season); const d = V3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)); // az ab Süden, positiv West; lokale z = Süden
  const sunDir = V3(-d.x, d.y, d.z); skyU.sunPosition.value.copy(sunDir);
  const day = clamp((el / DEG + 4) / 14, 0, 1); sun.position.copy(sun.target.position).add(sunDir.clone().multiplyScalar(500)); sun.intensity = 3.1 * day * clamp(el / DEG / 6, 0, 1) + 0.0; hemi.intensity = 0.2 + 0.4 * day;
  renderer.toneMappingExposure = lerp(1.0, 0.5, day); scene.fog.color.setHSL(0.59, 0.25, lerp(0.06, 0.84, day));
  const key = (Math.round(hour * 4) / 4) + season; if (key !== lastEnvKey) { lastEnvKey = key; envSky.material.uniforms.sunPosition.value.copy(sunDir); for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) envSky.material.uniforms[k].value = skyU[k].value; if (envRT) envRT.dispose(); envRT = pmrem.fromScene(envScene); scene.environment = envRT.texture; }
  return day; }

// ------------------------------------------------------------------ Bäume (aus swissSURFACE3D erkannt, Farbe aus dem Luftbild)
setL(65, 'Vegetation wird gepflanzt ...');
const TREES = await fetch('data/trees.json').then(r => r.json());
const treeGeoC = (() => { const r = mulberry32(5); const g = []; const n = 6; for (let i = 0; i < n; i++) { const t = i / (n - 1); const rad = 0.46 * (1 - t * 0.8); const h = 0.34 - t * 0.09; let c = new THREE.ConeGeometry(rad, h, 14, 1, true); c.deleteAttribute('normal'); c.deleteAttribute('uv'); c = BGU.mergeVertices(c); const p = c.attributes.position; for (let k = 0; k < p.count; k++) { const y = p.getY(k); if (y < 0) { const sc = 0.82 + r() * 0.34; p.setXYZ(k, p.getX(k) * sc, y - r() * 0.05, p.getZ(k) * sc); } } c.translate(0, 0.2 + t * 0.64 + h / 2, 0); g.push(c); }
  const m = BGU.mergeGeometries(g); m.computeVertexNormals(); const p = m.attributes.position; const col = new Float32Array(p.count * 3); for (let k = 0; k < p.count; k++) { const v = 0.62 + 0.42 * Math.min(1, p.getY(k)) + (r() - 0.5) * 0.16; col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = v; } m.setAttribute('color', new THREE.BufferAttribute(col, 3)); return m; })();
const treeGeoD = (() => { const r = mulberry32(3); const parts = []; const blobs = [[0, 0.6, 0, 0.36], [0.21, 0.5, 0.08, 0.27], [-0.2, 0.52, -0.06, 0.28], [0.05, 0.48, -0.21, 0.26], [-0.07, 0.47, 0.21, 0.26], [0.02, 0.82, 0.03, 0.26], [0.15, 0.72, -0.12, 0.2], [-0.14, 0.74, 0.11, 0.2]];
  for (const [bx, by, bz, br] of blobs) { let g = new THREE.IcosahedronGeometry(br, 2); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = BGU.mergeVertices(g); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const sc = 0.84 + r() * 0.32; p.setXYZ(i, p.getX(i) * sc + bx, p.getY(i) * sc * 0.9 + by, p.getZ(i) * sc + bz); } parts.push(g); }
  const g = BGU.mergeGeometries(parts); g.computeVertexNormals(); const p = g.attributes.position; const col = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const t = Math.min(1, Math.max(0, (p.getY(i) - 0.25) / 0.8)); const v = 0.55 + 0.55 * t + (r() - 0.5) * 0.14; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; })();
const trunkGeo = (() => { const c = new THREE.CylinderGeometry(0.035, 0.06, 0.5, 6); c.translate(0, 0.25, 0); return c; })();
const matTreeC = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95, envMapIntensity: 0.3 }), matTreeD = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95, envMapIntensity: 0.3 }), matTrunk = new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 1 });
{ const r = mulberry32(17); const mc = [], md = [], mt = [], cc = [], cd = []; const q = new THREE.Quaternion(), col = new THREE.Color();
  const mtx = (x, y, z, yaw, s) => new THREE.Matrix4().compose(V3(x, y, z), q.setFromAxisAngle(V3(0, 1, 0), yaw).clone(), V3(s[0], s[1], s[2]));
  const CANDS = SITE.candidates.map(c => c.poly); const TRP = SITE.trafo.poly;
  for (const [x, z, h, rr, con, R, Gc, B] of TREES) { if (CANDS.some(p => EN.pip([x, z], p) || EN.lineDist([x, z], p, true)[0] < Math.min(3, rr * 0.7))) continue; if (TRP && (EN.pip([x, z], TRP) || EN.lineDist([x, z], TRP, true)[0] < rr + 1.0)) continue; const g = dtmAt(x, z); const yaw = r() * 6.28; col.setRGB(Math.min(1, R / 255 * 1.35), Math.min(1, Gc / 255 * 1.35), Math.min(1, B / 255 * 1.3), THREE.SRGBColorSpace);
    if (con) { mc.push(mtx(x, g, z, yaw, [rr * 2.1, h * 0.92, rr * 2.1])); cc.push(col.clone()); mt.push(mtx(x, g, z, yaw, [h * 0.45, h * 0.5, h * 0.45])); }
    else { md.push(mtx(x, g + h * 0.22, z, yaw, [rr * 2.05, h * 0.72, rr * 2.05])); cd.push(col.clone()); mt.push(mtx(x, g, z, yaw, [h * 0.55, h * 0.6, h * 0.55])); } }
  const inst = (geo, mat, arr, cols) => { const im = new THREE.InstancedMesh(geo, mat, arr.length); arr.forEach((m, i) => { im.setMatrixAt(i, m); if (cols) im.setColorAt(i, cols[i]); }); im.castShadow = true; im.receiveShadow = true; world.add(im); return im; };
  inst(treeGeoC, matTreeC, mc, cc); inst(treeGeoD, matTreeD, md, cd); inst(trunkGeo, matTrunk, mt); }
// ------------------------------------------------------------------ BESS-Modelle (20-ft-HC-Container nach Foto NRG Solutions, MS-Skid, Zaun, Anprallschutz)
const M = {
  steel: new THREE.MeshStandardMaterial({ color: 0x5b6168, metalness: 0.75, roughness: 0.42 }),
  galv: new THREE.MeshStandardMaterial({ color: 0xa9b0b7, metalness: 0.85, roughness: 0.33 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x24282d, metalness: 0.5, roughness: 0.5 }),
  white: new THREE.MeshStandardMaterial({ color: 0xdfe3e7, metalness: 0.15, roughness: 0.5, envMapIntensity: 0.45 }),
  grey7033: new THREE.MeshStandardMaterial({ color: 0x7c8778, metalness: 0.35, roughness: 0.5 }),
  concrete: new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (g, w, h) => noiseCanvas(g, w, h, [176, 174, 168], 26, 12), true, [0.5, 0.5]), roughness: 0.95 }),
  gravel: new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, (g, w, h) => { noiseCanvas(g, w, h, [150, 146, 138], 70, 21); for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${90 + Math.random() * 120},${88 + Math.random() * 110},${80 + Math.random() * 100},.8)`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.6, 0, 7); g.fill(); } }, true, [0.6, 0.6]), roughness: 1 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5, metalness: 0.2 }),
  led: new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 2.2 }),
  amber: new THREE.MeshStandardMaterial({ color: 0xffa31a, emissive: 0xff8a00, emissiveIntensity: 0.0 }),
  red: new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.45 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 }),
};
function signTex(kind) { return canvasTex(256, 256, (g, w, h) => {
  if (kind === 'warn') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd200'; g.strokeStyle = '#111'; g.lineWidth = 14; g.beginPath(); g.moveTo(w / 2, 22); g.lineTo(w - 18, h - 30); g.lineTo(18, h - 30); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#111'; g.beginPath(); g.moveTo(140, 70); g.lineTo(100, 140); g.lineTo(128, 140); g.lineTo(112, 200); g.lineTo(160, 118); g.lineTo(132, 118); g.closePath(); g.fill(); }
  else if (kind === 'class9') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4); g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 8; g.fillRect(-80, -80, 160, 160); g.strokeRect(-80, -80, 160, 160); g.beginPath(); g.rect(-80, -80, 160, 80); g.clip(); for (let i = -200; i < 200; i += 22) { g.fillStyle = '#111'; g.fillRect(i, -80, 10, 160); } g.restore(); g.fillStyle = '#111'; g.font = 'bold 54px Arial'; g.textAlign = 'center'; g.fillText('9', w / 2, h / 2 + 62); }
  else if (kind === 'hv') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd200'; g.strokeStyle = '#111'; g.lineWidth = 12; g.beginPath(); g.moveTo(w / 2, 14); g.lineTo(w - 14, 150); g.lineTo(14, 150); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#111'; g.beginPath(); g.moveTo(140, 40); g.lineTo(105, 100); g.lineTo(128, 100); g.lineTo(114, 140); g.lineTo(156, 86); g.lineTo(132, 86); g.closePath(); g.fill(); g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.fillText('HOCHSPANNUNG', w / 2, 195); g.fillText('LEBENSGEFAHR', w / 2, 232); }
  else if (kind === 'info') { g.fillStyle = '#0A2463'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'bold 26px Arial'; g.fillText('BATTERIESPEICHER', 14, 44); g.font = '18px Arial'; ['Zutritt nur für', 'befugtes Personal', '', 'Feuerwehr: 118', 'Betrieb: 24 h Leitstelle', 'Löschmittel: Wasser', '(Kühlung von aussen)'].forEach((t, i) => g.fillText(t, 14, 84 + i * 24)); }
}); }
const SIGN = { warn: signTex('warn'), class9: signTex('class9'), hv: signTex('hv'), info: signTex('info') };
function doorTex() { return canvasTex(2048, 1024, (g, w, h) => {
  const s = w / 6.058; noiseCanvas(g, w, h, [214, 218, 222], 7, 31);
  const leaves = [0.12, 0.62, 1.42, 2.22, 3.02, 3.82, 4.62, 5.4]; // Kanten der Türflügel (m)
  for (const x of leaves) { g.fillStyle = '#2b3036'; g.fillRect(x * s - 3, 0.05 * s, 7, h); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x * s + 5, 0.05 * s, 2, h); }
  g.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < leaves.length - 1; i++) { g.fillRect(leaves[i] * s + 18, 0.12 * s, (leaves[i + 1] - leaves[i]) * s - 36, 4); g.fillRect(leaves[i] * s + 18, h - 0.2 * s, (leaves[i + 1] - leaves[i]) * s - 36, 4); }
  // Lüftungsgitter rechts
  g.fillStyle = '#c7ccd1'; g.fillRect(5.45 * s, 0.25 * s, 0.5 * s, h - 0.5 * s); g.fillStyle = '#3a4047'; for (let y = 0.35 * s; y < h - 0.35 * s; y += 13) g.fillRect(5.5 * s, y, 0.4 * s, 6);
  // Farbstreifen
  g.fillStyle = '#1f6fd1'; g.fillRect(0.68 * s, 0.35 * s, 0.07 * s, h * 0.6); g.fillStyle = '#58c23c'; g.fillRect(2.28 * s, 0.35 * s, 0.07 * s, h * 0.6);
  // Logo NRG SOLUTIONS (vertikal)
  g.save(); g.translate(2.62 * s, 0.62 * h); g.rotate(-Math.PI / 2); g.fillStyle = '#2b3138'; g.font = `bold ${0.36 * s}px Arial`; g.fillText('NRG', 0, 0); g.fillStyle = '#58c23c'; g.fillRect(0.06 * s, -0.36 * s, 0.05 * s, 0.38 * s); g.fillStyle = '#2b3138'; g.font = `${0.11 * s}px Arial`; g.fillText('S O L U T I O N S', 0, 0.16 * s); g.restore();
  g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 3; g.fillRect(0.82 * s, 0.32 * s, 0.22 * s, 0.22 * s); g.strokeRect(0.82 * s, 0.32 * s, 0.22 * s, 0.22 * s); g.fillStyle = '#111'; g.font = `bold ${0.16 * s}px Arial`; g.fillText('1', 0.88 * s, 0.49 * s);
  const drawImg = (t, x, y, sz) => { g.drawImage(t.image, x * s, y * s, sz * s, sz * s); };
  drawImg(SIGN.class9, 4.25, 0.62, 0.3); drawImg(SIGN.warn, 4.62, 0.62, 0.3); drawImg(SIGN.warn, 1.95, 1.18, 0.26); drawImg(SIGN.warn, 3.48, 1.18, 0.26);
  g.fillStyle = '#e4c23a'; g.fillRect(5.47 * s, 0.1 * s, 0.25 * s, 0.12 * s); g.fillStyle = '#111'; for (let i = 0; i < 4; i++) { g.save(); g.translate(5.47 * s + i * 0.07 * s, 0.1 * s); g.fillRect(0, 0, 0.03 * s, 0.12 * s); g.restore(); }
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, h - 0.12 * s, w, 0.12 * s); }); }
function backTex() { return canvasTex(1024, 512, (g, w, h) => { noiseCanvas(g, w, h, [212, 216, 220], 7, 33); for (let i = 0; i < 60; i++) { const x = i * w / 60; g.fillStyle = 'rgba(60,70,80,.16)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 4, 0, 2, h); } }); }
const TEX_DOOR = doorTex(), TEX_BACK = backTex();
const MAT_DOOR = new THREE.MeshStandardMaterial({ map: TEX_DOOR, roughness: 0.5, metalness: 0.2, envMapIntensity: 0.45 }), MAT_BACK = new THREE.MeshStandardMaterial({ map: TEX_BACK, roughness: 0.52, metalness: 0.2, envMapIntensity: 0.45 });
function box(w, h, d, mat, x, y, z, parent, cast = true) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; }
function cyl(r, h, mat, x, y, z, parent, seg = 12) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }
function makeContainer(U) {
  const g = new THREE.Group(); const L = U.L, Wd = U.W, H = U.H; const y0 = 0.12;
  // Korpus: Vorderseite (Türen, +z), Rückseite (Rippen), Stirnseiten, Dach
  const body = new THREE.Mesh(new THREE.BoxGeometry(L - 0.06, H - 0.24, Wd - 0.06), [M.white, M.white, M.white, M.white, MAT_DOOR, MAT_BACK]); body.position.set(0, y0 + 0.12 + (H - 0.24) / 2, 0); body.castShadow = true; body.receiveShadow = true; g.add(body);
  // Rahmen: Eckpfosten, Ober- und Unterrahmen, ISO-Eckbeschläge
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { box(0.14, H, 0.14, M.galv, sx * (L / 2 - 0.07), y0 + H / 2, sz * (Wd / 2 - 0.07), g); for (const yy of [y0 + 0.06, y0 + H - 0.06]) box(0.18, 0.12, 0.17, M.steel, sx * (L / 2 - 0.08), yy, sz * (Wd / 2 - 0.075), g); }
  for (const sz of [-1, 1]) { box(L, 0.16, 0.12, M.steel, 0, y0 + 0.08, sz * (Wd / 2 - 0.06), g); box(L, 0.1, 0.1, M.galv, 0, y0 + H - 0.05, sz * (Wd / 2 - 0.05), g); }
  for (const sx of [-1, 1]) { box(0.12, 0.16, Wd, M.steel, sx * (L / 2 - 0.06), y0 + 0.08, 0, g); box(0.1, 0.1, Wd, M.galv, sx * (L / 2 - 0.05), y0 + H - 0.05, 0, g); }
  // Verriegelungsstangen und Griffe an jedem Türflügel
  const edges = [0.12, 0.62, 1.42, 2.22, 3.02, 3.82, 4.62, 5.4];
  for (let i = 0; i < edges.length - 1; i++) { const xm = -L / 2 + (edges[i] + edges[i + 1]) / 2; for (const off of [-0.18, 0.18]) { const x = xm + off; cyl(0.014, H - 0.42, M.galv, x, y0 + H / 2, Wd / 2 + 0.03, g, 8); box(0.05, 0.05, 0.05, M.galv, x, y0 + 0.28, Wd / 2 + 0.03, g); box(0.05, 0.05, 0.05, M.galv, x, y0 + H - 0.3, Wd / 2 + 0.03, g); }
    box(0.04, 0.22, 0.05, M.dark, xm + 0.18, y0 + 1.15, Wd / 2 + 0.06, g); box(0.16, 0.035, 0.05, M.galv, xm + 0.1, y0 + 1.15, Wd / 2 + 0.07, g);
    for (const yy of [0.5, H - 0.55]) box(0.06, 0.14, 0.04, M.steel, -L / 2 + edges[i] + 0.04, y0 + yy, Wd / 2 + 0.025, g); }
  // Stirnseite +x: Lüftungslamellen und Kühlaggregat
  const louv = new THREE.Group(); louv.position.set(L / 2 + 0.005, y0 + 1.5, 0); g.add(louv);
  box(0.06, 1.9, 1.7, M.white, 0, 0, 0, louv); for (let k = 0; k < 22; k++) { const sl = box(0.04, 0.012, 1.55, M.dark, 0.03, -0.9 + k * 0.085, 0, louv); sl.rotation.z = -0.5; }
  const hv = new THREE.Group(); hv.position.set(L / 2 + 0.33, y0 + 0.75, 0); g.add(hv); box(0.6, 1.3, 1.9, M.white, 0, 0, 0, hv); for (const zz of [-0.45, 0.45]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 8, 24), M.dark); ring.rotation.y = Math.PI / 2; ring.position.set(0.31, 0.15, zz); hv.add(ring); const fan = new THREE.Mesh(new THREE.CircleGeometry(0.31, 20), M.dark); fan.rotation.y = Math.PI / 2; fan.position.set(0.305, 0.15, zz); hv.add(fan); fan.userData.fan = true; }
  // Dach: Entlüftungshauben, Gasdetektion, Blitzleuchte
  for (const x of [-1.8, 0, 1.8]) box(0.35, 0.12, 0.35, M.galv, x, y0 + H + 0.06, -0.4, g);
  const beacon = cyl(0.07, 0.14, M.amber, -L / 2 + 0.3, y0 + H + 0.08, Wd / 2 - 0.3, g, 14); beacon.userData.beacon = true;
  box(1.6, 0.03, 0.03, M.led, -0.8, y0 + H - 0.2, Wd / 2 + 0.035, g, false);
  // Kabeleinführung und Erdung
  box(0.5, 0.3, 0.25, M.steel, -L / 2 + 0.6, y0 + 0.35, -Wd / 2 - 0.12, g); cyl(0.02, 0.6, new THREE.MeshStandardMaterial({ color: 0x2f9e44 }), -L / 2 + 0.25, y0 + 0.1, -Wd / 2 + 0.2, g, 6);
  g.userData.kind = 'battery'; return g; }
function makeSkid(S) {
  const g = new THREE.Group(); const L = S.L, Wd = S.W; const y0 = 0.12;
  box(L, 0.22, Wd, M.steel, 0, y0 + 0.11, 0, g); box(L - 0.2, 0.06, Wd - 0.2, M.galv, 0, y0 + 0.25, 0, g);
  // Wechselrichter (PCS)
  const pcs = new THREE.Group(); pcs.position.set(-L / 2 + 1.3, y0 + 0.28, 0); g.add(pcs);
  const pcsTex = canvasTex(512, 512, (c, w, h) => { noiseCanvas(c, w, h, [228, 231, 234], 6, 41); c.fillStyle = '#2b3036'; for (const x of [w / 2]) c.fillRect(x - 2, 0, 4, h); for (let i = 0; i < 2; i++) { c.fillStyle = '#3a4047'; for (let y = 60; y < 200; y += 12) c.fillRect(30 + i * w / 2, y, w / 2 - 60, 6); for (let y = 330; y < 470; y += 12) c.fillRect(30 + i * w / 2, y, w / 2 - 60, 6); } c.drawImage(SIGN.hv.image, w / 2 - 70, 220, 140, 140); });
  const pcsMat = new THREE.MeshStandardMaterial({ map: pcsTex, roughness: 0.45, metalness: 0.2 });
  const pb = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.35, 1.5), [M.white, M.white, M.white, M.white, pcsMat, pcsMat]); pb.position.y = 1.175; pb.castShadow = true; pcs.add(pb);
  for (const x of [-0.55, 0.55]) { box(0.8, 0.28, 0.8, M.white, x, 2.5, 0, pcs); const f = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), M.dark); f.rotation.x = -Math.PI / 2; f.position.set(x, 2.645, 0); pcs.add(f); f.userData.fanY = true; }
  // Transformator (Esteröl) mit Kühlrippen und Durchführungen
  const tr = new THREE.Group(); tr.position.set(0.6, y0 + 0.28, 0); g.add(tr);
  box(1.3, 1.55, 0.95, M.grey7033, 0, 0.775, 0, tr); box(1.4, 0.08, 1.05, M.grey7033, 0, 1.6, 0, tr);
  for (const sz of [-1, 1]) for (let k = 0; k < 11; k++) box(0.03, 1.2, 0.32, M.grey7033, -0.6 + k * 0.12, 0.75, sz * 0.64, tr);
  for (let k = 0; k < 3; k++) { cyl(0.05, 0.35, new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.4 }), -0.35 + k * 0.35, 1.82, -0.2, tr, 10); cyl(0.035, 0.22, M.galv, -0.35 + k * 0.35, 1.75, 0.25, tr, 8); }
  // MS-Schaltanlage (RMU)
  const rmuTex = canvasTex(256, 512, (c, w, h) => { noiseCanvas(c, w, h, [190, 195, 199], 8, 43); c.strokeStyle = '#222'; c.lineWidth = 4; c.strokeRect(20, 20, w - 40, h - 40); c.fillStyle = '#c8102e'; c.fillRect(40, 120, w - 80, 8); c.fillStyle = '#111'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(60 + i * 68, 200, 18, 0, 7); c.fill(); } c.drawImage(SIGN.hv.image, w / 2 - 60, 300, 120, 120); });
  const rmu = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.95, 1.0), [M.grey7033, M.grey7033, M.grey7033, M.grey7033, new THREE.MeshStandardMaterial({ map: rmuTex, roughness: 0.5, metalness: 0.3 }), M.grey7033]); rmu.position.set(L / 2 - 0.8, y0 + 0.28 + 0.975, 0); rmu.castShadow = true; g.add(rmu);
  // Kabelpritschen, Auffangwanne, Geländer
  box(1.7, 0.08, 0.3, M.galv, -0.15, y0 + 2.1, -0.55, g); box(1.3, 0.15, 1.1, M.dark, 0.6, y0 + 0.33, 0, g);
  for (const sz of [-1, 1]) { box(L - 0.3, 0.04, 0.04, M.yellow, 0, y0 + 1.25, sz * (Wd / 2 - 0.05), g); for (let x = -L / 2 + 0.2; x <= L / 2 - 0.2; x += 1.4) box(0.04, 1.0, 0.04, M.yellow, x, y0 + 0.78, sz * (Wd / 2 - 0.05), g); }
  g.userData.kind = 'skid'; return g; }
function makeFence(poly, y, gate) {
  const g = new THREE.Group(); const panTex = canvasTex(256, 256, (c, w, h) => { c.clearRect(0, 0, w, h); c.strokeStyle = '#2f5d3a'; c.lineWidth = 5; for (let x = 0; x <= w; x += 20) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } c.lineWidth = 7; for (let yy = 0; yy <= h; yy += 64) { c.beginPath(); c.moveTo(0, yy); c.lineTo(w, yy); c.stroke(); } });
  panTex.wrapS = THREE.RepeatWrapping; const pm = new THREE.MeshStandardMaterial({ map: panTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.5 });
  const post = new THREE.MeshStandardMaterial({ color: 0x2f5d3a, metalness: 0.4, roughness: 0.5 });
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]); const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const n = Math.max(1, Math.round(d / 2.5)); for (let k = 0; k <= n; k++) { const t = k / n; const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.1, 0.06), post); p.position.set(x, y + 1.05, z); p.castShadow = true; g.add(p); }
    const pl = new THREE.PlaneGeometry(d, 2.0); const tx = pm.clone(); tx.map = panTex.clone(); tx.map.needsUpdate = true; tx.map.repeat.set(d / 2.5, 1); const m = new THREE.Mesh(pl, tx); m.position.set((a[0] + b[0]) / 2, y + 1.0, (a[1] + b[1]) / 2); m.rotation.y = -ang; m.castShadow = true; g.add(m); }
  return g; }
function makeBollard(x, y, z) { const g = new THREE.Group(); const t = canvasTex(64, 128, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#111' : '#f2c200'; c.fillRect(0, i * h / 8, w, h / 8); } }); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 1.1, 16), new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.3 })); m.position.set(x, y + 0.55, z); m.castShadow = true; g.add(m); return g; }
function makeSignPost(x, y, z, ang, tex) { const g = new THREE.Group(); const p = cyl(0.03, 1.8, M.galv, 0, 0.9, 0, g, 8); const b = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.5 })); b.position.set(0, 1.6, 0.03); g.add(b); g.position.set(x, y, z); g.rotation.y = ang; return g; }
function makeLightMast(x, y, z) { const g = new THREE.Group(); cyl(0.06, 6, M.galv, 0, 3, 0, g, 10); box(0.6, 0.1, 0.3, M.dark, 0.25, 6.0, 0, g); const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.22), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d6, emissiveIntensity: 0 })); lamp.rotation.x = Math.PI / 2; lamp.position.set(0.25, 5.94, 0); g.add(lamp); lamp.userData.lamp = true; const sl = new THREE.SpotLight(0xfff1d6, 0, 28, 0.9, 0.6, 1.4); sl.position.set(0.25, 5.9, 0); sl.target.position.set(0.25, 0, 0); g.add(sl); g.add(sl.target); sl.userData.lampLight = true; g.position.set(x, y, z); return g; }

// ------------------------------------------------------------------ Aufbau der Anlage am gewählten Standort
let CUR = null; const fans = [], beacons = [], lamps = [];
function buildBESS(ev) {
  clearGroup(bessGroup); fans.length = 0; beacons.length = 0; lamps.length = 0; CUR = ev; const L = ev.layout; const y = L.ybase;
  // Kiesbett mit Randabschluss und Streifenfundamenten
  const padShape = new THREE.Shape(L.pad.map(p => new THREE.Vector2(p[0], -p[1])));
  const padG = new THREE.ExtrudeGeometry(padShape, { depth: 1.6, bevelEnabled: false }); padG.rotateX(-Math.PI / 2); const pad = new THREE.Mesh(padG, M.gravel); pad.position.y = y - 1.6; pad.receiveShadow = true; bessGroup.add(pad);
  for (let i = 0; i < 4; i++) { const a = L.pad[i], b = L.pad[(i + 1) % 4]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]); const m = new THREE.Mesh(new THREE.BoxGeometry(d, 0.18, 0.1), M.concrete); m.position.set((a[0] + b[0]) / 2, y + 0.04, (a[1] + b[1]) / 2); m.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); bessGroup.add(m); }
  for (const u of L.units) {
    const grp = u.type === 'battery' ? makeContainer(RES.P.unit) : makeSkid(RES.P.skid);
    // Ausrichtung: lokale +z (Türseite) zeigt zur Fahrgasse (u.front)
    const ang = Math.atan2(u.front[1], u.front[0]); grp.rotation.y = -(ang - Math.PI / 2); grp.position.set(u.c[0], y, u.c[1]);
    // Streifenfundamente
    for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(u.L + 0.1, 0.25, 0.45), M.concrete); f.position.set(0, -0.0, s * (u.W / 2 - 0.3)); f.receiveShadow = true; grp.add(f); }
    grp.traverse(o => { if (o.userData.fan || o.userData.fanY) fans.push(o); if (o.userData.beacon) beacons.push(o); });
    grp.userData.info = u; grp.name = u.id; bessGroup.add(grp); grp.traverse(o => { if (o.isMesh) o.userData.pick = u.id; }); pickables.push(grp);
  }
  bessGroup.add(makeFence(L.fence, y, L.gate));
  for (const b of L.bollards) bessGroup.add(makeBollard(b[0], Math.max(dtmAt(b[0], b[1]), y - 0.1), b[1]));
  const f0 = L.fence[3], f1 = L.fence[2]; const fa = Math.atan2(f1[1] - f0[1], f1[0] - f0[0]);
  bessGroup.add(makeSignPost(f0[0] + Math.cos(fa) * 1.2 + L.nv[0] * 0.25, y, f0[1] + Math.sin(fa) * 1.2 + L.nv[1] * 0.25, -fa, SIGN.info));
  const lm = makeLightMast(L.fence[0][0], y, L.fence[0][1]); bessGroup.add(lm); lm.traverse(o => { if (o.userData.lamp || o.userData.lampLight) lamps.push(o); });
  // Feuerlöscher / Not-Aus
  const ex = new THREE.Group(); box(0.5, 0.8, 0.3, M.red, 0, 0.9, 0, ex); ex.position.set(f1[0] - Math.cos(fa) * 1.2 + L.nv[0] * 0.3, y, f1[1] - Math.sin(fa) * 1.2 + L.nv[1] * 0.3); ex.rotation.y = -fa; bessGroup.add(ex);
}

// ------------------------------------------------------------------ Trafostation: flacher Betonanbau an der Heizzentrale
function makeTrafoStation(T) {
  const g = new THREE.Group(); const y = T.y, h = T.h || 3.0; const P = T.poly;
  const conc = new THREE.MeshStandardMaterial({ map: canvasTex(512, 256, (c, w, hh) => { noiseCanvas(c, w, hh, [182, 180, 173], 22, 61); c.strokeStyle = 'rgba(90,90,85,.35)'; c.lineWidth = 2; for (let x = 0; x < w; x += 128) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, hh); c.stroke(); } c.beginPath(); c.moveTo(0, hh / 2); c.lineTo(w, hh / 2); c.stroke(); for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(60,60,55,.25)'; c.beginPath(); c.arc(Math.random() * w, Math.random() * hh, 2, 0, 7); c.fill(); } }, true, [0.4, 0.33]), roughness: 0.92, side: THREE.DoubleSide, envMapIntensity: 0.4 });
  const sh = new THREE.Shape(P.map(p => new THREE.Vector2(p[0], -p[1]))); const body = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false }); body.rotateX(-Math.PI / 2);
  // UV für Seitenwände aus Weltkoordinaten (Meter)
  const pa = body.attributes.position, uv = body.attributes.uv; for (let i = 0; i < pa.count; i++) uv.setXY(i, pa.getX(i) + pa.getZ(i), pa.getY(i));
  const m = new THREE.Mesh(body, conc); m.position.y = y - 0.3; m.castShadow = true; m.receiveShadow = true; g.add(m);
  // Dachrand (Attika) und Flachdach mit Kies
  const c = EN.centroid(P); const big = P.map(p => [c[0] + (p[0] - c[0]) * 1.06, c[1] + (p[1] - c[1]) * 1.06]);
  const capG = new THREE.ExtrudeGeometry(new THREE.Shape(big.map(p => new THREE.Vector2(p[0], -p[1]))), { depth: 0.18, bevelEnabled: false }); capG.rotateX(-Math.PI / 2);
  const cap = new THREE.Mesh(capG, M.concrete); cap.position.y = y + h - 0.3; cap.castShadow = true; g.add(cap);
  const roofG = new THREE.ShapeGeometry(new THREE.Shape(P.map(p => new THREE.Vector2(p[0], -p[1])))); roofG.rotateX(-Math.PI / 2); const roof = new THREE.Mesh(roofG, M.gravel); roof.position.y = y + h - 0.1; g.add(roof);
  // Türen und Lüftungsgitter auf der Nordseite (Kante P3 -> P2), Gitter auf der Westseite
  const doorTexT = canvasTex(256, 512, (c2, w, hh) => { noiseCanvas(c2, w, hh, [128, 134, 138], 10, 63); c2.strokeStyle = '#3b4146'; c2.lineWidth = 6; c2.strokeRect(6, 6, w - 12, hh - 12); c2.fillStyle = '#2e3337'; for (let yy = 40; yy < 150; yy += 12) c2.fillRect(30, yy, w - 60, 6); for (let yy = hh - 150; yy < hh - 40; yy += 12) c2.fillRect(30, yy, w - 60, 6); c2.drawImage(SIGN.hv.image, w / 2 - 55, 200, 110, 110); c2.fillStyle = '#c9ced3'; c2.fillRect(w - 40, hh / 2, 18, 40); });
  const dmat = new THREE.MeshStandardMaterial({ map: doorTexT, metalness: 0.5, roughness: 0.45 });
  const face = (a, b, k, wD, hD, mat, off = 0.02) => { const dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz); const ux = dx / L, uz = dz / L; const cxp = c; const mx = a[0] + dx * k, mz = a[1] + dz * k; let nx = uz, nz = -ux; if ((mx - cxp[0]) * nx + (mz - cxp[1]) * nz < 0) { nx = -nx; nz = -nz; }
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(wD, hD), mat); pl.position.set(mx + nx * off, y + hD / 2 - 0.02, mz + nz * off); pl.rotation.y = Math.atan2(nx, nz); g.add(pl); return pl; };
  face(P[3], P[2], 0.3, 1.25, 2.25, dmat); face(P[3], P[2], 0.62, 1.25, 2.25, dmat);
  const grill = new THREE.MeshStandardMaterial({ map: canvasTex(256, 128, (c2, w, hh) => { c2.fillStyle = '#9aa1a6'; c2.fillRect(0, 0, w, hh); c2.fillStyle = '#23282c'; for (let yy = 8; yy < hh - 6; yy += 10) c2.fillRect(8, yy, w - 16, 5); }), metalness: 0.5, roughness: 0.5 });
  const gr = face(P[0], P[3], 0.5, 1.6, 0.6, grill); gr.position.y = y + 2.2;
  // Kiesstreifen und Kabelschacht vor den Türen
  const cs = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 1.0), M.steel); const a = P[3], b = P[2]; cs.position.set((a[0] + b[0]) / 2 + (c[0] - (a[0] + b[0]) / 2) * -0.6, y + 0.02, (a[1] + b[1]) / 2 + (c[1] - (a[1] + b[1]) / 2) * -0.6); g.add(cs);
  g.traverse(o => { if (o.isMesh) o.userData.trafo = true; }); return g; }
const TRAFO_MODEL = makeTrafoStation(SITE.trafo); world.add(TRAFO_MODEL); pickables.push(TRAFO_MODEL);
// ------------------------------------------------------------------ AR-Ebenen: Masse, Abstände, Puffer, Fahrwege, Zonen, Lärm, Kabel, Raster
const LAYERS = { dims: false, dist: true, wald: false, roads: false, zones: false, flows: true, noise: false, labels: true, grid: false, cands: false, cable: true, nisv: false };
for (const kv of (Q.get('layers') || '').split(',').filter(Boolean)) { const [k, v] = kv.split(':'); if (k in LAYERS) LAYERS[k] = v === '1'; }
const AR = {}; for (const k of Object.keys(LAYERS)) { AR[k] = new THREE.Group(); AR[k].name = 'ar-' + k; arGroup.add(AR[k]); }
const STC = { ok: 0x16a34a, warn: 0xd97706, fail: 0xdc2626, info: 0x1e56a0 };
function arLine(pts3, color, width = 0.07, opacity = 1, parent = null, dashed = false) { // flache Röhre statt dünner Linie (gut sichtbar)
  pts3 = pts3.filter((p, i) => i === 0 || p.distanceTo(pts3[i - 1]) > 0.05); if (pts3.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(pts3, false, 'catmullrom', 0.01); const g = new THREE.TubeGeometry(curve, Math.max(8, pts3.length * 6), width, 6, false);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 })); if (parent) parent.add(m); return m; }
function drapedPts(pts2, off = 0.25, step = 1.0, hf = heightAt) { const out = []; for (let i = 0; i < pts2.length - 1; i++) { const a = pts2[i], b = pts2[i + 1]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.ceil(d / step)); for (let k = 0; k < n; k++) { const t = k / n; const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; out.push(V3(x, hf(x, z) + off, z)); } } const l = pts2[pts2.length - 1]; out.push(V3(l[0], hf(l[0], l[1]) + off, l[1])); return out; }
function addDim3(A, B, text, status, parent, opts = {}) {
  const col = STC[status] || STC.info; const d = B.clone().sub(A); const L = d.length(); if (L < 0.05) return; const dn = d.clone().normalize();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(opts.r || 0.035, opts.r || 0.035, L, 6), new THREE.MeshBasicMaterial({ color: col, depthTest: !opts.top })); cyl.position.copy(A.clone().add(B).multiplyScalar(0.5)); cyl.quaternion.setFromUnitVectors(V3(0, 1, 0), dn); cyl.renderOrder = 10; parent.add(cyl);
  for (const [P0, s] of [[A, -1], [B, 1]]) { const c = new THREE.Mesh(new THREE.ConeGeometry(opts.cone || 0.13, 0.36, 10), new THREE.MeshBasicMaterial({ color: col, depthTest: !opts.top })); c.position.copy(P0.clone().add(dn.clone().multiplyScalar(-s * 0.18))); c.quaternion.setFromUnitVectors(V3(0, 1, 0), dn.clone().multiplyScalar(s)); c.renderOrder = 10; parent.add(c);
    if (!opts.noTick) { const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4), new THREE.MeshBasicMaterial({ color: col })); tk.position.set(P0.x, P0.y - 0.4, P0.z); parent.add(tk); } }
  const lt = opts.lt ?? 0.5; makeLabel(text, 'dim ' + (status || 'info'), A.x + (B.x - A.x) * lt + (opts.lx || 0), A.y + (B.y - A.y) * lt + (opts.ly ?? 0.35), A.z + (B.z - A.z) * lt + (opts.lz || 0), parent); }
// Geländedrapierte Rasterüberlagerung (Daten-Textur)
function drape(x0, z0, w, h, res, colorFn, lift = 0.35, hf = heightAt) {
  const nx = Math.ceil(w / res), nz = Math.ceil(h / res); const data = new Uint8Array(nx * nz * 4);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const c = colorFn(x0 + (i + 0.5) * res, z0 + (j + 0.5) * res); if (!c) continue; const k = ((nz - 1 - j) * nx + i) * 4; data[k] = c[0]; data[k + 1] = c[1]; data[k + 2] = c[2]; data[k + 3] = c[3]; }
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  const gx = Math.ceil(w / 2), gz = Math.ceil(h / 2); const g = new THREE.PlaneGeometry(w, h, gx, gz); g.rotateX(-Math.PI / 2); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + x0 + w / 2, z = p.getZ(i) + z0 + h / 2; p.setXYZ(i, x, hf(x, z) + lift, z); } g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })); m.renderOrder = 3; return m; }
const WALD_POLYS = SITE.zones.filter(z => z.t === 'Wald').map(z => z.poly);
function buildStaticAR() {
  // Waldabstand: 10-m- und 20-m-Bänder ausserhalb des Waldes
  clearGroup(AR.wald);
  AR.wald.add(drape(-140, -200, 260, 300, 1, (x, z) => { if (WALD_POLYS.some(p => EN.pip([x, z], p))) return [20, 110, 40, 70]; let d = Infinity; for (const w of SITE.waldgrenze) d = Math.min(d, EN.lineDist([x, z], w)[0]); if (d < 10) return [220, 38, 38, 105]; if (d < 20) return [245, 140, 30, 80]; if (d < 20.6) return [245, 140, 30, 200]; return null; }, 0.4, dtmAt));
  for (const w of SITE.waldgrenze) arLine(drapedPts(w, 0.6), 0x16a34a, 0.12, 1, AR.wald);
  { const w = SITE.waldgrenze.reduce((a, b) => EN.polyLen(b) > EN.polyLen(a) ? b : a); const m = w[Math.floor(w.length / 2)]; makeLabel('Statische Waldgrenze<small>Waldabstand 20 m (§ 136 PBG LU), Ausnahme bis 10 m</small>', 'lbl', m[0], heightAt(m[0], m[1]) + 6, m[1], AR.wald); }
  // Zonen
  clearGroup(AR.zones);
  const zcol = { 'Arbeitszone IV bis 20m': [255, 160, 40], 'Grünzone': [60, 190, 80], 'Wald': [20, 110, 40], 'Strassen': [150, 150, 160], 'Abbauzone': [160, 100, 60], 'Belastet, untersuchungsbedürftig': [220, 40, 200] };
  AR.zones.add(drape(-200, -200, 400, 360, 1, (x, z) => { for (const zz of SITE.zones) { if (zz.t.startsWith('Belastet') && EN.pip([x, z], zz.poly)) return ((Math.floor(x + z) % 3) === 0) ? [220, 40, 200, 170] : [220, 40, 200, 60]; } for (const zz of SITE.zones) { const c = zcol[zz.t]; if (c && EN.pip([x, z], zz.poly)) return [...c, 48]; } return null; }, 0.3, dtmAt));
  for (const zz of SITE.zones) { const c = zcol[zz.t]; if (!c || zz.t === 'Wald') continue; arLine(drapedPts([...zz.poly, zz.poly[0]], 0.35, 1.5, dtmAt), new THREE.Color(`rgb(${c[0]},${c[1]},${c[2]})`).getHex(), 0.06, 0.9, AR.zones); }
  const zl = [['Arbeitszone IV', [10, 40]], ['Grünzone', [70, 30]], ['Wald', [-80, -20]], ['Belasteter Standort', [-25, 52]], ['Wald', [30, -80]]];
  for (const [t, p] of zl) makeLabel(t, 'lbl', p[0], heightAt(p[0], p[1]) + 4, p[1], AR.zones);
  // Fahrwege
  clearGroup(AR.roads);
  for (const r of SITE.roads) { const col = r.kind === 'public' ? 0x64748b : 0xf59e0b; const pts = drapedPts(r.pts, 0.3, 1.5, dtmAt);
    const strip = new THREE.Mesh(ribbonGeo(pts, r.w), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide })); strip.renderOrder = 4; AR.roads.add(strip);
    const m = r.pts[Math.floor(r.pts.length / 2)]; makeLabel(r.name + (r.kind === 'werk' ? '<small>Fahrweg freihalten</small>' : ''), 'lbl', m[0], dtmAt(m[0], m[1]) + 3, m[1], AR.roads); }
  for (const a of SITE.areas) { const m = new THREE.Mesh(polyGeo(a.poly, dtmAt, 0.32), new THREE.MeshBasicMaterial({ color: a.kind === 'parking' ? 0x60a5fa : 0xf59e0b, transparent: true, opacity: 0.22, depthWrite: false })); m.renderOrder = 4; AR.roads.add(m); const c = EN.centroid(a.poly); makeLabel(a.name, 'lbl', c[0], dtmAt(c[0], c[1]) + 3, c[1], AR.roads); }
  buildChevrons();
}
function ribbonGeo(pts, w) { const pos = [], idx = []; for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const d = V3(b.x - a.x, 0, b.z - a.z).normalize(); const n = V3(-d.z, 0, d.x).multiplyScalar(w / 2); pos.push(pts[i].x + n.x, pts[i].y, pts[i].z + n.z, pts[i].x - n.x, pts[i].y, pts[i].z - n.z); if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); } } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g; }
function polyGeo(poly, hf, lift) { const sh = new THREE.Shape(poly.map(p => new THREE.Vector2(p[0], -p[1]))); const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, hf(x, z) + lift); } return g; }
// Animierte Pfeile auf den Werkfahrwegen
const CHEV = []; function buildChevrons() { const g = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.9, -0.7), new THREE.Vector2(0, 0.6), new THREE.Vector2(0.9, -0.7), new THREE.Vector2(0, -0.2)])); g.rotateX(-Math.PI / 2);
  for (const r of SITE.roads.filter(r => r.kind === 'werk')) { const pts = drapedPts(r.pts, 0.45, 1.0, dtmAt).filter((p, i, a) => i === 0 || p.distanceTo(a[i - 1]) > 0.05); if (pts.length < 2) continue; const curve = new THREE.CatmullRomCurve3(pts); const n = Math.max(3, Math.round(curve.getLength() / 7)); for (let i = 0; i < n; i++) { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.85, depthWrite: false })); m.renderOrder = 5; m.userData = { curve, t0: i / n }; AR.roads.add(m); CHEV.push(m); } } }
function updateChevrons(t) { for (const m of CHEV) { const u = (m.userData.t0 + t * 0.05) % 1; const p = m.userData.curve.getPointAt(u), q = m.userData.curve.getPointAt(Math.min(0.999, u + 0.01)); m.position.copy(p); m.rotation.y = Math.atan2(q.x - p.x, q.z - p.z); } }

function buildDynamicAR(ev) {
  const L = ev.layout, y = L.ybase;
  // Masse am Container und am Skid
  clearGroup(AR.dims);
  for (const u of L.units) { const dir = [Math.cos(u.ang), Math.sin(u.ang)], fr = u.front; const P = (a, b, h) => V3(u.c[0] + dir[0] * a + fr[0] * b, y + h, u.c[1] + dir[1] * a + fr[1] * b);
    const top = y + u.H + 0.25;
    addDim3(P(-u.L / 2, u.W / 2 + 0.25, u.H + 0.45), P(u.L / 2, u.W / 2 + 0.25, u.H + 0.45), `L ${u.L.toFixed(2)} m`, 'info', AR.dims, { ly: 0.3 });
    addDim3(P(-u.L / 2 - 0.35, -u.W / 2, u.H + 0.45), P(-u.L / 2 - 0.35, u.W / 2, u.H + 0.45), `B ${u.W.toFixed(2)} m`, 'info', AR.dims, { ly: 0.3 });
    addDim3(P(-u.L / 2 - 0.5, u.W / 2 + 0.5, 0.05), P(-u.L / 2 - 0.5, u.W / 2 + 0.5, u.H), `H ${u.H.toFixed(2)} m`, 'info', AR.dims, { noTick: true });
    makeLabel(u.type === 'battery' ? `${u.id} | DC-Batteriecontainer 20 ft HC<small>${fmt(RES.P.unit.kWh / 1000, 1)} MWh brutto, ${fmt(RES.P.unit.kW / 1000, 1)} MW</small>` : `${u.id} | MS-Power-Skid<small>Wechselrichter, Trafo ${fmt(RES.P.nUnits * 2.75, 2)} MVA, MS-Schaltanlage</small>`, 'lbl', u.c[0], top + 1.6, u.c[1], AR.dims); }
  { const p = L.pad; const a = V3(p[3][0], y + 0.1, p[3][1]), b = V3(p[2][0], y + 0.1, p[2][1]), c = V3(p[1][0], y + 0.1, p[1][1]); const dl = a.distanceTo(b), dw = b.distanceTo(c);
    addDim3(a.clone().add(V3(L.nv[0] * 1.6, 0, L.nv[1] * 1.6)), b.clone().add(V3(L.nv[0] * 1.6, 0, L.nv[1] * 1.6)), `Anlage ${dl.toFixed(1)} m`, 'info', AR.dims, { top: true });
    makeLabel(`Kiesbett ${dl.toFixed(1)} x ${dw.toFixed(1)} m = ${fmt(dl * dw, 0)} m²`, 'dim info', (p[0][0] + p[2][0]) / 2, y + 0.4, (p[0][1] + p[2][1]) / 2, AR.dims); }
  // Abstände (aus der Prüfung)
  clearGroup(AR.dist);
  for (const d of ev.dims) { if (!d.a || !d.b || d.key === 'kabel') continue; const A = V3(d.a[0], Math.max(dtmAt(d.a[0], d.a[1]), y) + 1.1, d.a[1]), B = V3(d.b[0], dtmAt(d.b[0], d.b[1]) + 1.1, d.b[1]); if (d.key === 'haus') { const r = SITE.receptors.find(r => Math.hypot(r.c[0] - d.b[0], r.c[1] - d.b[1]) < 0.5); B.y = (r ? r.y : B.y) + 476 - 476; }
    addDim3(A, B, `${d.label}: ${d.d.toFixed(1)} m${d.limit ? ` (Soll ≥ ${d.limit} m)` : ''}`, d.status, AR.dist, { top: true, r: 0.05, lt: d.key === 'brand' ? 0.85 : d.key === 'lane' ? 0.15 : 0.5, ly: d.key === 'brand' ? 1.4 : 0.35 }); }
  // MS-Kabel zur Trafostation
  clearGroup(AR.cable);
  const route = ev.route.pts; const rp = drapedPts(route, 0.25, 1, dtmAt); arLine(rp, 0xf97316, 0.12, 0.95, AR.cable);
  const mid = route[Math.floor(route.length / 2)]; makeLabel(`MS-Kabel zur Trafostation ${fmt(ev.route.len)} m<small>Rohrblock ca. 0.8 m tief, Lage schematisch</small>`, 'dim info', mid[0], dtmAt(mid[0], mid[1]) + 1.8, mid[1], AR.cable);
  
  // Netzanschluss CKW (schematisch)
  arLine(drapedPts(SITE.grid.pts, 0.25, 1, dtmAt), 0x2563eb, 0.1, 0.8, AR.cable);
  // NISV-Radius
  clearGroup(AR.nisv);
  { const sk = L.units.find(u => u.type === 'skid'); const r = ev.nisv.r1uT; const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r + 0.12, 96), new THREE.MeshBasicMaterial({ color: 0xff2d55, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(sk.c[0], y + 0.6, sk.c[1]); AR.nisv.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 96), new THREE.MeshBasicMaterial({ color: 0xff2d55, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })); disc.rotation.x = -Math.PI / 2; disc.position.set(sk.c[0], y + 0.55, sk.c[1]); AR.nisv.add(disc);
    makeLabel(`1-µT-Linie NISV ca. ${r.toFixed(1)} m<small>Anlagegrenzwert an Orten mit empfindlicher Nutzung</small>`, 'lbl', sk.c[0] + r * 0.7, y + 3, sk.c[1] + r * 0.7, AR.nisv); }
  // AR-Raster 5 m um die Anlage
  clearGroup(AR.grid);
  { const c = EN.centroid(L.pad); const pts = []; const R0 = 30; for (let k = -R0; k <= R0; k += 5) { for (let s = -R0; s < R0; s += 1) { const a = [c[0] + L.dir[0] * k + L.nv[0] * s, c[1] + L.dir[1] * k + L.nv[1] * s], b = [c[0] + L.dir[0] * k + L.nv[0] * (s + 1), c[1] + L.dir[1] * k + L.nv[1] * (s + 1)]; pts.push(V3(a[0], dtmAt(a[0], a[1]) + 0.2, a[1]), V3(b[0], dtmAt(b[0], b[1]) + 0.2, b[1])); const a2 = [c[0] + L.nv[0] * k + L.dir[0] * s, c[1] + L.nv[1] * k + L.dir[1] * s], b2 = [c[0] + L.nv[0] * k + L.dir[0] * (s + 1), c[1] + L.nv[1] * k + L.dir[1] * (s + 1)]; pts.push(V3(a2[0], dtmAt(a2[0], a2[1]) + 0.2, a2[1]), V3(b2[0], dtmAt(b2[0], b2[1]) + 0.2, b2[1])); } }
    const g = new THREE.BufferGeometry().setFromPoints(pts); AR.grid.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.55 }))); makeLabel('AR-Raster 5 m (massstäblich)', 'dim info', c[0] + L.dir[0] * 28, y + 1, c[1] + L.dir[1] * 28, AR.grid); }
  // Lärmkarte (Nacht)
  clearGroup(AR.noise);
  { const ng = EN.noiseGrid(L, RES.P, 'night', dtmAt, { x0: L.pad[0][0] - 110, z0: L.pad[0][1] - 110, nx: 56, nz: 56, step: 4, screen: true }); const cols = [[30, [120, 200, 120]], [35, [200, 220, 60]], [40, [250, 190, 40]], [45, [245, 120, 30]], [50, [220, 40, 40]], [55, [150, 20, 90]]];
    AR.noise.add(drape(ng.x0, ng.z0, ng.nx * ng.step, ng.nz * ng.step, ng.step, (x, z) => { const i = Math.floor((x - ng.x0) / ng.step), j = Math.floor((z - ng.z0) / ng.step); const v = ng.v[j * ng.nx + i]; if (!(v >= 30)) return null; let c = cols[0][1]; for (const [lv, cc] of cols) if (v >= lv) c = cc; return [...c, 150]; }, 0.5));
    for (const n of ev.noise) makeLabel(`${n.r.name}<small>Lr Tag ${n.day.Lr.toFixed(0)} / Nacht ${n.night.Lr.toFixed(0)} dB(A) | PW ${n.pw[0]} / ${n.pw[1]} (ES ${n.r.es})</small>`, 'lbl', n.r.c[0], n.r.y + 4, n.r.c[1], AR.noise).element.style.background = n.ok ? 'rgba(4,120,87,.9)' : 'rgba(220,38,38,.92)'; }
  // Kandidaten
  clearGroup(AR.cands);
  for (const r of RES.ranked) { const st = r.cnt.fail ? 'fail' : r.cnt.warn > 1 ? 'warn' : 'ok'; const col = r === RES.ranked[0] ? 0x16a34a : STC[st]; const poly = r.cand.poly; arLine(drapedPts([...poly, poly[0]], 0.5, 0.8, dtmAt), col, 0.14, 1, AR.cands);
    const m = new THREE.Mesh(polyGeo(poly, dtmAt, 0.45), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, depthWrite: false })); m.renderOrder = 4; AR.cands.add(m);
    const c = EN.centroid(poly); makeLabel(`${r.cand.name}<small>Bewertung ${r.score.toFixed(0)} / 100 | ${r.cnt.ok} erfüllt, ${r.cnt.warn} kritisch, ${r.cnt.fail} nicht erfüllt${r === RES.ranked[0] ? ' | Empfehlung' : ''}</small>`, 'lbl', c[0], dtmAt(c[0], c[1]) + 7, c[1], AR.cands).element.style.background = r === RES.ranked[0] ? 'rgba(4,120,87,.92)' : st === 'fail' ? 'rgba(185,28,28,.9)' : 'rgba(180,83,9,.9)'; }
  applyLayers();
}
function applyLayers() { for (const k of Object.keys(LAYERS)) setVis(AR[k], LAYERS[k]); setVis(flowGroup, LAYERS.flows); setVis(labelGroup, LAYERS.labels); updateLegend(); }

// ------------------------------------------------------------------ Energiefluss (animierte Bögen und Partikel)
const NODES = {}; const FLOWS = [];
const dotTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
const FC = { pv: 0xb6f542, grid: 0x3b82f6, export: 0xa855f7, dis: 0xf59e0b, ch: 0x14b8a6, load: 0xe2e8f0, heat: 0xef4444 };
function buildFlows(ev) {
  clearGroup(flowGroup); FLOWS.length = 0; const L = ev.layout, y = L.ybase;
  const pvC = (roof) => { const fs = PV_FIELDS.filter(f => f.roof === roof && f.mods); const x = fs.reduce((a, f) => a + f.c[0], 0) / fs.length, z = fs.reduce((a, f) => a + f.c[1], 0) / fs.length; return V3(x, Math.max(...fs.map(f => f.top)) + 1.2, z); };
  const bat = L.units.find(u => u.type === 'battery'), sk = L.units.find(u => u.type === 'skid');
  NODES.pvOst = pvC('Halle Ost (Werkhalle)'); NODES.pvNord = pvC('Halle Nord (Materialboxen)'); NODES.pvHeiz = pvC('Heizzentrale EVB');
  NODES.hv = V3(SITE.hv.c[0], dtmAt(SITE.hv.c[0], SITE.hv.c[1]) + 6, SITE.hv.c[1]);
  NODES.bat = V3(bat.c[0], y + bat.H + 1.0, bat.c[1]); NODES.skid = V3(sk.c[0], y + sk.H + 0.8, sk.c[1]);
  NODES.trafo = V3(SITE.trafo.c[0], SITE.trafo.y + (SITE.trafo.h || 3) + 1.6, SITE.trafo.c[1]);
  const g0 = SITE.grid.pts[SITE.grid.pts.length - 1]; NODES.grid = V3(g0[0], dtmAt(g0[0], g0[1]) + 5, g0[1]);
  NODES.heiz = V3(SITE.heiz.c[0] + 4, SITE.trafo.y + 13.5, SITE.heiz.c[1] - 2);
  const mk = (id, a, b, type, bump) => { const A = NODES[a], B = NODES[b]; const mid = A.clone().add(B).multiplyScalar(0.5); mid.y += bump ?? Math.min(16, 3 + A.distanceTo(B) * 0.12);
    const curve = new THREE.QuadraticBezierCurve3(A, mid, B); const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.28, 8, false), new THREE.MeshBasicMaterial({ color: FC[type], transparent: true, opacity: 0.5, depthWrite: false })); flowGroup.add(tube);
    const n = 46; const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.PointsMaterial({ map: dotTex, color: FC[type], size: 3.2, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    mat.toneMapped = false; mat.color.multiplyScalar(2.2); const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; flowGroup.add(pts);
    const f = { id, curve, pts, tube, n, phase: Math.random(), val: 0, type, baseType: type }; FLOWS.push(f); return f; };
  mk('pvOst', 'pvOst', 'hv', 'pv'); mk('pvNord', 'pvNord', 'hv', 'pv'); mk('pvHeiz', 'pvHeiz', 'heiz', 'pv', 4);
  mk('hv', 'trafo', 'hv', 'load'); mk('heiz', 'trafo', 'heiz', 'load', 4); mk('bat', 'bat', 'skid', 'dis', 2.5); mk('skid', 'skid', 'trafo', 'dis'); mk('grid', 'grid', 'trafo', 'grid', 6); mk('p2h', 'trafo', 'heiz', 'heat', 7);
  // Knotenbeschriftungen (Live-Werte)
  const lab = (html, p, id) => { const o = makeLabel(html, 'lbl live', p.x, p.y + 2.2, p.z, flowGroup); o.element.id = id; return o; };
  { const o = lab('PV Werkhalle Ost', NODES.pvOst, 'lnPvOst'); o.position.x -= 12; } lab('PV Halle Nord', NODES.pvNord, 'lnPvNord'); lab('Hauptverteilung Kieswerk', NODES.hv, 'lnHv'); { const o = lab('Trafostation CKW', NODES.trafo, 'lnTrafo'); o.position.x -= 8; o.position.y -= 1; } lab('Netz CKW', NODES.grid, 'lnGrid'); { const o = lab('Heizzentrale EVB', NODES.heiz, 'lnHeiz'); o.position.x += 8; o.position.y += 3; }
  const holo = makeLabel('', 'holo', NODES.bat.x, NODES.bat.y + 6.5, NODES.bat.z, flowGroup); holo.element.id = 'holo';
}
function setFlow(id, kw, posType, negType) { const f = FLOWS.find(f => f.id === id); if (!f) return; f.val = kw; const t = kw >= 0 ? posType : negType || posType; if (t !== f.type) { f.type = t; f.pts.material.color.setHex(FC[t]).multiplyScalar(2.2); f.tube.material.color.setHex(FC[t]); } }
function updateFlowParticles(dt) {
  for (const f of FLOWS) { const a = Math.abs(f.val); const on = a > 1.5; f.pts.visible = on && LAYERS.flows; f.tube.material.opacity = on ? 0.45 + Math.min(0.35, a / 1500) : 0.08; if (!on) continue;
    f.phase = (f.phase + dt * (0.05 + 0.22 * Math.sqrt(a / 900)) * (f.val >= 0 ? 1 : -1) + 10) % 1; const p = f.pts.geometry.attributes.position; const cnt = Math.round(f.n * clamp(0.3 + a / 900, 0.3, 1));
    f.pts.material.size = 2.6 + Math.min(3.4, a / 300);
    for (let i = 0; i < f.n; i++) { if (i >= cnt) { p.setXYZ(i, 0, -999, 0); continue; } const t = (f.phase + i / cnt) % 1; const q = f.curve.getPoint(t); p.setXYZ(i, q.x, q.y, q.z); } p.needsUpdate = true; } }
// ------------------------------------------------------------------ Benutzeroberfläche
setL(75, 'Anlage und Energiefluss werden aufgebaut ...');
let simT = Q.has('t') ? +Q.get('t') * 60 : 10.5 * 60, playing = !Q.has('pause'), speed = 120, SIM = RES.sim, curHour = -1, mode = 'orbit';
function selectCandidate(id, fly = true) { curCand = id; const ev = evalFor(id); buildBESS(ev); buildDynamicAR(ev); SIM = EN.simulate(RES.P, ev.layout); buildFlows(ev); renderPanels(); if (fly) focusOn(EN.centroid(ev.layout.pad), 70, 38, -40); }
function recompute(keepCand = true) { RES = EN.computeAll(SITE, PARAMS, dtmAt, dtmAt); if (!keepCand || !RES.ranked.find(r => r.cand.id === curCand)) curCand = RES.best.cand.id; selectCandidate(curCand, false); }
function focusOn(c, dist = 90, el = 40, az = -30, instant = false) { const tgt = V3(c[0], (c.length > 2 ? c[2] : dtmAt(c[0], c[1])) + 2, c[1]); const off = V3(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.cos(az * DEG) * Math.cos(el * DEG)).multiplyScalar(dist);
  if (instant) { controls.target.copy(tgt); camera.position.copy(tgt).add(off); controls.update(); return; } flyTo(tgt.clone().add(off), tgt); }
let fly = null; function flyTo(pos, tgt, dur = 1.6) { fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt, s: performance.now(), d: dur * 1000 }; }
function renderPanels() {
  const ev = evalFor(curCand), L = ev.layout, S = SIM; const P = RES.P;
  $('#candSeg').innerHTML = RES.ranked.map((r, i) => `<button data-c="${r.cand.id}" class="${r.cand.id === curCand ? 'on' : ''}" title="${r.cand.name}">${r.cand.id}${i === 0 ? ' ★' : ''}</button>`).join('');
  document.querySelectorAll('#candSeg button').forEach(b => b.onclick = () => selectCandidate(b.dataset.c));
  $('#leftBody').innerHTML = `
  <div class="kpis"><div class="kpi"><b>${fmt(L.E_kWh / 1000, 1)} MWh</b><span>Speicher (${P.nUnits} x 20-ft-Container)</span></div><div class="kpi"><b>${fmt(L.P_kW / 1000, 1)} MW</b><span>Leistung (MS-Skid ${fmt(P.nUnits * 2.75, 2)} MVA)</span></div>
  <div class="kpi"><b>${fmt(P.site.pv_kWp, 1)} kWp</b><span>PV Bestand auf Dächern (BFE-Register)</span></div><div class="kpi"><b>${fmt(S.peakNo)} → ${fmt(S.peakWith)} kW</b><span>Spitzenbezug am Netzanschluss</span></div></div>
  <div class="sec">Energiefluss live</div><table class="t" id="liveT"></table>
  <canvas id="chart" width="600" height="300"></canvas>
  <div class="hint">Grau: Kieswerk und Heizzentrale; Grün: PV; Blau: Netzbezug; Orange/Türkis: Speicher (Entladen/Laden); gestrichelt: Ladezustand.</div>
  <div class="sec">Betrieb und Szenario</div>
  <div class="row"><label>Container</label><select id="selN"><option value="1"${P.nUnits === 1 ? ' selected' : ''}>1 x 5 MWh</option><option value="2"${P.nUnits === 2 ? ' selected' : ''}>2 x 5 MWh</option></select></div>
  <div class="row"><label>Bezugsgrenze (Peak Shaving)</label><input type="range" id="thr" min="250" max="800" step="10" value="${P.ops.target_kW}"><span class="mono" id="thrV">${P.ops.target_kW} kW</span></div>
  <div class="row"><label>Jahreszeit</label><select id="selSeason"><option value="summer"${P.ops.season === 'summer' ? ' selected' : ''}>Sommer</option><option value="winter"${P.ops.season === 'winter' ? ' selected' : ''}>Winter</option></select></div>
  <div class="row"><label>Tag</label><select id="selDay"><option value="werktag"${P.ops.day === 'werktag' ? ' selected' : ''}>Werktag</option><option value="samstag"${P.ops.day === 'samstag' ? ' selected' : ''}>Samstag</option><option value="sonntag"${P.ops.day === 'sonntag' ? ' selected' : ''}>Sonntag</option></select></div>
  <div class="row"><label>Szenario</label><select id="selScen"><option value="normal"${P.ops.scenario === 'normal' ? ' selected' : ''}>Normalbetrieb</option><option value="insel"${P.ops.scenario === 'insel' ? ' selected' : ''}>Netzausfall 10-14 Uhr (Inselbetrieb)</option><option value="p2h"${P.ops.scenario === 'p2h' ? ' selected' : ''}>Power-to-Heat Heizzentrale</option></select></div>
  <div class="row"><label>Bewölkung</label><input type="range" id="cloud" min="0" max="0.9" step="0.05" value="${P.ops.cloud}"><span class="mono" id="cloudV">${Math.round(P.ops.cloud * 100)} %</span></div>
  <div class="sec">Netzanschluss und Integration</div>
  <div class="note"><b>Trafostation:</b> ${SITE.trafo.note}<br><b>Kraftwerk an der Einfahrt:</b> Die Heizzentrale der Energieverbund Eschenbach AG (Rothenburgstrasse 24b) ist ein Holzschnitzel-Heizwerk (900 kW Wärme, Endausbau rund 4 MW). Ein Blockheizkraftwerk ist dort nicht registriert: Das BFE-Register der Produktionsanlagen nennt an dieser Adresse nur eine PV-Anlage mit 15.44 kWp. Der Trafo versorgt die Heizzentrale und nimmt den PV-Strom auf, Strom aus einem BHKW fliesst nach heutigem Stand nicht.<br><b>Integration:</b> Notstrom für Pumpen und Elektrofilter der Fernwärme (Inselbetrieb), PV-Überschuss und günstige Stunden über einen Elektroheizeinsatz in den Pufferspeicher (Power-to-Heat), gemeinsamer Messpunkt mit CKW abstimmen.</div>`;
  $('#selN').onchange = (e) => { PARAMS.nUnits = +e.target.value; recompute(); };
  $('#thr').oninput = (e) => { PARAMS.ops.target_kW = +e.target.value; $('#thrV').textContent = e.target.value + ' kW'; clearTimeout(window.__t); window.__t = setTimeout(() => { RES.P.ops.target_kW = PARAMS.ops.target_kW; SIM = EN.simulate(RES.P, evalFor(curCand).layout); renderKpi(); }, 120); };
  for (const [id, k] of [['#selSeason', 'season'], ['#selDay', 'day'], ['#selScen', 'scenario']]) $(id).onchange = (e) => { PARAMS.ops[k] = e.target.value; RES.P.ops[k] = e.target.value; SIM = EN.simulate(RES.P, evalFor(curCand).layout); lastEnvKey = ''; renderKpi(); };
  $('#cloud').oninput = (e) => { PARAMS.ops.cloud = RES.P.ops.cloud = +e.target.value; $('#cloudV').textContent = Math.round(e.target.value * 100) + ' %'; SIM = EN.simulate(RES.P, evalFor(curCand).layout); };
  // Prüfung
  const cnt = ev.cnt; const best = RES.ranked[0];
  $('#rightBody').innerHTML = `<div class="sum"><div class="ok"><b>${cnt.ok}</b>erfüllt</div><div class="warn"><b>${cnt.warn}</b>kritisch</div><div class="fail"><b>${cnt.fail}</b>nicht erfüllt</div></div>
   <div class="hint" style="margin:0 0 8px">${ev.cand.name}: ${ev.cand.desc || ''} ${ev.order ? 'Anordnung: ' + ev.order + '.' : ''}</div>
   <div class="sec">Standortvergleich (automatisch)</div>${RES.ranked.map((r, i) => `<div class="cand ${r.cand.id === curCand ? 'on' : ''}" data-c="${r.cand.id}"><span class="dot ${r.cnt.fail ? 'fail' : r.cnt.warn > 1 ? 'warn' : 'ok'}"></span><b>${i + 1}. ${r.cand.name}</b><span class="mono">${r.score.toFixed(0)}</span></div>`).join('')}
   <div class="hint">Varianten C1 und C4, bewertet nach Zone, Waldabstand, Fahrwege, Brandschutz, Altlasten, Naturgefahren, Platz, Kabellänge, Lärm, NISV und PV-Nähe. ${best.cand.id === curCand ? 'Dieser Standort ist die Empfehlung.' : 'Empfehlung: ' + best.cand.name + '.'}</div>
   <div class="sec">Prüfpunkte ${ev.cand.id}</div>${ev.checks.map(c => `<div class="chk ${c.status}"><div class="h"><span class="dot ${c.status}"></span>${c.title}</div><div class="m">${c.measured}</div><div class="d"><p><b>Grundlage:</b> ${c.norm}</p></div></div>`).join('')}`;
  document.querySelectorAll('.chk').forEach(el => el.onclick = () => el.classList.toggle('open'));
  document.querySelectorAll('.cand').forEach(el => el.onclick = () => selectCandidate(el.dataset.c));
  renderKpi(); }
function renderKpi() { const k = document.querySelectorAll('#leftBody .kpi b'); if (k[3]) k[3].textContent = `${fmt(SIM.peakNo)} → ${fmt(SIM.peakWith)} kW`; drawChart(); }
function drawChart() { const c = $('#chart'); if (!c) return; const g = c.getContext('2d'), w = c.width, h = c.height; g.clearRect(0, 0, w, h); const S = SIM; const pad = 30, H = h - pad - 10; const mx = Math.max(900, ...S.kies) * 1.05;
  const X = (m) => pad + (w - pad - 8) * m / 1440, Y = (v) => 10 + H * (1 - (v + mx * 0.35) / (mx * 1.35));
  g.strokeStyle = '#E6E9F0'; g.fillStyle = '#7C879E'; g.font = '18px IBM Plex Mono, monospace'; for (let hh = 0; hh <= 24; hh += 6) { g.beginPath(); g.moveTo(X(hh * 60), 10); g.lineTo(X(hh * 60), 10 + H); g.stroke(); g.fillText(String(hh).padStart(2, '0'), X(hh * 60) - 10, h - 6); }
  g.beginPath(); g.moveTo(pad, Y(0)); g.lineTo(w, Y(0)); g.strokeStyle = '#CBD2DE'; g.stroke(); g.fillText('0', 4, Y(0) + 6); g.fillText(fmt(mx / 1.05 / 1000, 1) + ' MW', 2, 24);
  if (RES.P.ops.target_kW) { g.setLineDash([6, 6]); g.strokeStyle = '#dc2626'; g.beginPath(); g.moveTo(pad, Y(RES.P.ops.target_kW)); g.lineTo(w, Y(RES.P.ops.target_kW)); g.stroke(); g.setLineDash([]); }
  const line = (arr, col, lw = 2, f = (v) => v) => { g.beginPath(); for (let m = 0; m < 1440; m += 4) { const v = f(arr[m], m); m ? g.lineTo(X(m), Y(v)) : g.moveTo(X(m), Y(v)); } g.strokeStyle = col; g.lineWidth = lw; g.stroke(); };
  g.fillStyle = 'rgba(182,245,66,.35)'; g.beginPath(); g.moveTo(X(0), Y(0)); for (let m = 0; m < 1440; m += 4) g.lineTo(X(m), Y(S.pv[m])); g.lineTo(X(1440), Y(0)); g.fill();
  line(S.kies, '#94a3b8', 2, (v, m) => v + S.heiz[m]); line(S.grid, '#2563eb', 2.6);
  g.beginPath(); for (let m = 0; m < 1440; m += 4) { const v = S.bat[m]; m ? g.lineTo(X(m), Y(v)) : g.moveTo(X(m), Y(v)); } g.strokeStyle = '#f59e0b'; g.lineWidth = 2; g.stroke();
  g.setLineDash([5, 4]); g.beginPath(); for (let m = 0; m < 1440; m += 4) { const v = S.soc[m] * mx * 0.9; m ? g.lineTo(X(m), Y(v)) : g.moveTo(X(m), Y(v)); } g.strokeStyle = '#047857'; g.lineWidth = 1.6; g.stroke(); g.setLineDash([]);
  if (S.island.some(v => v)) { g.fillStyle = 'rgba(220,38,38,.08)'; g.fillRect(X(600), 10, X(840) - X(600), H); }
  const m = Math.floor(simT) % 1440; g.strokeStyle = '#0A2463'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(m), 10); g.lineTo(X(m), 10 + H); g.stroke(); }
function updateLive() { const m = Math.floor(simT) % 1440, S = SIM; const sh = { ost: 143.0 / 268.84, nord: 110.4 / 268.84, heiz: 15.44 / 268.84 };
  const pvO = S.pv[m] * sh.ost, pvN = S.pv[m] * sh.nord, pvH = S.pv[m] * sh.heiz; const isl = S.island[m];
  setFlow('pvOst', pvO, 'pv'); setFlow('pvNord', pvN, 'pv'); setFlow('pvHeiz', pvH, 'pv');
  setFlow('hv', isl ? Math.min(S.kies[m], 120) - pvO - pvN : S.kies[m] - pvO - pvN, 'load', 'export'); setFlow('heiz', S.heiz[m] - pvH, 'load', 'export');
  setFlow('bat', S.bat[m], 'dis', 'ch'); setFlow('skid', S.bat[m], 'dis', 'ch'); setFlow('grid', S.grid[m], 'grid', 'export'); setFlow('p2h', S.p2h[m], 'heat');
  const t = $('#liveT'); if (t) t.innerHTML = `<tr><td>PV Dächer (Werkhalle, Halle Nord, Heizzentrale)</td><td>${fmt(S.pv[m])} kW</td></tr><tr><td>Kieswerk (Annahme Lastgang)</td><td>${fmt(isl ? Math.min(S.kies[m], 120) : S.kies[m])} kW</td></tr><tr><td>Heizzentrale Hilfsbetriebe</td><td>${fmt(S.heiz[m])} kW</td></tr>${S.p2h[m] ? `<tr><td>Power-to-Heat (Elektroheizeinsatz)</td><td>${fmt(S.p2h[m])} kW</td></tr>` : ''}<tr><td>Speicher ${S.bat[m] >= 0 ? 'entlädt' : 'lädt'}</td><td>${fmt(Math.abs(S.bat[m]))} kW</td></tr><tr><td>Ladezustand</td><td>${fmt(S.soc[m] * 100)} %</td></tr><tr><td>${isl ? 'Netz getrennt (Insel)' : S.grid[m] >= 0 ? 'Bezug Netz CKW' : 'Rückspeisung Netz'}</td><td>${fmt(Math.abs(S.grid[m]))} kW</td></tr><tr><td>Frei für Systemdienstleistungen</td><td>${fmt(S.flex[m])} kW</td></tr>`;
  const s = (id, html) => { const e = document.getElementById(id); if (e) e.innerHTML = html; };
  s('lnPvOst', `PV Werkhalle Ost<small>143.0 kWp | ${fmt(pvO)} kW</small>`); s('lnPvNord', `PV Halle Nord<small>110.4 kWp | ${fmt(pvN)} kW</small>`); s('lnHv', `Hauptverteilung Kieswerk<small>${fmt(isl ? Math.min(S.kies[m], 120) : S.kies[m])} kW Last</small>`);
  s('lnTrafo', `Trafostation CKW (vermutet)<small>${isl ? 'Netz getrennt' : (S.grid[m] >= 0 ? 'Bezug ' : 'Rückspeisung ') + fmt(Math.abs(S.grid[m])) + ' kW'}</small>`); s('lnGrid', `Mittelspannungsnetz CKW<small>${isl ? 'Ausfall (Szenario)' : 'Netzebene 5'}</small>`);
  s('lnHeiz', `Heizzentrale EVB<small>PV 15.44 kWp | Hilfsbetriebe ${fmt(S.heiz[m])} kW${S.p2h[m] ? ' | P2H ' + fmt(S.p2h[m]) + ' kW' : ''}</small>`);
  const soc = S.soc[m]; s('holo', `<b>BESS ${fmt(SIM.Emax / RES.P.unit.usable / 1000, 1)} MWh</b><div class="socbar"><i style="width:${(soc * 100).toFixed(0)}%"></i></div><span>SOC ${fmt(soc * 100)} % | ${S.bat[m] >= 0 ? 'Entladen' : 'Laden'} ${fmt(Math.abs(S.bat[m]))} kW</span>`); }
// Ebenen-Schalter
const LAYER_DEF = [['dims', 'AR-Masse'], ['dist', 'Abstände'], ['cable', 'Kabel und Netz'], ['flows', 'Energiefluss'], ['wald', 'Waldabstand'], ['roads', 'Fahrwege'], ['zones', 'Zonen'], ['cands', 'Standorte'], ['noise', 'Lärmkarte Nacht'], ['nisv', 'NISV 1 µT'], ['grid', 'AR-Raster'], ['labels', 'Beschriftung']];
function renderLayerButtons() { const c = $('#layers'); c.innerHTML = ''; for (const [k, n] of LAYER_DEF) { const b = document.createElement('button'); b.textContent = n; if (LAYERS[k]) b.classList.add('on'); b.onclick = () => { LAYERS[k] = !LAYERS[k]; b.classList.toggle('on', LAYERS[k]); applyLayers(); }; c.appendChild(b); } }
function updateLegend() { const lg = $('#legend'); if (!lg) return; let h = '';
  if (LAYERS.flows) h += `<b>Energiefluss</b><br><span style="color:#84cc16">&#9679;</span> PV &nbsp;<span style="color:#3b82f6">&#9679;</span> Netzbezug &nbsp;<span style="color:#a855f7">&#9679;</span> Rückspeisung<br><span style="color:#f59e0b">&#9679;</span> Speicher entlädt &nbsp;<span style="color:#14b8a6">&#9679;</span> lädt &nbsp;<span style="color:#94a3b8">&#9679;</span> Verbrauch &nbsp;<span style="color:#ef4444">&#9679;</span> Wärme<br>`;
  if (LAYERS.wald) h += `<b>Waldabstand</b><br><span style="color:#dc2626">&#9632;</span> unter 10 m &nbsp;<span style="color:#f59e0b">&#9632;</span> 10 bis 20 m &nbsp;<span style="color:#16a34a">&#9632;</span> Wald<br>`;
  if (LAYERS.noise) h += `<b>Beurteilungspegel Lr Nacht</b><div class="bar" style="background:linear-gradient(90deg,#78c878,#c8dc3c,#fabe28,#f5781e,#dc2828,#961459)"></div><span>30</span><span style="float:right">55 dB(A)</span><br>`;
  if (LAYERS.dist || LAYERS.dims) h += `<span style="color:#16a34a">&#9632;</span> erfüllt &nbsp;<span style="color:#d97706">&#9632;</span> kritisch &nbsp;<span style="color:#dc2626">&#9632;</span> nicht erfüllt &nbsp;<span style="color:#1e56a0">&#9632;</span> Mass`;
  lg.innerHTML = h; lg.style.display = h ? 'block' : 'none'; }
// Kameramodi
const TOUR = [
  { c: [20, 10], d: 330, el: 42, az: -25, h: 'Gemeindekieswerk Eschenbach', b: 'Reales Gelände (swissALTI3D, swissSURFACE3D), Gebäude (swissBUILDINGS3D 3.0) und Luftbild 10 cm. Der Batteriespeicher steht am Ostrand hinter der Werkhalle mit PV-Dach.' },
  { c: [20, 20], d: 220, el: 70, az: -10, h: 'Zwei Varianten am Rand des Areals', b: 'Zwei Randstandorte: C1 hinter der Werkhalle mit PV-Dach und C4 an der Nordostecke des Kieslagers. Beide liegen ausserhalb des Lkw-Kreislaufs; geprüft sind Zone, Waldabstand, Fahrwege, Brandschutz, Kabelweg, Lärm und NISV.', layers: { cands: true, roads: true } },
  { k: 'bess', d: 32, el: 28, az: -70, h: 'Batteriecontainer und MS-Skid', b: '20-ft-HC-Container mit rund 5 MWh, daneben der Skid mit Wechselrichter, Trafo und MS-Schaltanlage. Türseite zur Fahrgasse, Kühlaggregat an der Stirnseite.' },
  { k: 'bess', d: 40, el: 55, az: -110, h: 'AR-Messungen im echten Massstab', b: 'Masse der Container, Abstand zur Werkhalle (Brandschutz), freie Fahrgasse und Abstand zum Wald werden live aus dem Geländemodell berechnet.', layers: { dims: true, dist: true, grid: true } },
  { k: 'bess', d: 160, el: 50, az: -60, h: 'Waldabstand eingehalten', b: 'Der Standort liegt über 50 m von der statischen Waldgrenze entfernt. Die Bänder zeigen 10 m (Ausnahme) und 20 m (§ 136 PBG LU).', layers: { wald: true } },
  { c: [40, 70], d: 70, el: 35, az: -150, h: 'Trafostation und Heizzentrale', b: 'Die Heizzentrale an der Einfahrt ist ein Holzschnitzel-Heizwerk ohne BHKW. Die Trafostation ist der flache Betonanbau an ihrer Nordseite; dorthin führt das MS-Kabel des Speichers.', layers: { cable: true } },
  { c: [10, -20], d: 160, el: 38, az: -30, h: 'Energiefluss mit der bestehenden PV', b: 'Die PV-Dächer (268.8 kWp) speisen das Kieswerk, Überschüsse laden den Speicher. In der Spitze entlädt er und hält den Netzbezug unter der Bezugsgrenze.', layers: { flows: true }, t: 12.5 },
  { k: 'bess', d: 180, el: 60, az: -40, h: 'Lärm an den Wohnhäusern', b: 'Die Häuser am Rüchligrain stehen rund 20 m höher am Hang. Das Gelände schirmt ab, die Planungswerte ES II werden nach dieser Abschätzung eingehalten.', layers: { noise: true } },
  { k: 'bess', d: 60, el: 22, az: -90, h: 'Nachtbetrieb', b: 'Nachts lädt der Speicher bei Schwachlast unterhalb der Bezugsgrenze, Kühlung im leisen Nachtmodus, Beleuchtung bewegungsgesteuert.', t: 22.5 },
];
let tour = null;
function tourStep(i) { const s = TOUR[i]; if (!s) { tour = null; $('#caption').style.display = 'none'; return; } tour = { i, s: performance.now() }; const ev = evalFor(curCand); const c = s.k === 'bess' ? EN.centroid(ev.layout.pad) : s.c;
  if (s.layers) { for (const k of Object.keys(LAYERS)) if (['wald', 'roads', 'zones', 'cands', 'noise', 'nisv', 'grid'].includes(k)) LAYERS[k] = false; Object.assign(LAYERS, s.layers); renderLayerButtons(); applyLayers(); }
  if (s.t) simT = s.t * 60; focusOn(c, s.d, s.el, s.az); $('#caption').innerHTML = `<b>${i + 1}/${TOUR.length} | ${s.h}</b>${s.b}`; $('#caption').style.display = 'block'; }
function setMode(m) { mode = m; document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === m)); $('#caption').style.display = 'none'; tour = null; measure.active = m === 'measure'; $('#mhint').style.display = m === 'measure' ? 'block' : m === 'walk' ? 'block' : 'none';
  $('#mhint').textContent = m === 'measure' ? 'Messen: Zwei Punkte im Gelände anklicken. Esc löscht die Messungen.' : 'Begehen: ins Bild klicken, mit W A S D gehen, Maus schaut, Umschalt rennt, Esc beendet.';
  if (m === 'walk') { const L = evalFor(curCand).layout; const c = EN.centroid(L.pad); const px = c[0] + L.nv[0] * 5.2 - L.dir[0] * 13, pz = c[1] + L.nv[1] * 5.2 - L.dir[1] * 13; camera.position.set(px, dtmAt(px, pz) + 1.7, pz); camera.lookAt(c[0] + L.nv[0] * 1.5, L.ybase + 1.4, c[1] + L.nv[1] * 1.5); controls.enabled = false; }
  else { controls.enabled = true; if (walk.isLocked) walk.unlock(); }
  if (m === 'plan') { const c = EN.centroid(evalFor(curCand).layout.pad); focusOn(c, 120, 89, 0); }
  if (m === 'tour') tourStep(0); }
document.querySelectorAll('#modeSeg button').forEach(b => b.onclick = () => setMode(b.dataset.m));
renderer.domElement.addEventListener('click', () => { if (mode === 'walk' && !walk.isLocked) walk.lock(); });
const keys = {}; addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'Escape') { clearMeasures(); } if (tour && (e.code === 'ArrowRight' || e.code === 'Space')) tourStep(tour.i + 1); }); addEventListener('keyup', (e) => keys[e.code] = false);
// Messwerkzeug
const measure = { active: false, a: null, group: new THREE.Group() }; scene.add(measure.group);
function clearMeasures() { clearGroup(measure.group); measure.a = null; }
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (e) => { window.__pd = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => { const pd = window.__pd || [0, 0]; if (Math.hypot(e.clientX - pd[0], e.clientY - pd[1]) > 5 || mode === 'walk') return;
  mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(mouse, camera); const hit = ray.intersectObjects([...pickables, bessGroup], true)[0]; if (!hit) return;
  if (measure.active) { const p = hit.point.clone(); const mk = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshBasicMaterial({ color: 0x00e5ff, depthTest: false })); mk.position.copy(p); mk.renderOrder = 12; measure.group.add(mk);
    if (!measure.a) measure.a = p; else { const a = measure.a; const d = a.distanceTo(p), dh = p.y - a.y, dxz = Math.hypot(p.x - a.x, p.z - a.z); addDim3(a.clone().add(V3(0, 0.3, 0)), p.clone().add(V3(0, 0.3, 0)), `${d.toFixed(2)} m | horizontal ${dxz.toFixed(2)} m | Höhe ${dh >= 0 ? '+' : ''}${dh.toFixed(2)} m`, 'info', measure.group, { top: true, r: 0.05 }); measure.a = null; } return; }
  let o = hit.object; while (o && !o.userData.info && o.parent) o = o.parent; const info = o && o.userData.info;
  if (info) showInfo(info.type === 'battery' ? `${info.id}: DC-Batteriecontainer 20 ft HC` : `${info.id}: MS-Power-Skid`, info.type === 'battery' ? `Masse ${RES.P.unit.L} x ${RES.P.unit.W} x ${RES.P.unit.H} m, ca. ${fmt(RES.P.unit.kWh / 1000, 1)} MWh brutto, Flüssigkeitskühlung, Gaswarnung, Überdruckklappen, Löschanlage im Container (Herstellerangaben einholen).` : `Wechselrichter ${fmt(RES.P.nUnits * 2.5, 1)} MW, Trafo ${fmt(RES.P.nUnits * 2.75, 2)} MVA mit Esteröl und Auffangwanne, MS-Schaltanlage mit Abgang zur Trafostation.`);
  else if (hit.object.userData.trafo) showInfo('Trafostation CKW (vermutet)', SITE.trafo.note + ' Der Batteriespeicher wird über sein MS-Kabel an ein neues Feld dieser Station angeschlossen.');
  else if (hit.object.name === 'pv') showInfo('Bestehende PV-Anlage', 'Kieswerk Rothenburgstrasse 24a: 114.38 kWp (2021) und 138.99 kWp (2023); Heizzentrale 24b: 15.44 kWp (BFE-Register der Elektrizitätsproduktionsanlagen). Lage der Felder aus dem Luftbild.');
  else if (Math.hypot(hit.point.x - SITE.heiz.c[0], hit.point.z - SITE.heiz.c[1]) < 16) showInfo('Heizzentrale Energieverbund Eschenbach AG', 'Holzschnitzel-Heizwerk mit Elektrofilter, 900 kW Wärme (Endausbau rund 4 MW), Holzfassade (Label Schweizer Holz), begrüntes Dach mit 15.44 kWp PV. Kein BHKW registriert.'); });
function showInfo(t, b) { $('#infoT').textContent = t; $('#infoB').innerHTML = b; $('#info').style.display = 'flex'; } $('#infoX').onclick = () => $('#info').style.display = 'none';
$('#tSlider').oninput = (e) => { simT = +e.target.value; }; $('#play').onclick = () => { playing = !playing; $('#play').textContent = playing ? 'Pause' : 'Start'; }; $('#speed').onchange = (e) => speed = +e.target.value;
$('#btnShot').onclick = () => { composer.render(); const a = document.createElement('a'); a.download = 'NRG_BESS_Eschenbach.png'; a.href = renderer.domElement.toDataURL('image/png'); a.click(); };
for (const id of ['left', 'right']) { const p = document.getElementById(id), h = p.querySelector('h3'); h.addEventListener('click', () => p.classList.toggle('collapsed')); }

// ------------------------------------------------------------------ Start
buildStaticAR(); selectCandidate(curCand, false); renderLayerButtons();
if (Q.get('focus')) { const f = Q.get('focus').split(',').map(Number); focusOn([f[0], f[1]], f[2], f[3], f[4], true); } else focusOn(EN.centroid(evalFor(curCand).layout.pad), 300, 40, -28, true);
if (Q.get('mode')) setMode(Q.get('mode'));
setL(100, 'bereit'); setTimeout(() => { const l = $('#loading'); if (l) l.remove(); }, 200);
const clock = new THREE.Clock(); window.APP = { frames: 0, RES, EN, SITE };
renderer.setAnimationLoop(() => { const dt = Math.min(0.05, clock.getDelta()); const t = clock.elapsedTime;
  if (playing) simT = (simT + dt * speed / 60) % 1440; const m = Math.floor(simT) % 1440; $('#tSlider').value = m; $('#clock').textContent = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const hour = simT / 60; let day = 1; if (Math.abs(hour - curHour) > 0.02) { curHour = hour; day = applySky(hour, RES.P.ops.season); const night = day < 0.35; for (const l of lamps) { if (l.isSpotLight) l.intensity = night ? 60 : 0; else l.material.emissiveIntensity = night ? 3 : 0; } }
  if (window.APP.frames % 3 === 0) { updateLive(); if (window.APP.frames % 30 === 0) drawChart(); }
  updateFlowParticles(dt); if (LAYERS.roads) updateChevrons(t);
  for (const f of fans) { if (f.userData.fanY) f.rotation.z += dt * 9; else f.rotation.x += dt * 9; }
  for (const b of beacons) b.material.emissiveIntensity = SIM.island[m] ? (Math.sin(t * 8) > 0 ? 4 : 0) : 0;
  if (fly) { const u = clamp((performance.now() - fly.s) / fly.d, 0, 1), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e); if (u >= 1) fly = null; }
  if (tour && performance.now() - tour.s > 9000 && !CAPTURE) tourStep(tour.i + 1);
  if (mode === 'walk') { const sp = (keys.ShiftLeft ? 9 : 3.5) * dt; if (keys.KeyW) walk.moveForward(sp); if (keys.KeyS) walk.moveForward(-sp); if (keys.KeyA) walk.moveRight(-sp); if (keys.KeyD) walk.moveRight(sp); const L = evalFor(curCand).layout; const onPad = EN.pip([camera.position.x, camera.position.z], L.pad); camera.position.y = (onPad ? L.ybase : dtmAt(camera.position.x, camera.position.z)) + 1.7; }
  else controls.update();
  composer.render(); labelRenderer.render(scene, camera); window.APP.frames++; });
