/* TURBO GP – Ultra-Fahrzeugmodell: geloftete Karosserie, Flügelprofile, Reifen mit Schriftzug, Halo, Fahrer */
(function () {
'use strict';
const T = window.THREE;
const GC = {}; // Geometrie-Cache (alle Autos teilen die Form, nur Lack/Livery unterscheiden sich)
const cache = (k, f) => GC[k] || (GC[k] = f());
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------- Loft: Querschnitte (Superellipsen) entlang z ---------- */
function cr(p0, p1, p2, p3, t) { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
function secAt(S, z) {
  let i = 0; while (i < S.length - 2 && z > S[i + 1].z) i++;
  const a = S[Math.max(0, i - 1)], b = S[i], c = S[i + 1], d = S[Math.min(S.length - 1, i + 2)];
  const t = Math.max(0, Math.min(1, (z - b.z) / (c.z - b.z || 1))), o = {};
  for (const k of ['w', 'yb', 'yt', 'cx', 'n']) o[k] = cr(a[k], b[k], c[k], d[k], t);
  return o;
}
function loft(S, nz, nr) {
  S = S.map(s => Object.assign({ cx: 0, n: 2.4 }, s));
  const pos = [], uv = [], idx = [], z0 = S[0].z, z1 = S[S.length - 1].z, W = nr + 1;
  for (let i = 0; i <= nz; i++) {
    const z = z0 + (z1 - z0) * i / nz, s = secAt(S, z), e = 2 / Math.max(1.2, s.n);
    for (let j = 0; j <= nr; j++) {
      const a = j / nr * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      pos.push(s.cx + s.w * Math.sign(c) * Math.pow(Math.abs(c), e), (s.yb + s.yt) / 2 + (s.yt - s.yb) / 2 * Math.sign(sn) * Math.pow(Math.abs(sn), e), z);
      uv.push(j / nr, i / nz);
    }
  }
  for (let i = 0; i < nz; i++) for (let j = 0; j < nr; j++) { const a = i * W + j, b = a + 1, c = a + W, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const n = g.attributes.normal; // Naht glätten
  for (let i = 0; i <= nz; i++) { const a = i * W, b = a + nr; const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), zz = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, zz) || 1; n.setXYZ(a, x / l, y / l, zz / l); n.setXYZ(b, x / l, y / l, zz / l); }
  return g;
}

/* ---------- Flügelprofil (NACA-artig), Spannweite entlang x, Sehne entlang z ---------- */
function wingGeo(chord, thick, camber, span, flipUp) {
  const N = 14, up = [], lo = [];
  for (let i = 0; i <= N; i++) {
    const x = Math.pow(i / N, 1.6), yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x), yc = camber * 4 * x * (1 - x) * (flipUp ? 1 : -1);
    up.push(new T.Vector2(x * chord, (yc + yt) * chord)); lo.push(new T.Vector2(x * chord, (yc - yt) * chord));
  }
  const sh = new T.Shape(); sh.moveTo(up[0].x, up[0].y); for (const p of up) sh.lineTo(p.x, p.y); for (let i = lo.length - 1; i >= 0; i--) sh.lineTo(lo[i].x, lo[i].y);
  const g = new T.ExtrudeGeometry(sh, { depth: span, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -span / 2); g.rotateY(-Math.PI / 2); g.computeVertexNormals(); return g;
}
function plateGeo(pts, thick) { // Seitenansicht (z,y) -> Endplatte mit Dicke in x
  const sh = new T.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  const g = new T.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 });
  g.translate(0, 0, -thick / 2); g.rotateY(-Math.PI / 2); g.computeVertexNormals(); return g;
}

