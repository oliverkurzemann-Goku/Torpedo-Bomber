/* Swept aircraft probes against the original, decoded ship surfaces.
 * A shared BVH is built once per template. No render objects or model edits. */
(function(root){
'use strict';
function create(THREE){
 const profiles=new Map(),inverse=new THREE.Matrix4(),relative=new THREE.Matrix4();
 const a=new THREE.Vector3(),b=new THREE.Vector3(),v=new THREE.Vector3(),offset=new THREE.Vector3(),scale=new THREE.Vector3();
 const stats={profiles:0,triangles:0,queries:0,triangleTests:0};
 function prepare(model){
  const key=model.userData.shipContactKey;if(key&&profiles.has(key))return profiles.get(key);
  model.updateWorldMatrix(true,true);inverse.copy(model.matrixWorld).invert();const values=[];
  model.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.geometry||!mesh.visible)return;
   const p=mesh.geometry.attributes.position,indices=mesh.geometry.index;if(!p)return;
   relative.multiplyMatrices(inverse,mesh.matrixWorld);
   const array=p.isInterleavedBufferAttribute?p.data.array:p.array;
   const divisor=array instanceof Int16Array?32767:array instanceof Uint16Array?65535:array instanceof Int8Array?127:255;
   for(let j=0;j<(indices?indices.count:p.count);j+=3){
    for(let k=0;k<3;k++){
     v.fromBufferAttribute(p,indices?indices.getX(j+k):j+k);
     if(p.normalized)v.set(Math.max(-1,v.x/divisor),Math.max(-1,v.y/divisor),Math.max(-1,v.z/divisor));
     v.applyMatrix4(relative);values.push(v.x,v.y,v.z);
    }
   }
  });
  const triangles=new Float32Array(values),ids=Array.from({length:triangles.length/9},(_,i)=>i);
  function node(list){
   const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
   for(const id of list)for(let k=0;k<9;k++){
    const axis=k%3,value=triangles[id*9+k];lo[axis]=Math.min(lo[axis],value);hi[axis]=Math.max(hi[axis],value);
   }
   const out={lo,hi};if(list.length<=24){out.ids=list;return out;}
   let axis=0;for(let i=1;i<3;i++)if(hi[i]-lo[i]>hi[axis]-lo[axis])axis=i;
   const centre=id=>triangles[id*9+axis]+triangles[id*9+axis+3]+triangles[id*9+axis+6];
   list.sort((x,y)=>centre(x)-centre(y));const half=list.length>>1;
   out.left=node(list.slice(0,half));out.right=node(list.slice(half));return out;
  }
  const profile={triangles,tree:ids.length?node(ids):null};
  model.userData.shipContactKey=model.uuid;profiles.set(model.uuid,profile);
  stats.profiles=profiles.size;stats.triangles+=ids.length;return profile;
 }
 function boxHit(n,x,y,z,dx,dy,dz,padding=0){
  let low=0,high=1;
  for(let axis=0;axis<3;axis++){
   const position=axis===0?x:axis===1?y:z,delta=axis===0?dx:axis===1?dy:dz;
   if(Math.abs(delta)<1e-10){if(position<n.lo[axis]-padding||position>n.hi[axis]+padding)return false;continue;}
   const t0=(n.lo[axis]-padding-position)/delta,t1=(n.hi[axis]+padding-position)/delta;
   low=Math.max(low,Math.min(t0,t1));high=Math.min(high,Math.max(t0,t1));if(low>high)return false;
  }return true;
 }
 function triangleHit(t,id,x,y,z,dx,dy,dz,deck){
  const i=id*9,ax=t[i],ay=t[i+1],az=t[i+2],bx=t[i+3],by=t[i+4],bz=t[i+5],cx=t[i+6],cy=t[i+7],cz=t[i+8];
  if(deck&&Math.abs(ay-deck.y)<deck.tolerance&&Math.abs(by-deck.y)<deck.tolerance&&Math.abs(cy-deck.y)<deck.tolerance)return false;
  stats.triangleTests++;
  const e1x=bx-ax,e1y=by-ay,e1z=bz-az,e2x=cx-ax,e2y=cy-ay,e2z=cz-az;
  const px=dy*e2z-dz*e2y,py=dz*e2x-dx*e2z,pz=dx*e2y-dy*e2x,det=e1x*px+e1y*py+e1z*pz;
  if(Math.abs(det)<1e-10)return false;
  const inv=1/det,tx=x-ax,ty=y-ay,tz=z-az,u=(tx*px+ty*py+tz*pz)*inv;
  if(u<0||u>1)return false;
  const qx=ty*e1z-tz*e1y,qy=tz*e1x-tx*e1z,qz=tx*e1y-ty*e1x;
  const w=(dx*qx+dy*qy+dz*qz)*inv;if(w<0||u+w>1)return false;
  const hit=(e2x*qx+e2y*qy+e2z*qz)*inv;
  if(hit<0||hit>1)return false;
  stats.lastHit={id,point:[x+dx*hit,y+dy*hit,z+dz*hit]};return true;
 }
 function trace(profile,n,x,y,z,dx,dy,dz,deck){
  if(!boxHit(n,x,y,z,dx,dy,dz))return false;
  if(n.ids){for(const id of n.ids)if(triangleHit(profile.triangles,id,x,y,z,dx,dy,dz,deck))return true;return false;}
  return trace(profile,n.left,x,y,z,dx,dy,dz,deck)||trace(profile,n.right,x,y,z,dx,dy,dz,deck);
 }
 function sweep(model,from,to,q0,q1,probes,{deck=null,translation=null}={}){
  if(!model||!model.visible)return false;
  const profile=prepare(model);if(!profile.tree)return false;
  model.updateWorldMatrix(true,false);inverse.copy(model.matrixWorld).invert();stats.queries++;
  a.copy(from);if(translation)a.add(translation);a.applyMatrix4(inverse);b.copy(to).applyMatrix4(inverse);
  scale.setFromMatrixScale(model.matrixWorld);const radius=9/Math.min(scale.x,scale.y,scale.z);
  if(!boxHit(profile.tree,a.x,a.y,a.z,b.x-a.x,b.y-a.y,b.z-a.z,radius))return false;
  for(const probe of probes){
   offset.fromArray(probe).applyQuaternion(q0);a.copy(from).add(offset);if(translation)a.add(translation);a.applyMatrix4(inverse);
   offset.fromArray(probe).applyQuaternion(q1);b.copy(to).add(offset).applyMatrix4(inverse);
   if(trace(profile,profile.tree,a.x,a.y,a.z,b.x-a.x,b.y-a.y,b.z-a.z,deck)){
    stats.lastHit.probe=probe;stats.lastHit.world=v.fromArray(stats.lastHit.point).applyMatrix4(model.matrixWorld).toArray();return true;
   }
  }return false;
 }
 // Nearest hit of a short vertical segment with the deck surface (Build 234). Same tree and bit-for-bit the same
 // height as the previous "visit every leaf" search (okinawa/tests/ship-contact-height.cjs compares both), but
 // without per-call allocations and with nearest-first traversal: subtrees that start behind an already found hit
 // are skipped. The carrier deck is queried ~30 times per frame (crew feet, arrest wires, tyre contacts) against a
 // 290,000-triangle tree; measured about 2x faster (18-25 us instead of 35-50 us per query).
 const nearStart=new THREE.Vector3(),nearEnd=new THREE.Vector3(),nearPoint=new THREE.Vector3(),nearStack=new Array(128),nearEntry=new Float64Array(128);
 function boxEntry(n,x,y,z,dx,dy,dz){
  let low=0,high=1;
  for(let axis=0;axis<3;axis++){
   const position=axis===0?x:axis===1?y:z,delta=axis===0?dx:axis===1?dy:dz;
   if(Math.abs(delta)<1e-10){if(position<n.lo[axis]||position>n.hi[axis])return Infinity;continue;}
   const t0=(n.lo[axis]-position)/delta,t1=(n.hi[axis]-position)/delta,near=t0<t1?t0:t1,far=t0<t1?t1:t0;
   if(near>low)low=near;if(far<high)high=far;if(low>high)return Infinity;
  }return low;
 }
 function segmentTriangle(t,id,x,y,z,dx,dy,dz){   // parameter of the hit along the segment, or -1
  const i=id*9,ax=t[i],ay=t[i+1],az=t[i+2],e1x=t[i+3]-ax,e1y=t[i+4]-ay,e1z=t[i+5]-az,e2x=t[i+6]-ax,e2y=t[i+7]-ay,e2z=t[i+8]-az;
  const px=dy*e2z-dz*e2y,py=dz*e2x-dx*e2z,pz=dx*e2y-dy*e2x,det=e1x*px+e1y*py+e1z*pz;
  if(Math.abs(det)<1e-10)return -1;
  const inv=1/det,tx=x-ax,ty=y-ay,tz=z-az,u=(tx*px+ty*py+tz*pz)*inv;
  if(u<0||u>1)return -1;
  const qx=ty*e1z-tz*e1y,qy=tz*e1x-tx*e1z,qz=tx*e1y-ty*e1x,w=(dx*qx+dy*qy+dz*qz)*inv;
  if(w<0||u+w>1)return -1;
  const hit=(e2x*qx+e2y*qy+e2z*qz)*inv;return hit<0||hit>1?-1:hit;
 }
 function surfaceHeight(model,x,z,reference,range=1.25,fallback=reference){
  const profile=prepare(model);if(!profile.tree)return fallback;
  model.updateWorldMatrix(true,false);inverse.copy(model.matrixWorld).invert();
  nearStart.set(x,reference+range,z).applyMatrix4(inverse);nearEnd.set(x,reference-range,z).applyMatrix4(inverse);
  const sx=nearStart.x,sy=nearStart.y,sz=nearStart.z,dx=nearEnd.x-sx,dy=nearEnd.y-sy,dz=nearEnd.z-sz,triangles=profile.triangles;
  let best=Infinity,top=0,tests=0;
  const first=boxEntry(profile.tree,sx,sy,sz,dx,dy,dz);
  if(first!==Infinity){nearStack[0]=profile.tree;nearEntry[0]=first;top=1;}
  while(top){
   const n=nearStack[--top];if(nearEntry[top]>best+1e-9)continue;
   if(n.ids){for(const id of n.ids){tests++;const t=segmentTriangle(triangles,id,sx,sy,sz,dx,dy,dz);if(t>=0&&t<best)best=t;}continue;}
   const l=boxEntry(n.left,sx,sy,sz,dx,dy,dz),r=boxEntry(n.right,sx,sy,sz,dx,dy,dz);
   // push the farther child first so the nearer one is visited next
   if(l<=r){if(r!==Infinity){nearStack[top]=n.right;nearEntry[top++]=r;}if(l!==Infinity){nearStack[top]=n.left;nearEntry[top++]=l;}}
   else{if(l!==Infinity){nearStack[top]=n.left;nearEntry[top++]=l;}if(r!==Infinity){nearStack[top]=n.right;nearEntry[top++]=r;}}
  }
  stats.triangleTests+=tests;
  return best===Infinity?fallback:nearPoint.set(sx+dx*best,sy+dy*best,sz+dz*best).applyMatrix4(model.matrixWorld).y;
 }
