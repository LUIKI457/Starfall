(() => {
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;
const W = canvas.width, H = canvas.height, TS = 16;
const SAVE_KEY = 'starfall-save-v1';

const ZONES = [
  {name:'ORBITA ZERO', subtitle:'ESTAÇÃO PERDIDA', color:'#61d8ee', dark:'#102b48', sky:'#0c1532', ground:'#304d72', glow:'#4ad9ff', enemy:'DRONE', boss:'GUARDIÃO ORBITAL', desc:'Sinais de vida detectados na estação.'},
  {name:'VULCAN-9', subtitle:'MUNDO DE CINZAS', color:'#ff9b58', dark:'#4a1c2c', sky:'#281126', ground:'#713044', glow:'#ff7048', enemy:'BRASA', boss:'COLOSSO MAGMÁTICO', desc:'A crosta do planeta está entrando em colapso.'},
  {name:'MYR', subtitle:'OCEANO SILENCIOSO', color:'#6df2d3', dark:'#103f52', sky:'#08243b', ground:'#286d79', glow:'#3fffd0', enemy:'VIGIA', boss:'LEVIATÃ ABISSAL', desc:'Há algo se movendo sob as ruínas.'},
  {name:'FERROVIA CÓSMICA', subtitle:'SETOR INDUSTRIAL', color:'#d69cff', dark:'#30204f', sky:'#17132e', ground:'#59456d', glow:'#c889ff', enemy:'SENTINELA', boss:'UNIDADE TITÃ', desc:'A fábrica continua operando sem tripulação.'},
  {name:'O NÚCLEO', subtitle:'FIM DO MAPA ESTELAR', color:'#ffe58a', dark:'#3b294d', sky:'#171028', ground:'#5d4779', glow:'#fff09b', enemy:'ECO', boss:'A ENTIDADE', desc:'A origem da ruptura está logo adiante.'}
];

const defaultSave = () => ({unlocked:0, completed:[], crystals:0, totalCrystals:0, bestTime:0, sound:true, lastZone:0, nickname:'PILOTO'});
let save = loadSave();
function loadSave(){
  try { const v = JSON.parse(localStorage.getItem(SAVE_KEY)); return {...defaultSave(), ...(v && typeof v === 'object' ? v : {})}; }
  catch { return defaultSave(); }
}
function persist(){
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); const el=document.getElementById('save-indicator'); if(el) el.textContent='PROGRESSO SALVO'; }
  catch { const el=document.getElementById('save-indicator'); if(el) el.textContent='SALVAMENTO INDISPONÍVEL'; }
}

let state = 'title';
let selectedZone = Math.min(save.unlocked, 4);
let zoneIndex = 0;
let level = null;
let player = null;
let camera = {x:0,y:0};
let shots = [], enemyShots = [], particles = [], pickups = [], enemies = [];
let boss = null, bossActive = false, bossDefeated = false;
let messages = [], screenFlash = 0;
let elapsed = 0, worldClock = 0, runCrystals = 0;
let checkpointX = 32;
let audioCtx = null;
const input = {left:false,right:false,jump:false,fire:false,dash:false};
const prevInput = {...input};
const keyMap = {
  ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right',
  ArrowUp:'jump', KeyW:'jump', Space:'jump',
  KeyJ:'fire', KeyX:'fire', KeyK:'dash', KeyZ:'dash', ShiftLeft:'dash', ShiftRight:'dash'
};

function sfx(freq=440, duration=.07, type='square', volume=.035){
  if(!save.sound) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state==='suspended') audioCtx.resume();
    const osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
    osc.type=type; osc.frequency.setValueAtTime(freq,audioCtx.currentTime);
    gain.gain.setValueAtTime(volume,audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime+duration);
  } catch {}
}
function soundToggle(){ save.sound=!save.sound; persist(); document.getElementById('sound-btn').textContent=save.sound?'♫ SOM':'♫ MUDO'; if(save.sound)sfx(660,.09); }
document.getElementById('sound-btn').addEventListener('click',soundToggle);
document.getElementById('sound-btn').textContent=save.sound?'♫ SOM':'♫ MUDO';

window.addEventListener('keydown', e => {
  if(['ArrowLeft','ArrowRight','ArrowUp','Space'].includes(e.code)) e.preventDefault();
  if(keyMap[e.code]) input[keyMap[e.code]]=true;
  if((e.code==='Escape'||e.code==='KeyP') && !e.repeat){
    if(state==='playing') state='pause'; else if(state==='pause') state='playing'; else if(state==='map'||state==='gameover'||state==='between') state='title';
  }
  if((e.code==='Enter'||e.code==='Space') && !e.repeat) keyboardAction();
});
window.addEventListener('keyup', e => { if(keyMap[e.code]) input[keyMap[e.code]]=false; });
window.addEventListener('blur',()=>{Object.keys(input).forEach(k=>input[k]=false); if(state==='playing') state='pause';});

for(const button of document.querySelectorAll('[data-control]')){
  const name=button.dataset.control;
  const down=e=>{e.preventDefault(); input[name]=true; button.classList.add('pressed'); try{button.setPointerCapture(e.pointerId);}catch{}};
  const up=e=>{e.preventDefault(); input[name]=false; button.classList.remove('pressed');};
  button.addEventListener('pointerdown',down); button.addEventListener('pointerup',up); button.addEventListener('pointercancel',up); button.addEventListener('lostpointercapture',up);
  button.addEventListener('contextmenu',e=>e.preventDefault());
}

