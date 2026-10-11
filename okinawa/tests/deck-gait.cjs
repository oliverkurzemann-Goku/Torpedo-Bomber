/* Inspect the actual rendered instance transforms, including both turnarounds. */
'use strict';
const assert=require('node:assert/strict'),THREE=require('three');
require('../../crew-visuals.js');const Deck=require('../../deck-activity.js');
const results=[];
for(const fps of [20,60,120]){
 const scene=new THREE.Scene(),deck=Deck.create(THREE,scene,{deckY:14,service:fps===60?'ijn':'usnavy'});
 const previous=new Map(),matrix=new THREE.Matrix4(),v=new THREE.Vector3(),upper=new THREE.Vector3(),lower=new THREE.Vector3(),foot=new THREE.Vector3();
 let slide=0,minSole=Infinity,planted=0,lift=0,maxStep=0,maxBoneError=0;
 for(let i=0;i<fps*85;i++){
  deck.update(1/fps,{launching:true});
  for(const c of deck.crew){
   const limbs=deck.group.children.slice(c.type*5,c.type*5+5),boots=limbs[4];
   for(let side=0;side<2;side++){
    const n=c.index*2+side,key=c.type+':'+c.index+':'+side,old=previous.get(key),pose=c.feet[side];
    boots.getMatrixAt(n,matrix);foot.setFromMatrixPosition(matrix);
    if(pose.planted&&old?.planted){slide=Math.max(slide,Math.hypot(foot.x-old.x,foot.z-old.z));planted++;}
    if(old)maxStep=Math.max(maxStep,Math.hypot(foot.x-old.x,foot.z-old.z));
    const vertices=boots.geometry.attributes.position;
    for(let k=0;k<vertices.count;k++){v.fromBufferAttribute(vertices,k).applyMatrix4(matrix);minSole=Math.min(minSole,v.y-14);}
    lift=Math.max(lift,foot.y-.1325-14);
    limbs[2].getMatrixAt(n,matrix);upper.setFromMatrixPosition(matrix);limbs[3].getMatrixAt(n,matrix);lower.setFromMatrixPosition(matrix);
    maxBoneError=Math.max(maxBoneError,Math.abs(upper.distanceTo(lower)-.40),Math.abs(lower.distanceTo(foot)-.32));
    previous.set(key,{x:foot.x,z:foot.z,planted:pose.planted});
   }
  }
 }
 assert(planted>fps*150&&slide<.00002,'planted boots stay at a fixed deck position');
 assert(minSole>-.00002&&lift>.095&&lift<.105,'soles contact the deck; swing feet clear it');
 assert(maxStep<3/fps,'feet move continuously through walking and both turns');
 assert(maxBoneError<.00002,'knees connect the hips to the actual boot transforms');
 assert(deck.group.children.length===10,'crew remains batched into ten draws');
 const paused=deck.group.children.map(m=>m.instanceMatrix.array.slice());deck.update(0,{launching:true});
 assert(deck.group.children.every((m,i)=>paused[i].every((v,k)=>v===m.instanceMatrix.array[k])),'zero elapsed time freezes the pose');
 results.push({fps,slide,minSole,maxStep,maxBoneError,lift,planted});deck.dispose();assert.equal(scene.children.length,0);
}
console.log('Original crew geometry: planted soles, raised swing feet, connected knees and continuous turnarounds:',results);
