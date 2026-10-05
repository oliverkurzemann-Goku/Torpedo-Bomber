'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),THREE=require('three');
global.THREE=THREE;
for(const name of ['HeightProvider','TerrainTile','TerrainManager','OSMManager','AirfieldDetails'])vm.runInThisContext(fs.readFileSync('terrain-system/'+name+'.js','utf8'));
global.fetch=async url=>{const b=fs.readFileSync(url.split('?')[0]);return {ok:true,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
(async()=>{
 const coords=[[0,3],[1,3],[0,4],[1,4],[0,5],[1,5]],scene=new THREE.Scene(),dem=new DEMHeightProvider(4000,'terrain-system/real/data/dem/');
 await Promise.all(coords.map(([x,z])=>dem.loadTile(x,z)));
 const terrain=Object.create(TerrainManager.prototype);
 Object.assign(terrain,{scene,tileSize:4000,heightProvider:dem,tiles:new Map(),material:new THREE.MeshStandardMaterial()});
 coords.forEach(([x,z])=>terrain.ensureTile(x,z));
 const osm=new OSMManager(scene,4000,terrain,'terrain-system/real/data/osm/');osm.deferSurfaces=true;
 await Promise.all(coords.map(([x,z])=>osm.loadTile(x,z)));
 terrain.updateLOD(787,18087.6,1);osm.deferSurfaces=false;osm.syncTerrainSurfaces();
 const field=new AirfieldDetails(terrain,osm,787,18087.6,900,40);osm.enableDeferredLOD();
 let transitions=0,samples=0,maxError=0;
 const drape=osm.redrapeWater;
 osm.redrapeWater=function(mesh){
  const src=mesh.userData.waterSource,tile=terrain.tiles.get(src.ox/4000+','+src.oz/4000);
  assert.equal(mesh.userData.preparedSurface?.seg,tile._renderSeg,'every runtime topology change must use a prepared layout');
  transitions++;return drape.call(this,mesh);
 };
 const html=fs.readFileSync('remagen-mission.html','utf8');
 assert(html.includes('osmMgr.enableDeferredLOD()')&&html.includes('osmMgr.advanceSurfacePreparation()'),'live game must enable and drive preparation');
 // Travel across LOD bands in both directions, including an early reversal.
 for(const [x,z,limit] of [[4001,20001,8],[787,18087.6,500],[4001,20001,500],[1800,14500,500],[787,18087.6,500]]){
  let settled=0;
  for(let frame=0;frame<limit;frame++){
   const before=[...terrain.tiles.values()].map(t=>t.lod);
   osm.advanceSurfacePreparation(.5);terrain.updateLOD(x,z,1/60);osm.syncTerrainSurfaces();field.refresh();
   const changed=[...terrain.tiles.values()].filter((t,i)=>t.lod!==before[i]).length;
   assert(changed<=1,'terrain commits at most one LOD transition per frame');
   for(const mesh of osm.surfaceMeshes){
    const src=mesh.userData.waterSource,p=mesh.geometry.attributes.position;
    for(let i=0;i+2<p.count;i+=501){
     const px=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,pz=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
     if(px<=src.ox+.01||px>=src.ox+3999.99||pz<=src.oz+.01||pz>=src.oz+3999.99)continue;
     const y=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3;
     const error=Math.abs(y-terrain.getRenderedHeight(px,pz)-src.offset);maxError=Math.max(maxError,error);samples++;
     assert(error<.01,'roads/water/runway must match the terrain throughout deferred transitions');
    }
   }
   if(!osm.surfaceJobs.size&&![...terrain.tiles.values()].some(t=>t.morphing))settled++;else settled=0;
   if(settled>=3)break;
  }
 }
 assert(transitions>5&&samples>1000);assert.equal(osm.surfaceJobs.size,0);
 console.log(JSON.stringify({preparedSurfaceChanges:transitions,samples,maxError,oneCommitPerFrame:true}));
})().catch(e=>{console.error(e);process.exit(1);});
