'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const RadioIntercept=require('../../radio-intercept.js');
const player={pos:{x:0,y:400,z:0},spd:160,alive:true,onGround:false};
const bomber={pos:{x:0,y:1200,z:5000},vel:{x:72,z:0},alive:true,bomber:true};
const s=RadioIntercept.solution(player,bomber);
assert(s.solved&&s.course>20&&s.course<35,'moving bomber gets a leading course, not a direct bearing');
assert(Math.abs(Math.hypot(bomber.vel.x*s.time,5000)-player.spd*s.time)<1e-7,'intercept meets actual target motion');
assert.equal(s.vertical,'CLIMB 2,600 FT');
assert.equal(RadioIntercept.solution({...player,spd:40},{...bomber,vel:{x:0,z:80}}).solved,false,'unreachable target never gets a fictitious intercept');
assert.equal(RadioIntercept.solution({...player,pitch:Math.PI/2},bomber).solved,false,'vertical climb is not counted as horizontal closure');
assert.equal(RadioIntercept.solution(player,{...bomber,pos:{x:0,y:410,z:5000}}).vertical,'LEVEL');
assert.match(RadioIntercept.solution({...player,pos:{x:0,y:2000,z:0}},bomber).vertical,/DESCEND/);
const radio=RadioIntercept.create();assert.equal(radio.tick(7,player,[bomber]),null);
assert.equal(radio.tick(1,player,[bomber],true),null,'urgent chatter takes priority');
assert.match(radio.tick(.1,player,[bomber]),/BOMBERS.*ALT 3900 FT MSL.*INTERCEPT 027°/);
for(let i=0;i<390;i++)assert.equal(radio.tick(.05,player,[bomber]),null,'reports are not spammed');
bomber.alive=false;assert.equal(radio.tick(1,player,[bomber]),null,'destroyed contact is dropped');
radio.reset();assert.equal(radio.tick(8,{...player,onGround:true},[bomber]),null,'no intercept chatter on the runway');
const root=path.resolve(__dirname,'../..');
for(const file of ['remagen-mission.html','torpedo-carrier.html']){
 const html=fs.readFileSync(path.join(root,file),'utf8'),a=html.indexOf('function updateInterceptRadio('),b=html.indexOf('\nfunction ',a+1);
 const lines=[],c=vm.createContext({ST:{FLIGHT:1},state:1,P:{...player},enemyAir:[{...bomber,alive:true}],
  zeros:[],raiders:[{...bomber,alive:true}],europeOps:null,pacificOps:null,radioQ:[],radioT:0,
  interceptRadio:RadioIntercept.create(),radioSay:m=>lines.push(m),isDefend:()=>true});
 vm.runInContext(html.slice(a,b),c);c.updateInterceptRadio(8);assert.equal(lines.length,1,'actual '+file+' callback delivers guidance');
 c.state=2;c.updateInterceptRadio(30);assert.equal(lines.length,1,'paused/dead aircraft gets no guidance');
}
console.log('Radio: analytical lead course, target MSL altitude and climb/descent; priority, cadence and both actual callbacks');
