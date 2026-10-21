'use strict';
// Terrain LOD morphs must not cost visual fidelity: draped roads/rivers/fields keep
// exactly the face normals a full computeVertexNormals() gives, and edge stitching
// only reports a tile as changed when a stored Float32 height actually changes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),THREE=require('three');
global.THREE=THREE;
for(const name of ['HeightProvider','TerrainTile','TerrainManager','OSMManager'])vm.runInThisContext(fs.readFileSync('terrain-system/'+name+'.js','utf8'));
global.fetch=async url=>{const b=fs.readFileSync(url.split('?')[0]);return {ok:true,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
const sameBits=(a,b)=>a.length===b.length&&Buffer.compare(Buffer.from(a.buffer,a.byteOffset,a.byteLength),Buffer.from(b.buffer,b.byteOffset,b.byteLength))===0;
const reference=geo=>{const copy=new THREE.BufferGeometry();copy.setAttribute('position',geo.attributes.position.clone());copy.computeVertexNormals();return copy.attributes.normal.array;};

(async()=>{
 // 1. Bit-identical to three r128 on real-world magnitudes, including degenerate faces.
 let seed=7;const random=()=>(seed=(seed*16807)%2147483647)/2147483647;
 const positions=new Float32Array(3*3*4000);
 for(let i=0;i<positions.length;i+=3){positions[i]=4000*random();positions[i+1]=40+380*random();positions[i+2]=4000*random();}
 positions.copyWithin(9*5+3,9*5,9*5+3);positions.copyWithin(9*5+6,9*5,9*5+3); // a zero-area triangle
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
 osmSurfaceNormals(geo,null);
 assert(sameBits(geo.attributes.normal.array,reference(geo)),'full re-shade matches computeVertexNormals bit for bit');
 for(const t of [3,17,999,3999]){for(let k=0;k<3;k++)positions[t*9+k*3+1]+=1.75+t*.001;}
 osmSurfaceNormals(geo,[3,17,999,3999]);
 assert(sameBits(geo.attributes.normal.array,reference(geo)),'moved-triangle re-shade matches a full recompute');

 // 2. Real DEM/OSM tiles through deferred LOD transitions in both directions.
 const coords=[[0,3],[1,3],[2,3],[0,4],[1,4],[2,4],[0,5],[1,5],[2,5]],scene=new THREE.Scene(),dem=new DEMHeightProvider(4000,'terrain-system/real/data/dem/');
 await Promise.all(coords.map(([x,z])=>dem.loadTile(x,z)));
 const terrain=Object.create(TerrainManager.prototype);
 Object.assign(terrain,{scene,tileSize:4000,heightProvider:dem,tiles:new Map(),material:new THREE.MeshStandardMaterial()});
 coords.forEach(([x,z])=>terrain.ensureTile(x,z));
 const osm=new OSMManager(scene,4000,terrain,'terrain-system/real/data/osm/');osm.deferSurfaces=true;
 await Promise.all(coords.map(([x,z])=>osm.loadTile(x,z)));
 terrain.updateLOD(787,18087.6,1);osm.deferSurfaces=false;osm.syncTerrainSurfaces();osm.enableDeferredLOD();
 const tileOf=mesh=>{const s=mesh.userData.waterSource;return terrain.tiles.get(s.ox/4000+','+s.oz/4000);};
 const neighbours=(a,b)=>Math.abs(a.tileX-b.tileX)+Math.abs(a.tileZ-b.tileZ)===1;
 let morphFrames=0,checkedMeshes=0,settledTriangles=0,reshadedSettled=0,fullCalls=0,spuriousRevisions=0;
 const original=THREE.BufferGeometry.prototype.computeVertexNormals;
 for(const [x,z,limit] of [[6200,20001,500],[787,18087.6,500],[9000,14500,500],[4001,20001,500]]){
  let settled=0;
  for(let frame=0;frame<limit;frame++){
   const morphing=[...terrain.tiles.values()].filter(t=>t.morphing);
   const revisions=new Map([...terrain.tiles.values()].map(t=>[t,t.surfaceRevision]));
   osm.advanceSurfacePreparation(.5);terrain.updateLOD(x,z,1/60);
   const morphingNow=[...terrain.tiles.values()].filter(t=>t.morphing),active=new Set([...morphing,...morphingNow]);
   // Only morphing tiles and their direct neighbours can have changed heights.
   for(const t of terrain.tiles.values())if(t.surfaceRevision!==revisions.get(t)&&!active.has(t)&&![...active].some(m=>neighbours(m,t)))spuriousRevisions++;
   const before=new Map();for(const mesh of osm.surfaceMeshes)before.set(mesh,mesh.geometry.attributes.normal?.array.slice());
   THREE.BufferGeometry.prototype.computeVertexNormals=function(){if(osm.surfaceMeshes.has([...osm.surfaceMeshes].find(m=>m.geometry===this)))fullCalls++;return original.call(this);};
   osm.syncTerrainSurfaces();
   THREE.BufferGeometry.prototype.computeVertexNormals=original;
   if(morphingNow.length)morphFrames++;
   for(const mesh of osm.surfaceMeshes){
    const tile=tileOf(mesh);if(tile.morphing)continue; // shading intentionally settles once the 0.6s blend ends
    const normal=mesh.geometry.attributes.normal.array;
    assert(sameBits(normal,reference(mesh.geometry)),'settled ground layer shading equals a full recompute');checkedMeshes++;
    const old=before.get(mesh);
    if(morphingNow.length&&old&&old.length===normal.length&&!mesh.userData.surfaceWasMorphing){
     settledTriangles+=normal.length/9;
     for(let i=0;i<normal.length;i+=9)if(normal[i]!==old[i]||normal[i+1]!==old[i+1]||normal[i+2]!==old[i+2])reshadedSettled++;
    }
   }
   const check=new Map([...terrain.tiles.values()].map(t=>[t,t.surfaceRevision]));
   terrain.stitchEdges();
   for(const t of terrain.tiles.values())assert.equal(t.surfaceRevision,check.get(t),'a second stitch of unchanged heights changes nothing');
   if(!osm.surfaceJobs.size&&!morphingNow.length)settled++;else settled=0;
   if(settled>=3)break;
  }
 }
 assert(morphFrames>40,'transitions were exercised: '+morphFrames);
 assert.equal(spuriousRevisions,0,'tiles away from a morph are never reported as changed');
 assert.equal(fullCalls,0,'draped layers never fall back to the generic normal rebuild');
 assert(settledTriangles>1e5&&reshadedSettled<settledTriangles*.02,`settled neighbours re-shade only their moved edge triangles (${reshadedSettled}/${settledTriangles})`);
 console.log(JSON.stringify({morphFrames,checkedMeshes,settledTriangles,reshadedSettled,spuriousRevisions,bitIdenticalShading:true}));
})().catch(e=>{console.error(e);process.exit(1);});
