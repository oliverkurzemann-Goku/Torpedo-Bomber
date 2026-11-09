'use strict';
// Build 235: the Rhine hitch when terrain tiles change level of detail. Ground layers (roads, rivers, fields) are re-fitted to the
// morphing terrain; done for every layer of every affected tile in one frame that was 10-25 ms. syncTerrainSurfacesBudgeted()
// does the same work over several frames, nearest tiles first. This test runs two worlds through the same LOD sequence on
// real DEM/OSM tiles - one with the full per-frame sync, one with a deliberately tiny budget - and demands that, once settled,
// every ground layer matches the full sync (x/z bit-identical, heights within the sync's own 0.1 mm tolerance, 0.2 mm worst case between two schedules), that work really was deferred, and that nothing starved.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),THREE=require('three');
global.THREE=THREE;
for(const name of ['HeightProvider','TerrainTile','TerrainManager','OSMManager'])vm.runInThisContext(fs.readFileSync('terrain-system/'+name+'.js','utf8'));
global.fetch=async url=>{const b=fs.readFileSync(url.split('?')[0]);return {ok:true,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
const sameBits=(a,b)=>a.length===b.length&&Buffer.compare(Buffer.from(a.buffer,a.byteOffset,a.byteLength),Buffer.from(b.buffer,b.byteOffset,b.byteLength))===0;
const coords=[[0,3],[1,3],[2,3],[0,4],[1,4],[2,4],[0,5],[1,5],[2,5]];

async function world(){
 const scene=new THREE.Scene(),dem=new DEMHeightProvider(4000,'terrain-system/real/data/dem/');
 await Promise.all(coords.map(([x,z])=>dem.loadTile(x,z)));
 const terrain=Object.create(TerrainManager.prototype);
 Object.assign(terrain,{scene,tileSize:4000,heightProvider:dem,tiles:new Map(),material:new THREE.MeshStandardMaterial()});
 coords.forEach(([x,z])=>terrain.ensureTile(x,z));
 const osm=new OSMManager(scene,4000,terrain,'terrain-system/real/data/osm/');osm.deferSurfaces=true;
 await Promise.all(coords.map(([x,z])=>osm.loadTile(x,z)));
 terrain.updateLOD(787,18087.6,1);osm.deferSurfaces=false;osm.syncTerrainSurfaces();osm.enableDeferredLOD();
 return {terrain,osm};
}
// the flight path: it crosses several LOD boundaries in both directions (same list the shading test uses)
const path=[[6200,20001,420],[787,18087.6,420],[9000,14500,420],[4001,20001,420]];

(async()=>{
 const A=await world(),B=await world();
 let maxFitA=0,maxFitB=0,deferred=0,maxAge=0,processedB=0;
 // count how many vertices each world fits per frame
 const count=(w,key)=>{const f=w.osm.syncSurface.bind(w.osm);w.frameFit=0;w.osm.syncSurface=function(mesh){w.frameFit+=mesh.geometry.attributes.position.count;return f(mesh);};};
 count(A);count(B);
 const BUDGET=.0001,AGE=8;
 for(const [x,z,limit] of path){
  for(let frame=0;frame<limit;frame++){
   // both worlds advance their terrain with the same dt; preparation runs to completion in one call (no wall-clock dependence), so both worlds take the same LOD decisions in the same frames
   for(const w of [A,B]){w.osm.advanceSurfacePreparation(1e9);w.terrain.updateLOD(x,z,1/60);w.frameFit=0;}
   A.osm.syncTerrainSurfaces();maxFitA=Math.max(maxFitA,A.frameFit);
   const before=new Map();for(const mesh of B.osm.surfaceMeshes)if(mesh.userData.surfaceStaleSince!==undefined)before.set(mesh,B.osm._surfaceFrame+1-mesh.userData.surfaceStaleSince);
   const left=B.osm.syncTerrainSurfacesBudgeted(x,z,BUDGET,AGE);
   maxFitB=Math.max(maxFitB,B.frameFit);if(left>0)deferred++;processedB+=B.frameFit>0?1:0;
   for(const mesh of B.osm.surfaceMeshes)if(mesh.userData.surfaceStaleSince!==undefined)maxAge=Math.max(maxAge,B.osm._surfaceFrame-mesh.userData.surfaceStaleSince+1);
  }
 }
 // settle: both worlds stop at the last waypoint; the budgeted one is given as many frames as it needs
 const [fx,fz]=[path.at(-1)[0],path.at(-1)[1]];let guard=0;
 for(;guard<1500;guard++){
  for(const w of [A,B]){w.osm.advanceSurfacePreparation(1e9);w.terrain.updateLOD(fx,fz,1/60);}
  A.osm.syncTerrainSurfaces();const left=B.osm.syncTerrainSurfacesBudgeted(fx,fz,.0001,AGE);
  const calm=![...A.terrain.tiles.values(),...B.terrain.tiles.values()].some(t=>t.morphing)&&!A.osm.surfaceJobs.size&&!B.osm.surfaceJobs.size&&left===0;
  if(calm&&guard>20)break;
 }
 assert(guard<1500,'both worlds settle');
 B.osm.syncTerrainSurfaces();A.osm.syncTerrainSurfaces();   // nothing may be left to do - and doing it changes nothing
 // every ground layer, tile by tile
 let meshes=0,vertices=0,maxY=0,maxN=0;const stale={A:0,B:0};
 for(const [key,ta] of A.osm.tiles){const tb=B.osm.tiles.get(key);assert(tb,'tile '+key);
  const ma=ta.group.children.filter(m=>m.isMesh&&m.userData.waterSource),mb=tb.group.children.filter(m=>m.isMesh&&m.userData.waterSource);
  assert.equal(ma.length,mb.length,'same number of ground layers in '+key);
  ma.forEach((m,i)=>{const o=mb[i];meshes++;vertices+=m.geometry.attributes.position.count;
   assert.equal(o.userData.surfaceSegments,m.userData.surfaceSegments,'same resolution '+key+'#'+i);
   // x and z never depend on the schedule. y does, by at most twice the sync's own 0.1 mm "unchanged" tolerance: a vertex that
   // is within 0.0001 m of its target is left alone, so each world may stop up to 0.1 mm either side of the exact fit
   // (history dependent, and the full sync does this too). Compare within that.
   const pa=m.geometry.attributes.position.array,pb=o.geometry.attributes.position.array,na=m.geometry.attributes.normal.array,nb=o.geometry.attributes.normal.array;
   assert.equal(pa.length,pb.length,'same vertex count '+key+'#'+i);
   for(let k=0;k<pa.length;k+=3){assert(pa[k]===pb[k]&&pa[k+2]===pb[k+2],'x/z identical '+key+'#'+i);const d=Math.abs(pa[k+1]-pb[k+1]);if(d>maxY)maxY=d;}
   for(let k=0;k<na.length;k++){const d=Math.abs(na[k]-nb[k]);if(d>maxN)maxN=d;}
   for(const [w,g] of [['A',m.geometry],['B',o.geometry]]){const keep=Float32Array.from(g.attributes.normal.array);osmSurfaceNormals(g,null);const f=g.attributes.normal.array;let d=0;for(let k=0;k<f.length;k++)d=Math.max(d,Math.abs(f[k]-keep[k]));stale[w]=Math.max(stale[w],d);}});}
 assert(maxY<=2.1e-4,'ground layers sit within two 0.1 mm sync tolerances of the full sync: '+maxY);
 // each world's stored shading is exactly a fresh shading of its own positions (nothing stale); between the two worlds the
 // normals can differ only through the 0.2 mm height tolerance acting on very small triangles (here: a few thousandths)
 assert(stale.A===0&&stale.B===0,'stored normals equal a fresh shading of the same positions: '+stale.A+' / '+stale.B);
 assert(maxN<.01,'normals of the two schedules agree to a fraction of a degree: '+maxN);
 for(const [key,t] of A.terrain.tiles)assert(sameBits(B.terrain.tiles.get(key).mesh.geometry.attributes.position.array,t.mesh.geometry.attributes.position.array),'terrain heights identical '+key);
 // the budget really spread the work, and nothing waited much longer than allowed
 assert(deferred>20,'work was deferred over frames: '+deferred);
 assert(maxFitB<maxFitA,'the busiest frame fits less than the full sync does: '+maxFitB+' vs '+maxFitA+' vertices');
 assert(maxAge<=AGE+6,'no ground layer starved: waited at most '+maxAge+' frames');
 // queue API details
 assert.equal(B.osm.syncTerrainSurfacesBudgeted(fx,fz,3.5),0,'nothing left to do once settled');
 console.log(JSON.stringify({meshes,vertices,deferredFrames:deferred,maxVerticesPerFrameFull:maxFitA,maxVerticesPerFrameBudgeted:maxFitB,maxWaitFrames:maxAge,settleFrames:guard,maxYDiffMetres:maxY,maxNormalDiff:maxN,staleNormals:stale}));
 console.log('Surface budget: ground layers equal the full sync after settling (within 0.2 mm), work spread over frames, nothing starved.');
})().catch(e=>{console.error(e);process.exitCode=1;});
