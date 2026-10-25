#!/usr/bin/env node
// Measures the Bf 109 F-2 station table on the calibrated three-view in
// app/model-candidates/references/bf109f2 (PDF Abb. 16). Every shape value below comes from the
// drawing's pixels through reference.json's calibration; the only constants are pixel ranges that
// say which part of the drawing a feature is read from (listed in FEATURES with their meaning).
// Output: app/model-candidates/references/bf109f2/shape.json (status MEASURED).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {referenceMask,mapping} from '../silhouette-gate.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const DIR=path.join(ROOT,'app/model-candidates/references/bf109f2'),REF=JSON.parse(fs.readFileSync(path.join(DIR,'reference.json'),'utf8'));
const round=(v,d=3)=>+v.toFixed(d);

// Pixel ranges read off the drawing (crop coordinates of side.png / top.png / front.png).
const FEATURES={
  side:{cowlFront:33,windscreen:150,canopyTop:[150,219],canopyRear:222,canopyFrameRows:[41,57],rearGlazingCols:[209,220],frontGlazingRows:[51,58],frontGlazingCols:[156,168],cowlLineRow:50,windscreenSlantCols:[155,163],spineFit:[300,378],finFront:378,rudderHinge:428,
    sillRow:59.5,coolerCols:[74,106],wingRootCols:[106,226],tailWheelCols:[404,424],spinner:[7,33],wheel:{centre:[112,147.5],radius:17.5},
    legRows:[112,130],rudderHornRow:20,legSearchCols:[108,136],tailWheel:{centre:[413,88],radius:7},tailLegTop:[405,78],radiator:{cols:[160,215],bottomRow:111},cooler:{cols:[74,106],bottomRow:111},
    exhaust:{cols:[45,100],row:91},panelCols:[40,400],scoop:{cols:[98,126],rows:[70,82]},mast:{col:220,rows:[14,38]}},
  top:{centre:271.5,cowlRows:[24,92],wingBand:[108,218],stabRows:[388,446],rearRows:[219,387],tailEndRow:441,fuselageEdgeSearch:[17,27],
    elevatorHingeRow:421,fuselageLineSearch:[21,25],fuselageLineRows:[120,140,160,182],canopyLineSearch:[12,16],scoopOuterRows:[98,106],scoopSearchCols:[236,250],leBlockedCols:[[220,238],[305,323],[238,256]],stackRows:[48,90],cowlLineSearch:[19,21],mgTroughCols:[263,279],mgMuzzleRow:60,pitot:{col:33,rows:[98,118]},
    controls:{aileron:[35,120],flap:[120,245]}},
  livery:{chevron:{apexCols:[362,400],apexRows:[120,152],endCols:[400,426],upperRows:[100,125],lowerRows:[150,167]},triangle:{rows:[118,152],baseCol:422},
    tally:{rows:[[35,42],[46,53],[56,63],[67,74],[77,84]],cols:[706,785]},octane:[345,140,375,165],mottle:{region:[450,95,700,160],bands:8}},
  front:{centre:274.5,stabRow:42.5,finCols:[272,277],finThickRows:[8,39],stabThickRows:[36,52],stabThickMaxPx:6,wheelCols:[[225,242],[306,323]],wheelBottomRow:166,legTop:[[246,110],[300,110]],
    radiatorCols:[[184,250],[299,365]],radiatorSearch:[[180,248],[301,369]],radiatorSearchRows:[94,114],coolerCols:[262,287],bladeRows:[110,156],canopyRoofRow:47}
};

async function view(name){
  const spec=REF.views[name],im=await loadImage(fs.readFileSync(path.join(DIR,spec.file))),c=createCanvas(im.width,im.height),x=c.getContext('2d');
  x.fillStyle='#fff';x.fillRect(0,0,im.width,im.height);x.drawImage(im,0,0);
  const data=x.getImageData(0,0,im.width,im.height),mask=referenceMask(data,spec),map=mapping(spec.calibration);
  const lum=new Float32Array(im.width*im.height);for(let i=0;i<lum.length;i++)lum[i]=.299*data.data[i*4]+.587*data.data[i*4+1]+.114*data.data[i*4+2];
  return {w:im.width,h:im.height,mask,lum,map,
    u:px=>(px-map.bu)/map.au,v:py=>(py-map.bv)/map.av,px:m=>m*map.au+map.bu,py:m=>m*map.av+map.bv,
    col(x){const r=[];let s=null;for(let y=0;y<im.height;y++){const on=mask[y*im.width+x];if(on&&s===null)s=y;if(!on&&s!==null){r.push([s,y-1]);s=null;}}if(s!==null)r.push([s,im.height-1]);return r;},
    row(y){const r=[];let s=null;for(let x=0;x<im.width;x++){const on=mask[y*im.width+x];if(on&&s===null)s=x;if(!on&&s!==null){r.push([s,x-1]);s=null;}}if(s!==null)r.push([s,im.width-1]);return r;}};
}
const lerp=(a,b,t)=>a+(b-a)*t;
const interp=(pts,x)=>{pts=[...pts].sort((a,b)=>a[0]-b[0]);if(x<=pts[0][0])return pts[0][1];for(let k=0;k<pts.length-1;k++)if(x<=pts[k+1][0])return lerp(pts[k][1],pts[k+1][1],(x-pts[k][0])/(pts[k+1][0]-pts[k][0]));return pts[pts.length-1][1];};
// fractional edge: the mask boundary sits half a pixel outside the last inside pixel
const topEdge=(runs)=>runs[0][0]-.5,bottomEdge=(runs)=>runs[runs.length-1][1]+.5;

const side=await view('side'),top=await view('top'),front=await view('front'),F=FEATURES;
const frameRuns=(()=>{const [r0,r1]=F.side.canopyFrameRows,n=r1-r0+1,runs=[];let run=null;
  for(let x=F.side.canopyTop[0];x<=F.side.canopyRear;x++){let k=0;for(let y=r0;y<=r1;y++)if(side.lum[y*side.w+x]<200)k++;
    if(k>=.85*n){if(run&&x-run[1]<=2)run[1]=x;else{run=[x,x];runs.push(run);}}}return runs;})();
// The windscreen's side glass ends on a diagonal too: from the cowling line at the front frame down to
// the sill at the hood's front frame (fitted through the darkest pixel of each row in frontGlazingRows).
const frontDiag=(()=>{const [r0,r1]=F.side.frontGlazingRows,[c0,c1]=F.side.frontGlazingCols,pts=[];
  for(let y=r0;y<=r1;y++){let best=null,bv=1e9;for(let x=c0;x<=c1;x++){const l=side.lum[y*side.w+x];if(l<bv){bv=l;best=x;}}pts.push([y,best]);}
  const n=pts.length,my=pts.reduce((a,p)=>a+p[0],0)/n,mx=pts.reduce((a,p)=>a+p[1],0)/n,sxy=pts.reduce((a,p)=>a+(p[0]-my)*(p[1]-mx),0),syy=pts.reduce((a,p)=>a+(p[0]-my)**2,0);
  const k=sxy/syy,xAt=y=>mx+k*(y-my),yAt=x=>my+(x-mx)/k;
  return {k,xAt,yAt,x0:xAt(F.side.cowlLineRow),x1:xAt(F.side.sillRow)};})();
