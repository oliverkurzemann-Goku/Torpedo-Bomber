/* Measured assisted back-stick response of shipped code, before/after, at three FPS. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');require('../../sortie-features');const FlightDynamics=require('../../flight-dynamics');
const eu=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8'),pac=fs.readFileSync(path.join(root,'torpedo-carrier.html'),'utf8');
const defs=vm.runInNewContext(eu.slice(eu.indexOf('const AC={'),eu.indexOf('function acDef('))+'\nAC');
const rows=[];
for(const kind of [...Object.keys(defs),'avenger','sbd','corsair','zero'])for(const fps of [20,60,120]){
 const pacific=!defs[kind],html=pacific?pac:eu,d=defs[kind],flight=html.indexOf('function updateFlight(dt)');
 const a=html.indexOf(pacific?'  const dmgF = P.hull<60':'  const dmgF = (P.hull < d.hull',flight),b=html.indexOf('  // bank-to-turn:',a);
 const sample=previous=>{
  let code=html.slice(a,b);if(previous)code=code.replace('pitchRate=2.9*','pitchRate=2.0*').replace('pitchRate=4.2*','pitchRate=3.2*');
  const run=vm.runInNewContext('(function(P,inputPitch,dt){const inputRoll=0,load=SortieFeatures.Handling.sample(P),controls=SortieFeatures.Damage.controls(P),stallSpd=d?.stall||35,configuration=SortieFeatures.Handling.configuration(P,stallSpd),departure=SortieFeatures.Handling.departure(P,dt,stallSpd),aeroMode=false,steerSign=1;'+code+'})',
   {SortieFeatures,FlightDynamics,d,P47Performance:require('../../p47-performance'),MISSIONS:[{corsair:kind==='corsair'}],mission:0,isDefend:()=>kind==='zero',isSBD:()=>kind==='sbd'});
  const p={ac:kind,hull:d?.hull||130,spd:110,gear:0,fuel:50,bombs:0,torps:0,rockets:0,rollBias:0,pitch:0,roll:0,pitchVel:0,rollVel:0,heading:0,departureAge:null};
  const target=.4*(pacific?.70:d.pitchLim*.92)*(d?.stickExponent?Math.pow(.4,d.stickExponent)/.4:1);
  let t90=null,peak=0;
  for(let i=0;i<fps*5;i++){run(p,.4,1/fps);peak=Math.max(peak,p.pitch);if(t90===null&&p.pitch>=target*.9)t90=(i+1)/fps;}
  assert(Math.abs(p.pitch-target)<.002,kind+' reaches same commanded attitude');assert(peak<target*1.04,kind+' no excessive overshoot');
  for(let i=0;i<fps*8;i++)run(p,0,1/fps);assert(Math.abs(p.pitch)<.002,kind+' neutral settles');
  return t90;
 };
 const before=sample(true),after=sample(false);assert(after<before*.83,kind+' reaches 90% sooner');rows.push({kind,fps,before,after,reduction:1-after/before});
}
for(const kind of new Set(rows.map(r=>r.kind))){const a=rows.filter(r=>r.kind===kind).map(r=>r.after);assert(Math.max(...a)-Math.min(...a)<.13,kind+' consistent FPS');}
console.log('Measured pitch response:',JSON.stringify(rows));
fs.mkdirSync(path.join(root,'test-visuals'),{recursive:true});fs.writeFileSync(path.join(root,'test-visuals/build212-pitch.json'),JSON.stringify(rows,null,2));
