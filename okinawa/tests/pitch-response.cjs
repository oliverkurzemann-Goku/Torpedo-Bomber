/* Measured assisted back-stick response of the shipped code at three FPS (Build 215: envelope-derived). */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');require('../../sortie-features');require('../../p47-performance');require('../../me262-performance');
require('../../flight-envelope');const FlightEnvelope=global.FlightEnvelope;const FlightDynamics=require('../../flight-dynamics');
const eu=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8'),pac=fs.readFileSync(path.join(root,'torpedo-carrier.html'),'utf8');
const defs=vm.runInNewContext(eu.slice(eu.indexOf('const AC={'),eu.indexOf('function acDef('))+'\nAC');
// Derived attitude-spring numbers, exactly as the pages compute them after the aircraft table.
for(const kind of Object.keys(defs)){const h=FlightEnvelope.handling(kind,{rollLim:defs[kind].rollLim,zeta:defs[kind].controlDamping});defs[kind].rollAuth=h.rollAuth;defs[kind].pitchAuth=h.pitchAuth;}
const handling=Object.fromEntries(['zero','corsair','sbd','avenger'].map(kind=>{const h=FlightEnvelope.handling(kind,{rollLim:kind==='zero'?1.52:kind==='sbd'?1.50:1.42,rollFrac:kind==='avenger'?.78:.86});return [kind,{roll:h.rollAuth,pitch:h.pitchAuth,name:kind}];}));
const rows=[];
for(const kind of [...Object.keys(defs),'avenger','sbd','corsair','zero'])for(const fps of [20,60,120]){
 const pacific=!defs[kind],html=pacific?pac:eu,d=defs[kind],flight=html.indexOf('function updateFlight(dt)');
 const a=html.indexOf(pacific?'  const dmgF = P.hull<60':'  const dmgF = (P.hull < d.hull',flight),b=html.indexOf('  // bank-to-turn:',a);
 const run=vm.runInNewContext('(function(P,inputPitch,dt){const inputRoll=0,load=SortieFeatures.Handling.sample(P),controls=SortieFeatures.Damage.controls(P),stallSpd=d?.stall||35,configuration=SortieFeatures.Handling.configuration(P,stallSpd),departure=SortieFeatures.Handling.departure(P,dt,stallSpd),aeroMode=false,steerSign=1;'+html.slice(a,b)+'})',
  {SortieFeatures,FlightDynamics,FlightEnvelope,PAC_HANDLING:handling,d,P47Performance:require('../../p47-performance'),MISSIONS:[{corsair:kind==='corsair'}],mission:0,isDefend:()=>kind==='zero',isSBD:()=>kind==='sbd'});
 const p={ac:kind,hull:d?.hull||130,spd:110,gear:0,fuel:50,bombs:0,torps:0,rockets:0,rollBias:0,pitch:0,roll:0,pitchVel:0,rollVel:0,heading:0,departureAge:null};
 const command=d?.stickExponent?Math.pow(.4,d.stickExponent):FlightDynamics.playerControls(kind,0,.4).pitch;
 const target=command*(pacific?.70:d.pitchLim*.92);
 let t90=null,peak=0,peakRate=0,last=0;
 for(let i=0;i<fps*5;i++){run(p,.4,1/fps);peak=Math.max(peak,p.pitch);peakRate=Math.max(peakRate,(p.pitch-last)*fps);last=p.pitch;if(t90===null&&p.pitch>=target*.9)t90=(i+1)/fps;}
 assert(Math.abs(p.pitch-target)<.002,kind+' reaches the commanded attitude');assert(peak<target*1.04,kind+' no excessive overshoot');
 for(let i=0;i<fps*8;i++)run(p,0,1/fps);assert(Math.abs(p.pitch)<.002,kind+' neutral settles');
 assert(t90>.35&&t90<1.6,kind+' assisted pitch stays brisk but not abrupt at 110 m/s: '+t90);
 rows.push({kind,fps,t90,peakDegS:+(peakRate/FlightEnvelope.DEG).toFixed(1)});
}
for(const kind of new Set(rows.map(r=>r.kind))){const a=rows.filter(r=>r.kind===kind).map(r=>r.t90);assert(Math.max(...a)-Math.min(...a)<.13,kind+' consistent FPS');}
const at=k=>rows.find(r=>r.kind===k&&r.fps===60).t90;
assert(at('zero')<1.4&&at('bf109')<1.4,'light fighters remain responsive after touch calming');
assert(at('avenger')>at('zero'),'the torpedo bomber answers more slowly than the Zero');
console.log('Measured pitch response:',JSON.stringify(rows));
fs.mkdirSync(path.join(root,'test-visuals'),{recursive:true});fs.writeFileSync(path.join(root,'test-visuals/build219-pitch.json'),JSON.stringify(rows,null,2));
