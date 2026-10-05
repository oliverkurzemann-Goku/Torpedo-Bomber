'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
global.THREE=require('three');global.self=global;global.window=global;
class ImageStub{constructor(){this.listeners={};this.width=2;this.height=2;}addEventListener(t,f){this.listeners[t]=f;}removeEventListener(){}set src(_){queueMicrotask(()=>this.listeners.load?.());}}
global.document={createElementNS:()=>new ImageStub(),createElement:()=>({getContext:()=>({drawImage(){},getImageData:()=>({data:[60,60,60,255]})})})};
vm.runInThisContext(fs.readFileSync(require.resolve('three/examples/js/loaders/GLTFLoader.js'),'utf8'));
const html=fs.readFileSync('remagen-mission.html','utf8');
vm.runInThisContext(html.slice(html.indexOf('function samplePoints('),html.indexOf('// Find the propeller BY GEOMETRY')));
vm.runInThisContext("const JET_KINDS=['me262','me163'],NO_PROP_KINDS=['b24'],MULTI_ENGINE_KINDS=['b17'],TRICYCLE_KINDS=['me262'];\n"+html.slice(html.indexOf('function readVert('),html.indexOf('function loadModels(){')));
for(const name of ['HeightProvider','TerrainTile','TerrainManager','AircraftGround','WorldVehicles','AirfieldActivity'])vm.runInThisContext(fs.readFileSync('terrain-system/'+name+'.js','utf8'));
global.fetch=async url=>{const b=fs.readFileSync(url);return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}};
async function load(file){const b=fs.readFileSync(file);return new Promise((yes,no)=>new THREE.GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',g=>yes(g.scene),no));}
(async()=>{
 const dem=new DEMHeightProvider(4000,'terrain-system/real/data/dem/');await Promise.all([[0,4],[5,6]].map(([x,z])=>dem.loadTile(x,z)));
 const terrain=Object.create(TerrainManager.prototype);Object.assign(terrain,{scene:new THREE.Scene(),tileSize:4000,heightProvider:dem,tiles:new Map(),material:new THREE.MeshStandardMaterial()});
 const models=[['p47','p47new.glb',12.42],['bf109','bf109new.glb',9.92],['fw190','fw190.glb',10.51],['me262','me262.glb',12.51],['ju87','ju87.glb',13.8],['me163','me163.glb',9.3],['b17','b17.glb',31.62],['b24','b24.glb',33.53]];
 let samples=0,maxGap=0;
 for(const [kind,file,span] of models){
  const src=await load(file),model=new THREE.Group();model.add(src);model.updateMatrixWorld(true);
  src.scale.setScalar(span/new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).x);model.updateMatrixWorld(true);
  src.position.copy(new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3())).negate();model.updateMatrixWorld(true);rigModel(model,kind);
  const [x,z]=kind==='p47'?[787,18087.6]:[23600,25725],tile=terrain.ensureTile(Math.floor(x/4000),Math.floor(z/4000),2);
  const activity=new AirfieldActivity(terrain,x,z);activity.setAircraft(model,kind);
  assert.equal(AircraftGround.supports(model,kind).length,3,kind+' needs three measured supports');
  for(const lod of [0,2,0]){
   tile.setLOD(lod,terrain.material);
   for(let frame=0;frame<15;frame++){
    tile.updateMorph(.05);activity.update(.05,x,z);
    for(const crew of activity.crew)for(const pad of activity.parked){const b=pad.userData.crewBox;
      assert(crew.drawX<=b.min.x||crew.drawX>=b.max.x||crew.drawZ<=b.min.z||crew.drawZ>=b.max.z,kind+' crew enters aircraft footprint');
    }
    for(const pad of activity.parked){
     const supports=AircraftGround.supports(pad.children[0],kind);
     for(const vertices of supports){let low=null;const p=new THREE.Vector3();
      for(let i=0;i<vertices.length;i+=3){p.fromArray(vertices,i).applyQuaternion(pad.quaternion);if(!low||p.y<low.y)low=p.clone();}
      const gap=Math.abs(pad.position.y+low.y-AircraftGround.height(terrain,x+pad.position.x+low.x,z+pad.position.z+low.z));
      maxGap=Math.max(maxGap,gap);assert(gap<.015,kind+' floats or sinks during terrain morph: '+gap);samples++;
     }
    }
   }
  }
  const pose=AircraftGround.fit(model,kind,x-550,z,Math.PI/2,(a,b)=>AircraftGround.height(terrain,a,b));
  assert(pose&&Number.isFinite(pose.y),kind+' has a valid runway stance');
  console.log(kind+': measured tyre/skid stance follows real DEM LOD transitions');
 }
 console.log(JSON.stringify({samples,maxGap}));
})().catch(e=>{console.error(e);process.exit(1)});
