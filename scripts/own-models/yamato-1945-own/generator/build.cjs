'use strict';
const {make,reference}=require('./config.cjs');
const {Mesh,block,beam,tube,loft}=require('./mesh.cjs');
const {absorb,prismatic,sectionY}=require('./parts.cjs');
const {decor,navalPaint,hullAssembly,deckhouse,funnelAssembly,rails,bollards,boats,aa,shipTurret,screws}=require('./ship.cjs');
const info={id:'yamato-1945-own',title:'Battleship Yamato — April 1945',kind:'yamato',class:'ship',ship:true,
 texture:[2048,1024],seed:19450407,length:263,beam:38.8,draft:10.4,maxTop:13.1,
 colors:{ship:'7f878c',deck:'4a443e',line:'6e2f25'},
 stations:[[-1,.055,8.3,-.47],[-.985,.17,8.38,-2.30],[-.956,.333,8.43,-4.96],[-.912,.51,8.54,-7.10],
  [-.850,.68,8.69,-8.85],[-.770,.811,8.75,-9.92],[-.682,.91,8.82,-10.32],[-.545,.971,8.92,-10.40],
  [-.394,.994,8.95,-10.4],[-.23,1,8.97,-10.4],[-.040,1,9,-10.4],[.136,1,9.07,-10.4],
  [.33,.977,9.22,-10.4],[.50,.922,9.42,-10.28],[.62,.834,9.84,-10.02],[.73,.695,10.63,-9.31],
  [.813,.551,11.31,-8.23,.13],[.879,.40,11.94,-7.83,.27],[.941,.252,12.56,-7.31,.43],
  [.976,.116,12.93,-6.56,.72],[1,.018,13.1,-4.86,.84]],
 references:[
  reference('U.S. Naval Technical Mission to Japan, Report S-06-2','https://www.fischer-tropsch.org/primary_documents/gvt_reports/USNAVY/USNTMJ%20Reports/USNTMJ-200H-0745-0786%20Report%20S-06-2.pdf','U.S. government report, public domain in the United States','Yamato 263 m overall, 38.8 m maximum beam and 10.4 m trial draft.'),
  reference('Janusz Skulski and Stefan Draminski, Battleships Yamato and Musashi','https://api.pageplace.de/preview/DT0400.9781472832221_A35506816/preview-9781472832221_A35506816.pdf','Copyrighted book excerpt, reference only','April 1945 fit and armament groups, turret and silhouette comparison.'),
  reference('Tamiya, Japanese Battleship Yamato, specifications','https://cdn.simba-dickie-group.de/downloads/300078030/300078030_Yamato.pdf','Tamiya copyrighted historical notes','Cross-check of 38.9 m alternate beam and 10.4 m normal draft.'),
 ]};
