const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const livesDisplayEl = document.getElementById("livesDisplay");
const roundEl = document.getElementById("round");
const powerupEl = document.getElementById("powerup");
const powerupStateEl = document.getElementById("powerupState");
const overlayEl = document.getElementById("overlay");
const startButton = document.getElementById("startButton");

const enemySprite = new Image();
enemySprite.src = "./fpv-transparent.png";

const playerSprite = new Image();
playerSprite.src = "./dg_mk4.webp";

const mothershipSprite = new Image();
mothershipSprite.src = "./droneshield.png";

const dsxSprite = new Image();
dsxSprite.src = "./dsx_mk2.png";

const tacticalSprite = new Image();
tacticalSprite.src = "./dg_tactical.webp";

const keys = new Set();
const state = {
  running: false,
  score: 0,
  lives: 3,
  round: 1,
  lastTime: 0,
  player: null,
  enemies: [],
  mothership: null,
  pickups: [],
  fallingDrones: [],
  explosions: [],
  playerBullets: [],
  enemyBullets: [],
  enemyDirection: 1,
  enemyStepDownPending: false,
  enemyMoveTimer: 0,
  enemyMoveInterval: 0.72,
  enemyShotTimer: 0,
  mothershipTimer: 0,
  respawnTimer: 0,
  message: "Start Mission",
};

const config = {
  playerSpeed: 420,
  bulletSpeed: 540,
  enemyBulletSpeed: 260,
  playerFireCooldown: 0.28,
  enemyFireBase: 1.1,
  enemyStep: 18,
  enemyDrop: 18,
  enemyPaddingX: 18,
  enemyPaddingY: 16,
  enemyCols: 9,
  enemyRows: 5,
  mothershipInterval: 10,
};

function resetGame() {
  state.score = 0;
  state.lives = 3;
  state.round = 1;
  state.message = "Start Mission";
  createRound(true);
  updateHud();
}

function getPlayerSpriteInfo() {
  if (state.player?.weaponMode === "dsx") {
    return {
      sprite: dsxSprite,
      rotated: false,
    };
  }

  if (state.player?.weaponMode === "tactical") {
    return {
      sprite: tacticalSprite,
      rotated: true,
    };
  }

  return {
    sprite: playerSprite,
    rotated: true,
  };
}

function getPlayerDimensions() {
  const width = state.player?.width ?? 140;
  const { sprite } = getPlayerSpriteInfo();

  if (sprite.complete && sprite.naturalWidth > 0) {
    return {
      width,
      height: width * (sprite.naturalHeight / sprite.naturalWidth),
    };
  }

  return {
    width,
    height: state.player?.height ?? 52,
  };
}

function getMothershipDimensions(baseWidth = 116) {
  if (mothershipSprite.complete && mothershipSprite.naturalWidth > 0) {
    return {
      width: baseWidth,
      height: baseWidth * (mothershipSprite.naturalHeight / mothershipSprite.naturalWidth),
    };
  }

  return {
    width: baseWidth,
    height: 42,
  };
}

function createRound(resetPlayerPosition = false) {
  if (!state.player || resetPlayerPosition) {
    state.player = {
      x: canvas.width / 2,
      y: canvas.height - 44,
      width: 140,
      height: 52,
      cooldown: 0,
      alive: true,
      weaponMode: "standard",
      powerupTimer: 0,
    };
  } else {
    state.player.x = canvas.width / 2;
    state.player.y = canvas.height - 44;
    state.player.cooldown = 0;
    state.player.alive = true;
  }

  state.playerBullets = [];
  state.enemyBullets = [];
  state.mothership = null;
  state.pickups = [];
  state.fallingDrones = [];
  state.explosions = [];
  state.enemyDirection = 1;
  state.enemyStepDownPending = false;
  state.enemyMoveTimer = 0;
  state.enemyShotTimer = 0;
  state.mothershipTimer = config.mothershipInterval;
  state.enemyMoveInterval = Math.max(0.18, 0.72 - (state.round - 1) * 0.08);
  state.enemies = createEnemies();
}

