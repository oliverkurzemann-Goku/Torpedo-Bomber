'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),THREE=require('three');
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
function func(name,next){const a=html.indexOf('function '+name+'('),b=html.indexOf('\nfunction '+next+'(',a);assert(a>0&&b>a);return html.slice(a,b);}
const system=vm.createContext({console});system.window=system;
for(const file of ['sortie-systems.js','operation-plans.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),system);
const {FlightOps,FlightPlans}=system;
for(const [id,index,n] of [['komet',16,2],['kometdash',19,1]])for(const fps of [20,60,120])for(const throttle of [.65,.03,0]){
 const mission={id,ac:'me163',bombers:{n}},P={ac:'me163',fuel:28,throttle,rtb:false,onGround:false,hull:75,pos:new THREE.Vector3(21000,1100,24000)},enemyAir=[];
 const results=[],recorded=[],log={landings:0,sorties:0,medals:{gold:0,silver:0,bronze:0}};
 const c=vm.createContext({THREE,FlightOps,P,enemyAir,europeOps:new FlightOps.Operation(FlightOps.withPhases(mission,FlightPlans.europe[index])),
  mission:0,MISSIONS:[mission],missionOver:false,sortieKills:{bomber:0},weather:'clear',hitsTaken:0,score:100,
  M:()=>mission,isFree:()=>false,isCircuits:()=>false,objectiveLeft:()=>({}),groundY:()=>100,targets:[],wingmen:[],
  document:{getElementById:()=>null},setThrottleUI(){},radioSay(){},flash(){},addScore(){},saveBest(){},setTimeout(){},
  loadLog:()=>log,logSortie:r=>{log.landings++;log.sorties++;if(r.medal)log.medals[r.medal]++;return log;},
  rankName:()=> 'Flight Officer',rankFor:()=>0,pilotName:()=> 'Test Pilot',airfieldName:()=> 'Forward Strip',
  bestScore:()=>0,isGermanMission:()=>true,showResult:(...r)=>results.push(r),SortieFeatures:{Damage:{hullPercent:()=>100}},
  spawnEnemyAir:n=>{for(let i=0;i<n;i++)enemyAir.push({alive:true});},spawnBombers(){},
  window:{SquadronCampaign:{record:(...r)=>recorded.push(r)}}});
 c.SquadronCampaign=c.window.SquadronCampaign;
 vm.runInContext('let fieldServicePending=false;'+[func('blockingEnemyAir','objectiveText'),func('checkObjective','shake'),func('updateEuropeOperation','buildRhineChart'),func('landed','relaunch')].join('\n'),c);
 enemyAir.push(...Array.from({length:n},()=>({alive:true,bomber:true,pos:P.pos.clone()})));
 // Locate and fight while still powered. No artificial manual operation unlock.
 for(let i=0;i<fps*3;i++)c.updateEuropeOperation(1/fps);
 assert(P.fuel===28,'rocket must stay powered while a bomber remains');
 for(const e of enemyAir)e.alive=false;c.sortieKills.bomber=n;
 for(let i=0;i<fps;i++)c.updateEuropeOperation(1/fps);
 assert.equal(P.fuel,0,'last bomber triggers the irreversible rocket cutoff even with throttle still open');
 assert.equal(P.throttle,0);assert.equal(P.rtb,true);assert.equal(c.europeOps.ready(),true);
 assert.equal(enemyAir.filter(e=>e.alive&&e.escapeThreat).length,1,'one optional pursuer, no mandatory extra kill');
 P.onGround=true;c.landed(true);c.landed(true);
 assert.equal(c.missionOver,true,'recovery ends the Komet sortie');assert.equal(vm.runInContext('fieldServicePending',c),false);
 assert.equal(results.length,1,'debrief opens once');assert.equal(results[0][0],true,'successful recovery');assert.equal(recorded.length,1);
 assert.equal(log.sorties,1,'one logbook entry');
}
// An early Komet recovery must finish incomplete, rather than refuel a one-shot rocket sortie.
for(const ac of ['me163','p47']){
 let result=null;
 const c=vm.createContext({P:{ac,throttle:.2,hull:75,fuel:20},missionOver:false,M:()=>({ac}),isFree:()=>false,isCircuits:()=>false,
  objectiveLeft:()=>({bomber:1}),blockingEnemyAir:()=>[],europeOps:{failed:false,ready:()=>false},mission:0,MISSIONS:[{}],
  setThrottleUI(){},flash(){},addScore(){},saveBest(){},hitsTaken:0,sortieKills:{},score:0,
  loadLog:()=>({landings:0}),logSortie:()=>({landings:1,medals:{gold:0,silver:0,bronze:1}}),rankName:()=>'',rankFor:()=>0,
  pilotName:()=>'',isGermanMission:()=>true,SortieFeatures:{Damage:{hullPercent:()=>100}},bestScore:()=>0,
  showResult:done=>result=done});
 vm.runInContext('let fieldServicePending=false;'+func('landed','relaunch'),c);c.landed(true);
 assert.equal(vm.runInContext('fieldServicePending',c),ac!=='me163');
 if(ac==='me163')assert.equal(result,false,'missing bomber never awards success');
}
console.log('Both Komet sorties: powered last kill, automatic glide/pursuer, successful landing and one debrief at 20/60/120 FPS; early recovery incomplete; prop ground service retained');
