const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// SOCKET
const socket = io();
let myId;
let onlinePlayers = {};

// WORLD
const world = { width: 2000, height: 2000 };

// CAMERA
const camera = { x: 0, y: 0 };

// PLAYER
const player1 = {
  x: 100,
  y: 100,
  size: 20,
  color: "red",
  health: 100,
  displayHealth: 100,
  weapon: "pistol",
  recoil: 0
};

// BOTS
const bots = [];
function spawnBot() {
  bots.push({
    x: Math.random() * world.width,
    y: Math.random() * world.height,
    size: 20,
    color: "purple",
    health: 100,
    weapon: "pistol",
    hitTimer: 0
  });
}
for (let i = 0; i < 5; i++) spawnBot();

// INPUT
const keys = {};
let mouse = { x: 0, y: 0 };

window.addEventListener("keydown", e => keys[e.key] = true);
window.addEventListener("keyup", e => keys[e.key] = false);

canvas.addEventListener("mousemove", e => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
});

// WEAPONS
const weapons = {
  pistol: { fireRate: 200, speed: 6, damage: 10, spread: 0, bullets: 1 },
  shotgun: { fireRate: 500, speed: 5, damage: 8, spread: 0.4, bullets: 5 },
  sniper: { fireRate: 800, speed: 10, damage: 30, spread: 0, bullets: 1 },
  smg: { fireRate: 80, speed: 5, damage: 6, spread: 0.15, bullets: 1 }
};

// BULLETS
const bullets = [];

// EFFECTS
const effects = [];
const flashes = [];

// SOUND
const shootSound = new Audio("sounds/shoot.mp3");
const hitSound = new Audio("sounds/hit.mp3");
const lootSound = new Audio("sounds/loot.mp3");

// SHOOT CONTROL
let isMouseDown = false;
let lastShot = 0;

canvas.addEventListener("mousedown", () => isMouseDown = true);
canvas.addEventListener("mouseup", () => isMouseDown = false);

// WORLD MOUSE
function getWorldMouse() {
  return {
    x: mouse.x + camera.x,
    y: mouse.y + camera.y
  };
}

// SHOOT
function shoot(player) {
  const now = Date.now();
  const w = weapons[player.weapon];

  if (now - lastShot < w.fireRate) return;
  lastShot = now;

  const wm = getWorldMouse();

  const centerX = player.x + player.size / 2;
  const centerY = player.y + player.size / 2;

  const baseAngle = Math.atan2(wm.y - centerY, wm.x - centerX);

  for (let i = 0; i < w.bullets; i++) {
    const spread = (Math.random() - 0.5) * w.spread;

    const angle = baseAngle + spread;

    bullets.push({
      x: centerX,
      y: centerY,
      dx: Math.cos(angle) * w.speed,
      dy: Math.sin(angle) * w.speed,
      size: 5,
      damage: w.damage,
      owner: player
    });
  }

  // recoil
  player.recoil = 5;

  // muzzle flash
  flashes.push({ x: centerX, y: centerY, life: 5 });

  // sound
  new Audio("sounds/shoot.mp3").play();
}

// AUTO FIRE
function handleAutoFire() {
  if (isMouseDown) {
    shoot(player1);
  }
}

// UPDATE BULLETS
function updateBullets() {
  bullets.forEach((b, i) => {
    b.x += b.dx;
    b.y += b.dy;

    // hit bots
    bots.forEach((bot, j) => {
      if (
        Math.abs(b.x - bot.x) < bot.size &&
        Math.abs(b.y - bot.y) < bot.size &&
        b.owner !== bot
      ) {
        bot.health -= b.damage;
        bot.hitTimer = 10;

        effects.push({ x: b.x, y: b.y, radius: 5, life: 10 });

        new Audio("sounds/hit.mp3").play();

        if (bot.health <= 0) {
          bots.splice(j, 1);
        }

        bullets.splice(i, 1);
      }
    });
  });
}

