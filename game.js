const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const FONT_UI = "'Rubik', sans-serif";
const FONT_TITLE = "'Black Ops One', cursive";
const TICK_MS = 1000 / 60;
const HITBOX_PADDING = 6;
const GOLD_SCORE = 15;
const MAX_LIVES = 3;

const STATE = {
  START: "START",
  PLAYING: "PLAYING",
  PAUSED: "PAUSED",
  LEVEL_COMPLETE: "LEVEL_COMPLETE",
  GAME_OVER: "GAME_OVER",
  WIN: "WIN"
};

// ============= PEMUATAN ASET SPRITE & KOORDINAT CROP ============= //
const SPRITE_META = {
  bg:         { src: "images/Background.png",  sx: 0,   sy: 0,   sw: 900, sh: 1800 },
  rail:       { src: "images/Rel.png",         sx: 131, sy: 172, sw: 340, sh: 1027 },
  brokenRail: { src: "images/Relrusak.png",    sx: 123, sy: 642, sw: 340, sh: 542  },
  player:     { src: "images/Player.png",      sx: 162, sy: 120, sw: 472, sh: 548  },
  coin:       { src: "images/Koin.png",        sx: 174, sy: 134, sw: 274, sh: 288  },
  coin2:      { src: "images/Koin2.png",       sx: 204, sy: 208, sw: 190, sh: 154  },
  rock:       { src: "images/Obstacle2.png",   sx: 132, sy: 138, sw: 334, sh: 336  },
  heartFull:  { src: "images/nyawa.png",       sx: 150, sy: 122, sw: 300, sh: 258  },
  heartEmpty: { src: "images/nyawakosong.png", sx: 150, sy: 122, sw: 300, sh: 258  },
  display:    { src: "images/display.png",     sx: 56,  sy: 44,  sw: 812, sh: 590  },
  title:      { src: "images/judul.png",       sx: 62,  sy: 100, sw: 816, sh: 482  },
  gameover:   { src: "images/gameover.png",    sx: 72,  sy: 88,  sw: 800, sh: 494  },
  btnStart:   { src: "images/btnmulai.png",    sx: 242, sy: 238, sw: 440, sh: 214  },
  btnRestart: { src: "images/btnrestart.png",  sx: 242, sy: 238, sw: 440, sh: 214  }
};

const sprites = {};
Object.keys(SPRITE_META).forEach((key) => {
  const img = new Image();
  img.src = SPRITE_META[key].src;
  sprites[key] = img;
});

function isSpriteReady(key) {
  const img = sprites[key];
  return Boolean(img && img.complete && img.naturalWidth > 0);
}

function drawSprite(key, dx, dy, dw, dh) {
  if (!isSpriteReady(key)) return false;
  const m = SPRITE_META[key];
  ctx.drawImage(sprites[key], m.sx, m.sy, m.sw, m.sh, dx, dy, dw, dh);
  return true;
}

// Definisi 3 Jalur di tengah lorong tanah tambang (di antara dinding batu kiri & kanan)
const LANES = [185, 300, 415];
const TRACK_SCALE = 0.26;
const RAIL_DRAW_W = Math.round(SPRITE_META.rail.sw * TRACK_SCALE); // ~94px
const RAIL_TILE_H = Math.round(SPRITE_META.rail.sh * TRACK_SCALE); // ~267px
const BG_TILE_H = Math.round(W * (SPRITE_META.bg.sh / SPRITE_META.bg.sw)); // 1200px

let currentLane = 1; // 0: Kiri, 1: Tengah, 2: Kanan

// Konfigurasi Level
const LEVELS = {
  1: { target: 500, speed: 7, spawnRate: 60, name: "Level 1: Mulai Menggali" },
  2: { target: 750, speed: 10, spawnRate: 45, name: "Level 2: Lorong Berbahaya" },
  3: { target: 1000, speed: 14, spawnRate: 35, name: "Level 3: Inti Tambang" }
};

let currentLevel = 1;
let score = 0;
let levelStartScore = 0;
let goldCollected = 0;
let levelStartGold = 0;
let distance = 0;
let totalDistance = 0;
let levelStartTotalDistance = 0;
let lives = MAX_LIVES;
let highScore = Number(localStorage.getItem("highScore_minecart")) || 0;
let gameState = STATE.START;
let muted = localStorage.getItem("muted_minecart") === "true";
let debugHitbox = false;
let frameCount = 0;
let trackOffset = 0;
let bgOffset = 0;
let accumulator = 0;
let lastTime = null;

// Kereta Pemain (ukuran mengikuti proporsi Player.png di atas rel)
const player = {
  x: LANES[1],
  y: H - 155,
  width: 68,
  height: 79,
  invulnerable: 0 // Waktu kedip setelah kena hit
};

let items = [];
let popups = [];
let sparks = []; // Partikel percikan roda
let uiButtons = [];

function setState(newState) {
  gameState = newState;
  if (newState !== STATE.PLAYING) stopBgm();
}

function resetTimer() {
  accumulator = 0;
  lastTime = null;
}

// ============= AUDIO (Web Audio API) ============= //
let audioCtx = null;
let masterGain = null;
let bgmGain = null;
let bgmTimer = null;
let bgmNextTime = 0;

function getAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone(freq, start, duration, type = "sine", volume = 0.2, dest = masterGain) {
  try {
    const audio = getAudio();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(start);
    osc.stop(start + duration);
  } catch (e) {}
}

