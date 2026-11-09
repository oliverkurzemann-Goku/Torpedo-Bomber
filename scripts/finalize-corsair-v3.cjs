#!/usr/bin/env node
/* Build 233: turns the supplied Corsair_F4U1D_Review.glb (nativeAircraft "corsair-f4u1d-original-v3",
 * Blender-exported, unmodified copy kept in assets/aircraft/source/corsair-f4u1d-v3/) into the shipped
 * assets/aircraft/corsair-f4u1d-own.glb. Geometry, textures, materials and the nine clips are NOT touched.
 * Only three things change, each one needed by the game or by the glTF validator:
 *   1. TEXCOORD_0 for the three textured primitives that have none (sliding hood rim, both main gear doors).
 *      The validator reports MESH_PRIMITIVE_TOO_FEW_TEXCOORDS (error) for them; the sea-blue atlas is
 *      uniform there, so a planar projection into a quiet region of the atlas is used.
 *   2. userData.groundWheel on the three tyre meshes, so AircraftGround/ShipContact use the real tyre
 *      vertices (exactly three contacts) instead of the coarse low-point search.
 *   3. Rocket0..7 renamed so that the index alternates left/right (even = port, odd = starboard, inner pair
 *      first). The game fires Rocket(n-1) first and hides Rocket(n) when n rockets are left, so this keeps a
 *      symmetric ripple (the pre-233 model used the same convention); the supplied file numbered 0-3 port,
 *      4-7 starboard.
 * usage: node scripts/finalize-corsair-v3.cjs [input.glb] [output.glb] */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const input=process.argv[2]||path.join(root,'assets/aircraft/source/corsair-f4u1d-v3/Corsair_F4U1D_Review.glb');
const output=process.argv[3]||path.join(root,'assets/aircraft/corsair-f4u1d-own.glb');
const src=fs.readFileSync(input);
if(src.toString('ascii',0,4)!=='glTF')throw Error('not a GLB');
let off=12,json=null,bin=null;
while(off<src.length){const len=src.readUInt32LE(off),type=src.toString('ascii',off+4,off+8),data=src.subarray(off+8,off+8+len);
 if(type.startsWith('JSON'))json=JSON.parse(data.toString('utf8'));else if(type.startsWith('BIN'))bin=Buffer.from(data);off+=8+len;}
const sha=crypto.createHash('sha256').update(src).digest('hex');
if(json.nodes.find(n=>n.name==='CorsairF4U1D_Original')?.extras?.nativeAircraft!=='corsair-f4u1d-original-v3')throw Error('unexpected model version');

// 1. planar UVs for textured primitives without TEXCOORD_0
const chunks=[bin],pad=n=>(4-n%4)%4;let binLength=bin.length;
function addBuffer(buf,target){const p=pad(binLength);if(p){chunks.push(Buffer.alloc(p));binLength+=p;}
 json.bufferViews.push({buffer:0,byteOffset:binLength,byteLength:buf.length,target});chunks.push(buf);binLength+=buf.length;return json.bufferViews.length-1;}
function readVec3(accessor){const a=json.accessors[accessor],bv=json.bufferViews[a.bufferView];if(a.componentType!==5126)throw Error('POSITION is not float');
 const base=(bv.byteOffset||0)+(a.byteOffset||0),stride=bv.byteStride||12,out=[];for(let i=0;i<a.count;i++)out.push([0,4,8].map(o=>bin.readFloatLE(base+i*stride+o)));return out;}
