/* JumpQuest — versão arredondada + novos obstáculos
   Novos elementos:
   ~  plataforma móvel (vai e volta)
   M  cogumelo-mola (super pulo ao tocar por cima)
   f  plataforma que cai depois que pisa
   ?  bloco-surpresa: bater por baixo solta uma moeda
   w  água/lava (perigosa)
   Legenda anterior mantida:
   # bloco | = plataforma | ^ espinho | o moeda | x inimigo | S início | G meta
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
  const GRAV = 0.45, MOVE = 0.75, JUMP = -7.2;
  const MAX_VX = 2.9, MAX_VY = 10;

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

  // ===== Fases (inclui novos símbolos)
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

  // ===== Entidades extras (não são tiles)
  let movers = [];     // plataformas móveis (~)
  let fallers = [];    // plataformas que caem (f)
  let springs = [];    // cogumelos-mola (M)
  let qblocks = [];    // blocos-surpresa (guardamos para efeitos)

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
      else if (c==='?'){ qblocks.push({tx:x,ty:y,used:false}); /* fica sólido no mapa */ }
    }
    uiLevel.textContent = `Fase ${i+1}`;
    state.camX = Math.max(0, player.x - 100);
  }

  function makePlayer(tx,ty){ return { x:tx*TILE+8, y:ty*TILE-1, vx:0, vy:0, w:10, h:14, onGround:false, facing:1, anim:0, onMover:null }; }
  function makeEnemy(tx,ty){ return { x:tx*TILE+8, y:ty*TILE-1, vx:1.0, dir:-1, w:12, h:12, alive:true, f:0 }; }
  function makeMover(tx,ty){ return { x:tx*TILE, y:ty*TILE+6, w:TILE, h:8, t:Math.random()*Math.PI*2, amp:24, spd:0.03 }; }
  function makeFaller(tx,ty){ return { x:tx*TILE, y:ty*TILE+6, w:TILE, h:8, falling:false, vy:0 }; }
  function makeSpring(tx,ty){ return { x:tx*TILE+8, y:ty*TILE+10, r:7 }; }

  // ===== Entrada
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

  // ===== Helpers de mapa/colisão
  const at = (tx,ty)=>(tx<0||ty<0||tx>=W||ty>=H)?'#':map[ty][tx];
  const solidTile = c => (c==='#' || c==='=' || c==='?');  // '?' é sólido
  const deadlyTile = c => (c==='^' || c==='w');            // espinho ou água/lava
  const goalTile = c => (c==='G');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const aabb=(a,b)=>Math.abs(a.x-b.x)<(a.w/2+b.w/2) && Math.abs(a.y-b.y)<(a.h/2+b.h/2);

  // ===== Física do player
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

    // coletar efeitos de '?' quando bate por baixo
    // (já tratado em collideY subindo)

    // inimigos
    for (const e of enemies) if (e.alive){
      if (aabb(player,e)){
        if (player.vy>0 && player.y<e.y){ e.alive=false; player.vy = JUMP*0.6; }
        else { die(); return; }
      }
    }

    // contato com entidades extras
    player.onMover = null;
    // springs (M)
    for (const s of springs){
      if (Math.abs(player.x - s.x) < (player.w/2 + s.r/2) && Math.abs(player.y - (s.y-6)) < 12){
        // só ativa se descendo e acima
        if (player.vy>0 && player.y < s.y){ player.vy = JUMP*1.3; player.onGround=false; }
      }
    }
    // movers (~) e fallers (f) como plataformas
    for (const m of movers){
      const plat = {x:m.x + Math.sin(m.t)*m.amp, y:m.y, w:m.w, h:m.h};
      if (player.vy>0 && player.y < plat.y && Math.abs(player.x - (plat.x+plat.w/2)) < (player.w/2+plat.w/2) && Math.abs(player.y - (plat.y)) < 14){
        player.y = plat.y - player.h/2 - .01; player.vy = 0; player.onGround = true; player.vx *= 0.88;
        player.onMover = plat.x - (m.x + Math.sin(m.t)*m.amp); // usado só pra indicar que está sobre algo móvel
      }
    }
    for (const f of fallers){
      const plat = {x:f.x, y:f.y, w:f.w, h:f.h};
      if (!f.falling && player.vy>0 && player.y < plat.y && Math.abs(player.x - (plat.x+plat.w/2)) < (player.w/2+plat.w/2) && Math.abs(player.y - (plat.y)) < 14){
        player.y = plat.y - player.h/2 - .01; player.vy = 0; player.onGround = true; player.vx *= 0.88;
        f.falling = true;
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
      if (solidTile(ahead) || groundAhead === '.') e.dir *= -1;
    }
  }

  function stepEntities(){
    // mover plataformas
    for (const m of movers){ m.t += m.spd; }
    // cair plataformas
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

    if (o.vy>0 && (solidTile(at(L,B))||solidTile(at(R,B)))){ // chão
      o.y = B*TILE - h/2 - .01; o.vy=0; o.onGround=true; o.vx*=0.88;
    }
    if (o.vy<0){ // batendo por baixo (teto)
      const hitL = at(L,T), hitR = at(R,T);
      if (solidTile(hitL) || solidTile(hitR)){
        o.y = (T+1)*TILE + h/2 + .01; o.vy=0;
        // se for bloco-surpresa, usa e dá moeda
        function hitQuestion(tx,ty){
          const qq = qblocks.find(q=>q.tx===tx && q.ty===ty);
          if (qq && !qq.used){
            qq.used = true;
            // troca '?' por bloco normal
            map[ty][tx] = '#';
            // "solta" uma moeda animando pra cima e adiciona quando sobe
            coins.push({x:tx*TILE+8,y:ty*TILE-4, take:false, f:0, pop:1}); // pop=1 animação de surgir
          }
        }
        if (hitL==='?') hitQuestion(L,T);
        if (hitR==='?') hitQuestion(R,T);
      }
    }

    // tiles especiais perigosos/objetivo
    const cells = getCells(o);
    for (const {c} of cells){
      if (deadlyTile(c)) { die(); return; }
      if (goalTile(c)) { nextLevel(); return; }
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

  // ===== Desenho (arredondado)
  function draw(){
    const s = state.scale, cam = Math.floor(state.camX);

    // céu
    ctx.fillStyle = C.sky;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // parallax
    drawParallax(cam);

    // tiles básicos
    for (let y=0;y<H;y++){
      for (let x=0;x<W;x++){
        const c = map[y][x]; const X = x*TILE - cam, Y = y*TILE;
        if (X+TILE<0 || X>canvas.width/s) continue;
        if (c==='#') roundedBlock(X,Y);
        else if (c==='=') roundedPlatform(X,Y);
        else if (c==='^') roundedSpike(X,Y);
        else if (c==='G') drawFlag(X,Y);
        else if (c==='?') questionBlock(X,Y, isQUsed(x,y));
        else if (c==='w') waterTile(X,Y);
      }
    }

    // entidades: plataformas móveis e que caem
    for (const m of movers){
      const px = m.x + Math.sin(m.t)*m.amp - cam;
      roundedPlatform(px, m.y-6, m.w, m.h);
    }
    for (const f of fallers){
      roundedPlatform(f.x - cam, f.y-6, f.w, f.h, f.falling?0.5:1);
    }

    // springs
    for (const sp of springs){
      roundedMushroom(sp.x - cam, sp.y);
    }

    // moedas (pop-up quando saem de ?)
    for (const m of coins){
      if (m.take) continue;
      if (m.pop){ // anima subir
        m.y -= 0.7; m.pop += 0.02;
        if (m.pop>1.2) m.pop = 0; // termina
      }
      m.f = (m.f + 0.22) % 4;
      coinSprite(m.x-8 - cam, m.y-8, Math.floor(m.f));
    }

    // inimigos
    for (const e of enemies) if (e.alive) slime(e.x-8 - cam, e.y-8, Math.floor(e.f));

    // player
    drawPlayer(player.x - cam, player.y, player.anim);
  }

  function isQUsed(tx,ty){
    const q = qblocks.find(q=>q.tx===tx && q.ty===ty);
    return q && q.used;
  }

  // ===== Desenho helpers (rounded)
  function rr(x,y,w,h,r,color){ // roundedRect
    const s = state.scale;
    x*=s; y*=s; w*=s; h*=s; r*=s;
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  function rect(x,y,w,h,c){ ctx.fillStyle=c; ctx.fillRect(Math.floor(x*state.scale),Math.floor(y*state.scale),Math.ceil(w*state.scale),Math.ceil(h*state.scale)); }
  function px(x,y,c){ rect(x,y,1,1,c); }

  function roundedBlock(x,y){
    rr(x+1,y+1,TILE-2,TILE-2,3,C.block);
    rect(x,y,TILE,3,C.blockTop);
    px(x+TILE-3,y+TILE-3,C.shadow);
  }
  function roundedPlatform(x,y,w=TILE,h=8,alpha=1){
    ctx.globalAlpha = alpha;
    rr(x+1,y+3,w-2,h-2,3,C.plat);
    rect(x,y+3,w,2,C.platTop);
    ctx.globalAlpha = 1;
  }
  function roundedSpike(x,y){
    rr(x+2,y+8,12,6,3,'#444');
    // triângulos
    const s=state.scale;
    ctx.fillStyle = C.spike;
    const xs=[x+3,x+7,x+11];
    xs.forEach(xx=>{
      ctx.beginPath();
      ctx.moveTo((xx)*s,(y+13)*s);
      ctx.lineTo((xx+2)*s,(y+8)*s);
      ctx.lineTo((xx+4)*s,(y+13)*s);
      ctx.closePath(); ctx.fill();
    });
  }
  function questionBlock(x,y,used){
    if (!used){
      rr(x+1,y+1,TILE-2,TILE-2,3,'#F59E0B'); rect(x,y,TILE,3,'#B45309');
      px(x+7,y+7,'#fff');
    } else {
      roundedBlock(x,y);
    }
  }
  function waterTile(x,y){
    rr(x+1,y+4,TILE-2,TILE-4,4,C.water);
    // brilho ondinha
    px(x+3,y+6,'#e0f2fe'); px(x+8,y+7,'#e0f2fe'); px(x+12,y+6,'#e0f2fe');
  }
  function drawFlag(x,y){
    rect(x+3,y-16,2,16,C.pole);
    rr(x+5,y-14,10,6,3,C.flag1);
    rr(x+11,y-14,4,6,3,C.flag2);
  }
  function coinSprite(x,y,frame){
    const sizes=[8,10,12,10];
    const w=sizes[frame]; const dx=x + (16-w)/2;
    rr(dx,y+4,w,w,Math.min(4,w/3),C.coin);
    px(dx+Math.max(2,w-6),y+6,'#fff');
  }
  function slime(x,y,frame){
    rr(x+2,y+4,12,9,4,C.enemy);
    rect(x+2,y+12,12,2,C.enemyDark);
    px(x+5,y+7+(frame?1:0),'#000'); px(x+9,y+7+(frame?1:0),'#000');
  }
  function roundedMushroom(x,y){
    // caule
    rr(x-2,y-8,4,8,2,'#d4d4d8');
    // topo
    rr(x-7,y-15,14,10,6,'#ef4444');
    px(x-3,y-12,'#fff'); px(x+1,y-11,'#fff');
  }

  function drawPlayer(x,y,frame){
    const s=state.scale;
    ctx.save();
    ctx.translate(Math.floor(x*s),Math.floor(y*s));
    if (player.facing<0){ ctx.scale(-1,1); }
    // cabeça/cabelo
    rr(-6,-12,12,4,2,C.hair);
    rr(-4,-8,8,6,2,C.skin);
    // camisa
    rr(-6,-2,12,8,3,C.red);
    // pernas
    const legs = [
      [[-6,6,5,4],[1,6,5,4]],     // idle
      [[-6,6,5,4],[3,5,5,4]],     // run1
      [[-4,6,5,4],[1,6,5,4]],     // run2
      [[-5,5,5,4],[2,6,5,4]],     // run3
      [[-5,6,5,4],[1,5,5,4]],     // jump
    ][frame];
    rr(...legs[0],3,C.blue); rr(...legs[1],3,C.blue);
    ctx.restore();
  }

  function drawParallax(cam){
    // montes
    for (let i=-1;i<8;i++){
      const x = (i*80) - (cam*0.4)%80;
      rr(x, canvas.height/state.scale - 36, 56, 28, 12, C.hill1);
    }
    // nuvens
    for (let i=-1;i<10;i++){
      const x = (i*70) - (cam*0.2)%70;
      rr(x+2, 20, 18, 8, 4, C.cloud);
    }
  }

  // ===== Loop principal
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
