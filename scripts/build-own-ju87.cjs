#!/usr/bin/env node
'use strict';
/* Exterior game asset traced from the owner's Ju 87 B-2 manual, pp. 11–15.
 * All surfaces, UVs, materials and wear are authored here. No imported game mesh. */
const fs=require('fs'),path=require('path'),G=require('./own-aircraft/geometry.cjs'),P=require('./own-aircraft/parts.cjs'),Paint=require('./own-aircraft/paint.cjs'),{GlbWriter}=require('./lib/glb-writer.cjs');
const ROOT=path.resolve(__dirname,'..'),S=JSON.parse(fs.readFileSync(path.join(__dirname,'own-aircraft/ju87b2/shape.json'))),OUT=path.join(ROOT,'build/ju87b2');fs.mkdirSync(OUT,{recursive:true});
const R={body:[.005,.005,.365,.995],wing:{LU:[.375,.005,.875,.195],LD:[.375,.205,.875,.395],RU:[.375,.405,.875,.595],RD:[.375,.605,.875,.795]},tail:{LU:[.375,.805,.59,.895],LD:[.375,.905,.59,.995],RU:[.60,.805,.815,.895],RD:[.60,.905,.815,.995]},fin:{L:[.885,.005,.995,.30],R:[.885,.31,.995,.605]},spinner:[.885,.62,.995,.75]};
const fuse=P.body('Fuselage',{stations:S.fuselage},R.body,{ring:48,step:.065});
// The Junkers double wing: separate, below-trailing-edge slotted flaps/ailerons.
const wingStations=S.wing.map(st=>({...st,te:st.te+Math.min(.25,(st.le-st.te)*.20)}));
const wingRange=[Math.min(...wingStations.map(s=>s.te)),Math.max(...wingStations.map(s=>s.le))];
const mainWing=P.liftingSurface('GullWing',{stations:wingStations,camber:.018,step:.13,points:20},R.wing);
const movable=[];
for(const side of [-1,1])for(const [from,to,name,drive] of [[.48,1.45,'InnerFlap','flap'],[1.55,3.1,'MiddleFlap','flap'],[3.18,4.15,'OuterFlap','flap'],[4.24,6.65,'Aileron','roll']]){
 const f=G.table(S.wing,'s',['le','te','y']);const sts=P.samples(from,to,.12).map(s=>({s,le:f.te(s)+.19,te:f.te(s)-.02,y:f.y(s)-.10,t:.12}));
 const q=P.liftingSurface(name,{stations:sts,mirror:false,camber:.015,step:.12,points:10},R.wing).surface;if(side<0){q.transform(p=>[-p[0],p[1],p[2]]);for(let k=0;k<q.i.length;k+=3)[q.i[k+1],q.i[k+2]]=[q.i[k+2],q.i[k+1]];}
 // Share the wing's world-space atlas instead of stretching every flap over it.
 for(let k=0;k<q.p.length/3;k++){const upper=q.uv[k*2+1]<.6,r=R.wing[(side<0?'L':'R')+(upper?'U':'D')];const uv=P.mapUV(r,Math.abs(q.p[k*3])/6.9,(wingRange[1]-q.p[k*3+2])/(wingRange[1]-wingRange[0]));q.uv[k*2]=uv[0];q.uv[k*2+1]=uv[1];}
 const p=[side*(from+to)/2,(f.y(from)+f.y(to))/2-.1,(f.te(from)+f.te(to))/2+.16];movable.push({name:name+(side<0?'Left':'Right'),surface:q,pivot:p,axis:[1,0,0],drive,side});
}
const tail=P.liftingSurface('Tailplane',{stations:[{s:.04,le:-3.79,te:-4.94,y:.62,t:.1},{s:2.35,le:-3.80,te:-4.91,y:.62,t:.1},{s:2.50,le:-3.85,te:-4.84,y:.62,t:.055}],camber:0,step:.12,points:14,controls:[{name:'Elevator%',from:.18,to:2.48,h:.72,drive:'pitch',gain:-.30,gap:.012}]},R.tail);
const fin=P.liftingSurface('Fin',{spanAxis:'y',stations:[{s:.25,le:-3.15,te:-5.5,x:0,t:.07},{s:.75,le:-3.53,te:-5.47,x:0,t:.07},{s:1.65,le:-3.98,te:-5.38,x:0,t:.07},{s:2.03,le:-4.14,te:-5.22,x:0,t:.06},{s:2.06,le:-4.20,te:-5.14,x:0,t:.035}],step:.12,points:13,controls:[{name:'Rudder',from:.29,to:2.04,h:.72,drive:'yaw',gain:-.3}]},R.fin);
for(const q of [...tail.parts,...fin.parts]){q.surface.transform(p=>G.add(p,q.pivot));movable.push({...q,drive:q.ctl.drive});}
const spinner=P.lathe('Spinner',[[0,.40],[.10,.39],[.28,.31],[.48,.19],[.66,.015]],{origin:[0,0,4.84],ring:40,region:R.spinner,capStart:true});
const blades=P.blades('VS5',{blades:3,stations:[{r:.25,chord:.18,t:.22,pitch:45},{r:.5,chord:.31,t:.14,pitch:38},{r:1,chord:.34,t:.11,pitch:28},{r:1.5,chord:.25,t:.08,pitch:20},{r:1.66,chord:.16,t:.06,pitch:18},{r:1.7,chord:.035,t:.05,pitch:18}]}).transform(p=>G.add(p,[0,0,4.84]));
const items=[{surface:fuse.surface,tag:'body'},{surface:mainWing.surface,tag:'wing'},{surface:tail.surface,tag:'tail'},{surface:fin.surface,tag:'fin'},{surface:spinner,tag:'spinner'},...movable.map(q=>({surface:q.surface,tag:q.drive==='yaw'?'fin':q.drive==='pitch'?'tail':'wing'}))];
const glyphs={S2:Paint.glyph('S2'),AN:Paint.glyph('AN')};
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),distGrid=(v,p)=>Math.abs(v/p-Math.round(v/p))*p;
function paint(p,n,tag){const [x,y,z]=p,a=Math.abs(x);let rgb=[54,64,49],h=0;
 const spl=(z+.52*a>1.3&&a<3.5)||(z-.48*a<-.6)||(z+.75*a>5.2);rgb=spl?[58,68,49]:[38,49,43];
 if(n[1]<-.2||tag==='body'&&y<-.26)rgb=[146,163,165];if(tag==='spinner')rgb=[35,43,38];
 const grime=Paint.noise(x*7,y*7,z*7,71)*.05+Paint.noise(x*70,y*70,z*70,15)*.025;rgb=mix(rgb,[18,20,17],grime);
 let panel=false,rivet=false;
 if(tag==='body'){panel=distGrid(z,.63)<.005||(Math.abs(y-.20)<.007&&Math.abs(n[0])>.4);rivet=distGrid(z,.63)<.032&&distGrid(y,.075)<.012;}
 if(tag==='wing'||tag==='tail'){panel=distGrid(a,.65)<.005||distGrid(z,.52)<.004;rivet=(distGrid(a,.65)<.03&&distGrid(z,.075)<.011)||(distGrid(z,.52)<.024&&distGrid(a,.075)<.011);}
 if(panel){rgb=mix(rgb,[18,25,24],.32);h=-.22;}else if(rivet){rgb=mix(rgb,[25,31,28],.5);h=-.12;}
 if(tag==='body'&&z>1.65&&z<4.6){const t=(4.6-z)/2.95,st=Math.exp(-(((y+.16+t*.12)/(.055+.19*t))**2))*Math.max(0,n[0]**2-.1);rgb=mix(rgb,[18,16,14],st*.55);}
 if(tag==='wing'&&a<.78&&z<1.9&&z>-.35&&n[1]>.5){rgb=[35,39,34];if(Paint.noise(x*140,y*5,z*100,22)>.96)rgb=[110,115,108];}
 let cross=null;
 if(tag==='wing'&&a>4.2&&a<6.2)cross=Paint.cross((a-5.15)/.55,(z-1.45)/.55,.23,.095);
 if(tag==='body'&&Math.abs(n[0])>.65&&z<-.5&&z>-3.9){cross=Paint.cross((z+2.22)/.43,(y-.08)/.43,.23,.1);for(const [g,zz]of [['S2',-.98],['AN',-3.25]]){const u=(n[0]<0?z-zz:zz-z)/(.48*glyphs[g].aspect)+.5,v=(.30-y)/.48;if(glyphs[g].sample(u,v)>.6)rgb=[20,24,21];}}
 if(cross)rgb=cross==='core'?[18,22,19]:[225,223,207];
 const chip=Paint.noise(x*200,y*200,z*200,23);if(chip>.98&&((tag==='wing'&&a<1.8)||tag==='body'&&z>2.5)&&n[1]>.05)rgb=mix(rgb,[172,175,168],.6);
 return {rgb,h};}
