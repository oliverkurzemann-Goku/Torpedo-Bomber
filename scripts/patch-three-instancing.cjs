'use strict';
// Build 282: three.js r128 re-binds every vertex attribute for EVERY InstancedMesh
// draw (WebGLBindingStates.setup: `object.isInstancedMesh && (updateBuffers = true)`),
// because its vertex-array objects are keyed by geometry + program and many instanced
// meshes share one geometry with different instance buffers. Measured in the Rhine
// (Ultra/High): ~7,000 WebGL calls per frame, ~2,700 of them vertexAttribPointer.
// The patch keys the vertex-array object of an InstancedMesh by the mesh itself, re-binds
// only when its instance buffers change, and frees those objects when the mesh is
// disposed. Same draws, same picture (okinawa/tests/three-instancing-browser.cjs).
// Usage: node scripts/patch-three-instancing.cjs [--check]   (idempotent)
const fs=require('fs'),path=require('path');
const file=path.join(__dirname,'../vendor/three-r128.min.js');
const PATCHES=[
 ['setup:function(r,l,u,y,x){let _=!1;if(a){const e=function(e,n,r){const a=!0===r.wireframe;let l=o[e.id];void 0===l&&(l={},o[e.id]=l);',
  'setup:function(r,l,u,y,x){let _=!1;const K=!0===r.isInstancedMesh?"i"+r.id:y.id;let K0,K1;'+
  // (inside setup `u` is the program parameter, so the release goes through releaseStatesOfGeometry)
  'if(a){const RS=this;!0===r.isInstancedMesh&&void 0===o[K]&&r.addEventListener("dispose",function t(){r.removeEventListener("dispose",t);RS.releaseStatesOfGeometry({id:K})});'+
  'const e=function(e,n,r){const a=!0===r.wireframe;let l=o[K];void 0===l&&(l={},o[K]=l);'],
 ['!0===r.isInstancedMesh&&(_=!0),null!==x&&n.update(x,34963)',
  '!0===r.isInstancedMesh&&(a?(K0=n.get(r.instanceMatrix),K1=r.instanceColor?n.get(r.instanceColor):null,(c.__im!==(K0&&K0.buffer)||c.__ic!==(K1&&K1.buffer)||_)&&(_=!0,c.__im=K0&&K0.buffer,c.__ic=K1&&K1.buffer)):_=!0),null!==x&&n.update(x,34963)']
];
function patch(src){for(const [a,b] of PATCHES){if(src.includes(b))continue;if(src.split(a).length!==2)throw new Error('three r128 patch anchor not found');src=src.replace(a,b);}return src;}
function unpatch(src){for(const [a,b] of PATCHES){if(src.split(b).length!==2)throw new Error('patch not present');src=src.replace(b,a);}return src;}
module.exports={patch,unpatch,PATCHES};
if(require.main===module){
 const src=fs.readFileSync(file,'utf8'),out=patch(src);
 if(process.argv.includes('--check')){if(out!==src){console.error('vendor/three-r128.min.js is not patched');process.exit(1);}console.log('three r128 instancing patch present');}
 else{fs.writeFileSync(file,out);console.log(out===src?'already patched':'patched');}
}
