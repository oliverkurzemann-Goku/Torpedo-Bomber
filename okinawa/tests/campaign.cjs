const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const html=name=>fs.readFileSync(path.join(root,name),'utf8');
const db=new Map(),storage={getItem:k=>db.get(k)||null,setItem:(k,v)=>db.set(k,v)};
function openChapter(){const ctx=vm.createContext({window:{},localStorage:storage,Number,JSON});
 vm.runInContext(html('campaign.js'),ctx);return ctx.window.SquadronCampaign;}
const pac=openChapter();pac.record('pacific',11);pac.record('pacific',3);
const eu=openChapter();eu.record('europeRhine',3);
const legacy=openChapter();legacy.record('europe',13);legacy.record('remagen',2);
assert.equal(openChapter().highest('pacific'),11,'carrier progress survives chapter reload');
assert.equal(openChapter().highest('europeRhine'),3,'real Rhine progress survives reload');
assert.equal(openChapter().highest('europe'),13,'old synthetic sorties do not overwrite new progress');
assert.match(html('index.html'),/href="remagen-mission\.html\?campaign=1"/,'single Europe game opens real terrain');
assert.match(html('thunderbolt-europe.html'),/location\.replace\('remagen-mission\.html\?'/,'old Europe bookmarks redirect');
assert.match(html('remagen-mission.html'),/SquadronCampaign\.record\('europeRhine',mission\)/);
assert.match(html('remagen-mission.html'),/const airLeft=enemyAir.filter\(e=>e.alive\).length/,
 'landing counts every live aircraft, including reinforcements');
assert.match(html('torpedo-carrier.html'),/try\{await prepareOkinawa\(\);startMission\(idx\);\}/,'every Pacific sortie loads mapped coast');
const carrier=html('torpedo-carrier.html');
const waveStart=carrier.indexOf('function checkObjectiveCleared(){');
const waveEnd=carrier.indexOf('\nfunction ',waveStart+10);
const carrierMissions=vm.runInNewContext(carrier.slice(carrier.indexOf('const MISSIONS = ['),carrier.indexOf('\nasync function prepareOkinawa'))+'\nMISSIONS',{});
const sortie=carrierMissions[12];
assert.equal(sortie.reinforcement.targets.length,2,'Okinawa reconnaissance has a second convoy');
const spawned=[],jets=[],pilot={rtb:false};let points=0;
const stage=vm.createContext({MISSIONS:carrierMissions,mission:12,reinforcementsLaunched:false,
 ships:[{def:sortie.targets[0],alive:false}],P:pilot,isDefend:()=>false,shoreTargets:[],pacificOps:null,
 spawnShip:def=>{spawned.push(def);stage.ships.push({def,alive:true});},
 spawnZero:i=>jets.push(i),flash(){},radioSay(){},addScore:n=>{points+=n;}});
vm.runInContext(carrier.slice(waveStart,waveEnd),stage);
stage.checkObjectiveCleared();
assert.equal(spawned.length,2);assert.equal(jets.length,1);assert.equal(pilot.rtb,false,'first kill starts second phase');
stage.ships.find(s=>s.def.type==='freighter'&&s.alive).alive=false;
stage.checkObjectiveCleared();
assert.equal(pilot.rtb,true,'second kill unlocks carrier recovery');assert.equal(points,500);
const script=html('remagen-mission.html');
const start=script.indexOf('const MISSIONS=['),end=script.indexOf('\nfunction M()',start);
const missions=vm.runInNewContext(script.slice(start,end)+'\nMISSIONS',{});
assert.equal(missions.length,14,'training plus twelve real-terrain combat sorties');
assert.deepEqual([...new Set(missions.map(m=>m.ac))].sort(),['bf109','fw190','me262','p47']);
assert.equal(missions.filter(m=>m.kills||m.enemyAir||m.bombers).length,12);
for(const m of missions){if(m.kills?.truck)assert.equal(m.traffic||m.id,'convoy');
 if(m.kills?.ferry)assert.equal(m.traffic||m.id,'ferry');
 if(m.kills?.train)assert.equal(m.traffic||m.id,'train');}
console.log('Two integrated campaigns, all twelve real-Rhine sorties and fresh progression verified');
