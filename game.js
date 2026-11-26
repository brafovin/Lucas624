/* TURBO GP – Rendering, UI, Audio und Spielablauf */
(function () {
'use strict';
const C = window.Core, T = window.THREE;
const { clamp, wrap, TRACKS, CARS, DIFFS, PRIZES } = C;
const $ = id => document.getElementById(id);
const fmtMoney = n => Math.round(n).toLocaleString('de-DE') + ' €';
const fmtTime = t => { if (!isFinite(t) || t <= 0) return '–:––.––'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + String(Math.floor(s)).padStart(2, '0') + '.' + String(Math.floor((s % 1) * 100)).padStart(2, '0'); };
const rnd = (a, b) => a + Math.random() * (b - a);

/* ------------------------------------------------------------ Speicherstand */
const SAVE_KEY = 'turbogp_save_v1';
const save = { money: 0, owned: ['rookie'], car: 'rookie', track: 0, diff: 'medium', best: {}, quality: 2, muted: false, bots: 11, fov: 70, auto: true, ao: false, refl: true };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) {}
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

/* ------------------------------------------------------------ Renderer */
let renderer;
try {
  renderer = new T.WebGLRenderer({ canvas: $('gl'), antialias: true, powerPreference: 'high-performance' });
} catch (e) { $('noWebgl').classList.remove('hidden'); $('menu').classList.add('hidden'); throw e; }
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
const Gov = { scale: 1, ema: 0, t: 0, grace: 0 };
const QUAL = [
  { label: 'Niedrig', pr: 1, shadow: 0, mapSize: 512 },
  { label: 'Mittel', pr: 1, shadow: 1, mapSize: 1024 },
  { label: 'Hoch', pr: Math.min(window.devicePixelRatio || 1, 1.5), shadow: 1, mapSize: 2048 },
  { label: 'Ultra', pr: Math.min(window.devicePixelRatio || 1, 1.75), shadow: 1, mapSize: 3072 }
];
function applyRes() { renderer.setPixelRatio(QUAL[save.quality].pr * Gov.scale); renderer.setSize(innerWidth, innerHeight, false); if (typeof Post !== 'undefined') Post.resize(); }
function applyQuality() {
  const q = QUAL[save.quality];
  renderer.setPixelRatio(q.pr * Gov.scale);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = q.shadow > 0;
  if (raceScene && raceScene.sun) { raceScene.sun.castShadow = q.shadow > 0; raceScene.sun.shadow.mapSize.set(q.mapSize, q.mapSize); if (raceScene.sun.shadow.map) { raceScene.sun.shadow.map.dispose(); raceScene.sun.shadow.map = null; } }
  scene_materials_dirty();
  if (typeof Post !== 'undefined') Post.resize();
}
function scene_materials_dirty() { [raceScene && raceScene.scene, showScene].forEach(s => s && s.traverse(o => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); } })); }
const camera = new T.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 3200);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); if (typeof Post !== 'undefined') Post.resize(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); showCam.aspect = camera.aspect; showCam.updateProjectionMatrix(); });

/* ------------------------------------------------------------ Texturen */
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
function addNoise(g, w, h, amt) {
  const im = g.getImageData(0, 0, w, h), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(im, 0, 0);
}
const TEX = {};
function texAsphalt() {
  return TEX.asphalt || (TEX.asphalt = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#3b3c41'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${rnd(.01, .06)})`; g.beginPath(); g.arc(rnd(0, w), rnd(0, h), rnd(5, 34), 0, 7); g.fill(); }
    for (const cx of [0.31, 0.69]) { const gr = g.createLinearGradient(w * (cx - .12), 0, w * (cx + .12), 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, 'rgba(0,0,0,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(w * (cx - .12), 0, w * .24, h); }
    addNoise(g, w, h, 30);
    g.fillStyle = '#ececec'; g.fillRect(w * .028, 0, w * .02, h); g.fillRect(w * .952, 0, w * .02, h);
  }, true));
}
function texKerb() {
  return TEX.kerb || (TEX.kerb = canvasTex(32, 64, (g, w, h) => { g.fillStyle = '#d4181c'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f2f2f2'; g.fillRect(0, h / 2, w, h / 2); addNoise(g, w, h, 18); }, true));
}
function texGround(kind) {
  const key = 'g' + kind; if (TEX[key]) return TEX[key];
  const base = { grass: '#3f7d33', sand: '#c79a5e', pave: '#2a2c33', quay: '#8d8c88' }[kind];
  const t = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${rnd(.02, .07)})`; g.beginPath(); g.arc(rnd(0, w), rnd(0, h), rnd(4, 26), 0, 7); g.fill(); }
    if (kind === 'grass') for (let i = 0; i < 1800; i++) { g.strokeStyle = Math.random() < .5 ? 'rgba(20,70,20,.35)' : 'rgba(120,180,70,.3)'; g.beginPath(); const x = rnd(0, w), y = rnd(0, h); g.moveTo(x, y); g.lineTo(x + rnd(-2, 2), y - rnd(3, 8)); g.stroke(); }
    if (kind === 'sand') for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(120,80,40,.10)'; g.lineWidth = rnd(1, 3); g.beginPath(); const y = rnd(0, h); g.moveTo(0, y); g.bezierCurveTo(w * .3, y + rnd(-10, 10), w * .6, y + rnd(-10, 10), w, y); g.stroke(); }
    addNoise(g, w, h, kind === 'pave' ? 18 : 34);
  }, true);
  return TEX[key] = t;
}
function texBarrier(theme) {
  const key = 'bar' + theme; if (TEX[key]) return TEX[key];
  const names = ['TURBO', 'NITRO', 'APEX', 'VELOCITY', 'ZENITH', 'HYPERFUEL', 'ORBIT', 'PULSE'];
  const cols = theme === 'night' ? ['#0d3b66', '#7a0f4d', '#0b6e4f', '#5a189a'] : ['#c1121f', '#0353a4', '#f4a300', '#2a9d8f'];
  return TEX[key] = canvasTex(1024, 128, (g, w, h) => {
    for (let i = 0; i < 4; i++) {
      g.fillStyle = cols[i]; g.fillRect(i * 256, 0, 256, 84);
      g.fillStyle = '#fff'; g.font = 'italic 900 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(names[(i * 2 + (theme === 'night' ? 1 : 0)) % 8], i * 256 + 128, 44);
      g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(i * 256, 0, 4, 84);
    }
    if (IMG.conc_c && IMG.conc_c.width) {
      g.drawImage(IMG.conc_c, 0, 0, IMG.conc_c.width, IMG.conc_c.height * 0.45, 0, 84, w, 44);
      g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, 84, w, 4); g.fillStyle = '#c1121f'; g.fillRect(0, 100, w, 6); g.fillStyle = '#f2f2f2'; g.fillRect(0, 106, w, 6);
      for (let x = 0; x < w; x += 48) { g.fillStyle = '#c1121f'; g.fillRect(x, 100, 24, 6); g.fillStyle = '#f2f2f2'; g.fillRect(x + 24, 100, 24, 6); }
    } else {
      g.fillStyle = '#e9e9e9'; g.fillRect(0, 84, w, 44);
      for (let x = 0; x < w; x += 64) { g.fillStyle = (x / 64) % 2 ? '#c1121f' : '#e9e9e9'; g.fillRect(x, 84, 32, 44); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 32, 84, 32, 44); }
      addNoise(g, w, h, 20);
    }
  }, true);
}
function texCrowd() {
  return TEX.crowd || (TEX.crowd = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#20232b'; g.fillRect(0, 0, w, h);
    const cs = ['#d33', '#36c', '#eee', '#fc3', '#3a6', '#e83', '#a4c', '#fff'];
    for (let y = 4; y < h; y += 9) for (let x = 2; x < w; x += 7) { g.fillStyle = cs[(Math.random() * cs.length) | 0]; g.fillRect(x + rnd(-1, 1), y, 4, 5); g.fillStyle = '#e8b896'; g.fillRect(x + 1, y - 3, 2, 3); }
  }, true));
}
function texWindows() {
  return TEX.win || (TEX.win = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#0d1018'; g.fillRect(0, 0, w, h);
    const cs = ['#ffd98a', '#ffe9b0', '#8fe3ff', '#ffffff', '#ffb36b'];
    for (let y = 6; y < h; y += 16) for (let x = 6; x < w; x += 16) {
      if (Math.random() < .5) { g.fillStyle = cs[(Math.random() * cs.length) | 0]; g.globalAlpha = rnd(.55, 1); } else { g.fillStyle = '#1a2030'; g.globalAlpha = 1; }
      g.fillRect(x, y, 8, 10);
    }
    g.globalAlpha = 1;
  }, true));
}
function texWindowsDay() {
  return TEX.winDay || (TEX.winDay = canvasTex(512, 512, (g, w, h) => {
    if (IMG.plas_c && IMG.plas_c.width) g.drawImage(IMG.plas_c, 0, 0, w, h); else { g.fillStyle = '#f4f0e6'; g.fillRect(0, 0, w, h); }
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) {
      g.fillStyle = 'rgba(40,30,20,.25)'; g.fillRect(x + 15, y + 11, 36, 46);
      const gr = g.createLinearGradient(x, y + 14, x, y + 52); gr.addColorStop(0, '#5c7896'); gr.addColorStop(1, '#1d2a3f');
      g.fillStyle = gr; g.fillRect(x + 18, y + 14, 28, 38);
      g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.moveTo(x + 18, y + 14); g.lineTo(x + 30, y + 14); g.lineTo(x + 18, y + 34); g.fill();
      g.fillStyle = '#1b2433'; g.fillRect(x + 31, y + 14, 2, 38); g.fillRect(x + 18, y + 31, 28, 2);
      g.fillStyle = '#4d6f4a'; g.fillRect(x + 6, y + 14, 11, 38); g.fillRect(x + 47, y + 14, 11, 38);
      g.fillStyle = 'rgba(0,0,0,.25)'; for (let k = 0; k < 6; k++) { g.fillRect(x + 6, y + 18 + k * 6, 11, 1); g.fillRect(x + 47, y + 18 + k * 6, 11, 1); }
      g.fillStyle = '#d9d3c5'; g.fillRect(x + 14, y + 52, 36, 4);
    }
  }, true));
}
function texNeon(text, color) {
  return canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = '#05060a'; g.fillRect(0, 0, w, h);
    g.shadowColor = color; g.shadowBlur = 24; g.fillStyle = color; g.font = 'italic 900 96px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4); g.fillText(text, w / 2, h / 2 + 4);
    g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
  });
}
function texChecker() {
  return TEX.chk || (TEX.chk = canvasTex(64, 16, (g, w, h) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#fff' : '#111'; g.fillRect(x * 8, y * 8, 8, 8); } }));
}
function texSoft() {
  return TEX.soft || (TEX.soft = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }));
}

/* ------------------------------------------------------------ Echte PBR-Texturen (ambientCG, CC0) */
const IMG = {}, PT = {};
function preloadImages() {
  const D = window.TEXDATA || {};
  return Promise.all(Object.keys(D).map(k => new Promise(res => { const im = new Image(); im.onload = im.onerror = () => { IMG[k] = im; res(); }; im.src = D[k]; })));
}
function pbr(name) {
  if (PT[name] !== undefined) return PT[name];
  const im = IMG[name]; if (!im || !im.width) return PT[name] = null;
  const t = new T.Texture(im); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.colorSpace = name.endsWith('_c') ? T.SRGBColorSpace : T.NoColorSpace; t.needsUpdate = true; return PT[name] = t;
}
function scaleUV(geo, su, sv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return geo; }
function texLines() {
  return TEX.lines || (TEX.lines = canvasTex(256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (const cx of [0.3, 0.7]) { const gr = g.createLinearGradient(w * (cx - .13), 0, w * (cx + .13), 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, 'rgba(0,0,0,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(w * (cx - .13), 0, w * .26, h); }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${rnd(.03, .08)})`; g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 3), rnd(20, 90)); }
    g.fillStyle = 'rgba(238,238,232,.93)'; g.fillRect(w * .022, 0, w * .02, h); g.fillRect(w * .958, 0, w * .02, h);
    addNoise(g, w, h, 0);
  }, true));
}
function texCarbon() {
  return TEX.carbon || (TEX.carbon = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#17181c'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
      const a = ((x + y) / 8) % 2; const gr = g.createLinearGradient(x, y, x + 8, y + 8);
      gr.addColorStop(0, a ? '#2b2d33' : '#0c0d10'); gr.addColorStop(1, a ? '#0c0d10' : '#2b2d33'); g.fillStyle = gr; g.fillRect(x, y, 8, 8);
    }
  }, true));
}
function texNumber(n, col) {
  return canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#f4f4f4'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
    g.fillStyle = col; g.font = 'italic 900 78px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 64, 70);
  });
}
function texWaterNormal() {
  return TEX.water || (TEX.water = (() => {
    const S = 128, hgt = new Float32Array(S * S), ph = []; for (let i = 0; i < 7; i++) ph.push([Math.floor(rnd(1, 5)), Math.floor(rnd(1, 5)), rnd(0, 6.28), rnd(0.4, 1)]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let v = 0; for (const [a, b, p, am] of ph) v += Math.sin((x * a + y * b) / S * 6.2832 + p) * am; hgt[y * S + x] = v; }
    return canvasTex(S, S, (g, w, h) => {
      const im = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = hgt[y * S + (x + 1) % S] - hgt[y * S + (x + S - 1) % S], dy = hgt[((y + 1) % S) * S + x] - hgt[((y + S - 1) % S) * S + x], i = (y * w + x) * 4;
        const nx = -dx * 0.9, ny = -dy * 0.9, nz = 1, l = Math.hypot(nx, ny, nz);
        im.data[i] = (nx / l * 0.5 + 0.5) * 255; im.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; im.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; im.data[i + 3] = 255;
      }
      g.putImageData(im, 0, 0);
    }, true);
  })());
}

