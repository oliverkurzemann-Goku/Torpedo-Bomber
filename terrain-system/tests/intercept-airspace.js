// Actual mission spawn/AI/integration, checked against every shipped DEM tile.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three');global.THREE=THREE;require('../../game-runtime.js');const {GameRuntime}=global;
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system/HeightProvider.js'),'utf8'));
global.fetch=async url=>{const b=fs.readFileSync(path.join(root,url));return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
const helpers=html.slice(html.indexOf('function flightAltitudeLimit('),html.indexOf('function spawnEnemyAir('));
(async()=>{
 const dem=new DEMHeightProvider(4000,'terrain-system/real/data/dem/');
 await Promise.all(Array.from({length:56},(_,i)=>dem.loadTile(i%7,Math.floor(i/7))));
 const P={ac:'me262',pos:new THREE.Vector3(23600,400,25725),spd:160,pitch:.3,roll:0,heading:0,alive:false};
 const randomMath=Object.create(Math);let seed=155;
 randomMath.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const ctx=vm.createContext({THREE,GameRuntime,Math:randomMath,P,RTILE:4000,RGRID_W:7,RGRID_H:8,AF_X:23600,AF_Z:25725,
  europeOps:null,enemyAir:[],scene:new THREE.Scene(),modelTpl:{},APP_SPD:56,AI_G:9.81,
  M:()=>({id:'jetboxes'}),groundY:(x,z)=>dem.getHeight(x,z),D:()=>({id:'rookie'}),
  noseDir:()=>new THREE.Vector3(0,0,1),radioSay(){},spawnSmoke(){},
  buildAircraft(){const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(31,8,23)));return g;}
 });
 vm.runInContext(html.slice(html.indexOf('const AC={'),html.indexOf('function acDef('))+helpers+
  html.slice(html.indexOf('function spawnEnemyAir('),html.indexOf('function damageEnemyAir('))+
  html.slice(html.indexOf('function aiSpec('),html.indexOf('function damagePlayer(')),ctx);
 const sector=ctx.combatSectorPoint();assert(sector.x<21000&&sector.z<25000,'German interception sector is inland');
 ctx.spawnBombers(3,'b24');ctx.spawnEnemyAir(2,'p47');
 for(const e of ctx.enemyAir){
  const margin=Math.min(e.pos.x,28000-e.pos.x,e.pos.z,32000-e.pos.z);
  assert(margin>=5000,'contacts spawn at least five kilometres from the boundary');
  assert(e.pos.y>dem.getHeight(e.pos.x,e.pos.z)+300&&e.pos.y<ctx.flightAltitudeLimit()-300,'contacts are above real terrain and within climb range');
 }
 // Reproduces the old low-cloud wall: bomber >800m, player was clamped to 800m.
 const integrationStart=html.indexOf('  // integrate\n',html.indexOf('function updateFlight(dt)'));
 const integrationEnd=html.indexOf('  // fuel\n',integrationStart);
 assert(integrationStart>0&&integrationEnd>integrationStart);
 ctx.ceilingY=800;ctx.dt=.05;ctx.vs=100;ctx.clampToWorldBounds=()=>{};P.pos.y=850;
 vm.runInContext(html.slice(integrationStart,integrationEnd),ctx);
 assert.equal(P.pos.y,855,'player can climb through low overcast, not hit an invisible wall');
 for(const ac of ['me262','me163']){P.ac=ac;assert.equal(ctx.flightAltitudeLimit(),8000);}
 P.pos.y=8050;vm.runInContext('{'+html.slice(integrationStart,integrationEnd)+'}',ctx);assert.equal(P.pos.y,8000,'real aircraft limit still bounds flight');
 P.pos.set(sector.x,1200,sector.z);P.ac='me262';
 let minimum=Infinity;
 // A moving player attempts to draw fighters toward each edge. Bomber stream keeps cruising.
 for(let i=0;i<12000;i++){
  const side=Math.floor(i/3000)%4;
  P.pos.x=[27600,400,14000,14000][side];P.pos.z=[16000,16000,31600,400][side];
  ctx.updateEnemyAir(.05);
  for(const e of ctx.enemyAir){
   const margin=Math.min(e.pos.x,28000-e.pos.x,e.pos.z,32000-e.pos.z);minimum=Math.min(minimum,margin);
   assert(margin>=3799.9,'contacts remain well inside operational area throughout ten minutes');
   assert(e.pos.y<=ctx.flightAltitudeLimit()-449,'fighters cannot climb beyond player reach');
  }
 }
 assert(minimum>3900,'normal turn anticipation avoids activating the defensive position clamp');
 console.log('Actual DEM + mission AI: inland spawn, low-cloud climb to 8,000m, ten-minute routes; minimum edge distance '+Math.round(minimum)+'m');
})().catch(e=>{console.error(e);process.exitCode=1;});
