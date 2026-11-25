/* TURBO GP – Kernlogik: Strecken, Fahrphysik, Bot-KI (ohne Rendering, auch in Node testbar) */
(function (root) {
'use strict';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/* ---------------------------------------------------------------- Strecken */
const TRACKS = [
  { id: 'gp', name: 'Green Valley GP', theme: 'day', themeLabel: 'Tag', laps: 3, width: 16, wall: 11, kerb: 1.6, grass: true,
    desc: 'Ausgewogene Strecke mit schnellen Kurven und einer langen Geraden.',
    pts: [[0,0],[300,0],[600,-20],[800,-120],[850,-300],[750,-450],[550,-480],[450,-380],[300,-330],[150,-380],[100,-520],[-100,-600],[-350,-560],[-450,-380],[-380,-200],[-200,-100]] },
  { id: 'city', name: 'Neon City Circuit', theme: 'night', themeLabel: 'Nacht', laps: 3, width: 13, wall: 3.2, kerb: 1.0, grass: false,
    desc: 'Enge Stadtstrecke bei Nacht – Mauern, enge Kurven, kein Verzeihen.',
    pts: [[0,0],[250,0],[380,-60],[380,-200],[250,-260],[250,-380],[380,-440],[380,-560],[200,-620],[0,-560],[-100,-440],[-250,-420],[-330,-300],[-250,-180],[-100,-160],[-80,-60]] },
  { id: 'desert', name: 'Sunset Desert Speedway', theme: 'sunset', themeLabel: 'Sonnenuntergang', laps: 2, width: 18, wall: 12, kerb: 1.8, grass: true,
    desc: 'Sehr schnelle Wüstenstrecke mit riesigen Kurven und einer engen Spitzkehre.',
    pts: [[0,0],[500,0],[900,0],[1150,-100],[1250,-350],[1100,-550],[850,-620],[700,-520],[600,-380],[450,-330],[300,-430],[200,-600],[-50,-700],[-300,-600],[-400,-400],[-300,-200],[-150,-80]] }
,
  { id: 'monaco', name: 'Port Azur GP', theme: 'harbor', themeLabel: 'Hafenstadt', laps: 3, width: 11, wall: 2.6, kerb: 0.9, grass: false, start: [0, 0], scale: 1.5,
    tunnel: { x0: -45, x1: 105, z0: -100, z1: -60 },
    desc: 'Von Monaco inspiriert: Hafenstraße, Kasino-Kurve, enge Haarnadel, Tunnel und Schikane am Pool.',
    pts: [[0,0],[130,2],[260,0],[330,-12],[362,-48],[356,-95],[318,-128],[250,-146],[170,-150],[110,-158],[50,-142],[-10,-148],[-80,-140],[-120,-140],[-160,-125],[-170,-100],[-150,-80],[-110,-78],[-60,-75],[0,-80],[60,-85],[110,-90],[135,-90],[155,-100],[175,-84],[195,-92],[225,-86],[242,-64],[225,-42],[195,-38],[150,-36],[125,-48],[95,-30],[65,-46],[35,-32],[-10,-40],[-60,-40],[-95,-38],[-118,-30],[-122,-14],[-105,-2],[-70,2],[-30,0]] }
];

function buildTrack(cfg) {
  const sc0 = cfg.scale || 1, P = cfg.pts.map(q => [q[0] * sc0, q[1] * sc0]), n = P.length, dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let k = 0; k < 60; k++) {
      const t = k / 60, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const M = dense.length, cum = new Float64Array(M + 1);
  for (let i = 0; i < M; i++) {
    const a = dense[i], b = dense[(i + 1) % M];
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const L = cum[M], N = Math.round(L / 4), ds = L / N;
  const px = new Float32Array(N), pz = new Float32Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const target = i * ds;
    while (cum[j + 1] < target) j++;
    const f = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const a = dense[j], b = dense[(j + 1) % M];
    px[i] = a[0] + (b[0] - a[0]) * f; pz[i] = a[1] + (b[1] - a[1]) * f;
  }
  const tx = new Float32Array(N), tz = new Float32Array(N), rx = new Float32Array(N), rz = new Float32Array(N), h = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    let dx = px[b] - px[a], dz = pz[b] - pz[a]; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    tx[i] = dx; tz[i] = dz; rx[i] = -dz; rz[i] = dx; h[i] = Math.atan2(-dx, -dz);
  }
  const raw = new Float32Array(N), curv = new Float32Array(N);
  for (let i = 0; i < N; i++) raw[i] = wrap(h[(i + 1) % N] - h[(i - 1 + N) % N]) / (2 * ds);
  for (let i = 0; i < N; i++) { let s = 0; for (let k = -3; k <= 3; k++) s += raw[(i + k + N) % N]; curv[i] = s / 7; }
  // Startlinie dorthin legen, wo die Strecke am geradesten ist (Startaufstellung + Anfahrt)
  let bo = 0, bs = 1e9;
  if (cfg.start) { let bd = 1e18; for (let i = 0; i < N; i++) { const d = (px[i] - cfg.start[0] * sc0) ** 2 + (pz[i] - cfg.start[1] * sc0) ** 2; if (d < bd) { bd = d; bo = i; } } bs = 0; }
  else for (let o = 0; o < N; o++) {
    let m = 0;
    for (let k = -26; k <= 10; k++) m = Math.max(m, Math.abs(curv[(o + k + N) % N]));
    if (m < bs) { bs = m; bo = o; }
  }
  const rot = a => { const b = new Float32Array(N); for (let i = 0; i < N; i++) b[i] = a[(i + bo) % N]; return b; };
  return Object.assign({}, cfg, { N, ds, L, px: rot(px), pz: rot(pz), tx: rot(tx), tz: rot(tz), rx: rot(rx), rz: rot(rz), h: rot(h), curv: rot(curv), halfW: cfg.width / 2 });
}

function trackAt(tr, s, d) {
  s = ((s % tr.L) + tr.L) % tr.L;
  const f = s / tr.ds, i = Math.floor(f) % tr.N, i2 = (i + 1) % tr.N, u = f - Math.floor(f);
  const x = tr.px[i] + (tr.px[i2] - tr.px[i]) * u, z = tr.pz[i] + (tr.pz[i2] - tr.pz[i]) * u;
  return { x: x + tr.rx[i] * d, z: z + tr.rz[i] * d, h: tr.h[i] };
}

function nearest(tr, x, z, hint) {
  const N = tr.N; let best = 0, bd = 1e18;
  const full = hint < 0, lo = full ? 0 : -30, hi = full ? N - 1 : 30;
  for (let k = lo; k <= hi; k++) {
    const i = full ? k : (hint + k + N) % N;
    const dx = x - tr.px[i], dz = z - tr.pz[i], dd = dx * dx + dz * dz;
    if (dd < bd) { bd = dd; best = i; }
  }
  return best;
}

/* ---------------------------------------------------------------- Fahrzeuge */
const CARS = [
  { id: 'rookie',  name: 'Rookie RB-1',   price: 0,     top: 78,  accel: 12.0, brake: 25.5, grip: 23, down: 0.0034, color: 0xd8232a, accent: 0xffffff, blurb: 'Zuverlässiges Einsteigerauto.' },
  { id: 'falcon',  name: 'Falcon F2',     price: 7500,  top: 84,  accel: 13.5, brake: 27.2, grip: 25, down: 0.0036, color: 0x1f6fe0, accent: 0xffd400, blurb: 'Schneller und stabiler in Kurven.' },
  { id: 'viper',   name: 'Viper V8',      price: 18000, top: 90,  accel: 15.0, brake: 28.9, grip: 28, down: 0.0038, color: 0x14a85a, accent: 0x111111, blurb: 'Starker V8 mit viel Abtrieb.' },
  { id: 'phantom', name: 'Phantom X',     price: 40000, top: 96,  accel: 17.0, brake: 30.6, grip: 31, down: 0.0040, color: 0x6a2bd6, accent: 0xff3df0, blurb: 'Hochleistungs-Rennwagen.' },
  { id: 'apex',    name: 'Apex Hyper',    price: 90000, top: 104, accel: 19.0, brake: 33.1, grip: 35, down: 0.0043, color: 0xf5a300, accent: 0x101010, blurb: 'Das Beste vom Besten. Unschlagbar.' }
];

const DIFFS = {
  easy:   { id: 'easy',   label: 'Leicht', skill: 0.80, prize: 1.0, car: { top: 72, accel: 10.5, brake: 23.8, grip: 20, down: 0.0032 } },
  medium: { id: 'medium', label: 'Mittel', skill: 0.90, prize: 1.6, car: { top: 80, accel: 12.5, brake: 26.3, grip: 23.5, down: 0.0035 } },
  hard:   { id: 'hard',   label: 'Schwer', skill: 0.985, prize: 2.6, car: { top: 88, accel: 14.5, brake: 28.9, grip: 27, down: 0.0038 } }
};
const PRIZES = [4000, 2500, 1500]; // Platz 1-3

const BOT_NAMES = ['Luca Ferraro', 'Max Bergmann', 'Sven Lindqvist', 'Diego Alvarez', 'Kenji Sato', 'Oliver Hayes', 'Pierre Duval', 'Mateo Rossi', 'Jonas Keller', 'Arman Petrov', 'Felix Moreau', 'Noah Becker', 'Rafael Costa', 'Elias Novak', 'Hugo Lambert'];
const BOT_COLORS = [[0xe8e8e8, 0xd8232a], [0x00b7c9, 0x102030], [0xff6a00, 0x111111], [0x2a2f9e, 0xffffff], [0xd0d000, 0x222222], [0xcc2a8a, 0xffffff], [0x1a1a1a, 0xff2a2a], [0x7bd0ff, 0x0a3d62], [0x8bc34a, 0x1b1b1b], [0xff8fa3, 0x4a0d2e], [0x9e9e9e, 0xffd400], [0x00796b, 0xffeb3b], [0x5d4037, 0xffffff], [0xb71c1c, 0x212121], [0x3949ab, 0xff9800]];

function makeCar(opts) {
  return Object.assign({
    x: 0, z: 0, h: 0, vx: 0, vz: 0, steer: 0, yaw: 0, dmg: 0, spin: 0, pull: 0, pullSign: Math.random() < 0.5 ? -1 : 1, scrape: false, impacts: [], dead: false, lost: { fw: false, rw: false, w: [false, false, false, false] }, i: -1, s: 0, d: 0, prog: 0, lap: 0,
    finished: false, finishTime: 0, hit: 0, vf: 0, vl: 0, onGrass: false, slip: 0, lapStart: 0, bestLap: 0,
    inp: { throttle: 0, brake: 0, steer: 0 }
  }, opts);
}

function placeCar(c, tr, s, d, gridProg) {
  const p = trackAt(tr, s, d);
  c.x = p.x; c.z = p.z; c.h = p.h; c.vx = c.vz = 0; c.steer = 0;
  c.i = nearest(tr, c.x, c.z, -1);
  trackUpdate(c, tr, true);
  c.prog = gridProg === undefined ? c.prog : gridProg;
}

function trackUpdate(c, tr, init) {
  const i = nearest(tr, c.x, c.z, c.i);
  const dx = c.x - tr.px[i], dz = c.z - tr.pz[i];
  const s = i * tr.ds + dx * tr.tx[i] + dz * tr.tz[i];
  c.d = dx * tr.rx[i] + dz * tr.rz[i];
  if (!init) {
    let q = s - c.s; const L = tr.L;
    while (q < -L / 2) q += L; while (q > L / 2) q -= L;
    c.prog += q;
  }
  c.s = ((s % tr.L) + tr.L) % tr.L; c.i = i;
}

// Teile mit Position im Fahrzeugmodell (x rechts, z nach hinten); hw = halbe Breite
const PARTS = [
  { k: 'fw', x: 0, z: -3.15, hw: 1.0 }, { k: 'rw', x: 0, z: 2.4, hw: 0.55 },
  { k: 0, x: -0.88, z: -1.7, hw: 0.4 }, { k: 1, x: 0.88, z: -1.7, hw: 0.4 }, { k: 2, x: -0.9, z: 1.75, hw: 0.45 }, { k: 3, x: 0.9, z: 1.75, hw: 0.45 }
];
const isLost = (c, k) => typeof k === 'number' ? c.lost.w[k] : c.lost[k];
function hurt(c, amt, mx, mz) {
  if (!(amt > 0.004)) return;
  c.dmg = Math.min(1, c.dmg + amt);
  // getroffenes Teil fliegt sofort ab
  let best = null, bd = 0.95;
  for (const p of PARTS) {
    if (isLost(c, p.k)) continue;
    const d = Math.hypot(Math.max(0, Math.abs(mx - p.x) - p.hw), mz - p.z);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) { if (typeof best.k === 'number') { c.lost.w[best.k] = true; c.dead = true; } else c.lost[best.k] = true; }
  if (c.impacts.length < 8) c.impacts.push({ sev: Math.min(1, amt * 3), x: mx, z: mz, lost: best ? best.k : null });
}
const wingsLost = c => (c.lost.fw ? 1 : 0) + (c.lost.rw ? 1 : 0);

function stepCar(c, inp, dt, tr) {
  const nw = wingsLost(c), s0 = c.stats;
  // Spoiler weg: 5 % langsamer je Flügel, deutlich schlechtere Beschleunigung
  const st = nw > 0 ? { top: s0.top * (1 - 0.05 * nw), accel: s0.accel * (1 - 0.22 * nw), brake: s0.brake, grip: s0.grip * (1 - 0.04 * nw), down: s0.down * (1 - 0.2 * nw) } : s0;
  if (c.dead) inp = { throttle: 0, brake: 0, steer: 0 }; // Rad verloren: Fahrzeug nicht mehr fahrbar
  c.scrape = false;
  let fx = -Math.sin(c.h), fz = -Math.cos(c.h), rx = -fz, rz = fx;
  let vf = c.vx * fx + c.vz * fz, vl = c.vx * rx + c.vz * rz;
  const limEdge = tr.halfW + tr.kerb;
  const onGrass = Math.abs(c.d) > limEdge && tr.grass;
  c.onGrass = onGrass;
  const surf = onGrass ? 0.5 : (Math.abs(c.d) > limEdge ? 0.85 : 1);

  // Lenkung glätten
  const tgt = clamp(inp.steer, -1, 1);
  const rate = (tgt === 0 || tgt * c.steer < 0) ? 10 : 5.5;
  c.steer += clamp(tgt - c.steer, -rate * dt, rate * dt);

  // Längsdynamik
  const topSpd = st.top * (onGrass ? 0.55 : 1);
  let a = 0;
  const thr = clamp(inp.throttle, 0, 1), brk = clamp(inp.brake, 0, 1);
  if (thr > 0) {
    if (vf >= 0) { const r = vf / topSpd; a += st.accel * thr * Math.max(0, 1 - r * r) * (vf < 8 ? 0.85 + vf / 53 : 1); }
    else a += st.accel * thr * 1.5;
  }
  if (brk > 0) {
    if (vf > 0.6) a -= st.brake * brk * (1 + st.down * vf * vf * 0.04) * (onGrass ? 0.7 : 1);
    else if (vf > -14) a -= 10 * brk;
  }
  const sgn = vf >= 0 ? 1 : -1;
  a -= sgn * (0.0007 * vf * vf + 0.5 + (c.dead ? 5 : 0));
  if (onGrass) a -= sgn * (3 + Math.abs(vf) * 0.12);
  if (vf > topSpd) a -= (vf - topSpd) * 1.6;
  let nvf = vf + a * dt;
  if (brk > 0 && thr === 0 && vf > 0 && nvf < 0 && vf > 0.6) nvf = 0;
  if (thr === 0 && brk === 0 && Math.abs(nvf) < 0.15) nvf = 0;
  vf = nvf;

  // Lenkung / Gierrate
  const gripLat = st.grip * surf + st.down * vf * vf;
  const maxSt = 0.44 / (1 + Math.pow(Math.abs(vf) / 18, 1.6));
  let yaw = vf * Math.tan(c.steer * maxSt) / 3.4;
  const yawMax = gripLat / Math.max(Math.abs(vf), 3);
  yaw = clamp(yaw, -yawMax, yawMax);
  c.h += (yaw + c.spin) * dt;
  c.yaw = yaw;
  c.spin *= Math.exp(-2.2 * dt);

  // Geschwindigkeit in neues Achsensystem; Querschlupf abbauen
  const nfx = -Math.sin(c.h), nfz = -Math.cos(c.h), nrx = -nfz, nrz = nfx;
  const wvx = fx * vf + rx * vl, wvz = fz * vf + rz * vl;
  vf = wvx * nfx + wvz * nfz; vl = wvx * nrx + wvz * nrz;
  const k = (onGrass ? 3.2 : 9) / (1 + Math.abs(c.spin) * 2);
  vl *= Math.exp(-k * dt);
  c.vx = nfx * vf + nrx * vl; c.vz = nfz * vf + nrz * vl;
  c.vf = vf; c.vl = vl; c.slip = Math.abs(vl);
  c.x += c.vx * dt; c.z += c.vz * dt;

  trackUpdate(c, tr, false);

  // Bande
  const lim = tr.halfW + tr.wall;
  if (Math.abs(c.d) > lim) {
    const sg = c.d > 0 ? 1 : -1, ex = Math.abs(c.d) - lim + 0.05;
    const i = c.i;
    c.x -= tr.rx[i] * sg * ex; c.z -= tr.rz[i] * sg * ex; c.d = sg * (lim - 0.05);
    const vn = c.vx * tr.rx[i] * sg + c.vz * tr.rz[i] * sg;
    if (vn > 0) { c.vx -= tr.rx[i] * sg * vn * 1.15; c.vz -= tr.rz[i] * sg * vn * 1.15; }
    const sc = 1 - Math.min(0.45, 0.012 * vn + 0.06);
    c.vx *= sc; c.vz *= sc;
    c.scrape = true;
    const dh = wrap(c.h - tr.h[i]), out = sg > 0 ? dh < 0 : dh > 0;
    if (vn > 4) {
      c.hit = Math.max(c.hit, Math.min(1, vn / 25));
      c.spin += sg * (out ? 1 : -0.6) * clamp(vn * 0.06, 0, 2.4) * (0.6 + Math.random() * 0.6);
    }
    c.dmg = Math.min(1, c.dmg + Math.abs(c.vf) * dt * 0.0006);
    if (vn > 9) hurt(c, (vn - 3) / 60, sg * 1.0, out ? -1.6 : 1.6);
  }
}

function collideCars(cars) {
  const R = 1.35;
  for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
    const A = cars[a], B = cars[b];
    const dx = B.x - A.x, dz = B.z - A.z;
    if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
    // zwei Kreise pro Auto (vorne/hinten)
    for (const oa of [-1.4, 1.4]) for (const ob of [-1.4, 1.4]) {
      const ax = A.x - Math.sin(A.h) * oa, az = A.z - Math.cos(A.h) * oa;
      const bx = B.x - Math.sin(B.h) * ob, bz = B.z - Math.cos(B.h) * ob;
      let ex = bx - ax, ez = bz - az; const d = Math.hypot(ex, ez);
      if (d < R * 1.45 && d > 1e-4) {
        ex /= d; ez /= d; const pen = (R * 1.45 - d) * 0.5;
        A.x -= ex * pen; A.z -= ez * pen; B.x += ex * pen; B.z += ez * pen;
        const rvn = (B.vx - A.vx) * ex + (B.vz - A.vz) * ez;
        if (rvn < 0) {
          const j = -rvn * 0.55;
          A.vx -= ex * j; A.vz -= ez * j; B.vx += ex * j; B.vz += ez * j;
          const lvl = Math.min(1, -rvn / 14);
          A.hit = Math.max(A.hit, lvl * 0.6); B.hit = Math.max(B.hit, lvl * 0.6);
          const mx = (ax + bx) / 2, mz = (az + bz) / 2, amt = (-rvn - 3) / 90;
          const loc = c => { const fx = -Math.sin(c.h), fz = -Math.cos(c.h); const dx = mx - c.x, dz = mz - c.z; return [dx * -fz + dz * fx, -(dx * fx + dz * fz)]; };
          const la = loc(A), lb = loc(B);
          if (-rvn > 11) { hurt(A, amt, la[0], la[1]); hurt(B, amt, lb[0], lb[1]); }
          const tA = (mz - A.z) * (-ex * j) - (mx - A.x) * (-ez * j), tB = (mz - B.z) * (ex * j) - (mx - B.x) * (ez * j);
          A.spin += clamp(tA * 0.07, -2, 2); B.spin += clamp(tB * 0.07, -2, 2);
        }
      }
    }
  }
}