function texWire() {
  return TEX.wire || (TEX.wire = canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(190,195,200,1)'; g.lineWidth = 3.2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.moveTo(-w, 0); g.lineTo(w, h * 2); g.moveTo(0, -h); g.lineTo(w * 2, h); g.stroke();
  }, true));
}
function texFoliage() {
  return TEX.foliage || (TEX.foliage = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4c7a38'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) { const l = rnd(0.25, 0.7), c = `hsla(${rnd(78, 118)},${rnd(35, 62)}%,${l * 45}%,${rnd(.35, .8)})`; g.fillStyle = c; g.save(); g.translate(rnd(0, w), rnd(0, h)); g.rotate(rnd(0, 6.28)); g.beginPath(); g.ellipse(0, 0, rnd(2, 6), rnd(1, 3), 0, 0, 7); g.fill(); g.restore(); }
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(10,30,5,${rnd(.1, .3)})`; g.beginPath(); g.arc(rnd(0, w), rnd(0, h), rnd(3, 9), 0, 7); g.fill(); }
  }, true));
}
function mergeGeos(list) {
  let pc = 0, ic = 0; list.forEach(g => { pc += g.attributes.position.count; ic += g.index.count; });
  const pos = new Float32Array(pc * 3), uv = new Float32Array(pc * 2), idx = new Uint32Array(ic); let po = 0, io = 0;
  list.forEach(g => { pos.set(g.attributes.position.array, po * 3); uv.set(g.attributes.uv.array, po * 2); for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + po; po += g.attributes.position.count; io += g.index.count; });
  const m = new T.BufferGeometry(); m.setAttribute('position', new T.BufferAttribute(pos, 3)); m.setAttribute('uv', new T.BufferAttribute(uv, 2)); m.setIndex(new T.BufferAttribute(idx, 1)); m.computeVertexNormals(); return m;
}
function noiseDisp(geo, amp, freq) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, y, z) || 1; const n = Math.sin(x * freq + 1.3) * Math.cos(y * freq * 1.3) + Math.sin(z * freq * 0.9 + x * 0.5) * 0.7 + Math.sin((x + y + z) * freq * 2.1) * 0.35; const d = 1 + amp * n; p.setXYZ(i, x * d, y * d, z * d); }
  return geo;
}
function makeOakGeo() {
  const parts = []; for (let k = 0; k < 7; k++) { const r = rnd(2.0, 3.1), g = noiseDisp(new T.SphereGeometry(r, 10, 7), 0.14, 0.9 + k * 0.17); g.translate(rnd(-2.2, 2.2), rnd(-1.6, 2.2) + (k === 0 ? 1.2 : 0), rnd(-2.2, 2.2)); parts.push(g); }
  return mergeGeos(parts);
}
function makePineGeo() {
  const parts = []; const rs = [3.3, 2.8, 2.3, 1.7, 1.05], hs = [3.4, 3.2, 3.0, 2.7, 2.4];
  rs.forEach((r, k) => { const g = new T.ConeGeometry(r, hs[k], 12, 3); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), a = Math.atan2(p.getZ(i), p.getX(i)), rr = Math.hypot(p.getX(i), p.getZ(i)); const j = 1 + 0.16 * Math.sin(a * 5 + k * 2.1) * (rr / r) + 0.1 * Math.sin(a * 11 + k); p.setXYZ(i, p.getX(i) * j, y - (rr / r) * 0.35, p.getZ(i) * j); } g.translate(0, 2.4 + k * 2.3, 0); parts.push(g); });
  return mergeGeos(parts);
}

/* ------------------------------------------------------------ Himmel & Umgebung */
const THEMES = {
  day:    { top: 0x2c6bd6, mid: 0xa9d0f5, bot: 0x7e8f78, sun: [0.45, 0.62, 0.35], sunCol: 0xfff2cf, fog: 0xaed0f0, fogNear: 220, fogFar: 1900, hemi: [0xc2dcff, 0x4d5c3c, 1.05], sunI: 3.2, sunC: 0xfff0d6, exp: 1.0, ground: 'grass' },
  night:  { top: 0x02030a, mid: 0x14204a, bot: 0x090c18, sun: [-0.4, 0.55, -0.5], sunCol: 0xa8c0ff, fog: 0x0b1226, fogNear: 50, fogFar: 950, hemi: [0x3c4c8c, 0x0a0a14, 0.75], sunI: 0.9, sunC: 0x86a2ff, exp: 1.15, ground: 'pave' },
  harbor: { top: 0x2a78d0, mid: 0xbfdcf2, bot: 0x6f8fa8, sun: [0.35, 0.58, 0.55], sunCol: 0xfff3d6, fog: 0xbcd8ee, fogNear: 260, fogFar: 2300, hemi: [0xcfe4ff, 0x8a8478, 1.1], sunI: 3.3, sunC: 0xfff1d8, exp: 1.0, ground: 'quay' },
  sunset: { top: 0x1f2b5c, mid: 0xff8f52, bot: 0x7a3d2c, sun: [0.8, 0.17, 0.4], sunCol: 0xffb464, fog: 0xe89868, fogNear: 220, fogFar: 2200, hemi: [0xffb98a, 0x6a3a22, 0.95], sunI: 3.6, sunC: 0xffa860, exp: 1.0, ground: 'sand' }
};
function skyMaterial(th) {
  return new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { top: { value: new T.Color(th.top) }, mid: { value: new T.Color(th.mid) }, bot: { value: new T.Color(th.bot) }, sunDir: { value: new T.Vector3(...th.sun).normalize() }, sunCol: { value: new T.Color(th.sunCol) }, time: { value: 0 }, cloudAmt: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top,mid,bot,sunDir,sunCol; uniform float time, cloudAmt; varying vec3 vD;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }
      float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.3,9.1); a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vD); float h = d.y;
        vec3 c = h>0.0 ? mix(mid,top,pow(h,0.5)) : mix(mid,bot,pow(-h,0.45));
        float sd = max(dot(d,sunDir),0.0), cl = 0.0;
        if (cloudAmt > 0.0 && h > 0.0) {
          vec2 uv = d.xz / (h + 0.18) * 0.7 + vec2(time*0.006, time*0.002);
          float n = fbm(uv*1.4), n2 = fbm(uv*1.4 + sunDir.xz*0.12);
          float cov = smoothstep(0.47, 0.78, n);
          float shade = clamp((n - n2) * 4.0 + 0.58, 0.0, 1.0);
          vec3 lit = mix(vec3(1.0), sunCol, 0.35) * 1.05, dk = mix(mid, top, 0.3) * 0.62 + vec3(0.05);
          cl = cov * smoothstep(0.0, 0.14, h) * cloudAmt;
          c = mix(c, mix(dk, lit, shade), cl);
        }
        c += sunCol*(pow(sd,900.0)*40.0 + pow(sd,40.0)*0.55 + pow(sd,6.0)*0.22) * (1.0 - 0.75*cl);
        gl_FragColor = vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}
let pmrem;
function makeEnv(th) {
  if (!pmrem) pmrem = new T.PMREMGenerator(renderer);
  const s = new T.Scene(); const m = new T.Mesh(new T.SphereGeometry(50, 32, 16), skyMaterial(th)); s.add(m);
  const rt = pmrem.fromScene(s, 0.02); s.remove(m); m.geometry.dispose(); m.material.dispose();
  return rt.texture;
}

/* ------------------------------------------------------------ Auto-Modell */
function makeCarModel(spec) {
  if (save.quality >= 3 && window.makeCarModelUltra) return window.makeCarModelUltra(spec);
  const G = new T.Group();
  const body = new T.MeshPhysicalMaterial({ color: spec.color, metalness: 0.2, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.55 });
  const acc = new T.MeshPhysicalMaterial({ color: spec.accent, metalness: 0.15, roughness: 0.4, clearcoat: 0.6, envMapIntensity: 0.55 });
  const cbT = texCarbon(); cbT.repeat.set(5, 5);
  const carbon = new T.MeshStandardMaterial({ color: 0xffffff, map: cbT, metalness: 0.5, roughness: 0.38 });
  const tireM = new T.MeshStandardMaterial({ color: 0x0f0f10, roughness: 0.92 });
  const rimM = new T.MeshStandardMaterial({ color: 0xb4b9c2, metalness: 0.9, roughness: 0.28 });
  const tailM = new T.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1010, emissiveIntensity: 0.6 });
  const decalM = new T.MeshStandardMaterial({ map: texNumber(spec.number || 7, '#' + spec.color.toString(16).padStart(6, '0')), transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mk = (geo, mat, x, y, z, parent) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; (parent || G).add(m); return m; };
  const box = (w, h, l, mat, x, y, z, p) => mk(new T.BoxGeometry(w, h, l), mat, x, y, z, p);
  const rod = (a, b, r, mat) => {
    const va = new T.Vector3(...a), vb = new T.Vector3(...b);
    const m = new T.Mesh(new T.CylinderGeometry(r, r, va.distanceTo(vb), 6), mat);
    m.position.copy(va).add(vb).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vb.clone().sub(va).normalize()); G.add(m); return m;
  };
  // Chassis
  box(1.55, 0.06, 4.4, carbon, 0, 0.11, 0.1);
  box(0.66, 0.38, 2.2, body, 0, 0.42, -0.25);
  const nose = mk(new T.CylinderGeometry(0.05, 0.27, 2.0, 16), body, 0, 0.38, -2.35); nose.rotation.x = -Math.PI / 2; nose.scale.z = 0.62;
  box(0.42, 0.02, 0.95, carbon, 0, 0.615, -0.4);
  box(0.06, 0.1, 1.0, body, -0.27, 0.64, -0.4); box(0.06, 0.1, 1.0, body, 0.27, 0.64, -0.4);
  const sps = [];
  for (const sx of [-1, 1]) {
    const sp = mk(new T.CapsuleGeometry(0.21, 1.3, 6, 14), body, sx * 0.58, 0.4, 0.6); sps.push(sp); sp.rotation.x = Math.PI / 2; sp.scale.x = 1.35;
    box(0.04, 0.2, 0.55, carbon, sx * 0.74, 0.4, -0.15);
    const dec = new T.Mesh(new T.PlaneGeometry(0.27, 0.27), decalM); dec.position.set(sx * 0.868, 0.43, 0.45); dec.rotation.y = sx * Math.PI / 2; G.add(dec);
    box(0.5, 0.025, 0.12, acc, sx * 0.58, 0.58, 0.02);
  }
  const eng = mk(new T.CylinderGeometry(0.04, 0.3, 2.5, 14), body, 0, 0.6, 1.15); eng.rotation.x = Math.PI / 2; eng.scale.z = 1.15;
  box(0.05, 0.3, 1.9, acc, 0, 0.9, 1.35);
  box(0.3, 0.42, 0.5, body, 0, 0.86, 0.42); box(0.2, 0.28, 0.02, carbon, 0, 0.88, 0.165);
  // Front- und Heckflügel
  const fw = new T.Group(); fw.position.set(0, 0.15, -3.15); G.add(fw);
  box(2.0, 0.03, 0.42, acc, 0, -0.03, -0.05, fw); const ff = box(2.0, 0.025, 0.26, body, 0, 0.05, 0.07, fw); ff.rotation.x = 0.18;
  for (const sx of [-1, 1]) box(0.03, 0.22, 0.72, acc, sx * 1.0, 0.05, 0.05, fw);
  rod([0.0, 0.2, -3.0], [0.0, 0.3, -2.4], 0.02, carbon);
  const rw = new T.Group(); rw.position.set(0, 1.0, 2.35); G.add(rw);
  box(1.05, 0.04, 0.45, acc, 0, 0, 0, rw); const rf = box(1.05, 0.03, 0.3, acc, 0, 0.13, -0.07, rw); rf.rotation.x = -0.3;
  for (const sx of [-1, 1]) box(0.03, 0.42, 0.68, acc, sx * 0.54, -0.05, 0, rw);
  box(0.08, 0.5, 0.14, carbon, 0, 0.72, 2.2); box(0.8, 0.03, 0.25, carbon, 0, 0.45, 2.5); box(1.0, 0.2, 0.5, carbon, 0, 0.25, 2.4);
  const tail = box(0.16, 0.06, 0.04, tailM, 0, 0.62, 2.64);
  // Fahrer, Halo (nur außerhalb der Cockpit-Ansicht)
  const driver = new T.Group(); G.add(driver);
  mk(new T.SphereGeometry(0.135, 16, 12), acc, 0, 0.8, -0.3, driver); box(0.19, 0.06, 0.1, carbon, 0, 0.8, -0.4, driver);
  const halo = new T.Group(); G.add(halo);
  const ring = new T.Mesh(new T.TorusGeometry(0.3, 0.022, 8, 24, Math.PI), carbon); ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.84, -0.12); ring.castShadow = true; halo.add(ring);
  const pil = rod([0, 0.65, -0.78], [0, 0.84, -0.42], 0.024, carbon); G.remove(pil); halo.add(pil);
  // Lenkrad
  const wheelBase = new T.Group(); wheelBase.position.set(0, 0.64, -0.8); wheelBase.rotation.x = -0.5; wheelBase.scale.setScalar(0.8); G.add(wheelBase);
  const wheelRot = new T.Group(); wheelBase.add(wheelRot);
  const wm = (w, h, d, mat, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); wheelRot.add(m); return m; };
  wm(0.3, 0.13, 0.03, carbon, 0, 0, 0); wm(0.07, 0.17, 0.05, new T.MeshStandardMaterial({ color: 0x222226, roughness: .8 }), -0.18, -0.01, 0); wm(0.07, 0.17, 0.05, new T.MeshStandardMaterial({ color: 0x222226, roughness: .8 }), 0.18, -0.01, 0);
  wm(0.14, 0.07, 0.01, new T.MeshStandardMaterial({ color: 0x103018, emissive: 0x2fbf6a, emissiveIntensity: 0.45 }), 0, 0.01, 0.02);
  for (let i = 0; i < 4; i++) wm(0.025, 0.025, 0.015, new T.MeshStandardMaterial({ color: 0x111, emissive: [0xff2020, 0xffdd00, 0x20a0ff, 0xffffff][i], emissiveIntensity: 1 }), -0.06 + i * 0.04, 0.055, 0.02);
  // Räder
  const compound = [0xff2a2a, 0xffd400, 0xf2f2f2][(Math.random() * 3) | 0];
  const bandM = new T.MeshBasicMaterial({ color: compound, side: T.DoubleSide });
  function wheel(r, w, side) {
    const pivot = new T.Group(), spin = new T.Group(); pivot.add(spin);
    const tire = new T.Mesh(new T.CylinderGeometry(r, r, w, 30), tireM); tire.rotation.z = Math.PI / 2; tire.castShadow = true; spin.add(tire);
    const rim = new T.Mesh(new T.CylinderGeometry(r * 0.62, r * 0.62, w + 0.02, 20), rimM); rim.rotation.z = Math.PI / 2; spin.add(rim);
    const band = new T.Mesh(new T.RingGeometry(r * 0.7, r * 0.84, 30), bandM); band.position.x = side * (w / 2 + 0.004); band.rotation.y = side * Math.PI / 2; spin.add(band);
    for (let i = 0; i < 5; i++) {
      const sp = new T.Mesh(new T.BoxGeometry(0.012, r * 1.05, 0.05), carbon); sp.position.x = side * (w / 2 + 0.01); sp.rotation.x = i * Math.PI * 2 / 5; spin.add(sp);
    }
    return { pivot, spin };
  }
  const fl = wheel(0.33, 0.36, -1), fr = wheel(0.33, 0.36, 1), rl = wheel(0.36, 0.46, -1), rr = wheel(0.36, 0.46, 1);
  fl.pivot.position.set(-0.88, 0.33, -1.7); fr.pivot.position.set(0.88, 0.33, -1.7);
  rl.pivot.position.set(-0.9, 0.36, 1.75); rr.pivot.position.set(0.9, 0.36, 1.75);
  [fl, fr, rl, rr].forEach(w => G.add(w.pivot));
  for (const sx of [-1, 1]) {
    rod([sx * 0.3, 0.3, -1.45], [sx * 0.72, 0.35, -1.7], 0.014, carbon); rod([sx * 0.3, 0.45, -1.9], [sx * 0.72, 0.35, -1.7], 0.014, carbon);
    rod([sx * 0.3, 0.3, 1.6], [sx * 0.74, 0.36, 1.75], 0.014, carbon); rod([sx * 0.3, 0.45, 1.95], [sx * 0.74, 0.36, 1.75], 0.014, carbon);
  }
  return { acc, group: G, fwing: fw, rwing: rw, parts: { nose, sps, eng }, body, acc, bodyBase: new T.Color(spec.color), wheels: [fl, fr, rl, rr], driver, halo, wheelRot, wheelBase, tail, tailM };
}

/* ------------------------------------------------------------ Geometrie-Helfer für die Strecke */
function ribbon(tr, offA, offB, yA, yB, vLen, uRep) {
  const N = tr.N, pos = [], uv = [], idx = [];
  const rep = Math.max(1, Math.round(tr.L / vLen));
  for (let i = 0; i <= N; i++) {
    const k = i % N;
    pos.push(tr.px[k] + tr.rx[k] * offA, yA, tr.pz[k] + tr.rz[k] * offA, tr.px[k] + tr.rx[k] * offB, yB, tr.pz[k] + tr.rz[k] * offB);
    const v = i / N * rep; uv.push(0, v, uRep || 1, v);
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function ribbonSeg(tr, offA, offB, y, i0, i1, vLen, uRep) {
  const N = tr.N, pos = [], uv = [], idx = [];
  for (let i = i0; i <= i1; i++) {
    const k = i % N, v = (i - i0) * tr.ds / vLen;
    pos.push(tr.px[k] + tr.rx[k] * offA, y, tr.pz[k] + tr.rz[k] * offA, tr.px[k] + tr.rx[k] * offB, y, tr.pz[k] + tr.rz[k] * offB); uv.push(0, v, uRep || 1, v);
    if (i < i1) { const a = (i - i0) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function wallSeg(tr, off, h, i0, i1, vLen, vRep) {
  const N = tr.N, pos = [], uv = [], idx = [];
  for (let i = i0; i <= i1; i++) {
    const k = i % N, x = tr.px[k] + tr.rx[k] * off, z = tr.pz[k] + tr.rz[k] * off, u = (i - i0) * tr.ds / vLen;
    pos.push(x, 0, z, x, h, z); uv.push(u, 0, u, vRep || 1);
    if (i < i1) { const a = (i - i0) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function wallGeo(tr, off, h, sign, vLen, ra, rb) {
  // senkrechte Bande bei Querversatz off (sign = Seite)
  const N = tr.N, pos = [], uv = [], idx = [], rep = Math.max(1, Math.round(tr.L / vLen));
  const A = ra === undefined ? 0 : ra, B = rb === undefined ? N : rb;
  for (let i = A; i <= B; i++) {
    const k = i % N, o = off * sign;
    const x = tr.px[k] + tr.rx[k] * o, z = tr.pz[k] + tr.rz[k] * o;
    pos.push(x, 0, z, x, h, z); const u = i / N * rep; uv.push(u, 0, u, 1);
    if (i < B) { const a = (i - A) * 2; if (sign > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

/* ------------------------------------------------------------ Rennszene */
let raceScene = null;
function disposeScene(s) {
  if (!s) return;
  s.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
}
function buildRaceScene(trackIdx, nCars) {
  const cfg = TRACKS[trackIdx], tr = C.buildTrack(cfg), th = THEMES[cfg.theme];
  const scene = new T.Scene();
  scene.fog = new T.Fog(th.fog, th.fogNear, th.fogFar); scene.userData.night = cfg.theme === 'night';
  scene.background = new T.Color(th.mid);
  scene.environment = makeEnv(th);
  const night = cfg.theme === 'night';

  // Himmel
  const sky = new T.Mesh(new T.SphereGeometry(1500, 32, 16), skyMaterial(th)); sky.renderOrder = -10; sky.frustumCulled = false; sky.userData.noAO = true; scene.add(sky);
  if (night) {
    const n = 900, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, e = Math.acos(rnd(0.05, 1)), r = 1400; p[i * 3] = Math.sin(e) * Math.cos(a) * r; p[i * 3 + 1] = Math.cos(e) * r; p[i * 3 + 2] = Math.sin(e) * Math.sin(a) * r; }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3));
    const stars = new T.Points(g, new T.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, fog: false, depthWrite: false })); stars.renderOrder = -9; stars.frustumCulled = false; sky.add(stars);
  } else if (save.quality < 2) {
    const cm = new T.SpriteMaterial({ map: texSoft(), color: th === THEMES.sunset ? 0xffc9a0 : 0xffffff, opacity: 0.8, fog: false, depthWrite: false });
    for (let i = 0; i < 26; i++) { const s = new T.Sprite(cm); const a = Math.random() * 6.283, r = rnd(700, 1350); s.position.set(Math.cos(a) * r, rnd(180, 420), Math.sin(a) * r); s.scale.set(rnd(260, 520), rnd(60, 120), 1); s.renderOrder = -8; sky.add(s); }
  }

  sky.material.uniforms.cloudAmt.value = (save.quality >= 2 && !night) ? 1 : 0;
  // Licht
  const hemi = new T.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]); scene.add(hemi);
  const sun = new T.DirectionalLight(th.sunC, th.sunI);
  const sunDir = new T.Vector3(...th.sun).normalize();
  sun.castShadow = QUAL[save.quality].shadow > 0;
  sun.shadow.mapSize.set(QUAL[save.quality].mapSize, QUAL[save.quality].mapSize);
  const shR = save.quality >= 3 ? 58 : 45, sc = sun.shadow.camera; sc.left = -shR; sc.right = shR; sc.top = shR; sc.bottom = -shR; sc.near = 10; sc.far = 400;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);

  // Boden
  const harbor = cfg.theme === 'harbor', envMats = []; let seaTex = null, tunnelInfo = null, tLight = null;
  const gk = { grass: ['grass', 9], sand: ['sand', 11], pave: ['asph', 7], quay: ['pave', 7] }[th.ground];
  const gGeo = new T.PlaneGeometry(9000, harbor ? 4500 : 9000);
  let gMat;
  if (pbr(gk[0] + '_c')) {
    scaleUV(gGeo, 9000 / gk[1], (harbor ? 4500 : 9000) / gk[1]);
    gMat = new T.MeshStandardMaterial({ map: pbr(gk[0] + '_c'), normalMap: pbr(gk[0] + '_n'), roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    if (th.ground === 'pave') gMat.color.setHex(0x70707a);
    if (save.quality >= 2) gMat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `vec4 sampledDiffuseColor = texture2D( map, vMapUv ); float macroL = dot(texture2D( map, vMapUv * 0.037 ).rgb, vec3(0.333)); sampledDiffuseColor.rgb *= mix(0.68, 1.3, smoothstep(0.1, 0.7, macroL)); diffuseColor *= sampledDiffuseColor;`); };
  } else {
    const gTex = texGround(th.ground).clone(); gTex.needsUpdate = true; gTex.repeat.set(700, harbor ? 350 : 700);
    gMat = new T.MeshStandardMaterial({ map: gTex, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
  }
  const ground = new T.Mesh(gGeo, gMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  if (harbor) {
    ground.position.set(0, 0, 14 - 2250);
    const wn = texWaterNormal(); wn.repeat.set(1, 1); seaTex = wn;
    const seaGeo = scaleUV(new T.PlaneGeometry(9000, 4500), 9000 / 14, 4500 / 14);
    const sea = new T.Mesh(seaGeo, new T.MeshStandardMaterial({ color: 0x1b78b0, roughness: 0.06, metalness: 0.75, normalMap: wn, normalScale: new T.Vector2(0.5, 0.5) }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, -1.2, 14 + 2250); scene.add(sea);
    const quay = new T.Mesh(new T.PlaneGeometry(9000, 1.2), new T.MeshStandardMaterial({ color: 0x77757a, roughness: 0.9 }));
    quay.position.set(0, -0.6, 14); scene.add(quay);
  }

  // Strecke
  let road;
  if (pbr('road_c')) {
    const rm = new T.MeshStandardMaterial({ map: pbr('road_c'), normalMap: pbr('road_n'), roughnessMap: pbr('road_r'), roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    road = new T.Mesh(ribbon(tr, -tr.halfW, tr.halfW, 0.03, 0.03, 6, tr.width / 6), rm); envMats.push(rm);
  } else road = new T.Mesh(ribbon(tr, -tr.halfW, tr.halfW, 0.03, 0.03, 22), new T.MeshStandardMaterial({ map: texAsphalt(), roughness: 0.88, metalness: 0.02, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  road.receiveShadow = true; scene.add(road);
  const lm = new T.MeshStandardMaterial({ map: texLines(), transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const lines = new T.Mesh(ribbon(tr, -tr.halfW, tr.halfW, 0.032, 0.032, 22), lm); lines.receiveShadow = true; scene.add(lines); envMats.push(lm);
  const kMat = new T.MeshStandardMaterial({ map: texKerb(), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }); envMats.push(kMat);
  for (const sg of [-1, 1]) {
    const a = sg * tr.halfW, b = sg * (tr.halfW + tr.kerb);
    const k = new T.Mesh(ribbon(tr, Math.min(a, b), Math.max(a, b), 0.045, 0.045, 3.2), kMat); k.receiveShadow = true; scene.add(k);
  }
  if (cfg.grass && pbr('grav_c')) { // Kiesbett neben der Strecke (bremst wie Gras)
    const gv = cfg.theme === 'sunset' ? 'dgrav' : 'grav', gm = new T.MeshStandardMaterial({ map: pbr(gv + '_c'), normalMap: pbr(gv + '_n'), color: cfg.theme === 'sunset' ? 0xe8d0c0 : 0xc4c4c4, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    for (const sg of [-1, 1]) { const a = sg * (tr.halfW + tr.kerb), b = sg * (tr.halfW + tr.kerb + 6.5); const m = new T.Mesh(ribbon(tr, Math.min(a, b), Math.max(a, b), 0.02, 0.02, 3.5, 6.5 / 3.5), gm); m.receiveShadow = true; scene.add(m); }
  }
  if (!cfg.grass) { // Gehweg bei der Stadtstrecke
    const sw = harbor ? 'pave' : 'asph';
    const pm = pbr(sw + '_c') ? new T.MeshStandardMaterial({ map: pbr(sw + '_c'), normalMap: pbr(sw + '_n'), color: harbor ? 0xcfcac0 : 0x6c6c74, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
      : new T.MeshStandardMaterial({ color: 0x4a4c54, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    envMats.push(pm);
    for (const sg of [-1, 1]) { const a = sg * (tr.halfW + tr.kerb), b = sg * (tr.halfW + tr.wall); const wdt = Math.abs(b - a); const m = new T.Mesh(ribbon(tr, Math.min(a, b), Math.max(a, b), 0.03, 0.03, 6, wdt / 6), pm); m.receiveShadow = true; scene.add(m); }
  }
  // Banden
  const bTex = texBarrier(cfg.theme).clone(); bTex.needsUpdate = true;
  const bMat = new T.MeshStandardMaterial({ map: bTex, roughness: 0.7, side: T.DoubleSide });
  envMats.push(bMat);
  // Tunnelbereich bestimmen (dort entfallen die Banden, die Tunnelwände übernehmen)
  let tun = null;
  if (cfg.tunnel) {
    const sc0 = cfg.scale || 1, t = cfg.tunnel; let i0 = -1, i1 = -1;
    for (let i = 0; i < tr.N; i++) { const inside = tr.px[i] > t.x0 * sc0 && tr.px[i] < t.x1 * sc0 && tr.pz[i] > t.z0 * sc0 && tr.pz[i] < t.z1 * sc0 && tr.tx[i] > 0.7; if (inside) { if (i0 < 0) i0 = i; i1 = i; } }
    if (i0 >= 0 && i1 - i0 > 4) tun = { i0, i1 };
  }
  for (const sg of [-1, 1]) {
    const ranges = tun ? [[0, tun.i0], [tun.i1, tr.N]] : [[0, tr.N]];
    for (const [ra, rb] of ranges) { const w = new T.Mesh(wallGeo(tr, tr.halfW + tr.wall, 1.25, sg, 48, ra, rb), bMat); w.receiveShadow = true; w.castShadow = true; scene.add(w); }
  }
  if (save.quality >= 3) { // Fangzaun, Pfosten und Reifenstapel (Ultra)
    const off = tr.halfW + tr.wall, ranges = tun ? [[0, tun.i0], [tun.i1, tr.N]] : [[0, tr.N]];
    const wt = texWire(), fm = new T.MeshStandardMaterial({ map: wt, transparent: true, alphaTest: 0.4, side: T.DoubleSide, roughness: 0.5, metalness: 0.7 });
    const poleG = new T.CylinderGeometry(0.045, 0.055, 4.6, 6), poleM = new T.MeshStandardMaterial({ color: 0x777c84, metalness: 0.8, roughness: 0.4 });
    const inTun = i => tun && i >= tun.i0 - 2 && i <= tun.i1 + 2, step = Math.max(1, Math.round(8 / tr.ds)), poleIdx = [];
    for (let i = 0; i < tr.N; i += step) if (!inTun(i)) poleIdx.push(i);
    const poles = new T.InstancedMesh(poleG, poleM, poleIdx.length * 2), dm = new T.Object3D();
    poleIdx.forEach((i, q) => [-1, 1].forEach((sg, s2) => { dm.position.set(tr.px[i] + tr.rx[i] * off * sg, 2.3, tr.pz[i] + tr.rz[i] * off * sg); dm.rotation.set(0, 0, 0); dm.scale.set(1, 1, 1); dm.updateMatrix(); poles.setMatrixAt(q * 2 + s2, dm.matrix); }));
    poles.castShadow = false; scene.add(poles);
    for (const sg of [-1, 1]) for (const [ra, rb] of ranges) { const geo = wallSeg(tr, off * sg, 3.3, ra, Math.min(rb, tr.N), 1.0, 3.3); geo.translate(0, 1.25, 0); const m = new T.Mesh(geo, fm); scene.add(m); }
    // Reifenstapel an den Außenseiten enger Kurven
    const tireG = new T.CylinderGeometry(0.33, 0.33, 0.32, 14), tireIM = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const spots = []; for (let i = 0; i < tr.N; i++) { if (inTun(i)) continue; const c = tr.curv[i]; if (Math.abs(c) > 0.011 && i % 1 === 0) spots.push([i, c > 0 ? 1 : -1]); }
    const tires = new T.InstancedMesh(tireG, tireIM, spots.length * 12); let ti = 0;
    spots.forEach(([i, sg]) => { const base = new T.Color([0x1a1a1c, 0x1a1a1c, 0x1a1a1c, 0x222226, 0xdddddd, 0x2255aa, 0xaa2222][(Math.random() * 7) | 0]); for (let L = 0; L < 12; L++) { const col = L >> 2, lay = L & 3, ly = lay % 3, tq = (col - 1.5) * 1.0 + (lay === 3 ? 0.33 : 0); dm.position.set(tr.px[i] + tr.rx[i] * (off - 0.36) * sg + tr.tx[i] * tq, 0.17 + ly * 0.33, tr.pz[i] + tr.rz[i] * (off - 0.36) * sg + tr.tz[i] * tq); dm.rotation.set(0, rnd(0, 6), 0); dm.scale.set(1, 1, 1); dm.updateMatrix(); tires.setMatrixAt(ti, dm.matrix); tires.setColorAt(ti, base); ti++; } });
    tires.castShadow = false; tires.receiveShadow = true; scene.add(tires);
  }
  // Start/Ziel
  const sl = new T.Group(); sl.position.set(tr.px[0], 0, tr.pz[0]); sl.rotation.y = tr.h[0]; scene.add(sl);
  const chk = new T.Mesh(new T.PlaneGeometry(tr.width, 2.4), new T.MeshBasicMaterial({ map: texChecker(), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  chk.material.map.wrapS = chk.material.map.wrapT = T.RepeatWrapping; chk.material.map.repeat.set(tr.width / 2, 1);
  chk.rotation.x = -Math.PI / 2; chk.position.y = 0.05; sl.add(chk);
  // Startaufstellung
  const slotM = new T.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  for (let k = 0; k < nCars; k++) {
    const row = Math.floor(k / 2), side = k % 2 ? 1 : -1, back = 10 + row * 9.5 + (k % 2 ? 4 : 0);
    const l = new T.Mesh(new T.PlaneGeometry(2.6, 0.2), slotM); l.rotation.x = -Math.PI / 2; l.position.set(side * 2.8, 0.05, back - 3.5); sl.add(l);
    const l2 = new T.Mesh(new T.PlaneGeometry(0.2, 1.4), slotM); l2.rotation.x = -Math.PI / 2; l2.position.set(side * 2.8 - 1.3, 0.05, back - 2.8); sl.add(l2);
    const l3 = l2.clone(); l3.position.x = side * 2.8 + 1.3; sl.add(l3);
  }
  // Startampel
  const gantryM = new T.MeshStandardMaterial({ color: 0x2b2f3a, metalness: 0.6, roughness: 0.4 });
  const gw = tr.halfW + 2.5;
  for (const sg of [-1, 1]) { const p = new T.Mesh(new T.BoxGeometry(0.9, 10, 0.9), gantryM); p.position.set(sg * gw, 5, 0); p.castShadow = true; sl.add(p); }
  const beam = new T.Mesh(new T.BoxGeometry(gw * 2 + 0.9, 1.6, 1.4), gantryM); beam.position.set(0, 9.6, 0); beam.castShadow = true; sl.add(beam);
  const banner = new T.Mesh(new T.PlaneGeometry(gw * 2 - 4, 1.0), new T.MeshBasicMaterial({ map: texNeon('START · ZIEL', '#ffffff') })); banner.position.set(0, 9.6, -0.72); banner.rotation.y = Math.PI; sl.add(banner);
  const startLights = [];
  const panel = new T.Mesh(new T.BoxGeometry(7.8, 1.5, 0.3), new T.MeshStandardMaterial({ color: 0x08090c })); panel.position.set(0, 8.2, 0.55); sl.add(panel);
  for (let i = 0; i < 5; i++) {
    const m = new T.MeshBasicMaterial({ color: 0x300606 });
    const d = new T.Mesh(new T.CircleGeometry(0.5, 20), m); d.position.set(-3.0 + i * 1.5, 8.2, 0.72); sl.add(d); startLights.push(m);
  }

  // Tribünen
  const crowd = texCrowd().clone(); crowd.needsUpdate = true; crowd.repeat.set(10, 1);
  const standM = new T.MeshStandardMaterial({ map: crowd, roughness: 0.9 });
  const concrete = new T.MeshStandardMaterial({ color: 0x8c909a, roughness: 0.9 });
  function stand(s, sg, len) {
    const p = C.trackAt(tr, s, 0), grp = new T.Group();
    grp.position.set(p.x, 0, p.z); grp.rotation.y = p.h; scene.add(grp);
    const base = tr.halfW + tr.wall + 4;
    for (let k = 0; k < 7; k++) {
      const st = new T.Mesh(new T.BoxGeometry(1.6, 1.0 + k * 1.1, len), k % 2 ? standM : standM);
      st.position.set(sg * (base + k * 1.6 + 0.8), (1.0 + k * 1.1) / 2, 0); st.castShadow = true; st.receiveShadow = true; grp.add(st);
    }
    const roof = new T.Mesh(new T.BoxGeometry(14, 0.3, len + 2), concrete); roof.position.set(sg * (base + 7.5), 11, 0); roof.castShadow = true; grp.add(roof);
    for (const z of [-len / 2, 0, len / 2]) { const pl = new T.Mesh(new T.BoxGeometry(0.4, 11, 0.4), concrete); pl.position.set(sg * (base + 13.5), 5.5, z); grp.add(pl); }
  }
  const standOff = cfg.grass ? 0 : 3;
  if (harbor) { stand(tr.L - 70, -1, 60); stand(60, -1, 50); }
  else { stand(tr.L - 60, 1, 60); stand(tr.L - 60, -1, 60); stand(70, 1, 50); stand(70, -1, 50); }
  if (tr.L > 2800 && !harbor) { stand(tr.L * 0.45, 1, 50); stand(tr.L * 0.45, -1, 40); stand(tr.L * 0.7, 1, 40); }

  // Zufällige Platzierung abseits der Strecke
  function farFromTrack(x, z, minD) {
    for (let i = 0; i < tr.N; i += 2) { const dx = x - tr.px[i], dz = z - tr.pz[i]; if (dx * dx + dz * dz < minD * minD) return false; }
    return true;
  }
  function scatter(count, minD, maxD, tries) {
    const out = [];
    for (let n = 0; n < tries && out.length < count; n++) {
      const i = (Math.random() * tr.N) | 0, sg = Math.random() < .5 ? -1 : 1;
      const o = (tr.halfW + tr.wall + minD) + Math.pow(Math.random(), 1.6) * maxD;
      const x = tr.px[i] + tr.rx[i] * o * sg + rnd(-6, 6), z = tr.pz[i] + tr.rz[i] * o * sg + rnd(-6, 6);
      if (farFromTrack(x, z, tr.halfW + tr.wall + minD * 0.8)) out.push([x, z]);
    }
    return out;
  }
  const dummy = new T.Object3D();

  if (cfg.theme === 'day') {
    const pts = scatter(save.quality >= 3 ? 650 : 950, 6, 260, 5000), n = pts.length;
    if (save.quality >= 3) {
      const ft = texFoliage(), fm = new T.MeshStandardMaterial({ map: ft, roughness: 0.88, metalness: 0 });
      const nOak = Math.floor(n * 0.6), nPine = n - nOak;
      const trunkG = new T.CylinderGeometry(0.22, 0.5, 1, 9); trunkG.translate(0, 0.5, 0);
      const trunkI = new T.InstancedMesh(trunkG, new T.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 }), n);
      const oakI = new T.InstancedMesh(makeOakGeo(), fm, nOak), pineI = new T.InstancedMesh(makePineGeo(), fm.clone(), nPine);
      const col = new T.Color();
      pts.forEach(([x, z], i) => {
        const oak = i < nOak, s = rnd(0.85, 1.55), th = oak ? 5.5 * s : 3.6 * s;
        dummy.rotation.set(0, rnd(0, 6.28), 0); dummy.scale.set(s, th, s); dummy.position.set(x, 0, z); dummy.updateMatrix(); trunkI.setMatrixAt(i, dummy.matrix);
        dummy.scale.set(s * rnd(0.9, 1.15), s * rnd(0.9, 1.2), s * rnd(0.9, 1.15));
        if (oak) { dummy.position.set(x, th + 1.6 * s, z); dummy.updateMatrix(); oakI.setMatrixAt(i, dummy.matrix); col.setHSL(rnd(0.22, 0.31), rnd(0.4, 0.6), rnd(0.55, 0.9)); oakI.setColorAt(i, col); }
        else { const j = i - nOak; dummy.position.set(x, 1.4 * s, z); dummy.updateMatrix(); pineI.setMatrixAt(j, dummy.matrix); col.setHSL(rnd(0.3, 0.38), rnd(0.35, 0.5), rnd(0.35, 0.6)); pineI.setColorAt(j, col); }
      });
      [trunkI, oakI, pineI].forEach(m => { m.castShadow = false; m.receiveShadow = true; scene.add(m); });
    } else {
    const trunk = new T.InstancedMesh(new T.CylinderGeometry(0.35, 0.5, 4, 6), new T.MeshStandardMaterial({ color: 0x5a3b22, roughness: 1 }), n);
    const c1 = new T.InstancedMesh(new T.ConeGeometry(3.4, 8, 8), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), n);
    const c2 = new T.InstancedMesh(new T.ConeGeometry(2.5, 6.5, 8), c1.material, n);
    const col = new T.Color();
    pts.forEach(([x, z], i) => {
      const s = rnd(0.8, 1.6);
      dummy.rotation.set(0, rnd(0, 6), 0); dummy.scale.set(s, s, s);
      dummy.position.set(x, 2 * s, z); dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 7.4 * s, z); dummy.updateMatrix(); c1.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 11.2 * s, z); dummy.updateMatrix(); c2.setMatrixAt(i, dummy.matrix);
      col.setHSL(rnd(0.27, 0.36), rnd(0.45, 0.65), rnd(0.18, 0.3)); c1.setColorAt(i, col); c2.setColorAt(i, col);
    });
    [trunk, c1, c2].forEach(m => { m.castShadow = true; m.receiveShadow = false; scene.add(m); });
    }
    // ferne Hügel
    const hm = new T.MeshStandardMaterial({ color: 0x4e7a42, roughness: 1, flatShading: true });
    for (let i = 0; i < 26; i++) { const a = i / 26 * 6.283 + rnd(-.1, .1), r = rnd(1100, 1500); const h = new T.Mesh(new T.SphereGeometry(1, 10, 6), hm); h.scale.set(rnd(180, 360), rnd(60, 160), rnd(180, 360)); h.position.set(Math.cos(a) * r - 150, 0, Math.sin(a) * r - 250); scene.add(h); }
  } else if (cfg.theme === 'sunset') {
    const pts = scatter(260, 8, 320, 3000), n = pts.length;
    const rockM = new T.MeshStandardMaterial({ color: 0x9a6a46, roughness: 1, flatShading: true });
    const rocks = new T.InstancedMesh(new T.DodecahedronGeometry(1, 0), rockM, n);
    pts.forEach(([x, z], i) => { const s = rnd(1, 4.5); dummy.position.set(x, s * 0.4, z); dummy.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3)); dummy.scale.set(s * rnd(.8, 1.4), s * rnd(.5, 1), s * rnd(.8, 1.4)); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix); });
    rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);
    const cp = scatter(120, 8, 200, 2000), cn = cp.length, cm = new T.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.9 });
    const trunk = new T.InstancedMesh(new T.CapsuleGeometry(0.45, 3.2, 4, 8), cm, cn), arm = new T.InstancedMesh(new T.CapsuleGeometry(0.28, 1.2, 4, 8), cm, cn * 2);
    cp.forEach(([x, z], i) => { const s = rnd(0.8, 1.7); dummy.rotation.set(0, 0, 0); dummy.scale.set(s, s, s); dummy.position.set(x, 2.1 * s, z); dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x + 0.9 * s, 2.4 * s, z); dummy.updateMatrix(); arm.setMatrixAt(i * 2, dummy.matrix);
      dummy.position.set(x - 0.9 * s, 1.8 * s, z); dummy.updateMatrix(); arm.setMatrixAt(i * 2 + 1, dummy.matrix); });
    trunk.castShadow = arm.castShadow = true; scene.add(trunk, arm);
    const mm = new T.MeshStandardMaterial({ color: 0xb4623a, roughness: 1, flatShading: true });
    for (let i = 0; i < 20; i++) { const a = rnd(0, 6.283), r = rnd(700, 1500); const rr = rnd(60, 150), h = rnd(80, 220); const m = new T.Mesh(new T.CylinderGeometry(rr * 0.75, rr, h, 9), mm); m.position.set(600 + Math.cos(a) * r, h / 2 - 2, -300 + Math.sin(a) * r); scene.add(m); }
    const dm = new T.MeshStandardMaterial({ color: 0xd6a566, roughness: 1, flatShading: true });
    for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283, r = rnd(1100, 1700); const h = new T.Mesh(new T.SphereGeometry(1, 10, 6), dm); h.scale.set(rnd(200, 400), rnd(30, 90), rnd(200, 400)); h.position.set(600 + Math.cos(a) * r, 0, -300 + Math.sin(a) * r); scene.add(h); }
  } else if (harbor) {
    const tunFree = (x, z, minD) => { if (!tun) return true; for (let i = tun.i0; i <= tun.i1; i += 2) { const dx = x - tr.px[i], dz = z - tr.pz[i]; if (dx * dx + dz * dz < minD * minD) return false; } return true; };
    const winD = texWindowsDay(), pastel = [0xf2d8b0, 0xf0c9a0, 0xe9b8a0, 0xf5e6c8, 0xd9c4a8, 0xeedbb0, 0xe3a98f, 0xf4efe0, 0xe8c27a];
    const roofM = pbr('roof_c') ? new T.MeshStandardMaterial({ map: pbr('roof_c'), normalMap: pbr('roof_n'), color: 0xffa27a, roughness: 0.9 }) : new T.MeshStandardMaterial({ color: 0xb5553a, roughness: 0.9 });
    scatter(230, 2, 190, 9000).filter(q => q[1] < 6).forEach(([x, z]) => {
      const w = rnd(14, 30), d = rnd(14, 30), h = rnd(14, 42) * (1 + clamp(-z / 500, 0, 1));
      if (!farFromTrack(x, z, tr.halfW + tr.wall + 3 + Math.max(w, d) * 0.55) || !tunFree(x, z, tr.halfW + tr.wall + 15 + Math.max(w, d) * 0.6)) return;
      const geo = new T.BoxGeometry(w, h, d), uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) { const face = Math.floor(i / 4), sx = face < 2 ? d : w; if (face < 2 || face > 3) uv.setXY(i, uv.getX(i) * sx / 30, uv.getY(i) * h / 30); else uv.setXY(i, 0.02, 0.02); }
      const b = new T.Mesh(geo, new T.MeshStandardMaterial({ color: pastel[(Math.random() * pastel.length) | 0], map: winD, normalMap: pbr('plas_n'), normalScale: new T.Vector2(0.5, 0.5), roughness: 0.9 }));
      const ry = rnd(0, 0.35); b.position.set(x, h / 2, z); b.rotation.y = ry; b.castShadow = true; b.receiveShadow = true; scene.add(b);
      const roof = new T.Mesh(scaleUV(new T.BoxGeometry(w + 1.2, 1, d + 1.2), (w + 1.2) / 6, (d + 1.2) / 6), roofM); roof.position.set(x, h + 0.5, z); roof.rotation.y = ry; scene.add(roof);
    });
    // Palmen
    const pp = scatter(110, 4, 50, 3000).filter(q => q[1] < 6 && tunFree(q[0], q[1], tr.halfW + tr.wall + 16)), pn = pp.length;
    const trunkI = new T.InstancedMesh(new T.CylinderGeometry(0.22, 0.4, 8, 6), new T.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }), pn);
    const crownI = new T.InstancedMesh(new T.SphereGeometry(3, 8, 6), new T.MeshStandardMaterial({ color: 0x2f7d3a, roughness: 0.9, flatShading: true }), pn);
    pp.forEach(([x, z], i) => { const sc2 = rnd(0.8, 1.4); dummy.rotation.set(0, 0, 0); dummy.scale.set(sc2, sc2, sc2); dummy.position.set(x, 4 * sc2, z); dummy.updateMatrix(); trunkI.setMatrixAt(i, dummy.matrix); dummy.scale.set(sc2, sc2 * 0.35, sc2); dummy.position.set(x, 8.3 * sc2, z); dummy.updateMatrix(); crownI.setMatrixAt(i, dummy.matrix); });
    trunkI.castShadow = crownI.castShadow = true; scene.add(trunkI, crownI);
    // Jachten im Hafen
    const yn = 46, hullI = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.1 }), yn);
    const cabI = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.4 }), yn);
    const mastI = new T.InstancedMesh(new T.CylinderGeometry(0.15, 0.2, 1, 5), new T.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.8, roughness: 0.3 }), yn);
    const hc = new T.Color();
    for (let i = 0; i < yn; i++) {
      const L = rnd(14, 46), x = rnd(-300, 480), z = 36 + (i % 4) * 34 + rnd(0, 12), rot = Math.PI / 2 + rnd(-0.08, 0.08), hh = L * 0.16;
      dummy.rotation.set(0, rot, 0); dummy.scale.set(L, hh, L * 0.27); dummy.position.set(x, -0.7 + hh / 2, z); dummy.updateMatrix(); hullI.setMatrixAt(i, dummy.matrix);
      hc.setHex([0xffffff, 0xffffff, 0xf3ead8, 0x1d2b4a, 0xdcdcdc][i % 5]); hullI.setColorAt(i, hc);
      dummy.scale.set(L * 0.55, hh * 1.1, L * 0.2); dummy.position.set(x, -0.7 + hh + hh * 0.55, z); dummy.updateMatrix(); cabI.setMatrixAt(i, dummy.matrix);
      const mh = L * rnd(0.5, 0.9); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, mh, 1); dummy.position.set(x, -0.7 + hh + mh / 2, z); dummy.updateMatrix(); mastI.setMatrixAt(i, dummy.matrix);
    }
    hullI.castShadow = cabI.castShadow = true; scene.add(hullI, cabI, mastI);
    // Kasino
    const cas = new T.Group(), cream = new T.MeshStandardMaterial({ color: 0xf0e2c4, map: pbr('plas_c'), normalMap: pbr('plas_n'), roughness: 0.85 }), domeM = new T.MeshStandardMaterial({ color: 0x4f9a86, roughness: 0.5, metalness: 0.4 });
    const cb = new T.Mesh(scaleUV(new T.BoxGeometry(64, 20, 34), 8, 3), cream); cb.position.y = 10; cas.add(cb);
    const cbw = new T.Mesh(new T.BoxGeometry(64.2, 20, 34.2), new T.MeshStandardMaterial({ color: 0xffffff, map: winD, transparent: true, opacity: 0.0 })); cas.add(cbw);
    for (const sx of [-1, 1]) { const tw = new T.Mesh(new T.BoxGeometry(8, 34, 8), cream); tw.position.set(sx * 26, 17, 14); cas.add(tw); const dm = new T.Mesh(new T.SphereGeometry(5.5, 14, 8, 0, 6.283, 0, 1.57), domeM); dm.position.set(sx * 26, 34, 14); cas.add(dm); }
    const mid = new T.Mesh(new T.CylinderGeometry(7, 7, 6, 14), cream); mid.position.set(0, 23, 6); cas.add(mid);
    const md = new T.Mesh(new T.SphereGeometry(7, 14, 8, 0, 6.283, 0, 1.57), domeM); md.position.set(0, 26, 6); cas.add(md);
    cas.children.forEach(o => { o.castShadow = true; });
    const cp = C.trackAt(tr, 0, 0); let ci = 0, cd = 1e9; for (let i = 0; i < tr.N; i++) { const d = Math.hypot(tr.px[i] - 110 * 1.5, tr.pz[i] + 158 * 1.5); if (d < cd) { cd = d; ci = i; } }
    cas.position.set(tr.px[ci] + tr.rx[ci] * -62, 0, tr.pz[ci] + tr.rz[ci] * -62); cas.rotation.y = tr.h[ci]; scene.add(cas);
    // ferne Berge
    const mm = new T.MeshStandardMaterial({ color: 0x7d8f7a, roughness: 1, flatShading: true });
    for (let i = 0; i < 16; i++) { const m = new T.Mesh(new T.SphereGeometry(1, 10, 6), mm); m.scale.set(rnd(260, 520), rnd(180, 380), rnd(220, 400)); m.position.set(-1300 + i * 190 + rnd(-60, 60), 0, rnd(-1500, -1150)); scene.add(m); }
    // Tunnel (geschlossene Röhre, Betontextur, Portale, begrünte Deckfläche)
    if (tun) {
      const { i0, i1 } = tun, off = tr.halfW + tr.wall, H = 6.4, TOP = 7.8, OUT = off + 14;
      const cmat = tint => new T.MeshStandardMaterial({ map: pbr('conc_c'), normalMap: pbr('conc_n'), color: tint, roughness: 0.95, side: T.DoubleSide });
      const inner = cmat(0x8f8f93), outerM = cmat(0xb9b5ab); envMats.push(inner, outerM);
      const grassTop = pbr('grass_c') ? new T.MeshStandardMaterial({ map: pbr('grass_c'), normalMap: pbr('grass_n'), roughness: 1 }) : new T.MeshStandardMaterial({ color: 0x4f8a3a });
      const add = (geo, mat, cast) => { const m = new T.Mesh(geo, mat); m.castShadow = !!cast; m.receiveShadow = true; scene.add(m); return m; };
      add(ribbonSeg(tr, -off, off, H, i0, i1, 8, off * 2 / 8), inner, true);
      for (const sg of [-1, 1]) { add(wallSeg(tr, off * sg, H, i0, i1, 8, H / 8), inner, true); add(wallSeg(tr, OUT * sg, TOP, i0, i1, 8, TOP / 8), outerM, true); }
      add(ribbonSeg(tr, -OUT, OUT, TOP, i0, i1, 8, OUT * 2 / 8), grassTop, true);
      const lampM = new T.MeshBasicMaterial({ color: 0xfff0d0, side: T.DoubleSide });
      for (const o of [-3.0, 3.0]) add(ribbonSeg(tr, o - 0.25, o + 0.25, H - 0.04, i0, i1, 8), lampM, false).receiveShadow = false;
      const portal = idx => {
        const g = new T.Group(); g.position.set(tr.px[idx], 0, tr.pz[idx]); g.rotation.y = tr.h[idx]; scene.add(g);
        for (const sg of [-1, 1]) { const m = new T.Mesh(new T.BoxGeometry(OUT - off, TOP, 1.4), outerM); m.position.set(sg * (off + OUT) / 2, TOP / 2, 0); m.castShadow = true; g.add(m); }
        const l = new T.Mesh(new T.BoxGeometry(off * 2, TOP - H, 1.4), outerM); l.position.set(0, (H + TOP) / 2, 0); l.castShadow = true; g.add(l);
      };
      portal(i0); portal(i1);
      tLight = new T.PointLight(0xffe0b0, 0, 70, 1.6); scene.add(tLight);
      tunnelInfo = { s0: i0 * tr.ds, s1: i1 * tr.ds };
    }
  } else { // Stadt bei Nacht
    const winT = texWindows();
    const lamp = new T.MeshBasicMaterial({ color: 0xffe3a0 });
    const poleM = new T.MeshStandardMaterial({ color: 0x333840, metalness: 0.6, roughness: 0.5 });
    const count = Math.floor(tr.L / 26);
    const poles = new T.InstancedMesh(new T.CylinderGeometry(0.1, 0.14, 9, 6), poleM, count * 2);
    const heads = new T.InstancedMesh(new T.SphereGeometry(0.5, 8, 6), lamp, count * 2);
    for (let q = 0; q < count; q++) for (let sgi = 0; sgi < 2; sgi++) {
      const sg = sgi ? 1 : -1, i = Math.floor(q * 26 / tr.ds) % tr.N, o = (tr.halfW + tr.wall - 0.6) * sg;
      const x = tr.px[i] + tr.rx[i] * o, z = tr.pz[i] + tr.rz[i] * o;
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.position.set(x, 4.5, z); dummy.updateMatrix(); poles.setMatrixAt(q * 2 + sgi, dummy.matrix);
      dummy.position.set(x - tr.rx[i] * sg * 0.4, 9.1, z - tr.rz[i] * sg * 0.4); dummy.updateMatrix(); heads.setMatrixAt(q * 2 + sgi, dummy.matrix);
    }
    scene.add(poles, heads);
    // Gebäude
    const bpts = scatter(150, 3, 140, 4000);
    const bcols = [0x3a4358, 0x2c3347, 0x40384f, 0x2f3b45, 0x4a4a55];
    bpts.forEach(([x, z]) => {
      const w = rnd(14, 34), d = rnd(14, 34), h = rnd(30, 150);
      if (!farFromTrack(x, z, tr.halfW + tr.wall + 3 + Math.max(w, d) * 0.55)) return;
      const geo = new T.BoxGeometry(w, h, d), uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) { const face = Math.floor(i / 4), sx = face < 2 ? d : w; if (face < 2 || face > 3) { uv.setXY(i, uv.getX(i) * sx / 18, uv.getY(i) * h / 18); } else uv.setXY(i, 0.02, 0.02); }
      const mat = new T.MeshStandardMaterial({ color: bcols[(Math.random() * bcols.length) | 0], map: winT, emissiveMap: winT, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.6, metalness: 0.2 });
      const b = new T.Mesh(geo, mat); b.position.set(x, h / 2, z); b.rotation.y = rnd(0, 0.4); b.castShadow = false; scene.add(b);
    });
    // Neon-Werbetafeln
    const neon = [['TURBO', '#ff2d6f'], ['NITRO', '#27e8ff'], ['APEX', '#ffd400'], ['ORBIT', '#8a5cff'], ['PULSE', '#31ff8a']];
    for (let q = 0; q < 14; q++) {
      const i = Math.floor(q / 14 * tr.N), sg = q % 2 ? 1 : -1, o = (tr.halfW + tr.wall + 3.5) * sg, [t, c] = neon[q % neon.length];
      const m = new T.Mesh(new T.PlaneGeometry(22, 7), new T.MeshBasicMaterial({ map: texNeon(t, c), fog: true }));
      m.position.set(tr.px[i] + tr.rx[i] * o, 12 + (q % 3) * 3, tr.pz[i] + tr.rz[i] * o); m.rotation.y = tr.h[i] + (sg > 0 ? -Math.PI / 2 : Math.PI / 2); scene.add(m);
    }
  }

  return { scene, tr, cfg, th, sun, sunDir, sky, startLights, hemi, night, seaTex, tunnelInfo, tLight, envMats };
}

/* ------------------------------------------------------------ Showroom */
const showScene = new T.Scene();
const showCam = new T.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 200);
let showCar = null, showCarId = null, showAngle = 0; const showLights = [];
(function initShow() {
  showScene.background = new T.Color(0x07090e); showScene.userData.night = true;
  showScene.fog = new T.Fog(0x07090e, 14, 40);
  showScene.environment = makeEnv(THEMES.day);
  const floor = new T.Mesh(new T.CircleGeometry(9, 64), new T.MeshStandardMaterial({ color: 0x14171f, metalness: 0.85, roughness: 0.28 }));
  floor.rotation.x = -Math.PI / 2; showScene.add(floor);
  const ring = new T.Mesh(new T.RingGeometry(5.1, 5.25, 80), new T.MeshBasicMaterial({ color: 0xff2d2d })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; showScene.add(ring);
  showScene.add(new T.HemisphereLight(0x8899cc, 0x101018, 0.6));
  const k = new T.SpotLight(0xffffff, 380, 40, 0.6, 0.6, 1.4); showLights.push(k); k.position.set(6, 12, 8); k.castShadow = false; showScene.add(k, k.target);
  const r = new T.SpotLight(0xff4040, 260, 40, 0.7, 0.8, 1.4); showLights.push(r); r.position.set(-9, 5, -8); showScene.add(r);
  const b = new T.SpotLight(0x5aa0ff, 220, 40, 0.7, 0.8, 1.4); showLights.push(b); b.position.set(9, 4, -6); showScene.add(b);
})();
function showCarModel(id) {
  if (showCarId === id) return;
  const spec = CARS.find(c => c.id === id); if (!spec) return;
  if (showCar) { showScene.remove(showCar.group); disposeScene(showCar.group); }
  showCar = makeCarModel(spec); showCar.driver.visible = true; showCar.halo.visible = true;
  showCar.group.scale.setScalar(1.25); showScene.add(showCar.group); showCarId = id;
  $('carName').children[0].textContent = spec.name.toUpperCase(); $('carName').children[1].textContent = spec.blurb;
}

/* ------------------------------------------------------------ Partikel & Trümmer */
const FX = {
  pools: { smoke: [], glow: [] },
  init(scene) {
    for (const k of ['smoke', 'glow']) {
      this.pools[k] = [];
      for (let i = 0; i < 140; i++) {
        const m = new T.SpriteMaterial({ map: texSoft(), transparent: true, depthWrite: false, blending: k === 'glow' ? T.AdditiveBlending : T.NormalBlending });
        const sp = new T.Sprite(m); sp.visible = false; sp.frustumCulled = false; scene.add(sp); this.pools[k].push(sp);
      }
    }
  },
  spawn(kind, x, y, z, vx, vy, vz, life, size, grow, color, alpha, grav) {
    const sp = this.pools[kind].find(q => !q.visible); if (!sp) return;
    sp.visible = true; sp.position.set(x, y, z); sp.scale.set(size, size, 1); sp.material.color.setHex(color); sp.material.opacity = alpha;
    sp.userData = { vx, vy, vz, life, max: life, size, grow, alpha, grav: grav || 0 };
  },
  update(dt) {
    for (const k in this.pools) for (const sp of this.pools[k]) {
      if (!sp.visible) continue; const u = sp.userData; u.life -= dt;
      if (u.life <= 0) { sp.visible = false; continue; }
      u.vy -= u.grav * dt; sp.position.x += u.vx * dt; sp.position.y += u.vy * dt; sp.position.z += u.vz * dt;
      if (sp.position.y < 0.05 && u.grav > 0) { sp.position.y = 0.05; u.vy *= -0.3; }
      const t = 1 - u.life / u.max, sz = u.size + u.grow * t; sp.scale.set(sz, sz, 1); sp.material.opacity = u.alpha * (1 - t) * (k === 'smoke' ? Math.min(1, t * 8) : 1);
    }
  }
};
const debris = [];
function detachPart(c, part, big) {
  if (!part || !raceScene) return;
  raceScene.scene.attach(part);
  debris.push({ o: part, v: new T.Vector3(c.vx * 0.8 + rnd(-5, 5), rnd(3, big ? 9 : 6), c.vz * 0.8 + rnd(-5, 5)), w: new T.Vector3(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9)), life: 30, r: big ? 0.35 : 0.12 });
}
function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i], o = d.o; d.life -= dt;
    if (d.life <= 0) { if (o.parent) o.parent.remove(o); debris.splice(i, 1); continue; }
    d.v.y -= 24 * dt; o.position.addScaledVector(d.v, dt);
    if (o.position.y < d.r) { o.position.y = d.r; d.v.y *= -0.35; d.v.x *= 0.8; d.v.z *= 0.8; d.w.multiplyScalar(0.7); if (Math.abs(d.v.y) < 1) d.v.y = 0; }
    const gnd = o.position.y <= d.r + 0.01, f = gnd ? Math.exp(-1.6 * dt) : 1; d.v.x *= f; d.v.z *= f;
    o.rotation.x += d.w.x * dt; o.rotation.y += d.w.y * dt; o.rotation.z += d.w.z * dt;
  }
}
function carToWorld(c, lx, ly, lz) { const cs = Math.cos(c.h), sn = Math.sin(c.h); return [c.x + lx * cs + lz * sn, ly, c.z - lx * sn + lz * cs]; }
function sparks(x, y, z, c, n) {
  for (let i = 0; i < n; i++) FX.spawn('glow', x, y, z, c.vx * 0.3 + rnd(-6, 6), rnd(1, 7), c.vz * 0.3 + rnd(-6, 6), rnd(0.3, 0.8), rnd(0.18, 0.4), 0, Math.random() < 0.5 ? 0xffc040 : 0xff7a20, 1, 22);
}
const PART_NAMES = { fw: 'FRONTFLÜGEL', rw: 'HECKFLÜGEL' };
function handleImpact(c) {
  const m = c.model;
  while (c.impacts.length) {
    const im = c.impacts.shift(), sev = im.sev, P = carToWorld(c, im.x, 0.35, im.z);
    sparks(P[0], P[1], P[2], c, 10 + Math.round(sev * 24));
    for (let i = 0; i < 4; i++) FX.spawn('smoke', P[0], 0.5, P[2], rnd(-2, 2), rnd(1, 3), rnd(-2, 2), rnd(0.8, 1.6), 0.8, 2.5, 0x8a8a8a, 0.55, 0);
    // Verformung der Karosserie
    if (im.z < -0.8) { m.parts.nose.rotation.y += rnd(-1, 1) * sev * 0.35; m.parts.nose.position.x += rnd(-1, 1) * sev * 0.08; }
    if (im.z > 0.8) m.parts.eng.rotation.y += rnd(-1, 1) * sev * 0.12;
    if (Math.abs(im.x) > 0.4) { const sp = m.parts.sps[im.x > 0 ? 1 : 0]; sp.scale.x *= 1 - sev * 0.2; sp.position.x -= Math.sign(im.x) * sev * 0.08; }
    // getroffenes Teil fliegt ab
    if (im.lost !== null && im.lost !== undefined) {
      if (typeof im.lost === 'number') { const w = m.wheels[im.lost]; w.gone = true; detachPart(c, w.pivot, true); }
      else detachPart(c, im.lost === 'fw' ? m.fwing : m.rwing, false);
      if (c.isPlayer) showBanner(typeof im.lost === 'number' ? 'REIFEN WEG – AUSGESCHIEDEN!' : PART_NAMES[im.lost] + ' VERLOREN', 2200);
    }
    m.body.color.copy(m.bodyBase).lerp(new T.Color(0x151515), Math.min(1, c.dmg) * 0.6);
  }
}
const Skid = {
  max: 6000, n: 0, mesh: null, last: new Map(),
  init(scene) {
    this.n = 0; this.last.clear(); const m = this.max, pos = new Float32Array(m * 12), idx = new Uint32Array(m * 6);
    for (let i = 0; i < m; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setIndex(new T.BufferAttribute(idx, 1)); geo.setDrawRange(0, 0);
    this.mesh = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    this.mesh.frustumCulled = false; scene.add(this.mesh);
  },
  add(key, x, z) {
    const l = this.last.get(key); this.last.set(key, { x, z }); if (!l) return;
    const dx = x - l.x, dz = z - l.z, len = Math.hypot(dx, dz); if (len < 0.2 || len > 4) return;
    const nx = -dz / len * 0.13, nz = dx / len * 0.13, a = this.mesh.geometry.attributes.position, i = (this.n++ % this.max) * 12, y = 0.04;
    a.array.set([l.x - nx, y, l.z - nz, l.x + nx, y, l.z + nz, x - nx, y, z - nz, x + nx, y, z + nz], i); a.clearUpdateRanges(); a.addUpdateRange(i, 12); a.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, Math.min(this.n, this.max) * 6);
  },
  stop(key) { this.last.delete(key); }
};
function emitDamageFx(c, dt) {
  // Reifenqualm + Bremsspuren
  const skidding = !c.onGrass && Math.abs(c.vf) > 8 && (c.slip > 3.6 || (c.drifting && c.slip > 2) || (c.inp && c.inp.brake > 0.85 && c.vf > 38));
  [[-0.9, 1.75], [0.9, 1.75], [-0.88, -1.7], [0.88, -1.7]].forEach(([lx, lz], w) => {
    const key = c.slot * 4 + w, rear = lz > 0, active = skidding && (rear || (c.inp && c.inp.brake > 0.85));
    if (active) { const P = carToWorld(c, lx, 0.1, lz); if (save.quality >= 2 && Skid.mesh) Skid.add(key, P[0], P[2]); if (Math.random() < 0.5) FX.spawn('smoke', P[0], 0.2, P[2], c.vx * 0.15 + rnd(-0.6, 0.6), rnd(0.6, 1.4), c.vz * 0.15 + rnd(-0.6, 0.6), rnd(0.7, 1.3), 0.5, 2.6, 0xe4e4e4, 0.26, -0.15); } else Skid.stop(key);
  });
  if (c.dmg > 0.3) {
    c.fxAcc = (c.fxAcc || 0) + dt * (6 + c.dmg * 40);
    while (c.fxAcc > 1) {
      c.fxAcc -= 1; const P = carToWorld(c, rnd(-0.1, 0.1), 0.85, 1.1), dark = c.dmg > 0.6;
      FX.spawn('smoke', P[0], P[1], P[2], c.vx * 0.5 + rnd(-0.5, 0.5), rnd(1.5, 3.5), c.vz * 0.5 + rnd(-0.5, 0.5), rnd(1, 2), 0.7, 3 + c.dmg * 2, dark ? 0x1c1c1c : 0xbbbbbb, dark ? 0.8 : 0.5, -0.3);
      if (c.dmg > 0.8) FX.spawn('glow', P[0], P[1] - 0.1, P[2], c.vx * 0.6 + rnd(-0.6, 0.6), rnd(1.5, 3), c.vz * 0.6 + rnd(-0.6, 0.6), rnd(0.25, 0.5), 0.8, -0.5, Math.random() < 0.5 ? 0xff7a20 : 0xffc040, 0.9, -1);
    }
  }
  if (c.scrape && Math.abs(c.vf) > 6) {
    const sg = c.d > 0 ? 1 : -1, P = carToWorld(c, sg * 0.95, 0.15, rnd(-1.5, 1.5));
    sparks(P[0], P[1], P[2], c, 2);
  }
}

/* ------------------------------------------------------------ Audio */
const Sound = {
  ctx: null, ok: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const A = window.AudioContext || window.webkitAudioContext; const ctx = this.ctx = new A();
      this.master = ctx.createGain(); this.master.gain.value = save.muted ? 0 : 0.5; this.master.connect(ctx.destination);
      this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = ctx.createOscillator(); this.o2.type = 'square'; this.o3 = ctx.createOscillator(); this.o3.type = 'sawtooth';
      this.f = ctx.createBiquadFilter(); this.f.type = 'lowpass'; this.f.Q.value = 3;
      this.eg = ctx.createGain(); this.eg.gain.value = 0;
      const g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain(); g1.gain.value = 0.5; g2.gain.value = 0.22; g3.gain.value = 0.3;
      this.o1.connect(g1).connect(this.f); this.o2.connect(g2).connect(this.f); this.o3.connect(g3).connect(this.f);
      this.f.connect(this.eg).connect(this.master);
      [this.o1, this.o2, this.o3].forEach(o => o.start());
      // Rauschen: Reifen + Wind + Gras
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const mkN = (type, freq, q) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; s.connect(f).connect(g).connect(this.master); s.start(); return { f, g }; };
      this.squeal = mkN('bandpass', 1900, 6); this.wind = mkN('lowpass', 700, 0.5); this.grass = mkN('lowpass', 380, 0.7);
      this.ok = true;
    } catch (e) { this.ok = false; }
  },
  update(rpm, thr, vf, slip, grass, dmg) {
    if (!this.ok) return; const t = this.ctx.currentTime;
    const f = 70 + rpm * 520;
    this.o1.detune.value = this.o3.detune.value = (Math.random() - 0.5) * (dmg || 0) * 160;
    this.o1.frequency.setTargetAtTime(f, t, 0.03); this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03); this.o3.frequency.setTargetAtTime(f * 1.505, t, 0.03);
    this.f.frequency.setTargetAtTime(500 + rpm * 2600 + thr * 1400, t, 0.05);
    this.eg.gain.setTargetAtTime(0.09 + thr * 0.14, t, 0.05);
    this.squeal.g.gain.setTargetAtTime(clamp((slip - 3) / 7, 0, 1) * 0.09, t, 0.05);
    this.wind.g.gain.setTargetAtTime(clamp(vf / 90, 0, 1) * 0.18, t, 0.1);
    this.grass.g.gain.setTargetAtTime(grass ? clamp(vf / 30, 0, 1) * 0.3 : 0, t, 0.05);
  },
  silence() { if (!this.ok) return; const t = this.ctx.currentTime; this.eg.gain.setTargetAtTime(0, t, 0.1); this.squeal.g.gain.setTargetAtTime(0, t, 0.1); this.wind.g.gain.setTargetAtTime(0, t, 0.1); this.grass.g.gain.setTargetAtTime(0, t, 0.1); },
  beep(freq, dur) { if (!this.ok) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.master); o.start(t); o.stop(t + dur); },
  crash(v) { if (!this.ok) return; const t = this.ctx.currentTime, s = this.ctx.createBufferSource(); const b = this.ctx.createBuffer(1, 8000, this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); s.buffer = b; const g = this.ctx.createGain(); g.gain.value = 0.15 + v * 0.5; const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; s.connect(f).connect(g).connect(this.master); s.start(t); },
  mute(m) { save.muted = m; persist(); if (this.ok) this.master.gain.value = m ? 0 : 0.5; }
};

/* ------------------------------------------------------------ Ultra: Postprocessing */
const LensShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, speed: { value: 0 }, aspect: { value: 1.6 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, speed, aspect; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float r = length(c*vec2(aspect,1.0));
      float ca = 0.0014 * r * r * (1.0 + speed * 2.5);
      vec2 dir = normalize(c + 1e-5);
      float blur = speed * 0.05 * smoothstep(0.12, 0.75, r * 1.3);
      vec3 col = vec3(0.0);
      for (int i = 0; i < 6; i++) {
        float t = float(i) / 5.0; vec2 uv = vUv - c * blur * t;
        col.r += texture2D(tDiffuse, uv - dir * ca).r; col.g += texture2D(tDiffuse, uv).g; col.b += texture2D(tDiffuse, uv + dir * ca).b;
      }
      col /= 6.0;
      col *= 1.0 - 0.5 * smoothstep(0.3, 1.0, r * 0.95);
      col += (hash(vUv * vec2(1920.0, 1080.0) + time) - 0.5) * 0.014;
      gl_FragColor = vec4(col, 1.0);
    }`
};
const Post = {
  composer: null, passes: {}, failed: false,
  enabled() { return save.quality === 3 && !!window.POST && !this.failed; },
  build(scene, cam) {
    const P = window.POST, size = renderer.getDrawingBufferSize(new T.Vector2());
    let rt;
    try { rt = new T.WebGLRenderTarget(size.x, size.y, { type: T.HalfFloatType, samples: renderer.getPixelRatio() > 1.25 ? 2 : 4 }); } catch (e) { rt = new T.WebGLRenderTarget(size.x, size.y, { type: T.HalfFloatType }); }
    const comp = this.composer = new P.EffectComposer(renderer, rt);
    comp.setPixelRatio(renderer.getPixelRatio()); comp.setSize(innerWidth, innerHeight);
    const pa = this.passes;
    pa.render = new P.RenderPass(scene, cam);
    pa.ao = new P.GTAOPass(scene, cam, innerWidth, innerHeight);
    pa.ao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false });
    pa.ao.blendIntensity = 0.85; pa.ao.enabled = !!save.ao;
    const aoSize = pa.ao.setSize.bind(pa.ao); pa.ao.setSize = (w, h) => aoSize(Math.ceil(w / 2), Math.ceil(h / 2)); pa.ao.setSize(innerWidth, innerHeight);
    const ov = pa.ao.overrideVisibility.bind(pa.ao);
    pa.ao.overrideVisibility = function () { ov(); this.scene.traverse(o => { if (o.isSprite || o.userData.noAO) o.visible = false; }); };
    pa.bloom = new P.UnrealBloomPass(new T.Vector2(innerWidth / 2, innerHeight / 2), 0.3, 0.55, 1.0);
    pa.lens = new P.ShaderPass(LensShader);
    pa.out = new P.OutputPass();
    [pa.render, pa.ao, pa.bloom, pa.lens, pa.out].forEach(p => comp.addPass(p));
  },
  resize() { if (this.composer) { this.composer.setPixelRatio(renderer.getPixelRatio()); this.composer.setSize(innerWidth, innerHeight); } },
  render(scene, cam, speed, bloom, dt) {
    try {
      if (!this.composer) this.build(scene, cam);
      const pa = this.passes; pa.ao.enabled = !!save.ao; pa.render.scene = pa.ao.scene = scene; pa.render.camera = pa.ao.camera = cam;
      pa.bloom.strength = bloom === undefined ? 0.3 : bloom; pa.bloom.threshold = scene.userData.night ? 1.15 : 1.0;
      pa.lens.uniforms.speed.value = clamp(speed || 0, 0, 1); pa.lens.uniforms.time.value = (pa.lens.uniforms.time.value + (dt || 0.016)) % 100; pa.lens.uniforms.aspect.value = innerWidth / innerHeight;
      this.composer.render();
    } catch (e) { console.error('Post disabled:', e); this.failed = true; renderer.render(scene, cam); }
  }
};
function renderFrame(scene, cam, speed, bloom, dt) { if (Post.enabled()) Post.render(scene, cam, speed, bloom, dt); else renderer.render(scene, cam); }

