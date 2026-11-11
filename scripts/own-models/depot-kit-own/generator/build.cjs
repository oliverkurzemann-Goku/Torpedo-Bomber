'use strict';
const {make,reference}=require('./config.cjs');
const {Mesh,X,Y,Z,block,beam,tube,loft,unit}=require('./mesh.cjs');
const {prismatic,wreckNode}=require('./parts.cjs');
const info={id:'depot-kit-own',class:'ground-structure',kind:'depot-kit',kit:true,title:'Fuel and Ammunition Depot Scenery Kit',texture:1024,seed:194422,
 references:[
  reference('200 Liter Stahlfass mit Deckel, Leka Trading','https://lekatrading.com/at/product/fasser/200-liter-stahlfass-mit-deckel-schwarz-vs007/','Product specifications; no open reuse license used','Nominal drum dimensions 570 × 880 mm.'),
  reference('EPAL product sheets','https://www.epal-pallets.org/eu-en/media-centre/product-sheets','Manufacturer reference material; no open reuse license used','Nominal 1200 × 1000 mm pallet envelope.'),
  reference('Nissen Huts, National Trust Heritage Records','https://heritagerecords.nationaltrust.org.uk/HBSMR/MonRecord.aspx?skin=printerfriendly&uid=MNA180774','Heritage record; no open reuse license used','Corrugated half-round hut profile.'),
 ]};