/* ---------------------------------------------------------------- Bot-KI */
function makeAI(stats, tr, skill) {
  const N = tr.N, ds = tr.ds, v = new Float32Array(N);
  const g0 = stats.grip * 0.9, k = stats.down;
  for (let i = 0; i < N; i++) {
    let kap = 0;
    for (let q = -4; q <= 4; q++) kap = Math.max(kap, Math.abs(tr.curv[(i + q + N) % N]));
    const R = 1 / Math.max(kap, 1e-4);
    let vm = stats.top;
    if (k * R < 0.97) vm = Math.min(vm, Math.sqrt(g0 * R / (1 - k * R)));
    v[i] = vm * skill;
  }
  const bd = stats.brake * 0.5;
  for (let pass = 0; pass < 3; pass++)
    for (let i = N * 2 - 1; i >= 0; i--) {
      const a = i % N, b = (i + 1) % N;
      const lim = Math.sqrt(v[b] * v[b] + 2 * bd * ds);
      if (lim < v[a]) v[a] = lim;
    }
  return { vlim: v, skill, offBase: 0, off: 0, wander: Math.random() * 6, reaction: 0 };
}

function aiControl(c, ai, tr, cars, dt, time, rubber) {
  if (c.dead) return { throttle: 0, brake: 0, steer: 0 };
  const N = tr.N, ds = tr.ds, vf = c.vf;
  const i = c.i < 0 ? 0 : c.i;
  const Ld = 7 + Math.max(0, vf) * 0.34;
  const j = (i + Math.round(Ld / ds)) % N;

  // Fahrspur / Überholen
  let offT = ai.offBase + Math.sin(time * 0.35 + ai.wander) * 1.2;
  let capSpeed = Infinity;
  for (const o of cars) {
    if (o === c || o.finished && o.isPlayer) continue;
    let dp = o.prog - c.prog;
    if (dp > 0 && dp < 30) {
      const dl = o.d - c.d;
      if (Math.abs(dl) < 3.0) {
        const room = tr.halfW - 2.2;
        let goal = dl > 0 ? o.d - 3.4 : o.d + 3.4;
        if (Math.abs(goal) > room) goal = o.d > 0 ? o.d - 3.4 : o.d + 3.4;
        offT = clamp(goal, -room, room);
        if (dp < 5 + Math.max(0, vf) * 0.14 && Math.abs(dl) < 2.2) capSpeed = Math.min(capSpeed, Math.max(o.dead ? 5 : 10, o.vf * 0.98));
      }
    }
  }
  ai.off += clamp(offT - ai.off, -3.2 * dt, 3.2 * dt);
  const room = tr.halfW - 1.8;
  const off = clamp(ai.off, -room, room);
  const tx = tr.px[j] + tr.rx[j] * off, tz = tr.pz[j] + tr.rz[j] * off;
  const want = Math.atan2(-(tx - c.x), -(tz - c.z));
  const err = wrap(want - c.h);
  const steer = clamp(err * 2.1, -1, 1);
  if (Math.abs(vf) < 1.5 && time > 6) ai.stuck = (ai.stuck || 0) + dt; else ai.stuck = 0;
  if (ai.stuck > 1.8) { ai.rec = 1.6; ai.stuck = 0; }
  if (ai.rec > 0) { ai.rec -= dt; return { throttle: 0, brake: 1, steer: -steer }; }

  const ahead = (i + Math.ceil(Math.max(0, vf) * 0.3 / ds)) % N;
  let vt = ai.vlim[ahead] * (rubber || 1);
  vt = Math.min(vt, ai.vlim[i] * (rubber || 1) + 6);
  if (Math.abs(c.d) > tr.halfW + tr.kerb) vt = Math.min(vt, 30);
  vt *= clamp(1 - Math.abs(err) * 0.55, 0.35, 1) * (1 - 0.05 * wingsLost(c));
  vt = Math.min(vt, capSpeed);
  const thr = clamp((vt - vf) * 0.45, 0, 1);
  const brk = vf > vt + 1.2 ? clamp((vf - vt) * 0.25, 0, 1) : 0;
  return { throttle: thr, brake: brk, steer };
}

const api = { clamp, wrap, TRACKS, buildTrack, trackAt, nearest, CARS, DIFFS, PRIZES, BOT_NAMES, BOT_COLORS, makeCar, placeCar, trackUpdate, stepCar, collideCars, makeAI, aiControl };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