function createEnemies() {
  const enemies = [];
  const totalWidth = config.enemyCols * 54 + (config.enemyCols - 1) * config.enemyPaddingX;
  const startX = (canvas.width - totalWidth) / 2 + 27;
  const startY = 82;

  for (let row = 0; row < config.enemyRows; row += 1) {
    for (let col = 0; col < config.enemyCols; col += 1) {
      enemies.push({
        x: startX + col * (54 + config.enemyPaddingX),
        y: startY + row * (34 + config.enemyPaddingY),
        width: 46,
        height: 30,
        row,
        col,
        alive: true,
      });
    }
  }

  return enemies;
}

function updateHud() {
  scoreEl.textContent = String(state.score);
  livesEl.textContent = String(state.lives);
  livesDisplayEl.textContent = "I".repeat(Math.max(0, state.lives)) || "NONE";
  roundEl.textContent = String(state.round);

  if (state.player?.weaponMode === "dsx" && state.player.powerupTimer > 0) {
    powerupEl.textContent = `${state.player.powerupTimer.toFixed(1)}s`;
    powerupStateEl.textContent = "DSX Spread";
  } else if (state.player?.weaponMode === "tactical" && state.player.powerupTimer > 0) {
    powerupEl.textContent = `${state.player.powerupTimer.toFixed(1)}s`;
    powerupStateEl.textContent = "DG Tactical";
  } else {
    powerupEl.textContent = "OFF";
    powerupStateEl.textContent = "Standard Shot";
  }
}

function spawnFallingDrone(enemy) {
  state.fallingDrones.push({
    x: enemy.x,
    y: enemy.y,
    width: enemy.width,
    height: enemy.height,
    vx: (Math.random() - 0.5) * 80,
    vy: 110 + Math.random() * 90,
    rotation: (Math.random() - 0.5) * 0.35,
    spin: (Math.random() - 0.5) * 3.6,
    scale: 1,
    scaleVelocity: Math.random() > 0.5 ? 0.95 + Math.random() * 0.6 : -(0.35 + Math.random() * 0.2),
    alpha: 1,
  });
}

function spawnExplosion(x, y, size) {
  const particles = [];
  const intensity = Math.max(0.8, size / 46);

  for (let i = 0; i < 18; i += 1) {
    const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.45;
    const speed = (60 + Math.random() * 130) * intensity;
    const life = 0.55 + Math.random() * 0.3;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 20,
      radius: (2 + Math.random() * 5) * Math.min(1.8, intensity),
      life,
      maxLife: life,
      color: Math.random() > 0.45 ? "#ffd8b5" : "#ff9b73",
    });
  }

  state.explosions.push({
    particles,
    flash: {
      x,
      y,
      life: 0.24,
      maxLife: 0.24,
      radius: 24 * intensity,
      maxRadius: 96 * intensity,
      coreRadius: 14 * intensity,
      maxCoreRadius: 48 * intensity,
    },
  });
}

function spawnPlayerExplosion() {
  const { height } = getPlayerDimensions();
  const explosionY = state.player.y - height * 0.15;

  spawnExplosion(state.player.x, explosionY, 220);
  spawnExplosion(state.player.x - 36, explosionY + 10, 140);
  spawnExplosion(state.player.x + 36, explosionY + 10, 140);
}

function spawnMothership() {
  const fromLeft = Math.random() > 0.5;
  const dimensions = getMothershipDimensions();
  state.mothership = {
    x: fromLeft ? -dimensions.width : canvas.width + dimensions.width,
    y: 44,
    width: dimensions.width,
    height: dimensions.height,
    vx: fromLeft ? 170 : -170,
    alive: true,
  };
}

function spawnDsxPickup(x, y) {
  const dimensions = getDsxPickupDimensions();
  state.pickups.push({
    x,
    y,
    width: dimensions.width,
    height: dimensions.height,
    vy: 140,
    bob: Math.random() * Math.PI * 2,
    type: "dsx",
  });
}

function spawnTacticalPickup(x, y) {
  const dimensions = getTacticalPickupDimensions();
  state.pickups.push({
    x,
    y,
    width: dimensions.width,
    height: dimensions.height,
    vy: 140,
    bob: Math.random() * Math.PI * 2,
    type: "tactical",
  });
}