function keyboardAction(){
  if(state==='title') { if(save.completed.length) {selectedZone=Math.min(save.unlocked,4); startLevel(selectedZone);} else openMap(); }
  else if(state==='map') startLevel(selectedZone);
  else if(state==='pause') state='playing';
  else if(state==='gameover') retryLevel();
  else if(state==='between') { if(zoneIndex<4) openMap(); else state='victory'; }
  else if(state==='victory') state='title';
}
canvas.addEventListener('pointerdown', e=>{
  const r=canvas.getBoundingClientRect(); const x=(e.clientX-r.left)*W/r.width, y=(e.clientY-r.top)*H/r.height;
  if(state!=='playing') menuClick(x,y);
});
function menuClick(x,y){
  if(state==='title'){
    if(y>=143&&y<172){ if(save.completed.length) {selectedZone=Math.min(save.unlocked,4);startLevel(selectedZone);} else openMap(); }
    else if(y>=172&&y<189) openMap();
    else if(y>=189&&y<211) {save=defaultSave(); persist(); selectedZone=0; startLevel(0);}
  } else if(state==='map'){
    if(y>49&&y<151){ for(let idx=0;idx<5;idx++){const cx=10+idx*74;if(x>=cx&&x<=cx+65&&idx<=save.unlocked){selectedZone=idx;sfx(520,.05);}} }
    if(y>178){ if(x<185) state='title'; else startLevel(selectedZone); }
  } else if(state==='pause'){
    if(y>105&&y<137) state='playing';
    else if(y>137&&y<165) {persist();state='map';}
    else if(y>165) state='title';
  } else if(state==='gameover'){
    if(y>135&&y<167) retryLevel(); else if(y>167) state='map';
  } else if(state==='between'){
    if(x>190) { if(zoneIndex===4)state='victory'; else openMap(); } else retryLevel();
  } else if(state==='victory') state='title';
}
function openMap(){state='map';selectedZone=Math.min(save.unlocked,4);}

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const rand=(a,b)=>a+Math.random()*(b-a);
function makeLevel(index){
  const width=142, height=18, tiles=Array.from({length:height},()=>Array(width).fill(0));
  const floor=14;
  for(let x=0;x<width;x++){tiles[floor][x]=1;tiles[floor+1][x]=1;}
  const pitSets=[[[20,23],[43,46],[68,71],[96,100]],[[18,22],[39,43],[61,65],[88,92],[111,114]],[[24,28],[49,53],[79,83],[105,109]],[[20,24],[44,48],[70,74],[94,98],[116,120]],[[18,22],[38,43],[60,64],[82,87],[108,112]]];
  for(const [a,b] of pitSets[index]) for(let x=a;x<=b;x++) {tiles[floor][x]=0;tiles[floor+1][x]=0;}
  const platformSets=[
    [[11,11,5],[27,10,6],[35,8,5],[51,11,7],[59,9,5],[76,10,6],[84,8,6],[104,11,7],[115,9,8],[126,11,5]],
    [[9,10,6],[27,11,5],[33,8,5],[49,10,7],[57,7,6],[75,11,6],[82,8,6],[101,10,7],[119,8,8]],
    [[12,10,7],[31,8,6],[42,11,6],[56,9,7],[73,10,6],[89,8,7],[99,11,6],[117,9,7]],
    [[10,11,6],[28,8,7],[38,10,6],[55,7,7],[74,11,6],[86,8,7],[103,10,7],[120,8,8]],
    [[8,10,7],[26,8,7],[39,11,6],[54,9,7],[71,7,7],[88,10,7],[105,8,7],[122,10,7]]
  ];
  for(const [sx,sy,len] of platformSets[index]) for(let x=sx;x<sx+len;x++) if(tiles[sy][x]===0) tiles[sy][x]=2;
  const spikeX=[[31,47,63,91,109],[25,46,70,97,122],[35,58,91,114],[30,52,80,108,125],[27,48,76,99,119]][index];
  for(const x of spikeX) if(x<width-20 && tiles[floor][x]===1) tiles[floor-1][x]=3;
  // Small vertical structures and upper ledges give each route a little rhythm.
  const decoPlatforms=[[4,7,4],[91,6,5],[133,9,4]][index%3];
  for(let x=decoPlatforms[0];x<decoPlatforms[0]+decoPlatforms[2];x++) if(x<width-1) tiles[decoPlatforms[1]][x]=2;
  const collectibles=[];
  for(let x=9+index%3;x<width-16;x+=8){
    const tx=x, ty=tiles[10][x]===2?9:(tiles[11][x]===2?10:12);
    if(tiles[ty][tx]===0) collectibles.push({x:tx*TS+8,y:ty*TS-8,type:'crystal',taken:false});
  }
  // Larger rewards are placed on optional ledges.
  for(const [x,y] of [[33,7],[59,6],[84,6],[116,7]]) collectibles.push({x:x*TS+8,y:y*TS,type:'crystal',taken:false});
  const enemies=[];
  const enemyXs=[[16,36,56,77,101,120],[15,33,54,76,99,120],[17,39,60,82,103,121],[16,36,58,80,103,123],[15,35,57,78,101,122]][index];
  enemyXs.forEach((x,i)=>{
    const types=index===0?['walker','flyer','walker','turret','walker','flyer']:index===1?['walker','flyer','walker','turret','flyer','walker']:index===2?['flyer','walker','turret','walker','flyer','turret']:index===3?['turret','walker','flyer','turret','walker','flyer']:['flyer','turret','walker','flyer','turret','walker'];
    enemies.push({type:types[i],x:x*TS,y:types[i]==='flyer'?145:floor*TS-13,left:(x-3)*TS,right:(x+3)*TS,hp:types[i]==='turret'?3:2,alive:true,t:Math.random()*5,shot:rand(.6,2)});
  });
  const checkpoints=[54*TS,91*TS];
  return {index,width,height,tiles,floor,collectibles,enemies,exitX:(width-4)*TS,checkpoints,bossTrigger:(width-25)*TS,zone:ZONES[index]};
}
function startLevel(index){
  zoneIndex=clamp(index,0,4); save.lastZone=zoneIndex; persist(); level=makeLevel(zoneIndex);
  player={x:34,y:level.floor*TS-15,vx:0,vy:0,w:11,h:15,facing:1,hp:5,maxHp:5,invuln:0,jumps:0,grounded:false,shotCd:0,dashCd:0,dashTime:0,checkpoint:34,anim:0,damageFlash:0};
  checkpointX=34; shots=[];enemyShots=[];particles=[];pickups=[];enemies=level.enemies;boss={x:(level.width-15)*TS,y:level.floor*TS-42,w:36,h:40,hp:10,maxHp:10,t:0,phase:0,shot:1.1,alive:true,hitFlash:0};bossActive=false;bossDefeated=false;runCrystals=0;elapsed=0;camera.x=0;camera.y=0;messages=[{text:level.zone.desc,time:3.4,color:level.zone.color}];state='playing';sfx(440,.12,'triangle');
}
function retryLevel(){
  if(!level) {startLevel(0);return;}
  const keep=runCrystals; startLevel(zoneIndex); runCrystals=Math.max(0,keep-2);
}
function tileAt(tx,ty){ if(!level||tx<0||tx>=level.width||ty<0||ty>=level.height)return 0; return level.tiles[ty][tx]; }
function solidTile(t){return t===1||t===2;}
function rectHitsSolid(x,y,w,h,downOnly=false,oldBottom=0){
  const left=Math.floor(x/TS),right=Math.floor((x+w-1)/TS),top=Math.floor(y/TS),bottom=Math.floor((y+h-1)/TS);
  for(let ty=top;ty<=bottom;ty++) for(let tx=left;tx<=right;tx++){
    const t=tileAt(tx,ty); if(t===1)return true;
    if(t===2&&downOnly&&oldBottom<=ty*TS+4&&y+h>=ty*TS)return true;
  }
  return false;
}
function addParticles(x,y,color,count=7,spread=70){for(let i=0;i<count;i++)particles.push({x,y,vx:rand(-spread,spread),vy:rand(-spread,spread),life:rand(.18,.55),max:.55,color,size:Math.random()<.5?1:2});}
function say(text,color='#bdefff',time=2){messages.push({text,color,time}); if(messages.length>3)messages.shift();}
function damagePlayer(amount=1,knock=1){
  if(player.invuln>0||state!=='playing')return;
  player.hp-=amount;player.invuln=1.15;player.vx=-player.facing*95*knock;player.vy=-145;screenFlash=.12;addParticles(player.x+5,player.y+7,'#ff6b8e',10,110);sfx(125,.16,'sawtooth',.045);
  if(player.hp<=0){player.hp=0;state='gameover';persist();}
}
function collectPickup(p){
  if(p.taken)return;p.taken=true;
  if(p.type==='crystal'){runCrystals++;save.crystals++;save.totalCrystals++;addParticles(p.x,p.y,'#70f6ff',8,45);sfx(880,.07,'triangle');}
  if(p.type==='health'){player.hp=Math.min(player.maxHp,player.hp+1);addParticles(p.x,p.y,'#ff6c9f',8,50);sfx(620,.1,'sine');}
  if(p.type==='module'){addParticles(p.x,p.y,'#ffe68b',14,65);say('MÓDULO DE NAVE ENCONTRADO','#ffe68b',2.5);}
  persist();
}
function firePlayer(){
  if(player.shotCd>0)return;player.shotCd=.28;
  const levelShot=zoneIndex>=3?2:1;
  shots.push({x:player.x+(player.facing>0?player.w:0),y:player.y+7,vx:player.facing*275,life:.9,damage:levelShot});
  addParticles(player.x+(player.facing>0?player.w:0),player.y+7,'#8ef7ff',2,22);sfx(520,.045,'square',.018);
}
function doDash(){
  if(player.dashCd>0||save.unlocked<1)return;
  player.dashTime=.16;player.dashCd=1.0;player.vx=player.facing*300;player.vy=0;addParticles(player.x+5,player.y+8,'#86eeff',8,35);sfx(300,.1,'sawtooth',.025);
}
function updatePlayer(dt){
  const left=input.left,right=input.right;
  if(player.invuln>0)player.invuln-=dt;
  if(player.shotCd>0)player.shotCd-=dt;
  if(player.dashCd>0)player.dashCd-=dt;
  if(player.dashTime>0){player.dashTime-=dt;}
  const jumpPressed=input.jump&&!prevInput.jump;
  const dashPressed=input.dash&&!prevInput.dash;
  if(left){player.vx-=620*dt;player.facing=-1;} else if(right){player.vx+=620*dt;player.facing=1;} else player.vx*=Math.pow(player.grounded?0.0008:0.18,dt);
  player.vx=clamp(player.vx,-115,115);
  if(dashPressed)doDash();
  if(jumpPressed){
    const maxJumps=save.unlocked>=1?2:1;
    if(player.grounded||player.jumps<maxJumps){player.vy=-285;player.grounded=false;player.jumps++;addParticles(player.x+5,player.y+15,'#c0f5ff',4,25);sfx(390,.07,'square',.025);}
  }
  if(input.fire)firePlayer();
  if(player.dashTime<=0)player.vy=Math.min(410,player.vy+830*dt);
  const oldX=player.x,oldY=player.y;
  player.x+=player.vx*dt;
  if(rectHitsSolid(player.x,player.y,player.w,player.h)){player.x=oldX;player.vx=0;}
  const oldBottom=oldY+player.h;player.y+=player.vy*dt;
  if(player.vy>=0&&rectHitsSolid(player.x,player.y,player.w,player.h,true,oldBottom)){
    const bottom=Math.floor((player.y+player.h-1)/TS);
    player.y=bottom*TS-player.h;player.vy=0;player.grounded=true;player.jumps=0;
  } else if(player.vy<0&&rectHitsSolid(player.x,player.y,player.w,player.h)){
    player.y=Math.floor(player.y/TS)*TS+TS;player.vy=0;
  } else player.grounded=false;
  player.x=clamp(player.x,0,level.width*TS-player.w);
  if(player.y>level.height*TS+30){damagePlayer(1,0);player.x=checkpointX;player.y=level.floor*TS-player.h-10;player.vy=0;}
  if(player.x>player.checkpoint+12){for(const cp of level.checkpoints){if(player.x>=cp&&cp>player.checkpoint){player.checkpoint=cp;checkpointX=cp;addParticles(cp,level.floor*TS-14,'#a5ffcb',8,35);say('CHECKPOINT ATIVADO','#a5ffcb',1.8);sfx(740,.14,'triangle');}}}
  player.anim+=dt*(Math.abs(player.vx)>12?12:3);
  // Spikes.
  const tx1=Math.floor((player.x+2)/TS),tx2=Math.floor((player.x+player.w-2)/TS),ty=Math.floor((player.y+player.h-1)/TS);
  if(tileAt(tx1,ty)===3||tileAt(tx2,ty)===3)damagePlayer(1,1);
  // Crystals and health drops.
  for(const p of level.collectibles){if(!p.taken&&Math.abs(player.x+player.w/2-p.x)<10&&Math.abs(player.y+player.h/2-p.y)<13)collectPickup(p);}
  for(const p of pickups){if(!p.taken&&Math.abs(player.x+player.w/2-p.x)<12&&Math.abs(player.y+player.h/2-p.y)<14)collectPickup(p);}
  if(player.x>level.bossTrigger)bossActive=true;
  if(bossActive&&boss.alive)updateBoss(dt);
  if(bossDefeated&&player.x>level.exitX-10){completeLevel();}
  camera.x=clamp(player.x-126,0,level.width*TS-W);
  camera.y=clamp(player.y-105,0,level.height*TS-H);
}
function updateEnemies(dt){
  for(const e of enemies){if(!e.alive)continue;e.t+=dt;
    if(e.type==='walker'){
      e.vx=e.vx||35;e.x+=e.vx*dt;if(e.x<e.left||e.x>e.right)e.vx*=-1;
      if(Math.abs(player.x-e.x)<10&&Math.abs(player.y-e.y)<16)damagePlayer(1,1);
    } else if(e.type==='flyer'){
      e.x+=Math.sin(e.t*1.4)*16*dt;e.y+=Math.cos(e.t*2)*20*dt;
      if(Math.abs(player.x-e.x)<12&&Math.abs(player.y-e.y)<13)damagePlayer(1,1);
    } else if(e.type==='turret'){
      e.shot-=dt;if(e.shot<=0&&Math.abs(player.x-e.x)<260){const dx=(player.x-e.x),dy=(player.y-e.y);const len=Math.hypot(dx,dy)||1;enemyShots.push({x:e.x+7,y:e.y+5,vx:dx/len*105,vy:dy/len*105,life:2,color:'#ff9a71'});e.shot=1.9+Math.random()*.7;sfx(180,.04,'square',.012);}
      if(Math.abs(player.x-e.x)<14&&Math.abs(player.y-e.y)<16)damagePlayer(1,1);
    }
  }
}
function updateBoss(dt){
  boss.t+=dt;boss.hitFlash=Math.max(0,boss.hitFlash-dt);
  boss.x+=(player.x+30-boss.x)*dt*.16;
  boss.x=clamp(boss.x,level.bossTrigger+95,level.width*TS-100);
  boss.y=level.floor*TS-boss.h + Math.sin(boss.t*2.1)*5;
  boss.shot-=dt;
  if(boss.hp<=boss.maxHp*.5)boss.phase=1;
  if(boss.shot<=0){
    const dx=player.x-boss.x,dy=(player.y+6)-(boss.y+boss.h/2),len=Math.hypot(dx,dy)||1;
    const speed=boss.phase?150:118;
    enemyShots.push({x:boss.x+boss.w/2,y:boss.y+boss.h/2,vx:dx/len*speed,vy:dy/len*speed,life:2.5,color:level.zone.glow});
    if(boss.phase){for(const sign of [-1,1])enemyShots.push({x:boss.x+boss.w/2,y:boss.y+boss.h/2,vx:dx/len*120+sign*40,vy:dy/len*120-20,life:2.4,color:'#ff8ac5'});}
    boss.shot=boss.phase?.85:1.25;sfx(145,.05,'sawtooth',.016);
  }
  if(Math.abs(player.x-boss.x)<boss.w*.65&&Math.abs(player.y-boss.y)<boss.h*.65)damagePlayer(1,1.15);
}
function updateShots(dt){
  for(const s of shots){s.x+=s.vx*dt;s.life-=dt;
    const tx=Math.floor(s.x/TS),ty=Math.floor(s.y/TS);if(s.life<=0||solidTile(tileAt(tx,ty)))s.life=0;
    for(const e of enemies){if(!e.alive||s.life<=0)continue;if(Math.abs(s.x-e.x-6)<10&&Math.abs(s.y-e.y-7)<11){e.hp-=s.damage;s.life=0;addParticles(s.x,s.y,'#8ff6ff',5,35);if(e.hp<=0){e.alive=false;addParticles(e.x,e.y,'#ffb276',10,65);if(Math.random()<.22)pickups.push({x:e.x,y:e.y,type:'health',taken:false});sfx(95,.1,'square',.025);}}}
    if(bossActive&&boss.alive&&s.life>0&&s.x>boss.x-5&&s.x<boss.x+boss.w+5&&s.y>boss.y&&s.y<boss.y+boss.h){boss.hp-=s.damage;boss.hitFlash=.12;s.life=0;addParticles(s.x,s.y,level.zone.glow,6,55);sfx(220,.05,'square',.025);if(boss.hp<=0){boss.hp=0;boss.alive=false;bossDefeated=true;addParticles(boss.x+boss.w/2,boss.y+boss.h/2,'#fff0a1',42,135);say('GUARDIÃO DERROTADO — SAÍDA LIBERADA','#ffe68b',3);sfx(740,.25,'triangle',.04);}}
  }
  shots=shots.filter(s=>s.life>0);
  for(const s of enemyShots){s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;if(s.life>0&&Math.abs(s.x-(player.x+player.w/2))<8&&Math.abs(s.y-(player.y+player.h/2))<9){s.life=0;damagePlayer(1,1);addParticles(s.x,s.y,'#ff7899',5,45);}}
  enemyShots=enemyShots.filter(s=>s.life>0&&s.x>camera.x-40&&s.x<camera.x+W+80);
}
function completeLevel(){
  if(state!=='playing')return;
  state='between';save.completed=[...new Set([...save.completed,zoneIndex])];save.unlocked=Math.max(save.unlocked,Math.min(4,zoneIndex+1));save.lastZone=Math.min(4,zoneIndex+1);save.crystals=Number(save.crystals)||0;persist();sfx(880,.2,'triangle',.04);
}
function update(dt){
  worldClock+=dt;
  if(state==='playing'){
    elapsed+=dt;updatePlayer(dt);updateEnemies(dt);updateShots(dt);
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=90*dt;p.life-=dt;}
    particles=particles.filter(p=>p.life>0);
    for(const m of messages)m.time-=dt;messages=messages.filter(m=>m.time>0);
    screenFlash=Math.max(0,screenFlash-dt);
  }
  for(const k of Object.keys(input))prevInput[k]=input[k];
}

