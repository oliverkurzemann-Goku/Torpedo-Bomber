#!/usr/bin/env node
// Checks a delivered aircraft GLB against rig contract v1 (app/model-candidates/RIG-CONTRACT.md)
// and runs the Khronos glTF validator on it. Reads the real file bytes: vertex positions,
// node transforms, image headers. Usage: node scripts/check-rig-contract.mjs model.glb [--json]
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const Contract=require('../aircraft-contract.js');

const FORBIDDEN_EXTENSIONS=['KHR_materials_pbrSpecularGlossiness','KHR_mesh_quantization','KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'];

export function parseGlb(bytes){
  const buf=Buffer.from(bytes);
  if(buf.readUInt32LE(0)!==0x46546c67||buf.readUInt32LE(4)!==2)throw Error('not a glTF 2.0 binary');
  let offset=12,json=null,bin=null;
  while(offset<buf.length){
    const length=buf.readUInt32LE(offset),type=buf.readUInt32LE(offset+4),chunk=buf.subarray(offset+8,offset+8+length);
    if(type===0x4e4f534a)json=JSON.parse(chunk.toString('utf8'));else if(type===0x004e4942)bin=chunk;
    offset+=8+length;
  }
  if(!json)throw Error('GLB has no JSON chunk');return {json,bin:bin||Buffer.alloc(0)};
}

// ---- small matrix helpers (column-major, as glTF) ----
function compose(t=[0,0,0],r=[0,0,0,1],s=[1,1,1]){
  const [x,y,z,w]=r,x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  return [(1-(yy+zz))*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0,(xy-wz)*s[1],(1-(xx+zz))*s[1],(yz+wx)*s[1],0,(xz+wy)*s[2],(yz-wx)*s[2],(1-(xx+yy))*s[2],0,t[0],t[1],t[2],1];
}
function multiply(a,b){const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
function apply(m,p){return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
function local(node){return node.matrix||compose(node.translation,node.rotation,node.scale);}

function readFloats(json,bin,index){
  const a=json.accessors[index],v=json.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
  if(a.componentType!==5126)throw Error('accessor '+index+' is not float32');
  const stride=v.byteStride||n*4,base=(v.byteOffset||0)+(a.byteOffset||0),out=new Float32Array(a.count*n);
  for(let i=0;i<a.count;i++)for(let k=0;k<n;k++)out[i*n+k]=bin.readFloatLE(base+i*stride+k*4);return out;
}
function imageSize(bytes){
  if(bytes.readUInt32BE(0)===0x89504e47)return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
  if(bytes[0]===0xff&&bytes[1]===0xd8){
    for(let i=2;i<bytes.length-9;){if(bytes[i]!==0xff){i++;continue;}const m=bytes[i+1];if(m>=0xc0&&m<=0xcf&&m!==0xc4&&m!==0xc8&&m!==0xcc)return [bytes.readUInt16BE(i+7),bytes.readUInt16BE(i+5)];i+=2+bytes.readUInt16BE(i+2);}
  }
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
    const kind=bytes.toString('ascii',12,16);
    if(kind==='VP8X')return [1+bytes.readUIntLE(24,3),1+bytes.readUIntLE(27,3)];
    if(kind==='VP8L'){const b=bytes.readUInt32LE(21);return [1+(b&0x3fff),1+((b>>14)&0x3fff)];}
    if(kind==='VP8 ')return [bytes.readUInt16LE(26)&0x3fff,bytes.readUInt16LE(28)&0x3fff];
  }
  return null;
}

// Every triangle of the scene in world (model) coordinates, rest pose as stored.
// exclude: node names whose subtree is skipped; rotate: {name:[ax,ay,az,angle]} applied on top of
// a node's own rotation (e.g. turn the rotor to the blade angle a drawing shows).
export function worldTriangles(bytes,{exclude=[],rotate={}}={}){
  const {json,bin}=parseGlb(bytes),nodes=json.nodes||[],out=[];
  const walk=(i,m)=>{if(exclude.includes(nodes[i].name))return;let w=multiply(m,local(nodes[i]));
    const r=rotate[nodes[i].name];if(r){const h=r[3]/2,s=Math.sin(h),l=Math.hypot(r[0],r[1],r[2]);w=multiply(w,compose([0,0,0],[r[0]/l*s,r[1]/l*s,r[2]/l*s,Math.cos(h)]));}
    if(nodes[i].mesh!==undefined)for(const prim of json.meshes[nodes[i].mesh].primitives){
      const pos=readFloats(json,bin,prim.attributes.POSITION),idx=prim.indices!==undefined?readIndices(json,bin,prim.indices):Array.from({length:pos.length/3},(_,k)=>k);
      for(const k of idx){const p=apply(w,[pos[k*3],pos[k*3+1],pos[k*3+2]]);out.push(p[0],p[1],p[2]);}
    }
    (nodes[i].children||[]).forEach(c=>walk(c,w));};
  ((json.scenes?.[json.scene||0]?.nodes)||[]).forEach(i=>walk(i,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]));
  return Float32Array.from(out);
}
function readIndices(json,bin,index){
  const a=json.accessors[index],v=json.bufferViews[a.bufferView],size={5121:1,5123:2,5125:4}[a.componentType],base=(v.byteOffset||0)+(a.byteOffset||0),out=new Uint32Array(a.count);
  for(let i=0;i<a.count;i++)out[i]=size===4?bin.readUInt32LE(base+i*4):size===2?bin.readUInt16LE(base+i*2):bin[base+i];return out;
}