console.log('Baking 2048 atlas');const tex=Paint.bake(items.map(o=>({...o,normals:o.surface.normals()})),2048,paint),albedo=Paint.toPng(tex),normal=Paint.normalPng(tex,1.7,1024);
const w=new GlbWriter({extras:{title:S.title,author:'Oliver Kurzemann / Torpedo-Bomber original model',source:'scripts/build-own-ju87.cjs',reference:S.reference,assumptions:S.assumptions}}),alb=w.image(albedo),nrm=w.image(normal);
const flat=(name,c,rough=.7,metal=0,extra={})=>w.material({name,pbrMetallicRoughness:{baseColorFactor:[...c,1],roughnessFactor:rough,metallicFactor:metal},...extra});
const M={paint:w.material({name:'RLM 70/71/65 authored weathered finish',pbrMetallicRoughness:{baseColorTexture:{index:alb},metallicFactor:.05,roughnessFactor:.73},normalTexture:{index:nrm,scale:.4}}),green:flat('RLM70',[.038,.056,.038]),blue:flat('RLM65',[.29,.36,.38]),black:flat('Rubber',[.015,.018,.016],.95),steel:flat('Metal',[.27,.29,.27],.35,.75),dark:flat('Radiator core',[.012,.016,.015]),rust:flat('Exhaust',[.10,.065,.043],.75,.25),leather:flat('Leather',[.13,.085,.048]),cloth:flat('Flying suits',[.22,.20,.14]),glass:w.material({name:'Canopy glazing',alphaMode:'BLEND',doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[.23,.35,.38,.32],metallicFactor:.05,roughnessFactor:.11}})};
const top=w.node({name:'Ju87B2_Original',extras:{nativeAircraft:'ju87b2-original-v1',kind:'ju87',units:'metres',fixedGear:true,reference:S.reference,dimensions:S.dimensions,assumptions:S.assumptions}});
let triangles=0;const node=(name,s,mat,parent=top,pivot=null,extra={})=>{s.clean();triangles+=s.triangles();if(pivot)s.transform(p=>G.sub(p,pivot));const norms=s.normals();return w.node({name,translation:pivot||undefined,extras:extra,mesh:w.mesh(name,{positions:s.p,normals:Array.from(norms),uvs:mat===M.paint?s.uv:undefined,tangents:mat===M.paint?Array.from(s.tangents(norms)):undefined,indices:s.i,material:mat})},parent);};
for(const [name,s]of [['Fuselage',fuse.surface],['GullWing',mainWing.surface],['Tailplane',tail.surface],['Fin',fin.surface]])node(name,s,M.paint);
const prop=w.node({name:'Propeller',translation:[0,0,4.84],extras:{articulationPart:true}},top);node('Spinner',spinner.transform(p=>G.sub(p,[0,0,4.84])),M.paint,prop);node('ThreeBlades',blades.transform(p=>G.sub(p,[0,0,4.84])),M.green,prop);
const animated=[];for(const q of movable){const id=node(q.name,q.surface,M.paint,top,q.pivot,{articulationPart:true,drive:q.drive});animated.push({id,drive:q.drive,axis:q.axis||[1,0,0],angle:q.drive==='flap'?-.70:q.drive==='roll'?(q.side<0?.28:-.28):q.drive==='pitch'?-.28:-.30});}
const geom=new G.Surface('Fittings'),steel=new G.Surface('Metal'),cores=new G.Surface('Cores'),rust=new G.Surface('Exhaust');
const body=(name,rows)=>P.body(name,{stations:rows.map(([z,top,bottom,half])=>({z,top,bottom,half,wide:(top+bottom)/2,nTop:2.5,nBot:2.5}))},[0,0,1,1],{ring:28,step:.045}).surface;
// The characteristic B-series box radiator, rounded housing and visible core.
node('ChinRadiator',body('Radiator',[[3.50,-.3,-.85,.31],[3.75,-.32,-.91,.36],[4.30,-.28,-.90,.36],[4.45,-.23,-.77,.32]]),M.blue);
cores.append(P.bar('Core',[0,-.57,4.455],[0,-.57,4.465],.57,.46));for(let x=-.27;x<=.27;x+=.028)steel.append(P.bar('Cooling fins',[x,-.79,4.47],[x,-.35,4.47],.008,.007,[0,0,1]));
for(const side of [-1,1]){
 for(let k=0;k<6;k++){const z=4.53-k*.17;rust.append(P.bar('Exhaust stack',[side*.40,-.09,z],[side*.50,-.12,z-.055],.075,.065));}
 const x=side*1.5,z=2.55;
 // Streamlined fixed trouser: vertical loft, broad wheel spat; tyre remains exposed.
 const leg=body('Trouser',[[-1.72,.32,-.28,.18],[-1.3,.27,-.30,.17],[-.75,.24,-.40,.16],[-.40,.26,-.45,.19]]).transform(p=>[p[0]+x,p[2],z-p[1]]);node('FixedGear'+side,leg,M.green);
 const spat=body('Spat',[[1.35,-1.61,-1.76,.03],[1.60,-1.48,-1.82,.15],[2.28,-1.32,-1.92,.26],[2.75,-1.38,-1.94,.26],[3.03,-1.62,-1.93,.14],[3.09,-1.87,-1.91,.02]]).transform(p=>[p[0]+x,p[1],p[2]]);node('WheelFairing'+side,spat,M.green);
 const tyre=P.lathe('Tyre',[[-.13,.26],[-.12,.33],[-.075,.385],[0,.40],[.075,.385],[.12,.33],[.13,.26]],{axis:'x',origin:[x,-1.93,2.55],ring:40});node('MainTyre'+side,tyre,M.black,top,null,{groundWheel:true});
 steel.append(P.cylinder('Wheel hub',[x-.135,-1.93,2.55],[x+.135,-1.93,2.55],.17,.17,22));
 // Small siren housing and its windmill, visual only.
 geom.append(P.cylinder('Siren',[x,-.9,2.94],[x,-.9,3.13],.12,.08,18));geom.append(P.blades('Siren rotor',{blades:4,stations:[{r:.02,chord:.03,t:.2,pitch:20},{r:.18,chord:.045,t:.1,pitch:20}]}).transform(p=>[p[0]+x,p[1]-.9,p[2]+3.14]));
 // Tailplane bracing and exposed flap hinges.
 steel.append(P.cylinder('Tail brace',[side*.12,-.16,-3.9],[side*1.85,.60,-4.1],.023,.023,10));
 for(const span of [.8,1.3,1.9,2.8,3.5,4.6,5.5,6.3]){const f=G.table(S.wing,'s',['te','y']);steel.append(P.cylinder('Flap hanger',[side*span,f.y(span)-.03,f.te(span)+.38],[side*span,f.y(span)-.10,f.te(span)+.14],.018,.018,8));}
 const brake=new G.Surface('Brake'),pivot=[side*2.8,-.58,2.2];
 for(const dz of [0,-.11,-.22])brake.append(P.bar('Brake slat',[side*1.8,-.58,2.2+dz],[side*3.8,-.58,2.2+dz],.065,.028,[0,0,1]));
 for(const span of [1.8,2.8,3.8])brake.append(P.bar('Brake rib',[side*span,-.58,2.22],[side*span,-.58,1.96],.035,.035));
 const id=node('DiveBrake'+(side<0?'Left':'Right'),brake,M.blue,top,pivot,{articulationPart:true});animated.push({id,drive:'dive',axis:[1,0,0],angle:-Math.PI/2});
}
steel.append(P.cylinder('Tailwheel leg',[0,-.12,-4.55],[0,-.49,-4.76],.045,.035,12));node('TailTyre',P.lathe('Tail tyre',[[-.06,.12],[-.065,.17],[0,.205],[.065,.17],[.06,.12]],{axis:'x',origin:[0,-.59,-4.76],ring:30}),M.black,top,null,{groundWheel:true});
// Faceted tandem canopy, frame positions traced from manual; two simplified crew.
const cs=[{z:2.35,base:.57,top:.85,half:.29,roof:.18},{z:2.05,base:.56,top:1.18,half:.44,roof:.31},{z:1.8,base:.56,top:1.19,half:.44,roof:.32},{z:.35,base:.56,top:1.18,half:.43,roof:.32},{z:-.10,base:.56,top:1.08,half:.38,roof:.27},{z:-.34,base:.56,top:.63,half:.20,roof:.14}].reverse();
const cf=G.table(cs,'z',['base','top','half','roof']),section=z=>{const f=cf;return [[-f.half(z),f.base(z),z],[-f.half(z)*.94,f.base(z)+(f.top(z)-f.base(z))*.65,z],[-f.roof(z),f.top(z),z],[f.roof(z),f.top(z),z],[f.half(z)*.94,f.base(z)+(f.top(z)-f.base(z))*.65,z],[f.half(z),f.base(z),z]];};
const glass=new G.Surface('Glazing'),frames=new G.Surface('Frames');glass.grid(cs.map(c=>section(c.z)));glass.orient(0,p=>[p[0],p[1]-.56,0]);glass.cap(section(2.35),[0,0,1]);glass.cap(section(-.34),[0,0,-1]);
for(const z of [-.30,.06,.32,.60,.90,1.28,1.70,1.96,2.32]){const sec=section(z);for(let k=0;k<sec.length-1;k++)frames.append(P.bar('Frame',sec[k],sec[k+1],.027,.026));}
for(let k=0;k<6;k++)for(let j=0;j<cs.length-1;j++)frames.append(P.bar('Longitudinal frame',section(cs[j].z)[k],section(cs[j+1].z)[k],.022,.024));
node('CanopyGlass',glass,M.glass);node('CanopyFrames',frames,M.green);
for(const z of [1.45,.12]){node('CrewSeat'+z,P.bar('Seat',[0,.35,z],[0,.78,z-.12],.38,.10,[0,0,1]),M.leather);node('CrewBody'+z,P.blister('Body',[0,.38,z+.07],.16,.40,.18,18,10),M.cloth);node('CrewHead'+z,P.lathe('Head',[[-.11,.02],[-.08,.085],[0,.11],[.085,.075],[.11,.01]],{ring:20}).transform(p=>[p[0],p[2]+.94,z+.08-p[1]]),M.leather);}
// Simplified rear defensive gun silhouette; a visual game fitting only.
geom.append(P.bar('Rear gun housing',[0,.80,-.33],[0,.83,-.69],.10,.08));steel.append(P.cylinder('Rear gun barrel',[0,.83,-.69],[0,.91,-1.32],.022,.015,10));geom.append(P.cylinder('Rear gun support',[0,.58,-.22],[0,.80,-.43],.03,.03,10));
geom.append(P.bar('Antenna mast',[0,1.18,.57],[0,2.08,.60],.035,.055,[0,0,1]));steel.append(P.cylinder('Aerial',[0,2.06,.60],[0,2.0,-4.22],.004,.004,6));
node('Fittings',geom,M.green);node('MetalDetails',steel,M.steel);node('CoolingCore',cores,M.dark);node('Exhausts',rust,M.rust);
// Embedded preview clips, kept separate so a game can drive each control independently.
w.json.animations=[];
function clip(name,channels){const input=w.accessor([0,1],'SCALAR'),samplers=[],ch=[];for(const c of channels){const q=[...c.axis.map(v=>v*Math.sin(c.angle/2)),Math.cos(c.angle/2)],out=w.accessor([0,0,0,1,...q],'VEC4');samplers.push({input,output:out,interpolation:'LINEAR'});ch.push({sampler:samplers.length-1,target:{node:c.id,path:'rotation'}});}w.json.animations.push({name,samplers,channels:ch});}
for(const [name,drive]of [['Flaps','flap'],['DiveBrakes','dive'],['Roll','roll'],['Pitch','pitch'],['Yaw','yaw']])clip(name,animated.filter(a=>a.drive===drive));
const input=w.accessor([0,.25,.5,.75,1],'SCALAR'),output=w.accessor([0,0,0,1,0,0,Math.SQRT1_2,Math.SQRT1_2,0,0,1,0,0,0,Math.SQRT1_2,-Math.SQRT1_2,0,0,0,-1],'VEC4');w.json.animations.push({name:'Propeller',samplers:[{input,output,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:prop,path:'rotation'}}]});
// Animation data is not a vertex buffer; input times require explicit bounds.
for(const a of w.json.animations)for(const sam of a.samplers){for(const id of [sam.input,sam.output])delete w.json.bufferViews[w.json.accessors[id].bufferView].target;Object.assign(w.json.accessors[sam.input],{min:[0],max:[1]});}
const bytes=w.glb();fs.writeFileSync(path.join(OUT,'Ju87B2.glb'),bytes);if(process.argv.includes('--release'))fs.writeFileSync(path.join(ROOT,'assets/aircraft/ju87b2-own.glb'),bytes);fs.writeFileSync(path.join(OUT,'albedo.png'),albedo);fs.writeFileSync(path.join(OUT,'normal.png'),normal);fs.writeFileSync(path.join(OUT,'source-notes.json'),JSON.stringify(S,null,2));console.log(JSON.stringify({bytes:bytes.length,triangles,meshes:w.json.meshes.length,animations:w.json.animations.length}));