function getDsxPickupDimensions(baseSize = 44) {
  if (dsxSprite.complete && dsxSprite.naturalWidth > 0) {
    const aspectRatio = dsxSprite.naturalHeight / dsxSprite.naturalWidth;
    return {
      width: baseSize,
      height: baseSize * aspectRatio,
    };
  }

  return {
    width: baseSize,
    height: baseSize,
  };
}

function getTacticalPickupDimensions(baseSize = 44) {
  if (tacticalSprite.complete && tacticalSprite.naturalWidth > 0) {
    return {
      width: baseSize,
      height: baseSize * (tacticalSprite.naturalHeight / tacticalSprite.naturalWidth),
    };
  }

  return {
    width: baseSize,
    height: baseSize,
  };
}

function setOverlay(title, description, buttonText) {
  overlayEl.innerHTML = `
    <h1>${title}</h1>
    <p>${description}</p>
    <button id="startButton" type="button">${buttonText}</button>
  `;

  overlayEl.classList.remove("hidden");
  overlayEl.querySelector("button").addEventListener("click", () => {
    if (buttonText.includes("Restart")) {
      resetGame();
    }

    overlayEl.classList.add("hidden");
    state.running = true;
    state.lastTime = performance.now();
  });
}

function startGame() {
  resetGame();
  overlayEl.classList.add("hidden");
  state.running = true;
  state.lastTime = performance.now();
  requestAnimationFrame(loop);
}

function nextRound() {
  state.round += 1;
  createRound(false);
  updateHud();
  state.running = false;
  setOverlay(
    `Round ${state.round}`,
    "Formation cleared. Threat density is increasing.",
    "Continue"
  );
}

function gameOver(win = false) {
  state.running = false;
  setOverlay(
    win ? "Sector Secure" : "Mission Failed",
    win
      ? "You held the line. Restart when you want another wave."
      : "The invaders broke through. Reset and try another run.",
    "Restart Mission"
  );
}

function firePlayerBullet() {
  if (!state.player.alive || state.player.cooldown > 0) {
    return;
  }

  const { height } = getPlayerDimensions();
  const originY = state.player.y - height / 2 - 8;

  if (state.player.weaponMode === "dsx") {
    const spread = [-0.65, -0.32, 0, 0.32, 0.65];
    for (const vx of spread) {
      state.playerBullets.push({
        x: state.player.x,
        y: originY,
        width: 4,
        height: 14,
        vx: vx * 180,
        vy: -config.bulletSpeed,
      });
    }
  } else if (state.player.weaponMode === "tactical") {
    let hit = false;

    if (
      state.mothership &&
      Math.abs(state.mothership.x - state.player.x) <= state.mothership.width / 2 + 5 &&
      state.mothership.y <= originY
    ) {
      state.score += 150;
      spawnExplosion(state.mothership.x, state.mothership.y + 4, state.mothership.width * 0.75);
      if (Math.random() > 0.5) {
        spawnDsxPickup(state.mothership.x, state.mothership.y + 16);
      } else {
        spawnTacticalPickup(state.mothership.x, state.mothership.y + 16);
      }
      state.mothership = null;
      hit = true;
    }

    for (const enemy of state.enemies) {
      if (!enemy.alive) {
        continue;
      }

      const withinColumn =
        Math.abs(enemy.x - state.player.x) <= enemy.width / 2 + 5 &&
        enemy.y <= originY;

      if (withinColumn) {
        enemy.alive = false;
        spawnFallingDrone(enemy);
        state.score += 10 + (config.enemyRows - enemy.row) * 5;
        hit = true;
      }
    }

    if (hit) {
      updateHud();
    }

    state.playerBullets.push({
      x: state.player.x,
      y: originY,
      width: 14,
      height: originY,
      vx: 0,
      vy: -(config.bulletSpeed * 0.5),
      type: "tactical_visual",
      life: 0.22,
      maxLife: 0.22,
    });
  } else {
    state.playerBullets.push({
      x: state.player.x,
      y: originY,
      width: 4,
      height: 14,
      vx: 0,
      vy: -config.bulletSpeed,
    });
  }

  state.player.cooldown = config.playerFireCooldown;
}

