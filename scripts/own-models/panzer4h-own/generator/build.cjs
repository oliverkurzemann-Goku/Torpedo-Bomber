'use strict';
const {make,reference,rig}=require('./config.cjs');
const {Mesh,X,Y,block,beam,tube}=require('./mesh.cjs');
const {prismatic,sectionY,wheels,track,wreckNode,panelNumber,crossMark}=require('./parts.cjs');
const info={id:'panzer4h-own',kind:'panzer4h',class:'ground-vehicle',title:'Panzerkampfwagen IV Ausf. H',
 texture:1024,seed:401944,references:[
  reference('Pz.Kpfw. IV Ausf.H, War Drawings technical data','https://www.wardrawings.be/WW2/Files/1-Vehicles/Axis/1-Germany/02-mPanzers/PzKpfw4/Data/PzKpfw-4H.htm',
   'Reference text and drawings, no open reuse license used','7.02 m length, 3.33 m skirt width, 2.68 m height, front drive wheel.'),
  reference('Panzer IV Ausf. H, History of War','https://www.historyofwar.org/Pictures/pictures_panzer_IV_ausf_H.html',
   'Reference photograph, rights as labeled on page','Exterior comparison and drive sprocket identification.'),
 ]};
const markings=(u,v)=>{const c=crossMark(u,v,.63,.49,.27,.51);if(c>=0)return c;return panelNumber('825',u,v,.14,.28,.29,.43);};
const {scene,root,uv,write}=make(info,{
 armor:{a:'b79f5b',b:'4f5c3a',tones:['b79f5b','98824a','4f5c3a','5a3a2c'],mode:'zimmerit'},
 insignia:{a:'b79f5b',b:'4f5c3a',tones:['b79f5b','98824a','4f5c3a','5a3a2c'],mode:'stripe',sample:markings},
 steel:{a:'735f47',b:'534335',mode:'rust'},
 rubber:{a:'4a4e4a',b:'695946',mode:'tyre'},
 tread:{a:'5d473a',b:'5c5348',mode:'track'},
 dark:{a:'31322e',b:'514c3e',mode:'wreck'},
 wood:{a:'755a3f',b:'5e513c',mode:'wood'},
 wreck:{a:'403730',b:'79533a',mode:'wreck'},
},{length:7.02,width:3.33,height:2.68,hullLength:5.92});
const intact=scene.node('Intact',root),hull=new Mesh(),rolling=new Mesh(),skirts=new Mesh(),stowage=new Mesh();
prismatic(hull,uv('armor'),[[.42,-3.16],[.38,2.32],[.73,2.76],[1.34,2.63],[1.58,1.98],[1.61,-2.73],[1.31,-3.10]],-1.31,1.31);
block(hull,uv('armor'),[0,1.42,-.13],[2.87,.30,4.72]);
block(hull,uv('armor'),[-.59,1.48,2.23],[.67,.18,.64]);
block(hull,uv('dark'),[-.64,1.46,2.558],[.41,.083,.07]);
const mg=new Mesh();
tube(mg,uv('armor'),[.53,1.28,2.57],[.53,1.28,2.69],.121,.101,16);
tube(mg,uv('dark'),[.53,1.28,2.69],[.53,1.28,2.76],.043,.038,12);
scene.node('Hull',intact,{mesh:hull});
scene.node('BowGunFairing',intact,{mesh:mg});
scene.node('Muzzle2',intact,{translation:[.53,1.28,2.76],extras:{direction:[0,0,1]}});
for(const s of [-1,1]){
 const x=s*1.225;
 track(rolling,uv('tread'),x,.416,-2.29,2.29,.42,.42);
 for(let i=0;i<8;i++)wheels(rolling,uv,x,.385,-1.75+i*.49,.299,.229,{count:18,paint:'armor'});
 for(const z of [-2.29,2.29])wheels(rolling,uv,x,.42,z,z>0?.39:.346,.286,{count:22,paint:z>0?'steel':'armor'});
 for(let i=0;i<4;i++)wheels(rolling,uv,x,.736,-1.73+i*1.06,.129,.20,{count:12,hub:false});
 for(let i=0;i<5;i++){
  if(s===-1&&i===4)continue;
  const z=-2.30+1.04*i;
  block(skirts,uv('armor'),[s*1.624,i===1&&s===1?1.035:1.085,z],[.082,.66,i===4?.79:.99]);
  beam(skirts,uv('steel'),[s*1.605,1.39,z],[s*1.34,1.50,z],.070);
 }
 block(skirts,uv('steel'),[s*1.56,1.45,-.17],[.10,.095,5.22]);
}
scene.node('TracksAndWheels',intact,{mesh:rolling});
scene.node('HullSchuerzen',intact,{mesh:skirts});
tube(stowage,uv('steel'),[-.89,.93,-3.028],[.92,.93,-3.028],.132,.132,22);
beam(stowage,uv('dark'),[.91,.94,-3.03],[1.07,1.23,-2.90],.081);
for(const x of [-.75,.75])block(stowage,uv('dark'),[x,1.31,-3.059],[.35,.35,.14]);
block(stowage,uv('insignia'),[.02,1.29,-3.13],[1.21,.25,.032]);
for(const s of [-1,1]){
 beam(stowage,uv('wood'),[s*.91,1.607,-1.94],[s*1.12,1.607,-.77],.084);
 block(stowage,uv('steel'),[s*1.12,1.626,-.76],[.28,.070,.23]);
}
for(let i=0;i<6;i++)block(stowage,uv('tread'),[-.80+i*.28,1.21,2.655],[.25,.21,.15]);
scene.node('ToolsSpareLinksAndExhaust',intact,{mesh:stowage});
const turret=scene.node('Turret',intact,{translation:[0,1.56,-.05],extras:rig('yaw',Y)});
const turretMesh=new Mesh();
sectionY(turretMesh,uv('armor'),0,0,[[.00,.98,.88],[.18,1.095,.95],[.63,1.06,.93],[.72,.92,.81]],10);
sectionY(turretMesh,uv('armor'),-.16,-.30,[[.70,.317,.317],[.90,.335,.335],[1.06,.302,.302],[1.12,.265,.265]],22);
block(turretMesh,uv('armor'),[0,.30,-.95],[1.21,.51,.40]);
scene.node('TurretShellAndCupola',turret,{mesh:turretMesh});
const turSkirt=new Mesh();
for(const s of [-1,1]){
 block(turSkirt,uv('insignia'),[s*1.158,.415,-.17],[.072,.51,1.64]);
 block(turSkirt,uv('armor'),[s*1.023,.427,-.99],[.080,.50,.34]);
}
block(turSkirt,uv('insignia'),[0,.398,-1.17],[1.58,.50,.081]);
scene.node('TurretSchuerzen',turret,{mesh:turSkirt});
const gun=new Mesh(),gp=[0,.409,.77];
sectionY(gun,uv('armor'),0,.08,[[-.24,.285,.218],[-.14,.32,.234],[.19,.31,.235],[.24,.24,.198]],18);
tube(gun,uv('armor'),[0,0,.10],[0,0,2.97],.096,.062,22);
tube(gun,uv('steel'),[0,0,2.90],[0,0,3.14],.096,.089,16);
tube(gun,uv('dark'),[0,0,3.13997],[0,0,3.14],.057,.057,16,{capA:false});
const g=scene.node('Gun',turret,{translation:gp,mesh:gun,extras:rig('pitch',X)});
scene.node('Muzzle1',g,{translation:[0,0,3.14],extras:{direction:[0,0,1]}});
const wreck=new Mesh();
prismatic(wreck,uv('wreck'),[[.31,-3.16],[.30,2.49],[.63,2.72],[1.29,1.85],[1.22,-2.87]],-1.35,1.35);
for(const s of [-1,1]){
 track(wreck,uv('tread'),s*1.23,.42,-2.29,2.29,.40,.40);
 for(let i=0;i<5;i++)wheels(wreck,uv,s*1.22,.35,-1.67+i*.84,.30,.23,{count:12,hub:false,tyre:'wreck'});
 beam(wreck,uv('wreck'),[s*1.62,.78,-2.25],[s*1.36,1.27,1.52],.108,.29);
}
sectionY(wreck,uv('wreck'),.29,-.33,[[1.18,.89,.88],[1.49,.88,.91],[1.79,.67,.70]],10);
beam(wreck,uv('wreck'),[.23,1.43,.20],[.82,.56,2.74],.16);
wreckNode(scene,root,wreck);
write();
