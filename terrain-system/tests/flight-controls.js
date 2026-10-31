// Real input handlers and attitude/turn/position code: centred stick and wind regression.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');require('../../game-runtime.js');const {GameRuntime}=global;
require('../../sortie-features.js');const {SortieFeatures}=global;require('../../p47-performance');require('../../me262-performance');
require('../../flight-envelope');const {FlightEnvelope}=global;const FlightDynamics=require('../../flight-dynamics');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const eu=read('remagen-mission.html'),pac=read('torpedo-carrier.html');
const rect={left:20,top:300,width:140,height:140};
function inputHandler(html,pacific){
 const listeners={},knob={style:{}},stick={getBoundingClientRect:()=>rect,setPointerCapture(){},
  addEventListener:(event,fn)=>listeners[event]=fn};
 const c=vm.createContext({GameRuntime,P:{},inputRoll:0,inputPitch:0,invertPitch:false,
  beginBailout(){},document:{getElementById:id=>id==='stick'?stick:id==='stickKnob'?knob:{addEventListener(){}}}});
 const a=html.indexOf(pacific?'function setupControls()':'function bindInput()'),b=html.indexOf(pacific?'  // throttle':'  // ---- throttle ----',a);
 assert(a>0&&b>a);vm.runInContext(html.slice(a,b)+'}\n'+(pacific?'setupControls()':'bindInput()'),c);
 return {c,listeners};
}
const handlers=[inputHandler(pac,true),inputHandler(eu,false)];
const event=(x,y,id=1)=>({clientX:rect.left+rect.width/2+x,clientY:rect.top+rect.height/2+y,pointerId:id,preventDefault(){}});
for(const invert of [false,true])for(const [x,y] of [[0,0],[4,2],[35,0],[-35,20],[100,100]]){
 const commands=handlers.map(({c,listeners})=>{c.invertPitch=invert;listeners.pointerdown(event(x,y));const result=[c.inputRoll,c.inputPitch];listeners.pointerup(event(x,y));assert.equal(c.inputRoll,0);assert.equal(c.inputPitch,0);return result;});
 assert.deepEqual(commands[0],commands[1],'equal finger travel must give equal commands in both campaigns');
 if(Math.hypot(x,y)<5)assert.deepEqual(commands[0],[0,0],'small centre jitter must return canonical neutral values');
 if(x===35)assert(Math.abs(commands[0][0])>.2&&Math.abs(commands[0][0])<.4,'half travel must give a gentle partial command');
 assert(Math.hypot(...commands[0])<=1.000001,'diagonal travel stays within full deflection');
}
for(const {c,listeners} of handlers){
 for(const release of ['pointerup','pointercancel','lostpointercapture']){
  listeners.pointerdown(event(55,20));assert(Math.abs(c.inputRoll)>.4);
  listeners.pointerup(event(0,0,2));assert(Math.abs(c.inputRoll)>.4,'another finger must not release the stick');
  listeners[release](event(0,0));assert.equal(c.inputRoll,0);assert.equal(c.inputPitch,0);
 }
}
const defs=vm.runInNewContext(eu.slice(eu.indexOf('const AC={'),eu.indexOf('function acDef('))+'\nAC');
const handling=Object.fromEntries(['zero','corsair','sbd','avenger'].map(kind=>{const h=FlightEnvelope.handling(kind,{rollLim:kind==='zero'?1.52:1.42});return [kind,{roll:h.rollAuth,pitch:h.pitchAuth,name:kind}];}));
function flightParts(html,pacific,kind,aeroMode=false){
 const flight=html.indexOf('function updateFlight(dt)');
 const a=html.indexOf(pacific?'  const dmgF = P.hull<60':'  const dmgF = (P.hull < d.hull',flight);
 const b=html.indexOf(pacific?'  // speed toward throttle target':'  // vertical speed:',a);
 const globals={SortieFeatures,FlightDynamics,P47Performance:require('../../p47-performance'),Me262Performance:require('../../me262-performance'),STALL_SPD:40,MISSIONS:[{corsair:kind==='corsair'}],mission:0,isDefend:()=>kind==='zero',isSBD:()=>kind==='sbd',FlightEnvelope,PAC_HANDLING:handling,windZ:0};
 const attitude=vm.runInNewContext('(function(P,inputRoll,inputPitch,dt,d,stallSpd){const load=SortieFeatures.Handling.sample(P),controls=SortieFeatures.Damage.controls(P),configuration=SortieFeatures.Handling.configuration(P,stallSpd),departure=SortieFeatures.Handling.departure(P,dt,stallSpd),aeroMode='+aeroMode+',steerSign=1;'+html.slice(a,b)+'})',globals);
 const i=html.indexOf('  // integrate\n',flight),j=html.indexOf('  // fuel\n',i);
 const integration=pacific?null:vm.runInNewContext('(function(P,dt,windZ){const vs=0;'+html.slice(i,j)+'})',
  {flightAltitudeLimit:()=>8000,clampToWorldBounds(){}});
 return {attitude,integration};
}
// Measure the flown response against the formerly abrupt FW190 at the same speed.
// Full stick retains the bank limit; short touchscreen inputs become easier to meter.
const oldFw={...defs.fw190,rollAuth:1.85,pitchAuth:1.10,turn:1.05,
 stickExponent:undefined,controlDamping:undefined,aeroResponse:undefined};
