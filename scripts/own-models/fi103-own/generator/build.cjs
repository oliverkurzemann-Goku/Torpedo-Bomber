'use strict';
const {make,reference,rig}=require('./config.cjs');
const {Mesh,TAU,Z,block,beam,tube,loft,wing,fin}=require('./mesh.cjs');
const info={id:'fi103-own',kind:'fi103',class:'drone',aircraft:true,title:'Fieseler Fi 103',texture:512,seed:1031944,
 references:[
  reference('V-1 flying bomb, exterior dimensions table','https://en.wikipedia.org/wiki/V-1_flying_bomb','CC BY-SA 4.0 article text; media varies','Standard silhouette dimensions of the chosen game variant.'),
  reference('Missile, Cruise, V-1 (Fi 103, FZG 76), NASM A19600341000','https://www.si.edu/object/nasm_A19600341000','CC0 catalog data; see media labels','Exterior shape and period paint observations.'),
  reference('Fieseler Fi 103 (V1), RAF Museum collection','https://www.rafmuseum.org.uk/research/collections/fiesler-fi103-v1/','Museum copyright; no reuse license displayed','Exterior nose air-log propeller confirmation.'),
 ]};
const {scene,root,uv,write}=make(info,{
 hull:{a:'8e998a',b:'687468',mode:'drone',stencil:true},
 wing:{a:'879283',b:'98a493',mode:'metal'},
 bottom:{a:'9ca69a',b:'89978b',mode:'metal'},
 tube:{a:'747d70',b:'899083',mode:'engine'},
 dark:{a:'353a35',b:'565c4f',mode:'wreck'},
 metal:{a:'74766b',b:'878c7e',mode:'metal'},
},{span:5.37,length:8.32,height:1.42});
const add=(name,mesh,opts={})=>scene.node(name,root,{mesh,...opts});
const zMin=-4.16,zMax=4.16;
const hull=[[-3.42,.040,.040,.045],[-3.26,.137,.137,.031],[-2.95,.230,.229,.016],
 [-2.57,.291,.291,.008],[-2.07,.349,.349,0],[-1.57,.380,.380,0],[-1.01,.402,.402,0],
 [-.43,.410,.410,0],[.29,.410,.410,0],[.96,.405,.405,0],[1.60,.396,.396,0],
 [2.14,.379,.379,0],[2.61,.350,.350,0],[3.04,.309,.309,0],[3.42,.259,.259,0],
 [3.75,.182,.182,0],[3.98,.101,.101,0],[4.065,.057,.057,0],[4.095,.022,.022,0]];
add('Fuselage',loft(new Mesh(),hull,24,uv('hull'),{minZ:zMin,maxZ:zMax}));
const surfaces=new Mesh(),tail=new Mesh();
for(const side of [-1,1]){
 const reflect=rows=>rows.map(([x,...r])=>[side*x,...r]);
 wing(surfaces,reflect([[.25,.04,1.02,-.37,.145],[.75,.04,1.00,-.36,.128],[1.62,.04,.98,-.34,.104],
  [2.48,.04,.96,-.32,.074],[2.685,.04,.86,-.23,.026]]),uv('wing'),uv('bottom'),{spanRange:[0,2.685],steps:7});
 wing(tail,reflect([[.10,.14,-2.03,-3.28,.098],[.59,.14,-2.17,-3.27,.077],
  [1.13,.14,-2.39,-3.20,.049],[1.36,.14,-2.56,-3.11,.028]]),uv('wing'),uv('bottom'),
  {spanRange:[0,1.36],steps:6});
}
fin(tail,[[.10,-1.97,-3.37,.158],[.33,-2.19,-3.39,.132],[.61,-2.54,-3.44,.091],
 [.82,-2.79,-3.40,.054],[.91,-2.91,-3.35,.035]],uv('wing'),{spanRange:[0,.91],steps:7});
add('StraightWings',surfaces);add('FixedTail',tail);
const nacelle=new Mesh();
loft(nacelle,[[-4.16,.155,.155,.69],[-3.78,.165,.165,.69],[-3.22,.168,.168,.69],
 [-2.53,.17,.17,.69],[-1.89,.178,.178,.69],[-1.47,.219,.219,.70],
 [-1.17,.272,.272,.719],[-.86,.29,.29,.72],[-.66,.277,.277,.72]],
 24,uv('tube'),{capA:false,capB:false});
loft(nacelle,[[-4.16,.134,.134,.69],[-4.03,.122,.122,.69]],24,uv('dark'),
 {inside:true,capA:false,capB:true});
loft(nacelle,[[-.79,.225,.225,.72],[-.66,.242,.242,.72]],24,uv('dark'),
 {inside:true,capA:true,capB:false});
add('DorsalTube',nacelle);
const mounts=new Mesh();
beam(mounts,uv('wing'),[0,.34,-.53],[0,.66,-1.17],.21,.19);
beam(mounts,uv('wing'),[0,.26,-2.13],[0,.65,-2.79],.12,.09);
add('DorsalSupports',mounts);
const prop=new Mesh(),p=[0,0,4.126];
tube(prop,uv('metal'),[0,0,-.035],[0,0,.034],.024,.018,12);
for(let i=0;i<4;i++){
 const a=i*TAU/4, x=[Math.cos(a),Math.sin(a),0],y=[-Math.sin(a),Math.cos(a),0];
 block(prop,uv('metal'),[x[0]*.049,x[1]*.049,.008],[.072,.028,.012],[x,y,Z]);
}
add('Propeller',prop,{translation:p,extras:rig('prop',Z,{blades:4})});
scene.node('ExhaustJet',root,{translation:[0,.69,-4.16],extras:{exhaust:{radius:.2,direction:[0,0,-1]}}});
write();
