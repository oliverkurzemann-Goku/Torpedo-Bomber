'use strict';
const {make,reference,rig}=require('./config.cjs');
const {Mesh,TAU,X,Y,Z,block,beam,tube,loft,wing,fin,add,scale}=require('./mesh.cjs');

const info={
  id:'ar234b2-own',kind:'ar234',class:'jet-bomber-twin',aircraft:true,
  title:'Arado Ar 234 B-2 Blitz',texture:2048,seed:2341945,
  references:[
    reference('Arado Ar 234 B-2 Blitz (Lightning), NASM A19600312000','https://www.si.edu/object/nasm_A19600312000','CC0 catalog record; media-specific terms apply','Published span and ground height.'),
    reference('Arado Ar 234 B-2 Blitz museum gallery','https://airandspace.si.edu/collection-objects/arado-ar-234-b-2-blitz-lightning/nasm_A19600312000','Mixed museum media terms; comparison only','Restored exterior, cockpit, camouflage and rear armament exhibit.'),
    reference('Arado Ar 234 B 3-view, Joy Cohn','https://commons.wikimedia.org/wiki/File:Arado_Ar_234_B_3-view.svg','CC BY-SA 4.0 or alternatives on file page','Orthographic silhouette and relative station comparison.'),
    reference('AR-234 B-2 Jet Propelled Bomber, declassified report','https://www.cia.gov/readingroom/docs/CIA-RDP78-02646R000400190001-3.pdf','Public release; no explicit reuse license on the scan','More precise published length, corroborating span and height.'),
  ]
};
const dimensions={span:14.4,length:12.64,height:4.30};
const {scene,root,uv,write}=make(info,{
  fuselage:{a:'a9b5bd',tones:['a9b5bd','5b4b45','626149','6d7b4b'],mode:'aradoBody'},
  wingTop:{a:'5b4b45',b:'6d7b4b',mode:'wing'},
  wingBottom:{a:'a9b5bd',b:'aab9bc',mode:'wing'},
  nacelle:{a:'a9b5bd',b:'7f8b84',mode:'engine'},
  fin:{a:'65694a',b:'5b4b45',mode:'metal'},
  frame:{a:'617274',b:'74867c',mode:'metal'},
  glass:{a:'729ba2',b:'a5bfc4'},
  cockpit:{a:'343b35',b:'596052',mode:'metal'},
  dark:{a:'2d2f2c',b:'514a3c',mode:'wreck'},
  metal:{a:'626762',b:'767768',mode:'metal'},
  store:{a:'535744',b:'6c6c55',mode:'metal'},
  red:{a:'764737',b:'9b6250',mode:'metal'},
  seat:{a:'5a4b3c',b:'796a56',mode:'wood'},
  display:{a:'222d26',b:'4b5547'},
},dimensions);
const glass=scene.material('Closed cockpit glazing',{factor:[.81,.90,.95,.46],alphaMode:'BLEND',roughness:.75,metallic:0});
const node=(name,mesh,parent=root,opts={})=>scene.node(name,parent,{mesh,...opts});
const body=[
 [-6.32,.020,.025,.36],[-6.24,.095,.10,.33],[-5.92,.22,.23,.29],[-5.50,.31,.30,.23],
 [-4.86,.39,.39,.15],[-4.18,.46,.46,.10],[-3.34,.52,.54,.04],[-2.54,.58,.60,.02],
 [-1.65,.65,.66,.00],[-.75,.72,.71,-.02],[.10,.78,.76,-.02],[.86,.83,.79,-.01],
 [1.60,.85,.81,.005],[2.24,.87,.82,.02],[2.79,.86,.81,.035],
];
const canopy=[
 body.at(-1),[3.12,.84,.795,.05],[3.48,.80,.775,.067],[3.83,.76,.735,.079],
 [4.17,.70,.68,.095],[4.50,.65,.62,.101],[4.84,.59,.55,.11],
 [5.13,.52,.485,.112],[5.44,.44,.399,.114],[5.70,.35,.31,.12],
 [5.94,.26,.234,.12],[6.11,.18,.154,.12],[6.24,.092,.085,.12],[6.32,.017,.018,.12]
];
const uBody=uv('fuselage'),loftOptions={minZ:-6.32,maxZ:6.32};
const shell=new Mesh();
loft(shell,body,40,uBody,{...loftOptions,capB:false});
loft(shell,canopy,40,uBody,{...loftOptions,capA:false,capB:false,cut:(_,j)=>j>=23&&j<=36});
node('FuselageShell',shell);
node('NoseGlazing',loft(new Mesh(),canopy,40,uv('glass'),{...loftOptions,
 capA:false,cut:(_,j)=>j<23||j>36}),root,{material:glass});

