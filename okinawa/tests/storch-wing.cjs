'use strict';
/* Build 259: the Storch's wing is continuous over the cabin. The delivered model (assets/aircraft/fi156c2-player.glb) has two wing halves that end at x = +-0.54 with the
 * fuselage's own roof between them, so from above the wing looked cut in two. The rig class tailwheel-light closes the gap with a strip lofted between the two root sections of
 * the wing mesh (aircraft-contract.js, buildCenterSection). Checked on the real model: the strip meets both roots exactly, uses the wing's own normals' side and UVs (the paint
 * continues), is wound outward, leaves the wing and the roof untouched, never doubles on a second install and survives a clone. */
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');global.THREE=require('three');global.self=global;global.window=global;
class ImageStub{constructor(){this.listeners={};this.width=this.height=1;}addEventListener(t,f){this.listeners[t]=f;}removeEventListener(){}set src(_){queueMicrotask(()=>this.listeners.load?.());}}
global.Image=ImageStub;global.document={createElementNS:()=>new ImageStub()};
vm.runInThisContext(fs.readFileSync(path.join(root,'vendor/GLTFLoader-r128.js'),'utf8'));
require('../../aircraft-contract.js');require('../../aircraft-articulation.js');
(async()=>{
 const bytes=fs.readFileSync(path.join(root,'assets/aircraft/fi156c2-player.glb'));
 const gl=await new Promise((y,n)=>new THREE.GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',y,n));
 const frame=new THREE.Group();frame.add(gl.scene);frame.updateMatrixWorld(true);
 const wing=frame.getObjectByName('Wings'),roof=frame.getObjectByName('Airframe'),before=wing.geometry.attributes.position.count,roofBefore=roof.geometry.attributes.position.count;
 AircraftArticulation.install(frame,'fi156');
 const strip=frame.getObjectByName('wingCenterSection');assert(strip&&strip.isMesh,'the centre section exists');
 const p=strip.geometry.attributes.position,n=strip.geometry.attributes.normal,uv=strip.geometry.attributes.uv,tris=p.count/3;
 assert(Number.isInteger(tris)&&tris>=40&&tris<=200,'a closed airfoil ring, one quad per segment: '+tris+' triangles');
 assert.equal(wing.geometry.attributes.position.count,before,'the wing mesh is never changed');assert.equal(roof.geometry.attributes.position.count,roofBefore,'the fuselage roof is never changed');
 // the wing's root section
 const v=new THREE.Vector3(),rootRing=[];let rootX=Infinity;const wp=wing.geometry.attributes.position,wuv=wing.geometry.attributes.uv;
 for(let i=0;i<wp.count;i++){v.fromBufferAttribute(wp,i).applyMatrix4(wing.matrixWorld);if(v.x>0&&v.x<rootX)rootX=v.x;}
 for(let i=0;i<wp.count;i++){v.fromBufferAttribute(wp,i).applyMatrix4(wing.matrixWorld);if(Math.abs(v.x-rootX)<.004)rootRing.push({z:v.z,y:v.y,u:wuv.getX(i),v:wuv.getY(i)});}
 assert(Math.abs(rootX-.54)<.01,'the wing halves end at x = +-0.54 ('+rootX+')');
 const box=new THREE.Box3().setFromObject(strip);
 assert(Math.abs(box.min.x+rootX)<.002&&Math.abs(box.max.x-rootX)<.002,'the strip spans exactly from root to root: '+box.min.x.toFixed(3)+' .. '+box.max.x.toFixed(3));
 // every vertex of the strip lies on the wing's root ring (same z, y) and carries one of that point's own UVs: the airfoil and the paint continue
 for(let i=0;i<p.count;i++){
  const z=p.getZ(i),y=p.getY(i),hits=rootRing.filter(r=>Math.abs(r.z-z)<.0006&&Math.abs(r.y-y)<.0006);
  assert(hits.length,'strip vertex ('+z.toFixed(3)+', '+y.toFixed(3)+') is on the root section');
  assert(hits.some(h=>Math.abs(h.u-uv.getX(i))<1e-5&&Math.abs(h.v-uv.getY(i))<1e-5),'strip UV at ('+z.toFixed(3)+', '+y.toFixed(3)+') is one of the wing\'s own');
 }
 // both ends of the strip meet a wing vertex exactly: no step at the join (the right edge x = +root, the mirror at -root)
 for(const side of [-1,1]){const edge=[];for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i)-side*rootX)<.001)edge.push(i);assert(edge.length>=p.count/2-2,'half of the vertices sit on each edge');}
 // winding: every face normal agrees with the vertex normals (outward), and no normal is degenerate
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),vn=new THREE.Vector3();let upFaces=0,downFaces=0;
 for(let t=0;t<tris;t++){a.fromBufferAttribute(p,t*3);b.fromBufferAttribute(p,t*3+1);c.fromBufferAttribute(p,t*3+2);
  const f=new THREE.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a));assert(f.length()>1e-9,'triangle '+t+' has an area');f.normalize();
  vn.set(0,0,0);for(let k=0;k<3;k++)vn.add(new THREE.Vector3().fromBufferAttribute(n,t*3+k));assert(vn.length()>.5,'smooth normal present');
  assert(f.dot(vn.normalize())>.2,'face '+t+' is wound outward ('+f.dot(vn).toFixed(2)+')');if(f.y>.5)upFaces++;if(f.y<-.5)downFaces++;}
 assert(upFaces>=6&&downFaces>=6,'an upper and a lower skin: '+upFaces+' / '+downFaces);
 // the cabin roof stays under the new upper skin (a few centimetres of the roof may touch it at the leading and trailing edge)
 const roofTop=new Map();const rp=roof.geometry.attributes.position;
 for(let i=0;i<rp.count;i++){v.fromBufferAttribute(rp,i).applyMatrix4(roof.matrixWorld);if(Math.abs(v.x)<.5&&v.y>.85){const k=Math.round(v.z*20)/20;roofTop.set(k,Math.max(roofTop.get(k)??-9,v.y));}}
 const skinAt=z=>{let best=-9;for(let t=0;t<tris;t++){a.fromBufferAttribute(p,t*3);b.fromBufferAttribute(p,t*3+1);c.fromBufferAttribute(p,t*3+2);for(const [q,r] of [[a,b],[b,c],[c,a]])if((q.z-z)*(r.z-z)<=0&&q.z!==r.z){const y=q.y+(r.y-q.y)*(z-q.z)/(r.z-q.z);best=Math.max(best,y);}}return best;};
 for(const [z,top] of roofTop){if(z<-.58||z>.76)continue;assert(skinAt(z)>=top-.035,'roof top at z '+z+' ('+top.toFixed(3)+') is not above the wing skin ('+skinAt(z).toFixed(3)+')');}
 // idempotent, clone-safe, and material shares the wing's texture
 AircraftArticulation.install(frame,'fi156');assert.equal(frame.getObjectsByProperty?frame.getObjectsByProperty('name','wingCenterSection').length:[...(()=>{const l=[];frame.traverse(o=>{if(o.name==='wingCenterSection')l.push(o);});return l;})()].length,1,'a second install builds nothing twice');
 const copy=frame.clone(true);let count=0;copy.traverse(o=>{if(o.name==='wingCenterSection')count++;});assert.equal(count,1,'a clone of the installed template has exactly one centre section');
 assert.equal(strip.material.map,wing.material.map,'same atlas');assert.equal(strip.material.side,wing.material.side);
 console.log('Storch wing: centre section closes the cabin gap ('+tris+' triangles, root to root x +-'+rootX.toFixed(2)+' m), on the wing\'s own root section, paint and winding continue, model untouched.');
})().catch(e=>{console.error(e);process.exit(1);});
