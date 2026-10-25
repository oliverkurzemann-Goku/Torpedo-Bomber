#!/usr/bin/env node
// Silhouette gate for replacement aircraft (app/model-candidates/RIG-CONTRACT.md, "Acceptance").
// Projects every triangle of the delivered GLB (rest pose: gear down, flaps up, controls neutral)
// into the calibrated pixel grid of each reference drawing view and measures the deviation:
// overlap (IoU) and boundary distance in metres. Thresholds are fixed here, not per model.
// Usage: node scripts/silhouette-gate.mjs model.glb references/<id>/reference.json [--out dir]
import fs from 'node:fs';
import path from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {worldTriangles} from './check-rig-contract.mjs';

// Model frame: X span, +Y up, +Z nose. u is the drawing's horizontal axis, v its vertical axis.
export const VIEWS={side:{u:2,v:1},top:{u:0,v:2},front:{u:0,v:1}};
export const GATE={iou:.94,p95:.010,max:.040,bandPx:1};// P95/max as a fraction of the view's largest extent
// IoU ignores disagreement within bandPx pixels of the drawn outline: one pixel is the drawing's own
// line width (about 2 cm at 50 px/m) and the views of one drawing disagree with each other by that much.
// For thin parts seen end-on (wings and tailplane in the front view) the strict IoU measures that
// jitter rather than shape; it is reported as iouStrict. The distance criteria stay exact.

export function mapping(cal){
  const axis=pairs=>{const [[p0,m0],[p1,m1]]=pairs;if(m0===m1)throw Error('calibration points must differ');const a=(p1-p0)/(m1-m0);return [a,p0-a*m0];};
  const [au,bu]=axis(cal.u),[av,bv]=axis(cal.v);
  // Unequal scales mean a distorted scan or wrong points, unless the reference declares why
  // (e.g. a drawing whose span disagrees with the manual it is calibrated against).
  if(Math.abs(Math.abs(au)/Math.abs(av)-1)>.02&&!(typeof cal.anisotropic==='string'&&cal.anisotropic.length>20))throw Error(`calibration scales differ (${Math.abs(au).toFixed(2)} vs ${Math.abs(av).toFixed(2)} px/m): scan is distorted or points are wrong`);
  return {au,bu,av,bv,pxPerMetre:(Math.abs(au)+Math.abs(av))/2};
}

export function modelMask(triangles,view,map,width,height){
  const {u,v}=VIEWS[view],mask=new Uint8Array(width*height);
  for(let t=0;t<triangles.length;t+=9){
    const x0=map.au*triangles[t+u]+map.bu,y0=map.av*triangles[t+v]+map.bv,x1=map.au*triangles[t+3+u]+map.bu,y1=map.av*triangles[t+3+v]+map.bv,x2=map.au*triangles[t+6+u]+map.bu,y2=map.av*triangles[t+6+v]+map.bv;
    const area=(x1-x0)*(y2-y0)-(x2-x0)*(y1-y0);if(Math.abs(area)<1e-12)continue;
    const minX=Math.max(0,Math.floor(Math.min(x0,x1,x2))),maxX=Math.min(width-1,Math.ceil(Math.max(x0,x1,x2))),minY=Math.max(0,Math.floor(Math.min(y0,y1,y2))),maxY=Math.min(height-1,Math.ceil(Math.max(y0,y1,y2)));
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const px=x+.5,py=y+.5,w0=((x1-px)*(y2-py)-(x2-px)*(y1-py))/area,w1=((x2-px)*(y0-py)-(x0-px)*(y2-py))/area;
      if(w0>=0&&w1>=0&&w0+w1<=1)mask[y*width+x]=1;
    }
  }
  return mask;
}

