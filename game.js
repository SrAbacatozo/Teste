// ╔══════════════════════════════════════════════════════════════════╗
// ║  GRAVITY BEAT — Tunnel Runner                                      ║
// ║  Corra por um túnel quadrado. A gravidade te prende numa das 4     ║
// ║  paredes. GIRE para escapar dos muros e PULE as barreiras baixas.  ║
// ╚══════════════════════════════════════════════════════════════════╝

'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = 480, H = 720;
const CX = W / 2, CY = H * 0.46;     // ponto de fuga (um pouco acima do centro)

// ── Perspectiva do túnel ──────────────────────────────────────────────
const NEAR = 300, K = 5;
const T_PLAYER = 0.10;                // profundidade onde o personagem corre
function halfSize(t) { return NEAR / (1 + K * t); }

function squareDir(a) {               // ponto na borda do quadrado unitário
  const c = Math.cos(a), s = Math.sin(a);
  const m = Math.max(Math.abs(c), Math.abs(s));
  return [c / m, s / m];
}
function project(a, t) {
  const d = squareDir(a);
  const hs = halfSize(t);
  return [CX + d[0] * hs, CY + d[1] * hs];
}

//  0 = CHÃO | 1 = DIREITA | 2 = TETO | 3 = ESQUERDA
const WALL_ANGLE = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];
const CORNER_A = w => WALL_ANGLE[0] + w * Math.PI / 2 - Math.PI / 4;

// ── Pulo ──────────────────────────────────────────────────────────────
const JUMP_VEL = 0.082, GRAVITY = 0.0052, LIFT_PX = 95;
const CLEAR_H = 0.30;                 // altura necessária p/ passar a barreira

// ── UI ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const scoreEl = $('score-display'), levelEl = $('level-display'), bpmEl = $('bpm-display');
const comboEl = $('combo-display'), menuEl = $('menu'), goEl = $('gameover');
const goScore = $('go-score-val'), goBest = $('go-best-val'), goPhase = $('go-phase-val');
const goTitle = $('go-title'), newRecEl = $('new-record'), countdownEl = $('countdown');
const flashEl = $('flash'), tzLeft = $('tz-left'), tzRight = $('tz-right'), jumpBtn = $('jump-btn');

// ══════════════════════════════════════════════════════════════════════
//  ÁUDIO — trilha eletrônica procedural que acelera
// ══════════════════════════════════════════════════════════════════════
let audio = null, master = null, beatTimer = null, step = 0, nextNoteTime = 0;
let bpm = 120, musicEnergy = 0;