function response(def,fps,aero,kind='fw190'){
 const {attitude}=flightParts(eu,false,kind,aero);
 const p={ac:kind,hull:def.hull,spd:150,gear:0,rollBias:0,pitch:0,roll:0,rollVel:0,pitchVel:0,heading:0};
 for(let i=0;i<Math.round(.5*fps);i++)attitude(p,.5,.25,1/fps,def,def.stall);
 return {roll:p.roll,pitch:p.pitch,heading:p.heading};
}
const oldKomet={...defs.me163,rollAuth:1.48,pitchAuth:1.16,
 stickExponent:undefined,controlDamping:undefined,aeroResponse:undefined};
for(const aero of [false,true]){
 const samples=[20,60,120].map(fps=>{
  const old=response(oldKomet,fps,aero,'me163'),now=response(defs.me163,fps,aero,'me163');
  assert(now.roll>old.roll*.3&&now.roll<old.roll*.8,'Komet short roll input is progressive, but remains agile');
  assert(Math.abs(now.heading)<Math.abs(old.heading)*.8,'Komet no longer yanks into a turn');
  const {attitude}=flightParts(eu,false,'me163',aero),d=defs.me163;
  const p={ac:'me163',hull:d.hull,spd:150,gear:0,rollBias:0,pitch:0,roll:0,rollVel:0,pitchVel:0,heading:0};
  for(let i=0;i<fps*2;i++)attitude(p,1,0,1/fps,d,d.stall);
  if(!aero)assert(p.roll>d.rollLim*.8,'held stick retains the Komet bank range');
  else assert(Math.abs(p.roll)>1,'held AERO input retains full rolls');
  return now.roll;
 });
 assert(Math.max(...samples)-Math.min(...samples)<.055,'Komet response consistent across frame rates');
}
for(const aero of [false,true]){
 const samples=[20,60,120].map(fps=>{
  const old=response(oldFw,fps,aero),now=response(defs.fw190,fps,aero);
  assert(now.roll>old.roll*.3&&now.roll<old.roll*.85,'FW190 responds gently without becoming inert');
  assert(now.pitch>old.pitch*.25&&now.pitch<old.pitch*.95,'FW190 pitch response is easier to meter');
  assert(now.heading<old.heading,'short roll input no longer yanks the heading as hard');
  return now.roll;
 });
 assert(Math.max(...samples)-Math.min(...samples)<.055,'FW190 response remains consistent across frame rates');
}
for(const fps of [20,60,120])for(const kind of [...Object.keys(defs),'avenger','sbd','zero']){
 const pacific=!defs[kind],d=defs[kind],{attitude,integration}=flightParts(pacific?pac:eu,pacific,kind);
 const p={ac:kind,hull:d?.hull||130,spd:150,gear:0,rollBias:0,pitch:0,roll:0,rollVel:0,pitchVel:0,heading:0,pos:{x:0,y:2000,z:0}};
 const step=(roll,pitch)=>attitude(p,roll,pitch,1/fps,d,d?.stall||40);
 for(let i=0;i<3*fps;i++)step(.6,.2);
 assert(Math.abs(p.heading)>.1,kind+' commanded bank must still turn');
 const bank=p.roll;step(0,0);assert(p.roll>bank*.9,kind+' release must not snap level');
 for(let i=1;i<3*fps;i++)step(0,0);
 assert(Math.abs(p.roll)<.002,kind+' settles wings level at '+fps+' FPS');
 const heading=p.heading,stillAir={...p,pos:{...p.pos}};
 for(let i=0;i<60*fps;i++){
  step(0,0);if(integration){stillAir.pitch=p.pitch;integration(p,1/fps,7);integration(stillAir,1/fps,0);}
 }
 assert(Math.abs(p.heading-heading)<.0001,kind+' neutral heading stable for one minute at '+fps+' FPS');
 if(integration){
  assert(Math.abs(p.pos.x-stillAir.pos.x-7*60)<.001,kind+' crosswind translates the ground track');
 }
}
// Build 232: the ARCADE Me 262 back-stick is bounded by its ENERGY ceiling (me262-performance.js pitchCeiling: thrust surplus in the
// current configuration + the speed above 1.2 x stall spent over 10 s), not by the fixed 20-degree cap and 80-140 m/s hand-over of
// Build 181/184. AERO (REALISTIC) remains available for a loop. Execute the shipped attitude function at three rates.
const jetCeiling=(p,d,stall)=>global.Me262Performance.pitchCeiling(p,{loadRatio:SortieFeatures.Handling.sample(p).ratio,power:SortieFeatures.Damage.power(p),bank:p.roll,
 flaps:SortieFeatures.Damage.controls(p).flaps.mean,drag:SortieFeatures.Damage.controls(p).drag,stall,limit:d.pitchLim*.92});