const frame=new Mesh(),uFrame=uv('frame');
function ringPoint(s,j,offset=.016){
 const [z,a,b,y]=canopy[s],t=j*TAU/40;
 return [(a+offset)*Math.cos(t),y+(b+offset)*Math.sin(t),z];
}
for(const k of [0,3,6,8,10,12]){
 for(let j=-3;j<23;j++)tube(frame,uFrame,ringPoint(k,j),ringPoint(k,j+1),.027,.027,6,{capA:false,capB:false});
}
for(const j of [-3,3,7,13,17,23]){
 for(let k=0;k<canopy.length-2;k++)tube(frame,uFrame,ringPoint(k,j),ringPoint(k+1,j),.027,.027,6,{capA:false,capB:false});
}
node('GlazingFrames',frame);
const cabin=new Mesh();
block(cabin,uv('cockpit'),[0,-.30,3.78],[1.19,.18,1.86]);
block(cabin,uv('cockpit'),[0,.19,4.70],[.84,.41,.16]);
block(cabin,uv('seat'),[0,.02,3.35],[.48,.54,.13]);
block(cabin,uv('seat'),[0,-.22,3.54],[.50,.15,.48]);
block(cabin,uv('display'),[0,.20,4.79],[.67,.28,.06]);
block(cabin,uv('frame'),[0,.25,4.10],[.065,.065,.38]);
for(const sign of [-1,1])block(cabin,uv('seat'),[sign*.46,-.09,3.98],[.14,.21,1.07]);
node('CockpitInterior',cabin);
const peri=new Mesh();
block(peri,uFrame,[0,.93,3.12],[.26,.20,.38]);
block(peri,uv('dark'),[0,1.015,3.01],[.17,.12,.17]);
node('RearViewPeriscope',peri);

const inner=[[.27,.53,2.00,-1.48,.42],[.75,.540,1.997,-1.45,.407],[1.22,.565,1.99,-1.39,.39],[2.22,.61,1.90,-1.24,.35],
 [3.11,.64,1.83,-1.10,.30],[4.12,.68,1.68,-.91,.26],[4.76,.70,1.59,-.81,.23]];
const outer=[inner.at(-1),[5.50,.73,1.39,-.68,.185],[6.40,.78,1.16,-.53,.128],
 [6.92,.80,.98,-.41,.09],[7.14,.805,.81,-.28,.055],[7.20,.806,.64,-.11,.031]];
const wingP=[uv('wingTop'),uv('wingBottom')],flaps=scene.node('flightFlaps',root);
for(const [side,sign] of [['Left',-1],['Right',1]]){
 const mirrored=rows=>rows.map(([x,...s])=>[sign*x,...s]);
 const surface=new Mesh(), a=mirrored(inner),b=mirrored(outer);
 wing(surface,a,...wingP,{to:.73,steps:12});wing(surface,b,...wingP,{to:.73,steps:12});
 node('Wing'+side,surface);
 const fPivot=[sign*.75,.540,-.530],aPivot=[sign*4.76,.70,-.162];
 node('Flap'+side,wing(new Mesh(),a.slice(1),...wingP,{from:.733,steps:6}).shift(scale(fPivot,-1)),flaps,
  {translation:fPivot,extras:rig('flap'+side,X,{range:[0,-.66]})});
 node('Aileron'+side,wing(new Mesh(),b,...wingP,{from:.733,steps:7}).shift(scale(aPivot,-1)),root,
  {translation:aPivot,extras:rig('roll',X,{gain:-sign*.48})});
}
const tailRows=[[.20,.81,-3.53,-5.67,.205],[.74,.86,-3.67,-5.70,.17],[1.52,.91,-3.94,-5.77,.13],
 [2.18,.96,-4.17,-5.80,.09],[2.55,.98,-4.38,-5.78,.061],[2.73,1.00,-4.57,-5.65,.033]];
