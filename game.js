// GRAVITY BEAT - Tunnel Runner
// Wall indices: 0=bottom, 1=right, 2=top, 3=left

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = 480, H = 720;

// UI elements
const scoreEl = document.getElementById('score-display');
const levelEl = document.getElementById('level-display');
const bpmEl   = document.getElementById('bpm-display');
const overlay  = document.getElementById('overlay');
const gameoverEl = document.getElementById('gameover');
const goScore  = document.getElementById('go-score-val');
const goBest   = document.getElementById('go-best-val');
const goPhase  = document.getElementById('go-phase-val');
const beatFlash = document.getElementById('beat-flash');
const comboEl  = document.getElementById('combo-display');

// ─── AUDIO ENGINE ────────────────────────────────────────────────────────────
let audioCtx = null;
let bpm = 120;
let beatInterval = null;
let beatCount = 0;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function masterGain() {
  if (!audioCtx._masterGain) {
    const g = audioCtx.createGain();
    g.gain.value = 0.7;
    g.connect(audioCtx.destination);
    audioCtx._masterGain = g;
  }
  return audioCtx._masterGain;
}

function playKick(time) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(masterGain());
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(30, time + 0.15);
  gain.gain.setValueAtTime(1.0, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
  osc.start(time); osc.stop(time + 0.25);
}

function playSnare(time) {
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.15, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'highpass'; filter.frequency.value = 1000;
  src.connect(filter); filter.connect(gain); gain.connect(masterGain());
  gain.gain.setValueAtTime(0.6, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
  src.start(time); src.stop(time + 0.15);
}

function playHihat(time, accent) {
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.05, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'highpass'; filter.frequency.value = 6000;
  src.connect(filter); filter.connect(gain); gain.connect(masterGain());
  gain.gain.setValueAtTime(accent ? 0.4 : 0.2, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  src.start(time); src.stop(time + 0.05);
}

function playBass(time, freq) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 400;
  osc.connect(filter); filter.connect(gain); gain.connect(masterGain());
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.5, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
  osc.start(time); osc.stop(time + 0.2);
}

function playSynth(time, freq, dur) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass'; filter.frequency.value = freq * 2; filter.Q.value = 4;
  osc.connect(filter); filter.connect(gain); gain.connect(masterGain());
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.15, time);
  gain.gain.setValueAtTime(0.1, time + dur * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
  osc.start(time); osc.stop(time + dur);
}

const bassNotes = [55, 55, 73.4, 55, 61.7, 55, 65.4, 82.4];
const synthMelody = [220, 261.6, 329.6, 392, 440, 392, 329.6, 261.6];

function scheduleBeat(beatNum, beatTime, secPerBeat) {
  const sub = beatNum % 16;
  const q = beatNum % 4;

  // Kick on 0, 2 (quarter = 0, 8)
  if (sub === 0 || sub === 8) playKick(beatTime);
  // Snare on beat 2 and 4 (sub 4, 12)
  if (sub === 4 || sub === 12) playSnare(beatTime);
  // Hihat every 8th note
  playHihat(beatTime, sub % 2 === 0);

  // Bass
  if (sub % 2 === 0) playBass(beatTime, bassNotes[Math.floor(sub / 2)] || 55);

  // Synth lead (every bar)
  if (sub % 2 === 0 && bpm >= 140) {
    playSynth(beatTime, synthMelody[Math.floor(sub / 2)], secPerBeat * 1.8);
  }
}

function startBeat() {
  if (!audioCtx) return;
  const secPerBeat = 60 / bpm / 2; // 8th notes
  let nextBeatTime = audioCtx.currentTime + 0.1;
  beatCount = 0;

  function schedule() {
    while (nextBeatTime < audioCtx.currentTime + 0.3) {
      scheduleBeat(beatCount, nextBeatTime, secPerBeat);
      nextBeatTime += secPerBeat;
      beatCount++;
    }
  }

  if (beatInterval) clearInterval(beatInterval);
  beatInterval = setInterval(schedule, 100);
  schedule();
}

