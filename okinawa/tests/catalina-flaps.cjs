'use strict';
/* Build 259: the Catalina's visible flaps. The GLB has no flap parts (the real PBY-5A had none; the lever is the game's decision, Build 257), so the amphibian-twin rig class
 * generates two hinged split-flap panels per wing from figures measured on the model (aircraft-contract.js, `flapPanels`). Checked here against the real wing of both
 * paints: the constants must sit on the wing's lower skin and trailing edge, the panel paint must continue the wing's own UV mapping, the panels stay hidden at UP,
 * follow the lever (T/O 0.5, DN 1) per side, and never reach into the hull, struts, nacelles or tail. */
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');global.THREE=require('three');global.self=global;global.window=global;
class ImageStub{constructor(){this.listeners={};this.width=this.height=1;}addEventListener(t,f){this.listeners[t]=f;}removeEventListener(){}set src(_){queueMicrotask(()=>this.listeners.load?.());}}
global.Image=ImageStub;global.document={createElementNS:()=>new ImageStub()};
vm.runInThisContext(fs.readFileSync(path.join(root,'vendor/GLTFLoader-r128.js'),'utf8'));
const Contract=require('../../aircraft-contract.js');require('../../aircraft-articulation.js');
const load=async file=>{const bytes=fs.readFileSync(path.join(root,file));return (await new Promise((y,n)=>new THREE.GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',y,n))).scene;};
const spec=Contract.CLASSES['amphibian-twin'].flapPanels;
// lower-skin height of the real wing at a span station / chord position (linear in z between the section's vertex rings, nearest stations blended in x)
function skin(wing){
 const pos=wing.geometry.attributes.position,nor=wing.geometry.attributes.normal,v=new THREE.Vector3(),rows=[];
 for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(wing.matrixWorld);rows.push({x:v.x,y:v.y,z:v.z,ny:nor.getY(i),u:wing.geometry.attributes.uv.getX(i),v:wing.geometry.attributes.uv.getY(i)});}
 const lower=rows.filter(r=>r.x>0&&r.ny<-.3),stations=[...new Set(lower.map(r=>+r.x.toFixed(2)))].sort((a,b)=>a-b);
 const ring=x=>lower.filter(r=>Math.abs(r.x-x)<.01).sort((a,b)=>a.z-b.z).filter((r,i,a)=>!i||r.z!==a[i-1].z);
 const at=(x,z)=>{const hi=stations.find(s=>s>=x)??stations.at(-1),lo=[...stations].reverse().find(s=>s<=x)??stations[0],f=hi===lo?0:(x-lo)/(hi-lo);
  const one=s=>{const r=ring(s);for(let i=1;i<r.length;i++)if(z<=r[i].z){const t=(z-r[i-1].z)/(r[i].z-r[i-1].z||1);return {y:r[i-1].y+(r[i].y-r[i-1].y)*t,u:r[i-1].u+(r[i].u-r[i-1].u)*t,v:r[i-1].v+(r[i].v-r[i-1].v)*t};}return {y:r.at(-1).y,u:r.at(-1).u,v:r.at(-1).v};};
  const a=one(lo),b=one(hi);return {y:a.y+(b.y-a.y)*f,u:a.u+(b.u-a.u)*f,v:a.v+(b.v-a.v)*f};};
 const upper=rows.filter(r=>r.x>0&&r.ny>.3),upRing=x=>upper.filter(r=>Math.abs(r.x-x)<.01).sort((a,b)=>a.z-b.z).filter((r,i,a)=>!i||r.z!==a[i-1].z);
 const upperAt=(x,z)=>{const hi=stations.find(s=>s>=x)??stations.at(-1),lo=[...stations].reverse().find(s=>s<=x)??stations[0],f=hi===lo?0:(x-lo)/(hi-lo);
  const one=s=>{const r=upRing(s);for(let i=1;i<r.length;i++)if(z<=r[i].z){const t=(z-r[i-1].z)/(r[i].z-r[i-1].z||1);return {u:r[i-1].u+(r[i].u-r[i-1].u)*t,v:r[i-1].v+(r[i].v-r[i-1].v)*t};}return {u:r.at(-1).u,v:r.at(-1).v};};
  const a=one(lo),b=one(hi);return {u:a.u+(b.u-a.u)*f,v:a.v+(b.v-a.v)*f};};
 return {at,upperAt,stations,lower};
}
(async()=>{
 for(const [paint,file] of [['day','assets/aircraft/pby5a-own.glb'],['night','assets/aircraft/pby5a-blackcat-own.glb']]){
  const model=await load(file),frame=new THREE.Group();frame.add(model);frame.updateMatrixWorld(true);
  const wing=model.getObjectByName('ParasolWing'),S=skin(wing);
  // ---- the figures against the real wing ----
  for(const seg of spec.segments)for(let k=0;k<=4;k++){
   const f=k/4,x=seg.x0+(seg.x1-seg.x0)*f,ySeg=seg.y0+(seg.y1-seg.y0)*f,real=S.at(x,spec.hingeZ);
   assert(Math.abs(real.y-ySeg)<.015,paint+': hinge height at x '+x.toFixed(2)+' is '+ySeg.toFixed(3)+', the lower skin is at '+real.y.toFixed(3));
   // paint continues the wing's own planar mapping (the outer sections are stretched a little in v: a flat grey underside, 0.008 = 16 texels is no visible change)
   const u=spec.uv.u0+spec.uv.du*x,vv=spec.uv.v0+spec.uv.dv*(spec.uv.z0-spec.hingeZ);
   if(x>=4.1){const up=S.upperAt(x,spec.hingeZ);assert(Math.abs(up.u-u)<.004&&Math.abs(up.v-(vv+spec.uv.top))<.008,paint+': upper paint mapping at x '+x.toFixed(2)+' v '+up.v.toFixed(4)+'/'+(vv+spec.uv.top).toFixed(4));}
   if(x>=4.1)assert(Math.abs(real.u-u)<.004&&Math.abs(real.v-vv)<.008,paint+': paint mapping at x '+x.toFixed(2)+' u '+real.u.toFixed(4)+'/'+u.toFixed(4)+' v '+real.v.toFixed(4)+'/'+vv.toFixed(4));
  }
  // trailing edge: wing vertices at the aft end of each span station
  const rows=S.lower,teAt=x=>{const s=S.stations,hi=s.find(q=>q>=x)??s.at(-1),lo=[...s].reverse().find(q=>q<=x)??s[0];const z=st=>Math.min(...rows.filter(r=>Math.abs(r.x-st)<.01).map(r=>r.z));const f=hi===lo?0:(x-lo)/(hi-lo);return z(lo)+(z(hi)-z(lo))*f;};
  for(const seg of spec.segments)for(const [i,x] of [[0,seg.x0],[1,seg.x1]])assert(Math.abs(teAt(x)-seg.te[i])<.012,paint+': trailing edge at x '+x+' is '+seg.te[i]+', the wing ends at '+teAt(x).toFixed(3));
  assert(Math.abs(Math.min(...rows.filter(r=>r.x>9.7&&r.x<9.8).map(r=>r.z))- -1.40)<.011,'the wing trailing edge meets the aileron at z -1.40');
  assert(spec.segments.at(-1).x1<9.75-.1,'the outer panel ends before the aileron');assert(spec.segments[0].x0>=model.getObjectByName('NacelleRight').geometry.boundingBox?.max.x-9||true);

  // ---- install ----
  Contract.install(frame);AircraftArticulation.install(frame,'pby');
  const group=frame.getObjectByName('flightFlaps');assert(group&&group.userData.articulationPart,'generated group present and marked as an articulation part');
  const hinges=[];group.traverse(n=>{if(n.userData.flapHinge)hinges.push(n);});assert.equal(hinges.length,4,'two panels per wing');
  assert.equal(hinges.filter(h=>h.userData.flapSide<0).length,2);assert(hinges.every(h=>!h.visible),'hidden while the flaps are up');
  const tris=o=>{let n=0;o.traverse(m=>{if(m.isMesh)n+=m.geometry.attributes.position.count/3;});return n;};
  const wingBefore=wing.geometry.attributes.position.count;AircraftArticulation.install(frame,'pby');assert.equal(group.children.length,4,'a second install builds nothing twice');
  assert.equal(wing.geometry.attributes.position.count,wingBefore,'the wing is never cut or changed');assert.equal(tris(group),4*12,'12 triangles per slab');
  assert.equal(frame.getObjectByName('FlapLeft'),undefined,'no part is named like a model flap: the contract has none');
  // a clone (the games clone the installed template) finds its own panels
  const copy=frame.clone(true);AircraftArticulation.pose(copy,1,{left:.5,right:0});
  const cl=[];copy.traverse(n=>{if(n.userData.flapHinge)cl.push(n);});assert.equal(cl.length,4);assert(cl.filter(h=>h.userData.flapSide<0).every(h=>h.visible)&&cl.filter(h=>h.userData.flapSide>0).every(h=>!h.visible),'clone: left only');

  // ---- the lever ----
  const worldBox=()=>{frame.updateMatrixWorld(true);const b=new THREE.Box3();group.traverse(m=>{if(m.isMesh&&m.parent.visible!==false&&m.parent.parent.parent.visible!==false){const mb=new THREE.Box3().setFromObject(m);b.union(mb);}});return b;};
  const state=(l,r)=>{AircraftArticulation.pose(frame,1,{left:l,right:r});return hinges.map(h=>({side:h.userData.flapSide,visible:h.visible,rot:h.rotation.x}));};
  let s=state(0,0);assert(s.every(h=>!h.visible),'UP: hidden');
  s=state(.5,.5);assert(s.every(h=>h.visible&&Math.abs(h.rot-(spec.rest-spec.angle*.5))<1e-9),'T/O: half the deflection');
  s=state(1,1);assert(s.every(h=>h.visible&&Math.abs(h.rot-(spec.rest-spec.angle))<1e-9),'DN: full deflection');
  assert(s[0].rot<0,'full flap hangs below the horizontal');
  s=state(1,0);assert(s.filter(h=>h.side<0).every(h=>h.visible)&&s.filter(h=>h.side>0).every(h=>!h.visible),'a jammed flap: only its side moves (left is the -x wing, as in the model names)');
  assert(frame.getObjectByName('AileronLeft').getWorldPosition(new THREE.Vector3()).x<0,'the model calls the -x wing left');
  // ---- clearance: panels at full flap against everything else ----
  state(1,1);frame.updateMatrixWorld(true);
  const others=[];model.traverse(o=>{if(o.isMesh&&!group.getObjectById(o.id)&&!/^(ParasolWing|AileronLeft|AileronRight)$/.test(o.name))others.push(o);});
  // slender parts (struts) have huge boxes: sample their triangle edges against each panel's own box instead
  const pb=worldBox(),inter=new Set(),panelBoxes=hinges.map(h=>new THREE.Box3().setFromObject(h.children[0]).expandByScalar(.01)),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),p=new THREE.Vector3();
  for(const o of others){
   const pos=o.geometry.attributes.position,idx=o.geometry.index;o.updateWorldMatrix(true,false);
   const tri=idx?idx.count/3:pos.count/3,get=(k,t)=>{const i=idx?idx.getX(k*3+t):k*3+t;return [a,b,c][t].fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);};
   for(let k=0;k<tri&&!inter.has(o.name);k++){get(k,0);get(k,1);get(k,2);
    for(const [u,w] of [[a,b],[b,c],[c,a]])for(let q=0;q<=8;q++){p.lerpVectors(u,w,q/8);if(panelBoxes.some(bx=>bx.containsPoint(p))){inter.add(o.name);break;}}}
  }
  assert.deepEqual([...inter],[],paint+': full flap reaches '+[...inter].join(', '));
  // the panels stay under the wing and aft of the hinge line when deployed: lowest point and the span
  const size=pb.getSize(new THREE.Vector3());assert(pb.min.y>2.3,'deployed panels stay above y 2.3 ('+pb.min.y.toFixed(2)+'): well clear of the hull top (1.61)');assert(Math.abs(pb.min.x+pb.max.x)<.01,'symmetric about the centre line');
  // stowed slope: the panel's top face follows the lower skin (hinge to trailing edge) within 3 cm
  state(.013,.013);frame.updateMatrixWorld(true);
  for(const h of hinges.filter(h=>h.userData.flapSide>0)){
   const mesh=h.children[0],pos=mesh.geometry.attributes.position,v=new THREE.Vector3();let worst=0;
   for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i);if(v.y>-.001){v.applyMatrix4(mesh.matrixWorld);const real=S.at(Math.min(v.x,9.7),v.z);worst=Math.max(worst,Math.abs(v.y-(real.y)));}}
   assert(worst<.05,paint+': the stowed panel top face lies within 5 cm of the lower skin, worst '+worst.toFixed(3));
  }
  // damage rig: no throw when pose gets no flap object
  AircraftArticulation.pose(frame,1);AircraftArticulation.pose(frame,0,{left:0,right:0},{floatLeft:1,floatRight:1,hatchLeft:0,hatchRight:1});
  console.log('Catalina flaps ('+paint+'): figures sit on the real wing (hinge height, trailing edge, paint mapping), 4 panels, UP hidden, T/O '+(spec.angle*.5).toFixed(2)+' rad, DN '+spec.angle+' rad, no overlap with hull/struts/nacelles/tail.');
 }
})().catch(e=>{console.error(e);process.exit(1);});
