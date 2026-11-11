'use strict';
const {make,rig}=require('./config.cjs');
const {Mesh,X,Y,Z,TAU,block,beam,tube,loft,wing,fin,unit,scale,add}=require('./mesh.cjs');
const {absorb,dome,wheels,crossMark}=require('./parts.cjs');
const {letters}=require('./atlas.cjs');

function code(text,u,v,x,y,w,h){
 return letters(text,u,v,x,y,w,h)?14:undefined;
}
function marks(c,u,v,cx,cy,rx,ry){
 if(c.japan)return Math.hypot((u-cx)/rx,(v-cy)/ry)<1?14:undefined;
 const n=crossMark(u,v,cx,cy,2*rx,2*ry);
 return n<0?undefined:n;
}
function colour(c){
 const [a,b,bottom]=c.colors,bright=c.japan?'b7141c':c.night?'bac0bb':'e6e3d3';
 const line='d9b21f';
 const upper={a,b,mode:c.night?'hull':'aircraft'};
 const lower={a:bottom,b:c.night?'24282b':c.japan?'818775':'798fa5',mode:'hull'};
 const body={...upper,toneLimit:1,tones:[a,b,bottom,c.night?'25292d':lower.b],
  inks:{13:'98978c',14:bright,15:c.night?'696f75':'262922'},sample(u,v){
   const y=v>.5?v-1:v,front=(v<=.25||v>=.75),side=front?y:v-.5;
   if(c.japan&&Math.abs(u-c.band)<.014)return 13;
   const n=marks(c,u,side,c.mark??.36,0,c.japan?.036:.044,.077);
   if(n!==undefined&&Math.abs(side)<.12)return n;
   const written=code(c.number,front?1-u:u,side,front?.48:.44,-.040,.101,.065);
   if(written!==undefined&&Math.abs(side)<.12)return c.japan?12:14;
   if(v>.53&&v<.96){
    const s=(.5+.5*Math.sin(u*95+v*59))*.21+.28*Math.sin(u*18+v*42);
    return 8+Math.max(0,Math.min(3,Math.round(1.6+s)));
   }
  }};
 if(c.japan)body.inks[12]='e6e3d3';
 const insignia={13:line,14:bright,15:c.night?'696f75':'262922'};
 const onWing=(u,v)=>{
  if(c.japan&&u<.55&&u>.15&&v<.086)return 13;
  return marks(c,u,v,.755,.49,.096,.28);
 };
 return {body,upper,lower,wingTop:{...upper,reserve:true,inks:insignia,sample:onWing},wingBottom:{...lower,reserve:true,inks:insignia,sample:onWing},
  engine:{a:c.night?'51555e':c.japan?'303538':a,b:'242628',mode:'engine'},
  glass:{a:c.night?'45687b':'60889c',b:'2f4953',mode:'lens'},
  frame:{a:c.night?'454a4d':a,b:c.night?'242629':b,mode:'metal'},
  rubber:{a:'393b3a',b:'6b6050',mode:'tyre'},
  steel:{a:'8b8e81',b:'655e4a',mode:'metal'},
  dark:{a:'292b2a',b:'41392d',mode:'wreck'},
  wood:{a:'403e30',b:'6e553c',mode:'wood',inks:{13:'c7a34b'},sample:u=>u>.935?13:undefined},
  blade:{a:'34393c',b:'252b2b',mode:'metal',inks:{13:'d9b21f'},sample:u=>u>.935?13:undefined},
  store:{a:'707568',b:'41463f',mode:'metal'},
  fabric:{a,b,mode:'aircraft'},
 };
}
function propeller(mesh,uv,blades,dia,wooden){
 const r=dia/2,blade=uv(wooden?'wood':'blade');
 tube(mesh,uv('engine'),[0,0,-.15],[0,0,.05],.17,.154,24);
 loft(mesh,[[-.06,.158,.158,0],[.11,.138,.138,0],[.19,.074,.074,0],[.205,.026,.026,0]],24,uv('engine'));
 for(let j=0;j<blades;j++){
  const a=TAU*j/blades+(blades===2?.03:Math.PI/2),ct=Math.cos(a),st=Math.sin(a);
  const outline=[[.06,-.049],[.19,-.065],[.51,-.092],[.77,-.074],[.96,-.030],[1,.002],[.975,.033],[.60,.077],[.17,.057]];
  const perimeter=outline.map(([u,v])=>[r*(u*ct-v*st),r*(u*st+v*ct)]);
  const p=(i,z)=>[...perimeter[i],z];
  const t=(i,v)=>blade(outline[i][0],v);
  for(const z of [-.021,.021])mesh.face(perimeter.map((_,i)=>p(i,z)),
   outline.map(([u,v])=>blade(u,.5+v*4.8)),[0,0,Math.sign(z)]);
  for(let i=0;i<outline.length;i++){
   const j=(i+1)%outline.length,q=perimeter[i],b=perimeter[j];
   mesh.face([p(i,-.021),p(j,-.021),p(j,.021),p(i,.021)],[t(i,0),t(j,0),t(j,1),t(i,1)],unit([b[1]-q[1],q[0]-b[0],0]));
  }
 }
}
function splitRows(rows,x){
 for(let i=1;i<rows.length;i++){
  const a=rows[i-1],b=rows[i];
  if(Math.abs(b[0]-x)<1e-8)return i;
  if(b[0]>x){
   const t=(x-a[0])/(b[0]-a[0]);
   rows.splice(i,0,a.map((v,k)=>v+(b[k]-v)*t));
   return i;
  }
 }
 throw Error('Span hinge lies outside wing.');
}
function wingAssembly(c,scene,root,uv){
 const fixed=new Mesh(),slats=new Mesh(),tail=new Mesh(),flaps=scene.node('flightFlaps',root);
 const yTop=uv('wingTop'),yBottom=uv('wingBottom'),range=[0,c.span/2],tailRange=[0,c.tail.at(-1)[0]];
 const sections=c.wing.map(([x,y,...r])=>[x,y+(c.storch?.00757:0),...r]);
 const inner=splitRows(sections,c.id==='g4m1-own'?1.18:.51),flapIndex=splitRows(sections,c.flapSpan);
 const control=c.storch?.71:.70;
 for(const s of [-1,1]){
  const suffix=s<0?'Left':'Right';
  const rows=sections.map(([x,...r])=>[x*s,...r]);
  const right=rows[flapIndex],first=rows[inner];
  wing(fixed,rows,yTop,yBottom,{to:control,steps:14,spanRange:range});
  wing(fixed,rows.slice(0,inner+1),yTop,yBottom,{from:control+.0007,steps:7,spanRange:range});
  for(const [name,group,list,drive,p] of [
   ['Flap',flaps,rows.slice(inner,flapIndex+1),'flap'+suffix,first],
   ['Aileron',root,rows.slice(flapIndex),'roll',right],
  ]){
   const m=new Mesh(),pivot=[p[0],p[1],p[2]+(p[3]-p[2])*(control+.0007)];
   wing(m,list,uv('upper'),uv('lower'),{from:control+.0007,steps:8,spanRange:range});
   m.shift(scale(pivot,-1));
   scene.node(name+suffix,group,{mesh:m,translation:pivot,
    extras:rig(drive,X,drive==='roll'?{gain:s<0?.35:-.35}:{range:[0,-(c.storch?.90:.66)]})});
  }
  const tRows=c.tail.map(([x,...r])=>[x*s,...r]);
  const e=new Mesh(),p=tRows[0],k=.60,ep=[p[0],p[1],p[2]+(p[3]-p[2])*k];
  wing(tail,tRows,uv('upper'),uv('lower'),{to:k,steps:9,spanRange:tailRange});
  wing(e,tRows,uv('upper'),uv('lower'),{from:k+.001,steps:7,spanRange:tailRange});
  e.shift(scale(ep,-1));
  scene.node('Elevator'+suffix,root,{mesh:e,translation:ep,extras:rig('pitch',X,{gain:.39})});
  if(c.storch){
   const lead=rows.map(([x,y,z])=>[x,y+.029,z+.132,z+.034,.104]);
   wing(slats,lead,uv('upper'),uv('lower'),{steps:6,spanRange:range});
   for(const x of [1.14,3.17,5.43,6.74])block(slats,uv('frame'),[s*x,2.877,1.59],[.057,.053,.21]);
  }
 }
 scene.node('MainWing',root,{mesh:fixed});
 scene.node('Tailplane',root,{mesh:tail});
 if(c.storch)scene.node('FixedLeadingEdgeSlats',root,{mesh:slats});
}
function canopyAssembly(c,scene,root,uv,glass){
 const windows=new Mesh(),structure=new Mesh(),r=c.canopy;
 const g=uv('glass'),f=uv('frame');
 const p=([z,y,w,h],col)=>{
  const x=[-w,-w*.86,-w*.54,w*.54,w*.86,w][col];
  return [x,y+[0,.59,1,1,.59,0][col]*h,z];
 };
 for(let i=0;i<r.length-1;i++)for(let k=0;k<5;k++){
  const a=[p(r[i],k),p(r[i+1],k),p(r[i+1],k+1),p(r[i],k+1)];
  windows.face(a,[g(0,1),g(1,1),g(1,0),g(0,0)],[(k-2)*.6,1,0]);
  if(i===0||k===0||k===5||k===1||k===4)beam(structure,f,a[0],a[1],c.glassFrame??.041);
  if(i<r.length-2)beam(structure,f,a[0],a[3],c.glassFrame??.041);
 }
 for(let k=0;k<5;k++)beam(structure,f,p(r.at(-1),k),p(r.at(-1),k+1),c.glassFrame??.041);
 const pivot=c.doorPivot??[0,r.at(-2)[1],r.at(-2)[0]];
 const canopy=scene.node('Canopy',root,{translation:pivot,extras:rig('canopy',c.storch?Z:X,{
  range:[0,c.storch?.92:.54],...(c.id==='d3a1-own'?{translationAxis:[0,0,-1],translationRange:[0,.56]}:{})
 })});
 scene.node('CanopyGlazing',canopy,{mesh:windows.shift(scale(pivot,-1)),material:glass});
 scene.node('CanopyFrames',canopy,{mesh:structure.shift(scale(pivot,-1))});
}
function finAssembly(c,scene,root,uv){
 const fixed=new Mesh();
 for(const s of c.doubleFin?[-1,1]:[0]){
  const x=s*(c.doubleFin??0),rs=c.fin,k=.66;
  const fixedPart=new Mesh(),m=new Mesh(),p=[x,rs[0][0],rs[0][1]+(rs[0][2]-rs[0][1])*k];
  const o={spanRange:[rs[0][0],rs.at(-1)[0]],steps:11};
  fin(fixedPart,rs,uv('fabric'),{...o,to:k});absorb(fixed,fixedPart.shift([x,0,0]));
  fin(m,rs,uv('fabric'),{...o,from:k+.0006});
  m.shift([0,-p[1],-p[2]]);
  scene.node(s===0?'Rudder':s<0?'RudderLeft':'RudderRight',root,{mesh:m,translation:p,extras:rig('yaw',Y,{gain:.41})});
 }
 scene.node(c.doubleFin?'TwinVerticalStabilizers':'VerticalStabilizer',root,{mesh:fixed});
}
function gearAssembly(c,scene,root,uv){
 const group=scene.node('gear',root);
 const [x,top,z,radius,width,tz,tr]=c.gear;
 for(const s of [-1,0,1]){
  const tail=s===0,suffix=tail?'TailGear':s<0?'GearLeft':'GearRight';
  const pivot=[tail?0:s*x,tail?c.tailGearHeight:top,tail?tz:z];
  const r=tail?tr:radius,d=tail?.11:width,leg=new Mesh(),tyre=new Mesh();
  const cc=[tail?0:s*(c.storch?.235:.03),r-pivot[1],tail?-.18:(c.retract?.33:.08)];
  if(c.id==='d3a1-own'&&!tail){
   loft(leg,[[-.53,.11,.30,-.72],[-.29,.245,.64,-.73],[.13,.28,.72,-.72],[.43,.23,.62,-.70],[.61,.083,.42,-.67]],
    24,uv('body')).shift([0,.048,0]);
  }
  beam(leg,uv('steel'),[0,0,0],cc,tail?.082:c.storch?.104:.151);
  if(!tail){
   tube(leg,uv('steel'),[0,0,0],[cc[0]*.61,cc[1]*.61,cc[2]*.61],.087,.068,14);
   beam(leg,uv('lower'),[s*(c.storch?-1.25:-.36),c.storch?-.63:-.23,-.39],cc,c.storch?.070:.098);
  }
  if(tail)tube(leg,uv('steel'),[0,-.06,-.08],[0,cc[1]+.13,-.17],.071,.060,12);
  const node=scene.node(suffix,group,{mesh:leg,translation:pivot,
   extras:rig('gear',X,{range:[0,c.retract?(tail?-.80:1.42):0]})});
  wheels(tyre,uv,cc[0],cc[1],cc[2],r,d,{count:24,paint:'steel'});
  scene.node(tail?'TailWheel':'MainWheel'+(s<0?'Left':'Right'),node,{mesh:tyre,extras:{groundWheel:true}});
 }
}
function engineAssembly(c,scene,root,uv){
 const [y,z,dx,dia,count]=c.engine;
 const radial=c.radial;
 const mount=c.twin?[-1,1]:[0];
 for(const s of mount){
  const name=s===0?'':s<0?'Left':'Right',x=s*dx;
  const pod=new Mesh(),engine=new Mesh();
  if(c.twin){
   const rs=c.engineRows.map(([z,rx,ry,off=0])=>[z,rx,ry,y+off]);
   loft(pod,rs,36,uv(c.night?'body':'engine'),{x,capB:!radial});
  }else if(radial)loft(pod,[[z-1.39,.61,.59,y],[z-1.04,.733,.70,y],[z-.39,.747,.712,y],
   [z-.19,.69,.67,y],[z-.105,.57,.54,y]],36,uv('engine'),{capB:false});
  if(radial){
   const rr=c.twin?.87:.55;
   tube(pod,uv('dark'),[x,y,z-.27],[x,y,z-.122],rr,rr,36);
   for(let i=0;i<14;i++){
    const a=i/14*TAU,r=t=>[x+Math.cos(a)*t,y+Math.sin(a)*t,z-.103];
    tube(engine,uv('steel'),r(rr*.24),r(rr*.92),rr*.128,rr*.116,10);
   }
   tube(engine,uv('dark'),[x,y,z-.17],[x,y,z-.049],.23,.195,20);
  }else{
   block(pod,uv('dark'),[x,y-.27,z-.24],[c.twin?.40:.29,.24,.41]);
   for(const ss of [-1,1]){
    if(c.night){
     tube(pod,uv('dark'),[x+ss*.528,y-.047,z-.70],[x+ss*.583,y-.089,z-2.12],.088,.104,14);
     tube(pod,uv('engine'),[x+ss*.587,y-.09,z-2.12],[x+ss*.591,y-.11,z-2.26],.104,.087,14);
    }else{
     for(let j=0;j<4;j++){
      const zz=z-.68-j*.115;
      tube(pod,uv('dark'),[x+ss*.414,y-.23,zz],[x+ss*.475,y-.251,zz-.102],.038,.041,10);
     }
    }
   }
  }
  scene.node((radial||c.twin?'EngineNacelle':'ArgusCowlingDetails')+name,root,{mesh:pod});
  if(radial)scene.node('RadialEngine'+name,root,{mesh:engine});
  const prop=new Mesh();propeller(prop,uv,count,dia,c.storch);
  scene.node('Propeller'+name,root,{mesh:prop,translation:[x,y,z],extras:rig('prop',Z,{blades:count})});
 }
}
function muzzle(scene,name,parent,point,direction=Z){
 const v=unit(direction);
 const rot=Math.abs(v[2]+1)<1e-8?[0,1,0,0]:(()=>{
  const q=[-v[1],v[0],0,1+v[2]],s=Math.hypot(...q);return q.map(x=>x/s);
 })();
 scene.node(name,parent,{translation:point,rotation:rot,extras:{direction:v}});
}
function appendages(c,scene,root,uv,glass){
 if(c.storch){
  const m=new Mesh();
  for(const s of [-1,1]){
   for(const [z,zz] of [[.98,1.13],[-.29,-.01]]){
    beam(m,uv('frame'),[s*.36,1.56,z],[s*4.28,2.82,zz],.073,.095);
   }
   beam(m,uv('frame'),[s*.36,.97,.89],[s*1.68,.47,1.09],.056);
   block(m,uv('steel'),[s*.462,1.43,-.36],[.27,.063,.38]);
  }
  scene.node('WingLiftStrutsAndSteps',root,{mesh:m});
 }
 if(c.storch||c.id==='d3a1-own'){
  const [x,y,z]=c.rearGun,g=new Mesh();
  tube(g,uv('dark'),[0,0,.104],[0,.066,-.57],.044,.026,12);
  const rear=scene.node('RearGun',root,{mesh:g,translation:[x,y,z],extras:rig('yaw',Y,{gain:.49})});
  muzzle(scene,'MuzzleRear',rear,[0,.066,-.57],[0,.065,-1]);
 }
 if(c.id==='d3a1-own'){
  const racks=new Mesh();
  for(const s of [-1,1]){
   block(racks,uv('steel'),[s*2.64,1.19,.27],[.123,.11,.62]);
   const b=new Mesh(),p=[s*2.71,1.32,.21];
   // Open slots keep the dive-brake silhouette clear in a close view.
   for(const z of [.04,-.33])block(b,uv('steel'),[s*.81,0,z],[1.62,.053,.079]);
   for(let j=0;j<7;j++)block(b,uv('lower'),[s*(.054+j*.252),0,-.144],[.082,.053,.36]);
   scene.node(s<0?'DiveBrakeLeft':'DiveBrakeRight',root,{mesh:b,translation:p,extras:rig('brake',X,{range:[0,1.2]})});
   beam(racks,uv('dark'),[s*.21,1.05,.22],[s*.31,.69,.97],.065);
   beam(racks,uv('dark'),[s*.31,.69,.97],[s*.15,.64,.83],.061);
  }
  scene.node('BombYokeAndWingRacks',root,{mesh:racks});
  const b=new Mesh();
  loft(b,[[-.91,.037,.037,0],[-.73,.128,.128,0],[-.56,.187,.187,0],[.42,.186,.186,0],[.69,.153,.153,0],[.87,.055,.055,0],[.91,.016,.016,0]],26,uv('store'));
  for(let i=0;i<4;i++){
   const a=i*Math.PI/2,cs=Math.cos(a),sn=Math.sin(a);
   block(b,uv('store'),[cs*.173,sn*.173,-.68],[.13,.042,.37],[[cs,sn,0],[-sn,cs,0],Z]);
  }
  scene.node('Bomb',root,{mesh:b,translation:[0,.54,.28]});
  muzzle(scene,'Muzzle1',root,[-.27,2.46,3.97]);muzzle(scene,'Muzzle2',root,[.27,2.46,3.97]);
 }
 if(c.night){
  const a=new Mesh(),z=c.length/2,x=.67,y=2.12;
  // Four visible H-shaped antenna clusters and their mounts are baked as static scenery.
  for(const s of [-1,1])for(const u of [-1,1]){
   const xx=s*x,yy=y+u*.39;
   beam(a,uv('frame'),[s*.14,y+u*.13,z-1.18],[xx,yy,z-.34],.057);
   tube(a,uv('steel'),[xx,yy,z-.52],[xx,yy,z],.028,.025,10);
   tube(a,uv('steel'),[xx-.39,yy,z-.042],[xx+.39,yy,z-.042],.026,.026,10);
   for(const d of [-1,1]){
    tube(a,uv('steel'),[xx+d*.34,yy-.28,z-.042],[xx+d*.34,yy+.28,z-.042],.019,.019,8);
   }
  }
  scene.node('LichtensteinSN2AntennaArray',root,{mesh:a});
  const m=new Mesh();
  for(const [i,x] of [-.31,-.15,.15,.31].entries()){
   const p=[x,2.09+(i===0||i===3?.12:0),z-.66];
   tube(m,uv('dark'),[x,p[1],p[2]-.24],p,.037,.029,10);
   muzzle(scene,'Muzzle'+(i+1),root,p);
  }
  for(const [i,x] of [-.18,.18].entries()){
   const p=[x,2.77,-.93];
   tube(m,uv('dark'),[x,2.49,-1.22],p,.054,.043,12);
   muzzle(scene,'MuzzleUp'+(i+1),root,p,[0,.74,.67]);
  }
  scene.node('NoseAndDorsalGunSilhouettes',root,{mesh:m});
 }
 if(c.id==='g4m1-own'){
  const glazed=new Mesh(),rims=new Mesh(),g=uv('glass');
  loft(glazed,[[8.07,.708,.61,2.68],[8.74,.61,.55,2.68],[9.35,.47,.45,2.66],[9.81,.24,.26,2.63],
   [c.length/2,.054,.073,2.62]],32,g);
  loft(glazed,[[-c.length/2,.062,.084,1.11],[-9.62,.22,.31,1.13],[-9.20,.34,.34,1.14],[-8.95,.375,.39,1.16]],28,g);
  dome(glazed,g,[0,3.40,-1.27],[.62,.54,.64],{rings:8,sides:28});
  for(const s of [-1,1]){
   const d=new Mesh(),p=[s*1.03,2.39,-3.52],rot=([x,y,z])=>[s*y,-s*x,z];
   dome(d,g,[0,0,0],[.51,.34,.62],{rings:7,sides:24});
   absorb(glazed,d,x=>add(rot(x),p),rot);
   tube(rims,uv('frame'),[s*1.014,2.39,-3.52],[s*1.074,2.39,-3.52],.56,.55,24);
   muzzle(scene,'MuzzleBeam'+(s<0?'Left':'Right'),root,[s*1.44,2.42,-3.52],[s,0,0]);
  }
  tube(rims,uv('frame'),[0,3.37,-1.27],[0,3.49,-1.27],.63,.61,28);
  tube(rims,uv('dark'),[0,3.65,-1.40],[0,3.72,-2.03],.044,.031,12);
  tube(rims,uv('dark'),[0,1.17,-9.70],[0,1.17,-9.97],.049,.041,12);
  for(const [z,r,cy] of [[8.31,.684,2.68],[9.02,.555,2.67],[-9.12,.359,1.15]]){
   tube(rims,uv('frame'),[0,cy,z-.027],[0,cy,z+.027],r,r,28,{capA:false,capB:false});
  }
  scene.node('NoseTailAndBlisterGlazing',root,{mesh:glazed,material:glass});
  scene.node('GlazingRimsAndTurretBases',root,{mesh:rims});
  muzzle(scene,'MuzzleTail',root,[0,1.17,-9.97],[0,0,-1]);
  muzzle(scene,'MuzzleDorsal',root,[0,3.72,-2.03],[0,.12,-1]);
  const t=new Mesh();
  loft(t,[[-2.65,.029,.029,0],[-2.55,.10,.10,0],[-1.97,.17,.17,0],[-1.66,.225,.225,0],
   [1.84,.225,.225,0],[2.29,.212,.212,0],[2.57,.107,.107,0],[2.65,.022,.022,0]],28,uv('store'));
  for(let i=0;i<4;i++){
   const a=i*Math.PI/2,cs=Math.cos(a),sn=Math.sin(a);
   block(t,uv('store'),[cs*.206,sn*.206,-2.23],[.13,.042,.58],[[cs,sn,0],[-sn,cs,0],Z]);
  }
  scene.node('Torpedo',root,{mesh:t,translation:[0,1.01,.38]});
 }
}
function build(c){
 const {scene,root,uv,write}=make(c,colour(c),{span:c.span,length:c.length,height:c.height});
 const glass=scene.material('Tinted glazing',{metallic:0,roughness:.76,alphaMode:'BLEND',factor:[1,1,1,c.storch?.77:.82]});
 const body=new Mesh();
 loft(body,c.body,40,uv('body'),{minZ:-c.length/2,maxZ:c.length/2});
 scene.node('Fuselage',root,{mesh:body});
 canopyAssembly(c,scene,root,uv,glass);
 wingAssembly(c,scene,root,uv);
 finAssembly(c,scene,root,uv);
 engineAssembly(c,scene,root,uv);
 gearAssembly(c,scene,root,uv);
 appendages(c,scene,root,uv,glass);
 write();
}
module.exports={build};