function fill(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));}
function pixelText(text,x,y,size=8,color='#fff',align='left'){
  ctx.save();ctx.font=`bold ${size}px monospace`;ctx.textAlign=align;ctx.textBaseline='top';ctx.fillStyle='#050918';ctx.fillText(text,x+1,y+1);ctx.fillStyle=color;ctx.fillText(text,x,y);ctx.restore();
}
function panel(x,y,w,h,fillColor='#101a38',line='#5b76b5'){
  fill(x+2,y+2,w,h,'#030713');fill(x,y,w,h,fillColor);fill(x,y,w,2,line);fill(x,y+h-2,w,2,line);fill(x,y,2,h,line);fill(x+w-2,y,2,h,line);
  fill(x+4,y+4,w-8,1,'#ffffff10');
}
function drawStarfield(offset=0){
  const zone=level?level.zone:ZONES[0];fill(0,0,W,H,zone.sky);
  for(let i=0;i<72;i++){
    const sx=((i*67+(offset*(i%3+1)*.13))%(W+20)+W+20)%(W+20)-10;
    const sy=(i*37+(i%4)*13)%H;
    const tw=.35+.65*Math.abs(Math.sin(worldClock*1.5+i));fill(sx,sy, i%9===0?2:1,i%9===0?2:1,`rgba(190,225,255,${tw})`);
  }
  // Distant ringed planet.
  const px=292-(offset*.025%50),py=35;
  ctx.fillStyle=zone.dark;ctx.beginPath();ctx.arc(px,py,25,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=zone.color;ctx.globalAlpha=.38;ctx.beginPath();ctx.ellipse(px,py,34,8,-.24,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  ctx.fillStyle=zone.glow;ctx.globalAlpha=.35;ctx.beginPath();ctx.arc(px-8,py-8,7,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  // Far structures.
  for(let i=0;i<9;i++){
    const bx=((i*74-offset*.11)%(W+100)+W+100)%(W+100)-50;
    const bh=18+(i*17)%34;fill(bx,H-48-bh,10,bh,zone.dark);fill(bx-4,H-48-bh,18,3,zone.dark);
    if(i%2===0)fill(bx+3,H-44-bh,2,4,zone.glow);
  }
}
function drawTile(tx,ty,t){
  const x=tx*TS-camera.x,y=ty*TS-camera.y,z=level.zone;
  if(t===1){fill(x,y,TS,TS,z.ground);fill(x,y,TS,3,z.color);fill(x+2,y+5,4,2,'#ffffff20');fill(x+9,y+10,5,2,z.dark);fill(x+3,y+13,3,2,z.dark);}
  else if(t===2){fill(x,y+4,TS,12,z.dark);fill(x,y+2,TS,4,z.color);fill(x+2,y+6,TS-4,2,'#ffffff33');fill(x+5,y+10,3,3,z.ground);}
  else if(t===3){fill(x+2,y+10,12,6,'#39192d');for(let q=0;q<3;q++){fill(x+q*5+2,y+4,3,7,'#ffd36f');fill(x+q*5+3,y+7,1,5,'#fff0ae');}}
}
function drawPlayer(){
  const x=Math.round(player.x-camera.x),y=Math.round(player.y-camera.y),blink=player.invuln>0&&Math.floor(worldClock*18)%2===0;if(blink)return;
  const step=player.grounded&&Math.abs(player.vx)>12?Math.sin(player.anim)*2:0;
  // Backpack and suit.
  fill(x+1,y+5,3,7,'#263d69');fill(x+2,y+4,2,8,'#75d9ef');
  fill(x+4,y+5,7,8,'#d9e8f4');fill(x+3,y+7,9,5,'#91a9c8');
  fill(x+5,y+1,7,7,'#e9f7ff');fill(x+6,y+2,6,4,'#2d557d');fill(x+7,y+3,4,2,'#7df1ff');
  fill(x+4,y+12,3,3+Math.max(0,step),'#e9f7ff');fill(x+9,y+12,3,3-Math.min(0,step),'#e9f7ff');
  fill(x+4,y+8,2,2,'#ffb86b');fill(x+10,y+8,2,2,'#ffb86b');
  if(player.facing>0)fill(x+12,y+8,1,2,'#ffffff');else fill(x+1,y+8,1,2,'#ffffff');
  if(player.dashTime>0){fill(x-7,y+5,6,7,'#7feeff88');fill(x-13,y+7,5,4,'#7feeff55');}
}
function drawEnemy(e){
  const x=Math.round(e.x-camera.x),y=Math.round(e.y-camera.y);if(x<-25||x>W+25)return;
  if(e.type==='walker'){
    fill(x+2,y+4,10,8,'#9c668a');fill(x+1,y+7,12,4,'#db7ba4');fill(x+3,y+1,8,5,'#dca1c5');fill(x+4,y+4,2,2,'#fff2af');fill(x+9,y+4,2,2,'#fff2af');fill(x+3,y+12,3,2,'#44335f');fill(x+9,y+12,3,2,'#44335f');
  }else if(e.type==='flyer'){
    fill(x+4,y+3,8,8,'#58c9d8');fill(x+2,y+5,12,5,'#2b7e9e');fill(x+5,y+5,2,2,'#fff18b');fill(x+9,y+5,2,2,'#fff18b');fill(x,y+2,4,3,'#8cecff');fill(x+12,y+2,4,3,'#8cecff');
  }else{
    fill(x+2,y+3,12,10,'#d17e55');fill(x+4,y+1,8,4,'#f2b76c');fill(x+5,y+6,2,3,'#451d38');fill(x+10,y+6,2,3,'#451d38');fill(x+6,y+7,1,1,'#fff09b');fill(x+11,y+7,1,1,'#fff09b');fill(x+5,y+13,6,2,'#63354e');
  }
  fill(x+3,y-3,10,2,'#1a1834');fill(x+3,y-3,10*Math.max(0,e.hp/(e.type==='turret'?3:2)),2,'#ff7d9b');
}
function drawBoss(){
  if(!bossActive||!boss.alive)return;const x=Math.round(boss.x-camera.x),y=Math.round(boss.y-camera.y),col=level.zone.glow;
  if(boss.hitFlash>0)fill(x-2,y-2,boss.w+4,boss.h+4,'#ffffff');
  if(zoneIndex===0){fill(x+5,y+9,27,24,'#405e85');fill(x,y+16,36,16,'#24446b');fill(x+8,y+2,20,12,'#91c9dc');fill(x+11,y+8,14,5,'#162b49');fill(x+13,y+9,4,3,col);fill(x+22,y+9,4,3,col);fill(x+2,y+28,9,8,'#263b62');fill(x+25,y+28,9,8,'#263b62');}
  else if(zoneIndex===1){fill(x+5,y+9,27,28,'#9a4a3e');fill(x+1,y+16,34,20,'#6b2938');fill(x+7,y+2,22,14,'#d06a43');fill(x+11,y+9,5,4,'#fff09a');fill(x+22,y+9,5,4,'#fff09a');fill(x+15,y+22,6,8,'#ffcf76');}
  else if(zoneIndex===2){fill(x+3,y+12,30,22,'#267c89');fill(x,y+18,36,13,'#14526c');fill(x+8,y+3,20,15,'#60cbbd');fill(x+11,y+10,4,3,'#fff0a3');fill(x+22,y+10,4,3,'#fff0a3');fill(x+2,y+9,7,5,'#8bf5e2');fill(x+27,y+9,7,5,'#8bf5e2');}
  else if(zoneIndex===3){fill(x+4,y+8,28,27,'#77618e');fill(x+1,y+16,34,17,'#483c6a');fill(x+8,y+1,20,14,'#c28ce0');fill(x+11,y+7,5,4,'#fff09a');fill(x+22,y+7,5,4,'#fff09a');fill(x+14,y+23,8,7,'#a9efff');}
  else{fill(x+4,y+7,28,27,'#d2a9ba');fill(x,y+16,36,17,'#614c81');fill(x+7,y+1,22,13,'#ffe4aa');fill(x+11,y+7,5,4,'#5c386c');fill(x+22,y+7,5,4,'#5c386c');fill(x+14,y+22,8,8,'#fff6d4');}
  fill(x+4,y+37,28,2,col);
}
function drawShots(){for(const s of shots){const x=s.x-camera.x,y=s.y-camera.y;fill(x-3,y-2,7,4,'#e4ffff');fill(x-6,y-1,4,2,'#64e8ff');}for(const s of enemyShots){const x=s.x-camera.x,y=s.y-camera.y;fill(x-3,y-3,7,7,s.color||'#ff8a9d');fill(x-1,y-1,3,3,'#fff2c9');}}
function drawPickups(){
  for(const p of [...level.collectibles,...pickups]){if(p.taken)continue;const x=p.x-camera.x,y=p.y-camera.y+Math.sin(worldClock*4+p.x)*2;
    if(p.type==='crystal'){fill(x-4,y-4,8,8,'#1a4262');fill(x-2,y-6,4,12,'#62eaff');fill(x-4,y-2,8,4,'#d8ffff');}
    else if(p.type==='health'){fill(x-5,y-5,10,10,'#6e244e');fill(x-1,y-4,3,8,'#ff739d');fill(x-4,y-1,9,3,'#ff739d');}
    else{fill(x-5,y-5,10,10,'#71552a');fill(x-2,y-2,4,4,'#fff0a0');}
  }
}
function drawWorld(){
  drawStarfield(camera.x);const startX=Math.max(0,Math.floor(camera.x/TS)),endX=Math.min(level.width-1,Math.ceil((camera.x+W)/TS));
  for(let y=0;y<level.height;y++)for(let x=startX;x<=endX;x++){const t=tileAt(x,y);if(t)drawTile(x,y,t);}
  // Background floating debris and silhouettes.
  for(let i=0;i<12;i++){const dx=((i*89-camera.x*.34)%(W+40)+W+40)%(W+40)-20;const dy=62+(i*31)%70;fill(dx,dy,5+(i%3)*2,2,level.zone.color+'55');}
  // Checkpoint beacon.
  for(const cp of level.checkpoints){const x=cp-camera.x;if(x>-10&&x<W+10){fill(x,level.floor*TS-camera.y-24,3,24,'#b5f3d0');fill(x-4,level.floor*TS-camera.y-27,11,5,'#8affc6');fill(x-2,level.floor*TS-camera.y-25,7,2,'#e6fff1');}}
  // Exit gate.
  const ex=level.exitX-camera.x,ey=level.floor*TS-camera.y-36;
  if(ex>-40&&ex<W+40){fill(ex,ey,22,36,bossDefeated?'#a8f5db':'#263658');fill(ex+3,ey+3,16,30,bossDefeated?'#47d8b0':'#52628a');fill(ex+7,ey+7,8,22,bossDefeated?'#d5fff3':'#192343');if(bossDefeated){fill(ex+8,ey-3,6,3,'#b6ffe9');}}
  drawPickups();for(const e of enemies)if(e.alive)drawEnemy(e);drawBoss();drawShots();drawPlayer();
  for(const p of particles){fill(p.x-camera.x,p.y-camera.y,p.size,p.size,p.color);}
}
function drawHud(){
  panel(5,5,112,25,'#0b1430cc','#344e82');pixelText('VIDA',11,10,6,'#9eb4da');for(let i=0;i<player.maxHp;i++){fill(38+i*13,11,9,7,i<player.hp?'#ff6d91':'#45334e');fill(40+i*13,9,4,3,i<player.hp?'#ffb4c8':'#45334e');}
  panel(125,5,105,25,'#0b1430cc','#344e82');pixelText('CRISTAIS',131,10,6,'#9eb4da');pixelText(String(runCrystals).padStart(3,'0'),195,10,8,'#8df3ff');
  panel(238,5,141,25,'#0b1430cc','#344e82');pixelText(level.zone.name,244,10,6,level.zone.color);pixelText(bossActive&&boss.alive?'AMEAÇA DETECTADA':'EXPLORAÇÃO',244,19,5,'#9aaccb');
  if(bossActive&&boss.alive){panel(113,35,158,10,'#1a1938','#8063a1');fill(116,38,152*(boss.hp/boss.maxHp),4,'#ff668f');pixelText(level.zone.boss,192,47,5,'#fff1ca','center');}
  if(messages.length){const m=messages[messages.length-1];panel(54,183,276,18,'#0b1430dd','#405d89');pixelText(m.text.slice(0,43),192,188,6,m.color,'center');}
  if(zoneIndex===0){pixelText('J: ATIRAR',7,35,5,'#a2b2d5');pixelText('A/↑: PULAR',7,43,5,'#a2b2d5');}
  if(save.unlocked>=1)pixelText('DASH DESBLOQUEADO',W-8,37,5,'#91eaff','right');
}
function drawTitle(){
  const z=ZONES[0];drawStarfield(worldClock*6);for(let i=0;i<18;i++){const x=(i*41+Math.sin(worldClock+i)*8)%W,y=(i*29+Math.cos(worldClock*.6+i)*5)%H;fill(x,y,2,2,'#9cbcff');}
  // Meteor streak.
  const mx=(worldClock*55)%(W+80)-40;fill(mx,44,14,2,'#e7faff');fill(mx+9,43,9,1,'#74dfff');
  // Logo/title.
  pixelText('STARFALL',W/2,42,26,'#e9f8ff','center');pixelText('BEYOND THE LAST ORBIT',W/2,74,7,'#76eaff','center');
  // Decorative pixel astronaut.
  const px=188,py=101+Math.sin(worldClock*2)*2;fill(px-12,py+10,28,17,'#24345d');fill(px-6,py+1,15,16,'#dceafa');fill(px-3,py-4,14,10,'#edfaff');fill(px-1,py-1,10,5,'#3879a2');fill(px+1,py,6,3,'#83edff');fill(px-6,py+15,6,4,'#a9c6df');fill(px+4,py+15,6,4,'#a9c6df');
  panel(121,145,142,23,'#121d3d','#69cde7');pixelText(save.completed.length?'CONTINUAR':'INICIAR JORNADA',192,153,8,'#eaffff','center');
  pixelText('MAPA ESTELAR',192,177,7,'#b7c9ee','center');pixelText('NOVO JOGO  [R]',192,190,5,'#7488b2','center');
  pixelText('PRESSIONE ENTER',192,204,5,'#62759e','center');
  pixelText('v1.0.0',5,204,5,'#66769b');
}
function drawMap(){
  drawStarfield(0);pixelText('MAPA ESTELAR',W/2,14,13,'#eaf9ff','center');pixelText('SELECIONE UM DESTINO',W/2,32,6,'#90a7d5','center');
  for(let i=0;i<5;i++){
    const x=10+i*74,y=57,locked=i>save.unlocked,selected=i===selectedZone,z=ZONES[i];
    panel(x,y,65,91,locked?'#101326':'#101b38',selected?z.color:'#384b78');
    // Tiny planet art.
    ctx.fillStyle=locked?'#3b3b5b':z.color;ctx.beginPath();ctx.arc(x+32,y+26,15,0,Math.PI*2);ctx.fill();ctx.fillStyle=locked?'#23263f':z.dark;ctx.beginPath();ctx.ellipse(x+32,y+27,21,5,-.2,0,Math.PI*2);ctx.fill();
    pixelText(String(i+1).padStart(2,'0'),x+7,y+7,6,'#b7c7e9');pixelText(locked?'BLOQ.':(save.completed.includes(i)?'OK':'ATIVO'),x+32,y+51,5,locked?'#707b9f':(save.completed.includes(i)?'#9cffcf':z.color),'center');
    const words=z.name.split(' ');pixelText(words.slice(0,2).join(' ').slice(0,11),x+32,y+65,5,locked?'#646d90':'#e9f3ff','center');
    if(selected){fill(x+26,y+84,13,2,z.color);}
  }
  const selected=ZONES[selectedZone];pixelText(selected.subtitle,W/2,157,6,selected.color,'center');
  panel(34,176,143,25,'#101a38','#516995');pixelText('VOLTAR',105,184,7,'#b8c9e8','center');
  panel(207,176,143,25,'#15284b',selected.color);pixelText('POUSAR',278,184,7,'#f1fbff','center');
  pixelText('TOQUE EM UM PLANETA PARA SELECIONAR',W/2,206,5,'#7184ae','center');
}
function drawPause(){drawWorld();drawHud();fill(0,0,W,H,'#050817aa');panel(112,62,160,111,'#0d1733','#6b8ac3');pixelText('PAUSADO',192,75,12,'#eafaff','center');pixelText('CONTINUAR',192,111,8,'#9ef1ff','center');pixelText('MAPA ESTELAR',192,140,7,'#d0dcf5','center');pixelText('MENU PRINCIPAL',192,161,6,'#94a3c9','center');}
function drawGameOver(){drawWorld();drawHud();fill(0,0,W,H,'#090719bb');panel(90,65,204,102,'#19132b','#a65078');pixelText('SINAL PERDIDO',192,81,12,'#ffacc0','center');pixelText('A EXPEDIÇÃO FOI INTERROMPIDA',192,105,6,'#d8c1df','center');pixelText('TENTAR NOVAMENTE',192,137,8,'#fff0f5','center');pixelText('VOLTAR AO MAPA',192,157,6,'#b5a6c8','center');}
function drawBetween(){drawWorld();drawHud();fill(0,0,W,H,'#080c20b8');panel(65,48,254,124,'#111c39','#8be9dc');pixelText('SETOR CONCLUÍDO',192,62,12,'#d9fff4','center');pixelText(ZONES[zoneIndex].name,192,85,7,ZONES[zoneIndex].color,'center');pixelText(`${runCrystals} CRISTAIS COLETADOS`,192,103,6,'#a9c9e6','center');pixelText(zoneIndex===4?'A GALÁXIA ESTÁ EM SILÊNCIO':'PRÓXIMO DESTINO DESBLOQUEADO',192,119,5,'#a7bada','center');pixelText(zoneIndex===4?'VER FINAL':'MAPA ESTELAR',192,146,8,'#efffff','center');pixelText('ENTER PARA CONTINUAR',192,158,5,'#8097bd','center');}
function drawVictory(){drawStarfield(worldClock*2);pixelText('MISSÃO CUMPRIDA',W/2,45,15,'#fff1ad','center');pixelText('A ÚLTIMA ÓRBITA FOI RESTAURADA',W/2,73,6,'#b9eaff','center');for(let i=0;i<5;i++){const x=82+i*55;ctx.fillStyle=ZONES[i].color;ctx.beginPath();ctx.arc(x,119,13,0,Math.PI*2);ctx.fill();fill(x-5,116,10,5,'#ffffff66');}
  panel(83,151,218,33,'#111a37','#e0c681');pixelText(`${save.totalCrystals} CRISTAIS REGISTRADOS`,192,162,7,'#fff0b2','center');pixelText('ENTER PARA VOLTAR AO INÍCIO',192,197,5,'#8ca3cd','center');}
function render(){
  ctx.imageSmoothingEnabled=false;
  const touch=document.getElementById('touch-controls');
  const hint=document.getElementById('mobile-hint');
  if(touch)touch.style.display=state==='playing'?'block':'none';
  if(hint)hint.style.display=state==='playing'?'block':'none';
  if(state==='title')drawTitle();else if(state==='map')drawMap();else if(state==='playing'){drawWorld();drawHud();}else if(state==='pause')drawPause();else if(state==='gameover')drawGameOver();else if(state==='between')drawBetween();else if(state==='victory')drawVictory();
  if(screenFlash>0&&state==='playing'){fill(0,0,W,H,`rgba(255,90,130,${screenFlash*1.3})`);}
}
let last=0,acc=0;
function loop(timestamp){const dt=Math.min(.033,(timestamp-last)/1000||0);last=timestamp;acc+=dt;
  while(acc>=1/60){update(1/60);acc-=1/60;}
  render();requestAnimationFrame(loop);
}

// Keyboard shortcuts for title/map.
window.addEventListener('keydown',e=>{
  if(e.repeat)return;
  if(state==='title'&&e.code==='KeyR'){save=defaultSave();persist();startLevel(0);}
  if(state==='map'&&(e.code==='ArrowLeft'||e.code==='KeyA'))selectedZone=Math.max(0,selectedZone-1);
  if(state==='map'&&(e.code==='ArrowRight'||e.code==='KeyD'))selectedZone=Math.min(save.unlocked,selectedZone+1);
  if(state==='playing'&&e.code==='KeyM')state='map';
});

// Initial state and first render.
if(save.sound===false)document.getElementById('sound-btn').textContent='♫ MUDO';
requestAnimationFrame(loop);
})();
