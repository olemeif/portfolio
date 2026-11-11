// Radar scope with a simulated multi-target tracker.
//
// Targets fly constant-velocity legs with occasional turns. They are only
// measured when the sweep passes over them (noisy range/bearing, Pd < 1).
// Each track runs a constant-velocity Kalman filter; the drawn ellipse is the
// predicted position covariance, so it grows between sweeps and collapses on
// every update. A track is confirmed after three plots and dropped after three
// sweeps without one, so it coasts on its prediction before it disappears.
// Data association is given (each measurement knows its target); clutter
// plots are shown but never start a track.

const TAU = Math.PI * 2;
const canvas = document.getElementById('radar');
const scopeEl = document.getElementById('scope');
const ctx = canvas.getContext('2d');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const g = (a) => `rgba(62,230,140,${a})`;
const hi = (a) => `rgba(182,255,214,${a})`;

// --- Simulation constants (scope radius = 1.0 = 10 km) ---------------------
const SWEEP_PERIOD = 4.5;
const OMEGA = TAU / SWEEP_PERIOD;
const SWEEP_SPAN = 1.9; // afterglow wedge, rad
const RANGE_KM = 10;
const SIGMA_R = 0.006; // 60 m
const SIGMA_TH = 0.015; // ~0.9°
const ACCEL_Q = 0.003 ** 2;
const P_DETECT = 0.94;
const CLUTTER_RATE = 2.2; // per second
const CONFIRM_HITS = 3;
const DROP_MISSES = 3; // sweeps without a plot before a track is deleted

// --- State -------------------------------------------------------------------
let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 100, small = false;
const staticLayer = document.createElement('canvas');
let now = 0;
let sweep = Math.random() * TAU;
let nextId = 1;
let targets = [];
let tracks = [];
let blips = [];
let respawns = [];
let selected = null;
let selectedAt = 0;
const pointer = { x: 0, y: 0, active: false };

// --- Small helpers -----------------------------------------------------------
const rand = Math.random;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (a) => ((a % TAU) + TAU) % TAU;
const pad = (n, w) => String(n).padStart(w, '0');

function gauss() {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand());
}

const bearingOf = (x, y) => wrap(Math.atan2(x, y)); // 0 = north, clockwise
const toScreen = (x, y) => [cx + x * R, cy - y * R];

// --- Minimal matrix algebra --------------------------------------------------
const zeros = (r, c) => Array.from({ length: r }, () => new Array(c).fill(0));

function mul(A, B) {
  const out = zeros(A.length, B[0].length);
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < B[0].length; j++) {
      let s = 0;
      for (let k = 0; k < B.length; k++) s += A[i][k] * B[k][j];
      out[i][j] = s;
    }
  return out;
}

const transpose = (A) => A[0].map((_, j) => A.map((row) => row[j]));

