const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const FONT_UI = "'Rubik', sans-serif";
const FONT_TITLE = "'Black Ops One', cursive";
const TICK_MS = 1000 / 60;
const HITBOX_PADDING = 6;

const STATE = {
  START: "START",
  PLAYING: "PLAYING",
  LEVEL_COMPLETE: "LEVEL_COMPLETE",
  GAME_OVER: "GAME_OVER",
  WIN: "WIN"
};

// Definisi 3 Jalur (Lanes)
const LANES = [100, 300, 500]; 
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
let distance = 0;
let lives = 3;
let highScore = Number(localStorage.getItem("highScore_minecart")) || 0;
let gameState = STATE.START;
let muted = false;
let debugHitbox = false;
let messageTimer = 0;
let frameCount = 0;
let trackOffset = 0;
let accumulator = 0;
let lastTime = null;

// Kereta Pemain
const player = {
  x: LANES[1],
  y: H - 150,
  width: 60,
  height: 90,
  invulnerable: 0 // Waktu kedip setelah kena hit
};

let items = [];
let popups = [];
let sparks = []; // Partikel percikan roda
const keysPressed = {};

function setState(newState) {
  gameState = newState;
}

function resetTimer() {
  accumulator = 0;
  lastTime = null;
}

// Audio 
let audioCtx = null;
let masterGain = null;
let bgmGain = null;
let bgmTimer = null;
let bgmNextTime = 0;

function getAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
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
  if (!bgmGain || audioCtx.state === "closed") return;
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

function playLevelUpSound() {
  const t = getAudio().currentTime;
  [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => playTone(f, t + i * 0.15, 0.3, "square", 0.2));
}

function toggleMute() {
  muted = !muted;
  getAudio();
  if (masterGain) masterGain.gain.value = muted ? 0 : 1;
}

function newGame() {
  score = 0;
  startLevel(1);
}

function startLevel(level) {
  resetTimer();
  currentLevel = level;
  levelStartScore = score;
  currentLane = 1;
  player.x = LANES[currentLane];
  
  distance = 0;
  lives = 3;
  
  items = [];
  popups = [];
  sparks = [];
  frameCount = 0;
  messageTimer = 0;
  setState(STATE.PLAYING);
  
  startBgm();
}

function retryLevel() {
  score = levelStartScore;
  startLevel(currentLevel);
}

function nextLevel() {
  startLevel(currentLevel + 1);
}

function endGame(state) {
  setState(state);
  stopBgm();
  
  if ((state === STATE.GAME_OVER || state === STATE.WIN) && score > highScore) {
    highScore = score;
    localStorage.setItem("highScore_minecart", highScore);
  }
  
  if (state === STATE.WIN) playLevelUpSound();
}

