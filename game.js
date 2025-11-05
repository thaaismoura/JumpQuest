/* JumpQuest — controle de pulo preciso + obstáculos mais justos
   Inclui:
   - Coyote time, jump buffer e pulo variável
   - Atrito no chão e controle no ar
   - Hitboxes mais justas (jogador menor e espinhos menos punitivos)
   - Mantém visual arredondado, moedas, inimigos, plataformas móveis (~),
     plataformas que caem (f), cogumelo-mola (M), bloco-surpresa (?), água/lava (w)
*/
(() => {
  // ===== DOM / HUD
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const start = document.getElementById('start');
  const btnStart = document.getElementById('btnStart');
  const chkMusic = document.getElementById('chkMusic');
  const music = document.getElementById('music');
  const uiLevel = document.getElementById('ui-level');
  const uiCoins = document.getElementById('ui-coins');
  const uiLives = document.getElementById('ui-lives');

  // ===== Mundo / Física
  const TILE = 16;

  // Física “precisa”
  const GRAV = 0.50;           // gravidade base
  const MOVE_GROUND = 0.95;    // aceleração no chão
  const MOVE_AIR = 0.65;       // aceleração no ar
  const JUMP_VEL = -8.2;       // impulso do pulo
  const JUMP_CUT = 0.45;       // corte do pulo ao soltar botão
  const MAX_VX = 3.1;          // velocidade horizontal máx
  const MAX_VY = 10;

  const COYOTE_FRAMES = 8;     // perdão após sair da borda
  const BUFFER_FRAMES = 8;     // perdão para apertar antes de tocar no chão

  // ===== Paleta
  const C = {
    sky:'#7ec0ee', cloud:'#ffffff',
    hill1:'#a3e3a3', hill2:'#7ad07a',
    block:'#8b5a2b', blockTop:'#5d3a18',
    plat:'#7c3aed', platTop:'#4c1d95',
    spike:'#d1d5db', coin:'#ffd84d',
    enemy:'#3b82f6', enemyDark:'#1e40af',
    red:'#ff3b3b', blue:'#1f2937', skin:'#ffd1a3', hair:'#2b2b2b',
    pole:'#6b7280', flag1:'#22c55e', flag2:'#16a34a',
    water:'#3da9fc', lava:'#ef4444', shadow:'rgba(0,0,0,.25)'
  };

  // ===== Fases (mesmas do seu jogo arredondado)
  const LEVELS = [
`................................................................................................
................................................................................................
...........................................o......o.............................................
......................o..............====..............~........................................
....................####..................o.................................................w...
...........S.............?................x..........................o......................w...
###########....................==....................................####...................w...
...........o.....M.....^^^^^.............o....................^^^^^..................f.....w....
............................................................=======..........................w..
....................x..............................o.......................................w...
..................#####.......................................................G.............w..
.....o.....................................^^^^^.............o...........^^^^^..............w..
#############################..########################..##################################wwww
#############################..########################..##################################wwww`,
`................................................................................................
................................................................................................
.............................o...........o......................................................
..............M..............====..................~............................................
...........S.............?............................o.................?.......................
###########......................==....................................####.....................
...........o...........^^^^^.............o....................^^^^^..................o..........
............................................................=======......................M......
....................x.............................................................x............
..................#####..........................................................G.............
.....o.....................................^^^^^...................o...........^^^^^...........
#############################..########################..######################################
#############################..########################..######################################`
  ];

  // ===== Estado
  const state = { scale:3, started:false, levelIndex:0, coins:0, lives:3, camX:0, t:0 };

  // ===== Responsivo
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

  // ===== Entidades extras
  let movers = [];     // ~
  let fallers = [];    // f
  let springs = [];    // M
  let qblocks = [];    // ?

  // ===== Variáveis do nível
  let map, H, W, player, enemies, coins;

  // ===== Construção do nível
  function loadLevel(i){
    const rows = LEVELS[i].split('\n').map(r=>r.trimEnd());
    H = rows.length; W = rows[0].length;
    map = rows.map(r=>r.split(''));
    enemies = []; coins = []; movers = []; fallers = []; springs = []; qblocks = [];

    for (let y=0;y<H;y++) for (let x=0;x<W;x++){
      const c = map[y][x];
      if (c==='S'){ player = makePlayer(x,y); map[y][x]='.'; }
      else if (c==='x'){ enemies.push(makeEnemy(x,y)); map[y][x]='.'; }
      else if (c==='o'){ coins.push({x:x*TILE+8,y:y*TILE+8, take:false, f:0}); map[y][x]='.'; }
      else if (c==='~'){ movers.push(makeMover(x,y)); map[y][x]='.'; }
      else if (c==='f'){ fallers.push(makeFaller(x,y)); map[y][x]='.'; }
      else if (c==='M'){ springs.push(makeSpring(x,y)); map[y][x]='.'; }
      else if (c==='?'){ qblocks.push({tx:x,ty:y,used:false}); }
    }
    uiLevel.textContent = `Fase ${i+1}`;
    state.camX = Math.max(0, player.x - 100);
  }

  function makePlayer(tx,ty){
    return {
      x:tx*TILE+8, y:ty*TILE-1, vx:0, vy:0,
      w:9, h:13,                   // hitbox um pouco menor = mais justo
      onGround:false, facing:1, anim:0,
      coyote:0, buffer:0, jumpHeld:false, onMover:null
    };
  }
  function makeEnemy(tx,ty){ return { x:tx*TILE+8, y:ty*TILE-1, vx:1.0, dir:-1, w:12, h:12, alive:true, f:0 }; }
  function makeMover(tx,ty){ return { x:tx*TILE, y:ty*TILE+6, w:TILE, h:8, t:Math.random()*Math.PI*2, amp:24, spd:0.03 }; }
  function makeFaller(tx,ty){ return { x:tx*TILE, y:ty*TILE+6, w:TILE, h:8, falling:false, vy:0 }; }
  function makeSpring(tx,ty){ return { x:tx*TILE+8, y:ty*TILE+10, r:7 }; }

  // ===== Entrada
  const keys = { left:false, right:false, jump:false, jumpPressed:false, jumpReleased:false };
  addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.code==='ArrowLeft'||e.code==='KeyA') keys.left = true;
    if (e.code==='ArrowRight'||e.code==='KeyD') keys.right = true;
    if (e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW'){ keys.jump = true; keys.jumpPressed = true; }
  });
  addEventListener('keyup', e => {
    if (e.code==='ArrowLeft'||e.code==='KeyA') keys.left = false;
    if (e.code==='ArrowRight'||e.code==='KeyD') keys.right = false;
    if (e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW'){ keys.jump = false; keys.jumpReleased = true; }
  });
  bindTouch('btnLeft','left'); bindTouch('btnRight','right'); bindTouch('btnJump','jump');
  function bindTouch(id, prop){
    const el = document.getElementById(id);
    const on = e=>{e.preventDefault(); if(prop==='jump'){keys.jumpPressed=true;} keys[prop]=true;};
    const off= e=>{e.preventDefault(); if(prop==='jump'){keys.jumpReleased=true;} keys[prop]=false;};
    ['touchstart','pointerdown','mousedown'].forEach(ev=>el.addEventListener(ev,on));
    ['touchend','pointerup','mouseup','mouseleave','touchcancel'].forEach(ev=>el.addEventListener(ev,off));
  }

  // ===== Helpers de mapa/colisão
  const at = (tx,ty)=>(tx<0||ty<0||tx>=W||ty>=H)?'#':map[ty][tx];
  const solidTile = c => (c==='#' || c==='=' || c==='?');
  const deadlyTile = (c, px, py) => {
    // espinho só mata se pegar a “parte pontuda” (topo do triângulo)
    if (c==='^'){
      const tileTop = Math.floor(py/TILE)*TILE;
      return (py + 6) >= (tileTop + 10); // precisa encostar mais em cima
    }
    return c==='w'; // água/lava sempre perigosa
  };
  const goalTile = c => (c==='G');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const aabb=(a,b)=>Math.abs(a.x-b.x)<(a.w/2+b.w/2) && Math.abs(a.y-b.y)<(a.h/2+b.h/2);

  // ===== Física do player com coyote/buffer/jump-cut
  function stepPlayer(){
    // buffers
    if (player.coyote > 0) player.coyote--;
    if (player.buffer > 0) player.buffer--;

    // entrada horizontal com aceleração distinta
    const accel = player.onGround ? MOVE_GROUND : MOVE_AIR;
    if (keys.left)  player.vx -= accel;
    if (keys.right) player.vx += accel;

    // jump buffer: registra apertar
    if (keys.jumpPressed){ player.buffer = BUFFER_FRAMES; }
    keys.jumpPressed = false;

    // coyote: se no chão, renova
    if (player.onGround) player.coyote = COYOTE_FRAMES;

    // pode pular se tiver buffer e coyote
    if (player.buffer > 0 && (player.onGround || player.coyote > 0)){
      player.vy = JUMP_VEL;
      player.onGround = false;
      player.coyote = 0;
      player.buffer = 0;
      player.jumpHeld = true;
    }

    // pulo variável: soltou o botão -> corta a subida
    if (keys.jumpReleased){
      if (player.vy < 0) player.vy += JUMP_CUT;
    }
    keys.jumpReleased = false;

    // gravidade/limites
    player.vx = clamp(player.vx, -MAX_VX, MAX_VX);
    player.vy = clamp(player.vy + GRAV, -MAX_VY, MAX_VY);

    // movimento e colisão
    player.x += player.vx; collideX(player);
    player.y += player.vy; player.onGround=false; collideY(player);

    // atrito no chão
    if (player.onGround && !keys.left && !keys.right) player.vx *= 0.82;
    // leve arrasto no ar
    if (!player.onGround && !keys.left && !keys.right) player.vx *= 0.99;

    // animação
    if (!player.onGround) player.anim = 4;
    else if (Math.abs(player.vx) > 0.25) player.anim = 1 + Math.floor((state.t/6)%3);
    else player.anim = 0;

    // moedas
    for (const m of coins) if (!m.take){
      if (Math.abs(player.x-m.x)<9 && Math.abs(player.y-m.y)<11){ m.take=true; state.coins++; uiCoins.textContent=`Moedas: ${state.coins}`; }
    }

    // inimigos
    for (const e of enemies) if (e.alive){
      if (aabb(player,e)){
        if (player.vy>0 && player.y<e.y){ e.alive=false; player.vy = JUMP_VEL*0.6; }
        else { die(); return; }
      }
    }

    // entidades especiais (molas e plataformas)
    // molas (M)
    for (const s of springs){
      if (Math.abs(player.x - s.x) < (player.w/2 + s.r/2) && Math.abs(player.y - (s.y-6)) < 12){
        if (player.vy>0 && player.y < s.y){ player.vy = JUMP_VEL*1.35; player.onGround=false; }
      }
    }
    // plataformas móveis (~)
    for (const m of movers){
      const platX = m.x + Math.sin(m.t)*m.amp;
      const plat = {x:platX, y:m.y, w:m.w, h:m.h};
      const onTop = player.vy>0 && player.y < plat.y && Math.abs(player.x - (plat.x+plat.w/2)) < (player.w/2+plat.w/2) && Math.abs(player.y - (plat.y)) < 14;
      if (onTop){
        player.y = plat.y - player.h/2 - .01; player.vy = 0; player.onGround = true; player.vx *= 0.88;
        // leva um pouco junto na direção do movimento
        player.x += (Math.cos(m.t)*m.amp) * 0.02;
      }
    }
    // plataformas que caem (f)
    for (const f of fallers){
      const plat = {x:f.x, y:f.y, w:f.w, h:f.h};
      const onTop = !f.falling && player.vy>0 && player.y < plat.y && Math.abs(player.x - (plat.x+plat.w/2)) < (player.w/2+plat.w/2) && Math.abs(player.y - (plat.y)) < 14;
      if (onTop){
        player.y = plat.y - player.h/2 - .01; player.vy = 0; player.onGround = true; player.vx *= 0.88;
        f.falling = true;
      }
    }

    // câmera
    state.camX = clamp(player.x - 120, 0, W*TILE - canvas.width/state.scale);
  }

  function stepEnemies(){
    for (const e of enemies) if (e.alive){
      e.f = (e.f+0.1)%2;
      e.x += e.vx*e.dir;
      const ahead = at(Math.floor((e.x + e.dir*8)/TILE), Math.floor(e.y/TILE));
      const groundAhead = at(Math.floor((e.x + e.dir*8)/TILE), Math.floor(e.y/TILE)+1);
      if (solidTile(ahead) || groundAhead === '.') e.dir *= -1;
    }
  }

  function stepEntities(){
    for (const m of movers){ m.t += m.spd; }
    for (const f of fallers){ if (f.falling){ f.vy+=0.25; f.y += f.vy; } }
  }

  // ===== Colisão com tiles
  function collideX(o){
    const {w,h} = o;
    const L = Math.floor((o.x - w/2)/TILE);
    const R = Math.floor((o.x + w/2)/TILE);
    const T = Math.floor((o.y - h/2)/TILE);
    const B = Math.floor((o.y + h/2)/TILE);
    if (o.vx>0 && (solidTile(at(R,T))||solidTile(at(R,B)))){ o.x = R*TILE - w/2 - .01; o.vx=0; }
    if (o.vx<0 && (solidTile(at(L,T))||solidTile(at(L,B)))){ o.x = (L+1)*TILE + w/2 + .01; o.vx=0; }
  }
  function collideY(o){
    const {w,h} = o;
    const L = Math.floor((o.x - w/2)/TILE);
    const R = Math.floor((o.x + w/2)/TILE);
    const T = Math.floor((o.y - h/2)/TILE);
    const B = Math.floor((o.y + h/2)/TILE);

    // chão
    if (o.vy>0 && (solidTile(at(L,B))||solidTile(at(R,B)))){ o.y = B*TILE - h/2 - .01; o.vy=0; o.onGround=true; }
    // teto (inclui bloco-surpresa '?')
    if (o.vy<0){
      const hitL = at(L,T), hitR = at(R,T);
      if (solidTile(hitL) || solidTile(hitR)){
        o.y = (T+1)*TILE + h/2 + .01; o.vy=0;
        function hitQuestion(tx,ty){
          const qb = qblocks.find(q=>q.tx===tx && q.ty===ty);
          if (qb && !qb.used){
            qb.used = true;
            map[ty][tx] = '#'; // vira bloco normal
            coins.push({x:tx*TILE+8,y:ty*TILE-4, take:false, f:0, pop:1});
          }
        }
        if (hitL==='?') hitQuestion(L,T);
        if (hitR==='?') hitQuestion(R,T);
      }
    }

    // perigos/objetivo com hitbox mais justa
    const cells = getCells(o);
    for (const cell of cells){
      if (deadlyTile(cell.c, o.x, o.y)){ die(); return; }
      if (goalTile(cell.c)) { nextLevel(); return; }
    }
  }
  function getCells(o){
    const pts=[{x:o.x-o.w/2,y:o.y-o.h/2},{x:o.x+o.w/2,y:o.y-o.h/2},{x:o.x-o.w/2,y:o.y+o.h/2},{x:o.x+o.w/2,y:o.y+o.h/2}];
    return pts.map(p=>({tx:Math.floor(p.x/TILE), ty:Math.floor(p.y/TILE)})).map(({tx,ty})=>({tx,ty,c:at(tx,ty)}));
  }

  // ===== Morte / próxima fase
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

  // ===== Desenho arredondado (mesmo visual anterior)
  function rr(x,y,w,h,r,color){
    const s = state.scale;
    x*=s; y*=s; w*=s; h*=s; r*=s;
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
  }
  function rect(x,y,w,h,c){ ctx.fillStyle=c; ctx.fillRect(Math.floor(x*state.scale),Math.floor(y*state.scale),Math.ceil(w*state.scale),Math.ceil(h*state.scale)); }
  function px(x,y,c){ rect(x,y,1,1,c); }

  function roundedBlock(x,y){ rr(x+1,y+1,TILE-2,TILE-2,3,C.block); rect(x,y,TILE,3,C.blockTop); px(x+TILE-3,y+TILE-3,C.shadow); }
  function roundedPlatform(x,y,w=TILE,h=8,alpha=1){ ctx.globalAlpha=alpha; rr(x+1,y+3,w-2,h-2,3,C.plat); rect(x,y+3,w,2,C.platTop); ctx.globalAlpha=1; }
  function roundedSpike(x,y){
    rr(x+2,y+8,12,6,3,'#444'); // base mais baixa
    const s=state.scale;
    ctx.fillStyle = C.spike;
    [x+3,x+7,x+11].forEach(xx=>{
      ctx.beginPath();
      ctx.moveTo((xx)*s,(y+12)*s);
      ctx.lineTo((xx+2)*s,(y+7)*s); // triângulo mais curto = menos punitivo
      ctx.lineTo((xx+4)*s,(y+12)*s);
      ctx.closePath(); ctx.fill();
    });
  }
  function questionBlock(x,y,used){
    if (!used){ rr(x+1,y+1,TILE-2,TILE-2,3,'#F59E0B'); rect(x,y,TILE,3,'#B45309'); px(x+7,y+7,'#fff'); }
    else { roundedBlock(x,y); }
  }
  function waterTile(x,y){ rr(x+1,y+4,TILE-2,TILE-4,4,C.water); px(x+3,y+6,'#e0f2fe'); px(x+8,y+7,'#e0f2fe'); px(x+12,y+6,'#e0f2fe'); }
  function drawFlag(x,y){ rect(x+3,y-16,2,16,C.pole); rr(x+5,y-14,10,6,3,C.flag1); rr(x+11,y-14,4,6,3,C.flag2); }
  function coinSprite(x,y,frame){ const sizes=[8,10,12,10]; const w=sizes[frame]; const dx=x + (16-w)/2; rr(dx,y+4,w,w,Math.min(4,w/3),C.coin); px(dx+Math.max(2,w-6),y+6,'#fff'); }
  function slime(x,y,frame){ rr(x+2,y+4,12,9,4,C.enemy); rect(x+2,y+12,12,2,C.enemyDark); px(x+5,y+7+(frame?1:0),'#000'); px(x+9,y+7+(frame?1:0),'#000'); }
  function roundedMushroom(x,y){ rr(x-2,y-8,4,8,2,'#d4d4d8'); rr(x-7,y-15,14,10,6,'#ef4444'); px(x-3,y-12,'#fff'); px(x+1,y-11,'#fff'); }

  function drawPlayer(x,y,frame){
    const s=state.scale;
    ctx.save();
    ctx.translate(Math.floor(x*s),Math.floor(y*s));
    if (player.facing<0){ ctx.scale(-1,1); }
    rr(-6,-12,12,4,2,C.hair);
    rr(-4,-8,8,6,2,C.skin);
    rr(-6,-2,12,8,3,C.red);
    const legs = [
      [[-6,6,5,4],[1,6,5,4]],
      [[-6,6,5,4],[3,5,5,4]],
      [[-4,6,5,4],[1,6,5,4]],
      [[-5,5,5,4],[2,6,5,4]],
      [[-5,6,5,4],[1,5,5,4]],
    ][frame];
    rr(...legs[0],3,C.blue); rr(...legs[1],3,C.blue);
    ctx.restore();
  }

  function drawParallax(cam){
    for (let i=-1;i<8;i++){ const x = (i*80) - (cam*0.4)%80; rr(x, canvas.height/state.scale - 36, 56, 28, 12, C.hill1); }
    for (let i=-1;i<10;i++){ const x = (i*70) - (cam*0.2)%70; rr(x+2, 20, 18, 8, 4, C.cloud); }
  }

  function isQUsed(tx,ty){ const q = qblocks.find(q=>q.tx===tx && q.ty===ty); return q && q.used; }

  // ===== Loop
  function loop(){
    state.t++;
    if (state.started){ stepPlayer(); stepEnemies(); stepEntities(); }
    draw();
    requestAnimationFrame(loop);
  }

  // ===== Start / Música
  btnStart.addEventListener('click', async () => {
    state.started = true;
    start.classList.remove('show');
    try { if (chkMusic.checked) await music.play(); } catch {}
  });

  // ===== Inicializa
  loadLevel(state.levelIndex);
  loop();
})();
