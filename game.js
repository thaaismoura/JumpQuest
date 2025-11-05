/* Pixel Runner — plataforma em pixel art
function spike(x,y){
ctx.fillStyle = '#444'; rect(x,y,1,1);
ctx.fillStyle = '#e5e7eb';
// três triângulos simples
tri(x*TILE+2, y*TILE+14, x*TILE+6, y*TILE+2, x*TILE+10, y*TILE+14);
tri(x*TILE+6, y*TILE+14, x*TILE+10, y*TILE+2, x*TILE+14, y*TILE+14);
}
function flag(x,y){
// poste
ctx.fillStyle = '#6b7280'; rect(x+0.1,y-2,0.2,3);
// bandeira
ctx.fillStyle = '#22c55e'; rect(x+0.3,y-1.7,0.8,0.6);
ctx.fillStyle = '#16a34a'; rect(x+0.9,y-1.7,0.3,0.6);
}
function drawBanner(text){
ctx.save();
ctx.scale(s,s);
ctx.fillStyle = 'rgba(0,0,0,.5)';
ctx.fillRect(2,2, W*TILE-4, 20);
ctx.fillStyle = '#fff';
ctx.font = '10px monospace';
ctx.textBaseline = 'top';
ctx.fillText(text, 8, 6);
ctx.restore();
}
function rect(x,y,w,h){
ctx.fillRect(Math.floor(x*TILE* s), Math.floor(y*TILE* s), Math.ceil(w*TILE* s), Math.ceil(h*TILE* s));
}
function px(x,y){ ctx.fillRect(Math.floor(x*state.scale), Math.floor(y*state.scale), Math.ceil(1*state.scale), Math.ceil(1*state.scale)); }
function tri(x1,y1,x2,y2,x3,y3){
ctx.beginPath();
ctx.moveTo(Math.floor(x1*state.scale), Math.floor(y1*state.scale));
ctx.lineTo(Math.floor(x2*state.scale), Math.floor(y2*state.scale));
ctx.lineTo(Math.floor(x3*state.scale), Math.floor(y3*state.scale));
ctx.closePath();
ctx.fill();
}
}


// ======= Loop =======
function loop(){
state.t++;
if (state.started && !state.won) step();
draw();
requestAnimationFrame(loop);
}


// ======= Início / música =======
btnStart.addEventListener('click', async () => {
state.started = true;
startOverlay.classList.remove('show');
try { if (chkMusic.checked) await music.play(); } catch (e) { /* ignore */ }
});
chkMusic.addEventListener('change', () => {
if (!state.started) return;
if (chkMusic.checked) music.play(); else music.pause();
});


// Começa o loop imediatamente (mas o jogo só inicia quando clica)
loop();
})();
