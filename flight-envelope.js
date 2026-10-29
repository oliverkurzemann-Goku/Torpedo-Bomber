/* Analytic flight envelope for the ten playable aircraft. SI units.
 *
 * Every type-specific number is derived from a data sheet of real aircraft figures (mass, wing
 * area, span, power, propeller size, clean stall, structural load limit, published roll rates).
 * The game then applies a handful of declared arcade gains (ARC below) to the whole fleet alike -
 * never a per-type fudge - so the relative differences between aircraft are the real ones.
 * Provenance, confidence tags and the validation tables: FLIGHT-ENVELOPE.md.
 *
 *   turn   heading rate   = ARC.turn  * g*sqrt(n^2-1)/V         n = min(structure, lift at V) * bank fraction
 *   roll   peak roll rate = arcade(p_real(V))                    p_real: helix-limited rise, stick-force fall-off
 *   pitch  pitch rate cap = ARC.pitch * g*(n - cos(pitch))/V     n = min(structure, lift at V)
 *   idle   windmilling propeller drag = 1/2 rho V^2 * A_disc * C_wm / m   (closed throttle only)
 *   energy induced drag follows the load factor really flown (n^2), scaled by wing loading
 */
(function(root){
'use strict';
const G=9.81,RHO=1.225,DEG=Math.PI/180;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

/* Confidence tags: A = published specification (several agreeing sources); B = single secondary or
 * test-derived figure; C = assumed class value (no figure found, documented in FLIGHT-ENVELOPE.md). */
const SHEETS={
 p47:{name:'P-47D-28 Thunderbolt',m:5775,S:27.87,b:12.42,kW:1939,propD:3.99,vs:51.86,nLimit:7.0,
  roll:{peak:95,at:130,fall:.8},pitchClass:1,tag:{m:'A',S:'A',kW:'A',vs:'A',nLimit:'C',roll:'B'}},
 bf109:{name:'Bf 109F-2',m:2890,S:16.1,b:9.92,kW:750,propD:3.0,vs:45,nLimit:6.5,
  roll:{peak:100,at:95,fall:1.7},pitchClass:1,tag:{m:'A',S:'A',kW:'A',vs:'B',nLimit:'C',roll:'B'}},
 fw190:{name:'Fw 190A-8',m:4270,S:18.3,b:10.5,kW:1273,propD:3.3,clmax:1.4,nLimit:6.5,
  roll:{peak:150,at:115,fall:.55},pitchClass:1,tag:{m:'A',S:'A',kW:'A',vs:'C',nLimit:'C',roll:'B'}},
 ju87:{name:'Ju 87B-2 Stuka',m:4250,S:31.9,b:13.8,kW:883,propD:3.3,clmax:1.5,nLimit:6.0,
  roll:{peak:55,at:70,fall:1},pitchClass:.85,tag:{m:'A',S:'A',kW:'A',vs:'C',nLimit:'C',roll:'C'}},
 me262:{name:'Me 262A-1a',m:6473,S:21.7,b:12.65,kW:0,propD:0,clmax:1.4,nLimit:5.5,
  roll:{peak:80,at:120,fall:1.6},pitchClass:.9,tag:{m:'A',S:'A',kW:'A',vs:'C',nLimit:'C',roll:'C'}},
 me163:{name:'Me 163B Komet',m:4110,S:19.6,b:9.3,kW:0,propD:0,clmax:1.1,nLimit:6.0,
  roll:{peak:100,at:120,fall:1.2},pitchClass:1,tag:{m:'B',S:'B',kW:'B',vs:'C',nLimit:'C',roll:'C'}},
 avenger:{name:'TBM-3 Avenger',m:6800,S:45.52,b:16.51,kW:1417,propD:4.01,clmax:1.4,nLimit:4.5,
  roll:{peak:50,at:85,fall:1},pitchClass:.75,tag:{m:'A',S:'A',kW:'A',vs:'C',nLimit:'C',roll:'C'}},
 sbd:{name:'SBD-3 Dauntless',m:4717,S:30.19,b:12.66,kW:746,propD:3.5,clmax:1.4,nLimit:5.5,
  roll:{peak:70,at:85,fall:1},pitchClass:.95,tag:{m:'A',S:'A',kW:'A',vs:'C',nLimit:'C',roll:'C'}},
 corsair:{name:'F4U-1D Corsair',m:5461,S:29.17,b:12.5,kW:1491,propD:4.06,clmax:1.35,nLimit:7.0,
  roll:{peak:100,at:130,fall:.8},pitchClass:1,tag:{m:'A',S:'A',kW:'A',vs:'C',nLimit:'C',roll:'B'}},
 zero:{name:'A6M2 Zero',m:2410,S:22.44,b:12.0,kW:700,propD:2.9,clmax:1.4,nLimit:6.0,
  roll:{peak:115,at:85,fall:1.5},pitchClass:1,tag:{m:'A',S:'A',kW:'A',vs:'C',nLimit:'C',roll:'B'}}
};

/* The only arcade knobs. Real physics for every aircraft, then the same scaling for all of them. */
const ARC={
 turn:2.2,        // heading-rate gain over the real lift/structure-limited rate (two-thumb touch control)
 pitch:2.6,       // pitch-rate gain over the real load-factor-limited rate
 pitchFloor:.25,  // rad/s: assisted pitch never drops below this, even near the stall (take-off, trap)
 rollRef:100,     // deg/s reference of the compression below
 rollGain:1.5,    // overall roll gain
 rollGamma:.65,   // 1 = realistic spread of roll rates, 0 = every aircraft rolls the same
 bankSat:55*DEG,  // bank at which the stick commands the full available turn rate
 windmill:.07,    // windmilling propeller drag coefficient, disc-area basis (typical 0.05 - 0.2)
 inducedBleed:.30 // induced-drag growth with load factor (n^2) that reaches the energy model, per 190 kg/m2 wing loading
};

function derive(kind){
 const s=SHEETS[kind];
 const wl=s.m/s.S,ar=s.b*s.b/s.S;
 const clmax=s.clmax||2*s.m*G/(RHO*s.S*s.vs*s.vs);
 const vs=s.vs||Math.sqrt(2*s.m*G/(RHO*s.S*clmax));
 const corner=vs*Math.sqrt(s.nLimit);
 return Object.freeze({kind,name:s.name,m:s.m,S:s.S,b:s.b,wl,ar,clmax,vs,corner,nLimit:s.nLimit,
  discArea:s.propD?Math.PI*(s.propD/2)**2:0,roll:s.roll,pitchClass:s.pitchClass});
}
const derived={};for(const kind of Object.keys(SHEETS))derived[kind]=derive(kind);
Object.freeze(derived);
function sheet(kind){return derived[kind]||derived.p47;}

/* ---- lift and load factor ---- */
// Live clean stall speed of the aircraft as flown: load (sqrt of mass ratio) and damage penalty.
function stallSpeed(kind,ctx={}){return sheet(kind).vs*(ctx.loadSpeed??1)*(1-.155*clamp(ctx.flaps||0,0,1))+(ctx.stallPenalty||0);}
// Load factor the airframe can deliver at speed V: lift-limited below the corner speed, structure above.
function loadLimit(kind,v,ctx={}){
 const d=sheet(kind),vs=stallSpeed(kind,ctx),lift=(v/Math.max(1,vs))**2;
 // Arcade assist: even at the stall the wings can still be banked a little (n never below 1.15).
 return Math.max(1.15,Math.min(d.nLimit*(ctx.gFactor??1),lift));
}

/* ---- turn ---- */
// Fraction of the available turn rate the commanded bank asks for (0 wings level ... 1 at bankSat).
function bankFraction(roll){return clamp(Math.sin(Math.abs(roll))/Math.sin(ARC.bankSat),0,1);}
function turn(kind,roll,v,ctx={}){
 const n=loadLimit(kind,v,ctx),frac=bankFraction(roll);
 // The fraction scales the excess load factor, so a gentle bank is a gentle pull.
 const nUsed=1+(n-1)*frac,rate=ARC.turn*G*Math.sqrt(Math.max(0,nUsed*nUsed-1))/Math.max(30,v);
 return {rate,n:nUsed};
}

/* ---- roll ---- */
// Real roll rate (rad/s) at indicated speed: rises with V while aileron power limits it (constant
// helix angle), falls once stick force / wing twist take over.
function rollRateReal(kind,v){
 const r=sheet(kind).roll,vp=r.at;
 const f=v<vp?Math.pow(v/vp,.8):Math.pow(vp/v,r.fall);
 return Math.max(.15,f)*r.peak*DEG;
}
// Game roll rate: the real figure compressed towards the fleet reference by ARC.rollGamma.
function rollRate(kind,v){
 const real=rollRateReal(kind,v)/DEG;
 return ARC.rollGain*ARC.rollRef*Math.pow(real/ARC.rollRef,ARC.rollGamma)*DEG;
}
function rollPeak(kind){const r=sheet(kind).roll;return rollRate(kind,r.at);}

/* ---- pitch ---- */
function pitchRateLimit(kind,v,pitch,ctx={}){
 const n=loadLimit(kind,v,ctx);
 return Math.max(ARC.pitchFloor,ARC.pitch*G*Math.max(.3,n-Math.cos(pitch||0))/Math.max(30,v));
}

/* ---- load factor really flown (feeds the energy model) ---- */
// The arcade gains scale rates, not the force on the airframe: undo the pitch gain to get the load
// factor a real pilot would have needed for the commanded pitch rate.
function flownLoad(kind,turnN,pitch,pitchVel,v){
 const pull=Math.cos(pitch||0)+Math.max(0,pitchVel||0)*Math.max(30,v)/(G*ARC.pitch);
 return clamp(Math.max(turnN,pull,1),1,sheet(kind).nLimit);
}

/* ---- drag ---- */
// Windmilling-propeller deceleration (m/s^2) with the throttle closed; fades out by about 30 % power.
function idleDrag(kind,v,throttle,massRatio=1){
 const d=sheet(kind);
 if(!d.discArea)return 0;
 const closed=1-smooth(0,.30,throttle||0);
 return .5*RHO*v*v*d.discArea*ARC.windmill/(d.m*Math.max(.5,massRatio))*closed;
}
// Multiplier on the energy model's induced-drag term for the load factor really flown.
function inducedFactor(kind,n){
 const wl=sheet(kind).wl/190;
 return 1+ARC.inducedBleed*wl*Math.max(0,n*n-1);
}

/* ---- attitude controllers ---- */
// The assisted stick commands an attitude through a damped spring (natural frequency w, damping z).
// A step of size x then peaks at springPeak(z) * w * x in rate - this inverts that relation so the
// published roll rate and the load-factor-limited pitch rate come out as measured peak rates.
function springPeak(z){const s=Math.sqrt(1-z*z);return Math.exp(-z*Math.atan2(s,z)/s);}
function handling(kind,o={}){
 const d=sheet(kind),zeta=o.zeta||.8,peak=springPeak(zeta);
 const rollAmplitude=(o.rollLim||1.5)*(o.rollFrac||.86);
 const rollAuth=rollPeak(kind)/(peak*rollAmplitude*(o.rollBase||4.8));
 // Pitch response: the reference step (half stick) peaks at about 35 deg/s for a fighter of 190 kg/m2;
 // a lower wing loading shortens the short-period response, a heavy or long aircraft lengthens it.
 const pitchAuth=d.pitchClass*Math.pow(190/d.wl,.25);
 return {rollAuth,pitchAuth,gLim:d.nLimit,stall:d.vs};
}

/* ---- loops ---- */
// Minimum entry speed from which the shipped pull law completes a loop without stalling over the top.
const loopCache={};
function aeroEntry(kind){
 if(loopCache[kind])return loopCache[kind];
 const d=sheet(kind),F=root.FlightDynamics;
 const run=v0=>{
  if(!F)return true;
  const p={ac:kind,spd:v0,throttle:1,groundPower:1,pitch:0,roll:0,gear:0,flap:0,fuel:100,pos:{y:1500},nLoad:1};
  let travelled=0,minV=v0;const h=1/60;
  for(let i=0;i<60*40&&travelled<2*Math.PI;i++){
   const q=Math.min(.95,pitchRateLimit(kind,p.spd,p.pitch));
   const n=flownLoad(kind,1,p.pitch,q,p.spd);
   F.step(p,h,{kind,n,power:1,loadRatio:1});
   p.pitch+=q*h;travelled+=q*h;p.pos.y+=p.spd*Math.sin(p.pitch)*h;minV=Math.min(minV,p.spd);
   if(p.spd<d.vs*.98)return false;
  }
  return travelled>=2*Math.PI;
 };
 let lo=d.vs*1.05,hi=d.vs*5;
 if(!run(hi)){loopCache[kind]=hi;return hi;}
 for(let i=0;i<14;i++){const mid=(lo+hi)/2;if(run(mid))hi=mid;else lo=mid;}
 return loopCache[kind]=hi*1.08;
}

// Gate for entering AERO: the simulated entry speed, but never below 1.5 x the clean stall speed.
function aeroGate(kind){return Math.max(aeroEntry(kind),1.5*sheet(kind).vs);}

const api={SHEETS,ARC,derived,sheet,stallSpeed,loadLimit,bankFraction,turn,rollRateReal,rollRate,rollPeak,
 pitchRateLimit,flownLoad,idleDrag,inducedFactor,springPeak,handling,aeroEntry,aeroGate,G,DEG};
root.FlightEnvelope=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
