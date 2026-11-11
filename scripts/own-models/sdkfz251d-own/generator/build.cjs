'use strict';
const {make,reference,rig}=require('./config.cjs');
const {Mesh,X,block,beam,tube}=require('./mesh.cjs');
const {prismatic,wheels,track,wreckNode,panelNumber,crossMark}=require('./parts.cjs');
const info={id:'sdkfz251d-own',class:'ground-vehicle',kind:'sdkfz251d',title:'Sd.Kfz. 251/1 Ausf. D',texture:1024,seed:2511944,
 references:[reference('Sd.Kfz. 251/1 Ausf. D, Quartermaster Section','https://www.quartermastersection.com/german/afvs/525/SdKfz2511AusfD',
 'Reference text and photograph; no open reuse license used','Dimensions, angled stern, wheels and hull profile.')]};
const camo={a:'b79f5b',b:'4f5c3a',tones:['b79f5b','a99055','4f5c3a','5a3a2c'],mode:'stripe'};
const {scene,root,uv,write}=make(info,{
 armor:camo,marked:{...camo,sample(u,v){
  const m=crossMark(u,v,.40,.53,.16,.46);
  return m>=0?m:panelNumber('317',u,v,.57,.33,.15,.31);
 }},
 tire:{a:'4a4e50',b:'6d5b42',mode:'tyre'},steel:{a:'756744',b:'514535',mode:'metal'},
 tread:{a:'604f3e',b:'7d6550',mode:'track'},dark:{a:'31302a',b:'45443a',mode:'wreck'},
 leather:{a:'7a6540',b:'514936',mode:'wood'},canvas:{...camo,tones:['877c59','766843','48583c','654c3a']},
 wreck:{a:'3f382e',b:'79523a',mode:'wreck'},
},{length:5.98,width:2.10,height:1.75});
const intact=scene.node('Intact',root),lower=new Mesh(),upper=new Mesh(),extras=new Mesh(),running=new Mesh();
prismatic(lower,uv('armor'),[[.27,-2.63],[.30,1.49],[.54,1.63],[.66,.65],[.67,-2.79]],-.67,.67);
block(lower,uv('dark'),[0,.695,-.99],[1.52,.07,3.36]);
const seam=[[-2.99,.74,.75],[-2.76,1.02,.93],[-2.48,1.44,.72],[-1.63,1.52,.73],[.51,1.52,.73],[.82,1.38,.61]];
const sideUV=uv('marked');
for(const s of [-1,1]){
 const edge=(row)=>[s*row[2],row[1],row[0]];
 const shoulder=(row)=>[s*Math.min(1.016,row[2]+.21),Math.min(row[1]-.025,1.02),row[0]];
 for(let i=1;i<seam.length-1;i++){
  const a=seam[i],b=seam[i+1];
  const q=[shoulder(a),shoulder(b),edge(b),edge(a)];
  const u=z=>s>0?(z+2.76)/3.58:1-(z+2.76)/3.58;
  upper.face(q,[sideUV(u(a[0]),1),sideUV(u(b[0]),1),sideUV(u(b[0]),0),sideUV(u(a[0]),0)],[s,.28,0]);
  const inside=q.map(([x,y,z])=>[x-s*.066,y,z]);
  const p=uv('armor');
  upper.face(inside,[p(0,1),p(1,1),p(1,0),p(0,0)],[-s,-.2,0]);
  upper.face([q[2],q[3],inside[3],inside[2]],[p(0,0),p(1,0),p(1,1),p(0,1)],[0,1,0]);
 }
 beam(upper,uv('armor'),[s*.74,.76,-2.953],[s*.72,1.42,-2.48],.077);
 block(extras,uv('armor'),[s*.943,.893,-.68],[.214,.235,2.27]);
 block(extras,uv('leather'),[s*.555,.917,-.98],[.29,.086,2.54]);
 block(extras,uv('canvas'),[s*.58,1.21,-1.88],[.28,.26,.49]);
 block(extras,uv('steel'),[s*.60,.76,2.53],[.159,.12,.17]);
 track(running,uv('tread'),s*.812,.32,-2.31,.06,.37,.37);
 for(let i=0;i<6;i++){
  const x=s*(i%2?.745:.896);
  wheels(running,uv,x,.39,-1.89+i*.33,.319,.128,{count:16,paint:'steel',tyre:'tire'});
 }
 wheels(running,uv,s*.811,.41,.06,.335,.20,{count:20,paint:'armor',tyre:'tire'});
 wheels(running,uv,s*.811,.39,-2.31,.29,.20,{count:18,paint:'armor',tyre:'tire'});
 wheels(running,uv,s*.866,.397,1.95,.397,.234,{count:24,paint:'armor',tyre:'tire'});
 prismatic(extras,uv('armor'),[[.785,1.50],[.785,2.42],[.865,2.34],[.865,1.60]],s>0?.676:-1.04,s>0?1.04:-.676);
}
prismatic(upper,uv('armor'),[[.62,.53],[.68,2.99],[1.02,2.85],[1.15,1.31],[1.39,.91],[1.47,.55]],-.60,.60);
block(upper,uv('armor'),[0,.64,2.941],[1.41,.16,.098]);
block(upper,uv('dark'),[0,.846,2.919],[.68,.26,.044]);
block(upper,uv('dark'),[0,1.355,.985],[.82,.095,.083]);
const p=uv('armor');
upper.face([[-.75,.74,-2.99],[.75,.74,-2.99],[.72,1.44,-2.48],[-.72,1.44,-2.48]],[p(0,1),p(1,1),p(1,0),p(0,0)],[0,.1,-1]);
scene.node('LowerHull',intact,{mesh:lower});
scene.node('OpenSlopedArmorAndBonnet',intact,{mesh:upper});
scene.node('WheelsAndInterleavedTracks',intact,{mesh:running});
scene.node('BenchesStowageAndFenders',intact,{mesh:extras});
const gun=new Mesh();
block(gun,uv('armor'),[-.158,.138,.063],[.256,.344,.063]);
block(gun,uv('armor'),[.158,.138,.063],[.256,.344,.063]);
tube(gun,uv('dark'),[0,.11,-.18],[0,.11,.64],.036,.026,10);
const front=scene.node('Gun',intact,{mesh:gun,translation:[0,1.44,.56],extras:rig('pitch',X)});
scene.node('Muzzle1',front,{translation:[0,.11,.64],extras:{direction:[0,0,1]}});
const rear=new Mesh();
beam(rear,uv('steel'),[0,1.02,-2.50],[0,1.46,-2.50],.071);
tube(rear,uv('dark'),[0,1.49,-2.36],[0,1.49,-2.97],.039,.027,10);
scene.node('RearGun',intact,{mesh:rear});
scene.node('Muzzle2',intact,{translation:[0,1.49,-2.97],rotation:[0,1,0,0],extras:{direction:[0,0,-1]}});
const damaged=new Mesh();
prismatic(damaged,uv('wreck'),[[.23,-2.95],[.31,2.99],[.72,2.65],[1.23,.54],[1.03,-1.56],[.84,-2.62]],-.72,.69);
for(const s of [-1,1]){
 track(damaged,uv('wreck'),s*.785,.31,-2.26,.02,.34,.34);
 wheels(damaged,uv,s*.842,.23,1.93,.23,.233,{count:16,hub:false,tyre:'wreck'});
 beam(damaged,uv('wreck'),[s*.80,.72,-2.55],[s*.91,1.30,.50],.12,.28);
}
wreckNode(scene,root,damaged);
write();