export function checkContract(bytes){
  const errors=[],warn=[],report={};
  const fail=m=>errors.push(m);
  let glb;try{glb=parseGlb(bytes);}catch(e){return {errors:[e.message],warnings:warn,report};}
  const {json,bin}=glb;
  for(const ext of json.extensionsUsed||[])if(FORBIDDEN_EXTENSIONS.includes(ext))fail('forbidden extension '+ext);
  const nodes=json.nodes||[],parent=new Array(nodes.length).fill(-1);
  nodes.forEach((n,i)=>(n.children||[]).forEach(c=>{parent[c]=i;}));
  const names=new Map();nodes.forEach((n,i)=>{if(!n.name)return;if(names.has(n.name))fail('duplicate node name '+n.name);names.set(n.name,i);});
  const roots=nodes.map((n,i)=>i).filter(i=>n(i)?.extras?.rigContract!==undefined);function n(i){return nodes[i];}
  if(roots.length!==1){fail('need exactly one node with extras.rigContract, found '+roots.length);return {errors,warnings:warn,report};}
  const root=roots[0],meta=nodes[root].extras;
  if(meta.rigContract!==Contract.VERSION)fail('rigContract must be '+Contract.VERSION);
  const spec=Contract.CLASSES[meta.class];if(!spec){fail('unknown class '+meta.class);return {errors,warnings:warn,report};}
  for(const key of ['nativeAircraft','kind','title','author','license','source','provenance'])if(typeof meta[key]!=='string'||!meta[key].trim())fail('root extras.'+key+' missing');
  if(meta.nativeAircraft&&!/^[a-z0-9][a-z0-9-]*$/.test(meta.nativeAircraft))fail('nativeAircraft must be a lowercase id');
  if(!Array.isArray(meta.references)||!meta.references.length)fail('root extras.references must list the drawings/manuals used');
  else meta.references.forEach((r,i)=>{for(const k of ['title','license','role'])if(!r||typeof r[k]!=='string'||!r[k])fail('reference '+i+' lacks '+k);if(!r?.url&&!r?.file)fail('reference '+i+' needs url or file');if(r?.sha256!==undefined&&!/^[0-9a-f]{64}$/.test(r.sha256))fail('reference '+i+' sha256 malformed');});
  const dim=meta.dimensions||{};for(const k of ['span','length'])if(!(dim[k]>0))fail('root extras.dimensions.'+k+' missing');

  // world matrices, inside the contract root's subtree and from the scene root
  const world=new Array(nodes.length),inRoot=new Array(nodes.length).fill(false);
  const sceneRoots=(json.scenes?.[json.scene||0]?.nodes)||[];
  const walk=(i,m,under)=>{world[i]=multiply(m,local(nodes[i]));inRoot[i]=under||i===root;(nodes[i].children||[]).forEach(c=>walk(c,world[i],inRoot[i]));};
  sceneRoots.forEach(i=>walk(i,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],false));
  if(!inRoot[root])fail('contract root is not in the default scene');
  const isAncestor=(a,i)=>{for(let p=i;p>=0;p=parent[p])if(p===a)return true;return false;};

  // geometry: true vertex bounds, triangles, attributes
  const box=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];let triangles=0,meshNodes=0;
  const partBox={};
  nodes.forEach((node,i)=>{
    if(node.mesh===undefined||!world[i])return;meshNodes++;
    if(!inRoot[i])fail('mesh node '+(node.name||i)+' lies outside the contract root');
    for(const prim of json.meshes[node.mesh].primitives){
      if((prim.mode??4)!==4)fail('mesh '+node.mesh+' uses non-triangle mode');
      if(prim.attributes.NORMAL===undefined)fail('mesh '+node.mesh+' lacks normals');
      const mat=json.materials?.[prim.material];
      if(mat&&(mat.pbrMetallicRoughness?.baseColorTexture||mat.normalTexture)&&prim.attributes.TEXCOORD_0===undefined)fail('textured mesh '+node.mesh+' lacks TEXCOORD_0');
      let pos;try{pos=readFloats(json,bin,prim.attributes.POSITION);}catch(e){fail(e.message);continue;}
      triangles+=(prim.indices!==undefined?json.accessors[prim.indices].count:pos.length/3)/3;
      for(let k=0;k<pos.length;k+=3){
        const p=apply(world[i],[pos[k],pos[k+1],pos[k+2]]);
        for(let a=0;a<3;a++){box[a]=Math.min(box[a],p[a]);box[a+3]=Math.max(box[a+3],p[a]);}
        for(const part of ['Propeller','Rudder','GearLeft','GearRight','TailGear']){const pi=names.get(part);if(pi!==undefined&&isAncestor(pi,i)){const b=partBox[part]||(partBox[part]=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity]);for(let a=0;a<3;a++){b[a]=Math.min(b[a],p[a]);b[a+3]=Math.max(b[a+3],p[a]);}}}
      }
    }
  });
  const size=[box[3]-box[0],box[4]-box[1],box[5]-box[2]],center=[(box[3]+box[0])/2,(box[4]+box[1])/2,(box[5]+box[2])/2];
  report.size=size.map(v=>+v.toFixed(4));report.triangles=triangles;report.meshNodes=meshNodes;
  if(dim.span>0&&Math.abs(size[0]/dim.span-1)>.01)fail(`span on X ${size[0].toFixed(3)} m differs from declared ${dim.span} m by more than 1%`);
  if(dim.length>0&&Math.abs(size[2]/dim.length-1)>.01)fail(`length on Z ${size[2].toFixed(3)} m differs from declared ${dim.length} m by more than 1%`);
  if(dim.height>0&&Math.abs(size[1]/dim.height-1)>.05)warn.push(`height on Y ${size[1].toFixed(3)} m vs declared ${dim.height} m (attitude dependent)`);
  if(Math.abs(center[0])>.01*size[0])fail('airframe not centred on X (asymmetric span)');

  // parts, hinges, drives
  const required=spec.parts,optional=spec.optional;
  for(const [name,p] of Object.entries(required)){
    const i=names.get(name);if(i===undefined){fail('missing part '+name);continue;}
    if(!isAncestor(root,i))fail(name+' is outside the contract root');
    if(p.parent&&!isAncestor(names.get(p.parent)??-2,i))fail(name+' must sit under '+p.parent);
    if(p.group)continue;checkRig(name,i,p.drive);
  }
  for(const [name,drive] of Object.entries(optional)){const i=names.get(name);if(i!==undefined)checkRig(name,i,drive);}
  function checkRig(name,i,drive){
    const rig=nodes[i].extras?.rig;if(!rig){fail(name+' lacks extras.rig');return;}
    if(rig.drive!==drive)fail(`${name} drive must be ${drive}, is ${rig.drive}`);
    const ax=rig.axis;if(!Array.isArray(ax)||ax.length!==3||ax.some(v=>!Number.isFinite(v))||Math.abs(Math.hypot(...ax)-1)>1e-3){fail(name+' axis must be a unit vector');return;}
    if(drive==='prop'){
      if(Math.abs(ax[2])<.999)fail('Propeller axis must be local Z');
      const r=nodes[i].rotation;if(r&&Math.abs(r[3])<.99999)fail('Propeller node must be unrotated (game spins rotation.z)');
      if(!Number.isInteger(rig.blades)||rig.blades<2||rig.blades>5)fail('Propeller rig.blades must be 2..5');
    }else if(Contract.GAIN_DRIVES.includes(drive)){
      if(!Number.isFinite(rig.gain)||rig.gain===0||Math.abs(rig.gain)>.8)fail(name+' gain must be finite, non-zero and within 0.8 rad');
    }else if(!Array.isArray(rig.range)||rig.range.length!==2||rig.range.some(v=>!Number.isFinite(v)||Math.abs(v)>Math.PI))fail(name+' range must be two angles within pi');
  }
  // tyres: exactly one tagged ground wheel under each leg
  const tyres=nodes.map((x,i)=>i).filter(i=>nodes[i].extras?.groundWheel===true);
  if(tyres.length!==Object.keys(spec.tyres).length)fail(`need ${Object.keys(spec.tyres).length} groundWheel tyres, found ${tyres.length}`);
  for(const leg of Object.keys(spec.tyres)){const li=names.get(leg);if(li!==undefined&&tyres.filter(t=>isAncestor(li,t)).length!==1)fail('exactly one groundWheel tyre must hang under '+leg);}
  tyres.forEach(t=>{if(nodes[t].mesh===undefined)fail('groundWheel node '+(nodes[t].name||t)+' carries no mesh');});
  const muzzles=nodes.filter(x=>/^Muzzle/.test(x.name||''));if(muzzles.length<spec.muzzles)fail('need at least '+spec.muzzles+' Muzzle* node');
  report.muzzles=muzzles.length;

  // orientation: nose +Z, fin up +Y, Left on -X (as the existing native P-47/SBD rigs)
  const pb=partBox.Propeller,rb=partBox.Rudder,gl=partBox.GearLeft,gr=partBox.GearRight;
  if(pb&&rb){if(!((pb[2]+pb[5])/2>center[2]+.3*size[2]))fail('propeller must be at the +Z nose');if(!((rb[2]+rb[5])/2<center[2]-.3*size[2]))fail('rudder must be at the -Z tail');if(!(rb[4]>center[1]+.2*size[1]))fail('fin must point up +Y');}
  if(gl&&gr&&!((gl[0]+gl[3])/2<0&&(gr[0]+gr[3])/2>0))fail('GearLeft must be on -X and GearRight on +X');

  // budget
  const b=spec.budget;report.bytes=bytes.length;report.materials=(json.materials||[]).length;report.images=(json.images||[]).length;
  if(triangles>b.triangles)fail(`${triangles} triangles exceed ${b.triangles}`);
  if(meshNodes>b.meshes)fail(`${meshNodes} mesh nodes exceed ${b.meshes}`);
  if(report.materials>b.materials)fail(`${report.materials} materials exceed ${b.materials}`);
  if(report.images>b.images)fail(`${report.images} images exceed ${b.images}`);
  if(bytes.length>b.bytes)fail(`${bytes.length} bytes exceed ${b.bytes}`);
  report.imageSizes=(json.images||[]).map((im,i)=>{
    if(im.bufferView===undefined){fail('image '+i+' must be embedded');return null;}
    const v=json.bufferViews[im.bufferView],s=imageSize(bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));
    if(!s){fail('image '+i+' has an unreadable header');return null;}
    if(Math.max(...s)>b.imageSize)fail(`image ${i} is ${s.join('x')}, above ${b.imageSize}`);
    if(s.some(x=>x&(x-1)))warn.push(`image ${i} ${s.join('x')} is not power-of-two`);
    return s;
  });
  report.kind=meta.kind;report.nativeAircraft=meta.nativeAircraft;
  return {errors,warnings:warn,report};
}

