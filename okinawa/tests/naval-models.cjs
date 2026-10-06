'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),THREE=require('three');global.THREE=THREE;global.window=global;global.self=global;
class Img{constructor(){this.listeners={};this.width=this.height=2;}addEventListener(n,f){this.listeners[n]=f;}removeEventListener(){}set src(_){queueMicrotask(()=>this.listeners.load?.());}}
global.document={createElementNS:()=>new Img()};vm.runInThisContext(fs.readFileSync(require.resolve('three/examples/js/loaders/GLTFLoader.js'),'utf8'));require('../../naval-assets.js');
(async()=>{for(const [name,spec] of Object.entries(NavalAssets.specs)){
 const b=fs.readFileSync('assets/ships/'+spec.file+'.glb'),g=await new Promise((ok,no)=>new THREE.GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',ok,no)),model=NavalAssets.normalize(g.scene,spec),v=new THREE.Vector3(),real=new THREE.Box3();
 model.traverse(o=>{if(!o.isMesh)return;assert(!o.isSkinnedMesh,'static ship has no skeleton');const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);v.applyMatrix4(o.matrixWorld);real.expandByPoint(v);}});
 const box=new THREE.Box3().setFromObject(model),sz=real.getSize(new THREE.Vector3());
 assert(Math.abs(sz.z-spec.length)<.01,name+' visible hull uses the promised length');assert(sz.x>1&&sz.x<spec.length*.25,name+' beam stays plausible');
 assert(Math.abs(real.min.y+spec.draft)<.01,name+' hull crosses water at its configured draft');assert(box.min.distanceTo(real.min)<.01&&box.max.distanceTo(real.max)<.01,name+' bounds describe rendered vertices, not stale exporter bounds');
 const clone=model.clone(true);assert.notEqual(model,clone);let a,c;model.traverse(o=>{if(o.isMesh&&!a)a=o});clone.traverse(o=>{if(o.isMesh&&!c)c=o});assert.equal(a.geometry,c.geometry);assert.equal(a.material,c.material);
 console.log(name,JSON.stringify({metres:sz.toArray(),draft:spec.draft}));
 }
 assert(!fs.existsSync('merchant_ship.glb'),'old poor-quality merchant is removed');
})().catch(e=>{console.error(e);process.exitCode=1});
