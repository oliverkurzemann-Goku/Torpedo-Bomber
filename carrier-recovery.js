/* Carrier-aligned wind and recovery assessment. Metres, m/s, radians.
 * Speeds describe the game's flight envelope, not historical certification data. */
(function(root){
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function wind(base,gust=0){return {x:-Math.max(0,Math.abs(base)+gust*3),z:0};}
function envelope(p,stall=31,reference=40){
 if(root.SortieFeatures?.Handling)return root.SortieFeatures.Handling.speeds(p,stall,reference,7,0);
 const limit=stall-clamp(p.flap||0,0,1)*7;
 return {stall:limit,warning:limit*1.15,reference,
  stalled:p.spd<limit,low:p.spd<limit*1.15};
}
function landing(sample,reference=40){
 if(!sample)return {grade:'UNRECORDED',points:0};
 reference=sample.reference||reference;
 const speed=Math.abs(sample.speed-reference),centre=Math.abs(sample.offset),sink=Math.max(0,sample.sink);
 const clean=speed<=3&&centre<=4&&sink<=3.5&&Math.abs(sample.bank)<=.12;
 const safe=speed<=6&&centre<=8&&sink<=5&&Math.abs(sample.bank)<=.22;
 const grade=sample.wire===3&&clean?'OK-3':safe?'FAIR-'+sample.wire:'NO GRADE-'+sample.wire;
 return {grade,points:grade==='OK-3'?250:safe?100:0,clean,safe};
}
function approach(p,stall=31,reference=40){
 const e=envelope(p,stall,reference),low=Math.max(e.warning,e.reference-4),high=e.reference+5;
 return {...e,lowLimit:low,highLimit:high,tooSlow:p.spd<low,tooFast:p.spd>high};
}
function assessment(s){
 const release=s.released||0,accuracy=release?clamp((s.hit||0)/release,0,1):null;
 const protectedShips=s.transports||[],escort=protectedShips.length>0,
  kept=protectedShips.filter(t=>t.alive&&t.arrived).length,
  protection=escort?protectedShips.reduce((n,t)=>n+(t.alive?clamp(t.hp/100,0,1):0),0)/protectedShips.length:0;
 // Fighter and shore-only sorties can earn Gold without inventing torpedo accuracy.
 const objective=escort?protection:accuracy==null?(s.complete?1:0):accuracy;
 const value=objective*.45+clamp(s.hull/100,0,1)*.20+(s.cleanLanding?1:s.safeLanding?.55:0)*.35;
 const medal=value>=.82?'gold':value>=.60?'silver':'bronze';
 return {medal,accuracy,kept,total:protectedShips.length,protection,points:Math.round(objective*400),value};
}
function reserve(p,distance,headwind=0,difficultyFuel=1){
 const speed=Math.max(12,p.spd-headwind),seconds=distance/speed+65,
  rate=(.11+p.throttle*p.throttle*.42)*.4/Math.max(.5,difficultyFuel)+(p.systemDamage?.fuelLeak||0),
  required=seconds*rate;
 return {required,margin:p.fuel-required,minutes:seconds/60};
}
root.CarrierRecovery={wind,envelope,approach,landing,assessment,reserve};
if(typeof module==='object'&&module.exports)module.exports=root.CarrierRecovery;
})(typeof window==='undefined'?globalThis:window);