function scheduleBgm() {
  if (gameState !== STATE.PLAYING || !bgmGain || audioCtx.state === "closed") return;
  const now = audioCtx.currentTime;
  const speed = LEVELS[currentLevel].speed;
  const interval = 1.5 / speed;

  while (bgmNextTime < now + 0.5) {
    playTone(100, bgmNextTime, interval * 0.8, "square", 0.1, bgmGain);
    playTone(80, bgmNextTime + interval, interval * 0.8, "square", 0.08, bgmGain);
    bgmNextTime += interval * 2;
  }
}

function startBgm() {
  if (gameState !== STATE.PLAYING) {
    stopBgm();
    return;
  }
  stopBgm();
  const audio = getAudio();
  bgmGain = audio.createGain();
  bgmGain.connect(masterGain);
  bgmNextTime = audio.currentTime + 0.1;
  scheduleBgm();
  bgmTimer = setInterval(scheduleBgm, 100);
}

function stopBgm() {
  clearInterval(bgmTimer);
  if (bgmGain) {
    try { bgmGain.disconnect(); } catch (e) {}
  }
  bgmGain = null;
}

function pauseGame() {
  if (gameState !== STATE.PLAYING) return;
  setState(STATE.PAUSED);
  stopBgm();
}

function resumeGame() {
  if (gameState !== STATE.PAUSED) return;
  resetTimer();
  setState(STATE.PLAYING);
  startBgm();
}

function playGoldSound() {
  const t = getAudio().currentTime;
  playTone(987.77, t, 0.1, "sine", 0.2);
  playTone(1318.51, t + 0.08, 0.15, "sine", 0.2);
}

function playHitSound() {
  const t = getAudio().currentTime;
  playTone(150, t, 0.3, "sawtooth", 0.3);
  playTone(100, t + 0.1, 0.3, "square", 0.3);
}

function playGameOverSound() {
  const t = getAudio().currentTime;
  [440, 349.23, 293.66, 220].forEach((f, i) => playTone(f, t + i * 0.16, 0.2, "sawtooth", 0.2));
}

function playLevelUpSound() {
  const t = getAudio().currentTime;
  [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => playTone(f, t + i * 0.15, 0.3, "square", 0.2));
}

function playClickSound() {
  const t = getAudio().currentTime;
  playTone(880, t, 0.06, "square", 0.12);
}

function runAction(action) {
  playClickSound();
  action();
}

function playWinSound() {
  const t = getAudio().currentTime;
  [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98].forEach((f, i) => playTone(f, t + i * 0.18, 0.4, "square", 0.2));
}

function toggleMute() {
  muted = !muted;
  localStorage.setItem("muted_minecart", muted);
  getAudio();
  if (masterGain) masterGain.gain.value = muted ? 0 : 1;
}

// ============= ALUR PERMAINAN ============= //

function newGame() {
  score = 0;
  goldCollected = 0;
  totalDistance = 0;
  startLevel(1);
}

function startLevel(level) {
  resetTimer();
  currentLevel = level;
  levelStartScore = score;
  levelStartGold = goldCollected;
  levelStartTotalDistance = totalDistance;
  currentLane = 1;
  player.x = LANES[currentLane];
  player.invulnerable = 0;

  distance = 0;
  lives = MAX_LIVES;

  items = [];
  popups = [];
  sparks = [];
  frameCount = 0;
  setState(STATE.PLAYING);

  startBgm();
}

function retryLevel() {
  score = levelStartScore;
  goldCollected = levelStartGold;
  totalDistance = levelStartTotalDistance;
  startLevel(currentLevel);
}

function nextLevel() {
  startLevel(currentLevel + 1);
}

function goToMenu() {
  stopBgm();
  items = [];
  popups = [];
  sparks = [];
  currentLane = 1;
  player.x = LANES[currentLane];
  player.invulnerable = 0;
  setState(STATE.START);
}

function endGame(state) {
  setState(state);
  stopBgm();

  if ((state === STATE.GAME_OVER || state === STATE.WIN) && score > highScore) {
    highScore = score;
    localStorage.setItem("highScore_minecart", highScore);
  }

  if (state === STATE.GAME_OVER) playGameOverSound();
  if (state === STATE.WIN) playWinSound();
}

function spawnItem() {
  const rate = LEVELS[currentLevel].spawnRate;
  if (frameCount % rate === 0) {
    const laneIdx = Math.floor(Math.random() * LANES.length);
    const x = LANES[laneIdx];
    const type = Math.random() < 0.4 ? "gold" : (Math.random() < 0.5 ? "rock" : "broken");

    if (type === "gold") {
      const isDoubleCoin = Math.random() < 0.35;
      items.push({
        x,
        y: -60,
        width: isDoubleCoin ? 54 : 50,
        height: isDoubleCoin ? 46 : 52,
        drawW: isDoubleCoin ? 54 : 50,
        drawH: isDoubleCoin ? 44 : 52,
        type,
        variant: isDoubleCoin ? "coin2" : "coin",
        scoreValue: isDoubleCoin ? GOLD_SCORE * 2 : GOLD_SCORE,
        goldCount: isDoubleCoin ? 2 : 1,
        markedForDeletion: false
      });
    } else if (type === "rock") {
      items.push({
        x,
        y: -70,
        width: 76,
        height: 76,
        drawW: 82,
        drawH: 82,
        type,
        markedForDeletion: false
      });
    } else {
      const brokenDrawH = Math.round(SPRITE_META.brokenRail.sh * TRACK_SCALE); // ~141px
      items.push({
        x,
        y: -90,
        width: 74,
        height: 118,
        drawW: RAIL_DRAW_W,
        drawH: brokenDrawH,
        type,
        markedForDeletion: false
      });
    }
  }
}