for(const [side,sign] of [['Left',-1],['Right',1]]){
 const rows=tailRows.map(([x,...rest])=>[sign*x,...rest]),p=[sign*.20,.81,-4.99], spanRange=[0,2.73];
 node('Tailplane'+side,wing(new Mesh(),rows,uv('fin'),uv('nacelle'),{to:.68,spanRange}));
 node('Elevator'+side,wing(new Mesh(),rows,uv('fin'),uv('nacelle'),{from:.683,steps:7,spanRange}).shift(scale(p,-1)),
  root,{translation:p,extras:rig('pitch',X,{gain:.44})});
}
const finRows=[[.41,-2.74,-6.25,.36],[.81,-3.39,-6.32,.28],[1.50,-3.94,-6.31,.22],
 [2.12,-4.35,-6.20,.16],[2.63,-4.63,-5.96,.126],[2.87,-4.81,-5.76,.079],[3.015,-4.96,-5.53,.027]];
const rudderPivot=[0,.78,-5.47];
node('VerticalFin',fin(new Mesh(),finRows,uv('fin'),{to:.69}));
node('Rudder',fin(new Mesh(),finRows,uv('fin'),{from:.693,steps:8}).shift(scale(rudderPivot,-1)),root,
 {translation:rudderPivot,extras:rig('yaw',Y,{gain:.49})});

const engineRows=[[-2.21,.277,.277,-.054],[-2.00,.302,.302,-.054],[-1.57,.347,.347,-.065],
 [-1.12,.392,.392,-.082],[-.53,.400,.400,-.096],[.05,.400,.400,-.112],[.63,.395,.395,-.128],
 [1.11,.385,.385,-.135],[1.49,.370,.370,-.136],[1.65,.348,.348,-.135],[1.69,.314,.314,-.135]];
for(const [side,sign] of [['Left',-1],['Right',1]]){
 const x=sign*2.83,nacelle=new Mesh();
 loft(nacelle,engineRows,36,uv('nacelle'),{x,capA:false,capB:false});
 // Visible recesses are closed scenic surfaces.
 const front=[x,-.135,1.69],back=[x,-.054,-2.21];
 loft(nacelle,[[1.49,.304,.304,-.135],[1.65,.294,.294,-.135],[1.69,.314,.314,-.135]],36,uv('red'),
  {x,inside:true,capA:false,capB:false});
 loft(nacelle,[[1.485,.301,.301,-.135],[1.49,.304,.304,-.135]],36,uv('dark'),
  {x,inside:true,capA:true,capB:false});
 tube(nacelle,uv('metal'),[x,-.135,1.49],[x,-.135,1.65],.142,.077,26);
 loft(nacelle,[[-2.21,.277,.277,-.054],[-2.16,.249,.249,-.054],[-2.045,.226,.226,-.054]],36,uv('dark'),
  {x,inside:true,capA:false,capB:true});
 block(nacelle,uv('nacelle'),[x,.37,.03],[.26,.45,1.45]);
 node('Nacelle'+side,nacelle);
 scene.node('Exhaust'+side,root,{translation:back,extras:{exhaust:{radius:.33,direction:[0,0,-1]}}});
}
const keel=new Mesh();
for(const [x,y,z,w,l] of [[0,-.695,2.15,.23,.67],[-.38,-.656,.16,.18,.59],[.38,-.656,.16,.18,.59]])
 block(keel,uv('nacelle'),[x,y,z],[w,.085,l]);
node('RetractedSkidFairings',keel);
const storePivot=[0,-1.10,-.17],bomb=new Mesh();
loft(bomb,[[-.80,.035,.035],[-.73,.095,.095],[-.53,.118,.118],[-.33,.145,.145],[-.16,.185,.185],
 [.14,.185,.185],[.41,.169,.169],[.63,.128,.128],[.76,.066,.066],[.80,.018,.018]],24,uv('store'));
for(let i=0;i<4;i++){
 const a=i*Math.PI/2;
 block(bomb,uv('store'),[Math.cos(a)*.139,Math.sin(a)*.139,-.613],[.088,.051,.33],
  [[Math.cos(a),Math.sin(a),0],[-Math.sin(a),Math.cos(a),0],Z]);
}
node('Bomb',bomb,root,{translation:storePivot});
const cradle=new Mesh(),ports=new Mesh();
block(cradle,uv('dark'),[0,-.825,-.16],[.24,.18,.72]);node('ExternalStoreRack',cradle);
for(const [i,x] of [-.27,.27].entries()){
 block(ports,uv('nacelle'),[x,-.562,-3.02],[.17,.125,.58]);
 tube(ports,uv('dark'),[x,-.58,-3.20],[x,-.58,-3.43],.044,.039,12);
 scene.node('MuzzleRear'+(i+1),root,{translation:[x,-.58,-3.43],extras:{direction:[0,0,-1]}});
}
node('RearGunFairings',ports);
write();
