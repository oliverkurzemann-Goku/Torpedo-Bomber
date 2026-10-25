/* Original Ju 87 B-2: fixed gear and separately authored surfaces, metres, +Z nose. */
(function(global){
 'use strict';
 const clamp=v=>Math.max(0,Math.min(1,v||0));
 function source(frame){return frame?.getObjectByName('Ju87B2_Original');}
 function isNative(frame){return source(frame)?.userData.nativeAircraft==='ju87b2-original-v1';}
 function install(frame){
  if(!isNative(frame))return false;
  if(frame.userData.nativeJu87)return true;
  for(const name of ['Propeller','AileronLeft','AileronRight','ElevatorLeft','ElevatorRight','Rudder','DiveBrakeLeft','DiveBrakeRight'])if(!frame.getObjectByName(name))throw Error('Ju 87 missing '+name);
  const rotor=frame.getObjectByName('Propeller');rotor.name='prop';rotor.userData.articulationPart=true;
  for(const side of ['Left','Right'])frame.getObjectByName('DiveBrake'+side).name='diveBrake'+side;
  frame.userData.nativeJu87=true;pose(frame,1);return true;
 }
 function pose(frame,_deployment,flaps={left:0,right:0}){
  if(!frame?.userData.nativeJu87)return;
  for(const side of ['Left','Right'])for(const section of ['Inner','Middle','Outer'])frame.getObjectByName(section+'Flap'+side).rotation.x=-.7*clamp(flaps[side.toLowerCase()]);
 }
 function controls(frame,roll,pitch){
  if(!frame?.userData.nativeJu87)return;
  const r=Math.max(-1,Math.min(1,roll||0)),p=Math.max(-1,Math.min(1,pitch||0));
  frame.getObjectByName('AileronLeft').rotation.x=.28*r;frame.getObjectByName('AileronRight').rotation.x=-.28*r;
  frame.getObjectByName('ElevatorLeft').rotation.x=-.28*p;frame.getObjectByName('ElevatorRight').rotation.x=-.28*p;
  frame.getObjectByName('Rudder').rotation.y=-.3*r;
 }
 function dive(frame,amount){if(frame?.userData.nativeJu87)for(const side of ['Left','Right'])frame.getObjectByName('diveBrake'+side).rotation.x=-Math.PI/2*clamp(amount);}
 global.Ju87Rig={isNative,install,pose,controls,dive};
 if(typeof module==='object'&&module.exports)module.exports=global.Ju87Rig;
})(typeof window==='undefined'?globalThis:window);