export async function khronos(bytes){
  const validator=require('gltf-validator');
  const result=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:50,ignoredIssues:['UNUSED_OBJECT']});
  const text=m=>`${m.code} ${m.pointer||''} ${m.message}`;
  return {errors:result.issues.numErrors,warnings:result.issues.numWarnings,messages:result.issues.messages.filter(m=>m.severity===0).map(text),warningMessages:result.issues.messages.filter(m=>m.severity===1).map(text)};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const file=process.argv[2];if(!file){console.error('usage: check-rig-contract.mjs model.glb [--json]');process.exit(2);}
  const bytes=fs.readFileSync(file),out=checkContract(bytes);out.khronos=await khronos(bytes);
  out.errors.push(...out.khronos.messages.map(m=>'glTF validator: '+m));out.warnings.push(...out.khronos.warningMessages.map(m=>'glTF validator: '+m));
  if(process.argv.includes('--json'))console.log(JSON.stringify(out,null,1));
  else{console.log(path.basename(file),JSON.stringify(out.report));for(const w of out.warnings)console.log('warning:',w);for(const e of out.errors)console.log('ERROR:',e);console.log(out.errors.length?'FAILED':'PASSED rig contract v'+Contract.VERSION);}
  process.exitCode=out.errors.length?1:0;
}