// The windscreen's slanted front frame (silhouette top over windscreenSlantCols) meets the cowling
// line at the glazing's front corner: the canopy starts there, without a vertical face.
const frontCorner=(()=>{const [c0,c1]=F.side.windscreenSlantCols,pts=[];for(let x=c0;x<=c1;x++)pts.push([x,topEdge(side.col(x))]);
  const n=pts.length,mx=pts.reduce((a,p)=>a+p[0],0)/n,my=pts.reduce((a,p)=>a+p[1],0)/n,k=pts.reduce((a,p)=>a+(p[0]-mx)*(p[1]-my),0)/pts.reduce((a,p)=>a+(p[0]-mx)**2,0);
  return mx+(F.side.cowlLineRow-my)/k;})();
const rearDiag=(()=>{const [c0,c1]=F.side.rearGlazingCols,pts=[];
  for(let x=c0;x<=c1;x++){const t=topEdge(side.col(x))+2.5;let best=null,bv=1e9;for(let y=Math.ceil(t);y<=F.side.sillRow;y++){const l=side.lum[y*side.w+x];if(l<bv){bv=l;best=y;}}pts.push([x,best]);}
  const n=pts.length,mx=pts.reduce((a,p)=>a+p[0],0)/n,my=pts.reduce((a,p)=>a+p[1],0)/n,sxy=pts.reduce((a,p)=>a+(p[0]-mx)*(p[1]-my),0),sxx=pts.reduce((a,p)=>a+(p[0]-mx)**2,0);
  const k=sxy/sxx,yAt=x=>my+k*(x-mx),xAt=y=>mx+(y-my)/k,topRow=topEdge(side.col(c0+2));
  return {k,yAt,xAt,x0:xAt(F.side.sillRow),x1:xAt(topRow),topRow};})();

// ---------------------------------------------------------------- fuselage, side view lines
// Canopy frames (needed by the fuselage top): full-height ink lines across the glazing band. A column
// is a frame where ink (lum < 200) covers at least 85 % of the band rows; neighbouring columns merge.
// The rear fixed glazing is a triangle: its lower edge is the diagonal decking line from the hood's
// rear frame at the sill up to the rear glazing's top at the mast - fitted through the darkest ink
// pixel of each column in rearGlazingCols.
const sideTop=px=>{const r=side.col(Math.round(px));return topEdge(r);};
const sideBottom=px=>{const r=side.col(Math.round(px));return bottomEdge(r.filter(([a,b])=>a<120));};// ignore the wheel run
const spine=[];for(let px=F.side.spineFit[0];px<=F.side.spineFit[1];px+=4)spine.push([px,sideTop(px)]);
const spineSlope=(spine[spine.length-1][1]-spine[0][1])/(spine[spine.length-1][0]-spine[0][0]);
function fuselageTopPx(px){
  if(px>=F.side.finFront)return spine[spine.length-1][1]+spineSlope*(px-spine[spine.length-1][0]);// hidden under the fin
  if(px>F.side.windscreen&&px<=frontDiag.x0)return F.side.cowlLineRow;// cowling line runs on to the windscreen frame
  if(px>frontDiag.x0&&px<frontDiag.x1)return frontDiag.yAt(px);// and drops under the windscreen side glass to the sill
  if(px>=rearDiag.x0&&px<=rearDiag.x1)return rearDiag.yAt(px);// decking rises under the triangular rear glazing
  if(px>rearDiag.x1&&px<=F.side.mast.col+8)return rearDiag.topRow;// the mast stands on the decking: its stub is not fuselage
  if(px>F.side.windscreen&&px<F.side.canopyRear)return F.side.sillRow;// cockpit sides end at the sill; the canopy sits on it
  return sideTop(px);
}
function fuselageBottomPx(px){
  const [c0]=F.side.coolerCols,[,w1]=F.side.wingRootCols;
  if(px>c0&&px<w1)return lerp(sideBottom(c0),sideBottom(w1),(px-c0)/(w1-c0));// chin cooler, wing root and radiators are separate parts
  const [t0,t1]=F.side.tailWheelCols;if(px>t0&&px<t1)return lerp(sideBottom(t0),sideBottom(t1),(px-t0)/(t1-t0));
  return sideBottom(px);
}
// ---------------------------------------------------------------- fuselage, plan half width
const rowOfZ=z=>Math.round(top.py(z));
function centreRun(row){return top.row(row).find(([a,b])=>a<=F.top.centre&&b>=F.top.centre);}
function lineEdge(row,dir,[o0,o1]){// darkest ink in an offset window: an outline drawn over other parts
  let best=null,bv=1e9;for(let o=o0;o<=o1;o++){const x=Math.round(F.top.centre+dir*o),l=top.lum[row*top.w+x];if(l<bv){bv=l;best=o;}}return best+.5;}
// Over the wing the fuselage side is an ink line (rows fuselageLineRows); outside it, the silhouette.
const wingBandHalf=[[F.top.wingBand[0]-16,(lineEdge(F.top.wingBand[0]-16,-1,F.top.cowlLineSearch)+lineEdge(F.top.wingBand[0]-16,1,F.top.cowlLineSearch))/2],
  ...F.top.fuselageLineRows.map(row=>[row,(lineEdge(row,-1,F.top.fuselageLineSearch)+lineEdge(row,1,F.top.fuselageLineSearch))/2]),
  [F.top.wingBand[1]+2,(()=>{const r=centreRun(F.top.wingBand[1]+2);return (r[1]-r[0]+1)/2;})()]];
