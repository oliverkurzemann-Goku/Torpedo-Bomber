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
for(const file of ['remagen-mission.html','torpedo-carrier.html']){
 const html=fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8');
 assert(html.includes('pilot-bailout.js?v=147')&&html.includes('id="bailBtn"'));
 assert(html.includes('beginBailout()')&&html.includes('advanceBailout('));
}
console.log('Both campaigns: bailout controls, parachute deployment and terrain landing');
