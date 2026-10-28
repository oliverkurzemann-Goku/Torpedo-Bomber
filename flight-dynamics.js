/* Fleet-wide arcade energy/handling. SI units; gameplay coefficients, not a simulator.
 * The historic P-47 envelope remains in P47Performance. See FLIGHT-AND-SOUND.md. */
(function(root){
'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const profiles={
 p47:{max:194,power:680,induced:.70,turnDrag:2.4,corner:100,spool:1.25,stiff:175,floor:.72,ground:8.1,character:'Heavy, stable · carries speed through dives'},
 bf109:{max:176,power:720,induced:.65,turnDrag:2.0,corner:86,spool:.70,stiff:130,floor:.55,ground:6.1,character:'Light climber · tight turns, heavier controls at speed'},
 fw190:{max:194,power:690,induced:.85,turnDrag:3.1,corner:100,spool:.95,stiff:175,floor:.78,ground:6.0,character:'Quick roll · fast passes, hard turns cost speed'},
 ju87:{max:113,power:390,induced:.85,turnDrag:2.0,corner:70,spool:1.05,stiff:110,floor:.70,ground:5.5,character:'Steady dive bomber · deliberate turns and modest climb'},
 me262:{max:242,power:0,induced:0,turnDrag:1,corner:130,spool:2.6,stiff:210,floor:.72,ground:6.8,character:'Slow spool-up · fast flight, wide turns'},
 me163:{max:238,power:17,induced:.65,turnDrag:2.3,corner:110,spool:.30,stiff:200,floor:.75,ground:8,character:'Rocket surge · conserve energy during the unpowered glide'},
 avenger:{max:121,power:395,induced:.90,turnDrag:3.0,corner:72,spool:1.45,stiff:120,floor:.66,ground:9.0,stall:31,reference:40,character:'Heavy torpedo bomber · slow response, stable approach'},
 sbd:{max:113,power:425,induced:.68,turnDrag:2.0,corner:70,spool:1.05,stiff:120,floor:.72,ground:9.4,stall:32,reference:40,character:'Balanced dive bomber · steady dive and gentle recovery'},
 corsair:{max:172,power:690,induced:.80,turnDrag:2.7,corner:100,spool:1.10,stiff:170,floor:.76,ground:10.8,stall:36,reference:45,character:'Powerful fast fighter · strong climb, keep your speed'},
 zero:{max:147,power:525,induced:.55,turnDrag:1.65,corner:78,spool:.65,stiff:108,floor:.46,ground:10.2,stall:29,reference:37,character:'Light turn fighter · agile when slow, stiff at high speed'}
};
for(const p of Object.values(profiles))Object.freeze(p);
Object.freeze(profiles);
function profile(kind){return profiles[kind]||profiles.p47;}
function kind(p){return p.loadProfile?.kind||p.ac||'avenger';}
function authority(type,speed,stall){
 const q=profile(type),slow=clamp((speed/Math.max(1,stall)-.65)/.65,.35,1);
 const fast=clamp((speed-q.stiff)/65,0,1),roll=1-fast*(1-q.floor);
 return {roll:slow*roll,pitch:slow*(1-fast*(1-q.floor)*.55),turn:1-fast*.13};
}
function acceleration(type,p,o={}){
 const q=profile(type),v=Math.max(32,p.spd||0),mass=clamp(o.loadRatio??1,.8,1.5),power=(p.fuel??100)<=0?0:clamp(o.power??1,0,1);
 const bank=clamp(Math.abs(Math.sin(o.bank??p.roll??0)),0,1);
 const gear=type==='ju87'?0:clamp(p.gear||0,0,1),flaps=clamp(o.flaps??p.flap??0,0,1);
 const config=gear*.65+flaps*1.10+(p.tankAttached?.3:0)+(o.drag||0)*.15+(p.diveBrake?(type==='ju87'?7.0:5.0):0);
 // Rocket-off flight keeps the previously verified Komet recovery envelope.
 if(type==='me163'&&((p.fuel??100)<=0||(p.throttle||0)<.01))return -1.1-v*.008-9.81*Math.sin(p.pitch||0)-flaps*.25;
 const spool=clamp(p.groundPower??p.throttle??0,0,1);
 let thrust,drag;
 if(type==='me163'){
  thrust=q.power*spool*power;drag=q.power*(v/q.max)**2+q.induced*bank*bank;
 }else{
  // Power / speed supplies thrust; drag rises with speed squared. Full throttle
  // meets the clean maximum without a target-speed spring or infinite idle thrust.
  const c=q.power/q.max-q.induced*(q.corner/q.max)**2;
  thrust=q.power*spool*power/Math.max(55,v);
  drag=c*(v/q.max)**2+q.induced*(q.corner/v)**2*mass*mass*(1+q.turnDrag*bank*bank);
 }
 return clamp((thrust-drag)/mass-9.81*Math.sin(p.pitch||0)-config,-18,type==='me163'?18:8);
}
function step(p,dt,o={}){
 const type=o.kind||kind(p),q=profile(type),duration=clamp(dt,0,.25);
 const steps=Math.max(1,Math.ceil(duration*120)),h=duration/steps;
 for(let i=0;i<steps;i++){
  if(type==='me262'&&root.Me262Performance){root.Me262Performance.step(p,h,{...o,power:(p.fuel??100)<=0?0:o.power});continue;}
  const throttle=(p.fuel??100)<=0?0:clamp(p.throttle||0,0,1);
  p.groundPower=(p.groundPower??throttle)+(throttle-(p.groundPower??throttle))*(1-Math.exp(-h/q.spool));
  let a;
  if(type==='p47'&&root.P47Performance){
   a=root.P47Performance.gameplayAcceleration({...p,throttle:p.groundPower},{...o,damage:(p.fuel??100)<=0?0:o.power??1});
  }else a=acceleration(type,p,o);
  if(type!=='p47'&&a>0&&o.departure?.release<1)a=Math.min(a,o.departure.acceleration/(o.loadRatio||1)*(1+2*o.departure.release));
  p.spd=Math.max(6,(p.spd||0)+a*h);
 }
 return p.spd;
}
root.FlightDynamics={profiles,profile,kind,authority,acceleration,step};
if(typeof module==='object'&&module.exports)module.exports=root.FlightDynamics;
})(typeof window==='undefined'?globalThis:window);