function initAudio() {
  if (audio) return;
  audio = new (window.AudioContext || window.webkitAudioContext)();
  master = audio.createGain(); master.gain.value = 0.6;
  const comp = audio.createDynamicsCompressor();
  master.connect(comp); comp.connect(audio.destination);
}
function kick(t) {
  const o = audio.createOscillator(), g = audio.createGain();
  o.connect(g); g.connect(master);
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  g.gain.setValueAtTime(1.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  o.start(t); o.stop(t + 0.3);
}
function snare(t) {
  const len = audio.sampleRate * 0.2, buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = audio.createBufferSource(); s.buffer = buf;
  const hp = audio.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
  const g = audio.createGain(); s.connect(hp); hp.connect(g); g.connect(master);
  g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  s.start(t); s.stop(t + 0.2);
}
function hat(t, open) {
  const len = audio.sampleRate * (open ? 0.12 : 0.04), buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = audio.createBufferSource(); s.buffer = buf;
  const hp = audio.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 8000;
  const g = audio.createGain(); s.connect(hp); hp.connect(g); g.connect(master);
  g.gain.setValueAtTime(open ? 0.25 : 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.12 : 0.04));
  s.start(t); s.stop(t + 0.13);
}
function bassNote(t, freq, dur) {
  const o = audio.createOscillator(), g = audio.createGain(), f = audio.createBiquadFilter();
  o.type = 'sawtooth'; f.type = 'lowpass';
  f.frequency.setValueAtTime(120, t);
  f.frequency.exponentialRampToValueAtTime(600 + musicEnergy * 800, t + 0.05);
  f.frequency.exponentialRampToValueAtTime(150, t + dur);
  o.connect(f); f.connect(g); g.connect(master);
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t); o.stop(t + dur + 0.02);
}
function leadNote(t, freq, dur) {
  const o = audio.createOscillator(), o2 = audio.createOscillator(), g = audio.createGain(), f = audio.createBiquadFilter();
  o.type = 'square'; o2.type = 'sawtooth'; o2.detune.value = 8;
  f.type = 'bandpass'; f.frequency.value = freq * 2.2; f.Q.value = 3;
  o.connect(f); o2.connect(f); f.connect(g); g.connect(master);
  o.frequency.value = freq; o2.frequency.value = freq;
  const vol = 0.06 + musicEnergy * 0.12;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
}
const BASS_NOTES = [55, 0, 55, 0, 73.4, 0, 55, 65.4, 55, 0, 82.4, 0, 73.4, 0, 65.4, 61.7];
const LEAD_NOTES = [440, 0, 523, 659, 0, 587, 523, 0, 440, 392, 0, 523, 659, 0, 784, 659];
function scheduleStep(s, t, spb) {
  const i = s % 16;
  if (i % 4 === 0) kick(t);
  if (i === 4 || i === 12) snare(t);
  hat(t, i % 4 === 2);
  if (BASS_NOTES[i]) bassNote(t, BASS_NOTES[i], spb * 1.8);
  if (musicEnergy > 0.25 && LEAD_NOTES[i]) leadNote(t, LEAD_NOTES[i] * (musicEnergy > 0.7 ? 2 : 1), spb * 1.4);
}
function startMusic() {
  if (!audio) return;
  step = 0; nextNoteTime = audio.currentTime + 0.08;
  if (beatTimer) clearInterval(beatTimer);
  beatTimer = setInterval(() => {
    const spb = 60 / bpm / 4;
    while (nextNoteTime < audio.currentTime + 0.25) { scheduleStep(step, nextNoteTime, spb); nextNoteTime += spb; step++; }
  }, 25);
}
function stopMusic() { if (beatTimer) clearInterval(beatTimer); beatTimer = null; }
function blip(freq, dur, type, vol) {
  if (!audio) return;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type || 'square'; o.connect(g); g.connect(master);
  o.frequency.setValueAtTime(freq, audio.currentTime);
  o.frequency.exponentialRampToValueAtTime(freq * 1.8, audio.currentTime + dur);
  g.gain.setValueAtTime(vol || 0.3, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
  o.start(); o.stop(audio.currentTime + dur);
}

// ══════════════════════════════════════════════════════════════════════
//  ESTADO
// ══════════════════════════════════════════════════════════════════════
let state = 'menu', endless = false;
let score = 0, displayScore = 0, best = +(localStorage.getItem('gb_best') || 0);
let frame = 0, distance = 0, speed = 0;

let angle = WALL_ANGLE[0], targetAngle = WALL_ANGLE[0];
let curWall = 0, targetWall = 0, rotProgress = 1;

let jumpH = 0, jumpVel = 0, isJumping = false, squash = 0;

let obstacles = [], decor = [], particles = [], trail = [];
let shake = 0, combo = 0, comboTimer = 0, bestCombo = 0;
let beatPulse = 0, lastBeat = -1, hue = 190;
let spawnTimer = 0, spawnCount = 0, decorTimer = 0;

const LEVELS = [
  { name: 'FASE 1', bpm: 120, dur: 26, hue: 190, energy: 0.15 },
  { name: 'FASE 2', bpm: 132, dur: 26, hue: 150, energy: 0.35 },
  { name: 'FASE 3', bpm: 144, dur: 24, hue: 55,  energy: 0.5  },
  { name: 'FASE 4', bpm: 158, dur: 22, hue: 25,  energy: 0.65 },
  { name: 'FASE 5', bpm: 172, dur: 20, hue: 310, energy: 0.8  },
  { name: 'OVERDRIVE', bpm: 188, dur: 22, hue: 0, energy: 1.0 },
];
let levelIdx = 0, levelTimer = 0;

const hsl = (h, s, l, a) => `hsla(${h},${s}%,${l}%,${a == null ? 1 : a})`;
const themeColor = (l = 60, a = 1) => hsl(hue, 100, l, a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ══════════════════════════════════════════════════════════════════════
//  OBSTÁCULOS  (blocked = muro alto / hurdle = barreira p/ pular)
// ══════════════════════════════════════════════════════════════════════
function spawnObstacle() {
  const diff = endless ? clamp(distance / 4500, 0, 1) : levelIdx / LEVELS.length;
  const blocked = [false, false, false, false];
  const hurdle = [false, false, false, false];
  let type;

  if (spawnCount < 2) type = 'gate';            // ensina a girar
  else if (spawnCount === 2) type = 'hurdle';   // ensina a pular
  else {
    const r = Math.random();
    if (diff > 0.55 && r < 0.22) type = 'combo';
    else if (r < 0.58) type = 'gate';
    else type = 'hurdle';
  }

  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);

  if (type === 'gate') {
    let safe = diff < 0.25 ? (Math.random() < 0.6 ? 2 : 1)
             : diff < 0.6  ? (Math.random() < 0.7 ? 1 : 2) : 1;
    for (let i = safe; i < 4; i++) blocked[order[i]] = true;
  } else if (type === 'hurdle') {
    if (Math.random() < 0.6) for (let i = 0; i < 4; i++) hurdle[i] = true;   // anel: tem que pular
    else { const n = 1 + Math.floor(Math.random() * 2); for (let i = 0; i < n; i++) hurdle[order[i]] = true; }
  } else { // combo: 1 parede livre, mas com barreira p/ pular
    for (let i = 1; i < 4; i++) blocked[order[i]] = true;
    hurdle[order[0]] = true;
  }

  obstacles.push({ t: 1.0, blocked, hurdle, scored: false, type, hue: (hue + 180 + Math.random() * 40) % 360 });
  spawnCount++;
}

function spawnDecor() {
  // arco decorativo de neon (não colide)
  decor.push({ t: 1.0, hue: (hue + (Math.random() < 0.5 ? 0 : 40)) % 360, kind: Math.random() < 0.5 ? 'arch' : 'ring' });
}

// ══════════════════════════════════════════════════════════════════════
//  PARTÍCULAS
// ══════════════════════════════════════════════════════════════════════
function burst(x, y, color, n, spread, mul) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = (1 + Math.random() * spread) * (mul || 1);
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: 2 + Math.random() * 4, life: 1, decay: 0.012 + Math.random() * 0.02, color, grav: 0.04 });
  }
}
function updateParticles() {
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.vx *= 0.98; p.vy *= 0.98;
    p.life -= p.decay; p.r *= 0.985;
  }
  particles = particles.filter(p => p.life > 0 && p.r > 0.4);
}

