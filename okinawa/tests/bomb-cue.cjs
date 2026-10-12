/* Sample-and-hold jitter, frame-independent display filtering and truthful cues. */
'use strict';
const assert=require('node:assert/strict'),THREE=require('three');
require('../../game-runtime.js');
global.innerWidth=1000;global.innerHeight=700;
function element(){const classes=new Set();return {style:{},lastElementChild:{textContent:''},classList:{remove:k=>classes.delete(k),toggle:(k,v)=>v?classes.add(k):classes.delete(k),contains:k=>classes.has(k)}};}
function setup(){
 const el=element(),cue=new GameRuntime.BombCue(el),position=new THREE.Vector3();
 const camera=new THREE.OrthographicCamera(-500,500,350,-350,.1,100);
 camera.position.set(0,0,10);camera.lookAt(0,0,0);
 return {el,cue,position,camera};
}
for(const fps of [20,60,120]){
 const {el,cue,position,camera}=setup();let calls=0;
 const predict=()=>{calls++;return {point:new THREE.Vector3(position.x+100,40,0),onTarget:false};};
 const values=[];
 for(let i=0;i<fps*3;i++){
  position.x+=120/fps;camera.position.x=position.x;camera.lookAt(position.x,0,0);
  cue.update(1/fps,{enabled:true,position,camera,predict});if(i>fps)values.push(cue.x);
 }
 assert(Math.max(...values)-Math.min(...values)<.001,'constant flight has no cached-world-point sawtooth at '+fps+' FPS');
 assert(calls>=29&&calls<=31,'cruise remains bounded at ten ballistic predictions/second');
 assert(!el.hidden&&Math.abs(cue.opacity-.42)<.001);
 const hit=cue.hit.point.clone();cue.update(1/fps,{enabled:true,position,camera,predict});assert(cue.hit.point.equals(hit),'display transport never modifies a ballistic result');
 cue.reset();calls=0;
 for(let i=0;i<fps;i++)cue.update(1/fps,{enabled:true,position,camera,predict,attack:true});
 assert(calls>=Math.min(fps,30)-1&&calls<=Math.min(fps,30)+1,'attack sampling is bounded by 30 Hz');
 assert(cue.opacity>.9,'dive cue is prominent');
}
const {el,cue,position,camera}=setup();let t=0,raw=[],smooth=[];
const predict=()=>{const x=100+3*Math.sin(t*31);raw.push(x);return {point:new THREE.Vector3(x,40,0),onTarget:false};};
for(let i=0;i<600;i++){t+=1/60;cue.update(1/60,{enabled:true,position,camera,predict});if(i>60)smooth.push(cue.x-500);}
const sd=a=>{const mean=a.reduce((s,v)=>s+v,0)/a.length;return Math.sqrt(a.reduce((s,v)=>s+(v-mean)**2,0)/a.length);};
assert(sd(smooth)<sd(raw)*.6,'small rapidly alternating prediction noise is attenuated');
let point=new THREE.Vector3(100,40,0),onTarget=true;
const exact=()=>({point,onTarget});cue.reset();
cue.update(0,{enabled:true,position,camera,predict:exact,attack:true,releaseAllowed:true});
const x=cue.x;assert(el.classList.contains('onTarget'));assert.equal(el.lastElementChild.textContent,'RELEASE');
onTarget=false;cue.update(0,{enabled:true,position,camera,predict:exact,attack:true,releaseAllowed:true});
assert.equal(cue.x,x,'RELEASE/BOMB label width cannot move the pipper');assert(!el.classList.contains('onTarget'));
point=new THREE.Vector3(200,40,0);onTarget=true;
cue.update(1/60,{enabled:true,position,camera,predict:exact,attack:true,releaseAllowed:true});
for(let i=0;i<2;i++)cue.update(1/60,{enabled:true,position,camera,predict:exact,attack:true,releaseAllowed:true});
assert(!el.classList.contains('onTarget'),'lagging pipper cannot signal green at an old position');
for(let i=0;i<90;i++)cue.update(1/60,{enabled:true,position,camera,predict:exact,attack:true,releaseAllowed:true});
assert(Math.abs(cue.x-700)<1&&el.classList.contains('onTarget'),'intentional aim changes settle promptly');
point=new THREE.Vector3(600,40,0);const opacity=cue.opacity;
for(let i=0;i<8;i++)cue.update(1/60,{enabled:true,position,camera,predict:exact});
assert(cue.opacity>0&&cue.opacity<opacity&&!el.hidden,'offscreen transition fades instead of immediately flickering');
for(let i=0;i<90;i++)cue.update(1/60,{enabled:true,position,camera,predict:exact});
assert(el.hidden&&cue.x===null,'offscreen cue fades completely and clears old position');
point=new THREE.Vector3(0,0,0);cue.update(0,{enabled:true,position,camera,predict:exact});
cue.reset();point=new THREE.Vector3(-496.4,0,0);
for(let i=0;i<120;i++)cue.update(1/120,{enabled:true,position,camera,predict:exact});
assert(!el.hidden&&cue.opacity>.035,'a faint returning edge cue accumulates its fade even before it becomes visible');
point=new THREE.Vector3(0,0,0);
global.innerWidth=800;cue.update(1/60,{enabled:true,position,camera,predict:exact});
assert.equal(cue.x,400,'resize reacquires at the new viewport coordinates');
cue.update(1/60,{enabled:false});assert(el.hidden&&cue.hit===null&&cue.opacity===0,'weapon switch/death/grounding clears the display immediately');
console.log('Stable 10/30-Hz bomb cues at 20/60/120 FPS, jitter filtering, honest green, edge fade, resize and reset passed.');