// MOVEMENT
function movePlayers() {
  if (keys["w"]) player1.y -= 3;
  if (keys["s"]) player1.y += 3;
  if (keys["a"]) player1.x -= 3;
  if (keys["d"]) player1.x += 3;

  keepInBounds(player1);

  // send to server
  socket.emit("move", {
    x: player1.x,
    y: player1.y
  });
}

// KEEP INSIDE WORLD
function keepInBounds(p) {
  p.x = Math.max(0, Math.min(p.x, world.width - p.size));
  p.y = Math.max(0, Math.min(p.y, world.height - p.size));
}

// BOT AI
let lastBotShot = 0;

function moveBots() {
  bots.forEach(bot => {
    const dx = player1.x - bot.x;
    const dy = player1.y - bot.y;

    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 5) {
      bot.x += (dx / dist) * 2;
      bot.y += (dy / dist) * 2;
    }

    keepInBounds(bot);
  });
}

function botsShoot() {
  const now = Date.now();

  bots.forEach(bot => {
    const w = weapons[bot.weapon];

    if (now - lastBotShot < w.fireRate) return;

    const centerX = bot.x + bot.size / 2;
    const centerY = bot.y + bot.size / 2;

    const angle = Math.atan2(
      player1.y - centerY,
      player1.x - centerX
    );

    for (let i = 0; i < w.bullets; i++) {
      const spread = (Math.random() - 0.5) * w.spread;

      const a = angle + spread;

      bullets.push({
        x: centerX,
        y: centerY,
        dx: Math.cos(a) * w.speed,
        dy: Math.sin(a) * w.speed,
        size: 5,
        damage: w.damage,
        owner: bot
      });
    }
  });

  lastBotShot = now;
}

// ZONE
const zone = {
  x: world.width / 2,
  y: world.height / 2,
  radius: 500,
  shrinkRate: 0.1
};

function updateZone() {
  if (zone.radius > 100) {
    zone.radius -= zone.shrinkRate;
  }
}

function applyZoneDamage() {
  const dx = player1.x - zone.x;
  const dy = player1.y - zone.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > zone.radius) {
    player1.health -= 0.05;
  }

  bots.forEach(bot => {
    const dx = bot.x - zone.x;
    const dy = bot.y - zone.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > zone.radius) {
      bot.health -= 0.05;
    }
  });
}

// CAMERA
function updateCamera() {
  camera.x = player1.x - canvas.width / 2;
  camera.y = player1.y - canvas.height / 2;

  camera.x = Math.max(0, Math.min(camera.x, world.width - canvas.width));
  camera.y = Math.max(0, Math.min(camera.y, world.height - canvas.height));
}

// DRAW PLAYER
function drawPlayer(p) {
  let offsetX = 0, offsetY = 0;

  if (p.recoil > 0) {
    offsetX = (Math.random() - 0.5) * 5;
    offsetY = (Math.random() - 0.5) * 5;
    p.recoil--;
  }

  ctx.fillStyle = p.hitTimer > 0 ? "white" : p.color;
  if (p.hitTimer > 0) p.hitTimer--;

  ctx.fillRect(p.x + offsetX, p.y + offsetY, p.size, p.size);
}

// DRAW BOTS
function drawBots() {
  bots.forEach(bot => drawPlayer(bot));
}

// DRAW BULLETS
function drawBullets() {
  ctx.fillStyle = "white";
  bullets.forEach(b => {
    ctx.fillRect(b.x, b.y, b.size, b.size);
  });
}

// EFFECTS
function drawEffects() {
  effects.forEach((e, i) => {
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.strokeStyle = "orange";
    ctx.stroke();

    e.radius += 1;
    e.life--;

    if (e.life <= 0) effects.splice(i, 1);
  });
}

// FLASHES
function drawFlashes() {
  flashes.forEach((f, i) => {
    ctx.fillStyle = "yellow";
    ctx.beginPath();
    ctx.arc(f.x, f.y, 8, 0, Math.PI * 2);
    ctx.fill();

    f.life--;
    if (f.life <= 0) flashes.splice(i, 1);
  });
}