/* ------------------------------------------------------------ Eingabe */
const keys = {};
addEventListener('keydown', e => {
  if (e.repeat && ['KeyC', 'KeyR', 'KeyM', 'Escape'].includes(e.code)) return;
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (mode === 'race') {
    if (e.code === 'KeyC') camMode = (camMode + 1) % 2;
    if (e.code === 'KeyR') respawn();
    if (e.code === 'Escape') togglePause();
  }
  if (e.code === 'KeyM') { Sound.mute(!save.muted); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (mode === 'race' && race && !race.paused && race.phase !== 'done') togglePause(true); });

/* ------------------------------------------------------------ Spielzustand */
let mode = 'menu', race = null, camMode = 0, testCarId = null;
let selTrack = clamp(save.track | 0, 0, TRACKS.length - 1), selDiff = DIFFS[save.diff] ? save.diff : 'medium';
let previewId = save.car;
let hudCache = {};

/* ------------------------------------------------------------ Menü-UI */
function drawTrackPreview(cv, tr) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height; g.clearRect(0, 0, w, h);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < tr.N; i++) { x0 = Math.min(x0, tr.px[i]); x1 = Math.max(x1, tr.px[i]); z0 = Math.min(z0, tr.pz[i]); z1 = Math.max(z1, tr.pz[i]); }
  const sc = Math.min((w - 14) / (x1 - x0), (h - 14) / (z1 - z0)), ox = (w - (x1 - x0) * sc) / 2, oz = (h - (z1 - z0) * sc) / 2;
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); for (let i = 0; i <= tr.N; i++) { const k = i % tr.N, x = ox + (tr.px[k] - x0) * sc, y = oz + (tr.pz[k] - z0) * sc; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 9; g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 3.5; g.stroke();
  g.fillStyle = '#ff2d2d'; g.beginPath(); g.arc(ox + (tr.px[0] - x0) * sc, oz + (tr.pz[0] - z0) * sc, 4.5, 0, 7); g.fill();
}
const trackCache = TRACKS.map(c => C.buildTrack(c));
function renderMenu() {
  $('moneyEl').textContent = fmtMoney(save.money);
  // Strecken
  const tl = $('trackList'); tl.innerHTML = '';
  TRACKS.forEach((cfg, i) => {
    const tr = trackCache[i], el = document.createElement('div'); el.className = 'card' + (i === selTrack ? ' sel' : '');
    const best = save.best[cfg.id];
    el.innerHTML = `<canvas width="168" height="128"></canvas><div class="ct"><div class="nm">${cfg.name}</div><div class="sub"><span class="tag">${(tr.L / 1000).toFixed(2)} km</span><span class="tag">${cfg.laps} Runden</span><span class="tag">${cfg.themeLabel}</span>${best ? '<br>Beste Runde: <b>' + fmtTime(best) + '</b>' : ''}</div></div>`; el.title = cfg.desc;
    drawTrackPreview(el.querySelector('canvas'), tr);
    el.onclick = () => { selTrack = i; save.track = i; persist(); renderMenu(); };
    tl.appendChild(el);
  });
  // Schwierigkeit
  const dl = $('diffList'); dl.innerHTML = '';
  Object.values(DIFFS).forEach(d => { const b = document.createElement('button'); b.textContent = d.label; if (d.id === selDiff) b.className = 'sel'; b.onclick = () => { selDiff = d.id; save.diff = d.id; persist(); renderMenu(); }; dl.appendChild(b); });
  const D = DIFFS[selDiff];
  const pr = PRIZES.map((p, i) => `P${i + 1}: <b>${fmtMoney(Math.round(p * D.prize / 50) * 50)}</b>`).join(' · ');
  $('diffInfo').innerHTML = `Preisgeld bei Platz 1–3:<br>${pr}<br><span style="color:#8b97ad">Ab Platz 4 gibt es kein Geld. Startplatz: ${(() => { const n = clamp(save.bots | 0, 1, 15) + 1; return Math.min(n - 1, { easy: Math.round(n * 0.45), medium: Math.round(n * 0.7), hard: n - 1 }[selDiff]) + 1; })()} von ${clamp(save.bots | 0, 1, 15) + 1}.</span>`;
  // Garage
  const cl = $('carList'); cl.innerHTML = '';
  const mx = { top: 104, accel: 19, grip: 35, brake: 39 };
  CARS.forEach(c => {
    const owned = save.owned.includes(c.id), el = document.createElement('div');
    el.className = 'card car' + (save.car === c.id ? ' sel' : '');
    const bar = (l, v, m) => `<div class="stat"><span>${l}</span><div class="bar"><i style="width:${Math.round(v / m * 100)}%"></i></div></div>`;
    let act;
    if (save.car === c.id) act = '<div class="act own">✔ AUSGEWÄHLT</div>';
    else if (owned) act = '<div class="act use">AUSWÄHLEN</div>';
    else if (save.money >= c.price) act = `<div class="act buy">KAUFEN · ${fmtMoney(c.price)}</div>`;
    else act = `<div class="act no">🔒 ${fmtMoney(c.price)}</div>`;
    if (!owned) act += '<div class="act test">🏁 PROBEFAHRT</div>';
    el.innerHTML = `<div class="row1"><div class="nm">${c.name}</div><div style="width:18px;height:18px;border-radius:50%;background:#${c.color.toString(16).padStart(6, '0')};border:2px solid #${c.accent.toString(16).padStart(6, '0')}"></div></div>
      ${bar('Topspeed', c.top, mx.top)}${bar('Beschl.', c.accel, mx.accel)}${bar('Kurvengrip', c.grip, mx.grip)}${bar('Bremsen', c.brake, mx.brake)}${act}`;
    el.onmouseenter = () => { previewId = c.id; showCarModel(c.id); };
    el.onmouseleave = () => { previewId = save.car; showCarModel(save.car); };
    const tb = el.querySelector('.act.test'); if (tb) tb.onclick = e => { e.stopPropagation(); testCarId = c.id; startRace(); };
    el.onclick = () => {
      if (owned) { save.car = c.id; }
      else if (save.money >= c.price) { save.money -= c.price; save.owned.push(c.id); save.car = c.id; Sound.init(); Sound.beep(880, 0.15); setTimeout(() => Sound.beep(1320, 0.25), 120); }
      else return;
      persist(); renderMenu(); showCarModel(c.id);
    };
    cl.appendChild(el);
  });
  showCarModel(previewId);
}
function renderSettings() {
  const q = $('setQual'); q.innerHTML = '';
  QUAL.forEach((o, i) => { const b = document.createElement('button'); b.textContent = o.label; if (i === save.quality) b.className = 'sel'; b.onclick = () => { save.quality = i; persist(); applyQuality(); renderSettings(); showCarId = null; showCarModel(previewId); }; q.appendChild(b); });
  $('setQualInfo').textContent = ['Niedrig: schnellste Darstellung, einfache Schatten.', 'Mittel: Schatten, Standard-Details.', 'Hoch: Himmel mit Wolken, Kiesbetten, Reifenspuren, Bodendetail.', 'Ultra: Post-Processing (Bloom, Umgebungsverdeckung, Bewegungsunschärfe, Antialiasing), hochdetaillierte Autos mit Spiegelungen, Fangzäune, Reifenstapel, realistische Bäume, größere Schattenqualität. Braucht eine starke Grafikkarte.'][save.quality];
  $('setBots').value = save.bots; $('setBotsV').textContent = save.bots + ' Bots · ' + (save.bots + 1) + ' Autos';
  $('setFov').value = save.fov; $('setFovV').textContent = save.fov + '°';
  $('setAO').checked = !!save.ao; $('setRefl').checked = !!save.refl;
  $('setAuto').checked = !!save.auto; $('setSound').checked = !save.muted;
}
$('setBtn').onclick = () => { renderSettings(); $('settings').classList.remove('hidden'); };
$('setClose').onclick = () => { $('settings').classList.add('hidden'); renderMenu(); };
$('setBots').oninput = e => { save.bots = clamp(+e.target.value | 0, 1, 15); persist(); renderSettings(); };
$('setFov').oninput = e => { save.fov = clamp(+e.target.value | 0, 60, 100); persist(); renderSettings(); };
$('setAO').onchange = e => { save.ao = e.target.checked; persist(); };
$('setRefl').onchange = e => { save.refl = e.target.checked; persist(); };
$('setAuto').onchange = e => { save.auto = e.target.checked; persist(); };
$('setSound').onchange = e => { Sound.init(); Sound.mute(!e.target.checked); };

