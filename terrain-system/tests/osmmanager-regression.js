#!/usr/bin/env node
'use strict';

// Structural regression test for terrain-system/OSMManager.js.
// No npm dependency: minimal THREE stubs are sufficient for placement,
// instancing and transform invariants. This is NOT a rendering test.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

class Vector3 {
  constructor(x=0,y=0,z=0){ this.set(x,y,z); }
  set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
}
class Quaternion {
  constructor(){ this.angle=0; }
  setFromAxisAngle(_axis,angle){ this.angle=angle; return this; }
}
class Matrix4 {
  compose(pos,q,scale){
    this.values=[pos.x,pos.y,pos.z,q.angle,scale.x,scale.y,scale.z];
    return this;
  }
}
class Geometry { dispose(){ this.disposed=true; } }
class BoxGeometry extends Geometry {}
class CylinderGeometry extends Geometry {}
class ConeGeometry extends Geometry {}
class DodecahedronGeometry extends Geometry {}
class BufferGeometry extends Geometry {
  constructor(){ super(); this.attributes={}; this.index=null; }
  setAttribute(name,value){ this.attributes[name]=value; return this; }
  setIndex(value){ this.index=value; return this; }
  computeVertexNormals(){}
  computeBoundingSphere(){}
}
class Float32BufferAttribute {
  constructor(array,itemSize){ this.array=array; this.itemSize=itemSize; }
}
class MeshStandardMaterial { constructor(opts){ this.opts=opts; } }
class Group {
  constructor(){ this.children=[]; }
  add(o){ this.children.push(o); }
  traverse(fn){
    const walk=o=>{ fn(o); (o.children||[]).forEach(walk); };
    walk(this);
  }
}
class Mesh {
  constructor(geometry,material){ this.geometry=geometry; this.material=material; this.name=''; }
}
class InstancedMesh extends Mesh {
  constructor(geometry,material,count){
    super(geometry,material);
    this.count=count;
    this.matrices=[];
    this.isInstancedMesh=true;
    this.instanceMatrix={needsUpdate:false};
  }
  setMatrixAt(i,m){ this.matrices[i]=m.values.slice(); }
  dispose(){ this.didDispose=true; }
}

global.THREE={
  Vector3,Quaternion,Matrix4,BoxGeometry,CylinderGeometry,ConeGeometry,
  DodecahedronGeometry,BufferGeometry,Float32BufferAttribute,
  MeshStandardMaterial,Group,Mesh,InstancedMesh
};

const sourcePath=path.join(__dirname,'..','OSMManager.js');
const source=fs.readFileSync(sourcePath,'utf8')+'\n;globalThis.OSMManager=OSMManager;';
vm.runInThisContext(source,{filename:sourcePath});

function assert(ok,msg){ if(!ok) throw new Error(msg); }
function finiteMatrices(group,label){
  for(const mesh of group.children){
    for(const matrix of mesh.matrices||[]){
      assert(matrix.every(Number.isFinite),`${label}: non-finite instance matrix in ${mesh.name||'unnamed mesh'}`);
    }
  }
}

const scene={add(){},remove(){}};
// Deliberately sloped surface: a large footprint must see different corner heights.
const terrain={getRenderedHeight(x,z){ return 0.01*x+0.02*z; }};
const osm=new OSMManager(scene,4000,terrain,'');
assert(osm.farmMat.opts.transparent===true && osm.farmMat.opts.opacity<=0.20,
  'farmland: expected a subtle transparent terrain tint');

// BUILD 7's four-sided cone roof was a stretched pyramid. The replacement
// must be a six-vertex gable prism (four eaves + two ridge endpoints).
assert(osm.gableRoofGeo.attributes.position.array.length===18,
  'roof: expected six-vertex gable-prism geometry');

// Two overlapping forest polygons. Old code emitted trunk+canopy PER polygon;
// the new invariant is <=4 vegetation buckets for the entire tile.
const forestGroup=new THREE.Group();
const forestA=[[100,100],[900,100],[900,900],[100,900],[100,100]];
const forestB=[[500,500],[1300,500],[1300,1300],[500,1300],[500,500]];
const treeCount=osm._buildForests(forestGroup,[forestA,forestB],0,0);
assert(treeCount>0,'forest: no placements generated');
assert(forestGroup.children.length<=4,`forest: expected <=4 instance buckets, got ${forestGroup.children.length}`);
assert(new Set(forestGroup.children.map(x=>x.name)).size===forestGroup.children.length,'forest: duplicate debug bucket names');
finiteMatrices(forestGroup,'forest');

