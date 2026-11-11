'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const id='fi103-own';
const file=process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:path.join(__dirname,id+'.glb');
const specs={
 'ar234b2-own':{budget:[28000,36,8,2048,6000000],size:[14.40,4.30,12.64],kind:'ar234',class:'jet-bomber-twin',
  names:['AileronLeft','AileronRight','ElevatorLeft','ElevatorRight','Rudder','flightFlaps','FlapLeft','FlapRight',
    'ExhaustLeft','ExhaustRight','MuzzleRear1','MuzzleRear2','Bomb']},
 'fi103-own':{budget:[3500,8,3,512,400000],size:[5.37,1.42,8.32],kind:'fi103',class:'drone',names:['Propeller','ExhaustJet']},
 'fi103-ramp-own':{budget:[4500,12,4,1024,800000],kind:'fi103-ramp',class:'ground-structure',
  names:['LaunchPoint','Wreck','ConcreteFootings','RailShell','ControlHut','CamouflageNet']},
 'wuerzburg-riese-own':{budget:[5000,14,4,1024,900000],kind:'wuerzburg-riese',class:'ground-structure',
  names:['Dish','Elevation','Wreck','ReflectorShell','FoundationAndRace']},
 'flak-searchlight-own':{budget:[3000,10,3,1024,600000],kind:'flak-searchlight',class:'ground-structure',
  names:['Mount','Projector','BeamOrigin','Wreck','TwoAxleTrailer','PaintedReflector']},
};
const spec=specs[id],bytes=fs.readFileSync(file),[maxTris,maxNodes,maxMats,textureSize,maxBytes]=spec.budget;
assert.equal(bytes.toString('ascii',0,4),'glTF');
assert.equal(bytes.readUInt32LE(4),2);
assert.equal(bytes.readUInt32LE(8),bytes.length);
assert(bytes.length<=maxBytes,'file budget');
const jsonSize=bytes.readUInt32LE(12),binary=28+jsonSize,j=JSON.parse(bytes.subarray(20,20+jsonSize));
assert.equal(bytes.toString('ascii',16,20),'JSON');
assert.equal(bytes.toString('ascii',24+jsonSize,28+jsonSize),'BIN\0');
assert.deepEqual(j.extensionsRequired??[],[]);
assert.deepEqual(j.extensionsUsed??[],[]);
assert.equal(j.images.length,1);assert.equal(j.textures.length,1);
assert.equal(j.images[0].mimeType,'image/png');
const image=j.bufferViews[j.images[0].bufferView];
const png=bytes.subarray(binary+(image.byteOffset??0),binary+(image.byteOffset??0)+image.byteLength);
assert.equal(png.subarray(1,4).toString(),'PNG');
assert.equal(png.readUInt32BE(16),textureSize);assert.equal(png.readUInt32BE(20),textureSize);
assert(j.materials.length<=maxMats);
for(const mat of j.materials){
 const p=mat.pbrMetallicRoughness;
 assert(p&&p.roughnessFactor>=.75&&p.roughnessFactor<=.90&&p.metallicFactor>=0&&p.metallicFactor<=.10);
 assert.equal(p.baseColorTexture.index,0);
 if(mat.alphaMode==='MASK')assert.equal(mat.alphaCutoff,.5);
 if(mat.alphaMode==='BLEND')assert.equal(id,'ar234b2-own');
 assert(!mat.doubleSided);
}
const meta=j.asset.extras;
assert.equal(meta.author,'Torpedo-Bomber project');assert.equal(meta.license,'project-own (original mesh and paint)');
assert.equal(meta.units,'metres');assert(meta.sources.includes(meta.source)&&meta.changes&&meta.title);
assert.equal(j.scenes.length,1);assert.equal(j.scenes[0].nodes.length,1);
const root=j.scenes[0].nodes[0],rootNode=j.nodes[root],nodes=new Map(j.nodes.map((n,i)=>[n.name,i]));
assert.equal(rootNode.name,id);
assert.equal(nodes.size,j.nodes.length);for(const name of spec.names)assert(nodes.has(name),name);
const par=new Map();
j.nodes.forEach((n,i)=>(n.children??[]).forEach(k=>{assert(!par.has(k));par.set(k,i);}));
const get=name=>j.nodes[nodes.get(name)];
function read(index){
 const a=j.accessors[index],v=j.bufferViews[a.bufferView];
 assert(!a.sparse&&!a.normalized&&!v.byteStride);
 const width=a.type==='VEC3'?3:a.type==='VEC2'?2:1;
 const float=a.componentType===5126;
 assert(float||a.componentType===5123);
 const step=float?4:2,start=binary+(v.byteOffset??0)+(a.byteOffset??0);
 return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,k)=>{
   const offset=start+(i*width+k)*step;
   return float?bytes.readFloatLE(offset):bytes.readUInt16LE(offset);
 }));
}
const vec=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=([x,y,z],[a,b,c])=>[y*c-z*b,z*a-x*c,x*b-y*a];
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
function rotate([x,y,z],q){
 const xyz=q.slice(0,3),c=cross(xyz,[x,y,z]),cc=cross(xyz,c);
 return [x,y,z].map((p,i)=>p+2*(q[3]*c[i]+cc[i]));
}
const transform=(point,n)=>rotate(point.map((x,i)=>x*(n.scale?.[i]??1)),n.rotation??[0,0,0,1])
 .map((x,i)=>x+(n.translation?.[i]??0));
