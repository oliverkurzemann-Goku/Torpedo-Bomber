/* Original Me 163 B: tailless elevons, split landing flaps and retractable skid.
 * Model-local axes are stored on the named hinges; no runtime mesh cutting or synthetic gear. */
(function(global){
 'use strict';
 const T=()=>global.THREE,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0)),cache=new WeakMap();
 function source(frame){return frame?.getObjectByName('Me163B_Original');}
 function isNative(frame){return source(frame)?.userData.nativeAircraft==='me163b-original-v1';}
 function data(frame){
  const src=source(frame);if(!src)return null;if(cache.has(src))return cache.get(src);
  const parts={};for(const name of ['LandingSkid','TailGear','ElevonLeft','ElevonRight','LandingFlapLeft','LandingFlapRight','Rudder','NoseGenerator']){
   const o=src.getObjectByName(name);if(!o)throw Error('Me 163 missing '+name);parts[name]=o;
  }
  const d={src,parts,axis:new (T().Vector3)(),q:new (T().Quaternion)()};cache.set(src,d);return d;
 }
 function install(frame){if(!isNative(frame))return false;data(frame);frame.userData.nativeMe163=true;pose(frame,1);return true;}
 function pose(frame,deployment,flaps={left:0,right:0}){
  const d=data(frame);if(!d)return;const g=clamp(deployment);
  d.parts.LandingSkid.position.y=.24-.44*g;d.parts.TailGear.rotation.x=1.15*(1-g);
  for(const side of ['Left','Right'])d.parts['LandingFlap'+side].rotation.x=-.75*clamp(flaps[side.toLowerCase()]);
  // Keep the skin and stowed parts present; the skid retracts into the belly rather than vanishing.
  d.src.getObjectByName('gear').visible=true;
  if(d.src.userData.skidDeployment!==g){for(let p=d.src;p;p=p.parent)delete p.userData.groundSupports;d.src.userData.skidDeployment=g;}
 }
 function controls(frame,roll,pitch){
  const d=data(frame);if(!d)return;const r=clamp(roll,-1,1),p=clamp(pitch,-1,1);
  for(const side of ['Left','Right']){
   const n=d.parts['Elevon'+side],angle=-.28*p+(side==='Left'?.28:-.28)*r;
   n.quaternion.setFromAxisAngle(d.axis.fromArray(n.userData.axis),clamp(angle,-.48,.48));
  }
  const rudder=d.parts.Rudder;rudder.quaternion.setFromAxisAngle(d.axis.fromArray(rudder.userData.axis),-.25*r);
 }
 function muzzles(frame,space){const d=data(frame);if(!d)return null;return [0,1].map(i=>{const n=d.src.getObjectByName('Muzzle'+i);n.updateWorldMatrix(true,false);const p=n.getWorldPosition(new (T().Vector3)());p.name=n.name;return space?space.worldToLocal(p):p;});}
 function generator(frame,dt,speed){const d=data(frame);if(d)d.parts.NoseGenerator.rotation.z-=Math.max(0,dt)*Math.min(24,Math.max(0,speed)*.17);}
 global.Me163Rig={isNative,install,pose,controls,muzzles,generator};
 if(typeof module==='object'&&module.exports)module.exports=global.Me163Rig;
})(typeof window==='undefined'?globalThis:window);
