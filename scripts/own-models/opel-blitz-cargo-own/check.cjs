'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const id='opel-blitz-cargo-own';
const file=process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:path.join(__dirname,id+'.glb');

const modules={
 DrumStack:{size:[2.4,1,2],limit:700},CrateStack:{size:[2,1.4,1.5],limit:500},
 FuelTank:{size:[3,3.98,12],limit:1200},CamoNet:{size:[6,3,8],limit:800},
 Berm:{size:[3,1.5,10],limit:600},Hut:{size:[4,3,8],limit:900},
};
const specifications={
 'depot-kit-own':{budget:[6000,20,6,[1024,1024],1000000],class:'ground-structure',names:Object.keys(modules)},
 'flakwagen-own':{budget:[7000,18,6,[1024,1024],1200000],size:[3,3.4,12],kind:'flakwagen',
  names:['Wreck','Turret','Gun','BogieFront','BogieRear','Muzzle1','Muzzle2','Muzzle3','Muzzle4']},
 'hospital-ship-own':{budget:[24000,30,10,[2048,1024],5000000],class:'ship',
  names:['Hull','WeatherDeck','SingleFunnel','funnel-exhaust-1','MastsAndCargoDerricks','AerialsAndDerrickRigging','DeckRailings','LifeboatDavitsAndFalls']},
 'opel-blitz-cargo-own':{budget:[5000,14,5,[1024,1024],900000],size:[2.20,2.9,6],kind:'opel-blitz-cargo',
  names:['CabShell','Chassis','Wreck','LoadBed','StretchedCanvasCover']},
 'opel-blitz-tanker-own':{budget:[5000,14,5,[1024,1024],900000],size:[2.20,2.5,6],kind:'opel-blitz-tanker',
  names:['CabShell','Chassis','Wreck','TankAndServiceBox']},
 'panzer4h-own':{budget:[12000,24,6,[1024,1024],1500000],size:[3.33,2.68,7.02],kind:'panzer4h',
  names:['Turret','Gun','Muzzle1','Muzzle2','Wreck','HullSchuerzen','TracksAndWheels']},
 'pby5a-own':{budget:[34000,40,10,[2048,2048],6000000],size:[31.6992,6.1468,19.4564],class:'amphibian-twin',kind:'pby',
  names:['AileronLeft','AileronRight','ElevatorLeft','ElevatorRight','Rudder','gear','GearLeft','GearRight','NoseGear',
         'FloatLeft','FloatRight','PropellerLeft','PropellerRight','Muzzle1','MuzzleBlisterLeft','MuzzleBlisterRight']},
 'sdkfz251d-own':{budget:[6500,18,5,[1024,1024],1100000],size:[2.10,1.75,5.98],kind:'sdkfz251d',
  names:['Gun','Muzzle1','Muzzle2','Wreck','OpenSlopedArmorAndBonnet']},
};
const kit=id==='depot-kit-own',ship=id==='hospital-ship-own',plane=id==='pby5a-own';
const spec=specifications[id],bytes=fs.readFileSync(file),[maxTris,maxNodes,maxMats,texture,maxBytes]=spec.budget;
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
assert.equal(png.readUInt32BE(16),texture[0]);assert.equal(png.readUInt32BE(20),texture[1]);
assert(j.materials.length<=maxMats);
for(const mat of j.materials){
 const p=mat.pbrMetallicRoughness;
 assert(p&&p.roughnessFactor>=.75&&p.roughnessFactor<=.90&&p.metallicFactor>=0&&p.metallicFactor<=.10);
 assert.equal(p.baseColorTexture.index,0);
 if(mat.alphaMode==='MASK'){assert(kit);assert.equal(mat.alphaCutoff,.5);}
 if(mat.alphaMode==='BLEND')assert(plane);
 if(mat.doubleSided)assert(kit&&mat.alphaMode==='MASK');
}
const meta=j.asset.extras;
assert.equal(meta.author,'Torpedo-Bomber project');assert.equal(meta.license,'project-own (original mesh and paint)');
assert.equal(meta.units,'metres');assert(meta.sources.includes(meta.source)&&meta.changes&&meta.title);
assert.equal(j.scenes.length,1);assert.equal(j.scenes[0].nodes.length,kit?6:1);
const roots=j.scenes[0].nodes,rootNode=j.nodes[roots[0]],nodes=new Map(j.nodes.map((n,i)=>[n.name,i]));
if(!kit)assert.equal(rootNode.name,id);
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
   assert(Math.hypot(...geometric)>1e-13,'degenerate triangle at '+n.name+' #'+i/3);
   assert(dot(geometric,smooth)>0,'clockwise triangle at '+n.name+' #'+i/3);
  }
  nTris+=ix.length/3;return positions;
 });
 triangleCount+=nTris;primitives.set(n,{positions:list.flat(),triangles:nTris});
}
assert(meshNodes<=maxNodes);assert(triangleCount<=maxTris);
const isWreck=n=>n.extras?.role==='Wreck';
const visited=new Set();
function walk(i, parents=[], {skipWreck=true, skipVisual=false, local=false}={}){
 const n=j.nodes[i];
 if(skipWreck&&isWreck(n)||skipVisual&&n.extras?.shipVisualOnly)return [];
 visited.add(i);
 const transforms=local?parents:[n,...parents];
 const own=(primitives.get(n)?.positions??[]).map(p=>transforms.reduce(transform,p));
 return own.concat((n.children??[]).flatMap(k=>walk(k,transforms,{skipWreck,skipVisual})));
}
function bounds(data){
 assert(data.length>0);
 const min=[Infinity,Infinity,Infinity],max=min.map(x=>-x);
 for(const p of data)for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
 return {min,max,size:vec(max,min)};
}
function near(actual,expected,eps,msg){
 assert(Math.abs(actual-expected)<=eps,msg+': got '+actual+', expected '+expected);
}
const local=name=>bounds(walk(nodes.get(name),[],{local:true,skipWreck:false}));
const axis=(name,drive,value)=>{
 const r=get(name).extras.rig;
 assert.equal(r.drive,drive);assert.deepEqual(r.axis,value);return r;
};
const child=(name,parent)=>assert.equal(par.get(nodes.get(name)),nodes.get(parent),name+' parent');
const X=[1,0,0],Y=[0,1,0],Z=[0,0,1],detail={};
const measured=bounds(roots.flatMap(i=>walk(i)));
const tri=i=>(primitives.get(j.nodes[i])?.triangles??0)+(j.nodes[i].children??[]).reduce((s,k)=>s+tri(k),0);
function checkWreck(name,intactTris){
 const w=get(name);
 assert.deepEqual(w.scale,[0,0,0]);assert.equal(w.extras.visible,false);
 const count=tri(nodes.get(name));
 assert(count<=intactTris*.4,name+' exceeds 40% of intact triangles');
 const wb=local(name);
 near(wb.min[1],0,.02,'wreck ground contact');
 return {triangles:count,bounds:wb};
}
if(kit){
 assert.deepEqual(roots.map(i=>j.nodes[i].name).sort(),Object.keys(modules).sort());
 for(const [name,{size,limit}] of Object.entries(modules)){
  const i=nodes.get(name),r=get(name),w=name+'_Wreck';
  const b=bounds(walk(i,[],{local:true})),count=tri(i),vehicle=r.extras.vehicle;
  assert.equal(r.extras.class,'ground-structure');
  assert.equal(vehicle.kind,name);
  assert.deepEqual([vehicle.width,vehicle.height,vehicle.length],size);
  assert(count<=limit,name+' triangle budget');
  b.size.forEach((v,k)=>near(v,size[k],.01,name+' dimensions'));
  near(b.min[1],0,.001,name+' ground');
  for(const k of [0,2])near((b.min[k]+b.max[k])/2,0,.008,name+' origin');
  child(w,name);
  detail[name]={bounds:b,triangles:count,wreck:checkWreck(w,count-tri(nodes.get(w)))};
 }
 const net=get('CamoNet_Cloth');
 assert.equal(j.materials[j.meshes[net.mesh].primitives[0].material].alphaMode,'MASK');
}else if(ship){
 const hull=local('Hull'),funnel=local('SingleFunnel'),ex=get('funnel-exhaust-1');
 assert.equal(rootNode.extras.class,'ship');assert.deepEqual(meta.markers,[]);
 near(hull.min[1],-9.23,.001,'keel');near(meta.dimensions.waterlineY,0,.001,'waterline');
 near(hull.size[0],20.12,.001,'hull beam');near(hull.size[2],163.30,.001,'hull length');
 near(funnel.max[1],30,.001,'funnel height above waterline');near(ex.translation[1],30,.001,'funnel outlet');
 assert.equal(ex.mesh,undefined);assert.deepEqual(ex.extras.shipExhaust.direction,Y);
 assert(ex.extras.shipExhaust.radius>0);
 for(const [side,sign] of [['Starboard',-1],['Port',1]]){
  for(let i=1;i<=6;i++){
   const n=get('Lifeboat'+side+i);
   assert(n.extras.shipVisualOnly);assert.equal(Math.sign(n.translation[0]),sign);
  }
 }
 for(const name of ['DeckRailings','AerialsAndDerrickRigging','MastsAndCargoDerricks','LifeboatDavitsAndFalls'])
  assert(get(name).extras.shipVisualOnly);
 detail.hull=hull;detail.funnelHeight=funnel.max[1];detail.collisionBounds=bounds(walk(roots[0],[],{skipVisual:true}));
}else{
 const dims=meta.dimensions;
 spec.size.forEach((v,i)=>near(measured.size[i],v,.018,'axis '+i+' envelope'));
 near(measured.min[1],0,.001,'ground');
 near(measured.size[2],dims.length,.001,'length metadata');
 near(measured.size[1],dims.height,.018,'height metadata');
 if(plane){
  assert.equal(rootNode.extras.rigContract,1);assert.equal(rootNode.extras.nativeAircraft,id);
  assert.equal(rootNode.extras.kind,'pby');assert.equal(rootNode.extras.class,spec.class);
  assert.deepEqual(rootNode.extras.dimensions,dims);
  assert.equal(j.nodes.filter(n=>n.extras?.rigContract===1).length,1);
  near(measured.size[0],dims.span,.001,'span metadata');
  for(const [side,s] of [['Left',-1],['Right',1]]){
   const prop='Propeller'+side,gear='Gear'+side,ail='Aileron'+side,elev='Elevator'+side;
   for(const n of [prop,gear,ail,elev,'Float'+side,'MuzzleBlister'+side])
    assert.equal(Math.sign(get(n).translation[0]),s,n+' side axis');
   assert.equal(axis(prop,'prop',Z).blades,3);assert(!get(prop).rotation);
   assert.equal(Math.sign(axis(ail,'roll',X).gain),-s);
   assert(Math.abs(axis(ail,'roll',X).gain)<=.8&&Math.abs(axis(elev,'pitch',X).gain)<=.8);
   assert.equal(axis('Float'+side,'float'+side,Z).range[0],0);
  }
  for(const g of ['GearLeft','GearRight','NoseGear']){
   const n=get(g);child(g,'gear');
   assert.equal(axis(g,'gear',g==='NoseGear'?X:Z).range[0],0);
   const wheels=(n.children??[]).filter(i=>j.nodes[i].extras?.groundWheel===true);
   assert.equal(wheels.length,1);assert(j.nodes[wheels[0]].mesh!==undefined);
   const b=bounds(walk(wheels[0],[n]));
   near(b.min[1],0,.001,g+' ground contact');detail[g+'WheelBounds']=b;
  }
  assert(Math.abs(axis('Rudder','yaw',Y).gain)<=.8);
  for(const flap of ['flightFlaps','FlapLeft','FlapRight'])assert(!nodes.has(flap));
  assert(get('NoseGear').translation[2]>0&&get('Rudder').translation[2]<0);
 }else{
  const v=rootNode.extras.vehicle;
  assert.equal(rootNode.extras.class,'ground-vehicle');assert.equal(v.kind,spec.kind);
  assert.equal(j.nodes.filter(n=>n.extras?.vehicle).length,1);
  for(const k of ['width','height','length'])assert.equal(v[k],dims[k]);
  const footprint=id==='panzer4h-own'?local('TracksAndWheels'):measured;
  for(const k of [0,2])near((footprint.min[k]+footprint.max[k])/2,0,.018,'ground footprint origin');
  near(measured.size[0],v.width,.018,'width metadata');
  child('Wreck',id);
  detail.wreck=checkWreck('Wreck',triangleCount-tri(nodes.get('Wreck')));
  if(id.startsWith('opel-')){
   near(local('CabShell').max[1],2.20,.002,'cab roof');
   assert(!j.nodes.some(n=>n.name.startsWith('Muzzle')));
   detail.cabRoof=local('CabShell').max[1];
  }else{
   axis('Gun','pitch',X);child('Muzzle1','Gun');
   if(id==='flakwagen-own'||id==='panzer4h-own'){
    axis('Turret','yaw',Y);child('Gun','Turret');
   }
   if(id==='flakwagen-own'){
    for(let i=1;i<=4;i++)child('Muzzle'+i,'Gun');
    const contacts=['BogieFront','BogieRear'].map(name=>{
     const n=get(name),raw=primitives.get(n).positions;
     const xs=[...new Set(raw.filter(p=>p[1]<.00001).map(p=>+p[0].toFixed(4)))].sort((a,b)=>a-b);
     assert(xs.length>=2);
     return [xs.filter(x=>x<0).at(-1),xs.find(x=>x>0)];
    });
    for(const [a,b] of contacts)near(b-a,1.435,.0005,'standard gauge between inner flange faces');
    detail.trackGauge=contacts[0][1]-contacts[0][0];
   }
  }
 }
}
for(const n of j.nodes.filter(n=>/^Muzzle/.test(n.name))){
 assert.equal(n.mesh,undefined);assert(n.translation&&n.extras.direction);
}
assert.equal(visited.size,j.nodes.length,'all named nodes reachable');
const report={id,bytes:bytes.length,triangles:triangleCount,meshNodes,texture,bounds:measured,detail,
 dimensions:meta.dimensions,references:meta.references,nodes:j.nodes.map(n=>({name:n.name,mesh:n.mesh!==undefined,
 ...(n.translation?{translation:n.translation}:{}),...(n.extras?.rig?{rig:n.extras.rig}:{}),
 ...(n.extras?.shipExhaust?{shipExhaust:n.extras.shipExhaust}:{}),...(n.extras?.shipVisualOnly?{shipVisualOnly:true}:{})})),
 materials:j.materials.map(n=>({name:n.name,metallic:n.pbrMetallicRoughness.metallicFactor,
 roughness:n.pbrMetallicRoughness.roughnessFactor,alphaMode:n.alphaMode||'OPAQUE'})),
};
if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
else console.log(id+': '+triangleCount+' triangles, '+meshNodes+' mesh nodes, '+bytes.length+' bytes. All checks passed.');
