/* Build 235: REALISTIC stick-free bank. Header (harness) copied from pitch-response.cjs.
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

/* ---- Build 235: a released stick holds the bank in REALISTIC ---- */
const DEG=Math.PI/180,G=9.80665,H=FlightControl.HOLD;
assert(H&&H.end>H.full&&H.protect>H.end,'bank hold constants are exported');
function fresh2(kind,spd){const pacific=!defs[kind],d=pacific?null:defs[kind];
 const p={ac:kind,pos:{x:0,y:1500,z:0},hull:d?.hull||100,spd,gear:0,flap:0,fuel:50,bombs:0,torps:0,rockets:0,rollBias:0,pitch:0,roll:0,pitchVel:0,rollVel:0,heading:0,nLoad:1,throttle:1,groundPower:1};
 SortieFeatures.Handling.configure(p,kind,'bomb',pacific?'pacific':'europe');SortieFeatures.Damage.reset(p,p.hull);return p;}
const kinds=[...Object.keys(defs),'avenger','sbd','corsair','zero'];
const run=(p,fps,secs,roll,pitch=0)=>{let peak=0;for(let i=0;i<fps*secs;i++){const r=FlightControl.player(p,1/fps,env(p.ac,p,pitch,false,true,roll));p.pos.y+=r.climb/fps;peak=Math.max(peak,p.coreStall||0);}return peak;};
const rows=[];
for(const kind of kinds)for(const fps of [20,60,120]){
 // 1) roll to ~45 deg, release: the bank stays, the turn is steady (coordinated: omega = g tan(bank) / V), no stall
 const p=fresh2(kind,110);const vs=FlightControl.stallSpeed(p,env(kind,p,0,false,true));p.spd=Math.max(110,1.6*vs);
 let t=0;for(;t<6&&Math.abs(p.roll)<45*DEG;t+=1/fps)run(p,fps,1/fps,.6);
 assert(t<2,kind+' still rolls to 45 deg with the stick: '+t);
 const bank=p.roll;run(p,fps,10,0);
 assert(Math.abs(p.roll-bank)<1.5*DEG,kind+' @'+fps+' FPS: released stick holds the bank '+(bank/DEG).toFixed(1)+' -> '+(p.roll/DEG).toFixed(1));
 const h0=p.heading,y0=p.pos.y,v0=p.spd;const peak=run(p,fps,6,0);const rate=Math.abs(p.heading-h0)/6,expect=FlightCore.GAME.manoeuvreGain*G*Math.tan(Math.abs(p.roll))/((p.spd+v0)/2);   // the game turns the path manoeuvreGain x faster than physics (FLIGHT-CORE.md)
 assert(rate>.6*expect&&rate<1.4*expect,kind+' @'+fps+' FPS: steady turn rate '+(rate/DEG).toFixed(1)+' deg/s vs the coordinated turn of the game '+(expect/DEG).toFixed(1));
 assert(peak<.05,kind+' @'+fps+' FPS: a held turn does not stall '+peak);
 assert(Math.abs(p.pos.y-y0)<120,kind+' @'+fps+' FPS: the path hold keeps the altitude in a held turn: '+(p.pos.y-y0).toFixed(0)+' m');
 // 2) a small residual bank is trimmed out, a larger one is kept
 const small=fresh2(kind,110);small.spd=Math.max(110,1.6*vs);small.roll=6*DEG;run(small,fps,4,0);assert(Math.abs(small.roll)<.6*DEG,kind+' @'+fps+' FPS: 6 deg is trimmed out: '+(small.roll/DEG).toFixed(2));
 const mid=fresh2(kind,110);mid.spd=Math.max(110,1.6*vs);mid.roll=15*DEG;run(mid,fps,6,0);assert(Math.abs(mid.roll-15*DEG)<.8*DEG,kind+' @'+fps+' FPS: 15 deg is held: '+(mid.roll/DEG).toFixed(2));
 // 3) a steep bank is eased back toward the protection angle and does not sit in a spiral
 const steep=fresh2(kind,110);steep.spd=Math.max(110,1.8*vs);steep.roll=80*DEG;const steepPeak=run(steep,fps,8,0);
 // The protection stops at 62 deg; below that the core's own kinematics (a falling nose in a bank changes the bank) may take it further, so the claim is: eased back, not snapped level, not stalled, no steep spiral.
 assert(steep.roll<68*DEG&&steep.roll>30*DEG,kind+' @'+fps+' FPS: 80 deg eases back, not to level: '+(steep.roll/DEG).toFixed(1));
 assert(steepPeak<.05&&steep.pitch>-30*DEG&&steep.nLoad<3,kind+' @'+fps+' FPS: the eased-back bank is no spiral: stall '+steepPeak+' pitch '+(steep.pitch/DEG).toFixed(1)+' n '+steep.nLoad);
 // 4) the bank is not held against a damage bias: a bias inside the trim band is the trim target
 const biased=fresh2(kind,110);biased.spd=Math.max(110,1.6*vs);biased.rollBias=.08;run(biased,fps,6,0);assert(Math.abs(biased.roll-.08)<.01,kind+' @'+fps+' FPS: damage bias is the trim target '+biased.roll);
 // 5) rolling back with the stick still works (hold does not make the aircraft sticky)
 const back=fresh2(kind,110);back.spd=Math.max(110,1.6*vs);back.roll=45*DEG;let tb=0;for(;tb<4&&Math.abs(back.roll)>3*DEG;tb+=1/fps)run(back,fps,1/fps,-.6);assert(tb<2,kind+' rolls back to near level with opposite stick: '+tb);
 rows.push({kind,fps,bank:+(bank/DEG).toFixed(1),drift:+((p.roll-bank)/DEG).toFixed(2),rate:+(rate/DEG).toFixed(1),ratio:rate/expect,expect:+(expect/DEG).toFixed(1),steep:+(steep.roll/DEG).toFixed(1)});
}
// the bank at release differs a little between frame rates (a fast roller overshoots 45 deg by one frame's roll), so compare the turn rate to the coordinated turn of ITS bank
for(const kind of kinds){const a=rows.filter(r=>r.kind===kind).map(r=>r.ratio);assert(Math.max(...a)-Math.min(...a)<.08,kind+' turn rate follows the bank the same way at 20/60/120 FPS: '+a.map(v=>v.toFixed(3)));}
console.log('REALISTIC bank hold (stick released at 45 deg, 10 s, 60 FPS): bank drift deg per type',JSON.stringify(rows.filter(r=>r.fps===60).map(r=>[r.kind,r.drift])));
console.log('steady turn rate vs coordinated (deg/s):',JSON.stringify(rows.filter(r=>r.fps===60).map(r=>[r.kind,r.rate,r.expect])));
console.log('Realistic bank hold: held bank, steady coordinated turn, trim below 9 deg, protection above 62 deg, bias, FPS-consistent, all '+kinds.length+' types.');
