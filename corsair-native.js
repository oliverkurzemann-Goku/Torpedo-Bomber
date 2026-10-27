/* Original F4U-1D native named geometry. Metres, nose +Z. */
(function(g){
 'use strict';
 const T=g.THREE,cache=new WeakMap(),clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
 function isNative(o){return o?.getObjectByName('CorsairF4U1D_Original')?.userData.nativeAircraft==='corsair-f4u1d-original-v1';}
 function data(o){if(!isNative(o))return null;const frame=o.getObjectByName('sbdGear')?.parent;if(!frame)return null;if(cache.has(frame))return cache.get(frame);const parts={};frame.traverse(n=>{if(n.name)parts[n.name]=n;});const d={frame,parts};cache.set(frame,d);return d;}
 function install(frame){
  if(!isNative(frame))return false;if(frame.userData.nativeCorsair)return true;
  for(const n of ['LandingGear','Propeller','ArrestorHook','GearLeft','GearRight','TailGear','BubbleCanopyGlass'])if(!frame.getObjectByName(n))throw Error('Corsair missing '+n);
  const gear=frame.getObjectByName('LandingGear');gear.name='sbdGear';frame.updateMatrixWorld(true);frame.attach(gear);
  const prop=frame.getObjectByName('Propeller');prop.name='sbdRotorBlade';prop.userData.spinAxis='z';
  const hook=frame.getObjectByName('ArrestorHook');hook.name='sbdHook';Object.assign(hook.userData,{hookAxis:'x',hookDownAngle:-.58,hookUpAngle:0});
  frame.traverse(n=>{if(n.isMesh){n.castShadow=!n.material.transparent;n.receiveShadow=!n.material.transparent;if(n.material.transparent){n.material.depthWrite=false;n.renderOrder=4;}}});
  frame.userData.nativeCorsair=true;pose(frame,1);return true;
 }
 function rotate(part,amount){if(part)part.quaternion.setFromAxisAngle(new T.Vector3().fromArray(part.userData.axis||[1,0,0]),amount);}
 function pose(o,amount,flaps={left:0,right:0},dive=0){
  const d=data(o);if(!d)return;const gear=clamp(amount),main=Math.max(gear,clamp(dive));d.parts.sbdGear.visible=main>.005;d.parts.sbdGear.scale.setScalar(1);
  // AN 01-45HA-1 p.13: dive braking extends the main wheels only.
  for(const [side,sign]of [['Left',-1],['Right',1]]){d.parts['Gear'+side].rotation.x=Math.PI/2*(1-main);d.parts['WheelAxle'+side].rotation.y=sign*Math.PI/2*(1-main);for(const section of ['Inner','Middle','Outer'])rotate(d.parts[section+'Flap'+side],-Math.PI*50/180*clamp(flaps[side.toLowerCase()]));}
  d.parts.TailGear.rotation.x=-1.25*(1-gear);d.parts.TailGear.visible=gear>.005;
  if(d.gear!==gear||d.main!==main){for(let p=d.frame;p;p=p.parent)delete p.userData.groundSupports;d.gear=gear;d.main=main;d.frame.userData.gearDeployment=gear;}
 }
 function controls(o,roll,pitch){const d=data(o);if(!d)return;const r=Math.max(-1,Math.min(1,roll||0)),p=Math.max(-1,Math.min(1,pitch||0));rotate(d.parts.AileronLeft,-.25*r);rotate(d.parts.AileronRight,.25*r);rotate(d.parts.ElevatorLeft,-.28*p);rotate(d.parts.ElevatorRight,-.28*p);rotate(d.parts.Rudder,-.28*r);}
 function stores(o,bombs=0,rockets=0,bombScale=1){const d=data(o);if(!d)return;for(let i=0;i<2;i++){const b=d.parts['Bomb'+(i?'Right':'Left')];if(b){b.visible=bombs>i;b.scale.setScalar(bombScale);}}for(let i=0;i<8;i++){const r=d.parts['Rocket'+i];if(r)r.visible=rockets>i;}}
 function update(o,{gear=1,flaps={left:0,right:0},dive=0,hook=0,roll=0,pitch=0,bombs=0,rockets=0,bombScale=1}={}){const d=data(o);if(!d)return;pose(o,gear,flaps,dive);controls(o,roll,pitch);d.parts.sbdHook.visible=true;d.parts.sbdHook.rotation.x=-.58*clamp(hook);stores(o,bombs,rockets,bombScale);}
 function position(o,name,space){const d=data(o),n=d?.parts[name];if(!n)return null;n.updateWorldMatrix(true,false);const p=n.getWorldPosition(new T.Vector3());return space?space.worldToLocal(p):p;}
 function muzzles(o,space){if(!data(o))return null;return ['Left','Right'].flatMap(s=>[1,2,3].map(i=>position(o,'Muzzle'+s+i,space)));}
 g.CorsairRig={isNative,install,pose,controls,update,stores,muzzles,position};if(typeof module==='object'&&module.exports)module.exports=g.CorsairRig;
 g.CorsairLoadouts=Object.freeze({bombs:{label:'2 × 1,000 lb bombs',bombs:2,rockets:0,bombScale:1},rockets:{label:'8 × HVAR rockets',bombs:0,rockets:8,bombScale:1},mixed:{label:'2 × 500 lb bombs + 8 × HVAR',bombs:2,rockets:8,bombScale:.8}});
})(typeof window!=='undefined'?window:globalThis);
