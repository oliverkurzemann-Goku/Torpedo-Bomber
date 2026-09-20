#!/usr/bin/env node
// THREE_R128=... GLTF_LOADER_R128=... FBX_LOADER_R128=... FFLATE_R128=...
// SKELETON_UTILS_R128=... node terrain-system/tests/remagen-vehicles.js
// Actual GLTFLoader hierarchy/matrices, with an image event stub (no GPU test).
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');global.THREE=require(process.env.THREE_R128||'three');
assert.equal(THREE.REVISION,'128');global.window={URL};global.self=global;
global.document={createElementNS(){return {addEventListener(k,fn){this[k]=fn;},removeEventListener(){},set src(v){this.width=this.height=1024;queueMicrotask(()=>this.load());}};}};
vm.runInThisContext(fs.readFileSync(process.env.GLTF_LOADER_R128,'utf8'));
global.fflate=require(process.env.FFLATE_R128);
vm.runInThisContext(fs.readFileSync(process.env.FBX_LOADER_R128,'utf8'));
vm.runInThisContext(fs.readFileSync(process.env.SKELETON_UTILS_R128,'utf8'));
for(const name of ['HeightProvider','TerrainTile','TerrainManager','OSMManager','HistoricalObjectManager','WorldVehicles','LivingWorld'])
  vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system',name+'.js'),'utf8'));
global.fetch=async url=>{const b=fs.readFileSync(path.join(root,url.split('?')[0]));return {ok:true,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
THREE.GLTFLoader.prototype.load=function(file,yes,progress,no){
  const b=fs.readFileSync(path.join(root,file));this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',yes,no);
};
THREE.FBXLoader.prototype.load=function(file,yes,progress,no){
  try{const b=fs.readFileSync(path.join(root,file));yes(this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),path.dirname(file)+'/'));}catch(e){no(e);}
};
(async()=>{
  const fbxText=fs.readFileSync(path.join(root,'assets/remagen/ford1940/1940_ford_v8.fbx')).toString('latin1');
  const fordTextureNames=[...new Set(fbxText.match(/[A-Za-z0-9_]+\.png/g)||[])];
  assert(fordTextureNames.length>=14,'Ford FBX lost its external texture references');
  for(const file of fordTextureNames)assert(fs.existsSync(path.join(root,'assets/remagen/ford1940',file)),file+' missing');
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
  assert.equal(WorldVehicles.BUILD,21);assert.deepEqual(vehicles.failures,[]);assert.equal(vehicles.entries.length,2);
  assert.deepEqual([...vehicles.templates.keys()].sort(),['civilCar','flak88','horse','m16','merchant','tiger','train']);
  const merchant=vehicles.templates.get('merchant');merchant.updateMatrixWorld(true);
  const merchantSize=new THREE.Box3().setFromObject(merchant).getSize(new THREE.Vector3());
  assert(Math.abs(Math.max(merchantSize.x,merchantSize.z)-30)<.01);
  const living=new LivingWorld(scene,terrain,osm,{bridge:[13805.25,15769.95],bridgeSpan:[-101.5,-356.1],factory:[13200.6,20489.7],field:[787,18087.6]});
  assert.equal(living.installVehicleModels(vehicles.templates),27);
  const modelStats=e=>{let meshes=0,triangles=0;e.visual.traverse(m=>{if(!m.isMesh)return;meshes++;triangles+=(m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count)/3;});return {meshes,triangles};};
  assert.deepEqual(modelStats(living.entities.find(e=>e.kind==='truck')),{meshes:13,triangles:910});
  assert.deepEqual(modelStats(living.entities.find(e=>e.kind==='ferry')),{meshes:3,triangles:7646});
  const carStats=modelStats(living.entities.find(e=>e.kind==='civil'));
  const trainStats=modelStats(living.entities.find(e=>e.kind==='train'));
  const wagonStats=modelStats(living.entities.find(e=>e.kind==='wagon'));
  assert.equal(carStats.triangles,22608);assert(carStats.meshes<=23);
  assert.deepEqual(trainStats,{meshes:2,triangles:6940});
  assert(wagonStats.triangles>2182&&wagonStats.meshes<=12);
  assert(living.entities.filter(e=>e.kind==='wagon').every(e=>e.mixer));
  const dimensions=(kind)=>{const m=vehicles.templates.get(kind);m.updateMatrixWorld(true);return new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());};
  for(const [kind,length] of [['civilCar',4.75],['horse',2.5],['train',24.1]]){
    const size=dimensions(kind);assert(Math.abs(Math.max(size.x,size.z)-length)<.01,kind+' scale');
  }
  const historical=new HistoricalObjectManager(scene,4000,terrain,'terrain-system/real/data/historical/');
  await historical.loadTile(3,3);await historical.loadTile(3,4);
  const fallbackFlak=[];for(const g of historical.tiles.values())if(g)for(const o of g.userData.objects||[])if(o.userData.kind==='flak')fallbackFlak.push(o);
  fallbackFlak[0].position.y=-1.2; // asynchronous replacement must preserve an existing wreck
  assert.equal(HistoricalObjectManager.BUILD,21);assert.equal(historical.installFlakModel(vehicles.templates.get('flak88')),2);
  const flak=[];for(const g of historical.tiles.values())if(g)for(const o of g.userData.objects||[])if(o.userData.kind==='flak')flak.push(o);
  assert.equal(flak.length,2);assert(flak.every(o=>o.userData.sourceModel==='flak88'));
  assert.deepEqual(modelStats({visual:flak[0]}),{meshes:22,triangles:149028});
  let wreckMesh=null;flak[0].traverse(o=>{if(!wreckMesh&&o.isMesh)wreckMesh=o;});
  const wreckMat=Array.isArray(wreckMesh.material)?wreckMesh.material[0]:wreckMesh.material;
  const originalMat=Array.isArray(wreckMesh.userData.origMat)?wreckMesh.userData.origMat[0]:wreckMesh.userData.origMat;
  assert.notEqual(wreckMat,originalMat);assert(wreckMat.color.r+wreckMat.color.g+wreckMat.color.b<originalMat.color.r+originalMat.color.g+originalMat.color.b);
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
  console.log(JSON.stringify({vehicles:stats,traffic:{car:carStats,train:trainStats,horseAndWagon:wagonStats,
    dimensions:{car:dimensions('civilCar').toArray(),train:dimensions('train').toArray(),horse:dimensions('horse').toArray()}},browserTest:false},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
