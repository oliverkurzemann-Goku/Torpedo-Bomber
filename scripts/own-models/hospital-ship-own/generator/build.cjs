'use strict';
const {make,reference}=require('./config.cjs');
const {Mesh,block,beam,tube,loft,unit,TAU}=require('./mesh.cjs');
const {prismatic,sectionY}=require('./parts.cjs');
const info={id:'hospital-ship-own',class:'ship',kind:'hospital-ship',title:'Pacific Hospital Ship (1942)',ship:true,texture:[2048,1024],seed:19421930,
 references:[
  reference('Hikawa Maru history, NYK Line','https://hikawamaru.nyk.com/en/history.html','NYK Line reference text and photographs; no open reuse license used','Overall length and breadth, silhouette, 1941 hospital conversion and colours.'),
  reference('Hikawa Maru archive, Japan Maritime Daily','https://www.jmd.co.jp/article.php?no=110379','Japan Maritime Daily reference article; no open reuse license used','Full-load 9.23 m draft.'),
 ]};
const L=163.30,B=20.12,D=9.23,Z=L/2,X=B/2;
function cross(x,y,width,depth){
 const a=Math.abs(x),b=Math.abs(y);
 if(a>width/2||b>depth/2)return;
 return (a<width*.143&&b<depth*.44)||(b<depth*.143&&a<width*.44)?14:15;
}
const red='C1121F',white='EDEFEA';
function hullMark(u,v){
 const z=L*(u-.5),y=16-v*(16+D);
 const stamp=cross(z+2.0,y-5.9,10,10);
 if(stamp!==undefined)return stamp;
 if(y>=10.9&&y<=12.4)return 13;
 if(y<=.22)return 12;
}
function deckMark(u,v){
 const z=L*(v-.5),x=B*(u-.5);
 return cross(x,Math.abs(z)-49,10,10);
}
const {scene,root,uv,write}=make(info,{
 hull:{a:white,b:'a6a9a1',mode:'hull',inks:{12:'7A2E22',13:'2E7D4F',14:red,15:white},sample:hullMark},
 deck:{a:'B89A6A',b:'8f7350',mode:'deck',inks:{14:red,15:white},sample:deckMark},
 oak:{a:'B89A6A',b:'8f7350',mode:'deck'},
 white:{a:white,b:'a2a69c',mode:'metal'},
 windows:{a:white,b:'a2a69c',mode:'hull',inks:{12:'8d918d',13:'465253',14:'273334'},sample(u,v){
  const cell=(u*43)%1,window=v>.27&&v<.69&&cell>.17&&cell<.72;
  if(window)return v>.53?13:14;
  if(v>.75&&v<.82)return 12;
 }},
 bridge:{a:white,b:'a2a69c',mode:'metal',inks:{13:'788386',14:'344349'},sample(u,v){
  const c=(u*7)%1;if(v>.23&&v<.65&&c>.12&&c<.88)return v>.54?13:14;
 }},
 funnel:{a:white,b:'a6a9a1',mode:'metal',inks:{12:'414344',14:red,15:white},sample(u,v){
  if(u>.945)return 12;
  const p=(v%.5)-.25;
  return cross(p*11,(u-.61)*8,2.35,3.4);
 }},
 soot:{a:'3d4141',b:'5a5247',mode:'wreck'},
 rope:{a:'989387',b:'5d5b50',mode:'metal'},
 boat:{a:'dadbd0',b:'939c92',mode:'metal'},
 underside:{a:'7A2E22',b:'63443c',mode:'hull'},
 green:{a:'2E7D4F',b:'465d42',mode:'metal'},
},{length:L,width:B,draft:D,funnelHeight:30,waterlineY:0});
const decor={shipVisualOnly:true},hull=new Mesh(),deck=new Mesh();
const stations=[
 [-Z,.17,8.20,3.07,1],[-79,1.81,9.26,-.72,1],[-74,4.37,10.63,-5.40,1],[-66,6.72,11.47,-7.60,1],
 [-57,8.61,12.12,-8.85,1],[-45,9.64,12.71,-9.19,1],[-28,10.03,12.83,-D,1],
 [-10,X,12.84,-D,1],[13,X,12.85,-D,1],[32,9.91,12.92,-D,1],[49,9.24,13.14,-9.09,1],
 [59,7.72,13.67,-8.47,.86],[67,5.31,14.43,-7.60,.78],[74,3.35,15.03,-6.47,.67],
 [79,1.55,15.57,-4.32,.37],[Z,.115,15.96,-1.7,.12],
];
const shape=[
 [0,.03],[.045,.33],[.13,.60],[.26,.83],[.43,.967],[.57,1],[.71,.995],[.86,.971],[1,.949],
];
const grid=stations.map(([z,w,top,bottom,stem])=>shape.map(([t,f])=>[w*f*(stem+(1-stem)*t),bottom+(top-bottom)*t,z]));
const skin=uv('hull'),wood=uv('deck');
const suv=([,y,z])=>skin((z+Z)/L,(16-y)/(16+D));
const duv=([x,,z])=>wood(x/B+.5,(z+Z)/L);
for(const s of [-1,1]){
 const point=(i,k)=>{const [x,y,z]=grid[i][k];return [s*x,y,z];};
 for(let i=0;i<grid.length-1;i++){
  for(let k=0;k<shape.length-1;k++){
   const q=[point(i,k),point(i+1,k),point(i+1,k+1),point(i,k+1)];
   hull.face(q,q.map(suv),[s,k<2?-.4:0,0]);
  }
  const q=[point(i,8),point(i+1,8),[0,...point(i+1,8).slice(1)],[0,...point(i,8).slice(1)]];
  deck.face(q,q.map(duv),[0,1,0]);
 }
}
for(let i=0;i<grid.length-1;i++){
 const [a,y,z]=grid[i][0],[b,q,w]=grid[i+1][0],c=uv('underside');
 hull.face([[-a,y,z],[-b,q,w],[b,q,w],[a,y,z]],[c(0,0),c(0,1),c(1,1),c(1,0)],[0,-1,0]);
}
for(const i of [0,grid.length-1])for(let k=0;k<shape.length-1;k++){
 const [a,y,z]=grid[i][k],[b,q]=grid[i][k+1],p=[[-a,y,z],[a,y,z],[b,q,z],[-b,q,z]];
 hull.face(p,p.map(suv),[0,0,i===0?-1:1]);
}
scene.node('Hull',root,{mesh:hull});
scene.node('WeatherDeck',root,{mesh:deck});
const blockDeck=new Mesh(),house=new Mesh(),fittings=new Mesh();
function upperDeck(mesh,half,back,front,y,h,wall){
 const surf=uv(wall);
 block(mesh,uv('white'),[0,y+.13,(back+front)/2],[half*2+.24,.26,front-back]);
 for(const s of [-1,1]){
  const x=s*half,range=front-back,u=z=>(z-back)/range;
  const a=[[x,y+.24,back],[x,y+.24,front],[x,y+h,front],[x,y+h,back]];
  mesh.face(a,a.map(([,yp,z])=>surf(s>0?u(z):1-u(z),1-(yp-y-.24)/(h-.24))),[s,0,0]);
 }
 for(const z of [back,front]){
  const a=[[-half,y+.24,z],[half,y+.24,z],[half,y+h,z],[-half,y+h,z]],p=uv('bridge');
  mesh.face(a,[p(0,1),p(1,1),p(1,0),p(0,0)],[0,0,Math.sign(z-(front+back)/2)]);
 }
 block(mesh,uv('white'),[0,y+h,(back+front)/2],[half*2+.35,.32,front-back+.32]);
 block(mesh,uv('oak'),[0,y+h+.17,(back+front)/2],[half*2+.16,.055,front-back+.12]);
}
upperDeck(blockDeck,8.1,-39.9,41.6,12.70,3.63,'windows');
upperDeck(blockDeck,7.50,-33.4,33.2,16.33,3.11,'windows');
upperDeck(blockDeck,5.88,-28.5,30.8,19.44,2.84,'windows');
upperDeck(house,4.99,16.4,29.6,22.30,2.90,'bridge');
block(house,uv('white'),[0,25.48,24.0],[5.84,.38,6.6]);
block(house,uv('bridge'),[0,26.03,24.8],[3.91,.91,3.18]);
scene.node('PromenadeAndPassengerDecks',root,{mesh:blockDeck});
scene.node('BridgeHouse',root,{mesh:house});
for(const [z,y,w,l] of [[61.5,14.12,7.7,6.7],[-61.9,12.22,6.4,7.1],[37,13.25,7.1,5.6]]){
 block(fittings,uv('white'),[0,y+.51,z],[w,1.16,l]);
 block(fittings,uv('oak'),[0,y+1.15,z],[w+.21,.18,l+.21]);
}
for(const [z,y] of [[72,14.86],[-72,11.02]]){
 for(const x of [-1.4,1.4])tube(fittings,uv('white'),[x,y,z],[x,y+1.05,z],.51,.55,16);
 tube(fittings,uv('soot'),[-1.8,y+.65,z],[1.8,y+.65,z],.23,.23,12);
}
scene.node('HatchesAndWinches',root,{mesh:fittings});
const funnel=new Mesh(),base=[0,22.45,-3.0],exit=[0,30,-4.5];
tube(funnel,uv('funnel'),base,exit,2.11,1.92,40,{capB:false});
for(let i=1;i<funnel.positions.length;i+=3)funnel.positions[i]=Math.min(29.80,funnel.positions[i]);
tube(funnel,uv('soot'),[0,29.13,-4.5],exit,1.75,1.75,40,{capB:false});
tube(funnel,uv('white'),[0,29.80,-4.50],exit,1.97,1.97,40,{capB:false});
const p=uv('soot');
for(let i=0;i<40;i++){
 const a=i*TAU/40,b=(i+1)*TAU/40;
 const q=(r,t)=>[exit[0]+r*Math.cos(t),30,exit[2]+r*Math.sin(t)];
 funnel.face([q(1.97,a),q(1.97,b),q(1.74,b),q(1.74,a)],[p(0,0),p(1,0),p(1,1),p(0,1)],[0,1,0]);
}
scene.node('SingleFunnel',root,{mesh:funnel});
scene.node('funnel-exhaust-1',root,{translation:exit,extras:{shipExhaust:{radius:1.74,direction:[0,1,0]}}});
const masts=new Mesh(),rigging=new Mesh(),rail=new Mesh();
for(const [z,y,h,dir] of [[59,14.02,36.42,1],[-54,12.46,34.41,-1]]){
 tube(masts,uv('white'),[0,y,z],[0,h,z-.46],.42,.14,20);
 tube(masts,uv('white'),[-3.47,h-5.1,z],[3.47,h-5.1,z],.114,.11,12);
 for(const s of [-1,1]){
  const tip=[s*3.88,y+7.28,z+dir*10.7];
  tube(masts,uv('white'),[s*.30,y+1.06,z],tip,.21,.116,14);
  beam(rigging,uv('rope'),tip,[0,h-4.74,z],.15);
  beam(rigging,uv('rope'),[s*4.06,y,z-6],[0,h-5.56,z],.15);
 }
}
beam(rigging,uv('rope'),[0,35.68,58.55],[0,33.72,-54.46],.15);
scene.node('MastsAndCargoDerricks',root,{mesh:masts,extras:decor});
scene.node('AerialsAndDerrickRigging',root,{mesh:rigging,extras:decor});
for(const s of [-1,1]){
 for(let i=1;i<stations.length-2;i++){
  const [z,w,y]=stations[i],[zz,ww,yy]=stations[i+1];
  if(z>-40&&z<41)continue;
  for(const h of [.5,1.0])beam(rail,uv('white'),[s*w*.922,y+h,z],[s*ww*.922,yy+h,zz],.14);
  for(let j=0;j<3;j++){
   const t=j/3,x=s*(w+(ww-w)*t)*.922,y0=y+(yy-y)*t,z0=z+(zz-z)*t;
   block(rail,uv('white'),[x,y0+.52,z0],[.16,1.08,.16]);
  }
 }
 for(const z of [-29,29]){
  beam(rail,uv('white'),[s*5.77,23.12,z-4],[s*5.77,23.12,z+4],.15);
  for(const dz of [-3.7,0,3.7])block(rail,uv('white'),[s*5.77,22.73,z+dz],[.15,.88,.15]);
 }
}
scene.node('DeckRailings',root,{mesh:rail,extras:decor});
const davits=new Mesh();
for(const s of [-1,1])for(let i=0;i<6;i++){
 const z=-27.5+i*10.5,x=s*7.96,y=18.04;
 const boat=new Mesh();
 loft(boat,[[-3.62,.063,.085,0],[-2.96,.63,.44,0],[-1.8,.99,.54,0],[1.73,1.03,.53,0],[2.97,.63,.42,.02],[3.62,.065,.10,.10]],16,uv('boat'));
 block(boat,uv('oak'),[0,.42,.07],[1.27,.10,4.95]);
 scene.node('Lifeboat'+(s<0?'Starboard':'Port')+(i+1),root,{mesh:boat,translation:[x,y,z],extras:decor});
 for(const dz of [-2.62,2.62]){
  tube(davits,uv('white'),[s*7.31,16.61,z+dz],[s*7.34,19.20,z+dz],.16,.12,10);
  beam(davits,uv('white'),[s*7.34,19.20,z+dz],[s*8.34,19.20,z+dz],.21);
  beam(davits,uv('rope'),[s*8.23,19.20,z+dz],[s*8.23,18.42,z+dz],.15);
 }
}
scene.node('LifeboatDavitsAndFalls',root,{mesh:davits,extras:decor});
write();
