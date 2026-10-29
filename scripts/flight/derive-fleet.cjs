/* Derivation and verification of the computed flight core (flight-core.js) for every aircraft.
 * Prints and writes app/release/flight-core-fleet.json: solved coefficients, the model against every
 * published figure it was solved from, and the game-relevant quantities that follow from them.
 *   node scripts/flight/derive-fleet.cjs
 */
'use strict';
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..','..');
const F=require(path.join(root,'flight-core.js'));
const r=(v,d=1)=>Number(Number(v).toFixed(d));
const unit=d=>d.q==='speed'?[3.6,'km/h']:d.q==='climb'?[1,'m/s']:[1/60,'min'];
const out={game:F.GAME,class:F.CLASS,types:{}};

function fullCircle(m,V0,h,gain){
 const atm=F.atmosphere(h),W=m.mass*F.G,lim=F.loadLimits(m,V0,atm.rho,W,{});
 const bank=Math.min(1.56*.95,Math.acos(Math.min(1,1/lim.max)));
 const s={spd:V0,pitch:0,heading:0,roll:bank,nLoad:1/Math.cos(bank),power:1,altitude:h};let t=0;
 while(Math.abs(s.heading)<2*Math.PI&&t<120){F.step(m,s,1/60,{throttle:1,gain,stallModel:false,command:st=>F.holdLoad(st.pitch,st.roll,0)});t+=1/60;}
 return {seconds:r(t,2),endSpeed:r(s.spd,1),altitudeChange:r(s.altitude-h,1),bankDeg:r(bank/F.DEG,1)};
}
function loop(m,V0,gain){
 const s={spd:V0,pitch:0,heading:0,roll:0,nLoad:1,power:1,altitude:1000};let turned=0,minV=V0,prev=0,t=0;
 while(turned<2*Math.PI&&t<60){F.step(m,s,1/60,{throttle:1,gain,stallModel:false,command:(st,V,l)=>l.max});
  turned+=Math.abs(Math.atan2(Math.sin(s.pitch-prev),Math.cos(s.pitch-prev)));prev=s.pitch;minV=Math.min(minV,s.spd);t+=1/60;}
 return {complete:turned>=2*Math.PI,seconds:r(t,1),minSpeed:r(minV,1)};
}
// Ground run to lift-off at the published mass: full power, take-off flap (0.4 for carrier types, 0.2 else),
// rotation once above 1.1 x the take-off stall; sea level, still air, firm surface mu 0.04.
function takeoff(m,{flaps=.2,mu=.04,headwind=0,massKg=m.mass}={}){
 const vs=F.stallSpeed(m,0,massKg/m.mass,flaps),vr=1.1*vs;let v=headwind,x=0,t=0,power=0;const dt=1/60;
 while(t<90){power+=(1-power)*(1-Math.exp(-dt/m.assumed.spool));
  const g=F.groundAcceleration(m,v,{power,flaps,rotated:v>vr?1:0,mu,massKg});
  if(v>vr&&g.liftoff)break;v+=g.accel*dt;x+=(v-headwind)*dt;t+=dt;}
 return {seconds:r(t,1),groundRun:r(x,0),liftoffIAS:r(v*3.6,0),stallIAS:r(vs*3.6,0)};
}
for(const kind of Object.keys(F.SOURCES)){
 const m=F.model(kind),src=F.SOURCES[kind],W=m.mass*F.G,o={};
 o.name=m.name;
 o.solved=Object.fromEntries(m.fit.params.map((p,i)=>[p,r(m.fit.x[i],p==='lapse'?9:5)]));
 Object.assign(o.solved,{rms:r(m.fit.rms*100,2)+' %',oswald:r(m.e,3),aspect:r(m.A,2),CLmaxClean:r(m.CLmax,3),CLmaxLanding:r(m.CLmaxLanding,3),
  diveBrakeCD:m.brakeCD?r(m.brakeCD,4):null,massPublished:r(m.mass,0),massEmptyNoFuel:r(m.empty,0),fuelKg:r(m.fuelKg,0)});
 o.verification=m.fit.data.map((d,i)=>{const [k,u]=unit(d),v=F.evaluate(m,d,W);
  return {figure:d.text,ref:d.ref,published:r(d.v*k,1)+' '+u,model:r(v*k,1)+' '+u,errorPct:r(m.fit.residuals[i]*100,2)};});
 const v1000=F.levelMaxSpeed(m,1000,W),climb=F.bestClimb(m,0,W);
 o.game={vmax1000m_kmh:r(v1000*3.6,0),climbSL_ms:r(climb.rate,1),bestClimbIAS_kmh:r(climb.V*3.6,0),
  stallCleanIAS_kmh:r(F.stallSpeed(m,0)*3.6,0),stallLandingIAS_kmh:r(F.stallSpeed(m,0,1,1)*3.6,0),
  rollPeak_degs:r(F.rollPeak(m)/F.DEG,0),rollAt70pct_degs:r(F.rollRate(m,.7*v1000)/F.DEG,0),
  circle45pct:fullCircle(m,.45*v1000,1000,F.GAME.manoeuvreGain),circle70pct:fullCircle(m,.70*v1000,1000,F.GAME.manoeuvreGain),
  loop:loop(m,Math.max(1.4*F.aeroEntry(m)/1.08,.6*v1000),F.GAME.manoeuvreGain),aeroGate_ms:r(F.aeroEntry(m),1),
  idleDecel75pct:r(-F.levelAcceleration(m,.75*v1000,1000,{power:0}),2),
  takeoff:takeoff(m,{flaps:['avenger','sbd','corsair','zero'].includes(kind)?.4:.2})};
 // Published take-off distances the solve did not use, as an independent check (game take-off flap 0.5).
 if(src.check?.takeoff){const c=src.check.takeoff,t=takeoff(m,{flaps:.5,massKg:c.mass});
  o.check={figure:c.text,ref:c.ref,published:c.distance+' m',modelGroundRun:t.groundRun+' m',errorPct:r((t.groundRun-c.distance)/c.distance*100,1)};}
 out.types[kind]=o;
}
fs.writeFileSync(path.join(root,'app/release/flight-core-fleet.json'),JSON.stringify(out,null,1)+'\n');
for(const [k,o] of Object.entries(out.types)){
 console.log(k.padEnd(8),JSON.stringify(o.solved));if(o.check)console.log('    check',JSON.stringify(o.check));
 for(const v of o.verification)console.log('   ',v.figure.padEnd(36),v.published.padStart(12),v.model.padStart(12),(v.errorPct+'%').padStart(8));
 console.log('    game',JSON.stringify(o.game));
}