// --- Kalman filter, state [x, y, vx, vy] ------------------------------------
function predict(x, P, dt) {
  const F = [
    [1, 0, dt, 0],
    [0, 1, 0, dt],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
  const d2 = dt * dt, d3 = (d2 * dt) / 2, d4 = (d2 * d2) / 4;
  const Pn = mul(mul(F, P), transpose(F));
  Pn[0][0] += ACCEL_Q * d4; Pn[1][1] += ACCEL_Q * d4;
  Pn[0][2] += ACCEL_Q * d3; Pn[2][0] += ACCEL_Q * d3;
  Pn[1][3] += ACCEL_Q * d3; Pn[3][1] += ACCEL_Q * d3;
  Pn[2][2] += ACCEL_Q * d2; Pn[3][3] += ACCEL_Q * d2;
  return { x: [x[0] + x[2] * dt, x[1] + x[3] * dt, x[2], x[3]], P: Pn };
}

function update(x, P, z, Rm) {
  // H picks the position, so S = P_pos + R and P·Hᵀ is the first two columns.
  const s00 = P[0][0] + Rm[0][0], s01 = P[0][1] + Rm[0][1];
  const s10 = P[1][0] + Rm[1][0], s11 = P[1][1] + Rm[1][1];
  const det = s00 * s11 - s01 * s10;
  const i00 = s11 / det, i01 = -s01 / det, i10 = -s10 / det, i11 = s00 / det;
  const K = P.map((row) => [row[0] * i00 + row[1] * i10, row[0] * i01 + row[1] * i11]);
  const y0 = z[0] - x[0], y1 = z[1] - x[1];
  const xn = x.map((v, i) => v + K[i][0] * y0 + K[i][1] * y1);
  const Pn = P.map((row, i) => row.map((v, j) => v - (K[i][0] * P[0][j] + K[i][1] * P[1][j])));
  return { x: xn, P: Pn };
}

// Polar measurement noise expressed in Cartesian coordinates.
function measNoise(r, b) {
  const sr2 = SIGMA_R ** 2, st2 = (r * SIGMA_TH) ** 2;
  const s = Math.sin(b), c = Math.cos(b);
  return [
    [sr2 * s * s + st2 * c * c, (sr2 - st2) * s * c],
    [(sr2 - st2) * s * c, sr2 * c * c + st2 * s * s],
  ];
}

// --- Event log ---------------------------------------------------------------
const logEl = document.getElementById('log');
function log(msg) {
  if (!logEl) return;
  const li = document.createElement('li');
  li.textContent = `T+${pad(now.toFixed(1), 6)}  ${msg}`;
  logEl.appendChild(li);
  while (logEl.children.length > 5) logEl.firstChild.remove();
}

// --- Targets and tracks ------------------------------------------------------
function spawnTarget(initial) {
  const b = rand() * TAU;
  const r = initial ? 0.25 + 0.6 * rand() : 1.04;
  const x = r * Math.sin(b), y = r * Math.cos(b);
  // Head towards a random point inside the scope so it crosses the coverage.
  const ar = 0.75 * Math.sqrt(rand()), ab = rand() * TAU;
  let dx = ar * Math.sin(ab) - x, dy = ar * Math.cos(ab) - y;
  const n = Math.hypot(dx, dy) || 1;
  const speed = 0.014 + rand() * 0.02;
  return {
    id: nextId++,
    x, y,
    vx: (dx / n) * speed,
    vy: (dy / n) * speed,
    turn: 0,
    turnUntil: now + 3 + rand() * 5,
    track: null,
  };
}

function detect(t) {
  const r = Math.hypot(t.x, t.y), b = bearingOf(t.x, t.y);
  const nr = gauss() * SIGMA_R, nt = gauss() * r * SIGMA_TH;
  const zx = t.x + nr * Math.sin(b) + nt * Math.cos(b);
  const zy = t.y + nr * Math.cos(b) - nt * Math.sin(b);
  const zr = Math.hypot(zx, zy), zb = bearingOf(zx, zy);
  blips.push({ r: zr, b: zb, t: now, tau: 2.2, strength: 1 });

  const Rm = measNoise(zr, zb);
  if (!t.track || t.track.status === 'lost') {
    const P = zeros(4, 4);
    P[0][0] = Rm[0][0]; P[0][1] = Rm[0][1]; P[1][0] = Rm[1][0]; P[1][1] = Rm[1][1];
    P[2][2] = P[3][3] = 0.03 ** 2;
    t.track = {
      id: t.id, x: [zx, zy, 0, 0], P, t: now, hits: 1, misses: 0, status: 'tent',
      hist: [[zx, zy]], born: now, lostAt: 0, flash: now,
    };
    tracks.push(t.track);
    log(`PLOT ${pad(t.id, 2)} TENTATIVE`);
    return;
  }
  const tr = t.track;
  const pr = predict(tr.x, tr.P, now - tr.t);
  const up = update(pr.x, pr.P, [zx, zy], Rm);
  tr.x = up.x; tr.P = up.P; tr.t = now; tr.hits++; tr.misses = 0; tr.flash = now;
  tr.hist.push([up.x[0], up.x[1]]);
  if (tr.hist.length > 8) tr.hist.shift();
  if (tr.status === 'tent' && tr.hits >= CONFIRM_HITS) {
    tr.status = 'conf';
    log(`TRK ${pad(tr.id, 2)} CONFIRMED`);
  }
}

function step(dt) {
  now += dt;
  const prev = sweep;
  const dth = OMEGA * dt;
  sweep = wrap(sweep + dth);

  for (const t of targets) {
    if (now > t.turnUntil) {
      t.turn = rand() < 0.5 ? 0 : (rand() < 0.5 ? -1 : 1) * (0.04 + rand() * 0.06);
      t.turnUntil = now + 3 + rand() * 6;
    }
    if (t.turn) {
      const a = t.turn * dt, c = Math.cos(a), s = Math.sin(a);
      [t.vx, t.vy] = [t.vx * c - t.vy * s, t.vx * s + t.vy * c];
    }
    t.x += t.vx * dt;
    t.y += t.vy * dt;

    const r = Math.hypot(t.x, t.y);
    if (r > 1.06 && t.x * t.vx + t.y * t.vy > 0) {
      // The target leaves coverage. Its track is not told: it simply stops
      // receiving plots and is dropped by the miss logic below.
      t.gone = true;
      respawns.push(now + 1 + rand() * 3);
      continue;
    }
    if (r < 1 && wrap(bearingOf(t.x, t.y) - prev) < dth && rand() < P_DETECT) detect(t);
  }
  targets = targets.filter((t) => !t.gone);

  // Track maintenance: count the sweeps that went by without a plot.
  for (const tr of tracks) {
    if (tr.status === 'lost') continue;
    const misses = Math.max(0, Math.floor((now - tr.t) / SWEEP_PERIOD - 0.3));
    if (misses > tr.misses && misses === 1 && tr.status === 'conf') {
      log(`TRK ${pad(tr.id, 2)} COASTING`);
    }
    tr.misses = misses;
    if (misses >= (tr.status === 'tent' ? 2 : DROP_MISSES)) {
      log(`${tr.status === 'tent' ? 'PLOT' : 'TRK'} ${pad(tr.id, 2)} DROPPED · NO PLOTS`);
      tr.status = 'lost';
      tr.lostAt = now;
    }
  }

  for (let i = respawns.length - 1; i >= 0; i--) {
    if (now >= respawns[i]) {
      respawns.splice(i, 1);
      targets.push(spawnTarget(false));
    }
  }

  if (rand() < CLUTTER_RATE * dt) {
    blips.push({ r: 0.08 + 0.92 * Math.sqrt(rand()), b: sweep, t: now, tau: 0.7, strength: 0.45 });
  }

  blips = blips.filter((b) => now - b.t < b.tau * 4);
  tracks = tracks.filter((tr) => tr.status !== 'lost' || now - tr.lostAt < 1);

  // Cycle the lock through confirmed tracks that are currently being updated.
  const confirmed = tracks.filter((tr) => tr.status === 'conf' && tr.misses === 0);
  if (!selected || selected.status !== 'conf' || selected.misses > 0 || now - selectedAt > 7) {
    const pool = confirmed.filter((tr) => tr !== selected);
    const next = pool.length ? pool[Math.floor(rand() * pool.length)] : confirmed[0] || null;
    if (next !== selected) {
      selected = next;
      if (selected) log(`LOCK → TRK ${pad(selected.id, 2)}`);
    }
    selectedAt = now;
  }
}

// --- Static layer: grid, rings, spokes, scale -------------------------------
function drawStatic() {
  staticLayer.width = canvas.width;
  staticLayer.height = canvas.height;
  const s = staticLayer.getContext('2d');
  s.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background grid with registration crosses.
  const step = 48;
  const ox = cx % step, oy = cy % step;
  s.lineWidth = 1;
  s.strokeStyle = g(0.045);
  s.beginPath();
  for (let x = ox; x < W; x += step) { s.moveTo(x + 0.5, 0); s.lineTo(x + 0.5, H); }
  for (let y = oy; y < H; y += step) { s.moveTo(0, y + 0.5); s.lineTo(W, y + 0.5); }
  s.stroke();
  s.strokeStyle = g(0.16);
  s.beginPath();
  for (let x = ox; x < W; x += step * 2)
    for (let y = oy; y < H; y += step * 2) {
      s.moveTo(x - 3, y + 0.5); s.lineTo(x + 4, y + 0.5);
      s.moveTo(x + 0.5, y - 3); s.lineTo(x + 0.5, y + 4);
    }
  s.stroke();

  // Scope face.
  const face = s.createRadialGradient(cx, cy, 0, cx, cy, R);
  face.addColorStop(0, 'rgba(12,46,29,0.9)');
  face.addColorStop(1, 'rgba(3,10,7,0.94)');
  s.fillStyle = face;
  s.beginPath(); s.arc(cx, cy, R, 0, TAU); s.fill();

  // Range rings.
  for (let i = 1; i <= 4; i++) {
    s.strokeStyle = g(i === 4 ? 0.7 : 0.2);
    s.lineWidth = i === 4 ? 1.5 : 1;
    s.setLineDash(i === 4 ? [] : [2, 5]);
    s.beginPath(); s.arc(cx, cy, (R * i) / 4, 0, TAU); s.stroke();
  }
  s.setLineDash([]);

  // Spokes every 30°.
  s.strokeStyle = g(0.13);
  s.lineWidth = 1;
  s.beginPath();
  for (let d = 0; d < 360; d += 30) {
    const a = (d * Math.PI) / 180;
    s.moveTo(cx + Math.sin(a) * R * 0.06, cy - Math.cos(a) * R * 0.06);
    s.lineTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R);
  }
  s.stroke();

  // Azimuth ticks and labels.
  s.strokeStyle = g(0.6);
  s.beginPath();
  for (let d = 0; d < 360; d += small ? 10 : 5) {
    const a = (d * Math.PI) / 180;
    const len = d % 30 === 0 ? 8 : d % 10 === 0 ? 5 : 3;
    s.moveTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R);
    s.lineTo(cx + Math.sin(a) * (R + len), cy - Math.cos(a) * (R + len));
  }
  s.stroke();

  s.font = `${small ? 9 : 10}px ${FONT}`;
  s.fillStyle = g(0.7);
  s.textAlign = 'center';
  s.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 30) {
    const a = (d * Math.PI) / 180;
    s.fillText(pad(d, 3), cx + Math.sin(a) * (R + 19), cy - Math.cos(a) * (R + 19));
  }

  // Range scale along the 045° spoke.
  s.fillStyle = g(0.45);
  s.textAlign = 'left';
  for (let i = 1; i <= 3; i++) {
    const rr = (R * i) / 4;
    s.fillText(`${(RANGE_KM * i) / 4}${i === 3 ? ' km' : ''}`, cx + rr * Math.SQRT1_2 + 4, cy - rr * Math.SQRT1_2 - 5);
  }
}