/* ------------------------------------------------------------ Rennen */
function startRace() {
  Sound.init();
  mode = 'loading'; $('loading').classList.remove('hidden'); $('menu').classList.add('hidden'); $('result').classList.add('hidden'); $('pause').classList.add('hidden');
  setTimeout(() => { try { initRace(); } catch (e) { console.error(e); alert('Fehler beim Laden: ' + e.message); toMenu(); } $('loading').classList.add('hidden'); }, 60);
}
function initRace() {
  if (raceScene) { disposeScene(raceScene.scene); raceScene = null; }
  const nCars = Math.min(clamp(save.bots | 0, 1, 15), testCarId ? 5 : 15) + 1;
  raceScene = buildRaceScene(selTrack, nCars);
  const { scene, tr, cfg } = raceScene;
  const D = DIFFS[selDiff], pSpec = CARS.find(c => c.id === (testCarId || save.car));
  const cars = [], playerSlot = Math.min(nCars - 1, { easy: Math.round(nCars * 0.45), medium: Math.round(nCars * 0.7), hard: nCars - 1 }[selDiff]);
  const botSlots = []; for (let k = 0; k < nCars; k++) if (k !== playerSlot) botSlots.push(k);
  const mkCar = (slot, car, ai) => {
    const row = Math.floor(slot / 2), side = slot % 2 ? 2.8 : -2.8, back = 10 + row * 9.5 + (slot % 2 ? 4 : 0);
    C.placeCar(car, tr, tr.L - back, side, -back);
    car.slot = slot; car.lapIdx = -1; car.model = makeCarModel({ color: car.color, accent: car.accent, number: car.isPlayer ? 1 : [3, 5, 7, 11, 14, 16, 23, 44, 55, 77, 88, 99, 8, 19, 27, 33][slot % 16] });
    scene.add(car.model.group); car.model.group.position.set(car.x, 0, car.z); car.model.group.rotation.y = car.h;
    car.model.driver.visible = !car.isPlayer; car.model.halo.visible = !car.isPlayer;
    if (ai) { car.ai = ai; car.ai.offBase = side * 0.45; car.ai.off = side; }
    car.wheelAng = 0; car.dmg = 0; cars.push(car); return car;
  };
  const player = mkCar(playerSlot, C.makeCar({ name: 'Du', isPlayer: true, stats: { top: pSpec.top, accel: pSpec.accel, brake: pSpec.brake, grip: pSpec.grip, down: pSpec.down }, color: pSpec.color, accent: pSpec.accent }), null);
  botSlots.forEach((slot, bi) => {
    const st = Object.assign({}, D.car);
    st.top *= rnd(0.985, 1.015); st.grip *= rnd(0.98, 1.02); st.accel *= rnd(0.97, 1.03);
    const col = C.BOT_COLORS[bi % C.BOT_COLORS.length], skill = D.skill * rnd(0.975, 1.015);
    const bot = C.makeCar({ name: C.BOT_NAMES[bi], stats: st, color: col[0], accent: col[1], baseSkill: skill });
    mkCar(slot, bot, C.makeAI(st, tr, skill)); bot.reaction = rnd(0.05, 0.45);
  });
  // Nachtlicht für den Spieler
  if (raceScene.night) {
    const sp = new T.SpotLight(0xfff0d0, 520, 200, 0.42, 0.75, 1.3); sp.position.set(0, 0.6, -2.4);
    const tg = new T.Object3D(); tg.position.set(0, -2, -40); player.model.group.add(sp, tg); sp.target = tg;
  }
  debris.length = 0; FX.init(scene); if (save.quality >= 2) Skid.init(scene);
  race = { test: testCarId, testName: pSpec.name, maxV: 0, scene, tr, cfg, cars, player, laps: cfg.laps, time: 0, phase: 'grid', phaseT: 0, lightsOn: 0, goDelay: rnd(0.6, 1.4), finishOrder: [], done: false, paused: false, acc: 0, wrongT: 0, stuckT: 0, bannerT: 0, shake: 0, rpm: 0.2, gear: 1, lastLap: 0, bestLap: testCarId ? 0 : (save.best[cfg.id] || 0), resultT: -1, over: false };
  mode = 'race'; camMode = 0;
  setupHud(); $('hud').classList.remove('hidden');
  drawMapBase();
  scene.add(camera);
  applyQuality();
  $('hint').textContent = 'W Gas · S Bremse · A/D Lenken · Leertaste Driften · C Kamera · R Zurücksetzen · Esc Pause';
}
function setupHud() {
  hudCache = {};
  document.querySelector('#posBox .of').textContent = '/' + race.cars.length;
  const r = $('rpm'); r.innerHTML = ''; for (let i = 0; i < 18; i++) r.appendChild(document.createElement('i'));
  [...$('lights').children].forEach(l => l.classList.remove('on')); $('lights').classList.remove('hidden');
  $('banner').classList.remove('show'); $('timeTxt').textContent = '0:00.00'; $('lastLap').textContent = '';
}
let mapBase = null;
function drawMapBase() {
  const tr = race.tr, cv = $('map'), w = cv.width;
  mapBase = document.createElement('canvas'); mapBase.width = mapBase.height = w;
  drawTrackPreview(mapBase, tr);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < tr.N; i++) { x0 = Math.min(x0, tr.px[i]); x1 = Math.max(x1, tr.px[i]); z0 = Math.min(z0, tr.pz[i]); z1 = Math.max(z1, tr.pz[i]); }
  const sc = Math.min((w - 14) / (x1 - x0), (w - 14) / (z1 - z0));
  race.map = { x0, z0, sc, ox: (w - (x1 - x0) * sc) / 2, oz: (w - (z1 - z0) * sc) / 2 };
}
function setHud(id, val, prop) { const k = id + (prop || ''); if (hudCache[k] !== val) { hudCache[k] = val; if (prop === 'html') $(id).innerHTML = val; else $(id).textContent = val; } }
function ranking() {
  const R = race;
  return R.cars.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1; if (b.finished) return 1;
    return b.prog - a.prog;
  });
}
function respawn() {
  if (!race || race.phase === 'grid' || race.phase === 'countdown' || race.paused) return;
  const p = race.player, tr = race.tr;
  C.placeCar(p, tr, p.s + 2, 0, undefined); p.prog += 0; p.steer = 0; p.spin = 0; p.vx = p.vz = 0; p.vf = 0;
  showBanner('ZURÜCKGESETZT', 900);
}
function showBanner(text, ms) {
  const b = $('banner'); b.textContent = text; b.classList.add('show');
  clearTimeout(showBanner.t); showBanner.t = setTimeout(() => b.classList.remove('show'), ms || 1500);
}
function togglePause(force) {
  if (!race || race.phase === 'done') return;
  race.paused = force === true ? true : !race.paused;
  $('pause').classList.toggle('hidden', !race.paused);
  if (race.paused) Sound.silence();
}
$('bResume').onclick = () => togglePause(false);
$('bRestart').onclick = () => startRace();
$('bQuit').onclick = () => toMenu();
$('startBtn').onclick = () => { testCarId = null; startRace(); };

