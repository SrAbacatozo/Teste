// ╔══════════════════════════════════════════════════════════════════╗
// ║  GRAVITY BEAT — Tunnel Runner                                      ║
// ║  Você corre por um túnel quadrado. A gravidade te prende numa das  ║
// ║  4 paredes. Gire ao redor do túnel para escapar dos obstáculos.    ║
// ╚══════════════════════════════════════════════════════════════════╝

'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = 480, H = 720;
const CX = W / 2, CY = H * 0.46;     // vanishing point (um pouco acima do centro)

// ── Perspectiva do túnel ──────────────────────────────────────────────
// t = profundidade: 0 = colado na câmera, 1 = longe (ponto de fuga)
const NEAR = 300, K = 5;
const T_PLAYER = 0.10;                // profundidade onde o personagem corre
function halfSize(t) { return NEAR / (1 + K * t); }

// Ponto na parede do túnel: ângulo `a` (radianos, 0 = direita) + profundidade `t`
function squareDir(a) {
  const c = Math.cos(a), s = Math.sin(a);
  const m = Math.max(Math.abs(c), Math.abs(s));
  return [c / m, s / m];              // ponto na borda do quadrado unitário
}
function project(a, t) {
  const d = squareDir(a);
  const hs = halfSize(t);
  return [CX + d[0] * hs, CY + d[1] * hs];
}

// Ângulo central de cada parede (coords de tela, y aponta p/ baixo)
//  0 = CHÃO (baixo) | 1 = DIREITA | 2 = TETO (cima) | 3 = ESQUERDA
const WALL_ANGLE = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];

// ── Elementos de UI ───────────────────────────────────────────────────
const scoreEl   = document.getElementById('score-display');
const levelEl   = document.getElementById('level-display');
const bpmEl     = document.getElementById('bpm-display');
const comboEl   = document.getElementById('combo-display');
const menuEl    = document.getElementById('menu');
const goEl      = document.getElementById('gameover');
const goScore   = document.getElementById('go-score-val');
const goBest    = document.getElementById('go-best-val');
const goPhase   = document.getElementById('go-phase-val');
const goTitle   = document.getElementById('go-title');
const newRecEl  = document.getElementById('new-record');
const countdownEl = document.getElementById('countdown');
const flashEl   = document.getElementById('flash');
const tzLeft    = document.getElementById('tz-left');
const tzRight   = document.getElementById('tz-right');

// ══════════════════════════════════════════════════════════════════════
//  ÁUDIO — trilha eletrônica procedural que acelera
// ══════════════════════════════════════════════════════════════════════
let audio = null, master = null;
let beatTimer = null, step = 0, nextNoteTime = 0;
let bpm = 120, musicEnergy = 0;

function initAudio() {
  if (audio) return;
  audio = new (window.AudioContext || window.webkitAudioContext)();
  master = audio.createGain();
  master.gain.value = 0.6;
  const comp = audio.createDynamicsCompressor();
  master.connect(comp); comp.connect(audio.destination);
}

