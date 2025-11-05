/* Pixel Quest — plataforma 2D em pixel-art
   Recursos:
   - Rolagem lateral com câmera
   - Obstáculos: bloco sólido (#), plataforma (=), espinhos (^)
   - Recompensas: moeda (o)
   - Inimigos que patrulham: x
   - Início S e chegada G (muda de fase)
   - Controles teclado + touch
*/

(() => {
  // ---- Elementos base
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const music = document.getElementById('music');
  const start = document.getElementById('start');
  const btnStart = document.getElementById('btnStart');
  const chkMusic = document.getElementById('chkMusic');

  const uiLevel = document.getElementById('ui-level');
  const uiCoins = document.getElementById('ui-coins');
  const uiLives = document.getElementById('ui-lives');

  // ---- Configuração do mundo
  const TILE = 16;
  const GRAV = 0.4;
  const MOVE = 0.7;
  const JUMP = -7;
  const MAX_VX = 2.8, MAX_VY = 10;

  const COLORS = {
    sky: '#7ec0ee',
    cloud: '#ffffff',
    hill: '#a0d8a0',
    ground: '#8b4513',
    groundTop: '#5d2e0d',
    platform: '#7c3aed',
    spike: '#d1d5db',
    coin: '#ffd84d',
    enemy: '#3b82f6',
    flag1: '#22c55e',
    flag2: '#16a34a',
    text: '#000000'
  };

  // ---- Fases (matrizes). Largura variável; altura fixa = 14
  // Lendas: # bloco | = plataforma | ^ espinho | o moeda | x inimigo | S start | G goal
  const LEVELS = [
`................................................................................................
................................................................................................
.............................................o..................................................
.................................................====...........................................
...............................o...........................................o....................
..............o..............................#####......................o.......................
........S......................==.................#..............x..............................
#############.................####...............##.............####............................
...........o......................o.............###.........o...................................
.......................o.....................o.....=====..............................o........
...........#####.....................x....................................................G....
.....o...................^^^^^............................^^^^^...................^^^^^........
##################..########################..########################..########################
##################..########################..########################..########################`,
`................................................................................................
................................................................................................
...........................................o......o.............................................
......................o..............====.......................................................
....................####..................o.....................................................
...........S.................................x...........................o......................
###########....................==....................................####.......................
...........o...........^^^^^.............o....................^^^^^......................o......
............................................................=======.............................
....................x..............................o...........................................
..................#####..........................................................G.............
.....o.....................................^^^^^...................o...........^^^^^...........
#############################..########################..######################################
#############################..########################..######################################`
  ];

  // ---- Estado
  const state = {
    levelIndex: 0,
    coins: 0,
    lives: 3,
    started: false,
    scale: 3,
    camX: 0
  };

  // ---- Responsivo (ajusta escala de pixels)
  function fit() {
    const W = 256; // largura lógica mínima (px)
    const H = 14 * TILE; // 224px
    const maxW = Math.min(window.innerWidth - 24, 980);
    const scale = Math.max(2, Math.floor(maxW / W));
    canvas.width = Math.floor(maxW);
    canvas.height = Math.floor((H / W) * maxW);
    state.scale = scale; // usado para desenhar como "pixel grande"
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', fit);
  fit();

  // ---- Constrói nível
  let map, H, W, player, enemies;
  function loadLevel(i) {
    const rows = LEVELS[i].split('\n').map(r => r.trimEnd());
    H = rows.length;
    W = rows[0].length;

    map = rows.map(r => r.split(''));
    enemies = [];

    // encontra S e inimigos
    for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
      const c = map[y][x];
      if (c === 'S') { player = makePlayer(x, y); map[y][x] = '.'; }
      if (c === 'x') { enemies.push(makeEnemy(x, y)); map[y][x] = '.'; }
    }

    state.camX = Math.max(0, player.x - 80);
    uiLevel.textContent = `Fase ${i+1}`;
  }

  function makePlayer(tx, ty) {
    return {
      x: tx*TILE + 8, y: ty*TILE - 1,
      vx: 0, vy: 0, w: 10, h: 14,
      onGround: false, facing: 1
    };
  }

  function makeEnemy(tx, ty) {
    return {
      x: tx*TILE + 8, y: ty*TILE - 1,
      vx: 1.0, dir: -1, w: 12, h: 12, alive: true
    };
  }

  // ---- Input teclado e touch
  const keys = { left:false, right:false, jump:false };
  addEventListener('keydown', e => {
    if (e.code==='ArrowLeft'||e.code==='KeyA') keys.left = true;
    if (e.code==='ArrowRight'||e.code==='KeyD') keys.right = true;
    if (e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW') keys.jump = true;
  });
  addEventListener('keyup', e => {
    if (e.code==='ArrowLeft'||e.code==='KeyA') keys.left = false;
    if (e.code==='ArrowRight'||e.code==='KeyD') keys.right = false;
    if (e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW') keys.jump = false;
  });
  bindTouch('btnLeft', 'left');
  bindTouch('btnRight', 'right');
  bindTouch('btnJump', 'jump');
  function bindTouch(id, prop){
    const el = document.getElementById(id);
    const on = e => { e.preventDefault(); keys[prop]=true; };
    const off= e => { e.preventDefault(); keys[prop]=false; };
    ['touchstart','pointerdown','mousedown'].forEach(ev=>el.addEventListener(ev,on));
    ['touchend','pointerup','mouseup','mouseleave','touchcancel'].forEach(ev=>el.addEventListener(ev,off));
  }

  // ---- Utilidades
  const at = (tx,ty) => (tx<0||ty<0||tx>=W||ty>=H) ? '#' : map[ty][tx];
  const solid = c => (c==='#' || c==='=');
  const deadly = c => (c==='^');
  const coin   = c => (c==='o');
  const goal   = c => (c==='G');

  // ---- Física do jogador
  function stepPlayer() {
    if (keys.left) { player.vx -= MOVE; player.facing = -1; }
    if (keys.right){ player.vx += MOVE; player.facing = 1; }
    if (keys.jump && player.onGround) { player.vy = JUMP; player.onGround = false; }

    // limites e gravidade
    player.vx = clamp(player.vx, -MAX_VX, MAX_VX);
    player.vy = clamp(player.vy + GRAV, -MAX_VY, MAX_VY);

    // mover X
    player.x += player.vx;
    collideX(player);

    // mover Y
    player.y += player.vy;
    player.onGround = false;
    collideY(player);

    // pegar moedas, checar goal e dano
    const cells = getCells(player);
    for (const {tx,ty,c} of cells) {
      if (coin(c)) { map[ty][tx]='.'; state.coins++; uiCoins.textContent = `Moedas: ${state.coins}`; }
      if (goal(c)) { nextLevel(); return; }
      if (deadly(c)) { die(); return; }
    }

    // checar inimigos
    for (const e of enemies) if (e.alive) {
      if (aabb(player, e)) {
        // pisou em cima?
        if (player.vy > 0 && player.y < e.y) {
          e.alive = false; player.vy = JUMP * 0.6; // quique
        } else {
          die(); return;
        }
      }
    }

    // câmera segue
    state.camX = clamp(player.x - 120, 0, W*TILE - (canvas.width/state.scale));
  }

  function stepEnemies() {
    for (const e of enemies) if (e.alive) {
      e.x += e.vx * e.dir;
      // inverte ao bater em parede/queda
      const ahead = at(Math.floor((e.x + e.dir*10)/TILE), Math.floor(e.y/TILE));
      const groundAhead = at(Math.floor((e.x + e.dir*10)/TILE), Math.floor(e.y/TILE)+1);
      if (solid(ahead) || groundAhead === '.' ) e.dir*=-1;
    }
  }

  function collideX(o){
    const {w,h} = o;
    const left   = Math.floor((o.x - w/2)/TILE);
    const right  = Math.floor((o.x + w/2)/TILE);
    const top    = Math.floor((o.y - h/2)/TILE);
    const bottom = Math.floor((o.y + h/2)/TILE);
    if (o.vx>0 && (solid(at(right,top))||solid(at(right,bottom)))) { o.x = right*TILE - w/2 - .01; o.vx=0; }
    if (o.vx<0 && (solid(at(left,top)) ||solid(at(left,bottom))))  { o.x = (left+1)*TILE + w/2 + .01; o.vx=0; }
  }
  function collideY(o){
    const {w,h} = o;
    const left   = Math.floor((o.x - w/2)/TILE);
    const right  = Math.floor((o.x + w/2)/TILE);
    const top    = Math.floor((o.y - h/2)/TILE);
    const bottom = Math.floor((o.y + h/2)/TILE);
    if (o.vy>0 && (solid(at(left,bottom))||solid(at(right,bottom)))) { o.y = bottom*TILE - h/2 - .01; o.vy=0; o.onGround=true; o.vx*=0.88; }
    if (o.vy<0 && (solid(at(left,top))  ||solid(at(right,top))))    { o.y = (top+1)*TILE + h/2 + .01; o.vy=0; }
  }

  function getCells(o){
    const cells=[];
    const pts = [
      {x:o.x-o.w/2, y:o.y-o.h/2},
      {x:o.x+o.w/2, y:o.y-o.h/2},
      {x:o.x-o.w/2, y:o.y+o.h/2},
      {x:o.x+o.w/2, y:o.y+o.h/2},
    ];
    for (const p of pts){
      const tx = Math.floor(p.x/TILE), ty = Math.floor(p.y/TILE);
      cells.push({tx,ty,c:at(tx,ty)});
    }
    return cells;
  }

  function aabb(a,b){ return Math.abs(a.x-b.x)<(a.w/2+b.w/2) && Math.abs(a.y-b.y)<(a.h/2+b.h/2); }
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  // ---- Fluxo de jogo
  function die(){
    state.lives--; uiLives.textContent = `Vidas: ${state.lives}`;
    if (state.lives<0){ // reinicia tudo
      state.levelIndex = 0; state.lives = 3; state.coins = 0;
    }
    loadLevel(state.levelIndex);
  }
  function nextLevel(){
    state.levelIndex++;
    if (state.levelIndex >= LEVELS.length) state.levelIndex = 0;
    loadLevel(state.levelIndex);
  }

  // ---- Desenho
  function draw(){
    const s = state.scale;
    const cam = Math.floor(state.camX);

    // céu
    fillRect(0,0,canvas.width,canvas.height, COLORS.sky);

    // montes (parallax simples)
    parallaxRect(0.3, cam, '#a3e3a3');
    parallaxRect(0.6, cam, '#7ad07a');

    // tiles
    for (let y=0;y<H;y++){
      for (let x=0;x<W;x++){
        const c = map[y][x];
        const X = x*TILE - cam;
        const Y = y*TILE;
        if (X+TILE<0 || X>canvas.width/s) continue;

        if (c==='#'){ drawBlock(X,Y); }
        else if (c==='='){ drawPlatform(X,Y); }
        else if (c==='^'){ drawSpike(X,Y); }
        else if (c==='o'){ drawCoin(X,Y); }
        else if (c==='G'){ drawFlag(X,Y); }
      }
    }

    // inimigos
    for (const e of enemies) if (e.alive) drawEnemy(e.x - cam, e.y);

    // jogador
    drawPlayer(player.x - cam, player.y);
  }

  // helpers de desenho
  function fillRect(x,y,w,h,color){
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x*state.scale), Math.floor(y*state.scale), Math.ceil(w*state.scale), Math.ceil(h*state.scale));
  }
  function px(x,y,color){ fillRect(x,y,1,1,color); }

  function drawBlock(x,y){
    // corpo
    fillRect(x,y,TILE,TILE, COLORS.ground);
    // topo mais escuro
    fillRect(x,y, TILE, 3, COLORS.groundTop);
    // brilho pixel
    px(x+TILE-3, y+TILE-3, 'rgba(0,0,0,.25)');
  }
  function drawPlatform(x,y){
    fillRect(x,y, TILE, 8, COLORS.platform);
    fillRect(x,y, TILE, 2, '#4c1d95');
  }
  function drawSpike(x,y){
    fillRect(x,y, TILE, TILE, '#444');
    // triângulos
    ctx.fillStyle = COLORS.spike;
    ctx.beginPath();
    const s = state.scale;
    const x1=(x+2)*s, yb=(y+14)*s;
    ctx.moveTo(x1, yb);
    ctx.lineTo((x+8)*s, (y+2)*s);
    ctx.lineTo((x+14)*s, yb);
    ctx.closePath(); ctx.fill();
  }
  function drawCoin(x,y){
    fillRect(x+4,y+4,8,8, COLORS.coin);
    px(x+6,y+6,'#fff');
  }
  function drawFlag(x,y){
    fillRect(x+2,y-16,2,16, '#6b7280'); // mastro
    fillRect(x+4,y-14,10,6, COLORS.flag1);
    fillRect(x+10,y-14,4,6, COLORS.flag2);
  }
  function drawEnemy(x,y){
    fillRect(x-6,y-6,12,12, COLORS.enemy);
    px(x-2,y-2,'#000'); px(x+2,y-2,'#000'); // olhos
  }
  function drawPlayer(x,y){
    // chapéu/cabelo
    fillRect(x-6,y-12,12,4,'#2b2b2b');
    // cabeça
    fillRect(x-4,y-8,8,6,'#ffd1a3');
    // corpo
    fillRect(x-6,y-2,12,8,'#ff3b3b');
    // pernas
    fillRect(x-6,y+6,5,4,'#1f2937');
    fillRect(x+1,y+6,5,4,'#1f2937');
  }

  function parallaxRect(factor, cam, color){
    const y = canvas.height/state.scale - 40*factor;
    for (let i=-1;i<5;i++){
      const w = 120, h = 30;
      const x = Math.floor((i*w*1.6) - (cam*factor)% (w*1.6));
      fillRect(x,y,w,h,color);
    }
  }

  // ---- Loop
  function loop(){
    if (state.started){
      stepPlayer();
      stepEnemies();
    }
    draw();
    requestAnimationFrame(loop);
  }

  // ---- Início
  btnStart.addEventListener('click', async () => {
    state.started = true;
    start.classList.remove('show');
    try { if (chkMusic.checked) await music.play(); } catch {}
  });

  // Começa no primeiro nível
  loadLevel(state.levelIndex);
  loop();
})();
