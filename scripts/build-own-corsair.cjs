#!/usr/bin/env node
'use strict';
/* Original F4U-1D. Inputs: authored tables and procedural geometry/paint only.
 * No imported aircraft geometry, texture, reference raster or rejected prototype. */
const fs=require('fs'),path=require('path'),G=require('./own-aircraft/geometry.cjs'),P=require('./own-aircraft/parts.cjs'),Paint=require('./own-aircraft/paint.cjs'),{GlbWriter}=require('./lib/glb-writer.cjs');
const ROOT=path.resolve(__dirname,'..'),S=JSON.parse(fs.readFileSync(path.join(__dirname,'own-aircraft/corsair/shape.json'))),OUT=path.join(ROOT,'build/corsair-own');fs.mkdirSync(OUT,{recursive:true});
const R={body:[.006,.006,.366,.994],wing:{LU:[.38,.006,.86,.197],LD:[.38,.207,.86,.398],RU:[.38,.408,.86,.599],RD:[.38,.609,.86,.800]},tail:{LU:[.38,.81,.60,.895],LD:[.38,.905,.60,.99],RU:[.61,.81,.83,.895],RD:[.61,.905,.83,.99]},fin:{L:[.875,.006,.994,.31],R:[.875,.32,.994,.624]},cowl:[.875,.64,.994,.99]};
const body=P.body('Fuselage',{stations:S.fuselage},R.body,{ring:64,step:.055}).surface;
body.i=body.i.filter((_,k)=>{const i=k-k%3,p=body.i.slice(i,i+3).map(j=>body.p.slice(j*3,j*3+3));return !p.every(v=>v[2]>-1.83&&v[2]<.68&&v[1]>.48&&Math.abs(v[0])<.44);});body.clean();
const wing=P.liftingSurface('InvertedGullWing',{stations:S.wing,camber:.014,step:.085,points:25,controls:[{name:'InnerFlap%',from:.71,to:1.42,h:.76,drive:'flap'},{name:'MiddleFlap%',from:1.45,to:2.34,h:.76,drive:'flap'},{name:'OuterFlap%',from:2.38,to:3.55,h:.77,drive:'flap'},{name:'Aileron%',from:3.61,to:5.82,h:.78,drive:'roll'}]},R.wing);
const tail=P.liftingSurface('Tailplane',{stations:[{s:0,le:-3.98,te:-5.47,y:.24,t:.115},{s:.55,le:-3.93,te:-5.49,y:.24,t:.11},{s:1.6,le:-3.96,te:-5.38,y:.26,t:.10},{s:2.05,le:-4.12,te:-5.17,y:.28,t:.09},{s:2.21,le:-4.39,te:-4.91,y:.29,t:.07},{s:2.25,le:-4.64,te:-4.66,y:.29,t:.03}],camber:0,step:.075,points:20,controls:[{name:'Elevator%',from:.18,to:2.13,h:.61,drive:'pitch'}]},R.tail);
const fin=P.liftingSurface('VerticalFin',{spanAxis:'y',stations:[{s:.13,le:-3.32,te:-5.60,x:0,t:.12},{s:.54,le:-3.53,te:-5.59,x:0,t:.10},{s:1.20,le:-3.86,te:-5.49,x:0,t:.085},{s:1.83,le:-4.12,te:-5.35,x:0,t:.075},{s:2.07,le:-4.29,te:-5.18,x:0,t:.065},{s:2.17,le:-4.54,te:-4.91,x:0,t:.05},{s:2.19,le:-4.71,te:-4.73,x:0,t:.025}],step:.065,points:18,controls:[{name:'Rudder',from:.18,to:2.12,h:.64,drive:'yaw'}]},R.fin);
const cowl=P.lathe('EngineCowling',[[2.69,.700],[2.78,.735],[2.96,.770],[3.25,.775],[3.50,.760],[3.72,.744],[3.87,.710],[3.95,.65],[3.95,.59]],{ring:64,region:R.cowl});
const innerCowl=P.lathe('CowlingInnerLip',[[3.95,.59],[3.88,.568],[3.64,.565]],{ring:64});for(let i=0;i<innerCowl.i.length;i+=3)[innerCowl.i[i+1],innerCowl.i[i+2]]=[innerCowl.i[i+2],innerCowl.i[i+1]];
const moving=[...wing.parts,...tail.parts,...fin.parts],items=[{surface:body,tag:'body'},{surface:wing.surface,tag:'wing'},{surface:tail.surface,tag:'tail'},{surface:fin.surface,tag:'fin'},{surface:cowl,tag:'cowl'},...moving.map(q=>({surface:q.surface,tag:q.ctl.drive==='yaw'?'fin':q.ctl.drive==='pitch'?'tail':'wing',pivot:q.pivot}))];
for(const q of items)if(q.pivot)q.surface.transform(p=>G.add(p,q.pivot));
const number=Paint.glyph('27'),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),dist=(v,p)=>Math.abs(v/p-Math.round(v/p))*p;
const star=Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,r=i%2?.382:1;return [Math.cos(a)*r,Math.sin(a)*r];});
function insignia(u,v){let inside=false;for(let i=0,j=9;i<10;j=i++)if((star[i][1]>v)!==(star[j][1]>v)&&u<(star[j][0]-star[i][0])*(v-star[i][1])/(star[j][1]-star[i][1])+star[i][0])inside=!inside;if(inside||Math.abs(v)<.25&&Math.abs(u)<1.60)return 'white';if(Math.hypot(u,v)<1.08||Math.abs(v)<.34&&Math.abs(u)<1.68)return 'blue';return null;}
function paint(p,n,tag){const [x,y,z]=p,a=Math.abs(x);let rgb=[29,47,66],h=0;const fade=Math.max(0,n[1])*.18+Paint.fbm(x*3,y*3,z*3,27,4)*.12;rgb=mix(rgb,[70,88,105],fade);const grain=Paint.noise(x*90,y*90,z*90,73);rgb=rgb.map(v=>v+(grain-.5)*5);let seam=false,rivet=false;
 if(tag==='body'||tag==='cowl'){const theta=Math.atan2(x,y),ring=tag==='cowl'?dist(z-2.72,.53):dist(z-.05,.62);seam=ring<.007||dist(theta,.52)<.006;rivet=ring<.032&&dist(theta,.12)<.018||dist(theta,.52)<.028&&dist(z,.075)<.012;if(tag==='cowl'&&Math.abs(z-2.74)<.025)seam=true;
 if(z<2.65&&z>.35){const t=(2.65-z)/2.3,st=Math.exp(-(((y+.40+t*.1)/(.06+.17*t))**2))*Math.max(0,Math.abs(n[0])-.4);rgb=mix(rgb,[20,21,21],st*.62);}}
 else{seam=dist(a,.56)<.006||dist(z+.1,.46)<.005;rivet=dist(a,.56)<.026&&dist(z,.085)<.012||dist(z+.1,.46)<.022&&dist(a,.085)<.013;if(tag==='wing'&&a>3.7&&z<.2)rgb=rgb.map(v=>v+Math.cos(a*28)*1.1);}
 if(seam){rgb=mix(rgb,[9,20,29],.26);h=-.27;}else if(rivet){rgb=mix(rgb,[10,19,26],.28);h=-.18;}
 if(tag==='wing'&&a<1.15&&z<.6&&z>-1.45&&n[1]>.5){rgb=mix(rgb,[26,32,35],.82);if(grain>.76)rgb=mix(rgb,[65,70,72],.43);}
 // Restrained service wear: leading-edge paint abrasion and light access-panel scuffs,
 // concentrated at the cowl and wing roots rather than random heavy scratching.
 const leading=tag==='wing'&&n[2]>.5&&a>1.1&&a<5.6;
 const scuff=Paint.noise(x*46,y*46,z*46,87);
 if(leading&&scuff>.84)rgb=mix(rgb,[116,124,129],.18);
 if(tag==='body'&&z>1.5&&z<2.7&&y<-.25&&grain>.72)rgb=mix(rgb,[59,48,42],.20);
 let mark=null;if(tag==='body'&&Math.abs(n[0])>.6){mark=insignia((z+2.55)/.53,(.04-y)/.53);const u=(x<0?z+.93:-z-.93)/(.52*number.aspect)+.5;if(number.sample(u,(.30-y)/.52)>.5)rgb=[228,232,225];}
 if(tag==='wing'&&((x<0&&n[1]>.4)||(x>0&&n[1]<-.4)))mark=insignia((a-4.72)/.61,(z+.18)/.61);
 if(tag==='fin'&&number.sample((z+4.98)/(.30*number.aspect),(1.76-y)/.30)>.5)rgb=[225,230,222];if(mark)rgb=mark==='white'?[228,232,224]:[13,26,45];
 const chip=Paint.noise(x*173,y*173,z*173,51),wear=(tag==='wing'&&a<2.5&&n[1]>.2)||(tag==='cowl');if(wear&&chip>.88&&(seam||grain>.79))rgb=mix(rgb,[139,150,155],.30);return {rgb,h};}
