'use strict';

// Build 246: the eight models of the second delivery (depot kit, Flakvierling wagon, Pacific hospital ship, Opel Blitz cargo and tanker,
// Panzer IV H, PBY-5A Catalina, Sd.Kfz. 251/D). Everything is read from the exported bytes: pinned hashes, the Khronos validator, vertex
// bounds in model space, budgets, forbidden extensions and the named nodes the game addresses. The delivered check.cjs files are NOT run.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const validator=require('gltf-validator');
const root=path.resolve(__dirname,'../..');

const VEH=(file,sha,size,budget,extra={})=>({file,sha,size,tol:.02,budget,wreck:.2,...extra});
const MODELS={
 'opel-blitz-cargo-own':VEH('assets/ground-vehicles/opel-blitz-cargo-own.glb','fd55c6dea4202de75c8ece1ae868ad93a2fc2f61306caa6fc9c670db34a3268e',[2.2,2.9,6],{tris:5000,nodes:14,mats:5,image:1024,bytes:9e5},{need:['Intact','Wreck','CabShell','StretchedCanvasCover'],kind:'vehicle'}),
 'opel-blitz-tanker-own':VEH('assets/ground-vehicles/opel-blitz-tanker-own.glb','2221d9024d54c086c45c15f005fbc85a26a8921e0694873aaaf8a70638cbc09e',[2.2,2.5,6],{tris:5000,nodes:14,mats:5,image:1024,bytes:9e5},{need:['Intact','Wreck','CabShell','TankAndServiceBox'],kind:'vehicle'}),
 'panzer4h-own':VEH('assets/ground-vehicles/panzer4h-own.glb','43b40c9e2c10ab657ab608f08d5bee33d915cd0ec4f6493235f1c3a319ebf6fc',[3.33,2.68,7.02],{tris:12000,nodes:24,mats:6,image:1024,bytes:1.5e6},
   {need:['Intact','Wreck','Turret','Gun','Muzzle1','Muzzle2'],kind:'vehicle',rig:{Turret:['yaw',[0,1,0]],Gun:['pitch',[1,0,0]]}}),
 'sdkfz251d-own':VEH('assets/ground-vehicles/sdkfz251d-own.glb','915df1445ef9aa54c88d1af5630f0eb32a81f059e0e278f7192ff130725ab0fc',[2.1,1.75,5.98],{tris:6500,nodes:18,mats:5,image:1024,bytes:1.1e6},
   {need:['Intact','Wreck','Gun','Muzzle1','Muzzle2','RearGun'],kind:'vehicle',rig:{Gun:['pitch',[1,0,0]]}}),
 'flakwagen-own':VEH('assets/ground-vehicles/flakwagen-own.glb','6409c725b28156a2a197accbfc698a723133d0935ebe7b822a1b5affdc328c09',[3,3.4,12],{tris:7000,nodes:18,mats:6,image:1024,bytes:1.2e6},
   {need:['Intact','Wreck','Turret','Gun','Muzzle1','Muzzle2','Muzzle3','Muzzle4','BogieFront','BogieRear'],kind:'vehicle',rig:{Turret:['yaw',[0,1,0]],Gun:['pitch',[1,0,0]]}}),
 'depot-kit-own':{file:'assets/remagen/sites/depot-kit-own.glb',sha:'e1404e173b88b8a51f216c5dc7f082bcb5e11c90a8703c692c2040a633191ba3',size:[18.2,3.98,22],tol:.02,
   budget:{tris:6000,nodes:20,mats:6,image:1024,bytes:1e6},kind:'depot'},
 'hospital-ship-own':{file:'assets/ships/hospital-ship-own.glb',sha:'f708d2d1aceda0bc206249651fdf7566bc021cdacbbe73bb5643825ed0443a4b',size:[20.12,45.653,163.3],tol:.02,
   budget:{tris:24000,nodes:30,mats:10,image:2048,bytes:5e6},kind:'ship',need:['Hull','SingleFunnel','funnel-exhaust-1','DeckRailings','LifeboatDavitsAndFalls']},
 'pby5a-own':{file:'assets/aircraft/pby5a-own.glb',sha:'b949aef9d16eb180db7e69744e2186b944bc4ff67ef542663c289865c1630fda',size:[31.699,6.147,19.456],tol:.02,
   budget:{tris:34000,nodes:40,mats:10,image:2048,bytes:6e6},kind:'aircraft',
   need:['PropellerLeft','PropellerRight','gear','GearLeft','GearRight','NoseGear','MainWheelLeft','MainWheelRight','NoseWheel','FloatLeft','FloatRight','AileronLeft','AileronRight','ElevatorLeft','ElevatorRight','Rudder','Muzzle1','MuzzleBlisterLeft','MuzzleBlisterRight'],
   absent:['flightFlaps','FlapLeft','FlapRight']}
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
  // the only double-sided material is the cut-out camouflage net of the depot kit
  json.materials.forEach(m=>{if(m.doubleSided)assert(id==='depot-kit-own'&&m.alphaMode==='MASK',id+' double-sided material '+m.name);});
  const info=checked.info;
  assert(info.totalTriangleCount<=spec.budget.tris,id+' triangles '+info.totalTriangleCount);
  assert(info.resources.filter(r=>r.image).every(r=>Math.max(r.image.width,r.image.height)<=spec.budget.image),id+' texture budget');
  assert.equal(json.images.length,1,id+' carries one embedded atlas');
  const b=bounds(json,bin),size=[b[3]-b[0],b[4]-b[1],b[5]-b[2]];
  size.forEach((v,i)=>assert(Math.abs(v-spec.size[i])<=Math.max(.02,spec.size[i]*spec.tol/10),id+' size '+['X','Y','Z'][i]+': '+v.toFixed(3)+' versus '+spec.size[i]));
  const names=new Map(json.nodes.map((n,i)=>[n.name,i]));
  for(const n of spec.need||[])assert(names.has(n),id+' lacks node '+n);
  for(const n of spec.absent||[])assert(!names.has(n),id+' must not carry node '+n);
  assert.equal(new Set(json.nodes.map(n=>n.name)).size,json.nodes.length,id+' node names are unique');
  const meta=json.asset.extras;
  assert.equal(meta.author,'Torpedo-Bomber project');assert(/^project-own/.test(meta.license),id+' licence label');
  assert(Array.isArray(meta.sources)&&meta.sources.length>=1,id+' lists its sources');
  if(spec.kind==='vehicle'){
   const rootNode=json.nodes.find(n=>n.extras&&n.extras.vehicle);assert(rootNode,id+' has a vehicle root');
   const v=rootNode.extras.vehicle;assert.equal(rootNode.extras.class,'ground-vehicle');assert(v.kind&&v.length>0&&v.width>0&&v.height>0);
   assert(Math.abs(b[1])<1e-3,id+' stands on y=0 (tracks / tyres touch the ground)');
   const wreck=json.nodes[names.get('Wreck')];assert.deepEqual(wreck.scale,[0,0,0],id+' wreck is stored hidden (zero scale)');
   const intact=triangles(json,names.get('Intact'),{n:0}),w=triangles(json,names.get('Wreck'),{n:0});
   assert(w>0&&w<=spec.wreck*intact,id+' wreck is '+(100*w/intact).toFixed(1)+' % of the intact model');
   const rest=bounds(json,bin,['Wreck']);rest.forEach((q,i)=>assert(Math.abs(q-b[i])<1e-6,id+' the wreck must not widen the bounds'));
   for(const [node,[drive,axis]] of Object.entries(spec.rig||{}))assert.deepEqual(json.nodes[names.get(node)].extras.rig,{drive,axis},id+' '+node+' rig');
   for(const n of json.nodes)if(/^Muzzle\d$/.test(n.name))assert(n.extras&&n.extras.direction.length===3,id+' '+n.name+' carries a direction');
   if(id==='flakwagen-own'){assert.equal(v.kind,'flakwagen');for(let i=1;i<=4;i++)assert.deepEqual(json.nodes[names.get('Muzzle'+i)].extras.direction,[0,0,1]);}
   if(id==='sdkfz251d-own')assert.deepEqual(json.nodes[names.get('Muzzle2')].extras.direction,[0,0,-1],id+' rear gun fires aft');
   if(id==='panzer4h-own')assert(json.nodes[names.get('Muzzle1')].translation[2]>3,id+' main gun muzzle ahead of the hull');
  }else if(spec.kind==='depot'){
   const roots=json.scenes[json.scene||0].nodes.map(i=>json.nodes[i]);
   assert.deepEqual(roots.map(n=>n.name),['DrumStack','CrateStack','FuelTank','CamoNet','Berm','Hut'],id+' six independent roots');
   for(const r of roots){
    assert.equal(r.extras.class,'ground-structure');assert.equal(r.extras.vehicle.kind,r.name);
    const kids=r.children.map(i=>json.nodes[i]);const wreck=kids.find(k=>k.name===r.name+'_Wreck');
    assert(wreck&&wreck.extras.role==='Wreck'&&wreck.extras.visible===false,id+' '+r.name+' has its own hidden wreck');assert.deepEqual(wreck.scale,[0,0,0]);
    assert(kids.some(k=>k.name===r.name+'_Intact'),id+' '+r.name+' intact part');
    // each root: footprint centred (child bounds around the root's own origin) and standing on y=0
    const idx=json.nodes.indexOf(r),single={...json,scenes:[{nodes:[idx]}],scene:0},sb=bounds(single,bin,[r.name+'_Wreck']);
    const t=r.translation||[0,0,0];
    assert(Math.abs(sb[1])<1e-3,id+' '+r.name+' stands on y=0');
    assert(Math.abs((sb[0]+sb[3])/2-t[0])<.35&&Math.abs((sb[2]+sb[5])/2-t[2])<.35,id+' '+r.name+' footprint is centred on its origin');
   }
   const dims=Object.fromEntries(roots.map(r=>[r.name,r.extras.vehicle]));
   assert.deepEqual([dims.FuelTank.length,dims.FuelTank.width],[12,3]);assert.equal(dims.Berm.length,10);assert.equal(dims.Hut.length,8);
  }else if(spec.kind==='ship'){
   const rootNode=json.nodes[names.get('hospital-ship-own')];assert.equal(rootNode.extras.class,'ship');
   assert(b[4]>30&&b[1]<-8,id+' hull below and funnel above the waterline');
   const ex=json.nodes[names.get('funnel-exhaust-1')].extras.shipExhaust;assert(ex.radius>0&&ex.direction[1]===1,id+' funnel exhaust points up');
   const visual=json.nodes.filter(n=>n.extras&&n.extras.shipVisualOnly).map(n=>n.name);
   for(const n of ['MastsAndCargoDerricks','AerialsAndDerrickRigging','DeckRailings','LifeboatDavitsAndFalls'])assert(visual.includes(n),id+' '+n+' is visual only');
   assert.equal(visual.filter(n=>/^Lifeboat(Starboard|Port)\d$/.test(n)).length,12,id+' twelve lifeboats, visual only');
   for(const n of ['Hull','WeatherDeck','BridgeHouse','SingleFunnel'])assert(!visual.includes(n),id+' '+n+' belongs to the collision / deck geometry');
   // starboard is -X
   assert(json.nodes[names.get('LifeboatStarboard1')].translation[0]<0&&json.nodes[names.get('LifeboatPort1')].translation[0]>0,id+' starboard is -X');
  }else if(spec.kind==='aircraft'){
   const rootNode=json.nodes[names.get('pby5a-own')];assert.equal(rootNode.extras.rigContract,1);assert.equal(rootNode.extras.kind,'pby');assert.equal(rootNode.extras.class,'amphibian-twin');
   for(const n of json.nodes)if(/Left$/.test(n.name)&&n.translation)assert(n.translation[0]<0,id+' '+n.name+' must sit on -X');
   for(const n of json.nodes)if(/Right$/.test(n.name)&&n.translation)assert(n.translation[0]>0,id+' '+n.name+' must sit on +X');
   for(const side of ['Left','Right']){const p=json.nodes[names.get('Propeller'+side)];assert.deepEqual(p.extras.rig,{drive:'prop',axis:[0,0,1],blades:3});assert(!p.rotation||Math.abs(p.rotation[3])>.99999,id+' propeller unrotated');assert(p.translation[2]>0,id+' propeller at the nose side');}
   assert.deepEqual(json.nodes[names.get('FloatLeft')].extras.rig.drive,'floatLeft');assert.deepEqual(json.nodes[names.get('FloatRight')].extras.rig.drive,'floatRight');
   for(const n of ['MainWheelLeft','MainWheelRight','NoseWheel'])assert.equal(json.nodes[names.get(n)].extras.groundWheel,true,id+' '+n+' marks the tyre');
   assert(json.nodes[names.get('NoseGear')].translation[2]>0&&json.nodes[names.get('Rudder')].translation[2]<0,id+' nose gear forward, rudder aft');
   assert.equal(json.nodes[names.get('GearLeft')].extras.rig.drive,'gear');
   assert(b[1]>-1e-3&&b[1]<.2,id+' the tyres touch y=0 in the rest pose (gear extended)');
  }
  report.push({model:id,bytes:bytes.length,triangles:info.totalTriangleCount,drawCalls:info.drawCallCount,materials:json.materials.length,size:size.map(v=>+v.toFixed(3)),glTF:{errors:0,warnings:0}});
 }
 console.log(JSON.stringify(report,null,1));
})().catch(error=>{console.error(error);process.exitCode=1;});
