/* Derivation and single verification of the computed P-47 flight core (flight-core.js).
 * Prints the solved coefficients, the model against every published figure it was solved from,
 * and the game-relevant quantities that follow from them; writes app/release/flight-core-p47.json.
 *   node scripts/flight/derive-p47.cjs
 */
'use strict';
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..','..');
const F=require(path.join(root,'flight-core.js'));
const m=F.model('p47'),src=F.SOURCES.p47,W=m.mass*F.G,out={};
const r=(v,d=1)=>Number(v.toFixed(d));

// 1. coefficients
const corner=Math.sqrt(2*m.assumed.nLimit*W/(F.atmosphere(0).rho*m.S*m.CLmax));
out.coefficients={CD0:r(m.CD0,5),oswald:r(m.e,3),k:r(m.k,4),propProfileEfficiency:r(m.etaP,3),
 powerAt20kft:r(1-m.lapse*20000*F.FT,3),aspectRatio:r(m.A,3),liftSlopePerRad:r(m.lift,3),
 CLmaxClean:r(m.CLmax,3),CLmaxLanding:r(m.CLmaxLanding,3),cornerSpeedSL_ms:r(corner,1),
 dragAreaM2:r(m.CD0*m.S,3),fitRms:r(m.fit.rms*100,2)+' %'};

// 2. model vs source
out.verification=m.fit.data.map((d,i)=>{
 const model=d.type==='speed'?F.levelMaxSpeed(m,d.h,W)/F.MPH:F.bestClimb(m,d.h,W).rate/F.FPM;
 const published=d.type==='speed'?d.value/F.MPH:d.value/F.FPM;
 return {figure:d.type==='speed'?'max speed mph TAS':'climb fpm',altitudeFt:Math.round(d.h/F.FT),published:r(published,0),model:r(model,0),errorPct:r((model-published)/published*100,2)};
});
const stall=F.stallSpeed(m,0,src.stallTestLb/src.weightLb);
out.verification.push({figure:'clean stall mph IAS at 13,230 lb',published:src.stallCleanMph,model:r(stall/F.MPH,1),errorPct:r((stall/F.MPH-src.stallCleanMph)/src.stallCleanMph*100,2)});
out.bestClimbIAS_mph=[0,10000,20000].map(ft=>r(F.equivalent(F.bestClimb(m,ft*F.FT,W).V,ft*F.FT)/F.MPH,0));

// 3. game quantities from the integrator itself (game control law: level turn at the commanded bank)
function fly(s,seconds,fps,o){const dt=1/fps;let t=0,res;for(;t<seconds;t+=dt)res=F.step(m,s,dt,o);return res;}
const level=(bank)=>({throttle:1,command:(s)=>F.holdLoad(s.pitch,s.roll,0)});
function fullCircle(V0,h,gain,fps=60){
 const atm=F.atmosphere(h),lim=F.loadLimits(m,V0,atm.rho,W,{});
 const bank=Math.min(1.56*.95,Math.acos(Math.min(1,1/lim.max)));
 const s={spd:V0,pitch:0,heading:0,roll:bank,nLoad:1/Math.cos(bank),power:1,altitude:h};
 let t=0;const dt=1/fps;
 while(Math.abs(s.heading)<2*Math.PI&&t<120){F.step(m,s,dt,{throttle:1,gain,command:(st)=>F.holdLoad(st.pitch,st.roll,0)});t+=dt;}
 return {seconds:r(t,2),endSpeed:r(s.spd,1),altitudeChange:r(s.altitude-h,1),bankDeg:r(bank*180/Math.PI,1)};
}
const vmax1000=F.levelMaxSpeed(m,1000,W);
out.turns={note:'full stick in Normal mode: level turn at the bank of the available load factor, full power, 1000 m',
 vmaxAt1000m_ms:r(vmax1000,1)};
for(const share of [.45,.70])for(const gain of [F.GAME.manoeuvreGain,1])
 out.turns[`${Math.round(share*100)}%Vmax_gain${gain}`]={entrySpeed:r(share*vmax1000,1),...fullCircle(share*vmax1000,1000,gain)};
// idle deceleration and full-power acceleration in level flight at 1000 m
out.level={};
for(const share of [.5,.75]){const V=share*vmax1000;
 out.level[`${share*100}%Vmax`]={speed:r(V,1),idleDecel:r(-F.levelAcceleration(m,V,1000,{power:0}),2),fullPowerAccel:r(F.levelAcceleration(m,V,1000,{power:1}),2)};}
// loop: AERO full pull from entry speed, wings level, full power, 1000 m
function loop(V0,gain){const s={spd:V0,pitch:0,heading:0,roll:0,nLoad:1,power:1,altitude:1000};let turned=0,minV=V0,prev=0,t=0;
 while(turned<2*Math.PI&&t<60){F.step(m,s,1/60,{throttle:1,gain,command:(st,V,l)=>l.max});
  turned+=Math.abs(Math.atan2(Math.sin(s.pitch-prev),Math.cos(s.pitch-prev)));prev=s.pitch;minV=Math.min(minV,s.spd);t+=1/60;}
 return {complete:turned>=2*Math.PI,seconds:r(t,1),minSpeed:r(minV,1),altitudeChange:r(s.altitude-1000,0)};}
out.loop={from140:loop(140,F.GAME.manoeuvreGain),from140_gain1:loop(140,1)};
// frame-rate independence: same 10 s manoeuvre at 20/60/120 FPS
const fr={};for(const fps of [20,60,120]){const s={spd:120,pitch:0,heading:0,roll:1.0,nLoad:1,power:.8,altitude:1500};
 fly(s,10,fps,{throttle:1,command:(st)=>F.holdLoad(st.pitch,st.roll,.3)});fr[fps]={speed:r(s.spd,4),heading:r(s.heading,5),altitude:r(s.altitude,3)};}
out.frameRate=fr;
// energy: no thrust, no drag, gravity only -> total energy per mass must stay constant
{const mm={...m,CD0:0,k:0,P:0,assumed:{...m.assumed,windmill:0,mcrit:9}};const s={spd:150,pitch:0,heading:0,roll:0,nLoad:1,power:0,altitude:2000};
 const e0=.5*150*150+F.G*2000;for(let t=0;t<60;t+=1/60)F.step(mm,s,1/60,{throttle:0,command:(st,V,l)=>Math.min(l.max,2.5)});
 const e1=.5*s.spd*s.spd+F.G*s.altitude;out.energyDrift60sPct=r((e1-e0)/e0*100,4);}
out.sources=src;out.assumed=m.assumed;out.game=F.GAME;
fs.writeFileSync(path.join(root,'app/release/flight-core-p47.json'),JSON.stringify(out,null,1)+'\n');
console.log(JSON.stringify(out,null,1));
