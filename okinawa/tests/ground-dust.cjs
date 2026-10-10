'use strict';
const assert=require('node:assert/strict'),THREE=require('three'),Dust=require('../../ground-dust.js');
function simulate(ac,fps,wetness=0){
 const scene=new THREE.Scene(),dust=Dust.create(THREE,scene,(x,z)=>x*.03+z*.01);
 const p={ac,alive:true,onGround:true,groundPower:1,spd:30,heading:Math.PI/2,pos:new THREE.Vector3(0,2,0)};
 for(let i=0;i<4*fps;i++){p.pos.x+=p.spd/fps;dust.trail(p,1/fps,{wetness});dust.update(1/fps,4);}
 assert(dust.particles.every(d=>d.pos.y>=d.pos.x*.03+d.pos.z*.01+.39),'dust follows the rendered ground');
 assert(dust.stats.live<=dust.stats.limit&&dust.stats.allocated<=dust.stats.limit,'particle allocation stays bounded');
 if(wetness===0){
  assert(dust.stats.live>20&&dust.stats.draws===1,'continuous trail in one draw');
  const wakes=dust.particles.filter(p=>!p.wheel);
  assert(wakes.length>5);assert(wakes.every(p=>p.jet===(ac==='me262')),'distinct propwash and jet profiles');
  assert(wakes.some(p=>p.pos.x<120-6),'dust remains behind the departing aircraft');
  assert(wakes.every(p=>p.velocity.x<0),'blast travels aft');
  const count=dust.stats.emitted;p.throttle=0;dust.trail(p,.05);
  assert.equal(dust.stats.emitted,count,'closed throttle/service cannot emit old full-power wash');
  p.throttle=1;p.onGround=false;dust.trail(p,.05);
  assert.equal(dust.stats.emitted,count,'no airborne emitter');
  for(let i=0;i<4*fps;i++)dust.update(1/fps);
  assert.equal(dust.stats.live,0,'last ground plume fades naturally');
 }
 const stats=dust.stats;dust.clear();assert.equal(dust.stats.live,0);assert.equal(dust.mesh.visible,false);
 dust.dispose();assert.equal(scene.children.length,0,'resources removed on disposal');return stats;
}
for(const ac of ['p47','me262']){
 const counts=[20,60,120].map(fps=>simulate(ac,fps).emitted);
 assert(Math.max(...counts)-Math.min(...counts)<=4,'emission is independent of frame rate');
 assert.equal(simulate(ac,60,1).emitted,0,'heavy rain suppresses airborne dust');
 const dry=simulate(ac,60),wet=simulate(ac,60,.6);assert(wet.emitted<dry.emitted*.65,'damp strip emits less dust');
}
console.log('Ground dust: prop/jet profiles, aft blast, rendered height, wetness, frame rates, airborne fade, one draw and allocation/disposal budgets');
