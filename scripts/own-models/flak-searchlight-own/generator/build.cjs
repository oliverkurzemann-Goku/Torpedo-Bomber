'use strict';
const {make,reference,rig}=require('./config.cjs');
const {Mesh,X,Y,Z,block,beam,tube,loft,qx}=require('./mesh.cjs');
const info={id:'flak-searchlight-own',kind:'flak-searchlight',class:'ground-structure',title:'150 cm Flakscheinwerfer',texture:1024,seed:1501934,
 references:[
  reference('WWII American and German Anti-Aircraft Searchlights, Artillery Museum','https://www.artillerymuseum.com/wwii-flakscheinwerfer','Museum copyright; no open reuse license displayed','Nominal 1.50 m reflector, housing appearance and separate generator.'),
  reference('Airforce Museum Berlin-Gatow 301, RosarioVanTulpe','https://commons.wikimedia.org/wiki/File:Airforce_Museum_Berlin-Gatow_301.JPG','Public-domain dedication by photographer','Sonderanhänger 104 exterior, two removable axle assemblies and support yoke.'),
 ]};
const dimensions={length:3.6,width:3.443,height:2.830,reflectorDiameter:1.5,trailerWidth:2.0};
const {scene,root,uv,write}=make(info,{
 sand:{a:'b79f5b',b:'596549',mode:'metal'},
 rim:{a:'988653',b:'6e694b',mode:'rust'},
 rubber:{a:'383b34',b:'5e5a4c',mode:'wreck'},
 iron:{a:'655e4d',b:'8b7b57',mode:'metal'},
 lens:{a:'b6c6c7',b:'718a91',mode:'lens'},
 exhaust:{a:'393d33',b:'555045',mode:'wreck'},
 generator:{a:'6c7155',b:'927f51',mode:'metal',label:'L32'},
 wreck:{a:'37362e',b:'805742',mode:'wreck'},
},dimensions);
const intact=scene.node('Intact',root);
const trailer=new Mesh();
for(const z of [-.97,.94]){
 tube(trailer,uv('iron'),[-.84,.43,z],[.84,.43,z],.091,.091,12);
 for(const side of [-1,1]){
  const x=side*.86;
  tube(trailer,uv('rubber'),[x-.14,.42,z],[x+.14,.42,z],.42,.42,20);
  const face=x+side*.145;
  tube(trailer,uv('sand'),[face-side*.022,.42,z],[face,.42,z],.249,.22,16);
  tube(trailer,uv('iron'),[face,.42,z],[face+side*.038,.42,z],.084,.082,12);
 }
}
for(const x of [-.61,.61]){
 block(trailer,uv('sand'),[x,.60,-.13],[.16,.20,2.89]);
 beam(trailer,uv('iron'),[x,.53,.84],[0,.57,1.71],.115,.125);
 for(const z of [-1.16,1.06]){
  beam(trailer,uv('sand'),[x,.57,z],[x*1.52,.10,z],.105);
  block(trailer,uv('iron'),[x*1.48,.043,z],[.194,.086,.24]);
 }
}
block(trailer,uv('iron'),[0,.52,1.73],[.16,.11,.14]);
block(trailer,uv('iron'),[0,.56,-1.72],[.86,.12,.16]);
block(trailer,uv('rim'),[0,.70,-.10],[1.22,.20,1.60]);
tube(trailer,uv('rim'),[0,.80,0],[0,.96,0],.51,.49,24);
scene.node('TwoAxleTrailer',intact,{mesh:trailer});

const mount=scene.node('Mount',intact,{translation:[0,.95,0],extras:rig('yaw',Y)});
const fork=new Mesh(),pin=1.985-.95;
tube(fork,uv('sand'),[0,0,0],[0,.20,0],.47,.40,20);
block(fork,uv('sand'),[0,.185,0],[1.52,.24,.35]);
for(const side of [-1,1]){
 beam(fork,uv('sand'),[side*.69,.19,0],[side*.85,pin,0],.15,.21);
 tube(fork,uv('rim'),[side*.74,pin,0],[side*.94,pin,0],.18,.16,18);
}
scene.node('ForkYoke',mount,{mesh:fork});
const projector=scene.node('Projector',mount,{translation:[0,pin,0],rotation:qx(-Math.PI/3),extras:rig('pitch',X)});
const housing=new Mesh(),shell=[
 [-.58,.56,.56],[-.52,.66,.66],[-.41,.755,.755],[-.27,.798,.798],
 [.10,.805,.805],[.33,.812,.812],[.45,.83,.83],[.50,.823,.823],
];
loft(housing,shell,36,uv('sand'),{capB:false});
loft(housing,[[.474,.745,.745],[.50,.758,.758]],36,uv('rim'),{inside:true,capA:false,capB:false});
tube(housing,uv('rim'),[0,0,.435],[0,0,.49],.829,.833,36,{capA:false,capB:false});
for(const x of [-.25,.25]){
 block(housing,uv('iron'),[x,-.43,-.53],[.19,.37,.12]);
 beam(housing,uv('sand'),[x,-.51,-.50],[x,-.51,-.64],.065);
}
scene.node('ProjectorHousing',projector,{mesh:housing});
const glass=new Mesh();
tube(glass,uv('lens'),[0,0,.464],[0,0,.475],.75,.75,36,{capA:false,capB:true});
scene.node('PaintedReflector',projector,{mesh:glass});
scene.node('BeamOrigin',projector,{translation:[0,0,.475],extras:{direction:[0,0,1]}});
const genset=new Mesh();
block(genset,uv('generator'),[-1.8,.50,-1.03],[1.2,1,.80]);
for(const x of [-2.18,-1.42])for(let i=0;i<5;i++)
 block(genset,uv('exhaust'),[x,.52+i*.061,-.624],[.19,.028,.02]);
for(const x of [-2.20,-1.40])beam(genset,uv('iron'),[x,.97,-1.24],[x,.97,-.78],.064);
block(genset,uv('exhaust'),[-1.24,.021,-.78],[.12,.042,.058]);
block(genset,uv('exhaust'),[-.96,.024,-.49],[.10,.048,.62]);
block(genset,uv('exhaust'),[-.74,.024,-.22],[.45,.048,.068]);
scene.node('GeneratorAndCable',intact,{mesh:genset});

const wreck=new Mesh();
block(wreck,uv('wreck'),[0,.22,-.02],[1.56,.44,3.55]);
block(wreck,uv('wreck'),[-1.8,.28,-1.03],[1.2,.56,.80]);
tube(wreck,uv('wreck'),[-.29,.638,.27],[.47,.978,.36],.69,.53,20);
for(const x of [-.86,.86])for(const z of [-.97,.94])
 tube(wreck,uv('rubber'),[x-.14,.24,z],[x+.14,.24,z],.24,.24,10);
beam(wreck,uv('wreck'),[-.77,.16,-.81],[.88,.92,-.13],.12,.17);
scene.node('Wreck',root,{mesh:wreck,scale:[0,0,0],extras:{visible:false}});
write();