function halfWidthPx(row){
  const [w0,w1]=F.top.wingBand,[s0]=F.top.stabRows;
  if(row>=w0-16&&row<=w1+2)return interp(wingBandHalf,row);
  // Exhaust stacks stand out of the cowling in plan view: there the cowl is the drawn outline, the
  // stacks are separate parts reaching the silhouette edge (exhaust.outer).
  if(row>=F.top.stackRows[0]&&row<=F.top.stackRows[1])return (lineEdge(row,-1,F.top.cowlLineSearch)+lineEdge(row,1,F.top.cowlLineSearch))/2;
  if(row>=s0){const a=centreRun(s0-2),endHalf=1.5;return lerp((a[1]-a[0]+1)/2,endHalf,Math.min(1,(row-s0+2)/(F.top.tailEndRow-s0+2)));}
  const r=centreRun(row);return (r[1]-r[0]+1)/2;
}
const zFront=side.u(F.side.cowlFront),zEnd=side.u(F.side.rudderHinge),stations=[];
// Regular 12 cm stations plus the ends of the measured canopy lines, so the loft follows the
// straight decking diagonals exactly instead of rounding them between coarse stations.
const keyZ=[frontDiag.x0,frontDiag.x1,rearDiag.x0,rearDiag.x1,F.side.mast.col+8].map(px=>side.u(px));
const zList=[];for(let z=zFront;z>=zEnd-1e-9;z-=.12)zList.push(z);
for(const k of keyZ)if(zList.every(z=>Math.abs(z-k)>.02))zList.push(k);zList.sort((a,b)=>b-a);
for(const z of zList){
  const px=side.px(z),t=side.v(fuselageTopPx(px)),b=side.v(fuselageBottomPx(px)),half=halfWidthPx(rowOfZ(z))/Math.abs(top.map.au);
  const cockpit=px>F.side.windscreen&&px<F.side.canopyRear;
  stations.push({z:round(z),top:round(t),bottom:round(b),half:round(Math.max(.03,half)),wide:round(b+(t-b)*.45),nTop:cockpit?5:2.1,nBot:2.3});
}
stations[stations.length-1].z=round(zEnd);
// Pixel quantisation (1 px = 2 cm) shows as ripples in lofted highlights: smooth each run of
// stations with a 5-point moving average, never across the windscreen or canopy-rear steps.
function smooth(list,keys,breakAt=()=>false,keysFor=()=>null){
  const segs=[];let cur=[];list.forEach((v,i)=>{if(i&&breakAt(list[i-1],v)){segs.push(cur);cur=[];}cur.push(v);});segs.push(cur);
  for(const seg of segs)for(const k of keysFor(seg)||keys){const src=seg.map(v=>v[k]);seg.forEach((v,i)=>{if(i===0||i===seg.length-1)return;const w=src.slice(Math.max(0,i-2),i+3);v[k]=round(w.reduce((a,b)=>a+b,0)/w.length);});}
}
const isCockpit=st=>{const px=side.px(st.z);return px>F.side.windscreen&&px<F.side.canopyRear;};
// the cockpit run is made of fitted straight lines (sill, decking diagonals): smooth only bottom/half there
smooth(stations,['top','bottom','half','wide'],(a,b)=>isCockpit(a)!==isCockpit(b),seg=>isCockpit(seg[0])?['bottom','half']:null);

// ---------------------------------------------------------------- canopy (flat Bf 109 F panels)
const canopy=[];const sill=side.v(F.side.sillRow),roofRow=F.front.canopyRoofRow;
const roofRun=front.row(roofRow).find(([a,b])=>a<=F.front.centre&&b>=F.front.centre),roofHalf=(roofRun[1]-roofRun[0]+1)/2/Math.abs(front.map.au);
const pxs=[];for(let px=Math.ceil(frontDiag.x0);px<rearDiag.x1;px+=3)pxs.push(px);pxs.push(...frameRuns.flatMap(r=>[r[0]-.5,r[1]+.5]),frontCorner,frontDiag.x0+.01,frontDiag.x1,rearDiag.x0,rearDiag.x1-.01);
for(const px of [...new Set(pxs)].sort((a,b)=>a-b)){
  const z=side.u(px),t=side.v(sideTop(Math.min(px,rearDiag.x1-2.5))),row=Math.max(150,Math.min(212,rowOfZ(z))),half=(lineEdge(row,-1,F.top.canopyLineSearch)+lineEdge(row,1,F.top.canopyLineSearch))/2/Math.abs(top.map.au);
  const base=px>rearDiag.x0?side.v(rearDiag.yAt(px)):px<frontDiag.x1?side.v(frontDiag.yAt(Math.max(px,frontDiag.x0))):sill;
  const ctop=px<=frontCorner?base:px<frontDiag.x0?Math.min(t,lerp(base,side.v(sideTop(frontDiag.x0)),(px-frontCorner)/(frontDiag.x0-frontCorner))):t;// slanted front frame down to the corner
  canopy.push({z:round(z),top:round(Math.max(ctop,base)),base:round(base),half:round(half),roofHalf:round(Math.min(roofHalf,half))});
}

// ---------------------------------------------------------------- wing (plan + front)
const wingStations=[];
for(let px=F.top.centre+26;px<=top.w-1;px+=4){
  const cols=[px,2*F.top.centre-px].map(c=>Math.round(c)),both=cols.map(c=>top.col(c).find(([a,b])=>a<=160&&b>=160)).filter(Boolean);if(both.length<2)continue;
  // In plan view the wheel tops and the port intake stand in front of the leading edge: LE from clean columns only
  const blocked=c=>F.top.leBlockedCols.some(([a,b])=>c>=a-1&&c<=b+1),leRuns=both.filter((r,k)=>!blocked(cols[k]));
  const le=leRuns.length?top.v(leRuns.reduce((a,r)=>a+r[0],0)/leRuns.length-.5):null,te=top.v((both[0][1]+both[1][1])/2+.5),s=Math.abs(top.u(px));
  // front view: thickness and mid height at this span on both sides, radiator columns skipped
  const fr=[s,-s].map(x=>{const c=Math.round(front.px(x));if(F.front.radiatorCols.some(([a,b])=>c>=a&&c<=b))return null;
    const run=front.col(c).filter(([a,b])=>b>60&&a<112).sort((p,q)=>(q[1]-q[0])-(p[1]-p[0]))[0];return run?{t:(run[1]-run[0]+1)/Math.abs(front.map.av),y:front.v((run[0]+run[1])/2)}:null;}).filter(Boolean);
  wingStations.push({s:round(s),le:le===null?null:round(le),te:round(te),thick:fr.length?round(fr.reduce((a,f)=>a+f.t,0)/fr.length):null,y:fr.length?round(fr.reduce((a,f)=>a+f.y,0)/fr.length):null});
}
// thickness/height under the radiators: interpolate from neighbours; thickness ratio from chord
// Gaps (wheel/intake columns in plan, radiator columns in front view): interpolate between known
// stations; inboard of the first known one extrapolate the straight line through the next 1.2 m
// (dihedral and thickness taper continue to the root).
for(const k of ['le','thick','y']){const known=wingStations.filter(w=>w[k]!==null).map(w=>[w.s,w[k]]),s0=known[0][0];
  const fit=known.filter(([x])=>x<=s0+1.2),mx=fit.reduce((a,p)=>a+p[0],0)/fit.length,my=fit.reduce((a,p)=>a+p[1],0)/fit.length,sl=fit.reduce((a,p)=>a+(p[0]-mx)*(p[1]-my),0)/fit.reduce((a,p)=>a+(p[0]-mx)**2,0);
  for(const w of wingStations)if(w[k]===null)w[k]=round(w.s<s0?my+sl*(w.s-mx):interp(known,w.s));}
