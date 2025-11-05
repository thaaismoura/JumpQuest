(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const startOverlay = document.getElementById('start-overlay');
  const btnStart = document.getElementById('btn-start');
  const chkMusic = document.getElementById('chk-music');
  const music = document.getElementById('music');

  const TILE = 16;
  const GRAV = 0.33;
  const MOVE = 0.6;
  const JUMP_VY = -6;
  const MAX_VX = 2.4;
  const MAX_VY = 10;

  const levelStr = [
    "################################",
    "#..............................#",
    "#............??................#",
    "#...............####...........#",
    "#..................#...........#",
    "#.....S............#...........#",
    "#............P.............E...#",
    "#..........#####...............#",
    "#.....................###......#",
    "#.............E................#",
    "#.......######.................#",
    "#.........................G....#",
    "################################",
  ];

  const H = levelStr.length;
  const W = levelStr[0].length;
  const map = levelStr.map(r => r.split(''));

  let spawn = { x: 0, y: 0 };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (map[y][x] === 'S') { spawn = { x, y }; map[y][x] = '.'; }
    }
  }

  const player = { x: spawn.x * TILE + 8, y: spawn.y * TILE, vx: 0, vy: 0, onGround: false };
  const keys = { left: false, right: false, jump: false };

  window.addEventListener('keydown', e => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') keys.jump = true;
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') keys.jump = false;
  });

  const s = 2;
  canvas.width = W * TILE * s;
  canvas.height = H * TILE * s;
  ctx.imageSmoothingEnabled = false;

  function solid(c) { return c === '#' || c === 'P'; }
  function deadly(c) { return c === 'E'; }

  function step() {
    if (keys.left) player.vx -= MOVE;
    if (keys.right) player.vx += MOVE;
    if (keys.jump && player.onGround) { player.vy = JUMP_VY; player.onGround = false; }

    player.vy += GRAV;
    if (player.vx > MAX_VX) player.vx = MAX_VX;
    if (player.vx < -MAX_VX) player.vx = -MAX_VX;
    if (player.vy > MAX_VY) player.vy = MAX_VY;

    player.x += player.vx;
    player.y += player.vy;

    const tx = Math.floor(player.x / TILE);
    const ty = Math.floor(player.y / TILE);
    const tile = map[ty]?.[tx] || '#';

    if (solid(tile)) { player.vy = 0; player.onGround = true; }
    if (deadly(tile)) { player.x = spawn.x * TILE; player.y = spawn.y * TILE; player.vx = 0; player.vy = 0; }
  }

  function draw() {
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = map[y][x];
        if (c === '#') {
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(x * TILE * s, y * TILE * s, TILE * s, TILE * s);
        }
        if (c === 'E') {
          ctx.fillStyle = '#aaa';
          ctx.fillRect(x * TILE * s, y * TILE * s, TILE * s, TILE * s);
        }
      }
    }
    ctx.fillStyle = '#ff3b3b';
    ctx.fillRect(player.x * s, player.y * s, 12 * s, 14 * s);
  }

  function loop() {
    if (state.started) step();
    draw();
    requestAnimationFrame(loop);
  }

  const state = { started: false };

  btnStart.addEventListener('click', async () => {
    state.started = true;
    startOverlay.classList.remove('show');
    try { if (chkMusic.checked) await music.play(); } catch {}
  });

  loop();
})();
