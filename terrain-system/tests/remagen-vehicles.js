#!/usr/bin/env node
// THREE_R128=... GLTF_LOADER_R128=... node terrain-system/tests/remagen-vehicles.js
// Actual GLTFLoader hierarchy/matrices, with an image event stub (no GPU test).
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');global.THREE=require(process.env.THREE_R128||'three');
assert.equal(THREE.REVISION,'128');global.window={URL};global.self=global;
global.document={createElementNS(){return {addEventListener(k,fn){this[k]=fn;},removeEventListener(){},set src(v){this.width=this.height=1024;queueMicrotask(()=>this.load());}};}};
vm.runInThisContext(fs.readFileSync(process.env.GLTF_LOADER_R128,'utf8'));
for(const name of ['HeightProvider','TerrainTile','TerrainManager','OSMManager','WorldVehicles'])
  vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system',name+'.js'),'utf8'));
global.fetch=async url=>{const b=fs.readFileSync(path.join(root,url.split('?')[0]));return {ok:true,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
THREE.GLTFLoader.prototype.load=function(file,yes,progress,no){
  const b=fs.readFileSync(path.join(root,file));this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',yes,no);
};
(async()=>{
  const coords=fs.readdirSync(path.join(root,'terrain-system/real/data/osm')).filter(f=>f.endsWith('.json')).map(f=>f.slice(0,-5).split('_').map(Number));
  const scene=new THREE.Scene(),dem=new DEMHeightProvider(4000,'terrain-system/real/data/dem/');
  await Promise.all(coords.map(([x,z])=>dem.loadTile(x,z)));
  const terrain=Object.create(TerrainManager.prototype);Object.assign(terrain,{scene,tileSize:4000,heightProvider:dem,tiles:new Map(),material:new THREE.MeshStandardMaterial()});
  for(const [x,z]of coords)terrain.ensureTile(x,z,0);
  const imageDocument=global.document;delete global.document;
  const osm=new OSMManager(scene,4000,terrain,'terrain-system/real/data/osm/');await osm.prepareRegion(coords,'terrain-system/real/data/waterways.json');
  // The field has its own existing tree clearing; the Tiger area does not.
  await osm.loadTile(3,3);
  global.document=imageDocument;
  const vehicles=new WorldVehicles(scene,terrain,osm);await vehicles.load();
  assert.deepEqual(vehicles.failures,[]);assert.equal(vehicles.entries.length,2);
  const stats=[];
  for(const e of vehicles.entries){
    e.model.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(e.model);let meshes=0,triangles=0;
    e.model.traverse(m=>{
      assert(!m.isSkinnedMesh,'detached crew rig included');
      if(!m.isMesh)return;meshes++;assert(m.matrixWorld.elements.every(Number.isFinite));
      const mats=Array.isArray(m.material)?m.material:[m.material];assert(mats.every(mat=>mat.isMeshLambertMaterial));
      triangles+=(m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count)/3;
    });
    assert(Math.abs(b.min.y-e.spot.y)<.001);assert(!osmWaterOverlaps(e.spot.points,3,osm.waterIndex));
    vehicles.update(e.spot.x,e.spot.z);assert(e.model.visible);
    vehicles.update(27000,30000);assert(!e.model.visible);
    if(e.spec.kind==='tiger')assert(!e.model.getObjectByName('PanzerTruppe_N1'));
    stats.push({kind:e.spec.kind,x:e.spot.x,z:e.spot.z,size:b.getSize(new THREE.Vector3()).toArray(),meshes,triangles});
  }
  console.log(JSON.stringify({vehicles:stats,browserTest:false},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
