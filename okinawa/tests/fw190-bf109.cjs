/* Build 235: Fw 190 against Bf 109 in REALISTIC (FlightCore data + the real player law). Header (harness) copied from pitch-response.cjs.
 * User brief: the Fw 190 rolls better than the Bf 109 at every speed (but was a bit too agile), the Bf 109 climbs better, turns tighter
 * and is better above 6 000 m; the Fw 190's strengths are the quick change of direction and the dive.
 * Measured assisted back-stick response of the shipped player law at three FPS.
 * Build 227 adds the arcade extras of the Normal law (Zero turn reference, thrust surplus, speed-protected nose-up,
 * steadier push in a bank); the Build 220/225 checks below fly the law without them (env.arcade = false, which is
 * what ?arcade=off does in the games), the Build 227 checks fly it with them and prove REALISTIC is untouched.
 * Build 225 adds the low-speed pull-up assist (pullAssist; Build 227: both games) and a lower load cap for push-overs.
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
 assert.match(env,name==='Rhine'?/pitchBase:3\.6,pullAssist:\.6,pitchScale:d\.pitchLim\*\.92/:/pitchBase:4\.2,pullAssist:\.6,pitchScale:\.70/,name+' coreEnv constants');}
function env(kind,P,stick,arcade=false,aero=false,stickRoll=0){
 const pacific=!defs[kind],controls=SortieFeatures.Damage.controls(P),configuration=SortieFeatures.Handling.configuration(P,40);
 const d=pacific?{rollLim:limits[kind].rollLim,pitchLim:limits[kind].pitchLim,pitchAuth:pacPitch(kind),controlDamping:.80}:defs[kind];
 return {kind,convention:pacific?'pacific':'rhine',stickRoll,stickPitch:stick,aero,throttle:1,damage:1,brakes:0,
  gain:FlightCore.GAME.manoeuvreGain,arcade,controls,configuration,departure:{release:1,rate:Infinity},loadout:{fuel:50},d,
  rollFrac:pacific?(kind==='avenger'?.78:.86):.86,pitchBase:pacific?4.2:3.6,pullAssist:.6,pitchScale:pacific?.70:d.pitchLim*.92,hullFactor:1};
}


const DEG=Math.PI/180,G=9.80665;
const bf=FlightCore.model('bf109'),fw=FlightCore.model('fw190'),W=m=>m.mass*G;
// 1) roll: the Fw 190 stays the better roller at every speed (published ordering) but is capped below its former 206 deg/s
let fwPeak=0;
for(let V=40;V<=250;V+=10){const f=FlightCore.rollRate(fw,V),b=FlightCore.rollRate(bf,V);fwPeak=Math.max(fwPeak,f);
 assert(f>b*1.15,'Fw 190 out-rolls the Bf 109 at '+V+' m/s EAS: '+(f/DEG).toFixed(0)+' vs '+(b/DEG).toFixed(0));}
assert(fwPeak<=172.01*DEG,'Fw 190 game roll ceiling 172 deg/s: '+(fwPeak/DEG).toFixed(1));
assert(fwPeak>=165*DEG,'...but it is still the fastest roller of the pair by a wide margin: '+(fwPeak/DEG).toFixed(1));
// 2) climb: the Bf 109 climbs better at every height (published: 16.4 m/s at sea level against 13.8 combat), above 6 000 m as well
for(const h of [0,3000,6000,8000]){const c=m=>FlightCore.bestClimb(m,h,W(m)),cb=c(bf),cf=c(fw),rb=cb.rate??cb.climb??cb,rf=cf.rate??cf.climb??cf;assert(rb>rf,'Bf 109 climbs better at '+h+' m: '+rb.toFixed(2)+' vs '+rf.toFixed(2));}
// 3) turn fight: sustained and instantaneous turn rate are the Bf 109's at 90-120 m/s, at 1 500 m and above 6 000 m
function sustained(m,V,h){const {rho,a}=FlightCore.atmosphere(h),T=FlightCore.thrust(m,V,rho,1,h);let lo=1,hi=9;if(T-FlightCore.drag(m,V,rho,a,1,W(m))<0)return 0;
 for(let i=0;i<50;i++){const mid=(lo+hi)/2;if(T-FlightCore.drag(m,V,rho,a,mid,W(m))>0)lo=mid;else hi=mid;}return G*Math.sqrt(lo*lo-1)/V;}
const inst=(m,V,h)=>{const l=FlightCore.loadLimits(m,V,FlightCore.atmosphere(h).rho,W(m));return G*Math.sqrt(Math.max(0,l.max*l.max-1))/V;};
for(const [V,h] of [[90,1500],[120,1500],[120,6000],[150,6000]]){
 assert(inst(bf,V,h)>inst(fw,V,h),'Bf 109 pulls the tighter turn at '+V+' m/s, '+h+' m');
 if(V<=120)assert(sustained(bf,V,h)>sustained(fw,V,h),'Bf 109 holds the faster sustained turn at '+V+' m/s, '+h+' m: '+(sustained(bf,V,h)/DEG).toFixed(1)+' vs '+(sustained(fw,V,h)/DEG).toFixed(1));}
// 4) the Fw 190's strengths: speed (dive and run-away) at every height
for(const h of [0,3000,6000,8000])assert(FlightCore.levelMaxSpeed(fw,h,W(fw))>FlightCore.levelMaxSpeed(bf,h,W(bf)),'Fw 190 is the faster aircraft at '+h+' m');
// 5) the real player law (REALISTIC): quick change of direction is the Fw 190's, the sustained turn fight the Bf 109's
function fresh2(kind,spd){const p={ac:kind,pos:{x:0,y:2000,z:0},hull:100,spd,gear:0,flap:0,fuel:50,bombs:0,torps:0,rockets:0,rollBias:0,pitch:0,roll:0,pitchVel:0,rollVel:0,heading:0,nLoad:1,throttle:1,groundPower:1};
 SortieFeatures.Handling.configure(p,kind,'bomb','europe');SortieFeatures.Damage.reset(p,p.hull);return p;}
function turn(kind,v0,h0,fps){const p=fresh2(kind,v0);p.pos.y=h0;const dt=1/fps;let t=0;
 for(;t<3&&Math.abs(p.roll)<70*DEG;t+=dt)FlightControl.player(p,dt,env(kind,p,0,false,true,.8));
 const tRoll=t,h=p.heading,y0=p.pos.y;for(let i=0;i<fps*10;i++){const r=FlightControl.player(p,dt,env(kind,p,1,false,true,0));p.pos.y+=r.climb*dt;}
 return {tRoll,turned:Math.abs(p.heading-h)/DEG,stall:p.coreStall||0,dAlt:p.pos.y-y0};}
const rows=[];
for(const fps of [20,60,120])for(const [v,h] of [[130,2000],[130,7000]]){
 const b=turn('bf109',v,h,fps),f=turn('fw190',v,h,fps);rows.push({fps,v,h,b,f,bfTurn:+b.turned.toFixed(0),fwTurn:+f.turned.toFixed(0),bfRoll:+b.tRoll.toFixed(2),fwRoll:+f.tRoll.toFixed(2)});}
for(const r of rows){const {fps,v,h,b,f}=r,at=' @'+fps+' FPS, '+v+' m/s, '+h+' m: '+JSON.stringify({bfRoll:r.bfRoll,fwRoll:r.fwRoll,bfTurn:r.bfTurn,fwTurn:r.fwTurn});
 // a frame is a coarse unit at 20 FPS (0.05 s): the ratio is judged at 60 and 120 FPS, the order at every rate
 assert(f.tRoll<b.tRoll,'Fw 190 rolls into the turn sooner'+at);
 if(fps>=60)assert(f.tRoll*1.15<b.tRoll,'...clearly sooner'+at);
 assert(f.tRoll>=.3,'...but no longer snaps to 70 deg bank in a third of a second'+at);
 assert(b.turned>f.turned*1.1,'Bf 109 turns further in 10 s'+at);
 assert(b.stall<.05&&f.stall<.05,'no stall in the comparison turn'+at);}
console.log('Fw 190 vs Bf 109 (60 FPS rows):',JSON.stringify(rows.filter(r=>r.fps===60)));
console.log('Fw 190 / Bf 109: roll '+(FlightCore.rollRate(fw,100)/DEG).toFixed(0)+' vs '+(FlightCore.rollRate(bf,100)/DEG).toFixed(0)+' deg/s at 100 m/s EAS, Bf 109 climbs, turns and holds up better; Fw 190 faster and the better roller.');
