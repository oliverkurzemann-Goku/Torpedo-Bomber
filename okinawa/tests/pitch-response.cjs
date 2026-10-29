/* Measured assisted back-stick response of the shipped player law at three FPS.
 * Build 220: every type flies the computed core, so this drives FlightControl.player() with exactly the
 * per-game constants the pages pass (Rhine: coreEnv in remagen-mission.html; Pacific: coreEnv in
 * torpedo-carrier.html) and measures how fast the flight path follows a 40 % back-stick step at 110 m/s. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');require('../../sortie-features');
require('../../flight-envelope');const FlightEnvelope=global.FlightEnvelope;
const FlightCore=require('../../flight-core.js'),FlightControl=require('../../flight-control.js');
const SortieFeatures=global.SortieFeatures;
const eu=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8'),pac=fs.readFileSync(path.join(root,'torpedo-carrier.html'),'utf8');
const defs=vm.runInNewContext(eu.slice(eu.indexOf('const AC={'),eu.indexOf('function acDef('))+'\nAC');
// Derived attitude-spring numbers, exactly as the pages compute them after the aircraft table.
for(const kind of Object.keys(defs)){const h=FlightEnvelope.handling(kind,{rollLim:defs[kind].rollLim,zeta:defs[kind].controlDamping});defs[kind].rollAuth=h.rollAuth;defs[kind].pitchAuth=h.pitchAuth;}
const limits=vm.runInNewContext(pac.slice(pac.indexOf('const PAC_LIMITS='),pac.indexOf('function coreEnv('))+'\nPAC_LIMITS');
const pacPitch=kind=>FlightEnvelope.handling(kind,{rollLim:limits[kind].rollLim,rollFrac:kind==='avenger'?.78:.86}).pitchAuth;
// The two games' constants, read from the shipped coreEnv source so a change there shows up here.
for(const [html,name] of [[eu,'Rhine'],[pac,'Pacific']]){const env=html.slice(html.indexOf('function coreEnv('),html.indexOf('function',html.indexOf('function coreEnv(')+10));
 assert.match(env,name==='Rhine'?/pitchBase:2\.9,pitchScale:d\.pitchLim\*\.92/:/pitchBase:4\.2,pitchScale:\.70/,name+' coreEnv constants');}
function env(kind,P,stick){
 const pacific=!defs[kind],controls=SortieFeatures.Damage.controls(P),configuration=SortieFeatures.Handling.configuration(P,40);
 const d=pacific?{rollLim:limits[kind].rollLim,pitchLim:limits[kind].pitchLim,pitchAuth:pacPitch(kind),controlDamping:.80}:defs[kind];
 return {kind,convention:pacific?'pacific':'rhine',stickRoll:0,stickPitch:stick,aero:false,throttle:1,damage:1,brakes:0,
  gain:FlightCore.GAME.manoeuvreGain,controls,configuration,departure:{release:1,rate:Infinity},loadout:{fuel:50},d,
  rollFrac:pacific?(kind==='avenger'?.78:.86):.86,pitchBase:pacific?4.2:2.9,pitchScale:pacific?.70:d.pitchLim*.92,hullFactor:1};
}
const rows=[];
for(const kind of [...Object.keys(defs),'avenger','sbd','corsair','zero'])for(const fps of [20,60,120]){
 const pacific=!defs[kind],d=pacific?null:defs[kind];
 const p={ac:kind,pos:{x:0,y:1500,z:0},hull:d?.hull||100,spd:110,gear:0,flap:0,fuel:50,bombs:0,torps:0,rockets:0,rollBias:0,pitch:0,roll:0,
  pitchVel:0,rollVel:0,heading:0,nLoad:1,throttle:1,groundPower:1};
 SortieFeatures.Handling.configure(p,kind,'bomb',pacific?'pacific':'europe');SortieFeatures.Damage.reset(p,p.hull);
 const shaped=v=>d?.stickExponent?Math.pow(v,d.stickExponent):v,target=shaped(.4)*(pacific?.70:d.pitchLim*.92);
 const step=(stick,dt)=>{const r=FlightControl.player(p,dt,env(kind,p,stick));p.pos.y+=r.climb*dt;};
 let t90=null,peak=0,peakRate=0,last=0;
 for(let i=0;i<fps*5;i++){step(.4,1/fps);peak=Math.max(peak,p.pitch);peakRate=Math.max(peakRate,(p.pitch-last)*fps);last=p.pitch;if(t90===null&&p.pitch>=target*.9)t90=(i+1)/fps;}
 assert(Math.abs(p.pitch-target)<.01,kind+' reaches the commanded flight path: '+p.pitch+' vs '+target);
 assert(peak<target*1.06,kind+' no excessive overshoot');
 for(let i=0;i<fps*8;i++)step(0,1/fps);assert(Math.abs(p.pitch)<.01,kind+' neutral settles: '+p.pitch);
 assert(t90>.35&&t90<2.2,kind+' assisted pitch stays brisk but not abrupt at 110 m/s: '+t90);
 rows.push({kind,fps,t90,peakDegS:+(peakRate/FlightEnvelope.DEG).toFixed(1)});
}
for(const kind of new Set(rows.map(r=>r.kind))){const a=rows.filter(r=>r.kind===kind).map(r=>r.t90);assert(Math.max(...a)-Math.min(...a)<.13,kind+' consistent FPS '+a);}
const at=k=>rows.find(r=>r.kind===k&&r.fps===60).t90;
assert(at('zero')<at('avenger'),'the torpedo bomber answers more slowly than the Zero');
assert(at('bf109')<at('p47'),'the light Bf 109 answers sooner than the heavy Jug');
console.log('Measured pitch response:',JSON.stringify(rows));
fs.mkdirSync(path.join(root,'test-visuals'),{recursive:true});fs.writeFileSync(path.join(root,'test-visuals/build220-pitch.json'),JSON.stringify(rows,null,2));
