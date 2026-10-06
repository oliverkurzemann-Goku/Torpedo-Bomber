/* Actual GLTFLoader and native decoded images, plus the shipped preflight routine.
 * No GPU/FPS claim: Chromium integration is separately mandatory in CI. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three'),{Image,createCanvas}=require('@napi-rs/canvas');
global.window=global;global.self=global;global.THREE=THREE;
global.createImageBitmap=undefined; // Use the native image decoder below, not a runtime bitmap shim.
global.document={createElement:()=>createCanvas(1,1),createElementNS(){
 const image=new Image(),listeners={};
 image.addEventListener=(event,fn)=>listeners[event]=fn;image.removeEventListener=()=>{};
 image.onload=()=>listeners.load?.call(image);image.onerror=e=>listeners.error?.call(image,e);
 const nativeSrc=Object.getOwnPropertyDescriptor(Image.prototype,'src');
 Object.defineProperty(image,'src',{set(url){
  fetch(url).then(r=>r.arrayBuffer()).then(b=>nativeSrc.set.call(image,Buffer.from(b))).catch(e=>listeners.error?.(e));
 }});
 return image;
}};
vm.runInThisContext(fs.readFileSync(require.resolve('three/examples/js/loaders/GLTFLoader.js'),'utf8'));
require('../../pacific-assets.js');const {PacificAssets}=global;
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'torpedo-carrier.html'),'utf8');
const decoded=[];
THREE.GLTFLoader.prototype.load=function(url,yes,_progress,no){
 decoded.push(url);const bytes=fs.readFileSync(path.join(root,decodeURIComponent(url.split('?')[0])));
 return this.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',yes,no);
};
function geometryStats(group){const stats=[];group.traverse(o=>{if(o.isMesh)stats.push([o.name,o.geometry.attributes.position.count,o.geometry.index?.count]);});return stats;}
(async()=>{
 const bytes=fs.readFileSync(path.join(root,'sbd dauntless.glb'));
 const sbd=await new Promise((yes,no)=>new THREE.GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',g=>yes(g.scene),no));
 const geometry=geometryStats(sbd),memory=PacificAssets.boundTextures(sbd,512);
 assert(memory.before>100*1024*1024,'the original SBD really has a large decoded material texture budget');
 assert(memory.after<24*1024*1024&&memory.after/memory.before<.22,'512px cap removes over 78% of SBD texture allocation');
 assert.deepEqual(geometryStats(sbd),geometry,'no wings, cowl, propeller or geometry are cut by texture bounding');
 sbd.traverse(o=>{for(const m of [].concat(o.material||[]))for(const t of Object.values(m))if(t?.isTexture){
  assert(Math.max(t.image.width,t.image.height)<=512);assert.equal(t.flipY,false,'GLB UV orientation retained');
 }});
 const loader=PacificAssets.loader(),copies=[];
 await Promise.all([loader.load('assets/ships/japanese-cargo.glb?v=172',g=>copies.push(g.scene)),loader.load('assets/ships/japanese-cargo.glb?v=172',g=>copies.push(g.scene))]);
 assert.equal(decoded.filter(x=>x.includes('japanese-cargo')).length,1,'repeated cargo requests decode and allocate textures only once');
 assert.notEqual(copies[0],copies[1],'ship transforms must be independent');
 const meshes=copies.map(g=>{let first;g.traverse(o=>{if(o.isMesh&&!first)first=o;});return first;});
 assert.equal(meshes[0].geometry,meshes[1].geometry);assert.equal(meshes[0].material.map,meshes[1].material.map,'clones share texture objects');
 // Exercise the actual mission dependency/orchestration code (not a mirror).
 const loads=[],ctx=vm.createContext({Promise,Map,Error,
  loadIJNCarrierModel:async()=>{loads.push('ijn');ctx.ijnCarrierModel={};},
  loadCarrierModel:async()=>{loads.push('us');ctx.carrierModel={};},
  loadSBDModel:async()=>{loads.push('sbd');ctx.sbdTemplate={};},
  loadPlaneModel:async()=>{loads.push('avenger');ctx.gltfRoot={};ctx.propPivot={};},
  loadZeroModel:async()=>{loads.push('zero');ctx.zeroTemplate={};},
  loadDestroyerModel:async()=>{loads.push('escort');ctx.destroyerTemplate={};},
  loadFreighterModel:async()=>{loads.push('merchant');ctx.freighterTemplate={};},
  loadCruiserModel:async()=>{loads.push('capital');ctx.cruiserTemplate={};}
 });
 vm.runInContext(html.slice(html.indexOf('const pacificModelTasks='),html.indexOf('function pacificPauseOrders(')),ctx);
 await ctx.preparePacificModels({defend:true,targets:[]});
 assert.deepEqual(loads,['ijn','avenger','zero'],'Zero defence loads no SBD, US deck or merchant');
 loads.length=0;await ctx.preparePacificModels({defend:true,targets:[]});assert.deepEqual(loads,[],'replays use ready templates');
 await ctx.preparePacificModels({sbd:true,targets:[{type:'freighter'},{type:'destroyer'}]});
 assert.deepEqual(loads,['us','sbd','escort','merchant'],'SBD selects its own airframe and required ships, no duplicate Avenger');
 const failed=vm.createContext({...ctx,carrierModel:null,loadCarrierModel:async()=>{}});
 vm.runInContext(html.slice(html.indexOf('const pacificModelTasks='),html.indexOf('function pacificPauseOrders(')),failed);
 await assert.rejects(()=>failed.preparePacificModels({free:true,targets:[]}),/carrier model could not load/);
 failed.loadCarrierModel=async()=>failed.carrierModel={};
 await failed.preparePacificModels({free:true,targets:[]});
 console.log('Pacific assets: SBD texture estimate '+Math.round(memory.before/1048576)+' → '+Math.round(memory.after/1048576)+' MiB; one merchant decode, intact original geometry, mission-specific readiness and retry');
})().catch(e=>{console.error(e);process.exitCode=1;});
