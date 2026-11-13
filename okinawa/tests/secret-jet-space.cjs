'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto'),THREE=require('three');
const SecretJet=require('../../secret-jet.js'),Space=require('../../secret-space.js');
const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};};
const localStorage=storage(),sessionStorage=storage(),catalogue=fs.readFileSync(require.resolve('../../custom-sortie.js'),'utf8');
function newPage(){const context=vm.createContext({URLSearchParams,crypto:webcrypto,localStorage,sessionStorage});vm.runInContext(catalogue,context);return context.CustomSortie;}
localStorage.setItem('torpedo-carrier-secret-jet-v1','1');
const hangar=newPage();assert(!hangar.aircraft('pacific','free').includes('secretjet'));
hangar.unlockSecretJet();assert(hangar.aircraft('pacific','free').includes('secretjet'));
const selection={...hangar.defaults('pacific'),ac:'secretjet',kit:'turrets'};
const url=new URL(hangar.url(selection),'https://test.invalid');
const flight=newPage(),missions=[{title:'Free Flight'}],plans=[{}];
const forged=new URL(url);forged.searchParams.set('launch','invalid');assert.equal(flight.read('pacific',forged.search).config,null);
const altered=new URL(url);altered.searchParams.set('sortie',JSON.stringify({...selection,time:'night'}));assert.equal(flight.read('pacific',altered.search).config,null);
const transfer=flight.install('pacific',missions,plans,url.search);
assert(transfer.transient&&transfer.requested&&missions[0].secretJet);
assert.equal(transfer.config.start,'air');assert.equal(localStorage.getItem('custom-sortie-v1-pacific'),null);
assert.equal(flight.checkpointIdentity('pacific',missions,0),null);
assert.throws(()=>flight.restoreSaved('pacific',{mission:0,custom:transfer.config},missions,plans));
const reloaded=newPage();assert.equal(reloaded.read('pacific',url.search).config,null);
localStorage.setItem('custom-sortie-v1-pacific',JSON.stringify(selection));assert.equal(reloaded.read('pacific').config,null);
assert(!reloaded.aircraft('pacific','free').includes('secretjet'));

const html=fs.readFileSync('torpedo-carrier.html','utf8');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)+a.length));
const P={pos:new THREE.Vector3(0,900,0),fuel:100,throttle:.75,spd:113,pitch:0,roll:0,heading:0,alive:true,hull:100};
let entries=0,normalSteps=0;
const context=vm.createContext({P,SecretJet,aeroMode:true,inputRoll:0,inputPitch:1,steerSign:1,windHead:0,windGust:0,
 secretJetCrew:{isGunner:false,animate(){}},isSecretJet:()=>true,pacificAircraftQuaternion:()=>new THREE.Quaternion(),
 CarrierRecovery:{wind:()=>({x:0})},enterSecretSpace(){assert(P.pos.y>=6096);entries++;},resolveShipContact:()=>false,
 FlightSupport:{surfaceHit(){normalSteps++;return false;}},shoreHeight:()=>0,seaHeightAt:()=>0,seaUniforms:null});
vm.runInContext(slice('function updateFlight(dt){','  if(P.arrestRun)')+'}',context);
let elapsed=0;while(!entries&&elapsed<75){context.updateFlight(1/60);elapsed+=1/60;}
assert.equal(entries,1);assert(normalSteps>180&&elapsed<55);assert.equal(P.pitch,Math.PI/2);
const h=P.pos.y;SecretJet.stepFlight(P,.05,{roll:0,pitch:0,wind:0,realistic:true});assert(P.pos.y>h&&P.pitch===Math.PI/2);
const arcade={...P,pitch:0,pos:new THREE.Vector3(0,900,0)};
for(let i=0;i<120;i++)SecretJet.stepFlight(arcade,1/60,{roll:0,pitch:1,wind:0});assert(arcade.pitch<.60);

let piston,jet,jetCreates=0;
Object.assign(context,{actx:{},eng:{master:{},piston:{update(...args){piston=args;}}},state:1,ST:{FLIGHT:1,LAUNCH:2},
 FlightDynamics:{kind:()=> 'avenger'},AircraftEngine:{profiles:{}},secretJetSpace:null,firing:false,
 JetEngine:{create(){jetCreates++;return {update(...args){jet=args;}};}}});
vm.runInContext(slice('function updateAudio(dt){','\nfunction sfxBoom('),context);
context.updateAudio(.016);assert.equal(jetCreates,1);assert.equal(piston[3],false);assert.equal(jet[2],true);
const dry=jet[1];P.jetBoost=true;context.updateAudio(.016);assert(jet[1]>dry);
context.isSecretJet=()=>false;context.updateAudio(.016);assert.equal(piston[3],true);assert.equal(jet[2],false);