function stopBeat() {
  if (beatInterval) clearInterval(beatInterval);
  beatInterval = null;
}

// ─── GAME STATE ──────────────────────────────────────────────────────────────
let state = 'menu'; // menu | playing | dead
let endlessMode = false;
let score = 0;
let bestScore = 0;
let frame = 0;
let speed = 4;       // obstacle approach speed
let playerWall = 0;  // 0=bottom 1=right 2=top 3=left
let targetWall = 0;
let wallT = 1;       // transition 0->1
let obstacles = [];
let particles = [];
let shakeAmt = 0;
let combo = 0;
let comboTimer = 0;
let lastBeatFrame = 0;
let beatFlashTimer = 0;

// Levels (campaign)
const LEVELS = [
  { bpm: 120, duration: 30, label: 'FASE 1', color: '#0ff' },
  { bpm: 135, duration: 28, label: 'FASE 2', color: '#0f8' },
  { bpm: 150, duration: 26, label: 'FASE 3', color: '#ff0' },
  { bpm: 165, duration: 24, label: 'FASE 4', color: '#f80' },
  { bpm: 180, duration: 22, label: 'FASE 5', color: '#f0f' },
  { bpm: 200, duration: 20, label: 'BOSS',   color: '#f00' },
];
let currentLevel = 0;
let levelTimer = 0;

// ─── TUNNEL GEOMETRY ─────────────────────────────────────────────────────────
const CX = W / 2, CY = H / 2;
const NEAR_W = 400, NEAR_H = 600; // near frame size
const FAR_W = 80, FAR_H = 120;    // far frame size

function tunnelPoint(wx, wy, z) {
  // z: 0=far center, 1=near edge
  const nw = FAR_W + (NEAR_W - FAR_W) * z;
  const nh = FAR_H + (NEAR_H - FAR_H) * z;
  return {
    x: CX + wx * nw / 2,
    y: CY + wy * nh / 2
  };
}

// Wall corners in normalized coords (wx, wy range -1 to 1)
// Wall 0 = bottom: y=1, x from -1 to 1
// Wall 1 = right:  x=1, y from 1 to -1
// Wall 2 = top:    y=-1, x from 1 to -1
// Wall 3 = left:   x=-1, y from -1 to 1
function wallCorners(wall) {
  switch (wall) {
    case 0: return [[-1,1],[1,1]];
    case 1: return [[1,1],[1,-1]];
    case 2: return [[1,-1],[-1,-1]];
    case 3: return [[-1,-1],[-1,1]];
  }
}

function wallCenter(wall) {
  switch (wall) {
    case 0: return [0, 1];
    case 1: return [1, 0];
    case 2: return [0, -1];
    case 3: return [-1, 0];
  }
}

// ─── DRAWING ─────────────────────────────────────────────────────────────────
const WALL_COLORS = ['#0ff', '#0f8', '#f0f', '#ff0'];

function getLevelColor() {
  if (endlessMode) {
    const hue = (frame * 0.5) % 360;
    return `hsl(${hue},100%,60%)`;
  }
  return LEVELS[Math.min(currentLevel, LEVELS.length-1)].color;
}

