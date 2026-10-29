#!/usr/bin/env node
/* Builds our own Mitsubishi A6M2 Model 21 "Zero-Sen" from the station table measured on the owner's
 * PDF (app/model-candidates/references/a6m2/shape.json, written by measure-a6m2.mjs from the
 * five-view drawing in Profile Publications Aircraft No. 129 and its specification table):
 * lofted fuselage with the Sakae cowling, NACA-type wing with split flap and aileron, tailplane and fin
 * with separate hinged controls, glazed canopy, three-blade propeller, inward-retracting main gear,
 * retractable tail wheel and the ventral drop tank. The finish is the drawn aircraft's (V-103, Tainan
 * Kokutai, Lae, July 1942); the paint itself - panel lines, rivets, wear, soot - is drawn procedurally.
 * Output follows rig contract v1.
 *
 *   node scripts/build-own-a6m2.cjs [shape.json] [--out dir] [--release] [--ref <prepared-dir>]
 *
 * Without --release it writes to build/own-a6m2/. --release writes assets/aircraft/ and is refused
 * unless the shape table is MEASURED with a sha256-pinned reference and the silhouette gate passes
 * against the cut-out views of the drawing (--ref, written by prepare-a6m2-reference.py; the drawing is
 * copyrighted and kept outside the repository). */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const G=require('./own-aircraft/geometry.cjs'),P=require('./own-aircraft/parts.cjs'),Paint=require('./own-aircraft/paint.cjs'),{LineField}=require('./own-aircraft/linefield.cjs');
const {GlbWriter}=require('./lib/glb-writer.cjs');
const ROOT=path.resolve(__dirname,'..'),REFDIR=path.join(ROOT,'app/model-candidates/references/a6m2');

// Values the drawing and the table cannot give. Each is listed in the GLB's extras.assumed.
const ASSUMED={
  wingSection:'wing section: symmetric NACA four-digit thickness distribution, no camber, no twist; the front view gives the thickness per span station (fitted linearly), the root inside 1.6 m is hidden by blades and cowling and follows the fitted line',
  tailSections:'tailplane and fin sections 9 % thick, symmetric; the stabiliser height (0.07 m above the thrust line) is read off the side view where the stabiliser meets the tail cone',
  sectionShape:'fuselage cross-section exponents (superellipse) fitted against the front view; the drawings give outlines only. Half widths over the wing root and over the tailplane are joined by a line between the measured ends',
  canopyTaper:'canopy glazing outline along z (windscreen corners, rear fairing) read by eye off the plan view; its maximum half width is measured, the frame bars are 3 cm wide',
  bladeShape:'blade angle 20 deg at the tip plus 28 deg twist to the root and the root chords (r < 0.95 m) are assumed; the front view gives the projected chord from 0.95 m outward and the radius',
  tipStripes:'propeller tip stripes: positions from the drawing, widths padded to 3 cm',
  gearGeometry:'main legs: pivot at the outer end of the drawn leg slot (x), at the wing mid height on the drawn leg line; the leg is vertical in the front view (the drawing shows no gear in the front view) and the wheel sits 0.13 m outboard of it; track 3.95 m is derived, not printed in the PDF',
  gearRetraction:'retracted pose = one fixed hinge, leg spanwise inboard, wheel flat in the belly well, searched so every vertex stays inside the wing or fuselage skin. The real undercarriage shortened its oleo while retracting; this model keeps the leg length',
  gearDoors:'no leg or well doors modelled; open wells painted on the lower skin where the wheel and leg lie; tone assumed',
  tailWheel:'tail wheel retracts forward into the tail cone (drawn down in one view, absent in the other); retracted pose assumed',
  dropTank:'belly tank: bottom outline measured, nose end hidden behind the main leg is rounded by assumption; a belly saddle is not modelled; the game hides the tank',
  engineFace:'engine face in the cowling mouth: cylinder heads and crankcase are simple shapes, not from the drawing',
  details:'exhaust pipes, oil cooler fairing width, cannon barrels and gunsight are simple shapes at measured positions or assumed',
  sliding:'the canopy slides on the real aircraft; the rig contract has rotating canopies only, so the hood is fixed',
  cockpit:'pilot figure, seat back, armour plate, headrest, stick, side consoles, instrument panel and gunsight are simple shapes at assumed positions (they sit on the outer deck: the skin under the hood is closed); the drawing shows the hood frames and a dark interior only. Glass tint and opacity assumed; frame colour assumed pale grey-green',
  noseSmoothing:'between the 12 cm stations of the nose the cowling profile is interpolated with a monotone cubic (passes through every measured station); the straight-line version showed bands',
  panelLines:'panel seams, hatches, flap and aileron outlines are the vector centre lines traced from the drawing (scripts/own-aircraft/trace-a6m2-lines.py): only strokes the tracer separates from the drawing\'s shading are included, fainter seams are missing; groove width 8 mm and the rivet rows beside every line longer than 0.4 m (pitch 28 mm, 9-14 mm off the line) are assumed',
  wells:'wheel wells and leg slots are painted at the drawn extents (x 0.062..0.673, z 2.098..2.793; slot to x 1.845, 0.32 m wide); the stowed wheel itself lies deeper inside the wing than the drawn well because the wing is too thin at the drawn well centre, its pose is searched inside the skin',
  finish:'finish colours are sampled from the drawing and lowered for the game light; wear, chipping along seams and lower edges, soot, oil and the metal/roughness map are the builder\'s design - the drawing is a clean airbrush illustration',
  decals:'no stencils or data plates'
};

