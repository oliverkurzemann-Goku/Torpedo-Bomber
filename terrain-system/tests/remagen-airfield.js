#!/usr/bin/env node
// Real Three.js r128 + shipped DEM; geometry validation, NOT a GPU render test.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');
global.THREE=require(process.env.THREE_R128||'three');
assert.equal(THREE.REVISION,'128');
for(const name of ['HeightProvider','TerrainTile','TerrainManager','OSMManager','WorldVehicles','AirfieldDetails','AircraftGround','AirfieldActivity'])
  vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system',name+'.js'),'utf8'));
global.fetch=async url=>{
  const b=fs.readFileSync(path.join(root,url.split('?')[0]));
  return {ok:true,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};
};
(async()=>{
  const scene=new THREE.Scene(),dem=new DEMHeightProvider(4000,'terrain-system/real/data/dem/');
  await Promise.all([[1,3],[5,6],[6,6]].map(([x,z])=>dem.loadTile(x,z)));
  const terrain=Object.create(TerrainManager.prototype);
  Object.assign(terrain,{scene,tileSize:4000,heightProvider:dem,tiles:new Map(),material:new THREE.MeshStandardMaterial()});
  terrain.ensureTile(1,3,0);
  terrain.ensureTile(5,6,0);
  terrain.ensureTile(6,6,0);
  const osm=new OSMManager(scene,4000,terrain,'terrain-system/real/data/osm/');
  const originalTerrainMaterial=terrain.material;
  const html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
  // Execute the actual mission integration, not a duplicated constructor invocation.
  const start=html.indexOf('let airfield=null,'),end=html.indexOf('// ===',start);
  const context=vm.createContext({THREE,AirfieldDetails,AirfieldActivity,terrain,osmMgr:osm,scene,
    AF_X:6000,AF_Z:15800,ALLIED_AF_X:6000,ALLIED_AF_Z:15800,
    GERMAN_AF_X:23600,GERMAN_AF_Z:25725,RWY_LEN:900,RWY_W:40});
  vm.runInContext(html.slice(start,end)+'\nbuildAirfield(); globalThis.field=airfieldDetails;',context);
  const f=context.field;
  assert(scene.children.includes(f.group)); assert.equal(terrain.material,originalTerrainMaterial);
  assert(html.includes('AirfieldDetails.js?v=169'));
  for(const [dx,dz,offset] of [[0,0,.16],[0,5,.22],[-318,-83,.16],[0,100,0]])
    assert(Math.abs(AircraftGround.height(terrain,6000+dx,15800+dz)-terrain.getRenderedHeight(6000+dx,15800+dz)-offset-.02)<1e-8,'tyres touch the visible runway/apron surface'); assert(html.includes('MODULE 23'));
  assert(html.includes('if(airfieldDetails)airfieldDetails.refresh()'));
  assert.equal(OSMManager.BUILD,23);
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
      ray.set(new THREE.Vector3(6000+dx,2000,15800+dz),new THREE.Vector3(0,-1,0));
      const hits=ray.intersectObjects(f.ground);assert(hits.length,'runway has a hole');
      assert(hits[0].point.y>terrain.getRenderedHeight(6000+dx,15800+dz));
    }
  }
  for(const {name,bounds:b} of f.parts){
    // The whole active runway (plus wing clearance) remains clear of solid detail.
    assert(b.max.z<15800-20||b.min.z>15800+20,`runway obstruction: ${name}`);
    if(name==='hut'||name==='shelter'){
      for(let i=0;i<=4;i++)for(let j=0;j<=2;j++){
        const h=terrain.getRenderedHeight(b.min.x+(b.max.x-b.min.x)*i/4,b.min.z+(b.max.z-b.min.z)*j/2);
        assert(b.min.y<h&&b.max.y>h+2,'foundation floats or hut buried');
      }
    }
  }
  ground();
  // No allocations when LOD is unchanged; defer updates while terrain morphs.
  const tile=terrain.tiles.get('1,3'),before=f.ground.map(m=>m.geometry);
  f.refresh();assert(f.ground.every((m,i)=>m.geometry===before[i]));
  tile.setLOD(2,terrain.material);tile.updateMorph(.2);f.refresh();
  assert(f.ground.every((m,i)=>m.geometry===before[i]));
  tile.updateMorph(1);f.refresh();ground();
  tile.setLOD(0,terrain.material);tile.updateMorph(1);f.refresh();ground();
  vm.runInContext('buildGermanAirfield();globalThis.germanField=germanAirfieldDetails;',context);
  const german=context.germanField;
  assert(scene.children.includes(german.group),'separate eastern airfield appears in the world');
  assert(german.ground.length>0&&german.parts.length>0,'German strip has runway and buildings');
  for(const {name,bounds:b} of german.parts)
    assert(b.max.z<25725-20||b.min.z>25725+20,`German runway obstruction: ${name}`);
  german.group.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  for(const dx of [-440,-400,0,400,440])for(const dz of [-18,0,18]){
    ray.set(new THREE.Vector3(23600+dx,2000,25725+dz),new THREE.Vector3(0,-1,0));
    const hits=ray.intersectObjects(german.ground);assert(hits.length,'German runway has a hole');
    assert(hits[0].point.y>terrain.getRenderedHeight(23600+dx,25725+dz));
  }
  const baseStart=html.indexOf('const ALLIED_AF_X='),baseEnd=html.indexOf('// ---- flight envelope',baseStart);
  const selection=vm.createContext({terrain,AF_Y:0});
  vm.runInContext(html.slice(baseStart,baseEnd)+
    '\nglobalThis.select=ac=>{selectMissionAirfield({ac});return [AF_X,AF_Z,AF_Y];};',selection);
  assert.deepEqual(Array.from(selection.select('p47')),[6000,15800,terrain.getHeight(6000,15800)]);
  for(const ac of ['bf109','fw190','ju87','me262','me163'])
    assert.deepEqual(Array.from(selection.select(ac)),[23600,25725,terrain.getHeight(23600,25725)],`${ac} starts from the German base`);
  const activity=vm.runInContext('alliedActivity',context);
  assert.equal(activity.crew.length,12);assert.equal(activity.parked.length,2);assert.equal(activity.trucks.length,2);
  const pose=activity.people.limbs.instanceMatrix.array.slice();
  activity.update(1,6000,15800);
  assert.notDeepEqual(activity.people.limbs.instanceMatrix.array,pose,'crew must actually animate');
  let activityMeshes=0;activity.group.traverse(o=>{if(o.isMesh)activityMeshes++;});
  assert(activityMeshes<=30,'service scenes exceed draw-call budget: '+activityMeshes);
  let mountedSeen=false,cartTravel=0,last=activity.trolley.position.clone(),payloadMaxStep=0;
  const lastPayload=activity.payload.position.clone();
  for(let t=0;t<288;t+=.25){
    activity.update(.25,6000,15800);
    for(const crew of activity.crew)assert(crew.drawZ<-27,'crew walks into active runway');
    for(const truck of activity.trucks)assert(truck.model.position.z<-42,'supply truck drives into active runway');
    assert(activity.trolley.position.z+2<-27&&activity.payload.position.z+2<-27,'moving trolley and ordnance stay clear of the runway');
    assert(Math.abs(activity.trolley.position.y-activity.ground(activity.trolley.position.x,activity.trolley.position.z))<.001,'trolley follows rendered terrain throughout its route');
    for(const loader of activity.crew.slice(0,2))assert(Math.hypot(loader.drawX-activity.loading.x,loader.drawZ-activity.loading.z)<3,'loaders accompany the actual trolley');
    mountedSeen ||= activity.loading.mounted;
    cartTravel+=activity.trolley.position.distanceTo(last);last.copy(activity.trolley.position);
    payloadMaxStep=Math.max(payloadMaxStep,activity.payload.position.distanceTo(lastPayload));lastPayload.copy(activity.payload.position);
  }
  assert(mountedSeen&&cartTravel>100,'service cycle transfers the load and returns the trolley');
  assert(payloadMaxStep<2,'payload must not teleport at transfer or cycle boundaries: '+payloadMaxStep);
  const sharedGeo=new THREE.BoxGeometry(10,2,8),template=new THREE.Group();
  template.add(new THREE.Mesh(sharedGeo,new THREE.MeshLambertMaterial()));
  let sharedDisposed=false;sharedGeo.addEventListener('dispose',()=>sharedDisposed=true);
  activity.setAircraft(template,'p47');activity.time=36;activity.update(0,6000,15800);
  assert(activity.payload.visible&&activity.loading.mounted,'P47 receives the external practice load');
  activity.setAircraft(template,'me163');assert(!activity.payload.visible,'Komet service must not fit an external bomb');
  assert(!sharedDisposed,'service aircraft preserve shared loaded model resources');
  for(const part of activity.parts)assert(Math.abs(part.z)-part.d/2>27,'supplies obstruct runway');
  console.log(JSON.stringify({meshes:meshes.length,groundBatches:f.ground.length,parts:f.parts.length,samples,maxDrapeError,activityMeshes,cartTravel,payloadMaxStep,spawnAndRunwayClear:true,browserTest:false},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
