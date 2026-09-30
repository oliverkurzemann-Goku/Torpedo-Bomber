/* Regression checks against the shipped routines, not copies of their formulas. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three'),root=path.resolve(__dirname,'../..');
require('../../game-runtime.js');const {GameRuntime}=global;
const runtime=fs.readFileSync(path.join(root,'game-runtime.js'),'utf8');
const pac=fs.readFileSync(path.join(root,'torpedo-carrier.html'),'utf8');
const eu=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
function routine(html,name,next){
 const a=html.indexOf('function '+name+'('),b=html.indexOf('\nfunction '+next+'(',a+1);
 assert(a>0&&b>a,name+' exists');return html.slice(a,b);
}
// Privacy settings and a full storage quota must not stop the game at startup.
for(const mode of ['blocked','quota']){
 const ctx=vm.createContext({});ctx.window=ctx;
 if(mode==='blocked')Object.defineProperty(ctx,'localStorage',{get(){throw Error('SecurityError');}});
 else ctx.localStorage={getItem:k=>k==='old'?'saved':null,setItem(){throw Error('QuotaExceededError');},removeItem(){throw Error('QuotaExceededError');}};
 vm.runInContext(runtime,ctx);const store=ctx.GameRuntime.storage;
 assert.equal(store.getItem('missing'),null);store.setItem('hint',1);assert.equal(store.getItem('hint'),'1');
 store.removeItem('hint');assert.equal(store.getItem('hint'),null);
 if(mode==='quota'){assert.equal(store.getItem('old'),'saved');store.removeItem('old');assert.equal(store.getItem('old'),null);}
}
// The same actual gun routine must hit at 20, 30, 60 and 120 FPS, never twice.
for(const fps of [20,30,60,120])for(const kind of ['zero','raider','torpedo']){
 const scene=new THREE.Scene(),mesh=new THREE.Mesh();mesh.position.set(0,100,0);scene.add(mesh);
 const foe={alive:true,hp:4,pos:new THREE.Vector3(10,100,0)};
 const torp={mesh:new THREE.Mesh()};torp.mesh.position.copy(foe.pos);scene.add(torp.mesh);
 const ctx=vm.createContext({THREE,GameRuntime,Math,scene,gunCool:1,firing:false,
  P:{alive:true},ST:{FLIGHT:3},state:3,ships:[],zeros:kind==='zero'?[foe]:[],raiders:kind==='raider'?[foe]:[],
  etorps:kind==='torpedo'?[torp]:[],shoreTargets:[],bullets:[{mesh,dir:new THREE.Vector3(1,0,0),speed:650,life:.7}],
  spawnSparks(){},spawnSmoke(){},addScore(){},killZero(){},killRaider(){},spawnSplash(){},spawnExplosion(){},flash(){},shoreHeight:()=>0});
 vm.runInContext(routine(pac,'updateGuns','updateMinimap'),ctx);
 for(let i=0;i<10;i++)ctx.updateGuns(1/fps);
 assert.equal(ctx.bullets.length,0,kind+' bullet is consumed at '+fps+' FPS');
 if(kind==='torpedo')assert.equal(ctx.etorps.length,0);else assert.equal(foe.hp,3,'exactly one hit');
}
const v=(x,y,z)=>new THREE.Vector3(x,y,z);
assert.equal(GameRuntime.segmentDistance(v(0,0,0),v(22,0,0),v(10,8,0)),8,'a near miss is not widened by the sweep');
assert.equal(GameRuntime.segmentDistance(v(0,0,0),v(22,0,0),v(-10,0,0)),10,'no hits behind the shot');
// Only explicitly owned resources are released; GLB clones and textures stay alive.
const group=new THREE.Group(),geo=new THREE.BoxGeometry(),mat=new THREE.MeshBasicMaterial(),tex=new THREE.Texture();
mat.map=tex;let gd=0,md=0,td=0;geo.addEventListener('dispose',()=>gd++);mat.addEventListener('dispose',()=>md++);tex.addEventListener('dispose',()=>td++);
group.add(new THREE.Mesh(geo,mat));GameRuntime.release(group);assert.deepEqual([gd,md,td],[0,0,0]);
const owned=GameRuntime.own(new THREE.Mesh(geo,mat));group.add(owned);GameRuntime.release(group);GameRuntime.release(group);
assert.deepEqual([gd,md,td],[1,1,0],'release is idempotent and never releases shared texture');
const flash=GameRuntime.own(new THREE.Mesh(geo,mat.clone()),{geometry:false});let fm=0;flash.material.addEventListener('dispose',()=>fm++);
GameRuntime.release(flash);assert.equal(gd,1);assert.equal(fm,1,'shared flak geometry is preserved');
function watchOwned(scene){
 const gs=new Set(),ms=new Set();scene.traverse(o=>{const owner=o.userData.runtimeOwned;if(!owner)return;
  if(owner.geometry)gs.add(o.geometry);if(owner.material)for(const m of [].concat(o.material))ms.add(m);});
 let gd=0,md=0;for(const g of gs)g.addEventListener('dispose',()=>gd++);for(const m of ms)m.addEventListener('dispose',()=>md++);
 return ()=>assert.deepEqual([gd,md],[gs.size,ms.size],'every owned allocation has been released');
}
const ec=vm.createContext({THREE,GameRuntime,Math,scene:new THREE.Scene(),debris:[],groundY:()=>0});
vm.runInContext(routine(eu,'spawnDebris','spawnCrater'),ec);
for(let n=0;n<30;n++){ec.spawnDebris(0,150,0,12);const check=watchOwned(ec.scene);ec.updateDebris(10);check();assert.equal(ec.debris.length,0);}
const pc=vm.createContext({THREE,GameRuntime,Math,performance,scene:new THREE.Scene(),smokeTex:new THREE.Texture(),
 combatFX:null,shoreHeight:()=>0,debris:[],bubbles:[],slicks:[],explosions:[],smokes:[],smokePool:[],spawnSplash(){}});
vm.runInContext(routine(pac,'spawnExplosion','initAudio'),pc);
for(let n=0;n<30;n++){
 pc.spawnExplosion(0,150,0,1);pc.spawnDebris(0,150,0,12);pc.spawnBubble(0,0);
 pc.spawnSlick({radius:20,group:new THREE.Group()});const check=watchOwned(pc.scene);
 pc.updateExplosions(200);pc.updateDebris(200);pc.updateBubbles(200);pc.updateSlicks(200);pc.updateSmoke(200);check();
 assert.equal(pc.explosions.length+pc.debris.length+pc.bubbles.length+pc.slicks.length+pc.smokes.length,0);
 assert(pc.smokePool.every(s=>s.material.blending===THREE.NormalBlending),'fire sprites do not contaminate the smoke pool');
}
function spin(fps){let angle=0;for(let i=0;i<fps;i++)angle+=GameRuntime.rotorStep(1/fps,.3,3);return angle;}
for(const fps of [30,60,120])assert(Math.abs(spin(fps)-18)<1e-10,'propeller speed is independent of FPS');
assert(GameRuntime.rotorStep(.05,.48,3)<Math.PI/3,'slow frames do not alias the blades');
assert(GameRuntime.rotorStep(.05,.30,4)<Math.PI/4,'four-blade P47 is protected too');
let lost=true,calls=0;
const renderer={getContext:()=>({isContextLost:()=>lost}),render(){calls++;}};
assert.equal(GameRuntime.render(renderer,{},{}),false);assert.equal(calls,0,'do not draw before the loss event arrives');
lost=false;assert.equal(GameRuntime.render(renderer,{},{}),true);assert.equal(calls,1);
renderer.render=()=>{lost=true;throw Error('null shader log');};
assert.equal(GameRuntime.render(renderer,{},{}),false,'loss during a frame is deferred to the recovery handler');
lost=false;renderer.render=()=>{throw Error('real shader bug');};
assert.throws(()=>GameRuntime.render(renderer,{},{}),/real shader bug/,'unrelated errors must remain visible');
// Actual Pacific keyboard handlers must neutralise immediately on keyup,
// including when no animation frame can run. Touch-owned commands stay intact.
const handlers={},keyboard=vm.createContext({P:{_stickActive:false},ST:{FLIGHT:3},state:3,inputPitch:0,inputRoll:0,
 firing:false,invertPitch:false,window:{addEventListener:(name,fn)=>handlers[name]=fn}});
vm.runInContext(routine(pac,'setupKeyboard','pollKeys'),keyboard);keyboard.setupKeyboard();
const key=code=>({code,preventDefault(){}});
handlers.keydown(key('ArrowLeft'));assert.equal(keyboard.inputRoll,1);
handlers.keyup(key('ArrowLeft'));assert.equal(keyboard.inputRoll,0,'keyup needs no animation frame');
keyboard.P._stickActive=true;keyboard.inputRoll=.3;keyboard.inputPitch=.2;
handlers.keydown(key('ArrowLeft'));handlers.keyup(key('ArrowLeft'));
assert.deepEqual([keyboard.inputRoll,keyboard.inputPitch],[.3,.2],'keyboard release does not cancel a held touch stick');
const coach=new GameRuntime.HintCoach(),notes=[],snap={enabled:true,alive:true,hull:100,agl:300,gear:1,homeDistance:800};
coach.tick(6,{...snap,busy:true},m=>notes.push(m));assert.equal(notes.length,0,'critical messages are not overwritten');
coach.tick(1,snap,m=>notes.push(m));assert.equal(notes.length,1);
coach.tick(30,snap,m=>notes.push(m));assert.equal(notes.length,1,'each tip appears once per sortie');
coach.tick(30,{...snap,enabled:false,hull:20},m=>notes.push(m));assert.equal(notes.length,1,'tips can be switched off');
coach.tick(1,{...snap,hull:20},m=>notes.push(m));assert.match(notes[1],/BAIL OUT/);
console.log('Runtime safety: swept hits at 20–120 FPS, blocked storage, 30 repeated effect cycles, shared resources, rotors and optional hints');