function fireEnemyBullet() {
  const columns = new Map();

  for (const enemy of state.enemies) {
    if (!enemy.alive) {
      continue;
    }

    const current = columns.get(enemy.col);
    if (!current || enemy.y > current.y) {
      columns.set(enemy.col, enemy);
    }
  }

  const shooters = [...columns.values()];
  if (shooters.length === 0) {
    return;
  }

  const shooter = shooters[Math.floor(Math.random() * shooters.length)];
  state.enemyBullets.push({
    x: shooter.x,
    y: shooter.y + shooter.height / 2,
    width: 4,
    height: 14,
    vy: config.enemyBulletSpeed + state.round * 16,
  });
}

function rectsOverlap(a, b) {
  return (
    a.x - a.width / 2 < b.x + b.width / 2 &&
    a.x + a.width / 2 > b.x - b.width / 2 &&
    a.y - a.height / 2 < b.y + b.height / 2 &&
    a.y + a.height / 2 > b.y - b.height / 2
  );
}

function update(dt) {
  if (!state.running) {
    return;
  }

  if (state.player.cooldown > 0) {
    state.player.cooldown -= dt;
  }

  if (state.player.weaponMode !== "standard") {
    state.player.powerupTimer -= dt;
    if (state.player.powerupTimer <= 0) {
      state.player.weaponMode = "standard";
      state.player.powerupTimer = 0;
    }
    updateHud();
  }

  if (!state.player.alive) {
    state.respawnTimer -= dt;
    if (state.respawnTimer <= 0) {
      state.player.alive = true;
      state.player.x = canvas.width / 2;
      state.player.cooldown = 0;
    }
  }

  const moveLeft = keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
  const moveRight = keys.has("ArrowRight") || keys.has("d") || keys.has("D");
  const playerDimensions = getPlayerDimensions();
  state.player.height = playerDimensions.height;

  if (state.player.alive) {
    if (moveLeft) {
      state.player.x -= config.playerSpeed * dt;
    }
    if (moveRight) {
      state.player.x += config.playerSpeed * dt;
    }
  }

  const halfWidth = state.player.width / 2;
  state.player.x = Math.max(halfWidth, Math.min(canvas.width - halfWidth, state.player.x));

  state.enemyMoveTimer += dt;
  if (state.enemyMoveTimer >= state.enemyMoveInterval) {
    state.enemyMoveTimer = 0;
    moveEnemies();
  }

  state.enemyShotTimer += dt;
  const fireInterval = Math.max(0.28, config.enemyFireBase - state.round * 0.05);
  if (state.enemyShotTimer >= fireInterval) {
    state.enemyShotTimer = 0;
    fireEnemyBullet();
  }

  state.mothershipTimer -= dt;
  if (state.mothershipTimer <= 0) {
    state.mothershipTimer = config.mothershipInterval;
    if (!state.mothership) {
      spawnMothership();
    }
  }

  if (state.mothership) {
    state.mothership.x += state.mothership.vx * dt;
    if (
      state.mothership.x < -state.mothership.width ||
      state.mothership.x > canvas.width + state.mothership.width
    ) {
      state.mothership = null;
    }
  }

  for (const bullet of state.playerBullets) {
    bullet.x += (bullet.vx ?? 0) * dt;
    bullet.y += bullet.vy * dt;
    if (bullet.life !== undefined) {
      bullet.life -= dt;
    }
  }

  for (const bullet of state.enemyBullets) {
    bullet.y += bullet.vy * dt;
  }

  state.playerBullets = state.playerBullets.filter((bullet) => {
    if (bullet.type === "tactical_visual") {
      return bullet.life > 0;
    }

    if (bullet.y < -20 || bullet.x < -20 || bullet.x > canvas.width + 20) {
      return false;
    }

    if (state.mothership && rectsOverlap(bullet, state.mothership)) {
      state.score += 150;
      updateHud();
      spawnExplosion(state.mothership.x, state.mothership.y + 4, state.mothership.width * 0.75);
      if (Math.random() > 0.5) {
        spawnDsxPickup(state.mothership.x, state.mothership.y + 16);
      } else {
        spawnTacticalPickup(state.mothership.x, state.mothership.y + 16);
      }
      state.mothership = null;
      return false;
    }

    for (const enemy of state.enemies) {
      if (!enemy.alive) {
        continue;
      }

      if (rectsOverlap(bullet, enemy)) {
        enemy.alive = false;
        spawnFallingDrone(enemy);
        state.score += 10 + (config.enemyRows - enemy.row) * 5;
        updateHud();
        return false;
      }
    }

    return true;
  });

  state.enemyBullets = state.enemyBullets.filter((bullet) => {
    if (bullet.y > canvas.height + 20) {
      return false;
    }

    if (state.player.alive && rectsOverlap(bullet, state.player)) {
      state.lives -= 1;
      state.player.weaponMode = "standard";
      state.player.powerupTimer = 0;
      updateHud();
      spawnPlayerExplosion();
      state.player.alive = false;
      state.respawnTimer = 1;
      if (state.lives <= 0) {
        gameOver(false);
      }
      return false;
    }

    return true;
  });

  state.pickups = state.pickups.filter((pickup) => {
    pickup.y += pickup.vy * dt;
    pickup.bob += dt * 5;

    if (state.player.alive && rectsOverlap(pickup, state.player)) {
      state.player.weaponMode = pickup.type;
      state.player.powerupTimer = pickup.type === "tactical" ? 6 : 4;
      updateHud();
      return false;
    }

    return pickup.y < canvas.height + pickup.height;
  });

  state.fallingDrones = state.fallingDrones.filter((drone) => {
    drone.x += drone.vx * dt;
    drone.y += drone.vy * dt;
    drone.vy += 220 * dt;
    drone.rotation += drone.spin * dt;
    drone.scale = Math.max(0.45, drone.scale + drone.scaleVelocity * dt);
    drone.alpha = Math.max(0.35, 1 - (drone.y / canvas.height) * 0.25);

    const groundY = canvas.height - 28 - (drone.height * drone.scale) / 2;
    if (drone.y >= groundY) {
      spawnExplosion(drone.x, canvas.height - 32, drone.width * drone.scale);
      return false;
    }

    return true;
  });

  state.explosions = state.explosions.filter((explosion) => {
    if (explosion.flash) {
      explosion.flash.life -= dt;
      const progress = 1 - Math.max(0, explosion.flash.life) / explosion.flash.maxLife;
      explosion.flash.radius = explosion.flash.maxRadius * progress;
      explosion.flash.coreRadius = explosion.flash.maxCoreRadius * progress;
    }

    explosion.particles = explosion.particles.filter((particle) => {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 180 * dt;
      particle.radius = Math.max(0.4, particle.radius - dt * 3.8);
      return particle.life > 0;
    });

    const flashAlive = explosion.flash && explosion.flash.life > 0;
    return explosion.particles.length > 0 || flashAlive;
  });

  const remainingEnemies = state.enemies.filter((enemy) => enemy.alive);
  if (remainingEnemies.length === 0 && state.fallingDrones.length === 0 && state.explosions.length === 0) {
    nextRound();
    return;
  }

  const invaded = remainingEnemies.some((enemy) => enemy.y + enemy.height / 2 >= state.player.y - 24);
  if (invaded) {
    gameOver(false);
  }
}

