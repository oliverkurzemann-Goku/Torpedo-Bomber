'use strict';
// Minimal deterministic glTF 2.0 binary writer: float32 positions/normals/uvs, uint32 indices,
// embedded PNG/JPEG/WebP images, metallic-roughness materials, node extras. No extensions.
class GlbWriter{
  constructor(asset={}){
    this.json={asset:{version:'2.0',generator:'Torpedo-Bomber glb-writer',...asset},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[{byteLength:0}]};
    this.chunks=[];this.length=0;
  }
  view(bytes,target){
    const pad=(4-this.length%4)%4;if(pad){this.chunks.push(Buffer.alloc(pad));this.length+=pad;}
    const data=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const v={buffer:0,byteOffset:this.length,byteLength:data.length};if(target)v.target=target;
    this.chunks.push(data);this.length+=data.length;
    this.json.bufferViews.push(v);return this.json.bufferViews.length-1;
  }
  accessor(array,type,indices=false){
    const data=indices?Uint32Array.from(array):Float32Array.from(array),n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[type];
    const a={bufferView:this.view(data,indices?34963:34962),componentType:indices?5125:5126,count:data.length/n,type};
    if(type==='VEC3'||indices){const min=new Array(n).fill(Infinity),max=new Array(n).fill(-Infinity);
      for(let i=0;i<data.length;i+=n)for(let k=0;k<n;k++){min[k]=Math.min(min[k],data[i+k]);max[k]=Math.max(max[k],data[i+k]);}
      a.min=min;a.max=max;}
    this.json.accessors.push(a);return this.json.accessors.length-1;
  }
  image(bytes,mimeType='image/png'){
    this.json.images=this.json.images||[];this.json.textures=this.json.textures||[];
    this.json.samplers=this.json.samplers||[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}];
    this.json.images.push({bufferView:this.view(bytes),mimeType});
    this.json.textures.push({sampler:0,source:this.json.images.length-1});return this.json.textures.length-1;
  }
  material(m){this.json.materials.push(m);return this.json.materials.length-1;}
  mesh(name,{positions,normals,uvs,tangents,indices,material}){
    const attributes={POSITION:this.accessor(positions,'VEC3'),NORMAL:this.accessor(normals,'VEC3')};
    if(tangents)attributes.TANGENT=this.accessor(tangents,'VEC4');
    if(uvs)attributes.TEXCOORD_0=this.accessor(uvs,'VEC2');
    const prim={attributes,indices:this.accessor(indices,'SCALAR',true)};if(material!==undefined)prim.material=material;
    this.json.meshes.push({name,primitives:[prim]});return this.json.meshes.length-1;
  }
  node(n,parent){
    const node={...n};for(const k of ['translation','rotation','scale'])if(node[k]===undefined)delete node[k];
    if(node.extras&&!Object.keys(node.extras).length)delete node.extras;
    this.json.nodes.push(node);const i=this.json.nodes.length-1;
    if(parent===undefined||parent===null)this.json.scenes[0].nodes.push(i);
    else{const p=this.json.nodes[parent];(p.children||(p.children=[])).push(i);}
    return i;
  }
  glb(){
    const pad=(4-this.length%4)%4;if(pad){this.chunks.push(Buffer.alloc(pad));this.length+=pad;}
    this.json.buffers[0].byteLength=this.length;
    for(const k of ['materials','meshes','accessors','bufferViews'])if(!this.json[k].length)delete this.json[k];
    if(!this.length)delete this.json.buffers;
    let text=Buffer.from(JSON.stringify(this.json),'utf8');const tp=(4-text.length%4)%4;if(tp)text=Buffer.concat([text,Buffer.alloc(tp,0x20)]);
    const bin=Buffer.concat(this.chunks),total=12+8+text.length+(bin.length?8+bin.length:0),head=Buffer.alloc(12);
    head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(total,8);
    const jh=Buffer.alloc(8);jh.writeUInt32LE(text.length,0);jh.writeUInt32LE(0x4e4f534a,4);
    const parts=[head,jh,text];if(bin.length){const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);parts.push(bh,bin);}
    return Buffer.concat(parts);
  }
}
// Axis-aligned box centred on c with size s, flat normals, 0..1 uvs per face.
function box(c,s){
  const p=[],n=[],uv=[],ix=[];const h=s.map(v=>v/2);
  const faces=[[0,1],[0,-1],[1,1],[1,-1],[2,1],[2,-1]];
  for(const [axis,sign] of faces){
    const u=(axis+1)%3,v=(axis+2)%3,base=p.length/3;
    for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const q=[0,0,0];q[axis]=c[axis]+sign*h[axis];q[u]=c[u]+a*h[u];q[v]=c[v]+b*h[v];p.push(...q);const nn=[0,0,0];nn[axis]=sign;n.push(...nn);uv.push((a+1)/2,(b+1)/2);}
    if(sign>0)ix.push(base,base+1,base+2,base,base+2,base+3);else ix.push(base,base+2,base+1,base,base+3,base+2);
  }
  return {positions:p,normals:n,uvs:uv,indices:ix};
}
module.exports={GlbWriter,box};