function getPlayerBox() {
  return {
    left: player.x - player.width / 2 + HITBOX_PADDING,
    right: player.x + player.width / 2 - HITBOX_PADDING,
    top: player.y + HITBOX_PADDING,
    bottom: player.y + player.height - HITBOX_PADDING
  };
}

function getItemBox(item) {
  const padding = item.type === "gold" ? 0 : HITBOX_PADDING;
  return {
    left: item.x - item.width / 2 + padding,
    right: item.x + item.width / 2 - padding,
    top: item.y - item.height / 2 + padding,
    bottom: item.y + item.height / 2 - padding
  };
}

function isColliding(box1, box2) {
  return (
    box1.left < box2.right &&
    box1.right > box2.left &&
    box1.top < box2.bottom &&
    box1.bottom > box2.top
  );
}

function update() {
  if (gameState !== STATE.PLAYING) return;

  frameCount++;
  const speed = LEVELS[currentLevel].speed;

  distance += speed / 30;
  totalDistance += speed / 30;

  bgOffset = (bgOffset + speed) % BG_TILE_H;
  trackOffset = (trackOffset + speed) % RAIL_TILE_H;

  // Gerakan Smooth & Efek Percikan Saat Pindah Jalur
  const diffX = LANES[currentLane] - player.x;
  player.x += diffX * 0.16;

  if (Math.abs(diffX) > 3) {
    sparks.push({
      x: player.x + (diffX > 0 ? -player.width / 2 + 6 : player.width / 2 - 6),
      y: player.y + player.height - 16,
      vx: (Math.random() - 0.5) * 2 - Math.sign(diffX) * 2.8,
      vy: Math.random() * 3 + 1.2,
      life: Math.random() * 14 + 10,
      color: Math.random() > 0.45 ? "#FFD54F" : "#FF8F00"
    });
  }

  sparks.forEach((s) => {
    s.x += s.vx;
    s.y += s.vy;
    s.life--;
  });
  sparks = sparks.filter((s) => s.life > 0);

  if (player.invulnerable > 0) player.invulnerable--;

  spawnItem();

  items.forEach((item) => {
    item.y += speed;

    if (item.y > H + 100) {
      item.markedForDeletion = true;
    }

    if (!item.markedForDeletion && isColliding(getPlayerBox(), getItemBox(item))) {
      if (item.type === "gold") {
        const pts = item.scoreValue || GOLD_SCORE;
        score += pts;
        goldCollected += item.goldCount || 1;
        playGoldSound();
        popups.push({ x: item.x, y: player.y - 16, text: `+${pts}`, life: 30, color: "#FFD54F" });
        item.markedForDeletion = true;
      } else if (player.invulnerable === 0) {
        lives--;
        playHitSound();
        player.invulnerable = 60;
        item.markedForDeletion = true;

        if (lives <= 0) {
          endGame(STATE.GAME_OVER);
        }
      }
    }
  });

  items = items.filter((i) => !i.markedForDeletion);
  popups.forEach((p) => { p.y -= 2; p.life--; });
  popups = popups.filter((p) => p.life > 0);

  const target = LEVELS[currentLevel].target;
  if (distance >= target) {
    if (currentLevel < 3) {
      setState(STATE.LEVEL_COMPLETE);
      playLevelUpSound();
      stopBgm();
    } else {
      endGame(STATE.WIN);
    }
  }
}

// ============= FUNGSI MENGGAMBAR (DRAW) ============= //

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground() {
  ctx.fillStyle = "#362E26";
  ctx.fillRect(0, 0, W, H);

  // 1. Gambar lorong tambang (Background.png) scrolling mulus
  if (isSpriteReady("bg")) {
    const startY = Math.floor(bgOffset) - BG_TILE_H;
    for (let y = startY; y < H; y += BG_TILE_H) {
      ctx.drawImage(sprites.bg, 0, 0, SPRITE_META.bg.sw, SPRITE_META.bg.sh, 0, y, W, BG_TILE_H + 1);
    }
  }

  // 2. Gambar 3 jalur rel (Rel.png)
  // Jika ada rintangan "broken" (Relrusak) di jalur tersebut, potong area rel utuh
  // tepat di posisi patahan supaya tanah tambang terlihat di sela rel yang putus.
  LANES.forEach((lx) => {
    const brokenOnLane = items.filter((it) => it.type === "broken" && Math.abs(it.x - lx) < 5);

    ctx.save();
    if (brokenOnLane.length > 0) {
      ctx.beginPath();
      ctx.rect(lx - RAIL_DRAW_W / 2 - 8, 0, RAIL_DRAW_W + 16, H);
      brokenOnLane.forEach((br) => {
        const cutTop = br.y - br.drawH / 2 - 2;
        const cutH = br.drawH + 4;
        ctx.rect(lx - RAIL_DRAW_W / 2 - 8, cutTop, RAIL_DRAW_W + 16, cutH);
      });
      ctx.clip("evenodd");
    }

    if (isSpriteReady("rail")) {
      const startY = Math.floor(trackOffset) - RAIL_TILE_H;
      for (let y = startY; y < H; y += RAIL_TILE_H) {
        drawSprite("rail", lx - RAIL_DRAW_W / 2, y, RAIL_DRAW_W, RAIL_TILE_H + 1);
      }
    } else {
      ctx.fillStyle = "#4A3219";
      for (let y = (trackOffset % 60) - 60; y < H; y += 60) {
        ctx.fillRect(lx - 38, y, 76, 14);
      }
      ctx.strokeStyle = "#8C8C8C";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(lx - 24, 0); ctx.lineTo(lx - 24, H);
      ctx.moveTo(lx + 24, 0); ctx.lineTo(lx + 24, H);
      ctx.stroke();
    }
    ctx.restore();
  });
}