function toMenu() {
  testCarId = null; mode = 'menu'; race = null; Sound.silence();
  $('hud').classList.add('hidden'); $('pause').classList.add('hidden'); $('result').classList.add('hidden'); $('loading').classList.add('hidden'); $('menu').classList.remove('hidden');
  if (raceScene) { disposeScene(raceScene.scene); raceScene = null; }
  previewId = save.car; renderMenu();
}

function inputForPlayer() {
  const up = keys.KeyW || keys.ArrowUp, down = keys.KeyS || keys.ArrowDown, left = keys.KeyA || keys.ArrowLeft, right = keys.KeyD || keys.ArrowRight;
  return { throttle: up ? 1 : 0, brake: down ? 1 : 0, steer: (left ? 1 : 0) - (right ? 1 : 0), drift: !!keys.Space };
}

function stepRace(dt) {
  const R = race, tr = R.tr, p = R.player;
  R.phaseT += dt;
  if (R.phase === 'grid' && R.phaseT > 1.2) { R.phase = 'countdown'; R.phaseT = 0; }
  else if (R.phase === 'countdown') {
    const n = Math.min(5, Math.floor(R.phaseT / 0.85) + (R.phaseT > 0 ? 1 : 0));
    if (n !== R.lightsOn && n <= 5) { R.lightsOn = n; Sound.beep(520, 0.12); [...$('lights').children].forEach((l, i) => l.classList.toggle('on', i < n)); raceScene.startLights.forEach((m, i) => m.color.setHex(i < n ? 0xff1111 : 0x300606)); }
    if (R.lightsOn === 5 && R.phaseT > 5 * 0.85 + R.goDelay) {
      R.phase = 'race'; R.phaseT = 0; Sound.beep(1040, 0.5); showBanner('LOS!', 1100);
      [...$('lights').children].forEach(l => l.classList.remove('on')); raceScene.startLights.forEach(m => m.color.setHex(0x300606)); $('lights').classList.add('hidden');
    }
  }
  const racing = R.phase === 'race' || R.phase === 'done';
  if (racing) R.time += dt;
  if (racing) R.maxV = Math.max(R.maxV, p.vf);
  // Rubber-Banding (nur Leicht/Mittel, sanft)
  const rb = selDiff === 'hard' ? 0 : 0.035;
  for (const c of R.cars) {
    let inp;
    if (c.removed) continue;
    if (c.dead && !c.isPlayer && racing) { c.deadT = (c.deadT || 0) + dt; if (c.deadT > 7) { c.removed = true; c.model.group.visible = false; FX.spawn('smoke', c.x, 0.6, c.z, 0, 1.5, 0, 1.6, 2, 5, 0xbbbbbb, 0.6, 0); continue; } }
    if (!racing || (R.phase === 'race' && R.phaseT < (c.reaction || 0) && !c.finished)) { c.inp = { throttle: 0, brake: 0, steer: 0 }; c.vf = 0; continue; }
    if (c.isPlayer && !c.finished) inp = inputForPlayer();
    else {
      if (!c.ai) c.ai = C.makeAI(c.stats, tr, 0.72);
      const rubber = c.isPlayer ? 1 : 1 + clamp((R.player.prog - c.prog) / 1800, -rb, rb);
      inp = C.aiControl(c, c.ai, tr, R.cars, dt, R.time, rubber);
    }
    c.inp = inp;
    C.stepCar(c, inp, dt, tr);
  }
  C.collideCars(R.cars);
  // Runden / Ziel
  for (const c of R.cars) {
    const li = Math.floor(c.prog / tr.L);
    if (li > c.lapIdx) {
      if (c.lapIdx >= 0 && li >= 1) {
        const lt = R.time - c.lapStart; c.bestLap = c.bestLap ? Math.min(c.bestLap, lt) : lt;
        if (c.isPlayer && li < R.laps) {
          R.lastLap = lt; let msg = 'Runde ' + li + ': ' + fmtTime(lt);
          if (!R.bestLap || lt < R.bestLap) { R.bestLap = lt; if (!R.test) { save.best[R.cfg.id] = lt; persist(); } msg += R.test ? '  ★ Bestzeit' : '  ★ Rekord'; }
          setHud('lastLap', msg); if (li === R.laps - 1) showBanner('LETZTE RUNDE', 1800);
        }
      }
      c.lapIdx = li; c.lapStart = R.time;
    }
    if (!c.finished && c.prog >= R.laps * tr.L) {
      c.finished = true; c.finishTime = R.time; R.finishOrder.push(c);
      if (c.isPlayer) {
        const lt = R.time - (c.lapStart || 0); if (lt > 20) { R.lastLap = lt; if (!R.bestLap || lt < R.bestLap) { R.bestLap = lt; if (!R.test) { save.best[R.cfg.id] = lt; persist(); } } }
        R.phase = 'done'; R.resultT = 1.6; c.ai = C.makeAI(c.stats, tr, 0.7); c.ai.off = c.d; c.ai.offBase = 0;
        showBanner('ZIEL!', 2000);
      }
    }
    if (c.impacts.length) handleImpact(c);
    if (c.hit > 0) { if (c.isPlayer) { R.shake = Math.max(R.shake, c.hit); Sound.crash(c.hit); $('flash').style.opacity = String(Math.min(0.35, c.hit * 0.5)); setTimeout(() => $('flash').style.opacity = '0', 90); } c.hit = 0; }
  }
  if (racing && p.drifting && p.slip > 4.5) { R.driftT = (R.driftT || 0) + dt; if (R.driftT > 0.9 && R.time - (R.driftBanner || -9) > 2.5) { R.driftBanner = R.time; R.driftT = 0; showBanner('DRIFT!', 700); } } else if (!p.drifting) R.driftT = 0;
  // Falsche Richtung / Hängenbleiben
  if (racing && !p.finished) {
    const dh = Math.abs(wrap(p.h - tr.h[p.i]));
    R.wrongT = (dh > 2.2 && p.vf > 3) || (dh > 2.2 && Math.abs(p.vf) < 3) ? R.wrongT + dt : 0;
    if (R.wrongT > 1.5) { showBanner('FALSCHE RICHTUNG – R drücken', 600); }
  }
  if (p.dead && R.phase === 'race' && !p.finished) { R.deadT = (R.deadT || 0) + dt; if (R.deadT > 3.5) { R.phase = 'done'; R.dnf = true; R.resultT = 0.01; } }
  if (R.resultT > 0) { R.resultT -= dt; if (R.resultT <= 0) showResult(); }
}