const fixed=[];
for(const [mi,mesh] of json.meshes.entries())for(const prim of mesh.primitives){
 const mat=json.materials[prim.material];if(!mat?.pbrMetallicRoughness?.baseColorTexture||prim.attributes.TEXCOORD_0!=null)continue;
 const pts=readVec3(prim.attributes.POSITION),min=[1e9,1e9,1e9],max=[-1e9,-1e9,-1e9];
 for(const p of pts)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
 const ext=max.map((v,k)=>v-min[k]),axes=[0,1,2].sort((a,b)=>ext[b]-ext[a]).slice(0,2);
 const uv=Buffer.alloc(pts.length*8);
 pts.forEach((p,i)=>{for(let c=0;c<2;c++){const k=axes[c],t=ext[k]>1e-9?(p[k]-min[k])/ext[k]:.5;uv.writeFloatLE(.3+.4*t,i*8+c*4);}});
 const view=addBuffer(uv,34962);json.accessors.push({bufferView:view,componentType:5126,count:pts.length,type:'VEC2'});
 prim.attributes.TEXCOORD_0=json.accessors.length-1;fixed.push(mesh.name||('mesh'+mi));
}
if(fixed.length!==3)throw Error('expected three UV-less primitives, found '+fixed.length+': '+fixed.join(', '));

// 2. groundWheel tags
const tyres=['Main wheel Left tyre','Main wheel Right tyre','Tailwheel tyre'];
for(const name of tyres){const n=json.nodes.find(x=>x.name===name);if(!n||n.mesh==null)throw Error('tyre node missing: '+name);n.extras={...(n.extras||{}),groundWheel:true};}

// 3. alternating rocket numbering (old index -> new index)
const rocketMap={0:0,1:2,2:4,3:6,4:1,5:3,6:5,7:7},renamed=[];
for(const n of json.nodes){const m=/^(Rocket|HVAR body |Rocket)(\d)( · .*)?$/.exec(n.name||'');if(!m)continue;const old=+m[2],now=rocketMap[old];if(now==null)continue;
 if(m[1]==='Rocket'||m[1]==='HVAR body '){const label=m[1]==='HVAR body '?'HVAR body ':'Rocket';n.name=label+now+(m[3]||'');renamed.push(m[0]+'->'+n.name);}}
if(renamed.length!==24)throw Error('expected 24 renamed rocket nodes, got '+renamed.length);

// provenance
json.asset.generator=(json.asset.generator||'')+' + scripts/finalize-corsair-v3.cjs';
json.asset.extras={title:'F4U-1D Corsair (v3), supplied review model',
 author:'unknown - supplied by the project owner (model produced in a separate ChatGPT session; generator not in this repository)',
 license:'supplied by project owner; authorship and rights not independently verified (rights review stays open)',
 source:'assets/aircraft/source/corsair-f4u1d-v3/Corsair_F4U1D_Review.glb',sourceSha256:sha,
 authorClaim:'New mathematical surfaces and original hand-drawn textures, 2026-10-30 (from the supplied file\'s root-node extras)',
 modifications:['TEXCOORD_0 added to '+fixed.join(' / ')+' (planar, quiet atlas region)','userData.groundWheel on '+tyres.join(', '),'Rocket0..7 renumbered to alternate port/starboard']};
const pad2=(b,c)=>{const p=pad(b.length);return p?Buffer.concat([b,Buffer.alloc(p,c)]):b;};
const binOut=pad2(Buffer.concat(chunks),0);json.buffers[0].byteLength=binOut.length;
const jsonOut=pad2(Buffer.from(JSON.stringify(json),'utf8'),0x20);
const head=Buffer.alloc(12);head.write('glTF',0,'ascii');head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+jsonOut.length+8+binOut.length,8);
const ch=(type,b)=>{const h=Buffer.alloc(8);h.writeUInt32LE(b.length,0);h.write(type,4,'ascii');return Buffer.concat([h,b]);};
const tmp=output+'.tmp';fs.writeFileSync(tmp,Buffer.concat([head,ch('JSON',jsonOut),ch('BIN\0',binOut)]));fs.renameSync(tmp,output);   // atomic: running tests may read the file
console.log(JSON.stringify({input:path.relative(root,input),sha256:sha,output:path.relative(root,output),bytes:fs.statSync(output).size,uvFixed:fixed,groundWheel:tyres,rocketsRenamed:renamed.length},null,1));