const primitives=new Map();
let triangleCount=0,meshNodes=0;
for(const n of j.nodes){
 if(n.mesh===undefined)continue;
 meshNodes++;
 let nTris=0;
 const list=j.meshes[n.mesh].primitives.map(p=>{
  assert.equal(p.mode,4);
  assert.deepEqual(Object.keys(p.attributes).sort(),['NORMAL','POSITION','TEXCOORD_0']);
  const pos=p.attributes.POSITION;
  assert.equal(j.accessors[pos].componentType,5126);
  const positions=read(pos),normals=read(p.attributes.NORMAL),uv=read(p.attributes.TEXCOORD_0),ix=read(p.indices).flat();
  assert(uv.every(a=>a.every(v=>v>=0&&v<=1)));
  assert(positions.every(a=>a.every(Number.isFinite)));
  assert.equal(positions.length,normals.length);
  assert(normals.every(v=>Math.abs(Math.hypot(...v)-1)<.001));
  for(let i=0;i<ix.length;i+=3){
   const [a,b,c]=ix.slice(i,i+3);
   const geometric=cross(vec(positions[b],positions[a]),vec(positions[c],positions[a]));
   const smooth=normals[a].map((x,k)=>x+normals[b][k]+normals[c][k]);
   assert(Math.hypot(...geometric)>1e-13,'degenerate triangle at '+n.name);
   assert(dot(geometric,smooth)>0,'clockwise triangle at '+n.name);
  }
  nTris+=ix.length/3;return positions;
 });
 triangleCount+=nTris;primitives.set(n,{positions:list.flat(),triangles:nTris});
}
assert(meshNodes<=maxNodes);assert(triangleCount<=maxTris);
const visited=new Set();
function points(i=root, parents=[], omitWreck=true, raw=false){
 const n=j.nodes[i];if(omitWreck&&n.name==='Wreck')return [];
 visited.add(i);
 const transforms=raw?parents:[n,...parents];
 const local=(primitives.get(n)?.positions??[]).map(p=>transforms.reduce(transform,p));
 return local.concat((n.children??[]).flatMap(k=>points(k,transforms,omitWreck,false)));
}
function bounds(data){
 const min=[Infinity,Infinity,Infinity],max=min.map(x=>-x);
 for(const p of data)for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
 return {min,max,size:vec(max,min)};
}
function local(name){return bounds(points(nodes.get(name),[],false,true));}
function near(actual,expected,eps,msg){assert(Math.abs(actual-expected)<=eps,msg+': got '+actual+', expected '+expected);}
function axis(name,drive,value){
 const r=get(name).extras.rig;
 assert.equal(r.drive,drive);assert.deepEqual(r.axis,value);return r;
}
const measured=bounds(points()),detail={},wreck=get('Wreck');
if(spec.size){
 assert.equal(rootNode.extras.rigContract,1);
 assert.equal(rootNode.extras.kind,spec.kind);assert.equal(rootNode.extras.class,spec.class);
 assert.equal(rootNode.extras.nativeAircraft,id);
 assert.deepEqual(rootNode.extras.dimensions,meta.dimensions);
 assert(rootNode.extras.references.length>=1);
 assert.equal(j.nodes.filter(n=>n.extras?.rigContract===1).length,1);
 spec.size.forEach((x,i)=>near(measured.size[i],x,.003,'dimension '+i));
 for(const key of ['gear','GearLeft','GearRight','TailGear','NoseGear','canopy'])assert(!nodes.has(key));
}else{
 const vehicle=rootNode.extras.vehicle;
 assert.equal(rootNode.extras.class,spec.class);assert.equal(vehicle.kind,spec.kind);
 assert.equal(j.nodes.filter(n=>n.extras?.vehicle).length,1);
 for(const key of ['length','width','height'])assert.equal(vehicle[key],meta.dimensions[key]);
 near(measured.min[1],0,.001,'ground plane');
 near(measured.size[2],vehicle.length,.02,'vehicle length vs measured Z');
 assert.deepEqual(wreck.scale,[0,0,0]);assert.equal(wreck.extras.visible,false);
 const wreckTris=primitives.get(wreck).triangles;
 assert(wreckTris<=(triangleCount-wreckTris)*.4);detail.wreckTriangles=wreckTris;
 near(local('Wreck').min[1],0,.015,'wreck rests on ground plane');
 visited.add(nodes.get('Wreck'));
}
if(id==='ar234b2-own'){
 const [x,y,z]=[[1,0,0],[0,1,0],[0,0,1]];
 for(const [side,sign] of [['Left',-1],['Right',1]]){
  for(const [prefix,drive] of [['Aileron','roll'],['Elevator','pitch'],['Flap','flap'+side]]){
   const name=prefix+side,n=get(name),r=axis(name,drive,x);
   assert.equal(Math.sign(n.translation[0]),sign);
   assert(!n.rotation);
   if(prefix==='Flap'){
    assert.equal(par.get(nodes.get(name)),nodes.get('flightFlaps'));assert.equal(r.range[0],0);
   }else{
    assert(Math.abs(r.gain)<=.8);
    if(prefix==='Aileron')assert.equal(Math.sign(r.gain),-sign);
   }
  }
  const n=get('Exhaust'+side);
  assert.equal(Math.sign(n.translation[0]),sign);assert(n.translation[2]<0);
  assert.deepEqual(n.extras.exhaust,{radius:.33,direction:[0,0,-1]});
  near(local('Nacelle'+side).size[2],3.9,.001,'nacelle length');
 }
 assert(Math.abs(axis('Rudder','yaw',y).gain)<=.8);assert(!nodes.has('Propeller'));
 assert(local('NoseGlazing').max[2]>6);
 for(const key of ['MuzzleRear1','MuzzleRear2']){const n=get(key);assert.equal(n.mesh,undefined);assert(n.translation[2]<0);}
 detail.nacelleXYZ=local('NacelleLeft').size;
 detail.bombXYZ=local('Bomb').size;near(detail.bombXYZ[2],1.6,.001,'store length');
 near(detail.bombXYZ[0],.37,.001,'store diameter');
 detail.bombXYZ.forEach((_,k)=>near((local('Bomb').max[k]+local('Bomb').min[k])/2,0,.001,'store pivot'));
}else if(id==='fi103-own'){
 const prop=get('Propeller');
 assert.deepEqual(axis('Propeller','prop',[0,0,1]),{drive:'prop',axis:[0,0,1],blades:4});
 assert(!prop.rotation&&prop.translation[2]>4);
 near(local('Propeller').size[0],.17,.001,'air-log propeller diameter');
 assert.deepEqual(get('ExhaustJet').extras.exhaust,{radius:.2,direction:[0,0,-1]});
 assert(get('ExhaustJet').translation[2]<-4);
 detail.fuselageDiameter=local('Fuselage').size[0];
 detail.dorsalTubeLength=local('DorsalTube').size[2];
 detail.propellerDiameter=local('Propeller').size[0];
 assert.deepEqual(j.nodes.filter(n=>n.extras?.rig).map(n=>n.name),['Propeller']);
}else if(id==='fi103-ramp-own'){
 const marker=get('LaunchPoint'),d=rotate([0,0,1],marker.rotation);
 assert(marker.translation[2]<-22&&marker.translation[1]>0);near(d[1],Math.sin(Math.PI/30),1e-6,'rail pose');
 assert(d[2]>.99&&marker.mesh===undefined);
 near(local('ConcreteFootings').size[0],4,.003,'structural footprint');
 near(measured.size[1],6.5,.06,'forward end height');
 detail.rampFootprint=local('ConcreteFootings').size;detail.hutAssembly=local('ControlHut').size;
 detail.hutAssembly.forEach((v,i)=>near(v,[4,3,8][i],.002,'control hut dimension'));
 detail.launchDegrees=Math.asin(d[1])*180/Math.PI;
}else if(id==='wuerzburg-riese-own'){
 axis('Dish','yaw',[0,1,0]);axis('Elevation','pitch',[1,0,0]);
 assert.equal(par.get(nodes.get('Elevation')),nodes.get('Dish'));
 const d=rotate([0,0,1],get('Elevation').rotation);
 near(d[1],Math.sin(35*Math.PI/180),1e-6,'reflector elevation');
 detail.apertureXYZ=local('ReflectorShell').size;near(detail.apertureXYZ[0],7.5,.002,'aperture');
 detail.foundationXZ=[local('FoundationAndRace').size[0],local('FoundationAndRace').size[2]];
 detail.elevationDegrees=Math.asin(d[1])*180/Math.PI;
 near(measured.size[1],9,.06,'deployed height');
}else{
 axis('Mount','yaw',[0,1,0]);axis('Projector','pitch',[1,0,0]);
 assert.equal(par.get(nodes.get('Projector')),nodes.get('Mount'));
 assert.equal(par.get(nodes.get('BeamOrigin')),nodes.get('Projector'));
 const d=rotate([0,0,1],get('Projector').rotation);
 near(d[1],Math.sin(Math.PI/3),1e-6,'projector elevation');
 near(get('BeamOrigin').translation[2],local('PaintedReflector').max[2],.001,'beam at lens');
 detail.trailerXYZ=local('TwoAxleTrailer').size;detail.lensXYZ=local('PaintedReflector').size;
 near(detail.trailerXYZ[0],2,.20,'trailer width');near(detail.lensXYZ[0],1.50,.002,'reflector aperture');
 near(measured.size[1],2.8,.28,'deployed height');
 detail.elevationDegrees=Math.asin(d[1])*180/Math.PI;
}
assert.equal(visited.size,j.nodes.length,'all named nodes reachable from the sole root');
const report={id,bytes:bytes.length,triangles:triangleCount,meshNodes,materialCount:j.materials.length,
  texture:[textureSize,textureSize],bounds:measured,detail,nodes:j.nodes.map(n=>({name:n.name,mesh:n.mesh!==undefined,
    ...(n.translation?{translation:n.translation}:{}),...(n.extras?.rig?{rig:n.extras.rig}:{}),
    ...(n.extras?.exhaust?{exhaust:n.extras.exhaust}:{})})),materials:j.materials.map(n=>({name:n.name,
      metallic:n.pbrMetallicRoughness.metallicFactor,roughness:n.pbrMetallicRoughness.roughnessFactor,alphaMode:n.alphaMode||'OPAQUE'})),
  sources:rootNode.extras.references??null};
if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
else console.log(id+': '+triangleCount+' triangles, '+meshNodes+' mesh nodes, '+bytes.length+' bytes; all checks passed.');
