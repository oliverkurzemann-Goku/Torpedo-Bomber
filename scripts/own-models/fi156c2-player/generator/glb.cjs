'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

class Scene {
  constructor(asset,atlas){
    this.atlas=atlas;
    this.json={asset:{version:'2.0',generator:'Torpedo-Bomber procedural model generator 1.0',extras:asset},
      scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],textures:[{sampler:0,source:0}],
      images:[],samplers:[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}],
      accessors:[],bufferViews:[],buffers:[]};
    this.parts=[];this.bytes=0;
  }
  material(name,params={}){
    this.json.materials.push({name,pbrMetallicRoughness:{baseColorTexture:{index:0},
      metallicFactor:params.metallic??.04,roughnessFactor:params.roughness??.82,
      ...(params.factor?{baseColorFactor:params.factor}:{})},
      ...(params.doubleSided?{doubleSided:true}:{}),...(params.alphaMode?{alphaMode:params.alphaMode}:{}),
      ...(params.alphaMode==='BLEND'?{extras:{canopyGlazing:true}}:{}),
      ...(params.alphaMode==='MASK'?{alphaCutoff:.5}:{})});
    return this.json.materials.length-1;
  }
  view(buffer,target){
    const pad=(4-this.bytes%4)%4;
    if(pad){this.parts.push(Buffer.alloc(pad));this.bytes+=pad;}
    const view={buffer:0,byteOffset:this.bytes,byteLength:buffer.length};
    if(target)view.target=target;
    this.json.bufferViews.push(view);this.parts.push(buffer);this.bytes+=buffer.length;
    return this.json.bufferViews.length-1;
  }
  accessor(values,type,kind,limits=false){
    const size=type==='VEC3'?3:type==='VEC2'?2:1;
    const float=kind===5126,bytes=Buffer.alloc(values.length*(float?4:2));
    for(let i=0;i<values.length;i++){
      if(float)bytes.writeFloatLE(values[i],i*4);else bytes.writeUInt16LE(values[i],i*2);
    }
    const entry={bufferView:this.view(bytes,float?34962:34963),componentType:kind,count:values.length/size,type};
    if(limits){
      entry.min=new Array(size).fill(Infinity);entry.max=new Array(size).fill(-Infinity);
      values.forEach((v,i)=>{const j=i%size,f=Math.fround(v);
        entry.min[j]=Math.min(f,entry.min[j]);entry.max[j]=Math.max(f,entry.max[j]);});
    }
    this.json.accessors.push(entry);return this.json.accessors.length-1;
  }
  node(name,parent,{mesh,material=0,translation,rotation,scale,extras}={}){
    assert(!this.json.nodes.some(n=>n.name===name),name+' duplicated');
    const n={name};
    if(translation)n.translation=translation;if(rotation)n.rotation=rotation;
    if(scale)n.scale=scale;if(extras)n.extras=extras;
    if(mesh){
      assert(mesh.positions.length/3<65536&&mesh.indices.length>0,name);
      const primitive={attributes:{
        POSITION:this.accessor(mesh.positions,'VEC3',5126,true),
        NORMAL:this.accessor(mesh.normals,'VEC3',5126),
        TEXCOORD_0:this.accessor(mesh.uv,'VEC2',5126),
      },indices:this.accessor(mesh.indices,'SCALAR',5123),material,mode:4};
      n.mesh=this.json.meshes.length;
      this.json.meshes.push({name,primitives:[primitive]});
    }
    const index=this.json.nodes.push(n)-1;
    if(parent===null)this.json.scenes[0].nodes.push(index);
    else (this.json.nodes[parent].children??=[]).push(index);
    return index;
  }
  write(file){
    const img=this.view(this.atlas.png());
    this.json.images.push({name:'Procedural albedo atlas',bufferView:img,mimeType:'image/png'});
    const bin=Buffer.concat(this.parts),packed=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
    this.json.buffers=[{byteLength:packed.length}];
    const text=Buffer.from(JSON.stringify(this.json));
    const json=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,0x20)]);
    const head=Buffer.alloc(20),binHead=Buffer.alloc(8);
    head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(28+json.length+packed.length,8);
    head.writeUInt32LE(json.length,12);head.write('JSON',16);
    binHead.writeUInt32LE(packed.length,0);binHead.write('BIN\0',4);
    fs.writeFileSync(file,Buffer.concat([head,json,binHead,packed]));
  }
}

module.exports = { Scene };
