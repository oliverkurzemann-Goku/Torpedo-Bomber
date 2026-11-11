'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const id='bf110g4-own';
const file=process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:path.join(__dirname,id+'.glb');

const specs={
 'fi156c-own':{budget:[20000,32,8,[2048,2048],4000000],size:[14.25,3.05,9.9],kind:'fi156',class:'tailwheel-light',
  names:['Propeller','Canopy','MuzzleRear','RearGun','FixedLeadingEdgeSlats','WingLiftStrutsAndSteps'],dia:2.60,blades:2,fixed:true},
 'd3a1-own':{budget:[24000,36,10,[2048,2048],5000000],size:[14.365,3.847,10.195],kind:'d3a',class:'tailwheel-bomber',
  names:['Propeller','Canopy','Muzzle1','Muzzle2','MuzzleRear','Bomb','DiveBrakeLeft','DiveBrakeRight','BombYokeAndWingRacks'],dia:3.10,blades:3,fixed:true},
 'bf110g4-own':{budget:[36000,44,12,[2048,2048],6000000],size:[16.25,4.16,12.65],kind:'bf110',class:'twin-tailwheel-fighter',
  names:['PropellerLeft','PropellerRight','Canopy','Muzzle1','Muzzle2','Muzzle3','Muzzle4','MuzzleUp1','MuzzleUp2','RudderLeft','RudderRight','LichtensteinSN2AntennaArray'],dia:3.50,blades:3,twin:true,doubleFin:true},
 'g4m1-own':{budget:[38000,44,12,[2048,2048],6000000],size:[24.89,4.90,19.97],kind:'g4m',class:'twin-bomber-tailwheel',
  names:['PropellerLeft','PropellerRight','Canopy','MuzzleTail','MuzzleDorsal','MuzzleBeamLeft','MuzzleBeamRight','Torpedo'],dia:3.40,blades:3,twin:true},
 'yamato-1945-own':{budget:[55000,40,12,[2048,1024],6000000],size:[38.8,10.4,263],class:'ship',
  names:['Hull','WeatherDeck','PagodaBridge','Funnel','funnel-exhaust-1','TurretA','TurretB','TurretC','GunsA','GunsB','GunsC','DeckEdgeRailings','AntennaSpars','MastAndCraneRigging']},
 'fleet-oiler-own':{budget:[18000,24,8,[2048,1024],4000000],size:[17.68,8.08,143.5],class:'ship',
  names:['Hull','WeatherDeck','Funnel','funnel-exhaust-1','ForeAndAftCargoMasts','CargoPipesAndValves','DeckEdgeRailings','AntennaeAndDerrickRigging','CatwalkRailings']},
};
const spec=specs[id],ship=spec.class==='ship',plane=!ship;
const bytes=fs.readFileSync(file),[maxTris,maxNodes,maxMats,texture,maxBytes]=spec.budget;
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
 assert(mat.alphaMode!=='MASK');
 if(mat.alphaMode==='BLEND')assert(plane);
 if(mat.doubleSided)assert(mat.alphaMode==='BLEND');
}
const meta=j.asset.extras;
assert.equal(meta.author,'Torpedo-Bomber project');assert.equal(meta.license,'project-own (original mesh and paint)');
assert.equal(meta.units,'metres');assert(meta.sources.includes(meta.source)&&meta.changes&&meta.title);
assert.equal(j.scenes.length,1);assert.equal(j.scenes[0].nodes.length,1);
const roots=j.scenes[0].nodes,rootNode=j.nodes[roots[0]],nodes=new Map(j.nodes.map((n,i)=>[n.name,i]));
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
   assert(Math.hypot(...geometric)>1e-13,'degenerate triangle at '+n.name+' #'+i/3);
   assert(dot(geometric,smooth)>0,'clockwise triangle at '+n.name+' #'+i/3);
  }
  nTris+=ix.length/3;return positions;
 });
 triangleCount+=nTris;primitives.set(n,{positions:list.flat(),triangles:nTris});
}
assert(meshNodes<=maxNodes);assert(triangleCount<=maxTris);
const visited=new Set();
function walk(i, parents=[], {skipWreck=true, skipVisual=false, local=false}={}){
 const n=j.nodes[i];
 if(skipVisual&&n.extras?.shipVisualOnly)return [];
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
assert.equal(rootNode.extras.class,spec.class);
if(ship){
 const hull=local('Hull'),funnel=local('Funnel');
 for(const [v,i] of [[hull.size[0],0],[-hull.min[1],1],[hull.size[2],2]])near(v,spec.size[i],.002,'hull dimension');
 near(meta.dimensions.waterlineY,0,.000001,'waterline');
 const ex=get('funnel-exhaust-1');
 assert.equal(ex.mesh,undefined);assert.deepEqual(ex.extras.shipExhaust.direction,Y);
 near(ex.translation[1],funnel.max[1],.002,'funnel effect marker Y');
 const markers=meta.markers;
 assert(markers.every(m=>m.name==='gun-mount'&&m.point.length===3&&m.point.every(Number.isFinite)));
 assert.equal(new Set(markers.map(m=>m.point.join())).size,markers.length);
 for(const m of markers){
  const [x,y,z]=m.point;
  assert(Math.abs(x)<spec.size[0]/2&&y>0&&Math.abs(z)<spec.size[2]/2);
 }
 detail.hull=hull;detail.funnelHeight=funnel.max[1];detail.markers=markers.length;
 detail.collisionBounds=bounds(walk(roots[0],[],{skipVisual:true}));
 if(id==='yamato-1945-own'){
  assert.equal(ex.extras.shipExhaust.radius,3);
  for(const n of ['DeckEdgeRailings','AntennaSpars','MastAndCraneRigging','SternAircraftCrane','BoatsAndDavits','CatapultAndTrolleyRails'])
   assert(get(n).extras.shipVisualOnly);
  const heavy=markers.filter(m=>m.properties.calibreMm===127&&m.properties.barrels===2);
  const light=markers.filter(m=>m.properties.calibreMm===25&&m.properties.barrels===3);
  assert.equal(heavy.length,12);assert.equal(light.length,50);assert.equal(markers.length,62);
  for(const [s,count] of [[-1,6],[1,6]])assert.equal(heavy.filter(m=>Math.sign(m.point[0])===s).length,count);
  for(const turret of ['A','B','C','SecondaryFore','SecondaryAft']){
   const tn='Turret'+turret,gn='Guns'+turret;
   axis(tn,'yaw',Y);axis(gn,'pitch',X);child(gn,tn);
   for(let i=1;i<=3;i++){
    const n='Muzzle'+turret+i;child(n,gn);assert.equal(get(n).mesh,undefined);
    if(turret.length===1)near(get(n).translation[2],21,.001,'main muzzle local forward offset');
   }
   if(turret.length===1)near(local(gn).max[2],21,.001,'main barrel visible forward reach');
  }
  assert(get('TurretA').translation[2]>get('TurretB').translation[2]&&get('TurretB').translation[1]>get('TurretA').translation[1]);
  assert(get('TurretC').translation[2]<0);
  assert(rotate(Z,get('TurretC').rotation)[2]<-.999);
  detail.twin127=heavy.length;detail.triple25=light.length;
 }else{
  assert.equal(markers.length,2);
  assert(markers.every(m=>m.properties.calibreMm===25&&m.properties.barrels===2));
  for(const n of ['CargoPipesAndValves','DeckEdgeRailings','AntennaeAndDerrickRigging','CatwalkRailings','ForeAndAftCargoMasts'])
   assert(get(n).extras.shipVisualOnly);
  detail.mastHeight=local('ForeAndAftCargoMasts').max[1];
  near(detail.mastHeight,28,.001,'mast height above water');
 }
}else{
 assert.equal(rootNode.extras.rigContract,1);assert.equal(rootNode.extras.nativeAircraft,id);
 assert.equal(rootNode.extras.kind,spec.kind);assert.deepEqual(rootNode.extras.dimensions,meta.dimensions);
 assert.equal(j.nodes.filter(n=>n.extras?.rigContract===1).length,1);
 measured.size.forEach((v,i)=>near(v,spec.size[i],i===1?.022:.002,'aircraft dimension '+i));
 near(measured.min[1],0,.002,'rest pose ground plane');
 const cs=axis('Canopy','canopy',id==='fi156c-own'?Z:X);
 assert.equal(cs.range[0],0);assert(cs.range[1]>0);
 child('gear',id);child('flightFlaps',id);
 for(const [side,s] of [['Left',-1],['Right',1]]){
  const f='Flap'+side,a='Aileron'+side,e='Elevator'+side;
  child(f,'flightFlaps');assert.equal(axis(f,'flap'+side,X).range[0],0);
  for(const n of [a,e,f])assert.equal(Math.sign(get(n).translation[0]),s,n+' side');
  assert.equal(Math.sign(axis(a,'roll',X).gain),-s);assert(Math.abs(axis(e,'pitch',X).gain)<=.8);
  const g='Gear'+side;
  assert.equal(Math.sign(get(g).translation[0]),s,g+' side');
  if(spec.twin){
   const p='Propeller'+side;assert.equal(Math.sign(get(p).translation[0]),s,p+' side');
  }
 }
 for(const n of ['GearLeft','GearRight','TailGear']){
  child(n,'gear');
  const g=get(n),r=axis(n,'gear',X);
  assert.equal(r.range[0],0);
  if(spec.fixed)assert.deepEqual(r.range,[0,0]);else assert(Math.abs(r.range[1])>.1);
  const wheels=(g.children??[]).filter(i=>j.nodes[i].extras?.groundWheel);
  assert.equal(wheels.length,1);assert(j.nodes[wheels[0]].mesh!==undefined);
  near(bounds(walk(wheels[0],[g])).min[1],0,.001,n+' wheel contact');
 }
 for(const n of spec.doubleFin?['RudderLeft','RudderRight']:['Rudder']){
  const r=axis(n,'yaw',Y);assert(Math.abs(r.gain)<=.8);
 }
 for(const n of spec.twin?['PropellerLeft','PropellerRight']:['Propeller']){
  const p=get(n),r=axis(n,'prop',Z);
  assert.equal(r.blades,spec.blades);assert(!p.rotation);
  const diameter=2*Math.max(...primitives.get(p).positions.map(([x,y])=>Math.hypot(x,y)));
  near(diameter,spec.dia,.005,n+' swept diameter');
  detail[n+'Diameter']=diameter;
 }
 if(id==='d3a1-own')for(const s of ['Left','Right'])assert.deepEqual(axis('DiveBrake'+s,'brake',X).range,[0,1.2]);
 if(id==='d3a1-own'){
  detail.bomb=local('Bomb');assert(detail.bomb.min[2]<0&&detail.bomb.max[2]>0);
 }
 if(id==='g4m1-own'){
  detail.torpedo=local('Torpedo');
  near(detail.torpedo.size[2],5.30,.001,'torpedo length');
  for(let i=0;i<3;i++)near((detail.torpedo.min[i]+detail.torpedo.max[i])/2,0,.002,'centered torpedo origin');
  const torpedo=primitives.get(get('Torpedo')).positions;
  detail.torpedoShellDiameter=2*Math.max(...torpedo.filter(p=>p[2]>-1.5).map(p=>Math.hypot(p[0],p[1])));
  near(detail.torpedoShellDiameter,.45,.001,'torpedo body diameter');
 }
 if(id==='bf110g4-own'){
  near(local('LichtensteinSN2AntennaArray').max[2],spec.size[2]/2,.002,'nose antenna forward envelope');
  for(const n of ['MuzzleUp1','MuzzleUp2'])assert(get(n).extras.direction[1]>0.5);
 }
}
for(const n of j.nodes.filter(n=>n.name.startsWith('Muzzle'))){
 assert.equal(n.mesh,undefined);
 assert(n.translation&&n.extras.direction);
 const direction=rotate(Z,n.rotation??[0,0,0,1]);
 near(Math.hypot(...n.extras.direction),1,.000001,n.name+' unit direction');
 assert(dot(direction,n.extras.direction)>.999999,n.name+' forward axis');
}
assert.equal(visited.size,j.nodes.length,'reachable scene nodes');
const report={id,bytes:bytes.length,triangles:triangleCount,meshNodes,texture,bounds:measured,detail,
 dimensions:meta.dimensions,references:meta.references,title:meta.title,nodes:j.nodes.map(n=>({name:n.name,mesh:n.mesh!==undefined,
 ...(n.translation?{translation:n.translation}:{}),...(n.extras?.rig?{rig:n.extras.rig}:{}),
 ...(n.extras?.shipExhaust?{shipExhaust:n.extras.shipExhaust}:{}),...(n.extras?.groundWheel?{groundWheel:true}:{}),...(n.extras?.shipVisualOnly?{shipVisualOnly:true}:{})})),
 materials:j.materials.map(n=>({name:n.name,metallic:n.pbrMetallicRoughness.metallicFactor,
 roughness:n.pbrMetallicRoughness.roughnessFactor,alphaMode:n.alphaMode||'OPAQUE'})),
};
if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
else console.log(id+': '+triangleCount+' triangles, '+meshNodes+' mesh nodes, '+bytes.length+' bytes. All checks passed.');