(async()=>{
const args=process.argv.slice(2),release=args.includes('--release');
const shapeFile=args.find(a=>a.endsWith('.json'))||path.join(REFDIR,'shape.json');
const outDir=release?path.join(ROOT,'assets/aircraft'):(args.includes('--out')?args[args.indexOf('--out')+1]:path.join(ROOT,'build/own-a6m2'));
const refDir=args.includes('--ref')?path.resolve(args[args.indexOf('--ref')+1]):null;
const S=JSON.parse(fs.readFileSync(shapeFile,'utf8'));
const measured=S.status==='MEASURED'&&(S.references||[]).some(r=>/^[0-9a-f]{64}$/.test(r.sha256||''));
if(release&&!measured)throw Error('--release refused: shape table is '+S.status);
if(release&&!refDir)throw Error('--release needs --ref <prepared-dir> with the cut-out views for the silhouette gate');
const L=S.livery,D=S.details;

// ---------------------------------------------------------------- drawn panel lines (measured by trace-a6m2-lines.py)
// Vector centre lines of every seam, hatch, flap outline and well drawn on the five-view drawing, in metres. Side views
// carry (z, y), plan and underside views (x, z) with +x to port. Lines that belong to other objects seen in the same view
// (the wing and its wells in the side views, the leg, wheel and tank in the starboard view) are cut out.
const LN=JSON.parse(fs.readFileSync(path.join(REFDIR,'lines.json'),'utf8'));
const cutBoxes=(lines,boxes)=>{const out=[],inside=p=>boxes.some(([a0,b0,a1,b1])=>p[0]>=a0&&p[0]<=a1&&p[1]>=b0&&p[1]<=b1);
  for(const l of lines){let cur=[];for(const p of l){if(inside(p)){if(cur.length>1)out.push(cur);cur=[];}else cur.push(p);}if(cur.length>1)out.push(cur);}return out;};
const sideBoxes={side:[[-.9,-1.2,2.95,.12]],gearDown:[[-.9,-1.2,2.95,.12],[-1.1,-1.2,3.6,-.4]]};
const fieldOf=(lines,bounds,min=0)=>new LineField(lines,bounds,{res:.005,cap:.03,minLength:min});
const FS={
  sideP:[fieldOf(cutBoxes(LN.views.side.lines,sideBoxes.side),[-4.7,-1,4.7,2.3]),fieldOf(cutBoxes(LN.views.side.lines,sideBoxes.side),[-4.7,-1,4.7,2.3],.3)],
  sideS:[fieldOf(cutBoxes(LN.views.gearDown.lines,sideBoxes.gearDown),[-4.7,-1,4.7,2.3]),fieldOf(cutBoxes(LN.views.gearDown.lines,sideBoxes.gearDown),[-4.7,-1,4.7,2.3],.3)],
  top:[fieldOf(LN.views.top.lines,[-6.2,-4.7,6.2,4.7]),fieldOf(LN.views.top.lines,[-6.2,-4.7,6.2,4.7],.4)],
  under:[fieldOf(LN.views.under.lines,[-6.2,-4.7,6.2,4.7]),fieldOf(LN.views.under.lines,[-6.2,-4.7,6.2,4.7],.4)]};
console.log('panel lines: side '+FS.sideP[0].count+', starboard '+FS.sideS[0].count+', plan '+FS.top[0].count+', underside '+FS.under[0].count);

// ---------------------------------------------------------------- atlas layout (u0,v0,u1,v1)
const SIZE=2048,R={
  fuse:[0,0,.372,1],
  wing:{LU:[.378,0,.878,.192],LD:[.378,.198,.878,.390],RU:[.378,.396,.878,.588],RD:[.378,.594,.878,.786]},
  stab:{LU:[.378,.792,.598,.892],LD:[.378,.898,.598,.998],RU:[.604,.792,.824,.892],RD:[.604,.898,.824,.998]},
  fin:{L:[.884,0,.998,.30],R:[.884,.306,.998,.606]},
  spinner:[.884,.612,.998,.74],
};
const tight=c=>c.map(k=>({...k,gap:.001}));

// ---------------------------------------------------------------- airframe from the measured table
const tailEnd=S.fuselage.stations.reduce((a,b)=>a.z<b.z?a:b);
// The nose stations are 12 cm apart; joined by straight lines they show as bands on the glossy cowling. Between them the
// profile is interpolated with a monotone cubic (it passes through every measured station and never overshoots).
function pchip(xs,ys){const n=xs.length,h=[],d=[],m=new Array(n);for(let i=0;i<n-1;i++){h.push(xs[i+1]-xs[i]);d.push((ys[i+1]-ys[i])/h[i]);}
  m[0]=d[0];m[n-1]=d[n-2];for(let i=1;i<n-1;i++)m[i]=d[i-1]*d[i]<=0?0:2/(1/d[i-1]+1/d[i]);
  return x=>{let i=0;while(i<n-2&&x>xs[i+1])i++;const t=(x-xs[i])/h[i],t2=t*t,t3=t2*t;return (2*t3-3*t2+1)*ys[i]+(t3-2*t2+t)*h[i]*m[i]+(-2*t3+3*t2)*ys[i+1]+(t3-t2)*h[i]*m[i+1];};}
function smoothNose(stations,zFrom,step=.03){
  const nose=stations.filter(s=>s.z>=zFrom).sort((a,b)=>a.z-b.z),rest=stations.filter(s=>s.z<zFrom),keys=['top','bottom','half','wide','nTop','nBot'];
  const f=Object.fromEntries(keys.map(k=>[k,pchip(nose.map(s=>s.z),nose.map(s=>s[k]))]));
  const out=[];for(let z=nose[0].z;z<nose[nose.length-1].z-1e-6;z+=step)out.push(Object.fromEntries([['z',z],...keys.map(k=>[k,f[k](z)])]));
  out.push({...nose[nose.length-1]});return [...rest,...out];}
const st0=smoothNose(S.fuselage.stations.map(s=>({...s})),S.cowl.zRear-.25);
for(const s of st0)if(s.top-s.bottom<.05){const m=(s.top+s.bottom)/2;s.top=m+.025;s.bottom=m-.025;s.wide=s.bottom+(s.top-s.bottom)*.45;}
const cone={...tailEnd,z:tailEnd.z-.1,half:.02,top:tailEnd.top-.02,bottom:tailEnd.bottom+.03};cone.wide=cone.bottom+(cone.top-cone.bottom)*.45;
const fuse=P.body('fuselage',{stations:[...st0,cone]},R.fuse,{capFront:true,capRear:true,ring:48,step:.035});
const ff=fuse.f;
const ws=S.wing.stations,root={...ws[0],s:.05};
const wing=P.liftingSurface('wing',{...S.wing,controls:tight(S.wing.controls),stations:[root,...ws],step:.075,points:24,hingeGap:0,controlOverlap:.012},R.wing);
const ss=S.stabiliser.stations,stabRoot={...ss[0],s:.02},stf=G.table(ss,'s',['le','te']),elev=S.stabiliser.controls[0];
const stab=P.liftingSurface('stabiliser',{stations:[stabRoot,...ss].map(s=>({...s,y:S.stabiliser.y})),camber:0,
  controls:tight([{...elev,hAt:s=>G.clamp((stf.le(s)-elev.hz)/(stf.le(s)-stf.te(s)),.05,.95)}]),step:.08,points:16,hingeGap:0,controlOverlap:.012},R.stab);
const rud=S.fin.controls[0],ft=G.table(S.fin.stations,'s',['le','te']);
const fin=P.liftingSurface('fin',{spanAxis:'y',camber:0,stations:S.fin.stations.map(s=>({...s,x:0})),
  controls:tight([{...rud,hAt:s=>G.clamp((ft.le(s)-rud.hingeZ)/(ft.le(s)-ft.te(s)),.05,.95)}]),step:.05,points:16,hingeGap:0,controlOverlap:.012},R.fin);

// ---------------------------------------------------------------- canopy: glazed hood (fixed), windscreen, rear fairing
const cst=[...S.canopy.stations].sort((a,b)=>a.z-b.z),cf=G.table(cst,'z',['top','base','half','roofHalf']);
const cz0=cst[0].z,cz1=cst[cst.length-1].z;
const FR=S.canopy.frames.map(f=>f.z).sort((a,b)=>b-a);
// drawn lines: two close lines at the windscreen's rear edge (1.91, 1.79), the hood's front frame (1.74), two lines that
// merge into one frame (1.43/1.39), a mid frame (1.06) and the hood's rear frame (0.66)
const fHood=FR[2],fRear=FR[FR.length-1],midFrames=[(FR[3]+FR[4])/2,FR[5]],windFrames=[FR[0],FR[1]];
function canopySection(z,grow=0){
  const b=cf.base(z)-.02,t=cf.top(z)+grow,h=cf.half(z)+grow,rh=Math.min(cf.roofHalf(z),cf.half(z))+grow*.5,r=Math.min(.11,(t-b)*.3);
  const len=Math.hypot(rh-h,t-b),u=[(rh-h)/len,(t-b)/len],C=[rh,t],A=[C[0]-u[0]*r,C[1]-u[1]*r],B=[C[0]-r,C[1]];
  const bez=k=>{const s=k/4;return [(1-s)**2*A[0]+2*(1-s)*s*C[0]+s*s*B[0],(1-s)**2*A[1]+2*(1-s)*s*C[1]+s*s*B[1]];};
  const port=[[h,b],A,bez(1),bez(2),bez(3),B];
  return [...port.map(([x,y])=>[-x,y,z]),...port.slice().reverse().map(([x,y])=>[x,y,z])];
}
const ROOF=5,outward=p=>[p[0],p[1]-cf.base(p[2]),0];
function glassBetween(name,za,zb,capA,capB){const zs=P.samples(za,zb,.03,cst.map(s=>s.z)),rows=zs.map(z=>canopySection(z)),g=new G.Surface(name);
  g.grid(rows);g.orient(0,outward);if(capA)g.cap(rows[0],[0,0,-1]);if(capB)g.cap(rows[rows.length-1],[0,0,1]);return g;}
const glassFixed=glassBetween('windscreen',fHood,cz1,false,true).append(glassBetween('rearGlazing',cz0,fRear,true,false)),glassHood=glassBetween('hood',fRear,fHood,false,false);
const FRAME=.036;
function frameBand(z,w,s){const a=canopySection(z-w/2,.008),b=canopySection(z+w/2,.008),t0=s.triangles();s.grid([a,b]);s.orient(t0,outward);return s;}
function frameRail(za,zb,k,s,w=FRAME){const zs=P.samples(za,zb,.03),rows=zs.map(z=>{const sec=canopySection(z,.008),p=sec[k],q=sec[Math.min(sec.length-1,k+1)],o=sec[Math.max(0,k-1)],d=G.norm(G.sub(q,o));return [G.add(p,G.scale(d,-w/2)),G.add(p,G.scale(d,w/2))];});
  const t0=s.triangles();s.grid(rows);s.orient(t0,outward);return s;}
const framesFixed=new G.Surface('framesFixed'),framesHood=new G.Surface('framesHood'),nSec=canopySection(1).length;
frameBand(fHood+FRAME/4,FRAME/2,framesFixed);frameBand(fHood-FRAME/4,FRAME/2,framesHood);
for(const z of windFrames.filter(z=>z>fHood+.03))frameBand(z,FRAME*.8,framesFixed);
for(const z of midFrames)frameBand(z,FRAME,framesHood);
frameBand(fRear+FRAME/4,FRAME/2,framesHood);frameBand(fRear-FRAME/4,FRAME/2,framesFixed);
for(const k of [0,ROOF,nSec-1-ROOF,nSec-1]){const w=(k===0||k===nSec-1)?FRAME*1.9:FRAME;frameRail(fRear,fHood,k,framesHood,w);frameRail(fHood,cz1,k,framesFixed,w);frameRail(cz0,fRear,k,framesFixed,w);}
const hoodZ=(fRear+fHood)/2;

// ---------------------------------------------------------------- rotor, spinner, blades
const pz=S.propeller.z,Rp=S.propeller.radius,zTip=S.fuselage.stations[0].z+S.spinnerProfile[S.spinnerProfile.length-1][0]-.0;
const spinLen=S.spinnerProfile[S.spinnerProfile.length-1][0],zCowl=S.cowl.zFront,zNose=zCowl+spinLen+.0;
const tipA=zNose-pz,sp=S.spinnerProfile.map(([d,r])=>[tipA-d,r]).reverse();
const spSm=sp.map(([a,r],i)=>[a,sp.slice(Math.max(0,i-2),i+3).reduce((q,v)=>q+v[1],0)/sp.slice(Math.max(0,i-2),i+3).length]);spSm[spSm.length-1][1]=Math.min(spSm[spSm.length-1][1],.02);
const spinProfile=[[spSm[0][0]-.05,spSm[0][1]],...spSm,[tipA+.012,0]].sort((a,b)=>a[0]-b[0]);
const spinner=P.lathe('spinner',spinProfile,{axis:'z',origin:[0,0,0],ring:32,region:R.spinner,capStart:true});
const angle=r=>20+28*(1-r/Rp),chords=S.propeller.projectedChord.map(b=>({r:b.r,chord:b.projected/Math.cos(angle(b.r)*Math.PI/180),t:.1+.06*(1-b.r/Rp),pitch:angle(b.r)}));
const bladeSt=[{r:.24,chord:.15,t:.28,pitch:angle(.24)},{r:.5,chord:.2,t:.2,pitch:angle(.5)},{r:.8,chord:chords[0].chord*.97,t:.14,pitch:angle(.8)},...chords,{r:Rp-.04,chord:.1,t:.07,pitch:angle(Rp)},{r:Rp,chord:.05,t:.05,pitch:angle(Rp)}];
// The drawn tip stripes (red, yellow, red) need triangles narrow enough to carry them: the outer 0.3 m is resampled every 2 cm.
const bladeDense=(()=>{const base=bladeSt.slice().sort((a,b)=>a.r-b.r),lerp1=(a,b,t)=>a+(b-a)*t,out=base.filter(b=>b.r<1.15);
  for(let r=1.15;r<Rp-.005;r+=.02){let i=0;while(i<base.length-2&&base[i+1].r<r)i++;const a=base[i],b=base[i+1],t=G.clamp((r-a.r)/(b.r-a.r),0,1);out.push({r,chord:lerp1(a.chord,b.chord,t),t:lerp1(a.t,b.t,t),pitch:lerp1(a.pitch,b.pitch,t)});}
  out.push(base[base.length-1]);return out;})();
const bladesAll=P.blades('blades',{blades:3,stations:bladeDense,chordPoints:9});
// split by radius into the plain blade and the painted stripes (centres from the drawing, 3.2 cm wide)
const stripeAt=S.livery.tipStripes.map(t=>({kind:t.kind,c:(t.from+t.to)/2}));
const stripeKind=r=>{let k=null;for(const t of stripeAt)if(Math.abs(r-t.c)<=.016)k=t.kind;return k;};
const bladeParts={plain:new G.Surface('bladePlain'),red:new G.Surface('bladeRed'),yellow:new G.Surface('bladeYellow')};
for(let k=0;k<bladesAll.i.length;k+=3){const ids=[bladesAll.i[k],bladesAll.i[k+1],bladesAll.i[k+2]];let r=0;for(const j of ids)r+=Math.hypot(bladesAll.p[j*3],bladesAll.p[j*3+1])/3;
  const t=bladeParts[stripeKind(r)||'plain'];t.tri(...ids.map(j=>t.vertex([bladesAll.p[j*3],bladesAll.p[j*3+1],bladesAll.p[j*3+2]])));}
const blades=bladeParts.plain;

// ---------------------------------------------------------------- gear
const rotAbout=(p,k,a)=>{const c=Math.cos(a),s=Math.sin(a);return G.add(G.add(G.scale(p,c),G.scale(G.cross(k,p),s)),G.scale(k,G.dot(k,p)*(1-c)));};
function wheel(name,centre,axle,r,w,hub,coverSide=0){
  const tyre=P.lathe(name+'Tyre',[[-w/2,r*.62],[-w/2,r*.84],[-w*.38,r*.97],[0,r],[w*.38,r*.97],[w/2,r*.84],[w/2,r*.62]],{axis:'x',origin:[0,0,0],ring:32});
  const rim=P.lathe(name+'Hub',[[-w*.52,0],[-w*.52,r*hub],[-w*.3,r*hub*1.04],[w*.3,r*hub*1.04],[w*.52,r*hub],[w*.52,0]],{axis:'x',origin:[0,0,0],ring:24});
  const q=G.norm(axle),k=G.cross([1,0,0],q),s=G.len(k),a=Math.atan2(s,G.dot([1,0,0],q)),place=p=>G.add(s<1e-9?p:rotAbout(p,G.scale(k,1/s),a),centre);
  return {tyre:tyre.transform(place),hub:rim.transform(place)};
}
const wingMidY=x=>wing.f.y(Math.min(Math.max(Math.abs(x),ws[0].s),ws[ws.length-1].s));
function wingSkin(x,z){const s=Math.abs(x);if(s<root.s||s>ws[ws.length-1].s)return null;
  const le=wing.f.le(s),te=wing.f.te(s);if(z>le||z<te)return null;
  const at=(c,upper)=>{const [yu,yl]=G.airfoil(c,wing.f.t(s),S.wing.camber);return wing.point(1,s,c,upper?yu:yl);};
  const solve=upper=>{let c=(le-z)/(le-te);for(let k=0;k<5;k++){const p=at(c,upper),q=at(Math.min(1,c+.001),upper),dz=(q[2]-p[2])/(Math.min(1,c+.001)-c||1e-9);if(Math.abs(dz)<1e-9)break;c=G.clamp(c-(p[2]-z)/dz,0,1);}return at(c,upper)[1];};
  return {upper:solve(true),lower:solve(false)};}
// Worst push-through (m) of the retracted leg and wheel through the lower/upper wing skin.
function stowedClearance(Lg,parts=['leg','cover','tyre','hub'],stride=1){let below=-Infinity,above=-Infinity,outside=0,n=0;
  for(const key of parts){const surf=Lg[key];for(let k=0;k<surf.p.length;k+=3*stride){
    const w=G.add(Lg.pivot,rotAbout([surf.p[k],surf.p[k+1],surf.p[k+2]],Lg.axis,Lg.range[0])),sk=wingSkin(w[0],w[2]);n++;
    if(!sk){outside++;continue;}below=Math.max(below,sk.lower-w[1]);above=Math.max(above,w[1]-sk.upper);}}
  return {below,above,outside,n};}
function frameRotation(a1,a2,b1,b2){
  const A=[a1,a2,G.cross(a1,a2)],B=[b1,b2,G.cross(b1,b2)],Rm=[0,1,2].map(i=>[0,1,2].map(j=>A.reduce((n,a,k)=>n+B[k][i]*a[j],0)));
  const ang=Math.acos(G.clamp((Rm[0][0]+Rm[1][1]+Rm[2][2]-1)/2,-1,1)),s2=2*Math.sin(ang);
  return {axis:G.norm([(Rm[2][1]-Rm[1][2])/s2,(Rm[0][2]-Rm[2][0])/s2,(Rm[1][0]-Rm[0][1])/s2]),angle:ang};
}
const orth=(v,d)=>G.norm(G.sub(v,G.scale(d,G.dot(v,d))));
function mainLeg(side){
  const g=S.gear.main,off=g.wheelW/2+.03,top=[side*g.hinge[0],g.hinge[1],g.hinge[2]],c=[side*(g.axle[0]+off),g.axle[1],g.axle[2]];
  const out=[side,0,0],end=[c[0]-side*off,c[1],c[2]];// the leg ends inboard of the wheel, on the leg line
  const dir=G.norm(G.sub(end,top)),axle=orth(out,dir);
  const build=raise=>{const h=G.add(top,G.scale(dir,-raise)),along=f=>G.add(top,G.scale(G.sub(end,top),f)),rel=p=>G.sub(p,h);
    const leg=new G.Surface('leg').append(P.cylinder('oleo',h,along(.7),.065,.06,16)).append(P.cylinder('piston',along(.66),end,.04,.04,14))
      .append(P.cylinder('stub',end,c,.03,.03,10)).append(P.cylinder('scissor',along(.5),G.add(end,[0,0,-.07]),.014,.014,8));
    // leg fairing: the drawn plate, 0.3 m wide (z) face-on in the side view, thin in x
    const cover=P.bar('legCover',G.add(along(.03),G.scale(axle,-.0)),G.add(along(.78),G.scale(axle,-.0)),.3,.04,[1,0,0]);
    const wh=wheel('main',c,out,g.wheelR,g.wheelW,.86);
    return {pivot:h,wheelCentre:c,leg:leg.transform(rel),cover:cover.transform(rel),tyre:wh.tyre.transform(rel),hub:wh.hub.transform(rel)};};
  const pose=(Lg,raise,psi,th,phi)=>{const r=Math.PI/180,sd=[-side*Math.cos(psi*r)*Math.cos(th*r),Math.sin(th*r),Math.sin(psi*r)*Math.cos(th*r)];// inboard
    const up=orth([0,1,0],sd),lat=G.cross(sd,up),hub=G.norm(G.add(G.scale(up,Math.cos(phi*r)),G.scale(lat,Math.sin(phi*r))));
    const rot=frameRotation(dir,axle,sd,hub);return {...Lg,axis:rot.axis,range:[rot.angle,0],raise,psi,th,phi};};
  // feasible stowed poses are ranked by how close the wheel lies to the centre of the well drawn on the underside
  const wellC=[(S.gear.main.slot.wellsX[0]+S.gear.main.slot.wellsX[1])/2,(S.gear.main.slot.wellsZ[0]+S.gear.main.slot.wellsZ[1])/2];
  const score=(Lg,stride)=>{const k=stowedClearance(Lg,undefined,stride);if(k.outside)return 10+k.outside;const c=Math.max(k.below,k.above);if(c>-.006)return 1+c;
    const w=G.add(Lg.pivot,rotAbout(G.sub(Lg.wheelCentre,Lg.pivot),Lg.axis,Lg.range[0]));return Math.hypot(Math.abs(w[0])-wellC[0],w[2]-wellC[1])+.05*c;};
  const lens={};const layout=raise=>lens[raise.toFixed(3)]||(lens[raise.toFixed(3)]=build(raise));
  let best=null;
  for(let raise=0;raise<=.2;raise+=.04)for(let psi=-24;psi<=24;psi+=6)for(let th=-6;th<=12;th+=3)for(let phi=-24;phi<=24;phi+=8){
    const cand=pose(layout(raise),raise,psi,th,phi),sc=score(cand,6);if(!best||sc<best.sc)best={...cand,sc};}
  for(const step of [[.02,3,1.5,4],[.01,1.5,.75,2],[.005,.75,.4,1]])for(let pass=0;pass<4;pass++){
    for(const [i,sgn] of [0,1,2,3].flatMap(i=>[[i,-1],[i,1]])){const v=[best.raise,best.psi,best.th,best.phi];v[i]+=sgn*step[i];if(v[0]<0)continue;
      const cand=pose(layout(v[0]),...v),sc=score(cand,1);if(sc<best.sc)best={...cand,sc};}}
  best.sc=score(best,1);return best;
}
function tailLeg(){
  const g=S.gear.tail,w=g.wheel,top=[0,w[1]+g.wheelR*.7+.1,w[2]+.1],h=[0,w[1]+g.wheelR+.34,w[2]+.34],rel=p=>G.sub(p,h);
  const fork=new G.Surface('fork').append(P.cylinder('tailLeg',h,top,.04,.034,12)).append(P.bar('forkL',G.add(top,[.05,0,0]),G.add(w,[.05,0,0]),.045,.02,[0,0,1])).append(P.bar('forkR',G.add(top,[-.05,0,0]),G.add(w,[-.05,0,0]),.045,.02,[0,0,1]));
  const wh=wheel('tail',w,[1,0,0],g.wheelR,g.wheelW,.55);
  return {pivot:h,leg:fork.transform(rel),tyre:wh.tyre.transform(rel),hub:wh.hub.transform(rel)};
}
const legs={GearLeft:mainLeg(-1),GearRight:mainLeg(1)},tail=tailLeg();
const stowed=Object.fromEntries(Object.entries(legs).map(([k,Lg])=>[k,stowedClearance(Lg)]));
for(const [k,c] of Object.entries(stowed))if(c.outside||c.below>-.004||c.above>-.004)throw Error('retracted '+k+' pokes through the wing skin: '+JSON.stringify(c));
const wells=Object.values(legs).map(Lg=>{const w=G.add(Lg.pivot,rotAbout(G.sub(Lg.wheelCentre,Lg.pivot),Lg.axis,Lg.range[0]));
  return {x:Math.abs(w[0]),z:w[2],r:S.gear.main.wheelR+.02,slot:[Math.abs(Lg.pivot[0]),Lg.pivot[2],Math.abs(w[0]),w[2]]};});
for(const [k,Lg] of Object.entries(legs)){const w=G.add(Lg.pivot,rotAbout(G.sub(Lg.wheelCentre,Lg.pivot),Lg.axis,Lg.range[0]));console.log('stowed wheel centre',k,w.map(v=>+v.toFixed(3)).join(','),'drawn well centre x',wells[0].x.toFixed(3));break;}
for(const [k,Lg] of Object.entries(legs))console.log('stowed',k,'raise',Lg.raise.toFixed(2),'psi',Lg.psi,'theta',Lg.th,'phi',Lg.phi,JSON.stringify(stowed[k],(key,v)=>typeof v==='number'?+v.toFixed(3):v));

// ---------------------------------------------------------------- belly tank, cowling mouth, details
const flat={grey:new G.Surface('detailsGrey'),dark:new G.Surface('detailsDark'),metal:new G.Surface('exhausts'),steel:new G.Surface('fittings'),black:new G.Surface('detailsBlack')};
const box=(c,s)=>P.bar('box',[c[0],c[1],c[2]+s[2]/2],[c[0],c[1],c[2]-s[2]/2],s[0],s[1]);
const tankSm=S.tank.profile.map(([z,r],i,a)=>[z,Math.max(.004,a.slice(Math.max(0,i-1),i+2).reduce((s,p)=>s+p[1],0)/a.slice(Math.max(0,i-1),i+2).length)]);
const tz1=tankSm[tankSm.length-1][0],tr=tankSm[tankSm.length-1][1];
const tank=P.lathe('dropTank',[[tankSm[0][0]-.05,0],...tankSm,[tz1+.05,tr*.82],[tz1+.1,tr*.5],[tz1+.125,0]],{axis:'z',origin:[0,S.tank.y,0],ring:20});
tank.append(P.bar('tankPylon',[0,S.tank.y+S.tank.radius-.07,1.3],[0,S.tank.y+S.tank.radius-.07,2.3],.3,.26));
{// oil cooler fairing under the cowling rear (side view bump), width assumed
  const cx=3.03,bot=ff.bottom(cx);flat.grey.append(P.blister('oilCooler',[0,bot+.04,cx],.2,.11,.27,20,8).transform(p=>[p[0],2*(bot+.04)-p[1],p[2]]).orient(0,p=>[p[0],p[1]-(bot+.04),p[2]-cx]));}
{// cowling mouth: lip ring, engine face (crankcase + 14 cylinder heads in two rows), all in front of the cowling's flat face
  const zf=S.cowl.zFront,rc=Math.min(ff.half(zf),ff.top(zf))*.97;
  flat.black.append(P.lathe('cowlLip',[[0,rc*.93],[.03,rc*1.0],[.075,rc*.99],[.09,rc*.9],[.07,rc*.78],[.03,rc*.76],[.0,rc*.77]],{axis:'z',origin:[0,ff.wide(zf)*.0,zf-.0],ring:48}));
  flat.dark.append(P.cylinder('engineFace',[0,0,zf+.012],[0,0,zf-.01],rc*.8,rc*.8,40));
  for(let row=0;row<2;row++)for(let k=0;k<7;k++){const a=(k+row*.5)*2*Math.PI/7,r=rc*(.46+row*.17);
    flat.metal.append(P.cylinder('cyl',[Math.sin(a)*r,Math.cos(a)*r,zf+.012],[Math.sin(a)*r,Math.cos(a)*r,zf+.09-row*.02],.07,.055,10));}
  flat.metal.append(P.cylinder('crank',[0,0,zf+.012],[0,0,zf+.12],rc*.3,rc*.22,20));}
for(const sgn of [-1,1]){// exhaust pipe on the lower fuselage side
  const e=D.exhaust,z0=Math.min(e.z[0],S.cowl.zRear+.01),half=ff.half((z0+e.z[1])/2),y=e.y;
  flat.metal.append(P.bar('exhaust',[sgn*(half-.01),y,z0],[sgn*(half+.035),y-.01,e.z[1]],.06,.09,[0,1,0]));}
for(const m of S.muzzles.filter(m=>/Cannon/.test(m.name))){const sgn=Math.sign(m.p[0]);flat.steel.append(P.cylinder('barrel',[m.p[0],m.p[1],m.p[2]-.13],[m.p[0],m.p[1],m.p[2]],.032,.026,10));}
flat.grey.append(P.bar('mast',D.mast.from,D.mast.to,.018,.06,[0,0,1]));
flat.steel.append(P.cylinder('pitot',D.pitot.from,D.pitot.to,.014,.009,8));
{// pilot and cockpit furniture. The outer skin is the deck, so everything sits on it; the hood is only ~0.34 m above the deck here
  const sill=cf.base(hoodZ),zh=hoodZ,leather=new G.Surface('pilot');
  leather.append(P.bar('torso',[0,sill+.02,zh+.02],[0,sill+.25,zh-.02],.36,.2,[0,0,1]));
  flat.pilot=leather;flat.pilotHead=new G.Surface('pilotHead').append(P.lathe('head',[[-.1,0],[-.095,.04],[-.075,.08],[-.03,.098],[.03,.098],[.075,.08],[.095,.04],[.1,0]],{axis:'z',origin:[0,0,0],ring:16}).transform(p=>[p[0],p[2]+sill+.22,p[1]*.95+zh+.02]));
  flat.cockpit=new G.Surface('cockpit');flat.panel=new G.Surface('panel');
  flat.cockpit.append(P.bar('seatBack',[0,sill+.0,zh-.14],[0,sill+.29,zh-.18],.4,.035))
    .append(P.bar('armour',[0,sill+.1,zh-.3],[0,sill+.3,zh-.32],.3,.03))
    .append(P.bar('headrest',[0,sill+.24,zh-.25],[0,sill+.31,zh-.26],.2,.05))
    .append(P.cylinder('stick',[0,sill+.0,zh+.5],[0,sill+.19,zh+.56],.014,.011,8))
    .append(P.bar('stickGrip',[0,sill+.19,zh+.56],[0,sill+.24,zh+.57],.03,.045))
    .append(P.bar('sideConsoleL',[.3,sill+.02,zh+.1],[.3,sill+.08,zh+.7],.07,.07))
    .append(P.bar('sideConsoleR',[-.3,sill+.02,zh+.1],[-.3,sill+.08,zh+.7],.07,.07));
  flat.panel.append(P.bar('panelBoard',[0,sill+.0,zh+.74],[0,sill+.2,zh+.78],.62,.025))
    .append(P.bar('compass',[0,sill+.2,zh+.79],[0,sill+.24,zh+.8],.09,.05))
    .append(P.bar('gunsight',[0,sill+.07,zh+.9],[0,sill+.16,zh+.88],.1,.09));}

// ---------------------------------------------------------------- paint
const C=Object.fromEntries(Object.entries(L.colours).filter(([,v])=>v).map(([k,v])=>[k,v.slice()]));
C.base=[142,146,148];C.baseDark=[118,122,125];C.deck=[34,36,34];C.black=[18,18,20];C.cowl=[24,26,30];C.metal=[118,122,124];C.soot=[34,30,26];C.oil=[58,48,34];C.well=[56,58,56];C.fabric=[156,159,160];
C.red=[176,40,46];C.blue=[48,104,166];C.yellow=[226,188,60];C.spinner=[192,194,198];
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const clamp=G.clamp,smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const segDist=(p,a,b)=>{const ab=[b[0]-a[0],b[1]-a[1]],t=clamp(((p[0]-a[0])*ab[0]+(p[1]-a[1])*ab[1])/(ab[0]**2+ab[1]**2),0,1);return Math.hypot(p[0]-a[0]-t*ab[0],p[1]-a[1]-t*ab[1]);};
const band=L.band,codeG=Paint.glyph(L.code.text,'bold 190px DejaVu Sans');
const hS=L.hinomaruSide,hW=L.hinomaruWing,cowlRear=S.cowl.zRear,cowlFront=S.cowl.zFront;
const INK=[24,26,28],GW=S.gear.main.slot;
// A drawn line is a ~5 mm groove with a soft edge; long lines (> 0.4 m: seams, flap and hatch outlines) get a rivet row
// 9 mm to each side, a rivet every 28 mm.
const stroke=d=>d<.0042?1:d<.0078?1-(d-.0042)/.0036:0;
function drawnLines(F,u,v,col,amount=.8){
  const d=F[0].dist(u,v),c=stroke(d);let h=0;
  if(c>0){col=mix(col,INK,amount*c);h=-c;}
  else{const dl=F[1].dist(u,v);
    if(dl>.0085&&dl<.0145){const g=F[1].grad(u,v),a=u*-g[1]+v*g[0],pitch=.028,fa=((a%pitch)+pitch)%pitch;
      if(Math.hypot(Math.min(fa,pitch-fa),dl-.0112)<.0038){h=1.6;col=mix(col,INK,.1);}}}
  return {col,h};
}
function fieldsAt(tag,p,n){const [x,y,z]=p;
  if(tag==='fin')return n[0]>0?[FS.sideP,z,y]:[FS.sideS,z,y];
  if(tag==='fuselage'){if(n[1]>.55)return [FS.top,x,z];if(n[1]<-.45)return [FS.under,x,z];return n[0]>0?[FS.sideP,z,y]:[FS.sideS,z,y];}
  return n[1]>0?[FS.top,x,z]:[FS.under,x,z];}
// the drawn wheel well (x 0.062..0.673, z 2.098..2.793) and the leg slot out to x 1.845 on the wing underside
const wellIn=(ax,z)=>{const a=(GW.wellsX[1]-GW.wellsX[0])/2,b=(GW.wellsZ[1]-GW.wellsZ[0])/2,dx=(ax-(GW.wellsX[0]+GW.wellsX[1])/2)/a,dz=(z-(GW.wellsZ[0]+GW.wellsZ[1])/2)/b;return Math.pow(Math.abs(dx),3)+Math.pow(Math.abs(dz),3);};
const slotIn=(ax,z)=>ax>GW.wellsX[1]-.05&&ax<GW.outerX+.04?Math.abs(z-GW.z):9,WC=[(GW.wellsX[0]+GW.wellsX[1])/2,(GW.wellsZ[0]+GW.wellsZ[1])/2];
function paint(p,n,tag){
  const [x,y,z]=p;let col=C.base,h=0,rough=.74,metal=0,ink=.8;const side=Math.abs(n[0])>.3,up=n[1]>.55,down=n[1]<-.45;
  if(tag==='spinner'){const t=clamp((z-pz+.1)/.5,0,1);return {rgb:mix(C.spinner,C.baseDark,.2*(1-t)),h:0,rough:.32,metal:.45};}
  const wear=Paint.fbm(x*7,y*7,z*7,5,4),fine=Paint.fbm(x*40,y*40,z*40,7,2),streak=Paint.fbm(x*3,y*3,z*14,9,3);
  const [F,fu,fv]=fieldsAt(tag,p,n);let lines=true;
  if(tag==='fuselage'){
    const hr=clamp((ff.top(z)-y)/(ff.top(z)-ff.bottom(z)),0,1);
    if(z>cowlRear-.02){// the Sakae cowling: blue-black, glossy, rubbed bright along the lip and where hands and rags work
      lines=false;col=C.cowl;rough=.42;metal=.12;
      if(z<cowlRear+.015)col=mix(col,C.base,.5);
      const lip=smooth(cowlFront-.12,cowlFront,z);col=mix(col,[78,80,82],.4*lip*(.5+.5*fine));rough=.42-.12*lip;metal=.12+.3*lip;
      if(down&&z>cowlRear+.1&&z<cowlRear+.5){const o=.55*smooth(.3,.8,Paint.fbm(x*9,z*30,1,3,3));col=mix(col,C.oil,o);rough=rough+(.3-rough)*o;}// oil film under the cowling
      if(Paint.fbm(x*11,y*11,z*11,19,3)>.78&&z>cowlRear+.05){col=mix(col,C.metal,.4);rough=.34;metal=.35;}// worn through to the aluminium
      col=col.map(v=>v*(.92+.1*fine));
    }else{
      col=C.base;if(down)col=mix(C.base,C.baseDark,.28);
      const bz=band.zAtAxis+band.slopeDzDy*y;if(Math.abs(z-bz)<band.zWidth/2&&Math.abs(y)<.7)col=C.blue;
      if(Math.abs(z-bz)<band.zWidth/2+.004&&Math.abs(z-bz)>=band.zWidth/2)col=mix(col,C.baseDark,.25);
      if(side){const d=Math.hypot(z-hS.z,y-hS.y);if(d<hS.r){col=C.red;ink=.3;}else if(d<hS.r+.006)col=mix(C.base,C.red,.35);}
      // exhaust soot: fan-shaped streaks behind the pipe on both sides
      const e=D.exhaust,dz=e.z[1]-z;if(side&&dz>-.04&&dz<2.2){const spread=.05+.05*dz,bandv=Math.exp(-((y-e.y+.035*dz)**2)/(2*spread*spread)),a=clamp(bandv*(1-dz/2.2)*.78*(.6+.6*streak),0,.85);col=mix(col,C.soot,a);rough=rough+(.95-rough)*a;}
      // oil weeping from the cowl rear, along the lower side
      if(side&&dz<-.02&&dz>-.9&&y<e.y-.18){const o=.34*smooth(-.9,-.2,dz)*(.5+streak);col=mix(col,C.oil,o);rough=rough+(.32-rough)*o;}
      // gun gas on the top of the nose behind the 7.7 mm muzzles
      if(up&&z>2.1&&z<cowlRear&&Math.abs(Math.abs(x)-.32)<.1)col=mix(col,C.soot,.5*smooth(2.1,cowlRear-.1,z)*(.6+.4*streak));
      // the dark gun troughs between cowling and windscreen
      if(up&&z>2.35&&z<cowlRear&&Math.abs(Math.abs(x)-.32)<.028)col=mix(col,C.black,.65);
      // the cockpit deck seen through the hood: dark, not airframe grey
      if(up&&z>cz0&&z<cz1&&Math.abs(x)<cf.half(z)*.96){col=mix(C.deck,[18,19,20],.4*smooth(.4,1,Math.abs(x)/cf.half(z)));rough=.8;lines=false;}
      col=col.map(v=>v*(up?1.02+.025*wear:down?.94+.03*wear:.985+.02*wear));
      {const edge=Math.min(F[0].dist(fu,fv)/.05,1),chip=Paint.fbm(x*48,y*48,z*48,53,3);// paint knocked off along seams, hatches and the foot-worn lower edge
        const m=smooth(.66,.72,chip)*(1-edge)*.9+smooth(.7,.76,chip)*(down||hr<.08?1:0)*.6;if(m>0){col=mix(col,C.metal,.55*Math.min(m,1));rough=rough+(.4-rough)*Math.min(m,1);metal=.3*Math.min(m,1);}}
      if(Math.abs(z-1.2)<.9&&Math.abs(y-.1)<.4&&Paint.fbm(x*22,y*22,z*22,57,3)>.62){col=mix(col,C.metal,.4);rough=.45;}// the pilot's footing at the wing root
            if(Paint.noise(x*30,y*30,z*30,41)>.86)col=col.map(v=>v*.97);
    }
    if(lines){const r=drawnLines(F,fu,fv,col,ink);col=r.col;h=r.h;}
  }else if(tag==='wing'||tag==='stab'){
    const ax=Math.abs(x),upper=n[1]>0;col=upper?C.base:mix(C.base,C.baseDark,.25);
    if(tag==='wing'){const sc0=clamp(ax,ws[0].s,ws[ws.length-1].s),le=wing.f.le(sc0),te=wing.f.te(sc0),cfrac=(le-z)/(le-te);
      const ac=S.wing.controls.find(c=>c.drive==='roll');
      const d=Math.hypot(ax-hW.s,z-hW.z);if(d<hW.r){col=C.red;ink=.3;}else if(d<hW.r+.007)col=mix(col,C.red,.3);
      if(upper&&ax<1.3&&z<2.4&&z>.5){const m=smooth(.7,.76,Paint.fbm(x*26,y*26,z*26,59,3));col=mix(col,C.metal,.45*m);rough=rough+(.4-rough)*m;metal=.3*m;}// worn paint by the cockpit
      if(upper&&ax>1.8&&ax<2.0&&cfrac<.05)col=mix(col,C.black,.4);// cannon blast streak at the muzzle
      if(upper&&ax>1.7&&ax<2.1&&cfrac>0&&cfrac<.45)col=mix(col,C.soot,.2*streak*smooth(.45,.05,cfrac));
      if(cfrac<.03&&Paint.fbm(x*34,y*34,z*34,29,3)>.66){col=mix(col,C.metal,.6);rough=.4;metal=.3;}// leading-edge chipping
      if(!upper){const wi=wellIn(ax,z),sl=slotIn(ax,z);
        if(wi<1){// the open well with the stowed wheel's face (tyre, rim, hub) seen from below
          const dw=Math.hypot(ax-WC[0],z-WC[1]);col=mix(C.well,[30,32,30],.5*Paint.fbm(x*20,y*20,z*20,43,3));h=-1;rough=.9;lines=false;
          if(dw<.31){col=dw<.07?[132,134,132]:dw<.17?[88,90,88]:[34,35,34];h=dw<.17?-.4:-.2;}}
        else if(wi<1.12)col=mix(col,C.black,.35);
        if(sl<.16&&wi>=1){col=mix(col,[94,98,98],.45);if(sl<.04){col=[44,46,46];h=-1;rough=.9;}lines=lines&&sl>.04;}}
      if(cfrac>ac.h+.003&&ax>ac.from&&ax<ac.to){// fabric-covered aileron: duller, with a raised rib every 0.22 m
        col=mix(col,C.fabric,.45);rough=.92;const rib=(((ax-ac.from)/.22)%1+1)%1;if(rib<.035||rib>.965){h=Math.max(h,1.2);col=mix(col,C.baseDark,.25);}}
    }else{
      const tc=S.stabiliser.controls[0];
      if(z<tc.hz){col=mix(col,C.fabric,.45);rough=.92;const rib=(((ax)/.2)%1+1)%1;if(rib<.04||rib>.96){h=Math.max(h,1.2);col=mix(col,C.baseDark,.25);}}// fabric elevator: ribs every 0.2 m
    }
    col=col.map(v=>v*(upper?1.02+.025*wear:.94+.03*wear));
    if(Paint.noise(x*30,y*30,z*30,41)>.82)col=col.map(v=>v*.96);
    if(lines){const hh=h,r=drawnLines(F,fu,fv,col,ink);col=r.col;h=r.h?r.h:hh;}
  }else if(tag==='fin'){
    col=mix(C.base,C.baseDark,.02);
    if(z<rud.hingeZ){col=mix(col,C.fabric,.45);rough=.92;const rib=(((y-rud.from)/.24)%1+1)%1;if(rib<.04||rib>.96){h=Math.max(h,1.2);col=mix(col,C.baseDark,.25);}}// fabric rudder, ribs every 0.24 m
    if(side){const u=(L.code.z[0]-z)/(L.code.z[0]-L.code.z[1]),v=(L.code.y[1]-y)/(L.code.y[1]-L.code.y[0]);
      const uu=x>0?u:1-u;if(uu>=0&&uu<=1&&v>=0&&v<=1&&codeG.sample(uu,v)>.5){col=C.black;ink=.15;}}
    col=col.map(v=>v*(.985+.03*wear));
    const hh=h,r=drawnLines(F,fu,fv,col,ink);col=r.col;h=r.h?r.h:hh;
  }
  return {rgb:col.map(c=>c*(1-.05*Paint.fbm(x*2,y*2,z*2,31,2))),h,rough,metal};
}
const items=[{surface:fuse.surface,tag:'fuselage'},{surface:wing.surface,tag:'wing'},{surface:stab.surface,tag:'stab'},{surface:fin.surface,tag:'fin'},
  ...wing.parts.map(q=>({surface:q.surface,tag:'wing',offset:q.pivot})),...stab.parts.map(q=>({surface:q.surface,tag:'stab',offset:q.pivot})),...fin.parts.map(q=>({surface:q.surface,tag:'fin',offset:q.pivot})),
  {surface:spinner,tag:'spinner',offset:[0,0,pz]}];
const bakeItems=items.map(it=>{const s=it.offset?new G.Surface(it.surface.name).append(it.surface).transform(p=>G.add(p,it.offset)):it.surface;return {surface:s,normals:s.normals(),tag:it.tag};});
console.log('baking paint atlas '+SIZE+'px');
const baked=Paint.bake(bakeItems,SIZE,paint);
fs.mkdirSync(outDir,{recursive:true});
const albedoPng=Paint.toPng(baked),normalPngBytes=Paint.normalPng(baked,1.6,2048),mrPngBytes=Paint.roughnessPng(baked);

// ---------------------------------------------------------------- GLB (rig contract v1)
const w=new GlbWriter({generator:'Torpedo-Bomber build-own-a6m2.cjs',extras:{
  title:'Mitsubishi A6M2 Model 21 Zero-Sen, V-103 Tainan Kokutai (own build from the reference PDF)',author:'Torpedo-Bomber project (code-built, scripts/build-own-a6m2.cjs)',
  license:'project-own; geometry measured on a drawing that is (c) Profile Publications 1966 / P. Endsleigh Castle and not licensed for redistribution: only measurements are used',
  source:'scripts/build-own-a6m2.cjs',references:S.references.filter(r=>r.author).map(r=>({title:r.title,author:r.author,license:r.license})),
  processing:'No third-party mesh or texture. Station table measured on the drawing (scripts/own-aircraft/measure-a6m2.mjs), lofted and painted procedurally; silhouette gate and rig contract v1 passed at release.'}});
const tAlb=w.image(albedoPng),tNrm=w.image(normalPngBytes),tMr=w.image(mrPngBytes);
const lin=v=>Math.pow(v/255,2.2),rgb=(c,a=1)=>[lin(c[0]),lin(c[1]),lin(c[2]),a];
const mat=(name,c,m=0,r=.78,extra={})=>w.material({name,pbrMetallicRoughness:{baseColorFactor:c,metallicFactor:m,roughnessFactor:r},...extra});
const M={
  paint:w.material({name:'A6M2 V-103 finish',pbrMetallicRoughness:{baseColorTexture:{index:tAlb},metallicRoughnessTexture:{index:tMr},metallicFactor:1,roughnessFactor:1},normalTexture:{index:tNrm,scale:.8}}),
  glass:mat('Canopy glass',[.2,.26,.29,.2],0,.04,{alphaMode:'BLEND',doubleSided:true}),
  frame:mat('Canopy frames',rgb([112,118,114]),0,.6),
  grey:mat('Fittings',rgb(C.base)),
  black:mat('Cowl lip',rgb(C.cowl),.1,.55),
  exhaust:mat('Exhaust and engine metal',rgb([84,76,66]),.5,.55),
  steel:mat('Steel',[.45,.46,.45,1],.8,.35),
  gear:mat('Gear',rgb([138,140,136]),.2,.55),
  tyre:mat('Tyre rubber',[.018,.018,.018,1],0,.92),
  prop:mat('Propeller blades',rgb([84,78,70]),.4,.45),
  tipRed:mat('Prop tip red',rgb(C.red),.1,.5),
  tipYellow:mat('Prop tip yellow',rgb(C.yellow),.1,.5),
  cockpit:mat('Cockpit interior',rgb([66,74,66]),0,.8),
  tank:mat('Drop tank',rgb([172,176,180]),.35,.5),
  pilot:mat('Pilot flight suit',rgb([64,66,52]),0,.85),
  helmet:mat('Pilot helmet',rgb([112,88,62]),0,.7),
};
const meshOf=(name,s,m,textured)=>{s.clean();const normals=s.normals();return w.mesh(name,{positions:s.p,normals:Array.from(normals),uvs:textured?s.uv:undefined,tangents:textured?Array.from(s.tangents(normals)):undefined,indices:s.i,material:m});};
let tris=0;const count=s=>{tris+=s.triangles();return s;};
const id=measured?'a6m2-own-1':'a6m2-unmeasured';
const top=w.node({name:'A6M2_Own',extras:{rigContract:1,class:'tailwheel-fighter',nativeAircraft:id,kind:'zero',
  title:'Mitsubishi A6M2 Model 21 Zero-Sen, V-103 Tainan Kokutai (own build from the reference PDF)',author:'Torpedo-Bomber project (code-built, scripts/build-own-a6m2.cjs)',license:'project-own',
  source:'scripts/build-own-a6m2.cjs + '+path.relative(ROOT,shapeFile),
  provenance:'Independent geometry lofted from the station table measured on the five-view drawing in the owner-supplied PDF (Profile Publications 129); finish positions and colours measured on the same drawing, paint, rivets and wear drawn procedurally. No third-party 3D model used.',
  references:S.references,dimensions:{span:S.facts.span,length:S.facts.length,height:S.facts.height},livery:L.title,assumed:ASSUMED,
  specification:{source:'PDF page 14, A6M2 (Model 21) column',wingAreaM2:22.44,emptyKg:1680,loadedKg:2410,maxKg:2796,wingLoadingKgM2:107.4,powerLoadingKgHp:2.51,fuelInternalL:518,dropTankL:330,
    engine:'Sakae 12, 940 hp take-off, 950 hp at 4,200 m (13,780 ft)',maxSpeed:'288 kt at 4,550 m (14,930 ft) = 533 km/h',cruiseKt:180,climb:'6,000 m in 7 min 27 s',serviceCeilingM:10000,
    rangeNm:{normal:1010,maximum:1675},armament:'2 x 7.7 mm Type 97, 2 x 20 mm Type 99 Mk 1 Mark 3, 2 x 60 kg bombs'},
  shapeSha256:crypto.createHash('sha256').update(fs.readFileSync(shapeFile)).digest('hex')}});
const airframe=new G.Surface('airframe').append(fuse.surface).append(wing.surface).append(stab.surface).append(fin.surface);
w.node({name:'Airframe',mesh:meshOf('airframe',count(airframe),M.paint,true)},top);
w.node({name:'DetailsGrey',mesh:meshOf('detailsGrey',count(flat.grey),M.grey)},top);
w.node({name:'EngineFace',mesh:meshOf('engineFace',count(flat.dark),M.black)},top);
w.node({name:'CowlLip',mesh:meshOf('cowlLip',count(flat.black),M.black)},top);
w.node({name:'Exhausts',mesh:meshOf('exhausts',count(flat.metal),M.exhaust)},top);
w.node({name:'Pitot',mesh:meshOf('pitot',count(flat.steel),M.steel)},top);
w.node({name:'Pilot',mesh:meshOf('pilot',count(flat.pilot),M.pilot)},top);
w.node({name:'PilotHead',mesh:meshOf('pilotHead',count(flat.pilotHead),M.helmet)},top);
w.node({name:'Cockpit',mesh:meshOf('cockpit',count(flat.cockpit),M.cockpit)},top);
w.node({name:'CockpitPanel',mesh:meshOf('cockpitPanel',count(flat.panel),M.black)},top);
w.node({name:'DropTank',mesh:meshOf('dropTank',count(tank),M.tank)},top);
w.node({name:'CanopyFixedGlass',mesh:meshOf('canopyFixedGlass',count(glassFixed),M.glass)},top);
w.node({name:'CanopyFixedFrames',mesh:meshOf('canopyFixedFrames',count(framesFixed),M.frame)},top);
w.node({name:'CanopyGlass',mesh:meshOf('canopyGlass',count(glassHood),M.glass)},top);
w.node({name:'CanopyFrames',mesh:meshOf('canopyFrames',count(framesHood),M.frame)},top);
const rotor=w.node({name:'Propeller',translation:[0,0,pz],extras:{rig:{drive:'prop',axis:[0,0,1],blades:3}}},top);
w.node({name:'Spinner',mesh:meshOf('spinner',count(spinner),M.paint,true)},rotor);
w.node({name:'Blades',mesh:meshOf('blades',count(blades),M.prop)},rotor);
w.node({name:'BladeTipRed',mesh:meshOf('bladeTipRed',count(bladeParts.red),M.tipRed)},rotor);
w.node({name:'BladeTipYellow',mesh:meshOf('bladeTipYellow',count(bladeParts.yellow),M.tipYellow)},rotor);
const gear=w.node({name:'gear'},top);
for(const [name,Lg] of Object.entries(legs)){
  const n=w.node({name,translation:Lg.pivot,extras:{rig:{drive:'gear',axis:Lg.axis,range:Lg.range}}},gear);
  w.node({name:name+'Leg',mesh:meshOf(name+'Leg',count(Lg.leg.append(Lg.hub)),M.gear)},n);
  w.node({name:name+'Cover',mesh:meshOf(name+'Cover',count(Lg.cover),M.grey)},n);
  w.node({name:name+'Tyre',mesh:meshOf(name+'Tyre',count(Lg.tyre),M.tyre),extras:{groundWheel:true}},n);
}
const tg=w.node({name:'TailGear',translation:tail.pivot,extras:{rig:{drive:'gear',axis:[1,0,0],range:[-1.45,0]}}},gear);
w.node({name:'TailGearLeg',mesh:meshOf('tailLeg',count(tail.leg.append(tail.hub)),M.gear)},tg);
w.node({name:'TailGearTyre',mesh:meshOf('tailTyre',count(tail.tyre),M.tyre),extras:{groundWheel:true}},tg);
const flaps=w.node({name:'flightFlaps'},top);
const control=(q,parent)=>{const c=q.ctl,rig=c.drive==='flap'?{drive:q.side<0?'flapLeft':'flapRight',axis:q.axis,range:c.range}:{drive:c.drive,axis:q.axis,gain:c.drive==='roll'?(q.side<0?1:-1)*Math.abs(c.gain):c.gain};
  w.node({name:q.name,translation:q.pivot,extras:{rig},mesh:meshOf(q.name,count(q.surface),M.paint,true)},parent);};
for(const q of wing.parts)control(q,q.ctl.drive==='flap'?flaps:top);
for(const q of [...stab.parts,...fin.parts])control(q,top);
for(const m of S.muzzles)w.node({name:m.name,translation:m.p},top);
const gateReport={};
const bytes=w.glb(),file=path.join(outDir,measured?'a6m2-own.glb':'a6m2-unmeasured.glb');
if(refDir){
  const {runGate}=await import('./silhouette-gate.mjs');
  for(const [name,refFile] of [['rest','reference.json'],['gearDown','reference-geardown.json']]){
    let refPath=path.join(refDir,refFile),shift=0;
    if(name==='gearDown'){// the starboard drawing is a second drawing of the same aircraft: register its vertical zero to the model within +-4 px (best IoU)
      let best=null;const ref0=JSON.parse(fs.readFileSync(refPath,'utf8'));
      for(let dv=-4;dv<=4;dv++){const r=JSON.parse(JSON.stringify(ref0));r.views.side.calibration.v=r.views.side.calibration.v.map(([p,m])=>[p+dv,m]);
        const tmp=path.join(refDir,'reference-geardown-fit.json');fs.writeFileSync(tmp,JSON.stringify(r));const g=await runGate(bytes,tmp);if(!best||g.views.side.iou>best.iou)best={iou:g.views.side.iou,dv,tmp};}
      shift=best.dv;const r=JSON.parse(JSON.stringify(ref0));r.views.side.calibration.v=r.views.side.calibration.v.map(([p,m])=>[p+shift,m]);refPath=path.join(refDir,'reference-geardown-fit.json');fs.writeFileSync(refPath,JSON.stringify(r));
      console.log('gear-down view registered with a vertical offset of '+shift+' px');
    }
    const gate=await runGate(bytes,refPath,path.join(release?path.join(ROOT,'build/own-a6m2'):outDir,'gate-'+name));// overlays contain the drawing's silhouette: never into assets/
    gateReport[name]={shiftPx:shift,views:Object.fromEntries(Object.entries(gate.views).map(([v,r])=>[v,{iou:+r.iou.toFixed(4),iouStrict:+r.iouStrict.toFixed(4),p95Cm:+(r.p95M*100).toFixed(1),p95Percent:+(r.p95Fraction*100).toFixed(2),maxCm:+(r.maxM*100).toFixed(1),passed:r.passed}]))};
    for(const [view,r] of Object.entries(gate.views))console.log(`gate ${name}/${view} IoU ${r.iou.toFixed(4)} (strict ${r.iouStrict.toFixed(4)}) P95 ${(r.p95M*100).toFixed(1)} cm (${(r.p95Fraction*100).toFixed(2)} %) max ${(r.maxM*100).toFixed(1)} cm ${r.passed?'PASS':'FAIL'}`);
    if(release&&name==='rest'&&!gate.passed)throw Error('--release refused: silhouette gate failed ('+name+')');
    if(release&&name==='gearDown'&&(gate.views.side.iou<.94||gate.views.side.p95Fraction>.012))throw Error('--release refused: gear-down outline fails ('+JSON.stringify(gateReport[name])+')');
  }
}
fs.writeFileSync(file,bytes);
if(!release){fs.writeFileSync(path.join(outDir,'a6m2-paint-albedo.png'),albedoPng);fs.writeFileSync(path.join(outDir,'a6m2-paint-normal.png'),normalPngBytes);}
console.log(JSON.stringify({file:path.relative(ROOT,file),bytes:bytes.length,triangles:tris,status:S.status,gearUp:Object.fromEntries(Object.entries(legs).map(([k,l])=>[k,{axis:l.axis.map(v=>+v.toFixed(3)),angle:+l.range[0].toFixed(3),insideSkin:{lower:+(-stowed[k].below).toFixed(3),upper:+(-stowed[k].above).toFixed(3)}}]))}));
})().catch(e=>{console.error(e.stack||e.message||e);process.exitCode=1;});

