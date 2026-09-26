// Fly the game's actual enemy control law through a 180-degree reversal.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const THREE=require('three'),html=fs.readFileSync(path.resolve(__dirname,'../../remagen-mission.html'),'utf8');
const ctx={THREE,Math,AC:{bf109:{stall:36,max:196,gLim:5.5,turn:1.25}},AI_G:9.81};
vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('function aiSpec('),html.indexOf('function updateEnemyAir(')),ctx);
const e={kind:'bf109',heading:0,pitch:0,roll:0,spd:145,
  pos:new THREE.Vector3(0,900,0),vel:new THREE.Vector3(0,0,145)};
const aim=new THREE.Vector3(0,0,-1),dt=.05;
let quarter=null,half=null,maxBank=0;
for(let time=0;time<35;time+=dt){
  ctx.flyAI(e,dt,aim,145);
  maxBank=Math.max(maxBank,Math.abs(e.roll));
  if(quarter===null&&e.heading>=Math.PI/2)quarter=time;
  if(e.heading>=Math.PI*.94){half=time;break;}
}
assert(quarter>6,'AI reversed ninety degrees before covering a plausible turn radius');
assert(half>11&&half<32,'AI should reverse in a wide, banked arc rather than pirouette');
assert(maxBank>1&&maxBank<=1.221,'AI bank must match turn instead of snapping heading');
assert(Math.hypot(e.pos.x,e.pos.z)>600,'AI must travel hundreds of metres while turning');
assert(e.spd>80,'turn must retain a flying airspeed');
console.log('Enemy 180° turn',half.toFixed(1)+'s',Math.round(Math.hypot(e.pos.x,e.pos.z))+'m travelled');
