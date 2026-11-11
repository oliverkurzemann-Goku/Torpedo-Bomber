'use strict';
const {make,reference,rig}=require('./config.cjs');
const {Mesh,X,Y,Z,TAU,block,beam,tube,loft,wing,fin,unit,add}=require('./mesh.cjs');
const {absorb,dome,wheels,insigniaStar,panelNumber,prismatic}=require('./parts.cjs');
const info={id:'pby5a-own',class:'amphibian-twin',kind:'pby',title:'Consolidated PBY-5A Catalina (1942)',aircraft:true,texture:2048,seed:194205,
 references:[
  reference('Consolidated PBY-5A, Pima Air & Space Museum','https://pimaair.org/museum-aircraft/consolidated-pby-5a/','Museum photographs and text, all rights reserved; reference only','Overall length, span, height and R-1830 installation.'),
  reference('Consolidated PBY-5a Catalina: Stand up and salute, AOPA','https://www.aopa.org/news-and-media/all-news/2014/august/pilot/f_pby','AOPA copyright; reference only','Absence of wing flaps and amphibian configuration.'),
  reference('Consolidated PBY Catalina, American Heritage Museum','https://www.americanheritagemuseum.org/aircrafts/consolidated-pby-catalina/','Museum copyright; reference only','Pylon, nose and waist glazing, 1942 two-tone livery with overpainted red centre.'),
 ]};
const L=19.4564,W=31.6992,H=6.1468,S=W/2,N=L/2;
const star={13:'263b5b',14:'e9eae0'};
const top={a:'6C7B88',b:'1F3552',mode:'metal'};
const bottom={a:'B7BEC4',b:'7d8c92',mode:'hull'};
function fuselagePaint(u,v){
 const right=v<.10||v>.90,other=v>.40&&v<.60;
 const t=right?(v>.5?v-1:v):v-.5;
 if(right||other){
  const mark=insigniaStar(u,t,.285,0,.039,.085);
  if(mark!==undefined)return mark;
  const number=panelNumber('27',right?1-u:u,t,right?.637:.297,-.029,.077,.064);
  if(number!==undefined)return number;
 }
 if(v>.57&&v<.94){
  const line=.72+.145*Math.sin(23*u);
  if(v>line&&v<line+.012)return 10;
  return Math.min(12,8+Math.floor(3*(.5+.5*Math.sin(u*95+v*11))));
 }
}
function wingMark(u,v){
 return insigniaStar(u,v,.664,.454,.076,.272);
}
const {scene,root,uv,write}=make(info,{
 fuselage:{a:'657988',b:'273d5b',tones:['6c7b88','415a6d','b7bec4','8d9ba1'],mode:'hull',inks:star,sample:fuselagePaint},
 wingtop:{...top,inks:star,sample:wingMark},
 wingbottom:{...bottom,inks:star,sample:wingMark},
 top,bottom, engine:{a:'5b6c7c',b:'303d4d',mode:'engine'},
 frame:{a:'4f6376',b:'233748',mode:'metal'},
 glass:{a:'53778b',b:'223a48',mode:'lens'},
 rubber:{a:'333538',b:'4b4d4b',mode:'tyre'},steel:{a:'a0a6a3',b:'666968',mode:'metal'},
 dark:{a:'2a3032',b:'474744',mode:'wreck'},
 blades:{a:'343a40',b:'24303a',mode:'metal',inks:{13:'c9a552'},sample:(u)=>u>.92?13:undefined},
}, {span:W,length:L,height:H});
const clear=scene.material('Smoked glazing',{roughness:.76,metallic:0,alphaMode:'BLEND',factor:[1,1,1,.86]});
const hull=new Mesh(),hullUV=uv('fuselage');
const fore=[
 [-1.58,1.25,1.10,2.01],[-.85,1.39,1.29,2.11],[.85,1.43,1.36,2.23],[2.80,1.39,1.30,2.26],
 [4.40,1.30,1.19,2.31],[5.69,1.19,1.08,2.31],[6.81,1.08,1.02,2.28],[7.62,.90,.86,2.23],
 [8.35,.70,.66,2.24],[8.93,.49,.48,2.25],[9.37,.29,.30,2.26],[N,.075,.12,2.31],
];
const aft=[
 [-N,.095,.08,2.67],[-9.21,.22,.24,2.65],[-8.39,.41,.40,2.60],[-7.41,.60,.54,2.54],
 [-6.20,.80,.69,2.47],[-5.05,.97,.76,2.36],[-3.69,1.10,.84,2.23],[-2.53,1.19,.89,2.16],[-1.59,1.25,.96,2.15],
];
loft(hull,aft,40,hullUV,{minZ:-N,maxZ:N});
loft(hull,fore,40,hullUV,{minZ:-N,maxZ:N});
const step=uv('bottom');
hull.face([[-.60,1.27,-1.588],[.60,1.27,-1.588],[.40,.96,-1.58],[-.40,.96,-1.58]],
 [step(0,0),step(1,0),step(1,1),step(0,1)],[0,0,-1]);