function showResult() {
  const R = race, rk = ranking(), pos = R.dnf ? 99 : R.finishOrder.indexOf(R.player) + 1;
  const D = DIFFS[selDiff];
  let prize = 0; if (!R.test && pos >= 1 && pos <= 3) prize = Math.round(PRIZES[pos - 1] * D.prize / 50) * 50;
  if (prize) { save.money += prize; persist(); }
  const rows = rk.map((c, i) => `<tr class="${c.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${c.name}</td><td>${c.finished ? fmtTime(c.finishTime) : c.dead ? 'ausgeschieden' : 'unterwegs'}</td></tr>`).join('');
  if (R.test) {
    const spec = CARS.find(c => c.id === R.test), canBuy = save.money >= spec.price && !save.owned.includes(spec.id);
    const best = R.player.bestLap || R.bestLap;
    $('resultBox').innerHTML = `<h1 class="win" style="font-size:34px">PROBEFAHRT BEENDET</h1><div class="big"><b>${spec.name}</b></div>
      <div class="big" style="font-size:16px">${R.dnf ? 'Ausgeschieden (Reifen verloren)' : 'Platz ' + pos + ' von ' + R.cars.length} · Beste Runde: <b>${best ? fmtTime(best) : '–'}</b> · Höchstgeschwindigkeit: <b>${Math.round(R.maxV * 3.6)} km/h</b></div>
      <table>${rows}</table><div class="big" style="font-size:15px">Kontostand: <b style="color:#ffd54a">${fmtMoney(save.money)}</b> · Preis: <b>${fmtMoney(spec.price)}</b></div>
      <div class="btns">${canBuy ? '<button class="pri" id="rBuy">Kaufen</button>' : ''}<button ${canBuy ? '' : 'class="pri"'} id="rAgain">Nochmal testen</button><button id="rMenu">Menü / Garage</button></div>`;
    $('result').classList.remove('hidden');
    $('rAgain').onclick = () => startRace(); $('rMenu').onclick = () => toMenu();
    if (canBuy) $('rBuy').onclick = () => { save.money -= spec.price; save.owned.push(spec.id); save.car = spec.id; persist(); toMenu(); };
    Sound.silence(); Sound.beep(660, 0.3); return;
  }
  const head = R.dnf ? '<h1 class="lose">AUSGESCHIEDEN</h1>' : pos <= 3 ? `<h1 class="win">${['🏆 SIEG!', 'PLATZ 2', 'PLATZ 3'][pos - 1]}</h1>` : `<h1 class="lose">PLATZ ${pos}</h1>`;
  const body = prize > 0 ? `<div class="big">Podium geschafft – du erhältst</div><div class="prize">+ ${fmtMoney(prize)}</div>` : R.dnf ? `<div class="big">Ein Reifen ist abgerissen – du kannst nicht weiterfahren.</div>` : `<div class="big">Kein Podium – für Preisgeld brauchst du mindestens Platz 3.</div>`;
  $('resultBox').innerHTML = `${head}${body}<table>${rows}</table><div class="big" style="font-size:15px">Kontostand: <b style="color:#ffd54a">${fmtMoney(save.money)}</b></div><div class="btns"><button class="pri" id="rAgain">Nochmal fahren</button><button id="rMenu">Menü / Garage</button></div>`;
  $('result').classList.remove('hidden');
  $('rAgain').onclick = () => startRace(); $('rMenu').onclick = () => toMenu();
  Sound.silence(); Sound.beep(pos <= 3 ? 880 : 330, 0.4); if (pos <= 3) setTimeout(() => Sound.beep(1180, 0.5), 220);
}