console.log('Baking original Corsair paint');const tex=Paint.bake(items.map(q=>({...q,normals:q.surface.normals()})),2048,paint),albedo=Paint.toPng(tex),normal=Paint.normalPng(tex,1.8,1024);
const w=new GlbWriter({extras:{title:S.title,author:'Oliver Kurzemann / Torpedo-Bomber original model',license:'project-own; original authored geometry and textures',source:'scripts/build-own-corsair.cjs',provenance:S.provenance,reference:S.reference,assumptions:S.assumptions}}),alb=w.image(albedo),nrm=w.image(normal);
const mat=(name,c,rough=.65,metal=0)=>w.material({name,pbrMetallicRoughness:{baseColorFactor:[...c,1],roughnessFactor:rough,metallicFactor:metal}});
const M={paint:w.material({name:'Authored sea-blue paint, rivets and weathering',pbrMetallicRoughness:{baseColorTexture:{index:alb},roughnessFactor:.68,metallicFactor:.06},normalTexture:{index:nrm,scale:.20}}),navy:mat('Sea blue fittings',[.016,.032,.053],.5,.12),green:mat('Cockpit green',[.10,.15,.085]),black:mat('Rubber and propeller',[.009,.012,.015],.82),metal:mat('Aluminium',[.40,.44,.46],.32,.72),dark:mat('Engine shadow',[.015,.019,.022]),steel:mat('Engine steel',[.17,.19,.20],.4,.72),yellow:mat('Propeller yellow tips',[.83,.60,.07]),rust:mat('Exhaust metal',[.09,.065,.05],.7,.35),seat:mat('Seat leather',[.12,.075,.04]),khaki:mat('Pilot flight suit',[.30,.26,.16]),skin:mat('Pilot face',[.44,.29,.18]),white:mat('Instrument markings',[.76,.79,.72]),glass:w.material({name:'Clear bubble glazing',alphaMode:'BLEND',doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[.48,.63,.69,.15],metallicFactor:.03,roughnessFactor:.13}})};
const top=w.node({name:'CorsairF4U1D_Original',extras:{nativeAircraft:'corsair-f4u1d-original-v2',kind:'corsair',dimensions:S.dimensions,provenance:S.provenance,reference:S.reference,assumptions:S.assumptions}});
let triangles=0;const node=(name,s,m,parent=top,pivot=null,extras={})=>{s.clean();triangles+=s.triangles();if(pivot)s.transform(p=>G.sub(p,pivot));const n=s.normals();return w.node({name,translation:pivot||undefined,extras,mesh:w.mesh(name,{positions:s.p,normals:Array.from(n),uvs:m===M.paint?s.uv:undefined,tangents:m===M.paint?Array.from(s.tangents(n)):undefined,indices:s.i,material:m})},parent);};
for(const [name,s]of [['Fuselage',body],['InvertedGullWing',wing.surface],['Tailplane',tail.surface],['VerticalFin',fin.surface],['Cowling',cowl]])node(name,s,M.paint);node('CowlingInnerLip',innerCowl,M.navy);
const animations=[];for(const q of moving){const id=node(q.name,q.surface,M.paint,top,q.pivot,{articulationPart:true,axis:q.axis,drive:q.ctl.drive,side:q.side});animations.push({id,axis:q.axis,drive:q.ctl.drive,angle:q.ctl.drive==='flap'?-Math.PI*50/180:q.ctl.drive==='roll'?.25*q.side:q.ctl.drive==='pitch'?-.28:-.28});}
// Discrete, low-profile wing root and fuselage fittings retain authored topology.
const detail=new G.Surface('PaintedDetails'),metal=new G.Surface('MetalDetails'),dark=new G.Surface('DarkDetails'),engine=new G.Surface('RadialEngine'),rust=new G.Surface('Exhausts');
for(let row=0;row<2;row++)for(let i=0;i<9;i++){const a=(i+row*.5)*Math.PI*2/9,dir=[Math.sin(a),Math.cos(a),0],at=(r,z)=>[dir[0]*r,dir[1]*r,z];engine.append(P.cylinder('Radial cylinder',at(.27,3.54-row*.19),at(.60,3.54-row*.19),.095,.115,16));for(let k=0;k<7;k++)engine.append(P.cylinder('Cooling fin',at(.32+k*.038,3.54-row*.19),at(.331+k*.038,3.54-row*.19),.12,.12,16));metal.append(P.cylinder('Pushrod',at(.22,3.65-row*.19),at(.54,3.65-row*.19),.013,.013,8));}
engine.append(P.lathe('Reduction housing',[[3.53,.26],[3.65,.26],[3.81,.18]],{ring:36,capEnd:true}));node('RadialEngine',engine,M.steel);
for(let k=0;k<20;k++){const a=k*Math.PI/10,b=(k+.92)*Math.PI/10,rows=[2.63,2.78].map(z=>Array.from({length:5},(_,i)=>{const t=a+(b-a)*i/4,r=z<2.7?.735:.755;return [Math.sin(t)*r,Math.cos(t)*r,z];}));const q=new G.Surface('Cowl flap');q.grid(rows);q.orient(0,p=>[p[0],p[1],0]);detail.append(q);}
for(const side of [-1,1])for(let k=0;k<3;k++)rust.append(P.cylinder('Exhaust outlet',[side*(.50+k*.06),-.40,2.67],[side*(.54+k*.06),-.48,2.49],.048,.045,12));
const prop=w.node({name:'Propeller',translation:[0,0,4.02],extras:{articulationPart:true}},top),blade=P.blades('ThreeBladePropeller',{blades:3,stations:[{r:.19,chord:.14,t:.23,pitch:44},{r:.40,chord:.23,t:.18,pitch:40},{r:.75,chord:.34,t:.13,pitch:34},{r:1.2,chord:.39,t:.10,pitch:27},{r:1.65,chord:.32,t:.09,pitch:21},{r:1.87,chord:.24,t:.08,pitch:18},{r:1.97,chord:.15,t:.07,pitch:17},{r:1.9939,chord:.025,t:.05,pitch:17}]});
function subset(s,test,name){const q=new G.Surface(name);q.p=[...s.p];q.uv=[...s.uv];for(let i=0;i<s.i.length;i+=3){const ids=s.i.slice(i,i+3),c=ids.map(j=>s.p.slice(j*3,j*3+3)).reduce((a,p)=>G.add(a,p),[0,0,0]).map(v=>v/3);if(test(c))q.i.push(...ids);}return q.clean();}
node('PropellerBlades',subset(blade,p=>Math.hypot(p[0],p[1])<1.875,'Black blades'),M.black,prop);node('PropellerTips',subset(blade,p=>Math.hypot(p[0],p[1])>=1.875,'Yellow tips'),M.yellow,prop);node('PropellerHub',P.lathe('Hub',[[0,.19],[.19,.18],[.34,.12],[.44,.025]],{ring:40,capStart:true,capEnd:true}),M.metal,prop);
const clamps=new G.Surface('BladeClamps');for(let i=0;i<3;i++){const a=i*Math.PI*2/3,d=[Math.sin(a),Math.cos(a),0];clamps.append(P.cylinder('Blade root',G.scale(d,.13),G.scale(d,.32),.105,.09,18));}node('BladeClamps',clamps,M.metal,prop);
// Original cockpit and rounded crew figure.
const tub=new G.Surface('CockpitTub');tub.append(P.bar('Floor',[0,.31,-1.10],[0,.31,.1],.62,.06));for(const s of [-1,1])tub.append(P.bar('Sidewall',[s*.32,.32,-1.1],[s*.32,.32,.1],.04,.32));node('CockpitTub',tub,M.green);
node('PilotSeat',P.bar('Seat back',[0,.35,-.98],[0,.86,-1.02],.38,.07,[0,0,1]),M.seat);node('PilotBody',P.blister('Pilot',[0,.35,-.72],.20,.48,.20,24,14),M.khaki);node('PilotHelmet',P.lathe('Helmet',[[-.12,.025],[-.10,.09],[0,.125],[.10,.075],[.125,.008]],{ring:28}).transform(p=>[p[0],p[2]+.99,p[1]-.73]),M.seat);node('PilotFace',P.blister('Face',[0,.94,-.62],.085,.13,.055,20,10),M.skin);
node('PilotNeck',P.cylinder('Neck',[0,.79,-.73],[0,.95,-.73],.065,.065,16),M.skin);for(const side of [-1,1]){node('PilotArm'+side,P.cylinder('Sleeve',[side*.16,.72,-.72],[side*.20,.54,-.44],.075,.06,16),M.khaki);node('PilotHand'+side,P.blister('Glove',[side*.15,.51,-.40],.06,.09,.07,16,10),M.seat);}node('PilotGoggles',P.bar('Goggles',[-.085,1.04,-.61],[.085,1.04,-.61],.045,.025,[0,1,0]),M.black);
node('InstrumentPanel',P.bar('Panel',[0,.47,.08],[0,.80,.08],.55,.05,[0,0,1]),M.dark);
const dials=new G.Surface('DialNeedles');for(const [x,y]of [[-.16,.69],[0,.71],[.16,.69],[-.1,.53],[.1,.53]]){dark.append(P.cylinder('Gauge',[x,y,.043],[x,y,.025],.065,.065,24));metal.append(P.lathe('Gauge rim',[[.020,.066],[.025,.070],[.03,.066]],{origin:[x,y,0],ring:24}));dials.append(P.bar('Needle',[x,y,.015],[x+.025,y+.027,.015],.006,.003));}node('DialNeedles',dials,M.white);dark.append(P.cylinder('Control stick',[0,.35,-.50],[0,.62,-.43],.018,.025,10));
// F4U-1D late sliding hood: narrower, lower, and more streamlined than v1.
 // Transparent sliding hood starts aft of the fixed sloped windscreen.
 // F4U-1D late-model hood: elongated aft fairing, low rounded apex, thin sliding rails.
