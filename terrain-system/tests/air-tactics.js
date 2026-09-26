// Exercise both games' real threat decisions, not a copy of the manoeuvre math.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three'),root=path.resolve(__dirname,'../..');
const rhine=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
const first=rhine.indexOf('function updateEnemyAir(dt){'),last=rhine.indexOf('    flyAI(e,dt,aim,thr);',first);
assert(first>0&&last>first);
const e={alive:true,bomber:false,kind:'bf109',pos:new THREE.Vector3(0,900,0),
  heading:0,pitch:0,roll:0,spd:145,mode:'engage',modeT:2};
const P={pos:new THREE.Vector3(0,900,-400),heading:0,pitch:0,spd:155,alive:true,roll:0};
const ctx=vm.createContext({THREE,P,enemyAir:[e],groundY:()=>0,
  noseDir:()=>new THREE.Vector3(Math.sin(P.heading),0,Math.cos(P.heading)),
  aiSpec:()=>({stall:38,max:180,gLim:5.5}),APP_SPD:70});
vm.runInContext(rhine.slice(first,last)+'    return {aim,mode:e.mode};\n  }\n}',ctx);
let act=ctx.updateEnemyAir(.05);
assert.equal(act.mode,'break','fighter under attack from behind must break');
assert(Math.abs(act.aim.x)>.3,'break must bend the flight path sideways');
assert(act.aim.y<0,'fast fighter with height to spare can dive out of the shot');
act=ctx.updateEnemyAir(3);
assert.equal(act.mode,'extend','fighter must leave the break and regain separation');
P.pos.set(400,900,350);P.heading=Math.PI;
e.mode='engage';e.modeT=0;e.evadeCd=6;
act=ctx.updateEnemyAir(.05);
assert.equal(act.mode,'weave','approaching fighter should vary its line instead of orbiting forever');
e.pos.y=100;e.pitch=0;
act=ctx.updateEnemyAir(.05);
assert.equal(act.mode,'pullup','terrain avoidance overrides evasive manoeuvres');

const pacific=fs.readFileSync(path.join(root,'torpedo-carrier.html'),'utf8');
const start=pacific.indexOf('function updateZeros(dt){'),end=pacific.indexOf('    const desiredVel=aim.multiplyScalar(desiredSpeed);',start);
assert(start>0&&end>start);
const zero={alive:true,spotted:true,pos:new THREE.Vector3(0,400,0),vel:new THREE.Vector3(0,0,90),
  heading:0,spd:90,reengage:0,breakSide:1,retarget:2};
const pilot={pos:new THREE.Vector3(0,400,-400),spd:95,heading:0,pitch:0};
const sea=vm.createContext({THREE,zeros:[zero],P:pilot,wingmen:[],
  noseDir:()=>new THREE.Vector3(0,0,1),radioSay(){}});
vm.runInContext(pacific.slice(start,end)+'    return aim;\n  }\n}',sea);
const dodge=sea.updateZeros(.05);
assert(zero.evadeT>0&&zero.evadeCd>0,'Zero must notice a fighter lining up behind it');
assert(Math.abs(dodge.x)>.3&&dodge.y<0,'Zero must break sideways and dive when clear of the sea');
console.log('Enemy fighters: break, dive, weave, recover and avoid the ground');
