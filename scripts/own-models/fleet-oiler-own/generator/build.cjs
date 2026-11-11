'use strict';
const {make,reference}=require('./config.cjs');
const {Mesh,block,beam,tube}=require('./mesh.cjs');
const {prismatic}=require('./parts.cjs');
const {decor,navalPaint,hullAssembly,deckhouse,funnelAssembly,rails,bollards,boats,aa,aaMarker,screws}=require('./ship.cjs');
const info={id:'fleet-oiler-own',title:'Fleet Oiler Nagisa (1942)',class:'ship',kind:'fleet-oiler',ship:true,oiler:true,name:'NAGISA',
 texture:[2048,1024],seed:1942140,length:143.5,beam:17.68,draft:8.08,maxTop:8.71,
 colors:{ship:'5b6166',deck:'6b5a44',line:'7a2e22'},
 stations:[[-1,.042,7.09,1.1],[-.983,.19,7.05,-1.9],[-.946,.43,6.85,-4.27],[-.890,.67,6.53,-6.04],
  [-.806,.83,6.15,-7.3],[-.706,.941,5.39,-7.98],[-.55,.988,5.32,-8.08],[-.28,1,5.30,-8.08],
  [0,1,5.31,-8.08],[.26,1,5.36,-8.08],[.50,.957,5.45,-8.04],[.66,.864,5.68,-7.69],
  [.781,.673,6.29,-6.92],[.87,.49,7.06,-6.08],[.94,.294,7.89,-5.38],[.975,.155,8.39,-4.56],
  [1,.024,8.71,-3.76]],
 references:[
  reference('Identification of Japanese Naval Vessels, U.S. War Department FM 30-58','https://patcosta.com/wp-content/uploads/2024/07/FM-30-58-Military-Intelligence-Identification-of-Japanese-Naval-Vessels-Dec-1941.pdf','U.S. government publication, public domain in the United States','Notoro overall length reported as 470¾ ft.'),
  reference('Notoro class, Pacific War Online Encyclopedia','https://www.pwencycl.kgbudge.com/N/o/Notoro_class.htm','Reference text and diagrams, copyrighted','17.68 m beam, 8.08 m draft, original oiler and late-1942 tanker context.'),
  reference('IJN Oiler/Seaplane Tender NOTORO, CombinedFleet','https://www.combinedfleet.com/Notoro_t.htm','Copyrighted reference text and images','Historical design context. The model is a fictional 1942 fleet oiler.'),
 ]};
