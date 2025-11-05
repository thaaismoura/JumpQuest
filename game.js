/* JumpQuest — Plataforma 2D em pixel-art no estilo Mario
   - Bonequinho animado (correr/pular)
   - Moedas, espinhos, inimigos, bandeira
   - 2 fases, câmera com rolagem lateral
   - Controles touch + música
   Tudo desenhado no Canvas (sem imagens externas).
*/
(() => {
  // ===== Base / DOM
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const start = document.getElementById('start');
  const btnStart = document.getElementById('btnStart');
  const chkMusic = document.getElementById('chkMusic');
  const music = document.getElementById('music');
  const uiLevel = document.getElementById('ui-level');
  const uiCoins = document.getElementById('ui-coins');
  const uiLives = document.getElementById('ui-lives');

  // ===== Mundo
  const TILE = 16;
  const GRAV = 0.45, MOVE = 0.75, JUMP = -7.2;
  const MAX_VX = 2.9, MAX_VY = 10;

  const C = {
    sky:'#7ec0ee', cloud:'#ffffff', hill1:'#a3e3a3', hill2:'#7ad07a',
    ground:'#8b4513', groundTop:'#5d2e0d', platform:'#7c3aed',
    spike:'#d1d5db', coin:'#ffd84d', enemy:'#3b82f6', stone:'#808080',
    flag1:'#22c55e', flag2:'#16a34a', shadow:'rgba(0,0,0,.25)', dark:'#1f2937',
    red:'#ff3b3b', skin:'#ffd1a3', hair:'#2b2b2b'
  };

  // Legenda: # bloco | = plataforma | ^ espinho | o moeda | x inimigo | S início | G meta
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

  // ===== Estado
  const state = {
    scale: 3,
    started: false,
    levelIndex: 0,
    coins: 0,
    lives: 3,
    camX: 0,
    t: 0
  };

  // ===== Responsivo
  function fit(){
    const Wmin = 288; // base pra escalar
    const maxW = Math.min(window.innerWidth - 24, 980);
    const scale = Math.max(2, Math.floor(maxW / Wmin));
    canvas.width = Math.floor(maxW);
    canvas.height = Math.floor((14*TILE / Wmin) * maxW);
    state.scale = scale;
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', fit);
  fit();

  // ===== Mapa/Nível
  let map, H, W, player, enemies, coins;

  function loadLevel(i){
    const rows = LEVELS[i].split('\n').map(r=>r.trimEnd());
    H = rows.length; W = rows[0].length;
    map = rows.map(r=>r.split(''));
    enemies = []; coins = [];

    for (let y=0;y<H;y++) for (let x=0;x<W;x++){
      const c = map[y][x];
      if (c==='S'){ player = makePlayer(x,y); map[y][x]='.'; }
      if (c==='x'){ enemies.push(makeEnemy(x,y)); map[y][x]='.'; }
      if (c==='o'){ coins.push({x:x*TILE+8,y:y*TILE+8, taken:false, f:0}); map[y][x]='.'; }
    }

    uiLevel.textContent = `Fase ${i+1}`;
    state.camX = Math.max(0, player.x - 100);
  }

  function makePlayer(tx,ty){
    return { x:tx*TILE+8, y:ty*TILE-1, vx:0, vy:0, w:10, h:14, onGround:false, facing:1, anim:0 };
  }
  function makeEnemy(tx,ty){
    return { x:tx*TILE+8, y:ty*TILE-1, vx:1.0, dir:-1, w:12, h:12, alive:true, f:0 };
  }

  // ===== Entradas
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
  bindTouch('btnLeft','left'); bindTouch('btnRight','right'); bindTouch('btnJump','jump');
  function bindTouch(id, prop){
    const el = document.getElementById(id);
    const on = e=>{e.preventDefault(); keys[prop]=true;};
    const off= e=>{e.preventDefault(); keys[prop]=false;};
    ['touchstart','pointerdown','mousedown'].forEach(ev=>el.addEventListener(ev,on));
    ['touchend','pointerup','mouseup','mouseleave','touchcancel'].forEach(ev=>el.addEventListener(ev,off));
  }

  // ===== Helpers de mapa
  const at = (tx,ty)=>(tx<0||ty<0||tx>=W||ty>=H)?'#':map[ty][tx];
  const solid = c=>(c==='#' || c==='=');
  const deadly = c=>(c==='^');
  const goal = c=>(c==='G');

  // ===== Física do player
  function stepPlayer(){
    if (keys.left){ player.vx -= MOVE; player.facing = -1; }
    if (keys.right){ player.vx += MOVE; player.facing = 1; }
    if (keys.jump && player.onGround){ player.vy = JUMP; player.onGround=false; }

    player.vx = clamp(player.vx, -MAX_VX, MAX_VX);
    player.vy = clamp(player.vy + GRAV, -MAX_VY, MAX_VY);

    // X
    player.x += player.vx; collideX(player);

    // Y
    player.y += player.vy; player.onGround=false; collideY(player);

    // animação (0 idle, 1-3 run, 4 jump)
    if (!player.onGround) player.anim = 4;
    else if (Math.abs(player.vx) > 0.2) player.anim = 1 + Math.floor((state.t/6)%3);
    else player.anim = 0;

    // pegar moedas
    for (const c of coins) if (!c.taken){
      if (Math.abs(player.x - c.x)<10 && Math.abs(player.y - c.y)<12){
        c.taken = true; state.coins++; uiCoins.textContent = `Moedas: ${state.coins}`;
      }
    }

    // tiles especiais
    const cells = getCells(player);
    for (const {c} of cells){
      if (deadly(c)) { die(); return; }
      if (goal(c)) { nextLevel(); return; }
    }

    // inimigos
    for (const e of enemies) if (e.alive){
      if (aabb(player,e)){
        // pisou em cima?
        if (player.vy>0 && player.y<e.y){ e.alive=false; player.vy = JUMP*0.6; }
        else { die(); return; }
      }
    }

    // câmera
    state.camX = clamp(player.x - 120, 0, W*TILE - canvas.width/state.scale);
  }

  function stepEnemies(){
    for (const e of enemies) if (e.alive){
      e.f = (e.f + 0.1) % 2;
      e.x += e.vx * e.dir;
      const ahead = at(Math.floor((e.x + e.dir*8)/TILE), Math.floor(e.y/TILE));
      const groundAhead = at(Math.floor((e.x + e.dir*8)/TILE), Math.floor(e.y/TILE)+1);
      if (solid(ahead) || groundAhead === '.') e.dir *= -1;
    }
  }

  // colisões
  function collideX(o){
    const {w,h} = o;
    const left   = Math.floor((o.x - w/2)/TILE);
    const right  = Math.floor((o.x + w/2)/TILE);
    const top    = Math.floor((o.y - h/2)/TILE);
    const bottom = Math.floor((o.y + h/2)/TILE);
    if (o.vx>0 && (solid(at(right,top))||solid(at(right,bottom)))){ o.x = right*TILE - w/2 - .01; o.vx=0; }
    if (o.vx<0 && (solid(at(left,top)) ||solid(at(left,bottom)))) { o.x = (left+1)*TILE + w/2 + .01; o.vx=0; }
  }
  function collideY(o){
    const {w,h} = o;
    const left   = Math.floor((o.x - w/2)/TILE);
    const right  = Math.floor((o.x + w/2)/TILE);
    const top    = Math.floor((o.y - h/2)/TILE);
    const bottom = Math.floor((o.y + h/2)/TILE);
    if (o.vy>0 && (solid(at(left,bottom))||solid(at(right,bottom)))){ o.y = bottom*TILE - h/2 - .01; o.vy=0; o.onGround=true; o.vx*=0.88; }
    if (o.vy<0 && (solid(at(left,top))  ||solid(at(right,top))))   { o.y = (top+1)*TILE + h/2 + .01; o.vy=0; }
  }
  function getCells(o){
    const cells=[]; const pts=[
      {x:o.x-o.w/2,y:o.y-o.h/2},{x:o.x+o.w/2,y:o.y-o.h/2},
      {x:o.x-o.w/2,y:o.y+o.h/2},{x:o.x+o.w/2,y:o.y+o.h/2}
    ];
    for (const p of pts){ const tx=Math.floor(p.x/TILE), ty=Math.floor(p.y/TILE); cells.push({tx,ty,c:at(tx,ty)}); }
    return cells;
  }

  // ===== Desenho (pixel art no próprio canvas)
  function draw(){
    const s = state.scale;
    const cam = Math.floor(state.camX);

    // céu
    ctx.fillStyle = C.sky;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // montes e nuvens (parallax simples)
    drawParallax(cam);

    // tiles do mapa
    for (let y=0;y<H;y++){
      for (let x=0;x<W;x++){
        const c = map[y][x];
        const X = x*TILE - cam, Y = y*TILE;
        if (X+TILE<0 || X>canvas.width/s) continue;
        if (c==='#') drawBlock(X,Y);
        else if (c==='=') drawPlatform(X,Y);
        else if (c==='^') drawSpike(X,Y);
        else if (c==='G') drawFlag(X,Y);
      }
    }

    // moedas
    for (const m of coins){
      if (m.taken) continue;
      m.f = (m.f + 0.25) % 4;
      drawCoin(m.x-8 - cam, m.y-8, Math.floor(m.f));
    }

    // inimigos
    for (const e of enemies) if (e.alive) drawEnemy(e.x-8 - cam, e.y-8, Math.floor(e.f));

    // jogador
    drawPlayer(player.x - cam, player.y, player.anim);
  }

  // blocos/plataformas
  function drawBlock(x,y){
    rect(x,y,TILE,TILE,C.ground);
    rect(x,y,TILE,3,C.groundTop);
    px(x+TILE-3,y+TILE-3,C.shadow);
  }
  function drawPlatform(x,y){
    rect(x,y, TILE, 8, C.platform);
    rect(x,y, TILE, 2, '#4c1d95');
  }
  function drawSpike(x,y){
    rect(x,y, TILE, TILE, '#444');
    tri(x+2,y+14, x+8,y+2, x+14,y+14, C.spike);
  }
  function drawFlag(x,y){
    rect(x+2,y-16,2,16,'#6b7280'); // poste
    rect(x+4,y-14,10,6,C.flag1);
    rect(x+10,y-14,4,6,C.flag2);
  }

  // moedas animadas
  function drawCoin(x,y,frame){
    const sizes=[8,10,12,10];
    const w = sizes[frame];
    const dx = x + (16 - w)/2;
    rect(dx, y+4, w, w, C.coin);
    px(dx+Math.max(2, w-6), y+6, '#fff');
  }

  // inimigo (2 frames)
  function drawEnemy(x,y,frame){
    rect(x+2, y+4, 12, 12, C.enemy);
    px(x+5, y+6 + (frame?1:0), '#000'); px(x+9, y+6 + (frame?1:0), '#000');
  }

  // bonequinho (5 frames: 0 idle, 1-3 run, 4 jump)
  function drawPlayer(x,y,frame){
    const s = state.scale;
    ctx.save();
    ctx.translate(Math.floor(x*s), Math.floor(y*s));
    if (player.facing<0){ ctx.scale(-1,1); }
    // base de desenho no canto (0,0) relativo ao corpo
    // cabeça/cabelo
    rect2( -6, -12, 12, 4, C.hair);
    rect2( -4, -8,  8, 6, C.skin);
    // corpo (camisa)
    rect2( -6, -2, 12, 8, C.red);
    // pernas (variação por frame)
    if (frame===0){ // idle
      rect2(-6,6,5,4,C.dark); rect2(1,6,5,4,C.dark);
    } else if (frame===1){
      rect2(-6,6,5,4,C.dark); rect2(3,5,5,4,C.dark);
    } else if (frame===2){
      rect2(-4,6,5,4,C.dark); rect2(1,6,5,4,C.dark);
    } else if (frame===3){
      rect2(-5,5,5,4,C.dark); rect2(2,6,5,4,C.dark);
    } else { // jump
      rect2(-5,6,5,4,C.dark); rect2(1,5,5,4,C.dark);
    }
    ctx.restore();
  }

  // parallax de montes e nuvens
  function drawParallax(cam){
    for (let i=-1;i<8;i++){
      const x = (i*80) - (cam*0.4)%80;
      rect(x, canvas.height/state.scale - 40, 60, 30, C.hill1);
    }
    for (let i=-1;i<10;i++){
      const x = (i*70) - (cam*0.2)%70;
      cloud(x, 20);
    }
  }

  // primitivos em "pixel grande"
  function rect(x,y,w,h,color){
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x*state.scale), Math.floor(y*state.scale), Math.ceil(w*state.scale), Math.ceil(h*state.scale));
  }
  function rect2(x,y,w,h,color){ // já está em coords locais do player
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x*state.scale), Math.floor(y*state.scale), Math.ceil(w*state.scale), Math.ceil(h*state.scale));
  }
  function px(x,y,color){ rect(x,y,1,1,color); }
  function tri(x1,y1,x2,y2,x3,y3,color){
    const s = state.scale;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(Math.floor(x1*s), Math.floor(y1*s));
    ctx.lineTo(Math.floor(x2*s), Math.floor(y2*s));
    ctx.lineTo(Math.floor(x3*s), Math.floor(y3*s));
    ctx.closePath(); ctx.fill();
  }
  function cloud(x,y){
    rect(x+2,y+6,12,6,C.cloud);
    rect(x+6,y+3,6,7,C.cloud);
  }

  // util
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function aabb(a,b){ return Math.abs(a.x-b.x)<(a.w/2+b.w/2) && Math.abs(a.y-b.y)<(a.h/2+b.h/2); }

  // colisão auxiliares
  function collideX(o){
    const {w,h} = o;
    const left   = Math.floor((o.x - w/2)/TILE);
    const right  = Math.floor((o.x + w/2)/TILE);
    const top    = Math.floor((o.y - h/2)/TILE);
    const bottom = Math.floor((o.y + h/2)/TILE);
    if (o.vx>0 && (solid(at(right,top))||solid(at(right,bottom)))){ o.x = right*TILE - w/2 - .01; o.vx=0; }
    if (o.vx<0 && (solid(at(left,top)) ||solid(at(left,bottom)))) { o.x = (left+1)*TILE + w/2 + .01; o.vx=0; }
  }
  function collideY(o){
    const {w,h} = o;
    const left   = Math.floor((o.x - w/2)/TILE);
    const right  = Math.floor((o.x + w/2)/TILE);
    const top    = Math.floor((o.y - h/2)/TILE);
    const bottom = Math.floor((o.y + h/2)/TILE);
    if (o.vy>0 && (solid(at(left,bottom))||solid(at(right,bottom)))){ o.y = bottom*TILE - h/2 - .01; o.vy=0; o.onGround=true; o.vx*=0.88; }
    if (o.vy<0 && (solid(at(left,top))  ||solid(at(right,top))))   { o.y = (top+1)*TILE + h/2 + .01; o.vy=0; }
  }

  // ===== Fluxo de jogo
  function die(){
    state.lives--; uiLives.textContent = `Vidas: ${state.lives}`;
    if (state.lives < 0){ state.levelIndex = 0; state.lives = 3; state.coins = 0; }
    loadLevel(state.levelIndex);
  }
  function nextLevel(){
    state.levelIndex++;
    if (state.levelIndex >= LEVELS.length) state.levelIndex = 0;
    loadLevel(state.levelIndex);
  }

  // ===== Loop
  function loop(){
    state.t++;
    if (state.started){ stepPlayer(); stepEnemies(); }
    draw();
    requestAnimationFrame(loop);
  }

  // ===== Início
  btnStart.addEventListener('click', async () => {
    state.started = true;
    start.classList.remove('show');
    try { if (chkMusic.checked) await music.play(); } catch {}
  });

  loadLevel(state.levelIndex);
  loop();
})();
