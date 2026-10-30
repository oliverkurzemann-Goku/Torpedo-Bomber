/* Shared, validated custom-sortie catalogue. Mission slot 0 remains stable, so
 * campaign indices, unlocks and existing airborne saves do not shift. */
(function(root){
 'use strict';
 const planes={
  p47:{name:'P-47D Thunderbolt',theatre:'europe',kits:['guns','bombs','rockets','mixed','range'],bombs:2,rockets:8,tank:60},
  bf109:{name:'Bf 109F-2',theatre:'europe',kits:['guns','bombs','range'],bombs:1,tank:75},
  fw190:{name:'Fw 190A-8',theatre:'europe',kits:['guns','bombs','range'],bombs:1,tank:60},
  ju87:{name:'Ju 87B-2 Stuka',theatre:'europe',kits:['guns','bombs'],bombs:4},
  me262:{name:'Me 262A-1a/Jabo',theatre:'europe',kits:['guns','bombs'],bombs:2},
  me163:{name:'Me 163B Komet',theatre:'europe',kits:['guns'],airOnly:true},
  avenger:{name:'TBM Avenger',theatre:'pacific',kits:['guns','torpedo','bombs'],bombs:2},
  sbd:{name:'SBD Dauntless',theatre:'pacific',kits:['guns','bombs'],bombs:3},
  corsair:{name:'F4U-1D Corsair',theatre:'pacific',kits:['guns','bombs','rockets','mixed'],bombs:2,rockets:8},
  zero:{name:'A6M Zero',theatre:'pacific',kits:['guns']}
 };
 const tasks={
  europe:[{id:'free',name:'Free flight',note:'Explore the Rhine, practise manoeuvres and recover at your airfield.'},
   {id:'fighter',name:'Fighter patrol',note:'Clear the hostile fighter patrol, then return and land.'},
   {id:'intercept',name:'Bomber interception',note:'Intercept a bomber formation, then recover at your airfield.'},
   {id:'convoy',name:'Road convoy',note:'Destroy four vehicles on the valley road, then return to base.'},
   {id:'bridge',name:'Bridge strike',note:'Destroy the bridge with bombs, then recover at your airfield.'},
   {id:'factory',name:'Factory strike',note:'Strike the industrial works, then return to base.'}],
  pacific:[{id:'free',name:'Free flight',note:'Explore the Pacific coast and practise carrier recoveries.'},
   {id:'torpedo',name:'Torpedo strike',note:'Attack a merchant convoy and return to the carrier. One internal torpedo; deck service rearms you.'},
   {id:'ships',name:'Ship strike',note:'Attack the merchant ships with your selected bombs or rockets, then recover aboard.'},
   {id:'defend',name:'Fleet defence',note:'Intercept the incoming Avenger raid and protect the Japanese carrier.'}]
 };
 const kitNames={guns:'Guns only',bombs:'Bombs',rockets:'Rockets',mixed:'Bombs + rockets',range:'Guns + drop tank',torpedo:'Internal torpedo'};
 const weatherNames={clear:'Clear',haze:'Haze',broken:'Broken cloud',lowcloud:'Low cloud',rain:'Rain',storm:'Thunderstorm'};
 const clone=o=>JSON.parse(JSON.stringify(o));
 function aircraft(theatre,task){return Object.keys(planes).filter(ac=>{
  const p=planes[ac];if(p.theatre!==theatre)return false;
  if(theatre==='europe')return (task!=='intercept'||ac!=='p47')&&(!p.airOnly||['free','fighter','intercept'].includes(task));
  return task==='torpedo'?ac==='avenger':task==='defend'?ac==='zero':task==='ships'?ac!=='zero':true;
 });}
 function loadouts(ac,task){const p=planes[ac];if(!p)return [];
  return p.kits.filter(k=>task==='torpedo'?k==='torpedo':['bridge','factory','convoy'].includes(task)?['bombs','rockets','mixed'].includes(k)&&(task!=='bridge'||k!=='rockets'):task==='ships'?['bombs','rockets','mixed'].includes(k):true);
 }
 function defaults(theatre='europe'){return {version:1,theatre,task:'free',ac:theatre==='pacific'?'avenger':'p47',kit:'guns',weather:'clear',time:'day',start:'ground',difficulty:'vet',enemies:2,fuel:100};}
 function normalize(input){
  const c={...defaults(input?.theatre==='pacific'?'pacific':'europe'),...input};
  if(c.version!==1||!tasks[c.theatre]||!tasks[c.theatre].some(t=>t.id===c.task))throw Error('Unknown theatre or assignment.');
  if(!aircraft(c.theatre,c.task).includes(c.ac))throw Error('This aircraft is not available for the assignment.');
  if(!loadouts(c.ac,c.task).includes(c.kit))throw Error('Choose armament suitable for the assignment.');
  if(!Object.hasOwn(weatherNames,c.weather)||!['day','night'].includes(c.time)||!['ground','air'].includes(c.start)||!['rookie','vet','ace'].includes(c.difficulty))throw Error('Invalid flight conditions.');
  if(!Number.isInteger(c.enemies)||c.enemies<0||c.enemies>4||![50,75,100].includes(c.fuel))throw Error('Invalid enemy count or fuel.');
  if(['fighter','intercept','defend'].includes(c.task)&&c.enemies<1)throw Error('This assignment needs at least one enemy.');
  if(planes[c.ac].airOnly)c.start='air';
  if(c.task==='free'){c.enemies=0;c.fuel=100;}
  return Object.fromEntries(Object.keys(defaults()).map(k=>[k,c[k]]));
 }
 function stores(input){const c=normalize(input),p=planes[c.ac];
  return {bombs:['bombs','mixed'].includes(c.kit)?p.bombs||0:0,rockets:['rockets','mixed'].includes(c.kit)?p.rockets||0:0,
   torpedoes:c.kit==='torpedo'?1:0,tank:c.kit==='range'?p.tank||0:0,bombScale:c.ac==='corsair'&&c.kit==='mixed'?.8:1};
 }
 function fingerprint(c){let h=2166136261;for(const n of JSON.stringify(normalize(c))){h^=n.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
 function summary(input){const c=normalize(input),p=planes[c.ac],s=stores(c),task=tasks[c.theatre].find(t=>t.id===c.task);
  const armament=['Guns',s.bombs?s.bombs+' bombs':'',s.rockets?s.rockets+' rockets':'',s.torpedoes?'1 internal torpedo':'',s.tank?'Drop tank +'+s.tank+'%':''].filter(Boolean).join(' · ');
  return {title:task.name,aircraft:p.name,armament,conditions:weatherNames[c.weather]+' · '+(c.time==='night'?'Night':'Day')+' · '+(c.start==='air'?'Airborne start':c.theatre==='pacific'?'Carrier start':'Airfield start'),
   notes:task.note+(c.ac==='me163'?' Rocket interceptor: airborne after trolley release; recovery is an unpowered skid landing.':'')+(c.task==='free'?' Practice fuel is unlimited.':' Fuel: '+c.fuel+'% internal.')};
 }
 function mission(input){const c=normalize(input),s=stores(c),brief=summary(c),common={custom:c,customId:fingerprint(c),title:'Custom Sortie',sub:brief.title,weather:c.weather,free:c.task==='free',solo:true,
   text:brief.notes+'<br><br>'+brief.armament+'<br>'+brief.conditions,night:c.time==='night'};
  if(c.theatre==='europe'){
   const m={...common,ac:c.ac,id:c.task==='intercept'?'boxes':c.task==='convoy'&&c.ac!=='p47'?(c.ac==='ju87'?'stuka':'jabo'):c.task};
   if(c.task==='fighter')m.enemyAir=c.enemies;
   if(c.task==='intercept')m.bombers={n:c.enemies,type:'b17'};
   if(['convoy','bridge','factory'].includes(c.task)){m.kills=c.task==='convoy'?{truck:4}:c.task==='bridge'?{bridge:1}:{factory:1};m.enemyAir=c.enemies;m.flakDefense=c.task==='convoy'?0:1;if(c.task==='convoy')m.traffic='convoy';}
   return m;
  }
  const m={...common,body:common.text,time:c.time,fuel:c.fuel,torps:s.torpedoes||s.bombs,zeros:0,targets:[],loadout:c.kit==='torpedo'?'torpedo':'divebomb',defend:c.ac==='zero',sbd:['sbd','corsair'].includes(c.ac),corsair:c.ac==='corsair',raiders:c.task==='defend'?c.enemies:0};
  if(['ships','torpedo'].includes(c.task)){m.zeros=c.enemies;m.targets=[{type:'freighter',pos:[-350,0,3500],hp:1},{type:'freighter',pos:[450,0,4200],hp:1}];}
  return m;
 }
 function operation(input){const c=normalize(input);return {weather:[c.weather],practice:c.task==='free',fuel:c.fuel,events:[],notes:summary(c).notes};}
 const originals=new WeakMap();
 const key=theatre=>'custom-sortie-v1-'+theatre;
 function read(theatre,search='',storage){
  if(storage===undefined)try{storage=root.localStorage;}catch(_){storage=null;}
  const params=new URLSearchParams(search),fromURL=params.has('sortie');let raw;
  try{raw=fromURL?params.get('sortie'):storage?.getItem(key(theatre));if(!raw)return {config:null,requested:false,error:null};
   if(raw.length>1500)throw Error('Sortie setup is too long.');const config=normalize(JSON.parse(raw));if(config.theatre!==theatre)throw Error('The sortie belongs to a different theatre.');
   if(fromURL)try{storage?.setItem(key(theatre),JSON.stringify(config));}catch(_){}
   return {config,requested:fromURL,error:null};
  }catch(e){return {config:null,requested:fromURL,error:'Custom sortie could not load: '+e.message};}
 }
 function url(input){const c=normalize(input),params=new URLSearchParams({sortie:JSON.stringify(c),v:'224'});return (c.theatre==='pacific'?'torpedo-carrier.html':'remagen-mission.html')+'?'+params;}
 function install(theatre,missions,plans,search,storage){if(!originals.has(missions))originals.set(missions,{mission:missions[0],plan:plans[0]});const request=read(theatre,search,storage);if(request.config){missions[0]=mission(request.config);plans[0]=operation(request.config);}return request;}
 function checkpointIdentity(theatre,missions,i,saved){
  let m=saved&&!saved.custom&&i===0?(originals.get(missions)?.mission||missions[i]):missions[i];
  if(saved?.custom){try{const c=normalize(saved.custom);if(i!==0||c.theatre!==theatre)return null;m=mission(c);}catch(_){return null;}}
  if(!m)return null;
  return (theatre==='europe'?m.id+'|'+m.ac:m.title+'|'+m.sub)+(m.customId?'|'+m.customId:'');
 }
 function restoreSaved(theatre,saved,missions,plans){
  if(!saved.custom){const old=originals.get(missions);if(saved.mission===0&&old){missions[0]=old.mission;plans[0]=old.plan;}return null;}
  const c=normalize(saved.custom);if(saved.mission!==0||c.theatre!==theatre)throw Error('Checkpoint sortie does not match this theatre.');
  missions[0]=mission(c);plans[0]=operation(c);return c;
 }
 function launchState(input,kind,ctx){
  const c=normalize(input),p=ctx.P;ctx.setDifficulty?.(c.difficulty);
  if(c.start!=='air')return false;
  ctx.finishIntro?.();const {x,z,height,heading,speed}=ctx.departure;
  p.pos.set(x,height,z);p.heading=heading;p.pitch=p.roll=p.pitchVel=p.rollVel=p.vSpeed=0;p.spd=speed;p.throttle=.75;
  p.gear=p.gearTgt=p.flap=p.flapTgt=0;p.departureAge=null;p.groundPower=null;p.touchResolved=false;p.onGround=false;p.onDeck=false;p.deckRun=p.arrestRun=p.deckQuaternion=p.landingSample=null;
  ctx.setThrottle?.(.75);ctx.flight?.();return true;
 }
 const API={planes,tasks,kitNames,weatherNames,defaults,normalize,aircraft,loadouts,stores,summary,mission,operation,fingerprint,read,url,install,checkpointIdentity,restoreSaved,launchState};
 root.CustomSortie=API;if(typeof module==='object'&&module.exports)module.exports=API;
})(typeof window==='undefined'?globalThis:window);
