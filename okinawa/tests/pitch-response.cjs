/* Measured assisted back-stick response of the shipped player law at three FPS.
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
function env(kind,P,stick,arcade=false){
 const pacific=!defs[kind],controls=SortieFeatures.Damage.controls(P),configuration=SortieFeatures.Handling.configuration(P,40);
 const d=pacific?{rollLim:limits[kind].rollLim,pitchLim:limits[kind].pitchLim,pitchAuth:pacPitch(kind),controlDamping:.80}:defs[kind];
 return {kind,convention:pacific?'pacific':'rhine',stickRoll:0,stickPitch:stick,aero:false,throttle:1,damage:1,brakes:0,
  gain:FlightCore.GAME.manoeuvreGain,arcade,controls,configuration,departure:{release:1,rate:Infinity},loadout:{fuel:50},d,
  rollFrac:pacific?(kind==='avenger'?.78:.86):.86,pitchBase:pacific?4.2:3.6,pullAssist:.6,pitchScale:pacific?.70:d.pitchLim*.92,hullFactor:1};
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
// Build 225 (1): the Rhine low-speed pull-up assist. Close to the stall the wing-limited path answers the stick
// at most (1 + pullAssist) x faster; at 1.7 x the stall speed (and above) it is gone, and without a back stick it does nothing.
function fresh(kind,spd){const pacific=!defs[kind],d=pacific?null:defs[kind];
 const p={ac:kind,pos:{x:0,y:1500,z:0},hull:d?.hull||100,spd,gear:0,flap:0,fuel:50,bombs:0,torps:0,rockets:0,rollBias:0,pitch:0,roll:0,
  pitchVel:0,rollVel:0,heading:0,nLoad:1,throttle:1,groundPower:1};
 SortieFeatures.Handling.configure(p,kind,'bomb',pacific?'pacific':'europe');SortieFeatures.Damage.reset(p,p.hull);return p;}
function stallOf(kind){const p=fresh(kind,110);return FlightControl.stallSpeed(p,env(kind,p,0));}
const assistRows=[];
for(const kind of [...Object.keys(defs),'avenger','sbd','corsair','zero'])for(const fps of [20,60,120]){
 const vs=stallOf(kind);
 const climbAt=(ratio,assist)=>{const p=fresh(kind,vs*ratio);let peakStall=0;
  for(let i=0;i<fps*1;i++){const e=env(kind,p,.4);e.pullAssist=assist;const r=FlightControl.player(p,1/fps,e);p.pos.y+=r.climb*(1/fps);peakStall=Math.max(peakStall,p.coreStall||0);}
  return {pitch:p.pitch,peakStall};};
 const slowOff=climbAt(1.2,0),slowOn=climbAt(1.2,.6),fastOff=climbAt(1.9,0),fastOn=climbAt(1.9,.6);
 assert(slowOn.pitch>slowOff.pitch*1.08,kind+' @'+fps+' FPS: the assist speeds up a slow pull-up: '+slowOff.pitch+' -> '+slowOn.pitch);
 assert(slowOn.pitch<slowOff.pitch*1.7,kind+' @'+fps+' FPS: the assist stays moderate');
 assert(Math.abs(fastOn.pitch-fastOff.pitch)<1e-6,kind+' @'+fps+' FPS: no assist well above the stall speed');
 const idle=fresh(kind,vs*1.2);for(let i=0;i<fps;i++){const e=env(kind,idle,0);FlightControl.player(idle,1/fps,e);}
 assert(Math.abs(idle.pitch)<.01,kind+' neutral stick stays level with the assist');
 assistRows.push({kind,fps,slowOff:+(slowOff.pitch/FlightEnvelope.DEG).toFixed(1),slowOn:+(slowOn.pitch/FlightEnvelope.DEG).toFixed(1)});
}
// Build 225 (2): pushing the stick forward at 1.35 x the stall speed never stalls (the nose-down load is bounded by
// the wing's inverted lift), with and without roll input, and a pull-up afterwards still recovers.
const pushRows=[];
for(const kind of [...Object.keys(defs),'avenger','sbd','corsair','zero'])for(const fps of [20,60,120]){
 const vs=stallOf(kind);
 for(const roll of [0,.8]){
  const p=fresh(kind,vs*1.35);let peak=0;
  for(let i=0;i<fps*5;i++){const e=env(kind,p,-1);e.stickRoll=roll;const r=FlightControl.player(p,1/fps,e);p.pos.y+=r.climb*(1/fps);peak=Math.max(peak,p.coreStall||0);}
  assert(peak<.05,kind+' @'+fps+' FPS roll '+roll+': a push-over does not stall: '+peak);
  if(roll===0){const pitchDown=p.pitch;for(let i=0;i<fps*6;i++){const e=env(kind,p,1);const r=FlightControl.player(p,1/fps,e);p.pos.y+=r.climb*(1/fps);}
   assert(p.pitch>pitchDown+.3,kind+' @'+fps+' FPS: the nose comes back up after the push-over');}
  pushRows.push({kind,fps,roll,peak:+peak.toFixed(2)});}
}

// ---- Build 227: the arcade extras of the Normal law (GAME.arcade in flight-core.js) ----
const KINDS=[...Object.keys(defs),'avenger','sbd','corsair','zero'],DEG=Math.PI/180,wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
const shaped226=null;void shaped226;
const A226=FlightCore.GAME.arcade;
assert(A226&&A226.turnPull>0&&A226.power>0&&A226.unload>0,'GAME.arcade is declared');
function sim(kind,spd,fps,arcade,secs,input,o={}){   // input(t) -> {roll,pitch}; returns the aircraft and a per-frame log
 const p=fresh(kind,spd);if(o.throttle!==undefined)p.throttle=p.groundPower=o.throttle;if(o.y)p.pos.y=o.y;
 const log=[];let h=p.heading;
 for(let i=0;i<fps*secs;i++){const t=i/fps,u=input(t),e=env(kind,p,u.pitch||0,arcade);e.stickRoll=u.roll||0;if(o.throttle!==undefined)e.throttle=o.throttle;if(o.aero)e.aero=true;
  const r=FlightControl.player(p,1/fps,e);p.pos.y+=r.climb/fps;
  log.push({t,w:wrapA(p.heading-h)*fps,pitch:p.pitch,roll:p.roll,spd:p.spd,y:p.pos.y,stall:p.coreStall||0,vs:r.climb,n:p.nLoad||1});h=p.heading;}
 return {p,log};
}
const mean=a=>a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);
const turnAt=(kind,spd,fps,arcade)=>{const {log}=sim(kind,spd,fps,arcade,8,()=>({roll:1}));return mean(log.filter(r=>r.t>=4).map(r=>Math.abs(r.w)))/DEG;};
const rows226={turn:[],surplus:[],zoom:[],push:[]};
for(const kind of KINDS){
 const vs=stallOf(kind),fps=60;
 // (1) the Zero is the turn reference: the gap to it is closed by at least 30 %, never over-closed, the Zero itself loses nothing
 for(const f of [1.3,1.8]){
  const v=vs*f,legacy=turnAt(kind,v,fps,false),arcadeW=turnAt(kind,v,fps,true),zl=turnAt('zero',v,fps,false),za=turnAt('zero',v,fps,true);
  if(kind==='zero'){assert(arcadeW>=legacy*.97,'zero keeps its turn: '+legacy+' -> '+arcadeW);}
  else{const gap=zl-legacy;
   if(gap>8)assert(arcadeW>=legacy+.3*gap,kind+' x'+f+': the turn gap to the Zero closes by 30 %: '+legacy.toFixed(1)+' -> '+arcadeW.toFixed(1)+' (Zero '+zl.toFixed(1)+')');
   assert(arcadeW<=za+1,kind+' x'+f+': the Zero stays the best turner: '+arcadeW.toFixed(1)+' vs '+za.toFixed(1));
   assert(arcadeW>=legacy-.5,kind+' x'+f+': arcade never turns slower than before');}
  rows226.turn.push({kind,f,legacy:+legacy.toFixed(1),arcade:+arcadeW.toFixed(1),zero:+za.toFixed(1)});
 }
 // (2) thrust surplus: accelerates faster, but the top speed is the computed one
 const m=FlightCore.model(kind),lo=FlightCore.loadout(m,{fuel:50});
 const accel=(arcade)=>{const {log}=sim(kind,vs*1.3,fps,arcade,4,()=>({}));return (log[log.length-1].spd-vs*1.3)/4;};
 const aOld=accel(false),aNew=accel(true);
 if(aOld>.4)assert(aNew>=aOld*1.25,kind+' accelerates at least 25 % faster in arcade: '+aOld.toFixed(2)+' -> '+aNew.toFixed(2));
 const vTop=FlightCore.levelMaxSpeed(m,1500,lo.mass*FlightCore.G);
 const top=(arcade)=>sim(kind,vTop*.9,20,arcade,150,()=>({})).p.spd;
 const tOld=top(false),tNew=top(true);
 assert(Math.abs(tNew-tOld)/tOld<.012,kind+' arcade leaves the top speed alone: '+tOld.toFixed(1)+' vs '+tNew.toFixed(1));
 rows226.surplus.push({kind,accOld:+aOld.toFixed(2),accNew:+aNew.toFixed(2),topOld:+tOld.toFixed(1),topNew:+tNew.toFixed(1)});
 // (3) speed protection: a held back stick settles into a climb instead of stall, nose drop and pull-up
 for(const f of [1.25,2.2]){
  const fpsZ=20,a=sim(kind,vs*f,fpsZ,true,25,()=>({pitch:1})),b=sim(kind,vs*f,fpsZ,false,25,()=>({pitch:1}));
  const peak=Math.max(...a.log.map(r=>r.stall)),minV=Math.min(...a.log.map(r=>r.spd)),late=a.log.filter(r=>r.t>10);
  assert(peak<.05,kind+' x'+f+': a held back stick does not stall: '+peak);
  assert(minV>vs*1.1,kind+' x'+f+': the speed never falls to the stall: '+(minV/vs).toFixed(2));
  assert(Math.min(...late.map(r=>r.vs))>0,kind+' x'+f+': it keeps climbing (no porpoising)');
  assert(a.p.pos.y-1500>=(b.p.pos.y-1500)*.9,kind+' x'+f+': it still gains at least as much height: '+(a.p.pos.y-1500).toFixed(0)+' vs '+(b.p.pos.y-1500).toFixed(0));
  rows226.zoom.push({kind,f,gain:Math.round(a.p.pos.y-1500),gainOld:Math.round(b.p.pos.y-1500),minV:+(minV/vs).toFixed(2)});
 }
 // flare: at 1.3 x stall with idle power a back stick still raises the nose by 11 deg and more
 {const a=sim(kind,vs*1.3,fps,true,3,()=>({pitch:.6}),{throttle:.1});assert(Math.max(...a.log.map(r=>r.pitch))>=.19,kind+' can still flare: '+Math.max(...a.log.map(r=>r.pitch)));}
 // (4) stick forward in a steep turn: no reversal of the turn
 for(const fps2 of [20,120]){
  const v=vs*2.0,settle=t=>({roll:.8,pitch:t<5?0:0});
  const run=(arcade,pv)=>sim(kind,v,fps2,arcade,8,t=>({roll:.8,pitch:t<5?0:pv})).log;
  const w0=mean(run(true,0).filter(r=>r.t>=4&&r.t<5).map(r=>Math.abs(r.w)));
  const dir=Math.sign(mean(run(true,0).filter(r=>r.t>=4&&r.t<5).map(r=>r.w)))||1;
  const light=run(true,-.3).filter(r=>r.t>=5.05&&r.t<7).map(r=>dir*r.w),full=run(true,-1).filter(r=>r.t>=5.05).map(r=>dir*r.w),old=run(false,-.3).filter(r=>r.t>=5.05&&r.t<7).map(r=>dir*r.w);
  assert(Math.min(...light)>.3*w0,kind+' @'+fps2+' FPS: a push of 0.3 keeps the turn going: '+(Math.min(...light)/DEG).toFixed(1)+' of '+(w0/DEG).toFixed(1));
  assert(Math.min(...full)>-.12*w0,kind+' @'+fps2+' FPS: a full push unloads the wing but does not reverse the turn: '+(Math.min(...full)/DEG).toFixed(1));
  assert(Math.min(...old)<0,kind+' @'+fps2+' FPS: the previous law did reverse it (the test discriminates)');
  // wings level the push-over is unchanged in kind: the nose goes well down
  const lvl=sim(kind,vs*1.6,fps2,true,3,()=>({pitch:-1})).p.pitch;
  assert(lvl<-20*DEG,kind+' @'+fps2+' FPS: the wings-level push-over still drops the nose: '+(lvl/DEG).toFixed(1));
  if(fps2===20)rows226.push.push({kind,w0:+(w0/DEG).toFixed(1),light:+(Math.min(...light)/DEG).toFixed(1),full:+(Math.min(...full)/DEG).toFixed(1),old:+(Math.min(...old)/DEG).toFixed(1)});
 }
 // (5) REALISTIC (aero) is exactly what it was: the arcade switch has no effect on it
 {const inp=t=>({roll:t<2?1:0,pitch:t<1?0:t<3?.6:-.3});
  const a=sim(kind,vs*1.8,60,true,5,inp,{aero:true}).p,b=sim(kind,vs*1.8,60,false,5,inp,{aero:true}).p;
  for(const k of ['pitch','roll','heading','spd'])assert.equal(a[k],b[k],kind+' REALISTIC unchanged ('+k+')');}
}
console.log('Arcade turn vs Zero:',JSON.stringify(rows226.turn.filter(r=>r.f===1.3)));
console.log('Arcade surplus:',JSON.stringify(rows226.surplus));
console.log('Arcade push in a bank (deg/s, 20 FPS):',JSON.stringify(rows226.push));
fs.mkdirSync(path.join(root,'test-visuals'),{recursive:true});fs.writeFileSync(path.join(root,'test-visuals/build227-arcade.json'),JSON.stringify(rows226,null,2));

console.log('Pull-up assist:',JSON.stringify(assistRows.filter(r=>r.fps===60)));
console.log('Push-over stall (max over FPS):',JSON.stringify([...new Set(pushRows.map(r=>r.kind))].map(k=>[k,Math.max(...pushRows.filter(r=>r.kind===k).map(r=>r.peak))])));
console.log('Measured pitch response:',JSON.stringify(rows));
fs.mkdirSync(path.join(root,'test-visuals'),{recursive:true});fs.writeFileSync(path.join(root,'test-visuals/build220-pitch.json'),JSON.stringify(rows,null,2));