scene.node('SteppedFlyingBoatHull',root,{mesh:hull});
const pylon=new Mesh(),frames=new Mesh(),windows=new Mesh();
prismatic(pylon,uv('top'),[[3.08,-1.55],[3.20,1.45],[4.21,2.48],[4.58,1.84],[4.60,-1.55],[4.17,-2.46]],-.46,.46);
for(const s of [-1,1]){
 for(const [z,zz] of [[1.63,1.33],[-.48,-.42]])beam(pylon,uv('bottom'),[s*1.16,2.26,z],[s*5.18,4.45,zz],.155,.185);
 block(frames,uv('glass'),[s*.463,3.76,.38],[.02,.28,.37]);
}
scene.node('WingPylonAndStruts',root,{mesh:pylon});
const cp=[[-.865,3.17,5.08],[.865,3.17,5.08],[.83,3.22,6.82],[-.83,3.22,6.82]];
const roof=[[-.66,3.77,5.28],[.66,3.77,5.28],[.65,3.75,6.43],[-.65,3.75,6.43]];
const g=uv('glass'),metal=uv('frame');
windows.face([cp[3],cp[2],roof[2],roof[3]],[g(0,1),g(1,1),g(1,0),g(0,0)],[0,.4,.9]);
for(const [i,j,s] of [[0,3,-1],[1,2,1]]){
 windows.face([cp[i],cp[j],roof[j],roof[i]],[g(0,1),g(1,1),g(1,0),g(0,0)],[s,.25,0]);
 beam(frames,metal,cp[i],cp[j],.063);
 beam(frames,metal,cp[j],roof[j],.067);
 beam(frames,metal,cp[i],roof[i],.060);
 const z=5.94;
 beam(frames,metal,[s*.845,3.19,z],[s*.656,3.76,z],.054);
}
prismatic(frames,uv('top'),[[3.27,4.64],[3.20,5.09],[3.77,5.29],[3.69,4.87]],-.66,.66);
frames.face(roof,[metal(0,0),metal(1,0),metal(1,1),metal(0,1)],[0,1,0]);
beam(frames,metal,[0,3.222,6.82],[0,3.751,6.43],.062);
beam(frames,metal,cp[2],cp[3],.072);
dome(windows,g,[0,2.70,8.70],[.51,.55,.77],{rings:7,sides:24});
tube(frames,metal,[0,2.56,8.70],[0,2.735,8.70],.532,.509,24);
beam(frames,metal,[0,2.736,9.445],[0,3.238,8.70],.061);
tube(frames,uv('dark'),[0,2.95,9.27],[0,2.95,9.66],.047,.041,12);
scene.node('NoseTurretAndGlazingFrames',root,{mesh:frames});
scene.node('CanopyAndNoseTurretGlazing',root,{mesh:windows,material:clear});
scene.node('Muzzle1',root,{translation:[0,2.95,9.66],extras:{direction:[0,0,1]}});
for(const s of [-1,1]){
 const suffix=s<0?'Left':'Right',gl=new Mesh(),rim=new Mesh();
 const local=new Mesh();
 dome(local,g,[0,0,0],[.72,.565,.855],{rings:7,sides:24});
 const mount=[s*.979,2.40,-3.57];
 const rotate=([x,y,z])=>[s*y,-s*x,z];
 absorb(gl,local,p=>add(rotate(p),mount),rotate);
 tube(rim,metal,[s*.942,2.40,-3.57],[s*1.034,2.40,-3.57],.731,.712,24);
 for(let j=0;j<8;j++){
  const point=(a)=>[s*(.980+.565*Math.sin(a)),2.40+.707*Math.cos(a),-3.57];
  beam(rim,metal,point(j*Math.PI/8),point((j+1)*Math.PI/8),.049);
 }
 tube(rim,uv('dark'),[s*1.29,2.47,-3.52],[s*1.69,2.47,-3.64],.045,.035,10);
 scene.node('Blister'+suffix,root,{mesh:gl,material:clear});
 scene.node('BlisterFrame'+suffix,root,{mesh:rim});
 scene.node('MuzzleBlister'+suffix,root,{translation:[s*1.69,2.47,-3.64],
  rotation:[0,s*Math.SQRT1_2,0,Math.SQRT1_2],extras:{direction:[s,0,0]}});
}
const main=new Mesh(),tail=new Mesh();
const profiles=[[0,4.64,2.83,-1.72,.67],[4.1,4.64,2.82,-1.72,.66],[7.4,4.66,2.77,-1.70,.59],
 [9.0,4.68,2.64,-1.62,.49],[11.1,4.71,2.30,-1.31,.40],[13.52,4.74,1.86,-1.02,.31],
 [15.40,4.75,1.43,-.70,.21],[S,4.75,.98,-.42,.11]];