function spawnItem() {
  const rate = LEVELS[currentLevel].spawnRate;
  if (frameCount % rate === 0) {
    const laneIdx = Math.floor(Math.random() * 3);
    const x = LANES[laneIdx];
    
    const isGold = Math.random() < 0.4;
    items.push({
      x: x,
      y: -50,
      width: 50,
      height: 50,
      type: isGold ? "gold" : (Math.random() < 0.5 ? "rock" : "broken"),
      markedForDeletion: false
    });
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
  
  trackOffset += speed;
  if (trackOffset > 100) trackOffset = 0;

  // Gerakan Smooth & Efek Percikan Saat Pindah Jalur
  const diffX = LANES[currentLane] - player.x;
  player.x += diffX * 0.15;
  
  if (Math.abs(diffX) > 3) {
    // Generate percikan api roda
    sparks.push({
      x: player.x + (diffX > 0 ? -player.width/2 : player.width/2),
      y: player.y + player.height - 20,
      vx: (Math.random() - 0.5) * 2 - Math.sign(diffX) * 3,
      vy: Math.random() * 3 + 1,
      life: Math.random() * 15 + 10,
      color: Math.random() > 0.5 ? "#FFD700" : "#FFA500"
    });
  }

  // Update partikel api
  sparks.forEach(s => {
    s.x += s.vx;
    s.y += s.vy;
    s.life--;
  });
  sparks = sparks.filter(s => s.life > 0);
  
  if (player.invulnerable > 0) player.invulnerable--;
  if (messageTimer > 0) messageTimer--;

  spawnItem();
  
  items.forEach(item => {
    item.y += speed; 
    
    if (item.y > H + 50) {
      item.markedForDeletion = true;
    }

    if (!item.markedForDeletion && isColliding(getPlayerBox(), getItemBox(item))) {
      if (item.type === "gold") {
        score += 15;
        playGoldSound();
        popups.push({ x: item.x, y: player.y - 20, text: "+15", life: 30, color: "#FFD700" });
        item.markedForDeletion = true;
      } else if (player.invulnerable === 0) {
        lives--;
        playHitSound();
        player.invulnerable = 60; 
        messageTimer = 40;
        item.markedForDeletion = true;
        
        if (lives <= 0) {
          endGame(STATE.GAME_OVER);
        }
      }
    }
  });

  items = items.filter(i => !i.markedForDeletion);
  popups.forEach(p => { p.y -= 2; p.life--; });
  popups = popups.filter(p => p.life > 0);

  const target = LEVELS[currentLevel].target;
  if (distance >= target) {
    if (currentLevel < 3) {
      setState(STATE.LEVEL_COMPLETE);
      playLevelUpSound();
      stopBgm();
      setTimeout(() => {
        if (gameState === STATE.LEVEL_COMPLETE) nextLevel();
      }, 2000);
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
  ctx.fillStyle = "#1A1412"; 
  ctx.fillRect(0, 0, W, H);

  ctx.lineWidth = 4;
  LANES.forEach(lx => {
    ctx.fillStyle = "#4A3219";
    for (let y = trackOffset - 100; y < H; y += 100) {
      ctx.fillRect(lx - 40, y, 80, 16);
    }
    ctx.strokeStyle = "#808080";
    ctx.beginPath();
    ctx.moveTo(lx - 25, 0); ctx.lineTo(lx - 25, H);
    ctx.moveTo(lx + 25, 0); ctx.lineTo(lx + 25, H);
    ctx.stroke();
  });
}

function drawSparks() {
  sparks.forEach(s => {
    ctx.fillStyle = s.color;
    ctx.globalAlpha = s.life / 25;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  });
}

function drawPlayer() {
  if (player.invulnerable > 0 && Math.floor(frameCount / 5) % 2 === 0) return;

  ctx.save();
  ctx.translate(player.x, player.y);
  
  // Efek Miring (Tilt) saat pindah jalur
  const diffX = LANES[currentLane] - player.x;
  const tilt = diffX * 0.004; 
  ctx.rotate(tilt);

  // Roda Kereta
  ctx.fillStyle = "#222";
  ctx.fillRect(-player.width/2 - 6, 10, 8, 24);
  ctx.fillRect(player.width/2 - 2, 10, 8, 24);
  ctx.fillRect(-player.width/2 - 6, player.height - 34, 8, 24);
  ctx.fillRect(player.width/2 - 2, player.height - 34, 8, 24);

  // Badan Kereta
  roundRect(-player.width/2, 0, player.width, player.height, 8);
  ctx.fillStyle = "#5C4033";
  ctx.fill();
  ctx.strokeStyle = "#8A8A8A";
  ctx.lineWidth = 6;
  ctx.stroke();

  // --- KARAKTER PENAMBANG (Top-Down View) ---
  
  // Baju Biru Pekerja
  ctx.fillStyle = "#1D3557"; 
  roundRect(-16, 25, 32, 25, 6);
  ctx.fill();

  // Tumpukan Emas di Kargo Belakang
  ctx.fillStyle = "#FFD700";
  ctx.beginPath();
  ctx.arc(-10, 65, 10, 0, Math.PI*2);
  ctx.arc(12, 68, 8, 0, Math.PI*2);
  ctx.arc(0, 75, 11, 0, Math.PI*2);
  ctx.fill();
  
  // Helm Kuning Keselamatan
  ctx.fillStyle = "#FFB703";
  ctx.beginPath();
  ctx.arc(0, 30, 16, 0, Math.PI*2);
  ctx.fill();
  
  // Lampu Senter Kepala
  ctx.fillStyle = "#FFF";
  ctx.fillRect(-6, 12, 12, 6);
  
  // Efek Sinar Senter ke Depan
  ctx.fillStyle = "rgba(255, 230, 0, 0.25)";
  ctx.beginPath();
  ctx.moveTo(-6, 12);
  ctx.lineTo(6, 12);
  ctx.lineTo(35, -50);
  ctx.lineTo(-35, -50);
  ctx.fill();

  ctx.restore();
}

function drawItems() {
  items.forEach(item => {
    ctx.save();
    ctx.translate(item.x, item.y);
    
    if (item.type === "gold") {
      ctx.fillStyle = "#FFD700";
      ctx.shadowColor = "#FFD700";
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.moveTo(0, -item.height/2);
      ctx.lineTo(item.width/2, 0);
      ctx.lineTo(0, item.height/2);
      ctx.lineTo(-item.width/2, 0);
      ctx.fill();
    } 
    else if (item.type === "rock") {
      ctx.fillStyle = "#505050";
      ctx.beginPath();
      ctx.arc(0, 0, item.width/2, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = "#303030";
      ctx.beginPath();
      ctx.arc(-5, -5, item.width/4, 0, Math.PI*2);
      ctx.fill();
    }
    else if (item.type === "broken") {
      ctx.fillStyle = "#E63946";
      ctx.fillRect(-item.width/2, -5, item.width, 10);
      ctx.fillRect(-5, -item.height/2, 10, item.height);
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
  items.forEach(item => {
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

function drawHUD() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, W, 50);

  ctx.font = "bold 18px " + FONT_UI;
  ctx.textBaseline = "middle";

  const target = LEVELS[currentLevel].target;
  ctx.fillStyle = "#00F0FF";
  ctx.textAlign = "left";
  ctx.fillText(`Jarak: ${Math.floor(distance)} / ${target}m`, 15, 25);

  ctx.fillStyle = "#E63946";
  ctx.textAlign = "center";
  let hearts = "";
  for(let i=0; i<lives; i++) hearts += "❤️ ";
  ctx.fillText(hearts, W / 2, 25);

  ctx.fillStyle = "#FFD700";
  ctx.textAlign = "right";
  ctx.fillText(`Skor: ${score}`, W - 15, 25);

  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.textAlign = "left";
  ctx.font = "14px " + FONT_UI;
  ctx.fillText(`Lv. ${currentLevel}`, 15, 70);
}

function drawPopups() {
  ctx.save();
  ctx.font = "bold 22px " + FONT_TITLE;
  ctx.textAlign = "center";
  popups.forEach(p => {
    ctx.fillStyle = p.color;
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    ctx.fillText(p.text, p.x, p.y);
  });
  ctx.restore();
}

const btnW = 200, btnH = 50;

function drawButton(y, text, color) {
  roundRect(W/2 - btnW/2, y, btnW, btnH, 8);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = "#121010";
  ctx.font = "bold 20px " + FONT_UI;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W/2, y + btnH/2);
}

function drawOverlay(title, subtitle, btnText, btnColor) {
  ctx.fillStyle = "rgba(18, 16, 16, 0.85)";
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  roundRect(W/2 - 200, H/2 - 150, 400, 300, 16);
  ctx.fillStyle = "#2B2118";
  ctx.fill();
  ctx.strokeStyle = "#FFD700";
  ctx.lineWidth = 3;
  ctx.stroke();
  
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 36px " + FONT_TITLE;
  ctx.textAlign = "center";
  ctx.fillText(title, W/2, H/2 - 70);

  ctx.fillStyle = "#F1F1F1";
  ctx.font = "16px " + FONT_UI;
  ctx.fillText(subtitle, W/2, H/2 - 20);
  
  if (gameState === STATE.START || gameState === STATE.GAME_OVER || gameState === STATE.WIN) {
    ctx.fillStyle = "#A0A0A0";
    ctx.fillText(`🏆 High Score: ${highScore}`, W/2, H/2 + 20);
  }

  if (btnText) drawButton(H/2 + 60, btnText, btnColor);
  ctx.restore();
}

function drawMuteBtn() {
  ctx.save();
  roundRect(W - 120, H - 40, 100, 30, 4);
  ctx.fillStyle = muted ? "#E63946" : "rgba(0,0,0,0.6)";
  ctx.fill();
  ctx.strokeStyle = "#FFF";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#FFF";
  ctx.font = "12px " + FONT_UI;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(muted ? "🔇 Suara OFF" : "🔊 Suara ON", W - 70, H - 25);
  ctx.restore();
}

function draw() {
  drawBackground();
  
  if (gameState === STATE.PLAYING || gameState === STATE.LEVEL_COMPLETE) {
    drawSparks();
    drawItems();
    drawPlayer();
    if (debugHitbox) drawHitboxes();
    drawHUD();
    drawPopups();
  }

  if (gameState === STATE.START) {
    drawOverlay("MINECART RUSH", "Geser kiri/kanan. Kumpulkan Emas!", "MULAI", "#FFD700");
  } else if (gameState === STATE.LEVEL_COMPLETE) {
    drawOverlay("LEVEL SELESAI!", `Bersiap untuk Level ${currentLevel + 1}...`, "", "");
  } else if (gameState === STATE.GAME_OVER) {
    drawOverlay("KECELAKAAN!", `Jarak: ${Math.floor(distance)}m | Skor: ${score}`, "ULANG LEVEL", "#E63946");
  } else if (gameState === STATE.WIN) {
    drawOverlay("TAMAT!", `Luar Biasa! Total Skor: ${score}`, "MAIN DARI AWAL", "#00F0FF");
  }

  drawMuteBtn();

  const msgEl = document.getElementById("message");
  if (msgEl) {
    msgEl.textContent = messageTimer > 0 ? "⚠️ AWAS NABRAK!" : "";
  }
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
  if (e.key === "Enter") {
    if (gameState === STATE.START || gameState === STATE.WIN) newGame();
    else if (gameState === STATE.GAME_OVER) retryLevel();
  }
  if (key === "m") toggleMute();
  if (key === "h" && !e.repeat) debugHitbox = !debugHitbox;
});

function handlePointer(x, y) {
  if (x >= W - 120 && x <= W - 20 && y >= H - 40 && y <= H - 10) {
    toggleMute();
    return;
  }

  if (gameState === STATE.START || gameState === STATE.WIN) {
    newGame();
    return;
  }
  if (gameState === STATE.GAME_OVER) {
    retryLevel();
    return;
  }

  if (gameState === STATE.PLAYING) {
    moveLane(x < W / 2 ? -1 : 1);
  }
}

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (W / rect.width);
  const y = (e.clientY - rect.top) * (H / rect.height);
  handlePointer(x, y);
});

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches[0];
  const x = (touch.clientX - rect.left) * (W / rect.width);
  const y = (touch.clientY - rect.top) * (H / rect.height);
  handlePointer(x, y);
}, { passive: false });

gameLoop();
