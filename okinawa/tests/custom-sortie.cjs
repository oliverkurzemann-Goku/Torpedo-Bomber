'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('three'),C=require('../../custom-sortie.js');
require('../../sortie-systems.js');require('../../sortie-features.js');require('../../flight-dynamics.js');
const european=fs.readFileSync('remagen-mission.html','utf8'),pacific=fs.readFileSync('torpedo-carrier.html','utf8');
const functionSource=(s,n,next)=>s.slice(s.indexOf('function '+n+'('),s.indexOf('\nfunction '+next+'(',s.indexOf('function '+n+'(')));
const source=functionSource(european,'missionLoadout','clearWorld');let count=0,operations=0;const aircraft=new Set();
for(const theatre of Object.keys(C.tasks))for(const task of C.tasks[theatre])for(const ac of C.aircraft(theatre,task.id))for(const kit of C.loadouts(ac,task.id))for(const start of ['ground','air']){
 const cfg=C.normalize({...C.defaults(theatre),task:task.id,ac,kit,start,weather:'rain',time:'night',fuel:75,enemies:2}),m=C.mission(cfg),stores=C.stores(cfg);aircraft.add(ac);count++;
 assert.equal(m.customId,C.fingerprint(cfg));assert.equal(m.weather,'rain');assert(m.night);assert(!m.events&&!m.reinforcement);
 const params=new URL(C.url(cfg),'https://test.invalid').search;const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};
 assert.deepEqual(C.read(theatre,params,storage).config,cfg);assert.deepEqual(C.read(theatre,'',storage).config,cfg);assert.equal(C.read(theatre,params,{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}).error,null);
 if(theatre==='europe'){
  assert.equal(m.ac,ac);const context={CustomSortie:C};vm.createContext(context);vm.runInContext(source,context);assert.deepEqual(JSON.parse(JSON.stringify(context.missionLoadout(m,{}))),stores);
  if(task.id==='bridge')assert(stores.bombs>0);if(task.id==='convoy')assert.equal(m.kills.truck,4);if(task.id==='intercept')assert.equal(m.bombers.n,2);
 }else{
  assert.equal(m.torps,stores.bombs||stores.torpedoes);if(ac==='zero')assert(m.defend);if(ac==='avenger')assert(m.torps<=2);if(kit==='torpedo')assert.equal(m.torps,1);
  if(task.id==='free')assert.equal(m.raiders,0);if(task.id==='defend')assert.equal(m.raiders,2);
 }
 const op=new FlightOps.Operation(FlightOps.withPhases(m,C.operation(cfg)));
 for(let i=0;i<100;i++)op.tick(.1,{pos:new THREE.Vector3(),clear:true,located:true,suppressed:true,glide:true,kills:100,airborne:true});assert(op.ready());operations++;
 {
  const p={pos:new THREE.Vector3(),onGround:true,onDeck:true,gear:1,flap:1};let flying=false,closed=false;
  const result=C.launchState(cfg,theatre,{P:p,finishIntro(){closed=true;},departure:{x:100,z:200,height:900,heading:.3,speed:95},flight(){flying=true;}});
  assert.equal(result,cfg.start==='air');if(result){assert(flying&&closed);assert.equal(p.pos.y,900);assert.equal(p.gear,0);assert.equal(p.onGround,false);assert.equal(p.onDeck,false);assert.equal(p.spd,95);}
 }
 const missions=[{id:'original-free'},{id:'first-campaign'},{id:'last-campaign'}],before=JSON.stringify(missions.slice(1)),plans=[{},{}];C.install(theatre,missions,plans,params,storage);assert.equal(missions.length,3);assert.equal(JSON.stringify(missions.slice(1)),before);
}
// A custom airborne save carries its setup even when the active Hangar draft is gone or different.
for(const theatre of ['europe','pacific']){
 const cfg=C.normalize({...C.defaults(theatre),time:'night'}),m=C.mission(cfg),saved={mission:0,custom:cfg};
 const missions=[{id:'original',ac:'p47',title:'Original',sub:'Original'}],plans=[{}];
 const id=C.checkpointIdentity(theatre,[m],0);
 assert.equal(C.checkpointIdentity(theatre,missions,0,saved),id);
 C.install(theatre,missions,plans,new URL(C.url(cfg),'https://test.invalid').search,{getItem(){},setItem(){}});
 assert.equal(C.checkpointIdentity(theatre,missions,0,{mission:0}),theatre==='europe'?'original|p47':'Original|Original');
 C.restoreSaved(theatre,{mission:0},missions,plans);assert.equal(missions[0].id,'original');
 C.restoreSaved(theatre,saved,missions,plans);assert.deepEqual(missions[0].custom,cfg);assert.equal(C.checkpointIdentity(theatre,missions,0),id);
 assert.equal(C.checkpointIdentity(theatre,missions,1,saved),null);
 assert.equal(C.checkpointIdentity(theatre,missions,0,{custom:{...cfg,kit:'invalid'}}),null);
}
assert.equal(aircraft.size,10);assert(count>100);
for(const bad of [{task:'bridge',kit:'guns'},{ac:'me163',task:'bridge',kit:'bombs'},{theatre:'pacific',ac:'zero',task:'torpedo',kit:'torpedo'},{enemies:99},{weather:'<script>'},{fuel:-1}])assert.throws(()=>C.normalize({...C.defaults(),...bad}));
assert(C.read('europe','?sortie=bad').error);assert(C.read('europe','?sortie='+encodeURIComponent('x'.repeat(1501))).error);assert(C.read('europe',new URL(C.url(C.defaults('pacific')),'https://test.invalid').search).error);
const first=C.defaults(),second={...first,time:'night'};assert.notEqual(C.fingerprint(first),C.fingerprint(second));
for(const [html,script]of [[european,'checkpoint-rhine.js'],[pacific,'checkpoint-pacific.js']]){assert(html.includes('custom-sortie.js?v=226'));assert(html.includes(script+'?v=226'));assert(fs.readFileSync(script,'utf8').includes('checkpointIdentity'));assert(html.includes('hangar.html?theatre='));}
// Same installed mission data reaches real load/mass and accelerated deck service.
const p={fuel:100,torps:1,gear:0,flap:0,systemDamage:{},spd:70};SortieFeatures.Handling.configure(p,'avenger','torpedo','pacific');const loaded=SortieFeatures.Handling.sample(p).ratio;p.torps=0;assert(loaded>SortieFeatures.Handling.sample(p).ratio);
console.log(JSON.stringify({validConfigurations:count,aircraft:aircraft.size,operationsReady:operations,airStartStateChecks:true,urlStorageRoundTrips:true,invalidSetupsRejected:true,campaignIndicesPreserved:true,checkpointIdentity:true,realMassResponse:true},null,2));