function seeded(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};}
const template=new THREE.Group(),shared=new THREE.BoxGeometry(1,1,1);template.add(new THREE.Mesh(shared,new THREE.MeshBasicMaterial()));
let disposedShared=false;shared.addEventListener('dispose',()=>{disposedShared=true;});
assert.equal(Space.ascent(5334,6096),0);assert.equal(Space.ascent(5715,6096),.5);assert.equal(Space.ascent(6096,6096),1);
const motion=Space.create(THREE,template,{random:seeded(20)}),ship=motion.scene.getObjectByName('SpaceJet');
const originalView=motion.view(4/3),originalCamera=motion.camera.position.clone();
motion.update(1/60,{roll:1,pitch:1});assert(ship.position.x>0&&ship.position.x<.25&&ship.position.y>0);
for(let i=0;i<23;i++)motion.update(1/60,{roll:1});
const released=ship.position.x;
for(let i=0;i<30;i++)motion.update(1/60);
assert(ship.position.x>released&&ship.position.x-released<4);
const settled=ship.position.x;motion.update(1/60);assert.equal(ship.position.x,settled);
const aimed=motion.view(4/3);assert(aimed.x>originalView.x&&motion.camera.position.distanceTo(originalCamera)<2);
motion.update(1/60,{fire:true});
const expectedAim=motion.view(4/3),bolts=motion.scene.children.filter(o=>o.name==='PlayerBolt');
assert.equal(bolts.length,2);
for(const bolt of bolts){
 const dir=new THREE.Vector3(0,0,1).applyQuaternion(bolt.quaternion);
 const point=bolt.position.clone().addScaledVector(dir,(-200-bolt.position.z)/dir.z).project(motion.camera);
 assert(Math.abs((1+point.x)/2-expectedAim.x)<1e-6&&Math.abs((1-point.y)/2-expectedAim.y)<1e-6);
}
assert(motion.requestBoost()&&motion.boosting);assert(!motion.requestBoost());
const boosted=ship.position.x;
for(let i=0;i<12;i++)motion.update(1/60,{roll:-1});
assert(boosted-ship.position.x>12);
for(let i=0;i<31;i++)motion.update(1/60);
assert(!motion.boosting&&motion.boostRemaining>0&&motion.entryVeil===0);
for(let i=0;i<160;i++)motion.update(1/60);
assert.equal(motion.boostRemaining,0);assert(motion.requestBoost());motion.dispose();
const events=[],space=Space.create(THREE,template,{random:seeded(42),onEvent:e=>events.push(e)});
const seen=new Set(),previous=new WeakMap(),player=space.scene.getObjectByName('SpaceJet').position,dt=1/60;
for(let i=0;i<60*80&&space.status==='flying';i++){
 const children=space.scene.children;
 for(const model of children)seen.add(model.name);
 const enemies=children.filter(m=>m.name==='AlienShip'&&m.position.z<-32).sort((a,b)=>b.position.z-a.position.z);
 const target=enemies[0],lead=target?-target.position.z/750:0,old=previous.get(target);
 let x=target?target.position.x+(old?(target.position.x-old.x)/dt*lead:0):Math.sin(i*.05)*40;
 let y=target?target.position.y+(old?(target.position.y-old.y)/dt*lead:0):Math.cos(i*.05)*22;
 const obstacle=children.find(m=>['Asteroid','Comet','StarCore'].includes(m.name)&&m.position.z>-78&&m.position.z<-5&&Math.hypot(m.position.x-player.x,m.position.y-player.y)<15);
 if(obstacle){x=player.x+(player.x>obstacle.position.x?23:-23);y=player.y+(player.y>obstacle.position.y?19:-19);}
 for(const enemy of enemies)previous.set(enemy,enemy.position.clone());
 space.update(dt,{roll:(x-player.x)/6,pitch:(y-player.y)/5,fire:true,throttle:0});
}
assert.equal(space.status,'won');assert.equal(space.kills,Space.GOAL);assert(space.dodged>0);
assert(['Starfield','StarCore','Asteroid','Comet','AlienShip'].every(name=>seen.has(name)));
assert.equal(events.filter(e=>e==='kill').length,Space.GOAL);
const aim=space.view(16/9);assert(aim.x>0&&aim.x<1&&aim.y>0&&aim.y<1);
space.dispose();space.dispose();assert.equal(space.scene.children.length,0);assert(!disposedShared);
const noInput=Space.create(THREE,template,{random:()=>.5});
for(let i=0;i<60*40&&noInput.status==='flying';i++)noInput.update(dt);
assert.equal(noInput.status,'lost');assert.equal(noInput.hull,0);noInput.dispose();
console.log('Secret Jet: one-use launch and clean reload; vertical 20,000 ft climb, turbine routing, ascent fade, arcade steering, convergence, boost, obstacles, win/loss and teardown.');
