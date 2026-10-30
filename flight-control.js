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

/* ---- arcade (Normal) law helpers, Build 227 - GAME.arcade in flight-core.js ----
 * The Zero is the turn reference: its full-stick level-turn rate (load limit n, rate ~ sqrt(n^2 - 1) / V, the same
 * speed and height) is what the slower-turning types are pulled towards. Gain and 1/V cancel in the ratio. */
let zeroRef;
function zeroReference(){
 if(zeroRef!==undefined)return zeroRef;
 const m=F.has('zero')?F.model('zero'):null;
 return zeroRef=m?{m,W:F.loadout(m,{fuel:50}).mass*F.G}:null;
}
// Factor on the path-rotation gain (>= 1): how much faster than the physics this type's path may swing for the
// same load so that its turn reaches (reference / own)^turnPull of the way to the Zero's. Load, drag and stall
// are not touched. st: state(); returns 1 where the type already out-turns the Zero.
function arcadeTurnGain(st,A){
 const z=zeroReference();if(!z)return 1;
 const nz=Math.max(A.refLoadFloor,F.loadLimits(z.m,st.V,st.atm.rho,z.W,{}).max),nx=Math.max(A.ownLoadFloor,st.lim.max);
 return clamp(Math.pow(Math.sqrt(nz*nz-1)/Math.sqrt(nx*nx-1),A.turnPull),1,A.turnGainMax);
}
// Thrust surplus after the arcade multiplication (m/s^2): mirrors what FlightCore.step adds.
const arcadeSurplus=(a,A,ratio)=>{
 if(!(a>0))return a;
 const f=clamp((A.slowTo-ratio)/(A.slowTo-1),0,1);
 return a+Math.min(a*(A.power+A.powerSlow*f),A.powerCap+A.powerSlowCap*f);
};

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
 // Arcade = the Normal law (Build 227): faster path, more thrust surplus, speed-protected nose-up, steadier
 // push-over in a bank. REALISTIC (env.aero) and ?arcade=off fly the Build-225 law unchanged.
 const A=F.GAME.arcade,arcade=!env.aero&&env.arcade!==false;
 // Low-speed aileron/elevator effectiveness (the game's existing law; arcade keeps a floor) and the stall's own loss of aileron.
 const slowReal=clamp((P.spd/Math.max(1,st.stall)-.65)/.65,.35,1),slow=arcade?Math.max(slowReal,A.controlFloor):slowReal,stalled=P.coreStall||0;
 const common=slow*(env.hullFactor??1)*inertia*(config.authority??1);
 // Roll: the published roll-rate curve sets both the AERO roll rate and the Normal spring's frequency
 // (its full-stick step peaks at that rate; amplitude = the game's full-stick bank, rollLim x rollFrac).
 const rollNow=F.rollRate(m,st.eas)*controls.roll*(1-.65*stalled);
 const rollRate=rollNow/(springPeak(zeta)*d.rollLim*(env.rollFrac||.86))*common;
 const pitchRate=(env.pitchBase||2.9)*(d.pitchAuth||1)*hs.authority*controls.pitch*common;
 const bias=(P.rollBias||0)+(controls.bias||0);
 const stickRoll=env.stickRoll||0,stickPitch=env.stickPitch||0;
 // Normal-mode pull-up assist (game decision C, FLIGHT-CORE.md): while the stick is pulled back, the path is
 // turned up to (1 + env.pullAssist) x faster the closer the speed is to the stall (full at the stall speed,
 // gone at 1.7 x). The wing still gives no more lift than CLmax - only the arcade manoeuvre gain grows, so a
 // slow aircraft answers the stick instead of mushing. Level turns (no back stick) are untouched.
 let gain=env.aero?o.gain:o.gain*(1+(env.pullAssist||0)*clamp(stickPitch/.4,0,1)*clamp((1.7-P.spd/Math.max(1,st.stall))/.7,0,1));
 if(arcade)gain*=arcadeTurnGain(st,A);
 const tau=F.pathLag(m,P.spd,P.pos.y,st.lo.ratio)/gain;
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
  command=(s,V,l)=>{
   // Build 229: the automatic path hold asks 1/cos(bank) g in a bank. When the wing has less than that (heavy, take-off
   // flap, 125 kt) it must not stall the wing by itself: a real aircraft with the stick left alone sinks and tightens
   // the turn. So the hold is limited to what the wing gives, but never below the one g along the path - below the
   // stall speed even that is too much and the wing still stalls, as before.
   const raw=Math.max(l.min,F.holdLoad(s.pitch,s.roll,0,.5));
   const hold=raw>l.max?Math.max(l.max,Math.min(raw,Math.cos(s.pitch))):raw;
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
  // Arcade (Build 228): no departure envelope. It held every type to ~6-10 deg for the first half minute after
  // take-off; the speed protection below already keeps the climb off the stall, so the stick may ask for what
  // the thrust (and the speed in hand) can carry. REALISTIC and ?arcade=off keep the envelope.
  if(departure.release<1&&!arcade){
   const initial=Math.asin(Math.min(.6,departure.rate/Math.max(1,P.spd)));
   noseUp=Math.min(noseUp,initial+(noseUp-initial)*departure.release);
   const level=F.levelAcceleration(m,P.spd,P.pos.y,{...o,power:o.throttle});
   const sustainable=Math.asin(Math.max(.10,Math.min(.35,((arcade?arcadeSurplus(level,A,P.spd/Math.max(1,st.stall)):level)-.8)/F.G)));
   noseUp=Math.min(noseUp,sustainable+(noseUp-sustainable)*departure.release);
  }
  if(arcade){
   // Speed protection: the nose-up angle the stick may ask for is what the thrust surplus sustains plus the speed
   // above climbFloor x stall converted to height over climbHorizon seconds. Held fully back, the aircraft settles
   // into the steepest climb it can keep instead of stalling, dropping the nose and pulling up again.
   const surplus=arcadeSurplus(F.levelAcceleration(m,P.spd,P.pos.y,{...o,power:o.throttle}),A,P.spd/Math.max(1,st.stall));
   const share=clamp(surplus/F.G+(P.spd-A.climbFloor*st.stall)/(F.G*A.climbHorizon),0,1);
   // climbMin is the flare's minimum; it fades out below the stall speed so a slow aircraft can lower the nose.
   const floor=A.climbMin*clamp((P.spd/Math.max(1,st.stall)-.92)/.18,0,1);
   noseUp=Math.min(noseUp,Math.max(floor,Math.asin(share)));
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
  // Pushing over is bounded the same way (Build 225): the nose-down rate of a fast forward stick asked for
  // far more negative load than the wing's inverted CLmax gives, so every push-over stalled at once.
  // Arcade (Build 227): stick forward in a bank. The load for the nose-down rate is divided by cos(bank), so in a
  // steep turn even a light push asked for negative g and the turn reversed within half a second. Instead the push
  // unloads the wing like REALISTIC does - in proportion to the stick, to zero load at 1/unload of the stick, never
  // below - and the wings-level push-over (bank under pushBankLo) keeps the full negative load.
  const unloadStick=arcade?clamp(-stickPitch,0,1):0;
  command=(s,V,l)=>{let rate=refVel+(ref-s.pitch)/tau;
   if(s.pitch>d.pitchLim)rate=Math.min(rate,0);if(s.pitch<-d.pitchLim)rate=Math.max(rate,0);
   let n=F.holdLoad(s.pitch,s.roll,V*rate/(F.G*gain));
   if(unloadStick>0){
    const c=Math.cos(s.roll),weight=clamp((Math.abs(s.roll)-A.pushBankLo)/(A.pushBankHi-A.pushBankLo),0,1)*clamp(c/.12,0,1);
    if(weight>0){const hold=F.holdLoad(s.pitch,s.roll,0),floor=Math.min(Math.max(0,hold*(1-A.unload*unloadStick)),.97*l.max);
     n=Math.max(n,l.min+(floor-l.min)*weight);}
   }
   return Math.max(.97*l.min,Math.min(n,Math.max(.97*l.max,Math.cos(s.pitch))));};
 }
 const conv=env.convention||'rhine',h0=toCore(P.heading,conv);
 const s={spd:P.spd,pitch:P.pitch,heading:h0,roll:P.roll,nLoad:P.nLoad||1,power:P.groundPower??P.throttle,altitude:P.pos.y,
  stall:P.coreStall||0,dropDir:P.coreDrop||0};
 const pitch0=P.pitch,y0=P.pos.y;
 // Elevator damage already slows the Normal attitude law (pitchRate); in AERO it caps the pull.
 const out=F.step(m,s,dt,{...o,elevator:env.aero?o.elevator:1,command,gain,
  surplusGain:arcade?A.power:0,surplusCap:A.powerCap,
  surplusSlow:arcade?A.powerSlow:0,surplusSlowCap:A.powerSlowCap,surplusSlowTo:A.slowTo,surplusRef:arcade?st.stall:0});
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
 * The aircraft itself is the player's: same FlightCore forces, load limits, roll rates and gain.
 *
 * Two pilot styles share this one law:
 *  - o.vector falsy ("level pilot"): bank for the heading error, hold a path angle - wingmen, bombers, escorts.
 *  - o.vector true ("fighter pilot", Build 224): roll the lift vector onto the aim point, then pull by the
 *    angle still to go. That flies loops, split-S, wing-overs and rolling scissors, which a heading-and-
 *    path-angle pilot cannot. Used by the dogfight brain (dogfight-ai.js).
 * Smoothness options (pilot's hands, not aircraft data): rollAccel (rad/s^2) - how fast the roll rate may
 *   change; bankTau (s) - lag of the bank the pilot asks for; loadRate (g/s) - how fast the pull may change;
 *   powerRate (1/s) - how fast the throttle may move.  Unset = the old instantaneous behaviour. */
function ai(e,dt,aim,wantSpd,o={}){
 // The pilot re-decides at least 60 times a second, so a slow frame rate flies the same path.
 const n=Math.max(1,Math.ceil(dt*60-1e-9));let out=null;
 for(let i=0;i<n;i++)out=aiStep(e,dt/n,aim,wantSpd,o);
 return out;
}
const dot3=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
// Where the aim lies relative to the aircraft: eps = angle between nose and aim, phi = roll that puts the
// lift vector on it (+: roll positive, towards the side vector u x d).
function aimGeometry(s,aim,al){
 const ax=F.axes(s.pitch,s.heading,s.roll),d=ax.d,u=ax.u;
 const a=[aim.x/al,aim.y/al,aim.z/al];
 const side=[u[1]*d[2]-u[2]*d[1],u[2]*d[0]-u[0]*d[2],u[0]*d[1]-u[1]*d[0]];
 const eps=Math.acos(clamp(dot3(a,d),-1,1)),phi=Math.atan2(dot3(a,side),dot3(a,u));
 return {eps,phi,uy:u[1]};
}
function aiStep(e,dt,aim,wantSpd,o){
 const m=F.model(e.kind);if(!m||!(dt>0))return null;
 if(!Number.isFinite(e.spd))e.spd=e.vel?.length?.()||wantSpd;   // entities spawned with only a velocity
 const c=e.core||(e.core={thr:.75,power:.75,n:1,flaps:0});
 const mass=o.massKg??F.loadout(m,e.loadout||{fuel:70}).mass,W=mass*F.G,gain=o.gain??F.GAME.manoeuvreGain;
 const atm=F.atmosphere(e.pos.y),V=Math.max(10,e.spd),eas=V*Math.sqrt(atm.rho/1.225);
 // A pilot lowers flaps when asked to fly slower than the clean wing allows (formation on a slow leader);
 // he sets them for the speed he is flying on average (8 s), not for every throttle correction.
 const vsClean=F.stallSpeed(m,e.pos.y,mass/m.mass,0);
 c.want=(c.want??wantSpd)+(wantSpd-(c.want??wantSpd))*(1-Math.exp(-dt/8));
 const flapsWanted=o.flaps??(o.vector?0:clamp((1.3*vsClean-c.want)/(.3*vsClean),0,1));
 c.flaps+=(flapsWanted-c.flaps)*Math.min(1,dt*.7);
 const cfg={flaps:c.flaps,gear:o.gear||0,brakes:o.brakes||0};
 const lim=F.loadLimits(m,V,atm.rho,W,cfg),margin=o.margin??.92;
 let al=Math.hypot(aim.x,aim.y,aim.z)||1;const aimH=Math.atan2(aim.x,aim.z),aimP=Math.asin(clamp(aim.y/al,-1,1));
 const pMax=Math.min(o.maxRollRate??Infinity,F.rollRate(m,eas)*(o.rollShare??.8));
 let rollCmd,command;
 if(o.vector){
  // Roll the lift vector onto the aim (rate proportional to the angle, fading out when the aim is on the
  // nose), then pull for the angle still to go. A target below the belly and close to the nose is pushed
  // over to instead of rolled onto.
  // The aim the pilot actually follows is the wanted aim eased in over aimTau seconds: a decision that jumps
  // (a new look at the target, a new manoeuvre) becomes a smooth swing of the nose, not a twitch of the stick.
  if(o.aimTau){
   const k=1-Math.exp(-dt/o.aimTau),prev=c.aim||(c.aim={x:aim.x/al,y:aim.y/al,z:aim.z/al});
   prev.x+=(aim.x/al-prev.x)*k;prev.y+=(aim.y/al-prev.y)*k;prev.z+=(aim.z/al-prev.z)*k;
   const pl=Math.hypot(prev.x,prev.y,prev.z)||1;prev.x/=pl;prev.y/=pl;prev.z/=pl;aim=prev;
  }
  const g0=aimGeometry(e,aim,al=1),push=Math.abs(g0.phi)>2.2&&g0.eps<(o.pushBelow??.3);
  const authority=clamp(g0.eps/(o.rollDeadband??.07),0,1);
  rollCmd=push?0:clamp(g0.phi*(o.rollGain??4)*authority,-pMax,pMax);
  const pullGain=o.pullGain??2.4,wMax=o.maxTurnRate??Infinity;
  command=(s,Vs,l)=>{
   const g=aimGeometry(s,aim,al),w=Math.min(wMax,g.eps*pullGain);
   const along=push?Math.cos(g.phi)*.6:Math.max(0,Math.cos(g.phi));
   const n=g.uy+Vs*w*along/(F.G*gain);
   return clamp(n,l.min*margin,l.max*margin);
  };
 }else{
  const dh=wrap(aimH-e.heading);
  // Bank for the turn the heading error asks for, inside what the wing holds level with a margin.
  const nUse=Math.max(1.0001,lim.max*margin),bankMax=Math.min(o.maxBank??1.35,Math.acos(1/nUse));
  const yawMax=o.maxYaw??Infinity,turn=clamp(dh*(o.turnGain??1.6),-yawMax,yawMax);
  let wantBank=clamp(Math.atan(turn*V/(gain*F.G)),-bankMax,bankMax);
  if(o.bankTau){c.bank=(c.bank??e.roll)+(wantBank-(c.bank??e.roll))*(1-Math.exp(-dt/o.bankTau));wantBank=c.bank;}
  rollCmd=clamp((wantBank-e.roll)*3,-pMax,pMax);
  // Path angle error -> extra load, inside the wing (and inside a pitch-rate limit when flying formation).
  let pathRate=(aimP-e.pitch)*(o.pitchGain??1.2);
  if(o.maxPitchRate!=null)pathRate=clamp(pathRate,-o.maxPitchRate,o.maxPitchRate);
  let extra=clamp(V*pathRate/(F.G*gain),-1.5,1.5);
  if(o.loadRate){c.extra=(c.extra??0)+clamp(extra-(c.extra??0),-o.loadRate*dt,o.loadRate*dt);extra=c.extra;}
  command=(s,Vs,l)=>clamp(F.holdLoad(s.pitch,s.roll,extra),l.min*margin,l.max*margin);
 }
 // The roll rate itself changes smoothly when the pilot asks for that (hands, not a switch).
 if(o.rollAccel){c.p=(c.p??0)+clamp(rollCmd-(c.p??0),-o.rollAccel*dt,o.rollAccel*dt);}else c.p=rollCmd;
 e.roll=o.vector?wrap(e.roll+c.p*dt):clamp(e.roll+c.p*dt,-Math.PI*.95,Math.PI*.95);
 // Throttle: proportional-integral on airspeed, as a pilot flies a speed.
 const err=wantSpd-V;
 c.thr=clamp(c.thr+err*(o.ki??.05)*dt,0,1);
 let throttle=o.power??clamp(c.thr+err*(o.kp??.09),0,1);
 if(o.powerRate&&o.power==null){c.lever=c.lever??throttle;c.lever+=clamp(throttle-c.lever,-o.powerRate*dt,o.powerRate*dt);throttle=c.lever;}
 const s={spd:e.spd,pitch:e.pitch,heading:e.heading,roll:e.roll,nLoad:c.n,power:c.power,altitude:e.pos.y,stall:e.coreStall||0,dropDir:e.coreDrop||0};
 const out=F.step(m,s,dt,{throttle,massKg:mass,gain,command,substepHz:o.substepHz||60,stallModel:o.vector?true:false,...cfg});
 e.spd=s.spd;e.pitch=s.pitch;e.heading=s.heading;e.roll=s.roll;c.power=s.power;c.n=s.nLoad;
 if(o.vector){e.coreStall=s.stall;e.coreDrop=s.dropDir;}
 const cp=Math.cos(e.pitch);
 e.vel.set(Math.sin(e.heading)*cp*e.spd,Math.sin(e.pitch)*e.spd,Math.cos(e.heading)*cp*e.spd);
 e.pos.addScaledVector(e.vel,dt);
 return out;
}
// Roll rate (rad/s) an AI pilot of this aircraft can really use right now (what ai() clamps to).
function rollNow(e,share=.8){
 const m=F.model(e.kind);if(!m)return 1.5;
 const eas=Math.max(10,e.spd)*Math.sqrt(F.atmosphere(e.pos.y).rho/1.225);return F.rollRate(m,eas)*share;
}
// The kind of AI an entity flies as: its own type if the core knows it.
function aiKind(kind,fallback){return F&&F.has(kind)?kind:fallback;}

const api={player,stickForBank,stallSpeed,aeroGate,ai,aiKind,rollNow,bankFor,springPeak,toCore};
root.FlightControl=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