const canopyStations=[{z:-1.79,base:.59,top:.65,half:.17},{z:-1.62,base:.58,top:.82,half:.25},{z:-1.37,base:.57,top:1.00,half:.32},{z:-1.08,base:.56,top:1.115,half:.36},{z:-.76,base:.55,top:1.13,half:.365},{z:-.46,base:.55,top:1.10,half:.345},{z:-.27,base:.56,top:1.035,half:.325}],cf=G.table(canopyStations,'z',['base','top','half']),cz=P.samples(-1.79,-.27,.03,canopyStations.map(s=>s.z));
const curve=z=>Array.from({length:41},(_,i)=>{const t=Math.PI*i/40;return [cf.half(z)*Math.cos(t),cf.base(z)+(cf.top(z)-cf.base(z))*Math.sin(t),z];});
const bubble=new G.Surface('BubbleCanopy');bubble.grid(cz.map(curve));bubble.orient(0,p=>[p[0],p[1]-.56,0]);node('BubbleCanopyGlass',bubble,M.glass);
const frames=new G.Surface('CanopyFrame');for(const z of [-1.79,-.27]){const c=curve(z);for(let i=0;i<c.length-1;i++)frames.append(P.cylinder('Hood perimeter',c[i],c[i+1],.014,.014,8));}for(const side of [-1,1])for(let k=0;k<cz.length-1;k++)frames.append(P.cylinder('Lower sill',[side*cf.half(cz[k]),cf.base(cz[k]),cz[k]],[side*cf.half(cz[k+1]),cf.base(cz[k+1]),cz[k+1]],.022,.022,8));
const back=curve(-.27),front=back.map((p,i)=>{const t=Math.PI*i/40;return [.28*Math.cos(t),.63+.22*Math.sin(t),.66-.16*Math.sin(t)];}),screen=new G.Surface('Windscreen');screen.grid([back,front]);screen.orient(0,p=>[p[0],p[1]-.56,1]);node('FixedWindscreen',screen,M.glass);
for(let i=0;i<front.length-1;i++)frames.append(P.cylinder('Front seal',front[i],front[i+1],.016,.016,8));for(const i of [0,12,28,40])frames.append(P.cylinder('Windshield frame',back[i],front[i],.016,.016,8));// Slender sliding hood rails, aft glazing seal and an opening handhold.
 for(const side of [-1,1]){
  frames.append(P.cylinder('Hood sliding track',[side*.35,.55,-1.77],[side*.35,.55,-.29],.012,.012,8));
  frames.append(P.cylinder('Hood latch',[side*.35,.62,-1.25],[side*.35,.66,-1.18],.009,.009,8));
 }
 node('CanopyFrames',frames,M.navy);
