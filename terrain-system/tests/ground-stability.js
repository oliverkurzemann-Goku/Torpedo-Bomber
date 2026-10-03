// Actual r128 triangles and shipped terrain; prevents roads disappearing into
// terrain during LOD changes and the old floating green polygon sheets.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');global.THREE=require('three');
for(const f of ['HeightProvider','TerrainTile','TerrainManager','OSMManager'])
  vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system',f+'.js'),'utf8'));
global.fetch=async u=>{const b=fs.readFileSync(path.join(root,u));return {ok:true,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
(async()=>{
  const dem=new DEMHeightProvider(4000,'terrain-system/real/data/dem/');
  await Promise.all(Array.from({length:56},(_,i)=>dem.loadTile(i%7,Math.floor(i/7))));
  const terrain=Object.create(TerrainManager.prototype);
  Object.assign(terrain,{scene:new THREE.Scene(),tileSize:4000,heightProvider:dem,tiles:new Map(),material:new THREE.MeshStandardMaterial()});
  for(const [x,z] of [[3,3],[4,3],[3,4],[4,4]])terrain.ensureTile(x,z,2);
  terrain.updateLOD(16001,16001,1);
  assert([...terrain.tiles.values()].every(t=>t._renderSeg===64),'all four tiles under a low seam crossing retain fine detail');
  const osm=new OSMManager(terrain.scene,4000,terrain,'terrain-system/real/data/osm/');
  await osm.loadTile(3,3);
  const content=osm.tiles.get('3,3'),tile=terrain.tiles.get('3,3');
  assert(content.group.children.every(m=>m.material!==osm.forestFloorMat&&m.material!==osm.farmMat),
    'land cover must not be rendered as separate floating/cullable meshes');
  const surfaces=content.group.children.filter(m=>m.userData.waterSource);
  assert(surfaces.some(m=>m.material===osm.roadMat)&&surfaces.some(m=>m.material===osm.railMat));
  const ray=new THREE.Raycaster();let samples=0,maxError=0;
  function check(){
    tile.mesh.updateMatrixWorld(true);
    for(const mesh of surfaces){
      const p=mesh.geometry.attributes.position;
      for(let i=0;i<p.count;i+=Math.max(3,Math.floor(p.count/120/3)*3)){
        const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
        if(x<=12000.01||x>=15999.99||z<=12000.01||z>=15999.99)continue;
        ray.set(new THREE.Vector3(x,2000,z),new THREE.Vector3(0,-1,0));
        const hit=ray.intersectObject(tile.mesh)[0];assert(hit,'terrain under a road must exist');
        const y=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3;
        const error=Math.abs(y-hit.point.y-mesh.userData.waterSource.offset);
        maxError=Math.max(maxError,error);assert(error<.003,'ground layer sinks/floats during morph: '+error);samples++;
      }
    }
  }
  check();
  for(const lod of [2,0,1,0]){
    tile.setLOD(lod,terrain.material);
    let previous=null;
    for(let i=0;i<7;i++){
      tile.updateMorph(.1);osm.syncTerrainSurfaces();check();
      const current=surfaces.map(m=>m.geometry);
      if(i===2)previous=current;
      if(i===3)assert(current.every((g,j)=>g===previous[j]),'morph updates buffers without allocating geometry');
    }
  }
  const unchanged=surfaces.map(m=>m.geometry);osm.syncTerrainSurfaces();
  assert(surfaces.every((m,i)=>m.geometry===unchanged[i]));
  console.log(JSON.stringify({samples,maxError,roadsDuringMorph:true,seamDetail:true,floatingLandcoverRemoved:true}));
})().catch(e=>{console.error(e);process.exit(1);});
