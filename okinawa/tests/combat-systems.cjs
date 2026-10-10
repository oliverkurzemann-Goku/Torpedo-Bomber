'use strict';
const assert=require('node:assert/strict'),THREE=require('three');
require('../../game-runtime.js');require('../../sortie-features.js');require('../../crew-visuals.js');require('../../pilot-bailout.js');
const AircraftDamage=require('../../aircraft-damage.js'),EnemyBailouts=require('../../enemy-bailouts.js'),ShipDamage=require('../../ship-damage.js'),FlareSupport=require('../../flare-support.js'),SortieService=require('../../sortie-service.js');
// Logic/resource tests; original meshes and pixels are covered in combat-sorties-browser.
for(const fps of [20,60,120]){
 const scene=new THREE.Scene(),model=new THREE.Group(),original=new THREE.BoxGeometry(12,.7,6),skin=new THREE.MeshStandardMaterial();model.add(new THREE.Mesh(original,skin));scene.add(model);
 const damage=AircraftDamage.create(THREE,scene,()=>0);damage.damage(model,.15,.5);assert(damage.stats.holes>0);assert(model.children[0].geometry!==original,'bent wing owns its geometry');
 let impacts=0;damage.wreck(model,{pos:new THREE.Vector3(0,250,0),vel:new THREE.Vector3(90,0,0)},()=>impacts++);
 assert.equal(impacts,0,'loss in the air is not an immediate ground explosion');for(let i=0;i<fps*15;i++)damage.update(1/fps);
 assert.equal(impacts,1,'exactly one eventual impact');assert.equal(damage.stats.wrecks,0);assert.equal(damage.stats.rigs,0);assert.equal(model.children[0].geometry,original,'shared mesh is restored');damage.dispose();
 const ship={hp:1,group:new THREE.Group()};ship.group.add(new THREE.Mesh(new THREE.BoxGeometry(20,12,100),skin));scene.add(ship.group);
 const floods=ShipDamage.create(THREE,scene);floods.hit(ship,new THREE.Vector3(10,1,38),'torpedo');for(let i=0;i<fps*8;i++)floods.update(ship,1/fps,2);
 const s=floods.get(ship);assert(s.compartments[2]>s.compartments[0]);assert(ship.group.rotation.z<0);assert(ship.group.rotation.x<0,'bow hit trims bow down');assert.equal(ship.hp,1,'animation does not change weapon balance');
 ship.hp=0;floods.hit(ship,new THREE.Vector3(-10,1,-30),'torpedo');for(let i=0;i<fps*42;i++)floods.update(ship,1/fps,2);assert.equal(ship.group.visible,false);assert(ship.group.position.y<-10);floods.dispose();
 const flares=FlareSupport.create(THREE,scene,()=>0);assert(!flares.drop(new THREE.Vector3(0,300,0),new THREE.Vector3(0,0,1),100));flares.setNight(true);assert.equal(flares.slots.length,3);
 for(let i=0;i<4;i++)assert(flares.drop(new THREE.Vector3(i*100,300,0),new THREE.Vector3(0,0,1),100));assert(!flares.drop(new THREE.Vector3(0,300,0),new THREE.Vector3(0,0,1),100));assert.equal(flares.active,3);
 const y=flares.slots[0].g.position.y;for(let i=0;i<fps*2;i++)flares.update(1/fps,new THREE.Vector3(5,0,0));assert(Math.abs(flares.slots[0].g.position.y-y+5.6)<.001);assert(flares.slots[0].g.position.x>0);flares.clear();assert.equal(flares.active,0);assert.equal(flares.remaining,4);flares.dispose();
}
const scene=new THREE.Scene(),crews=EnemyBailouts.create(THREE,scene,()=>0),air={pos:new THREE.Vector3(0,500,0),heading:0,spd:100};
assert.equal(crews.spawn(air,'b24','usaaf'),10);assert.equal(crews.spawn(air,'b24','usaaf'),0,'one bailout per aircraft');for(let i=0;i<300;i++)crews.update(1/60);assert.equal(crews.deployed,10);crews.clear();assert.equal(crews.count,0);
assert.equal(crews.spawn({pos:new THREE.Vector3(0,20,0)},'zero','ijn'),0,'no guaranteed low-level parachute');
const children={};const doc={body:{appendChild(){}},createElement(tag){const node={style:{},appendChild(){}};if(tag==='button')children.button=node;return node;}};
let launches=0,repairs=0;const service=SortieService.create({document:doc,onLaunch:()=>launches++,onRepair:()=>repairs++}),p={fuel:15,hull:25,ammo:0,bombs:0,gear:0,throttle:1};global.SortieFeatures.Damage.reset(p);
service.begin(p,{ammo:1200,bombs:2,maxHull:100});service.update(5);assert.equal(p.fuel,100);assert.equal(p.ammo,0);assert(!service.ready);children.button.onclick();assert.equal(launches,0,'cannot launch before service completes');service.update(4);assert.equal(p.ammo,1200);assert.equal(p.hull,25);service.update(4);assert.equal(p.hull,100);assert.equal(p.gear,1);assert.equal(repairs,1);children.button.onclick();assert.equal(launches,1);assert(!service.active);service.clear();
p.alive=true;p.hull=15;service.begin(p,{ammo:1200,bombs:2,maxHull:100});p.alive=false;service.update(13);assert(!service.active&&p.hull===15,'service cannot revive a destroyed aircraft');
let now=0;const meter=new global.GameRuntime.FrameMeter(()=>now);for(let i=0;i<500;i++){meter.begin(.02);now+=3;meter.mark('world');now+=2;meter.end();}const report=meter.report();assert.equal(report.samples,240);assert.equal(report.cpu.world.p95,3);assert.equal(report.interval.median,20);
console.log('Wreck impact at 20/60/120 FPS, compartment/side flooding, bounded flares, full crews, repair/rearm stages and bounded frame diagnostics: passed');
