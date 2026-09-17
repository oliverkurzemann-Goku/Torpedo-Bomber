#!/usr/bin/env node
// Real Three.js r128 + shipped DEM; geometry validation, NOT a GPU render test.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');
global.THREE=require(process.env.THREE_R128||'three');
assert.equal(THREE.REVISION,'128');
for(const name of ['HeightProvider','TerrainTile','TerrainManager','OSMManager','AirfieldDetails'])
  vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system',name+'.js'),'utf8'));
global.fetch=async url=>{
  const b=fs.readFileSync(path.join(root,url.split('?')[0]));
  return {ok:true,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};
};
(async()=>{
  const scene=new THREE.Scene(),dem=new DEMHeightProvider(4000,'terrain-system/real/data/dem/');
  await dem.loadTile(0,4);
  const terrain=Object.create(TerrainManager.prototype);
  Object.assign(terrain,{scene,tileSize:4000,heightProvider:dem,tiles:new Map(),material:new THREE.MeshStandardMaterial()});
  terrain.ensureTile(0,4,0);
  const osm=new OSMManager(scene,4000,terrain,'terrain-system/real/data/osm/');
  const originalTerrainMaterial=terrain.material;
  const html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
  // Execute the actual mission integration, not a duplicated constructor invocation.
  const start=html.indexOf('let airfield=null,'),end=html.indexOf('// ===',start);
  const context=vm.createContext({THREE,AirfieldDetails,terrain,osmMgr:osm,scene,AF_X:787,AF_Z:18087.6,RWY_LEN:900,RWY_W:40});
  vm.runInContext(html.slice(start,end)+'\nbuildAirfield(); globalThis.field=airfieldDetails;',context);
  const f=context.field;
  assert(scene.children.includes(f.group)); assert.equal(terrain.material,originalTerrainMaterial);
  assert(html.includes('AirfieldDetails.js?v=remagen-13')); assert(html.includes('MODULE 13'));
  assert(html.includes('if(airfieldDetails)airfieldDetails.refresh()'));
  assert.equal(OSMManager.BUILD,13);
  const meshes=f.group.children;
  assert(meshes.length<=10,`draw-call budget exceeded: ${meshes.length}`);
  let samples=0,maxDrapeError=0;
  function buffers(){
    for(const m of meshes){
      assert(m.isMesh&&!m.isInstancedMesh);assert(m.material.isMeshLambertMaterial);
      assert.equal(m.material.vertexColors,false);
      const g=m.geometry,n=g.attributes.position.count;
      assert(n>0);for(const a of Object.values(g.attributes)){
        assert.equal(a.count,n);assert(Array.from(a.array).every(Number.isFinite));
      }
      assert(g.boundingSphere&&Number.isFinite(g.boundingSphere.radius));
    }
  }
  function ground(){
    buffers();
    for(const m of f.ground){
      const p=m.geometry.attributes.position,n=m.geometry.attributes.normal;
      for(let i=0;i<p.count;i+=3){
        const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
        const y=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3;
        const error=Math.abs(y-terrain.getRenderedHeight(x,z)-m.userData.waterSource.offset);
        maxDrapeError=Math.max(maxDrapeError,error);assert(error<.002,`buried/floating ground at ${x},${z}: ${error}`);
        assert(n.getY(i)>.8,'ground faces down'); samples++;
      }
    }
    // Both sides of the broad runway must be visible from above, at spawn too.
    f.group.updateMatrixWorld(true);
    const ray=new THREE.Raycaster();
    for(const dx of [-400,-310,0,400])for(const dz of [-18,0,18]){
      ray.set(new THREE.Vector3(787+dx,2000,18087.6+dz),new THREE.Vector3(0,-1,0));
      const hits=ray.intersectObjects(f.ground);assert(hits.length,'runway has a hole');
      assert(hits[0].point.y>terrain.getRenderedHeight(787+dx,18087.6+dz));
    }
  }
  for(const {name,bounds:b} of f.parts){
    // The whole active runway (plus wing clearance) remains clear of solid detail.
    assert(b.max.z<18087.6-20||b.min.z>18087.6+20,`runway obstruction: ${name}`);
    if(name==='hut'||name==='shelter'){
      for(let i=0;i<=4;i++)for(let j=0;j<=2;j++){
        const h=terrain.getRenderedHeight(b.min.x+(b.max.x-b.min.x)*i/4,b.min.z+(b.max.z-b.min.z)*j/2);
        assert(b.min.y<h&&b.max.y>h+2,'foundation floats or hut buried');
      }
    }
  }
  ground();
  // No allocations when LOD is unchanged; defer updates while terrain morphs.
  const tile=terrain.tiles.get('0,4'),before=f.ground.map(m=>m.geometry);
  f.refresh();assert(f.ground.every((m,i)=>m.geometry===before[i]));
  tile.setLOD(2,terrain.material);tile.updateMorph(.2);f.refresh();
  assert(f.ground.every((m,i)=>m.geometry===before[i]));
  tile.updateMorph(1);f.refresh();ground();
  tile.setLOD(0,terrain.material);tile.updateMorph(1);f.refresh();ground();
  console.log(JSON.stringify({meshes:meshes.length,groundBatches:f.ground.length,parts:f.parts.length,samples,maxDrapeError,spawnAndRunwayClear:true,browserTest:false},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