function probesFor(model,frame,fallback){
  if(!model)return fallback;
  if(model.userData.aircraftShipProbes)return model.userData.aircraftShipProbes;
  frame.updateWorldMatrix(true,true);
  const inverse=frame.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),point=new THREE.Vector3(),vertices=[];
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  model.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.visible)return;
    for(let parent=mesh;parent&&parent!==model;parent=parent.parent)
      if(!parent.visible||parent.userData.articulationPart||/gear|rotor|propeller|flightFlaps/i.test(parent.name))return;
    const p=mesh.geometry.attributes.position,indices=mesh.geometry.index;if(!p)return;
    const array=p.isInterleavedBufferAttribute?p.data.array:p.array,divisor=array instanceof Int16Array?32767:array instanceof Uint16Array?65535:array instanceof Int8Array?127:255;
    matrix.multiplyMatrices(inverse,mesh.matrixWorld);
    const ids=indices?new Set(indices.array):Array.from({length:p.count},(_,i)=>i);
    for(const i of ids){point.fromBufferAttribute(p,i);
      if(p.normalized)point.set(Math.max(-1,point.x/divisor),Math.max(-1,point.y/divisor),Math.max(-1,point.z/divisor));
      point.applyMatrix4(matrix);vertices.push(point.toArray());minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);minZ=Math.min(minZ,point.z);maxZ=Math.max(maxZ,point.z);
    }
  });
  if(!vertices.length)return fallback;
  const hint=fallback[5],probes=fallback.slice(0,3);
  // Nose, tail and wing probes are actual skin vertices; one common aircraft
  // box used to extend beyond the smaller Zero and could falsely clip a gallery.
  const targets=[[0,0,minZ],[0,0,maxZ],...[-.98,-.65,-.30,.30,.65,.98].map(f=>[(f<0?-minX:maxX)*f,hint[1],hint[2]])];
  for(const [x,y,z] of targets){let best=null,score=Infinity;
    for(const p of vertices){const distance=Math.abs(p[0]-x)*4+Math.abs(p[1]-y)+Math.abs(p[2]-z)*.6;if(distance<score){score=distance;best=p;}}
    probes.push(best);
  }
  return model.userData.aircraftShipProbes=probes;
}
 return {prepare,sweep,probesFor,surfaceHeight,stats};
}
root.ShipContact={create};if(typeof module==='object'&&module.exports)module.exports=root.ShipContact;
})(typeof window==='undefined'?globalThis:window);
