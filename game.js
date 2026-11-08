(() => {  
  'use strict';  
  
  const W = 450;  
  const H = 800;  
  const FIELD_TOP = 560;  
  const FIELD_BOTTOM = 800;  
  const PIVOT = { x: W / 2, y: 778 };  
  const MAX_RICE = 10;  
  const WAVE_DURATION = 16;  
  const BASE_SPAWN = 2.5;  
  const MIN_SPAWN = 0.85;  
  const COMBO_WINDOW = 2.0;  
  const SPECIAL_COOLDOWN = 15;  
  const BEST_KEY = 'katto_best';  
  const PX = 50;  
  const TAU = Math.PI * 2;  
  const SPECIAL_RECT = { x: 320, y: 60, w: 114, h: 48 };  
  const PULL_TIME = 0.62;  
  const SCARE_RADIUS = 72;  
  const PULL_COST = 0.3;  
  const TENSION_REGEN = 0.2;  
  const TENSION_DELAY = 0.8;  
  const WARY_TIME = 2.4;  
  const PULL_DRAG = 24;  
  const GRAB_RADIUS = 54;  
  const TARGET_T_MIN = 0.34;  
  const TARGET_T_MAX = 0.94;  
  const ROPE_ANCHORS = [  
    { x: 18, y: 596 },  
    { x: 108, y: 578 },  
    { x: 225, y: 572 },  
    { x: 342, y: 578 },  
    { x: 432, y: 596 },  
  ];  
  const ROPE_CANS = [0.3, 0.44, 0.58, 0.82];  
  
  const canvas = document.getElementById('game');  
  const ctx = canvas.getContext('2d', { alpha: false });  
  let dpr = 1;  
  
  function setupCanvas() {  
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);  
    canvas.width = Math.round(W * dpr);  
    canvas.height = Math.round(H * dpr);  
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);  
    ctx.imageSmoothingEnabled = true;  
  }  
  setupCanvas();  
  
  const rand = (a, b) => a + Math.random() * (b - a);  
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);  
  const clamp01 = (v) => clamp(v, 0, 1);  
  const lerp = (a, b, t) => a + (b - a) * t;  
  
  function angDiff(a, b) {  
    let d = a - b;  
    while (d > Math.PI) d -= TAU;  
    while (d < -Math.PI) d += TAU;  
    return d;  
  }  
  
  const SFX = (() => {  
    let ac = null;  
    let master = null;  
    let noiseBuf = null;  
    let muted = false;  
  
    function init() {  
      if (ac) {  
        if (ac.state === 'suspended') ac.resume();  
        return;  
      }  
      const AC = window.AudioContext || window.webkitAudioContext;  
      if (!AC) return;  
      ac = new AC();  
      master = ac.createGain();  
      master.gain.value = muted ? 0 : 0.5;  
      master.connect(ac.destination);  
      const len = Math.floor(ac.sampleRate * 1.0);  
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);  
      const data = noiseBuf.getChannelData(0);  
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;  
    }  
  
    function tone(freq, dur, type, peak, slideTo, delay) {  
      if (!ac) return;  
      const t0 = ac.currentTime + (delay || 0);  
      const osc = ac.createOscillator();  
      const gain = ac.createGain();  
      osc.type = type || 'sine';  
      osc.frequency.setValueAtTime(freq, t0);  
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);  
      gain.gain.setValueAtTime(0.0001, t0);  
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + 0.012);  
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);  
      osc.connect(gain);  
      gain.connect(master);  
      osc.start(t0);  
      osc.stop(t0 + dur + 0.03);  
    }  
  
    function noise(dur, peak, filterType, f0, f1, delay) {  
      if (!ac || !noiseBuf) return;  
      const t0 = ac.currentTime + (delay || 0);  
      const src = ac.createBufferSource();  
      const filter = ac.createBiquadFilter();  
      const gain = ac.createGain();  
      src.buffer = noiseBuf;  
      filter.type = filterType || 'bandpass';  
      filter.frequency.setValueAtTime(f0, t0);  
      if (f1) filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);  
      filter.Q.value = 0.8;  
      gain.gain.setValueAtTime(0.0001, t0);  
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + 0.015);  
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);  
      src.connect(filter);  
      filter.connect(gain);  
      gain.connect(master);  
      src.start(t0);  
      src.stop(t0 + dur + 0.03);  
    }  
  
    function toggleMute() {  
      muted = !muted;  
      if (master) master.gain.value = muted ? 0 : 0.5;  
    }  
  
    return {  
      init,  
      toggleMute,  
      tok() {  
        tone(620, 0.16, 'sine', 0.16, 310);  
        tone(310, 0.16, 'triangle', 0.1);  
        noise(0.08, 0.1, 'highpass', 1400);  
      },  
      swing() {  
        noise(0.18, 0.11, 'bandpass', 900, 280);  
      },  
      rope() {  
        noise(0.24, 0.1, 'bandpass', 260, 980);  
      },  
      rattle() {  
        tone(1500, 0.06, 'square', 0.05, 900);  
        tone(2200, 0.05, 'triangle', 0.03, 1600, 0.03);  
        noise(0.14, 0.05, 'highpass', 2400, 1200);  
        tone(700, 0.12, 'sine', 0.04, 480, 0.05);  
      },  
      score() {  
        tone(880, 0.14, 'sine', 0.14, 1320);  
      },  
      combo() {  
        const notes = [660, 880, 1100, 1320];  
        notes.forEach((n, i) => tone(n, 0.12, 'triangle', 0.13, null, i * 0.06));  
      },  
      damage() {  
        tone(180, 0.35, 'sawtooth', 0.14, 80);  
        noise(0.22, 0.1, 'lowpass', 600, 180);  
      },  
      special() {  
        tone(200, 0.7, 'sine', 0.16, 1200);  
        tone(300, 0.7, 'triangle', 0.09, 1800);  
        noise(0.6, 0.07, 'bandpass', 500, 2200);  
      },  
      gameover() {  
        const notes = [440, 392, 330, 262];  
        notes.forEach((n, i) => tone(n, 0.3, 'triangle', 0.16, null, i * 0.18));  
      },  
    };  
  })();  
  
  const PALETTES = {  
    normal: { body: '#8c5c2e', belly: '#b98a55', wing: '#6b4521', beak: '#f2b340', eye: '#1a120a' },  
    fast: { body: '#c77833', belly: '#e0a05c', wing: '#99501f', beak: '#fad04d', eye: '#1a120a' },  
    tank: { body: '#5f3f28', belly: '#8a6444', wing: '#3f2917', beak: '#d99e38', eye: '#120c06' },  
    golden: { body: '#edc240', belly: '#ffe28a', wing: '#c99a29', beak: '#fff0a0', eye: '#241606' },  
    sly: { body: '#586b7a', belly: '#9aadb9', wing: '#394c59', beak: '#e8c04a', eye: '#0b1014' },  
    leader: { body: '#82342c', belly: '#bd5a45', wing: '#4f1c19', beak: '#f2b340', eye: '#f7e7c0' },  
  };  
  
  const KIND_STATS = {  
    normal: { hp: 1, points: 10, speed: 2.1, scale: 1.0 },  
    fast: { hp: 1, points: 15, speed: 3.6, scale: 0.82 },  
    tank: { hp: 2, points: 30, speed: 1.5, scale: 1.3 },  
    golden: { hp: 1, points: 50, speed: 2.4, scale: 0.9 },  
    sly: { hp: 1, points: 25, speed: 2.6, scale: 0.92 },  
    leader: { hp: 1, points: 40, speed: 2.0, scale: 1.1 },  
  };  
  
  const clouds = [  
    { x: 60, y: 120, s: 1.0, v: 7 },  
    { x: 260, y: 78, s: 0.72, v: 4.5 },  
    { x: 390, y: 180, s: 0.55, v: 10 },  
  ];  
  
  const hills = [  
    { x: 225, y: 556, rx: 215, ry: 54, color: '#6d9258' },  
    { x: 90, y: 566, rx: 230, ry: 64, color: '#557b46' },  
    { x: 360, y: 568, rx: 250, ry: 72, color: '#47693b' },  
  ];  
  
  const mountains = [
    { path: [[0, 560], [0, 300], [80, 180], [170, 310], [290, 140], [400, 320], [450, 250], [450, 560]], color: '#688c94' },
    { path: [[0, 560], [50, 350], [130, 240], [220, 360], [330, 200], [450, 360], [450, 560]], color: '#577c82' }
  ];

  const pines = [
    {x: 60, y: 550, s: 0.8}, {x: 95, y: 555, s: 1.1},
    {x: 370, y: 555, s: 0.9}, {x: 410, y: 540, s: 1.2}
  ];

  const bamboos = [
    {x: 5, y: 820, s: 0.8, lean: 0.15},
    {x: 445, y: 820, s: 0.9, lean: -0.15},
    {x: -10, y: 740, s: 1.1, lean: 0.25},
    {x: 460, y: 740, s: 1.1, lean: -0.2}
  ];
  
  const houses = [  
    { x: 104, y: 568, s: 0.9 },  
    { x: 352, y: 564, s: 0.68 },  
  ];  
  
  const fencePosts = [];  
  for (let i = 0; i < 13; i++) {  
    fencePosts.push({ x: 8 + i * ((W - 16) / 12), h: rand(14, 24), lean: rand(-0.08, 0.08) });  
  }  
  
  const stalks = [];  
  for (let i = 0; i < 58; i++) {  
    const y = rand(FIELD_TOP + 22, FIELD_BOTTOM + 8);  
    const depth = clamp01((y - FIELD_TOP) / (FIELD_BOTTOM - FIELD_TOP));  
    const scale = lerp(0.45, 1.05, depth);  
    const n = 3 + (Math.random() < 0.5 ? 1 : 0);  
    const stems = [];  
    for (let j = 0; j < n; j++) {  
      stems.push({  
        off: (j - (n - 1) / 2) * 0.16 + rand(-0.04, 0.04),  
        h: rand(26, 44) * scale,  
        grains: 2 + (Math.random() < 0.5 ? 1 : 0),  
      });  
    }  
    stalks.push({  
      x: rand(-6, W + 6),  
      y,  
      scale,  
      phase: rand(0, TAU),  
      speed: rand(0.7, 1.5),  
      amp: rand(0.05, 0.11),  
      stems,  
    });  
  }  
  stalks.sort((a, b) => a.y - b.y);  
  
  const ambient = [];  
  for (let i = 0; i < 4; i++) {  
    ambient.push({  
      x: rand(0, W),  
      y: rand(60, 240),  
      vx: rand(18, 34) * (Math.random() < 0.5 ? -1 : 1),  
      scale: rand(0.45, 0.7),  
      phase: rand(0, TAU),  
      rot: 0,  
      flip: false,  
      kind: 'normal',  
    });  
  }  
  
  const ropes = ROPE_ANCHORS.map((a) => ({  
    ax: a.x,  
    ay: a.y,  
    phase: rand(0, TAU),  
    pullT: 0,  
    cool: 0,  
    scareT: 0.7,  
    tension: 1,  
    tensionDelay: 0,  
    slackFlash: 0,  
  }));  
  
  function ropeAngle(r) {  
    return Math.atan2(r.ay - PIVOT.y, r.ax - PIVOT.x);  
  }  
  
  function ropeBasePoint(r, t) {  
    return {  
      x: PIVOT.x + (r.ax - PIVOT.x) * t,  
      y: PIVOT.y + (r.ay - PIVOT.y) * t,  
    };  
  }  
  
  function ropeGeometry(r) {  
    const p = clamp01(r.pullT / PULL_TIME);  
    const wob = Math.sin(time * 38 + r.phase) * 15 * p;  
    const mx = (PIVOT.x + r.ax) / 2;  
    const my = (PIVOT.y + r.ay) / 2;  
    const dx = r.ax - PIVOT.x;  
    const dy = r.ay - PIVOT.y;  
    const len = Math.hypot(dx, dy) || 1;  
    const nx = -dy / len;  
    const ny = dx / len;  
    const slack = 1 - r.tension;  
    const off = 5 + wob + slack * 15;  
    return { cx: mx + nx * off, cy: my + ny * off };  
  }  
  
  function ropePoint(r, t, geo) {  
    const g = geo || ropeGeometry(r);  
    const mt = 1 - t;  
    return {  
      x: mt * mt * PIVOT.x + 2 * mt * t * g.cx + t * t * r.ax,  
      y: mt * mt * PIVOT.y + 2 * mt * t * g.cy + t * t * r.ay,  
    };  
  }  
  
  const game = {  
    state: 'menu',  
    score: 0,  
    best: 0,  
    rice: MAX_RICE,  
    wave: 1,  
    combo: 0,  
    comboT: 0,  
    specialCD: 0,  
    waryT: 0,  
    waveBanner: 0,  
    flash: 0,  
    damageFlash: 0,  
    elapsed: 0,  
    spawnTimer: 0.6,  
    waveTimer: 0,  
    shakeT: 0,  
    shakeMag: 0,  
    gameOverAge: 0,  
    newBest: false,  
  };  
  
  try {  
    game.best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;  
  } catch (err) {  
    game.best = 0;  
  }  
  
  let birds = [];  
  let floaters = [];  
  let particles = [];  
  let rings = [];  
  let dragging = false;  
  let lastPointer = null;  
  let activeRope = -1;  
  let gesture = null;  
  let time = 0;  
  let silentScare = false;  
  
  function startGame() {  
    birds = [];  
    floaters = [];  
    particles = [];  
    rings = [];  
    game.state = 'playing';  
    game.score = 0;  
    game.rice = MAX_RICE;  
    game.wave = 1;  
    game.combo = 0;  
    game.comboT = 0;  
    game.specialCD = 0;  
    game.waryT = 0;  
    game.waveBanner = 1.4;  
    game.flash = 0;  
    game.damageFlash = 0;  
    game.elapsed = 0;  
    game.spawnTimer = 0.6;  
    game.waveTimer = 0;  
    game.shakeT = 0;  
    game.shakeMag = 0;  
    game.gameOverAge = 0;  
    game.newBest = false;  
    dragging = false;  
    lastPointer = null;  
    activeRope = -1;  
    gesture = null;  
    for (const r of ropes) {  
      r.pullT = 0;  
      r.cool = 0;  
      r.tension = 1;  
      r.tensionDelay = 0;  
      r.slackFlash = 0;  
    }  
  }  
  
  function gameOver() {  
    game.state = 'gameover';  
    game.gameOverAge = 0;  
    birds = [];  
    game.newBest = game.score > game.best;  
    if (game.newBest) {  
      game.best = game.score;  
      try {  
        localStorage.setItem(BEST_KEY, String(game.best));  
      } catch (err) {}  
    }  
    SFX.gameover();  
  }  
  
  function birdKindForWave() {  
    const w = game.wave;  
    const roll = Math.random();  
    if (w >= 4 && roll < 0.06) return 'golden';  
    if (w >= 3 && roll < 0.16) return 'fast';  
    if (w >= 4 && roll < 0.3) return 'tank';  
    if (w >= 3 && roll < 0.42) return 'sly';  
    if (w >= 5 && roll < 0.5) return 'leader';  
    return 'normal';  
  }  
  
  function targetForBird(kind, ropeIdx) {  
    const t = rand(TARGET_T_MIN, TARGET_T_MAX);  
    const rope = ropes[ropeIdx];  
    if (kind === 'sly') {  
      const otherIdx = ropeIdx + (Math.random() < 0.5 ? -1 : 1);  
      if (otherIdx >= 0 && otherIdx < ropes.length) {  
        const p1 = ropePoint(rope, t);  
        const p2 = ropePoint(ropes[otherIdx], t);  
        const x = (p1.x + p2.x) / 2 + rand(-8, 8);  
        const y = (p1.y + p2.y) / 2 + rand(-8, 8);  
        const assigned =  
          Math.abs(x - rope.ax) < Math.abs(x - ropes[otherIdx].ax) ? ropeIdx : otherIdx;  
        return { x: clamp(x, 20, W - 20), y: clamp(y, 575, 748), rope: assigned, t };  
      }  
    }  
    const p = ropePoint(rope, t);  
    return {  
      x: clamp(p.x + rand(-14, 14), 20, W - 20),  
      y: clamp(p.y + rand(-14, 14), 575, 748),  
      rope: ropeIdx,  
      t,  
    };  
  }  
  
  function spawnBird(kind, ropeIdx) {  
    const st = KIND_STATS[kind];  
    const speed = st.speed * PX + Math.min(1.2 * PX, (game.wave - 1) * 0.06 * PX);  
    const target = targetForBird(kind, ropeIdx);  
    const spawnX = clamp(target.x + rand(-46, 46), 12, W - 12);  
    const pace = Math.max(0.78, 1 - (game.wave - 1) * 0.02);  
    const baseHops = kind === 'fast' || kind === 'leader' || kind === 'golden' ? 0 : kind === 'sly' ? 2 : 1;  
    const maxHops = Math.min(2, baseHops + (game.wave >= 8 && kind !== 'leader' ? 1 : 0));  
  
    birds.push({  
      kind,  
      hp: st.hp,  
      points: st.points,  
      speed,  
      scale: st.scale,  
      rope: target.rope,  
      x: spawnX,  
      y: -40,  
      targetX: target.x,  
      targetY: target.y,  
      targetT: target.t,  
      phase: rand(0, TAU),  
      rot: 0,  
      flip: false,  
      mode: 'fly',  
      eatDur: (kind === 'leader' ? 2.5 : kind === 'fast' ? 0.92 : kind === 'tank' ? 1.25 : 1.08) * pace,  
      peckDur: (kind === 'leader' ? 0.62 : kind === 'fast' ? 0.36 : kind === 'tank' ? 0.56 : 0.5) * pace,  
      eatT: 1.3,  
      peckT: 0.45,  
      pecked: false,  
      peckPulse: 0,  
      lastHit: -999,  
      hitFlash: 0,  
      startleT: 0,  
      scared: false,  
      fleeT: 0,  
      fleeVX: 0,  
      fleeVY: 0,  
      maxHops,  
      hopsLeft: maxHops,  
      ears: 0,  
      leaderT: kind === 'leader' ? 1.9 : 0,  
      summoned: false,  
      hitRadius: (0.62 * st.scale + 0.18) * PX + 6,  
    });  
  }  
  
  function spawnWave() {  
    const targetCount = Math.min(3, 1 + Math.floor((game.wave - 1) / 2));  
    const pool = ropes.map((_, i) => i);  
    for (let i = pool.length - 1; i > 0; i--) {  
      const j = Math.floor(Math.random() * (i + 1));  
      const tmp = pool[i];  
      pool[i] = pool[j];  
      pool[j] = tmp;  
    }  
    for (let i = 0; i < targetCount; i++) spawnBird(birdKindForWave(), pool[i]);  
    if (game.wave >= 6 && Math.random() < 0.45) {  
      spawnBird(birdKindForWave(), Math.floor(rand(0, ropes.length)));  
    }  
  }  
  
  function damageRice(amount, x, y) {  
    if (game.state !== 'playing') return;  
    game.rice -= amount;  
    game.shakeT = Math.max(game.shakeT, 0.25);  
    game.shakeMag = Math.max(game.shakeMag, 7);  
    game.damageFlash = 0.3;  
    SFX.damage();  
    addFloater('-' + amount + ' PADI', x, y, '#ff6b52', 20);  
    if (game.rice <= 0) {  
      game.rice = 0;  
      gameOver();  
    }  
  }  
  
  function scareBird(b) {  
    if (b.scared) return;  
    b.scared = true;  
    b.mode = 'flee';  
    b.fleeT = 0;  
    b.startleT = 0.55;  
    const away = b.x < PIVOT.x ? -1 : 1;  
    b.fleeVX = away * rand(50, 110);  
    b.fleeVY = -rand(210, 300);  
    game.combo++;  
    game.comboT = COMBO_WINDOW;  
    const mult = 1 + Math.floor(game.combo / 5);  
    const gained = b.points * mult;  
    game.score += gained;  
    addFloater('SUHHH! +' + gained, b.x, b.y - 20, b.kind === 'golden' ? '#ffd94d' : '#fff6d0', 20);  
    if (!silentScare) {  
      if (game.combo % 5 === 0) SFX.combo();  
      else SFX.score();  
    }  
    if (b.kind === 'golden' && game.rice < MAX_RICE) {  
      game.rice++;  
      addFloater('+1 PADI', b.x, b.y - 48, '#8fe86a', 18);  
    }  
    burstStartle(b.x, b.y, 5);  
    addRing(b.x, b.y, 30, 0.35, 'rgba(255,248,210,0.85)', 2);  
  }  
  
  function startleBird(b, full) {  
    if (b.scared) return;  
    if (full) {  
      scareBird(b);  
      return;  
    }  
    b.hp--;  
    if (b.hp <= 0) {  
      scareBird(b);  
      return;  
    }  
    b.lastHit = time;  
    b.hitFlash = 0.12;  
    b.startleT = 0.4;  
    if (b.kind === 'tank') {  
      b.ears = 0.9;  
      addFloater('TUTUP TELINGA!', b.x, b.y - 34, '#ffe0a0', 14);  
    }  
    burstStartle(b.x, b.y, 2);  
    SFX.tok();  
  }  
  
  function inScareRange(r, b) {  
    const p = ropeBasePoint(r, r.scareT);  
    return Math.hypot(b.x - p.x, b.y - p.y) <= SCARE_RADIUS + (b.scale - 1) * 10;  
  }  
  
  function summonReinforcements(b) {  
    if (b.summoned) return;  
    b.summoned = true;  
    addFloater('MEMANGGIL KAWAN!', b.x, b.y - 38, '#ffad98', 16);  
    addRing(b.x, b.y, 44, 0.45, 'rgba(255,92,64,0.85)', 2.5);  
    SFX.tok();  
    const n = game.wave >= 8 ? 2 : 1;  
    for (let i = 0; i < n; i++) {  
      let idx = Math.floor(rand(0, ropes.length));  
      if (idx === b.rope) idx = (idx + 1) % ropes.length;  
      spawnBird('normal', idx);  
    }  
  }  
  
  function ropeIndexAtPoint(x, y) {  
    let bestBird = null;  
    let bestD = Infinity;  
    for (const b of birds) {  
      if (b.scared) continue;  
      const d = Math.hypot(b.x - x, b.y - y);  
      if (d <= b.hitRadius && d < bestD) {  
        bestD = d;  
        bestBird = b;  
      }  
    }  
    if (bestBird) return bestBird.rope;  
  
    const a = Math.atan2(y - PIVOT.y, x - PIVOT.x);  
    let best = 0;  
    let bestA = Infinity;  
    for (let i = 0; i < ropes.length; i++) {  
      const d = Math.abs(angDiff(a, ropeAngle(ropes[i])));  
      if (d < bestA) {  
        bestA = d;  
        best = i;  
      }  
    }  
    return best;  
  }  
  
  function ropeDistanceAtPoint(r, x, y) {  
    const geo = ropeGeometry(r);  
    let best = Infinity;  
    let bestT = 0;  
    let px = PIVOT.x;  
    let py = PIVOT.y;  
    const segs = 24;  
    for (let i = 1; i <= segs; i++) {  
      const t = i / segs;  
      const p = ropePoint(r, t, geo);  
      const dx = p.x - px;  
      const dy = p.y - py;  
      const l2 = dx * dx + dy * dy;  
      const u = l2 > 0 ? clamp01(((x - px) * dx + (y - py) * dy) / l2) : 0;  
      const qx = px + dx * u;  
      const qy = py + dy * u;  
      const d = Math.hypot(x - qx, y - qy);  
      if (d < best) {  
        best = d;  
        bestT = (i - 1 + u) / segs;  
      }  
      px = p.x;  
      py = p.y;  
    }  
    return { d: best, t: bestT };  
  }  
  
  function ropeGrabAt(x, y) {  
    let bestBird = null;  
    let bestD = Infinity;  
    for (const b of birds) {  
      if (b.scared || b.mode !== 'eat') continue;  
      const d = Math.hypot(b.x - x, b.y - y);  
      if (d <= b.hitRadius + 12 && d < bestD) {  
        bestD = d;  
        bestBird = b;  
      }  
    }  
    if (bestBird) return bestBird.rope;  
  
    let best = -1;  
    let bestDist = GRAB_RADIUS;  
    for (let i = 0; i < ropes.length; i++) {  
      const info = ropeDistanceAtPoint(ropes[i], x, y);  
      if (info.d < bestDist) {  
        bestDist = info.d;  
        best = i;  
      }  
    }  
    return best;  
  }  
  
  function pullRope(index, opts) {  
    const r = ropes[index];  
    if (!r) return;  
    const o = opts || {};  
    if (r.cool > 0 && !o.force) return;  
    if (!o.force) {  
      if (r.tension < PULL_COST) {  
        r.cool = 0.35;  
        r.slackFlash = 0.6;  
        const sp = ropeBasePoint(r, r.scareT);  
        addFloater('TALI KENDOR!', sp.x, sp.y - 44, '#ffb36b', 15);  
        SFX.tok();  
        return;  
      }  
      r.tension = Math.max(0, r.tension - PULL_COST);  
      r.tensionDelay = TENSION_DELAY;  
    }  
    r.cool = 0.12;  
    r.pullT = PULL_TIME;  
    if (!o.silent) {  
      SFX.rope();  
      SFX.rattle();  
    }  
  
    const wary = game.waryT > 0 && !o.full;  
    const snapshot = birds.slice();  
    for (const b of snapshot) {  
      if (b.scared) continue;  
      if (o.full) {  
        startleBird(b, true);  
        continue;  
      }  
      if (wary || b.mode !== 'eat' || !inScareRange(r, b)) continue;  
      startleBird(b, false);  
    }  
  
    const sp = ropeBasePoint(r, r.scareT);  
    addRing(  
      sp.x,  
      sp.y - 22,  
      SCARE_RADIUS,  
      0.42,  
      wary ? 'rgba(130,190,255,0.55)' : 'rgba(255,244,176,0.7)',  
      2  
    );  
    if (wary) addFloater('PIPIT WASPADA!', sp.x, sp.y - 58, '#9fd2ff', 14);  
  }  
  
  function trySpecial() {  
    if (game.state !== 'playing' || game.specialCD > 0) return;  
    game.specialCD = SPECIAL_COOLDOWN;  
    game.flash = 0.35;  
    game.shakeT = Math.max(game.shakeT, 0.4);  
    game.shakeMag = Math.max(game.shakeMag, 10);  
    SFX.special();  
    addFloater('SEMUA TALI DITARIK!', W / 2, 300, '#ffdf66', 28);  
    silentScare = true;  
    for (let i = 0; i < ropes.length; i++) {  
      pullRope(i, { silent: true, full: true, force: true });  
    }  
    silentScare = false;  
    for (const r of ropes) {  
      r.tension = Math.min(r.tension, 0.22);  
      r.tensionDelay = 1.2;  
      r.slackFlash = 0.7;  
    }  
    game.waryT = WARY_TIME;  
    addFloater('PIPIT JADI WASPADA!', W / 2, 262, '#9fd2ff', 20);  
  }  
  
  function processTap(x, y) {  
    const grabbed = ropeGrabAt(x, y);  
    activeRope = grabbed >= 0 ? grabbed : ropeIndexAtPoint(x, y);  
    pullRope(activeRope);  
  }  
  
  function addFloater(str, x, y, color, size) {  
    floaters.push({ text: str, x, y, color, size, age: 0, life: 1.1 });  
  }  
  
  function addRing(x, y, maxR, life, color, width) {  
    rings.push({ x, y, maxR, life, color, width, age: 0 });  
  }  
  
  function burstStartle(x, y, n) {  
    const count = n || 4;  
    for (let i = 0; i < count; i++) {  
      const a = rand(-Math.PI * 0.9, -Math.PI * 0.1);  
      const sp = rand(35, 95);  
      particles.push({  
        x,  
        y,  
        vx: Math.cos(a) * sp,  
        vy: Math.sin(a) * sp,  
        rot: rand(0, TAU),  
        vr: rand(-3, 3),  
        size: rand(2, 4),  
        color: 'rgba(255,250,220,0.95)',  
        age: 0,  
        life: rand(0.3, 0.55),  
        kind: 'dust',  
      });  
    }  
  }  
  
  function updateBirds(dt) {  
    for (let i = birds.length - 1; i >= 0; i--) {  
      const b = birds[i];  
      b.phase += dt * 8;  
      if (b.hitFlash > 0) b.hitFlash -= dt;  
      if (b.startleT > 0) b.startleT -= dt;  
      if (b.ears > 0) b.ears = Math.max(0, b.ears - dt);  
      if (b.peckPulse > 0) b.peckPulse = Math.max(0, b.peckPulse - dt * 5);  
  
      if (b.mode === 'flee') {  
        b.fleeT += dt;  
        const boost = 1 + b.fleeT * 0.9;  
        b.x += b.fleeVX * boost * dt;  
        b.y += b.fleeVY * boost * dt;  
        b.flip = b.fleeVX < 0;  
        b.rot = Math.sin(b.fleeT * 11) * 0.25;  
        if (b.y < -90 || b.x < -90 || b.x > W + 90) {  
          birds.splice(i, 1);  
          continue;  
        }  
        continue;  
      }  
  
      if (b.mode === 'fly') {  
        const dx = b.targetX - b.x;  
        const dy = b.targetY - b.y;  
        const dist = Math.hypot(dx, dy);  
        if (dist <= 3) {  
          b.x = b.targetX;  
          b.y = b.targetY;  
          b.mode = 'eat';  
          b.eatT = b.eatDur;  
          b.peckT = b.peckDur;  
          b.pecked = false;  
          if (b.kind === 'leader' && !b.summoned) b.leaderT = 1.9;  
        } else {  
          const step = Math.min(b.speed * dt, dist);  
          b.x += (dx / dist) * step;  
          b.y += (dy / dist) * step;  
          if (Math.abs(dx) > 1) b.flip = dx < 0;  
        }  
      } else if (b.mode === 'eat') {  
        b.eatT -= dt;  
        b.peckT -= dt;  
        if (b.leaderT > 0) {  
          b.leaderT -= dt;  
          if (b.leaderT <= 0 && !b.summoned) summonReinforcements(b);  
        }  
        if (!b.pecked && b.peckT <= 0) {  
          b.pecked = true;  
          b.peckPulse = 1;  
          damageRice(1, b.x, b.y - 18);  
          if (game.state !== 'playing') return;  
        }  
        if (b.eatT <= 0) {  
          if (b.hopsLeft > 0) {  
            b.hopsLeft--;  
            const next = targetForBird(b.kind, b.rope);  
            b.targetX = next.x;  
            b.targetY = next.y;  
            b.targetT = next.t;  
            b.rope = next.rope;  
            b.mode = 'fly';  
          } else {  
            b.mode = 'leave';  
          }  
        }  
      } else {  
        b.y -= b.speed * 1.4 * dt;  
        b.flip = false;  
        if (b.y < -60) {  
          birds.splice(i, 1);  
          continue;  
        }  
      }  
  
      const wob = Math.sin(b.phase * 0.7) * 0.14;  
      b.rot = wob + (b.flip ? -1 : 1) * 0.5 * b.peckPulse;  
    }  
  }  
  
  function updateEffects(dt) {  
    for (let i = floaters.length - 1; i >= 0; i--) {  
      const f = floaters[i];  
      f.age += dt;  
      if (f.age >= f.life) floaters.splice(i, 1);  
    }  
    for (let i = particles.length - 1; i >= 0; i--) {  
      const p = particles[i];  
      p.age += dt;  
      if (p.age >= p.life) {  
        particles.splice(i, 1);  
        continue;  
      }  
      p.vy += (p.kind === 'dust' ? 40 : 160) * dt;  
      p.vx *= 1 - 1.5 * dt;  
      p.x += p.vx * dt;  
      p.y += p.vy * dt;  
      p.rot += p.vr * dt;  
    }  
    for (let i = rings.length - 1; i >= 0; i--) {  
      const r = rings[i];  
      r.age += dt;  
      if (r.age >= r.life) rings.splice(i, 1);  
    }  
  }  
  
  function update(dt) {  
    time += dt;  
  
    for (const c of clouds) {  
      c.x += c.v * dt;  
      if (c.x > W + 120) c.x = -120;  
    }  
  
    for (const a of ambient) {  
      a.x += a.vx * dt;  
      a.phase += dt * 6;  
      if (a.vx > 0 && a.x > W + 50) a.x = -50;  
      if (a.vx < 0 && a.x < -50) a.x = W + 50;  
      a.rot = Math.sin(a.phase * 0.7) * 0.12;  
      a.flip = a.vx < 0;  
    }  
  
    if (game.state === 'playing') {  
      game.elapsed += dt;  
      game.waveTimer += dt;  
      if (game.waveTimer >= WAVE_DURATION) {  
        game.waveTimer = 0;  
        game.wave++;  
        game.waveBanner = 1.8;  
      }  
      if (game.specialCD > 0) game.specialCD = Math.max(0, game.specialCD - dt);  
      if (game.waryT > 0) game.waryT = Math.max(0, game.waryT - dt);  
      if (game.combo > 0) {  
        game.comboT -= dt;  
        if (game.comboT <= 0) {  
          game.combo = 0;  
          game.comboT = 0;  
        }  
      }  
      game.spawnTimer -= dt;  
      if (game.spawnTimer <= 0) {  
        spawnWave();  
        game.spawnTimer = Math.max(MIN_SPAWN, BASE_SPAWN - (game.wave - 1) * 0.07);  
      }  
      updateBirds(dt);  
    } else if (game.state === 'gameover') {  
      game.gameOverAge += dt;  
    }  
  
    if (game.waveBanner > 0) game.waveBanner -= dt;  
    if (game.flash > 0) game.flash -= dt;  
    if (game.damageFlash > 0) game.damageFlash -= dt;  
    if (game.shakeT > 0) game.shakeT -= dt;  
  
    for (const r of ropes) {  
      if (r.pullT > 0) r.pullT = Math.max(0, r.pullT - dt);  
      if (r.cool > 0) r.cool = Math.max(0, r.cool - dt);  
      if (r.slackFlash > 0) r.slackFlash = Math.max(0, r.slackFlash - dt);  
      if (r.tensionDelay > 0) r.tensionDelay = Math.max(0, r.tensionDelay - dt);  
      else if (r.tension < 1) r.tension = Math.min(1, r.tension + TENSION_REGEN * dt);  
    }  
  
    updateEffects(dt);  
  }  
  
  function roundRect(x, y, w, h, r) {  
    const rr = Math.min(r, w / 2, h / 2);  
    ctx.beginPath();  
    ctx.moveTo(x + rr, y);  
    ctx.arcTo(x + w, y, x + w, y + h, rr);  
    ctx.arcTo(x + w, y + h, x, y + h, rr);  
    ctx.arcTo(x, y + h, x, y, rr);  
    ctx.arcTo(x, y, x + w, y, rr);  
    ctx.closePath();  
  }  
  
  function text(str, x, y, size, color, align, weight, shadow) {  
    ctx.font = (weight || '700') + ' ' + size + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';  
    ctx.textAlign = align || 'left';  
    ctx.textBaseline = 'middle';  
    if (shadow !== false) {  
      ctx.fillStyle = 'rgba(0,0,0,0.32)';  
      ctx.fillText(str, x + 2, y + 3);  
    }  
    ctx.fillStyle = color;  
    ctx.fillText(str, x, y);  
  }  
  
  function drawCloud(c) {  
    ctx.save();  
    ctx.translate(c.x, c.y);  
    ctx.scale(c.s, c.s);  
    ctx.fillStyle = 'rgba(255,255,255,0.82)';  
    ctx.beginPath();  
    ctx.ellipse(-26, 4, 30, 18, 0, 0, TAU);  
    ctx.fill();  
    ctx.beginPath();  
    ctx.ellipse(4, -6, 38, 24, 0, 0, TAU);  
    ctx.fill();  
    ctx.beginPath();  
    ctx.ellipse(36, 6, 28, 17, 0, 0, TAU);  
    ctx.fill();  
    ctx.restore();  
  }  

  function drawPineTree(x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#3e271a';
    ctx.fillRect(-3, -20, 6, 20);
    ctx.fillStyle = '#2d4c2b';
    ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(-18, -15); ctx.lineTo(18, -15); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -70); ctx.lineTo(-15, -30); ctx.lineTo(15, -30); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -90); ctx.lineTo(-12, -45); ctx.lineTo(12, -45); ctx.fill();
    ctx.restore();
  }

  function drawBamboo(x, y, s, lean) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.rotate(lean);
    
    ctx.strokeStyle = '#5a7a3a';
    ctx.lineWidth = 7;
    ctx.lineCap = 'butt';
    
    let cy = 0;
    for (let i = 0; i < 6; i++) {
      let seg = 35 + (i * 2); 
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(0, cy - seg); ctx.stroke();
      ctx.fillStyle = '#8db05b';
      ctx.fillRect(-4.5, cy - seg - 2, 9, 4);
      ctx.fillStyle = '#688c42';
      const side = (i % 2 === 0) ? 1 : -1;
      ctx.beginPath();
      ctx.ellipse(12 * side, cy - seg, 16, 3, (0.4 * side), 0, TAU);
      ctx.fill();
      cy -= seg;
    }
    ctx.restore();
  }

  function drawTongkonan(x, baseY, s) {
    ctx.save();
    ctx.translate(x, baseY);
    ctx.scale(s, s);

    ctx.fillStyle = '#3a2113';
    for (let i = 0; i < 6; i++) ctx.fillRect(-45 + i * 18, -10, 6, 24); 

    ctx.fillStyle = '#6b3a1f';
    ctx.fillRect(-50, -45, 100, 36);
    ctx.fillStyle = '#a82c18'; 
    ctx.fillRect(-50, -40, 100, 6);
    ctx.fillStyle = '#dfaf36'; 
    ctx.fillRect(-50, -26, 100, 4);
    
    ctx.fillStyle = '#1c100a';
    ctx.fillRect(-8, -35, 16, 18);

    ctx.beginPath();
    ctx.moveTo(-85, -95); 
    ctx.quadraticCurveTo(-35, -45, 0, -65); 
    ctx.quadraticCurveTo(35, -45, 85, -95); 
    ctx.quadraticCurveTo(45, -40, 0, -45); 
    ctx.quadraticCurveTo(-45, -40, -85, -95); 
    ctx.closePath();
    
    const roofGrad = ctx.createLinearGradient(0, -95, 0, -40);
    roofGrad.addColorStop(0, '#2b1b12');
    roofGrad.addColorStop(1, '#1a0e08');
    ctx.fillStyle = roofGrad;
    ctx.fill();
    ctx.strokeStyle = '#5a3a1f';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#e8dfd5';
    for(let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-50, -32 + i * 7);
      ctx.quadraticCurveTo(-60, -37 + i * 7, -65, -47 + i * 7);
      ctx.quadraticCurveTo(-55, -32 + i * 7, -50, -25 + i * 7);
      ctx.fill();
    }
    ctx.restore();
  }
  
  function drawField() {  
    ctx.fillStyle = '#4f8438';  
    ctx.fillRect(0, FIELD_TOP, W, H - FIELD_TOP);  
  
    ctx.save();  
    ctx.beginPath();  
    ctx.rect(0, FIELD_TOP, W, H - FIELD_TOP);  
    ctx.clip();  
  
    const vx = W / 2;  
    const vy = FIELD_TOP - 10;  
    for (let i = -4; i <= 8; i++) {  
      const bx = i * (W / 8);  
      ctx.beginPath();  
      ctx.moveTo(vx, vy);  
      ctx.lineTo(bx, H + 20);  
      ctx.strokeStyle = 'rgba(35,78,30,0.18)';  
      ctx.lineWidth = 3;  
      ctx.stroke();  
    }  
  
    for (let i = 0; i < 7; i++) {  
      const t = i / 7;  
      const y = FIELD_TOP + Math.pow(t, 1.6) * (H - FIELD_TOP);  
      const h = 2 + t * 10;  
      ctx.fillStyle = i % 2 ? 'rgba(30,72,26,0.13)' : 'rgba(120,170,80,0.08)';  
      ctx.fillRect(0, y, W, h);  
    }  
  
    const fg = ctx.createLinearGradient(0, FIELD_TOP, 0, FIELD_TOP + 90);  
    fg.addColorStop(0, 'rgba(240,230,170,0.35)');  
    fg.addColorStop(1, 'rgba(240,230,170,0)');  
    ctx.fillStyle = fg;  
    ctx.fillRect(0, FIELD_TOP, W, 90);  
    ctx.restore();  
  }  
  
  function drawFence() {  
    const baseY = FIELD_TOP + 16;  
    ctx.strokeStyle = '#9c7742';  
    ctx.lineWidth = 4;  
    ctx.beginPath();  
    ctx.moveTo(0, baseY - 6);  
    ctx.lineTo(W, baseY - 6);  
    ctx.stroke();  
    ctx.strokeStyle = 'rgba(60,40,20,0.4)';  
    ctx.lineWidth = 1.5;  
    ctx.beginPath();  
    ctx.moveTo(0, baseY - 8);  
    ctx.lineTo(W, baseY - 8);  
    ctx.stroke();  
  
    for (const p of fencePosts) {  
      ctx.save();  
      ctx.translate(p.x, baseY);  
      ctx.rotate(p.lean);  
      ctx.fillStyle = '#b08a4a';  
      ctx.fillRect(-3, -p.h, 6, p.h);  
      ctx.fillStyle = 'rgba(70,45,20,0.35)';  
      ctx.fillRect(-3, -p.h, 2, p.h);  
      ctx.fillStyle = '#c9a45e';  
      ctx.fillRect(-3, -p.h + 3, 6, 2);  
      ctx.restore();  
    }  
  }  
  
  function drawStalk(st) {  
    const sway = Math.sin(time * st.speed + st.phase) * st.amp;  
    ctx.strokeStyle = 'rgba(46,92,32,0.92)';  
    ctx.lineWidth = Math.max(1, 1.7 * st.scale);  
    ctx.fillStyle = '#e6bf4a';  
  
    for (const stem of st.stems) {  
      const a = stem.off + sway;  
      const tipX = st.x + Math.sin(a) * stem.h;  
      const tipY = st.y - Math.cos(a) * stem.h;  
      ctx.beginPath();  
      ctx.moveTo(st.x, st.y);  
      ctx.quadraticCurveTo(  
        st.x + Math.sin(a) * stem.h * 0.45,  
        st.y - Math.cos(a) * stem.h * 0.55,  
        tipX,  
        tipY  
      );  
      ctx.stroke();  
  
      for (let g = 0; g < stem.grains; g++) {  
        const gx = tipX + Math.sin(a) * (g * 4);  
        const gy = tipY - Math.cos(a) * (g * 4);  
        const side = (g % 2 === 0 ? -1 : 1) * 2.2;  
        ctx.beginPath();  
        ctx.ellipse(  
          gx + Math.cos(a) * side,  
          gy + Math.sin(a) * side,  
          1.8 * st.scale,  
          3.2 * st.scale,  
          a,  
          0,  
          TAU  
        );  
        ctx.fill();  
      }  
    }  
  }  
  
  function drawCan(x, y, swing, pulled) {  
    ctx.save();  
    ctx.translate(x, y);  
    ctx.rotate(swing);  
    ctx.strokeStyle = '#7a5a2e';  
    ctx.lineWidth = 1.3;  
    ctx.beginPath();  
    ctx.moveTo(0, 0);  
    ctx.lineTo(0, 9);  
    ctx.stroke();  
  
    roundRect(-4.5, 9, 9, 12, 2);  
    ctx.fillStyle = '#cfd4d0';  
    ctx.fill();  
    ctx.strokeStyle = '#78827a';  
    ctx.lineWidth = 1;  
    ctx.stroke();  
    ctx.fillStyle = 'rgba(110,130,115,0.55)';  
    ctx.fillRect(-4.5, 13, 9, 2);  
    ctx.fillStyle = 'rgba(90,100,90,0.45)';  
    ctx.beginPath();  
    ctx.ellipse(0, 20.5, 3.4, 1.6, 0, 0, TAU);  
    ctx.fill();  
    ctx.restore();  
  
    if (pulled > 0.05) {  
      ctx.save();  
      ctx.globalAlpha = clamp01(pulled) * 0.85;  
      ctx.strokeStyle = '#fff0a8';  
      ctx.lineWidth = 1.4;  
      for (let k = 0; k < 2; k++) {  
        ctx.beginPath();  
        ctx.arc(x + 7, y + 9, 3 + k * 2.5, -0.7, 0.9);  
        ctx.stroke();  
      }  
      ctx.restore();  
    }  
  }  
  
  function drawScarecrow(x, y, s, sway, alert) {  
    ctx.save();  
    ctx.translate(x, y);  
    ctx.scale(s, s);  
  
    ctx.fillStyle = 'rgba(20,35,15,0.18)';  
    ctx.beginPath();  
    ctx.ellipse(0, 0, 15, 4, 0, 0, TAU);  
    ctx.fill();  
  
    ctx.strokeStyle = '#6b4a22';  
    ctx.lineWidth = 3.5;  
    ctx.lineCap = 'round';  
    ctx.beginPath();  
    ctx.moveTo(0, 0);  
    ctx.lineTo(0, -54);  
    ctx.stroke();  
  
    ctx.save();  
    ctx.translate(0, -40);  
    ctx.rotate(sway);  
    ctx.strokeStyle = '#8a5e26';  
    ctx.lineWidth = 3;  
    ctx.beginPath();  
    ctx.moveTo(-23, 0);  
    ctx.lineTo(23, 0);  
    ctx.stroke();  
    ctx.fillStyle = '#e3c264';  
    for (const side of [-1, 1]) {  
      ctx.beginPath();  
      ctx.ellipse(side * 23, 0, 4.5, 5.5, side * 0.3, 0, TAU);  
      ctx.fill();  
    }  
    ctx.restore();  
  
    ctx.fillStyle = '#d9b75a';  
    ctx.beginPath();  
    ctx.ellipse(0, -34, 11, 15, 0, 0, TAU);  
    ctx.fill();  
    ctx.strokeStyle = 'rgba(120,85,30,0.45)';  
    ctx.lineWidth = 1.2;  
    for (let i = -1; i <= 1; i++) {  
      ctx.beginPath();  
      ctx.moveTo(-9, -34 + i * 6);  
      ctx.lineTo(9, -34 + i * 6);  
      ctx.stroke();  
    }  
  
    ctx.fillStyle = '#e6c46c';  
    ctx.beginPath();  
    ctx.arc(0, -54, 9, 0, TAU);  
    ctx.fill();  
    ctx.fillStyle = '#3a2a14';  
    for (const ex of [-3.4, 3.4]) {  
      ctx.beginPath();  
      ctx.arc(ex, -55, 1.4, 0, TAU);  
      ctx.fill();  
    }  
  
    ctx.fillStyle = '#8a5a2c';  
    ctx.beginPath();  
    ctx.moveTo(-13, -58);  
    ctx.lineTo(13, -58);  
    ctx.lineTo(6, -71);  
    ctx.lineTo(-6, -71);  
    ctx.closePath();  
    ctx.fill();  
  
    if (alert) {  
      const a = 0.55 + 0.45 * Math.sin(time * 7 + x * 0.07);  
      ctx.globalAlpha = a;  
      ctx.fillStyle = '#fff3b0';  
      ctx.font = '900 17px system-ui, -apple-system, sans-serif';  
      ctx.textAlign = 'center';  
      ctx.textBaseline = 'middle';  
      ctx.fillText('!', 0, -84);  
      ctx.globalAlpha = 1;  
    }  
    ctx.restore();  
  }  
  
  function drawRope(r, idx) {  
    const pulled = clamp01(r.pullT / PULL_TIME);  
    const geo = ropeGeometry(r);  
    const live = birds.filter(  
      (b) => b.rope === idx && !b.scared && b.mode !== 'leave' && b.mode !== 'flee'  
    );  
    const alert = live.length > 0;  
    const inRange = live.some((b) => b.mode === 'eat' && inScareRange(r, b));  
  
    ctx.save();  
    if (alert) {  
      const a = 0.12 + 0.1 * Math.sin(time * 5 + r.phase);  
      ctx.strokeStyle = inRange  
        ? 'rgba(255,240,150,' + a.toFixed(3) + ')'  
        : 'rgba(255,150,110,' + (a * 0.65).toFixed(3) + ')';  
      ctx.lineWidth = 9;  
      ctx.beginPath();  
      ctx.moveTo(PIVOT.x, PIVOT.y);  
      ctx.quadraticCurveTo(geo.cx, geo.cy, r.ax, r.ay);  
      ctx.stroke();  
    }  
  
    if (r.slackFlash > 0) {  
      ctx.strokeStyle = 'rgba(255,100,70,' + (r.slackFlash * 0.8).toFixed(3) + ')';  
      ctx.lineWidth = 6;  
      ctx.beginPath();  
      ctx.moveTo(PIVOT.x, PIVOT.y);  
      ctx.quadraticCurveTo(geo.cx, geo.cy, r.ax, r.ay);  
      ctx.stroke();  
    }  
  
    ctx.strokeStyle = 'rgba(60,40,18,0.85)';  
    ctx.lineWidth = 3.2;  
    ctx.beginPath();  
    ctx.moveTo(PIVOT.x, PIVOT.y);  
    ctx.quadraticCurveTo(geo.cx, geo.cy, r.ax, r.ay);  
    ctx.stroke();  
    ctx.strokeStyle = pulled > 0.1 ? '#ffe6a0' : r.tension < 0.34 ? '#a8814e' : '#d8b06a';  
    ctx.lineWidth = 1.4;  
    ctx.beginPath();  
    ctx.moveTo(PIVOT.x, PIVOT.y);  
    ctx.quadraticCurveTo(geo.cx, geo.cy, r.ax, r.ay);  
    ctx.stroke();  
  
    ctx.fillStyle = '#8a5a2c';  
    ctx.strokeStyle = '#5a3a16';  
    ctx.lineWidth = 1.2;  
    roundRect(r.ax - 3, r.ay - 14, 6, 16, 2);  
    ctx.fill();  
    ctx.stroke();  
  
    const tcol = r.tension > 0.66 ? '#8fd36b' : r.tension > 0.33 ? '#e8c259' : '#d06a48';  
    ctx.fillStyle = tcol;  
    ctx.strokeStyle = 'rgba(40,25,10,0.55)';  
    ctx.lineWidth = 1;  
    ctx.beginPath();  
    ctx.arc(r.ax, r.ay - 18, 3.5, 0, TAU);  
    ctx.fill();  
    ctx.stroke();  
  
    for (let c = 0; c < ROPE_CANS.length; c++) {  
      const p = ropePoint(r, ROPE_CANS[c], geo);  
      const swing =  
        Math.sin(time * 27 + idx * 1.3 + c * 1.9) * 0.55 * pulled +  
        Math.sin(time * 1.7 + r.phase + c) * 0.04;  
      drawCan(p.x, p.y, swing, pulled);  
    }  
  
    const base = ropeBasePoint(r, r.scareT);  
    const depth = clamp01((base.y - FIELD_TOP) / (FIELD_BOTTOM - FIELD_TOP));  
    const scale = lerp(0.55, 0.95, depth);  
    const sway =  
      Math.sin(time * 1.8 + r.phase) * 0.05 +  
      Math.sin(time * 26 + r.phase) * 0.32 * pulled;  
    drawScarecrow(base.x, base.y, scale, sway, alert && inRange);  
    ctx.restore();  
  }  
  
  function drawRopes() {  
    for (let i = 0; i < ropes.length; i++) drawRope(ropes[i], i);  
  }  
  
  function drawKatto() {  
    const x = PIVOT.x;  
    const y = PIVOT.y;  
  
    ctx.fillStyle = 'rgba(20,35,15,0.25)';  
    ctx.beginPath();  
    ctx.ellipse(x, y + 6, 44, 12, 0, 0, TAU);  
    ctx.fill();  
  
    ctx.strokeStyle = '#6b4a22';  
    ctx.lineWidth = 6;  
    ctx.lineCap = 'round';  
    ctx.beginPath();  
    ctx.moveTo(x - 28, y + 10);  
    ctx.lineTo(x, y - 16);  
    ctx.lineTo(x + 28, y + 10);  
    ctx.stroke();  
  
    ctx.fillStyle = '#a63b2a';  
    ctx.beginPath();  
    ctx.moveTo(x - 20, y - 6);  
    ctx.lineTo(x + 20, y - 6);  
    ctx.lineTo(x + 14, y + 8);  
    ctx.lineTo(x - 14, y + 8);  
    ctx.closePath();  
    ctx.fill();  
    ctx.fillStyle = '#d8a23a';  
    ctx.fillRect(x - 18, y - 2, 36, 3);  
    ctx.fillRect(x - 16, y + 3, 32, 2);  
  
    ctx.lineCap = 'round';  
    ctx.strokeStyle = '#9a6a3a';  
    ctx.lineWidth = 5;  
    ctx.beginPath();  
    ctx.moveTo(x - 15, y - 9);  
    ctx.quadraticCurveTo(x - 13, y - 2, x - 7, y - 3);  
    ctx.moveTo(x + 15, y - 9);  
    ctx.quadraticCurveTo(x + 13, y - 2, x + 7, y - 3);  
    ctx.stroke();  
  
    ctx.fillStyle = '#c98a52';  
    for (const hx of [-7, 7]) {  
      ctx.beginPath();  
      ctx.arc(x + hx, y - 3, 3.4, 0, TAU);  
      ctx.fill();  
    }  
  
    ctx.fillStyle = '#6b4a22';  
    ctx.beginPath();  
    ctx.arc(x, y - 2, 4, 0, TAU);  
    ctx.fill();  
    ctx.strokeStyle = '#e6c46c';  
    ctx.lineWidth = 1.4;  
    ctx.beginPath();  
    ctx.arc(x, y - 2, 6, 0.6, 2.5);  
    ctx.stroke();  
  }  
  
  function drawBird(b) {  
    const p = PALETTES[b.kind] || PALETTES.normal;  
    ctx.save();  
    ctx.translate(b.x, b.y);  
    ctx.rotate(b.rot || 0);  
    const s = b.scale;  
    ctx.scale(b.flip ? -s : s, s);  
  
    const flap = Math.sin(b.phase * 1.2) * 0.45;  
  
    ctx.fillStyle = p.wing;  
    ctx.beginPath();  
    ctx.moveTo(-14, -2);  
    ctx.lineTo(-30, -10);  
    ctx.lineTo(-28, 4);  
    ctx.closePath();  
    ctx.fill();  
  
    ctx.fillStyle = p.body;  
    ctx.beginPath();  
    ctx.ellipse(-2, 0, 17, 12, 0, 0, TAU);  
    ctx.fill();  
  
    ctx.fillStyle = p.belly;  
    ctx.beginPath();  
    ctx.ellipse(0, 4, 11, 7, 0, 0, TAU);  
    ctx.fill();  
  
    ctx.save();  
    ctx.translate(-4, -1);  
    ctx.rotate(flap);  
    ctx.fillStyle = p.wing;  
    ctx.beginPath();  
    ctx.ellipse(0, 0, 11, 6, -0.15, 0, TAU);  
    ctx.fill();  
    ctx.restore();  
  
    ctx.fillStyle = p.body;  
    ctx.beginPath();  
    ctx.arc(13, -7, 10, 0, TAU);  
    ctx.fill();  
  
    ctx.fillStyle = p.belly;  
    ctx.beginPath();  
    ctx.arc(14, -3, 5, 0, TAU);  
    ctx.fill();  
  
    ctx.fillStyle = p.beak;  
    ctx.beginPath();  
    ctx.moveTo(21, -8);  
    ctx.lineTo(30, -5);  
    ctx.lineTo(21, -2);  
    ctx.closePath();  
    ctx.fill();  
  
    ctx.fillStyle = p.eye;  
    ctx.beginPath();  
    ctx.arc(17, -9, 2.6, 0, TAU);  
    ctx.fill();  
    ctx.fillStyle = '#ffffff';  
    ctx.beginPath();  
    ctx.arc(17.8, -9.8, 0.9, 0, TAU);  
    ctx.fill();  
  
    if (b.kind === 'leader') {  
      ctx.fillStyle = '#d14a3c';  
      ctx.beginPath();  
      ctx.moveTo(7, -14);  
      ctx.lineTo(10, -22);  
      ctx.lineTo(13, -15);  
      ctx.lineTo(16, -23);  
      ctx.lineTo(19, -14);  
      ctx.closePath();  
      ctx.fill();  
      ctx.strokeStyle = 'rgba(80,20,12,0.6)';  
      ctx.lineWidth = 1;  
      ctx.stroke();  
    }  
  
    if (b.kind === 'sly') {  
      ctx.strokeStyle = 'rgba(225,245,255,0.75)';  
      ctx.lineWidth = 1.4;  
      ctx.beginPath();  
      ctx.moveTo(12, -12);  
      ctx.lineTo(22, -12);  
      ctx.stroke();  
    }  
  
    if (b.ears > 0) {  
      ctx.fillStyle = p.wing;  
      ctx.strokeStyle = 'rgba(30,20,10,0.6)';  
      ctx.lineWidth = 1;  
      ctx.beginPath();  
      ctx.arc(9, -12, 4.5, 0, TAU);  
      ctx.fill();  
      ctx.stroke();  
      ctx.beginPath();  
      ctx.arc(21, -12, 4.5, 0, TAU);  
      ctx.fill();  
      ctx.stroke();  
    }  
  
    if (b.mode === 'eat' || b.mode === 'leave') {  
      ctx.strokeStyle = p.beak;  
      ctx.lineWidth = 1.6;  
      ctx.beginPath();  
      ctx.moveTo(-3, 10);  
      ctx.lineTo(-3, 16);  
      ctx.moveTo(4, 10);  
      ctx.lineTo(4, 16);  
      ctx.stroke();  
    }  
    ctx.restore();  
  
    if (b.kind === 'golden') {  
      const glow = 0.5 + 0.5 * Math.sin(time * 10 + b.phase);  
      const g = ctx.createRadialGradient(b.x, b.y, 4, b.x, b.y, 32 * s);  
      g.addColorStop(0, 'rgba(255,240,150,' + (0.18 + glow * 0.25).toFixed(3) + ')');  
      g.addColorStop(1, 'rgba(255,240,150,0)');  
      ctx.fillStyle = g;  
      ctx.beginPath();  
      ctx.arc(b.x, b.y, 32 * s, 0, TAU);  
      ctx.fill();  
    }  
  
    if (game.waryT > 0 && (b.mode === 'eat' || b.mode === 'fly')) {  
      ctx.save();  
      ctx.globalAlpha = clamp01(game.waryT / WARY_TIME) * 0.5;  
      ctx.strokeStyle = '#8ec9ff';  
      ctx.lineWidth = 2;  
      ctx.setLineDash([4, 4]);  
      ctx.beginPath();  
      ctx.arc(b.x, b.y, 24 * s, 0, TAU);  
      ctx.stroke();  
      ctx.restore();  
    }  
  
    if (b.kind === 'tank' && b.hp === 1) {  
      ctx.save();  
      ctx.font = '900 13px system-ui, -apple-system, sans-serif';  
      ctx.textAlign = 'center';  
      ctx.textBaseline = 'middle';  
      ctx.strokeStyle = 'rgba(50,35,10,0.7)';  
      ctx.lineWidth = 3;  
      ctx.strokeText('2x', b.x, b.y - 34 * s);  
      ctx.fillStyle = '#ffd27a';  
      ctx.fillText('2x', b.x, b.y - 34 * s);  
      ctx.restore();  
    }  
  
    if (b.hitFlash > 0) {  
      ctx.save();  
      ctx.globalAlpha = clamp01(b.hitFlash / 0.08) * 0.7;  
      ctx.fillStyle = '#ffffff';  
      ctx.beginPath();  
      ctx.arc(b.x, b.y, 18 * s, 0, TAU);  
      ctx.fill();  
      ctx.restore();  
    }  
  
    if (b.startleT > 0) {  
      const a = clamp01(b.startleT / 0.55);  
      ctx.save();  
      ctx.globalAlpha = a;  
      ctx.font = '900 ' + Math.round(20 * s) + 'px system-ui, -apple-system, sans-serif';  
      ctx.textAlign = 'center';  
      ctx.textBaseline = 'middle';  
      ctx.strokeStyle = 'rgba(50,35,10,0.6)';  
      ctx.lineWidth = 2.5;  
      ctx.strokeText('!', b.x, b.y - 28 * s);  
      ctx.fillStyle = '#fff6d0';  
      ctx.fillText('!', b.x, b.y - 28 * s);  
      ctx.restore();  
    }  
  }  

  function drawScene() {
    const sky = ctx.createLinearGradient(0, 0, 0, FIELD_TOP);
    sky.addColorStop(0, '#a6d7ec');
    sky.addColorStop(0.65, '#cfe9f1');
    sky.addColorStop(1, '#f4efd8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, FIELD_TOP + 2);
    
    const sg = ctx.createRadialGradient(334, 128, 8, 334, 128, 78);
    sg.addColorStop(0, 'rgba(255,247,200,1)');
    sg.addColorStop(0.35, 'rgba(255,236,160,0.85)');
    sg.addColorStop(1, 'rgba(255,236,160,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(334, 128, 80, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe9a3';
    ctx.beginPath(); ctx.arc(334, 128, 34, 0, TAU); ctx.fill();
    
    for (const c of clouds) drawCloud(c);

    for (const m of mountains) {
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.moveTo(m.path[0][0], m.path[0][1]);
      for(let i = 1; i < m.path.length; i++) ctx.lineTo(m.path[i][0], m.path[i][1]);
      ctx.fill();
    }

    for (const h of hills) {
      ctx.fillStyle = h.color;
      ctx.beginPath();
      ctx.ellipse(h.x, h.y, h.rx, h.ry, 0, 0, TAU);
      ctx.fill();
    }
    for (const p of pines) drawPineTree(p.x, p.y, p.s);
    for (const h of houses) drawTongkonan(h.x, h.y, h.s);
    
    drawField();
    drawFence();
    for (const st of stalks) drawStalk(st);
    drawRopes();
    drawKatto();
    for (const b of birds) drawBird(b);

    for (const b of bamboos) drawBamboo(b.x, b.y, b.s, b.lean);
  }
  
  function drawEffects() {  
    for (const r of rings) {  
      const t = clamp01(r.age / r.life);  
      const rad = r.maxR * (1 - Math.pow(1 - t, 3));  
      ctx.save();  
      ctx.globalAlpha = (1 - t) * 0.9;  
      ctx.strokeStyle = r.color;  
      ctx.lineWidth = r.width * (1 - t * 0.5);  
      ctx.beginPath();  
      ctx.arc(r.x, r.y, rad, 0, TAU);  
      ctx.stroke();  
      ctx.restore();  
    }  
  
    for (const p of particles) {  
      const t = clamp01(p.age / p.life);  
      ctx.save();  
      ctx.globalAlpha = 1 - t;  
      ctx.translate(p.x, p.y);  
      ctx.rotate(p.rot);  
      ctx.fillStyle = p.color;  
      ctx.beginPath();  
      if (p.kind === 'dust') {  
        ctx.arc(0, 0, p.size * (0.6 + t * 1.4), 0, TAU);  
      } else {  
        ctx.ellipse(0, 0, p.size, p.size * 0.42, 0, 0, TAU);  
      }  
      ctx.fill();  
      ctx.restore();  
    }  
  
    for (const f of floaters) {  
      const t = clamp01(f.age / f.life);  
      ctx.save();  
      ctx.globalAlpha = 1 - clamp01((t - 0.45) / 0.55);  
      text(f.text, f.x, f.y - t * 70, f.size, f.color, 'center', '800');  
      ctx.restore();  
    }  
  }  
  
  function drawGrain(x, y, r, alive) {  
    ctx.save();  
    ctx.translate(x, y);  
    ctx.rotate(-0.5);  
    ctx.beginPath();  
    ctx.ellipse(0, 0, r * 0.55, r, 0, 0, TAU);  
    ctx.fillStyle = alive ? '#e8b64a' : 'rgba(20,30,15,0.25)';  
    ctx.fill();  
    if (alive) {  
      ctx.strokeStyle = 'rgba(120,80,20,0.6)';  
      ctx.lineWidth = 1;  
      ctx.beginPath();  
      ctx.moveTo(0, -r * 0.8);  
      ctx.lineTo(0, r * 0.8);  
      ctx.stroke();  
    } else {  
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';  
      ctx.lineWidth = 1;  
      ctx.stroke();  
    }  
    ctx.restore();  
  }  
  
  function drawSpecialButton() {  
    const r = SPECIAL_RECT;  
    const ready = game.specialCD <= 0;  
    ctx.save();  

    roundRect(r.x, r.y, r.w, r.h, 12);  
    if (ready) {  
      const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);  
      g.addColorStop(0, '#f2c14e');  
      g.addColorStop(1, '#c8851f');  
      ctx.fillStyle = g;  
    } else {  
      ctx.fillStyle = 'rgba(70,70,62,0.82)';  
    }  
    ctx.fill();  
    ctx.strokeStyle = ready ? '#7a4a12' : 'rgba(30,30,26,0.7)';  
    ctx.lineWidth = 2.5;  
    ctx.stroke();  

    ctx.strokeStyle = ready ? 'rgba(255,245,190,0.7)' : 'rgba(255,255,255,0.15)';  
    ctx.lineWidth = 1.5;  
    roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 10);  
    ctx.stroke();  

    ctx.save();  
    ctx.translate(r.x + 24, r.y + r.h / 2);  
    ctx.scale(0.85, 0.85); 
    ctx.strokeStyle = ready ? '#5a3a16' : '#5f5f58';  
    ctx.lineWidth = 2.2;  
    ctx.lineCap = 'round';  
    for (let i = -1; i <= 1; i++) {  
      ctx.beginPath();  
      ctx.moveTo(-12, i * 13);  
      ctx.quadraticCurveTo(-2, i * 6, 9, 0);  
      ctx.stroke();  
    }  
    ctx.fillStyle = ready ? '#6b4a22' : '#55554f';  
    ctx.beginPath();  
    ctx.arc(9, 0, 4, 0, TAU);  
    ctx.fill();  
    ctx.strokeStyle = ready ? '#e6c46c' : '#8a8a80';  
    ctx.lineWidth = 1.4;  
    ctx.beginPath();  
    ctx.arc(9, 0, 6, 0.5, 2.6);  
    ctx.stroke();  
    ctx.restore();  

    if (ready) {  
      text('TARIK', r.x + 72, r.y + 17, 14, '#3a1e08', 'center', '900');  
      text('SEMUA', r.x + 72, r.y + 31, 12, '#5a3008', 'center', '800');  
    } else {  
      text('SIAP', r.x + 72, r.y + 17, 14, '#e8e8dd', 'center', '800');  
      text(Math.ceil(game.specialCD) + 's', r.x + 72, r.y + 31, 13, '#cfcfc2', 'center', '700');  
    }  
    ctx.restore();  
  }  
  
  function drawHUD() {  
    text('SKOR ' + game.score, 18, 26, 26, '#2a1a0d', 'left', '800');  
    text('Terbaik ' + game.best, 18, 54, 14, 'rgba(42,26,13,0.8)', 'left', '600');  
  
    const pw = 108;  
    const ph = 26;  
    roundRect(W / 2 - pw / 2, 14, pw, ph, 13);  
    ctx.fillStyle = 'rgba(28,66,26,0.72)';  
    ctx.fill();  
    ctx.strokeStyle = 'rgba(240,220,150,0.55)';  
    ctx.lineWidth = 1.5;  
    ctx.stroke();  
    text('GELOMBANG ' + game.wave, W / 2, 27, 12, '#f4e8b8', 'center', '700', false);  
  
    const iconW = 22;  
    const gap = 4;  
    const startX = W - 16 - (MAX_RICE * iconW + (MAX_RICE - 1) * gap);  
    for (let i = 0; i < MAX_RICE; i++) {  
      drawGrain(startX + i * (iconW + gap), 27, 10, i < game.rice);  
    }  
  
    if (game.combo >= 2) {  
      const mult = 1 + Math.floor(game.combo / 5);  
      const pulse = 1 + clamp01(game.comboT / COMBO_WINDOW) * 0.15;  
      ctx.save();  
      ctx.translate(W / 2, 146);  
      ctx.scale(pulse, pulse);  
      text('COMBO ' + game.combo + ' x' + mult, 0, 0, 26, '#f0a52a', 'center', '800');  
      ctx.restore();  
    }  
  
    if (game.waryT > 0) {  
      const a = 0.55 + 0.45 * Math.abs(Math.sin(time * 6));  
      text(  
        'PIPIT WASPADA ' + game.waryT.toFixed(1) + 's',  
        W / 2,  
        176,  
        13,  
        'rgba(40,110,165,' + a.toFixed(3) + ')',  
        'center',  
        '800'  
      );  
    }  
  
    if (game.wave === 1 && game.elapsed < 7) {  
      const a = 0.6 + 0.4 * Math.abs(Math.sin(time * 4));  
      text('KETUK ATAU GESER TALI', W / 2, 214, 15, 'rgba(35,80,30,' + a.toFixed(3) + ')', 'center', '800');  
    }  
  
    if (game.waveBanner > 0) {  
      const a = clamp01(game.waveBanner / 0.6);  
      text('GELOMBANG ' + game.wave, W / 2, 300, 38, 'rgba(28,80,28,' + a.toFixed(3) + ')', 'center', '900');  
      text('Pipit makin banyak!', W / 2, 332, 14, 'rgba(40,70,30,' + (a * 0.8).toFixed(3) + ')', 'center', '600');  
    }  
  
    drawSpecialButton();  
  }  
  
  function drawPatternLine(cx, y, width, color) {  
    ctx.save();  
    ctx.strokeStyle = color;  
    ctx.lineWidth = 2;  
    ctx.beginPath();  
    ctx.moveTo(cx - width / 2, y);  
    ctx.lineTo(cx + width / 2, y);  
    ctx.stroke();  
    ctx.fillStyle = color;  
    const n = 9;  
    for (let i = 0; i < n; i++) {  
      const x = cx - width / 2 + (i + 0.5) * (width / n);  
      ctx.beginPath();  
      ctx.moveTo(x - 5, y - 1);  
      ctx.lineTo(x, y - 8);  
      ctx.lineTo(x + 5, y - 1);  
      ctx.closePath();  
      ctx.fill();  
      ctx.beginPath();  
      ctx.moveTo(x - 5, y + 1);  
      ctx.lineTo(x, y + 8);  
      ctx.lineTo(x + 5, y + 1);  
      ctx.closePath();  
      ctx.fill();  
    }  
    ctx.restore();  
  }  
  
  function drawMenu() {  
    const g = ctx.createLinearGradient(0, 0, 0, H);  
    g.addColorStop(0, 'rgba(255,250,230,0.25)');  
    g.addColorStop(0.5, 'rgba(255,250,230,0)');  
    g.addColorStop(1, 'rgba(20,30,15,0.22)');  
    ctx.fillStyle = g;  
    ctx.fillRect(0, 0, W, H);  
  
    drawPatternLine(W / 2, 110, 270, '#8a5a2c');  
  
    ctx.save();  
    ctx.font = '900 46px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';  
    ctx.textAlign = 'center';  
    ctx.textBaseline = 'middle';  
    ctx.lineJoin = 'round';  
    ctx.fillStyle = 'rgba(0,0,0,0.28)';  
    ctx.fillText("Mangramba dena'", W / 2 + 3, 185);  
    ctx.strokeStyle = '#e0b24a';  
    ctx.lineWidth = 6;  
    ctx.strokeText("Mangramba dena'", W / 2, 182);  
    ctx.fillStyle = '#3a1e08';  
    ctx.fillText("Mangramba dena'", W / 2, 182);  
    ctx.restore();  
  
    text('Jaga Sawah dari Pipit', W / 2, 230, 20, '#5a3a1a', 'center', '700');  
    drawPatternLine(W / 2, 264, 210, '#8a5a2c');  
  
    roundRect(42, 304, 366, 132, 16);  
    ctx.fillStyle = 'rgba(255,248,220,0.82)';  
    ctx.fill();  
    ctx.strokeStyle = 'rgba(138,90,44,0.55)';  
    ctx.lineWidth = 2;  
    ctx.stroke();  
    text('Ketuk atau geser tali untuk menariknya.', W / 2, 326, 13, '#3a2a14', 'center', '600', false);  
    text('Tali kendor berwarna merah—tunggu pulih.', W / 2, 352, 13, '#3a2a14', 'center', '600', false);  
    text('Hanya pipit dekat orang-orangan yang terusir.', W / 2, 378, 13, '#3a2a14', 'center', '600', false);  
    text('Pipit pintar, pemimpin, dan serangan serentak!', W / 2, 404, 13, '#3a2a14', 'center', '600', false);  
  
    text('TERBAIK ' + game.best, W / 2, 476, 16, '#6b4418', 'center', '800');  
  
    const blink = 0.55 + Math.sin(time * 4) * 0.35;  
    const pulse = 1 + Math.sin(time * 4) * 0.025;  
    ctx.save();  
    ctx.translate(W / 2, 620);  
    ctx.scale(pulse, pulse);  
    ctx.globalAlpha = blink;  
    roundRect(-110, -24, 220, 48, 24);  
    const cg = ctx.createLinearGradient(0, -24, 0, 24);  
    cg.addColorStop(0, '#f4cf63');  
    cg.addColorStop(1, '#d99a2b');  
    ctx.fillStyle = cg;  
    ctx.fill();  
    ctx.strokeStyle = '#7a4a12';  
    ctx.lineWidth = 2.5;  
    ctx.stroke();  
    text('TAP UNTUK MULAI', 0, 0, 17, '#3a1e08', 'center', '900', false);  
    ctx.restore();  
  
    text('Toraja • Panen • Budaya', W / 2, 770, 13, 'rgba(255,248,220,0.9)', 'center', '700');  
  }  
  
  function drawGameOver() {  
    ctx.fillStyle = 'rgba(20,17,13,0.62)';  
    ctx.fillRect(0, 0, W, H);  
  
    roundRect(40, 220, 370, 320, 22);  
    ctx.fillStyle = 'rgba(30,24,16,0.88)';  
    ctx.fill();  
    ctx.strokeStyle = 'rgba(224,178,74,0.75)';  
    ctx.lineWidth = 2.5;  
    ctx.stroke();  
  
    text('TAPPU PARE NA KANDE DENA!', W / 2, 274, 24, '#f0c968', 'center', '900');  
    text('Skor ' + game.score, W / 2, 344, 44, '#ffffff', 'center', '800');  
    text('Terbaik ' + game.best, W / 2, 394, 20, '#e8c478', 'center', '700');  
  
    if (game.newBest) {  
      const p = 0.6 + 0.4 * Math.abs(Math.sin(time * 5));  
      ctx.save();  
      ctx.globalAlpha = p;  
      text('REKOR BARU!', W / 2, 426, 16, '#8fe86a', 'center', '900');  
      ctx.restore();  
    }  
  
    const blink = 0.55 + Math.sin(time * 4) * 0.35;  
    ctx.save();  
    ctx.globalAlpha = blink;  
    text('TA TOLE MANINGO', W / 2, 492, 18, '#bfe8a8', 'center', '800');  
    ctx.restore();  
  }  
  
  function render() {  
    ctx.save();  
    if (game.shakeT > 0) {  
      const k = clamp01(game.shakeT / 0.3);  
      ctx.translate(  
        (Math.random() * 2 - 1) * game.shakeMag * k,  
        (Math.random() * 2 - 1) * game.shakeMag * k  
      );  
    }  
    drawScene();  
    if (game.state !== 'playing') {  
      for (const a of ambient) drawBird(a);  
    }  
    drawEffects();  
    ctx.restore();  
  
    if (game.state === 'playing') drawHUD();  
    else if (game.state === 'menu') drawMenu();  
    else drawGameOver();  
  
    if (game.damageFlash > 0) {  
      ctx.fillStyle = 'rgba(255,60,40,' + (clamp01(game.damageFlash / 0.3) * 0.18).toFixed(3) + ')';  
      ctx.fillRect(0, 0, W, H);  
    }  
    if (game.flash > 0) {  
      ctx.fillStyle = 'rgba(255,250,210,' + (clamp01(game.flash / 0.35) * 0.55).toFixed(3) + ')';  
      ctx.fillRect(0, 0, W, H);  
    }  
  }  
  
  function toCanvas(e) {  
    const r = canvas.getBoundingClientRect();  
    return {  
      x: ((e.clientX - r.left) / r.width) * W,  
      y: ((e.clientY - r.top) / r.height) * H,  
    };  
  }  
  
  function overSpecial(p) {  
    return (  
      p.x >= SPECIAL_RECT.x &&  
      p.x <= SPECIAL_RECT.x + SPECIAL_RECT.w &&  
      p.y >= SPECIAL_RECT.y &&  
      p.y <= SPECIAL_RECT.y + SPECIAL_RECT.h  
    );  
  }  
  
  function onPointerDown(e) {  
    e.preventDefault();  
    SFX.init();  
    const p = toCanvas(e);  
  
    if (game.state === 'menu') {  
      startGame();  
      return;  
    }  
    if (game.state === 'gameover') {  
      if (game.gameOverAge > 0.5) startGame();  
      return;  
    }  
  
    if (overSpecial(p)) {  
      trySpecial();  
      return;  
    }  
  
    let rope = ropeGrabAt(p.x, p.y);
    if (rope < 0) rope = ropeIndexAtPoint(p.x, p.y); 
    
    gesture = { x0: p.x, y0: p.y, rope, triggered: false };  
    activeRope = rope;  
    dragging = true;  
    lastPointer = p;  
    try {  
      canvas.setPointerCapture(e.pointerId);  
    } catch (err) {}  
  }  
  
  function onPointerMove(e) {  
    if (!dragging || !gesture || game.state !== 'playing') return;  
    e.preventDefault();  
    if (gesture.triggered) return;  
  
    const p = toCanvas(e);  
    const dx = p.x - gesture.x0;  
    const dy = p.y - gesture.y0;  
    if (Math.hypot(dx, dy) < PULL_DRAG) return;  
  
    gesture.triggered = true;  
    activeRope = gesture.rope;  
    pullRope(activeRope);  
  }  
  
  function onPointerUp(e) {  
    const cancelled = e && e.type === 'pointercancel';  
    if (!cancelled && gesture && !gesture.triggered && game.state === 'playing') {  
      activeRope = gesture.rope;  
      pullRope(activeRope);  
    }  
    dragging = false;  
    lastPointer = null;  
    activeRope = -1;  
    gesture = null;  
  }  
  
  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });  
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });  
  canvas.addEventListener('pointerup', onPointerUp);  
  canvas.addEventListener('pointercancel', onPointerUp);  
  window.addEventListener('pointerup', onPointerUp);  
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());  
  
  window.addEventListener('keydown', (e) => {  
    if (e.code === 'Space') {  
      e.preventDefault();  
      SFX.init();  
      if (game.state === 'menu') startGame();  
      else if (game.state === 'gameover' && game.gameOverAge > 0.5) startGame();  
      else if (game.state === 'playing') trySpecial();  
    } else if (e.code === 'Enter') {  
      SFX.init();  
      if (game.state !== 'playing') startGame();  
    } else if (e.key === 'm' || e.key === 'M') {  
      SFX.toggleMute();  
    }  
  });  
  
  document.addEventListener('visibilitychange', () => {  
    if (document.hidden) {  
      dragging = false;  
      lastPointer = null;  
      activeRope = -1;  
      gesture = null;  
    }  
  });  
  
  let last = performance.now();  
  function frame(now) {  
    let dt = (now - last) / 1000;  
    last = now;  
    if (!isFinite(dt) || dt < 0) dt = 0;  
    dt = Math.min(dt, 0.05);  
    update(dt);  
    render();  
    requestAnimationFrame(frame);  
  }  
  requestAnimationFrame(frame);  
  
  const params = new URLSearchParams(location.search);  
  if (params.get('auto') === '1') {  
    setTimeout(() => {  
      if (game.state === 'menu') startGame();  
    }, 250);  
  }  
  
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {  
    window.addEventListener('load', () => {  
      navigator.serviceWorker.register('sw.js').catch(() => {});  
    });  
  }  
  
  window.__katto = {  
    get state() {  
      return game.state;  
    },  
    get score() {  
      return game.score;  
    },  
    get best() {  
      return game.best;  
    },  
    get rice() {  
      return game.rice;  
    },  
    get wave() {  
      return game.wave;  
    },  
    get combo() {  
      return game.combo;  
    },  
    get specialCD() {  
      return game.specialCD;  
    },  
    get waryT() {  
      return game.waryT;  
    },  
    get tension() {  
      return ropes.map((r) => r.tension);  
    },  
    get birds() {  
      return birds.map((b) => ({  
        x: b.x,  
        y: b.y,  
        kind: b.kind,  
        hp: b.hp,  
        mode: b.mode,  
        rope: b.rope,  
        scared: b.scared,  
        targetT: b.targetT,  
        hopsLeft: b.hopsLeft,  
        ears: b.ears,  
        leaderT: b.leaderT,  
        summoned: b.summoned,  
      }));  
    },  
    get ropes() {  
      return ropes.map((r) => ({  
        ax: r.ax,  
        ay: r.ay,  
        pullT: r.pullT,  
        cool: r.cool,  
        tension: r.tension,  
      }));  
    },  
    start() {  
      startGame();  
    },  
    tap(x, y) {  
      processTap(x, y);  
    },  
    pullRope(i) {  
      pullRope(i);  
    },  
    spawn(kind, ropeIdx) {  
      spawnBird(kind || 'normal', ropeIdx == null ? 0 : ropeIdx);  
    },  
    place(kind, ropeIdx, x, y) {  
      spawnBird(kind || 'normal', ropeIdx == null ? 0 : ropeIdx);  
      const b = birds[birds.length - 1];  
      b.x = x;  
      b.y = y;  
      b.targetX = x;  
      b.targetY = y;  
      b.rope = ropeIdx == null ? 0 : ropeIdx;  
      b.mode = 'eat';  
      b.eatT = 999;  
      b.peckT = 999;  
      b.pecked = true;  
      b.hopsLeft = 0;  
      if (b.kind === 'leader') {  
        b.leaderT = 1.9;  
        b.summoned = false;  
      }  
    },  
    setTension(i, v) {  
      if (ropes[i]) ropes[i].tension = clamp01(v);  
    },  
    special() {  
      trySpecial();  
    },  
    step(dt, n) {  
      const steps = n || 1;  
      for (let i = 0; i < steps; i++) update(dt || 1 / 60);  
      render();  
    },  
  };  
})();
