/* FlightControl: the stick laws that fly FlightCore - one for the player, one for every AI pilot.
 *
 * Both games call the same player law (only their own declared constants differ: pitch spring base,
 * pitch target scale and heading convention), and every AI aircraft - enemies, wingmen, escorts and
 * bombers - is flown by the AI law through the same computed forces as the player. Nothing here is a
 * per-type number: aircraft differences come from flight-core.js, the stick laws are game choices
 * documented in FLIGHT-CORE.md.
 *
 * Heading conventions: the Rhine game and every AI use x = sin(h), z = cos(h) (the core's own);
 * the Pacific player uses x = cos(h), z = sin(h)  ->  h_core = pi/2 - h_pacific.
 */
(function(root){
'use strict';
const F=root.FlightCore||(typeof require==='function'?require('./flight-core.js'):null);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const toCore=(h,convention)=>convention==='pacific'?Math.PI/2-h:h;

// A damped spring (natural frequency w, damping z) stepped to target x peaks at springPeak(z) * w * x in rate.
function springPeak(z){const s=Math.sqrt(1-z*z);return Math.exp(-z*Math.atan2(s,z)/s);}

// Normal-mode stick -> bank of a level turn whose turn rate is that share of the most the wing can hold
// (tan(bank) = share * sqrt(nMax^2 - 1)): precise around the centre, full stick = the tightest level turn
// at this speed; never less than share x 30 deg so a slow aircraft can still bank.
function bankFor(stick,nMax,rollLim){
 const a=Math.min(1,Math.abs(stick)),bank=Math.max(Math.atan(a*Math.sqrt(Math.max(0,nMax*nMax-1))),a*Math.PI/6);
 return Math.sign(stick)*Math.min(rollLim*.95,bank);
}

// Everything the player law needs about the aircraft as loaded right now.
function state(P,env){
 const m=F.model(env.kind),lo=F.loadout(m,env.loadout||{}),controls=env.controls;
 const flaps=controls.flaps.mean,vs0=F.stallSpeed(m,0,lo.ratio,flaps);
 const clFactor=(vs0/(vs0+(controls.stallPenalty||0)))**2;
 const o={throttle:env.throttle,damage:env.damage??1,massKg:lo.mass,gear:P.gear||0,flaps,tank:lo.tank,storeArea:lo.storeArea,
  brakes:env.brakes||0,clFactor,elevator:controls.pitch,extraDrag:(controls.drag||0)*.15,gain:env.gain??F.GAME.manoeuvreGain};
 const atm=F.atmosphere(P.pos.y),V=Math.max(1,P.spd),W=lo.mass*F.G;
 const lim=F.loadLimits(m,V,atm.rho,W,o),stall=F.stallSpeed(m,P.pos.y,lo.ratio,flaps,clFactor);
 return {m,lo,o,atm,V,lim,stall,eas:V*Math.sqrt(atm.rho/1.225),hs:F.highSpeed(m,V,P.pos.y)};
}

/* ---- the player ----
 * env: {kind, convention, stickRoll (already x steer sign), stickPitch, aero, throttle, damage, brakes, gain,
 *       controls (SortieFeatures.Damage.controls), configuration (Handling.configuration), departure,
 *       loadout (FlightCore.loadout input), hullFactor, d:{rollLim, pitchLim, pitchAuth, controlDamping,
 *       stickExponent}, rollFrac, pitchBase, pitchScale}
 * Updates P (spd, heading, pitch, roll, nLoad, groundPower, rollVel, pitchVel, core*) and returns
 * {climb, out, stall, m}. */
function player(P,dt,env){
 const st=state(P,env),{m,o,lim,hs}=st,d=env.d,controls=env.controls,config=env.configuration||{authority:1};
 const zeta=d.controlDamping||.80,inertia=Math.pow(1/st.lo.ratio,.35);
 // Low-speed aileron/elevator effectiveness (the game's existing law) and the stall's own loss of aileron.
 const slow=clamp((P.spd/Math.max(1,st.stall)-.65)/.65,.35,1),stalled=P.coreStall||0;
 const common=slow*(env.hullFactor??1)*inertia*(config.authority??1);
 // Roll: the published roll-rate curve sets both the AERO roll rate and the Normal spring's frequency
 // (its full-stick step peaks at that rate; amplitude = the game's full-stick bank, rollLim x rollFrac).
 const rollNow=F.rollRate(m,st.eas)*controls.roll*(1-.65*stalled);
 const rollRate=rollNow/(springPeak(zeta)*d.rollLim*(env.rollFrac||.86))*common;
 const pitchRate=(env.pitchBase||2.9)*(d.pitchAuth||1)*hs.authority*controls.pitch*common;
 const bias=(P.rollBias||0)+(controls.bias||0);
 const tau=F.pathLag(m,P.spd,P.pos.y,st.lo.ratio)/o.gain;
 const stickRoll=env.stickRoll||0,stickPitch=env.stickPitch||0;
 const shaped=v=>d.stickExponent?Math.sign(v)*Math.pow(Math.abs(v),d.stickExponent):v;
 let command;
 if(env.aero){
  const bankErr=wrap(P.roll-bias),authority=rollNow*inertia*(env.hullFactor??1)*slow;
  P.rollVel=(Math.abs(stickRoll)>.075||Math.abs(stickPitch)>.075)?stickRoll*authority:
   clamp(-bankErr*.9*Math.max(.6,slow),-authority,authority);
  P.roll=wrap(P.roll+P.rollVel*dt);
  // Pull is a load factor: neutral holds the path, full stick is the most the wing gives at this speed
  // (the buffet boundary, so a loop is flown on the edge of the stall). The wing stalls when the path
  // alone asks more than it has - too slow - and stays stalled until speed returns.
  const pull=stickPitch;P.pitchRef=null;
  command=(s,V,l)=>{const hold=Math.max(l.min,F.holdLoad(s.pitch,s.roll,0,.5));
   return pull>=0?Math.max(hold,hold+pull*(l.max-hold)):hold+pull*(hold-l.min);};
 }else{
  const rollTarget=bankFor(stickRoll,lim.max,d.rollLim)+bias,neutral=Math.abs(stickRoll)<.001;
  const levelRate=neutral?Math.max(3.5,rollRate*.7):rollRate,damping=neutral?1:zeta;
  for(let i=0,n=Math.max(1,Math.ceil(dt*F.GAME.substepHz)),h=dt/n;i<n;i++){
   P.rollVel=(P.rollVel||0)+(levelRate*levelRate*(rollTarget-P.roll)-2*damping*levelRate*(P.rollVel||0))*h;
   P.roll+=P.rollVel*h;
  }
  if(neutral&&Math.abs(P.roll-bias)<.002&&Math.abs(P.rollVel)<.01){P.roll=bias;P.rollVel=0;}
  if(P.roll>d.rollLim){P.roll=d.rollLim;P.rollVel=Math.min(0,P.rollVel);}
  if(P.roll<-d.rollLim){P.roll=-d.rollLim;P.rollVel=Math.max(0,P.rollVel);}
  // Pitch: flight-path attitude command with the game's departure envelope; while it is open the
  // nose-up limit also leaves power for accelerating (from the computed forces, every type alike).
  const scale=env.pitchScale??d.pitchLim*.92,departure=env.departure||{release:1,rate:Infinity};
  let noseUp=scale;
  if(departure.release<1){
   const initial=Math.asin(Math.min(.6,departure.rate/Math.max(1,P.spd)));
   noseUp=Math.min(noseUp,initial+(noseUp-initial)*departure.release);
   const level=F.levelAcceleration(m,P.spd,P.pos.y,{...o,power:o.throttle});
   const sustainable=Math.asin(Math.max(.10,Math.min(.35,(level-.8)/F.G)));
   noseUp=Math.min(noseUp,sustainable+(noseUp-sustainable)*departure.release);
  }
  const cmd=shaped(stickPitch),target=cmd>0?Math.min(cmd*scale,noseUp):cmd*scale;
  if(!Number.isFinite(P.pitchRef)||P.corePitch!==P.pitch){P.pitchRef=P.pitch;P.pitchRefVel=0;}
  for(let i=0,n=Math.max(1,Math.ceil(dt*F.GAME.substepHz)),h=dt/n;i<n;i++){
   P.pitchRefVel+=(pitchRate*pitchRate*(target-P.pitchRef)-2*zeta*pitchRate*P.pitchRefVel)*h;
   P.pitchRef+=P.pitchRefVel*h;
  }
  P.pitchRef=clamp(P.pitchRef,P.pitch-.3,P.pitch+.3);
  const ref=P.pitchRef,refVel=P.pitchRefVel;
  // The assisted law never asks more of the wing than it has (a turn too steep for the speed sinks
  // instead), except the 1 g of wings-level flight: flown slower than that, the wing stalls all the same.
  command=(s,V,l)=>{let rate=refVel+(ref-s.pitch)/tau;
   if(s.pitch>d.pitchLim)rate=Math.min(rate,0);if(s.pitch<-d.pitchLim)rate=Math.max(rate,0);
   const n=F.holdLoad(s.pitch,s.roll,V*rate/(F.G*o.gain));
   return Math.min(n,Math.max(.97*l.max,Math.cos(s.pitch)));};
 }
 const conv=env.convention||'rhine',h0=toCore(P.heading,conv);
 const s={spd:P.spd,pitch:P.pitch,heading:h0,roll:P.roll,nLoad:P.nLoad||1,power:P.groundPower??P.throttle,altitude:P.pos.y,
  stall:P.coreStall||0,dropDir:P.coreDrop||0};
 const pitch0=P.pitch,y0=P.pos.y;
 // Elevator damage already slows the Normal attitude law (pitchRate); in AERO it caps the pull.
 const out=F.step(m,s,dt,{...o,elevator:env.aero?o.elevator:1,command});
 P.spd=s.spd;P.heading=P.heading+(conv==='pacific'?-(s.heading-h0):(s.heading-h0));P.roll=s.roll;P.nLoad=s.nLoad;P.groundPower=s.power;
 P.pitch=s.pitch;P.pitchVel=dt>0?wrap(P.pitch-pitch0)/dt:0;P.corePitch=P.pitch;
 P.coreStall=s.stall;P.coreDrop=s.dropDir;P.core=out;P.coreMass=st.lo.mass;
 const climb=dt>0?(s.altitude-y0)/dt:0;P.vSpeed=climb;
 return {climb,out,stall:st.stall,m};
}
// Stick that holds a given Normal-mode bank right now (e.g. to counter damage); inverse of bankFor.
function stickForBank(P,env,bank){
 const st=state(P,env);let lo=0,hi=1;
 for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(Math.abs(bankFor(mid,st.lim.max,env.d.rollLim))<Math.abs(bank))lo=mid;else hi=mid;}
 return Math.sign(bank)*(lo+hi)/2;
}
// Stall speed (TAS) of the player as loaded, for the HUD and warnings.
function stallSpeed(P,env){return state(P,env).stall;}
// AERO gate: the lowest entry speed whose full-pull loop stays above the 1-g stall, never below 1.5 x stall.
function aeroGate(kind,gain){const m=F.model(kind);return Math.max(1.5*F.stallSpeed(m,0),F.aeroEntry(m,gain));}

/* ---- AI pilots ----
 * e: {kind, pos, vel, spd, heading (x = sin h), pitch, roll, loadout?}  aim: direction to fly (any length)
 * wantSpd: true airspeed the pilot wants.  o: {maxBank, margin, turnGain, pitchGain, maxRollRate, maxYaw,
 *   maxPitchRate, flaps, gear, brakes, gain, substepHz, massKg, power} - all pilot (game) choices.
 * The aircraft itself is the player's: same FlightCore forces, load limits, roll rates and gain. */
function ai(e,dt,aim,wantSpd,o={}){
 const m=F.model(e.kind);if(!m||!(dt>0))return null;
 const c=e.core||(e.core={thr:.75,power:.75,n:1,flaps:0});
 const mass=o.massKg??F.loadout(m,e.loadout||{fuel:70}).mass,W=mass*F.G,gain=o.gain??F.GAME.manoeuvreGain;
 const atm=F.atmosphere(e.pos.y),V=Math.max(10,e.spd),eas=V*Math.sqrt(atm.rho/1.225);
 // A pilot lowers flaps when asked to fly slower than the clean wing allows (formation on a slow leader).
 const vsClean=F.stallSpeed(m,e.pos.y,mass/m.mass,0);
 const flapsWanted=o.flaps??clamp((1.3*vsClean-wantSpd)/(.3*vsClean),0,1);
 c.flaps+=(flapsWanted-c.flaps)*Math.min(1,dt*.7);
 const cfg={flaps:c.flaps,gear:o.gear||0,brakes:o.brakes||0};
 const lim=F.loadLimits(m,V,atm.rho,W,cfg),margin=o.margin??.92;
 const al=Math.hypot(aim.x,aim.y,aim.z)||1,aimH=Math.atan2(aim.x,aim.z),aimP=Math.asin(clamp(aim.y/al,-1,1));
 const dh=wrap(aimH-e.heading);
 // Bank for the turn the heading error asks for, inside what the wing holds level with a margin.
 const nUse=Math.max(1.0001,lim.max*margin),bankMax=Math.min(o.maxBank??1.35,Math.acos(1/nUse));
 const yawMax=o.maxYaw??Infinity,turn=clamp(dh*(o.turnGain??1.6),-yawMax,yawMax);
 const wantBank=clamp(Math.atan(turn*V/(gain*F.G)),-bankMax,bankMax);
 const pMax=Math.min(o.maxRollRate??Infinity,F.rollRate(m,eas)*(o.rollShare??.8));
 const rollRate=clamp((wantBank-e.roll)*3,-pMax,pMax);
 e.roll=clamp(e.roll+rollRate*dt,-Math.PI*.95,Math.PI*.95);
 // Path angle error -> extra load, inside the wing (and inside a pitch-rate limit when flying formation).
 let pathRate=(aimP-e.pitch)*(o.pitchGain??1.2);
 if(o.maxPitchRate!=null)pathRate=clamp(pathRate,-o.maxPitchRate,o.maxPitchRate);
 const extra=clamp(V*pathRate/(F.G*gain),-1.5,1.5);
 const command=(s,Vs,l)=>clamp(F.holdLoad(s.pitch,s.roll,extra),l.min*margin,l.max*margin);
 // Throttle: proportional-integral on airspeed, as a pilot flies a speed.
 const err=wantSpd-V;
 c.thr=clamp(c.thr+err*(o.ki??.05)*dt,0,1);
 const throttle=o.power??clamp(c.thr+err*(o.kp??.09),0,1);
 const s={spd:e.spd,pitch:e.pitch,heading:e.heading,roll:e.roll,nLoad:c.n,power:c.power,altitude:e.pos.y,stall:0,dropDir:0};
 const out=F.step(m,s,dt,{throttle,massKg:mass,gain,command,substepHz:o.substepHz||60,stallModel:false,...cfg});
 e.spd=s.spd;e.pitch=s.pitch;e.heading=s.heading;e.roll=s.roll;c.power=s.power;c.n=s.nLoad;
 const cp=Math.cos(e.pitch);
 e.vel.set(Math.sin(e.heading)*cp*e.spd,Math.sin(e.pitch)*e.spd,Math.cos(e.heading)*cp*e.spd);
 e.pos.addScaledVector(e.vel,dt);
 return out;
}
// The kind of AI an entity flies as: its own type if the core knows it.
function aiKind(kind,fallback){return F&&F.has(kind)?kind:fallback;}

const api={player,stickForBank,stallSpeed,aeroGate,ai,aiKind,bankFor,springPeak,toCore};
root.FlightControl=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
