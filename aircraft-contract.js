/* Rig contract v1 for replacement aircraft. The model names and hinges its own moving parts,
 * so the game runs no propeller, gear or flap search on it and never cuts its geometry.
 * Frame: metres, X span, +Y up, +Z nose. Specification: app/model-candidates/RIG-CONTRACT.md.
 * Shared by the game (window.AircraftContract) and scripts/check-rig-contract.mjs. */
(function(global){
 'use strict';
 const VERSION=1;
 // 0..1 drives use rig.range [angle at 0, angle at 1]; -1..1 drives use rig.gain (angle at +1).
 const RANGE_DRIVES=['gear','flapLeft','flapRight','canopy','radiator'],GAIN_DRIVES=['roll','pitch','yaw'];
 const CLASSES={
  'tailwheel-fighter':{
   parts:{
    Propeller:{drive:'prop'},
    gear:{group:true},
    GearLeft:{drive:'gear',parent:'gear'},GearRight:{drive:'gear',parent:'gear'},TailGear:{drive:'gear',parent:'gear'},
    flightFlaps:{group:true},
    FlapLeft:{drive:'flapLeft',parent:'flightFlaps'},FlapRight:{drive:'flapRight',parent:'flightFlaps'},
    AileronLeft:{drive:'roll'},AileronRight:{drive:'roll'},
    ElevatorLeft:{drive:'pitch'},ElevatorRight:{drive:'pitch'},Rudder:{drive:'yaw'}
   },
   optional:{Canopy:'canopy',GearDoorLeft:'gear',GearDoorRight:'gear',RadiatorFlapLeft:'radiator',RadiatorFlapRight:'radiator'},
   tyres:{GearLeft:1,GearRight:1,TailGear:1},
   muzzles:1,
   budget:{triangles:75000,meshes:48,materials:16,images:8,imageSize:2048,bytes:12*1024*1024}
  }
 };
 const MOVING=['GearLeft','GearRight','TailGear','FlapLeft','FlapRight','AileronLeft','AileronRight','ElevatorLeft','ElevatorRight','Rudder','Canopy','GearDoorLeft','GearDoorRight','RadiatorFlapLeft','RadiatorFlapRight'];
 const T=()=>global.THREE,cache=new WeakMap(),roots=new WeakMap(),clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
 function source(o){
  if(!o?.traverse)return null;if(roots.has(o))return roots.get(o);
  let found=null;o.traverse(n=>{if(!found&&n.userData?.rigContract===VERSION)found=n;});if(found)roots.set(o,found);return found;
 }
 function isContract(o){return !!source(o);}
 function data(o){
  const src=source(o);if(!src)return null;if(cache.has(src))return cache.get(src);
  const spec=CLASSES[src.userData.class];if(!spec)throw Error('Unknown rig class '+src.userData.class);
  const parts={},axis=new (T().Vector3)();
  for(const name of [...Object.keys(spec.parts),...Object.keys(spec.optional)]){
   // install() renames the rotor to the game's 'prop'; clones of an installed template keep that name.
   let node=src.getObjectByName(name);if(!node&&name==='Propeller')src.traverse(n=>{if(!node&&n.userData.rig?.drive==='prop')node=n;});
   if(!node){if(spec.parts[name])throw Error('Contract aircraft lacks '+name);continue;}
   parts[name]=node;
   if(node.userData.rig&&!node.userData.rigRest)node.userData.rigRest=node.quaternion.toArray();
  }
  const muzzles=[];src.traverse(n=>{if(/^Muzzle/.test(n.name))muzzles.push(n);});
  const d={src,spec,parts,muzzles,q:new (T().Quaternion)(),r:new (T().Quaternion)(),axis};cache.set(src,d);return d;
 }
 function turn(d,node,amount){
  const rig=node.userData.rig;if(!rig)return;
  const angle=GAIN_DRIVES.includes(rig.drive)?rig.gain*clamp(amount,-1,1):rig.range[0]+(rig.range[1]-rig.range[0])*clamp(amount);
  d.axis.fromArray(rig.axis).normalize();node.quaternion.fromArray(node.userData.rigRest).multiply(d.q.setFromAxisAngle(d.axis,angle));
 }
 function install(frame){
  const d=data(frame);if(!d)return false;
  // The game spins its rotor with prop.rotation.z; the contract requires the rotor node to be
  // unrotated with its axis on local Z, so that Euler channel is exactly the shaft.
  d.parts.Propeller.name='prop';d.parts.Propeller.userData.articulationPart=true;
  d.parts.gear.userData.articulationPart=true;d.parts.flightFlaps.userData.articulationPart=true;
  frame.userData.nativeContract=true;pose(frame,1,{left:0,right:0});return true;
 }
 function pose(o,gear,flaps={left:0,right:0},extra={}){
  const d=data(o);if(!d)return;const g=clamp(gear);
  for(const name of MOVING){
   const node=d.parts[name],drive=node?.userData.rig?.drive;if(!node||GAIN_DRIVES.includes(drive))continue;
   turn(d,node,drive==='gear'?g:drive==='flapLeft'?flaps.left:drive==='flapRight'?flaps.right:extra[drive]||0);
  }
  d.parts.gear.visible=true;
  if(d.src.userData.contractGear!==g){for(let p=d.src;p;p=p.parent)delete p.userData.groundSupports;d.src.userData.contractGear=g;}
 }
 function controls(o,roll,pitch){
  const d=data(o);if(!d)return;
  // No rudder pedals in these games: the rudder follows the stick's roll axis, as in the native rigs.
  for(const name of ['AileronLeft','AileronRight','ElevatorLeft','ElevatorRight','Rudder']){
   const node=d.parts[name];turn(d,node,node.userData.rig.drive==='pitch'?pitch:roll);
  }
 }
 function muzzles(o,space){
  const d=data(o);if(!d)return null;const V=T().Vector3;
  return d.muzzles.map(n=>{n.updateWorldMatrix(true,false);const p=n.getWorldPosition(new V());if(space)space.worldToLocal(p);p.name=n.name;return p;});
 }
 global.AircraftContract={VERSION,CLASSES,RANGE_DRIVES,GAIN_DRIVES,MOVING,isContract,source,install,pose,controls,muzzles};
 if(typeof module==='object'&&module.exports)module.exports=global.AircraftContract;
})(typeof window==='undefined'?globalThis:window);
