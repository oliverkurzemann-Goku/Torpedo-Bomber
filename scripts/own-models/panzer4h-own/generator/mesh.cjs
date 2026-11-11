'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

const TAU = 2 * Math.PI;
const add = (a,b) => a.map((v,i) => v+b[i]);
const sub = (a,b) => a.map((v,i) => v-b[i]);
const scale = (a,s) => a.map(v => v*s);
const cross = ([x,y,z],[a,b,c]) => [y*c-z*b,z*a-x*c,x*b-y*a];
const dot = (a,b) => a.reduce((s,v,i) => s+v*b[i],0);
const unit = a => scale(a,1/Math.hypot(...a));
const X = [1,0,0], Y = [0,1,0], Z = [0,0,1];
const qx = angle => [Math.sin(angle/2),0,0,Math.cos(angle/2)];
const rx = ([x,y,z],a) => [x,y*Math.cos(a)-z*Math.sin(a),y*Math.sin(a)+z*Math.cos(a)];
const mix = (a,b,t) => a+(b-a)*t;

class Mesh {
  constructor() { this.positions=[]; this.normals=[]; this.uv=[]; this.indices=[]; }
  face(points, uv, normals) {
    const n = unit(cross(sub(points[1],points[0]),sub(points[2],points[0])));
    const list = (Array.isArray(normals?.[0]) ? normals : points.map(() => normals || n)).map(unit);
    const reverse = dot(n,list.reduce(add,[0,0,0])) < 0;
    const start=this.positions.length/3;
    for(let i=0;i<points.length;i++){
      this.positions.push(...points[i]); this.normals.push(...list[i]); this.uv.push(...uv[i]);
    }
    for(let i=1;i<points.length-1;i++){
      this.indices.push(start,start+(reverse?i+1:i),start+(reverse?i:i+1));
    }
    return this;
  }
  shift(delta) {
    for(let i=0;i<this.positions.length;i++) this.positions[i]+=delta[i%3];
    return this;
  }
}

function block(mesh, uv, center, extent, basis=[X,Y,Z]) {
  const p = signs => signs.reduce((v,s,i)=>add(v,scale(basis[i],s*extent[i]/2)),center);
  for(let axis=0;axis<3;axis++){
    const a=(axis+1)%3,b=(axis+2)%3;
    for(const sign of [-1,1]){
      const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([s,t])=>{
        const signs=[];signs[axis]=sign;signs[a]=s;signs[b]=t;return p(signs);
      });
      mesh.face(points,[uv(0,1),uv(1,1),uv(1,0),uv(0,0)],scale(basis[axis],sign));
    }
  }
  return mesh;
}

function beam(mesh,uv,a,b,width,depth=width){
  const z=unit(sub(b,a));
  const x=unit(cross(Math.abs(dot(z,Y))>.94?X:Y,z));
  return block(mesh,uv,scale(add(a,b),.5),[width,depth,Math.hypot(...sub(b,a))],[x,cross(z,x),z]);
}

function tube(mesh,uv,a,b,r1,r2=r1,count=18,{capA=true,capB=true}={}){
  const z=unit(sub(b,a)),x=unit(cross(Math.abs(dot(z,Y))>.94?X:Y,z)),y=cross(z,x);
  const radial=t=>add(scale(x,Math.cos(t)),scale(y,Math.sin(t)));
  const slope=(r1-r2)/Math.hypot(...sub(b,a));
  for(let i=0;i<count;i++){
    const u=i/count,v=(i+1)/count;
    const d=radial(TAU*u),e=radial(TAU*v), da=add(a,scale(d,r1)),db=add(a,scale(e,r1)),
      ca=add(b,scale(d,r2)),cb=add(b,scale(e,r2));
    const nd=unit(add(d,scale(z,slope))),ne=unit(add(e,scale(z,slope)));
    mesh.face([da,db,cb,ca],[uv(0,u),uv(0,v),uv(1,v),uv(1,u)],[nd,ne,ne,nd]);
    const capUv=[uv(.5,.5),uv(.5+.48*Math.cos(TAU*u),.5+.48*Math.sin(TAU*u)),
      uv(.5+.48*Math.cos(TAU*v),.5+.48*Math.sin(TAU*v))];
    if(capA)mesh.face([a,da,db],capUv,scale(z,-1));
    if(capB)mesh.face([b,ca,cb],capUv,z);
  }
  return mesh;
}