// ══════════════════════════════════════════════════════════════════════
//  POSIÇÃO DO PERSONAGEM
// ══════════════════════════════════════════════════════════════════════
function wallPoint() {                          // ponto na parede (sem pulo)
  const d = squareDir(angle), hs = halfSize(T_PLAYER);
  return [CX + d[0] * hs, CY + d[1] * hs, d];
}
function playerFeet() {                          // posição real (com pulo)
  const [wx, wy, d] = wallPoint();
  const len = Math.hypot(d[0], d[1]);
  const lift = jumpH * LIFT_PX;
  return [wx - d[0] / len * lift, wy - d[1] / len * lift];
}
function playerRotation() { const d = squareDir(angle); return Math.atan2(-d[0], d[1]); }
const airborne = () => jumpH > 0.02;

// ══════════════════════════════════════════════════════════════════════
//  DESENHO — fundo + cenário
// ══════════════════════════════════════════════════════════════════════
function drawBackground() {
  const g = ctx.createRadialGradient(CX, CY, 20, CX, CY, H);
  g.addColorStop(0, hsl(hue, 80, 16));
  g.addColorStop(0.5, hsl((hue + 40) % 360, 70, 6));
  g.addColorStop(1, '#03000a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // núcleo de energia pulsante no ponto de fuga
  const core = 14 + beatPulse * 22;
  const cg = ctx.createRadialGradient(CX, CY, 0, CX, CY, core * 2.5);
  cg.addColorStop(0, themeColor(85, 0.9));
  cg.addColorStop(0.4, themeColor(60, 0.4));
  cg.addColorStop(1, themeColor(50, 0));
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(CX, CY, core * 2.5, 0, 7); ctx.fill();

  // poeira voando em direção à câmera
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 55; i++) {
    const seed = i * 73.13;
    const dd = ((seed + distance * (0.4 + (i % 5) * 0.15)) % 800) / 800;
    const t = 1 - dd, ang = seed * 2.3, rad = halfSize(t) * (0.55 + (i % 7) / 14);
    ctx.globalAlpha = (1 - t) * 0.55;
    ctx.fillRect(CX + Math.cos(ang) * rad, CY + Math.sin(ang) * rad, (1 - t) * 2.4, (1 - t) * 2.4);
  }
  ctx.globalAlpha = 1;
}

function drawTunnel() {
  // anéis de profundidade que rolam em direção à câmera
  const ringCount = 16, scroll = (distance * 0.0016) % (1 / ringCount);
  for (let i = ringCount; i >= 1; i--) {
    let t = i / ringCount - scroll;
    if (t <= 0.02 || t > 1) continue;
    const near = 1 - t, lite = 18 + near * (28 + beatPulse * 22);
    ctx.beginPath();
    for (let w = 0; w <= 4; w++) { const p = project(CORNER_A(w), t); w === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); }
    ctx.closePath();
    ctx.strokeStyle = hsl(hue, 90, lite, 0.22 + near * 0.45);
    ctx.lineWidth = 1 + near * 2; ctx.stroke();
  }
  // arestas + painéis longitudinais (sensação de cenário)
  for (let c = 0; c < 4; c++) {
    const near = project(CORNER_A(c), T_PLAYER * 0.4), far = project(CORNER_A(c), 0.97);
    ctx.beginPath(); ctx.moveTo(near[0], near[1]); ctx.lineTo(far[0], far[1]);
    ctx.strokeStyle = themeColor(50, 0.4); ctx.lineWidth = 1.8; ctx.stroke();
    // linha de painel no meio de cada parede
    const mid = CORNER_A(c) + Math.PI / 4;
    const n2 = project(mid, T_PLAYER * 0.4), f2 = project(mid, 0.97);
    ctx.beginPath(); ctx.moveTo(n2[0], n2[1]); ctx.lineTo(f2[0], f2[1]);
    ctx.strokeStyle = themeColor(40, 0.12); ctx.lineWidth = 1; ctx.stroke();
  }
}

