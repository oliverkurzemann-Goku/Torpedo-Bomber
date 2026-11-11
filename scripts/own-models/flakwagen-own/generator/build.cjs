'use strict';
const {make,reference,rig}=require('./config.cjs');
const {Mesh,X,Y,block,beam,tube}=require('./mesh.cjs');
const {wheels,wreckNode,sectionY,panelNumber}=require('./parts.cjs');
const info={id:'flakwagen-own',kind:'flakwagen',class:'ground-vehicle',title:'Flakvierling platform wagon',
 texture:1024,seed:38021944,references:[
  reference('Vierlingsflak auf Eisenbahn, Bundesarchiv Bild 101I-621-2944-26A',
   'https://commons.wikimedia.org/wiki/File:Bundesarchiv_Bild_101I-621-2944-26A,_Vierlingsflak_auf_Eisenbahn.jpg',
   'CC BY-SA 3.0 DE photograph','Period exterior context for an open railway AA platform.'),
  reference('Rail track gauge, European Union Agency for Railways','https://www.era.europa.eu/era-railway-terminology-collection/railtrackgauge/term/eu_policy',
   'Public reference page; no open reuse license used','Nominal 1,435 mm standard track gauge.'),
 ]};
const {scene,root,uv,write}=make(info,{
 armor:{a:'b79f5b',b:'4f5c3a',tones:['b79f5b','8e8453','4f5c3a','5a3a2c'],mode:'stripe',sample:(u,v)=>{
   if(Math.abs(v-.32-u*.23)<.024&&u>.12&&u<.85)return 10;
   if(Math.sin(u*53+v*18)*Math.sin(v*33)> .86&&v>.18&&v<.59)return 11;
 }},
 numbered:{a:'80704d',b:'5a3a2c',mode:'metal',sample:(u,v)=>panelNumber('428',u,v,.18,.30,.63,.44)},
 steel:{a:'4a3a30',b:'664939',mode:'rust'},
 rubber:{a:'433e36',b:'544439',mode:'tyre'},
 dark:{a:'34312d',b:'4d4639',mode:'wreck'},
 sandbag:{a:'9a8862',b:'71624c',mode:'wood'},
 wood:{a:'796543',b:'4b4030',mode:'wood'},
 wreck:{a:'3b3530',b:'86563b',mode:'wreck'},
},{length:12,width:3,height:3.4,trackGauge:1.435});
const intact=scene.node('Intact',root),frame=new Mesh(),sides=new Mesh(),supplies=new Mesh();
block(frame,uv('steel'),[0,.88,0],[2.58,.30,10.94]);
block(frame,uv('wood'),[0,1.085,0],[2.93,.14,10.79]);
for(const x of [-1.17,1.17]){
 block(frame,uv('steel'),[x,.72,0],[.29,.28,10.83]);
 for(const z of [-3.1,-1.5,1.5,3.1])beam(frame,uv('dark'),[x,.53,z],[0,.79,z+.37],.11);
}
for(const s of [-1,1]){
 const z=s*5.47;
 block(frame,uv('numbered'),[0,.82,z],[2.96,.29,.14]);
 for(const x of [-.90,.90]){
  tube(frame,uv('steel'),[x,.82,z],[x,.82,s*5.92],.092,.092,12);
  tube(frame,uv('dark'),[x,.82,s*5.92],[x,.82,s*6],.19,.18,16);
 }
 beam(frame,uv('dark'),[0,.71,z],[0,.60,s*5.92],.09);
 tube(frame,uv('dark'),[-.10,.60,s*5.87],[.10,.60,s*5.87],.083,.083,12);
}
scene.node('WagonFrame',intact,{mesh:frame});
for(const [label,sign] of [['Front',1],['Rear',-1]]){
 const p=sign*3.48,bogie=new Mesh();
 block(bogie,uv('steel'),[0,.58,0],[2.02,.27,2.22]);
 for(const z of [-.83,.83]){
  tube(bogie,uv('steel'),[-1.10,.435,z],[1.10,.435,z],.097,.097,12);
  for(const side of [-1,1]){
   const x=side*.8215;
   wheels(bogie,uv,x,.435,z,.423,.18,{count:18,paint:'steel'});
   tube(bogie,uv('steel'),[side*.7175,.435,z],[side*.7515,.435,z],.435,.435,20);
   block(bogie,uv('dark'),[side*1.045,.64,z],[.19,.28,.44]);
  }
 }
 scene.node('Bogie'+label,intact,{translation:[0,0,p],mesh:bogie});
}
for(const s of [-1,1]){
 for(let i=0;i<5;i++){
  const z=-4.28+2.14*i;
  const lowered=(i===1&&s===1)||(i===3&&s===-1);
  block(sides,uv('armor'),[s*1.435,lowered?1.45:1.745,z],[.13,lowered?.64:1.20,2.085]);
  if(lowered)block(sides,uv('wood'),[s*1.36,1.75,z],[.27,.11,2.03]);
  block(sides,uv('steel'),[s*1.355,1.25,z-1.05],[.11,.20,.14]);
 }
 block(sides,uv('armor'),[0,1.745,s*5.37],[2.84,1.20,.14]);
}
scene.node('PanelArmour',intact,{mesh:sides});
for(const s of [-1,1])for(const z of [-4.49,4.49]){
 for(let i=0;i<3;i++){
  const x=s*(.82+i*.18);
  block(supplies,uv('sandbag'),[x,1.27+(i%2)*.11,z+(i%2)*.26],[.25,.22,.61]);
 }
}
for(const z of [-2.43,-1.77,1.73,2.39]){
 block(supplies,uv('wood'),[.69,1.34,z],[.49,.37,.57]);
 block(supplies,uv('dark'),[.69,1.522,z],[.54,.07,.59]);
}
tube(supplies,uv('steel'),[1.11,1.15,-4.83],[1.11,2.38,-4.83],.038,.038,9);
tube(supplies,uv('dark'),[1.11,2.36,-4.83],[1.11,2.41,-4.83],.122,.122,14);
scene.node('StowageAndBrake',intact,{mesh:supplies});
const ped=new Mesh();
sectionY(ped,uv('steel'),0,0,[[1.154,.77,.73],[1.35,.63,.64],[1.65,.48,.50],[1.69,.48,.49]],24);
scene.node('Turntable',intact,{mesh:ped});
const turret=scene.node('Turret',intact,{translation:[0,1.68,0],extras:rig('yaw',Y)});
const seat=new Mesh();
block(seat,uv('armor'),[0,.40,-.14],[1.36,.39,1.28]);
for(const x of [-.71,.71]){
 block(seat,uv('steel'),[x,.43,-.40],[.32,.12,.51]);
 block(seat,uv('armor'),[x,.61,-.64],[.33,.39,.10]);
 beam(seat,uv('dark'),[x*.78,.24,-.13],[x,.58,.28],.080);
}
scene.node('MountAndSeats',turret,{mesh:seat});
const gun=new Mesh(),pivot=[0,1.12,.14];
block(gun,uv('armor'),[0,.35,.13],[1.27,.50,.12]);
block(gun,uv('steel'),[0,.03,-.38],[.92,.57,.62]);
for(const [i,[x,y]] of [[-.29,.17],[.29,.17],[-.29,-.17],[.29,-.17]].entries()){
 tube(gun,uv('armor'),[x,y,-.22],[x,y,.44],.077,.055,12);
 tube(gun,uv('dark'),[x,y,.44],[x,y,1.49],.052,.040,12);
}
const gunNode=scene.node('Gun',turret,{mesh:gun,translation:pivot,extras:rig('pitch',X)});
[[-.29,.17],[.29,.17],[-.29,-.17],[.29,-.17]].forEach(([x,y],i)=>scene.node('Muzzle'+(i+1),gunNode,
 {translation:[x,y,1.49],extras:{direction:[0,0,1]}}));
const wreck=new Mesh();
block(wreck,uv('wreck'),[0,.64,0],[2.83,.24,10.94]);
for(const z of [-3.48,3.48])for(const dz of [-.83,.83])for(const x of [-.8215,.8215])
 wheels(wreck,uv,x,.435,z+dz,.435,.18,{count:12,hub:false,tyre:'wreck'});
for(const s of [-1,1]){
 block(wreck,uv('steel'),[0,.62,s*5.83],[2.55,.21,.34]);
 beam(wreck,uv('wreck'),[s*1.34,.78,-4.7],[s*.91,1.46,3.9],.19,.30);
}
beam(wreck,uv('wreck'),[0,1.07,-.55],[.87,1.71,.59],.53,.45);
wreckNode(scene,root,wreck);
write();
