'use strict';
const assert=require('node:assert/strict');
require('../../p47-performance.js');require('../../sortie-features.js');require('../../ground-run.js');
const {Handling,Damage}=SortieFeatures;
const types={p47:40,bf109:34.5,fw190:39,ju87:37,me262:49,me163:51},reports=[];
for(const [kind,stall] of Object.entries(types)){
 const p={ac:kind,alive:true,hull:100,pos:{y:20},spd:60,throttle:.3,fuel:50,bombs:0,flap:0,gear:1};
 Handling.configure(p,kind,'bomb','europe');Damage.reset(p);
 const clean=Handling.speeds(p,stall,60);p.flap=1;const full=Handling.speeds(p,stall,60);
 assert(full.reference<clean.reference&&full.stall<clean.stall,'flaps reduce both reference and stall: '+kind);
 assert(full.reference>=full.stall*1.25,'live target retains stall margin');
 if(kind==='p47')assert(full.referenceIAS*.44704**-1>=129&&full.referenceIAS*.44704**-1<=131,'P47 reference is the documented 130-mph game target with margin above the historical stall anchor');
 p.spd=full.reference;assert(Handling.fieldSink(p,full.stall)<1,'no artificial high sink at the landing reference');
 p.spd=full.stall*.85;assert(Handling.fieldSink(p,full.stall)>6,'true slow flight still sinks');
 p.fuel=100;p.bombs=kind==='me163'?0:2;assert(Handling.speeds(p,stall,60).reference>full.reference,'remaining loading raises REF');
 for(const fps of [20,60,120]){
  p.fuel=50;p.bombs=0;p.throttle=0;p.groundPower=0;p.spd=full.reference*.90;
  p.landingRoll={elapsed:0,travel:0,belly:false};const touch=p.spd;let maximumStep=0;
  while(p.landingRoll.elapsed<60){const before=p.spd,result=GroundRun.landing(p,1/fps,{jet:kind==='me262',skid:kind==='me163'});
   maximumStep=Math.max(maximumStep,before-p.spd);assert.equal(p.throttle,0,'rollout does not take the throttle');
   assert(before>=p.spd,'idle rollout does not accelerate');if(result.stopped)break;
  }
  assert(p.spd<.65&&p.landingRoll.elapsed>7,'no instant stop at contact');
  assert(p.landingRoll.travel>140&&p.landingRoll.travel<650,'rollout fits an early touchdown on the 900m strip');
  assert(maximumStep<.7,'braking changes speed continuously even at 20 FPS');
  reports.push({kind,fps,touch,seconds:p.landingRoll.elapsed,metres:p.landingRoll.travel});
 }
}
for(const kind of ['p47','bf109','fw190','ju87','me262','me163','avenger','sbd','corsair','zero']){
 const p={ac:kind,alive:true,hull:100,pos:{y:4},spd:45,throttle:1,flap:0,gear:1};
 Handling.configure(p,kind);Damage.reset(p);Handling.beginDeparture(p);
 const start=Handling.departure(p,.05,40);
 p.pos.y=12000;assert.equal(Handling.departure(p,300,40).release,start.release,'altitude and elapsed time cannot unlock climb');
 p.spd=65;const faster=Handling.departure(p,.05,40);assert(faster.rate>start.rate&&faster.release>start.release,'airspeed increases the climb allowance');
}
console.log('Field landing: type-specific MPH references, flap lift, loading, continuous rollout and speed-only initial climb:',JSON.stringify(reports));