const tipS=Math.abs(top.u(5));
smooth(wingStations,['le','te','thick','y']);
const wing={stations:wingStations.filter(w=>w.te<w.le-.02).map(w=>({s:w.s,le:w.le,te:w.te,t:round(Math.min(.16,Math.max(.06,w.thick/(w.le-w.te)))),y:w.y,twist:0})),tip:round(tipS)};
{const last=wing.stations[wing.stations.length-1],mid=(last.le+last.te)/2;wing.stations.push({s:wing.tip,le:round(mid+.012),te:round(mid-.012),t:last.t,y:last.y,twist:0});}
const dih=(()=>{const a=wing.stations.find(w=>w.s>1),b=[...wing.stations].reverse().find(w=>w.s<4.4);return Math.atan2(b.y-a.y,b.s-a.s)*180/Math.PI;})();

// control surfaces: span from the drawn control lines, hinge as the drawn hinge line's chord fraction
const span=c=>Math.abs(top.u(c));
function hingeFraction([c0,c1]){
  const fr=[];for(let c=Math.round(c0)+6;c<=c1-6;c+=6){const run=top.col(c).find(([a,b])=>a<=160&&b>=160);if(!run)continue;
    let best=null,bv=1e9;for(let y=Math.round(run[0]+.55*(run[1]-run[0]));y<=run[1]-3;y++){const l=top.lum[y*top.w+c];if(l<bv){bv=l;best=y;}}
    fr.push((best-run[0])/(run[1]-run[0]));}
  return fr.reduce((a,b)=>a+b,0)/fr.length;
}
const aileron={from:round(span(F.top.controls.aileron[1])),to:round(span(F.top.controls.aileron[0])),h:round(hingeFraction(F.top.controls.aileron))};
const flap={from:round(span(F.top.controls.flap[1])),to:round(span(F.top.controls.flap[0])),h:round(hingeFraction(F.top.controls.flap))};

// ---------------------------------------------------------------- tailplane (plan) and fin (side)
const stabY=front.v(F.front.stabRow),stab=[];
for(let c=Math.round(F.top.centre)+8;c<=top.w;c+=3){
  const runs=[c,2*F.top.centre-c].map(x=>top.col(Math.round(x)).find(([a,b])=>b>=F.top.stabRows[0]&&a<=F.top.stabRows[1]&&a>=F.top.stabRows[0]-6)).filter(Boolean);if(runs.length<2)break;
  const le=top.v((runs[0][0]+runs[1][0])/2-.5),te=top.v((runs[0][1]+runs[1][1])/2+.5);
  stab.push({s:round(Math.abs(top.u(c))),le:round(le),te:round(te),t:.09});
}
smooth(stab,['le','te']);
{let tipCol=Math.round(F.top.centre);for(let c=Math.round(F.top.centre);c<top.w;c++)if(top.col(c).some(([a,b])=>b>=F.top.stabRows[0]&&a<=F.top.stabRows[1]&&a>=F.top.stabRows[0]-6))tipCol=c;
 const last=stab[stab.length-1],mid=(last.le+last.te)/2;stab.push({s:round(Math.abs(top.u(tipCol+.5))),le:round(mid+.01),te:round(mid-.01),t:.09});}
const elevH=round(stab.slice(1,-3).reduce((a,s)=>a+(s.le-top.v(F.top.elevatorHingeRow))/(s.le-s.te),0)/(stab.length-4));
const finRows=[],hingeZ=side.u(F.side.rudderHinge);
const finRowList=[];for(let row=Math.ceil(sideTop(F.side.rudderHinge+12))+1;row<=66;row+=3)finRowList.push(row);
{let bottom=66;for(let row=67;row<90;row++){const r=side.row(row).filter(([a,b])=>b>=F.side.finFront);if(r.length&&r[r.length-1][1]>F.side.rudderHinge+6)bottom=row;else break;}
 for(let row=69;row<bottom;row+=3)finRowList.push(row);if(bottom>66)finRowList.push(bottom);}// the rudder hangs below the tail cone
for(const row of finRowList){
  const r=side.row(row).filter(([a,b])=>b>=F.side.finFront);if(!r.length)continue;const last=r[r.length-1];
  // fin leading edge: first column whose silhouette rises above this row (the spine stays below it);
  // below the spine at the hinge only the rudder's lower part exists
  let leCol=F.side.rudderHinge-4;if(row<fuselageTopPx(F.side.rudderHinge))for(let c=F.side.finFront;c<last[1];c++)if(sideTop(c)<=row){leCol=c;break;}
  finRows.push({s:round(side.v(row)),le:round(side.u(leCol-.5)),te:round(side.u(last[1]+.5)),t:.09});
}
const finTopRow=Math.min(...Array.from({length:60},(_,k)=>F.side.finFront+k).map(c=>topEdge(side.col(c))));
finRows.sort((a,b)=>a.s-b.s);smooth(finRows,['le','te'],(a,b)=>(a.le>-3.6)!==(b.le>-3.6));finRows.push({s:round(side.v(finTopRow)),le:round(finRows[finRows.length-1].le-.04),te:round(finRows[finRows.length-1].te+.04),t:.08});
// Tail thickness from the front view: the fin's ink width above the canopy, the tailplane's ink
// height outside the blades; t = thickness / chord, the median where a part hides the outline.
const inkRun=(fixed,from,to,horizontal)=>{let a=null,b=null;for(let k=from;k<=to;k++){const l=horizontal?front.lum[fixed*front.w+k]:front.lum[k*front.w+fixed];if(l<215){if(a===null)a=k;b=k;}}return a===null?null:b-a+1;};
{const ts=[];for(const st of finRows){const row=Math.round(front.py(st.s));if(row>=F.front.finThickRows[1]||row<F.front.finThickRows[0])continue;const w=inkRun(row,F.front.finCols[0]-10,F.front.finCols[1]+10,true);if(w)ts.push([st,w/Math.abs(front.map.au)/(st.le-st.te)]);}
 const med=ts.map(t=>t[1]).sort((a,b)=>a-b)[ts.length>>1];for(const st of finRows){const m=ts.find(t=>t[0]===st);st.t=round(Math.min(.14,Math.max(.05,m?m[1]:med)));}}
{const ts=[];for(const st of stab){const v=[st.s,-st.s].map(x=>inkRun(Math.round(front.px(x)),F.front.stabThickRows[0],F.front.stabThickRows[1],false)).filter(h=>h&&h<=F.front.stabThickMaxPx);if(v.length)ts.push([st,v.reduce((a,b)=>a+b,0)/v.length/Math.abs(front.map.av)/(st.le-st.te)]);}
 const med=ts.map(t=>t[1]).sort((a,b)=>a-b)[ts.length>>1];for(const st of stab){const m=ts.find(t=>t[0]===st);st.t=round(Math.min(.14,Math.max(.05,m?m[1]:med)));}}
