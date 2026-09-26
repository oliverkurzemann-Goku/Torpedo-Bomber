// Measure the effect against the actual shipped Me 262, then exercise throttle.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const THREE=require('three');global.THREE=THREE;global.self=global;global.window=global;
class ImageStub{
 constructor(){this.listeners={};this.width=2;this.height=2;}
 addEventListener(type,fn){this.listeners[type]=fn;}
 removeEventListener(){}
 set src(_){queueMicrotask(()=>this.listeners.load?.());}
}
global.document={createElementNS:()=>new ImageStub(),createElement:type=>type==='canvas'?
 {getContext(){return {drawImage(){},getImageData(){return {data:[60,60,60,255]};}};}}:new ImageStub()};
vm.runInThisContext(fs.readFileSync(process.env.GLTF_LOADER_R128,'utf8'));
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
const start=html.indexOf('let jetHeatTexture=null'),end=html.indexOf('function buildAircraft(kind){',start);
assert(start>0&&end>start,'jet heat implementation found');
const {attachJetExhaust,updateJetExhaust}=vm.runInNewContext(html.slice(start,end)+'\n({attachJetExhaust,updateJetExhaust})',{THREE});
const bytes=fs.readFileSync(path.join(root,'me262.glb'));
new THREE.GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',({scene})=>{
 const plane=new THREE.Group();plane.add(scene);
 scene.scale.setScalar(12.51/new THREE.Box3().setFromObject(plane).getSize(new THREE.Vector3()).x);
 plane.updateMatrixWorld(true);
 scene.position.copy(new THREE.Box3().setFromObject(plane).getCenter(new THREE.Vector3())).negate();
 plane.updateMatrixWorld(true);
 attachJetExhaust(plane);
 plane.updateMatrixWorld(true);
 const fx=plane.getObjectByName('jetHeat');
 assert.equal(fx.children.length,4,'two cores and two short heat plumes');
 for(const [i,side] of [[0,-1],[2,1]]){
  const core=fx.children[i],wake=fx.children[i+1],p=core.getWorldPosition(new THREE.Vector3());
  assert(Math.abs(p.x-side*2.22)<.02&&Math.abs(p.y+1.24)<.02&&Math.abs(p.z+.72)<.02,
   'hot core sits inside the aft engine nozzle');
  assert(wake.position.z<core.position.z&&core.position.z-wake.position.z<.6,
   'short shimmer stays immediately behind the engine');
 }
 updateJetExhaust(plane,0,.05);
 const idle=plane.userData.jetExhaust.glow.opacity;
 updateJetExhaust(plane,1,.05);
 assert(plane.userData.jetExhaust.glow.opacity>idle*2,'heat rises noticeably with throttle');
 assert(plane.userData.jetExhaust.shimmer.uniforms.heat.value<1,'exhaust stays subtler than an afterburner');
 console.log('Me 262: twin recessed nozzles, short shimmer and throttle response verified');
},e=>{console.error(e);process.exitCode=1;});
