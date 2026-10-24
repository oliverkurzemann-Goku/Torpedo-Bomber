/* helijah B-17: original mechanical parts, +Z forward, metres. CC BY 4.0.
 * See assets/aircraft/B17-CREDITS.txt. Caches belong to individual scene clones. */
(function(global){
 'use strict';
 const cache=new WeakMap(),rad=Math.PI/180;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function source(frame){return frame?.getObjectByName('B17_Helijah_v1');}
 function isNative(frame){return source(frame)?.userData.nativeAircraft==='b17-helijah-v1';}
 function install(frame){
  if(!isNative(frame))return false;
  if(frame.userData.nativeB17)return true;
  const T=global.THREE,gear=new T.Group(),prop=new T.Group(),flaps=new T.Group();
  gear.name='gear';prop.name='prop';flaps.name='flightFlaps';gear.userData.articulationPart=true;flaps.userData.articulationPart=true;
  frame.add(gear,prop,flaps);frame.updateMatrixWorld(true);
  for(const name of ['GearLeft','GearRight','TailGear']){
   const part=frame.getObjectByName(name);if(!part)throw Error('B-17 missing '+name);gear.attach(part);part.userData.articulationPart=true;
  }
  for(const side of ['L_Outer','L_Inner','R_Inner','R_Outer']){
   const part=frame.getObjectByName('Propeller_'+side);if(!part)throw Error('B-17 missing original rotor '+side);
   prop.attach(part);part.userData.bomberRotor=true;part.userData.spinAxis='z';part.userData.articulationPart=true;
  }
  for(const name of ['FlapLeft','FlapRight'])flaps.attach(frame.getObjectByName(name));
  frame.userData.nativeB17=true;pose(frame,1,{left:0,right:0});return true;
 }
 function pose(frame,deployment,flaps={left:0,right:0}){
  if(!frame?.userData.nativeB17)return;
  const g=clamp(Number(deployment)||0,0,1),gear=frame.getObjectByName('gear');gear.visible=g>.005;
  for(const name of ['GearLeft','GearRight','TailGear'])frame.getObjectByName(name).rotation.x=(name==='TailGear'?80:88)*rad*(1-g);
  frame.getObjectByName('FlapLeft').rotation.x=-40*rad*clamp(flaps.left||0,0,1);
  frame.getObjectByName('FlapRight').rotation.x=-40*rad*clamp(flaps.right||0,0,1);
  if(gear.userData.deployment!==g){for(let p=frame;p;p=p.parent)delete p.userData.groundSupports;gear.userData.deployment=g;}
 }
 function controls(frame,roll,pitch){
  if(!frame?.userData.nativeB17)return;
  const r=clamp(roll||0,-1,1),p=clamp(pitch||0,-1,1);
  frame.getObjectByName('AileronLeft').rotation.x=.25*r;frame.getObjectByName('AileronRight').rotation.x=-.25*r;
  frame.getObjectByName('ElevatorLeft').rotation.x=-.28*p;frame.getObjectByName('ElevatorRight').rotation.x=-.28*p;
  frame.getObjectByName('Rudder').rotation.y=-.30*r;
 }
 function state(frame){
  if(!isNative(frame))return null;if(cache.has(frame))return cache.get(frame);
  const T=global.THREE;
  const definitions=[
   ['Dorsal','Top',[0,.9,.3],Math.PI,.20,[-.02,1.40],Math.PI],
   ['Ball','Ball',[0,-.9,-.2],Math.PI,0,[-1.45,.10],Math.PI],
   ['Chin','Nose',[0,0,1],0,-.48,[-.60,.35],1.05],
   ['Tail','Tail',[0,0,-1],Math.PI,.20,[-.55,.55],.70],
   ['WaistL','Waist_L',[-.9,0,-.4],null,0,null,0],
   ['WaistR','Waist_R',[.9,0,-.4],null,0,null,0]
  ];
  const stations=definitions.map(([kind,label,arc,restYaw,restElev,pitchLimit,yawLimit])=>{
   const names=kind.startsWith('Waist')?['Muzzle_'+label]:['Muzzle_'+label+'_L','Muzzle_'+label+'_R'];
   const nodes=names.map(n=>frame.getObjectByName(n));if(nodes.some(n=>!n))throw Error('B-17 missing gun origin '+label);
   nodes[0].updateWorldMatrix(true,false);const pos=frame.worldToLocal(nodes[0].getWorldPosition(new T.Vector3()));
   return {kind,pos,arc:new T.Vector3(...arc).normalize(),nodes,
    yaw:restYaw==null?null:frame.getObjectByName('Turret_'+kind+'_Yaw'),
    pitch:restYaw==null?null:frame.getObjectByName('Turret_'+kind+'_Pitch'),restYaw,restElev,pitchLimit,yawLimit};
  });
  const data={stations,target:new T.Vector3(),origin:new T.Vector3()};cache.set(frame,data);return data;
 }
 function stations(frame){return state(frame)?.stations||null;}
 function track(frame,target,dt){
  const data=state(frame);if(!data)return;
  frame.updateWorldMatrix(true,false);data.target.copy(target);frame.worldToLocal(data.target);
  const blend=1-Math.exp(-Math.max(0,dt)*7);
  for(const s of data.stations){
   if(!s.yaw||!s.pitch)continue;
   s.yaw.updateWorldMatrix(true,false);s.yaw.getWorldPosition(data.origin);frame.worldToLocal(data.origin);
   const dx=data.target.x-data.origin.x,dy=data.target.y-data.origin.y,dz=data.target.z-data.origin.z;
   let yaw=Math.atan2(dx,dz)-s.restYaw;while(yaw>Math.PI)yaw-=Math.PI*2;while(yaw< -Math.PI)yaw+=Math.PI*2;
   const angle=clamp(yaw,-s.yawLimit,s.yawLimit),elev=clamp(Math.atan2(dy,Math.hypot(dx,dz)),...s.pitchLimit);
   const pitch=(s.restYaw===0?-1:1)*(elev-s.restElev);
   s.yaw.rotation.y+=(angle-s.yaw.rotation.y)*blend;s.pitch.rotation.x+=(pitch-s.pitch.rotation.x)*blend;
  }
 }
 function muzzle(frame,station,shot=0){
  if(!frame?.userData.nativeB17||!station.nodes)return null;
  const node=station.nodes[shot%station.nodes.length];node.updateWorldMatrix(true,false);
  return node.getWorldPosition(new global.THREE.Vector3());
 }
 global.B17Rig={isNative,install,pose,controls,stations,track,muzzle};
 if(typeof module==='object'&&module.exports)module.exports=global.B17Rig;
})(typeof window==='undefined'?globalThis:window);