function kick(t) {
  const o = audio.createOscillator(), g = audio.createGain();
  o.connect(g); g.connect(master);
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  g.gain.setValueAtTime(1.1, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  o.start(t); o.stop(t + 0.3);
}
function snare(t) {
  const len = audio.sampleRate * 0.2;
  const buf = audio.createBuffer(1, len, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = audio.createBufferSource(); s.buffer = buf;
  const hp = audio.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
  const g = audio.createGain();
  s.connect(hp); hp.connect(g); g.connect(master);
  g.gain.setValueAtTime(0.55, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  s.start(t); s.stop(t + 0.2);
}
function hat(t, open) {
  const len = audio.sampleRate * (open ? 0.12 : 0.04);
  const buf = audio.createBuffer(1, len, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = audio.createBufferSource(); s.buffer = buf;
  const hp = audio.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 8000;
  const g = audio.createGain();
  s.connect(hp); hp.connect(g); g.connect(master);
  g.gain.setValueAtTime(open ? 0.25 : 0.16, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.12 : 0.04));
  s.start(t); s.stop(t + 0.13);
}
function bass(t, freq, dur) {
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = 'sawtooth';
  const f = audio.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(120, t);
  f.frequency.exponentialRampToValueAtTime(600 + musicEnergy * 800, t + 0.05);
  f.frequency.exponentialRampToValueAtTime(150, t + dur);
  o.connect(f); f.connect(g); g.connect(master);
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t); o.stop(t + dur + 0.02);
}
function lead(t, freq, dur) {
  const o = audio.createOscillator(), o2 = audio.createOscillator(), g = audio.createGain();
  o.type = 'square'; o2.type = 'sawtooth'; o2.detune.value = 8;
  const f = audio.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq * 2.2; f.Q.value = 3;
  o.connect(f); o2.connect(f); f.connect(g); g.connect(master);
  o.frequency.value = freq; o2.frequency.value = freq;
  const vol = 0.06 + musicEnergy * 0.12;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
}

// Padrões musicais (16 passos = 1 compasso)
const BASS_NOTES = [55, 0, 55, 0, 73.4, 0, 55, 65.4, 55, 0, 82.4, 0, 73.4, 0, 65.4, 61.7];
const LEAD_NOTES = [440, 0, 523, 659, 0, 587, 523, 0, 440, 392, 0, 523, 659, 0, 784, 659];

function scheduleStep(s, t, spb) {
  const i = s % 16;
  if (i % 4 === 0) kick(t);
  if (i === 4 || i === 12) snare(t);
  hat(t, i % 4 === 2);
  if (BASS_NOTES[i]) bass(t, BASS_NOTES[i], spb * 1.8);
  if (musicEnergy > 0.25 && LEAD_NOTES[i]) lead(t, LEAD_NOTES[i] * (musicEnergy > 0.7 ? 2 : 1), spb * 1.4);
  // crash no início de cada 4 compassos
  if (i === 0 && s % 64 === 0) { hat(t, true); }
}

function startMusic() {
  if (!audio) return;
  step = 0;
  nextNoteTime = audio.currentTime + 0.08;
  if (beatTimer) clearInterval(beatTimer);
  beatTimer = setInterval(() => {
    const spb = 60 / bpm / 4;          // duração de 1/16
    while (nextNoteTime < audio.currentTime + 0.25) {
      scheduleStep(step, nextNoteTime, spb);
      nextNoteTime += spb;
      step++;
    }
  }, 25);
}
function stopMusic() { if (beatTimer) clearInterval(beatTimer); beatTimer = null; }

// ══════════════════════════════════════════════════════════════════════
//  ESTADO DO JOGO
// ══════════════════════════════════════════════════════════════════════
let state = 'menu';                    // menu | countdown | playing | dying | dead
let endless = false;
let score = 0, displayScore = 0, best = +(localStorage.getItem('gb_best') || 0);
let frame = 0, distance = 0, speed = 0;

let angle = WALL_ANGLE[0];             // ângulo atual do personagem (suavizado)
let targetAngle = WALL_ANGLE[0];
let curWall = 0, targetWall = 0;
let rotProgress = 1;                   // 0→1 durante a troca de parede

let obstacles = [], particles = [], trail = [], speedLines = [];
let shake = 0, combo = 0, comboTimer = 0, bestCombo = 0;
let beatPhase = 0, lastBeatStep = -1, beatPulse = 0;
let hue = 190;

// Fases (campanha)
const LEVELS = [
  { name: 'FASE 1', bpm: 120, dur: 26, hue: 190, energy: 0.15 },
  { name: 'FASE 2', bpm: 132, dur: 26, hue: 150, energy: 0.35 },
  { name: 'FASE 3', bpm: 144, dur: 24, hue: 55,  energy: 0.5  },
  { name: 'FASE 4', bpm: 158, dur: 22, hue: 25,  energy: 0.65 },
  { name: 'FASE 5', bpm: 172, dur: 20, hue: 310, energy: 0.8  },
  { name: 'OVERDRIVE', bpm: 188, dur: 22, hue: 0, energy: 1.0 },
];
let levelIdx = 0, levelTimer = 0;

// ══════════════════════════════════════════════════════════════════════
//  CORES
// ══════════════════════════════════════════════════════════════════════
function hsl(h, s, l, a) { return `hsla(${h},${s}%,${l}%,${a == null ? 1 : a})`; }
function themeColor(l = 60, a = 1) { return hsl(hue, 100, l, a); }

// ══════════════════════════════════════════════════════════════════════
//  OBSTÁCULOS
// ══════════════════════════════════════════════════════════════════════
function spawnObstacle() {
  // Escolhe quantas paredes ficam SEGURAS (abertas)
  let safeCount;
  const diff = endless ? Math.min(distance / 4000, 1) : levelIdx / LEVELS.length;
  const r = Math.random();
  if (diff < 0.25)      safeCount = r < 0.6 ? 2 : 1;     // fácil: muitas saídas
  else if (diff < 0.6)  safeCount = r < 0.7 ? 1 : 2;
  else                  safeCount = r < 0.85 ? 1 : 2;    // difícil: quase sempre 1 saída

  const blocked = [true, true, true, true];
  // sorteia paredes seguras
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  for (let i = 0; i < safeCount; i++) blocked[order[i]] = false;

  obstacles.push({
    t: 1.0,
    blocked,
    scored: false,
    hue: (hue + 180 + Math.random() * 40) % 360,
  });
}

// ══════════════════════════════════════════════════════════════════════
//  PARTÍCULAS
// ══════════════════════════════════════════════════════════════════════
function burst(x, y, color, n, spread, speedMul) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (1 + Math.random() * spread) * (speedMul || 1);
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: 2 + Math.random() * 4, life: 1, decay: 0.012 + Math.random() * 0.02,
      color, grav: 0.04,
    });
  }
}
function updateParticles() {
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy; p.vy += p.grav;
    p.vx *= 0.98; p.vy *= 0.98;
    p.life -= p.decay; p.r *= 0.985;
  }
  particles = particles.filter(p => p.life > 0 && p.r > 0.4);
}

