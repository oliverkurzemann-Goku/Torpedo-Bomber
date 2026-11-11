'use strict';

// Build 243: the five delivered Rhine models (Ar 234 B-2, Fi 103, V-1 ramp, Wuerzburg radar, searchlight).
// Everything is read from the exported bytes: pinned hashes, the Khronos validator, vertex bounds in model space,
// budgets, forbidden extensions, and the named nodes the game addresses. The delivered check.cjs files are NOT run here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const validator=require('gltf-validator');
const root=path.resolve(__dirname,'../..');

const MODELS={
 'ar234b2-own':{file:'assets/aircraft/ar234b2-own.glb',sha:'036416e761f59888d48e95c4c78461d4ca9170d99e4d06e513830b4d5ccc54fb',
  size:[14.40,4.30,12.64],tol:.02,budget:{tris:28000,nodes:36,mats:8,image:2048,bytes:6e6},
  need:['AileronLeft','AileronRight','ElevatorLeft','ElevatorRight','Rudder','flightFlaps','FlapLeft','FlapRight','ExhaustLeft','ExhaustRight','MuzzleRear1','MuzzleRear2','Bomb'],
  absent:['gear','GearLeft','GearRight','TailGear','Propeller']},
 'fi103-own':{file:'assets/aircraft/fi103-own.glb',sha:'0524d3b0ef969fa84b796bffe190b1061163f7aaf2de2dd30f1a9e6c44f2b6b5',
  size:[5.37,1.42,8.32],tol:.02,budget:{tris:3500,nodes:8,mats:3,image:512,bytes:4e5},need:['Propeller','ExhaustJet'],absent:['gear']},
 'fi103-ramp-own':{file:'assets/remagen/sites/fi103-ramp-own.glb',sha:'77f08ee13cc6571d3d49836682b560f1388b2bac9d724344b35d15d0b6ad8c1c',
  size:[8.28,6.5,48],tol:.02,budget:{tris:4500,nodes:12,mats:4,image:1024,bytes:8e5},need:['Intact','Wreck','LaunchPoint'],wreck:.4},
 'wuerzburg-riese-own':{file:'assets/remagen/sites/wuerzburg-riese-own.glb',sha:'8739b8194ac98051c7bbce74fd30a01fa28aff3d393bdde261d5a3cb24c5f0ed',
  size:[7.5,9.003,6],tol:.02,budget:{tris:5000,nodes:14,mats:4,image:1024,bytes:9e5},need:['Intact','Wreck','Dish','Elevation'],wreck:.4},
 'flak-searchlight-own':{file:'assets/remagen/sites/flak-searchlight-own.glb',sha:'b821132200c002bf163d066822b66c43ffc484cb737e1cb8d2ea3b1fe833e0d9',
  size:[3.443,2.83,3.6],tol:.02,budget:{tris:3000,nodes:10,mats:3,image:1024,bytes:6e5},need:['Intact','Wreck','Mount','Projector','BeamOrigin'],wreck:.4}
};
const FORBIDDEN=['KHR_materials_pbrSpecularGlossiness','KHR_mesh_quantization','KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu','KHR_texture_transform'];

