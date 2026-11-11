'use strict';
const {make,reference}=require('./config.cjs');
const {Mesh,X,Y,cross,beam,block,qx}=require('./mesh.cjs');
const info={id:'fi103-ramp-own',kind:'fi103-ramp',class:'ground-structure',title:'Fi 103 Ramp — scenery prop',texture:1024,seed:482406,
 references:[reference('V1 launch ramp IWM Duxford, exterior of the semi-reproduction',
 'https://commons.wikimedia.org/wiki/File:V1_launch_ramp_IWM_duxford.JPG','CC BY-SA 4.0 photograph; comparison only',
 'Exterior silhouette of repeated truss bays and long inclined rail.') ]};
const dim={length:48,width:8.28,height:6.5,rampWidth:4};
const {scene,root,uv,write}=make(info,{
 steel:{a:'4f5748',b:'70634b',mode:'metal'},
 upper:{a:'596150',b:'79513b',mode:'rust'},
 soot:{a:'30312b',b:'645747',mode:'wreck'},
 concrete:{a:'8c8f8a',b:'807d6e',mode:'concrete'},
 wood:{a:'7a735a',b:'605943',mode:'wood'},
 door:{a:'585747',b:'645d47',mode:'wood'},
 net:{a:'4f5d3c',b:'72804a',mode:'net'},
 wreck:{a:'36372f',b:'79513b',mode:'wreck'},
},dim);
const intact=scene.node('Intact',root);
const slope=6*Math.PI/180, rise=Math.tan(slope), segment=5.94, thickness=.33;
const forward=[0,Math.sin(slope),Math.cos(slope)],up=cross(forward,X);
const lastZ=24-(segment*Math.cos(slope)+thickness*Math.sin(slope))/2;
const topOffset=(segment*Math.sin(slope)+thickness*Math.cos(slope))/2;
const railY=z=>6.5-topOffset+(z-lastZ)*rise;
const structure=new Mesh(),foundation=new Mesh(),rail=new Mesh(),hut=new Mesh(),net=new Mesh(),netPoles=new Mesh();
const ribs=Array.from({length:8},(_,i)=>-21+i*6);
for(const [i,z] of ribs.entries()){
 const y=railY(z)-.36;
 for(const side of [-1,1]){
  const x=side*1.65;
  block(foundation,uv('concrete'),[x,.155,z],[.70,.31,1.20]);
  beam(structure,uv('steel'),[x,.26,z],[side*.90,y,z],.21,.23);
  if(i<ribs.length-1){
   const b=ribs[i+1],yb=railY(b)-.40;
   beam(structure,uv('steel'),[x,.39,z],[side*.93,yb,b],.13,.16);
   beam(structure,uv('upper'),[side*.93,y,z],[x,.39,b],.115,.13);
  }
 }
 beam(structure,uv('steel'),[-.99,y,z],[.99,y,z],.26,.21);
 beam(structure,uv('steel'),[-1.52,.55,z],[1.52,.55,z],.15,.15);
}
for(const side of [-1,1]){
 for(let i=0;i<8;i++){
  const z=lastZ*(i/7*2-1);
  block(rail,uv(i===0?'soot':'upper'),[side*.52,railY(z),z],[.24,thickness,segment],[X,up,forward]);
 }
 beam(rail,uv('steel'),[side*.94,railY(-23.95)-.42,-23.95],[side*.94,railY(23.95)-.42,23.95],.19,.20);
}
// Closed painted lower spine, purely decorative.
block(rail,uv('soot'),[0,railY(0)-.53,0],[.43,.29,47.50],[X,up,forward]);
for(const z of ribs)block(rail,uv('steel'),[0,railY(z)-.19,z],[1.30,.14,.28],[X,up,forward]);
const hutX=4.12,hutZ=-17.45;
block(hut,uv('concrete'),[hutX,.12,hutZ],[4,.24,8]);
block(hut,uv('wood'),[hutX,1.53,hutZ],[3.84,2.63,7.76]);
block(hut,uv('upper'),[hutX,2.91,hutZ],[4,.18,8]);
block(hut,uv('door'),[hutX-.82,1.07,hutZ+3.887],[.88,1.67,.055]);
for(const x of [hutX+.55,hutX+1.35])block(hut,uv('soot'),[x,1.64,hutZ+3.886],[.48,.53,.065]);
for(const dx of [-1.85,1.85])for(const dz of [-3.75,3.75])
 beam(netPoles,uv('steel'),[hutX+dx,2.9,hutZ+dz],[hutX+dx,3.47,hutZ+dz],.095);
const canopy=(u,v)=>[hutX+(u-.5)*4.32,3.45-.20*Math.sin(Math.PI*u)*Math.sin(Math.PI*v)+.035*Math.sin(u*19+v*5),hutZ+(v-.5)*8.38];
for(let i=0;i<12;i++)for(let j=0;j<16;j++){
 const corners=[[i/12,j/16],[(i+1)/12,j/16],[(i+1)/12,(j+1)/16],[i/12,(j+1)/16]];
 net.face(corners.map(([u,v])=>canopy(u,v)),corners.map(([u,v])=>uv('net')(u,v)),Y);
}
scene.node('ConcreteFootings',intact,{mesh:foundation});
scene.node('SteelBays',intact,{mesh:structure});
scene.node('RailShell',intact,{mesh:rail});
scene.node('ControlHut',intact,{mesh:hut});
scene.node('NetPoles',intact,{mesh:netPoles});
const mask=scene.material('Cutout camouflage net',{alphaMode:'MASK',metallic:0,roughness:.88});
scene.node('CamouflageNet',intact,{mesh:net,material:mask});
scene.node('LaunchPoint',intact,{translation:[0,railY(-23.4)+.17,-23.4],rotation:qx(-slope)});
const wreck=new Mesh();
for(const z of ribs){
 for(const x of [-1.65,1.65])block(wreck,uv('concrete'),[x,.126,z],[.70,.252,1.20]);
}
for(let i=0;i<7;i++){
 const z=-21+i*6.9,x=Math.sin(i*2.9)*.66;
 beam(wreck,uv('wreck'),[x-.52,.36,z-2.4],[x+.37,1.13+i*.085,z+2.25],.36,.27);
 beam(wreck,uv('wreck'),[-1.4,.28,z],[1.35,.80,z+.22],.13);
}
for(const z of [-23.76,23.76])block(wreck,uv('wreck'),[0,.12,z],[1.22,.24,.48]);
block(wreck,uv('wreck'),[hutX,.46,hutZ],[4.32,.90,8.38]);
scene.node('Wreck',root,{mesh:wreck,scale:[0,0,0],extras:{visible:false}});
write();