/* ---------- Texturen ---------- */
function canvasTex(w, h, draw, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); if (srgb) t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t; }
const hex = n => '#' + n.toString(16).padStart(6, '0');
function liveryTex(color, accent, number) {
  return canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = hex(color); g.fillRect(0, 0, w, h);
    const sh = g.createLinearGradient(0, 0, 0, h); sh.addColorStop(0, 'rgba(255,255,255,.10)'); sh.addColorStop(.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.18)'); g.fillStyle = sh; g.fillRect(0, 0, w, h);
    // Längsstreifen oben (u=.25) und seitlich
    g.fillStyle = hex(accent); g.fillRect(w * .235, 0, w * .03, h); g.fillStyle = '#fff'; g.fillRect(w * .225, 0, w * .006, h); g.fillRect(w * .269, 0, w * .006, h);
    g.fillStyle = hex(accent); g.fillRect(0, h * .55, w, h * .07); g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, h * .62, w, h * .012);
    // Sponsoren (längs gedreht)
    const spons = ['TURBO', 'NITRO', 'APEX', 'ZENITH', 'ORBIT', 'PULSE'];
    g.fillStyle = 'rgba(255,255,255,.92)'; g.font = 'italic 900 40px Arial'; g.textBaseline = 'middle';
    for (const ux of [0.0, 0.5, 1.0]) for (let k = 0; k < 4; k++) { g.save(); g.translate(w * ux + (ux === 0 ? 34 : ux === 1 ? -34 : 0), h * (0.12 + k * 0.22)); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText(spons[(k + Math.round(ux * 4)) % 6], 0, 0); g.restore(); }
    g.fillStyle = hex(accent); g.font = 'italic 900 90px Arial'; g.textAlign = 'center'; g.save(); g.translate(w * .25, h * .86); g.rotate(-Math.PI / 2); g.fillText(String(number), 0, 0); g.restore();
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${rnd(.01, .035)})`; g.fillRect(rnd(0, w), rnd(0, h), rnd(2, 30), rnd(1, 3)); }
  });
}
function numberDecal(n, col, acc) {
  return canvasTex(256, 256, (g) => { g.clearRect(0, 0, 256, 256); g.fillStyle = '#f6f6f6'; g.beginPath(); g.arc(128, 128, 116, 0, 7); g.fill(); g.lineWidth = 10; g.strokeStyle = hex(acc); g.stroke(); g.fillStyle = hex(col); g.font = 'italic 900 150px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 128, 140); });
}
function tireBand(compound) {
  return cache('band' + compound, () => canvasTex(512, 512, (g) => {
    g.clearRect(0, 0, 512, 512); g.translate(256, 256);
    g.lineWidth = 16; g.strokeStyle = hex(compound); g.beginPath(); g.arc(0, 0, 196, 0, 6.2832); g.stroke();
    g.fillStyle = 'rgba(235,235,235,.85)'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const txt = 'TURBO SLICK • RACING •'; for (let i = 0; i < txt.length; i++) { const a = -Math.PI / 2 + i / txt.length * 6.2832; g.save(); g.rotate(a + Math.PI / 2); g.translate(0, -224); g.fillText(txt[i], 0, 0); g.restore(); }
    g.fillStyle = 'rgba(235,235,235,.7)'; for (let k = 0; k < 3; k++) { g.save(); g.rotate(k * 2.094 + 0.5); g.fillRect(-18, -170, 36, 7); g.restore(); }
  }));
}
function rimTex() {
  return cache('rim', () => canvasTex(512, 512, (g) => {
    const gr = g.createRadialGradient(256, 256, 20, 256, 256, 256); gr.addColorStop(0, '#c9ccd2'); gr.addColorStop(.7, '#7d8189'); gr.addColorStop(1, '#2a2c31'); g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    g.translate(256, 256); g.fillStyle = 'rgba(10,10,12,.85)';
    for (let k = 0; k < 10; k++) { g.save(); g.rotate(k * Math.PI / 5); g.beginPath(); g.moveTo(-18, -90); g.lineTo(18, -90); g.lineTo(26, -205); g.lineTo(-26, -205); g.closePath(); g.fill(); g.restore(); }
    g.fillStyle = '#16171a'; g.beginPath(); g.arc(0, 0, 46, 0, 7); g.fill(); g.fillStyle = '#d4a017'; g.beginPath(); g.arc(0, 0, 26, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(0, 0, 10, 0, 7); g.fill();
  }));
}
function carbonTex() { return cache('carbon', () => { const t = canvasTex(128, 128, (g) => { for (let y = 0; y < 128; y += 16) for (let x = 0; x < 128; x += 16) { const a = ((x + y) / 16) % 2, gr = g.createLinearGradient(x, y, x + 16, y + 16); gr.addColorStop(0, a ? '#34363d' : '#08090b'); gr.addColorStop(1, a ? '#08090b' : '#34363d'); g.fillStyle = gr; g.fillRect(x, y, 16, 16); } }); t.wrapS = t.wrapT = T.RepeatWrapping; return t; }); }
function helmetTex(col, acc) {
  return canvasTex(256, 128, (g, w, h) => { g.fillStyle = hex(col); g.fillRect(0, 0, w, h); g.fillStyle = hex(acc); g.fillRect(0, h * .42, w, h * .12); g.fillStyle = '#fff'; g.fillRect(0, h * .55, w, h * .04); g.fillStyle = hex(acc); g.beginPath(); g.arc(w * .75, h * .5, 20, 0, 7); g.fill(); });
}

/* ---------- Auto ---------- */
window.makeCarModelUltra = function (spec) {
  const G = new T.Group();
  const livery = liveryTex(spec.color, spec.accent, spec.number || 7);
  const body = new T.MeshPhysicalMaterial({ color: 0xffffff, map: livery, metalness: 0.28, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.0 });
  const accC = new T.Color(spec.accent); if (accC.r + accC.g + accC.b > 2.2) accC.multiplyScalar(0.78);
  const acc = new T.MeshPhysicalMaterial({ color: accC, metalness: 0.05, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.8 });
  const cbT = carbonTex().clone(); cbT.needsUpdate = true; cbT.repeat.set(3, 3);
  const carbon = new T.MeshPhysicalMaterial({ color: 0xffffff, map: carbonTex(), metalness: 0.45, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: 0.9 });
  const metal = new T.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 1, roughness: 0.3, envMapIntensity: 1 });
  const dark = new T.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.6, metalness: 0.3 });
  const tailM = new T.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1010, emissiveIntensity: 0.7 });
  const add = (geo, mat, x, y, z, parent) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; (parent || G).add(m); return m; };

  // ----- Karosserie-Lofts -----
  const noseG = cache('nose', () => loft([
    { z: -3.12, w: 0.035, yb: 0.27, yt: 0.33, n: 2.2 }, { z: -2.7, w: 0.085, yb: 0.235, yt: 0.355, n: 2.3 }, { z: -2.2, w: 0.14, yb: 0.2, yt: 0.4, n: 2.4 },
    { z: -1.75, w: 0.2, yb: 0.17, yt: 0.46, n: 2.5 }, { z: -1.3, w: 0.27, yb: 0.14, yt: 0.55, n: 2.6 }], 36, 28));
  const nosePivot = new T.Group(); nosePivot.position.z = -1.3; G.add(nosePivot);
  add(noseG, body, 0, 0, 1.3, nosePivot);
  const tubG = cache('tub', () => loft([
    { z: -1.32, w: 0.27, yb: 0.14, yt: 0.55, n: 2.6 }, { z: -0.9, w: 0.31, yb: 0.12, yt: 0.6, n: 2.7 }, { z: -0.35, w: 0.36, yb: 0.11, yt: 0.64, n: 2.9 },
    { z: 0.25, w: 0.37, yb: 0.11, yt: 0.66, n: 3.0 }, { z: 0.9, w: 0.33, yb: 0.12, yt: 0.66, n: 2.8 }], 30, 28));
  add(tubG, body, 0, 0, 0);
  const engG = cache('eng', () => loft([
    { z: 0.88, w: 0.33, yb: 0.2, yt: 0.66, n: 2.8 }, { z: 1.4, w: 0.29, yb: 0.2, yt: 0.7, n: 2.6 }, { z: 1.95, w: 0.2, yb: 0.2, yt: 0.6, n: 2.4 },
    { z: 2.4, w: 0.11, yb: 0.22, yt: 0.42, n: 2.2 }, { z: 2.66, w: 0.06, yb: 0.26, yt: 0.36, n: 2.1 }], 30, 24));
  const eng = add(engG, body, 0, 0, 0);
  const abG = cache('airbox', () => loft([
    { z: 0.04, w: 0.04, yb: 0.62, yt: 0.78, n: 2.3 }, { z: 0.16, w: 0.15, yb: 0.62, yt: 0.96, n: 2.8 }, { z: 0.5, w: 0.17, yb: 0.62, yt: 1.03, n: 2.8 }, { z: 1.0, w: 0.13, yb: 0.64, yt: 0.86, n: 2.5 }, { z: 1.4, w: 0.05, yb: 0.66, yt: 0.74, n: 2.2 }], 26, 20));
  add(abG, body, 0, 0, 0);
  const intake = new T.Mesh(new T.CircleGeometry(0.115, 20), dark); intake.scale.y = 1.25; intake.position.set(0, 0.84, 0.1); intake.rotation.y = Math.PI; G.add(intake);
  const finG = cache('fin', () => { const sh = new T.Shape(); sh.moveTo(0.9, 0.68); sh.lineTo(1.5, 0.78); sh.lineTo(2.35, 0.88); sh.lineTo(2.42, 0.62); sh.lineTo(1.4, 0.62); const g = new T.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: false }); g.translate(0, 0, -0.009); g.rotateY(-Math.PI / 2); return g; });
  add(finG, body, 0, 0, 0);
  // Cockpit
  const cav = new T.Mesh(new T.CircleGeometry(0.19, 24), dark); cav.rotation.x = -Math.PI / 2; cav.scale.set(1, 2.1, 1); cav.position.set(0, 0.664, -0.34); G.add(cav);
  const rimG = new T.TorusGeometry(0.2, 0.018, 8, 28); const rimM = new T.Mesh(rimG, carbon); rimM.rotation.x = -Math.PI / 2; rimM.scale.set(1, 2.1, 1); rimM.position.set(0, 0.665, -0.34); rimM.castShadow = true; G.add(rimM);
  add(new T.BoxGeometry(0.34, 0.2, 0.1), carbon, 0, 0.74, 0.03);
  // Seitenkästen
  const spG = cache('sidepod', () => loft([
    { z: -0.95, w: 0.1, yb: 0.2, yt: 0.4, cx: 0.5, n: 2.4 }, { z: -0.55, w: 0.2, yb: 0.12, yt: 0.5, cx: 0.55, n: 2.6 }, { z: 0.3, w: 0.27, yb: 0.1, yt: 0.52, cx: 0.57, n: 2.8 },
    { z: 1.1, w: 0.23, yb: 0.1, yt: 0.42, cx: 0.5, n: 2.6 }, { z: 1.8, w: 0.15, yb: 0.11, yt: 0.32, cx: 0.4, n: 2.4 }, { z: 2.3, w: 0.06, yb: 0.13, yt: 0.27, cx: 0.3, n: 2.2 }], 34, 24));
  const sps = [];
  for (const sx of [-1, 1]) {
    const sp = add(spG, body, 0, 0, 0); sp.scale.x = sx; sps.push(sp);
    const inlet = new T.Mesh(new T.CircleGeometry(0.1, 18), dark); inlet.scale.set(1, 1.7, 1); inlet.position.set(sx * 0.5, 0.31, -0.94); inlet.rotation.y = Math.PI; G.add(inlet);
    const dec = new T.Mesh(new T.PlaneGeometry(0.3, 0.3), new T.MeshStandardMaterial({ map: numberDecal(spec.number || 7, spec.color, spec.accent), transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    dec.position.set(sx * 0.838, 0.3, 0.2); dec.rotation.y = sx * Math.PI / 2; G.add(dec);
    // Spiegel
    add(new T.BoxGeometry(0.1, 0.05, 0.06), body, sx * 0.54, 0.7, -0.62); add(new T.CylinderGeometry(0.008, 0.008, 0.16, 6), carbon, sx * 0.47, 0.67, -0.62).rotation.z = sx * 1.1;
  }
  // Unterboden, Diffusor
  const floorG = cache('floor', () => { const sh = new T.Shape(); [[-0.33, -1.55], [-0.72, -1.0], [-0.8, 1.0], [-0.62, 2.35], [0.62, 2.35], [0.8, 1.0], [0.72, -1.0], [0.33, -1.55]].forEach((p, i) => i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])); const g = new T.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.translate(0, 0.12, 0); return g; });
  add(floorG, carbon, 0, 0, 0);
  const diff = add(new T.BoxGeometry(1.2, 0.03, 0.7), carbon, 0, 0.2, 2.5); diff.rotation.x = 0.28;
  for (let i = -2; i <= 2; i++) add(new T.BoxGeometry(0.015, 0.14, 0.62), carbon, i * 0.22, 0.2, 2.5);
  add(new T.CylinderGeometry(0.045, 0.05, 0.16, 12), metal, 0, 0.42, 2.68).rotation.x = Math.PI / 2;
  const tail = add(new T.BoxGeometry(0.16, 0.06, 0.03), tailM, 0, 0.5, 2.7);

  // ----- Frontflügel -----
  const fw = new T.Group(); fw.position.set(0, 0.15, -3.15); G.add(fw);
  const fwG = [cache('fw0', () => wingGeo(0.34, 0.045, 0.1, 1.95, false)), cache('fw1', () => wingGeo(0.24, 0.04, 0.12, 1.85, false)), cache('fw2', () => wingGeo(0.18, 0.035, 0.14, 1.75, false))];
  add(fwG[0], acc, 0, -0.04, -0.06, fw); const f1 = add(fwG[1], body, 0, 0.02, 0.1, fw); f1.rotation.x = 0.08; const f2 = add(fwG[2], acc, 0, 0.07, 0.2, fw); f2.rotation.x = 0.16;
  const epG = cache('fep', () => plateGeo([[-0.16, -0.08], [0.3, -0.08], [0.42, 0.04], [0.38, 0.17], [0.22, 0.2], [-0.1, 0.1]], 0.025));
  for (const sx of [-1, 1]) { add(epG, acc, sx * 0.99, 0.0, 0.02, fw); }
  const pyl = add(new T.BoxGeometry(0.06, 0.02, 0.5), carbon, 0, 0.03, 0.4, fw); pyl.rotation.x = -0.12; pyl.position.y = 0.1;

  // ----- Heckflügel -----
  const rw = new T.Group(); rw.position.set(0, 1.0, 2.35); G.add(rw);
  add(cache('rw0', () => wingGeo(0.44, 0.06, 0.13, 1.04, true)), acc, 0, 0, -0.05, rw);
  const rf = add(cache('rw1', () => wingGeo(0.3, 0.05, 0.12, 1.04, true)), body, 0, 0.14, -0.04, rw); rf.rotation.x = 0.34;
  const repG = cache('rep', () => plateGeo([[-0.26, -0.3], [0.3, -0.34], [0.36, -0.12], [0.3, 0.16], [0.08, 0.26], [-0.18, 0.16], [-0.28, -0.05]], 0.025));
  for (const sx of [-1, 1]) add(repG, acc, sx * 0.53, -0.03, 0, rw);
  add(new T.BoxGeometry(0.2, 0.05, 0.14), dark, 0, 0.28, -0.1, rw);
  add(new T.BoxGeometry(0.07, 0.44, 0.12), carbon, 0, 0.78, 2.3);
  const beam = add(cache('beam', () => wingGeo(0.26, 0.04, 0.08, 0.86, false)), carbon, 0, 0.47, 2.52);

  // ----- Räder -----
  const compound = [0xff2a2a, 0xffd400, 0xf2f2f2][(Math.random() * 3) | 0];
  const tireM = new T.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.88, metalness: 0 });
  const rimMat = new T.MeshStandardMaterial({ map: rimTex(), metalness: 0.85, roughness: 0.35 });
  function tireGeo(r, w) {
    return cache('tire' + r + w, () => {
      const prof = [new T.Vector2(r * 0.6, -w / 2), new T.Vector2(r * 0.88, -w / 2), new T.Vector2(r * 0.96, -w * 0.47), new T.Vector2(r * 0.995, -w * 0.4), new T.Vector2(r, -w * 0.3), new T.Vector2(r, w * 0.3), new T.Vector2(r * 0.995, w * 0.4), new T.Vector2(r * 0.96, w * 0.47), new T.Vector2(r * 0.88, w / 2), new T.Vector2(r * 0.6, w / 2)];
      const g = new T.LatheGeometry(prof, 56); g.rotateZ(Math.PI / 2); return g;
    });
  }
  function wheel(r, w, side) {
    const pivot = new T.Group(), spin = new T.Group(); pivot.add(spin);
    const tire = new T.Mesh(tireGeo(r, w), tireM); tire.castShadow = true; spin.add(tire);
    const xo = side * (w / 2 + 0.002);
    const band = new T.Mesh(new T.PlaneGeometry(r * 2 * 0.99, r * 2 * 0.99), new T.MeshStandardMaterial({ map: tireBand(compound), transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); band.position.x = xo; band.rotation.y = side * Math.PI / 2; spin.add(band);
    const rim = new T.Mesh(new T.CircleGeometry(r * 0.64, 40), rimMat); rim.position.x = xo + side * 0.0015; rim.rotation.y = side * Math.PI / 2; spin.add(rim);
    const hub = new T.Mesh(new T.CylinderGeometry(r * 0.2, r * 0.2, w * 0.9, 16), dark); hub.rotation.z = Math.PI / 2; spin.add(hub);
    const disc = new T.Mesh(new T.CylinderGeometry(r * 0.55, r * 0.55, 0.05, 28), new T.MeshStandardMaterial({ color: 0x3a3a3f, metalness: 0.9, roughness: 0.4 })); disc.rotation.z = Math.PI / 2; disc.position.x = -side * w * 0.2; spin.add(disc);
    return { pivot, spin };
  }
  const fl = wheel(0.33, 0.36, -1), fr = wheel(0.33, 0.36, 1), rl = wheel(0.36, 0.46, -1), rr = wheel(0.36, 0.46, 1);
  fl.pivot.position.set(-0.88, 0.33, -1.7); fr.pivot.position.set(0.88, 0.33, -1.7); rl.pivot.position.set(-0.9, 0.36, 1.75); rr.pivot.position.set(0.9, 0.36, 1.75);
  [fl, fr, rl, rr].forEach(w => G.add(w.pivot));
  const rod = (a, b, r) => { const va = new T.Vector3(...a), vb = new T.Vector3(...b), m = new T.Mesh(new T.CylinderGeometry(r, r, va.distanceTo(vb), 8), carbon); m.scale.x = 0.55; m.position.copy(va).add(vb).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vb.clone().sub(va).normalize()); m.castShadow = true; G.add(m); return m; };
  for (const sx of [-1, 1]) {
    rod([sx * 0.3, 0.3, -1.45], [sx * 0.7, 0.35, -1.72], 0.017); rod([sx * 0.3, 0.3, -1.95], [sx * 0.7, 0.35, -1.68], 0.017); rod([sx * 0.28, 0.52, -1.7], [sx * 0.72, 0.4, -1.7], 0.016);
    rod([sx * 0.3, 0.3, 1.55], [sx * 0.72, 0.38, 1.78], 0.017); rod([sx * 0.3, 0.3, 2.0], [sx * 0.72, 0.38, 1.72], 0.017); rod([sx * 0.28, 0.5, 1.75], [sx * 0.74, 0.42, 1.75], 0.016);
  }

  // ----- Fahrer, Halo, Lenkrad -----
  const driver = new T.Group(); G.add(driver);
  const hm = new T.Mesh(new T.SphereGeometry(0.135, 28, 20), new T.MeshPhysicalMaterial({ map: helmetTex(spec.accent, spec.color), roughness: 0.2, clearcoat: 1, metalness: 0.1 })); hm.scale.set(1, 1.05, 1.2); hm.position.set(0, 0.8, -0.2); hm.castShadow = true; driver.add(hm);
  const vis = new T.Mesh(new T.SphereGeometry(0.139, 20, 14, -0.9 + Math.PI, 1.8, 1.0, 0.75), new T.MeshPhysicalMaterial({ color: 0x0a0a12, roughness: 0.05, metalness: 0.9, clearcoat: 1 })); vis.scale.set(1, 1.05, 1.2); vis.position.copy(hm.position); driver.add(vis);
  const sh = new T.Mesh(new T.CapsuleGeometry(0.1, 0.34, 6, 12), new T.MeshStandardMaterial({ color: spec.color, roughness: 0.8 })); sh.rotation.z = Math.PI / 2; sh.position.set(0, 0.68, -0.05); driver.add(sh);
  const halo = new T.Group(); G.add(halo);
  const haloCurve = (sx) => new T.CatmullRomCurve3([new T.Vector3(0, 0.82, -0.58), new T.Vector3(sx * 0.1, 0.83, -0.53), new T.Vector3(sx * 0.24, 0.81, -0.38), new T.Vector3(sx * 0.31, 0.78, -0.14), new T.Vector3(sx * 0.31, 0.72, 0.1), new T.Vector3(sx * 0.3, 0.66, 0.2)]);
  for (const sx of [-1, 1]) { const m = new T.Mesh(new T.TubeGeometry(haloCurve(sx), 24, 0.021, 8), carbon); m.castShadow = true; halo.add(m); }
  const pil = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(0, 0.62, -0.82), new T.Vector3(0, 0.72, -0.7), new T.Vector3(0, 0.82, -0.58)]), 10, 0.024, 8), carbon); pil.castShadow = true; halo.add(pil);
  const wheelBase = new T.Group(); wheelBase.position.set(0, 0.64, -0.8); wheelBase.rotation.x = -0.5; wheelBase.scale.setScalar(0.8); G.add(wheelBase);
  const wheelRot = new T.Group(); wheelBase.add(wheelRot);
  const wm = (w, h, d, mat, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); wheelRot.add(m); return m; };
  wm(0.3, 0.13, 0.03, carbon, 0, 0, 0); const grip = new T.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.9 }); wm(0.07, 0.17, 0.05, grip, -0.18, -0.01, 0); wm(0.07, 0.17, 0.05, grip, 0.18, -0.01, 0);
  wm(0.14, 0.07, 0.01, new T.MeshStandardMaterial({ color: 0x103018, emissive: 0x2fbf6a, emissiveIntensity: 0.55 }), 0, 0.01, 0.02);
  for (let i = 0; i < 4; i++) wm(0.025, 0.025, 0.015, new T.MeshStandardMaterial({ color: 0x111111, emissive: [0xff2020, 0xffdd00, 0x20a0ff, 0xffffff][i], emissiveIntensity: 1 }), -0.06 + i * 0.04, 0.055, 0.02);

  return { ultra: true, envBase: 1.0, acc, group: G, fwing: fw, rwing: rw, parts: { nose: nosePivot, sps, eng }, body, bodyBase: new T.Color(0xffffff), wheels: [fl, fr, rl, rr], driver, halo, wheelRot, wheelBase, tail, tailM };
};
})();