const {scene,root,uv,write}=make(info,navalPaint(info),{length:info.length,width:info.beam,draft:info.draft,mastHeight:28,waterlineY:0});
const st=hullAssembly(info,scene,root,uv),mid=new Mesh(),poop=new Mesh(),fore=new Mesh();
for(const [z,y,w,l,h,win] of [[7.23,5.19,12.17,16.6,2.72,true],[8.60,7.87,11.14,13.05,2.53,true],
 [10.23,10.39,9.39,7.55,2.42,true],[10.1,12.77,6.28,3.76,.73,true]]){
 deckhouse(mid,uv,{z,y,width:w,length:l,height:h,window:win,chamfer:.87});
 block(mid,uv('steelDark'),[0,y+h+.093,z],[w+.27,.18,l-.19]);
}
scene.node('AmidshipsBridgeAndQuarters',root,{mesh:mid});
for(const [z,y,w,l,h] of [[-50.3,5.81,10.54,15.3,3.21],[-50.2,8.99,8.32,11.7,2.45],[-61.19,6.56,6.17,5.5,1.91]]){
 deckhouse(poop,uv,{z,y,width:w,length:l,height:h,chamfer:.88});
}
scene.node('PoopAndEngineHouse',root,{mesh:poop});
deckhouse(fore,uv,{z:54.2,y:6.02,width:9.55,length:9.29,height:2.03,chamfer:1.20,window:false});
block(fore,uv('steelDark'),[0,8.08,54.20],[9.67,.18,8.93]);
scene.node('Forecastle',root,{mesh:fore});
funnelAssembly(scene,root,uv,{z:-51.2,y:11.12,top:19.47,rake:.78,r:2.11,opening:1.57});
const pipe=new Mesh(),tankFittings=new Mesh(),catwalk=new Mesh(),catrail=new Mesh(),hatches=new Mesh();
const sections=[[-44.5,-2.0],[16.50,48.8]];
for(const [a,b] of sections){
 block(catwalk,uv('deck'),[0,7.22,(a+b)/2],[1.18,.23,b-a]);
 for(const s of [-1,1]){
  beam(catrail,uv('steel'),[s*.55,8.03,a],[s*.55,8.03,b],.11);
  beam(catrail,uv('steel'),[s*.55,7.59,a],[s*.55,7.59,b],.085);
  for(let z=a+.25;z<b;z+=2.48)block(catrail,uv('steel'),[s*.55,7.62,z],[.098,.88,.098]);
  for(let z=a+.55;z<b;z+=6.48)beam(catwalk,uv('steelDark'),[s*.48,5.42,z],[s*.48,7.19,z],.18);
  for(let i=0;i<2;i++){
   const x=s*(1.27+i*.36),y=5.75+i*.13;
   tube(pipe,uv('pipe'),[x,y,a],[x,y,b],.137,.137,12);
   for(let z=a+.6;z<b-1.0;z+=6.82){
    block(tankFittings,uv('steelDark'),[x,y-.16,z],[.39,.36,.24]);
    if(i===0){
     tube(pipe,uv('pipe'),[x,y,z],[s*3.30,y,z],.109,.109,10);
     tube(pipe,uv('pipe'),[x,y-.05,z],[x,y+.46,z],.125,.10,10);
     tube(pipe,uv('steelDark'),[x,y+.43,z],[x,y+.52,z],.25,.25,14);
    }
   }
  }
 }
 for(let z=a+3.4;z<b-1;z+=6.47)for(const x of [-3.55,3.55]){
  tube(hatches,uv('steelDark'),[x,5.33,z],[x,5.76,z],.71,.69,18);
  tube(hatches,uv('steel'),[x,5.73,z],[x,5.86,z],.74,.73,18);
 }
}
scene.node('TankAccessHatchesAndValvePlatforms',root,{mesh:tankFittings});
scene.node('TankDomes',root,{mesh:hatches});
scene.node('RaisedCatwalk',root,{mesh:catwalk});
scene.node('CatwalkRailings',root,{mesh:catrail,extras:decor});
scene.node('CargoPipesAndValves',root,{mesh:pipe,extras:decor});
const m=new Mesh(),booms=new Mesh(),rig=new Mesh(),fit=new Mesh(),small=new Mesh();
for(const [z,y,t] of [[35.3,5.58,28],[-33.9,5.42,24.31]]){
 tube(m,uv('steel'),[0,y,z],[0,t,z],.54,.155,20);
 beam(m,uv('steel'),[-3.83,t-3.87,z],[3.83,t-3.87,z],.22);
 for(const s of [-1,1]){
  const a=[s*.34,y+2.95,z],b=[s*5.73,y+9.84,z+(z>0?11.65:-8.67)];
  tube(booms,uv('steel'),a,b,.184,.118,14);
  beam(rig,uv('black'),b,[0,t-2.8,z],.12);
  beam(rig,uv('black'),[s*4.92,y+.25,z-4.72],[0,t-2.8,z],.105);
 }
}
beam(rig,uv('black'),[0,26.73,35.3],[0,22.92,-33.9],.095);
scene.node('ForeAndAftCargoMasts',root,{mesh:m,extras:decor});
scene.node('CargoDerricks',root,{mesh:booms,extras:decor});
scene.node('AntennaeAndDerrickRigging',root,{mesh:rig,extras:decor});
for(const [x,y,z,side] of [[-2.1,8.21,59.1,-1],[2.3,8.48,-60.9,1]]){
 tube(small,uv('steelDark'),[x,y-.08,z],[x,y+.30,z],.91,.88,16);
 block(small,uv('steel'),[x,y+.59,z],[.75,.68,.71]);
 for(const d of [-.20,.20])tube(small,uv('gun'),[x,y+.83,z+d],[x+side*1.75,y+1.08,z+d],.059,.045,10);
 aaMarker(scene,[x,y,z],2,25);
}
scene.node('TwinAAMounts',root,{mesh:small});
for(const s of [-1,1]){
 for(const [y,z,x] of [[8.08,61.3,2.66],[8.20,64.9,2.24],[6.87,-62.37,3.07],[6.70,-66.81,2.20]]){
  bollards(fit,uv,{x:s*x,z,y,scale:.80});
 }
 const a=[s*2.24,7.95,60.38],b=[s*1.49,8.51,69.61];
 beam(fit,uv('black'),a,b,.23);
 const x=s*2.05;
 beam(fit,uv('steelDark'),[x,6.7,65.3],[x,8.08,65.1],.29);
 beam(fit,uv('steelDark'),[x-s*.48,6.9,65.1],[x+s*.53,6.86,65.47],.22);
}
scene.node('AnchorsMooringsAndWinches',root,{mesh:fit,extras:decor});
boats(scene,root,uv,[[-6.55,9.41,7.08,7.32],[6.55,9.41,7.08,7.32]]);
rails(scene,root,uv,st,.13);
screws(scene,root,uv,[[-3.63,-5.62,-61.12,1.45],[3.63,-5.62,-61.12,1.45]]);
write();
