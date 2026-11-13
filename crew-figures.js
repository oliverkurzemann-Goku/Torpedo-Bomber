/* Articulated, metre-scale crew for both campaigns. Local +Z is forward. */
(function(root){
 'use strict';
 const uniforms={
  usnavy:{coat:0x35434d,pants:0x35434d,leather:0x583c2b,web:0xc3ae87,vest:0xd8a638,shirt:0xc4b290,cap:0xe1d9bd,canopy:[0xece4d1,0xd8d0be]},
  ijn:{coat:0x704535,pants:0x704535,leather:0x473526,web:0xb09b72,vest:0xb19251,shirt:0xb8a985,cap:0x263142,canopy:[0xede0c4,0xd7c5a4]},
  usaaf:{coat:0x654537,pants:0x76724e,leather:0x583d30,web:0xcabb96,shirt:0xd4c0a1,cap:0x65644d,canopy:[0xf0eadb,0xd9d2c2]},
  luftwaffe:{coat:0x555e69,pants:0x555d69,leather:0x4d382c,web:0x88826a,shirt:0xaea58f,cap:0x545d53,canopy:[0xe2ddd2,0xc9c4b8]}
 };
 const outfits={
  usnavy:{deckhand:[0x536979,0x43566a],boatMedic:[0x82775a,0x6d674e],medic:[0x666f51,0x6c6c52],bearer:[0x9a8867,0x6c6c52]},
  ijn:{deckhand:[0x293749,0x303f51],boatMedic:[0x6e7056,0x65634e],medic:[0x686d55,0x666650],bearer:[0x837650,0x666650]},
  usaaf:{deckhand:[0x637681,0x45515a],boatMedic:[0x82775a,0x6d674e],medic:[0x666f51,0x6c6c52],bearer:[0x9a8867,0x6c6c52]},
  luftwaffe:{deckhand:[0x4f5e65,0x444b53],boatMedic:[0x626657,0x53594f],medic:[0x576157,0x5d655b],bearer:[0x6a5946,0x5d655b],agent:[0x484b44,0x594c41],observer:[0x687165,0x595f51],officer:[0x56644f,0x55594c]}
 };
 const skinTones=[0xc29573,0xb68667,0xcd9f79,0xa87b60,0xb7886d];
 const groundUniforms={usaaf:[0x626b4f,0x858364,0x697050],luftwaffe:[0x596259,0x6a7276,0x4d584e],ijn:[0x887552,0x978664,0x81714d]};
 function create(T,{service='usaaf',role='pilot',variant=0,srgbOutput=false}={}){
  service=Object.hasOwn(uniforms,service)?service:'usaaf';
  const u=uniforms[service],pilot=['pilot','wounded','survivor'].includes(role),sea=service==='usnavy'||service==='ijn';
  const deckSignal=role==='deckSignal',deckCrew=role==='deckhand'||deckSignal;
  const [coat,pants,cap=u.cap]=role==='groundCrew'?(groundUniforms[service]||groundUniforms.usaaf)
   :deckSignal?[service==='ijn'?0xaa8c55:0xc5a448,outfits[service].deckhand[1]]
   :outfits[service][role]||outfits.luftwaffe[role]||[u.coat,u.pants];
  const index=Math.abs(Math.trunc(variant))%skinTones.length;
  const skin=skinTones[(index+(service==='ijn'?1:0))%skinTones.length];
  const color=value=>{const c=new T.Color(value);if(srgbOutput)c.convertSRGBToLinear();return c;};
  const palette={coat:color(coat),pants:color(pants),leather:color(u.leather),skin:color(skin),web:color(u.web),
   shirt:color(u.shirt),cap:color(cap),boot:color(0x322a24),iron:color(0x878579),glass:color(0x3a4b4d),
   vest:color(u.vest??0xbb9e5d),dressing:color(0xe2d8bf),pocket:color(coat).multiplyScalar(.90),
   pantsPocket:color(pants).multiplyScalar(.88),seam:color(coat).multiplyScalar(.73)};
  const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.88});
  const figure=new T.Group();figure.name=pilot?'pilot':role;
  const bins=new Map();
  function part(name,parent=figure,x=0,y=0,z=0){const node=new T.Group();node.name=name;node.position.set(x,y,z);parent.add(node);return node;}
  function add(node,shape,pos,shade,rotate=[0,0,0]){
   const transform=new T.Matrix4().makeRotationFromEuler(new T.Euler(...rotate));transform.setPosition(...pos);shape.applyMatrix4(transform);
   const data=bins.get(node)||{position:[],normal:[],color:[],indices:[]},tint=palette[shade];
   const offset=data.position.length/3,count=shape.attributes.position.count;
   for(const name of ['position','normal'])data[name].push(...shape.attributes[name].array);
   for(let i=0;i<count;i++)data.color.push(tint.r,tint.g,tint.b);
   for(const index of shape.index.array)data.indices.push(index+offset);
   shape.dispose();bins.set(node,data);
  }
  function oval(node,size,pos,shade,rotate){const g=new T.SphereGeometry(1,10,7);g.scale(...size);add(node,g,pos,shade,rotate);}
  function box(node,size,pos,shade,rotate){add(node,new T.BoxGeometry(...size),pos,shade,rotate);}
  function cylinder(node,top,bottom,length,pos,shade,rotate){add(node,new T.CylinderGeometry(top,bottom,length,10),pos,shade,rotate);}
  function strap(node,a,b,width,shade){
   const dx=b[0]-a[0],dy=b[1]-a[1];
   box(node,[width,Math.hypot(dx,dy),.015],[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],shade,[0,0,Math.atan2(-dx,dy)]);
  }
  // Slightly asymmetric widths, shaped shoulders, waist and knees keep the silhouettes distinct.
  const scale=[1, .95, 1.035, .98, 1.02][index];
  figure.scale.set([1,.92,1.07,1.04,.96][index],scale,1);
  const hips=part('hips',figure,0,.87,0),upper=part('upperBody',hips),jacket=part('flightJacket',upper);
  oval(hips,[.175,.125,.115],[0,.015,0],'pants');
  const longCoat=role==='agent'||role==='officer';
  oval(jacket,[.222,.29,.138],[0,.307,0],'coat');
  oval(jacket,[.182,longCoat?.30:.19,.125],[0,longCoat?.065:.168,0],'coat');
  oval(jacket,[.245,.118,.12],[0,.476,0],'coat');
  box(jacket,[.012,.43,.015],[0,.27,.137],'seam');
  box(jacket,[.30,.045,.24],[0,.055,0],longCoat?'coat':'boot');
  box(jacket,[.058,.044,.018],[0,.055,.126],longCoat?'coat':'iron');
  for(const side of [-1,1]){
   const x=side*.109;
   box(jacket,[.104,.105,.016],[x,.307,.126],'pocket');
   box(jacket,[.116,.027,.023],[x,.357,.14],'seam');
   box(jacket,[.016,.016,.009],[x,.346,.154],'iron');
   const shearling=pilot&&service==='usaaf';
   box(jacket,[shearling?.109:.076,shearling?.079:.057,.025],[side*.062,.512,.119],shearling?'shirt':role==='agent'?'leather':'seam',[-.33,0,-side*.59]);
  }
  if(pilot&&sea){
   if(service==='ijn'){
    for(const side of [-1,1])oval(jacket,[.075,.184,.063],[side*.088,.355,.146],'vest',[0,0,-side*.36]);
    oval(jacket,[.143,.065,.079],[0,.522,.028],'vest');
   }else{
    for(const side of [-1,1])oval(jacket,[.088,.163,.066],[side*.105,.333,.143],'vest');
    box(jacket,[.26,.027,.021],[0,.203,.177],'web');
    cylinder(jacket,.011,.011,.115,[.119,.278,.213],'boot',[0,0,-.26]);
   }
  }
  if(pilot){
   const seat=part('seatHarness',hips),pack=part('parachutePack',upper);
   for(const side of [-1,1]){
    const vestDepth=sea?.207:.147;
    strap(jacket,[side*.151,.49,vestDepth],[side*.055,.116,vestDepth],.035,'web');
    strap(seat,[side*.075,.117,.131],[side*.122,-.07,.09],.026,'web');
   }
   box(jacket,[.073,.055,.022],[0,.159,sea?.219:.158],'iron');
   if(role==='pilot'){
    oval(pack,[.162,.215,.082],[0,.31,-.164],'web');
    for(const y of [.229,.383])box(pack,[.297,.023,.025],[0,y,-.223],'leather');
   }
  }
  if(role==='boatMedic'||role==='medic'||role==='observer'||role==='agent'||role==='officer'){
   const kit=part(role==='observer'?'observerFieldKit':role==='agent'?'agentSatchel':'fieldSatchel',upper);
   strap(kit,[-.16,.50,.155],[.17,.08,.152],.031,role==='agent'?'leather':'web');
   box(kit,[.182,.159,.083],[.192,.116,.049],role==='agent'?'leather':'web');
   box(kit,[.187,.058,.093],[.192,.187,.053],role==='agent'?'leather':'web');
   box(kit,[.028,.025,.012],[.192,.144,.104],'iron');
   if(role==='observer')for(const side of [-1,1]){
    cylinder(kit,.025,.032,.10,[side*.034,.348,.18],'boot',[.38,0,0]);
    cylinder(kit,.027,.027,.013,[side*.034,.299,.199],'glass',[.38,0,0]);
   }
   if(role==='boatMedic')for(const side of [-1,1])oval(jacket,[.081,.143,.049],[side*.115,.349,.155],'vest');
  }
  const head=part('head',upper,0,.646,.007),face=part('face',head),helmet=part('helmet',head),goggles=part('goggles',head);
  oval(upper,[.055,.086,.054],[0,.552,.005],'skin');
  oval(face,[[.103,.097,.108,.101,.106][index],.132,.095],[0,.006,0],'skin');
  oval(face,[[.072,.067,.079,.071,.076][index],.067,.078],[0,-.051,.012],'skin');
  oval(face,[[.020,.018,.024,.020,.022][index],.032,.027],[.002,-.001,.09],'skin');
  box(face,[.045,.007,.011],[0,-.053,.085],'leather');
  for(const side of [-1,1]){
   oval(face,[.017,.029,.023],[side*.099,-.011,.003],'skin');
   oval(face,[.018,.006,.008],[side*.038,.021,.088],'boot');
   box(face,[.036,.009,.009],[side*.038,.038,.086],'leather',[0,0,side*.1]);
  }
  if(pilot){
   oval(helmet,[.110,.084,.101],[0,.060,-.007],'leather');
   for(const side of [-1,1]){
    oval(helmet,[.029,.052,.049],[side*.095,-.014,-.008],'leather');
    strap(helmet,[side*.09,-.017,.037],[side*.062,-.092,.063],.015,'web');
    const small=service==='ijn'||service==='luftwaffe';
    oval(goggles,[small?.037:.043,.026,.017],[side*.043,.064,.087],'iron');
    oval(goggles,[small?.029:.033,.019,.013],[side*.043,.065,.099],'glass');
   }
   box(goggles,[.027,.012,.018],[0,.063,.10],'leather');
  }else if(role==='agent'){
   oval(helmet,[.114,.056,.110],[0,.095,-.009],'coat');
   oval(helmet,[.146,.012,.138],[0,.058,.009],'coat');
   box(helmet,[.197,.021,.155],[0,.064,0],'leather');
  }else if(deckCrew||role==='groundCrew'||role==='officer'||role==='boatMedic'||role==='observer'){
   oval(helmet,[.124,.048,.111],[0,.104,-.005],deckCrew||role==='groundCrew'?'cap':'coat');
   oval(helmet,[.105,.012,.070],[0,.062,.055],deckCrew&&service!=='ijn'?'cap':'boot');
  }else{
   oval(helmet,[.124,.078,.11],[0,.068,-.013],'cap');
   oval(helmet,[.133,.014,.126],[0,.040,-.012],'cap');
  }
  const arms=[],forearms=[],hands=[],legs=[],shins=[];
  for(const side of [-1,1]){
   const name=side<0?'left':'right';
   const arm=part(name+'Arm',upper,side*.221,.484,0),elbow=part(name+'Elbow',arm,side*.018,-.275,.004);
   const hand=part(name+'Hand',elbow,0,-.288,.013);
   oval(arm,[.073,.177,.071],[side*.016,-.118,0],'coat');
   oval(elbow,[.061,.075,.061],[0,-.012,.001],'coat');
   oval(elbow,[.058,.146,.059],[0,-.119,.009],'coat');
   cylinder(elbow,.057,.057,.051,[0,-.221,.007],'seam');
   if(role==='wounded'&&side<0){
    cylinder(elbow,.061,.063,.105,[0,-.139,.009],'dressing');
    box(elbow,[.039,.058,.017],[0,-.143,.067],'dressing',[0,0,.32]);
   }
   oval(hand,[.046,.060,.041],[0,0,0],pilot?'leather':'skin');
   oval(hand,[.019,.030,.019],[-side*.033,.013,.022],pilot?'leather':'skin');
   arms.push(arm);forearms.push(elbow);hands.push(hand);
   const leg=part(name+'Leg',hips,side*.094,0,0),shin=part(name+'Knee',leg,0,-.39,0),boot=part(name+'Boot',shin,0,-.353,0);
   oval(leg,[.094,.228,.094],[0,-.174,.002],'pants');
   oval(shin,[.073,.093,.077],[0,-.022,.010],'pants');
   oval(shin,[.073,.19,.078],[0,-.129,.014],'pants');
   if(pilot)box(leg,[.088,.107,.019],[side*.019,-.196,.088],'pantsPocket');
   const highBoot=service==='luftwaffe'&&pilot;
   cylinder(boot,.066,.072,highBoot?.213:.119,[0,highBoot?.072:.043,.009],'boot');
   oval(boot,[.073,.054,.136],[0,-.042,.057],'boot');
   oval(boot,[.075,.015,.138],[0,-.095,.056],'boot');
   for(let i=0;i<3;i++)box(boot,[.066,.007,.011],[0,.007-i*.011,.075+i*.019],'web');
   legs.push(leg);shins.push(shin);
  }
  for(const [node,data] of bins){
   const geometry=new T.BufferGeometry();geometry.setIndex(data.indices);
   for(const name of ['position','normal','color'])geometry.setAttribute(name,new T.Float32BufferAttribute(data[name],3));
   geometry.computeBoundingSphere();node.add(new T.Mesh(geometry,material));
  }
  figure.userData={service,role,variant:index,arms,forearms,hands,legs,shins,upper,head};
  pose(figure,'stand');
  return figure;
 }

 function pose(figure,mode,time=0){
  const {arms,forearms,legs,shins,upper,head,variant}=figure.userData;
  upper.rotation.set(0,0,0);head.rotation.set(0,0,0);
  for(let i=0;i<2;i++){
   const side=i?1:-1;
   arms[i].rotation.set(.03,0,side*.10);forearms[i].rotation.x=-.14;
   legs[i].rotation.set(0,0,side*.035);shins[i].rotation.x=0;
   if(mode==='chute'){
    arms[i].rotation.set(-1.17,0,side*(.17+variant*.023));forearms[i].rotation.x=-1.48;
    legs[i].rotation.x=-.11+(i-variant%2)*.11;shins[i].rotation.x=.16;
   }else if(mode==='float'||mode==='wounded'||mode==='stretcher'){
    const lying=mode==='stretcher';
    upper.rotation.x=lying?-1.16:mode==='wounded'?-.20:-.09;
    head.rotation.x=lying?.64:.1;head.rotation.y=mode==='wounded'?-.23:0;
    arms[i].rotation.set(lying?-.18:-.62,0,side*.11);forearms[i].rotation.x=-.34;
    legs[i].rotation.x=lying?-1.55:i?-1.36:-1.93;shins[i].rotation.x=lying?.10:i?.20:1.25;
   }else if(mode==='kneel'){
    upper.rotation.x=.27;head.rotation.x=-.19;
    arms[i].rotation.set(-.55,0,side*.14);forearms[i].rotation.x=i?-1.05:-.56;
    legs[i].rotation.x=i?-1.41:.07;shins[i].rotation.x=i?1.22:1.58;
   }else if(mode==='line'||mode==='carry'){
    upper.rotation.x=mode==='line'?.19:.09;
    arms[i].rotation.set(-.70,0,-side*.13);forearms[i].rotation.x=mode==='line'?-.48:-.28;
    legs[i].rotation.x=i?.12:-.15;shins[i].rotation.x=.12;
   }else if(mode==='walk'||mode==='run'){
    const run=mode==='run',step=Math.sin(time*(run?10:7)+i*Math.PI);
    upper.rotation.x=run?.12:.055;
    arms[i].rotation.x=-step*(run?.63:.27);forearms[i].rotation.x=run?-1.02:-.27;
    legs[i].rotation.x=step*(run?.67:.32);shins[i].rotation.x=Math.max(0,step)*(run?.84:.40);
   }
  }
 }
 function place(T,figure,x,y,z){
  figure.position.set(x,0,z);
  const bounds=new T.Box3().setFromObject(figure);
  figure.position.y=y-bounds.min.y;
 }
 function dispose(node){
  const geometry=new Set(),materials=new Set();node.traverse(o=>{if(o.geometry)geometry.add(o.geometry);if(o.material)materials.add(o.material);});
  geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
 }
 // Bake a rig section into a single indexed, vertex-coloured instance mesh.
 function bake(T,root,omit=[]){
  root.updateWorldMatrix(true,true);
  const inverse=root.matrixWorld.clone().invert(),matrix=new T.Matrix4(),normalMatrix=new T.Matrix3();
  const point=new T.Vector3(),data={position:[],normal:[],color:[]},indices=[];
  function collect(node){
   if(omit.includes(node))return;
   if(node.isMesh){
    const {geometry}=node,{position,normal,color}=geometry.attributes;
    const offset=data.position.length/3;
    matrix.multiplyMatrices(inverse,node.matrixWorld);normalMatrix.getNormalMatrix(matrix);
    for(let i=0;i<position.count;i++){
     point.fromBufferAttribute(position,i).applyMatrix4(matrix);data.position.push(point.x,point.y,point.z);
     point.fromBufferAttribute(normal,i).applyNormalMatrix(normalMatrix);data.normal.push(point.x,point.y,point.z);
     data.color.push(color.getX(i),color.getY(i),color.getZ(i));
    }
    for(const index of geometry.index.array)indices.push(offset+index);
   }
   node.children.forEach(collect);
  }
  collect(root);
  const geometry=new T.BufferGeometry();geometry.setIndex(indices);
  for(const [name,values] of Object.entries(data))geometry.setAttribute(name,new T.Float32BufferAttribute(values,3));
  geometry.computeBoundingSphere();return geometry;
 }
 function canopyColors(service){return (uniforms[service]||uniforms.usaaf).canopy;}
 root.CrewFigures={create,pose,place,dispose,bake,canopyColors};
 if(typeof module==='object'&&module.exports)module.exports=root.CrewFigures;
})(typeof window==='undefined'?globalThis:window);