const steady={};
for(const fps of [20,60,120])for(const speed of [55,65,75,80,90,100,120,140,200]){
 const d=defs.me262,p={ac:'me262',hull:d.hull,spd:speed,gear:0,rollBias:0,pitch:.10,roll:0,pitchVel:0,rollVel:0,heading:0,groundPower:1,throttle:1};
 const normal=flightParts(eu,false,'me262').attitude;let max=0;
 for(let i=0;i<8*fps;i++){normal(p,0,1,1/fps,d,d.stall);max=Math.max(max,p.pitch);}
 const ceiling=jetCeiling(p,d,d.stall);
 assert(p.pitch<=ceiling+.003,'the nose never goes above the energy ceiling at '+speed+' m/s ('+p.pitch+' > '+ceiling+')');
 assert(p.pitch>=ceiling-.02,'and a held stick reaches it within 8 s at '+speed+' m/s, '+fps+' FPS ('+p.pitch+' vs '+ceiling+')');
 if(speed<=80){
  assert(p.pitch>.40,'low-speed jet climbs at 23+ degrees now (it was held under 20 before): '+speed+' m/s -> '+(p.pitch*180/Math.PI).toFixed(1));
  assert(speed*Math.sin(p.pitch)>19,'and the climb rate is no longer capped at 19 m/s at '+speed+' m/s');
  assert(p.pitch<d.pitchLim*.92,'but still short of the full pitch command: the jet has to keep its speed');
 }else if(speed>=140){
  assert(p.pitch>1,'fast normal flight keeps the original full pitch command');
  assert(speed*Math.sin(p.pitch)>100,'fast jet can climb strongly');
 }
 if(fps===60)steady[speed]=p.pitch;
 const aero=flightParts(eu,false,'me262',true).attitude;
 for(let i=0;i<4*fps;i++)aero(p,0,1,1/fps,d,d.stall);
 assert(Math.abs(p.pitch)>.7,'AERO retains high-pitch manoeuvres');
}
{const v=Object.keys(steady).map(Number).sort((x,y)=>x-y);for(let i=1;i<v.length;i++)assert(steady[v[i]]>=steady[v[i-1]]-.002,'more speed to spend never lowers the ceiling ('+v[i-1]+' -> '+v[i]+' m/s)');}
// An idle engine still gets the old landing-flare / pull-up angle (>= the old 14.8 degrees at 60 m/s) and not more than its energy allows.
for(const fps of [20,60,120]){
 const d=defs.me262,p={ac:'me262',hull:d.hull,spd:62,gear:1,flap:.5,rollBias:0,pitch:0,roll:0,pitchVel:0,rollVel:0,heading:0,groundPower:0,throttle:0};
 const normal=flightParts(eu,false,'me262').attitude;for(let i=0;i<6*fps;i++)normal(p,0,1,1/fps,d,d.stall);
 assert(p.pitch>=.255&&p.pitch<=jetCeiling(p,d,d.stall)+.003,'idle, gear down: the flare angle is kept, '+fps+' FPS ('+(p.pitch*180/Math.PI).toFixed(1)+')');
}
// The slow nose is quicker: 15 degrees from level at 65 m/s well inside two seconds (it took 20 s in the formerly capped ARCADE jet).
for(const fps of [20,60,120]){
 const d=defs.me262,p={ac:'me262',hull:d.hull,spd:65,gear:0,rollBias:0,pitch:0,roll:0,pitchVel:0,rollVel:0,heading:0,groundPower:1,throttle:1};
 const normal=flightParts(eu,false,'me262').attitude;let t=0;
 for(;t<6&&p.pitch<15*Math.PI/180;t+=1/fps)normal(p,0,1,1/fps,d,d.stall);
 assert(t<1.9,'15 degrees at 65 m/s in under 1.9 s at '+fps+' FPS ('+t.toFixed(2)+' s)');
}
// The ceiling is continuous in speed: no pitch jump where the old limiter handed over (80 and 140 m/s).
let lastSpeed=0,lastPitch=0;
for(const speed of [79.99,80,80.01,139.99,140,140.01]){
 const d=defs.me262,p={ac:'me262',hull:d.hull,spd:speed,gear:0,rollBias:0,pitch:0,roll:0,pitchVel:0,rollVel:0,heading:0,groundPower:1,throttle:1};
 const normal=flightParts(eu,false,'me262').attitude;
 for(let i=0;i<480;i++)normal(p,0,1,1/60,d,d.stall);
 if(speed-lastSpeed<.02)assert(Math.abs(p.pitch-lastPitch)<.001,'normal pitch stays continuous in speed around '+speed);
 lastSpeed=speed;lastPitch=p.pitch;
 for(let i=0;i<480;i++)normal(p,0,-.5,1/60,d,d.stall);
 assert(Math.abs(p.pitch+d.pitchLim*.92*.5)<.001,'dive commands retain their original authority');
}
// Right after lift-off the departure envelope is still closed (it opens with airspeed). The Me 262 climbs on its energy ceiling anyway;
// the Bf 109, Fw 190 and P-47 still obey the departure rate - nothing else changed.
for(const fps of [20,60,120]){
 const run=(kind,spd)=>{const d=defs[kind],p={ac:kind,hull:d.hull,spd,gear:0,rollBias:0,pitch:.07,roll:0,pitchVel:0,rollVel:0,heading:0,groundPower:1,throttle:1,departureAge:0};
  const att=flightParts(eu,false,kind).attitude;let max=0;for(let i=0;i<6*fps;i++){att(p,0,1,1/fps,d,d.stall);max=Math.max(max,p.pitch);}return max;};
 const jet=run('me262',62);assert(jet>.38,'Me 262 just after lift-off climbs on its ceiling, '+fps+' FPS ('+(jet*180/Math.PI).toFixed(1)+' deg)');
 for(const kind of ['bf109','fw190','p47']){const m=run(kind,defs[kind].stall*1.15);assert(m<.34,kind+' is still held by the departure envelope just after lift-off, '+fps+' FPS ('+(m*180/Math.PI).toFixed(1)+' deg)');}
}

