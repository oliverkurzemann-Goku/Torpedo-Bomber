'use strict';
const assert=require('node:assert/strict'),THREE=require('three'),Smoke=require('../../aircraft-smoke.js');
for(const dt of [1/20,1/60,1/120]){
 const scene=new THREE.Scene(),fx=Smoke.create(THREE,scene),direction=new THREE.Vector3(1,0,0),position=new THREE.Vector3(0,100,0);
 const aircraft={pos:position,spd:120,hull:100,systemDamage:{engine:1,fuelLeak:0}};
 for(let i=0;i<60;i++){fx.damage('healthy',aircraft,direction,dt);fx.update(dt);}assert.equal(fx.count,0,'healthy aircraft cannot emit a damage trail');
 for(let t=0;t<2;t+=dt){position.x+=120*dt;fx.trail('player',position,direction,120,.8,dt,2);fx.update(dt);}
 assert(fx.count>70&&fx.count<110,'spatial plume density survives different frame rates');
 const matrix=new THREE.Matrix4(),points=[];for(let i=0;i<fx.count;i++){fx.mesh.getMatrixAt(i,matrix);points.push(new THREE.Vector3().setFromMatrixPosition(matrix));}
 assert(points.every(p=>p.x<position.x),'smoke trails behind the nose');
 const old=points.map(p=>p.clone());fx.update(.1);fx.mesh.getMatrixAt(0,matrix);assert(old[0].distanceTo(new THREE.Vector3().setFromMatrixPosition(matrix))>.05,'plume continues drifting after emission');
 for(let i=0;i<60;i++)fx.update(.1);assert.equal(fx.count,0,'plume fades when emission stops');assert.equal(fx.stats.emitters,0,'stale aircraft references expire');
 for(let frame=0;frame<400;frame++){for(let i=0;i<30;i++)fx.trail(i,new THREE.Vector3(frame*10,100,i*10),direction,200,1,.05);fx.update(.05);}
 assert(fx.stats.allocated<=256&&fx.stats.live<=256&&fx.stats.emitters<=24,'many damaged aircraft keep a bounded pool');assert.equal(fx.stats.draws,1,'all trails share one draw');
 fx.clear();assert.equal(fx.count,0);assert.equal(fx.stats.emitters,0);
 let disposed=0;for(const resource of [fx.mesh.geometry,fx.mesh.material,fx.mesh.material.uniforms.cloudMap.value])resource.addEventListener('dispose',()=>disposed++);fx.dispose();assert.equal(disposed,3);assert.equal(scene.children.length,0);
}
console.log('Aircraft smoke: spatial density at 20/60/120 FPS, wake direction, drift/fade, bounded pool and resource cleanup');