smooth(finRows,['t']);smooth(stab,['t']);stab[stab.length-1].t=stab[stab.length-2].t;finRows[finRows.length-1].t=finRows[finRows.length-2].t;// 1 px = 2 cm: average the quantisation
const rudderFrom=finRows[0].s+.01,rudderTo=finRows[finRows.length-2].s;

// ---------------------------------------------------------------- spinner, blades, gear, details
// Spinner radius per column from the tip; blade roots bulge the outline, so keep the running maximum
// (a spinner never narrows towards its base). The last column (cowl ring) is excluded.
const spinner=[];let rmax=0;for(let px=F.side.spinner[0]+1;px<F.side.spinner[1];px++){const r=side.col(px)[0];if(!r)continue;rmax=Math.max(rmax,(r[1]-r[0]+1)/2/Math.abs(side.map.av));spinner.push([round(side.u(px)),round(rmax)]);}
const spinnerBase=side.u(F.side.spinner[1]-1),spinnerProfile=[[0,spinner[spinner.length-1][1]],...spinner.map(([z,r])=>[round(z-spinnerBase),r]).sort((a,b)=>a[0]-b[0]).filter(([z])=>z>0),[round(side.u(F.side.spinner[0])-spinnerBase),0]];
let tipRow=0;for(let c=15;c<=34;c++)for(let y=side.h-1;y>81;y--)if(side.lum[y*side.w+c]<215){tipRow=Math.max(tipRow,y);break;}
const R=(tipRow+.5-81.5)/Math.abs(side.map.av),bladeStations=[];
for(let row=F.front.bladeRows[0];row<=F.front.bladeRows[1];row+=6){const run=front.row(row).find(([a,b])=>a<=F.front.centre&&b>=F.front.centre);if(!run)continue;
  bladeStations.push({r:round((row-81.5)/Math.abs(front.map.av)),projected:round((run[1]-run[0]+1)/Math.abs(front.map.au))});}

const wheelR=F.side.wheel.radius/Math.abs(side.map.av),wheelZ=side.u(F.side.wheel.centre[0]),wheelY=side.v(F.side.wheel.centre[1]);
const wheelX=F.front.wheelCols.map(([a,b])=>Math.abs(front.u((a+b)/2))),track=wheelX[0]+wheelX[1];
const legTop=F.front.legTop.map(([c,r])=>[Math.abs(front.u(c)),front.v(r)]);
const legCentre=row=>{let a=1e9,b=-1e9;for(let c=F.side.legSearchCols[0];c<=F.side.legSearchCols[1];c++)if(side.lum[row*side.w+c]<215){a=Math.min(a,c);b=Math.max(b,c);}return (a+b)/2;};
const [lr0,lr1]=F.side.legRows,lc0=legCentre(lr0),lc1=legCentre(lr1),hingeZg=side.u(lc0+(lc1-lc0)*(F.front.legTop[0][1]-lr0)/(lr1-lr0));
const tailWheel={z:side.u(F.side.tailWheel.centre[0]),y:side.v(F.side.tailWheel.centre[1]),r:F.side.tailWheel.radius/Math.abs(side.map.av)};

const radiatorZ=F.side.radiator.cols.map(c=>side.u(c));
const radiatorFace=(()=>{const pts=[];for(const [c0,c1] of F.front.radiatorSearch)for(let c=c0;c<=c1;c++){let top=null,bot=null;for(let r=F.front.radiatorSearchRows[0];r<=F.front.radiatorSearchRows[1];r++)if(front.lum[r*front.w+c]<90){if(top===null)top=r;bot=r;}
    if(top!==null&&bot-top>=1)pts.push([Math.abs(front.u(c)),front.v(bot+.5)]);}
  const xs=pts.map(p=>p[0]),n=pts.length,mx=xs.reduce((a,b)=>a+b)/n,my=pts.reduce((a,p)=>a+p[1],0)/n,k=pts.reduce((a,p)=>a+(p[0]-mx)*(p[1]-my),0)/pts.reduce((a,p)=>a+(p[0]-mx)**2,0);
  const lo=Math.min(...xs),hi=Math.max(...xs);return {span:[round(lo),round(hi)],bottom:[[round(lo),round(my+k*(lo-mx))],[round(hi),round(my+k*(hi-mx))]]};})();
const coolerZ=F.side.cooler.cols.map(c=>side.u(c)),coolerX=Math.abs(front.u(F.front.coolerCols[0])),coolerBottom=side.v(F.side.cooler.bottomRow);
// Supercharger intake: one, on the port side (+X); the PDF text: round section from the F-1 on.
// z and height from the side view, outer edge from the plan view's port silhouette.
const scoopZ=F.side.scoop.cols.map(c=>side.u(c)),scoopY=F.side.scoop.rows.map(r=>side.v(r)),scoopR=Math.abs(scoopY[0]-scoopY[1])/2;
let scoopOuterPx=1e9;for(let row=F.top.scoopOuterRows[0];row<=F.top.scoopOuterRows[1];row++){const r=top.row(row).find(([a,b])=>a<=F.top.centre&&b>=F.top.centre);if(r&&r[0]>=F.top.scoopSearchCols[0]&&r[0]<=F.top.scoopSearchCols[1])scoopOuterPx=Math.min(scoopOuterPx,r[0]);}
const scoopX=top.u(scoopOuterPx-.5)-scoopR;
const stackOuter=(()=>{let a=0,n=0;for(let row=F.top.stackRows[0];row<=F.top.stackRows[1];row++){const r=centreRun(row);a+=(r[1]-r[0]+1)/2;n++;}return a/n/Math.abs(top.map.au);})();
const exhaustZ=F.side.exhaust.cols.map(c=>side.u(c)),exhaustY=side.v(F.side.exhaust.row);
// Panel joints: side-view columns where solid or riveted (dashed) ink spans the fuselage height.
const panelLines=(()=>{const out=[];let prev=-9;for(let px=F.side.panelCols[0];px<=F.side.panelCols[1];px++){const runs=side.col(px).filter(([a])=>a<120);if(!runs.length)continue;
  const t=runs[0][0]+3,b=runs[runs.length-1][1]-2;if(b-t<12)continue;let hit=0,n=0;for(let y=t;y<b-3;y++){n++;for(let k=0;k<4;k++)if(side.lum[(y+k)*side.w+px]<235){hit++;break;}}
  if(hit/n>=.95){if(px-prev<=1)out[out.length-1].push(px);else out.push([px]);prev=px;}}
  return out.map(g=>round(side.u((g[0]+g[g.length-1])/2)));})();
const mgZ=top.v(F.top.mgMuzzleRow),mgX=Math.abs(top.u(F.top.mgTroughCols[0])),mgY=side.v(sideTop(side.px(mgZ)))-.04;
const mast={z:side.u(F.side.mast.col),y:F.side.mast.rows.map(r=>side.v(r))};
const pitot={x:Math.abs(top.u(F.top.pitot.col)),z:F.top.pitot.rows.map(r=>top.v(r))};