// Additional restrained exterior details: flush cowl fasteners, oil cooler ducts,
 // pitot tube, gun ports and wing root maintenance access.
 const panelDetails=new G.Surface('ServicePanels'),cooler=new G.Surface('CoolerIntakes');
 for(let k=0;k<20;k++){
  const a=k*2*Math.PI/20;
  const p=[Math.sin(a)*.739,Math.cos(a)*.739,2.81];
  panelDetails.append(P.cylinder('Cowling quick release',[p[0],p[1],2.802],[p[0]*1.006,p[1]*1.006,2.812],.011,.011,8));
 }
 for(const side of [-1,1]){
  // Inboard inverted-gull wing cooler openings.
  const x=side*1.50,y=-.86;
  cooler.append(P.bar('Oil cooler opening',[x,y,1.19],[x+side*.38,y-.055,1.19],.17,.06,[0,0,1]));
  panelDetails.append(P.cylinder('Cooler splitter',[x,y-.01,1.22],[x+side*.38,y-.055,1.22],.014,.014,8));
  panelDetails.append(P.cylinder('Wing tie-down',[side*4.72,-.56,-1.06],[side*4.72,-.62,-1.06],.018,.018,10));
 }
 panelDetails.append(P.cylinder('Pitot tube',[-5.27,-.44,.10],[-5.27,-.44,.43],.012,.009,10));
 node('ServicePanels',panelDetails,M.metal);
 node('CoolerIntakes',cooler,M.dark);
 const gear=w.node({name:'LandingGear',extras:{articulationPart:true}},top);
