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
for(const [file,start,kind] of [
  ['remagen-mission.html','  const dmgF = (P.hull < d.hull','p47'],
  ['torpedo-carrier.html','  const dmgF = P.hull<60','zero']
]){
  const fly=controller(file,start),p={roll:0,pitch:0,spd:kind==='zero'?105:150,
    hull:130,gear:0,rollBias:0,pitchVel:0,rollVel:0};
  const d={rollLim:1.56,pitchLim:1.15,pitchAuth:.85,rollAuth:.9,gLim:6,hull:130};
  // The Zero/Thunderbolt normal mode now permits steep banking yet still
  // self-centres when the touch stick is released.
  for(let i=0;i<90;i++)fly(p,1,0,false,.04,d,40,1);
  assert(p.roll>1.05&&p.roll<1.57,file+' full stick must reach a steep bank');
  for(let i=0;i<120;i++)fly(p,0,0,false,.04,d,40,1);
  assert(Math.abs(p.roll)<.06,file+' normal mode must still return to level');
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
  console.log(file,kind,'steep bank, full roll and loop');
}