// HEALTH BAR
function drawHealthBar(player, x, y) {
  const width = 120, height = 10;

  player.displayHealth += (player.health - player.displayHealth) * 0.1;

  ctx.fillStyle = "red";
  ctx.fillRect(x, y, width, height);

  ctx.fillStyle = "lime";
  ctx.fillRect(x, y, (player.displayHealth / 100) * width, height);

  ctx.strokeStyle = "white";
  ctx.strokeRect(x, y, width, height);
}

// CROSSHAIR
function drawCrosshair() {
  const gap = 6, length = 10;

  ctx.strokeStyle = "white";
  ctx.beginPath();

  ctx.moveTo(mouse.x - length, mouse.y);
  ctx.lineTo(mouse.x - gap, mouse.y);

  ctx.moveTo(mouse.x + gap, mouse.y);
  ctx.lineTo(mouse.x + length, mouse.y);

  ctx.moveTo(mouse.x, mouse.y - length);
  ctx.lineTo(mouse.x, mouse.y - gap);

  ctx.moveTo(mouse.x, mouse.y + gap);
  ctx.lineTo(mouse.x, mouse.y + length);

  ctx.stroke();
}

// MINIMAP
const minimap = { x: canvas.width - 160, y: 20, width: 140, height: 140 };

function drawMinimap() {
  const scaleX = minimap.width / world.width;
  const scaleY = minimap.height / world.height;

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(minimap.x, minimap.y, minimap.width, minimap.height);

  ctx.strokeStyle = "lime";
  ctx.strokeRect(minimap.x, minimap.y, minimap.width, minimap.height);

  // player
  ctx.fillStyle = "red";
  ctx.fillRect(
    minimap.x + player1.x * scaleX,
    minimap.y + player1.y * scaleY,
    4, 4
  );

  // bots
  bots.forEach(bot => {
    ctx.fillStyle = "purple";
    ctx.fillRect(
      minimap.x + bot.x * scaleX,
      minimap.y + bot.y * scaleY,
      3, 3
    );
  });

  // zone
  ctx.beginPath();
  ctx.arc(
    minimap.x + zone.x * scaleX,
    minimap.y + zone.y * scaleY,
    zone.radius * scaleX,
    0, Math.PI * 2
  );
  ctx.strokeStyle = "green";
  ctx.stroke();
}

// GAME STATE
let gameOver = false;
let winner = "";

// CHECK GAME OVER
function checkGameOver() {
  if (player1.health <= 0) {
    gameOver = true;
    winner = "Bots Win 💀";
  }

  if (bots.length === 0) {
    gameOver = true;
    winner = "You Win 🏆";
  }
}

// GAME OVER SCREEN
function drawGameOver() {
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "white";
  ctx.textAlign = "center";

  ctx.font = "50px Arial";
  ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 60);

  ctx.font = "30px Arial";
  ctx.fillText(winner, canvas.width / 2, canvas.height / 2);

  ctx.font = "20px Arial";
  ctx.fillText("Press R to Restart", canvas.width / 2, canvas.height / 2 + 50);
}

// RESTART
window.addEventListener("keydown", (e) => {
  if (e.key === "r" && gameOver) restartGame();
});

function restartGame() {
  player1.x = 100;
  player1.y = 100;
  player1.health = 100;

  bots.length = 0;
  for (let i = 0; i < 5; i++) spawnBot();

  bullets.length = 0;
  effects.length = 0;

  zone.radius = 500;

  gameOver = false;
  winner = "";

  gameLoop();
}

// GAME LOOP
function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (gameOver) {
    drawGameOver();
    return;
  }

  movePlayers();
  moveBots();
  updateBullets();
  updateZone();
  applyZoneDamage();
  handleAutoFire();
  botsShoot();

  checkGameOver();
  updateCamera();

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, world.width, world.height);

  drawPlayer(player1);
  drawBots();
  drawBullets();
  drawEffects();
  drawFlashes();

  ctx.restore();

  drawHealthBar(player1, 20, 20);
  drawMinimap();
  drawCrosshair();

  requestAnimationFrame(gameLoop);
}

gameLoop();