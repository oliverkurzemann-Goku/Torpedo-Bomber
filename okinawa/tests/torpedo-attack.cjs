/* Build 202 torpedo attack rules: distance-limited run, arming run, real hull contact,
 * track angle, hit-location effects and combing captains — at 20/60/120 FPS. */
'use strict';
const assert=require('node:assert/strict');
const THREE=require('three');global.THREE=THREE;
const T=require('../../torpedo-attack.js'),ShipDamage=require('../../ship-damage.js');

function ship({type='freighter',length=132,beam=18,yaw=0,naval=true,speed=4.5}={}){
 const group=new THREE.Group(),template=new THREE.Group();
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(beam,20,length),new THREE.MeshBasicMaterial());mesh.position.y=6;template.add(mesh);
 if(naval)template.userData.naval={length,beam,draft:3.5};
 group.add(template);group.rotation.y=yaw;group.updateMatrixWorld(true);
 return {def:{type,hp:1},group,alive:true,hp:1,speed,radius:length*.55};
}
function fish(x,z,dir,run=0){const len=Math.hypot(dir.x,dir.z);return {mesh:{position:new THREE.Vector3(x,.7,z)},dir:{x:dir.x/len,z:dir.z/len},speed:23,phase:'run',run,armed:run>=T.ARM_RUN,spent:false};}