/* ------------------------------------------------------------ Darstellung (Rennen) */
const camPos = new T.Vector3(), tmpV = new T.Vector3();
let fpsAvg = 60, fpsT = 0;
function renderRace(dt) {
  const R = race, tr = R.tr, p = R.player, S = raceScene;
  // Fahrzeugmodelle
  for (const c of R.cars) {
    const g = c.model.group; g.position.set(c.x, 0, c.z); g.rotation.y = c.h;
    c.wheelAng -= c.vf * dt / 0.34;
    const w = c.model.wheels; w.forEach(x => { if (!x.gone) x.spin.rotation.x = c.wheelAng; });
    if (!w[0].gone) w[0].pivot.rotation.y = c.steer * 0.32; if (!w[1].gone) w[1].pivot.rotation.y = c.steer * 0.32;
    if (dt > 0) emitDamageFx(c, dt);
    const braking = c.inp && c.inp.brake > 0.1 && c.vf > 1;
    c.model.tailM.emissiveIntensity = braking ? 3.2 : 0.6;
    if (c.isPlayer) { c.model.wheelRot.rotation.z = c.steer * 1.4; }
  }
  FX.update(dt); updateDebris(dt);
  if (save.quality >= 3 && save.refl) {
    if (!S.cube) {
      const rt = new T.WebGLCubeRenderTarget(128, { generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter, type: T.HalfFloatType });
      S.cube = { rt, cam: new T.CubeCamera(0.3, 1800, rt), n: 0 }; S.scene.add(S.cube.cam);
      R.cars.forEach(c => { c.model.body.envMap = rt.texture; c.model.acc.envMap = rt.texture; c.model.body.needsUpdate = c.model.acc.needsUpdate = true; });
    }
    if ((S.cube.n++ % 14) === 0) {
      S.cube.cam.position.set(p.x, 1.3, p.z); R.cars.forEach(c => c.model.group.visible = false); const sa = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
      S.cube.cam.update(renderer, S.scene); renderer.shadowMap.autoUpdate = sa; R.cars.forEach(c => c.model.group.visible = true);
    }
  }
  // Kamera
  const fx = -Math.sin(p.h), fz = -Math.cos(p.h), speed = Math.abs(p.vf);
  const latG = p.vl * (p.yaw || 0);
  R.shake = Math.max(0, R.shake - dt * 2.2);
  const sh = (R.shake * 0.12 + (p.onGrass ? 0.015 * Math.min(1, speed / 30) : 0) + speed * 0.00012) ;
  if (camMode === 0) {
    const lx = 0, ly = 0.97, lz = -0.22;
    camera.position.set(p.x + lx * Math.cos(p.h) + lz * Math.sin(p.h), ly + (Math.random() - 0.5) * sh * 0.3, p.z - lx * Math.sin(p.h) + lz * Math.cos(p.h));
    camera.position.x += (Math.random() - 0.5) * sh * 0.3; camera.position.z += (Math.random() - 0.5) * sh * 0.3;
    camera.rotation.set(-0.045 + (Math.random() - 0.5) * sh * 0.1, p.h + (Math.random() - 0.5) * sh * 0.06, clamp(-p.steer * 0.018 + p.yaw * 0.012 * Math.min(1, speed / 50), -0.08, 0.08) + (Math.random() - 0.5) * sh * 0.1, 'YXZ');
    camera.fov += (save.fov + speed * 0.14 - camera.fov) * Math.min(1, dt * 4);
    p.model.driver.visible = false; p.model.halo.visible = false;
  } else {
    const tx = p.x - fx * 8.5, tz = p.z - fz * 8.5;
    camPos.set(tx, 2.7, tz);
    if (!R.chaseInit) { camera.position.copy(camPos); R.chaseInit = true; }
    camera.position.lerp(camPos, Math.min(1, dt * 7));
    tmpV.set(p.x + fx * 14, 0.9, p.z + fz * 14); camera.lookAt(tmpV);
    camera.fov += (save.fov + 4 + speed * 0.1 - camera.fov) * Math.min(1, dt * 4);
    p.model.driver.visible = true; p.model.halo.visible = true;
  }
  if (camMode === 0) R.chaseInit = false;
  camera.updateProjectionMatrix();
  // Sonne/Schatten folgen
  S.sun.position.set(p.x + S.sunDir.x * 150, S.sunDir.y * 150, p.z + S.sunDir.z * 150); S.sun.target.position.set(p.x, 0, p.z);
  if (R.dbg) { camera.position.set(...R.dbg.p); camera.lookAt(...R.dbg.l); }
  S.sky.position.copy(camera.position);
  S.sky.material.uniforms.time.value += dt;
  if (S.seaTex) { S.seaTex.offset.x += dt * 0.0016; S.seaTex.offset.y += dt * 0.0009; }
  if (S.tunnelInfo) {
    const t = S.tunnelInfo, f = clamp(1 - Math.max(0, t.s0 - p.s, p.s - t.s1) / 22, 0, 1), ei = 1 - 0.7 * f;
    S.hemi.intensity = S.th.hemi[2] * (1 - 0.55 * f); S.sun.intensity = S.th.sunI * (1 - 0.97 * f);
    S.tLight.intensity = 140 * f; S.tLight.position.set(p.x, 5.4, p.z);
    S.envMats.forEach(m => m.envMapIntensity = ei);
    R.cars.forEach(c => { const eb = c.model.envBase || 0.55; c.model.body.envMapIntensity = eb * ei; c.model.acc.envMapIntensity = eb * ei; });
  }
  S.scene.fog.far = S.th.fogFar;
  // Motorsound / HUD
  const ratio = clamp(p.vf / p.stats.top, 0, 1.05), th = [0, 0.12, 0.24, 0.36, 0.5, 0.64, 0.78, 0.9, 2];
  let gear = 1; for (let i = 1; i < 8; i++) if (ratio >= th[i]) gear = i + 1;
  const frac = clamp((ratio - th[gear - 1]) / (th[gear] - th[gear - 1]), 0, 1);
  const thrIn = p.inp ? p.inp.throttle : 0;
  const target = 0.18 + thrIn * 0.12 + frac * 0.62 + (gear === 1 ? 0 : 0.12 * (1 - frac) * 0);
  R.rpm += (clamp(target, 0.15, 1) - R.rpm) * Math.min(1, dt * 9); R.gear = p.vf < -1 ? -1 : (speed < 0.5 ? 0 : gear);
  if (!R.paused) Sound.update(R.rpm, thrIn, speed, p.slip, p.onGrass, p.dmg);
  updateHud(R, p, speed);
  S.scene.getObjectByName; // (kein-op)
  renderer.toneMappingExposure = S.th.exp;
  renderFrame(S.scene, camera, clamp(speed / 95, 0, 1) * (camMode === 0 ? 1 : 0.6), S.night ? 0.4 : 0.26, dt);
}
function updateHud(R, p, speed) {
  const rk = ranking(), pos = rk.indexOf(p) + 1;
  setHud('posBig', String(R.finishOrder.includes(p) ? R.finishOrder.indexOf(p) + 1 : pos));
  const lap = clamp(Math.floor(p.prog / R.tr.L) + 1, 1, R.laps);
  setHud('lapTxt', 'RUNDE ' + (p.finished ? R.laps : lap) + ' / ' + R.laps + (R.test ? ' · PROBEFAHRT' : ''));
  setHud('spd', String(Math.round(speed * 3.6)));
  setHud('gear', R.gear === -1 ? 'R' : R.gear === 0 ? 'N' : String(R.gear));
  const on = Math.round(R.rpm * 18), segs = $('rpm').children;
  if (hudCache.rpmOn !== on) { hudCache.rpmOn = on; for (let i = 0; i < segs.length; i++) segs[i].className = i < on ? 'on' + (i > 14 ? ' r' : i > 10 ? ' y' : '') : ''; }
  setHud('timeTxt', fmtTime(Math.max(0, R.time)));
  const dp = p.dead ? 100 : Math.min(95, (p.lost.fw ? 35 : 0) + (p.lost.rw ? 35 : 0) + Math.round(p.dmg * 25)); setHud('dmgTxt', p.dead ? 'AUS' : dp + '%');
  if (hudCache.dmgW !== dp) { hudCache.dmgW = dp; const b = $('dmgBar'); b.style.width = dp + '%'; b.style.background = dp > 66 ? '#ff3b3b' : dp > 33 ? '#ffd54a' : '#3ddc84'; }
  const vg = Post.enabled() ? '0' : (0.35 + Math.round(Math.min(0.55, speed / 140) * 20) / 20).toFixed(2); if (hudCache.vig !== vg) { hudCache.vig = vg; $('vig').style.opacity = vg; }
  let h = '';
  rk.forEach((c, i) => { h += `<div class="${c.isPlayer ? 'me' : ''}"><i>${i + 1}</i>${c.name}</div>`; });
  setHud('board', h, 'html');
  // Minimap (30 Hz)
  if ((R.mapTick = (R.mapTick || 0) + 1) % 2) return;
  const cv = $('map'), g = cv.getContext('2d'), m = R.map;
  g.clearRect(0, 0, cv.width, cv.height); g.drawImage(mapBase, 0, 0);
  for (const c of R.cars) {
    g.fillStyle = c.isPlayer ? '#ffd54a' : '#' + c.color.toString(16).padStart(6, '0');
    g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.arc(m.ox + (c.x - m.x0) * m.sc, m.oz + (c.z - m.z0) * m.sc, c.isPlayer ? 9 : 6, 0, 7); g.fill(); g.stroke();
  }
  if (R.phase === 'grid' || R.phase === 'countdown') setHud('hint', 'Bereit machen … ' + (selDiff === 'hard' ? '' : ''));
  else setHud('hint', R.time < 12 ? 'W Gas · S Bremse · A/D Lenken · Leertaste Driften · C Kamera · R Zurücksetzen · Esc Pause' : '');
  $('hint').style.display = hudCache.hint ? '' : 'none';
}