function drawCaveLighting() {
  // Vignette halus di pinggir lorong tambang agar suasana bawah tanah lebih terasa
  const gradTop = ctx.createLinearGradient(0, 0, 0, 130);
  gradTop.addColorStop(0, "rgba(8, 6, 5, 0.45)");
  gradTop.addColorStop(1, "rgba(8, 6, 5, 0)");
  ctx.fillStyle = gradTop;
  ctx.fillRect(0, 0, W, 130);

  const gradBottom = ctx.createLinearGradient(0, H - 90, 0, H);
  gradBottom.addColorStop(0, "rgba(8, 6, 5, 0)");
  gradBottom.addColorStop(1, "rgba(8, 6, 5, 0.42)");
  ctx.fillStyle = gradBottom;
  ctx.fillRect(0, H - 90, W, 90);
}

function drawSparks() {
  sparks.forEach((s) => {
    ctx.save();
    ctx.fillStyle = s.color;
    ctx.globalAlpha = Math.max(0, s.life / 24);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawPlayer() {
  if (player.invulnerable > 0 && Math.floor(frameCount / 5) % 2 === 0) return;

  ctx.save();
  ctx.translate(player.x, player.y);

  // Efek miring halus saat berpindah rel
  const diffX = LANES[currentLane] - player.x;
  const tilt = diffX * 0.0035;
  ctx.rotate(tilt);

  // Sorot lampu helm penambang ke arah depan rel
  const beamGrad = ctx.createLinearGradient(0, 22, 0, -115);
  beamGrad.addColorStop(0, "rgba(255, 226, 115, 0.28)");
  beamGrad.addColorStop(1, "rgba(255, 210, 80, 0)");
  ctx.fillStyle = beamGrad;
  ctx.beginPath();
  ctx.moveTo(-10, 22);
  ctx.lineTo(10, 22);
  ctx.lineTo(44, -115);
  ctx.lineTo(-44, -115);
  ctx.closePath();
  ctx.fill();

  // Bayangan bawah kereta
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.ellipse(0, player.height / 2 + 4, player.width * 0.44, player.height * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();

  if (!drawSprite("player", -player.width / 2, 0, player.width, player.height)) {
    roundRect(-player.width / 2, 0, player.width, player.height, 8);
    ctx.fillStyle = "#5C4033";
    ctx.fill();
  }

  ctx.restore();
}

function drawItems() {
  // Gambar rel rusak terlebih dahulu di lapisan rel, lalu batu & koin di atasnya
  const ordered = [
    ...items.filter((i) => i.type === "broken"),
    ...items.filter((i) => i.type !== "broken")
  ];

  ordered.forEach((item) => {
    ctx.save();
    ctx.translate(item.x, item.y);

    if (item.type === "broken") {
      if (!drawSprite("brokenRail", -item.drawW / 2, -item.drawH / 2, item.drawW, item.drawH)) {
        ctx.fillStyle = "#E63946";
        ctx.fillRect(-item.width / 2, -8, item.width, 16);
      }
    } else if (item.type === "rock") {
      // Bayangan batu di tanah
      ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
      ctx.beginPath();
      ctx.ellipse(2, 6, item.drawW * 0.44, item.drawH * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();

      if (!drawSprite("rock", -item.drawW / 2, -item.drawH / 2, item.drawW, item.drawH)) {
        ctx.fillStyle = "#606060";
        ctx.beginPath();
        ctx.arc(0, 0, item.width / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (item.type === "gold") {
      const bob = Math.sin((frameCount + item.x) * 0.1) * 2;
      const coinSprite = item.variant === "coin2" ? "coin2" : "coin";
      ctx.shadowColor = "rgba(255, 204, 0, 0.45)";
      ctx.shadowBlur = 10;

      if (!drawSprite(coinSprite, -item.drawW / 2, -item.drawH / 2 + bob, item.drawW, item.drawH)) {
        ctx.fillStyle = "#FFD700";
        ctx.beginPath();
        ctx.arc(0, 0, item.width / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  });
}

function drawHitboxes() {
  ctx.save();
  ctx.lineWidth = 2;

  const playerBox = getPlayerBox();
  ctx.strokeStyle = "#00FF00";
  ctx.strokeRect(
    playerBox.left,
    playerBox.top,
    playerBox.right - playerBox.left,
    playerBox.bottom - playerBox.top
  );

  ctx.strokeStyle = "#FF0000";
  items.forEach((item) => {
    const itemBox = getItemBox(item);
    ctx.strokeRect(
      itemBox.left,
      itemBox.top,
      itemBox.right - itemBox.left,
      itemBox.bottom - itemBox.top
    );
  });

  ctx.restore();
}

function drawRivet(cx, cy, r = 4) {
  ctx.save();
  ctx.fillStyle = "#7D7873";
  ctx.strokeStyle = "#1B1715";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  ctx.save();

  // Papan HUD kayu tambang dengan lis besi di bagian atas layar
  const hudH = 58;
  const woodGrad = ctx.createLinearGradient(0, 0, 0, hudH);
  woodGrad.addColorStop(0, "rgba(58, 35, 19, 0.95)");
  woodGrad.addColorStop(0.82, "rgba(34, 20, 11, 0.95)");
  woodGrad.addColorStop(1, "rgba(22, 13, 8, 0.98)");
  ctx.fillStyle = woodGrad;
  ctx.fillRect(0, 0, W, hudH);

  // Lis besi bawah HUD
  ctx.fillStyle = "#5C5854";
  ctx.fillRect(0, hudH - 5, W, 3);
  ctx.fillStyle = "#171311";
  ctx.fillRect(0, hudH - 2, W, 2);

  drawRivet(10, 10, 3.5);
  drawRivet(W - 10, 10, 3.5);
  drawRivet(10, hudH - 12, 3.5);
  drawRivet(W - 10, hudH - 12, 3.5);

  // Kiri: Level & Jarak + Progress Bar
  const target = LEVELS[currentLevel].target;
  const ratio = Math.min(1, Math.max(0, distance / target));

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = "900 13px " + FONT_UI;
  ctx.fillStyle = "#FFC928";
  ctx.fillText(`LV.${currentLevel}`, 22, 19);

  ctx.font = "bold 14px " + FONT_UI;
  ctx.fillStyle = "#F5EAD6";
  ctx.fillText(`${Math.floor(distance)} / ${target}m`, 64, 19);

  // Bar progres jarak lorong
  const barX = 22;
  const barY = 33;
  const barW = 166;
  const barH = 10;
  roundRect(barX, barY, barW, barH, 5);
  ctx.fillStyle = "#160E08";
  ctx.fill();
  ctx.strokeStyle = "#6E4A2C";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (ratio > 0) {
    roundRect(barX + 1.5, barY + 1.5, Math.max(6, (barW - 3) * ratio), barH - 3, 4);
    const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    barGrad.addColorStop(0, "#FF9800");
    barGrad.addColorStop(1, "#FFE047");
    ctx.fillStyle = barGrad;
    ctx.fill();
  }

  // Tengah: Indikator Nyawa menggunakan sprite nyawa.png & nyawakosong.png
  const heartW = 30;
  const heartH = 26;
  const heartGap = 8;
  const totalHeartsW = MAX_LIVES * heartW + (MAX_LIVES - 1) * heartGap;
  const startHeartX = W / 2 - totalHeartsW / 2;
  const heartY = (hudH - 4 - heartH) / 2;

  for (let i = 0; i < MAX_LIVES; i++) {
    const hx = startHeartX + i * (heartW + heartGap);
    const spriteKey = i < lives ? "heartFull" : "heartEmpty";
    if (!drawSprite(spriteKey, hx, heartY, heartW, heartH)) {
      ctx.fillStyle = i < lives ? "#E63946" : "#4A1C1C";
      ctx.font = "20px " + FONT_UI;
      ctx.textAlign = "center";
      ctx.fillText("♥", hx + heartW / 2, hudH / 2);
    }
  }

  // Kanan: Ikon Koin + Skor
  const scoreText = `${score}`;
  ctx.font = "900 20px " + FONT_UI;
  ctx.textAlign = "right";
  ctx.fillStyle = "#FFD54F";
  ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
  ctx.shadowBlur = 3;
  ctx.fillText(scoreText, W - 22, 28);
  ctx.shadowBlur = 0;

  const scoreWidth = ctx.measureText(scoreText).width;
  ctx.font = "bold 11px " + FONT_UI;
  ctx.fillStyle = "#C9B396";
  ctx.fillText("SKOR", W - 22 - scoreWidth - 8, 22);

  drawSprite("coin", W - 22 - scoreWidth - 38, 15, 25, 26);

  ctx.restore();
}

function drawPopups() {
  ctx.save();
  ctx.font = "bold 22px " + FONT_TITLE;
  ctx.textAlign = "center";
  popups.forEach((p) => {
    ctx.fillStyle = p.color;
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    ctx.fillText(p.text, p.x, p.y);
  });
  ctx.restore();
}

function registerUiButton(x, y, w, h, action) {
  uiButtons.push({ x, y, w, h, action: () => runAction(action) });
}

// Menggambar tombol dengan sprite asli (btnmulai.png / btnrestart.png) atau papan kayu senada
function drawMineButton(x, y, w, h, button) {
  const { text, spriteKey, variant = "gold", action } = button;

  if (spriteKey && isSpriteReady(spriteKey)) {
    drawSprite(spriteKey, x, y, w, h);
    registerUiButton(x, y, w, h, action);
    return;
  }

  ctx.save();

  // Bayangan bawah papan tombol
  roundRect(x, y + 4, w, h, 10);
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fill();

  // Badan papan kayu tambang
  roundRect(x, y, w, h, 10);
  const plankGrad = ctx.createLinearGradient(0, y, 0, y + h);
  if (variant === "red") {
    plankGrad.addColorStop(0, "#A93326");
    plankGrad.addColorStop(0.8, "#7D2319");
    plankGrad.addColorStop(1, "#54160F");
  } else if (variant === "slate") {
    plankGrad.addColorStop(0, "#5B4634");
    plankGrad.addColorStop(0.8, "#3F2F22");
    plankGrad.addColorStop(1, "#2A1F16");
  } else {
    plankGrad.addColorStop(0, "#8B572A");
    plankGrad.addColorStop(0.8, "#673E1C");
    plankGrad.addColorStop(1, "#452810");
  }
  ctx.fillStyle = plankGrad;
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = "#221308";
  ctx.stroke();

  // Lis besi bagian bawah papan (menyerupai btnmulai.png & btnrestart.png)
  ctx.fillStyle = "#7E7872";
  ctx.fillRect(x + 4, y + h - 10, w - 8, 3);

  // Paku keling di 4 sudut tombol
  drawRivet(x + 11, y + 11, 3.5);
  drawRivet(x + w - 11, y + 11, 3.5);
  drawRivet(x + 11, y + h - 15, 3.5);
  drawRivet(x + w - 11, y + h - 15, 3.5);

  // Teks tombol bergaya tebal kontras
  ctx.font = "900 18px " + FONT_UI;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#140B05";
  ctx.strokeText(text, x + w / 2, y + h / 2 - 2);
  ctx.fillStyle = variant === "slate" ? "#F5EAD6" : "#FFD54F";
  ctx.fillText(text, x + w / 2, y + h / 2 - 2);

  ctx.restore();
  registerUiButton(x, y, w, h, action);
}

function getPrimaryAction() {
  if (gameState === STATE.START || gameState === STATE.WIN) return newGame;
  if (gameState === STATE.LEVEL_COMPLETE) return nextLevel;
  if (gameState === STATE.GAME_OVER) return retryLevel;
  return null;
}

function drawDisplayBoard(x, y, w, h) {
  if (!drawSprite("display", x, y, w, h)) {
    roundRect(x, y, w, h, 16);
    ctx.fillStyle = "#29190A";
    ctx.fill();
    ctx.strokeStyle = "#6E4526";
    ctx.lineWidth = 8;
    ctx.stroke();
  }
  // Mengembalikan area dalam papan gelap tempat teks & tombol aman ditempatkan
  return {
    left: x + w * 0.1,
    right: x + w * 0.9,
    top: y + h * 0.175,
    bottom: y + h * 0.9,
    width: w * 0.8,
    height: h * 0.725
  };
}

function drawStartOverlay() {
  ctx.fillStyle = "rgba(10, 7, 5, 0.58)";
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  // Logo judul.png di bagian atas
  const logoW = 410;
  const logoH = Math.round(logoW * (SPRITE_META.title.sh / SPRITE_META.title.sw)); // ~242px
  const logoX = W / 2 - logoW / 2;
  const logoY = 58;
  if (!drawSprite("title", logoX, logoY, logoW, logoH)) {
    ctx.fillStyle = "#FFD54F";
    ctx.font = "bold 42px " + FONT_TITLE;
    ctx.textAlign = "center";
    ctx.fillText("MINECART RUSH", W / 2, logoY + 120);
  }

  // Papan display.png di bawah logo
  const boardW = 460;
  const boardH = 335;
  const boardX = W / 2 - boardW / 2;
  const boardY = 312;
  const inner = drawDisplayBoard(boardX, boardY, boardW, boardH);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#F5EAD6";
  ctx.font = "bold 16px " + FONT_UI;
  ctx.fillText("Geser kiri / kanan untuk berpindah rel", W / 2, inner.top + 28);

  ctx.fillStyle = "#D7C2A6";
  ctx.font = "14px " + FONT_UI;
  ctx.fillText("Kumpulkan koin emas & hindari batu maupun rel putus!", W / 2, inner.top + 54);

  // Badge High Score
  ctx.fillStyle = "#FFD54F";
  ctx.font = "bold 16px " + FONT_UI;
  ctx.fillText(`🏆 High Score: ${highScore}`, W / 2, inner.top + 88);

  // Tombol MULAI menggunakan sprite btnmulai.png
  const startBtnW = 212;
  const startBtnH = Math.round(startBtnW * (SPRITE_META.btnStart.sh / SPRITE_META.btnStart.sw)); // ~108px
  drawMineButton(W / 2 - startBtnW / 2, inner.bottom - startBtnH - 8, startBtnW, startBtnH, {
    text: "MULAI!",
    spriteKey: "btnStart",
    action: newGame
  });

  ctx.restore();
}

function drawGameOverOverlay() {
  ctx.fillStyle = "rgba(12, 6, 5, 0.72)";
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  // Header gameover.png ("KECELAKAAN!") di bagian atas
  const goW = 415;
  const goH = Math.round(goW * (SPRITE_META.gameover.sh / SPRITE_META.gameover.sw)); // ~256px
  if (!drawSprite("gameover", W / 2 - goW / 2, 42, goW, goH)) {
    ctx.fillStyle = "#EF473A";
    ctx.font = "bold 40px " + FONT_TITLE;
    ctx.textAlign = "center";
    ctx.fillText("KECELAKAAN!", W / 2, 175);
  }

  // Papan display.png untuk statistik & tombol aksi
  const boardW = 472;
  const boardH = 398;
  const inner = drawDisplayBoard(W / 2 - boardW / 2, 294, boardW, boardH);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#F5EAD6";
  ctx.font = "bold 16px " + FONT_UI;
  ctx.fillText(`Jarak Level Ini: ${Math.floor(distance)}m`, W / 2, inner.top + 24);
  ctx.fillText(`Total Emas: ${goldCollected}   |   Skor: ${score}`, W / 2, inner.top + 50);

  ctx.fillStyle = "#FFD54F";
  ctx.font = "bold 15px " + FONT_UI;
  ctx.fillText(`🏆 High Score: ${highScore}`, W / 2, inner.top + 78);

  // Tombol ULANG LEVEL menggunakan sprite btnrestart.png
  const restartW = 192;
  const restartH = Math.round(restartW * (SPRITE_META.btnRestart.sh / SPRITE_META.btnRestart.sw)); // ~98px
  const restartY = inner.top + 102;
  drawMineButton(W / 2 - restartW / 2, restartY, restartW, restartH, {
    text: "ULANG LEVEL",
    spriteKey: "btnRestart",
    variant: "red",
    action: retryLevel
  });

  // Tombol MENU UTAMA papan kayu senada
  const menuW = 192;
  const menuH = 54;
  drawMineButton(W / 2 - menuW / 2, restartY + restartH + 10, menuW, menuH, {
    text: "MENU UTAMA",
    variant: "slate",
    action: goToMenu
  });

  ctx.restore();
}

function drawBoardModal(title, titleColor, lines, buttons) {
  ctx.fillStyle = "rgba(10, 7, 5, 0.72)";
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  const boardW = 484;
  const boardH = buttons.length >= 3 ? 470 : 410;
  const boardY = H / 2 - boardH / 2 - 10;
  const inner = drawDisplayBoard(W / 2 - boardW / 2, boardY, boardW, boardH);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Judul modal
  ctx.font = "bold 32px " + FONT_TITLE;
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#120A04";
  ctx.strokeText(title, W / 2, inner.top + 30);
  ctx.fillStyle = titleColor;
  ctx.fillText(title, W / 2, inner.top + 30);

  // Baris statistik
  ctx.font = "bold 15px " + FONT_UI;
  lines.forEach((line, idx) => {
    ctx.fillStyle = idx === lines.length - 1 && line.includes("High") ? "#FFD54F" : "#F5EAD6";
    ctx.fillText(line, W / 2, inner.top + 72 + idx * 24);
  });

  // Susun tombol dari bawah area dalam papan ke atas agar proporsional
  let cursorY = inner.bottom - 10;
  for (let i = buttons.length - 1; i >= 0; i--) {
    const btn = buttons[i];
    const bw = btn.spriteKey ? 184 : 216;
    const bh = btn.spriteKey
      ? Math.round(bw * (SPRITE_META.btnRestart.sh / SPRITE_META.btnRestart.sw))
      : 52;
    cursorY -= bh;
    drawMineButton(W / 2 - bw / 2, cursorY, bw, bh, btn);
    cursorY -= 10;
  }

  ctx.restore();
}

function drawCornerPlaque(x, y, w, h, label, activeAlert, action) {
  ctx.save();
  roundRect(x, y, w, h, 7);
  ctx.fillStyle = activeAlert ? "rgba(184, 37, 24, 0.92)" : "rgba(38, 23, 13, 0.9)";
  ctx.fill();
  ctx.strokeStyle = "#8C8782";
  ctx.lineWidth = 1.8;
  ctx.stroke();

  drawRivet(x + 8, y + h / 2, 2.4);
  drawRivet(x + w - 8, y + h / 2, 2.4);

  ctx.fillStyle = "#F5EAD6";
  ctx.font = "bold 13px " + FONT_UI;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.restore();

  // Area sentuh diperluas sedikit agar nyaman ditekan di layar HP
  const pad = 8;
  registerUiButton(x - pad, y - pad, w + pad * 2, h + pad * 2, action);
}

function drawMuteBtn() {
  drawCornerPlaque(W - 136, H - 48, 122, 36, muted ? "🔇 Suara OFF" : "🔊 Suara ON", muted, toggleMute);
}

function drawPauseBtn() {
  drawCornerPlaque(14, H - 48, 110, 36, "⏸ Pause", false, pauseGame);
}

function draw() {
  uiButtons = [];
  drawBackground();
  drawSparks();
  drawItems();
  drawPlayer();
  drawCaveLighting();

  if ([STATE.PLAYING, STATE.PAUSED, STATE.LEVEL_COMPLETE, STATE.GAME_OVER, STATE.WIN].includes(gameState)) {
    if (debugHitbox) drawHitboxes();
    drawHUD();
    drawPopups();
  }

  if (gameState === STATE.START) {
    drawStartOverlay();
  } else if (gameState === STATE.PAUSED) {
    drawBoardModal(
      "PAUSE",
      "#FFD54F",
      [
        `${LEVELS[currentLevel].name}`,
        `Jarak: ${Math.floor(distance)} / ${LEVELS[currentLevel].target}m   |   Skor: ${score}`
      ],
      [
        { text: "LANJUT", variant: "gold", action: resumeGame },
        { text: "ULANG LEVEL", spriteKey: "btnRestart", variant: "red", action: retryLevel },
        { text: "MENU UTAMA", variant: "slate", action: goToMenu }
      ]
    );
  } else if (gameState === STATE.LEVEL_COMPLETE) {
    drawBoardModal(
      `LEVEL ${currentLevel} SELESAI`,
      "#FFD54F",
      [
        `Jarak Level Ini: ${Math.floor(distance)}m`,
        `Total Emas: ${goldCollected}   |   Skor: ${score}`
      ],
      [
        { text: "LEVEL BERIKUTNYA", variant: "gold", action: nextLevel },
        { text: "MENU UTAMA", variant: "slate", action: goToMenu }
      ]
    );
  } else if (gameState === STATE.GAME_OVER) {
    drawGameOverOverlay();
  } else if (gameState === STATE.WIN) {
    drawBoardModal(
      "TAMAT!",
      "#FFE047",
      [
        `Total Jarak Tambang: ${Math.floor(totalDistance)}m`,
        `Total Emas: ${goldCollected}   |   Skor: ${score}`,
        `🏆 High Score: ${highScore}`
      ],
      [
        { text: "MAIN LAGI", variant: "gold", action: newGame },
        { text: "MENU UTAMA", variant: "slate", action: goToMenu }
      ]
    );
  }

  drawMuteBtn();
  if (gameState === STATE.PLAYING) drawPauseBtn();
}

function gameLoop(timestamp) {
  if (lastTime === null) lastTime = timestamp;
  const delta = Math.min(timestamp - lastTime, 250);
  lastTime = timestamp;
  accumulator += delta;

  while (accumulator >= TICK_MS) {
    if (gameState === STATE.PLAYING) update();
    accumulator -= TICK_MS;
  }

  draw();
  requestAnimationFrame(gameLoop);
}

function moveLane(direction) {
  const nextLane = currentLane + direction;
  if (nextLane >= 0 && nextLane < LANES.length) currentLane = nextLane;
}

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) || e.code === "Space") {
    e.preventDefault();
  }

  if (gameState === STATE.PLAYING && !e.repeat) {
    if (e.key === "ArrowLeft" || key === "a") {
      moveLane(-1);
    } else if (e.key === "ArrowRight" || key === "d") {
      moveLane(1);
    }
  }
  if (!e.repeat && (key === "p" || e.key === "Escape")) {
    if (gameState === STATE.PLAYING) runAction(pauseGame);
    else if (gameState === STATE.PAUSED) runAction(resumeGame);
  }
  if (gameState === STATE.PAUSED && !e.repeat) {
    if (key === "r") runAction(retryLevel);
    if (key === "q") runAction(goToMenu);
  }
  if ((e.key === "Enter" || e.code === "Space") && !e.repeat) {
    const action = getPrimaryAction();
    if (action) runAction(action);
    else if (e.key === "Enter" && gameState === STATE.PAUSED) runAction(resumeGame);
  }
  if (key === "r" && gameState === STATE.GAME_OVER && !e.repeat) runAction(retryLevel);
  if (key === "q" && [STATE.LEVEL_COMPLETE, STATE.GAME_OVER, STATE.WIN].includes(gameState)) runAction(goToMenu);
  if (key === "m") toggleMute();
  if (key === "h" && !e.repeat) debugHitbox = !debugHitbox;
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && gameState === STATE.PLAYING) pauseGame();
});

window.addEventListener("blur", () => {
  if (gameState === STATE.PLAYING) pauseGame();
});

function getCanvasCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (W / rect.width),
    y: (clientY - rect.top) * (H / rect.height)
  };
}

function findUiButton(x, y) {
  for (const button of uiButtons) {
    if (x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) {
      return button;
    }
  }
  return null;
}

function handlePointer(x, y) {
  const button = findUiButton(x, y);
  if (button) {
    button.action();
    return;
  }

  if (gameState === STATE.PLAYING) {
    moveLane(x < W / 2 ? -1 : 1);
  }
}

canvas.addEventListener("mousemove", (e) => {
  const { x, y } = getCanvasCoords(e.clientX, e.clientY);
  canvas.style.cursor = findUiButton(x, y) ? "pointer" : "default";
});

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  const { x, y } = getCanvasCoords(e.clientX, e.clientY);
  handlePointer(x, y);
});

// Dukungan layar sentuh HP: mendukung Geser (Swipe kiri/kanan) MAUPUN Tap sisi layar
const SWIPE_THRESHOLD = 32;
const touchState = {
  active: false,
  startX: 0,
  startY: 0,
  swiped: false
};

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  getAudio(); // Aktifkan audio pada interaksi sentuhan pertama di browser HP
  const touch = e.changedTouches[0];
  const { x, y } = getCanvasCoords(touch.clientX, touch.clientY);
  touchState.active = true;
  touchState.startX = x;
  touchState.startY = y;
  touchState.swiped = false;
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  if (!touchState.active || touchState.swiped || gameState !== STATE.PLAYING) return;

  const touch = e.changedTouches[0];
  const { x, y } = getCanvasCoords(touch.clientX, touch.clientY);
  const dx = x - touchState.startX;
  const dy = y - touchState.startY;

  if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
    moveLane(dx > 0 ? 1 : -1);
    touchState.swiped = true;
  }
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  if (!touchState.active) return;

  const touch = e.changedTouches[0];
  const { x, y } = getCanvasCoords(touch.clientX, touch.clientY);

  if (!touchState.swiped) {
    // Jika bukan swipe (hanya tap), cek tombol UI atau tap sisi kiri/kanan layar
    const btnAtStart = findUiButton(touchState.startX, touchState.startY);
    if (btnAtStart) {
      btnAtStart.action();
    } else {
      handlePointer(x, y);
    }
  }

  touchState.active = false;
  touchState.swiped = false;
}, { passive: false });

canvas.addEventListener("touchcancel", () => {
  touchState.active = false;
  touchState.swiped = false;
});

gameLoop();