// ══════════════════════════════════════════════════════════════════════
//  POSIÇÃO DO PERSONAGEM
// ══════════════════════════════════════════════════════════════════════
function playerFeet() {
  const d = squareDir(angle);
  const hs = halfSize(T_PLAYER);
  return [CX + d[0] * hs, CY + d[1] * hs];
}
// rotação do personagem (local "up" 0,-1 → normal apontando p/ centro)
function playerRotation() {
  const d = squareDir(angle);                 // aponta p/ fora
  return Math.atan2(-d[0], d[1]);             // θ = atan2(-Px, Py)
}

// ══════════════════════════════════════════════════════════════════════
//  DESENHO
// ══════════════════════════════════════════════════════════════════════
function drawBackground() {
  const g = ctx.createRadialGradient(CX, CY, 20, CX, CY, H);
  g.addColorStop(0, hsl(hue, 80, 14));
  g.addColorStop(0.5, hsl((hue + 40) % 360, 70, 6));
  g.addColorStop(1, '#03000a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // estrelas / poeira voando em direção à câmera
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 60; i++) {
    const seed = i * 73.13;
    const dd = ((seed + distance * (0.4 + (i % 5) * 0.15)) % 800) / 800; // 0..1
    const t = 1 - dd;                          // longe→perto
    const ang = seed * 2.3;
    const rad = halfSize(t) * (0.55 + (i % 7) / 14);
    const x = CX + Math.cos(ang) * rad;
    const y = CY + Math.sin(ang) * rad;
    const sz = (1 - t) * 2.4;
    ctx.globalAlpha = (1 - t) * 0.6;
    ctx.fillRect(x, y, sz, sz);
  }
  ctx.globalAlpha = 1;
}

