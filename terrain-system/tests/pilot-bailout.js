'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const THREE=require('three'),PilotBailout=require('../../pilot-bailout.js');
const scene=new THREE.Scene(),groundAt=()=>8;
const chute=PilotBailout.create(THREE,scene,new THREE.Vector3(0,210,0),0,160,groundAt);
assert.equal(scene.children.length,1,'pilot appears in the world');
const aircrew=chute.group.getObjectByName('pilot');
for(const part of ['face','helmet','goggles','flightJacket','parachutePack',
  'leftArm','rightArm','leftLeg','rightLeg','leftBoot','rightBoot'])
 assert(aircrew.getObjectByName(part),'bailout pilot has '+part);
assert(aircrew.children.length>=11,'pilot has a human silhouette, not a lone cylinder');
let opened=false,landed=false;
for(let i=0;i<1800;i++){
 const state=chute.update(.05,4);
 if(chute.deployed)opened=true;
 if(state.landed){assert(state.safe,'pilot lands under an open parachute');landed=true;break;}
}
assert(opened&&landed,'pilot deploys chute and lands');
assert(Math.abs(chute.position.y-8.9)<.001,'pilot stops at terrain level');
chute.dispose();assert.equal(scene.children.length,0,'parachute removed before the next sortie');
function steered(turn,forward,dt=.05){
 const c=PilotBailout.create(THREE,scene,new THREE.Vector3(0,300,0),0,0,groundAt);
 for(let t=0;t<12;t+=dt)c.update(dt,0,{turn,forward});
 const result={pos:c.position.clone(),heading:c.heading};c.dispose();return result;
}
const left=steered(-1,0),right=steered(1,0),neutral=steered(0,0),brake=steered(0,-1),glide=steered(0,1);
assert(left.pos.x<-10&&right.pos.x>10,'left/right controls steer in opposite directions');
assert(Math.abs(left.pos.x+right.pos.x)<.1,'round-canopy steering is symmetric');
assert(Math.abs(left.heading+right.heading)<.001,'steering does not snap or bias the heading');
assert(glide.pos.z>neutral.pos.z+10&&neutral.pos.z>brake.pos.z+10,'forward glides faster; back brakes');
assert(Math.abs(left.pos.y-neutral.pos.y)<.001,'steering cannot climb or delay descent');
const slow=steered(1,0,1/20),fast=steered(1,0,1/120);
assert(Math.abs(slow.heading-fast.heading)<.04&&slow.pos.distanceTo(fast.pos)<.5,'steering is stable across frame rates');
const bounded=PilotBailout.create(THREE,scene,new THREE.Vector3(499,300,499),Math.PI/4,0,groundAt);
for(let i=0;i<400;i++)bounded.update(.05,8,{turn:0,forward:1,bounds:{minX:0,maxX:500,minZ:0,maxZ:500}});
assert(bounded.position.x<=500&&bounded.position.z<=500,'pilot remains on loaded terrain');bounded.dispose();
for(const file of ['remagen-mission.html','torpedo-carrier.html']){
 const html=fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8');
 assert(/pilot-bailout\.js\?v=\d+/.test(html)&&html.includes('id="bailBtn"'));
 assert(html.includes('beginBailout()')&&html.includes('advanceBailout('));
}
console.log('Both campaigns: bailout controls, parachute deployment and terrain landing');
