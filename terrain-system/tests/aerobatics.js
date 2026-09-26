// Exercise the actual attitude controllers from both current campaigns.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function controller(file,start){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const a=html.indexOf(start,html.indexOf('function updateFlight(dt)'));
  const b=html.indexOf('  // bank-to-turn:',a);
  assert(a>0&&b>a,file+' attitude controller not found');
  return vm.runInNewContext('(function(P,inputRoll,inputPitch,aeroMode,dt,d,stallSpd,steerSign){'+
    html.slice(a,b)+'})',{isDefend:()=>true,isSBD:()=>false});
}
function turnController(file){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const a=html.indexOf('  // bank-to-turn:',html.indexOf('function updateFlight(dt)'));
  const b=html.indexOf(file==='remagen-mission.html'?'  // vertical speed:':'  // speed toward throttle target',a);
  assert(a>0&&b>a,file+' turn controller not found');
  let bank=()=>0;
  if(file==='remagen-mission.html'){
    const start=html.indexOf('const TURN_K=');
    const end=html.indexOf('\n}',html.indexOf('function bankTurnRate(',start));
    assert(start>0&&end>start,file+' turn physics not found');
    bank=vm.runInNewContext(html.slice(start,end+2)+'\nbankTurnRate');
  }
  return vm.runInNewContext('(function(P,aeroMode,dt,d,stallSpd){'+html.slice(a,b)+'})',
    {bankTurnRate:bank,windZ:0,AC:{turn:1.3,gLim:7}});
}
for(const [file,start,kind] of [
  ['remagen-mission.html','  const dmgF = (P.hull < d.hull','p47'],
  ['torpedo-carrier.html','  const dmgF = P.hull<60','zero']
]){
  const fly=controller(file,start),turn=turnController(file),p={roll:0,pitch:0,spd:kind==='zero'?105:150,ac:kind,
    hull:130,gear:0,rollBias:0,pitchVel:0,rollVel:0};
  const d={rollLim:1.56,pitchLim:1.15,pitchAuth:.85,rollAuth:.9,gLim:6,hull:130};
  // The Zero/Thunderbolt normal mode now permits steep banking yet still
  // self-centres when the touch stick is released.
  for(let i=0;i<90;i++)fly(p,1,0,false,.04,d,40,1);
  assert(p.roll>1.05&&p.roll<1.57,file+' full stick must reach a steep bank');
  for(let i=0;i<120;i++)fly(p,0,0,false,.04,d,40,1);
  assert(Math.abs(p.roll)<.06,file+' normal mode must still return to level');
  p.roll=Math.PI/2;p.pitch=0;p.heading=0;
  for(let i=0;i<35;i++){fly(p,0,0,true,.04,d,40,1);turn(p,true,.04,d,40);}
  const bankOnly=Math.abs(p.heading);
  assert(bankOnly>.25,file+' bank alone must turn in AERO');
  p.roll=Math.PI/2;p.pitch=0;p.heading=0;
  for(let i=0;i<35;i++){fly(p,0,1,true,.04,d,40,1);turn(p,true,.04,d,40);}
  assert(Math.abs(p.pitch)<.02,file+' knife-edge pull should turn rather than loop');
  assert(Math.abs(p.heading)>bankOnly*1.5,file+' pulling must tighten the banked turn');
  p.roll=70*Math.PI/180;p.pitch=0;p.heading=0;
  for(let i=0;i<35;i++){fly(p,0,1,true,.04,d,40,1);turn(p,true,.04,d,40);}
  assert(p.pitch>.15&&Math.abs(p.heading)>.3,file+' 70° pull must climb and turn');
  p.roll=0;p.pitch=0;
  let travelled=0,old=p.roll,upsideDown=false;
  for(let i=0;i<250&&travelled<Math.PI*2;i++){
    fly(p,1,0,true,.04,d,40,1);
    travelled+=Math.abs(angleDelta(p.roll,old));old=p.roll;
    if(Math.abs(p.roll)>2.9)upsideDown=true;
  }
  assert(upsideDown&&travelled>=Math.PI*2,file+' must rotate through a full 360° roll');
  p.roll=0;p.pitch=0;travelled=0;old=0;upsideDown=false;
  for(let i=0;i<400&&travelled<Math.PI*2;i++){
    fly(p,0,1,true,.04,d,40,1);
    travelled+=Math.abs(angleDelta(p.pitch,old));old=p.pitch;
    if(Math.abs(p.pitch)>2.9)upsideDown=true;
  }
  assert(upsideDown&&travelled>=Math.PI*2,file+' must rotate through a full 360° loop');
  console.log(file,kind,'coupled bank/pull, full roll and loop');
}
const rhine=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
const a=rhine.indexOf('const AC={'),b=rhine.indexOf('\n};',a);
assert(a>0&&b>a,'Rhine aircraft definitions not found');
const AC=vm.runInNewContext(rhine.slice(a,b+3)+'\nAC');
const turn=turnController('remagen-mission.html');
const headingAfterTurn=kind=>{
  const p={ac:kind,roll:1.2,spd:150,heading:0};
  for(let i=0;i<35;i++)turn(p,true,.04,AC[kind],AC[kind].stall);
  return p.heading;
};
assert(headingAfterTurn('bf109')<headingAfterTurn('p47'),
  'Bf 109 turn must no longer snap around faster than the P-47 at equal speed and bank');
assert(AC.bf109.rollAuth<AC.fw190.rollAuth,'Bf 109 roll response must be gentler than Fw 190');