function drawTunnel() {
  const pulse = beatPulse;
  // anéis de profundidade que rolam em direção à câmera
  const ringCount = 14;
  const scroll = (distance * 0.0016) % (1 / ringCount);
  for (let i = ringCount; i >= 1; i--) {
    let t = i / ringCount - scroll;
    if (t <= 0.02 || t > 1) continue;
    const near = 1 - t;                        // 0(longe)..1(perto)
    const lite = 18 + near * (30 + pulse * 25);
    ctx.beginPath();
    for (let w = 0; w <= 4; w++) {
      const p = project(WALL_ANGLE[0] + w * Math.PI / 2 - Math.PI / 4, t); // cantos
      if (w === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
    ctx.strokeStyle = hsl(hue, 90, lite, 0.25 + near * 0.5);
    ctx.lineWidth = 1 + near * 2;
    ctx.stroke();
  }

  // arestas longitudinais (4 cantos) puxando p/ o ponto de fuga
  for (let c = 0; c < 4; c++) {
    const ca = WALL_ANGLE[0] + c * Math.PI / 2 - Math.PI / 4;
    const near = project(ca, T_PLAYER * 0.4);
    const far = project(ca, 0.97);
    ctx.beginPath();
    ctx.moveTo(near[0], near[1]); ctx.lineTo(far[0], far[1]);
    ctx.strokeStyle = themeColor(45, 0.35);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawObstacles() {
  // do mais longe para o mais perto (painter's algorithm)
  const sorted = obstacles.slice().sort((a, b) => b.t - a.t);
  for (const obs of sorted) {
    const near = 1 - obs.t;
    const tFront = Math.max(obs.t - 0.05, 0.001);
    const tBack = Math.min(obs.t + 0.06, 1);
    for (let w = 0; w < 4; w++) {
      const a0 = WALL_ANGLE[0] + w * Math.PI / 2 - Math.PI / 4;
      const a1 = a0 + Math.PI / 2;
      if (obs.blocked[w]) {
        // bloco perigoso na parede
        const f0 = project(a0, tFront), f1 = project(a1, tFront);
        const b0 = project(a0, tBack), b1 = project(a1, tBack);
        // espessura (face lateral)
        ctx.beginPath();
        ctx.moveTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]);
        ctx.lineTo(f1[0], f1[1]); ctx.lineTo(f0[0], f0[1]);
        ctx.closePath();
        const warn = obs.t < 0.35 && Math.sin(frame * 0.5) > 0;
        ctx.fillStyle = warn ? '#ffffff' : hsl(obs.hue, 90, 20 + near * 28, 0.92);
        ctx.fill();
        ctx.strokeStyle = hsl(obs.hue, 100, 55 + near * 20);
        ctx.lineWidth = 1 + near * 2.5;
        ctx.stroke();
        // listras de alerta
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(f0[0], f0[1]); ctx.lineTo(f1[0], f1[1]);
        ctx.lineTo(b1[0], b1[1]); ctx.lineTo(b0[0], b0[1]); ctx.closePath();
        ctx.clip();
        ctx.strokeStyle = hsl(obs.hue, 100, 70, 0.5);
        ctx.lineWidth = 3;
        const mid = project((a0 + a1) / 2, obs.t);
        for (let s = -3; s <= 3; s++) {
          ctx.beginPath();
          ctx.moveTo(mid[0] - 40 + s * 14, mid[1] - 40);
          ctx.lineTo(mid[0] + 40 + s * 14, mid[1] + 40);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        // parede SEGURA: brilho verde convidativo
        const f0 = project(a0, tFront), f1 = project(a1, tFront);
        ctx.beginPath();
        ctx.moveTo(f0[0], f0[1]); ctx.lineTo(f1[0], f1[1]);
        ctx.strokeStyle = hsl(140, 100, 55, 0.35 + near * 0.5);
        ctx.lineWidth = 2 + near * 4;
        ctx.shadowColor = hsl(140, 100, 55); ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
  }
}

function drawPlayer() {
  const [fx, fy] = playerFeet();
  const rot = playerRotation();
  const t = frame;

  // rastro
  trail.push({ x: fx, y: fy, life: 1 });
  if (trail.length > 14) trail.shift();
  for (let i = 0; i < trail.length; i++) {
    const tr = trail[i];
    const a = (i / trail.length) * 0.4;
    ctx.fillStyle = themeColor(60, a);
    ctx.beginPath(); ctx.arc(tr.x, tr.y, 9 * (i / trail.length), 0, 7); ctx.fill();
  }

  // glow
  const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, 46);
  glow.addColorStop(0, themeColor(65, 0.55 + beatPulse * 0.3));
  glow.addColorStop(1, themeColor(65, 0));
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(fx, fy, 46, 0, 7); ctx.fill();

  ctx.save();
  ctx.translate(fx, fy);
  ctx.rotate(rot);
  // a partir daqui: y=0 é o "chão" (a parede), o corpo sobe em -y

  const run = state === 'playing';
  const cycle = run ? Math.sin(t * 0.45) : 0;
  const cycle2 = run ? Math.sin(t * 0.45 + Math.PI) : 0;
  const bob = run ? Math.abs(Math.sin(t * 0.45)) * 2 : 0;
  const col = themeColor(62);
  const colDark = themeColor(45);

  ctx.lineCap = 'round';
  ctx.shadowColor = col; ctx.shadowBlur = 10;

  // pernas (correndo)
  ctx.strokeStyle = colDark; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(cycle * 7, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(cycle2 * 7, 0); ctx.stroke();

  // tronco
  ctx.strokeStyle = col; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(0, -10 - bob); ctx.lineTo(0, -30 - bob); ctx.stroke();

  // braços
  ctx.strokeStyle = colDark; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, -26 - bob); ctx.lineTo(cycle2 * 8, -16 - bob); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -26 - bob); ctx.lineTo(cycle * 8, -16 - bob); ctx.stroke();

  // cabeça
  ctx.fillStyle = '#fff';
  ctx.shadowBlur = 16; ctx.shadowColor = col;
  ctx.beginPath(); ctx.arc(0, -38 - bob, 7, 0, 7); ctx.fill();

  ctx.restore();
  ctx.shadowBlur = 0;
}

function drawSpeedLines() {
  if (speed < 6) return;
  ctx.strokeStyle = themeColor(80, Math.min((speed - 6) / 10, 0.5));
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (frame * 0.1 + i * 0.785) % (Math.PI * 2);
    const n0 = project(a, 0.05), n1 = project(a, 0.3);
    ctx.beginPath(); ctx.moveTo(n0[0], n0[1]); ctx.lineTo(n1[0], n1[1]); ctx.stroke();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ══════════════════════════════════════════════════════════════════════
//  LÓGICA
// ══════════════════════════════════════════════════════════════════════
function rotate(dir) {
  if (state !== 'playing') return;
  // mantém troca responsiva mesmo durante animação
  targetWall = (targetWall + dir + 4) % 4;
  curWall = targetWall;
  // ângulo alvo na direção mais curta
  let ta = WALL_ANGLE[targetWall];
  while (ta - targetAngle > Math.PI) ta -= Math.PI * 2;
  while (ta - targetAngle < -Math.PI) ta += Math.PI * 2;
  targetAngle = ta;
  // feedback
  burst(...playerFeet(), themeColor(70), 6, 2, 0.6);
}

let spawnTimer = 0;
function update() {
  frame++;
  distance += speed;
  if (comboTimer > 0) comboTimer--;
  shake *= 0.86;

  // suaviza rotação
  angle += (targetAngle - angle) * 0.28;
  rotProgress = 1 - Math.min(Math.abs(targetAngle - angle) / (Math.PI / 2), 1);

  // batida visual sincronizada
  const spb = (60 / bpm) * 60 / 4;             // frames por 1/16
  const curStep = Math.floor(distance / 8) % 4; // aproximação visual
  beatPulse *= 0.88;
  const beatNow = Math.floor(frame / (spb * 4));
  if (beatNow !== lastBeatStep) { lastBeatStep = beatNow; beatPulse = 1; }

  // progressão de fase / dificuldade
  if (endless) {
    levelTimer++;
    speed = 5 + distance * 0.00018;
    speed = Math.min(speed, 16);
    bpm = Math.min(200, 120 + Math.floor(distance / 1500) * 8);
    musicEnergy = Math.min(1, 0.15 + distance / 6000);
    hue = (190 + distance * 0.02) % 360;
  } else {
    const lv = LEVELS[Math.min(levelIdx, LEVELS.length - 1)];
    bpm = lv.bpm; musicEnergy = lv.energy;
    hue += ((lv.hue - hue + 540) % 360 - 180) * 0.05;
    speed += (5.5 + levelIdx * 1.4 - speed) * 0.02;
    levelTimer++;
    if (levelTimer > lv.dur * 60) {
      levelTimer = 0; levelIdx++;
      if (levelIdx >= LEVELS.length) { victory(); return; }
      levelUp();
    }
  }

  // spawn de obstáculos ritmado
  const interval = Math.max(34, 78 - speed * 2.6);
  spawnTimer++;
  if (spawnTimer >= interval) { spawnTimer = 0; spawnObstacle(); }

  // move obstáculos em direção à câmera
  for (const obs of obstacles) obs.t -= speed * 0.0011;

  // colisão / pontuação
  for (const obs of obstacles) {
    if (!obs.scored && obs.t <= T_PLAYER) {
      obs.scored = true;
      const w = rotProgress > 0.5 ? curWall : curWall; // parede atual já é alvo
      if (obs.blocked[w]) { die(); return; }
      // passou!
      combo++; comboTimer = 150;
      if (combo > bestCombo) bestCombo = combo;
      const gain = 10 + combo * 2;
      score += gain;
      const [fx, fy] = playerFeet();
      burst(fx, fy, themeColor(70), 10, 3, 1);
      if (combo >= 3) showCombo();
      beatPulse = 1;
    }
  }
  obstacles = obstacles.filter(o => o.t > -0.1);

  if (comboTimer === 0 && combo > 0) { combo = 0; hideCombo(); }

  // pontos por distância
  score += Math.floor(speed * 0.15);

  // HUD
  displayScore += (score - displayScore) * 0.2;
  scoreEl.textContent = Math.round(displayScore);
  levelEl.textContent = endless ? 'INFINITO' : LEVELS[Math.min(levelIdx, LEVELS.length - 1)].name;
  bpmEl.textContent = Math.round(bpm) + ' BPM';
}

function showCombo() {
  comboEl.textContent = combo + 'x';
  comboEl.style.opacity = '1';
  comboEl.style.transform = 'scale(1.1)';
  comboEl.style.color = hsl((hue + combo * 12) % 360, 100, 65);
  comboEl.style.textShadow = '0 0 20px ' + hsl((hue + combo * 12) % 360, 100, 65);
}
function hideCombo() { comboEl.style.opacity = '0'; comboEl.style.transform = 'scale(.6)'; }

function levelUp() {
  shake = 14;
  const lv = LEVELS[Math.min(levelIdx, LEVELS.length - 1)];
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2;
    burst(CX + Math.cos(a) * 100, CY + Math.sin(a) * 100, hsl(lv.hue, 100, 60), 10, 4, 1.4);
  }
  comboEl.textContent = lv.name + '!';
  comboEl.style.color = hsl(lv.hue, 100, 65);
  comboEl.style.textShadow = '0 0 24px ' + hsl(lv.hue, 100, 65);
  comboEl.style.opacity = '1'; comboEl.style.transform = 'scale(1.2)';
  setTimeout(() => { if (combo === 0) hideCombo(); }, 1200);
  flash(0.3);
}

function flash(amt) {
  flashEl.style.opacity = amt;
  setTimeout(() => flashEl.style.opacity = 0, 60);
}

function die() {
  state = 'dying';
  shake = 26;
  flash(0.7);
  const [fx, fy] = playerFeet();
  burst(fx, fy, '#ff3355', 50, 6, 1.6);
  burst(fx, fy, '#fff', 20, 5, 1.2);
  stopMusic();
  // som de impacto
  if (audio) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sawtooth'; o.connect(g); g.connect(master);
    o.frequency.setValueAtTime(200, audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, audio.currentTime + 0.5);
    g.gain.setValueAtTime(0.6, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.6);
    o.start(); o.stop(audio.currentTime + 0.6);
  }
  setTimeout(showGameover, 900);
}

function victory() {
  state = 'dying';
  stopMusic();
  for (let k = 0; k < 8; k++) setTimeout(() => {
    const a = Math.random() * Math.PI * 2;
    burst(CX + Math.cos(a) * 80, CY + Math.sin(a) * 80,
      hsl(Math.random() * 360, 100, 65), 16, 6, 1.6);
  }, k * 120);
  setTimeout(() => showGameover(true), 1400);
}

function showGameover(won) {
  state = 'dead';
  const isRecord = score > best;
  if (isRecord) { best = score; localStorage.setItem('gb_best', best); }
  goTitle.textContent = won ? 'VOCÊ VENCEU!' : 'GAME OVER';
  goTitle.style.color = won ? '#00eaff' : '#ff3a5e';
  goTitle.style.textShadow = '0 0 24px ' + (won ? '#00eaff' : '#ff3a5e');
  goScore.textContent = score;
  goBest.textContent = 'Recorde: ' + best;
  goPhase.textContent = (endless
    ? `Distância ${Math.round(distance / 10)}m · Combo máx ${bestCombo}x`
    : `${LEVELS[Math.min(levelIdx, LEVELS.length - 1)].name} · Combo máx ${bestCombo}x`);
  newRecEl.classList.toggle('hidden', !isRecord);
  goEl.classList.remove('hidden');
}

// ══════════════════════════════════════════════════════════════════════
//  RENDER LOOP
// ══════════════════════════════════════════════════════════════════════
function render() {
  ctx.save();
  if (shake > 0.5) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
  drawBackground();
  drawTunnel();
  drawSpeedLines();
  drawObstacles();
  if (state !== 'dead') drawPlayer();
  drawParticles();
  ctx.restore();

  // borda pulsando na batida
  if (beatPulse > 0.05) {
    ctx.strokeStyle = themeColor(60, beatPulse * 0.6);
    ctx.lineWidth = 6 * beatPulse;
    ctx.strokeRect(3, 3, W - 6, H - 6);
  }
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
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) { rotate(-1); flashZone(tzLeft); }
  if (['ArrowRight', 'd', 'D'].includes(e.key)) { rotate(1); flashZone(tzRight); }
  if (['ArrowUp', 'w', 'W'].includes(e.key)) { rotate(-1); flashZone(tzLeft); }
  if (['ArrowDown', 's', 'S'].includes(e.key)) { rotate(1); flashZone(tzRight); }
});

