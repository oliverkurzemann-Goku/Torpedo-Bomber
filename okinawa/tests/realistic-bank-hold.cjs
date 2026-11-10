/* Build 235/237: REALISTIC stick-free bank (235 held it for ever, 237 eases it back slowly: tau 2.5 s near level .. 8 s from 40 deg). Header (harness) copied from pitch-response.cjs.
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

/* ---- Build 237: a released stick eases the bank back toward level SLOWLY in REALISTIC ---- */
const DEG=Math.PI/180,G=9.80665,H=FlightControl.HOLD;
assert(H&&H.tauFar>H.tauNear&&H.protect>H.far&&H.far>H.near,'bank hold constants are exported');
function fresh2(kind,spd){const pacific=!defs[kind],d=pacific?null:defs[kind];
 const p={ac:kind,pos:{x:0,y:1500,z:0},hull:d?.hull||100,spd,gear:0,flap:0,fuel:50,bombs:0,torps:0,rockets:0,rollBias:0,pitch:0,roll:0,pitchVel:0,rollVel:0,heading:0,nLoad:1,throttle:1,groundPower:1};
 SortieFeatures.Handling.configure(p,kind,'bomb',pacific?'pacific':'europe');SortieFeatures.Damage.reset(p,p.hull);return p;}
const kinds=[...Object.keys(defs),'avenger','sbd','corsair','zero'];
const run=(p,fps,secs,roll,pitch=0)=>{let peak=0;for(let i=0;i<fps*secs;i++){const r=FlightControl.player(p,1/fps,env(p.ac,p,pitch,false,true,roll));p.pos.y+=r.climb/fps;peak=Math.max(peak,p.coreStall||0);}return peak;};
const rows=[];
for(const kind of kinds)for(const fps of [20,60,120]){
 // 1) roll to ~45 deg, release: the bank returns SLOWLY (Build 234 levelled with tau 1.1 s: 45 -> 18 deg after 1 s, 3 deg after 3 s),
 // the turn in between is coordinated (omega = g tan(bank) / V), no stall, the path hold keeps the altitude
 const p=fresh2(kind,110);const vs=FlightControl.stallSpeed(p,env(kind,p,0,false,true));p.spd=Math.max(110,1.6*vs);
 let t=0;for(;t<6&&Math.abs(p.roll)<45*DEG;t+=1/fps)run(p,fps,1/fps,.6);
 assert(t<2,kind+' still rolls to 45 deg with the stick: '+t);
 const bank=p.roll,h0=p.heading,y0=p.pos.y;let expectSum=0,peak=0;
 const at={};for(let i=1;i<=fps*20;i++){const v0=p.spd;peak=Math.max(peak,run(p,fps,1/fps,0));if(i<=fps*3)expectSum+=FlightCore.GAME.manoeuvreGain*G*Math.tan(Math.abs(p.roll))/((p.spd+v0)/2)/fps;
  for(const s of [1,3,8,20])if(i===s*fps)at[s]=p.roll;if(i===fps*3)at.heading=Math.abs(p.heading-h0);if(i===fps*3)at.dy=p.pos.y-y0;}
 assert(Math.abs(at[1])>.75*Math.abs(bank)&&Math.abs(at[1])<.97*Math.abs(bank),kind+' @'+fps+' FPS: after 1 s the bank is eased, not held and not snapped: '+(bank/DEG).toFixed(1)+' -> '+(at[1]/DEG).toFixed(1));
 assert(Math.abs(at[3])>.4*Math.abs(bank)&&Math.abs(at[3])<.85*Math.abs(bank),kind+' @'+fps+' FPS: after 3 s '+(at[3]/DEG).toFixed(1));
 assert(Math.abs(at[8])<.4*Math.abs(bank)&&Math.abs(at[8])>1*DEG,kind+' @'+fps+' FPS: after 8 s mostly back '+(at[8]/DEG).toFixed(1));
 assert(Math.abs(at[20])<1.5*DEG,kind+' @'+fps+' FPS: after 20 s level '+(at[20]/DEG).toFixed(2));
 const rate=at.heading/3,expect=expectSum/3;   // the game turns the path manoeuvreGain x faster than physics (FLIGHT-CORE.md); expected over the same, easing bank
 assert(rate>.6*expect&&rate<1.4*expect,kind+' @'+fps+' FPS: turn rate '+(rate/DEG).toFixed(1)+' deg/s vs the coordinated turn of the game '+(expect/DEG).toFixed(1));
 assert(peak<.05,kind+' @'+fps+' FPS: an easing turn does not stall '+peak);
 assert(Math.abs(at.dy)<120,kind+' @'+fps+' FPS: the path hold keeps the altitude: '+at.dy.toFixed(0)+' m');
 // 2) a small residual bank is trimmed out, a larger one is eased back but still there after 6 s
 const small=fresh2(kind,110);small.spd=Math.max(110,1.6*vs);small.roll=6*DEG;run(small,fps,10,0);assert(Math.abs(small.roll)<.3*DEG,kind+' @'+fps+' FPS: 6 deg is trimmed out: '+(small.roll/DEG).toFixed(2));
 const mid=fresh2(kind,110);mid.spd=Math.max(110,1.6*vs);mid.roll=15*DEG;run(mid,fps,6,0);assert(mid.roll>1.5*DEG&&mid.roll<11*DEG,kind+' @'+fps+' FPS: 15 deg is eased back, not held and not snapped: '+(mid.roll/DEG).toFixed(2));
 // 3) a steep bank is eased back harder toward the protection angle and does not sit in a spiral
 const steep=fresh2(kind,110);steep.spd=Math.max(110,1.8*vs);steep.roll=80*DEG;const steepPeak=run(steep,fps,3,0);
 assert(steep.roll<68*DEG&&steep.roll>30*DEG,kind+' @'+fps+' FPS: 80 deg is eased back to the protection angle, not to level: '+(steep.roll/DEG).toFixed(1));
 assert(steepPeak<.05&&steep.pitch>-30*DEG&&steep.nLoad<3,kind+' @'+fps+' FPS: the eased-back bank is no spiral: stall '+steepPeak+' pitch '+(steep.pitch/DEG).toFixed(1)+' n '+steep.nLoad);
 // 4) the trim target is the damage bias, not zero
 const biased=fresh2(kind,110);biased.spd=Math.max(110,1.6*vs);biased.rollBias=.08;run(biased,fps,12,0);assert(Math.abs(biased.roll-.08)<.01,kind+' @'+fps+' FPS: damage bias is the trim target '+biased.roll);
 // 5) rolling back with the stick still works (hold does not make the aircraft sticky)
 const back=fresh2(kind,110);back.spd=Math.max(110,1.6*vs);back.roll=45*DEG;let tb=0;for(;tb<4&&Math.abs(back.roll)>3*DEG;tb+=1/fps)run(back,fps,1/fps,-.6);assert(tb<2,kind+' rolls back to near level with opposite stick: '+tb);
 rows.push({kind,fps,bank:+(bank/DEG).toFixed(1),after1:+(at[1]/DEG).toFixed(1),after3:+(at[3]/DEG).toFixed(1),after8:+(at[8]/DEG).toFixed(1),rate:+(rate/DEG).toFixed(1),ratio:rate/expect,expect:+(expect/DEG).toFixed(1),steep:+(steep.roll/DEG).toFixed(1)});
}
// the bank at release differs a little between frame rates (a fast roller overshoots 45 deg by one frame's roll), so compare the turn rate to the coordinated turn of ITS bank
for(const kind of kinds){const a=rows.filter(r=>r.kind===kind).map(r=>r.ratio);assert(Math.max(...a)-Math.min(...a)<.08,kind+' turn rate follows the bank the same way at 20/60/120 FPS: '+a.map(v=>v.toFixed(3)));}
console.log('REALISTIC stick-free bank (released at 45 deg, 60 FPS): bank after 1/3/8 s per type',JSON.stringify(rows.filter(r=>r.fps===60).map(r=>[r.kind,r.after1,r.after3,r.after8])));
console.log('steady turn rate vs coordinated (deg/s):',JSON.stringify(rows.filter(r=>r.fps===60).map(r=>[r.kind,r.rate,r.expect])));
console.log('Realistic bank return: slow easing (not held, not snapped), coordinated turn meanwhile, trim near level, protection above 62 deg, bias, FPS-consistent, all '+kinds.length+' types.');
