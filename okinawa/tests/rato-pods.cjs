'use strict';
/* Build 295: visible take-off rockets (rato-pods.js), without a browser:
 *  - Me 262: two RI 502 tubes 1.27 m x 0.165 m (NASM) under the rear fuselage, either side of the keel, kept after burn-out;
 *    Ar 234: two Walter 109-500 pods under the outer wings (between nacelle x 2.43-3.23 and aileron x 4.76), dropped on parachutes;
 *  - attach is idempotent, geometries are shared between aircraft, cold pods show no flame;
 *  - burning: flame visible at the tail, its length follows ignition and burn-out, smoke puffs come from the tails at 20/60/120 FPS
 *    at the same rate per second;
 *  - jettison: the pods leave the aircraft with its velocity, the chutes open after ~1.2 s, the descent settles near 7 m/s, they
 *    land on the given ground and are gone 8 s later. */
const assert=require('node:assert/strict'),THREE=require('three');global.THREE=THREE;
const R=require('../../rato-pods.js');
assert(R.has('me262')&&R.has('ar234')&&!R.has('p47'),'only the two jets carry a kit');
const plane=k=>{const g=new THREE.Group();g.position.set(100,200,300);g.updateMatrixWorld(true);return g;};
// placement
for(const kind of ['me262','ar234']){
 const a=plane(),g=R.attach(THREE,a,kind);assert.equal(R.attach(THREE,a,kind),g,'attach twice = one kit');
 assert.equal(g.children.length,2,kind+': two pods');const xs=g.children.map(p=>p.position.x).sort((p,q)=>p-q);
 assert(Math.abs(xs[0]+xs[1])<1e-9,kind+': mirrored');
 const b=new THREE.Box3();a.updateMatrixWorld(true);g.traverse(o=>{if(o.isMesh&&o.parent.name!=='ratoFlame')b.union(new THREE.Box3().setFromObject(o));});b.translate(a.position.clone().negate());
 if(kind==='me262'){assert(xs[1]<.5&&b.max.y<-.64&&b.max.z<-.8&&b.min.z>-2.3,'Me 262: under the rear fuselage (belly y -0.65), aft of the wing: '+JSON.stringify(b));
  const len=b.max.z-b.min.z;assert(len>1.2&&len<1.6,'RI 502 about 1.27 m long: '+len.toFixed(2));}
 else{assert(xs[1]>3.3&&xs[1]<4.6,'Ar 234: outboard of the nacelle, inboard of the aileron');assert(b.max.y<-.22&&b.max.y>-.30,'under the wing (y -0.28), the pylon reaching into the skin: '+b.max.y.toFixed(3));
  assert(b.min.z>-.25,'clear of the flaps (hinge z -0.17): '+b.min.z.toFixed(2));}
 for(const pod of g.children)assert.equal(pod.getObjectByName('ratoFlame').visible,false,'cold: no flame');
}
const g1=R.attach(THREE,plane(),'ar234'),g2=R.attach(THREE,plane(),'ar234');
assert.equal(g1.children[0].children[0].geometry,g2.children[0].children[0].geometry,'geometry shared between aircraft');
// burning at three frame rates
for(const fps of [20,60,120]){
 const a=plane(),g=R.attach(THREE,a,'me262');let puffs=0,maxLen=0,len=[];const dt=1/fps;
 for(let t=0;t<6.4;t+=dt){a.updateMatrixWorld(true);puffs+=R.update(THREE,a,'me262',{phase:t<6?'burning':'cold',t,burn:6,dt,travel:50*dt,emit:(w)=>{assert(w.distanceTo(a.position)<4,'puff at the aircraft');}});
  const f=g.children[0].getObjectByName('ratoFlame');const l=f.visible?f.userData.outer.scale.z:0;len.push([t,l]);maxLen=Math.max(maxLen,l);}
 const at=s=>len.reduce((b,x)=>Math.abs(x[0]-s)<Math.abs(b[0]-s)?x:b)[1];
 assert(maxLen>1.0&&maxLen<1.6,fps+' FPS: flame up to ~1.5 m: '+maxLen.toFixed(2));
 assert(at(.05)<at(2),'flame grows at ignition');assert(at(5.9)<at(2),'and dies at burn-out');assert.equal(at(6.3),0,'out after the burn');
 const perSec=puffs/6/2;assert(perSec>12&&perSec<24,fps+' FPS: '+perSec.toFixed(1)+' puffs per second per pod');
 console.log(fps+' FPS: flame max '+maxLen.toFixed(2)+' m, '+perSec.toFixed(1)+' puffs/s/pod');
}
// jettison
{const scene=new THREE.Scene(),a=plane();scene.add(a);R.attach(THREE,a,'ar234');a.updateMatrixWorld(true);
 let list=R.jettison(THREE,a,scene,new THREE.Vector3(0,3,70));
 assert.equal(list.length,2);assert.equal(a.getObjectByName('ratoPods'),undefined,'pods left the aircraft');
 const start=list[0].holder.position.clone();assert(start.distanceTo(a.position)<5,'dropped from under the wing');
 let chuteAt=null,vy=[],t=0,landed=null;const ground=()=>0;
 for(;t<60&&list.length;t+=1/60){list=R.updateFalling(THREE,list,1/60,ground);
  if(list[0]){if(chuteAt==null&&list[0].chute.visible)chuteAt=t;if(list[0].landed<0)vy.push(list[0].vel.y);else if(landed==null)landed=t;}}
 assert(chuteAt>1&&chuteAt<1.5,'chute opens after ~1.2 s: '+chuteAt);
 const settled=vy.slice(-30);assert(settled.every(v=>v>=-7.01&&v<-4),'settled descent near 7 m/s: '+settled.at(-1).toFixed(2));
 assert(landed>20,'200 m drop takes '+landed?.toFixed(1)+' s');assert.equal(list.length,0,'gone 8 s after landing');
 assert.equal(scene.children.filter(o=>o.name==='ratoDropped').length,0,'removed from the scene');
 console.log('jettison: chute at '+chuteAt.toFixed(2)+' s, lands after '+landed.toFixed(1)+' s, descent '+settled.at(-1).toFixed(2)+' m/s');}
console.log('rato-pods: placement, shared assets, flame and smoke at 20/60/120 FPS, parachute drop verified');
