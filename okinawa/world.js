/* Okinawa coastal environment. Three.js r128; metres, +X east, -Z north, Y up.
 * Geographic surface: existing Copernicus GLO-30 samples / Overture polygons.
 * No dependency on, or mutations to, Remagen or either game's global state.
 * Water depths, landcover materials and all small objects are authored scenery.
 */
(function(scope){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
function hash(x,z){let n=Math.imul(x,374761393)+Math.imul(z,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;}
function noise(x,z){const a=Math.floor(x),b=Math.floor(z);let u=x-a,v=z-b;u=u*u*(3-2*u);v=v*v*(3-2*v);return mix(mix(hash(a,b),hash(a+1,b),u),mix(hash(a,b+1),hash(a+1,b+1),u),v);}
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function canvas(n){const c=document.createElement('canvas');c.width=c.height=n;return c;}
const pause=()=>new Promise(r=>setTimeout(r,0));
function merge(geometries){const p=[],n=[],uv=[];for(let g of geometries){if(g.index)g=g.toNonIndexed();p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);if(g.attributes.uv)uv.push(...g.attributes.uv.array);else for(let i=0;i<g.attributes.position.count;i++)uv.push(0,0);}const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.Float32BufferAttribute(p,3));out.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));out.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return out;}
function roofGeometry(){
  // Hipped roof with an actual ridge; asymmetric highlights remain visible from flight altitude.
  const v=[[-.62,0,-.52],[.62,0,-.52],[.62,0,.52],[-.62,0,.52],[-.28,.32,0],[.28,.32,0]];
  const faces=[[0,4,5],[0,5,1],[1,5,2],[2,5,4],[2,4,3],[3,4,0]],p=[],uv=[];
  for(const f of faces)for(const i of f){p.push(...v[i]);uv.push(v[i][0]+.62,v[i][2]+.52);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
function gableRoofGeometry(){
  const v=[[-.62,0,-.54],[.62,0,-.54],[-.62,0,.54],[.62,0,.54],[0,.40,-.54],[0,.40,.54]];
  const faces=[[0,1,4],[2,5,3],[0,4,5],[0,5,2],[1,3,5],[1,5,4],[0,2,3],[0,3,1]],p=[],uv=[];
  for(const f of faces)for(const i of f){p.push(...v[i]);uv.push(v[i][0]+.62,v[i][2]+.54);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
function frondGeometry(){
  const p=[];
  const add=(a,b,c)=>p.push(...a,...b,...c);
  for(let f=0;f<10;f++){
    const angle=f*2.39996,reach=3.7+(f%3)*.4;
    const point=t=>[Math.cos(angle)*reach*t,9+Math.sin(t*Math.PI)*1.1-1.65*t*t,Math.sin(angle)*reach*t];
    for(let i=0;i<11;i++){
      const t=.08+i*.075,a=point(t),b=point(t+.10),w=Math.sin(t*Math.PI)*.72;
      for(const side of [-1,1]){const tip=[a[0]-Math.sin(angle)*w*side-Math.cos(angle)*.4,a[1]-.28,a[2]+Math.cos(angle)*w*side-Math.sin(angle)*.4];add(a,b,tip);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();return g;
}
class OkinawaWorld{
 constructor(data, options={}){
  this.data=data;this.root=new THREE.Group();this.root.name='OkinawaEnvironment';this.terrain=new THREE.Group();this.terrain.name='GeographicTerrain';this.root.add(this.terrain);
  this.tiles=new Map();this.size=16000;this.half=8000;this.mapSize=1024;this.objectCount=0;this.vegetationDensity=options.vegetationDensity===undefined?1:clamp(options.vegetationDensity,.1,1);this.time={value:0};this.warm={value:0};this.sun=new THREE.Vector3(-.48,.72,.46).normalize();this.materials=[];this.decorations=[];this.houseGrid=new Map();this.houseSites=[];this.nearBuildings=[];this.detailTemplates=[];this.fortifications=[];
  for(const t of data.tiles){const bytes=Uint8Array.from(atob(t.dem),c=>c.charCodeAt(0)),d=new DataView(bytes.buffer);if(String.fromCharCode(...bytes.slice(0,4))!=='DEM1'||d.getUint16(4,true)!==65||bytes.length!==16916)throw Error('Invalid DEM tile '+t.x+','+t.z);const h=new Float32Array(4225);for(let i=0;i<h.length;i++){h[i]=d.getFloat32(16+i*4,true);if(!Number.isFinite(h[i]))throw Error('Non-finite DEM sample');}this.tiles.set(t.x+','+t.z,h);}
 }
 rawHeight(x,z){
  const ox=clamp(x+16000,8000,23999.999),oz=clamp(28000-z,20000,35999.999),tx=Math.floor(ox/4000),tz=Math.floor(oz/4000),h=this.tiles.get(tx+','+tz);
  if(!h)throw Error('DEM tile missing');const a=(ox-tx*4000)/62.5,b=(oz-tz*4000)/62.5,ix=Math.floor(a),iz=Math.floor(b),u=a-ix,v=b-iz;return mix(mix(h[iz*65+ix],h[iz*65+ix+1],u),mix(h[(iz+1)*65+ix],h[(iz+1)*65+ix+1],u),v);
 }
 rasterSample(a,x,z){const n=this.mapSize,fx=clamp((x+8000)/16000*(n-1),0,n-1.001),fz=clamp((z+8000)/16000*(n-1),0,n-1.001),ix=Math.floor(fx),iz=Math.floor(fz);return mix(mix(a[iz*n+ix],a[iz*n+ix+1],fx-ix),mix(a[(iz+1)*n+ix],a[(iz+1)*n+ix+1],fx-ix),fz-iz);}
 shoreDistance(x,z){return this.rasterSample(this.distance,x,z);}
 getHeight(x,z){
  const d=this.shoreDistance(x,z),h=this.rawHeight(x,z);
  if(d<0)return -Math.min(45,1.0+Math.pow(-d/95,1.25));
  // Keep the measured relief. Only feather the final shoreline cell to meet sea level.
  const coast=clamp(d/26,0,1),micro=(noise(x*.028,z*.028)-.5)*1.5*clamp(d/40,0,1);
  return Math.max(.15,h*coast+micro);
 }
 getSurfaceHeight(x,z){
  const step=31.25,gx=Math.floor((x+8000)/step)*step-8000,gz=Math.floor((z+8000)/step)*step-8000,u=(x-gx)/step,v=(z-gz)/step;
  const a=this.getHeight(gx,gz),b=this.getHeight(gx+step,gz),c=this.getHeight(gx,gz+step),d=this.getHeight(gx+step,gz+step);
  return u+v<=1?a+u*(b-a)+v*(c-a):d+(1-u)*(c-d)+(1-v)*(b-d);
 }
 buildRoads(){
  // Authored period-style hamlet links and farm tracks; no modern Overture road claim.
  const N=100,step=160,heights=new Float32Array(N*N),valid=new Uint8Array(N*N),key=(x,z)=>z*N+x,point=k=>[k%N*step-7920,Math.floor(k/N)*step-7920];
  for(let z=0;z<N;z++)for(let x=0;x<N;x++){const k=key(x,z),p=point(k);heights[k]=this.getSurfaceHeight(...p);valid[k]=this.shoreDistance(...p)>30&&this.biome(...p)[2]<.1&&!this.nearHouse(...p)?1:0;}
  const nearest=p=>{let best=-1,dist=Infinity;for(let k=0;k<valid.length;k++)if(valid[k]){const q=point(k),d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<dist){dist=d;best=k;}}return dist<700?best:-1;};
  const nodes=[...new Set((this.hamletCenters||[]).map(nearest).filter(k=>k>=0))],routes=[],connected=new Set(nodes.length?[nodes[0]]:[]);
  const heapPush=(heap,item)=>{heap.push(item);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p][0]<=item[0])break;heap[i]=heap[p];i=p;}heap[i]=item;};
  const heapPop=heap=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1][0]<heap[j][0])j++;if(heap[j][0]>=last[0])break;heap[i]=heap[j];i=j;}heap[i]=last;}return top;};
  const route=(start,end)=>{
   const cost=new Float32Array(N*N);cost.fill(Infinity);cost[start]=0;const prev=new Int32Array(N*N);prev.fill(-1);const heap=[],goal=point(end);heapPush(heap,[0,start]);let iterations=0;
   while(heap.length&&iterations++<20000){const [,a]=heapPop(heap);if(a===end){const path=[];for(let k=end;k>=0;k=prev[k]){path.push(point(k));if(k===start)break;}return path.reverse();}
    const x=a%N,z=Math.floor(a/N);
    for(const [dx,dz]of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]){
     const xx=x+dx,zz=z+dz;if(xx<0||zz<0||xx>=N||zz>=N)continue;const b=key(xx,zz);if(!valid[b])continue;
     const length=step*Math.hypot(dx,dz),slope=Math.abs(heights[a]-heights[b])/length;if(slope>.48)continue;
     const pa=point(a),pb=point(b);let clear=true;
     for(let f=.125;f<1;f+=.125){const px=pa[0]+(pb[0]-pa[0])*f,pz=pa[1]+(pb[1]-pa[1])*f;if(this.shoreDistance(px,pz)<24||this.nearHouse(px,pz)){clear=false;break;}}
     if(!clear)continue;const next=cost[a]+length*(1+slope*5);if(next>=cost[b])continue;
     cost[b]=next;prev[b]=a;heapPush(heap,[next+Math.hypot(pb[0]-goal[0],pb[1]-goal[1]),b]);
    }
   }
   return null;
  };
  // Shortest available link adds one hamlet at a time. Disconnected offshore cells stay separate.
  const remaining=new Set(nodes.slice(1));
  while(remaining.size){let edge=null,distance=Infinity;for(const a of connected)for(const b of remaining){const p=point(a),q=point(b),d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d<distance){distance=d;edge=[a,b];}}
   const path=edge&&route(...edge);if(path&&distance<6000)routes.push({path,width:5.5,kind:'road'});const b=edge?.[1]??remaining.values().next().value;remaining.delete(b);connected.add(b);
  }
  // Connect mapped agricultural patches to the nearest hamlet road node.
  this.polygons('fields',ring=>{if(ring.length<3||routes.filter(r=>r.kind==='track').length>=28)return;const c=ring.reduce((a,p)=>[a[0]+p[0]/ring.length,a[1]+p[1]/ring.length],[0,0]),end=nearest(c);if(end<0)return;
   let start=-1,d=Infinity;for(const k of nodes){const p=point(k),dist=Math.hypot(p[0]-c[0],p[1]-c[1]);if(dist<d){d=dist;start=k;}}if(start<0||d>2200||d<200)return;const path=route(start,end);if(path)routes.push({path,width:2.6,kind:'track'});
  });
  this.roadRoutes=routes;this.roadGrid=new Map();const buckets={road:[],track:[]};
  const clip=(poly,a,b)=>{const side=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]),out=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],sp=side(p),sq=side(q);if(sp>=-1e-7)out.push(p);if((sp>=0)!==(sq>=0)){const f=sp/(sp-sq);out.push([p[0]+(q[0]-p[0])*f,p[1]+(q[1]-p[1])*f]);}}return out;};
  const strip=(a,b,width,vertices)=>{
   const dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz);if(L<.1)return;const nx=-dz/L*width/2,nz=dx/L*width/2,quad=[[a[0]+nx,a[1]+nz],[a[0]-nx,a[1]-nz],[b[0]-nx,b[1]-nz],[b[0]+nx,b[1]+nz]];
   const x0=Math.floor((Math.min(...quad.map(p=>p[0]))+8000)/31.25),x1=Math.floor((Math.max(...quad.map(p=>p[0]))+8000)/31.25),z0=Math.floor((Math.min(...quad.map(p=>p[1]))+8000)/31.25),z1=Math.floor((Math.max(...quad.map(p=>p[1]))+8000)/31.25);
   for(let ix=x0;ix<=x1;ix++)for(let iz=z0;iz<=z1;iz++){const x=ix*31.25-8000,z=iz*31.25-8000;for(const tri of [[[x,z],[x+31.25,z],[x,z+31.25]],[[x+31.25,z+31.25],[x,z+31.25],[x+31.25,z]]]){
    let poly=quad;for(let j=0;j<3&&poly.length;j++)poly=clip(poly,tri[j],tri[(j+1)%3]);
    for(let j=1;j<poly.length-1;j++)for(const p of [poly[0],poly[j+1],poly[j]])vertices.push(p[0],this.getSurfaceHeight(...p)+.14,p[1]);
   }}
  };
  for(const r of routes)for(let i=1;i<r.path.length;i++){
   const a=r.path[i-1],b=r.path[i];strip(a,b,r.width,buckets[r.kind]);
   const L=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let f=0;f<=L;f+=8){const x=mix(a[0],b[0],f/L),z=mix(a[1],b[1],f/L),k=Math.floor(x/64)+','+Math.floor(z/64);if(!this.roadGrid.has(k))this.roadGrid.set(k,[]);this.roadGrid.get(k).push({x,z,r:r.width/2+5});}
  }
  const tex=canvas(64),ctx=tex.getContext('2d'),rand=rng(1153);ctx.fillStyle='#b0a17d';ctx.fillRect(0,0,64,64);for(let i=0;i<1100;i++){ctx.fillStyle=rand()<.5?'#988968':'#c1b18a';ctx.fillRect(rand()*64,rand()*64,1+rand()*2,1+rand()*2);}const map=new THREE.CanvasTexture(tex);map.wrapS=map.wrapT=THREE.RepeatWrapping;
  for(const kind of ['road','track']){const vertices=buckets[kind];if(!vertices.length)continue;const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const uv=[];for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]/5,vertices[i+2]/5);geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map,color:kind==='road'?0x9c8d70:0x897654,roughness:1,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}));mesh.name=kind==='road'?'Hamlet earth roads':'Farm tracks';mesh.receiveShadow=true;this.root.add(mesh);this.decorations.push(mesh);}
 }
 nearRoad(x,z){
  if(!this.roadGrid)return false;const gx=Math.floor(x/64),gz=Math.floor(z/64);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const p of this.roadGrid.get((gx+dx)+','+(gz+dz))||[])if(Math.hypot(x-p.x,z-p.z)<p.r)return true;return false;
 }
 polygons(key,fn){for(const t of this.data.tiles)for(const ring of t[key])fn(ring.map(p=>[t.x*4000+p[0]-16000,28000-t.z*4000-p[1]]));}
 paintPolygons(ctx,key,color){ctx.fillStyle=color;this.polygons(key,p=>{ctx.beginPath();p.forEach((q,i)=>ctx[i?'lineTo':'moveTo']((q[0]+8000)/16000*this.mapSize,(q[1]+8000)/16000*this.mapSize));ctx.closePath();ctx.fill();});}
 buildMasks(){
  const n=this.mapSize,c=canvas(n),ctx=c.getContext('2d'),im=ctx.createImageData(n,n);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const w=this.rawHeight(i/(n-1)*16000-8000,j/(n-1)*16000-8000)<.6?255:0,k=(j*n+i)*4;im.data[k]=im.data[k+1]=im.data[k+2]=w;im.data[k+3]=255;}
  ctx.putImageData(im,0,0);this.paintPolygons(ctx,'water','#fff');const water=ctx.getImageData(0,0,n,n).data;
  this.land=new Uint8Array(n*n);this.distance=new Float32Array(n*n);const dist=this.distance;
  for(let i=0;i<dist.length;i++){this.land[i]=water[i*4]<128?1:0;dist[i]=1e6;}
  for(let j=1;j<n-1;j++)for(let i=1;i<n-1;i++){const k=j*n+i,v=this.land[k];if(v!==this.land[k-1]||v!==this.land[k+1]||v!==this.land[k-n]||v!==this.land[k+n])dist[k]=.5;}
  for(let j=1;j<n;j++)for(let i=1;i<n;i++){const k=j*n+i;dist[k]=Math.min(dist[k],dist[k-1]+1,dist[k-n]+1,dist[k-n-1]+1.414);}
  for(let j=n-2;j>=0;j--)for(let i=n-2;i>=0;i--){const k=j*n+i;dist[k]=Math.min(dist[k],dist[k+1]+1,dist[k+n]+1,dist[k+n+1]+1.414);}
  for(let i=0;i<dist.length;i++)dist[i]*=16000/(n-1)*(this.land[i]?1:-1);
  ctx.fillStyle='#000';ctx.fillRect(0,0,n,n);this.paintPolygons(ctx,'forest','#ff0000');this.paintPolygons(ctx,'fields','#00ff00');this.paintPolygons(ctx,'airfields','#0000ff');this.biomes=ctx.getImageData(0,0,n,n).data;
  const sdf=new Uint8Array(n*n*4);for(let i=0;i<n*n;i++){const d=clamp(Math.round(dist[i]+32768),0,65535);sdf[i*4]=d>>8;sdf[i*4+1]=d&255;sdf[i*4+2]=0;sdf[i*4+3]=255;}
  this.coastTexture=new THREE.DataTexture(sdf,n,n,THREE.RGBAFormat);this.coastTexture.minFilter=this.coastTexture.magFilter=THREE.NearestFilter;this.coastTexture.needsUpdate=true;
 }
 biome(x,z){const n=this.mapSize,i=clamp(Math.round((x+8000)/16000*(n-1)),0,n-1),j=clamp(Math.round((z+8000)/16000*(n-1)),0,n-1),k=(j*n+i)*4;return [this.biomes[k]/255,this.biomes[k+1]/255,this.biomes[k+2]/255];}
 buildGroundTexture(){
  const n=2048,c=canvas(n),ctx=c.getContext('2d'),im=ctx.createImageData(n,n);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
   const x=i/(n-1)*16000-8000,z=j/(n-1)*16000-8000,d=this.shoreDistance(x,z),h=this.rawHeight(x,z),[forest,field,air]=this.biome(x,z);
   const broad=noise(x*.003,z*.003),grain=hash(i,j)-.5,patch=noise(x*.018,z*.018);
   let col=[82+26*broad,99+29*broad,49+17*broad];
   if(forest>.3||h>100)col=[42+20*broad,66+24*broad,34+15*broad];
   if(field>.3){const f=noise(x*.009,z*.009);col=[97+38*f,102+28*f,56+16*f];const rows=Math.sin((x*.38+z*.08))*1.8;col=col.map(v=>v+rows);}
   if(air>.3)col=[124,122,94];
   if(d<28){const t=clamp(d/28,0,1);col=col.map((v,k)=>mix([185,181,143][k],v,t));}
   if(d<0)col=[113,141,112];
   const k=(j*n+i)*4,shade=(patch-.5)*16+grain*14;for(let q=0;q<3;q++)im.data[k+q]=clamp(col[q]+shade,0,255);im.data[k+3]=255;
  }
  ctx.putImageData(im,0,0);this.groundCanvas=c;this.groundTexture=new THREE.CanvasTexture(c);this.groundTexture.encoding=THREE.sRGBEncoding;this.groundTexture.anisotropy=4;this.groundTexture.flipY=true;
 }
 async build(onProgress=()=>{}){
  onProgress(.12,'Tracing the real coastline…');await pause();this.buildMasks();
  onProgress(.28,'Shaping the land…');await pause();this.buildGroundTexture();
  const material=new THREE.MeshStandardMaterial({map:this.groundTexture,roughness:1,color:0xffffff});this.materials.push(material);
  material.onBeforeCompile=s=>{s.uniforms.uTerrainTime=this.time;s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTerrainWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvTerrainWorld=(modelMatrix*vec4(transformed,1.)).xyz;');s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform float uTerrainTime; varying vec3 vTerrainWorld;').replace('#include <map_fragment>','#include <map_fragment>\nfloat detail=sin(vTerrainWorld.x*.51+sin(vTerrainWorld.z*.41))*sin(vTerrainWorld.z*.73);\nfloat cloud=sin(vTerrainWorld.x*.0007+uTerrainTime*.004)*sin(vTerrainWorld.z*.0011);\ndiffuseColor.rgb*=.94+detail*.025+cloud*.06;');};
  for(let row=0;row<4;row++)for(let col=0;col<4;col++){
    const g=new THREE.PlaneGeometry(4000,4000,128,128);g.rotateX(-Math.PI/2);const p=g.attributes.position,uv=g.attributes.uv;
    for(let i=0;i<p.count;i++){const x=p.getX(i)-6000+col*4000,z=p.getZ(i)-6000+row*4000;p.setXYZ(i,x,this.getHeight(x,z),z);uv.setXY(i,(x+8000)/16000,1-(z+8000)/16000);}
    g.computeVertexNormals();g.computeBoundingSphere();const m=new THREE.Mesh(g,material);m.name='Terrain_'+col+'_'+row;m.receiveShadow=true;this.terrain.add(m);
  }
  onProgress(.58,'Growing the coastal landscape…');await pause();this.buildSettlements();await this.loadFortifications();this.buildVillageDetails();this.buildRoads();this.buildVegetation();
  onProgress(.8,'Lighting the sea…');await pause();this.buildWater();this.buildSky();onProgress(1,'Ready');return this;
 }
 batch(geo,mat,placements,name){if(!placements.length)return;const m=new THREE.InstancedMesh(geo,mat,placements.length),dummy=new THREE.Object3D();m.name=name;for(let i=0;i<placements.length;i++){const p=placements[i];dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.r||0,0);dummy.scale.set(p.sx||p.s||1,p.sy||p.s||1,p.sz||p.s||1);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);}m.instanceMatrix.needsUpdate=true;m.frustumCulled=false;m.castShadow=false;m.receiveShadow=true;this.root.add(m);this.objectCount+=placements.length;this.decorations.push(m);return m;}
 nearHouse(x,z){
  if(this.fortifications.some(e=>Math.hypot(x-e.x,z-e.z)<Math.hypot(e.w,e.d)/2+12))return true;
  const gx=Math.floor(x/64),gz=Math.floor(z/64);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)
   for(const p of this.houseGrid.get((gx+dx)+','+(gz+dz))||[])
    if(Math.hypot(x-p.x,z-p.z)<p.radius+5)return true;
  return false;
 }
 buildVegetation(){
  this.treeIndex=scope.FlightSupport?new scope.FlightSupport.TreeIndex():null;
  const rand=rng(680422),buckets=[[],[],[]],trunks=[],palms=[],rocks=[];
  for(let i=0;i<Math.round(68000*this.vegetationDensity);i++){
   const x=rand()*15400-7700,z=rand()*15400-7700,d=this.shoreDistance(x,z);if(d<20)continue;
   const h=this.getHeight(x,z),[forest,field,air]=this.biome(x,z),patch=noise(x*.0028,z*.0028);
   if(air>.2||field>.2||this.nearHouse(x,z)||this.nearRoad(x,z))continue;
   const density=forest>.3?.86:(h>90?.68:(patch>.48?.42:.08));if(rand()>density)continue;
   const slope=Math.hypot(this.getHeight(x+15,z)-h,this.getHeight(x,z+15)-h)/15;if(slope>.9)continue;
   // Trunk radius used to be s*.15 (height:radius up to ~22:1, a toothpick under a
   // canopy blob from any real flight altitude); s*.27 reads as an actual trunk.
   const s=5.2+rand()*7.6,p={x,z,y:h-.4,s,r:rand()*Math.PI*2};buckets[i%3].push(p);this.treeIndex?.add(x,z,h-.4,s*1.19,s*.66,s*.065);trunks.push({...p,sx:s*.27,sy:s*.72,sz:s*.27});
   if(d<160&&d>35&&rand()<.08&&!this.nearRoad(x+4,z+3))palms.push({x:x+4,z:z+3,y:this.getHeight(x+4,z+3)-.2,s:.9+rand()*.45,r:rand()*6.28});
  }
  const yardTrees=(this.yardPalms||[]).filter(p=>!this.nearRoad(p.x,p.z)),matrix=new THREE.Matrix4();
  for(const mesh of this.decorations.filter(m=>m.name==='Village palm trunks'||m.name==='Village palm fronds')){let count=0;for(let i=0;i<(this.yardPalms||[]).length;i++)if(!this.nearRoad(this.yardPalms[i].x,this.yardPalms[i].z)){mesh.getMatrixAt(i,matrix);mesh.setMatrixAt(count++,matrix);}mesh.count=count;mesh.instanceMatrix.needsUpdate=true;}
  this.yardPalms=yardTrees;for(const p of yardTrees)this.treeIndex?.add(p.x,p.z,p.y,10*p.s,4*p.s,.2*p.s);
  for(let v=0;v<3;v++){
   const gs=[];for(let j=0;j<4;j++){const g=new THREE.SphereGeometry(.42,7,5);g.scale(1,.7+(j%2)*.2,.9);g.translate(Math.cos(j*2.4)*.24,.63+(j%2)*.20,Math.sin(j*2.4)*.24);gs.push(g);}
   // These used to be 0x344c25/0x425b2c/0x4f6531 -- a plausible dark-green hex on
   // paper, but measured (real render, torpedo-carrier.html's own ACESFilmicToneMapping
   // at exposure 1.12 plus its HemisphereLight(.9)+Ambient(.15)+Directional(1.6) rig)
   // it washes out to a near-white sage blob, which is what "komisch wirkende Baeume"
   // was actually seeing. Same isolated-sphere test under that exact rig confirmed a
   // color needs to be roughly this dark before it still reads as green, not pale.
   const geo=merge(gs),mat=new THREE.MeshStandardMaterial({color:[0x16240e,0x1c2e14,0x233a19][v],roughness:1});this.materials.push(mat);this.batch(geo,mat,buckets[v],'Broadleaf canopy '+v);
  }
  this.batch(new THREE.CylinderGeometry(.15,.24,1,5).translate(0,.5,0),new THREE.MeshStandardMaterial({color:0x4a3d2e,roughness:1}),trunks,'Tree trunks');
  for(const p of palms)this.treeIndex?.add(p.x,p.z,p.y,10*p.s,4*p.s,.2*p.s);
  this.batch(new THREE.CylinderGeometry(.12,.24,9,7).translate(0,4.5,0),new THREE.MeshStandardMaterial({color:0x5c4f3a,roughness:1}),palms,'Palm trunks');
  this.batch(frondGeometry(),new THREE.MeshStandardMaterial({color:0x1e3018,roughness:1,side:THREE.DoubleSide}),palms,'Palm fronds');
  for(let i=0;i<Math.round(18000*this.vegetationDensity);i++){const x=rand()*15500-7750,z=rand()*15500-7750,d=this.shoreDistance(x,z);if(d>3&&d<42&&rand()>.35)rocks.push({x,z,y:this.getHeight(x,z)-1,sx:2+rand()*5,sy:1+rand()*2,sz:2+rand()*4,r:rand()*6.28});}
  this.batch(new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0x898879,roughness:1}),rocks,'Coastal limestone');
 }
 buildSettlements(){
  // Illustrative rural hamlets, not today's Overture buildings. Mix compact red-roofed
  // houses, timber workshops and low thatched storehouses, grouped into courtyards.
  const rand=rng(9831),walls=Array.from({length:5},()=>[]),roofs=Array.from({length:5},()=>[]);
  const dark=[],gardenWalls=[],doors=[],windows=[],shutters=[],posts=[],foundations=[],tracks=[],locations=[],yardPalms=[],yardCisterns=[];
  const addHouse=(x,z,w,depth,rot,y,style,annex=false)=>{
    const h=[3.4,4.5,2.65,3.15,4.1][style];
    this.houseSites.push({x,z,y,w,depth,rot,h,style});
    const roofH=(style===2||style===3)?w*.42:w*.72;
    const key=Math.floor(x/64)+','+Math.floor(z/64);
    if(!this.houseGrid.has(key))this.houseGrid.set(key,[]);
    this.houseGrid.get(key).push({x,z,radius:Math.hypot(w,depth)*.6});
    walls[style].push({x,z,y:y+h/2,sx:w,sy:h,sz:depth,r:rot});
    roofs[style].push({x,z,y:y+h,sx:w,sy:roofH,sz:depth,r:rot});
    const frontX=x+Math.sin(rot)*(depth*.5+.12),frontZ=z+Math.cos(rot)*(depth*.5+.12);
    if(style!==2)dark.push({x:frontX,z:frontZ,y:y+h*.50,sx:w*.72,sy:h*.65,sz:.11,r:rot});
    doors.push({x:frontX,z:frontZ,y:y+.95,sx:1.2,sy:1.9,sz:.16,r:rot});
    for(const side of [-1,1]){
      const wx=frontX+Math.cos(rot)*side*w*.30,wz=frontZ-Math.sin(rot)*side*w*.30;
      windows.push({x:wx,z:wz,y:y+h*.62,sx:style===2?.65:.95,sy:style===2?.55:.80,sz:.18,r:rot});
      if(style!==2)shutters.push({x:wx+Math.cos(rot)*side*.62,z:wz-Math.sin(rot)*side*.62,
        y:y+h*.62,sx:.24,sy:.91,sz:.18,r:rot});
      if(style===0||style===3)posts.push({x:frontX+Math.cos(rot)*side*w*.48+Math.sin(rot)*1.2,
        z:frontZ-Math.sin(rot)*side*w*.48+Math.cos(rot)*1.2,y:y+h*.48,sx:.21,sy:h*.96,sz:.21,r:rot});
    }
    foundations.push({x,z,y:y+.18,sx:w+.18,sy:.36,sz:depth+.18,r:rot});
    if(annex){
      const ax=x+Math.cos(rot)*(w*.68),az=z-Math.sin(rot)*(w*.68);
      const ay=this.getHeight(ax,az);
      if(this.shoreDistance(ax,az)>35 && Math.abs(ay-y)<1.1)
        addHouse(ax,az,w*.50,depth*.64,rot+.12,ay,2,false);
    }
  };
  // Used to be six fixed hamlet centres, all packed into one ~3x2km pocket in the
  // south-west corner of the 16x16km map -- most sorties/free-flight never crossed
  // that one pocket, which read in play as "no buildings at all" even though the
  // hamlets themselves looked fine up close. Scan a jittered grid across the whole
  // island instead: each cell becomes a hamlet only if the centre itself is inland,
  // clear of heavy forest/fields/the airfield and not on a steep slope or ridge --
  // the same suitability a real Okinawan village favoured (flat land near the coast
  // or a valley floor) -- and even then only about half the eligible cells are used,
  // so coverage stays organic rather than a rigid lattice.
  const hamletCenters=[[-4800,-2600],[-4200,-3300],[-3800,200],[-3100,-1500],[-2500,-2800],[-2200,600]];
  for(let gx=-7400;gx<7400;gx+=1250)for(let gz=-7400;gz<7400;gz+=1250){
   const jx=gx+625+(rand()-.5)*600,jz=gz+625+(rand()-.5)*600;
   const jh=this.getHeight(jx,jz),jd=this.shoreDistance(jx,jz);
   const [jforest,jfield,jair]=this.biome(jx,jz);
   if(jd<100||jair>.15||jforest>.65||jfield>.75)continue;
   const jslope=Math.hypot(this.getHeight(jx+40,jz)-jh,this.getHeight(jx,jz+40)-jh)/40;
   if(jslope>.6||jh>260)continue;
   if(rand()>.32)continue;
   hamletCenters.push([jx,jz]);
  }
  this.hamletCenters=hamletCenters;
  for(const c of hamletCenters){
   for(let i=0;i<46;i++){
    const angle=rand()*6.28,r=40+Math.sqrt(rand())*330,x=c[0]+Math.cos(angle)*r,z=c[1]+Math.sin(angle)*r;
    const y=this.getHeight(x,z),d=this.shoreDistance(x,z);if(d<100||this.biome(x,z)[0]>.3)continue;
    const style=Math.min(4,Math.floor(rand()*5));
    const w=(style===1||style===4?11:7.5)+rand()*(style===1||style===4?7:6);
    const depth=(style===1||style===4?9:6)+rand()*5,rot=(rand()-.5)*.9;
    if(Math.max(Math.abs(this.getHeight(x+w,z)-y),Math.abs(this.getHeight(x,z+depth)-y))>1.4)continue;
    if(locations.some(p=>Math.hypot(p.x-x,p.z-z)<30))continue;locations.push({x,z});
    addHouse(x,z,w,depth,rot,y,style,rand()>.72);
    for(let side=-1;side<=1;side+=2){const gx=x+side*(w*.7+3),gz=z;gardenWalls.push({x:gx,z:gz,y:this.getHeight(gx,gz)+.55,sx:.65,sy:1.1,sz:depth+10,r:0});}
   }
   // Two short dirt approaches give each hamlet a visible route through its
   // courtyards. Sample every strip against the actual terrain and coast.
   for(const angle of [rand()*6.28,rand()*6.28])for(let j=0;j<32;j++){
    const x=c[0]+Math.sin(angle)*j*6,z=c[1]+Math.cos(angle)*j*6;
    if(Math.abs(x)>7850||Math.abs(z)>7850||this.shoreDistance(x,z)<35)break;
    const h=this.getHeight(x,z),h2=this.getHeight(x+Math.sin(angle)*4,z+Math.cos(angle)*4);
    if(Math.abs(h-h2)>.8)continue;
    tracks.push({x,z,y:h+.08,sx:3.3,sy:.10,sz:6.3,r:angle});
   }
  }
  // A small coastal village near the eastern strike route remains readable from low
  // altitude. Leave gaps and slight offsets so it follows the land rather than a grid.
  for(let row=0;row<5;row++)for(let col=0;col<7;col++){
   const x=-4840+col*29+(rand()-.5)*18,z=-2610+row*34+(rand()-.5)*22;
   const y=this.getHeight(x,z),d=this.shoreDistance(x,z),w=7+rand()*7,depth=6+rand()*6,rot=(rand()-.5)*.55;
   if(d<40||this.biome(x,z)[0]>.3||Math.max(Math.abs(this.getHeight(x+w,z)-y),Math.abs(this.getHeight(x,z+depth)-y))>2.5)continue;
   if(locations.some(p=>Math.hypot(p.x-x,p.z-z)<20))continue;locations.push({x,z});
   addHouse(x,z,w,depth,rot,y,Math.min(4,Math.floor(rand()*5)),rand()>.8);
  }
  // Small planted courtyards break up the empty gaps between buildings. Keep the
  // individual clusters clear of walls and use the measured ground at each yard.
  for(let i=0;i<locations.length;i+=4){
   const p=locations[i],x=p.x+13,z=p.z+12;
   if(this.shoreDistance(x,z)<50||locations.some(h=>Math.hypot(h.x-x,h.z-z)<14))continue;
   const y=this.getHeight(x,z);
   yardPalms.push({x,z,y,s:.8+rand()*.38,r:rand()*6.28});
   yardCisterns.push({x:x-4,z:z-3,y:this.getHeight(x-4,z-3)+.85,s:.7+rand()*.4,r:rand()*6.28});
  }
  const roofTex=canvas(128),c=roofTex.getContext('2d');c.fillStyle='#875040';c.fillRect(0,0,128,128);for(let i=0;i<128;i+=8){c.fillStyle=i%16?'#a46951':'#955d49';c.fillRect(i,0,3,128);c.fillStyle='#c3a08a';for(let j=0;j<128;j+=20)c.fillRect(i,j,7,1);}
  const tex=new THREE.CanvasTexture(roofTex);tex.encoding=THREE.sRGBEncoding;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(2,2);
  // ACES and the Pacific sun wash pale walls almost white; muted pigments keep
  // the doors, different roof types and shadows legible from low flying height.
  const wallColors=[0x817b69,0x514b3f,0x8a806b,0x706b60,0x7a705e];
  const wallMaps=[false,true,false,false,true].map(timber=>{
    const image=canvas(256),ctx=image.getContext('2d');ctx.fillStyle=timber?'#a49a87':'#d1c9ad';ctx.fillRect(0,0,256,256);
    for(let y=0;y<256;y+=timber?9:22)for(let x=0;x<256;x+=timber?256:39){
      ctx.fillStyle=timber?'#766e60':'#a69f8b';ctx.fillRect(x,y,timber?256:38,1);
      if(!timber)ctx.fillRect(x+(y%44?18:0),y,1,22);
    }
    for(let i=0;i<900;i++){const x=Math.floor(hash(i,27)*256),y=Math.floor(hash(i,63)*256);ctx.fillStyle='rgba(54,43,29,.09)';ctx.fillRect(x,y,1+(i%4),1+(i%7));}
    const map=new THREE.CanvasTexture(image);map.encoding=THREE.sRGBEncoding;return map;
  });
  const roofMaterials=[new THREE.MeshStandardMaterial({map:tex,color:0xb5aaa0,roughness:1,side:THREE.DoubleSide}),
    new THREE.MeshStandardMaterial({color:0x403b34,roughness:1,side:THREE.DoubleSide}),
    new THREE.MeshStandardMaterial({color:0x655b42,roughness:1,side:THREE.DoubleSide}),
    new THREE.MeshStandardMaterial({color:0x43443f,roughness:1,side:THREE.DoubleSide}),
    new THREE.MeshStandardMaterial({color:0x48332e,roughness:1,side:THREE.DoubleSide})];
  for(let i=0;i<5;i++){
    this.batch(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:wallColors[i],map:wallMaps[i],roughness:1}),walls[i],['Coral homes','Timber workshops','Storehouses','Plastered dwellings','Rural halls'][i]);
    this.batch(i===0||i===3?roofGeometry():gableRoofGeometry(),roofMaterials[i],roofs[i],['Red tile roofs','Dark gables','Thatch gables','Grey hip roofs','Oxide roofs'][i]);
  }
  this.batch(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x302b23,roughness:1}),dark,'Shaded verandas');
  const detail=new THREE.BoxGeometry(1,1,1);
  this.batch(detail,new THREE.MeshStandardMaterial({color:0x4d3a2d,roughness:1}),doors,'Wooden doors');
  this.batch(detail,new THREE.MeshStandardMaterial({color:0x292d2b,roughness:.55}),windows,'Recessed windows');
  this.batch(detail,new THREE.MeshStandardMaterial({color:0x704838,roughness:1}),shutters,'Window shutters');
  this.batch(detail,new THREE.MeshStandardMaterial({color:0x5a4b39,roughness:1}),posts,'Porch supports');
  this.batch(detail,new THREE.MeshStandardMaterial({color:0x454037,roughness:1}),foundations,'Raised foundations');
  this.batch(detail,new THREE.MeshStandardMaterial({color:0x44372e,roughness:1}),tracks,'Dirt approaches');
  this.yardPalms=yardPalms;
  this.batch(new THREE.CylinderGeometry(.12,.24,9,7).translate(0,4.5,0),new THREE.MeshStandardMaterial({color:0x51422f,roughness:1}),yardPalms,'Village palm trunks');
  this.batch(frondGeometry(),new THREE.MeshStandardMaterial({color:0x172913,roughness:1,side:THREE.DoubleSide}),yardPalms,'Village palm fronds');
  this.batch(new THREE.CylinderGeometry(1,1,1.8,9).translate(0,.9,0),new THREE.MeshStandardMaterial({color:0x4b382a,roughness:1}),yardCisterns,'Village water jars');
  this.batch(detail,new THREE.MeshStandardMaterial({color:0x8e8c77,roughness:1}),gardenWalls,'Coral garden walls');this.houses=walls.reduce((n,a)=>n+a.length,0);
 }
 // Shared close-range architecture adds depth without hundreds of detailed houses
 // drawing at once. The instanced silhouettes remain for distant villages.
 buildVillageDetails(){
  const wood=new THREE.MeshStandardMaterial({color:0x473526,roughness:1}),stone=new THREE.MeshStandardMaterial({color:0x77715b,roughness:1}),tile=new THREE.MeshStandardMaterial({color:0x74412e,roughness:1});
  for(let style=0;style<5;style++){
   const groups=[[],[],[],[]],add=(bucket,x,y,z,w,h,d)=>groups[bucket].push(new THREE.BoxGeometry(w,h,d).translate(x,y,z));
   // Narrow frames, lintels and sills wrap all four walls, including rear and sides.
   for(const side of [-1,1]){
    for(const x of [-3.1,0,3.1]){
     add(3,x,1.66,side*4.105,1.25,.78,.09);
     add(0,x,2.1,side*4.12,1.45,.12,.18);add(0,x,1.22,side*4.12,1.45,.12,.18);
     for(const dx of [-.69,0,.69])add(0,x+dx,1.66,side*4.12,.08,.85,.20);
    }
    for(const z of [-2,2]){
     add(3,side*5.105,1.66,z,.09,.78,1.25);
     add(0,side*5.12,2.1,z,.18,.12,1.4);add(0,side*5.12,1.22,z,.18,.12,1.4);
     for(const dz of [-.65,0,.65])add(0,side*5.12,1.66,z+dz,.20,.85,.08);
    }
    add(0,side*4.95,1.7,4.08,.18,3.4,.18);add(0,side*4.95,1.7,-4.08,.18,3.4,.18);
   }
   add(0,0,3.36,0,10.2,.16,8.2);
   const roofH=(style===2||style===3?10*.42:10*.72)*.32;
   add(2,0,3.4+roofH,0,style===0||style===3?5.7:12,.20,.28);
   for(let x=-5.5;x<6;x+=.55)add(0,x,3.25,4.3,.10,.13,1.0);
   if(style===0||style===3){
    add(0,0,2.85,4.75,8.5,.18,1.8);add(0,0,.32,4.75,8.5,.15,1.8);
    for(const x of [-4,-1.4,1.4,4])add(0,x,1.55,5.4,.16,2.5,.16);
    add(1,0,.18,5.65,2.4,.36,1.0);add(1,0,.08,6.1,2.8,.16,.65);
   }else{add(1,0,.18,4.45,2.0,.36,.7);}
   const template=new THREE.Group();template.name='Village facade '+style;
   for(let i=0;i<groups.length;i++){
    const mesh=new THREE.Mesh(merge(groups[i]),[wood,stone,tile,new THREE.MeshStandardMaterial({color:0x252a23,roughness:.7})][i]);groups[i].forEach(g=>g.dispose());mesh.receiveShadow=true;template.add(mesh);
   }
   this.detailTemplates.push(template);
  }
  for(let i=0;i<12;i++){const slot=new THREE.Group();slot.name='Near village detail';slot.visible=false;slot.userData.site=null;this.root.add(slot);this.nearBuildings.push(slot);}
  this.objectCount+=48;
  // Cropped strips and low coral walls delineate farm plots on measured flat land.
  const borders=[],rows=[];
  for(let x=-7400;x<7400&&borders.length<110;x+=180)for(let z=-7400;z<7400&&borders.length<110;z+=180){
   if(this.biome(x,z)[1]<.7||this.shoreDistance(x,z)<180||this.nearHouse(x,z))continue;
   const y=this.getHeight(x,z);if(Math.abs(this.getHeight(x+45,z)-y)>2||Math.abs(this.getHeight(x,z+45)-y)>2)continue;
   for(let k=-3;k<=3;k++){const zz=z+k*6;borders.push({x,z:zz,y:this.getHeight(x,zz)+.4,sx:.7,sy:.8,sz:6.1});
    for(let j=0;j<3;j++){const xx=x+6+j*8;rows.push({x:xx,z:zz,y:this.getHeight(xx,zz)+.09,sx:.45,sy:.14,sz:6.1});}}
  }
  this.batch(new THREE.BoxGeometry(1,1,1),stone,borders,'Coral field boundaries');
  this.batch(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x3c4928,roughness:1}),rows,'Cultivated field rows');
 }
 updateVillageDetails(x,z){
  const closest=this.houseSites.filter(p=>Math.hypot(p.x-x,p.z-z)<1100).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z)).slice(0,12);
  const wanted=new Set(closest),assigned=new Set();
  for(const slot of this.nearBuildings){
   slot.visible=wanted.has(slot.userData.site);
   if(slot.visible)assigned.add(slot.userData.site);
  }
  for(const site of closest){
   if(assigned.has(site))continue;
   const slot=this.nearBuildings.find(o=>!o.visible);
   while(slot.children.length)slot.remove(slot.children[0]);
   slot.add(this.detailTemplates[site.style].clone(true));slot.userData.site=site;slot.visible=true;
   slot.position.set(site.x,site.y,site.z);slot.rotation.y=site.rot;slot.scale.set(site.w/10,site.h/3.4,site.depth/8);
  }
 }
 async loadFortifications(){
  if(typeof FortificationAssets==='undefined')return;
  const kinds=['bunker','observation-post'];
  await Promise.all(kinds.map(kind=>FortificationAssets.load(kind).catch(e=>console.warn('Optional coastal fortification:',kind,e.message))));
  const anchors=[[-4700,-5800,'observation-post'],[-4100,-3200,'bunker'],[-3500,-800,'observation-post'],[-3600,1800,'bunker']];
  for(const [ax,az,kind] of anchors){
   const template=FortificationAssets.get(kind);if(!template)continue;
   const dimensions=template.userData.fortification,candidates=[];
   for(let x=-7000;x<7000;x+=120)for(let z=-7000;z<7000;z+=120){
    if(Math.hypot(x-ax,z-az)>1600||this.nearHouse(x,z)||this.biome(x,z)[2]>.2)continue;
    // Keep the mission's aircraft dispersal and AA footprint clear as well.
    if(x>-3250&&x<-2550&&z>-1250&&z<-750)continue;
    const coast=this.shoreDistance(x,z);if(coast<85||coast>600)continue;
    const points=[[-7,-7],[7,-7],[-7,7],[7,7],[0,0]],heights=points.map(([dx,dz])=>this.getHeight(x+dx,z+dz));
    if(Math.max(...heights)-Math.min(...heights)>1.1||points.some(([dx,dz])=>this.shoreDistance(x+dx,z+dz)<40))continue;
    candidates.push({x,z,y:Math.max(...heights)+.03});
   }
   candidates.sort((a,b)=>Math.hypot(a.x-ax,a.z-az)-Math.hypot(b.x-ax,b.z-az));
   const p=candidates[0];if(!p){console.warn('No dry coastal fortification site:',kind);continue;}
   const group=new THREE.Group(),model=template.clone(true),proxy=FortificationAssets.proxy(template);group.add(model,proxy);group.position.set(p.x,p.y,p.z);group.rotation.y=Math.PI/2;this.root.add(group);
   model.visible=false;group.name=template.name;this.fortifications.push({...p,w:dimensions.depth,d:dimensions.width,kind,group,model,proxy});this.objectCount++;
  }
 }
 updateFortifications(x,z){
  const rank=kind=>this.fortifications.filter(e=>e.kind===kind).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z));
  const near=[...rank('bunker').slice(0,1),...rank('observation-post').slice(0,2)];
  for(const e of this.fortifications){const range=Math.hypot(e.x-x,e.z-z);e.group.visible=range<6500;e.model.visible=range<1050&&near.includes(e);e.proxy.visible=!e.model.visible;}
 }
 buildWater(){
  const material=new THREE.ShaderMaterial({uniforms:{uTime:this.time,uWarm:this.warm,uCoast:{value:this.coastTexture},uSun:{value:this.sun}},vertexShader:`varying vec3 vWorld;varying vec3 vLocal;void main(){vLocal=position;vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
   fragmentShader:`precision highp float;varying vec3 vWorld;varying vec3 vLocal;uniform float uTime;uniform float uWarm;uniform sampler2D uCoast;uniform vec3 uSun;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
   void main(){vec2 p=vLocal.xz,uv=(p+8000.)/16000.;vec4 c=texture2D(uCoast,clamp(uv,0.,1.));float d=c.r*255.*256.+c.g*255.-32768.;if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))d=-5000.;
   float sea=max(0.,-d),swell=noise(p*.008)+noise(p*.023)*.4;float depth=smoothstep(80.,850.,sea+swell*95.);
   vec3 shallow=mix(vec3(.13,.42,.36),vec3(.21,.55,.48),swell*.6);vec3 col=mix(shallow,vec3(.026,.16,.23),depth);
   float w1=dot(p,vec2(.10,.061))-uTime*1.15,w2=dot(p,vec2(-.19,.13))+uTime*1.8,w3=dot(p,vec2(.43,.32))-uTime*2.7;
   vec3 n=normalize(vec3(cos(w1)*.07+cos(w2)*.05,1.,sin(w1)*.10+sin(w3)*.035));vec3 eye=normalize(cameraPosition-vWorld);float fres=pow(1.-max(0.,dot(n,eye)),4.);
   vec3 sky=mix(vec3(.57,.73,.77),vec3(.83,.75,.58),uWarm*.65);col=mix(col,sky,fres*.64);
   float shine=pow(max(0.,dot(reflect(-uSun,n),eye)),180.);col+=vec3(1.,.91,.72)*shine*.65;
   float edge=(1.-smoothstep(8.,46.,sea))*smoothstep(0.,4.,sea);float surge=pow(.5+.5*sin(sea*.26-uTime*1.7+noise(p*.026)*3.),6.);
   float reef=exp(-pow((sea-170.-noise(p*.0018)*105.)/25.,2.))*.33;float foam=(edge*surge+reef*pow(.5+.5*sin(w2*.32),5.))*clamp(swell,0.,1.);
   col=mix(col,vec3(.78,.84,.76),foam);float fog=1.-exp(-length(cameraPosition-vWorld)*.000062);col=mix(col,sky,fog*.65);gl_FragColor=vec4(col,1.);
   #include <tonemapping_fragment>
   #include <encodings_fragment>
   }`});
  const geo=new THREE.PlaneGeometry(100000,100000);geo.rotateX(-Math.PI/2);const sea=new THREE.Mesh(geo,material);sea.position.y=.10;sea.name='Animated coastal water';this.root.add(sea);this.water=sea;
 }
 buildSky(){
  const mat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{uSun:{value:this.sun},uWarm:this.warm,uTime:this.time},vertexShader:`varying vec3 vDirection;void main(){vDirection=position;vec4 p=projectionMatrix*mat4(mat3(viewMatrix))*vec4(position,1.);gl_Position=p.xyww;}`,
   fragmentShader:`varying vec3 vDirection;uniform vec3 uSun;uniform float uWarm;uniform float uTime;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}void main(){vec3 d=normalize(vDirection);float y=max(0.,d.y);vec3 horizon=mix(vec3(.66,.79,.80),vec3(.87,.77,.60),uWarm*.65);vec3 zenith=mix(vec3(.16,.40,.61),vec3(.24,.40,.52),uWarm);vec3 col=mix(horizon,zenith,pow(y,.48));float s=max(0.,dot(d,uSun));col+=vec3(1.,.84,.57)*pow(s,320.)*.25;vec2 p=d.xz/max(.09,y)*2.5+uTime*.0004;float cl=n(p)*.56+n(p*2.04)*.28+n(p*4.15)*.14;float mask=smoothstep(.52,.69,cl)*smoothstep(.02,.18,y)*(1.-smoothstep(.65,.92,y));col=mix(col,vec3(.91,.91,.86),mask*.67);gl_FragColor=vec4(col,1.);
   #include <tonemapping_fragment>
   #include <encodings_fragment>
   }`});
  this.sky=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),mat);this.sky.frustumCulled=false;this.sky.renderOrder=-10;this.root.add(this.sky);
 }
 update(dt,x=0,z=0){this.time.value+=Math.min(dt,.1);this.detailTimer=(this.detailTimer||0)-dt;if(this.detailTimer<=0){this.detailTimer=.35;this.updateVillageDetails(x,z);this.updateFortifications(x,z);}}
 setLight(warm){this.warm.value=warm?1:0;}
 dispose(){for(const e of this.fortifications){e.group.remove(e.model);}
  const gs=new Set(),ms=new Set(),ts=new Set();[this.root,...this.detailTemplates].forEach(root=>root.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material){for(const m of [].concat(o.material)){ms.add(m);if(m.map)ts.add(m.map);}}}));gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.add(this.coastTexture);ts.forEach(t=>t.dispose());if(this.root.parent)this.root.parent.remove(this.root);}
}
scope.OkinawaWorld=OkinawaWorld;
})(typeof window!=='undefined'?window:globalThis);
