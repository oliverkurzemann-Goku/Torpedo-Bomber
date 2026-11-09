'use strict';
/* Build 234: ShipContact.surfaceHeight (nearest-first traversal, no per-call allocations) must return exactly what the
 * previous implementation returned. The reference here is the previous algorithm in its simplest form: test EVERY
 * triangle with the same Moeller-Trumbore arithmetic and keep the hit nearest to the segment start. */
const assert=require('node:assert/strict'),THREE=require('three');
const ShipContact=require('../../ship-contact.js').create(THREE);

let seed=20261109;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};

// synthetic carrier: cambered, stepped deck (displaced plane), hull box, island blocks, random clutter; rolled and pitched
function buildShip(){
 const ship=new THREE.Group(),mat=new THREE.MeshBasicMaterial();
 const deck=new THREE.PlaneGeometry(240,36,120,18);deck.rotateX(-Math.PI/2);
 const p=deck.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);p.setY(i,14+.0004*x*x-.003*z*z+(Math.abs(x)>60&&Math.abs(x)<64?.25:0)+(x>90?.4:0));}
 deck.computeVertexNormals();ship.add(new THREE.Mesh(deck,mat));
 const hull=new THREE.Mesh(new THREE.BoxGeometry(230,12,30,12,2,4),mat);hull.position.y=7;ship.add(hull);
 for(let k=0;k<6;k++){const b=new THREE.Mesh(new THREE.BoxGeometry(6+rnd()*10,5+rnd()*8,5+rnd()*5),mat);b.position.set(40+rnd()*50,17+rnd()*3,8+rnd()*6);b.rotation.y=rnd();ship.add(b);}
 for(let k=0;k<12;k++){const s=new THREE.Mesh(new THREE.TorusKnotGeometry(1+rnd()*2,.3,48,8),mat);s.position.set((rnd()-.5)*200,15+rnd()*3,(rnd()-.5)*28);ship.add(s);}
 ship.rotation.set(.03,.7,-.05);ship.position.set(1234,-3,-640);ship.updateMatrixWorld(true);return ship;
}
// reference: every triangle, original arithmetic, nearest by squared distance from the segment start
function reference(ship,x,z,ref,range=1.25,fallback=ref){
 ship.updateMatrixWorld(true);const inv=new THREE.Matrix4().copy(ship.matrixWorld).invert();
 const start=new THREE.Vector3(x,ref+range,z).applyMatrix4(inv),end=new THREE.Vector3(x,ref-range,z).applyMatrix4(inv),d=end.clone().sub(start);
 let nearest=Infinity,point=null;const A=new THREE.Vector3(),B=new THREE.Vector3(),C=new THREE.Vector3(),rel=new THREE.Matrix4();
 ship.traverse(m=>{if(!m.isMesh)return;rel.multiplyMatrices(inv,m.matrixWorld);const pos=m.geometry.attributes.position,idx=m.geometry.index;
  for(let j=0;j<idx.count;j+=3){A.fromBufferAttribute(pos,idx.getX(j)).applyMatrix4(rel);B.fromBufferAttribute(pos,idx.getX(j+1)).applyMatrix4(rel);C.fromBufferAttribute(pos,idx.getX(j+2)).applyMatrix4(rel);
   // the module stores float32 triangles; mimic that so both sides see the same numbers
   const f=Math.fround,ax=f(A.x),ay=f(A.y),az=f(A.z),e1x=f(B.x)-ax,e1y=f(B.y)-ay,e1z=f(B.z)-az,e2x=f(C.x)-ax,e2y=f(C.y)-ay,e2z=f(C.z)-az;
   const px=d.y*e2z-d.z*e2y,py=d.z*e2x-d.x*e2z,pz=d.x*e2y-d.y*e2x,det=e1x*px+e1y*py+e1z*pz;if(Math.abs(det)<1e-10)continue;
   const inv2=1/det,tx=start.x-ax,ty=start.y-ay,tz=start.z-az,u=(tx*px+ty*py+tz*pz)*inv2;if(u<0||u>1)continue;
   const qx=ty*e1z-tz*e1y,qy=tz*e1x-tx*e1z,qz=tx*e1y-ty*e1x,w=(d.x*qx+d.y*qy+d.z*qz)*inv2;if(w<0||u+w>1)continue;
   const hit=(e2x*qx+e2y*qy+e2z*qz)*inv2;if(hit<0||hit>1)continue;
   const q=[start.x+d.x*hit,start.y+d.y*hit,start.z+d.z*hit],dist=(q[0]-start.x)**2+(q[1]-start.y)**2+(q[2]-start.z)**2;if(dist<nearest){nearest=dist;point=q;}
  }});
 return point?new THREE.Vector3().fromArray(point).applyMatrix4(ship.matrixWorld).y:fallback;
}

const ship=buildShip();ShipContact.surfaceHeight(ship,0,0,0);   // builds the profile
const triangles=ShipContact.stats.triangles;assert(triangles>10000,'synthetic ship is big enough to need the tree: '+triangles);
let hits=0,misses=0,maxDiff=0,nulls=0;const testsBefore=ShipContact.stats.triangleTests,N=3000;
for(let i=0;i<N;i++){
 // mostly over the deck (hits), some far away or at the wrong height (misses), different ranges, null fallback
 const over=rnd()<.8,range=.4+rnd()*2.2,fallback=rnd()<.3?null:0;let cx,cz,ref;
 if(over){   // a point on the (rolled, pitched, yawed) deck, queried from around its true height
  const w=new THREE.Vector3((rnd()-.5)*236,14+(rnd()-.5)*.3,(rnd()-.5)*34).applyMatrix4(ship.matrixWorld);cx=w.x;cz=w.z;ref=w.y+(rnd()-.5)*range*1.6;
 }else{cx=1234+(rnd()-.5)*900;cz=-640+(rnd()-.5)*400;ref=11+rnd()*10;}
 const fb=fallback===null?null:ref,a=ShipContact.surfaceHeight(ship,cx,cz,ref,range,fb),b=reference(ship,cx,cz,ref,range,fb);
 if(b===null){nulls++;assert.equal(a,null,'null fallback must be returned on a miss');continue;}
 if(b===ref){misses++;assert.equal(a,b,'miss must return the fallback');continue;}
 hits++;maxDiff=Math.max(maxDiff,Math.abs(a-b));
 // float32 triangle storage in the module vs float32-rounded reference: results must agree to rounding noise only
 assert(Math.abs(a-b)<1e-9,`height differs at (${cx.toFixed(2)},${cz.toFixed(2)}): ${a} vs ${b}`);
}
assert(hits>1500&&misses+nulls>200,'the sample covers hits and misses: '+hits+'/'+misses);
// the traversal must prune: on average far fewer triangle tests than a full scan
const perQuery=(ShipContact.stats.triangleTests-testsBefore)/N;assert(perQuery<triangles/40,`pruning: ${perQuery.toFixed(0)} triangle tests per query for ${triangles} triangles`);
// degenerate inputs
assert.equal(ShipContact.surfaceHeight(new THREE.Group(),0,0,5),5,'model without triangles returns the fallback');
assert.equal(ShipContact.surfaceHeight(new THREE.Group(),0,0,5,1.25,null),null);
console.log(JSON.stringify({triangles,queries:N,hits,misses,nullFallbacks:nulls,maxDiffMetres:maxDiff,trianglesTestedPerQuery:+perQuery.toFixed(1)}));
