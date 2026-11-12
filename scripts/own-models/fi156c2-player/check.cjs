'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const file=process.argv[2]||path.join(__dirname,'fi156c-own.glb');
const bytes=fs.readFileSync(file);
assert.equal(bytes.toString('ascii',0,4),'glTF');
assert.equal(bytes.readUInt32LE(4),2);
assert.equal(bytes.readUInt32LE(8),bytes.length);
const jsonLength=bytes.readUInt32LE(12);
const json=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
const bin=bytes.subarray(28+jsonLength);
assert(!json.extensionsUsed?.length,'extensions');
assert.equal(json.asset.extras.units,'metres');
const {nodes,meshes,materials,images,accessors,bufferViews}=json;
const roots=json.scenes[json.scene].nodes;
assert.equal(roots.length,1);
assert.equal(nodes[roots[0]].extras.rigContract,1);
assert.equal(nodes[roots[0]].extras.class,'tailwheel-light');
assert.equal(nodes[roots[0]].extras.nativeAircraft,'fi156c-own');
assert.equal(nodes.filter(n=>n.extras?.rigContract).length,1);
assert.equal(new Set(nodes.map(n=>n.name)).size,nodes.length);
const byName=Object.fromEntries(nodes.map((n,i)=>[n.name,i]));
const node=name=>nodes[byName[name]];
const points={}, seen=new Set(), all=[];
let triangles=0,meshNodes=0;
function range(p,i){return [Math.min(...p.map(v=>v[i])),Math.max(...p.map(v=>v[i]))];}
const extent=(p,i)=>{const [a,b]=range(p,i);return b-a;};
function accessor(i,component,type){
  const a=accessors[i],v=bufferViews[a.bufferView];
  assert.equal(a.componentType,component);
  assert.equal(a.type,type);
  return {count:a.count,offset:(v.byteOffset||0)+(a.byteOffset||0),stride:v.byteStride};
}
function visit(i,parent=[0,0,0]){
  const n=nodes[i],t=parent.map((v,k)=>v+(n.translation?.[k]||0));
  assert(!seen.has(i)&&!n.scale&&!n.rotation&&!n.matrix,'unexpected rest transform or multiple parent');
  seen.add(i);
  const pts=points[n.name]=[];
  if(n.mesh!==undefined){
    meshNodes++;
    for(const p of meshes[n.mesh].primitives){
      assert.equal(p.mode,4);
      assert.deepEqual(Object.keys(p.attributes).sort(),['NORMAL','POSITION','TEXCOORD_0']);
      const pos=accessor(p.attributes.POSITION,5126,'VEC3');
      assert.equal(accessor(p.attributes.NORMAL,5126,'VEC3').count,pos.count);
      assert.equal(accessor(p.attributes.TEXCOORD_0,5126,'VEC2').count,pos.count);
      const idx=accessor(p.indices,5123,'SCALAR');
      assert.equal(idx.count%3,0);
      for(let j=0;j<idx.count;j++)assert(bin.readUInt16LE(idx.offset+j*2)<pos.count,'index out of bounds');
      triangles+=idx.count/3;
      for(let k=0;k<pos.count;k++){
        const p=t.map((v,c)=>v+bin.readFloatLE(pos.offset+k*(pos.stride||12)+4*c));
        assert(p.every(Number.isFinite));
        pts.push(p);all.push(p);
      }
    }
  }
  for(const c of n.children||[])pts.push(...visit(c,t));
  return pts;
}
visit(roots[0]);
assert.equal(seen.size,nodes.length);
const close=(a,b,label,tol=.001)=>assert(Math.abs(a-b)<tol,label+' measured '+a+' expected '+b);
const dimensions={span:extent(all,0),height:extent(all,1),length:extent(all,2)};
close(dimensions.span,14.25,'span');
close(dimensions.length,9.67,'level length');
close(dimensions.height,3.81,'level height');
const r=points.Rudder,p=points.Propeller;
assert(range(p,2)[0]>2.8&&range(r,2)[1]<-5&&range(r,1)[1]>1.9,'nose +Z, fin +Y');
assert.deepEqual(node('Propeller').extras.rig,{drive:'prop',axis:[0,0,1],blades:2});
const centre=(p,i)=>range(p,i).reduce((a,b)=>a+b,0)/2;
const track=centre(points.WheelRight,0)-centre(points.WheelLeft,0);
close(track,3.4,'wheel track');
const tailplane=extent([...points.ElevatorLeft,...points.ElevatorRight],0);
close(tailplane,4.75,'tailplane span');
const propDiameter=2*Math.max(...p.map(([x,y])=>Math.hypot(x,y)));
close(propDiameter,2.6,'propeller diameter',.003);
for(const suffix of ['Left','Right']){
  const g='Gear'+suffix,f='Flap'+suffix,a='Aileron'+suffix,e='Elevator'+suffix,sign=suffix==='Left'?-1:1;
  assert(node('gear').children.includes(byName[g]));
  assert(node('flightFlaps').children.includes(byName[f]));
  for(const name of [g,f,a,e])assert(Math.sign(centre(points[name],0))===sign,name+' side');
  assert.deepEqual(node(g).extras.rig.range,[0,0]);
  close(node(f).extras.rig.range[1],-40*Math.PI/180,f+' deflection');
  assert.equal(node(f).extras.rig.drive,'flap'+suffix);
  assert.equal(node(a).extras.rig.drive,'roll');
  assert.equal(Math.sign(node(a).extras.rig.gain),-sign);
  assert.equal(node(e).extras.rig.drive,'pitch');
  assert.equal(node(g).children.filter(i=>nodes[i].extras?.groundWheel).length,1);
}
assert(node('gear').children.includes(byName.TailGear));
assert.deepEqual(node('TailGear').extras.rig.range,[0,0]);
assert.equal(node('TailGear').children.filter(i=>nodes[i].extras?.groundWheel).length,1);
assert.equal(node('TailSkid').extras.contactKind,'skid');
assert.equal(node('Canopy').extras.rig.drive,'canopy');
assert.equal(node('Rudder').extras.rig.drive,'yaw');
assert(triangles<=20000&&meshNodes<=32&&materials.length<=8&&bytes.length<=4e6);
assert.equal(images.length,1);
assert.equal(images[0].mimeType,'image/png');
const start=bufferViews[images[0].bufferView].byteOffset||0;
const texture=[bin.readUInt32BE(start+16),bin.readUInt32BE(start+20)];
assert.deepEqual(texture,[2048,2048]);
for(const m of materials){
  const p=m.pbrMetallicRoughness;
  assert(p&&p.roughnessFactor>=.75&&p.roughnessFactor<=.9&&p.metallicFactor>=0&&p.metallicFactor<=.1);
  assert.equal(p.baseColorTexture.index,0);
  if(m.doubleSided)assert.equal(m.name,'Glazing');
}
const wheel=[...points.WheelLeft,...points.WheelRight],skid=points.TailSkid;
const rotated=(p,a)=>p.map(([x,y,z])=>[x,y*Math.cos(a)+z*Math.sin(a),z*Math.cos(a)-y*Math.sin(a)]);
let lo=0,hi=.5;
for(let i=0;i<35;i++){
  const a=(lo+hi)/2;
  if(range(rotated(skid,a),1)[0]>range(rotated(wheel,a),1)[0])lo=a;
  else hi=a;
}
const stance=(lo+hi)/2, parked=rotated(all,stance);
const round=x=>Number(x.toFixed(4));
const report={bytes:bytes.length,triangles,meshNodes,materials:materials.map(m=>m.name),texture,
  dimensions:Object.fromEntries(Object.entries(dimensions).map(([k,v])=>[k,round(v)])),
  track:round(track),propellerDiameter:round(propDiameter),tailplane,
  parked:{pitchDeg:round(stance*180/Math.PI),height:round(extent(parked,1)),length:round(extent(parked,2))},
  nodes:nodes.map(n=>n.name)};
console.log(JSON.stringify(report,null,2));
