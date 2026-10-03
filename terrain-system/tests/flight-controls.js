// Real input handlers and attitude/turn/position code: centred stick and wind regression.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');require('../../game-runtime.js');const {GameRuntime}=global;
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
const turnStart=eu.indexOf('const TURN_K='),turnEnd=eu.indexOf('\n}',eu.indexOf('function bankTurnRate(',turnStart));
const bankTurnRate=vm.runInNewContext(eu.slice(turnStart,turnEnd+2)+'\nbankTurnRate');
function flightParts(html,pacific,kind){
 const flight=html.indexOf('function updateFlight(dt)');
 const a=html.indexOf(pacific?'  const dmgF = P.hull<60':'  const dmgF = (P.hull < d.hull',flight);
 const b=html.indexOf(pacific?'  // speed toward throttle target':'  // vertical speed:',a);
 const globals={isDefend:()=>kind==='zero',isSBD:()=>kind==='sbd',bankTurnRate,windZ:0};
 const attitude=vm.runInNewContext('(function(P,inputRoll,inputPitch,dt,d,stallSpd){const aeroMode=false,steerSign=1;'+html.slice(a,b)+'})',globals);
 const i=html.indexOf('  // integrate\n',flight),j=html.indexOf('  // fuel\n',i);
 const integration=pacific?null:vm.runInNewContext('(function(P,dt,windZ){const vs=0;'+html.slice(i,j)+'})',
  {flightAltitudeLimit:()=>8000,clampToWorldBounds(){}});
 return {attitude,integration};
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
// Begin level in strong wind: the turn routine itself must never yaw the nose.
const a=eu.indexOf('  // bank-to-turn:',eu.indexOf('function updateFlight(dt)')),b=eu.indexOf('  // vertical speed:',a);
for(const windZ of [-12,0,12]){
 const turn=vm.runInNewContext('(function(P,dt){const aeroMode=false,d=AC.p47,stallSpd=d.stall;'+eu.slice(a,b)+'})',{bankTurnRate,windZ,AC:defs});
 const p={ac:'p47',roll:0,spd:150,heading:1.2};for(let i=0;i<1200;i++)turn(p,.05);
 assert.equal(p.heading,1.2,'wind must not turn a wings-level aircraft');
}
console.log('Controls: matched live sticks, centre dead zone, pointer ownership; nine aircraft settle and hold heading at 20/60/120 FPS; wind translates without yaw');