function drawDecor() {
  const sorted = decor.slice().sort((a, b) => b.t - a.t);
  for (const dc of sorted) {
    const near = 1 - dc.t, tF = Math.max(dc.t - 0.03, 0.001), tB = Math.min(dc.t + 0.04, 1);
    const glow = 0.3 + near * 0.6, lw = 2 + near * 5;
    ctx.strokeStyle = hsl(dc.hue, 100, 60, glow);
    ctx.shadowColor = hsl(dc.hue, 100, 60); ctx.shadowBlur = 10 + near * 14;
    ctx.lineWidth = lw;
    // moldura quadrada (arco)
    ctx.beginPath();
    for (let w = 0; w <= 4; w++) { const p = project(CORNER_A(w), tF); w === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); }
    ctx.closePath(); ctx.stroke();
    if (dc.kind === 'ring') {
      ctx.beginPath();
      for (let w = 0; w <= 4; w++) { const p = project(CORNER_A(w), tB); w === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); }
      ctx.closePath(); ctx.stroke();
    }
    // nós luminosos nos cantos
    ctx.shadowBlur = 0; ctx.fillStyle = hsl(dc.hue, 100, 75, glow);
    for (let w = 0; w < 4; w++) { const p = project(CORNER_A(w), tF); ctx.beginPath(); ctx.arc(p[0], p[1], 2 + near * 3, 0, 7); ctx.fill(); }
  }
  ctx.shadowBlur = 0;
}

// muro alto que bloqueia toda a parede
function drawWall(a0, a1, tF, tB, near, h, warn) {
  const f0 = project(a0, tF), f1 = project(a1, tF), b0 = project(a0, tB), b1 = project(a1, tB);
  ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]); ctx.lineTo(f1[0], f1[1]); ctx.lineTo(f0[0], f0[1]); ctx.closePath();
  ctx.fillStyle = warn ? '#fff' : hsl(h, 90, 20 + near * 26, 0.94); ctx.fill();
  ctx.strokeStyle = hsl(h, 100, 58 + near * 18); ctx.lineWidth = 1 + near * 2.5; ctx.stroke();
  // listras de alerta
  ctx.save();
  ctx.beginPath(); ctx.moveTo(f0[0], f0[1]); ctx.lineTo(f1[0], f1[1]); ctx.lineTo(b1[0], b1[1]); ctx.lineTo(b0[0], b0[1]); ctx.closePath(); ctx.clip();
  ctx.strokeStyle = hsl(h, 100, 70, 0.45); ctx.lineWidth = 3;
  const mid = project((a0 + a1) / 2, (tF + tB) / 2);
  for (let s = -4; s <= 4; s++) { ctx.beginPath(); ctx.moveTo(mid[0] - 44 + s * 13, mid[1] - 44); ctx.lineTo(mid[0] + 44 + s * 13, mid[1] + 44); ctx.stroke(); }
  ctx.restore();
}

// barreira baixa que se pula (fica rente à parede)
function drawHurdle(a0, a1, t, near, h) {
  // base na parede e topo a uma fração para dentro do túnel
  const baseHs = halfSize(t), topHs = baseHs * (1 - CLEAR_H * 0.9);
  const d0 = squareDir(a0), d1 = squareDir(a1);
  const bp0 = [CX + d0[0] * baseHs, CY + d0[1] * baseHs];
  const bp1 = [CX + d1[0] * baseHs, CY + d1[1] * baseHs];
  const tp0 = [CX + d0[0] * topHs, CY + d0[1] * topHs];
  const tp1 = [CX + d1[0] * topHs, CY + d1[1] * topHs];
  ctx.beginPath(); ctx.moveTo(bp0[0], bp0[1]); ctx.lineTo(bp1[0], bp1[1]); ctx.lineTo(tp1[0], tp1[1]); ctx.lineTo(tp0[0], tp0[1]); ctx.closePath();
  ctx.fillStyle = hsl(38, 100, 30 + near * 22, 0.95); ctx.fill();
  ctx.strokeStyle = hsl(45, 100, 60); ctx.lineWidth = 1 + near * 2; ctx.stroke();
  // setas "PULE" ↑ apontando p/ dentro
  const mid = [(bp0[0] + bp1[0]) / 2, (bp0[1] + bp1[1]) / 2];
  const inwardLen = Math.hypot(CX - mid[0], CY - mid[1]) || 1;
  const ix = (CX - mid[0]) / inwardLen, iy = (CY - mid[1]) / inwardLen;
  ctx.strokeStyle = hsl(50, 100, 75, 0.6 + near * 0.4); ctx.lineWidth = 2 + near * 1.5;
  const blink = Math.sin(frame * 0.3) > -0.3;
  if (near > 0.3 && blink) for (let s = -1; s <= 1; s++) {
    const px = mid[0] + (-iy) * s * 20, py = mid[1] + (ix) * s * 20;
    const len = 10 + near * 8;
    ctx.beginPath();
    ctx.moveTo(px - (-iy) * 6, py - (ix) * 6 + 0); ctx.lineTo(px + ix * len, py + iy * len);
    ctx.lineTo(px + (-iy) * 6, py + (ix) * 6); ctx.stroke();
  }
}

