/* Native Me 262 Noel, metres, +Z nose. Original surfaces and materials retained. */
(function(global){
 'use strict';
 const clamp=v=>Math.max(0,Math.min(1,v||0));
 function source(frame){return frame?.getObjectByName('Me262_Noel');}
 function isNative(frame){return source(frame)?.userData.nativeAircraft==='me262-noel-v1';}
 function install(frame){
  if(!isNative(frame))return false;
  if(frame.userData.nativeMe262)return true;
  const names=['GearLeft','GearRight','NoseGear','FlapLeft','FlapRight','AileronLeft','AileronRight','ElevatorLeft','ElevatorRight','Rudder'];
  for(const name of names)if(!frame.getObjectByName(name))throw Error('Me 262 missing '+name);
  const gear=new global.THREE.Group(),flaps=new global.THREE.Group();gear.name='gear';flaps.name='flightFlaps';
  gear.userData.articulationPart=flaps.userData.articulationPart=true;frame.add(gear,flaps);frame.updateMatrixWorld(true);
  for(const name of names.slice(0,3)){const part=frame.getObjectByName(name);gear.attach(part);part.userData.articulationPart=true;}
  for(const name of names.slice(3,5))flaps.attach(frame.getObjectByName(name));
  frame.userData.nativeMe262=true;pose(frame,1);return true;
 }
 function pose(frame,deployment,flaps={left:0,right:0}){
  if(!frame?.userData.nativeMe262)return;
  const g=clamp(deployment),gear=frame.getObjectByName('gear');gear.visible=g>.005;
  frame.getObjectByName('GearLeft').rotation.z=1.55*(1-g);
  frame.getObjectByName('GearRight').rotation.z=-1.55*(1-g);
  frame.getObjectByName('NoseGear').rotation.x=1.5*(1-g);
  frame.getObjectByName('FlapLeft').rotation.x=.7*clamp(flaps.left);
  frame.getObjectByName('FlapRight').rotation.x=.7*clamp(flaps.right);
  if(gear.userData.deployment!==g){for(let p=frame;p;p=p.parent)delete p.userData.groundSupports;gear.userData.deployment=g;}
 }
 function controls(frame,roll,pitch){
  if(!frame?.userData.nativeMe262)return;
  const r=Math.max(-1,Math.min(1,roll||0)),p=Math.max(-1,Math.min(1,pitch||0));
  frame.getObjectByName('AileronLeft').rotation.x=.3*r;frame.getObjectByName('AileronRight').rotation.x=-.3*r;
  frame.getObjectByName('ElevatorLeft').rotation.x=-.28*p;frame.getObjectByName('ElevatorRight').rotation.x=-.28*p;
  frame.getObjectByName('Rudder').rotation.y=-.2*r;
 }
 function exhaust(frame){
  const src=source(frame);if(!src)return null;frame.updateWorldMatrix(true,true);
  return [-1,1].map(side=>frame.worldToLocal(src.localToWorld(new global.THREE.Vector3(side*2.22,.965,-.66))));
 }
 global.Me262Rig={isNative,install,pose,controls,exhaust};
 if(typeof module==='object'&&module.exports)module.exports=global.Me262Rig;
})(typeof window==='undefined'?globalThis:window);