/* ------------------------------------------------------------ Hauptschleife */
const STEP = 1 / 120;
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now; if (dt > 0.045) Gov.ema = 0;
  if (mode === 'menu') {
    showAngle += dt * 0.35;
    if (showCar) showCar.group.rotation.y = showAngle;
    showCam.position.set(0, 3.4, 12.5); showCam.lookAt(0, 0.55, 0);
    if (window.__showDbg) { showCam.position.set(...window.__showDbg.p); showCam.lookAt(...window.__showDbg.l); if (window.__showDbg.fix && showCar) showCar.group.rotation.y = window.__showDbg.fix[0]; }
    renderer.toneMappingExposure = 1.0;
    showLights.forEach(l => { if (!l.userData.base) l.userData.base = l.intensity; l.intensity = l.userData.base * (Post.enabled() ? 0.5 : 1); });
    renderFrame(showScene, showCam, 0, 0.12, dt);
  } else if (mode === 'race' && race) {
    // adaptive Auflösung (dynamisch), danach ggf. Stufe senken
    if (save.auto && race.phase !== 'grid') {
      Gov.ema = Gov.ema ? Gov.ema + (dt - Gov.ema) * 0.08 : dt; Gov.t += dt;
      if (Gov.t > 1.2) {
        Gov.t = 0; const ms = Gov.ema * 1000; let s = Gov.scale;
        if (ms > 20.5) s = Math.max(0.5, s - (ms > 30 ? 0.15 : 0.07)); else if (ms < 15.5 && s < 1) s = Math.min(1, s + 0.05);
        if (Math.abs(s - Gov.scale) > 1e-3) { Gov.scale = s; applyRes(); }
        else if (Gov.scale <= 0.52 && ms > 32 && save.quality > 0) { save.quality--; Gov.scale = 1; Gov.ema = 0; persist(); applyQuality(); showBanner('Grafik automatisch gesenkt: ' + QUAL[save.quality].label, 2200); }
      }
    }
    if (!race.paused) {
      race.acc += dt; let n = 0;
      while (race.acc >= STEP && n < 10) { stepRace(STEP); race.acc -= STEP; n++; }
      if (race.acc > STEP * 10) race.acc = 0;
    }
    renderRace(race.paused ? 0 : dt);
  }
}

// Start
$('loading').textContent = 'LADE TEXTUREN …'; $('loading').classList.remove('hidden');
preloadImages().then(() => { $('loading').classList.add('hidden'); $('loading').textContent = 'LADE STRECKE …'; applyQuality(); renderMenu(); requestAnimationFrame(frame); });
window.__game = { get postState() { return JSON.stringify({ on: Post.enabled(), built: !!Post.composer, failed: Post.failed, q: save.quality, scale: Gov.scale, pr: renderer.getPixelRatio() }); }, dbg(p, l) { if (race) race.dbg = p ? { p, l } : null; }, step(n) { for (let i = 0; i < n; i++) stepRace(STEP); }, get race() { return race; }, save, startRace, toMenu, setSel(t, d) { selTrack = t; selDiff = d; } };
})();