function handlePointer(clientX) {
  const rect = canvas.getBoundingClientRect();
  const rel = (clientX - rect.left) / rect.width;
  if (rel < 0.5) { rotate(-1); flashZone(tzLeft); }
  else { rotate(1); flashZone(tzRight); }
}
canvas.addEventListener('mousedown', e => handlePointer(e.clientX));
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  for (const t of e.changedTouches) handlePointer(t.clientX);
}, { passive: false });

function flashZone(el) {
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 120);
}

// ══════════════════════════════════════════════════════════════════════
//  FLUXO DE TELAS
// ══════════════════════════════════════════════════════════════════════
function resetState(isEndless) {
  endless = isEndless;
  score = 0; displayScore = 0; frame = 0; distance = 0;
  speed = endless ? 5 : 5.5;
  angle = targetAngle = WALL_ANGLE[0];
  curWall = targetWall = 0; rotProgress = 1;
  obstacles = []; particles = []; trail = []; speedLines = [];
  shake = 0; combo = 0; comboTimer = 0; bestCombo = 0;
  levelIdx = 0; levelTimer = 0; spawnTimer = 0;
  bpm = endless ? 120 : LEVELS[0].bpm;
  musicEnergy = endless ? 0.15 : LEVELS[0].energy;
  hue = endless ? 190 : LEVELS[0].hue;
  hideCombo();
}

