#!/usr/bin/env node
/* Builds our own Messerschmitt Bf 109 F-2 from the station table measured on the owner's PDF
 * (app/model-candidates/references/bf109f2/shape.json, written by measure-bf109f.mjs from the
 * three-view "Abb. 16"): lofted fuselage, NACA-type wing and tail with separate hinged controls,
 * flat-panel canopy whose middle hood hinges to starboard, rotor, gear, coolers, and the Moelders
 * JG 51 June 1941 finish. Finish positions and colours are measured on the profile "Abb. 53"; the
 * paint itself is drawn procedurally. Output follows rig contract v1.
 *
 *   node scripts/build-own-bf109.cjs [shape.json] [--out dir] [--release]
 *
 * Without --release it writes to build/own-bf109/. --release writes assets/aircraft/ and is
 * refused unless the shape table is MEASURED with sha256-pinned references and the silhouette
 * gate passes against the reference drawing. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const G=require('./own-aircraft/geometry.cjs'),P=require('./own-aircraft/parts.cjs'),Paint=require('./own-aircraft/paint.cjs');
const {GlbWriter}=require('./lib/glb-writer.cjs');
const ROOT=path.resolve(__dirname,'..'),REFDIR=path.join(ROOT,'app/model-candidates/references/bf109f2');

// Values the drawing and the profile cannot give. Each is listed in the GLB's extras.assumed.
const ASSUMED={
  bladeAngle:'blade angle 20 deg at the tip plus 28 deg twist to the root: the three-view draws the blade planform in both side and front view; only the front-projected chord is matched (chord = projected / cos angle)',
  tailWheel:'tail wheel modelled fixed: the PDF does not say whether the F-2 retracted it',
  spinnerSpiral:'white spinner band: its port edge is measured on the profile (52-60 deg from the top); its width (120 deg) and the starboard side are assumed',
  upperSplinter:'RLM 74/75 splinter on the upper surfaces: the profile shows no plan view; RLM 75 is not visible on it (standard hue used)',
  wingCrosses:'wing crosses at mid-aileron span, fuselage-cross proportions, half size 0.48 m (the profile shows no plan view)',
  starboardMarkings:'starboard side repeats the port markings except the octane triangle (port fuel filler); the tally is on both rudder faces',
  sectionShape:'fuselage cross-section exponents (superellipse) fitted against the front view; the drawings give outlines only',
  noSwastika:'no swastika on the fin (the profile shows one)',
  tailCone:'tail cone closed into the rudder root over 12 cm; the drawings end the fuselage at the rudder post',
  cockpit:'pilot figure and head armour are simple shapes, not from the drawings',
  canopyFrames:'canopy frame bars 3.5 cm wide: the three-view draws the thin frames 1 px (2 cm), the profile shows 2-5 px at 1.1 cm/px; positions and colour are measured',
  gearPivot:'main gear pivot inside the wing on the drawn leg line (the drawings show only where the leg leaves the skin); retracted pose = single fixed hinge, leg spanwise, wheel flat above the leg end, searched so every vertex stays inside the wing skin',
  wheelWells:'open wheel wells painted on the lower skin where the retracted wheel and leg lie (no doors on the F-2); tone assumed'
};

(async()=>{
const args=process.argv.slice(2),release=args.includes('--release');
const shapeFile=args.find(a=>a.endsWith('.json'))||path.join(REFDIR,'shape.json');
const outDir=release?path.join(ROOT,'assets/aircraft'):(args.includes('--out')?args[args.indexOf('--out')+1]:path.join(ROOT,'build/own-bf109'));
const S=JSON.parse(fs.readFileSync(shapeFile,'utf8'));
const measured=S.status==='MEASURED'&&(S.references||[]).some(r=>/^[0-9a-f]{64}$/.test(r.sha256||''));
if(release&&!measured)throw Error('--release refused: shape table is '+S.status+'; trace it from sha256-pinned references first');
const L=S.livery,D=S.details;

// ---------------------------------------------------------------- atlas layout (u0,v0,u1,v1)
const SIZE=2048,R={
  fuse:[0,0,.372,1],
  wing:{LU:[.378,0,.878,.192],LD:[.378,.198,.878,.390],RU:[.378,.396,.878,.588],RD:[.378,.594,.878,.786]},
  stab:{LU:[.378,.792,.598,.892],LD:[.378,.898,.598,.998],RU:[.604,.792,.824,.892],RD:[.604,.898,.824,.998]},
  fin:{L:[.884,0,.998,.30],R:[.884,.306,.998,.606]},
  spinner:[.884,.612,.998,.74],
};

// ---------------------------------------------------------------- airframe from the measured table
// The drawings stop the fuselage at the rudder post; close the tail cone into the rudder root over
// 12 cm (hidden by the rudder in every view) instead of ending in a flat disc.
const tailEnd=S.fuselage.stations.reduce((a,b)=>a.z<b.z?a:b),cone={...tailEnd,z:tailEnd.z-.12,half:.03,top:tailEnd.top-.04,bottom:tailEnd.bottom+.08};
cone.wide=cone.bottom+(cone.top-cone.bottom)*.45;
const fuse=P.body('fuselage',{stations:[...S.fuselage.stations,cone]},R.fuse,{capFront:true,capRear:true,ring:60,step:.032});
// the drawn wing begins at the fuselage side line; carry its root section 0.25 m into the fuselage
// The measured y is the mid height of the front-view silhouette; a cambered section's silhouette sits
// above its chord line, so the chord line goes down by that offset.
const midShift=(t,camber)=>{let hi=-1,lo=1;for(const c of G.chordSamples(60)){const [u,l]=G.airfoil(c,t,camber);hi=Math.max(hi,u);lo=Math.min(lo,l);}return (hi+lo)/2;};
const ws=S.wing.stations.map(st=>({...st,y:st.y-midShift(st.t,S.wing.camber)*(st.le-st.te)})),root={...ws[0],s:Math.max(.05,ws[0].s-.25)};
const tight=c=>c.map(k=>({...k,gap:.001}));// the drawing shows control gaps closed
const wing=P.liftingSurface('wing',{...S.wing,controls:tight(S.wing.controls),stations:[root,...ws],step:.06,points:26,hingeGap:0,controlOverlap:.012},R.wing);
const ss=S.stabiliser.stations,stabRoot={...ss[0],s:.02};// carried into the tail cone like the wing root
const stab=P.liftingSurface('stabiliser',{...S.stabiliser,controls:tight(S.stabiliser.controls),camber:0,stations:[stabRoot,...ss].map(s=>({...s,y:S.stabiliser.y})),step:.05,points:18,hingeGap:0,controlOverlap:.012},R.stab);
const rud=S.fin.controls[0],ft=G.table(S.fin.stations,'s',['le','te']);
const finControls=[{...rud,gap:.001,breaks:[rud.hornS-.003,rud.hornS+.003],axisSpan:[rud.from+.01,rud.hornS-.01],
  hAt:s=>s>rud.hornS?0:G.clamp((ft.le(s)-rud.hingeZ)/(ft.le(s)-ft.te(s)),.05,.95)}];// vertical hinge line, horn balance above hornS
const fin=P.liftingSurface('fin',{...S.fin,controls:finControls,spanAxis:'y',camber:0,stations:S.fin.stations.map(s=>({...s,x:0})),step:.04,points:18,hingeGap:0,controlOverlap:.012},R.fin);
const ff=fuse.f;

// ---------------------------------------------------------------- canopy: flat side panels and roof (Bf 109 F)
// Measured layout (side view): windscreen up to the first frame, the hinged hood between the first and
// last frame (one mid frame), and the triangular fixed rear glazing whose lower edge is the decking
// diagonal, ending at the mast. The stations carry that diagonal as their base.
const cst=[...S.canopy.stations].sort((a,b)=>a.z-b.z);
const cf=G.table(cst,'z',['top','base','half','roofHalf']);
const frames=[...S.canopy.frames].sort((a,b)=>b.z-a.z),fHood=frames[0].z,fRear=frames[frames.length-1].z,midFrames=frames.slice(1,-1);
const cz0=cst[0].z,cz1=cst[cst.length-1].z;
// open section from the starboard sill over the roof to the port sill; the roof edges are rounded
function canopySection(z,grow=0){
  const b=cf.base(z)-.02,t=cf.top(z)+grow,h=cf.half(z)+grow,rh=Math.min(cf.roofHalf(z),cf.half(z))+grow*.5,r=Math.min(.035,(t-b)*.18);
  const len=Math.hypot(rh-h,t-b),u=[(rh-h)/len,(t-b)/len],C=[rh,t],A=[C[0]-u[0]*r,C[1]-u[1]*r],B=[C[0]-r,C[1]];
  const bez=k=>{const s=k/4;return [(1-s)**2*A[0]+2*(1-s)*s*C[0]+s*s*B[0],(1-s)**2*A[1]+2*(1-s)*s*C[1]+s*s*B[1]];};
  const port=[[h,b],A,bez(1),bez(2),bez(3),B];
  return [...port.map(([x,y])=>[-x,y,z]),...port.slice().reverse().map(([x,y])=>[x,y,z])];
}
const ROOF=5;// index of the starboard roof edge in a section (port: n-1-ROOF)
const outward=p=>[p[0],p[1]-cf.base(p[2]),0];
function glassBetween(name,za,zb,capA,capB){
  const zs=P.samples(za,zb,.03,cst.map(s=>s.z)),rows=zs.map(z=>canopySection(z)),g=new G.Surface(name);
  g.grid(rows);g.orient(0,outward);
  if(capA)g.cap(rows[0],[0,0,-1]);if(capB)g.cap(rows[rows.length-1],[0,0,1]);return g;
}
const glassFixed=glassBetween('windscreen',fHood,cz1,false,true).append(glassBetween('rearGlazing',cz0,fRear,true,false));
const glassHood=glassBetween('hood',fRear,fHood,false,false);
function frameBand(z,w,s){const a=canopySection(z-w/2,.008),b=canopySection(z+w/2,.008),t0=s.triangles();s.grid([a,b]);s.orient(t0,outward);return s;}
function frameRail(za,zb,k,s){const zs=P.samples(za,zb,.03),rows=zs.map(z=>{const sec=canopySection(z,.008),p=sec[k],q=sec[Math.min(sec.length-1,k+1)],o=sec[Math.max(0,k-1)],d=G.norm(G.sub(q,o));return [G.add(p,G.scale(d,-FRAME/2)),G.add(p,G.scale(d,FRAME/2))];});
  const t0=s.triangles();s.grid(rows);s.orient(t0,outward);return s;}
const framesFixed=new G.Surface('framesFixed'),framesHood=new G.Surface('framesHood'),nSec=canopySection(1).length;
// frame widths as drawn: the windscreen's rear frame and the hood's front frame share the first line,
// the hood's rear frame and the rear glazing's front frame share the last (drawn 8 cm wide)
const FRAME=.035;// three-view draws thin frames 1 px (2 cm); the profile's bars read 2-5 px at 1.1 cm/px: built 3.5 cm (ASSUMED.canopyFrames)
const fw=k=>Math.max(FRAME,frames[k].width);
frameBand(fHood+fw(0)/4,fw(0)/2,framesFixed);frameBand(fHood-fw(0)/4,fw(0)/2,framesHood);
for(const m of midFrames)frameBand(m.z,Math.max(.015,m.width),framesHood);// thin unriveted line across the hood side in the three-view (not on the profile): a thin bar
frameBand(fRear+fw(frames.length-1)/4,fw(frames.length-1)/2,framesHood);frameBand(fRear-fw(frames.length-1)/4,fw(frames.length-1)/2,framesFixed);
for(const k of [0,ROOF,nSec-1-ROOF,nSec-1]){frameRail(fRear,fHood,k,framesHood);frameRail(fHood,cz1,k,framesFixed);frameRail(cz0,fRear,k,framesFixed);}
const hoodZ=(fRear+fHood)/2,canopyPivot=[-cf.half(hoodZ),cf.base(hoodZ)-.02,hoodZ];// PDF: "die rechts angeschlagene Kabinenhaube"

// ---------------------------------------------------------------- rotor
const pz=S.propeller.z,Rp=S.propeller.radius;
const spinner=P.lathe('spinner',[[-.03,S.propeller.spinner[0][1]],...S.propeller.spinner],{axis:'z',origin:[0,0,0],ring:40,region:R.spinner,capStart:true});
const angle=r=>20+28*(1-r/Rp);
const bladeSt=[{r:.25,chord:.16,t:.26,pitch:angle(.25)},...S.propeller.projectedChord.filter(b=>b.r>.6).map(b=>({r:b.r,chord:b.projected/Math.cos(angle(b.r)*Math.PI/180),t:.09+.08*(1-b.r/Rp),pitch:angle(b.r)})),
  {r:Rp-.04,chord:.11,t:.06,pitch:angle(Rp)},{r:Rp,chord:.05,t:.05,pitch:angle(Rp)}];
const blades=P.blades('blades',{blades:S.propeller.blades,stations:bladeSt});

// ---------------------------------------------------------------- gear (hinge and wheel centre measured in side and front view)
const rotAbout=(p,k,a)=>{const c=Math.cos(a),s=Math.sin(a);return G.add(G.add(G.scale(p,c),G.scale(G.cross(k,p),s)),G.scale(k,G.dot(k,p)*(1-c)));};
function wheel(name,centre,axle,r,w,hub){
  const tyre=P.lathe(name+'Tyre',[[-w/2,r*.64],[-w/2,r*.84],[-w*.38,r*.97],[0,r],[w*.38,r*.97],[w/2,r*.84],[w/2,r*.64]],{axis:'x',origin:[0,0,0],ring:32});
  const rim=P.lathe(name+'Hub',[[-w*.52,0],[-w*.52,r*hub],[-w*.3,r*hub*1.04],[w*.3,r*hub*1.04],[w*.52,r*hub],[w*.52,0]],{axis:'x',origin:[0,0,0],ring:24});
  const q=G.norm(axle),k=G.cross([1,0,0],q),s=G.len(k),a=Math.atan2(s,G.dot([1,0,0],q)),place=p=>G.add(s<1e-9?p:rotAbout(p,G.scale(k,1/s),a),centre);
  return {tyre:tyre.transform(place),hub:rim.transform(place)};
}
const wingMidY=x=>{const s=Math.abs(x);return wing.f.y(Math.min(Math.max(s,ws[0].s),ws[ws.length-1].s));};
// Wing skin heights at (|x|,z) on the twisted section: solve the chord fraction for z (Newton).
function wingSkin(x,z){const s=Math.abs(x);if(s<root.s||s>ws[ws.length-1].s)return null;
  const le=wing.f.le(s),te=wing.f.te(s);if(z>le||z<te)return null;
  const at=(c,upper)=>{const [yu,yl]=G.airfoil(c,wing.f.t(s),S.wing.camber);return wing.point(1,s,c,upper?yu:yl);};
  const solve=upper=>{let c=(le-z)/(le-te);for(let k=0;k<5;k++){const p=at(c,upper),q=at(Math.min(1,c+.001),upper),dz=(q[2]-p[2])/(Math.min(1,c+.001)-c||1e-9);if(Math.abs(dz)<1e-9)break;c=G.clamp(c-(p[2]-z)/dz,0,1);}return at(c,upper)[1];};
  return {upper:solve(true),lower:solve(false)};}
// Worst push-through (m) of the retracted leg and wheel through the lower/upper wing skin.
function stowedClearance(L,parts=['leg','cover','tyre','hub'],stride=1){let below=-Infinity,above=-Infinity,outside=0,n=0;
  for(const key of parts){const surf=L[key];for(let k=0;k<surf.p.length;k+=3*stride){
    const w=G.add(L.pivot,rotAbout([surf.p[k],surf.p[k+1],surf.p[k+2]],L.axis,L.range[0])),sk=wingSkin(w[0],w[2]);n++;
    if(!sk){outside++;continue;}below=Math.max(below,sk.lower-w[1]);above=Math.max(above,w[1]-sk.upper);}}
  return {below,above,outside,n};}
// Rotation taking the orthonormal pair (a1,a2) onto (b1,b2), returned as axis-angle for the rig.
function frameRotation(a1,a2,b1,b2){
  const A=[a1,a2,G.cross(a1,a2)],B=[b1,b2,G.cross(b1,b2)],R=[0,1,2].map(i=>[0,1,2].map(j=>A.reduce((n,a,k)=>n+B[k][i]*a[j],0)));
  const angle=Math.acos(G.clamp((R[0][0]+R[1][1]+R[2][2]-1)/2,-1,1)),s2=2*Math.sin(angle);
  return {axis:G.norm([(R[2][1]-R[1][2])/s2,(R[0][2]-R[2][0])/s2,(R[1][0]-R[0][1])/s2]),angle};
}
const orth=(v,d)=>G.norm(G.sub(v,G.scale(d,G.dot(v,d))));
function mainLeg(side){
  const g=S.gear.main,top=[side*g.hinge[0],g.hinge[1],g.hinge[2]],c=[side*g.axle[0],g.axle[1],g.axle[2]];
  const out=G.norm(G.scale(G.cross(G.norm(G.sub(c,top)),[0,0,1]),-side)),end=G.add(c,G.scale(out,-(g.wheelW/2+.03)));// the leg meets the wheel from inboard
  const dir=G.norm(G.sub(end,top)),axle=orth(out,dir);
  // The drawings show where the leg leaves the wing (g.hinge, 3-4 cm under the lower skin); the real
  // pivot sits inside the wing on the same leg line. Raise it along that line (hidden when down) and
  // choose the retracted pose of a single fixed hinge: the leg folds outward into the wing and the
  // outboard axle turns up, so the wheel lies flat above the leg end (the short ~90 deg fold of a
  // simple outward-retracting gear, not a twisting link). Search: every vertex inside the wing skin.
  const build=raise=>{const h=G.add(top,G.scale(dir,-raise)),along=f=>G.add(top,G.scale(G.sub(end,top),f)),rel=p=>G.sub(p,h);
    const leg=new G.Surface('leg').append(P.cylinder('oleo',h,along(.62),.07,.066,16)).append(P.cylinder('piston',along(.58),end,.043,.043,14))
      .append(P.cylinder('stub',end,c,.035,.035,10)).append(P.cylinder('scissor',along(.55),G.add(end,[0,0,.07]),.016,.016,8));
    // leg fairing: 0.17 m wide face-on in the side view; on the face that ends up underneath when retracted (inboard of the leg)
    const cover=P.bar('legCover',G.add(along(.04),G.scale(axle,-.082)),G.add(along(.62),G.scale(axle,-.082)),.17,.014,axle);
    const wh=wheel('main',c,out,g.wheelR,g.wheelW,.6);
    return {pivot:h,wheelCentre:c,leg:leg.transform(rel),cover:cover.transform(rel),tyre:wh.tyre.transform(rel),hub:wh.hub.transform(rel)};};
  const pose=(L,raise,psi,th,phi)=>{const r=Math.PI/180,sd=[side*Math.cos(psi*r)*Math.cos(th*r),Math.sin(th*r),Math.sin(psi*r)*Math.cos(th*r)];
    const up=orth([0,1,0],sd),lat=G.cross(sd,up),hub=G.norm(G.add(G.scale(up,Math.cos(phi*r)),G.scale(lat,Math.sin(phi*r))));
    const rot=frameRotation(dir,axle,sd,hub);return {...L,axis:rot.axis,range:[rot.angle,0],raise,psi,th,phi};};
  const score=(L,stride)=>{const k=stowedClearance(L,undefined,stride);return k.outside?1+k.outside:Math.max(k.below,k.above);};
  // coarse grid on a vertex subsample, then a shrinking local search on all vertices
  const lens={};const layout=raise=>lens[raise.toFixed(3)]||(lens[raise.toFixed(3)]=build(raise));
  let best=null;
  for(let raise=.12;raise<=.36;raise+=.04)for(let psi=-24;psi<=24;psi+=6)for(let th=-4;th<=14;th+=3)for(let phi=-24;phi<=24;phi+=8){
    const cand=pose(layout(raise),raise,psi,th,phi),sc=score(cand,6);if(!best||sc<best.sc)best={...cand,sc};}
  for(const step of [[.02,3,1.5,4],[.01,1.5,.75,2],[.005,.75,.4,1]])for(let pass=0;pass<4;pass++){
    for(const [i,sgn] of [0,1,2,3].flatMap(i=>[[i,-1],[i,1]])){const v=[best.raise,best.psi,best.th,best.phi];v[i]+=sgn*step[i];
      const cand=pose(layout(v[0]),...v),sc=score(cand,1);if(sc<best.sc)best={...cand,sc};}}
  best.sc=score(best,1);return best;
}
function tailLeg(){
  const g=S.gear.tail,h=g.hinge,w=g.wheel,rel=p=>G.sub(p,h),top=G.add(w,[0,g.wheelR*.8,.04]);
  const fork=new G.Surface('fork').append(P.cylinder('tailLeg',h,top,.042,.036,12)).append(P.bar('forkL',G.add(top,[.055,0,0]),G.add(w,[.055,0,0]),.05,.02,[0,0,1])).append(P.bar('forkR',G.add(top,[-.055,0,0]),G.add(w,[-.055,0,0]),.05,.02,[0,0,1]));
  const wh=wheel('tail',w,[1,0,0],g.wheelR,g.wheelW,.55);
  return {pivot:h,leg:fork.transform(rel),tyre:wh.tyre.transform(rel),hub:wh.hub.transform(rel)};
}
const legs={GearLeft:mainLeg(-1),GearRight:mainLeg(1)},tail=tailLeg();
// Retracted gear must lie inside the wing skin (no vertex through the upper or lower surface).
const stowed=Object.fromEntries(Object.entries(legs).map(([k,L])=>[k,stowedClearance(L)]));
for(const [k,c] of Object.entries(stowed))if(c.outside||c.below>-.005||c.above>-.005)throw Error('retracted '+k+' pokes through the wing skin: '+JSON.stringify(c));
// Open wheel wells on the lower skin where the wheel and leg lie when retracted (no doors on the F-2).
const wells=Object.values(legs).map(L=>{const w=G.add(L.pivot,rotAbout(G.sub(L.wheelCentre,L.pivot),L.axis,L.range[0]));
  return {x:Math.abs(w[0]),z:w[2],r:S.gear.main.wheelR+.015,slot:[Math.abs(L.pivot[0]),L.pivot[2],Math.abs(w[0]),w[2]]};});
for(const [k,L] of Object.entries(legs))console.log('stowed',k,'raise',L.raise.toFixed(2),'psi',L.psi,'theta',L.th,'phi',L.phi,['leg','cover','tyre','hub'].map(part=>part+' '+JSON.stringify(stowedClearance(L,[part]),(key,v)=>typeof v==='number'?+v.toFixed(3):v)).join(' | '));
if(process.env.SKIN_DUMP){for(const x of [.5,.7,.9,1.1,1.3,1.5])for(const z of [2.6,2.4,2.2,2.0,1.8,1.6]){const k=wingSkin(x,z);console.log('skin',x,z,k?k.lower.toFixed(3)+'..'+k.upper.toFixed(3)+' t='+(k.upper-k.lower).toFixed(3):'-');}console.log('LE/TE',[.5,.9,1.3].map(x=>[wing.f.le(x).toFixed(2),wing.f.te(x).toFixed(2)]));process.exit(0);}

// ---------------------------------------------------------------- coolers, intake, exhausts, mast, pitot
const flat={grey:new G.Surface('detailsGrey'),yellow:new G.Surface('detailsYellow'),metal:new G.Surface('exhausts'),steel:new G.Surface('fittings'),dark:new G.Surface('radiatorFaces')};
const box=(c,s)=>P.bar('box',[c[0],c[1],c[2]+s[2]/2],[c[0],c[1],c[2]-s[2]/2],s[0],s[1]);
{const rd=D.radiators,[x0,x1]=rd.span,[[bx0,by0],[bx1,by1]]=rd.bottom,bottom=x=>by0+(by1-by0)*(x-bx0)/(bx1-bx0),zf=rd.z[0];
  const lowerAt=(s,z)=>{const le=wing.f.le(s),te=wing.f.te(s),c=G.clamp((le-z)/(le-te),0,1),[,yl]=G.airfoil(c,wing.f.t(s),S.wing.camber);return wing.f.y(s)+yl*(le-te);};
  for(const side of [-1,1]){const xs=P.samples(x0,x1,.05),rows=xs.map(x=>{const zr=Math.max(rd.z[1],wing.f.te(x)+.01),yt=wing.f.y(x),yb=bottom(x);
      return [[side*x,yt,zf],[side*x,yb+.02,zf+.01],[side*x,yb,zf-.06],[side*x,yb,zr+.05],[side*x,yb+.03,zr],[side*x,yt,zr]];});
    const r=new G.Surface('radiator');r.grid(rows,{closed:true});r.orient(0,p=>[0,p[1]-(wing.f.y(Math.abs(p[0]))+bottom(Math.abs(p[0])))/2,p[2]-(zf+rd.z[1])/2]);r.cap(rows[0],[-side,0,0]);r.cap(rows[rows.length-1],[side,0,0]);flat.grey.append(r.clean());
    const face=new G.Surface('radiatorFace');face.grid(xs.map(x=>[[side*x,lowerAt(x,zf+.012)-.004,zf+.012],[side*x,bottom(x)+.022,zf+.012]]));face.orient(0,()=>[0,0,1]);flat.dark.append(face.clean());}}
{// chin oil cooler: a rounded fairing hanging from the cowling, measured box as its envelope
  const o=D.oilCooler,topY=o.c[1]+o.s[1]/2+.04,depth=o.s[1]+.04;
  flat.yellow.append(P.blister('oilCooler',[0,topY,o.c[2]],o.s[0]/2,depth,o.s[2]/2,20,8).transform(p=>[p[0],2*topY-p[1],p[2]]).orient(0,p=>[p[0],p[1]-topY,p[2]-o.c[2]]));}
{const o=D.oilCooler;flat.dark.append(P.bar('coolerFace',[0,o.c[1]-.006,o.c[2]+o.s[2]/2+.004],[0,o.c[1]-.006,o.c[2]+o.s[2]/2-.012],o.s[0]*.86,o.s[1]*.66));}
const halfAt=(z,y)=>{// fuselage half width at height y, from the lofted superellipse
  const wd=ff.wide(z),up=y>=wd,n=up?ff.nTop(z):ff.nBot(z),hh=up?ff.top(z)-wd:wd-ff.bottom(z),t=Math.min(1,Math.abs(y-wd)/hh);return ff.half(z)*Math.pow(1-Math.pow(t,n),1/n);};
for(const sc of D.scoops){// round supercharger intake (PDF: "kreisrunder Querschnitt"), faired back into the cowling
  const len=sc.from[2]-sc.to[2],x=sc.from[0],y=sc.from[1],side=Math.sign(x);
  const tube=P.lathe('scoop',[[0,sc.r*.9],[.02,sc.r],[len*.35,sc.r*.96],[len*.7,sc.r*.7],[len,sc.r*.08]],{axis:'z',origin:[0,0,0],ring:20}).transform(p=>[x+p[0],y+p[1],sc.from[2]-p[2]]);
  // pull the inner half onto the cowling skin so the tube sits on it without a gap
  tube.transform(p=>{const skin=halfAt(p[2],p[1]);return side*(p[0]-x)<0&&Math.abs(p[0])<skin?[side*Math.max(skin-.02,Math.abs(p[0])),p[1],p[2]]:p;});
  flat.yellow.append(tube);flat.dark.append(P.cylinder('scoopMouth',[x,y,sc.from[2]+.002],[x,y,sc.from[2]-.02],sc.r*.82,sc.r*.82,20));
}
{const [ez0,ez1]=D.exhaust.z,n=D.exhaust.count;for(let k=0;k<n;k++){const z=ez0+(ez1-ez0)*(k+.5)/n,dz=(ez0-ez1)/n*.62;
  for(const side of [-1,1]){const skin=halfAt(z,D.exhaust.y),tip=Math.max(skin+.012,D.exhaust.outer);
    flat.metal.append(P.bar('stack',[side*(skin-.02),D.exhaust.y,z+dz*.2],[side*tip,D.exhaust.y-.012,z-dz*.3],dz*1.15,.06,[0,1,0]));}}} // six stacks side by side form the manifold row seen on the profile
flat.grey.append(P.bar('mast',D.mast.from,D.mast.to,.018,.065,[0,0,1]));
{// pilot and head armour: seated behind the windscreen, head below the roof (simple shapes, not from the drawings)
  const sill=cf.base(hoodZ),roof=cf.top(hoodZ),zh=hoodZ-.12,leather=new G.Surface('pilot');
  leather.append(P.bar('torso',[0,sill-.25,zh-.02],[0,sill+.18,zh-.05],.36,.22,[0,0,1]));
  leather.append(P.lathe('head',[[-.11,0],[-.105,.04],[-.08,.085],[-.03,.105],[.03,.105],[.08,.085],[.105,.04],[.11,0]],{axis:'z',origin:[0,0,0],ring:16}).transform(p=>[p[0],p[2]+sill+.27,p[1]*.95+zh+.02]));
  flat.pilot=leather;
  flat.grey.append(P.bar('headArmour',[0,sill-.02,zh-.2],[0,roof-.04,zh-.24],cf.half(zh-.2)*1.4,.03,[0,0,1]));}
flat.steel.append(P.cylinder('pitot',D.pitot.from,D.pitot.to,.012,.008,8));

// ---------------------------------------------------------------- paint: Moelders, Stab/JG 51, June 1941 (PDF Abb. 53)
const C=Object.fromEntries(Object.entries(L.colours).map(([k,v])=>[k,v.slice()]));
C.white=[236,236,232];C.black=[24,24,24];C.well=[54,56,52];// open wheel well in shadow (assumed tone)
C.red=[176,36,30];C.rlm74=C.mottleDark;C.rlm75=[98,98,104];C.blue=[70,130,190];
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
// Mottle: the noise threshold reproduces the profile's dark share per height band (quantile of the
// noise distribution), the noise scale its mean dark run length along the fuselage.
const cov=L.mottle.coverageByHeight.map(([h,c])=>[h,c]);cov[cov.length-1][1]=cov[cov.length-2][1];// lowest band: belly shading, not paint
const covAt=h=>{if(h<=cov[0][0])return cov[0][1];for(let k=0;k<cov.length-1;k++)if(h<=cov[k+1][0])return G.lerp(cov[k][1],cov[k+1][1],(h-cov[k][0])/(cov[k+1][0]-cov[k][0]));return cov[cov.length-1][1];};
// domain-warped value noise: rounded blotches without the lattice's square look
const mottleNoise=(x,y,z,f)=>{const wz=Paint.fbm(z*f*.5+3.1,y*f*.5,x,13,2)-.5,wy=Paint.fbm(z*f*.5,y*f*.5+7.7,x,17,2)-.5;
  const u=z*f+wy*1.6,v=y*f+wz*1.6,r=.6;return Paint.fbm(u*Math.cos(r)-v*Math.sin(r),u*Math.sin(r)+v*Math.cos(r),x*3.1,77,4);};
const quantiles=(()=>{const v=[];for(let k=0;k<6000;k++)v.push(mottleNoise(Paint.hash(k,1,2,3)*40-20,Paint.hash(k,4,5,6)*4-2,Paint.hash(k,7,8,9)*40-20,1));return v.sort((a,b)=>a-b);})();
const thr=c=>quantiles[Math.max(0,Math.min(quantiles.length-1,Math.round(c*(quantiles.length-1))))];
const meanCov=cov.slice(0,-1).reduce((a,c)=>a+c[1],0)/(cov.length-1);
const mottleF=(()=>{let best=null;for(let f=2;f<=24;f+=.5){let runs=0,len=0;for(let line=0;line<60;line++){const y=-.4+line*.02,x=.3;let run=0;
  for(let z=-3;z<2;z+=.004){const d=mottleNoise(x,y,z,f)<thr(meanCov);if(d)run++;else if(run){runs++;len+=run*.004;run=0;}}}
  const m=len/Math.max(1,runs),err=Math.abs(m-L.mottle.meanDarkRun);if(!best||err<best.err)best={f,err,m};}return best;})();
console.log('mottle scale '+mottleF.f+' (mean dark run '+mottleF.m.toFixed(3)+' m, profile '+L.mottle.meanDarkRun+' m)');
// soft-edged blotches as sprayed: full colour at the core, fading out over the edge band
function mottle(x,y,z,h,base){const v=mottleNoise(x,y,z,mottleF.f),t=thr(covAt(h)),edge=.08;if(v>=t+edge)return base;// wide soft edge: sprayed, as on the profile
  const a=G.clamp((t+edge-v)/(2*edge),0,1),k=a*a*(3-2*a),tone=mix(C.mottleMid,C.mottleDark,G.clamp(Paint.fbm(z*3,y*3,x*3,91,2)*1.4-.35,0,1));return mix(base,tone,.85*k);}
// RLM 74/75 splinter (straight-edged areas) on the upper surfaces
const SPL=Array.from({length:14},(_,k)=>{const a=Paint.hash(k,3,5,7)*Math.PI;return [Math.cos(a),Math.sin(a),(Paint.hash(k,11,13,17)-.5)*7];});// straight edges every metre or so
const splinter=(x,z)=>{let parity=0;for(const [a,b,d] of SPL)if(a*x+b*z>d)parity^=1;return parity?C.rlm75:C.rlm74;};
// markings in fuselage side coordinates (z, y)
const crossMark=(z,y,cz,cy,half)=>{const a=Math.abs((z-cz)/half),b=Math.abs((y-cy)/half),arm=L.cross.arm,e=arm+L.cross.edge;
  if((a<=arm&&b<=1)||(b<=arm&&a<=1))return C.black;if((a<=e&&b<=1)||(b<=e&&a<=1))return C.white;return null;};
const OUT=.018;// white outline round the black Kommodore marks: one to two pixels on the profile
const segDist=(p,a,b)=>{const ab=[b[0]-a[0],b[1]-a[1]],t=G.clamp(((p[0]-a[0])*ab[0]+(p[1]-a[1])*ab[1])/(ab[0]**2+ab[1]**2),0,1);return Math.hypot(p[0]-a[0]-t*ab[0],p[1]-a[1]-t*ab[1]);};
function triInside(p,A,B,Cc){const s=(a,b,c)=>(a[0]-c[0])*(b[1]-c[1])-(b[0]-c[0])*(a[1]-c[1]);const d1=s(p,A,B),d2=s(p,B,Cc),d3=s(p,Cc,A);return !((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0));}
function kommodore(z,y){
  const p=[z,y],ch=L.chevron,w=ch.width/2,arms=Math.min(segDist(p,ch.apex,ch.upperEnd),segDist(p,ch.apex,ch.lowerEnd));
  const tr=L.triangle,T=[tr.apex,[tr.baseZ,tr.y[0]],[tr.baseZ,tr.y[1]]],inT=triInside(p,...T),tD=inT?0:Math.min(segDist(p,T[0],T[1]),segDist(p,T[1],T[2]),segDist(p,T[2],T[0]));
  const inBar=b=>z<=b.z[0]&&z>=b.z[1]&&Math.abs(y-b.y)<=b.h/2,barD=b=>Math.hypot(Math.max(b.z[1]-z,z-b.z[0],0),Math.max(Math.abs(y-b.y)-b.h/2,0));
  if(arms<=w||inT||inBar(L.barFore)||inBar(L.barAft))return C.black;
  if(arms<=w+OUT||tD<=OUT||barD(L.barFore)<=OUT||barD(L.barAft)<=OUT)return C.white;return null;
}
function emblem(z,y){const e=L.emblem,d=Math.hypot(z-e.z,y-e.y);if(d>e.r)return null;if(d>e.r*.86)return C.white;
  const u=(z-e.z)/e.r,v=(y-e.y)/e.r;return (v>-.55&&v<.35&&u>-.5&&u<.45&&Math.abs(u+v*.5)<.35)?C.white:C.blue;}// simplified badge, not the original artwork
function octane(z,y){const o=L.octane,h=o.y[1]-o.y[0],t=(y-o.y[0])/h;if(t<0||t>1)return null;return Math.abs(z-o.z)<=o.w/2*(1-t)?C.rudderYellow.map(v=>v*.92):null;}
const [[ry1,rz1],[ry2,rz2]]=L.rudderYellow.frontLine,rudderFront=y=>rz1+(rz2-rz1)*(y-ry1)/(ry2-ry1);
function tally(z,y){
  const m=L.tally.redMark;if(z<=m.z[0]&&z>=m.z[1]&&y>=m.y[0]&&y<=m.y[1])return C.red;
  for(const row of L.tally.rows){if(y<row.y[0]||y>row.y[1]||z>row.z[0]||z<row.z[1])continue;const pitch=(row.z[0]-row.z[1])/row.bars;return ((row.z[0]-z)/pitch)%1<.5?C.black:null;}
  return null;
}
const panelZ=S.panelLines,SPIN_BAND=120,spinPts=L.spinnerWhite.portEdge,spinEdge=t=>t<=spinPts[0][0]?spinPts[0][1]:t>=spinPts[spinPts.length-1][0]?spinPts[spinPts.length-1][1]:(()=>{for(let k=0;k<spinPts.length-1;k++)if(t<=spinPts[k+1][0])return G.lerp(spinPts[k][1],spinPts[k+1][1],(t-spinPts[k][0])/(spinPts[k+1][0]-spinPts[k][0]));})();
function paint(p,n,tag){
  const [x,y,z]=p;let col,h=0;
  if(tag==='spinner'){// white band: port edge measured on the profile, band width assumed (only one side is drawn)
    const len=S.propeller.spinner[S.propeller.spinner.length-1][0],t=G.clamp((z-pz)/len,0,1),phi=Math.atan2(x,y)*180/Math.PI,edge=spinEdge(t),d=((phi-edge+540)%360)-180;
    return {rgb:(d<=0&&d>-SPIN_BAND)||t>.93?C.white:C.spinner,h:0};}
  const side=Math.abs(n[0])>.3,up=n[1]>.55,down=n[1]<-.45;
  if(tag==='fuselage'){
    const hr=G.clamp((ff.top(z)-y)/(ff.top(z)-ff.bottom(z)),0,1);
    if(n[1]>.82&&hr<.2)col=splinter(x*1.7,z);else if(down)col=C.rlm76Base;else col=mottle(x,y,z,hr,C.rlm76Base);// the 74/75 upper colours show only on the spine itself
    if(y>L.yellowNoseAftZ.splitY?z>L.yellowNoseAftZ.upper:z>L.yellowNoseAftZ.lower)col=C.yellow;
    if(side){
      const k=crossMark(z,y,L.cross.z,L.cross.y,L.cross.half)||kommodore(z,y)||emblem(z,y)||(x>0?octane(z,y):null);if(k)col=k;
      const dz=D.exhaust.z[1]-z;if(dz>-.05&&dz<1.7&&!k){const band=Math.exp(-((y-D.exhaust.y+.03*dz)**2)/(2*(.05+.045*dz)**2)),a=G.clamp(band*(1-dz/1.7)*.6*(.7+.3*Paint.noise(z*9,y*9,x*9,4)),0,.7);col=mix(col,C.exhaust.map(v=>v*.45),a);}
    }
    if(panelZ.some(q=>Math.abs(z-q)<.006)){h=-1;col=mix(col,C.black,.18);}
  }else if(tag==='wing'||tag==='stab'){
    const ax=Math.abs(x),top=n[1]>0;col=top?splinter(x,z):C.rlm76Base;
    if(tag==='wing'){const ac=S.wing.controls.find(c=>c.drive==='roll'),cs=(ac.from+ac.to)/2,cz=(wing.f.le(cs)+wing.f.te(cs))/2,k=crossMark(ax,z,cs,cz,.48);if(k)col=k;
      if(top&&ax<1.1){const wear=Paint.fbm(x*16,z*16,1,9,3);if(wear>.76)col=mix(col,[150,152,148],.55);}
      if(!top)for(const w of wells){const d=Math.hypot(ax-w.x,z-w.z),sl=segDist([ax,z],[w.slot[0],w.slot[1]],[w.slot[2],w.slot[3]]);
        if(d<w.r||sl<.085){col=C.well;h=-1;}else if(d<w.r+.012||sl<.097)col=mix(col,C.black,.35);}}
  }else if(tag==='fin'){
    col=side?mottle(x,y,z,.45,C.rlm76Base):C.rlm76Base;
    if(z<rudderFront(y)&&y>L.rudderYellow.y[0]-.1)col=C.rudderYellow;
    if(side){const t=tally(z,y);if(t)col=t;}
  }else col=C.rlm76Base;
  const fade=up?1.03+.03*Paint.fbm(x*.9,z*.9,0,21,2):1,grime=down?.95+.04*Paint.fbm(x*3,z*3,0,31,3):1,grain=.985+.03*Paint.noise(x*40,y*40,z*40,41);
  return {rgb:col.map(c=>c*fade*grime*grain),h};
}
const items=[{surface:fuse.surface,tag:'fuselage'},{surface:wing.surface,tag:'wing'},{surface:stab.surface,tag:'stab'},{surface:fin.surface,tag:'fin'},
  ...wing.parts.map(q=>({surface:q.surface,tag:'wing',offset:q.pivot})),...stab.parts.map(q=>({surface:q.surface,tag:'stab',offset:q.pivot})),...fin.parts.map(q=>({surface:q.surface,tag:'fin',offset:q.pivot})),
  {surface:spinner,tag:'spinner',offset:[0,0,pz]}];
const bakeItems=items.map(it=>{const s=it.offset?new G.Surface(it.surface.name).append(it.surface).transform(p=>G.add(p,it.offset)):it.surface;return {surface:s,normals:s.normals(),tag:it.tag};});
console.log('baking paint atlas '+SIZE+'px');
const baked=Paint.bake(bakeItems,SIZE,paint);
fs.mkdirSync(outDir,{recursive:true});
const albedoPng=Paint.toPng(baked),normalPngBytes=Paint.normalPng(baked,1.6,1024);

// ---------------------------------------------------------------- GLB (rig contract v1)
// asset.extras is what the app asset audit reads (scripts/audit-app-assets.mjs)
const w=new GlbWriter({generator:'Torpedo-Bomber build-own-bf109.cjs',extras:{
  title:'Messerschmitt Bf 109 F-2, Stab/JG 51 (own build from the reference PDF)',author:'Torpedo-Bomber project (code-built, scripts/build-own-bf109.cjs)',
  license:'project-own; geometry measured on a CC BY-SA 2.0 three-view (B. Huber), finish measured on a CC BY-SA 2.5 profile (H. Ringlstetter)',
  source:'scripts/build-own-bf109.cjs',references:S.references.filter(r=>r.author).map(r=>({title:r.title,author:r.author,license:r.license})),
  processing:'No third-party mesh or texture. Station table measured on the drawings (scripts/own-aircraft/measure-bf109f.mjs), lofted and painted procedurally; silhouette gate and rig contract v1 passed at release.'}});
const tAlb=w.image(albedoPng),tNrm=w.image(normalPngBytes);
const lin=v=>Math.pow(v/255,2.2),rgb=(c,a=1)=>[lin(c[0]),lin(c[1]),lin(c[2]),a];
const mat=(name,c,m=0,r=.78,extra={})=>w.material({name,pbrMetallicRoughness:{baseColorFactor:c,metallicFactor:m,roughnessFactor:r},...extra});
const M={
  paint:w.material({name:'Bf109 F-2 Moelders finish',pbrMetallicRoughness:{baseColorTexture:{index:tAlb},metallicFactor:0,roughnessFactor:.74},normalTexture:{index:tNrm,scale:.7}}),
  glass:mat('Canopy glass',[.62,.68,.70,.18],0,.05,{alphaMode:'BLEND',doubleSided:true}),
  frame:mat('Canopy frames',rgb(C.canopyFrame||C.mottleDark)),// measured on the profile's frame bars
  grey:mat('Fittings RLM 76',rgb(C.rlm76Base)),
  yellow:mat('Fittings yellow',rgb(C.yellow)),
  dark:mat('Cooler cores',[.02,.02,.02,1],.3,.6),
  exhaust:mat('Exhaust stacks',rgb(C.exhaust),.4,.6),
  steel:mat('Steel',[.45,.46,.45,1],.8,.35),
  gear:mat('Gear',rgb([125,123,104]),.1,.6),
  tyre:mat('Tyre rubber',[.018,.018,.018,1],0,.92),
  prop:mat('Propeller blades',rgb(C.spinner),0,.7),
  pilot:mat('Pilot leather',rgb([78,58,40]),0,.8),
};
const meshOf=(name,s,m,textured)=>{s.clean();const normals=s.normals();return w.mesh(name,{positions:s.p,normals:Array.from(normals),uvs:textured?s.uv:undefined,tangents:textured?Array.from(s.tangents(normals)):undefined,indices:s.i,material:m});};
let tris=0;const count=s=>{tris+=s.triangles();return s;};
const id=measured?'bf109f2-own-1':'bf109f2-unmeasured';
const top=w.node({name:'Bf109F2_Own',extras:{rigContract:1,class:'tailwheel-fighter',nativeAircraft:id,kind:'bf109',
  title:'Messerschmitt Bf 109 F-2, Stab/JG 51 (own build from the reference PDF)',author:'Torpedo-Bomber project (code-built, scripts/build-own-bf109.cjs)',license:'project-own',
  source:'scripts/build-own-bf109.cjs + '+path.relative(ROOT,shapeFile),
  provenance:'Independent geometry lofted from the station table measured on the three-view in the owner-supplied PDF; finish positions and colours measured on the profile, paint drawn procedurally. No third-party 3D model used.',
  references:S.references,dimensions:{span:S.facts.span,length:S.facts.length},livery:L.title,assumed:ASSUMED,
  shapeSha256:crypto.createHash('sha256').update(fs.readFileSync(shapeFile)).digest('hex')}});
const airframe=new G.Surface('airframe').append(fuse.surface).append(wing.surface).append(stab.surface).append(fin.surface);
w.node({name:'Airframe',mesh:meshOf('airframe',count(airframe),M.paint,true)},top);
w.node({name:'DetailsGrey',mesh:meshOf('detailsGrey',count(flat.grey),M.grey)},top);
w.node({name:'DetailsYellow',mesh:meshOf('detailsYellow',count(flat.yellow),M.yellow)},top);
w.node({name:'CoolerCores',mesh:meshOf('coolerCores',count(flat.dark),M.dark)},top);
w.node({name:'Exhausts',mesh:meshOf('exhausts',count(flat.metal),M.exhaust)},top);
w.node({name:'Pitot',mesh:meshOf('pitot',count(flat.steel),M.steel)},top);
w.node({name:'Pilot',mesh:meshOf('pilot',count(flat.pilot),M.pilot)},top);
w.node({name:'CanopyFixedGlass',mesh:meshOf('canopyFixedGlass',count(glassFixed),M.glass)},top);
w.node({name:'CanopyFixedFrames',mesh:meshOf('canopyFixedFrames',count(framesFixed),M.frame)},top);
const canopy=w.node({name:'Canopy',translation:canopyPivot,extras:{rig:{drive:'canopy',axis:[0,0,1],range:[0,1.55]}}},top);
w.node({name:'CanopyGlass',mesh:meshOf('canopyGlass',count(glassHood.transform(p=>G.sub(p,canopyPivot))),M.glass)},canopy);
w.node({name:'CanopyFrames',mesh:meshOf('canopyFrames',count(framesHood.transform(p=>G.sub(p,canopyPivot))),M.frame)},canopy);
const rotor=w.node({name:'Propeller',translation:[0,0,pz],extras:{rig:{drive:'prop',axis:[0,0,1],blades:S.propeller.blades}}},top);
w.node({name:'Spinner',mesh:meshOf('spinner',count(spinner),M.paint,true)},rotor);
w.node({name:'Blades',mesh:meshOf('blades',count(blades),M.prop)},rotor);
const gear=w.node({name:'gear'},top);
for(const [name,Lg] of Object.entries(legs)){
  const n=w.node({name,translation:Lg.pivot,extras:{rig:{drive:'gear',axis:Lg.axis,range:Lg.range}}},gear);
  w.node({name:name+'Leg',mesh:meshOf(name+'Leg',count(Lg.leg.append(Lg.hub)),M.gear)},n);
  w.node({name:name+'Cover',mesh:meshOf(name+'Cover',count(Lg.cover),M.grey)},n);
  w.node({name:name+'Tyre',mesh:meshOf(name+'Tyre',count(Lg.tyre),M.tyre),extras:{groundWheel:true}},n);
}
const tg=w.node({name:'TailGear',translation:tail.pivot,extras:{rig:{drive:'gear',axis:[1,0,0],range:[0,0]}}},gear);
w.node({name:'TailGearLeg',mesh:meshOf('tailLeg',count(tail.leg.append(tail.hub)),M.gear)},tg);
w.node({name:'TailGearTyre',mesh:meshOf('tailTyre',count(tail.tyre),M.tyre),extras:{groundWheel:true}},tg);
const flaps=w.node({name:'flightFlaps'},top);
// Sign conventions follow the native P-47 rig: AileronLeft (-X) +gain*roll about +X, AileronRight -gain.
const control=(q,parent)=>{const c=q.ctl,rig=c.drive==='flap'?{drive:q.side<0?'flapLeft':'flapRight',axis:q.axis,range:c.range}:{drive:c.drive,axis:q.axis,gain:c.drive==='roll'?(q.side<0?1:-1)*Math.abs(c.gain):c.gain};
  w.node({name:q.name,translation:q.pivot,extras:{rig},mesh:meshOf(q.name,count(q.surface),M.paint,true)},parent);};
for(const q of wing.parts)control(q,q.ctl.drive==='flap'?flaps:top);
for(const q of [...stab.parts,...fin.parts])control(q,top);
for(const m of S.muzzles)w.node({name:m.name,translation:m.p},top);
const bytes=w.glb(),file=path.join(outDir,measured?'bf109f2-own.glb':'bf109f2-unmeasured.glb');
if(release){
  const {runGate}=await import('./silhouette-gate.mjs'),gate=await runGate(bytes,path.join(REFDIR,'reference.json'));
  if(!gate.passed)throw Error('--release refused: silhouette gate failed '+JSON.stringify(gate.views));
}
fs.writeFileSync(file,bytes);// the release ships the GLB only; the paint atlas PNGs are inspection copies
if(!release){fs.writeFileSync(path.join(outDir,'bf109f2-paint-albedo.png'),albedoPng);fs.writeFileSync(path.join(outDir,'bf109f2-paint-normal.png'),normalPngBytes);}
console.log(JSON.stringify({file:path.relative(ROOT,file),bytes:bytes.length,triangles:tris,status:S.status,gearUp:Object.fromEntries(Object.entries(legs).map(([k,l])=>[k,{axis:l.axis.map(v=>+v.toFixed(3)),angle:+l.range[0].toFixed(3),insideSkin:{lower:+(-stowed[k].below).toFixed(3),upper:+(-stowed[k].above).toFixed(3)}}]))}));
})().catch(e=>{console.error(e.stack||e.message||e);process.exitCode=1;});