const exclusion=osm._buildForestExclusion({
  roads:[[[100,500],[1300,500]]],
  rails:[],rivers:[],
  lakes:[[[800,800],[1000,800],[1000,1000],[800,1000],[800,800]]],
  airfields:[],
  buildings:[{x:600,z:700,w:50,d:30,rotY:0.35}]
},0,0);
assert(osm._treeExcluded(400,500,exclusion),'exclusion: road centre was not blocked');
assert(osm._treeExcluded(600,700,exclusion),'exclusion: building footprint was not blocked');
assert(osm._treeExcluded(900,900,exclusion),'exclusion: lake polygon was not blocked');
assert(!osm._treeExcluded(1200,1200,exclusion),'exclusion: unrelated open ground was blocked');
const filtered=osm._forestPlacements([forestA,forestB],0,0,exclusion);
assert(filtered.length>0,'exclusion: removed every forest placement');
assert(filtered.every(p=>!osm._treeExcluded(p.x,p.z,exclusion)),
  'exclusion: emitted a tree on a blocked feature');

const buildingGroup=new THREE.Group();
const buildings=[
  {x:500,z:500,w:12,d:9,rotY:0.2},
  {x:900,z:700,w:80,d:28,rotY:1.0},
  {x:1200,z:1100,w:24,d:14,rotY:0.5}
];
const buildingCount=osm._buildBuildings(buildingGroup,buildings,0,0);
assert(buildingCount===buildings.length,'buildings: count mismatch');
assert(buildingGroup.children.length<=4,`buildings: expected <=4 instance buckets, got ${buildingGroup.children.length}`);
finiteMatrices(buildingGroup,'buildings');

const range=osm._buildingGroundRange(buildings[1],900,700,0,0);
assert(range.maxY>range.minY,'buildings: corner/centre terrain sampling did not detect slope');

const wallMeshes=buildingGroup.children.filter(x=>x.name.startsWith('osmBuildingWalls'));
const wallHeights=wallMeshes.flatMap(m=>m.matrices.map(a=>a[5]));
assert(wallHeights.length===buildings.length,'buildings: not every building received a wall instance');
assert(wallHeights.every(h=>Number.isFinite(h)&&h>5),'buildings: invalid compensated wall height');

// Run the exclusion system against every shipped Remagen OSM tile. This is
// intentionally data-backed: it catches a future schema/coordinate regression
// that a single synthetic road cannot.
const osmDataDir=path.join(__dirname,'..','real','data','osm');
let realRawTrees=0,realFilteredTrees=0,realTiles=0;
for(const file of fs.readdirSync(osmDataDir).filter(x=>x.endsWith('.json'))){
  const match=file.match(/^(\d+)_(\d+)\.json$/);
  if(!match) continue;
  const tx=+match[1],tz=+match[2],ox=tx*4000,oz=tz*4000;
  const data=JSON.parse(fs.readFileSync(path.join(osmDataDir,file),'utf8'));
  const raw=osm._forestPlacements(data.forests||[],ox,oz);
  const index=osm._buildForestExclusion(data,ox,oz);
  const kept=osm._forestPlacements(data.forests||[],ox,oz,index);
  assert(kept.every(p=>!osm._treeExcluded(p.x,p.z,index)),
    `real tile ${file}: tree survived on an excluded feature`);
  realRawTrees+=raw.length;
  realFilteredTrees+=kept.length;
  realTiles++;
}
assert(realTiles>0,'real data: no OSM tiles scanned');
assert(realFilteredTrees<realRawTrees,
  'real data: exclusion system did not remove any overlapping trees');

console.log('OSMManager regression OK',JSON.stringify({
  treeCount,
  filteredTreeCount:filtered.length,
  realTiles,
  realRawTrees,
  realFilteredTrees,
  forestBuckets:forestGroup.children.map(x=>x.name),
  buildingBuckets:buildingGroup.children.map(x=>x.name),
  sampledRelief:+(range.maxY-range.minY).toFixed(2)
}));
