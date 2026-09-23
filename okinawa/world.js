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
  this.tiles=new Map();this.size=16000;this.half=8000;this.mapSize=1024;this.objectCount=0;this.vegetationDensity=options.vegetationDensity===undefined?1:clamp(options.vegetationDensity,.1,1);this.time={value:0};this.warm={value:0};this.sun=new THREE.Vector3(-.48,.72,.46).normalize();this.materials=[];this.decorations=[];
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
  this.coastTexture=new THREE.DataTexture(sdf,n,n,THREE.RGBAFormat);this.coastTexture.minFilter=this.coastTexture.magFilter=THREE.LinearFilter;this.coastTexture.needsUpdate=true;
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
  onProgress(.58,'Growing the coastal landscape…');await pause();this.buildVegetation();this.buildSettlements();
  onProgress(.8,'Lighting the sea…');await pause();this.buildWater();this.buildSky();onProgress(1,'Ready');return this;
 }
 batch(geo,mat,placements,name){if(!placements.length)return;const m=new THREE.InstancedMesh(geo,mat,placements.length),dummy=new THREE.Object3D();m.name=name;for(let i=0;i<placements.length;i++){const p=placements[i];dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.r||0,0);dummy.scale.set(p.sx||p.s||1,p.sy||p.s||1,p.sz||p.s||1);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);}m.instanceMatrix.needsUpdate=true;m.frustumCulled=false;m.castShadow=false;m.receiveShadow=true;this.root.add(m);this.objectCount+=placements.length;this.decorations.push(m);return m;}
 buildVegetation(){
  const rand=rng(680422),buckets=[[],[],[]],trunks=[],palms=[],rocks=[];
  for(let i=0;i<Math.round(68000*this.vegetationDensity);i++){
   const x=rand()*15400-7700,z=rand()*15400-7700,d=this.shoreDistance(x,z);if(d<20)continue;
   const h=this.getHeight(x,z),[forest,field,air]=this.biome(x,z),patch=noise(x*.0028,z*.0028);
   if(air>.2||field>.2)continue;
   const density=forest>.3?.86:(h>90?.68:(patch>.48?.42:.08));if(rand()>density)continue;
   const slope=Math.hypot(this.getHeight(x+15,z)-h,this.getHeight(x,z+15)-h)/15;if(slope>.9)continue;
   const s=5.2+rand()*7.6,p={x,z,y:h-.4,s,r:rand()*Math.PI*2};buckets[i%3].push(p);trunks.push({...p,sx:s*.15,sy:s*.8,sz:s*.15});
   if(d<160&&d>35&&rand()<.08)palms.push({x:x+4,z:z+3,y:this.getHeight(x+4,z+3)-.2,s:.9+rand()*.45,r:rand()*6.28});
  }
  for(let v=0;v<3;v++){
   const gs=[];for(let j=0;j<4;j++){const g=new THREE.SphereGeometry(.42,7,5);g.scale(1,.7+(j%2)*.2,.9);g.translate(Math.cos(j*2.4)*.24,.63+(j%2)*.20,Math.sin(j*2.4)*.24);gs.push(g);}
   const geo=merge(gs),mat=new THREE.MeshStandardMaterial({color:[0x344c25,0x425b2c,0x4f6531][v],roughness:1});this.materials.push(mat);this.batch(geo,mat,buckets[v],'Broadleaf canopy '+v);
  }
  this.batch(new THREE.CylinderGeometry(.15,.24,1,5).translate(0,.5,0),new THREE.MeshStandardMaterial({color:0x615444,roughness:1}),trunks,'Tree trunks');
  this.batch(new THREE.CylinderGeometry(.12,.24,9,7).translate(0,4.5,0),new THREE.MeshStandardMaterial({color:0x7e7359,roughness:1}),palms,'Palm trunks');
  this.batch(frondGeometry(),new THREE.MeshStandardMaterial({color:0x425c2d,roughness:1,side:THREE.DoubleSide}),palms,'Palm fronds');
  for(let i=0;i<Math.round(18000*this.vegetationDensity);i++){const x=rand()*15500-7750,z=rand()*15500-7750,d=this.shoreDistance(x,z);if(d>3&&d<42&&rand()>.35)rocks.push({x,z,y:this.getHeight(x,z)-1,sx:2+rand()*5,sy:1+rand()*2,sz:2+rand()*4,r:rand()*6.28});}
  this.batch(new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0x898879,roughness:1}),rocks,'Coastal limestone');
 }
 buildSettlements(){
  // Illustrative rural hamlets, intentionally sparse. These are not today's Overture buildings.
  const rand=rng(9831),walls=[],roofs=[],dark=[],gardenWalls=[],locations=[];
  for(const c of [[-4200,-3300],[-3100,-1500],[-2500,-2800],[-2200,600]]){
   for(let i=0;i<28;i++){
    const angle=rand()*6.28,r=40+Math.sqrt(rand())*330,x=c[0]+Math.cos(angle)*r,z=c[1]+Math.sin(angle)*r;
    const y=this.getHeight(x,z),d=this.shoreDistance(x,z);if(d<100||this.biome(x,z)[0]>.3)continue;
    const w=8+rand()*6,depth=7+rand()*4,rot=(rand()-.5)*.9;
    if(Math.max(Math.abs(this.getHeight(x+w,z)-y),Math.abs(this.getHeight(x,z+depth)-y))>1.4)continue;
    if(locations.some(p=>Math.hypot(p.x-x,p.z-z)<30))continue;locations.push({x,z});
    walls.push({x,z,y:y+1.7,sx:w,sy:3.4,sz:depth,r:rot});roofs.push({x,z,y:y+3.3,sx:w,sy:w*.75,sz:depth,r:rot});
    dark.push({x:x+Math.sin(rot)*(depth*.5+.03),z:z+Math.cos(rot)*(depth*.5+.03),y:y+1.7,sx:w*.67,sy:1.5,sz:.1,r:rot});
    for(let side=-1;side<=1;side+=2){const gx=x+side*(w*.7+3),gz=z;gardenWalls.push({x:gx,z:gz,y:this.getHeight(gx,gz)+.55,sx:.65,sy:1.1,sz:depth+10,r:0});}
   }
  }
  const roofTex=canvas(128),c=roofTex.getContext('2d');c.fillStyle='#875040';c.fillRect(0,0,128,128);for(let i=0;i<128;i+=8){c.fillStyle=i%16?'#a46951':'#955d49';c.fillRect(i,0,3,128);c.fillStyle='#c3a08a';for(let j=0;j<128;j+=20)c.fillRect(i,j,7,1);}
  const tex=new THREE.CanvasTexture(roofTex);tex.encoding=THREE.sRGBEncoding;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(2,2);
  this.batch(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xa99e83,roughness:1}),walls,'Village walls');
  this.batch(roofGeometry(),new THREE.MeshStandardMaterial({map:tex,color:0xffffff,roughness:1,side:THREE.DoubleSide}),roofs,'Red tile hip roofs');
  this.batch(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x302b23,roughness:1}),dark,'Shaded verandas');
  this.batch(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x8e8c77,roughness:1}),gardenWalls,'Coral garden walls');this.houses=walls.length;
 }
 buildWater(){
  const material=new THREE.ShaderMaterial({uniforms:{uTime:this.time,uWarm:this.warm,uCoast:{value:this.coastTexture},uSun:{value:this.sun}},vertexShader:`varying vec3 vWorld;varying vec3 vLocal;void main(){vLocal=position;vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
   fragmentShader:`precision highp float;varying vec3 vWorld;varying vec3 vLocal;uniform float uTime;uniform float uWarm;uniform sampler2D uCoast;uniform vec3 uSun;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
   void main(){vec2 p=vLocal.xz,uv=(p+8000.)/16000.;vec4 c=texture2D(uCoast,clamp(uv,0.,1.));float d=c.r*255.*256.+c.g*255.-32768.;if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))d=-5000.;
   float sea=max(0.,-d),patch=noise(p*.008)+noise(p*.023)*.4;float depth=smoothstep(80.,850.,sea+patch*95.);
   vec3 shallow=mix(vec3(.13,.42,.36),vec3(.21,.55,.48),patch*.6);vec3 col=mix(shallow,vec3(.026,.16,.23),depth);
   float w1=dot(p,vec2(.10,.061))-uTime*1.15,w2=dot(p,vec2(-.19,.13))+uTime*1.8,w3=dot(p,vec2(.43,.32))-uTime*2.7;
   vec3 n=normalize(vec3(cos(w1)*.07+cos(w2)*.05,1.,sin(w1)*.10+sin(w3)*.035));vec3 eye=normalize(cameraPosition-vWorld);float fres=pow(1.-max(0.,dot(n,eye)),4.);
   vec3 sky=mix(vec3(.57,.73,.77),vec3(.83,.75,.58),uWarm*.65);col=mix(col,sky,fres*.64);
   float shine=pow(max(0.,dot(reflect(-uSun,n),eye)),180.);col+=vec3(1.,.91,.72)*shine*.65;
   float edge=(1.-smoothstep(8.,46.,sea))*smoothstep(0.,4.,sea);float surge=pow(.5+.5*sin(sea*.26-uTime*1.7+noise(p*.026)*3.),6.);
   float reef=exp(-pow((sea-170.-noise(p*.0018)*105.)/25.,2.))*.33;float foam=(edge*surge+reef*pow(.5+.5*sin(w2*.32),5.))*clamp(patch,0.,1.);
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
 update(dt){this.time.value+=Math.min(dt,.1);}
 setLight(warm){this.warm.value=warm?1:0;}
 dispose(){const gs=new Set(),ms=new Set(),ts=new Set();this.root.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material){for(const m of [].concat(o.material)){ms.add(m);if(m.map)ts.add(m.map);}}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.add(this.coastTexture);ts.forEach(t=>t.dispose());if(this.root.parent)this.root.parent.remove(this.root);}
}
scope.OkinawaWorld=OkinawaWorld;
})(typeof window!=='undefined'?window:globalThis);
