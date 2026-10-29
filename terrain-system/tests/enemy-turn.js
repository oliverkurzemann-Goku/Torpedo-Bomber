// Fly the game's actual enemy control law through a 180-degree reversal.
// Build 220: enemy fighters fly the computed core (FlightControl.ai through FlightCore) with the same
// forces, load limits, roll rate and manoeuvre gain as the player's aeroplane of that type. A Bf 109 at
// 145 m/s therefore reverses about as fast as the player's own full-stick turn (FLIGHT-CORE.md), banked
// to the AI pilot's 1.3 rad limit and holding its height - not the legacy law's 11-32 s arc.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const THREE=require('three'),html=fs.readFileSync(path.resolve(__dirname,'../../remagen-mission.html'),'utf8');
const FlightCore=require('../../flight-core.js'),FlightControl=require('../../flight-control.js');
const ctx={THREE,Math,AC:{bf109:{stall:36,max:196,gLim:5.5,turn:1.25}},AI_G:9.81,FlightCore,FlightControl,coreOn:kind=>FlightCore.has(kind)};
vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('function aiSpec('),html.indexOf('function updateEnemyAir(')),ctx);
const runs=[];
for(const dt of [.05,1/60,1/120]){
  const e={kind:'bf109',heading:0,pitch:0,roll:0,spd:145,
    pos:new THREE.Vector3(0,900,0),vel:new THREE.Vector3(0,0,145)};
  const aim=new THREE.Vector3(0,0,-1);
  let quarter=null,half=null,maxBank=0;
  for(let time=0;time<35;time+=dt){
    ctx.flyAI(e,dt,aim,145);
    maxBank=Math.max(maxBank,Math.abs(e.roll));
    if(quarter===null&&e.heading>=Math.PI/2)quarter=time;
    if(e.heading>=Math.PI*.94){half=time;break;}
  }
  assert(quarter>2.5,'AI rolls in before it turns: no heading snap');
  assert(half>4&&half<12,'AI reverses at the computed turn rate of its type: '+half);
  assert(maxBank>1&&maxBank<=1.3001,'AI banks for the turn, inside its pilot limit');
  assert(Math.hypot(e.pos.x,e.pos.z)>400,'AI must travel hundreds of metres while turning');
  assert(e.spd>100&&Math.abs(e.pos.y-900)<30,'turn keeps flying speed and height');
  runs.push({dt,half,travel:Math.hypot(e.pos.x,e.pos.z)});
}
assert(Math.abs(runs[0].half-runs[2].half)<.15&&Math.abs(runs[0].travel-runs[2].travel)<10,'same reversal at 20 and 120 FPS');
console.log('Enemy 180° turn (computed core)',runs.map(r=>r.half.toFixed(1)+'s/'+Math.round(r.travel)+'m').join(', '));