function moveEnemies() {
  const aliveEnemies = state.enemies.filter((enemy) => enemy.alive);
  if (aliveEnemies.length === 0) {
    return;
  }

  const minX = Math.min(...aliveEnemies.map((enemy) => enemy.x - enemy.width / 2));
  const maxX = Math.max(...aliveEnemies.map((enemy) => enemy.x + enemy.width / 2));

  if (maxX >= canvas.width - 24 && state.enemyDirection > 0) {
    state.enemyDirection = -1;
    state.enemyStepDownPending = true;
  } else if (minX <= 24 && state.enemyDirection < 0) {
    state.enemyDirection = 1;
    state.enemyStepDownPending = true;
  }

  for (const enemy of aliveEnemies) {
    enemy.x += config.enemyStep * state.enemyDirection;
    if (state.enemyStepDownPending) {
      enemy.y += config.enemyDrop;
    }
  }

  state.enemyStepDownPending = false;
  state.enemyMoveInterval = Math.max(0.08, state.enemyMoveInterval - aliveEnemies.length * 0.0004);
}

function drawBackground() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#3a1f17");
  sky.addColorStop(0.55, "#1d120f");
  sky.addColorStop(1, "#0f0908");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(255, 197, 146, 0.08)";
  ctx.lineWidth = 1;
  for (let y = 0; y < canvas.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawPlayer(player) {
  if (!player.alive) {
    return;
  }

  ctx.save();
  ctx.translate(player.x, player.y);
  const { sprite, rotated } = getPlayerSpriteInfo();
  if (sprite.complete && sprite.naturalWidth > 0) {
    const { width: drawWidth, height: drawHeight } = getPlayerDimensions();
    if (rotated) {
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(
        sprite,
        -drawHeight / 2,
        -drawWidth / 2,
        drawHeight,
        drawWidth
      );
    } else {
      ctx.drawImage(
        sprite,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight
      );
    }
  } else {
    ctx.fillStyle = "#ffd7ae";
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(26, 10);
    ctx.lineTo(10, 10);
    ctx.lineTo(6, 18);
    ctx.lineTo(-6, 18);
    ctx.lineTo(-10, 10);
    ctx.lineTo(-26, 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ff9e67";
    ctx.fillRect(-8, -4, 16, 10);
  }
  ctx.restore();
}

function drawEnemy(enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  drawEnemySprite(enemy.width, enemy.height);
  ctx.restore();
}

function drawEnemySprite(width, height) {
  if (enemySprite.complete && enemySprite.naturalWidth > 0) {
    ctx.drawImage(
      enemySprite,
      -width / 2,
      -height / 2,
      width,
      height
    );
  } else {
    ctx.fillStyle = "hsl(24 85% 68%)";
    ctx.strokeStyle = "rgba(255,245,235,0.18)";

    ctx.beginPath();
    ctx.moveTo(-18, -8);
    ctx.lineTo(-8, -12);
    ctx.lineTo(8, -12);
    ctx.lineTo(18, -8);
    ctx.lineTo(14, 4);
    ctx.lineTo(20, 10);
    ctx.lineTo(8, 8);
    ctx.lineTo(0, 14);
    ctx.lineTo(-8, 8);
    ctx.lineTo(-20, 10);
    ctx.lineTo(-14, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#5a291b";
    ctx.fillRect(-10, -4, 6, 4);
    ctx.fillRect(4, -4, 6, 4);
  }
}

function drawFallingDrone(drone) {
  ctx.save();
  ctx.translate(drone.x, drone.y);
  ctx.rotate(drone.rotation);
  ctx.scale(drone.scale, drone.scale);
  ctx.globalAlpha = drone.alpha;
  drawEnemySprite(drone.width, drone.height);
  ctx.restore();
}

function drawMothership(mothership) {
  ctx.save();
  ctx.translate(mothership.x, mothership.y);
  if (mothershipSprite.complete && mothershipSprite.naturalWidth > 0) {
    ctx.drawImage(
      mothershipSprite,
      -mothership.width / 2,
      -mothership.height / 2,
      mothership.width,
      mothership.height
    );
  } else {
    ctx.fillStyle = "#ffd9b6";
    ctx.fillRect(-mothership.width / 2, -mothership.height / 2, mothership.width, mothership.height);
  }
  ctx.restore();
}

function drawPickup(pickup) {
  ctx.save();
  ctx.translate(pickup.x, pickup.y + Math.sin(pickup.bob) * 4);
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "rgba(255, 231, 208, 0.22)";
  ctx.beginPath();
  ctx.arc(0, 0, pickup.width * 0.75, 0, Math.PI * 2);
  ctx.fill();

  const sprite = pickup.type === "tactical" ? tacticalSprite : dsxSprite;
  const dimensions = pickup.type === "tactical"
    ? getTacticalPickupDimensions(pickup.width)
    : getDsxPickupDimensions(pickup.width);

  if (sprite.complete && sprite.naturalWidth > 0) {
    ctx.drawImage(
      sprite,
      -dimensions.width / 2,
      -dimensions.height / 2,
      dimensions.width,
      dimensions.height
    );
  } else {
    ctx.fillStyle = "#ffe3ca";
    ctx.fillRect(-pickup.width / 2, -pickup.height / 2, pickup.width, pickup.height);
  }
  ctx.restore();
}

function drawExplosion(explosion) {
  ctx.save();
  if (explosion.flash && explosion.flash.life > 0) {
    const flashAlpha = explosion.flash.life / explosion.flash.maxLife;

    ctx.globalCompositeOperation = "lighter";

    const shockwave = ctx.createRadialGradient(
      explosion.flash.x,
      explosion.flash.y,
      Math.max(1, explosion.flash.radius * 0.15),
      explosion.flash.x,
      explosion.flash.y,
      Math.max(1, explosion.flash.radius)
    );
    shockwave.addColorStop(0, `rgba(255, 252, 245, ${0.72 * flashAlpha})`);
    shockwave.addColorStop(0.35, `rgba(255, 214, 166, ${0.45 * flashAlpha})`);
    shockwave.addColorStop(1, "rgba(255, 214, 166, 0)");
    ctx.fillStyle = shockwave;
    ctx.beginPath();
    ctx.arc(explosion.flash.x, explosion.flash.y, explosion.flash.radius, 0, Math.PI * 2);
    ctx.fill();

    const core = ctx.createRadialGradient(
      explosion.flash.x,
      explosion.flash.y,
      0,
      explosion.flash.x,
      explosion.flash.y,
      Math.max(1, explosion.flash.coreRadius)
    );
    core.addColorStop(0, `rgba(255, 255, 250, ${0.95 * flashAlpha})`);
    core.addColorStop(0.45, `rgba(255, 220, 180, ${0.78 * flashAlpha})`);
    core.addColorStop(1, "rgba(255, 220, 180, 0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(explosion.flash.x, explosion.flash.y, explosion.flash.coreRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const particle of explosion.particles) {
    ctx.globalAlpha = particle.life / particle.maxLife;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBullet(bullet, color) {
  if (bullet.type === "tactical_visual") {
    const alpha = Math.max(0, bullet.life / bullet.maxLife);
    const gradient = ctx.createLinearGradient(bullet.x, bullet.y, bullet.x, 0);
    gradient.addColorStop(0, `rgba(255, 160, 95, ${0.2 * alpha})`);
    gradient.addColorStop(0.55, `rgba(255, 214, 150, ${0.75 * alpha})`);
    gradient.addColorStop(1, `rgba(255, 252, 240, ${0.98 * alpha})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(bullet.x - bullet.width / 2, 0, bullet.width, bullet.y);
    return;
  }

  ctx.fillStyle = color;
  ctx.fillRect(bullet.x - bullet.width / 2, bullet.y - bullet.height / 2, bullet.width, bullet.height);
}

function drawGroundLine() {
  ctx.strokeStyle = "rgba(255, 183, 124, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(18, canvas.height - 28);
  ctx.lineTo(canvas.width - 18, canvas.height - 28);
  ctx.stroke();
}

function render() {
  drawBackground();

  for (const enemy of state.enemies) {
    if (enemy.alive) {
      drawEnemy(enemy);
    }
  }

  if (state.mothership) {
    drawMothership(state.mothership);
  }

  for (const drone of state.fallingDrones) {
    drawFallingDrone(drone);
  }

  for (const pickup of state.pickups) {
    drawPickup(pickup);
  }

  for (const bullet of state.playerBullets) {
    drawBullet(bullet, "#ffe6b8");
  }

  for (const bullet of state.enemyBullets) {
    drawBullet(bullet, "#ff9b73");
  }

  for (const explosion of state.explosions) {
    drawExplosion(explosion);
  }

  drawPlayer(state.player);
  drawGroundLine();
}

function loop(timestamp) {
  const dt = Math.min(0.033, (timestamp - state.lastTime) / 1000 || 0);
  state.lastTime = timestamp;

  update(dt);
  render();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  keys.add(event.key);

  if (event.key === " " || event.code === "Space") {
    event.preventDefault();
    if (state.running) {
      firePlayerBullet();
    }
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key);
});

startButton.addEventListener("click", startGame);

resetGame();
render();