function parse(bytes){
 assert.equal(bytes.toString('ascii',0,4),'glTF');
 let o=12,json,bin;
 while(o<bytes.length){const l=bytes.readUInt32LE(o),t=bytes.readUInt32LE(o+4);const c=bytes.subarray(o+8,o+8+l);if(t===0x4e4f534a)json=JSON.parse(c.toString('utf8'));else if(t===0x004e4942)bin=c;o+=8+l;}
 return {json,bin};
}
function compose(t=[0,0,0],r=[0,0,0,1],s=[1,1,1]){
 const [x,y,z,w]=r,x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
 return [(1-(yy+zz))*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0,(xy-wz)*s[1],(1-(xx+zz))*s[1],(yz+wx)*s[1],0,(xz+wy)*s[2],(yz-wx)*s[2],(1-(xx+yy))*s[2],0,t[0],t[1],t[2],1];
}
function mul(a,b){const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
function apply(m,p){return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
function floats(json,bin,index){
 const a=json.accessors[index],v=json.bufferViews[a.bufferView],base=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||12;
 assert.equal(a.componentType,5126,'positions are Float32');
 return Array.from({length:a.count},(_,i)=>[0,1,2].map(k=>bin.readFloatLE(base+i*stride+k*4)));
}
// bounds of every vertex in model space; `skip` names whose subtree is ignored (the hidden wreck, zero scale anyway)
function bounds(json,bin,skip=[]){
 const nodes=json.nodes,b=[1e9,1e9,1e9,-1e9,-1e9,-1e9],walk=(i,m)=>{
  if(skip.includes(nodes[i].name))return;
  const w=mul(m,nodes[i].matrix||compose(nodes[i].translation,nodes[i].rotation,nodes[i].scale));
  if(nodes[i].mesh!==undefined)for(const prim of json.meshes[nodes[i].mesh].primitives)for(const p of floats(json,bin,prim.attributes.POSITION)){
   const q=apply(w,p);for(let a=0;a<3;a++){b[a]=Math.min(b[a],q[a]);b[a+3]=Math.max(b[a+3],q[a]);}}
  (nodes[i].children||[]).forEach(c=>walk(c,w));
 };
 (json.scenes[json.scene||0].nodes).forEach(i=>walk(i,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]));
 return b;
}
function triangles(json,nodeIndex,acc){
 const n=json.nodes[nodeIndex];
 if(n.mesh!==undefined)for(const p of json.meshes[n.mesh].primitives)acc.n+=(p.indices!==undefined?json.accessors[p.indices].count:json.accessors[p.attributes.POSITION].count)/3;
 (n.children||[]).forEach(c=>triangles(json,c,acc));
 return acc.n;
}

(async()=>{
 const report=[];
 for(const [id,spec] of Object.entries(MODELS)){
  const bytes=fs.readFileSync(path.join(root,spec.file));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),spec.sha,id+': the delivered file changed (the GLB is the reference, not a rebuild)');
  assert(bytes.length<=spec.budget.bytes,id+' file size '+bytes.length);
  const {json,bin}=parse(bytes);
  const checked=await validator.validateBytes(new Uint8Array(bytes));
  assert.equal(checked.issues.numErrors,0,id+' glTF errors '+JSON.stringify(checked.issues.messages.slice(0,3)));
  assert.equal(checked.issues.numWarnings,0,id+' glTF warnings');
  for(const e of json.extensionsUsed||[])assert(!FORBIDDEN.includes(e),id+' uses forbidden extension '+e);
  assert.deepEqual(json.extensionsRequired||[],[],id+' requires no extensions');
  // geometry contract: Float32 positions, normals, UVs on textured meshes, no vertex colours, no tangents, no double-sided paint
  let meshNodes=0;
  json.nodes.forEach(n=>{
   if(n.mesh===undefined)return;meshNodes++;
   for(const p of json.meshes[n.mesh].primitives){
    assert(p.attributes.NORMAL!==undefined,id+' mesh lacks normals');
    assert(p.attributes.TEXCOORD_0!==undefined,id+' mesh lacks UVs');
    assert.equal(p.attributes.COLOR_0,undefined,id+' uses vertex colours');
   }
  });
  assert(meshNodes<=spec.budget.nodes,id+' mesh nodes '+meshNodes);
  assert(json.materials.length<=spec.budget.mats,id+' materials '+json.materials.length);
  json.materials.forEach(m=>assert(!m.doubleSided,id+' double-sided material '+m.name));
  const info=checked.info;
  assert(info.totalTriangleCount<=spec.budget.tris,id+' triangles '+info.totalTriangleCount);
  assert(info.resources.filter(r=>r.image).every(r=>Math.max(r.image.width,r.image.height)<=spec.budget.image),id+' texture budget');
  assert.equal(json.images.length,1,id+' carries one embedded atlas');
  // frame and dimensions from the exported vertices (the hidden wreck has zero scale, so it adds nothing)
  const b=bounds(json,bin),size=[b[3]-b[0],b[4]-b[1],b[5]-b[2]];
  size.forEach((v,i)=>assert(Math.abs(v-spec.size[i])<=Math.max(.02,spec.size[i]*spec.tol/10),id+' size '+['X','Y','Z'][i]+': '+v.toFixed(3)+' versus '+spec.size[i]));
  // names the game addresses
  const names=new Map(json.nodes.map((n,i)=>[n.name,i]));
  for(const n of spec.need||[])assert(names.has(n),id+' lacks node '+n);
  for(const n of spec.absent||[])assert(!names.has(n),id+' must not carry node '+n);
  assert.equal(new Set(json.nodes.map(n=>n.name)).size,json.nodes.length,id+' node names are unique');
  const rootNode=json.nodes.find(n=>n.extras&&(n.extras.rigContract!==undefined||n.extras.vehicle));
  assert(rootNode,id+' has a contract root');
  const meta=json.asset.extras;
  assert.equal(meta.author,'Torpedo-Bomber project');assert(/^project-own/.test(meta.license),id+' licence label');
  assert(Array.isArray(meta.sources)&&meta.sources.length>=1,id+' lists its sources');
  if(rootNode.extras.rigContract!==undefined){
   assert.equal(rootNode.extras.rigContract,1);assert(rootNode.extras.references.length>=1);
   // aircraft: nose +Z, left parts on -X, aileron signs as in contract v1
   for(const n of json.nodes)if(/Left$/.test(n.name)&&n.translation)assert(n.translation[0]<0,id+' '+n.name+' must sit on -X');
   for(const n of json.nodes)if(/Right$/.test(n.name)&&n.translation)assert(n.translation[0]>0,id+' '+n.name+' must sit on +X');
   const el=(n)=>json.nodes[names.get(n)];
   if(names.has('AileronLeft')){assert(el('AileronLeft').extras.rig.gain>0&&el('AileronRight').extras.rig.gain<0,id+' aileron signs');}
   if(names.has('Propeller')){
    const p=el('Propeller');assert.equal(p.extras.rig.drive,'prop');assert.deepEqual(p.extras.rig.axis,[0,0,1]);
    assert(!p.rotation||Math.abs(p.rotation[3])>.99999,id+' propeller node must be unrotated');assert.equal(p.extras.rig.blades,4);
    assert(p.translation[2]>0,id+' propeller at the +Z nose');
   }
   for(const n of ['ExhaustLeft','ExhaustRight','ExhaustJet'])if(names.has(n)){
    const ex=el(n).extras.exhaust;assert(ex&&ex.radius>0&&ex.direction[2]<0,id+' '+n+' blows backwards (-Z)');
   }
   if(names.has('Rudder'))assert(el('Rudder').translation[2]<0,id+' rudder at the -Z tail');
  }else{
   // ground sites: origin on the ground, front +Z, a hidden wreck of at most 40 % of the intact triangles
   assert(Math.abs(b[1])<1e-3,id+' stands on y=0');
   const v=rootNode.extras.vehicle;assert(v.kind&&v.length>0&&v.width>0&&v.height>0);
   const wreck=json.nodes[names.get('Wreck')];
   assert.deepEqual(wreck.scale,[0,0,0],id+' wreck is stored hidden (zero scale)');
   const intact=triangles(json,names.get('Intact'),{n:0}),w=triangles(json,names.get('Wreck'),{n:0});
   assert(w>0&&w<=spec.wreck*intact,id+' wreck is '+(100*w/intact).toFixed(1)+' % of the intact model');
   const rest=bounds(json,bin,['Wreck']);
   rest.forEach((v,i)=>assert(Math.abs(v-b[i])<1e-6,id+' the wreck must not widen the bounds'));
   if(id==='fi103-ramp-own'){
    const lp=json.nodes[names.get('LaunchPoint')];assert(lp.translation[2]<-20&&lp.translation[1]>1,id+' launch point at the rear end, above the rail');
   }
   if(id==='flak-searchlight-own'){
    assert.deepEqual(json.nodes[names.get('Mount')].extras.rig,{drive:'yaw',axis:[0,1,0]});
    assert.deepEqual(json.nodes[names.get('Projector')].extras.rig,{drive:'pitch',axis:[1,0,0]});
    assert(json.nodes[names.get('BeamOrigin')].translation[2]>0,id+' beam starts at the front glass');
   }
   if(id==='wuerzburg-riese-own'){
    assert.deepEqual(json.nodes[names.get('Dish')].extras.rig,{drive:'yaw',axis:[0,1,0]});
    assert.deepEqual(json.nodes[names.get('Elevation')].extras.rig,{drive:'pitch',axis:[1,0,0]});
   }
  }
  report.push({model:id,bytes:bytes.length,triangles:info.totalTriangleCount,drawCalls:info.drawCallCount,materials:json.materials.length,
   size:size.map(v=>+v.toFixed(3)),glTF:{errors:0,warnings:0}});
 }
 console.log(JSON.stringify(report,null,1));
})().catch(error=>{console.error(error);process.exitCode=1;});
