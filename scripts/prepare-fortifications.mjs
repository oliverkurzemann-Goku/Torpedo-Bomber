// node scripts/prepare-fortifications.mjs <observation-post.glb> <bunker.glb>
// Offline preparation only; the game loads ordinary r128-compatible GLBs.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {MeshoptSimplifier} from 'meshoptimizer';
import {createCanvas,loadImage} from '@napi-rs/canvas';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await MeshoptSimplifier.ready;
const types={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},sizes={5123:2,5125:4,5126:4};
async function prepare(source,name,target){
 const raw=fs.readFileSync(source),length=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+length)),bin=raw.subarray(28+length);
 const sourceViews=doc.bufferViews,sourceAccessors=doc.accessors,views=[],accessors=[],chunks=[];let offset=0;
 function view(bytes,target){const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}const index=views.length;views.push({buffer:0,byteOffset:offset,byteLength:bytes.length,...(target?{target}: {})});chunks.push(bytes);offset+=bytes.length;return index;}
 function read(index){
  const a=sourceAccessors[index],v=sourceViews[a.bufferView],n=types[a.type],size=sizes[a.componentType];
  if(!n||!size||a.sparse||a.normalized)throw Error('Unsupported source accessor');
  const out=a.componentType===5126?new Float32Array(a.count*n):new Uint32Array(a.count*n),stride=v.byteStride||n*size,begin=(v.byteOffset||0)+(a.byteOffset||0);
  for(let i=0;i<a.count;i++)for(let k=0;k<n;k++){const at=begin+i*stride+k*size;out[i*n+k]=a.componentType===5126?bin.readFloatLE(at):a.componentType===5123?bin.readUInt16LE(at):bin.readUInt32LE(at);}
  return out;
 }
 function accessor(data,type,target){
  const n=types[type],min=Array(n).fill(Infinity),max=Array(n).fill(-Infinity);
  for(let i=0;i<data.length;i++){min[i%n]=Math.min(min[i%n],data[i]);max[i%n]=Math.max(max[i%n],data[i]);}
  const index=accessors.length;accessors.push({bufferView:view(Buffer.from(data.buffer,data.byteOffset,data.byteLength),target),componentType:data instanceof Float32Array?5126:5125,count:data.length/n,type,...(type==='VEC3'?{min,max}: {})});return index;
 }
 const total=doc.meshes.reduce((n,m)=>n+m.primitives.reduce((a,p)=>a+sourceAccessors[p.indices].count/3,0),0);let triangles=0,maxError=0;
 for(const mesh of doc.meshes)for(const p of mesh.primitives){
  const indices=read(p.indices),positions=read(p.attributes.POSITION),uv=p.attributes.TEXCOORD_0===undefined?null:read(p.attributes.TEXCOORD_0);
  const count=Math.max(6,Math.floor(indices.length*target/total/3)*3);
  const tolerance=.012;
  const [simplified,error]=uv?MeshoptSimplifier.simplifyWithAttributes(indices,positions,3,uv,2,[.25,.25],null,count,tolerance,['LockBorder']):MeshoptSimplifier.simplify(indices,positions,3,count,tolerance,['LockBorder']);
  const used=[...new Set(simplified)],remap=new Map(used.map((old,i)=>[old,i])),attributes={};
  for(const [semantic,index] of Object.entries(p.attributes)){
   const old=read(index),type=sourceAccessors[index].type,n=types[type],compact=new Float32Array(used.length*n);
   used.forEach((v,i)=>{for(let k=0;k<n;k++)compact[i*n+k]=old[v*n+k];});attributes[semantic]=accessor(compact,type,34962);
  }
  p.attributes=attributes;p.indices=accessor(Uint32Array.from(simplified,i=>remap.get(i)),'SCALAR',34963);
  triangles+=simplified.length/3;maxError=Math.max(maxError,error);
 }
 for(const image of doc.images||[]){
  const v=sourceViews[image.bufferView],bytes=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),img=await loadImage(bytes),scale=Math.min(1,512/img.width,512/img.height),canvas=createCanvas(Math.max(1,Math.round(img.width*scale)),Math.max(1,Math.round(img.height*scale)));
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);image.bufferView=view(await canvas.encode('jpeg',86));image.mimeType='image/jpeg';
 }
 doc.accessors=accessors;doc.bufferViews=views;doc.buffers=[{byteLength:offset}];
 doc.asset.extras={sourceFile:path.basename(source),sourceSha256:createHash('sha256').update(raw).digest('hex'),processing:'Uploaded original: texture-aware simplification, locked boundaries, 512px textures',sourceTriangles:total,triangles,maxRelativeError:maxError};
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);let data=Buffer.concat(chunks);data=Buffer.concat([data,Buffer.alloc((4-data.length%4)%4)]);
 const header=Buffer.alloc(28);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+data.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);header.writeUInt32LE(data.length,20);header.writeUInt32LE(0x004e4942,24);
 const output=path.join(root,'assets/buildings',name+'.glb');fs.writeFileSync(output,Buffer.concat([header.subarray(0,20),json,header.subarray(20),data]));
 console.log(JSON.stringify({name,sourceTriangles:total,triangles,maxRelativeError:maxError,bytes:fs.statSync(output).size}));
}
if(process.argv.length!==4)throw Error('Provide both original GLB paths.');
await prepare(process.argv[2],'observation-post',9000);
await prepare(process.argv[3],'bunker',35000);