const {scene,uv,write}=make(info,{
 drum:{a:'4f5c3a',b:'75523a',mode:'rust',sample(u,v){
  if(Math.abs(u-.24)<.017||Math.abs(u-.77)<.017)return 5;
 }},
 wood:{a:'795f3c',b:'9a7753',mode:'wood'},
 crate:{a:'7a6240',b:'9d8056',mode:'wood',sample(u,v){
  if(v>.44&&v<.55&&u>.41&&u<.69&&Math.floor(u*90)%4!==0)return 14;
 }},
 tank:{a:'6a706c',b:'6c5141',mode:'rust'},concrete:{a:'8c8f8a',b:'655c49',mode:'concrete'},
 net:{a:'5c683f',b:'404f34',mode:'net'},grass:{a:'646844',b:'514331',mode:'wood'},
 earth:{a:'5b4b3a',b:'65563d',mode:'concrete'},bags:{a:'93816a',b:'6e6150',mode:'wood'},
 hut:{a:'7a7c75',b:'80563d',mode:'corrugated'},dark:{a:'342f29',b:'544034',mode:'wreck'},
},{modules:{DrumStack:[2.4,1,2],CrateStack:[2,1.4,1.5],FuelTank:[3,3.98,12],CamoNet:[6,3,8],Berm:[3,1.5,10],Hut:[4,3,8]}});
const mask=scene.material('Cutout camouflage cloth',{alphaMode:'MASK',doubleSided:true});
function module(name,at,[w,h,l],main,damaged,cloth){
 const r=scene.node(name,null,{translation:at,extras:{class:'ground-structure',vehicle:{kind:name,length:l,width:w,height:h}}});
 const i=scene.node(name+'_Intact',r,{mesh:main});
 if(cloth)scene.node(name+'_Cloth',i,{mesh:cloth,material:mask});
 wreckNode(scene,r,damaged,name+'_Wreck');
}
const d=new Mesh(),dw=new Mesh();
for(const x of [-.60,.60])for(const z of [-.50,.50]){
 for(const dx of [-.46,.46])block(d,uv('wood'),[x+dx,.031,z],[.16,.062,1]);
 for(const dz of [-.383,0,.383])block(d,uv('wood'),[x,.091,z+dz],[1.20,.058,.234]);
}
for(let i=0;i<4;i++)for(let j=0;j<3;j++){
 const x=(i-1.5)*.57,z=(j-1)*.57;
 tube(d,uv('drum'),[x,.12,z],[x,1,z],.285,.285,8,{capA:false});
}
block(dw,uv('dark'),[0,.055,0],[2.4,.11,2]);
for(const x of [-.77,0,.77])block(dw,uv('dark'),[x,.16,x*.65],[.53,.12,.51]);
module('DrumStack',[-7,0,8],[2.4,1,2],d,dw);
const c=new Mesh(),cw=new Mesh();
for(const x of [-.502,.502])for(const z of [-.377,.377]){
 block(c,uv('crate'),[x,.23,z],[.996,.46,.746]);
 for(const e of [-.35,.35])block(c,uv('wood'),[x+e,.069,z],[.092,.138,.746]);
}
for(const [x,y,z,w,h,l] of [[-.52,.69,.12,.88,.46,1.19],[.47,.68,-.07,.90,.44,1.21],[-.34,1.16,-.11,1.07,.48,1.01]]){
 block(c,uv('crate'),[x,y,z],[w,h,l]);
 for(const e of [-.38,.38])block(c,uv('wood'),[x+e*w,y,z-l*.49],[.075,h,.049]);
}
block(cw,uv('dark'),[0,.11,0],[2,.22,1.5]);
beam(cw,uv('wood'),[-.87,.18,-.45],[.72,.51,.52],.12);
module('CrateStack',[-3.6,0,8],[2,1.4,1.5],c,cw);
const t=new Mesh(),tw=new Mesh();
const tankStations=[[-6,.06,.06,2.00],[-5.84,.92,.92,2],[-5.52,1.34,1.34,2],[-5.11,1.5,1.5,2],[5.11,1.5,1.5,2],[5.52,1.34,1.34,2],[5.84,.92,.92,2],[6,.06,.06,2]];
loft(t,tankStations,20,uv('tank'));
for(const z of [-3.45,3.45])block(t,uv('concrete'),[0,.30,z],[2.45,.60,1.03]);
tube(t,uv('tank'),[0,3.38,-1],[0,3.98,-1],.28,.31,16);
for(const z of [-.71,-1.29])beam(t,uv('tank'),[1.43,.10,z],[.97,3.41,z],.064);
for(let i=1;i<8;i++){
 const y=.19+i*.41,x=1.43-.46*(y-.1)/3.31;
 beam(t,uv('tank'),[x,y,-1.29],[x,y,-.71],.052);
}
for(const z of [-3.45,3.45])block(tw,uv('concrete'),[0,.25,z],[2.45,.50,1.03]);
loft(tw,[[-6,.08,.08,1.15],[-5.11,1.49,.85,1.07],[-.23,1.30,.60,.84],[.22,1.43,.89,.93],[5.11,1.47,.81,1.01],[6,.08,.08,.97]],12,uv('dark'));
module('FuelTank',[1.2,0,7],[3,3.98,12],t,tw);
const n=new Mesh(),net=new Mesh(),nw=new Mesh();
for(const z of [-3.95,0,3.95]){
 for(const x of [-2.95,2.95])block(n,uv('wood'),[x,1.02,z],[.10,2.04,.10]);
 block(n,uv('wood'),[0,1.4875,z],[.10,2.975,.10]);
}
for(const x of [-2.95,0,2.95]){
 const y=x===0?2.935:2.01;
 beam(n,uv('wood'),[x,y,-3.95],[x,y,3.95],.077);
}
const uNet=uv('net');
for(const s of [-1,1]){
 for(let i=0;i<10;i++){
  const point=(r,j)=>[s*r*3,3-r*(.92+.20*Math.sin(j*Math.PI/5)**2),-.0-4+j*.8];
  for(const [a,b] of [[0,.54],[.54,1]]){
   const a0=i/10,a1=(i+1)/10;
   net.face([point(a,i),point(b,i),point(b,i+1),point(a,i+1)],[uNet(a,a0),uNet(b,a0),uNet(b,a1),uNet(a,a1)],[s*.20,1,0]);
  }
 }
}
beam(nw,uv('dark'),[-2.95,.05,-3.95],[2.78,.41,3.95],.10);
beam(nw,uv('dark'),[2.95,.05,-3.95],[-2.78,.37,3.95],.10);
module('CamoNet',[7,0,7],[6,3,8],n,nw,net);
const b=new Mesh(),bw=new Mesh();
const outline=[[-1.5,0],[-.76,.83],[-.41,1.22],[.40,1.22],[.77,.86],[1.50,0]];
for(let i=0;i<outline.length-1;i++){
 const [a,y]=outline[i],[b0,q]=outline[i+1];
 const s=uv(i===0||i===4?'grass':'earth');
 b.face([[a,y,-5],[b0,q,-5],[b0,q,5],[a,y,5]],[s(0,1),s(0,0),s(1,0),s(1,1)],[a<-.4?-.5:a>.4?.5:0,1,0]);
}
for(const z of [-5,5]){
 const s=uv('earth');b.face(outline.map(([x,y])=>[x,y,z]),outline.map(([x,y])=>s((x+1.5)/3,1-y/1.22)),[0,0,Math.sign(z)]);
}
block(b,uv('earth'),[0,.025,0],[2.97,.05,10]);
for(let i=0;i<15;i++){
 const x=.07*Math.sin(i*1.7),z=-4.66+i*.666;
 block(b,uv('bags'),[x,1.36,z],[.62,.28,.61]);
}
block(bw,uv('earth'),[0,.28,0],[3,.56,10]);
for(let i=0;i<4;i++)block(bw,uv('dark'),[.36*Math.sin(i),.67,-4.35+i*2.90],[.63,.22,.66]);
module('Berm',[-4,0,-4],[3,1.5,10],b,bw);
const h=new Mesh(),hw=new Mesh(),q=uv('hut');
const arch=Array.from({length:17},(_,i)=>[2*Math.cos(i*Math.PI/16),1+2*Math.sin(i*Math.PI/16)]);
for(let i=0;i<16;i++){
 const [x,y]=arch[i],[x2,y2]=arch[i+1];
 h.face([[x,y,-4],[x2,y2,-4],[x2,y2,4],[x,y,4]],
  [q(0,i/16),q(0,(i+1)/16),q(1,(i+1)/16),q(1,i/16)],unit([x+x2,y+y2-2,0]));
}
for(const s of [-1,1]){
 block(h,uv('hut'),[s*1.976,.5,0],[.048,1,8]);
 const p=[[2,0],...arch,[-2,0]];
 h.face(p.map(([x,y])=>[x,y,s*4]),p.map(([x,y])=>q((x+2)/4,1-y/3)),[0,0,s]);
}
block(h,uv('concrete'),[0,.065,0],[3.92,.13,7.98]);
block(h,uv('wood'),[0,.89,3.985],[1.16,1.70,.03]);
for(const x of [-1.36,1.36])block(h,uv('dark'),[x,1.24,3.991],[.61,.40,.018]);
block(hw,uv('dark'),[0,.12,0],[4,.24,8]);
for(const s of [-1,1]){
 beam(hw,uv('hut'),[s*1.89,.60,-3.84],[s*.48,.81,3.84],.12,1.16);
}
module('Hut',[2.5,0,-5],[4,3,8],h,hw);
write();