/** Elliptic sections [z, radiusX, radiusY, centerY]. Forward is +Z. */
function loft(mesh, stations, count, uv, {x=0,minZ=stations[0][0],maxZ=stations.at(-1)[0],
    cut=null,capA=true,capB=true,inside=false}={}){
  const length=maxZ-minZ;
  const rows=stations.map(([z,rx,ry,y=0],i)=>{
    const before=stations[Math.max(0,i-1)],after=stations[Math.min(stations.length-1,i+1)];
    const dz=after[0]-before[0], dx=after[1]-before[1],dy=after[2]-before[2],dc=(after[3]||0)-(before[3]||0);
    return Array.from({length:count+1},(_,j)=>{
      const a=j/count*TAU,c=Math.cos(a),s=Math.sin(a);
      const p=[x+rx*c,y+ry*s,z];
      const n=scale(unit(cross([-rx*s,ry*c,0],[dx*c,dc+dy*s,dz])),inside?-1:1);
      return {p,n,t:uv((z-minZ)/length,j/count)};
    });
  });
  for(let i=0;i<rows.length-1;i++)for(let j=0;j<count;j++){
    if(cut&&!cut(i,j))continue;
    const q=[rows[i][j],rows[i][j+1],rows[i+1][j+1],rows[i+1][j]];
    mesh.face(q.map(k=>k.p),q.map(k=>k.t),q.map(k=>k.n));
  }
  for(const [which,on,sign] of [[0,capA,-1],[rows.length-1,capB,1]]){
    if(!on)continue;
    const [z,,,y=0]=stations[which],c=[x,y,z],u=(z-minZ)/length;
    for(let j=0;j<count;j++)mesh.face([c,rows[which][j].p,rows[which][j+1].p],
      [uv(u,.5),rows[which][j].t,rows[which][j+1].t],[0,0,sign*(inside?-1:1)]);
  }
  return mesh;
}

/**
 * Airfoil stations [spanX, heightY, leadingZ, trailingZ, thickness].
 * A cut by chord fraction creates a rigid control surface from the same profile.
 */
function wing(mesh, stations, uvTop,uvBottom,{from=0,to=1,steps=10,spanRange=[0,7.2],weldEdges=false}={}){
  const rows=stations.map(([x,y,lead,trail,t])=>{
    const u=(Math.abs(x)-spanRange[0])/(spanRange[1]-spanRange[0]);
    return [1,-1].map(sign=>Array.from({length:steps+1},(_,j)=>{
      const v=mix(from,to,(1-Math.cos(j*Math.PI/steps))/2);
      const bulge=Math.pow(Math.max(0,Math.sin(Math.PI*v)),.69)*(1.2-.48*v);
      const p=[x,y+sign*(.006+Math.max(.001,t)*bulge*.5)*(sign<0?.75:1),mix(lead,trail,v)];
      return {p,t:(sign>0?uvTop:uvBottom)(u,v)};
    }));
  });
  const face=(q,n)=>mesh.face(q.map(v=>v.p),q.map(v=>v.t),n);
  for(let i=0;i<rows.length-1;i++){
    const a=rows[i],b=rows[i+1];
    for(let j=0;j<steps;j++){
      for(const k of [0,1]){
        const q=[a[k][j],b[k][j],b[k][j+1],a[k][j+1]];
        let normal=unit(cross(sub(q[1].p,q[0].p),sub(q[2].p,q[0].p)));
        if(normal[1]*(k===0?1:-1)<0)normal=scale(normal,-1);
        face(q,normal);
      }
    }
    if(!weldEdges){
      for(const [j,dir] of [[0,Z],[steps,scale(Z,-1)]])
        face([a[0][j],a[1][j],b[1][j],b[0][j]],dir);
    }
  }
  for(const [i,k] of [[0,-1],[rows.length-1,1]]){
    const row=rows[i],sign=Math.sign(stations.at(-1)[0]-stations[0][0])*k;
    for(let j=0;j<steps;j++)face([row[0][j],row[0][j+1],row[1][j+1],row[1][j]],[sign,0,0]);
  }
  return mesh;
}

/** Closed symmetric tail profile, points in (Y,Z), nose facing +Z. */
function fin(mesh,stations,uv,options={}){
  const section=new Mesh();
  const wingStations=stations.map(([y,z0,z1,t])=>[y,0,z0,z1,t]);
  wing(section,wingStations,uv,uv,{...options,spanRange:options.spanRange||[0,3]});
  const p=section.positions,n=section.normals;
  for(let i=0;i<p.length;i+=3){
    [p[i],p[i+1]]=[-p[i+1],p[i]]; [n[i],n[i+1]]=[-n[i+1],n[i]];
  }
  const start=mesh.positions.length/3;
  mesh.positions.push(...p);mesh.normals.push(...n);mesh.uv.push(...section.uv);
  mesh.indices.push(...section.indices.map(i=>i+start));
  return mesh;
}

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

module.exports={TAU,X,Y,Z,Mesh,Scene,add,sub,scale,unit,dot,cross,qx,rx,mix,block,beam,tube,loft,wing,fin};