// ---------------------------------------------------------------- livery positions (PDF Abb. 53)
// Only positions and colours are measured on the profile; the paint itself is drawn procedurally.
const liv=await (async()=>{
  const im=await loadImage(fs.readFileSync(path.join(DIR,'livery.png'))),c=createCanvas(im.width,im.height),x=c.getContext('2d');x.drawImage(im,0,0);
  const d=x.getImageData(0,0,im.width,im.height).data,W=im.width,at=(px,py)=>[d[(py*W+px)*4],d[(py*W+px)*4+1],d[(py*W+px)*4+2]];
  const ink=(px,py)=>{const [r,g,b]=at(px,py);return r+g+b<720;};
  let tip=null,te=null;for(let px=0;px<W&&!tip;px++)for(let py=0;py<190;py++)if(ink(px,py)){tip=[px,py];break;}
  for(let px=W-1;px>0&&!te;px--)for(let py=0;py<190;py++)if(ink(px,py)){te=[px,py];break;}
  const s=(te[0]-tip[0])/8.94,Z=px=>4.47-(px-tip[0])/s,Y=py=>(tip[1]-py)/s;// profile drawn at one scale on the spinner axis
  const yellow=(px,py)=>{const [r,g,b]=at(px,py);return r>200&&g>150&&b<110;},black=(px,py)=>{const [r,g,b]=at(px,py);return r+g+b<160;};
  const box=(test,x0,y0,x1,y1)=>{let a=[1e9,1e9,-1e9,-1e9];for(let py=y0;py<y1;py++)for(let px=x0;px<x1;px++)if(test(px,py))a=[Math.min(a[0],px),Math.min(a[1],py),Math.max(a[2],px),Math.max(a[3],py)];return a;};
  const noseUpper=box(yellow,60,100,320,146),noseLower=box(yellow,60,160,320,176),rudder=box(yellow,700,20,790,125);
  const cross=box(black,480,120,570,175),barFore=box(black,430,125,480,140),barAft=box(black,570,124,640,140);
  const blue=(px,py)=>{const [r,g,b]=at(px,py);return b>r+40&&b>150;},emblem=box(blue,110,115,175,160);
  const P=([px,py])=>[round(Z(px)),round(Y(py))];
  // Kommodore marking (Abb. 53): open chevron, a solid triangle inside it, then the fore bar.
  const L=F.livery,mark=(px,py)=>{const [r,g,b]=at(px,py);return r+g+b<330;};// black incl. its lit edge
  let apex=null;for(let px=L.chevron.apexCols[0];px<L.chevron.apexCols[1]&&!apex;px++){const ys=[];for(let py=L.chevron.apexRows[0];py<L.chevron.apexRows[1];py++)if(mark(px,py))ys.push(py);if(ys.length)apex=[px,(ys[0]+ys[ys.length-1])/2];}
  const core=(px,py)=>{const [r,g,b]=at(px,py);return r+g+b<250;};// arm ends: the black core only, not the belly shading next to it
  const extreme=(cols,rows,pick)=>{let best=null;for(let py=rows[0];py<rows[1];py++)for(let px=cols[0];px<cols[1];px++)if(core(px,py)&&(!best||pick([px,py],best)))best=[px,py];return best;};
  const upperEnd=extreme(L.chevron.endCols,L.chevron.upperRows,(a,b)=>a[1]<b[1]||(a[1]===b[1]&&a[0]>b[0])),lowerEnd=extreme(L.chevron.endCols,L.chevron.lowerRows,(a,b)=>a[1]>b[1]||(a[1]===b[1]&&a[0]>b[0]));
  const armRow=Math.round((apex[1]+lowerEnd[1])/2);let run=0,best=0;for(let px=apex[0];px<lowerEnd[0];px++){run=mark(px,armRow)?run+1:0;best=Math.max(best,run);}
  const armWidth=best*Math.sin(Math.atan2(lowerEnd[1]-apex[1],lowerEnd[0]-apex[0]))/s;
  let tri=[1e9,1e9,-1e9,-1e9];for(let py=L.triangle.rows[0];py<=L.triangle.rows[1];py++){let px=L.triangle.baseCol;if(!mark(px,py))continue;while(px>apex[0]+4&&mark(px-1,py))px--;
    tri=[Math.min(tri[0],px),Math.min(tri[1],py),Math.max(tri[2],L.triangle.baseCol),Math.max(tri[3],py)];}
  let triApexRow=null;for(let py=tri[1];py<=tri[3];py++)if(mark(tri[0],py)){triApexRow=py;break;}
  // Victory tally on the rudder: rows of thin black bars right of the rudder's front line.
  const fl=[rudder[1]+4,rudder[3]-4].map(py=>{let px=700;while(px<790&&!yellow(px,py))px++;return [Y(py),Z(px-.5)];}),rudderFrontZ=y=>fl[0][1]+(fl[1][1]-fl[0][1])*(y-fl[0][0])/(fl[1][0]-fl[0][0]);
  const frontPy=py=>{const y=Y(py),z=rudderFrontZ(y);return 24+(4.47-z)*s;};
  const tally=L.tally.rows.map(([y0,y1])=>{let a=[1e9,1e9,-1e9,-1e9];const lum=(px,py)=>{const [r,g,b]=at(px,py);return r+g+b;};
    for(let py=y0;py<=y1;py++)for(let px=Math.ceil(frontPy(py)+2);px<L.tally.cols[1];px++){const [r,g,b]=at(px,py);if(r+g+b<330&&!(r>170&&g<110))a=[Math.min(a[0],px),Math.min(a[1],py),Math.max(a[2],px),Math.max(a[3],py)];}
    const mid=Math.floor((a[1]+a[3])/2);let n=0;for(let px=a[0];px<=a[2];px++)if(lum(px,mid)<lum(px-1,mid)&&lum(px,mid)<=lum(px+1,mid)&&lum(px,mid)<420)n++;
    return {z:[round(Z(a[0]-.5)),round(Z(a[2]+.5))],y:[round(Y(a[3]+.5)),round(Y(a[1]-.5))],bars:n};});
  const red=(px,py)=>{const [r,g,b]=at(px,py);return r>170&&g<110&&b<110;},redBox=box(red,700,20,790,125);
  const amber=(px,py)=>{const [r,g,b]=at(px,py);return r>180&&g>120&&b<100&&r-b>110;},octane=box(amber,...L.octane);// the octane triangle is a darker yellow than the cowl
  // Paint colours: medians of the profile's own pixels.
  const median=(test,x0,y0,x1,y1)=>{const cs=[];for(let py=y0;py<y1;py++)for(let px=x0;px<x1;px++)if(test(px,py))cs.push(at(px,py));return [0,1,2].map(k=>{const v=cs.map(c=>c[k]).sort((a,b)=>a-b);return v[v.length>>1];});};
  const sideRegion=L.mottle.region,isMarking=(px,py)=>{const [r,g,b]=at(px,py);return r+g+b<200||Math.min(r,g,b)>238;};
  const sorted=[];for(let py=sideRegion[1];py<sideRegion[3];py++)for(let px=sideRegion[0];px<sideRegion[2];px++)if(!isMarking(px,py))sorted.push(at(px,py));
  sorted.sort((a,b)=>(a[0]+a[1]+a[2])-(b[0]+b[1]+b[2]));const q=(f0,f1)=>{const sl=sorted.slice(Math.floor(f0*sorted.length),Math.floor(f1*sorted.length));return [0,1,2].map(k=>Math.round(sl.reduce((a,c)=>a+c[k],0)/sl.length));};
  const colours={yellow:median(yellow,160,110,260,130),rudderYellow:median(yellow,740,60,770,110),rlm76:q(.8,1),rlm76Base:q(.6,.8),mottleLight:q(.4,.6),mottleDark:q(0,.1),mottleMid:q(.1,.3),
    spinner:median((px,py)=>{const [r,g,b]=at(px,py);return r+g+b<300;},26,135,60,160),
    // canopy frames: the darkest column of the hood's front and rear frame bars (cols 310-315, 365-369, rows 90-110)
    canopyFrame:median((px,py)=>{const [r,g,b]=at(px,py);return r+g+b<330;},310,90,316,110),exhaust:median((px,py)=>{const [r,g,b]=at(px,py);return r+g+b<250;},110,155,200,162)};
  // Mottle: share of dark pixels by height on the rear fuselage side, and the mean dark run length.
  const darkLimit=(colours.rlm76.reduce((a,b)=>a+b)+colours.mottleDark.reduce((a,b)=>a+b))/2,bands=new Array(L.mottle.bands).fill(0).map(()=>[0,0]);let runs=0,runPx=0;
  for(let px=sideRegion[0];px<sideRegion[2];px++){let t=-1,b=-1;for(let py=0;py<im.height-60;py++){const [r,g,bl]=at(px,py);if(Math.min(r,g,bl)<240){if(t<0)t=py;b=py;}}if(t<0)continue;
    for(let py=t+2;py<b-1;py++){if(isMarking(px,py))continue;const [r,g,bl]=at(px,py),k=Math.min(bands.length-1,Math.floor((py-t)/(b-t)*bands.length));bands[k][1]++;if(r+g+bl<darkLimit)bands[k][0]++;}}
  for(let py=sideRegion[1];py<sideRegion[3];py++){let run=0;for(let px=sideRegion[0];px<sideRegion[2];px++){const [r,g,bl]=at(px,py),d=!isMarking(px,py)&&r+g+bl<darkLimit;if(d)run++;else if(run){runs++;runPx+=run;run=0;}}}
  return {scalePxPerMetre:+s.toFixed(2),
    yellowNoseAftZ:{upper:round(Z(noseUpper[2]+.5)),lower:round(Z(noseLower[2]+.5)),splitY:round(Y(147))},
    rudderYellow:{z:[round(Z(rudder[0])),round(Z(rudder[2]))],y:[round(Y(rudder[3])),round(Y(rudder[1]))],
      frontLine:[rudder[1]+4,rudder[3]-4].map(py=>{let px=700;while(px<790&&!yellow(px,py))px++;return [round(Y(py)),round(Z(px-.5))];})},
    cross:(()=>{// 1941 Balkenkreuz: black arms to the ends, white flanks along both sides of each arm, no end caps
      const cx=(cross[0]+cross[2])/2,cy=(barFore[1]+barFore[3])/2,half=(cross[2]-cross[0]+1)/2,lum=(px,py)=>at(px,py).reduce((a,b)=>a+b)/3;
      // the upper arm carries the artist's sheen, so the arm is "darker than the mid point to white", the flank "white"
      const probe=(row,dir)=>{let px=Math.round(cx);while(lum(px+dir,row)<180)px+=dir;const b=Math.abs(px+dir*.5-cx);while(lum(px,row)<=232)px+=dir;while(lum(px+dir,row)>232)px+=dir;return [b,Math.abs(px+dir*.5-cx)];};
      const pr=[Math.round(cy-.6*half),Math.round(cy+.6*half)].flatMap(row=>[probe(row,-1),probe(row,1)]),arm=pr.reduce((a,p)=>a+p[0],0)/pr.length/half,outer=pr.reduce((a,p)=>a+p[1],0)/pr.length/half;
      return {z:round(Z(cx)),y:round(Y(cy)),half:round(half/s),arm:round(arm),edge:round(outer-arm)};})(),
    barFore:{z:[round(Z(barFore[0]-.5)),round(Z(barFore[2]+.5))],y:round(Y((barFore[1]+barFore[3])/2)),h:round((barFore[3]-barFore[1]+1)/s)},
    barAft:{z:[round(Z(barAft[0]-.5)),round(Z(barAft[2]+.5))],y:round(Y((barAft[1]+barAft[3])/2)),h:round((barAft[3]-barAft[1]+1)/s)},
    chevron:{apex:P([apex[0]-.5,apex[1]]),upperEnd:P([upperEnd[0]+.5,upperEnd[1]-.5]),lowerEnd:P([lowerEnd[0]+.5,lowerEnd[1]+.5]),width:round(armWidth)},
    triangle:{apex:P([tri[0]-.5,triApexRow]),baseZ:round(Z(tri[2]+.5)),y:[round(Y(tri[3]+.5)),round(Y(tri[1]-.5))]},
    emblem:{z:round(Z((emblem[0]+emblem[2])/2)),y:round(Y((emblem[1]+emblem[3])/2)),r:round((emblem[2]-emblem[0])/2/s)},
    tally:{rows:tally,redMark:{z:[round(Z(redBox[0]-.5)),round(Z(redBox[2]+.5))],y:[round(Y(redBox[3]+.5)),round(Y(redBox[1]-.5))]},total:tally.reduce((a,t)=>a+t.bars,0)},
    octane:{z:round(Z((octane[0]+octane[2])/2)),y:[round(Y(octane[3]+.5)),round(Y(octane[1]-.5))],w:round((octane[2]-octane[0]+1)/s),note:'apex up'},
    colours,mottle:{darkLimit:Math.round(darkLimit),note:'share of pixels darker than the mid point between RLM 76 and the dark mottle; the lowest band is the artist\'s belly shading, not paint',coverageByHeight:bands.map(([d,n],k)=>[round((k+.5)/bands.length,2),round(d/n,2)]),meanDarkRun:round(runPx/runs/s)},
    spinnerWhite:(()=>{// the profile shows the port side: white from the top down to this angle (0 = top, + towards port)
      const len=spinnerProfile[spinnerProfile.length-1][0],drawn=(px,py)=>Math.min(...at(px,py))<235;
      return {portEdge:[.1,.3,.5,.7].map(t=>{const px=Math.round(24+(4.47-(spinnerBase+len*t))*s);
        let top=100;while(!drawn(px,top))top++;let bot=top;for(let py=top;py<200;py++)if(drawn(px,py))bot=py;// outline rows of the spinner in this column
        const axis=(top+bot)/2,r=(bot-top)/2;let py=top+3;while(py<bot&&Math.min(...at(px,py))>200)py++;// start below the 2-px outline
        return [t,round(Math.acos(Math.max(-1,Math.min(1,(axis-py)/r)))*180/Math.PI,1)];}),note:'t = 0 at the spinner base, 1 at the tip; only the port side is visible, the band width is assumed'};})()};
})();