// --- Per-frame drawing -------------------------------------------------------
function drawSweep(boot) {
  const a = sweep - Math.PI / 2; // canvas angle
  if (ctx.createConicGradient) {
    const f = SWEEP_SPAN / TAU;
    const grad = ctx.createConicGradient(a - SWEEP_SPAN, cx, cy);
    grad.addColorStop(0, g(0));
    grad.addColorStop(f * 0.6, g(0.05 * boot));
    grad.addColorStop(f, g(0.34 * boot));
    grad.addColorStop(Math.min(1, f + 0.0005), g(0));
    grad.addColorStop(1, g(0));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
  }
  ctx.save();
  ctx.strokeStyle = hi(0.95 * boot);
  ctx.lineWidth = 1.5;
  ctx.shadowColor = g(1);
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  ctx.stroke();
  ctx.restore();
}

function drawBlips() {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.shadowColor = g(1);
  for (const b of blips) {
    const age = now - b.t;
    const alpha = Math.exp(-age / b.tau) * b.strength;
    if (alpha < 0.02) continue;
    const a = b.b - Math.PI / 2;
    const half = 0.018 + 0.012 / Math.max(b.r, 0.15);
    ctx.strokeStyle = age < 0.25 ? hi(alpha) : g(alpha);
    ctx.shadowBlur = age < 0.6 ? 10 : 0;
    ctx.lineWidth = b.strength === 1 ? 3 : 2;
    ctx.beginPath();
    ctx.arc(cx, cy, b.r * R, a - half, a + half);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTrack(tr) {
  const pr = predict(tr.x, tr.P, now - tr.t);
  const [x, y, vx, vy] = pr.x;
  const P = pr.P;
  let fade = clamp((now - tr.born) / 0.4, 0, 1);
  if (tr.status === 'lost') fade *= clamp(1 - (now - tr.lostAt) / 1, 0, 1);
  if (fade <= 0) return;
  const [sx, sy] = toScreen(x, y);
  const isSel = tr === selected;
  const conf = tr.hits >= CONFIRM_HITS;
  const coasting = tr.misses > 0 || tr.status === 'lost';
  const col = isSel ? hi : g;

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.lineWidth = 1;

  // History dots: the filtered position at each of the last few updates.
  tr.hist.forEach(([hx, hy], i) => {
    const [px, py] = toScreen(hx, hy);
    ctx.fillStyle = g(0.2 + (0.6 * (i + 1)) / tr.hist.length);
    ctx.fillRect(px - 1, py - 1, 2, 2);
  });

  // Covariance ellipse (3σ) of the predicted position.
  const a = P[0][0], b = P[0][1], d = P[1][1];
  const mid = (a + d) / 2, rad = Math.hypot((a - d) / 2, b);
  const r1 = clamp(3 * Math.sqrt(Math.max(mid + rad, 0)) * R, 3, R * 0.3);
  const r2 = clamp(3 * Math.sqrt(Math.max(mid - rad, 0)) * R, 3, R * 0.3);
  const phi = 0.5 * Math.atan2(2 * b, a - d);
  ctx.beginPath();
  ctx.ellipse(sx, sy, r1, r2, -phi, 0, TAU);
  ctx.fillStyle = col(0.07);
  ctx.fill();
  ctx.setLineDash(conf && !coasting ? [] : [3, 3]);
  ctx.strokeStyle = col(conf ? 0.6 : 0.4);
  ctx.stroke();
  ctx.setLineDash([]);

  // Velocity leader: where the filter expects the target in 12 s.
  if (conf) {
    const [lx, ly] = toScreen(x + vx * 12, y + vy * 12);
    ctx.strokeStyle = col(0.8);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(lx, ly); ctx.stroke();
  }

  // Track symbol; pops briefly on every measurement update.
  const pop = 1 + 0.9 * Math.exp(-(now - tr.flash) / 0.18);
  const sz = (conf ? 4.5 : 3) * pop;
  ctx.strokeStyle = col(coasting ? 0.6 : 1);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (conf) {
    ctx.moveTo(sx, sy - sz); ctx.lineTo(sx + sz, sy); ctx.lineTo(sx, sy + sz); ctx.lineTo(sx - sz, sy);
    ctx.closePath();
  } else {
    ctx.arc(sx, sy, sz, 0, TAU);
  }
  ctx.stroke();

  // Lock reticle on the selected track.
  if (isSel) {
    const rr = 15 + 2 * Math.sin(now * 3);
    const rot = now * 0.9;
    ctx.strokeStyle = hi(0.95);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const a0 = rot + (i * TAU) / 4;
      ctx.beginPath(); ctx.arc(sx, sy, rr, a0, a0 + 0.7); ctx.stroke();
    }
    const k = clamp((now - selectedAt) / 0.5, 0, 1);
    if (k < 1) {
      ctx.strokeStyle = hi(1 - k);
      ctx.beginPath(); ctx.arc(sx, sy, rr + 40 * (1 - k), 0, TAU); ctx.stroke();
    }
  }

  // Label with leader line, placed towards the scope centre so it stays
  // inside the display when the track is near the edge.
  if (conf) {
    const right = sx < cx;
    const down = sy < cy;
    const ox = right ? 14 : -14, oy = down ? 14 : -14;
    ctx.strokeStyle = col(0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx + ox * 0.45, sy + oy * 0.45);
    ctx.lineTo(sx + ox, sy + oy);
    ctx.lineTo(sx + ox + (right ? 6 : -6), sy + oy);
    ctx.stroke();
    ctx.font = `${small ? 9 : 10}px ${FONT}`;
    ctx.textAlign = right ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col(1);
    const tx = sx + ox + (right ? 9 : -9);
    ctx.fillText(`T${pad(tr.id, 2)}${coasting ? ' CST' : ''}`, tx, sy + oy);
    if (isSel && !small) {
      const spd = Math.hypot(vx, vy) * RANGE_KM * 1000;
      const hdg = (bearingOf(vx, vy) * 180) / Math.PI;
      ctx.fillStyle = hi(0.75);
      ctx.fillText(`${pad(Math.round(hdg) % 360, 3)}° ${Math.round(spd)}m/s`, tx, sy + oy + (down ? 12 : -12));
    }
  }
  ctx.restore();
}

function drawOuter(boot) {
  // Sweep marker on the bezel.
  const a = sweep - Math.PI / 2;
  ctx.save();
  ctx.translate(cx + Math.cos(a) * (R + 4), cy + Math.sin(a) * (R + 4));
  ctx.rotate(a);
  ctx.fillStyle = hi(0.95 * boot);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(7, -4); ctx.lineTo(7, 4); ctx.closePath(); ctx.fill();
  ctx.restore();

  // Counter-rotating bezel arcs.
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = g(0.5 * boot);
  for (let i = 0; i < 3; i++) {
    const a0 = -now * 0.12 + (i * TAU) / 3;
    ctx.beginPath(); ctx.arc(cx, cy, R + 30, a0, a0 + 0.5); ctx.stroke();
  }
  ctx.strokeStyle = g(0.25 * boot);
  ctx.setLineDash([1, 6]);
  ctx.beginPath(); ctx.arc(cx, cy, R + 30, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
}

function drawPointer() {
  if (!pointer.active) return;
  const dx = (pointer.x - cx) / R, dy = (cy - pointer.y) / R;
  const r = Math.hypot(dx, dy);
  if (r > 1) return;
  const deg = (bearingOf(dx, dy) * 180) / Math.PI;
  ctx.save();
  ctx.strokeStyle = hi(0.35);
  ctx.setLineDash([2, 4]);
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(pointer.x, pointer.y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = hi(0.9);
  ctx.beginPath();
  ctx.moveTo(pointer.x - 9, pointer.y); ctx.lineTo(pointer.x - 3, pointer.y);
  ctx.moveTo(pointer.x + 3, pointer.y); ctx.lineTo(pointer.x + 9, pointer.y);
  ctx.moveTo(pointer.x, pointer.y - 9); ctx.lineTo(pointer.x, pointer.y - 3);
  ctx.moveTo(pointer.x, pointer.y + 3); ctx.lineTo(pointer.x, pointer.y + 9);
  ctx.stroke();
  ctx.font = `10px ${FONT}`;
  ctx.fillStyle = hi(0.9);
  ctx.textBaseline = 'middle';
  ctx.textAlign = pointer.x > cx ? 'right' : 'left';
  ctx.fillText(
    `R ${(r * RANGE_KM).toFixed(1)}  B ${pad(Math.round(deg) % 360, 3)}°`,
    pointer.x + (pointer.x > cx ? -14 : 14),
    pointer.y + 16,
  );
  ctx.restore();
}

function render() {
  // A zero-sized window (minimised, hidden pane) has nothing to draw.
  if (!staticLayer.width || !staticLayer.height) return;
  const boot = reduceMotion ? 1 : clamp(now / 1.4, 0, 1);
  ctx.clearRect(0, 0, W, H);

  // Scope "powers on": static layer fades in, rings wipe outward.
  ctx.globalAlpha = boot;
  ctx.drawImage(staticLayer, 0, 0, W, H);
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
  drawSweep(boot);
  drawBlips();
  // Tracks are clipped too: nothing is displayed outside the coverage.
  for (const tr of tracks) if (tr !== selected) drawTrack(tr);
  if (selected) drawTrack(selected);
  ctx.restore();

  // Own position.
  ctx.fillStyle = hi(1);
  ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, TAU); ctx.fill();
  ctx.strokeStyle = g(0.6);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, TAU); ctx.stroke();

  drawOuter(boot);
  drawPointer();
}

// --- DOM readouts ------------------------------------------------------------
const el = (id) => document.getElementById(id);
const out = {
  az: el('r-az'), trk: el('r-trk'), utc: el('r-utc'),
  id: el('l-id'), rng: el('l-rng'), brg: el('l-brg'), spd: el('l-spd'),
};

function updateReadouts() {
  const d = new Date();
  out.az.textContent = pad(Math.round((sweep * 180) / Math.PI) % 360, 3);
  out.trk.textContent = tracks.filter((t) => t.status === 'conf').length;
  out.utc.textContent = `${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}`;
  if (selected) {
    const { x } = predict(selected.x, selected.P, now - selected.t);
    out.id.textContent = `T${pad(selected.id, 2)}`;
    out.rng.textContent = `${pad((Math.hypot(x[0], x[1]) * RANGE_KM).toFixed(1), 4)} km`;
    out.brg.textContent = `${pad(Math.round((bearingOf(x[0], x[1]) * 180) / Math.PI) % 360, 3)}°`;
    out.spd.textContent = `${pad(Math.round(Math.hypot(x[2], x[3]) * RANGE_KM * 1000), 3)} m/s`;
  } else {
    out.id.textContent = '---';
    out.rng.textContent = '--.- km';
    out.brg.textContent = '---°';
    out.spd.textContent = '--- m/s';
  }
}

// --- Headline decode effect --------------------------------------------------
function scramble(node) {
  const text = node.textContent;
  const glyphs = '01<>/\\_#%=+';
  const start = performance.now();
  const dur = 1100;
  (function tick(t) {
    const k = clamp((t - start) / dur, 0, 1);
    const solved = Math.floor(k * text.length);
    let s = '';
    for (let i = 0; i < text.length; i++) {
      s += i < solved || text[i] === ' ' ? text[i] : glyphs[Math.floor(rand() * glyphs.length)];
    }
    node.textContent = s;
    if (k < 1) requestAnimationFrame(tick);
  })(start);
}

// --- Layout ------------------------------------------------------------------
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = scopeEl.getBoundingClientRect();
  cx = r.left + r.width / 2;
  cy = r.top + r.height / 2;
  R = Math.max(40, Math.min(r.width, r.height) / 2 - 36);
  small = R < 150;
  drawStatic();
  if (reduceMotion) render();
}

// --- Boot --------------------------------------------------------------------
const targetCount = () => (Math.min(window.innerWidth, window.innerHeight) < 500 ? 4 : 6);
for (let i = 0; i < targetCount(); i++) targets.push(spawnTarget(true));

resize();
new ResizeObserver(resize).observe(scopeEl);
window.addEventListener('resize', resize);

window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
});
document.addEventListener('pointerleave', () => { pointer.active = false; });

if (reduceMotion) {
  // No animation: simulate a while, then show a single still frame.
  for (let i = 0; i < 500; i++) step(0.05);
  render();
  updateReadouts();
} else {
  log('RADAR ONLINE · SCANNING');
  scramble(document.getElementById('headline'));
  let last = performance.now();
  let lastDom = 0;
  function frame(t) {
    // Schedule first, so one failed frame can never stop the loop.
    requestAnimationFrame(frame);
    const dt = Math.min((t - last) / 1000, 0.1);
    last = t;
    if (!document.hidden) {
      step(dt);
      render();
      if (t - lastDom > 100) { lastDom = t; updateReadouts(); }
    }
  }
  requestAnimationFrame(frame);
}
