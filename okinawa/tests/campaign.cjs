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
const board=html('index.html').match(/<main class="board">([\s\S]*?)<\/main>/)[1];
const entries=[...board.matchAll(/href="([^"]+)"/g)].map(m=>new URL(m[1].replaceAll('&amp;','&'),'https://example.org/'));
assert.deepEqual(entries.map(u=>u.pathname),[
 '/torpedo-carrier.html','/remagen-mission.html'
],'only the two current real-terrain campaigns appear on the board');
assert.equal(entries[1].searchParams.get('campaign'),'1','Europe opens the real-terrain campaign');
const displayedBuild=html('index.html').match(/Operations Board · BUILD (\d+)/)?.[1];
assert.ok(displayedBuild,'the operations board identifies its build');
assert.equal(entries[0].searchParams.get('v'),displayedBuild,'Pacific link bypasses stale startup HTML');
assert.equal(entries[1].searchParams.get('v'),displayedBuild,'campaign link bypasses stale startup HTML');
for(const classic of ['torpedo-carrier-open-sea.html','thunderbolt-europe.html']){
 assert.match(html(classic),/id="missionSel"/,`${classic} has a mission selection`);
 assert.match(html(classic),/const MISSIONS\s*=\s*\[/,`${classic} defines its missions`);
}
assert(!entries.some(u=>u.pathname.includes('preview')||u.pathname.includes('demo-remagen')),
 'landscape-only previews are separate from playable modes');
assert.match(html('remagen-mission.html'),/SquadronCampaign\.record\('europeRhine',mission\)/);
assert.match(html('remagen-mission.html'),/const airLeft=blockingEnemyAir\(\).length/,
 'landing counts active objectives while allowing the optional Komet pursuer to be evaded');
assert.match(html('torpedo-carrier.html'),/await prepareOkinawa\(\);[\s\S]*?await preparePacificModels\(MISSIONS\[idx\][\s\S]*?startMission\(idx\);/,'every Pacific sortie prepares mapped coast and required models before flight');
const carrier=html('torpedo-carrier.html');
const waveStart=carrier.indexOf('function checkObjectiveCleared(){');
const waveEnd=carrier.indexOf('\nfunction ',waveStart+10);
const theater=vm.runInNewContext(html('pacific-theater.js')+'\nwindow.PacificTheater',{window:{}});
const carrierMissions=vm.runInNewContext(carrier.slice(carrier.indexOf('const MISSIONS = ['),carrier.indexOf('\nasync function prepareOkinawa'))+'\nMISSIONS',{PacificTheater:theater});
const sortie=carrierMissions[12];
assert.equal(sortie.reinforcement.targets.length,2,'Okinawa reconnaissance has a second convoy');
const spawned=[],jets=[],pilot={rtb:false};let points=0;
const stage=vm.createContext({MISSIONS:carrierMissions,mission:12,reinforcementsLaunched:false,
 ships:[{def:sortie.targets[0],alive:false}],P:pilot,isDefend:()=>false,shoreTargets:[],pacificOps:null,
 spawnShip:def=>{spawned.push(def);stage.ships.push({def,alive:true});},
 spawnZero:i=>jets.push(i),flash(){},radioSay(){},addScore:n=>{points+=n;}});
stage.hasRaiders=()=>false;
vm.runInContext(carrier.slice(carrier.indexOf('function pacificTargetsClear(){'),carrier.indexOf('const COASTAL_STRIKE=')),stage);
vm.runInContext(carrier.slice(waveStart,waveEnd),stage);
stage.checkObjectiveCleared();
assert.equal(spawned.length,2);assert.equal(jets.length,1);assert.equal(pilot.rtb,false,'first kill starts second phase');
stage.ships.find(s=>s.def.type==='freighter'&&s.alive).alive=false;
stage.checkObjectiveCleared();
assert.equal(pilot.rtb,true,'second kill unlocks carrier recovery');assert.equal(points,500);
const script=html('remagen-mission.html');
const start=script.indexOf('const MISSIONS=['),end=script.indexOf('\nfunction M()',start);
const missions=vm.runInNewContext(script.slice(start,end)+'\nMISSIONS',{});
assert.equal(missions.length,29,'training plus twenty-seven real-terrain combat sorties (the three Storch bonuses are appended last)');
assert.deepEqual([...new Set(missions.map(m=>m.ac))].sort(),['bf109','fi156','fw190','ju87','me163','me262','p47']);
assert.equal(missions.filter(m=>m.kills||m.enemyAir||m.bombers).length,27);
assert.equal(missions.filter(m=>m.ac==='me262').length,4,'four jet sorties');
assert.equal(missions[16].ac,'me163','original Komet interception retains its index');
assert.equal(missions[17].ac,'ju87','Ju 87 bonus retains its index');
assert.equal(missions[17].traffic,'convoy','Stuka bonus targets real moving vehicles');
assert.equal(missions[18].id,'jetambush');assert.equal(missions[19].id,'kometdash');
assert.equal(missions[20].id,'nightworks','night sortie appends without shifting saved mission indices');
assert.equal(missions[20].night,true);assert.equal(missions[20].ac,'p47');
assert.equal(missions[21].id,'rotte','the two-ship bonus appends without shifting saved mission indices');assert.equal(missions[21].squad.n,1);assert.equal(missions[21].bonus,true);
assert.equal(missions[22].id,'buzz','the V-1 bonus appends without shifting saved mission indices');assert.equal(missions[22].bonus,true);assert.equal(missions[22].kills.ramp,1);assert.ok(missions[22].ramp&&!missions[22].squad,'a solo sortie against the ramp');
assert.equal(missions[23].id,'depot','the depot bonus appends without shifting saved mission indices');assert.equal(missions[23].bonus,true);assert.equal(missions[23].kills.depot,6);assert.ok(missions[23].depot);
assert.equal(missions[24].id,'storch','the Storch bonus appends without shifting saved mission indices');assert.equal(missions[24].bonus,true);assert.equal(missions[24].kills.storch,1);assert.ok(missions[24].storch);
assert.equal(missions[25].id,'schraege','the night-hunt bonus appends without shifting saved mission indices');assert.equal(missions[25].bonus,true);assert.equal(missions[25].night,true);assert.equal(missions[25].kills.nightfighter,3);assert.ok(missions[25].schraege&&missions[25].radar);
assert.equal(missions[26].id,'rescue','the Storch rescue appends without shifting saved mission indices');assert.equal(missions[26].ac,'fi156');assert.equal(missions[26].kills.rescued,1);assert.ok(missions[26].rescue&&missions[26].bonus);
assert.equal(missions[27].id,'spotter');assert.equal(missions[27].ac,'fi156');assert.equal(missions[27].kills.zone,3);assert.ok(missions[27].spotter);
assert.equal(missions[28].id,'rats');assert.equal(missions[28].ac,'fi156');assert.ok(missions[28].rats&&missions[28].bonus);
const plans=vm.runInNewContext(html('operation-plans.js')+'\nwindow.FlightPlans',{window:{}});
assert.equal(plans.europe.length,missions.length,'every Rhine sortie gets its own weather/operation plan');
assert.equal(plans.europe[16].fuel,65,'original rocket sortie has limited powered flight');
for(const i of [16,19]){assert.equal(plans.europe[i].events[0].glide,true,'both Komet pursuits start after the engine stops');assert.equal(plans.europe[i].events[0].escapeThreat,true,'pursuer can be evaded on landing');}
for(const m of missions){if(m.kills?.truck)assert.equal(m.traffic||m.id,'convoy');
 if(m.kills?.ferry)assert.equal(m.traffic||m.id,'ferry');
 if(m.kills?.train)assert.equal(m.traffic||m.id,'train');}
console.log('Two playable modes, twenty real-Rhine sorties, appended night operation and two-ship bonus, original saved indices and fresh progression verified');