// Begin level in strong wind: the turn routine itself must never yaw the nose.
const a=eu.indexOf('  // bank-to-turn:',eu.indexOf('function updateFlight(dt)')),b=eu.indexOf('  // vertical speed:',a);
for(const windZ of [-12,0,12]){
 const turn=vm.runInNewContext('(function(P,dt){const load=SortieFeatures.Handling.sample(P),controls=SortieFeatures.Damage.controls(P),aeroMode=false,d=AC.p47,stallSpd=d.stall,configuration=SortieFeatures.Handling.configuration(P,stallSpd),feel=FlightDynamics.authority(P.ac,P.spd,stallSpd),liftCtx={loadSpeed:load.speed,stallPenalty:controls.stallPenalty,gFactor:configuration.gFactor,flaps:controls.flaps.mean};'+eu.slice(a,b)+'})',{SortieFeatures,FlightDynamics,FlightEnvelope,windZ,AC:defs});
 const p={ac:'p47',roll:0,spd:150,heading:1.2};for(let i=0;i<1200;i++)turn(p,.05);
 assert.equal(p.heading,1.2,'wind must not turn a wings-level aircraft');
}
console.log('Controls: matched live sticks, centre dead zone, pointer ownership; nine aircraft settle and hold heading at 20/60/120 FPS; wind translates without yaw');