// --- hull measurement and real hull contact (no more 0.55*length circle) ---
const freighter=ship();
assert.deepEqual([T.hull(freighter).length,Math.round(T.hull(freighter).beam)],[132,18],'NavalAssets spec preferred');
const measured=ship({type:'cruiser',length:105,beam:16,naval:false});T.hull(measured);
assert(Math.abs(measured.hull.length-105)<1e-6&&Math.abs(measured.hull.beam-16)<1e-6,'unlabelled hull measured from its bounding boxes');
const across=T.strike(freighter,{x:-40,z:10},{x:40,z:10},0);
assert(across&&Math.abs(across.x+9)<1.6&&Math.abs(across.z-10)<1e-9,'beam contact at the side plating');
assert.equal(T.strike(freighter,{x:-200,z:30},{x:-200,z:60},4),null,'old circle (72.6 m) would have counted this 200 m abeam pass');
assert.equal(T.strike(freighter,{x:20,z:-100},{x:20,z:100},4),null,'20 m abeam is a miss, not a hit');
// rotated ship: the same physical crossing in its own frame
const turned=ship({yaw:Math.PI/2});
assert(T.strike(turned,{x:10,z:-40},{x:10,z:40},0),'hull follows the ship heading');
// --- track angle and glancing ---
assert(Math.abs(T.trackAngle(freighter,{x:1,z:0})-90)<1e-9);
assert(T.trackAngle(freighter,{x:Math.sin(.1),z:Math.cos(.1)})<6);
assert.equal(T.glanceChance(75),0);assert.equal(T.glanceChance(40),0);
assert(T.glanceChance(5,'ace')>.6&&T.glanceChance(5,'rookie')<T.glanceChance(5,'veteran'),'rookie forgives fine angles more');
for(const [f,p] of [[.1,'stern'],[.5,'midships'],[.9,'bow']])assert.equal(T.section(f),p);
// --- distance-limited run with arming, frame-rate independent ---
for(const fps of [20,60,120]){
 const t=fish(0,0,{x:1,z:0});let armedAt=null;
 for(let i=0;i<fps*80&&!t.spent;i++){T.advance(t,1/fps);if(t.armed&&armedAt==null)armedAt=t.run;}
 assert(Math.abs(armedAt-T.ARM_RUN)<23/fps+1e-9,fps+' FPS arms at '+armedAt);
 assert(t.spent&&Math.abs(t.run-T.MAX_RUN)<23/fps+1e-9,fps+' FPS runs '+T.MAX_RUN+' m, not 375 m');
}
assert(T.MAX_RUN>950+T.hull(freighter).length,'the HUD DROP NOW window (350-950 m) is now reachable');
// --- outcomes ---
const contact={fraction:.5};
assert.equal(T.resolve(fish(0,0,{x:1,z:0},120),freighter,contact).result,'unarmed');
assert.equal(T.resolve(fish(0,0,{x:1,z:0},400),freighter,contact,{random:()=>0}).result,'hit','beam shots never glance');
assert.equal(T.resolve(fish(0,0,{x:.08,z:1},400),freighter,contact,{random:()=>0}).result,'glanced');
assert.equal(T.resolve(fish(0,0,{x:.08,z:1},400),freighter,contact,{random:()=>.99}).result,'hit');
const dud=fish(0,0,{x:1,z:0},400);dud.dud=true;assert.equal(T.resolve(dud,freighter,contact,{random:()=>.99}).result,'dud');
assert(T.resolve(fish(0,0,{x:1,z:0},400),freighter,contact,{random:()=>.99}).beam);
// --- combing captains ---
// A led beam shot: the ship is placed so that, holding course, it arrives over the aim point
// exactly when the fish does. Returns the contact (with track angle) or a miss.
function combRun(type,fps,{detect=900,diff='veteran',drop=600,margin=4}={}){
 const s=ship({type}),t=fish(-drop,0,{x:1,z:0},300),announced=[];let turnRate=0,contact=null;
 s.group.position.z=-s.speed*drop/23;s.group.updateMatrixWorld(true);
 const prev=new THREE.Vector3();
 for(let i=0;i<fps*70&&!contact&&!t.spent;i++){
  const before=T.yaw(s),h=T.captain(s,1/fps,[t],{detect,diff,announce:x=>announced.push(x)});
  if(h!=null)T.steer(s,h,1/fps,1,diff);turnRate=Math.max(turnRate,Math.abs(T.wrap(T.yaw(s)-before))*fps);
  const f=T.forward(s);s.group.position.x+=f.x*s.speed/fps;s.group.position.z+=f.z*s.speed/fps;s.group.updateMatrixWorld(true);
  prev.copy(t.mesh.position);t.mesh.position.x+=t.dir.x*23/fps;t.mesh.position.z+=t.dir.z*23/fps;T.advance(t,1/fps);
  const c=T.strike(s,prev,t.mesh.position,margin);if(c)contact={angle:T.trackAngle(s,t.dir),part:T.section(c.fraction)};
 }
 return {heading:T.yaw(s),contact,turnRate,announced:announced.length};
}
const runs={};
for(const fps of [20,60,120]){
 const d=combRun('destroyer',fps),f=combRun('freighter',fps);runs[fps]={d,f};
 assert.equal(d.announced,1,'one radio call per comb');
 assert(d.turnRate<=T.TYPE.destroyer.turn*T.DIFF.veteran.turn+1e-6,'bounded helm at '+fps+' FPS');
 assert(f.contact&&f.contact.angle>55,'a led 600 m beam shot still finds the freighter broadside at '+fps+' FPS ('+(f.contact&&f.contact.angle.toFixed(1))+'°)');
 assert(!d.contact||d.contact.angle<f.contact.angle-20,'a destroyer combs the same shot hard');
}
const angleOf=r=>r.contact?r.contact.angle:0;
for(const k of ['d','f'])assert(Math.abs(angleOf(runs[20][k])-angleOf(runs[120][k]))<3,'frame-rate independent combing');
assert(angleOf(combRun('freighter',60,{drop:950}))<angleOf(runs[60].f)-8,'long shots give the captain time to comb');
assert(angleOf(combRun('freighter',60,{diff:'rookie',margin:10}))>angleOf(runs[60].f),'rookie captains react later');
assert.equal(combRun('destroyer',60,{detect:T.detectRange({timeMode:'night'})}).announced,1,'at night the wake is seen late');
assert(angleOf(combRun('destroyer',60,{detect:T.detectRange({timeMode:'night'})}))>angleOf(runs[60].d)+20,'night attacks beat the comb');
const moored=ship();moored.def.moored=true;assert.equal(T.captain(moored,.1,[fish(-300,0,{x:1,z:0},300)]),null);
const harmless=ship();assert.equal(T.captain(harmless,5,[fish(-300,400,{x:1,z:0},300)]),null,'a fish that passes ahead is not a threat');
assert(T.detectRange({weather:'rain'})<T.detectRange()&&T.detectRange({timeMode:'dusk'})<T.detectRange());
// --- hit location: stern jams the rudder, bow floods forward, midships floods the engine room ---
const scene=new THREE.Scene(),damage=ShipDamage.create(THREE,scene);
const aft=ship(),fore=ship(),mid=ship();for(const s of [aft,fore,mid])scene.add(s.group);
damage.hit(aft,aft.group.localToWorld(new THREE.Vector3(9,1,-55)),'torpedo');
assert(damage.rudderJam(aft)!==0&&/RUDDER JAMMED/.test(damage.status(aft))&&damage.get(aft).lastPart==='rudder');
damage.hit(fore,fore.group.localToWorld(new THREE.Vector3(9,1,55)),'torpedo');
assert(damage.performance(fore).speed<.5&&/FLOODING FORWARD/.test(damage.status(fore))&&damage.rudderJam(fore)===0);
damage.hit(mid,mid.group.localToWorld(new THREE.Vector3(9,1,0)),'torpedo');
assert(damage.performance(mid).speed<.5&&damage.get(mid).lastPart==='engine');
damage.hit(fore,fore.group.localToWorld(new THREE.Vector3(9,1,55)),'shell');assert.equal(damage.rudderJam(fore),0,'gunfire never jams the rudder');
// an older checkpoint without the new systems keeps working
const saved=damage.checkpoint(mid);delete saved.systems.bow;delete saved.systems.jam;const again=ship();scene.add(again.group);damage.restoreCheckpoint(again,saved);
damage.hit(again,again.group.localToWorld(new THREE.Vector3(9,1,55)),'torpedo');assert(Number.isFinite(damage.performance(again).speed));
damage.dispose();
console.log('Torpedo attack: '+T.MAX_RUN+' m run, arms at '+T.ARM_RUN+' m, real hull contact, glancing fine tracks, stern jam/bow flooding, combing captains at 20/60/120 FPS (600 m led beam shot at impact: freighter '+angleOf(runs[60].f).toFixed(0)+'°, destroyer '+(runs[60].d.contact?angleOf(runs[60].d).toFixed(0)+'°':'combed clear')+').');