const {scene,root,uv,write}=make(info,navalPaint(info),{length:info.length,width:info.beam,draft:info.draft,waterlineY:0});
const st=hullAssembly(info,scene,root,uv);
const upper=new Mesh(),island=new Mesh(),bases=new Mesh();
const tiers=[
 [20.4,8.90,27.8,61.5,3.85,false],[-17.7,11.91,25.1,33.5,3.86,true],
 [15.5,12.41,20.4,27.1,3.43,true],[18.9,15.73,17.5,21.2,3.76,true],
 [19.7,19.43,14.6,17.9,3.63,true],[20.5,22.97,12.48,14.9,4.05,true],
 [21.2,26.93,11.05,12.6,4.37,true],[21.8,31.20,10.13,11.2,4.02,true],
 [23.3,35.14,10.73,10.18,3.69,true],[22.3,38.70,7.65,7.18,3.62,true],
 [23.45,42.24,6.10,5.99,2.84,true],
];
for(const [z,y,width,length,height,window] of tiers){
 const m=y<13?upper:island;
 deckhouse(m,uv,{z,y,width,length,height,chamfer:width*.18,window});
 block(m,uv('steelDark'),[0,y+height+.12,z],[width+.41,.24,length-.49]);
}
const bridgeMast=new Mesh(),antenna=new Mesh();
for(const s of [-1,1]){
 for(const [y,z,x] of [[21.3,20.5,8.30],[26.8,22.4,6.82],[35.12,23.3,6.20],[39.2,24.3,5.83]]){
  tube(island,uv('steel'),[s*x,y-.40,z],[s*x,y+.33,z],1.20,1.17,18);
  beam(antenna,uv('steel'),[s*(x+.70),y+.89,z-.73],[s*(x+.70),y+.89,z+.73],.15);
 }
 beam(bridgeMast,uv('steel'),[s*1.88,44.95,23.25],[s*.48,48.24,22.70],.36);
 tube(bridgeMast,uv('steelDark'),[s*.14,45.28,22.75],[s*4.95,45.28,22.75],.66,.52,24);
}
tube(bridgeMast,uv('steel'),[0,43.86,22.70],[0,49.16,22.70],.38,.19,16);
beam(antenna,uv('steel'),[-5.07,47.60,22.74],[5.07,47.60,22.74],.15);
for(let i=-4;i<=4;i++)beam(antenna,uv('steel'),[i*1.05,47.60,21.97],[i*1.05,47.60,23.41],.12);
scene.node('CitadelAndLowerSuperstructure',root,{mesh:upper});
scene.node('PagodaBridge',root,{mesh:island});
scene.node('RangefinderAndDirector',root,{mesh:bridgeMast,extras:decor});
funnelAssembly(scene,root,uv,{z:-9.9,y:13.4,top:31.8,rake:5.4,r:4.09,opening:3});
const uptake=new Mesh();
deckhouse(uptake,uv,{z:-10.9,y:12.8,width:10.8,length:13.6,height:5.02,chamfer:2.9,window:false});
deckhouse(uptake,uv,{z:-33.6,y:9.09,width:12.17,length:12.1,height:3.2,chamfer:1.28});
sectionY(uptake,uv('steel'),0,-29.4,[[11.4,3.74,3.12,0],[13.8,3.59,3.11,.32],[15.61,3.33,2.94,.62]],18);
scene.node('AftDirectorAndFunnelUptake',root,{mesh:uptake});
for(const t of [
 {label:'A',y:10.30,z:76.9},{label:'B',y:14.11,z:50.3},{label:'C',y:10.05,z:-70.4,dir:-1},
 {label:'SecondaryFore',y:13.13,z:34.8,main:false},{label:'SecondaryAft',y:12.25,z:-47.0,dir:-1,main:false},
])absorb(bases,shipTurret(scene,root,uv,t));
scene.node('TurretBarbettes',root,{mesh:bases});
const heavies=new Mesh(),lights=new Mesh(),platforms=new Mesh();
const hs=[[-34.5,9.8,10.72],[-25.7,12.2,13.47],[-16.5,12.7,15.93],[-4.1,12.3,15.64],[6.9,12.25,14.26],[16.5,12.0,12.24]];
const ls=[
 [-100.5,6.8,8.72],[-90.4,10.3,8.82],[-80.6,12.2,8.91],[-69.9,12.9,8.99],[-60.6,14.2,9.01],
 [-53.5,15.2,9.05],[-44.7,13.6,9.10],[-37.9,15.8,9.14],[-30.9,15.9,9.18],[-25.0,16.48,9.21],
 [-18.8,16.46,9.24],[-12.4,16.42,9.25],[-5.83,16.28,9.26],[.92,16.18,9.25],[7.8,16.16,9.24],
 [14.42,16.04,9.25],[21.1,15.8,9.28],[27.97,15.24,9.31],[34.1,15.25,9.41],[40.4,14.71,9.49],
 [48.5,14.12,9.63],[57.1,13.6,9.73],[66.7,12.5,9.86],[76.9,10.7,10.1],[88.8,8.75,10.63],
];
for(const s of [-1,1]){
 hs.forEach(([z,x,y],i)=>{
  tube(platforms,uv('steelDark'),[s*x,8.88,z],[s*x,y-.055,z],1.44,1.72,16);
  aa(scene,heavies,uv,[s*x,y,z],{side:s,heavy:true,covered:i%2===0});
 });
 ls.forEach(([z,x,y],i)=>aa(scene,lights,uv,[s*x,y,z],{side:s,covered:i>=9&&i<=12}));
}
scene.node('HeavyAAGalleries',root,{mesh:absorb(heavies,platforms)});
scene.node('LightAAClusters',root,{mesh:lights});
const flight=new Mesh(),gear=new Mesh(),crane=new Mesh(),ropes=new Mesh();
for(const s of [-1,1]){
 const x=s*6.5,z=-97.0;
 block(flight,uv('steelDark'),[s*4.82,9.03,-99.1],[5.0,.50,24.5]);
 tube(flight,uv('steel'),[x,9.10,z],[x,10.23,z],1.53,1.24,22);
 const a=[s*3.1,10.24,-89.7],b=[s*10.21,10.24,-113.4];
 beam(flight,uv('steelDark'),a,b,1.10,.32);
 for(const d of [-.44,.44])beam(gear,uv('steel'),[a[0]+d,a[1]+.21,a[2]],[b[0]+d,b[1]+.21,b[2]],.16);
 for(let i=0;i<11;i++){
  const t=i/10,q=a.map((v,k)=>v+(b[k]-v)*t);
  beam(gear,uv('steel'),[q[0]-.42,q[1]-.17,q[2]],[q[0]+.42,q[1]-.17,q[2]],.146);
 }
 beam(gear,uv('steel'),[s*1.49,8.89,-83.6],[s*1.49,8.71,-122.0],.15);
}
scene.node('AircraftDeckAndCatapults',root,{mesh:flight});
scene.node('CatapultAndTrolleyRails',root,{mesh:gear,extras:decor});
tube(crane,uv('steel'),[0,8.68,-113.0],[0,14.15,-113.0],1.28,.95,20);
beam(crane,uv('steelDark'),[0,13.70,-113.0],[4.34,22.66,-119.28],.46,.68);
beam(crane,uv('steel'),[.31,13.70,-112.31],[4.64,22.66,-118.90],.34);
for(let i=0;i<7;i++){
 const t=i/7,q=[t*4.34,13.70+t*8.96,-113-t*6.28];
 beam(crane,uv('steel'),q,[q[0]+.57,q[1]+.48,q[2]+.14],.18);
}
beam(ropes,uv('black'),[4.39,22.72,-119.28],[4.39,10.84,-119.28],.14);
scene.node('SternAircraftCrane',root,{mesh:crane,extras:decor});
const masts=new Mesh();
tube(masts,uv('steel'),[0,13.7,-35.9],[0,43.2,-42.4],.67,.22,18);
for(const s of [-1,1]){
 beam(masts,uv('steel'),[s*3.38,13.19,-40.91],[0,30.44,-40.0],.40);
 beam(ropes,uv('black'),[s*6.8,13.75,-50.22],[0,37.4,-41.21],.13);
}
beam(antenna,uv('steel'),[-4.62,34.48,-40.55],[4.62,34.48,-40.55],.18);
beam(ropes,uv('black'),[0,42.25,-42.07],[0,47.2,22.69],.14);
beam(ropes,uv('black'),[0,39.70,-41.65],[0,45.45,22.69],.14);
scene.node('AftTripodMast',root,{mesh:masts,extras:decor});
scene.node('AntennaSpars',root,{mesh:antenna,extras:decor});
scene.node('MastAndCraneRigging',root,{mesh:ropes,extras:decor});
const hatches=new Mesh(),ground=new Mesh();
for(const s of [-1,1]){
 for(const [y,z] of [[12.34,118.5],[11.8,110.1],[8.52,-123.5],[8.6,-110.6]]){
  bollards(hatches,uv,{x:s*(z>0?2.85:2.21),z,y,scale:1.34});
 }
 beam(ground,uv('black'),[s*2.20,12.55,111.8],[s*2.30,12.74,125.3],.22);
 for(let i=0;i<9;i++){
  const z=111.8+i*1.48;
  block(ground,uv('steelDark'),[s*2.24,12.62,z],[.34,.25,.67]);
 }
 for(const z of [94,104,-56,-82]){
  block(hatches,uv('steel'),[s*3.48,z>0?11.44:9.16,z],[1.86,.62,2.06]);
 }
}
scene.node('DeckFittings',root,{mesh:hatches});
scene.node('AnchorChains',root,{mesh:ground,extras:decor});
boats(scene,root,uv,[[-9.2,14.10,-31.18,8.62],[9.2,14.10,-31.18,8.62],
 [-8.23,15.4,-21.15,7.7],[8.23,15.4,-21.15,7.7]]);
rails(scene,root,uv,st,.18);
screws(scene,root,uv,[[-6.25,-6.86,-112,2.34],[6.25,-6.86,-112,2.34],[-10.08,-6.66,-106.1,2.31],[10.08,-6.66,-106.1,2.31]]);
write();
