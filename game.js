/* JumpQuest — versão com sprites em pixel-art gerados em spritesheet
   - Bonequinho com animação (idle/corrida/pulo) + olhos/borda
   - Moeda animada, plataforma, bloco com textura, espinhos com brilho
   - Inimigo “slime” com 2 frames
   - 2 fases, rolagem lateral, HUD, controles touch e música
*/
(() => {
  // ====== DOM / Estado base
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const start = document.getElementById('start');
  const btnStart = document.getElementById('btnStart');
  const chkMusic = document.getElementById('chkMusic');
  const music = document.getElementById('music');
  const uiLevel = document.getElementById('ui-level');
  const uiCoins = document.getElementById('ui-coins');
  const uiLives = document.getElementById('ui-lives');

  const TILE = 16;
  const GRAV = 0.45, MOVE = 0.75, JUMP = -7.2;
  const MAX_VX = 2.9, MAX_VY = 10;

  const C = {
    sky:'#7ec0ee', cloud:'#ffffff', hill1:'#a3e3a3', hill2:'#7ad07a',
    block:'#8b4513', blockTop:'#5d2e0d', stone:'#6b4a2a', outline:'#000',
    plat:'#7c3aed', platTop:'#4c1d95',
    spike:'#d1d5db', coin:'#ffd84d',
    enemy:'#3b82f6', enemyDark:'#1e40af',
    red:'#ff3b3b', blue:'#1f2937', skin:'#ffd1a3', hair:'#2b2b2b',
    pole:'#6b7280', flag1:'#22c55e', flag2:'#16a34a'
  };

  // ====== Fases (legenda: # bloco | = plataforma | ^ espinho | o moeda | x inimigo | S início | G meta)
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

  // ====== Estado
  const state = { scale:3, started:false, levelIndex:0, coins:0, lives:3, camX:0, t:0 };

  // ====== Responsivo
  function fit(){
    const Wmin = 288;
    const maxW = Math.min(window.innerWidth - 24, 980);
    const scale = Math.max(2, Math.floor(maxW / Wmin));
    canvas.width = Math.floor(maxW);
    canvas.height = Math.floor((14*TILE / Wmin) * maxW);
    state.scale = scale;
    ctx.imageSmoothingEnabled = false;
  }
  addEventListener('resize', fit); fit();

  // ====== Spritesheet gerada no código
  const SS = createSpriteSheet(); // {tiles, player, enemy}

  function createSpriteSheet(){
    // tiles: 0 bloco, 1 plataforma, 2 spikeBase, 3..6 moeda(4), 7 bandeira, 8 nuvem, 9 monte
    const tiles = offscreen(TILE*16, TILE);
    const d = tiles.ctx, cv = tiles.cv;

    // util local
    const R = (x,y,w,h,c)=>{ d.fillStyle=c; d.fillRect(x,y,w,h); };
    const P = (x,y,c)=>{ R(x,y,1,1,c); };

    // 0: bloco com textura e borda
    R(0,0,TILE,TILE,C.block);
    R(0,0,TILE,3,C.blockTop);
    P(12,13,'rgba(0,0,0,.25)'); P(10,11,'rgba(0,0,0,.15)');
    // pontinhos
    P(3,7,C.stone); P(9,5,C.stone);

    // 1: plataforma
    R(TILE*1,4,TILE,8,C.plat); R(TILE*1,4,TILE,2,C.platTop);

    // 2: spike base (cinza escuro)
    R(TILE*2,0,TILE,TILE,'#444');

    // 3-6: moeda (4 frames – “respirando”)
    const coins = ['#FFE066','#FFD84D','#FFC933','#FFD84D'];
    coins.forEach((col,i)=>{
      const x=TILE*(3+i);
      d.clearRect(x,0,TILE,TILE);
      d.fillStyle=col; d.beginPath();
      d.ellipse(x+8,8,5,5,0,0,Math.PI*2); d.fill();
      R(x+6,5,2,2,'#fff');
      d.strokeStyle='#E6B800'; d.strokeRect(x+3,3,10,10);
    });

    // 7: bandeira (poste + pano)
    R(TILE*7+6,0,2,TILE,C.pole);
    R(TILE*7+8,2,8,6,C.flag1);
    R(TILE*7+12,2,4,6,C.flag2);

    // 8: nuvem
    d.fillStyle='#fff';
    d.beginPath(); d.ellipse(TILE*8+8,10,6,4,0,0,Math.PI*2); d.fill();
    d.beginPath(); d.ellipse(TILE*8+6,8,5,4,0,0,Math.PI*2); d.fill();
    d.strokeStyle='#cbd5e1'; d.strokeRect(TILE*8+2,8,12,5);

    // 9: monte
    d.fillStyle=C.hill1; d.beginPath();
    d.moveTo(TILE*9+2,14); d.lineTo(TILE*9+8,4); d.lineTo(TILE*9+14,14); d.closePath(); d.fill();

    // 15: plataforma fina
    R(TILE*15,7,TILE,4,C.plat);

    // ==== Player (5 frames: 0 idle, 1-3 run, 4 jump)
    const player = offscreen(TILE*5, TILE);
    const pd = player.ctx;
    function drawPlayerFrame(xofs, pose){
      // cabeça/cabelo
      pd.fillStyle=C.hair; pd.fillRect(xofs+5,2,6,3);
      pd.fillStyle=C.skin; pd.fillRect(xofs+6,5,5,4);
      // camisa
      pd.fillStyle=C.red; pd.fillRect(xofs+4,9,8,4);
      // pernas
      pd.fillStyle=C.blue;
      if (pose==='idle'){ pd.fillRect(xofs+5,13,2,3); pd.fillRect(xofs+9,13,2,3); }
      if (pose==='run1'){ pd.fillRect(xofs+4,13,3,3); pd.fillRect(xofs+9,12,2,3); }
      if (pose==='run2'){ pd.fillRect(xofs+6,13,2,3); pd.fillRect(xofs+9,13,2,3); }
      if (pose==='run3'){ pd.fillRect(xofs+5,12,2,3); pd.fillRect(xofs+9,13,3,3); }
      if (pose==='jump'){ pd.fillRect(xofs+6,12,2,3); pd.fillRect(xofs+9,12,2,3); }
      // olhos
      pd.fillStyle='#000'; pd.fillRect(xofs+8,6,1,1); pd.fillRect(xofs+10,6,1,1);
      // contorno simples do corpo
      pd.fillStyle='rgba(0,0,0,.25)'; pd.fillRect(xofs+12,12,1,1);
    }
    ['idle','run1','run2','run3','jump'].forEach((p,i)=>drawPlayerFrame(TILE*i,p));

    // ==== Inimigo (slime) 2 frames
    const enemy = offscreen(TILE*2, TILE);
    const ed = enemy.ctx;
    for (let i=0;i<2;i++){
      const x=TILE*i;
      ed.fillStyle=C.enemy; ed.fillRect(x+2,5,12,9);
      ed.fillStyle=C.enemyDark; ed.fillRect(x+2,12,12,2);
      ed.fillStyle='#000'; ed.fillRect(x+5,7+i,2,2); ed.fillRect(x+9,7+i,2,2);
    }

    return { tiles:cv, player:player.cv, enemy:enemy.cv };
  }

  function offscreen(w,h){
    const cv = document.createElement('canvas'); cv.width=w; cv.height=h;
    const ctx = cv.getContext('2d', {alpha:true});
    ctx.imageSmoothingEnabled=false;
    return {cv, ctx};
  }

  // ====== Variáveis de nível
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
      if (c==='o'){ coins.push({x:x*TILE+8, y:y*TILE+8, take:false, f:0}); map[y][x]='.'; }
    }
    uiLevel.textContent = `Fase ${i+1}`;
    state.camX = Math.max(0, player.x - 100);
  }

  function makePlayer(tx,ty){ return { x:tx*TILE+8, y:ty*TILE-1, vx:0, vy:0, w:10, h:14, onGround:false, facing:1, anim:0 }; }
  function makeEnemy(tx,ty){ return { x:tx*TILE+8, y:ty*TILE-1, vx:1.0, dir:-1, w:12, h:12, alive:true, f:0 }; }

  // ====== Entrada (teclado + touch)
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

  // ====== Helpers de mapa/colisão
  const at = (tx,ty)=>(tx<0||ty<0||tx>=W||ty>=H)?'#':map[ty][tx];
  const solid = c=>(c==='#' || c==='=');
  const deadly = c=>(c==='^');
  const goal = c=>(c==='G');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const aabb=(a,b)=>Math.abs(a.x-b.x)<(a.w/2+b.w/2) && Math.abs(a.y-b.y)<(a.h/2+b.h/2);

  function collideX(o){
    const {w,h} = o;
    const L = Math.floor((o.x - w/2)/TILE);
    const R = Math.floor((o.x + w/2)/TILE);
    const T = Math.floor((o.y - h/2)/TILE);
    const B = Math.floor((o.y + h/2)/TILE);
    if (o.vx>0 && (solid(at(R,T))||solid(at(R,B)))){ o.x = R*TILE - w/2 - .01; o.vx=0; }
    if (o.vx<0 && (solid(at(L,T))||solid(at(L,B)))){ o.x = (L+1)*TILE + w/2 + .01; o.vx=0; }
  }
  function collideY(o){
    const {w,h} = o;
    const L = Math.floor((o.x - w/2)/TILE);
    const R = Math.floor((o.x + w/2)/TILE);
    const T = Math.floor((o.y - h/2)/TILE);
    const B = Math.floor((o.y + h/2)/TILE);
    if (o.vy>0 && (solid(at(L,B))||solid(at(R,B)))){ o.y = B*TILE - h/2 - .01; o.vy=0; o.onGround=true; o.vx*=0.88; }
    if (o.vy<0 && (solid(at(L,T))||solid(at(R,T)))){ o.y = (T+1)*TILE + h/2 + .01; o.vy=0; }
  }
  function getCells(o){
    const pts=[{x:o.x-o.w/2,y:o.y-o.h/2},{x:o.x+o.w/2,y:o.y-o.h/2},{x:o.x-o.w/2,y:o.y+o.h/2},{x:o.x+o.w/2,y:o.y+o.h/2}];
    return pts.map(p=>({tx:Math.floor(p.x/TILE), ty:Math.floor(p.y/TILE)})).map(({tx,ty})=>({tx,ty,c:at(tx,ty)}));
  }

  // ====== Lógica
  function stepPlayer(){
    if (keys.left){ player.vx -= MOVE; player.facing=-1; }
    if (keys.right){ player.vx += MOVE; player.facing= 1; }
    if (keys.jump && player.onGround){ player.vy = JUMP; player.onGround=false; }

    player.vx = clamp(player.vx, -MAX_VX, MAX_VX);
    player.vy = clamp(player.vy + GRAV, -MAX_VY, MAX_VY);

    player.x += player.vx; collideX(player);
    player.y += player.vy; player.onGround=false; collideY(player);

    // animação
    if (!player.onGround) player.anim = 4;
    else if (Math.abs(player.vx) > 0.2) player.anim = 1 + Math.floor((state.t/6)%3);
    else player.anim = 0;

    // moedas
    for (const m of coins) if (!m.take){
      if (Math.abs(player.x-m.x)<10 && Math.abs(player.y-m.y)<12){ m.take=true; state.coins++; uiCoins.textContent=`Moedas: ${state.coins}`; }
    }

    // tiles especiais / inimigos
    for (const {c} of getCells(player)){
      if (deadly(c)) { die(); return; }
      if (goal(c)) { nextLevel(); return; }
    }
    for (const e of enemies) if (e.alive){
      if (aabb(player,e)){
        if (player.vy>0 && player.y<e.y){ e.alive=false; player.vy = JUMP*0.6; }
        else { die(); return; }
      }
    }

    state.camX = clamp(player.x - 120, 0, W*TILE - canvas.width/state.scale);
  }

  function stepEnemies(){
    for (const e of enemies) if (e.alive){
      e.f = (e.f+0.1)%2;
      e.x += e.vx*e.dir;
      const ahead = at(Math.floor((e.x + e.dir*8)/TILE), Math.floor(e.y/TILE));
      const groundAhead = at(Math.floor((e.x + e.dir*8)/TILE), Math.floor(e.y/TILE)+1);
      if (solid(ahead) || groundAhead === '.') e.dir *= -1;
    }
  }

  function die(){
    state.lives--; uiLives.textContent = `Vidas: ${state.lives}`;
    if (state.lives<0){ state.levelIndex=0; state.lives=3; state.coins=0; }
    loadLevel(state.levelIndex);
  }
  function nextLevel(){
    state.levelIndex++;
    if (state.levelIndex >= LEVELS.length) state.levelIndex = 0;
    loadLevel(state.levelIndex);
  }

  // ====== Desenho (usa a spritesheet gerada)
  function draw(){
    const s = state.scale, cam = Math.floor(state.camX);

    // céu
    ctx.fillStyle = C.sky;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // parallax
    drawParallax(cam);

    // tiles
    for (let y=0;y<H;y++){
      for (let x=0;x<W;x++){
        const c = map[y][x]; const X = x*TILE - cam, Y = y*TILE;
        if (X+TILE<0 || X>canvas.width/s) continue;
        if (c==='#') tile(0,X,Y);
        else if (c==='=') tile(1,X,Y);
        else if (c==='^'){ tile(2,X,Y); spikeShape(X,Y); }
        else if (c==='G'){ tile(7,X,Y); }
      }
    }

    // moedas animadas
    for (const m of coins){
      if (m.take) continue;
      m.f = (m.f + 0.22) % 4;
      tile(3 + Math.floor(m.f), m.x-8 - cam, m.y-8);
    }

    // inimigos
    for (const e of enemies) if (e.alive){
      sprite(SS.enemy, Math.floor(e.f)*TILE, 0, TILE, TILE, e.x-8 - cam, e.y-8);
    }

    // player
    drawPlayer(player.x - cam, player.y, player.anim);
  }

  function tile(idx, x, y){
    const s=state.scale;
    ctx.drawImage(SS.tiles, idx*TILE, 0, TILE, TILE, Math.floor(x*s), Math.floor(y*s), TILE*s, TILE*s);
  }
  function sprite(sheet, sx, sy, sw, sh, dx, dy){
    const s=state.scale;
    ctx.drawImage(sheet, sx, sy, sw, sh, Math.floor(dx*s), Math.floor(dy*s), sw*s, sh*s);
  }
  function spikeShape(x,y){
    const s=state.scale;
    ctx.fillStyle = C.spike;
    ctx.beginPath();
    ctx.moveTo((x+2)*s,(y+14)*s); ctx.lineTo((x+8)*s,(y+2)*s); ctx.lineTo((x+14)*s,(y+14)*s); ctx.closePath(); ctx.fill();
  }
  function drawPlayer(x,y,frame){
    const s=state.scale;
    ctx.save();
    ctx.translate(Math.floor(x*s), Math.floor(y*s));
    if (player.facing<0){ ctx.scale(-1,1); ctx.translate(-TILE*s,0); }
    ctx.drawImage(SS.player, frame*TILE, 0, TILE, TILE, -8*s, -8*s, TILE*s, TILE*s);
    ctx.restore();
  }
  function drawParallax(cam){
    const s=state.scale;
    // montes
    for (let i=-1;i<8;i++){ const x = (i*80) - (cam*0.4)%80; tile(9, x, canvas.height/s - 40); }
    // nuvens
    for (let i=-1;i<10;i++){ const x = (i*70) - (cam*0.2)%70; tile(8, x, 18); }
  }

  // ====== Loop
  function loop(){
    state.t++;
    if (state.started){ stepPlayer(); stepEnemies(); }
    draw();
    requestAnimationFrame(loop);
  }

  // ====== Start / Música
  btnStart.addEventListener('click', async () => {
    state.started = true;
    start.classList.remove('show');
    try { if (chkMusic.checked) await music.play(); } catch {}
  });

  // ====== Inicializa
  loadLevel(state.levelIndex);
  loop();
})();