// Reference silhouette from a drawing view. mode 'lines': outline drawing, everything the outside
// flood fill cannot reach (through gaps narrower than 2*close+1 px) is airframe. mode 'filled':
// dark pixels are airframe (silhouette charts, hand-traced masks).
export function referenceMask(image,{crop,threshold=128,close=1,mode='lines',erase=[],outsideSeeds=[]}={}){
  const {width,height,data}=image,[cx0,cy0,cx1,cy1]=crop||[0,0,width,height],dark=new Uint8Array(width*height);
  for(let y=cy0;y<cy1;y++)for(let x=cx0;x<cx1;x++){const i=(y*width+x)*4,a=data[i+3]/255,l=(.299*data[i]+.587*data[i+1]+.114*data[i+2])*a+255*(1-a);dark[y*width+x]=l<threshold?1:0;}
  // erase: [x0,y0,x1,y1] rectangles of ink that is not airframe outline (antenna wire, blades)
  for(const [x0,y0,x1,y1] of erase)for(let y=Math.max(0,y0);y<Math.min(height,y1);y++)for(let x=Math.max(0,x0);x<Math.min(width,x1);x++)dark[y*width+x]=0;
  if(mode==='filled')return dark;
  const wall=dilate(dark,width,height,close),outside=new Uint8Array(width*height),stack=[];
  const push=(x,y)=>{if(x<cx0||y<cy0||x>=cx1||y>=cy1)return;const i=y*width+x;if(outside[i]||wall[i])return;outside[i]=1;stack.push(i);};
  for(let x=cx0;x<cx1;x++){push(x,cy0);push(x,cy1-1);}for(let y=cy0;y<cy1;y++){push(cx0,y);push(cx1-1,y);}
  // outsideSeeds: empty space the drawing encloses by overlapping ink (e.g. between a drawn blade and the tailplane)
  for(const [x,y] of outsideSeeds){if(wall[y*width+x])throw Error(`outside seed ${x},${y} sits on ink`);push(x,y);}
  while(stack.length){const i=stack.pop(),x=i%width,y=(i-x)/width;push(x+1,y);push(x-1,y);push(x,y+1);push(x,y-1);}
  const inside=new Uint8Array(width*height);for(let y=cy0;y<cy1;y++)for(let x=cx0;x<cx1;x++){const i=y*width+x;inside[i]=outside[i]?0:1;}
  // The dilated wall pushed the outside back by `close` px; give that margin back. Then open
  // (erode+dilate) so stray ink outside the airframe - datum, dimension or antenna lines - drops out.
  const open=close+1;return dilate(erode(erode(inside,width,height,close),width,height,open),width,height,open);
}
function dilate(m,w,h,r){if(r<=0)return m;const d=edt(m,w,h,true);const o=new Uint8Array(w*h);for(let i=0;i<o.length;i++)o[i]=d[i]<=r*r?1:0;return o;}
function erode(m,w,h,r){if(r<=0)return m;const inv=new Uint8Array(w*h);for(let i=0;i<inv.length;i++)inv[i]=m[i]?0:1;const d=dilate(inv,w,h,r);for(let i=0;i<inv.length;i++)inv[i]=m[i]&&!d[i]?1:0;return inv;}

// Exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher) to the set pixels.
export function edt(set,w,h){
  const INF=1e20,f=new Float64Array(Math.max(w,h)),d=new Float64Array(Math.max(w,h)),v=new Int32Array(Math.max(w,h)),z=new Float64Array(Math.max(w,h)+1),out=new Float64Array(w*h);
  const pass=n=>{let k=0;v[0]=0;z[0]=-INF;z[1]=INF;
    for(let q=1;q<n;q++){let s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*q-2*v[k]);while(s<=z[k]){k--;s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*q-2*v[k]);}k++;v[k]=q;z[k]=s;z[k+1]=INF;}
    k=0;for(let q=0;q<n;q++){while(z[k+1]<q)k++;d[q]=(q-v[k])*(q-v[k])+f[v[k]];}};
  for(let x=0;x<w;x++){for(let y=0;y<h;y++)f[y]=set[y*w+x]?0:INF;pass(h);for(let y=0;y<h;y++)out[y*w+x]=d[y];}
  for(let y=0;y<h;y++){for(let x=0;x<w;x++)f[x]=out[y*w+x];pass(w);for(let x=0;x<w;x++)out[y*w+x]=d[x];}
  return out;
}
function boundary(m,w,h){const b=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!m[i])continue;if(x===0||y===0||x===w-1||y===h-1||!m[i-1]||!m[i+1]||!m[i-w]||!m[i+w])b[i]=1;}return b;}
function extent(m,w,h){let x0=w,y0=h,x1=-1,y1=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(m[y*w+x]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return x1<0?null:[x0,y0,x1+1,y1+1];}

export function compare(model,reference,w,h,pxPerMetre){
  const bm=boundary(model,w,h),br=boundary(reference,w,h),dm=edt(bm,w,h),dr=edt(br,w,h),dist=[],inBand=(i)=>reference[i]?dr[i]<=(GATE.bandPx-1)**2+.01:dr[i]<=2*GATE.bandPx**2+.01;// bandPx rows each side of the outline (8-neighbourhood outside)
  let inter=0,union=0,interS=0,unionS=0;for(let i=0;i<w*h;i++){if(model[i]&&reference[i])interS++;if(model[i]||reference[i])unionS++;
    if(model[i]!==reference[i]&&inBand(i))continue;if(model[i]&&reference[i])inter++;if(model[i]||reference[i])union++;}
  for(let i=0;i<w*h;i++){if(bm[i])dist.push(Math.sqrt(dr[i]));if(br[i])dist.push(Math.sqrt(dm[i]));}
  dist.sort((a,b)=>a-b);const em=extent(model,w,h),er=extent(reference,w,h);
  if(!em||!er)return {iou:0,error:'empty mask'};
  const scale=Math.max(er[2]-er[0],er[3]-er[1])/pxPerMetre,at=q=>dist[Math.min(dist.length-1,Math.floor(q*dist.length))]/pxPerMetre;
  const r={iou:inter/union,iouStrict:interS/unionS,meanM:dist.reduce((a,b)=>a+b,0)/dist.length/pxPerMetre,p95M:at(.95),maxM:dist[dist.length-1]/pxPerMetre,extentM:scale,
    modelSizeM:[(em[2]-em[0])/pxPerMetre,(em[3]-em[1])/pxPerMetre],referenceSizeM:[(er[2]-er[0])/pxPerMetre,(er[3]-er[1])/pxPerMetre]};
  r.p95Fraction=r.p95M/scale;r.maxFraction=r.maxM/scale;
  r.passed=r.iou>=GATE.iou&&r.p95Fraction<=GATE.p95&&r.maxFraction<=GATE.max;return r;
}

export function insidePolygon(poly,x,y){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;}

export function overlayPng(model,reference,w,h){
  const canvas=createCanvas(w,h),ctx=canvas.getContext('2d'),img=ctx.createImageData(w,h),br=boundary(reference,w,h);
  for(let i=0;i<w*h;i++){const c=br[i]?[0,0,0]:model[i]&&reference[i]?[176,176,176]:reference[i]?[220,40,40]:model[i]?[30,170,220]:[255,255,255];img.data.set([...c,255],i*4);}
  ctx.putImageData(img,0,0);return canvas.toBuffer('image/png');
}

export async function runGate(glbBytes,referenceFile,outDir){
  const ref=JSON.parse(fs.readFileSync(referenceFile,'utf8')),base=path.dirname(referenceFile),results={};
  for(const [view,spec] of Object.entries(ref.views)){
    if(!VIEWS[view])throw Error('unknown view '+view);
    const image=await loadImage(fs.readFileSync(path.join(base,spec.file))),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,image.width,image.height);ctx.drawImage(image,0,0);
    const data=ctx.getImageData(0,0,image.width,image.height),map=mapping(spec.calibration);
    const triangles=worldTriangles(glbBytes,{exclude:spec.exclude||[],rotate:spec.rotate||{}});
    const reference=referenceMask(data,spec),model=modelMask(triangles,view,map,image.width,image.height);
    for(const [x0,y0,x1,y1] of spec.erase||[])for(let y=Math.max(0,y0);y<Math.min(image.height,y1);y++)for(let x=Math.max(0,x0);x<Math.min(image.width,x1);x++)model[y*image.width+x]=reference[y*image.width+x];// erased ink is not compared
    // ignore: polygons not compared (e.g. propeller blades drawn at an angle no rigid rotor can take); the drawing's ink is kept
    for(const poly of spec.ignore||[])for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(insidePolygon(poly,x+.5,y+.5))model[y*image.width+x]=reference[y*image.width+x];
    if(spec.crop){const [x0,y0,x1,y1]=spec.crop;for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(x<x0||y<y0||x>=x1||y>=y1)model[y*image.width+x]=0;}
    results[view]=compare(model,reference,image.width,image.height,map.pxPerMetre);results[view].pxPerMetre=map.pxPerMetre;
    if(outDir){fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,view+'-overlay.png'),overlayPng(model,reference,image.width,image.height));}
  }
  return {passed:Object.values(results).every(r=>r.passed),gate:GATE,views:results};
}

