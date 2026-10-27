#!/usr/bin/env node
'use strict';
// Reference-measured exterior game assets. No existing aircraft mesh or texture is imported.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const G=require('./own-aircraft/geometry.cjs'),P=require('./own-aircraft/parts.cjs'),Paint=require('./own-aircraft/paint.cjs'),{GlbWriter}=require('./lib/glb-writer.cjs');
const ROOT=path.resolve(__dirname,'..'),release=process.argv.includes('--release');
const R={body:[.005,.005,.365,.995],wing:{LU:[.38,.005,.86,.195],LD:[.38,.205,.86,.395],RU:[.38,.405,.86,.595],RD:[.38,.605,.86,.795]},tail:{LU:[.38,.805,.595,.895],LD:[.38,.905,.595,.995],RU:[.605,.805,.82,.895],RD:[.605,.905,.82,.995]},fin:{L:[.88,.005,.995,.31],R:[.88,.32,.995,.625]},cowl:[.88,.64,.995,.995]};
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),dist=(v,p)=>Math.abs(v/p-Math.round(v/p))*p;
function build(id){
 const shapeFile=path.join(__dirname,'own-aircraft',id,'shape.json'),S=JSON.parse(fs.readFileSync(shapeFile)),fw=S.kind==='fw190';
 const out=path.join(ROOT,'build',id);fs.mkdirSync(out,{recursive:true});
 const rows=S.fuselage.map(([z,top,bottom,half])=>({z,top,bottom,half,wide:(top+bottom)*.5,nTop:fw?2.15:2.4,nBot:2}));
 const body=P.body('Fuselage',{stations:rows},R.body,{ring:56,step:.05,capRear:fw}).surface;
 // Open cockpit aperture below the separately modelled glazing and coaming.
 const front=fw?.58:1.72,rear=fw?-.55:.62;
 body.i=body.i.filter((_,k)=>{const t=k-k%3;return !body.i.slice(t,t+3).every(j=>{const p=body.p.slice(j*3,j*3+3);return p[2]>rear&&p[2]<front&&p[1]>(fw?.55:.45)&&Math.abs(p[0])<(fw?.22:.28);});});body.clean();
 const wingStations=S.wing.map(([s,le,te,y,t])=>({s,le,te,y,t}));
 const wing=P.liftingSurface('Wing',{stations:wingStations,spanSamples:wingStations.map(p=>p.s),camber:fw?.014:0,step:.065,points:22,controls:fw?
  [{name:'Flap%',from:.64,to:2.60,h:.76,drive:'flap'},{name:'Aileron%',from:2.66,to:4.94,h:.75,drive:'roll'}]:
  [{name:'Elevon%',from:2.13,to:4.48,h:.73,drive:'elevon'}]},R.wing);
 const fin=P.liftingSurface('VerticalFin',{spanAxis:'y',stations:S.fin.map(([s,le,te,t])=>({s,le,te,t,x:0})),spanSamples:S.fin.map(p=>p[0]),step:.03,points:22,controls:[{name:'Rudder',from:fw?.42:.38,to:S.fin.at(-1)[0]-.035,h:fw?.69:.70,drive:'yaw'}]},R.fin);
 const tail=fw?P.liftingSurface('Tailplane',{stations:S.tail.map(([s,le,te,y,t])=>({s,le,te,y,t})),spanSamples:S.tail.map(p=>p[0]),camber:0,step:.035,points:22,controls:[{name:'Elevator%',from:.13,to:1.75,h:.62,drive:'pitch'}]},R.tail):null;
 const cowl=fw?P.lathe('Cowling',S.cowl,{origin:[0,.03,0],ring:64,region:R.cowl}):null;
 const moving=[...wing.parts,...fin.parts,...(tail?.parts||[])];
 const items=[{surface:body,tag:'body'},{surface:wing.surface,tag:'wing'},{surface:fin.surface,tag:'fin'},...(tail?[{surface:tail.surface,tag:'tail'}]:[]),...(cowl?[{surface:cowl,tag:'cowl'}]:[])];
 for(const q of moving){q.surface.transform(p=>G.add(p,q.pivot));items.push({surface:q.surface,tag:q.ctl.drive==='yaw'?'fin':q.ctl.drive==='pitch'?'tail':'wing'});}
 const num=Paint.glyph(fw?'12':'54');
 function paint(p,n,tag){
  const [x,y,z]=p,a=Math.abs(x);let h=0;
  const dark=fw?[67,77,76]:[58,73,56],light=fw?[102,105,113]:[107,109,93],underside=fw?[155,173,177]:[155,173,163];
  let rgb=(z+a*.38>1.2||z-a*.7<-.4)?dark:light;
  if(n[1]<-.22||tag==='body'&&y<.20)rgb=underside;
  if(tag==='body'&&Math.abs(n[0])>.45&&y>.06&&y<.68){
   const m=Paint.noise(x*6,y*12,z*8,fw?39:71)*.65+Paint.noise(x*15,y*22,z*20,87)*.35;
   const fade=Math.max(0,Math.min(1,(y-.06)/.5));rgb=mix(underside,dark,Math.max(0,(m-.47)*2.2)*fade+.17*fade);
  }
  if(!fw&&tag==='body'&&y>-.23){const mott=Paint.noise(x*9,y*16,z*13,77);rgb=mix(underside,mix(light,dark,.25+Math.max(0,mott-.38)*1.5),Math.min(1,(y+.23)/.28));}
  if(tag==='fin'){const mott=Paint.noise(x*7,y*14,z*12,99);rgb=mix(fw?underside:light,dark,fw?Math.max(0,mott-.47)*2.0:.25+Math.max(0,mott-.4));}
  rgb=mix(rgb,[153,154,140],Math.max(0,n[1])*.08+Paint.noise(x*8,y*8,z*8,13)*.055);
  const grain=Paint.noise(x*115,y*115,z*115,27);rgb=rgb.map(v=>v+(grain-.5)*5);
  let panel=false,rivet=false;
  if(tag==='body'||tag==='cowl'){
   const theta=Math.atan2(x,y),ring=dist(z,fw?.65:.62);panel=ring<.003||dist(theta,1.05)<.0025;
   rivet=ring<.018&&dist(theta,.09)<.006||dist(theta,1.05)<.014&&dist(z,.055)<.006;
  }else{
   panel=dist(a,.8)<.003||dist(z,.7)<.0025;rivet=dist(a,.8)<.015&&dist(z,.065)<.006||dist(z,.7)<.015&&dist(a,.065)<.006;
  }
  if(panel){rgb=mix(rgb,[22,28,25],.22);h=-.10;}else if(rivet){rgb=mix(rgb,[28,34,30],.24);h=-.06;}
  if(fw&&(tag==='cowl'||tag==='body')&&z>.0&&z<2.15){const t=(2.15-z)/2.15,soot=Math.exp(-(((y+.16+t*.13)/(.055+.16*t))**2))*Math.max(0,Math.abs(n[0])-.35);rgb=mix(rgb,[27,24,21],soot*.75);}
  if(tag==='wing'&&a<.92&&a>.54&&z<(fw?1.4:.8)&&z>(fw?-.1:-.8)&&n[1]>.4){rgb=mix(rgb,[48,51,45],.55);if(grain>.80)rgb=mix(rgb,[171,174,163],.35);}
  if(fw&&tag==='cowl'&&y<-.32&&z>2.1)rgb=mix([210,166,50],rgb,.12);
  let mark=null;
  if(tag==='wing'&&a>(fw?3.15:2.65)&&a<(fw?4.45:3.85))mark=Paint.cross((a-(fw?3.80:3.25))/.47,(z-(fw?1.00:-.65))/.47,.19,.07);
  if(tag==='body'&&Math.abs(n[0])>.6){
   const crossZ=fw?-1.85:-1.11;mark=Paint.cross((z-crossZ)/(fw?.43:.32),(y-(fw?.11:.09))/(fw?.43:.32),.19,.075);
   const numberZ=fw?-.86:.03,hh=fw?.61:.38,u=(x<0?z-numberZ:numberZ-z)/(hh*num.aspect)+.5,v=((fw?.43:.39)-y)/hh;
   if(fw&&num.sample(u,v)>.5)rgb=[222,177,55];else if(fw&&num.near(u,v,.018))rgb=[42,44,38];
   if(fw&&z<-2.47&&z>-3.12)rgb=[184,112,40];
  }
  if(!fw&&tag==='fin'){const u=(x<0?z+2.28:-z-2.28)/(.42*num.aspect)+.5,v=(1.12-y)/.42;if(num.sample(u,v)>.5)rgb=[223,225,211];}
  if(mark)rgb=mark==='core'?(fw&&tag==='wing'&&n[1]>.1?rgb:[22,25,23]):[225,225,210];
  const chip=Paint.noise(x*190,y*190,z*190,55);if(chip>.80&&grain>.66&&((tag==='wing'&&a<1.6)||tag==='cowl'))rgb=mix(rgb,[170,174,169],.67);
  return {rgb,h};
 }
 console.log('Baking original '+S.title);
 const tex=Paint.bake(items.map(q=>({...q,normals:q.surface.normals()})),2048,paint),albedo=Paint.toPng(tex),normal=Paint.normalPng(tex,.7,1024);
 const file=fw?'fw190a8-own.glb':'me163b-own.glb',native=fw?'fw190a8-original-v1':'me163b-original-v1';
 const meta={title:S.title,revision:S.revision,units:'metres',author:'Oliver Kurzemann / Torpedo-Bomber',license:'project-own; reference-derived exterior geometry and original textures',source:'scripts/build-own-fw190-komet.cjs',provenance:S.provenance,references:S.references,referenceCalibration:S.referenceCalibration,dimensions:S.dimensions,assumptions:S.assumptions,shapeSha256:crypto.createHash('sha256').update(fs.readFileSync(shapeFile)).digest('hex')};
 const w=new GlbWriter({extras:meta}),alb=w.image(albedo),nrm=w.image(normal);
 const flat=(name,c,r=.7,m=0)=>w.material({name,pbrMetallicRoughness:{baseColorFactor:[...c,1],roughnessFactor:r,metallicFactor:m}});
 const M={paint:w.material({name:'Reference camouflage and restrained surface wear',pbrMetallicRoughness:{baseColorTexture:{index:alb},roughnessFactor:.66,metallicFactor:.025},normalTexture:{index:nrm,scale:.15}}),grey:flat('Camouflage fittings',[.075,.092,.088]),pale:flat('Underside fittings',[.32,.40,.42]),rubber:flat('Rubber',[.009,.010,.009],.94),metal:flat('Aluminium',[.28,.31,.30],.36,.65),dark:flat('Engine and gun recesses',[.008,.010,.009]),steel:flat('Engine steel',[.06,.07,.065],.65,.35),rust:flat('Heat-stained exhaust',[.08,.055,.035],.75,.3),leather:flat('Leather',[.065,.04,.023]),cloth:flat('Pilot suit',[.09,.08,.05]),skin:flat('Pilot face',[.34,.22,.13]),yellow:flat('Safety markings',[.8,.57,.06]),glass:w.material({name:'Fitted cockpit glazing',alphaMode:'BLEND',doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[.14,.25,.29,.42],roughnessFactor:.12,metallicFactor:.16}})};
 const top=w.node({name:fw?'Fw190A8_Original':'Me163B_Original',extras:{...meta,nativeAircraft:native,kind:S.kind,...(fw?{rigContract:1,class:'tailwheel-fighter'}:{})}});
 let triangles=0;
 const node=(name,s,m,parent=top,pivot=null,extras={})=>{s.clean();if(!s.i.length)return null;triangles+=s.triangles();if(pivot)s.transform(p=>G.sub(p,pivot));const n=s.normals();return w.node({name,translation:pivot||undefined,extras,mesh:w.mesh(name,{positions:s.p,normals:Array.from(n),uvs:m===M.paint?s.uv:undefined,tangents:m===M.paint?Array.from(s.tangents(n)):undefined,indices:s.i,material:m})},parent);};
 // Named skins also allow independent projected-contour QA without fittings/antennae.
 node('FuselageSkin',body,M.paint);node('WingSkin',wing.surface,M.paint);node('FinSkin',fin.surface,M.paint);
 if(tail)node('TailplaneSkin',tail.surface,M.paint);if(cowl)node('CowlingSkin',cowl,M.paint);
 const animations=[],flapGroup=w.node({name:'flightFlaps'},top);
 for(const q of moving){
  const drive=q.ctl.drive,angle=drive==='flap'?-.92:drive==='roll'?(q.side<0?.30:-.30):drive==='yaw'?-.30:-.28;
  const rig=drive==='flap'?{drive:q.side<0?'flapLeft':'flapRight',axis:q.axis,range:[0,angle]}:{drive,axis:q.axis,gain:angle};
  const i=node(q.name,q.surface,M.paint,drive==='flap'?flapGroup:top,q.pivot,{articulationPart:true,...(fw?{rig}:{axis:q.axis,drive,side:q.side})});animations.push({id:i,drive,axis:q.axis,angle});
 }
 const grey=new G.Surface('PaintedFittings'),metal=new G.Surface('MetalDetails'),dark=new G.Surface('Recesses'),rust=new G.Surface('Exhausts');
 // Fw: straight windscreen panes and low, faceted sliding hood. Komet: low curved hood.
 const cs=S.canopy.map(([z,base,top,half])=>({z,base,top,half}));
 const linear=key=>z=>{let j=0;while(j<cs.length-2&&z>cs[j+1].z)j++;const a=cs[j],b=cs[j+1];return G.lerp(a[key],b[key],G.clamp((z-a.z)/(b.z-a.z),0,1));};
 const cf=Object.fromEntries(['base','top','half'].map(k=>[k,linear(k)])),zs=P.samples(cs[0].z,cs.at(-1).z,.035,cs.map(c=>c.z));
 const profile=fw?[[1,0],[.90,.76],[.52,1],[0,1],[-.52,1],[-.90,.76],[-1,0]]:Array.from({length:25},(_,i)=>[Math.cos(Math.PI*i/24),Math.sin(Math.PI*i/24)]);
 const curve=z=>profile.map(([x,y])=>[cf.half(z)*x,cf.base(z)+(cf.top(z)-cf.base(z))*y,z]);
 const glass=new G.Surface('Glazing');glass.grid(zs.map(curve));glass.orient(0,p=>[p[0],p[1]-.5,0]);node('CanopyGlass',glass,M.glass);
 for(const z of S.canopyFrames){const c=curve(z);for(let i=0;i<c.length-1;i++)grey.append(P.cylinder('Canopy bow',c[i],c[i+1],fw?.018:.012,fw?.018:.012,8));}
 for(const side of [-1,1])for(let i=0;i<zs.length-1;i++)grey.append(P.cylinder('Canopy sill',[side*cf.half(zs[i]),cf.base(zs[i]),zs[i]],[side*cf.half(zs[i+1]),cf.base(zs[i+1]),zs[i+1]],.023,.023,8));
 for(const j of fw?[2,4]:[6,18]){const start=fw?S.canopyFrames[0]:S.canopyFrames[1],end=cs.at(-1).z;grey.append(P.cylinder('Windscreen frame',curve(start)[j],curve(end)[j],.014,.014,8));}
 if(fw)for(const j of [2,4])for(let i=0;i<zs.length-1;i++)if(zs[i+1]<=S.canopyFrames[0])grey.append(P.cylinder('Sliding hood roof rail',curve(zs[i])[j],curve(zs[i+1])[j],.009,.009,8));
 const seatZ=S.canopySeat[2],seatY=S.canopySeat[1],headY=fw?.82:.64;
 dark.append(P.bar('Cockpit floor',[0,seatY,seatZ-.4],[0,seatY,seatZ+.38],.57,.06));
 node('PilotSeat',P.bar('Seat back',[0,seatY+.08,seatZ-.22],[0,headY-.10,seatZ-.26],.31,.06,[0,0,1]),M.leather);
 node('PilotBody',P.blister('Flight suit',[0,seatY+.05,seatZ],.17,headY-seatY-.15,.18,24,16),M.cloth);
 node('PilotHead',P.lathe('Helmet',[[-.105,.001],[-.085,.065],[0,.095],[.07,.08],[.105,.001]],{ring:32}).transform(p=>[p[0],p[2]+headY,p[1]+seatZ]),M.leather);
 node('PilotFace',P.blister('Face',[0,headY-.065,seatZ+.083],.066,.10,.042,24,14),M.skin);
 dark.append(P.bar('Instrument panel',[0,seatY+.15,seatZ+.42],[0,headY-.18,seatZ+.42],.45,.055,[0,0,1]));
 for(const x of [-.13,0,.13])metal.append(P.cylinder('Instrument rim',[x,headY-.25,seatZ+.39],[x,headY-.25,seatZ+.385],.037,.037,18));
 const gear=w.node({name:'gear',extras:{articulationPart:true}},top);
 if(fw){
  // Wide-track gear folds inwards. The wheels remain on their real hinged legs.
  for(const side of [-1,1]){
   const label=side<0?'Left':'Right',pivot=[side*1.90,-.25,1.60],leg=w.node({name:'Gear'+label,translation:pivot,extras:{rig:{drive:'gear',axis:[0,0,1],range:[-side*1.54,0]},articulationPart:true}},gear),struts=new G.Surface('Struts');
   struts.append(P.cylinder('Oleo upper',[0,.06,0],[-side*.11,-.85,.24],.065,.055,18));struts.append(P.cylinder('Oleo piston',[-side*.09,-.65,.20],[-side*.18,-1.45,.36],.037,.037,18));
   struts.append(P.cylinder('Drag brace',[side*.23,0,-.20],[-side*.12,-1.05,.27],.024,.024,12));
   struts.append(P.cylinder('Torque links',[-side*.12,-.82,.29],[-side*.14,-1.05,.40],.022,.022,10));struts.append(P.cylinder('Torque links',[-side*.14,-1.05,.40],[-side*.16,-1.28,.34],.022,.022,10));
   struts.append(P.cylinder('Wheel hub',[-side*.18-.10,-1.45,.36],[-side*.18+.10,-1.45,.36],.185,.185,28));node('Gear'+label+'Leg',struts,M.metal,leg);
   node('Gear'+label+'Cover',P.bar('Main gear cover',[-side*.04,-.08,.14],[-side*.16,-1.31,.39],.30,.035,[0,0,1]),M.pale,leg);
   node('Gear'+label+'Tyre',P.lathe('Main tyre',[[-.10,.245],[-.095,.305],[-.06,.345],[0,.356],[.06,.345],[.095,.305],[.1,.245]],{axis:'x',origin:[-side*.18,-1.45,.36],ring:40}),M.rubber,leg,null,{groundWheel:true});
   animations.push({id:leg,drive:'gear',axis:[0,0,1],angle:-side*1.54});
   dark.append(P.blister('Wheel well',[side*.87,-.39,1.62],.40,.025,.42,28,10).transform(p=>[p[0],-.78-p[1],p[2]]));
  }
  const tg=w.node({name:'TailGear',translation:[0,-.04,-4.33],extras:{rig:{drive:'gear',axis:[1,0,0],range:[1.35,0]},articulationPart:true}},gear);
  node('TailGearLeg',P.cylinder('Tail leg',[0,0,0],[0,-.44,-.1],.032,.027,14),M.metal,tg);
  node('TailGearTyre',P.lathe('Tail tyre',[[-.06,.10],[-.055,.14],[0,.162],[.055,.14],[.06,.10]],{axis:'x',origin:[0,-.45,-.1],ring:32}),M.rubber,tg,null,{groundWheel:true});animations.push({id:tg,drive:'gear',axis:[1,0,0],angle:1.35});
  const rotor=w.node({name:'Propeller',translation:[0,.03,3.49],extras:{rig:{drive:'prop',axis:[0,0,1],blades:3}}},top);
  node('Spinner',P.lathe('Spinner',[[0,.295],[.15,.28],[.33,.19],[.48,.08],[.56,0]],{ring:56,capStart:true}),M.grey,rotor);
  const spiral=new G.Surface('Spinner spiral'),sr=G.interpolator([0,.15,.33,.48,.56],[.295,.28,.19,.08,0]);
  spiral.grid(P.samples(0,.558,.007).map(z=>{const a=z/.56*Math.PI*2.4;return [a-.28,a+.28].map(t=>[Math.sin(t)*(sr(z)+.001),Math.cos(t)*(sr(z)+.001),z]);}));spiral.orient(0,p=>[p[0],p[1],0]);node('SpinnerStripe',spiral,flat('Spinner white spiral',[.75,.75,.68],.55),rotor);
  node('ThreeBlades',P.blades('Three propeller blades',{blades:3,stations:[{r:.24,chord:.16,t:.22,pitch:42},{r:.5,chord:.24,t:.16,pitch:36},{r:.9,chord:.31,t:.12,pitch:28},{r:1.25,chord:.28,t:.09,pitch:23},{r:1.52,chord:.19,t:.07,pitch:19},{r:1.65,chord:.02,t:.05,pitch:18}]}),M.grey,rotor);
  animations.push({id:rotor,drive:'prop',axis:[0,0,1],angle:Math.PI*2});
  const engine=new G.Surface('RadialEngine');
  for(let row=0;row<2;row++)for(let k=0;k<7;k++){
   const a=(k+row*.5)*Math.PI*2/7,at=r=>[Math.sin(a)*r,.03+Math.cos(a)*r,3.12-row*.14];engine.append(P.cylinder('Engine cylinder',at(.23),at(.59),.09,.105,14));
   for(let f=0;f<5;f++)engine.append(P.cylinder('Cylinder cooling fin',at(.34+f*.05),at(.35+f*.05),.11,.11,12));
  }
  for(let k=0;k<12;k++){const a=k*Math.PI/6;engine.append(P.bar('Cooling fan',[Math.sin(a)*.29,.03+Math.cos(a)*.29,3.46],[Math.sin(a+.12)*.45,.03+Math.cos(a+.12)*.45,3.46],.06,.015));}node('RadialEngineAndFan',engine,M.steel);
  dark.append(P.cylinder('Recessed engine face',[0,.03,3.40],[0,.03,3.405],.46,.46,56));
  for(const side of [-1,1]){
   for(let k=0;k<5;k++){const z=1.7-k*.14;dark.append(P.bar('Cooling gill',[side*.658,-.04,z],[side*.63,-.36,z],.04,.04,[0,0,1]));}
   for(let k=0;k<3;k++)rust.append(P.cylinder('Exhaust outlet',[side*.62,-.21-k*.11,1.83],[side*.68,-.24-k*.11,1.66],.045,.04,12));
   grey.append(P.blister('Cowl gun fairing',[side*.22,.67,1.98],.115,.065,.30,28,18));
  }
  grey.append(P.bar('Centre rack',[0,-.50,.55],[0,-.63,-.05],.13,.10));
  grey.append(P.bar('Aerial mast',[0,.70,-.34],[0,.99,-.34],.018,.025,[0,0,1]));metal.append(P.cylinder('Aerial wire',[0,.99,-.34],[0,1.47,-4.35],.002,.002,6));
  metal.append(P.cylinder('Pitot tube',[-4.25,-.04,1.70],[-4.25,-.04,2.20],.010,.008,10));
 }else{
  // The sortie starts in flight: no permanent wheels or fictional tailplane.
  const skid=w.node({name:'LandingSkid',translation:[0,-.20,.10],extras:{articulationPart:true}},gear),legs=new G.Surface('SkidStruts');
  legs.append(P.cylinder('Skid front link',[0,-.26,.72],[0,-.76,.49],.035,.035,14));legs.append(P.cylinder('Skid rear link',[0,-.27,-.75],[0,-.76,-.89],.035,.035,14));node('SkidStruts',legs,M.metal,skid);
  const runner=new G.Surface('SkidRunner'),profile=[[-1.3,-.78],[-.9,-.83],[.4,-.83],[1.1,-.76],[1.30,-.58]];
  for(let k=0;k<profile.length-1;k++)runner.append(P.bar('Curved skid',[0,profile[k][1],profile[k][0]],[0,profile[k+1][1],profile[k+1][0]],.21,.065));node('SkidRunner',runner,M.dark,skid);
  const tailGear=w.node({name:'TailGear',translation:[0,-.38,-2.46],extras:{articulationPart:true}},gear);node('TailGearLeg',P.cylinder('Tail leg',[0,0,0],[0,-.44,-.04],.027,.024,12),M.metal,tailGear);
  node('TailGearTyre',P.lathe('Tail tyre',[[-.045,.075],[-.04,.12],[0,.139],[.04,.12],[.045,.075]],{axis:'x',origin:[0,-.46,-.04],ring:28}),M.rubber,tailGear);
  animations.push({id:tailGear,drive:'gear',axis:[1,0,0],angle:1.15});
  // Split landing flaps beneath the inner wing; outboard elevons mix pitch and roll.
  for(const side of [-1,1]){
   const sts=[.70,1.1,1.55,2.04].map(s=>({s,le:wing.f.te(s)+.48,te:wing.f.te(s)+.035,y:wing.f.y(s)-.06,t:.035}));
   const q=P.liftingSurface('LandingFlap',{stations:sts,mirror:false,camber:0,step:.11,points:9},R.wing).surface;
   if(side<0){q.transform(p=>[-p[0],p[1],p[2]]);for(let k=0;k<q.i.length;k+=3)[q.i[k+1],q.i[k+2]]=[q.i[k+2],q.i[k+1]];}
   const pivot=[side*1.37,wing.f.y(1.37)-.06,wing.f.te(1.37)+.46],n=node('LandingFlap'+(side<0?'Left':'Right'),q,M.pale,flapGroup,pivot,{articulationPart:true});animations.push({id:n,drive:'flap',axis:[1,0,0],angle:-.75});
  }
  const end=rows[0],cap=new G.Surface('Tail end cap');
  cap.grid([Array.from({length:56},(_,i)=>{const [x,y]=G.section(end.top,end.bottom,end.half,end.wide,end.nTop,end.nBot,Math.PI*2*i/56);return [x,y,end.z];}),Array.from({length:56},(_,i)=>{const a=Math.PI*2*i/56;return [-Math.sin(a)*.145,Math.cos(a)*.145,end.z];})],{closed:true});cap.orient(0,()=>[0,0,-1]);node('TailEndCap',cap,M.grey);
  node('RocketNozzle',P.lathe('Nozzle rim',[[-2.70,.14],[-2.885,.145],[-2.89,.115],[-2.69,.105]],{ring:40}),M.steel);
  dark.append(P.cylinder('Recessed nozzle',[0,0,-2.58],[0,0,-2.60],.128,.128,30));
  const generator=w.node({name:'NoseGenerator',translation:[0,.015,2.72]},top);node('GeneratorHub',P.lathe('Generator hub',[[0,.07],[.08,.055],[.08,.01]],{ring:24,capStart:true}),M.steel,generator);
  node('GeneratorBlades',P.blades('Air-driven generator',{blades:2,stations:[{r:.035,chord:.04,t:.2,pitch:32},{r:.16,chord:.045,t:.12,pitch:28},{r:.21,chord:.012,t:.1,pitch:25}]}),M.grey,generator);
  animations.push({id:generator,drive:'prop',axis:[0,0,1],angle:Math.PI*2});
  metal.append(P.cylinder('Pitot',[.46,-.08,2.30],[.46,-.08,2.65],.009,.009,10));
 }
 // Named origins and short muzzle recesses are visual/game fittings, with no internal mechanism.
 S.muzzles.forEach((p,i)=>{w.node({name:'Muzzle'+i,translation:p},top);dark.append(P.cylinder('Muzzle recess',G.add(p,[0,0,-.06]),p,fw&&i<2?.022:.035,fw&&i<2?.022:.035,12));});
 node('PaintedFittings',grey,M.grey);node('MetalDetails',metal,M.metal);node('Recesses',dark,M.dark);node('Exhausts',rust,M.rust);
 w.json.animations=[];
 function rotationClip(name,parts){const input=w.accessor([0,1],'SCALAR'),samplers=[],channels=[];for(const c of parts){const output=w.accessor([0,0,0,1,...c.axis.map(v=>v*Math.sin(c.angle/2)),Math.cos(c.angle/2)],'VEC4');samplers.push({input,output,interpolation:'LINEAR'});channels.push({sampler:samplers.length-1,target:{node:c.id,path:'rotation'}});}if(channels.length)w.json.animations.push({name,samplers,channels});}
 for(const [name,drive]of [['Gear','gear'],['Flaps','flap'],['Roll','roll'],['Pitch','pitch'],['Yaw','yaw'],['Elevons','elevon']])rotationClip(name,animations.filter(a=>a.drive===drive));
 const prop=animations.find(a=>a.drive==='prop');if(prop){const input=w.accessor([0,.25,.5,.75,1],'SCALAR'),output=w.accessor([0,0,0,1,0,0,Math.SQRT1_2,Math.SQRT1_2,0,0,1,0,0,0,Math.SQRT1_2,-Math.SQRT1_2,0,0,0,-1],'VEC4');w.json.animations.push({name:fw?'Propeller':'NoseGenerator',samplers:[{input,output,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:prop.id,path:'rotation'}}]});}
 if(!fw){const input=w.accessor([0,1],'SCALAR'),output=w.accessor([0,-.20,.10,0,.24,.10],'VEC3');w.json.animations.push({name:'LandingSkid',samplers:[{input,output,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:w.json.nodes.findIndex(n=>n.name==='LandingSkid'),path:'translation'}}]});}
 for(const a of w.json.animations)for(const s of a.samplers){for(const i of [s.input,s.output])delete w.json.bufferViews[w.json.accessors[i].bufferView].target;Object.assign(w.json.accessors[s.input],{min:[0],max:[1]});}
 const bytes=w.glb();fs.writeFileSync(path.join(out,file),bytes);if(release)fs.writeFileSync(path.join(ROOT,'assets/aircraft',file),bytes);fs.writeFileSync(path.join(out,'albedo.png'),albedo);fs.writeFileSync(path.join(out,'normal.png'),normal);
 const stats={file,bytes:bytes.length,triangles,meshes:w.json.meshes.length,materials:w.json.materials.length,animations:w.json.animations.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};fs.writeFileSync(path.join(out,'build.json'),JSON.stringify(stats,null,2));console.log(JSON.stringify(stats));
}
for(const id of ['fw190a8','me163b'])build(id);
