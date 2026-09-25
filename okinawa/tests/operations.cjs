/* NODE_PATH=/path/to/three@0.128.0/node_modules node okinawa/tests/operations.cjs */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),THREE=require('three');
const root=path.resolve(__dirname,'../..'),ctx=vm.createContext({THREE,console});ctx.window=ctx;
for(const f of ['sortie-systems.js','operation-plans.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx);
const {Operation}=ctx.FlightOps,plans=ctx.FlightPlans;
let op=new Operation({deadline:90,recon:{x:0,z:0,radius:100,min:30,max:200,seconds:5},events:[{kills:2,fighters:2,required:true}]});
assert.equal(op.ready(),false);
let state={pos:{x:0,y:100,z:0},kills:0,clear:false,complete:false};
for(let i=0;i<5;i++)op.tick(1,state);
assert.equal(op.reconDone,true);assert.equal(op.ready(),false,'recon does not bypass a pending enemy wave');
assert.equal(op.tick(1,{...state,kills:2}).filter(e=>e.fighters).length,1);
assert.equal(op.tick(1,{...state,kills:3}).filter(e=>e.fighters).length,0,'waves fire once');assert.equal(op.ready(),true);
op.tick(90,state);assert.equal(op.failed,true);assert.equal(op.ready(),false,'missed window cannot advance campaign');
op=new Operation({deadline:30});op.tick(60,{...state,complete:true});assert.equal(op.failed,false,'recovery has no artificial attack deadline');
for(const list of [plans.europe,plans.pacific])for(const c of list){
 for(const name of c.weather||[])assert(ctx.FlightOps.weather[name],name);
 for(const e of c.events||[]){if(e.weather)assert(ctx.FlightOps.weather[e.weather]);if(e.required)assert(e.kills!=null||e.at!=null||e.clear,'wave has reachable trigger');}
}
// Actual cloud groups lower with the weather and fog increases inside one.
const clouds=Array.from({length:40},()=>{const g=new THREE.Group();g.add(new THREE.Sprite(new THREE.SpriteMaterial()));return g;});
ctx.FlightOps.clouds(clouds,'clear');const clearBase=clouds[0].position.y;
ctx.FlightOps.clouds(clouds,'lowcloud');assert(clouds[0].position.y<clearBase/2);assert(clouds.every(c=>c.visible));
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xaaaaaa,300,3800);
ctx.FlightOps.visibility(scene,clouds,clouds[0].position.clone(), 'lowcloud',2);assert(scene.fog.far<400,'flying into cloud obscures distant objects');
// Actual Pacific objective code must include coastal targets and pending raid waves.
const pac=fs.readFileSync(path.join(root,'torpedo-carrier.html'),'utf8');
function func(s,name,next){const a=s.indexOf('function '+name+'('),b=s.indexOf('\nfunction '+next+'(',a);assert(a>0&&b>a);return s.slice(a,b);}
const pilot={rtb:false},ship={alive:false,def:{type:'freighter'}},ground={alive:true,def:{optional:false}};
const objective=vm.createContext({MISSIONS:[{}],mission:0,ships:[ship],shoreTargets:[ground],isDefend:()=>false,pacificOps:new Operation(),P:pilot,addScore(){},flash(){},radioSay(){}});
vm.runInContext(func(pac,'checkObjectiveCleared','spawnSplash'),objective);
objective.checkObjectiveCleared();assert.equal(pilot.rtb,false,'sinking the ship does not finish a combined land strike');
ground.alive=false;objective.checkObjectiveCleared();assert.equal(pilot.rtb,true);
// Real swept bullet impact and instanced marks on a sloping ground surface.
const eu=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8'),bullets=[];const mesh=new THREE.Mesh();mesh.position.set(0,10,0);
bullets.push({mesh,dir:new THREE.Vector3(1,-1,0).normalize(),speed:760,life:2,dmg:1});
const impacts=vm.createContext({THREE,Math,scene:new THREE.Scene(),groundY:(x,z)=>x*.01+z*.02,bullets,targets:[],enemyAir:[],spawnSmoke(){}});
vm.runInContext('let gunMarks=null,gunMarkNext=0;'+func(eu,'groundGunImpact','applyWeather')+func(eu,'updateBullets','dropBomb')+'\nglobalThis.marks=()=>gunMarks;',impacts);
impacts.updateBullets(.05);assert.equal(bullets.length,0);const marks=impacts.marks();assert.equal(marks.count,1);
const matrix=new THREE.Matrix4();marks.getMatrixAt(0,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix);
assert(Math.abs(p.y-(p.x*.01+p.z*.02)-.16)<.001,'mark sits above the terrain, not below the final bullet position');
for(let i=0;i<500;i++)impacts.groundGunImpact(i*.1,0);assert.equal(marks.count,320,'long strafing runs keep a bounded decal pool');
console.log('Operations: deadlines, reconnaissance, waves, cloud visibility, coastal completion and swept ground impacts OK');
// Long sorties must not strand bombers beyond the flight boundary or drive the carrier ashore.
const ai=vm.createContext({THREE,Math,RTILE:4000,RGRID_W:7,RGRID_H:8,groundY:()=>100,D:()=>({id:'rookie'}),P:{alive:false}});
vm.runInContext(func(eu,'updateBomber','damagePlayer'),ai);
const e={pos:new THREE.Vector3(1800,1100,16000),vel:new THREE.Vector3(-72,0,0),heading:-Math.PI/2,pitch:0,roll:0,group:new THREE.Group(),hp:30,maxhp:30,cool:999};
for(let i=0;i<24000;i++){ai.updateBomber(e,.05,null,99999);assert(e.pos.x>0&&e.pos.x<28000&&e.pos.z>0&&e.pos.z<32000,'bomber remains reachable inside terrain');}
const movement=pac.match(/CARRIER_SPD=Math\.max\(0,Math\.min\(5,\(1800-carrierX\)\*\.02\)\);[^\n]*\n\s*carrierX \+= CARRIER_SPD\*dt;/)[0];
const fleet=vm.createContext({Math,carrierX:0,CARRIER_SPD:5,dt:.05});vm.runInContext('for(let i=0;i<72000;i++){'+movement+'}',fleet);
assert(fleet.carrierX<=1800&&fleet.carrierX>1799);console.log('20-minute bomber route and one-hour offshore carrier station OK');