// Measured outlines of each reference view, in metres, for building the station table:
// side -> per z the silhouette's [lowest y, highest y]; top -> per z [min x, max x] and per x
// [min z, max z]; front -> per x [min y, max y]. Every value comes from the drawing's pixels.
export async function traceReference(referenceFile,step=.05){
  const ref=JSON.parse(fs.readFileSync(referenceFile,'utf8')),base=path.dirname(referenceFile),out={reference:path.basename(referenceFile),step,views:{}};
  for(const [view,spec] of Object.entries(ref.views)){
    const image=await loadImage(fs.readFileSync(path.join(base,spec.file))),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,image.width,image.height);ctx.drawImage(image,0,0);
    const W=image.width,H=image.height,mask=referenceMask(ctx.getImageData(0,0,W,H),spec),map=mapping(spec.calibration);
    const um=px=>(px+.5-map.bu)/map.au,vm=py=>(py+.5-map.bv)/map.av,cols=[],rows=[];
    for(let x=0;x<W;x++){let a=null,b=null;for(let y=0;y<H;y++)if(mask[y*W+x]){a??=y;b=y;}if(a!==null)cols.push([um(x),vm(a),vm(b)]);}
    for(let y=0;y<H;y++){let a=null,b=null;for(let x=0;x<W;x++)if(mask[y*W+x]){a??=x;b=x;}if(a!==null)rows.push([vm(y),um(a),um(b)]);}
    const bin=(list)=>{const m=new Map();for(const [k,p,q] of list){const key=Math.round(k/step)*step;const o=m.get(key);m.set(key,o?[Math.min(o[0],p,q),Math.max(o[1],p,q)]:[Math.min(p,q),Math.max(p,q)]);}return [...m.entries()].sort((a,b)=>a[0]-b[0]).map(([k,[a,b]])=>[+k.toFixed(3),+a.toFixed(4),+b.toFixed(4)]);};
    // u is the drawing's horizontal model axis, v its vertical one (see VIEWS)
    out.views[view]={axes:{u:'xyz'[VIEWS[view].u],v:'xyz'[VIEWS[view].v]},byU:bin(cols),byV:bin(rows),pxPerMetre:+map.pxPerMetre.toFixed(2)};
  }
  return out;
}

if(import.meta.url===`file://${process.argv[1]}`&&process.argv[2]==='--trace'){
  const t=await traceReference(process.argv[3],Number(process.argv[4])||.05);console.log(JSON.stringify(t));process.exit(0);
}
if(import.meta.url===`file://${process.argv[1]}`){
  const [glb,reference]=process.argv.slice(2),out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:null;
  if(!glb||!reference){console.error('usage: silhouette-gate.mjs model.glb reference.json [--out dir] | --trace reference.json [step]');process.exit(2);}
  const result=await runGate(fs.readFileSync(glb),reference,out);
  for(const [view,r] of Object.entries(result.views))console.log(`${view.padEnd(5)} IoU ${r.iou.toFixed(4)} (strict ${r.iouStrict.toFixed(4)})  P95 ${(r.p95M*100).toFixed(1)} cm (${(r.p95Fraction*100).toFixed(2)}%)  max ${(r.maxM*100).toFixed(1)} cm  ${r.passed?'pass':'FAIL'}`);
  console.log(result.passed?'PASSED silhouette gate':'FAILED silhouette gate');process.exitCode=result.passed?0:1;
}