function startGame(isEndless) {
  initAudio();
  if (audio.state === 'suspended') audio.resume();
  resetState(isEndless);
  menuEl.classList.add('hidden');
  goEl.classList.add('hidden');
  document.getElementById('touch-zones').style.display = 'block';
  // contagem regressiva
  state = 'countdown';
  let n = 3;
  const show = () => {
    if (n > 0) {
      countdownEl.textContent = n;
      countdownEl.style.transition = 'none';
      countdownEl.style.opacity = '1';
      countdownEl.style.transform = 'scale(1.4)';
      requestAnimationFrame(() => {
        countdownEl.style.transition = 'opacity .6s, transform .6s';
        countdownEl.style.opacity = '0';
        countdownEl.style.transform = 'scale(.6)';
      });
      n--; setTimeout(show, 600);
    } else {
      countdownEl.textContent = 'JÁ!';
      countdownEl.style.opacity = '1';
      setTimeout(() => countdownEl.style.opacity = '0', 350);
      state = 'playing';
      startMusic();
    }
  };
  // desenha o cenário durante a contagem
  render();
  show();
}

document.getElementById('btn-play').onclick = () => startGame(false);
document.getElementById('btn-endless').onclick = () => startGame(true);
document.getElementById('btn-retry').onclick = () => startGame(endless);
document.getElementById('btn-menu').onclick = () => {
  goEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
  state = 'menu';
};

// mostra recorde no menu
goBest.textContent = 'Recorde: ' + best;
loop();
