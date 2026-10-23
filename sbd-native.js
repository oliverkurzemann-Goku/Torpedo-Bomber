/* HappySunpore Dauntless, CC BY 4.0. Named original geometry and clone-local caches.
 * See assets/aircraft/SBD-CREDITS.txt. Forward +Z, metres. */
(function(global){
 'use strict';
 const T=global.THREE,cache=new WeakMap(),clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
 function source(o){return o?.getObjectByName('SBD_HappySunpore_v1');}
 function isNative(o){return source(o)?.userData.nativeAircraft==='sbd-201';}
 function frameOf(o){return o?.getObjectByName('sbdGear')?.parent;}
 function install(frame){
  if(!isNative(frame))return false;if(frame.userData.nativeSBD)return true;
  const gear=frame.getObjectByName('sbdGear');frame.updateMatrixWorld(true);frame.attach(gear);
  const flaps=new T.Group();flaps.name='flightFlaps';flaps.userData.articulationPart=true;frame.add(flaps);frame.updateMatrixWorld(true);
  for(const name of ['BrakeLowerLeft','BrakeLowerRight'])flaps.attach(frame.getObjectByName(name));
  frame.userData.nativeSBD=true;pose(frame,1,{left:0,right:0});return true;
 }
 function data(o){
  if(!isNative(o))return null;const frame=frameOf(o);if(!frame)return null;if(cache.has(frame))return cache.get(frame);
  const parts={};for(const name of ['GearLeft','GearRight','AileronLeft','AileronRight','ElevatorLeft','ElevatorRight','Rudder','sbdHook','CenterBomb','RearGun','GunMuzzleLeft','GunMuzzleRight','RearMuzzleLeft','RearMuzzleRight']){parts[name]=frame.getObjectByName(name);if(!parts[name])throw Error('Incomplete Dauntless: '+name);}
  const brakes={};for(const name of ['BrakeUpperLeft','BrakeUpperRight','BrakeLowerLeft','BrakeLowerRight']){
   const part=frame.getObjectByName(name);if(!part)throw Error('Missing Dauntless brake '+name);
   brakes[name]={part,base:new T.Quaternion().fromArray(part.userData.restQuaternion)};
  }
  const ports=[parts.RearMuzzleLeft.position.clone(),parts.RearMuzzleRight.position.clone()];
  const d={frame,parts,brakes,dive:0,rearTarget:new T.Quaternion(),ports,rest:ports[0].clone().add(ports[1]).multiplyScalar(.5).normalize(),axis:new T.Vector3(1,0,0),q:new T.Quaternion()};cache.set(frame,d);return d;
 }
 function pose(o,gear,flaps={left:0,right:0},dive){
  const d=data(o);if(!d)return;const g=clamp(gear);if(dive!=null)d.dive=clamp(dive);
  d.parts.GearLeft.rotation.z=-Math.PI/2*g;d.parts.GearRight.rotation.z=Math.PI/2*g;
  const group=d.frame.getObjectByName('sbdGear');group.visible=true;
  for(const label of ['Left','Right']){
   const up=d.brakes['BrakeUpper'+label],dn=d.brakes['BrakeLower'+label],fl=clamp(label==='Left'?flaps.left:flaps.right);
   up.part.visible=dn.part.visible=true;up.part.quaternion.copy(up.base).multiply(d.q.setFromAxisAngle(d.axis,1.08*d.dive));
   dn.part.quaternion.copy(dn.base).multiply(d.q.setFromAxisAngle(d.axis,-Math.max(.72*fl,1.08*d.dive)));
  }
  if(d.frame.userData.sbdGear!==g){for(let p=d.frame;p;p=p.parent)delete p.userData.groundSupports;d.frame.userData.sbdGear=g;}
 }
 function controls(o,roll,pitch){
  const d=data(o);if(!d)return;const r=Math.max(-1,Math.min(1,roll||0)),p=Math.max(-1,Math.min(1,pitch||0));
  d.parts.AileronLeft.rotation.x=.22*r;d.parts.AileronRight.rotation.x=-.22*r;
  d.parts.ElevatorLeft.rotation.x=-.25*p;d.parts.ElevatorRight.rotation.x=-.25*p;d.parts.Rudder.rotation.y=-.20*r;
 }
 function update(o,{gear=1,flaps={left:0,right:0},dive=0,hook=0,bombs=1,roll=0,pitch=0,dt=1/60}={}){
  const d=data(o);if(!d)return;pose(o,gear,flaps,dive);controls(o,roll,pitch);
  d.parts.sbdHook.visible=true;d.parts.sbdHook.rotation.x=-.8*clamp(hook);d.parts.CenterBomb.visible=bombs>0;
  d.parts.RearGun.quaternion.slerp(d.rearTarget,1-Math.exp(-Math.max(0,dt)*12));
 }
 function frontMuzzles(o,space){
  const d=data(o);if(!d)return null;return ['GunMuzzleLeft','GunMuzzleRight'].map(n=>{d.parts[n].updateWorldMatrix(true,false);return space.worldToLocal(d.parts[n].getWorldPosition(new T.Vector3()));});
 }
 function rear(o){const d=data(o);return d?{pivot:d.parts.RearGun,ports:d.ports}:null;}
 function aimRear(o,worldDirection,dt=1/60){
  const d=data(o);if(!d)return;const pivot=d.parts.RearGun;
  pivot.parent.updateWorldMatrix(true,false);const direction=worldDirection.clone().applyQuaternion(pivot.parent.getWorldQuaternion(new T.Quaternion()).invert());
  const yaw=Math.max(-1.15,Math.min(1.15,Math.atan2(direction.x,-direction.z))),elev=Math.max(.01,Math.min(1.32,Math.atan2(direction.y,Math.hypot(direction.x,direction.z))));
  direction.set(Math.sin(yaw)*Math.cos(elev),Math.sin(elev),-Math.cos(yaw)*Math.cos(elev));d.rearTarget.setFromUnitVectors(d.rest,direction);pivot.quaternion.slerp(d.rearTarget,1-Math.exp(-Math.max(0,dt)*12));
 }
 function reset(o){const d=data(o);if(d){d.rearTarget.identity();d.parts.RearGun.quaternion.identity();}}
 global.SBDRig={isNative,install,pose,controls,update,frontMuzzles,rear,aimRear,reset};if(typeof module==='object'&&module.exports)module.exports=global.SBDRig;
})(typeof window==='undefined'?globalThis:window);
