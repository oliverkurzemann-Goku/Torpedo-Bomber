#!/usr/bin/env node
// THREE_R128=/absolute/path/to/three.min.js node terrain-system/tests/remagen-real-geometry.js
// Uses the actual r128 matrices, geometry, raycaster and shipped DEM/OSM data.
// This is a geometry test, NOT a WebGL/Safari rendering or FPS test.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');
global.THREE=require(process.env.THREE_R128 || 'three');
assert.equal(THREE.REVISION,'128');
for(const file of ['HeightProvider','TerrainTile','TerrainManager','OSMManager'])
 vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system',file+'.js'),'utf8')+`\nglobalThis.${file==='HeightProvider'?'DEMHeightProvider':file}=${file==='HeightProvider'?'DEMHeightProvider':file};`,{filename:file+'.js'});
global.fetch=async url=>{
 const bytes=fs.readFileSync(path.join(root,url.split('?')[0]));
 return {ok:true,json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
};
const binDir='terrain-system/real/data/dem/',osmDir='terrain-system/real/data/osm/';
const coords=fs.readdirSync(path.join(root,osmDir)).filter(f=>/^\d+_\d+\.json$/.test(f)).map(f=>f.slice(0,-5).split('_').map(Number));
const scene=new THREE.Scene(),dem=new DEMHeightProvider(4000,binDir);
// No DOM substitute masquerading as WebGL: skip only the canvas material creation.
const terrain=Object.create(TerrainManager.prototype);
Object.assign(terrain,{scene,tileSize:4000,heightProvider:dem,tiles:new Map(),material:new THREE.MeshStandardMaterial()});
const osm=new OSMManager(scene,4000,terrain,osmDir);
const matrix=new THREE.Matrix4();
const buckets=new Map(),cellSize=128;
function addTriangle(t){
 const xs=t.map(p=>p[0]),zs=t.map(p=>p[1]);
 for(let x=Math.floor(Math.min(...xs)/cellSize);x<=Math.floor(Math.max(...xs)/cellSize);x++)
 for(let z=Math.floor(Math.min(...zs)/cellSize);z<=Math.floor(Math.max(...zs)/cellSize);z++){
  const key=x+','+z;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(t);
 }
}
function nearby(points,pad=0){
 const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),found=new Set();
 for(let x=Math.floor((Math.min(...xs)-pad)/cellSize);x<=Math.floor((Math.max(...xs)+pad)/cellSize);x++)
 for(let z=Math.floor((Math.min(...zs)-pad)/cellSize);z<=Math.floor((Math.max(...zs)+pad)/cellSize);z++)
 for(const t of buckets.get(x+','+z)||[])found.add(t);
 return found;
}
// Independent barycentric/parametric intersection oracle; never calls the
// production polygon, segment or water-exclusion helpers.
function inside(p,t){
 const [a,b,c]=t,v0=[c[0]-a[0],c[1]-a[1]],v1=[b[0]-a[0],b[1]-a[1]],v2=[p[0]-a[0],p[1]-a[1]];
 const det=v0[0]*v1[1]-v1[0]*v0[1]; if(Math.abs(det)<1e-8)return false;
 const u=(v2[0]*v1[1]-v1[0]*v2[1])/det,v=(v0[0]*v2[1]-v2[0]*v0[1])/det;
 return u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7;
}
function segmentBox(a,b){
 let lo=0,hi=1;
 for(let k=0;k<2;k++){
  const d=b[k]-a[k];
  if(Math.abs(d)<1e-12){if(Math.abs(a[k])>.5)return false;continue;}
  const u=(-.5-a[k])/d,v=(.5-a[k])/d;
  lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));if(lo>hi)return false;
 }
 return true;
}
function circleTriangle(p,r,t){
 if(inside(p,t))return true;
 for(let i=0;i<3;i++){
  const a=t[i],b=t[(i+1)%3],dx=b[0]-a[0],dz=b[1]-a[1],len=dx*dx+dz*dz;
  const u=len?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/len)):0;
  if(Math.hypot(p[0]-a[0]-u*dx,p[1]-a[1]-u*dz)<r)return true;
 }return false;
}
function validateBuffers(mesh){
 const g=mesh.geometry,n=g.attributes.position.count;
 if(g.index)assert(Math.max(...g.index.array.subarray(0,100000))<n);
 for(const attr of Object.values(g.attributes))assert.equal(attr.count,n,mesh.name+' mismatched attribute');
 for(const attr of Object.values(g.attributes))assert(Array.from(attr.array).every(Number.isFinite));
}
(async()=>{
 await Promise.all(coords.map(([x,z])=>dem.loadTile(x,z)));
 for(const [x,z]of coords)terrain.ensureTile(x,z,0);
 await osm.prepareRegion(coords,'terrain-system/real/data/waterways.json');
 const start=performance.now();
 for(const [x,z]of coords)await osm.loadTile(x,z);
 let triangles=0,waterSamples=0,maxDrapeError=0,buildings=0,acceptedBuildings=0,trees=0,churches=0,forestBuckets=0,buildingBuckets=0;
 // Index real water vertices emitted for rendering, not the source mask.
 for(const tile of osm.tiles.values())for(const mesh of tile.group.children){
  if(mesh.material!==osm.riverMat&&mesh.material!==osm.lakeMat)continue;
  validateBuffers(mesh);
  const p=mesh.geometry.attributes.position,ix=mesh.geometry.index?.array;
  for(let i=0;i<(ix?ix.length:p.count);i+=3){
   const v=[0,1,2].map(k=>{const j=ix?ix[i+k]:i+k;return [p.getX(j),p.getZ(j),p.getY(j)];});
   addTriangle(v.map(p=>p.slice(0,2)));triangles++;
   const x=v.reduce((s,p)=>s+p[0],0)/3,z=v.reduce((s,p)=>s+p[1],0)/3;
   // Interior triangles: no clamping or neighboring LOD ambiguity.
   if(x>1&&x<27999&&z>1&&z<31999){
    const y=v.reduce((s,p)=>s+p[2],0)/3;
    const err=Math.abs(y-terrain.getRenderedHeight(x,z)-mesh.userData.waterSource.offset);
    maxDrapeError=Math.max(maxDrapeError,err);waterSamples++;
   }
  }
 }
 assert(maxDrapeError<0.01,`water surface is not draped: ${maxDrapeError}m`);
 for(const tile of osm.tiles.values()){
  acceptedBuildings+=tile.buildingCount;
  const forests=tile.farGroup.children.filter(m=>m.name.startsWith('osmForest'));
  const roofs=tile.farGroup.children.filter(m=>m.name.startsWith('osmBuildingRoofs'));
  forestBuckets=Math.max(forestBuckets,forests.length);
  buildingBuckets=Math.max(buildingBuckets,tile.farGroup.children.length-forests.length);
  for(const mesh of tile.farGroup.children.filter(m=>m.name==='osmChurchSpires'))churches+=mesh.count;
  for(const mesh of roofs){
   validateBuffers(mesh);
   for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,matrix);assert(matrix.elements.every(Number.isFinite));
    const corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,z])=>new THREE.Vector3(x,0,z).applyMatrix4(matrix)).map(v=>[v.x,v.z]);
    const inverse=matrix.clone().invert();
    for(const tri of nearby(corners)){
     const local=tri.map(([x,z])=>new THREE.Vector3(x,0,z).applyMatrix4(inverse)).map(v=>[v.x,v.z]);
     const overlap=local.some((p,j)=>segmentBox(p,local[(j+1)%3]))||[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].some(p=>inside(p,local));
     assert(!overlap,`rendered roof intersects water at ${matrix.elements[12]},${matrix.elements[14]}`);
    } buildings++;
   }
  }
  for(const mesh of forests){
   if(mesh.name==='osmForestTrunks'||mesh.name==='osmForestFloor')continue;
   for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,matrix);const p=[matrix.elements[12],matrix.elements[14]];
    // BUILD 16's broader deciduous crown remains below a 6.8m envelope.
    for(const tri of nearby([p],6.8))assert(!circleTriangle(p,6.8,tri),`canopy intersects water at ${p}`);
    trees++;
   }
  }
 }
 assert(forestBuckets<=5);assert(buildingBuckets<=10);assert(churches>=8&&churches<=14);
 assert(buildings>acceptedBuildings,'building shape variants did not add any roof wings');
 // The point-height query must agree with actual r128 ray/triangle hits during
 // an LOD morph, too. Bilinear interpolation fails this on non-planar quads.
 const target=terrain.tiles.get('3,3');
 target.setLOD(2,terrain.material);target.updateMorph(.2);
 target.mesh.updateMatrixWorld(true);
 const ray=new THREE.Raycaster();
 for(let i=0;i<30;i++){
  const x=12050+i*117,z=12100+i*113;
  ray.set(new THREE.Vector3(x,3000,z),new THREE.Vector3(0,-1,0));
  const hit=ray.intersectObject(target.mesh)[0];assert(hit);
  assert(Math.abs(hit.point.y-terrain.getRenderedHeight(x,z))<.002,'rendered height mismatch');
 }
 target.updateMorph(1);
 for(const mesh of osm.tiles.get('3,3').group.children)if(mesh.userData.waterSource){
  osm.redrapeWater(mesh);validateBuffers(mesh);
  const p=mesh.geometry.attributes.position;
  for(let i=0;i<p.count;i+=3){
   const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
   if(x<=12000||x>=16000||z<=12000||z>=16000)continue;
   const y=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3;
   assert(Math.abs(y-terrain.getRenderedHeight(x,z)-mesh.userData.waterSource.offset)<.01,`coarse LOD drape failed at ${x},${z}: ${y-terrain.getRenderedHeight(x,z)-mesh.userData.waterSource.offset}; vertices ${[0,1,2].map(k=>[p.getX(i+k),p.getY(i+k),p.getZ(i+k)])}`);
  }
 }
 // A narrow diagonal stream crossing between Build 9's nine probes.
 const seamData=[{tx:0,tz:0,data:{}},{tx:1,tz:0,data:{lakes:[[[0,60],[100,60],[100,65],[0,65]]]}}];
 const cross=new OSMManager(scene,4000,terrain,'');cross.waterIndex=makeOSMWaterIndex(seamData,4000);
 const idx=cross._buildForestExclusion({},0,0);
 assert(cross._buildingTouchesWater({w:100,d:100,rotY:.61},3999,100,idx),'neighbor water/rotated roof missed');
 assert(!cross._buildingTouchesWater({w:10,d:10,rotY:.61},3900,100,idx),'dry building rejected');
 console.log(JSON.stringify({tiles:coords.length,acceptedBuildings,roofParts:buildings,trees,churches,waterTriangles:triangles,waterSamples,maxDrapeError,forestBuckets,buildingBuckets,elapsedSeconds:+((performance.now()-start)/1000).toFixed(2),browserTest:false},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