for(const s of [-1,1]){
 const suffix=s<0?'Left':'Right';
 const profilesSide=profiles.map(([x,...a])=>[s*x,...a]);
 wing(main,profilesSide.slice(0,3),uv('top'),uv('bottom'),{spanRange:[0,S],steps:14});
 wing(main,profilesSide.slice(2),uv('wingtop'),uv('wingbottom'),{to:.73,spanRange:[0,S],steps:13});
 const aileron=new Mesh();
 wing(aileron,profilesSide.slice(2),uv('top'),uv('bottom'),{from:.731,spanRange:[0,S],steps:6});
 const pivot=[s*7.4,4.66,2.77+(-1.70-2.77)*.731];
 aileron.shift(pivot.map(x=>-x));
 scene.node('Aileron'+suffix,root,{mesh:aileron,translation:pivot,extras:rig('roll',X,{gain:s<0?.37:-.37})});
 const tailRows=[[.17,3.44,-6.39,-8.86,.29],[1.69,3.47,-6.77,-8.95,.23],[3.32,3.52,-7.33,-8.93,.18],[4.19,3.55,-7.86,-8.68,.08]].map(([x,...v])=>[s*x,...v]);
 wing(tail,tailRows,uv('top'),uv('bottom'),{to:.66,spanRange:[0,4.19],steps:9});
 const elevator=new Mesh(),ep=[s*.17,3.44,-8.02];
 wing(elevator,tailRows,uv('top'),uv('bottom'),{from:.661,spanRange:[0,4.19],steps:6});
 elevator.shift(ep.map(x=>-x));
 scene.node('Elevator'+suffix,root,{mesh:elevator,translation:ep,extras:rig('pitch',X,{gain:.42})});
 const nac=new Mesh(),engine=new Mesh(),nx=s*3.39,ny=4.53;
 loft(nac,[[1.00,.26,.27,4.58],[1.46,.59,.46,4.58],[2.19,.76,.63,ny],[2.89,.81,.74,ny],
  [3.42,.80,.73,ny],[3.84,.73,.65,ny],[3.96,.63,.57,ny]],32,uv('engine'),{x:nx});
 tube(engine,uv('dark'),[nx,ny,3.952],[nx,ny,4.005],.587,.587,28);
 for(let i=0;i<9;i++){
  const a=i/9*TAU,at=(r)=>[nx+Math.cos(a)*r,ny+Math.sin(a)*r,4.012];
  tube(engine,uv('steel'),at(.205),at(.54),.069,.070,8);
 }
 tube(engine,uv('steel'),[nx,ny,4.00],[nx,ny,4.10],.24,.20,22);
 scene.node('Nacelle'+suffix,root,{mesh:nac});
 scene.node('RadialEngine'+suffix,root,{mesh:engine});
 const prop=new Mesh();
 tube(prop,uv('steel'),[0,0,-.13],[0,0,.18],.18,.11,20);
 const bladeUV=uv('blades');
 for(let i=0;i<3;i++){
  const a=TAU*i/3+.14,c=Math.cos(a),sn=Math.sin(a);
  const b=[[.124,-.085],[.54,-.13],[1.25,-.17],[1.70,-.067],[1.73,.040],[1.29,.129],[.55,.156],[.124,.077]];
  const outline=b.map(([r,w])=>[c*r-sn*w,sn*r+c*w]);
  for(const z of [-.032,.032]){
   prop.face(outline.map(([x,y])=>[x,y,z]),b.map(([r,w])=>bladeUV(r/1.73,.5+w*2.8)),[0,0,Math.sign(z)]);
  }
  for(let k=0;k<b.length;k++){
   const l=(k+1)%b.length,a0=outline[k],a1=outline[l],t0=b[k][0]/1.73,t1=b[l][0]/1.73;
   const normal=unit([a1[1]-a0[1],a0[0]-a1[0],0]);
   prop.face([[...a0,-.032],[...a1,-.032],[...a1,.032],[...a0,.032]],
    [bladeUV(t0,0),bladeUV(t1,0),bladeUV(t1,1),bladeUV(t0,1)],normal);
  }
 }
 scene.node('Propeller'+suffix,root,{mesh:prop,translation:[nx,ny,4.14],extras:rig('prop',Z,{blades:3})});
 const float=new Mesh(),fx=s*13.63;
 loft(float,[[-1.73,.065,.05,-.95],[-1.35,.21,.20,-1.01],[-.82,.34,.31,-1.08],[.14,.38,.33,-1.10],
  [.84,.29,.25,-1.04],[1.35,.17,.15,-.94],[1.57,.05,.065,-.92]],24,uv('bottom'));
 beam(float,uv('top'),[0,0,.61],[0,-1,.43],.19,.26);
 beam(float,uv('top'),[0,-.09,-.58],[0,-1.02,-.35],.15,.17);
 scene.node('Float'+suffix,root,{mesh:float,translation:[fx,4.66,.38],
  extras:rig('float'+suffix,Z,{range:[0,s*Math.PI/2]})});
}
scene.node('ParasolWing',root,{mesh:main});
scene.node('HorizontalStabilizer',root,{mesh:tail});
const finRows=[[2.83,-5.81,-9.13,.33],[3.68,-6.26,-9.20,.36],[4.72,-7.12,-9.28,.30],[5.65,-7.93,-9.37,.23],[5.99,-8.42,-9.29,.19],[H,-8.83,-9.17,.10]];
const vfin=new Mesh(),rudder=new Mesh();
fin(vfin,finRows,uv('top'),{to:.685,steps:12,spanRange:[2.83,H]});
fin(rudder,finRows,uv('top'),{from:.686,steps:6,spanRange:[2.83,H]});
const rp=[0,3.05,-8.08];
rudder.shift(rp.map(x=>-x));
scene.node('VerticalStabilizer',root,{mesh:vfin});
scene.node('Rudder',root,{mesh:rudder,translation:rp,extras:rig('yaw',Y,{gain:.45})});
const gear=scene.node('gear',root);
for(const s of [-1,1]){
 const suffix=s<0?'Left':'Right',leg=new Mesh(),wheel=new Mesh(),pivot=[s*1.21,1.98,-.27];
 const center=[s*.37,.61-pivot[1],.04];
 beam(leg,uv('steel'),[0,0,0],center,.128,.13);
 beam(leg,uv('steel'),[s*-.17,-.43,-.64],[s*.37,-1.20,.04],.098,.102);
 block(leg,uv('bottom'),[s*.05,-.27,-.03],[.18,.55,.84]);
 const n=scene.node('Gear'+suffix,gear,{mesh:leg,translation:pivot,extras:rig('gear',Z,{range:[0,-s*1.47]})});
 wheels(wheel,uv,center[0],center[1],center[2],.61,.285,{count:28,paint:'steel'});
 scene.node('MainWheel'+suffix,n,{mesh:wheel,extras:{groundWheel:true}});
}
const leg=new Mesh(),wheel=new Mesh(),np=[0,1.38,6.22],wy=.373-np[1];
beam(leg,uv('steel'),[0,0,0],[0,wy,.21],.13);
for(const x of [-.132,.132])beam(leg,uv('steel'),[x,wy+.31,.16],[x,wy,.21],.073);
const nose=scene.node('NoseGear',gear,{mesh:leg,translation:np,extras:rig('gear',X,{range:[0,-1.37]})});
wheels(wheel,uv,0,wy,.21,.373,.175,{count:24,paint:'steel'});
scene.node('NoseWheel',nose,{mesh:wheel,extras:{groundWheel:true}});
write();