const shape={
  status:'MEASURED',aircraft:'Messerschmitt Bf 109 F-2',
  note:'Generated by scripts/own-aircraft/measure-bf109f.mjs from the calibrated three-view (PDF Abb. 16). Do not edit by hand: change the pixel ranges in FEATURES and re-run.',
  references:REF.sources.map(s=>({...s})).concat(['side','top','front','livery'].map(n=>({title:n+'.png',file:'app/model-candidates/references/bf109f2/'+n+'.png',license:n==='livery'?'CC BY-SA 2.5':'CC BY-SA 2.0',role:'reference view',sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR,n+'.png'))).digest('hex')}))),
  facts:{span:9.97,length:8.94,wingArea:16.1,source:'PDF table "Technische Daten Bf 109 F" (F-4 row; F-2 airframe)'},
  measured:{dihedralDeg:round(dih,2),track:round(track),propDiameter:round(2*R),wheelDiameter:round(2*wheelR),stabSpan:round(2*stab[stab.length-1].s),livery:undefined,wingTip:wing.tip},
  fuselage:{stations},
  canopy:{stations:canopy,hinge:'starboard',
    // frames: full-height ink lines across the glazing; the first is the windscreen's rear frame, the last the hood's rear frame
    frames:frameRuns.map(r=>({z:round(side.u((r[0]+r[1])/2)),width:round((r[1]-r[0]+1)/Math.abs(side.map.au))})),
    windscreenGlazing:{base:[[round(side.u(frontDiag.x0)),round(side.v(F.side.cowlLineRow))],[round(side.u(frontDiag.x1)),round(side.v(F.side.sillRow))]],
      note:'side glass ends on a diagonal from the cowling line down to the sill at the hood front frame'},
    rearGlazing:{base:[[round(side.u(rearDiag.x0)),round(side.v(F.side.sillRow))],[round(side.u(rearDiag.x1)),round(side.v(rearDiag.topRow))]],
      note:'triangle: lower edge is the decking diagonal fitted through the drawn line, top at the rear glazing top'}},
  wing:{camber:.02,stations:wing.stations,controls:[{name:'Flap%',from:flap.from,to:flap.to,h:flap.h,drive:'flap',range:[0,-.7]},{name:'Aileron%',from:aileron.from,to:aileron.to,h:aileron.h,drive:'roll',gain:.22}]},
  stabiliser:{y:round(stabY),stations:stab,controls:[{name:'Elevator%',from:round(stab[1].s),to:round(stab[stab.length-3].s),h:elevH,drive:'pitch',gain:-.25}]},
  fin:{stations:finRows,controls:[{name:'Rudder',from:round(rudderFrom),to:round(finRows[finRows.length-1].s),hingeZ:round(hingeZ),hornS:round(side.v(F.side.rudderHornRow)),drive:'yaw',gain:-.15,
    note:'hinge: the vertical line drawn at the rudder hinge column; above the horizontal line at rudderHornRow the whole fin tip is the horn-balanced rudder'}]},
  propeller:{z:round(spinnerBase),blades:3,radius:round(R),spinner:spinnerProfile,projectedChord:bladeStations},
  gear:{main:{hinge:[round((legTop[0][0]+legTop[1][0])/2),round(legTop[0][1]),round(hingeZg)],axle:[round(track/2),round(wheelY),round(wheelZ)],wheelR:round(wheelR),wheelW:.15},
    tail:{wheel:[0,round(tailWheel.y),round(tailWheel.z)],hinge:[0,round(side.v(F.side.tailLegTop[1])),round(side.u(F.side.tailLegTop[0]))],wheelR:round(tailWheel.r),wheelW:.09}},
  details:{
    radiators:{span:radiatorFace.span,bottom:radiatorFace.bottom,z:[round(radiatorZ[0]),round(radiatorZ[1])],note:'flush under the wing: span and bottom line from the dark faces in the front view, front and rear from the side view; the rear follows the wing trailing edge'},
    oilCooler:{c:[0,round((coolerBottom+side.v(fuselageBottomPx(side.px((coolerZ[0]+coolerZ[1])/2))))/2),round((coolerZ[0]+coolerZ[1])/2)],s:[round(2*coolerX),round(Math.abs(coolerBottom-side.v(fuselageBottomPx(side.px((coolerZ[0]+coolerZ[1])/2))))+.06),round(Math.abs(coolerZ[0]-coolerZ[1]))]},
    scoops:[{from:[round(scoopX),round((scoopY[0]+scoopY[1])/2),round(scoopZ[0])],to:[round(scoopX),round((scoopY[0]+scoopY[1])/2),round(scoopZ[1])],r:round(scoopR)}],
    exhaust:{y:round(exhaustY),z:exhaustZ.map(v=>round(v)),count:6,outer:round(stackOuter)},
    mast:{from:[0,round(mast.y[1]),round(mast.z)],to:[0,round(mast.y[0]),round(mast.z-.12)]},
    pitot:{from:[round(pitot.x),-.05,round(Math.min(...pitot.z))],to:[round(pitot.x),-.05,round(Math.max(...pitot.z))]}
  },
  panelLines,
  muzzles:[{name:'MuzzleCannon',p:[0,0,round(side.u(F.side.spinner[0]))]},{name:'MuzzleLeft',p:[round(mgX),round(mgY),round(mgZ)]},{name:'MuzzleRight',p:[round(-mgX),round(mgY),round(mgZ)]}],
  livery:{id:'moelders-jg51-1941',title:'Bf 109 F-2, Stab/JG 51, Werner Moelders, June 1941 (PDF Abb. 53)',...liv,
    notSourced:'wing crosses at mid-aileron span (standard practice; the profile shows no plan view); no swastika on the fin'}
};
fs.writeFileSync(path.join(DIR,'shape.json'),JSON.stringify(shape,null,1).replace(/\[\s+([-\d.,\s]+?)\s+\]/g,(m,g)=>'['+g.replace(/\s+/g,' ').trim()+']')+'\n');
console.log(JSON.stringify({measured:shape.measured,fuselageStations:stations.length,wingStations:wing.stations.length,stab:stab.length,fin:finRows.length,aileron,flap,elevH,spinner:spinnerProfile.length,blade:bladeStations}));
