#!/usr/bin/env node
// Real Three.js r128 + all shipped DEM/OSM data. Geometry/route test, not GPU/FPS.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');global.THREE=require(process.env.THREE_R128||'three');
assert.equal(THREE.REVISION,'128');
for(const name of ['HeightProvider','TerrainTile','TerrainManager','OSMManager','WorldVehicles','LivingWorld'])
  vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system',name+'.js'),'utf8'));
global.fetch=async url=>{const b=fs.readFileSync(path.join(root,url.split('?')[0]));return {ok:true,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};

(async()=>{
  const osmDir='terrain-system/real/data/osm/';
  const coords=fs.readdirSync(path.join(root,osmDir)).filter(f=>/^\d+_\d+\.json$/.test(f)).map(f=>f.slice(0,-5).split('_').map(Number));
  const scene=new THREE.Scene(),dem=new DEMHeightProvider(4000,'terrain-system/real/data/dem/');
  await Promise.all(coords.map(([x,z])=>dem.loadTile(x,z)));
  const terrain=Object.create(TerrainManager.prototype);
  Object.assign(terrain,{scene,tileSize:4000,heightProvider:dem,tiles:new Map(),material:new THREE.MeshStandardMaterial()});
  for(const [x,z]of coords)terrain.ensureTile(x,z,0);
  const osm=new OSMManager(scene,4000,terrain,osmDir);
  await osm.prepareRegion(coords,'terrain-system/real/data/waterways.json');
  const html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
  assert(html.includes('LivingWorld.js?v=remagen-21'));assert(html.includes('MODULE 21'));
  for(const id of ['convoy','train','ferry'])assert(html.includes(`id:'${id}'`),`mission ${id} missing`);
  assert(html.includes("livingWorld.missionTargets(m.traffic||m.id)"));assert(html.includes('livingWorld.destroyEntity(t.entity)'));
  // Execute the actual mission table/population logic with lightweight target
  // stubs: practice stays safe, every combat sortie receives active guns, and
  // only Flak Suppression makes those guns primary objectives.
  const missionStart=html.indexOf('const MISSIONS=['),missionEnd=html.indexOf('function objectiveLeft',missionStart);
  const missionContext=vm.createContext({mission:0,calls:[],realBridge:{},realFactory:{},realFlak:[{},{}],
    resetAllRealTargets(){},livingWorld:{resetForMission(){},missionTargets(id){return [{kind:id==='convoy'?'truck':id==='train'?'train':'ferry'}];}},
    spawnRealTarget(kind,sub,opt){missionContext.calls.push({kind,primary:!!opt.primary,heavy:!!opt.heavy});},
    spawnLivingTarget(e,opt){missionContext.calls.push({kind:e.kind,primary:!!opt.primary});}});
  vm.runInContext(html.slice(missionStart,missionEnd)+"\nglobalThis.runMission=i=>{mission=i;calls=[];populate();return {id:M().id,calls};};",missionContext);
  const missionFlak={free:0,circ:0,bridge:2,flak:2,factory:1,convoy:1,train:1,ferry:2,
    fighter:0,boxes:0,libs:0,jabo:1,jetstrike:0,final:2};
  // Which sorties list flak in their own kills{} (MISSIONS array in remagen-mission.html) --
  // those are the ones where destroyed flak guns must be primary (nav-arrow) targets.
  const missionKills={bridge:{flak:1},flak:{flak:1},factory:{flak:1},jabo:{flak:1},final:{flak:1}};
  for(let i=0;i<14;i++){
    const run=missionContext.runMission(i),guns=run.calls.filter(c=>c.kind==='flak');
    assert.equal(guns.length,missionFlak[run.id],run.id+' flak defense mismatch');
    // primary = flak is a listed kill{} requirement for this sortie (nav-arrow
    // guidance), not just the dedicated Flak Suppression sortie -- see populate()'s
    // own comment in remagen-mission.html.
    const flakRequired=!!(missionKills[run.id]&&missionKills[run.id].flak);
    assert(guns.every(g=>g.heavy));assert(guns.every(g=>g.primary===flakRequired));
    if(run.id==='jabo')assert(run.calls.some(c=>c.kind==='truck'&&c.primary));
    if(run.id==='final')assert(run.calls.some(c=>c.kind==='ferry'&&c.primary));
  }
  assert(html.includes('const range=light?1350:3900'));assert(html.includes('groundFire=[];'));
  const h=JSON.parse(fs.readFileSync(path.join(root,'terrain-system/real/data/historical/3_3.json'))),b=h.bridges[0];
  const bridge=[12000+(b.x1+b.x2)/2,12000+(b.z1+b.z2)/2];
  const f=JSON.parse(fs.readFileSync(path.join(root,'terrain-system/real/data/historical/3_5.json'))).factories[0];
  const factory=[12000+f.x,20000+f.z];
  const world=new LivingWorld(scene,terrain,osm,{bridge,bridgeSpan:[b.x2-b.x1,b.z2-b.z1],factory,field:[787,18087.6]});

  assert.equal(LivingWorld.BUILD,21);assert.equal(OSMManager.BUILD,21);
  assert(world.routes.road.length>=3,'not enough real road routes');
  assert(world.routes.rail.length>=1,'real rail route missing');
  assert.equal(world.routes.water.length,1,'Rhine route missing');
  assert(world.routes.water[0].length>800,'Rhine route too short');
  assert(world._pointOnWater(bridge[0],bridge[1]),'historical bridge centre is not on rendered water');
  for(const p of world.routes.water[0].points.slice(1))assert(world._waterClear(p[0],p[1]),'ferry route left the Rhine');

  const count=kind=>world.entities.filter(e=>e.kind===kind).length;
  assert.equal(count('truck'),12);assert.equal(count('train'),1);assert.equal(count('ferry'),2);
  assert.equal(count('wagon')+count('civil'),12);
  assert.equal(world.missionTargets('convoy').length,4);
  assert.equal(world.missionTargets('train').length,1);
  assert.equal(world.missionTargets('ferry').length,1);
  assert.deepEqual(world.missionTargets('factory'),[]);

  const d=world.detailCounts;
  assert(d.fields>=150&&d.fields<=230);assert(d.hedges>=200&&d.hedges<=420);
  assert(d.poles>=140&&d.poles<=180);assert(d.cows>20&&d.cows<=36);assert.equal(d.buckets,10);
  const insulators=world.details.getObjectByName('telegraphInsulators'),wires=world.details.getObjectByName('telegraphWires');
  assert.equal(insulators.count,d.poles*3);assert(wires.isLineSegments);assert(wires.geometry.attributes.position.count>0);
  const matrix=new THREE.Matrix4();
  for(const mesh of world.details.children){
    assert(mesh.isInstancedMesh||mesh.isLineSegments);assert.equal(mesh.frustumCulled,false);assert(!mesh.instanceColor,'instance colours are forbidden');
    if(mesh.isInstancedMesh)for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);assert(matrix.elements.every(Number.isFinite));}
  }

  let entityMeshes=0;
  for(const e of world.entities)e.model.traverse(o=>{if(!o.isMesh)return;entityMeshes++;
    assert(o.material.isMeshLambertMaterial);assert(o.geometry.attributes.position.array.every(Number.isFinite));
  });
  assert(entityMeshes<150,'fallback moving-world mesh budget exceeded');

  // Model replacement keeps the stable wrapper used by live target handles.
  const targetWrapper=world.missionTargets('convoy')[0].model;
  const tigerTemplate=new THREE.Group();tigerTemplate.add(new THREE.Mesh(new THREE.BoxGeometry(2,2,5),new THREE.MeshLambertMaterial()));
  const merchantTemplate=new THREE.Group();merchantTemplate.add(new THREE.Mesh(new THREE.BoxGeometry(5,3,20),new THREE.MeshLambertMaterial()));
  const replaced=world.installVehicleModels(new Map([['tiger',tigerTemplate],['merchant',merchantTemplate]]));
  assert.equal(replaced,14);assert.equal(world.missionTargets('convoy')[0].model,targetWrapper);
  assert(world.entities.filter(e=>e.kind==='truck').every(e=>e.visual.userData.sourceModel==='tiger'));
  assert(world.entities.filter(e=>e.kind==='ferry').every(e=>e.visual.userData.sourceModel==='merchant'));

  const truck=world.missionTargets('convoy')[0],before=truck.phase;
  const start=world._sample(truck.route,truck.phase);world.update(2,start.x,start.z);
  assert(truck.phase>before&&truck.model.visible);assert(truck.model.position.toArray().every(Number.isFinite));
  const ferry=world.missionTargets('ferry')[0],fp=world._sample(ferry.route,ferry.phase);
  world.update(.5,fp.x,fp.z);assert(world._pointOnWater(ferry.model.position.x,ferry.model.position.z));
  world.destroyEntity(truck);const stopped=truck.phase;world.update(3,truck.model.position.x,truck.model.position.z);assert.equal(truck.phase,stopped);
  assert(!truck.alive);world.resetForMission('convoy');assert(truck.alive&&truck.phase===truck.initialPhase);
  world.update(.1,27000,31000);assert(world.entities.every(e=>!e.model.visible));

  const smoke=[];for(let i=0;i<20;i++)world.update(.5,factory[0],factory[1],p=>smoke.push(p));
  assert(smoke.length>0&&smoke.every(p=>[p.x,p.y,p.z,p.scale].every(Number.isFinite)));

  console.log(JSON.stringify({
    routes:{road:world.routes.road.map(r=>Math.round(r.length)),rail:world.routes.rail.map(r=>Math.round(r.length)),rhine:Math.round(world.routes.water[0].length)},
    entities:{trucks:count('truck'),trains:count('train'),ferries:count('ferry'),ambient:count('wagon')+count('civil'),meshes:entityMeshes},
    rural:d,smokeEvents:smoke.length,browserTest:false
  },null,2));
})().catch(e=>{console.error(e);process.exit(1);});