function drawObstacles() {
  const sorted = obstacles.slice().sort((a, b) => b.t - a.t);
  for (const obs of sorted) {
    const near = 1 - obs.t, tF = Math.max(obs.t - 0.05, 0.001), tB = Math.min(obs.t + 0.06, 1);
    const warn = obs.t < 0.32 && Math.sin(frame * 0.5) > 0;
    for (let w = 0; w < 4; w++) {
      const a0 = CORNER_A(w), a1 = a0 + Math.PI / 2;
      if (obs.blocked[w]) {
        drawWall(a0, a1, tF, tB, near, obs.hue, warn);
      } else if (obs.hurdle[w]) {
        drawHurdle(a0, a1, obs.t, near, obs.hue);
      } else {
        const f0 = project(a0, tF), f1 = project(a1, tF);
        ctx.beginPath(); ctx.moveTo(f0[0], f0[1]); ctx.lineTo(f1[0], f1[1]);
        ctx.strokeStyle = hsl(140, 100, 55, 0.3 + near * 0.5); ctx.lineWidth = 2 + near * 4;
        ctx.shadowColor = hsl(140, 100, 55); ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0;
      }
    }
  }
}

// ── personagem ────────────────────────────────────────────────────────
function drawPlayer() {
  const [wx, wy] = wallPoint();
  const [fx, fy] = playerFeet();
  const rot = playerRotation();
  const air = airborne();

  // sombra na parede (encolhe ao pular)
  ctx.save(); ctx.translate(wx, wy); ctx.rotate(rot);
  ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - jumpH * 1.2)})`;
  ctx.beginPath(); ctx.ellipse(0, 1, 11 * (1 - jumpH * 0.8), 4 * (1 - jumpH), 0, 0, 7); ctx.fill();
  ctx.restore();

  // rastro
  trail.push({ x: fx, y: fy });
  if (trail.length > 12) trail.shift();
  for (let i = 0; i < trail.length; i++) {
    ctx.fillStyle = themeColor(60, (i / trail.length) * 0.35);
    ctx.beginPath(); ctx.arc(trail[i].x, trail[i].y, 8 * (i / trail.length), 0, 7); ctx.fill();
  }

  // glow
  const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, 48);
  glow.addColorStop(0, themeColor(65, 0.5 + beatPulse * 0.3));
  glow.addColorStop(1, themeColor(65, 0));
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(fx, fy, 48, 0, 7); ctx.fill();

  ctx.save();
  ctx.translate(fx, fy);
  ctx.rotate(rot);
  const sc = 1.25;
  // squash & stretch (sx*sy ~ 1)
  const sy = 1 + squash * 0.18, sx = 1 - squash * 0.14;
  ctx.scale(sc * sx, sc * sy);

  const run = state === 'playing' && !air;
  const cyc = run ? Math.sin(frame * 0.5) : 0;
  const cyc2 = run ? Math.sin(frame * 0.5 + Math.PI) : 0;
  const bob = run ? Math.abs(Math.sin(frame * 0.5)) * 2.5 : 0;
  const col = themeColor(64), colD = themeColor(46);
  const lean = run ? 1.5 : 0;                   // inclinação ao correr

  ctx.lineCap = 'round'; ctx.shadowColor = col; ctx.shadowBlur = 10;
  ctx.translate(lean, 0);

  if (air) {
    // pose de pulo: pernas dobradas, braços p/ cima
    ctx.strokeStyle = colD; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(-6, -3); ctx.lineTo(-3, 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(6, -3); ctx.lineTo(8, 1); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, -32); ctx.stroke();
    ctx.strokeStyle = colD; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(-9, -36); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(9, -36); ctx.stroke();
  } else {
    // corrida
    ctx.strokeStyle = colD; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(cyc * 8, -2 + Math.max(0, cyc) * 2); ctx.lineTo(cyc * 9, 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(cyc2 * 8, -2 + Math.max(0, cyc2) * 2); ctx.lineTo(cyc2 * 9, 1); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(0, -10 - bob); ctx.lineTo(0, -30 - bob); ctx.stroke();
    ctx.strokeStyle = colD; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -26 - bob); ctx.lineTo(cyc2 * 9, -17 - bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -26 - bob); ctx.lineTo(cyc * 9, -17 - bob); ctx.stroke();
  }
  // cabeça
  ctx.fillStyle = '#fff'; ctx.shadowBlur = 16; ctx.shadowColor = col;
  ctx.beginPath(); ctx.arc(0, (air ? -38 : -38 - bob), 7, 0, 7); ctx.fill();
  ctx.restore();
  ctx.shadowBlur = 0;

  // poeira ao correr no chão
  if (run && frame % 7 === 0) burst(wx, wy, themeColor(70, 0.8), 2, 1.5, 0.5);
}

function drawSpeedLines() {
  if (speed < 6) return;
  ctx.strokeStyle = themeColor(80, Math.min((speed - 6) / 10, 0.5)); ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (frame * 0.1 + i * 0.785) % (Math.PI * 2);
    const n0 = project(a, 0.05), n1 = project(a, 0.3);
    ctx.beginPath(); ctx.moveTo(n0[0], n0[1]); ctx.lineTo(n1[0], n1[1]); ctx.stroke();
  }
}
function drawParticles() {
  for (const p of particles) { ctx.globalAlpha = Math.max(p.life, 0); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
}

// ══════════════════════════════════════════════════════════════════════
//  AÇÕES
// ══════════════════════════════════════════════════════════════════════
function rotate(dir) {
  if (state !== 'playing') return;
  targetWall = (targetWall + dir + 4) % 4; curWall = targetWall;
  let ta = WALL_ANGLE[targetWall];
  while (ta - targetAngle > Math.PI) ta -= Math.PI * 2;
  while (ta - targetAngle < -Math.PI) ta += Math.PI * 2;
  targetAngle = ta;
  burst(...playerFeet(), themeColor(70), 6, 2, 0.6);
  blip(300, 0.08, 'square', 0.18);
}
function jump() {
  if (state !== 'playing' || isJumping || jumpH > 0) return;
  isJumping = true; jumpVel = JUMP_VEL; squash = -0.6;
  burst(...wallPoint(), themeColor(75, 0.9), 8, 2, 0.7);
  blip(420, 0.18, 'sine', 0.25);
}

// ══════════════════════════════════════════════════════════════════════
//  UPDATE
// ══════════════════════════════════════════════════════════════════════
function update() {
  frame++; distance += speed;
  if (comboTimer > 0) comboTimer--;
  shake *= 0.86; squash *= 0.82; beatPulse *= 0.88;

  angle += (targetAngle - angle) * 0.28;
  rotProgress = 1 - Math.min(Math.abs(targetAngle - angle) / (Math.PI / 2), 1);

  // física do pulo
  if (isJumping) {
    jumpVel -= GRAVITY; jumpH += jumpVel;
    if (jumpH <= 0) { jumpH = 0; isJumping = false; squash = 0.7; burst(...wallPoint(), themeColor(70, 0.7), 5, 1.5, 0.5); }
  }

  // batida visual
  const spb = (60 / bpm) * 60 / 4;
  const beatNow = Math.floor(frame / (spb * 4));
  if (beatNow !== lastBeat) { lastBeat = beatNow; beatPulse = 1; }

  // dificuldade / fases
  if (endless) {
    speed = Math.min(16, 5 + distance * 0.00018);
    bpm = Math.min(200, 120 + Math.floor(distance / 1500) * 8);
    musicEnergy = clamp(0.15 + distance / 6000, 0, 1);
    hue = (190 + distance * 0.02) % 360;
  } else {
    const lv = LEVELS[Math.min(levelIdx, LEVELS.length - 1)];
    bpm = lv.bpm; musicEnergy = lv.energy;
    hue += (((lv.hue - hue + 540) % 360) - 180) * 0.05;
    speed += (5.5 + levelIdx * 1.4 - speed) * 0.02;
    levelTimer++;
    if (levelTimer > lv.dur * 60) {
      levelTimer = 0; levelIdx++;
      if (levelIdx >= LEVELS.length) { victory(); return; }
      levelUp();
    }
  }

  // spawns
  const interval = Math.max(38, 82 - speed * 2.6);
  if (++spawnTimer >= interval) { spawnTimer = 0; spawnObstacle(); }
  if (++decorTimer >= 55) { decorTimer = 0; spawnDecor(); }

  for (const o of obstacles) o.t -= speed * 0.0011;
  for (const d of decor) d.t -= speed * 0.0011;

  // colisão / pontuação
  for (const obs of obstacles) {
    if (!obs.scored && obs.t <= T_PLAYER) {
      obs.scored = true;
      if (obs.blocked[curWall]) return die('muro');
      if (obs.hurdle[curWall] && jumpH < CLEAR_H) return die('barreira');
      combo++; comboTimer = 150;
      if (combo > bestCombo) bestCombo = combo;
      score += 10 + combo * 2;
      const [fx, fy] = playerFeet();
      burst(fx, fy, themeColor(70), 10, 3, 1);
      if (combo >= 3) showCombo();
      beatPulse = 1;
    }
  }
  obstacles = obstacles.filter(o => o.t > -0.1);
  decor = decor.filter(d => d.t > -0.1);

  if (comboTimer === 0 && combo > 0) { combo = 0; hideCombo(); }
  score += Math.floor(speed * 0.15);

  displayScore += (score - displayScore) * 0.2;
  scoreEl.textContent = Math.round(displayScore);
  levelEl.textContent = endless ? 'INFINITO' : LEVELS[Math.min(levelIdx, LEVELS.length - 1)].name;
  bpmEl.textContent = Math.round(bpm) + ' BPM';
}

function showCombo() {
  comboEl.textContent = combo + 'x';
  comboEl.style.opacity = '1'; comboEl.style.transform = 'scale(1.1)';
  const c = hsl((hue + combo * 12) % 360, 100, 65);
  comboEl.style.color = c; comboEl.style.textShadow = '0 0 20px ' + c;
}
function hideCombo() { comboEl.style.opacity = '0'; comboEl.style.transform = 'scale(.6)'; }

function levelUp() {
  shake = 14;
  const lv = LEVELS[Math.min(levelIdx, LEVELS.length - 1)];
  for (let i = 0; i < 5; i++) { const a = Math.random() * Math.PI * 2; burst(CX + Math.cos(a) * 100, CY + Math.sin(a) * 100, hsl(lv.hue, 100, 60), 10, 4, 1.4); }
  comboEl.textContent = lv.name + '!';
  comboEl.style.color = hsl(lv.hue, 100, 65); comboEl.style.textShadow = '0 0 24px ' + hsl(lv.hue, 100, 65);
  comboEl.style.opacity = '1'; comboEl.style.transform = 'scale(1.2)';
  setTimeout(() => { if (combo === 0) hideCombo(); }, 1200);
  flash(0.3); blip(660, 0.3, 'sawtooth', 0.3);
}
function flash(amt) { flashEl.style.opacity = amt; setTimeout(() => flashEl.style.opacity = 0, 60); }

function die() {
  state = 'dying'; shake = 26; flash(0.7);
  const [fx, fy] = playerFeet();
  burst(fx, fy, '#ff3355', 50, 6, 1.6); burst(fx, fy, '#fff', 20, 5, 1.2);
  stopMusic();
  if (audio) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sawtooth'; o.connect(g); g.connect(master);
    o.frequency.setValueAtTime(200, audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, audio.currentTime + 0.5);
    g.gain.setValueAtTime(0.6, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.6);
    o.start(); o.stop(audio.currentTime + 0.6);
  }
  setTimeout(() => showGameover(false), 900);
}
function victory() {
  state = 'dying'; stopMusic();
  for (let k = 0; k < 8; k++) setTimeout(() => { const a = Math.random() * Math.PI * 2; burst(CX + Math.cos(a) * 80, CY + Math.sin(a) * 80, hsl(Math.random() * 360, 100, 65), 16, 6, 1.6); }, k * 120);
  setTimeout(() => showGameover(true), 1400);
}
function showGameover(won) {
  state = 'dead'; jumpBtn.style.display = 'none';
  const rec = score > best;
  if (rec) { best = score; localStorage.setItem('gb_best', best); }
  goTitle.textContent = won ? 'VOCÊ VENCEU!' : 'GAME OVER';
  goTitle.style.color = won ? '#00eaff' : '#ff3a5e';
  goTitle.style.textShadow = '0 0 24px ' + (won ? '#00eaff' : '#ff3a5e');
  goScore.textContent = score; goBest.textContent = 'Recorde: ' + best;
  goPhase.textContent = endless ? `Distância ${Math.round(distance / 10)}m · Combo máx ${bestCombo}x`
    : `${LEVELS[Math.min(levelIdx, LEVELS.length - 1)].name} · Combo máx ${bestCombo}x`;
  newRecEl.classList.toggle('hidden', !rec);
  goEl.classList.remove('hidden');
}

// ══════════════════════════════════════════════════════════════════════
//  RENDER LOOP
// ══════════════════════════════════════════════════════════════════════
function render() {
  ctx.save();
  if (shake > 0.5) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
  drawBackground(); drawTunnel(); drawDecor(); drawSpeedLines(); drawObstacles();
  if (state !== 'dead') drawPlayer();
  drawParticles();
  ctx.restore();
  if (beatPulse > 0.05) { ctx.strokeStyle = themeColor(60, beatPulse * 0.6); ctx.lineWidth = 6 * beatPulse; ctx.strokeRect(3, 3, W - 6, H - 6); }
}
function loop() {
  if (state === 'playing') update();
  if (state === 'playing' || state === 'dying' || state === 'dead') {
    if (state !== 'dead' || particles.length) updateParticles();
    render();
  }
  requestAnimationFrame(loop);
}

// ══════════════════════════════════════════════════════════════════════
//  ENTRADA
// ══════════════════════════════════════════════════════════════════════
addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') { rotate(-1); flashZone(tzLeft); }
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') { rotate(1); flashZone(tzRight); }
  else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') { e.preventDefault(); jump(); }
});

let touchStartX = 0, touchStartY = 0, swiped = false;
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.changedTouches[0]; touchStartX = t.clientX; touchStartY = t.clientY; swiped = false;
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (swiped) return;
  const t = e.changedTouches[0];
  if (touchStartY - t.clientY > 34 && Math.abs(t.clientX - touchStartX) < 60) { swiped = true; jump(); }
}, { passive: false });
canvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (swiped) return;
  const t = e.changedTouches[0];
  const dy = touchStartY - t.clientY, dx = t.clientX - touchStartX;
  if (dy > 34 && Math.abs(dx) < 60) { jump(); return; }
  const rect = canvas.getBoundingClientRect();
  if ((t.clientX - rect.left) / rect.width < 0.5) { rotate(-1); flashZone(tzLeft); }
  else { rotate(1); flashZone(tzRight); }
}, { passive: false });
canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  if ((e.clientX - rect.left) / rect.width < 0.5) { rotate(-1); flashZone(tzLeft); }
  else { rotate(1); flashZone(tzRight); }
});
jumpBtn.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); jump(); }, { passive: false });
jumpBtn.addEventListener('mousedown', e => { e.stopPropagation(); jump(); });

function flashZone(el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 120); }

// ══════════════════════════════════════════════════════════════════════
//  FLUXO DE TELAS
// ══════════════════════════════════════════════════════════════════════
function resetState(isEndless) {
  endless = isEndless;
  score = 0; displayScore = 0; frame = 0; distance = 0;
  speed = endless ? 5 : 5.5;
  angle = targetAngle = WALL_ANGLE[0]; curWall = targetWall = 0; rotProgress = 1;
  jumpH = 0; jumpVel = 0; isJumping = false; squash = 0;
  obstacles = []; decor = []; particles = []; trail = [];
  shake = 0; combo = 0; comboTimer = 0; bestCombo = 0;
  levelIdx = 0; levelTimer = 0; spawnTimer = 0; spawnCount = 0; decorTimer = 0;
  bpm = endless ? 120 : LEVELS[0].bpm;
  musicEnergy = endless ? 0.15 : LEVELS[0].energy;
  hue = endless ? 190 : LEVELS[0].hue;
  hideCombo();
}
function startGame(isEndless) {
  initAudio();
  if (audio.state === 'suspended') audio.resume();
  resetState(isEndless);
  menuEl.classList.add('hidden'); goEl.classList.add('hidden');
  $('touch-zones').style.display = 'block';
  jumpBtn.style.display = 'block';
  state = 'countdown';
  let n = 3;
  const show = () => {
    if (n > 0) {
      countdownEl.textContent = n;
      countdownEl.style.transition = 'none'; countdownEl.style.opacity = '1'; countdownEl.style.transform = 'scale(1.4)';
      requestAnimationFrame(() => { countdownEl.style.transition = 'opacity .6s, transform .6s'; countdownEl.style.opacity = '0'; countdownEl.style.transform = 'scale(.6)'; });
      blip(330 + (3 - n) * 80, 0.12, 'square', 0.2);
      n--; setTimeout(show, 600);
    } else {
      countdownEl.textContent = 'JÁ!'; countdownEl.style.opacity = '1';
      setTimeout(() => countdownEl.style.opacity = '0', 350);
      blip(660, 0.2, 'square', 0.3);
      state = 'playing'; startMusic();
    }
  };
  render(); show();
}
$('btn-play').onclick = () => startGame(false);
$('btn-endless').onclick = () => startGame(true);
$('btn-retry').onclick = () => startGame(endless);
$('btn-menu').onclick = () => { goEl.classList.add('hidden'); menuEl.classList.remove('hidden'); state = 'menu'; };

goBest.textContent = 'Recorde: ' + best;
loop();