for(const side of [-1,1]){const label=side<0?'Left':'Right',pivot=[side*2.1,-.99,.64],leg=w.node({name:'Gear'+label,translation:pivot,extras:{articulationPart:true}},gear),a=new G.Surface('GearStruts');a.append(P.cylinder('Oleo upper',[0,.03,0],[0,-.64,.04],.077,.069,20));a.append(P.cylinder('Fork',[0,-.75,.04],[0,-1.11,.06],.048,.055,18));a.append(P.cylinder('Drag brace',[side*.17,.04,-.38],[0,-.78,.04],.035,.03,14));a.append(P.cylinder('Torque link',[0,-.65,.09],[0,-.78,.19],.023,.023,12));a.append(P.cylinder('Torque link',[0,-.78,.19],[0,-.94,.09],.023,.023,12));node('GearStruts'+label,a,M.metal,leg);node('GearPiston'+label,P.cylinder('Chrome oleo',[0,-.45,.04],[0,-.91,.04],.040,.04,20),M.metal,leg);
 const door=P.body('Gear door',{stations:[{z:-.01,top:.01,bottom:-.015,half:.17,wide:0,nTop:2,nBot:2},{z:.72,top:.01,bottom:-.015,half:.15,wide:0,nTop:2,nBot:2},{z:.84,top:.008,bottom:-.01,half:.05,wide:0,nTop:2,nBot:2}]},[0,0,1,1],{ring:16,step:.08}).surface.transform(p=>[p[0]-side*.055,-p[2]-.02,p[1]+.13]);node('GearDoor'+label,door,M.navy,leg);
 const axle=w.node({name:'WheelAxle'+label,translation:[0,-1.11,.06]},leg);node('MainTyre'+label,P.lathe('Main tyre',[[-.105,.27],[-.10,.34],[-.07,.395],[0,.41],[.07,.395],[.10,.34],[.105,.27]],{axis:'x',ring:48}),M.black,axle,null,{groundWheel:true});const hub=new G.Surface('WheelHub');hub.append(P.cylinder('Hub',[-.106,0,0],[.106,0,0],.22,.22,32));for(let k=0;k<8;k++){const t=k*Math.PI/4;hub.append(P.cylinder('Hub bolt',[-.11,Math.cos(t)*.15,Math.sin(t)*.15],[-.12,Math.cos(t)*.15,Math.sin(t)*.15],.018,.018,8));}node('WheelHub'+label,hub,M.metal,axle);animations.push({id:leg,axis:[1,0,0],drive:'gear',angle:Math.PI/2},{id:axle,axis:[0,1,0],drive:'gear',angle:side*Math.PI/2});
 const well=P.blister('Wheel well',[side*2.1,-1.13,-.44],.43,.045,.60,30,12).transform(p=>[p[0],-2.26-p[1],p[2]]);dark.append(well);
}
const tailGear=w.node({name:'TailGear',translation:[0,-.15,-5.0],extras:{articulationPart:true}},gear),fork=new G.Surface('TailFork');for(const side of [-1,1])fork.append(P.cylinder('Tail fork',[side*.09,0,0],[side*.09,-.46,-.08],.025,.025,12));node('TailFork',fork,M.metal,tailGear);node('TailTyre',P.lathe('Tail tyre',[[-.065,.11],[-.06,.15],[0,.18],[.06,.15],[.065,.11]],{axis:'x',origin:[0,-.47,-.08],ring:36}),M.black,tailGear,null,{groundWheel:true});node('TailHub',P.cylinder('Tail hub',[-.068,-.47,-.08],[.068,-.47,-.08],.105,.105,24),M.metal,tailGear);animations.push({id:tailGear,axis:[1,0,0],drive:'gear',angle:-1.25});
const hook=w.node({name:'ArrestorHook',translation:[0,-.25,-3.96],extras:{articulationPart:true}},top),hs=new G.Surface('Hook');hs.append(P.cylinder('Hook shaft',[0,0,0],[0,0,-1.35],.026,.035,14));hs.append(P.cylinder('Hook shoe',[0,0,-1.35],[0,-.07,-1.41],.045,.045,14));node('HookShaft',hs,M.steel,hook);animations.push({id:hook,axis:[1,0,0],drive:'hook',angle:-.58});
for(const side of [-1,1])for(let i=0;i<3;i++){const x=2.75+i*.22,z=wing.f.le(x)+.012,y=wing.f.y(x);dark.append(P.cylinder('Flush muzzle',[side*x,y,z-.035],[side*x,y,z+.018],.028,.028,14));w.node({name:'Muzzle'+(side<0?'Left':'Right')+(i+1),translation:[side*x,y,z+.025]},top);}
for(const side of [-1,1]){const x=side*1.25;dark.append(P.bar('Intake opening',[x,-.69,1.36],[x+side*.47,-.88,1.32],.16,.08,[0,0,1]));detail.append(P.bar('Pylon',[side*.83,-.62,.35],[side*.83,-.86,-.32],.14,.12,[1,0,0]));for(const span of [.95,1.35,1.85,2.6,3.2])metal.append(P.cylinder('Flap hinge',[side*span,wing.f.y(span)-.11,wing.f.te(span)+.6],[side*span,wing.f.y(span)-.14,wing.f.te(span)+.3],.014,.014,8));}
detail.append(P.bar('Forward aerial mast',[0,.71,1.72],[0,1.36,1.72],.035,.055,[0,0,1]));detail.append(P.bar('Rear aerial mast',[0,.62,-2.0],[0,1.05,-2.0],.025,.04,[0,0,1]));metal.append(P.cylinder('Aerial wire',[0,1.36,1.72],[0,2.08,-4.6],.003,.003,6));node('PaintedFittings',detail,M.navy);node('MetalDetails',metal,M.metal);node('DarkDetails',dark,M.dark);node('Exhausts',rust,M.rust);
// Original visual stores. Named groups follow the runtime store counts.
const olive=mat('Ordnance olive',[.13,.16,.08],.8);
function store(name,pos,rocket){
 const parent=w.node({name,translation:pos,extras:{store:rocket?'rocket':'bomb'}},top),L=rocket?1.70:1.80,r=rocket?.064:.23;
 const profile=rocket?[[-L/2,.045],[-L*.42,r],[L*.32,r],[L*.44,.035],[L/2,0]]:[[-L/2,.04],[-L*.32,.11],[-L*.12,r],[L*.22,r],[L*.4,.14],[L/2,0]];
 node(name+'Body',P.lathe('Body',profile,{ring:24,capStart:true,capEnd:true}),olive,parent);
 const fins=new G.Surface('Fins');for(let k=0;k<4;k++){const a=k*Math.PI/2;fins.append(P.bar('Tail fin',[r*.5,0,-L*.28],[r*2.15,0,-L*.43],.014,L*.18,[0,1,0]).transform(p=>[p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a),p[2]]));}node(name+'Fins',fins,olive,parent);
 node(name+'Band',P.lathe('Yellow band',[[L*.20,r*1.009],[L*.23,r*1.009]],{ring:24}),M.yellow,parent);
}
for(const side of [-1,1])store('Bomb'+(side<0?'Left':'Right'),[side*.83,-1.11,.03],false);
for(let row=0;row<4;row++)for(let side=0;side<2;side++){const x=(side?1:-1)*(3.0+row*.48),y=wing.f.y(Math.abs(x))-.23;store('Rocket'+(row*2+side),[x,y,.0],true);node('RocketRail'+(row*2+side),P.bar('Rail',[x,y+.10,-.36],[x,y+.10,.44],.035,.05),M.navy);}
w.json.animations=[];for(const [name,drive]of [['Gear','gear'],['Flaps','flap'],['Roll','roll'],['Pitch','pitch'],['Yaw','yaw'],['Hook','hook']]){const input=w.accessor([0,1],'SCALAR'),samplers=[],channels=[];for(const c of animations.filter(c=>c.drive===drive)){const output=w.accessor([0,0,0,1,...c.axis.map(v=>v*Math.sin(c.angle/2)),Math.cos(c.angle/2)],'VEC4');samplers.push({input,output,interpolation:'LINEAR'});channels.push({sampler:samplers.length-1,target:{node:c.id,path:'rotation'}});}w.json.animations.push({name,samplers,channels});}
const input=w.accessor([0,.25,.5,.75,1],'SCALAR'),output=w.accessor([0,0,0,1,0,0,Math.SQRT1_2,Math.SQRT1_2,0,0,1,0,0,0,Math.SQRT1_2,-Math.SQRT1_2,0,0,0,-1],'VEC4');w.json.animations.push({name:'Propeller',samplers:[{input,output,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:prop,path:'rotation'}}]});for(const a of w.json.animations)for(const s of a.samplers){for(const id of [s.input,s.output])delete w.json.bufferViews[w.json.accessors[id].bufferView].target;Object.assign(w.json.accessors[s.input],{min:[0],max:[1]});}
const bytes=w.glb();fs.writeFileSync(path.join(OUT,'corsair-f4u1d.glb'),bytes);if(process.argv.includes('--release'))fs.writeFileSync(path.join(ROOT,'assets/aircraft/corsair-f4u1d-own.glb'),bytes);fs.writeFileSync(path.join(OUT,'albedo.png'),albedo);fs.writeFileSync(path.join(OUT,'normal.png'),normal);console.log(JSON.stringify({bytes:bytes.length,triangles,meshes:w.json.meshes.length,clips:w.json.animations.length}));
