/* Run: NODE_PATH=../test_deps/node_modules node okinawa/tests/ship-assets.cjs */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three');
const html=fs.readFileSync(path.resolve(__dirname,'../../torpedo-carrier.html'),'utf8');
function segment(from,to){
 const a=html.indexOf('function '+from+'('),b=html.indexOf('\nfunction '+to+'(',a+1);
 assert.ok(a>0&&b>a,from+' source found');return html.slice(a,b);
}
for(const name of ['merchant_ship.glb','ijn carrier.glb','uss_midway.glb']){
 const data=fs.readFileSync(path.resolve(__dirname,'../..',name));
 assert.equal(data.toString('ascii',0,4),'glTF',name+' is a real repository GLB');
 assert.equal(data.readUInt32LE(8),data.length);
}
const scene=new THREE.Scene(),ships=[],wingShots=[];let hits=0;
const ctx=vm.createContext({THREE,scene,ships,wingShots,Math,
 destroyerTemplate:null,freighterTemplate:null,cruiserTemplate:null,
 DEST_TARGET_LEN:60,FRT_TARGET_LEN:72,CRU_TARGET_LEN:105,
 hitShip:()=>hits++,spawnSplash:()=>{}});
vm.runInContext(segment('spawnShip','launch')+'\n'+segment('spawnWingShot','damageWingman'),ctx);
for(const type of ['destroyer','freighter','cruiser']){
 ctx.spawnShip({type,pos:[ships.length*200,0,0],hp:3});
 const s=ships.at(-1);
 assert.equal(s.group.children.length,0,'a loading '+type+' has no generated geometry');
 const asset=new THREE.Group();asset.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1)));
 ctx.upgradeShipsToTemplate(type,asset);
 assert.equal(s.usedFallback,false);
 assert.ok(s.group.children[0].children[0].isMesh,'the '+type+' gains the loaded model');
}
const target={alive:true,radius:20,group:new THREE.Group()};target.group.position.set(0,0,150);
ctx.spawnWingShot({sbd:false,pos:new THREE.Vector3(0,46,0),spd:58,heading:0},target);
assert.ok(wingShots[0].mesh.position.y>40,'wing torpedo starts at release altitude');
let reachedWater=false;
for(let i=0;i<16*60&&wingShots.length;i++){
 ctx.updateWingShots(1/60);
 if(wingShots.length&&wingShots[0].phase==='water') reachedWater=true;
}
assert.ok(reachedWater,'torpedo falls into the water before running');
assert.equal(hits,1,'aligned unguided torpedo reaches the target');
target.group.position.set(150,0,0);hits=0;
ctx.spawnWingShot({sbd:false,pos:new THREE.Vector3(0,46,0),spd:58,heading:0},target);
for(let i=0;i<16*60&&wingShots.length;i++)ctx.updateWingShots(1/60);
assert.equal(hits,0,'torpedo cannot steer sideways toward its target');
console.log('Repository ship loading and unguided wingman torpedo trajectory OK');