function drawTunnel() {
  const col = getLevelColor();

  // Draw 4 walls as trapezoids
  for (let w = 0; w < 4; w++) {
    const c = wallCorners(w);
    const nf = tunnelPoint(c[0][0], c[0][1], 1);
    const nf2 = tunnelPoint(c[1][0], c[1][1], 1);
    const fr = tunnelPoint(c[0][0], c[0][1], 0);
    const fr2 = tunnelPoint(c[1][0], c[1][1], 0);

    const isActive = (w === playerWall);
    ctx.beginPath();
    ctx.moveTo(nf.x, nf.y);
    ctx.lineTo(nf2.x, nf2.y);
    ctx.lineTo(fr2.x, fr2.y);
    ctx.lineTo(fr.x, fr.y);
    ctx.closePath();

    // Wall fill
    const alpha = isActive ? 0.18 : 0.07;
    ctx.fillStyle = isActive ? col + '30' : '#ffffff10';
    ctx.fill();

    // Wall edge lines
    ctx.strokeStyle = isActive ? col : '#ffffff33';
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.stroke();
  }

  // Grid lines on tunnel walls
  for (let seg = 1; seg < 6; seg++) {
    const z = seg / 6;
    const pts = [];
    for (let w = 0; w < 4; w++) {
      const c = wallCorners(w);
      pts.push(tunnelPoint(c[0][0], c[0][1], z));
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.strokeStyle = `rgba(255,255,255,${0.06 + 0.02 * (1 - z)})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // Near frame
  const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
  ctx.beginPath();
  const first = tunnelPoint(corners[0][0], corners[0][1], 1);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < 4; i++) {
    const p = tunnelPoint(corners[i][0], corners[i][1], 1);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawPlayer() {
  const col = getLevelColor();

  // Interpolate position between walls
  const fromCenter = wallCenter(playerWall);
  const toCenter = wallCenter(targetWall);
  const t = easeInOut(wallT);
  const wx = fromCenter[0] + (toCenter[0] - fromCenter[0]) * t;
  const wy = fromCenter[1] + (toCenter[1] - fromCenter[1]) * t;

  // Player at ~z=0.85 (near the camera)
  const pos = tunnelPoint(wx * 0.75, wy * 0.75, 0.82);

  // Glow
  const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 30);
  grad.addColorStop(0, col + 'aa');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 30, 0, Math.PI * 2);
  ctx.fill();

  // Player body
  ctx.save();
  ctx.translate(pos.x, pos.y);
  // Rotate to face wall normal
  const angle = targetWall * Math.PI / 2;
  ctx.rotate(angle);

  // Body
  ctx.fillStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 15;
  ctx.fillRect(-10, -14, 20, 28);

  // "Head"
  ctx.fillStyle = '#fff';
  ctx.shadowBlur = 0;
  ctx.fillRect(-6, -20, 12, 10);

  // Running legs animation
  const legSwing = Math.sin(frame * 0.3) * 8;
  ctx.fillStyle = col;
  ctx.shadowBlur = 8;
  ctx.shadowColor = col;
  ctx.fillRect(-8, 14, 6, 10 + legSwing);
  ctx.fillRect(2, 14, 6, 10 - legSwing);

  ctx.restore();
}

function drawObstacles() {
  for (const obs of obstacles) {
    const col = obs.color;
    const z = obs.z;

    // Draw blocked walls
    for (let w = 0; w < 4; w++) {
      if (!obs.blocked[w]) continue;

      const c = wallCorners(w);
      const zNear = Math.min(z + 0.12, 1);
      const zFar = Math.max(z - 0.12, 0);

      const p1 = tunnelPoint(c[0][0], c[0][1], zNear);
      const p2 = tunnelPoint(c[1][0], c[1][1], zNear);
      const p3 = tunnelPoint(c[1][0], c[1][1], zFar);
      const p4 = tunnelPoint(c[0][0], c[0][1], zFar);

      // Fill
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fillStyle = col + 'cc';
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Warning flash when close
      if (z > 0.75) {
        const flash = Math.sin(frame * 0.4) > 0 ? 0.4 : 0;
        ctx.fillStyle = `rgba(255,255,255,${flash})`;
        ctx.fill();
      }
    }

    // Center ring at obstacle z
    const ring = [[-1,-1],[1,-1],[1,1],[-1,1]];
    ctx.beginPath();
    const rp = tunnelPoint(ring[0][0], ring[0][1], z);
    ctx.moveTo(rp.x, rp.y);
    for (let i = 1; i < 4; i++) {
      const p = tunnelPoint(ring[i][0], ring[i][1], z);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.strokeStyle = col + '80';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.color + Math.floor(p.life * 255).toString(16).padStart(2,'0');
    ctx.fill();
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.1;
    p.life -= 0.025;
    p.r *= 0.97;
  }
  particles = particles.filter(p => p.life > 0);
}

function drawBackground() {
  // Deep space background
  ctx.fillStyle = '#000008';
  ctx.fillRect(0, 0, W, H);

  // Starfield
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 40; i++) {
    const x = ((i * 137 + frame * 0.2) % W + W) % W;
    const y = ((i * 211 + frame * 0.1 * (i % 3 + 1)) % H + H) % H;
    const r = i % 5 === 0 ? 1.5 : 0.7;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Vignette
  const vg = ctx.createRadialGradient(CX, CY, H * 0.2, CX, CY, H * 0.75);
  vg.addColorStop(0, 'transparent');
  vg.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function drawBeatPulse() {
  const col = getLevelColor();
  const age = frame - lastBeatFrame;
  if (age < 8) {
    const t = 1 - age / 8;
    ctx.strokeStyle = col;
    ctx.lineWidth = 4 * t;
    ctx.globalAlpha = t * 0.5;
    ctx.strokeRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

// ─── OBSTACLE SPAWNING ───────────────────────────────────────────────────────
let spawnTimer = 0;
let spawnInterval = 90; // frames between obstacles

function spawnObstacle() {
  // Pick which walls to block (leave at least 1 open)
  const openWall = Math.floor(Math.random() * 4);
  const blocked = [true, true, true, true];
  blocked[openWall] = false;

  // Sometimes only block 2-3 walls for variety
  const style = Math.random();
  if (style < 0.3) {
    // Only 1 wall blocked
    const b = [false, false, false, false];
    b[Math.floor(Math.random() * 4)] = true;
    obstacles.push({ z: 0, blocked: b, color: randomObsColor() });
  } else if (style < 0.6) {
    // 2 adjacent walls blocked
    const start = Math.floor(Math.random() * 4);
    const b = [false, false, false, false];
    b[start] = true;
    b[(start + 1) % 4] = true;
    obstacles.push({ z: 0, blocked: b, color: randomObsColor() });
  } else {
    // 3 walls blocked, must switch
    obstacles.push({ z: 0, blocked: blocked, color: randomObsColor() });
  }
}

function randomObsColor() {
  const cols = ['#ff3030', '#ff8800', '#ff00ff', '#ffff00', '#ff0088'];
  return cols[Math.floor(Math.random() * cols.length)];
}

// ─── GAME LOGIC ──────────────────────────────────────────────────────────────
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function spawnDeathParticles(wall) {
  const [wx, wy] = wallCenter(wall);
  const pos = tunnelPoint(wx * 0.75, wy * 0.75, 0.82);
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = 2 + Math.random() * 5;
    particles.push({
      x: pos.x, y: pos.y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      r: 3 + Math.random() * 5,
      color: '#ff3030',
      life: 1
    });
  }
}

function spawnPassParticles() {
  const col = getLevelColor();
  const pos = tunnelPoint(0, 0, 0.5);
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    particles.push({
      x: pos.x + (Math.random() - 0.5) * 80,
      y: pos.y + (Math.random() - 0.5) * 120,
      vx: (Math.random() - 0.5) * 3,
      vy: -1 - Math.random() * 2,
      r: 2 + Math.random() * 3,
      color: col,
      life: 0.8
    });
  }
}

function updateGame() {
  frame++;
  spawnTimer++;
  levelTimer++;
  if (comboTimer > 0) comboTimer--;

  // Advance wall transition
  if (wallT < 1) {
    wallT = Math.min(1, wallT + 0.12);
    if (wallT >= 1) playerWall = targetWall;
  }

  // Camera shake decay
  shakeAmt *= 0.85;

  // Beat pulse (sync to bpm)
  const framesPerBeat = (60 / bpm) * 60;
  if (frame % Math.round(framesPerBeat) === 0) {
    lastBeatFrame = frame;
    beatFlashTimer = 8;
    // Flash the overlay element
    beatFlash.style.opacity = '0.15';
    setTimeout(() => beatFlash.style.opacity = '0', 80);
  }

  // Score
  score += Math.floor(speed / 2);

  // Speed ramp
  if (endlessMode) {
    speed = 4 + frame * 0.003;
    bpm = Math.min(220, 120 + Math.floor(frame / 600) * 10);
  } else {
    const lv = LEVELS[Math.min(currentLevel, LEVELS.length - 1)];
    bpm = lv.bpm;
    const targetSpeed = 4 + currentLevel * 1.2;
    speed += (targetSpeed - speed) * 0.01;

    // Level progression
    if (levelTimer > lv.duration * 60) {
      levelTimer = 0;
      currentLevel++;
      if (currentLevel >= LEVELS.length) {
        // Victory!
        triggerVictory();
        return;
      }
      flashLevelUp();
    }
  }

  // Spawn obstacles
  spawnInterval = Math.max(45, 90 - Math.floor(speed * 4));
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    spawnObstacle();
  }

  // Move obstacles
  for (const obs of obstacles) {
    obs.z += speed * 0.008;
  }

  // Check collisions
  for (const obs of obstacles) {
    if (obs.z > 0.88 && !obs.passed) {
      obs.passed = true;
      const currentEffectiveWall = wallT > 0.5 ? targetWall : playerWall;
      if (obs.blocked[currentEffectiveWall]) {
        // HIT
        triggerDeath();
        return;
      } else {
        // Passed!
        spawnPassParticles();
        score += 10 * (combo + 1);
        combo++;
        comboTimer = 120;
        if (combo >= 5) showCombo();
      }
    }
  }

  // Remove passed obstacles
  obstacles = obstacles.filter(o => o.z < 1.1);

  // Update UI
  scoreEl.textContent = score;
  levelEl.textContent = endlessMode
    ? `INFINITO`
    : LEVELS[Math.min(currentLevel, LEVELS.length-1)].label;
  bpmEl.textContent = `BPM ${Math.round(bpm)}`;

  // Clear combo if timed out
  if (comboTimer === 0 && combo > 0) {
    combo = 0;
    comboEl.style.opacity = '0';
  }
}

function showCombo() {
  comboEl.textContent = `${combo}x COMBO!`;
  comboEl.style.opacity = '1';
}

let levelUpFlash = 0;
function flashLevelUp() {
  levelUpFlash = 60;
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 4,
      vy: -2 - Math.random() * 3,
      r: 3 + Math.random() * 4,
      color: LEVELS[Math.min(currentLevel, LEVELS.length-1)].color,
      life: 1
    });
  }
}

function triggerDeath() {
  spawnDeathParticles(playerWall);
  shakeAmt = 20;
  stopBeat();

  // Delay gameover screen
  state = 'dead';
  setTimeout(showGameover, 800);
}

function triggerVictory() {
  stopBeat();
  state = 'dead';
  for (let i = 0; i < 100; i++) {
    particles.push({
      x: Math.random() * W,
      y: Math.random() * H * 0.5,
      vx: (Math.random() - 0.5) * 6,
      vy: -3 - Math.random() * 4,
      r: 4 + Math.random() * 6,
      color: ['#0ff','#f0f','#ff0','#0f8'][Math.floor(Math.random()*4)],
      life: 1
    });
  }
  setTimeout(() => {
    goScore.textContent = `${score} PTS`;
    goBest.textContent = `RECORDE: ${bestScore}`;
    goPhase.textContent = '🏆 VOCÊ VENCEU TODAS AS FASES!';
    gameoverEl.querySelector('h2').textContent = 'VITÓRIA!';
    gameoverEl.querySelector('h2').style.color = '#0ff';
    gameoverEl.querySelector('h2').style.textShadow = '0 0 20px #0ff';
    gameoverEl.classList.remove('hidden');
  }, 1500);
}

function showGameover() {
  if (score > bestScore) bestScore = score;
  goScore.textContent = `${score} PTS`;
  goBest.textContent = `RECORDE: ${bestScore}`;
  const lv = LEVELS[Math.min(currentLevel, LEVELS.length-1)];
  goPhase.textContent = endlessMode
    ? `Modo Infinito · Velocidade ${speed.toFixed(1)}x`
    : `Parou na ${lv.label}`;
  gameoverEl.querySelector('h2').textContent = 'GAME OVER';
  gameoverEl.querySelector('h2').style.color = '#f33';
  gameoverEl.querySelector('h2').style.textShadow = '0 0 20px #f33';
  gameoverEl.classList.remove('hidden');
}

// ─── RENDER LOOP ─────────────────────────────────────────────────────────────
function render() {
  ctx.save();
  if (shakeAmt > 0.5) {
    ctx.translate(
      (Math.random() - 0.5) * shakeAmt,
      (Math.random() - 0.5) * shakeAmt
    );
  }

  drawBackground();
  drawTunnel();
  drawObstacles();
  drawPlayer();
  drawParticles();
  drawBeatPulse();

  ctx.restore();
}

function loop() {
  if (state === 'playing' || state === 'dead') {
    if (state === 'playing') updateGame();
    render();
  }
  requestAnimationFrame(loop);
}

// ─── INPUT HANDLING ──────────────────────────────────────────────────────────
function rotateWall(dir) {
  if (state !== 'playing') return;
  if (wallT < 1) return; // still transitioning
  targetWall = ((playerWall + dir + 4) % 4);
  wallT = 0;
}

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') rotateWall(-1);
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') rotateWall(1);
  if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') rotateWall(-1);
  if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') rotateWall(1);
});

let touchStartX = 0;
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  touchStartX = e.touches[0].clientX;
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) < 10) {
    // Tap: left half = go left, right half = go right
    const x = e.changedTouches[0].clientX;
    const rect = canvas.getBoundingClientRect();
    const relX = x - rect.left;
    rotateWall(relX < rect.width / 2 ? -1 : 1);
  } else {
    rotateWall(dx < 0 ? -1 : 1);
  }
}, { passive: false });

canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const relX = e.clientX - rect.left;
  rotateWall(relX < rect.width / 2 ? -1 : 1);
});

// ─── GAME INIT ───────────────────────────────────────────────────────────────
function startGame(endless) {
  initAudio();
  endlessMode = endless;
  state = 'playing';
  score = 0;
  frame = 0;
  speed = 4;
  playerWall = 0;
  targetWall = 0;
  wallT = 1;
  obstacles = [];
  particles = [];
  shakeAmt = 0;
  combo = 0;
  comboTimer = 0;
  currentLevel = 0;
  levelTimer = 0;
  bpm = endless ? 120 : LEVELS[0].bpm;
  spawnTimer = 0;

  overlay.classList.add('hidden');
  gameoverEl.classList.add('hidden');
  comboEl.style.opacity = '0';

  startBeat();
}

document.getElementById('btn-play').addEventListener('click', () => startGame(false));
document.getElementById('btn-endless').addEventListener('click', () => startGame(true));
document.getElementById('btn-retry').addEventListener('click', () => {
  gameoverEl.classList.add('hidden');
  startGame(endlessMode);
});
document.getElementById('btn-menu').addEventListener('click', () => {
  gameoverEl.classList.add('hidden');
  stopBeat();
  state = 'menu';
  overlay.classList.remove('hidden');
});

// Start the render loop
loop();
