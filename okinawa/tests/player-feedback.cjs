'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),F=require('../../flight-dynamics.js');
for(const kind of ['zero','bf109']){
 const half=F.playerControls(kind,.5,-.5),full=F.playerControls(kind,1,-1),neutral=F.playerControls(kind,0,0);
 assert(half.roll<.4&&half.pitch>-.4);assert.equal(full.roll,1);assert.equal(full.pitch,-1);assert.equal(neutral.roll,0);assert.equal(neutral.pitch,0);assert(full.response<.85&&full.turn<.8);
}
for(const kind of ['p47','fw190','ju87','me262','me163','avenger','sbd','corsair'])assert.deepEqual(F.playerControls(kind,.5,-.5),{roll:.5,pitch:-.5,response:1,turn:1});
const html=fs.readFileSync('remagen-mission.html','utf8'),start=html.indexOf('function toggleAero(){'),end=html.indexOf('function bindInput(){',start),code=html.slice(start,end);
const ctx={state:3,ST:{FLIGHT:3},P:{ac:'ju87',alive:true,pos:{x:0,y:1000,z:0},gear:1,onGround:false,spd:120,pitch:0,roll:0},aeroMode:false,acDef:()=>({stall:37,pitchLim:1.26,rollLim:1.48}),aeroGateSpeed:()=>75,groundY:()=>0,KT:2.237,flash:m=>ctx.last=m,document:{getElementById:()=>null}};
vm.createContext(ctx);vm.runInContext(code,ctx);ctx.toggleAero();assert(ctx.aeroMode,'fixed Ju87 gear permits AERO');assert.equal(ctx.P.gear,1);
ctx.aeroMode=false;ctx.P.ac='bf109';ctx.toggleAero();assert(!ctx.aeroMode,'retractable gear remains a gate');assert(ctx.last.includes('GEAR UP'));
ctx.P.ac='ju87';ctx.P.spd=40;ctx.toggleAero();assert(!ctx.aeroMode);assert(!ctx.last.includes('GEAR UP'));
ctx.P.spd=120;ctx.P.onGround=true;ctx.toggleAero();assert(!ctx.aeroMode,'Ju87 still requires airborne entry');
console.log('Player touch response calmed for Zero/Bf109 only; full stick and neutral retained. Ju87 fixed-gear AERO, speed and ground gates passed.');
