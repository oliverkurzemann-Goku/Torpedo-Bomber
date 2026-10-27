#!/usr/bin/env node
'use strict';
// Project the delivered GLB triangles onto recorded, digitised reference outlines.
// Fittings, gear, propeller blades and antennae are excluded; this measures main airframe
// contour agreement, not historical/engineering certification. 100 raster pixels = 1 m.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createCanvas}=require('@napi-rs/canvas');global.THREE=require('three');global.self=global;
global.ProgressEvent=class{};global.createImageBitmap=async()=>({width:2048,height:2048,close(){}});
const ROOT=path.resolve(__dirname,'..'),L=require('./own-aircraft/fw190-komet-landmarks.json');
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'vendor/GLTFLoader-r128.js'),'utf8'));
const load=b=>new Promise((ok,no)=>new THREE.GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',g=>ok(g.scene),no));
const ppm=100,W=1200,H=1000,px=([u,v])=>[W/2+u*ppm,H/2-v*ppm];
const poly=(ctx,p)=>{ctx.beginPath();p.map(px).forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();};
const fz=x=>4.05-(x-468)*8.95/592,fy=y=>(183-y)*8.95/592,ftz=x=>4.05-(x-765)*8.95/493,fx=y=>(461-y)*5.25/284;
const mz=x=>2.8-(x-820)*5.69/279,my=y=>(163-y)*5.69/279;
function reference(kind,view){
 const c=createCanvas(W,H),ctx=c.getContext('2d');ctx.fillStyle='#fff';
 const F=kind==='fw190',a=L[kind],z=F?fz:mz,y=F?fy:my;
 if(view==='side'){
  const skin=F?[[505,151,207],[515,147,216],[535,142,222],[575,137,224],[600,135,222],...a.body]:a.body;
  poly(ctx,[...skin.map(([x,t])=>[-z(x),y(t)]),...skin.slice().reverse().map(([x,t,b])=>[-z(x),y(b)])]);
  poly(ctx,[...a.fin.map(([h,l])=>[-z(l),y(h)]),...a.fin.slice().reverse().map(([h,l,t])=>[-z(t),y(h)])]);
  poly(ctx,[...a.canopy.map(([x,b,t])=>[-z(x),y(t)]),...a.canopy.slice().reverse().map(([x,b])=>[-z(x),y(b)])]);
  if(F)poly(ctx,[[468,183],[474,174],[488,165],[505,164],[505,202],[488,201],[474,192]].map(([x,h])=>[-fz(x),fy(h)]));
 }else{
  let st;
  if(F)st=a.wing.map(([h,l,t])=>[fx(h),ftz(l),ftz(t)]);
  else st=a.wingRectified.map(([s,l,t])=>[s,2.8-(l-135)*5.69/559,2.8-(t-135)*5.69/559]);
  for(const sign of [-1,1])poly(ctx,[...st.map(([s,l])=>[sign*s,l]),...st.slice().reverse().map(([s,l,t])=>[sign*s,t])]);
  if(F)for(const sign of [-1,1])poly(ctx,[...a.tail.map(([h,l])=>[sign*fx(h),ftz(l)]),...a.tail.slice().reverse().map(([h,l,t])=>[sign*fx(h),ftz(t)])]);
  const widths=F?[[765,0],[793,.295],[801,.53],[815,.60],[850,.65],[900,.62],[940,.55],[980,.49],[1020,.40],[1060,.33],[1100,.26],[1140,.18],[1180,.11],[1220,.045],[1258,0]].map(([p,w])=>[ftz(p),w]):[[135,0],[165,.22],[200,.40],[245,.52],[300,.68],[360,.78],[420,.77],[475,.68],[515,.48],[560,.34],[610,.23],[660,.17],[694,.18]].map(([p,w])=>[2.8-(p-135)*5.69/559,w]);
  poly(ctx,[...widths.map(([z,w])=>[-w,z]),...widths.slice().reverse().map(([z,w])=>[w,z])]);
 }
 return ctx.getImageData(0,0,W,H).data;
}
function projected(root,view){
 const c=createCanvas(W,H),ctx=c.getContext('2d');ctx.fillStyle='#fff';root.updateMatrixWorld(true);
 root.traverse(o=>{if(!o.isMesh||!/^(Airframe|FuselageSkin|WingSkin|FinSkin|TailplaneSkin|CowlingSkin|CanopyGlass|Spinner|Rudder|FlapLeft|FlapRight|AileronLeft|AileronRight|ElevatorLeft|ElevatorRight|ElevonLeft|ElevonRight)$/.test(o.name))return;
  const p=o.geometry.attributes.position,ix=o.geometry.index,points=[];
  for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);points.push(view==='side'?[-v.z,v.y]:[v.x,v.z]);}
  for(let i=0;i<ix.count;i+=3)poly(ctx,[points[ix.getX(i)],points[ix.getX(i+1)],points[ix.getX(i+2)]]);
 });return ctx.getImageData(0,0,W,H).data;
}
const mask=d=>Uint8Array.from({length:W*H},(_,i)=>d[i*4+3]>127?1:0);
// Seal only <= 2 cm control-surface seams for the OUTER-edge distance metric.
// Strict area IoU above still counts every gap. Closing avoids treating a hinge line
// inside a wing as an error of half the wing's chord against its outside perimeter.
function seal(a){const d=new Uint8Array(a.length),e=new Uint8Array(a.length);for(let i=W+1;i<a.length-W-1;i++)d[i]=a[i]||a[i-1]||a[i+1]||a[i-W]||a[i+W]||a[i-W-1]||a[i-W+1]||a[i+W-1]||a[i+W+1];for(let i=W+1;i<a.length-W-1;i++)e[i]=d[i]&&d[i-1]&&d[i+1]&&d[i-W]&&d[i+W]&&d[i-W-1]&&d[i-W+1]&&d[i+W-1]&&d[i+W+1];return e;}
function exterior(a){const seen=new Uint8Array(a.length),queue=new Int32Array(a.length);let start=0,end=1;queue[0]=0;seen[0]=1;while(start<end){const i=queue[start++];for(const j of [i-1,i+1,i-W,i+W])if(j>=0&&j<a.length&&!a[j]&&!seen[j]){seen[j]=1;queue[end++]=j;}}return Uint8Array.from(seen,v=>1-v);}
function compare(a,b){let union=0,both=0;for(let i=0;i<a.length;i++){if(a[i]||b[i])union++;if(a[i]&&b[i])both++;}a=exterior(seal(a));b=exterior(seal(b));const boundary=[];for(let i=W;i<a.length-W;i++){if(a[i]&&(!a[i-1]||!a[i+1]||!a[i-W]||!a[i+W]))boundary.push(i);}
 const d=new Float32Array(a.length);for(let i=0;i<d.length;i++)d[i]=b[i]&&(!b[i-1]||!b[i+1]||!b[i-W]||!b[i+W])?0:1e6;
 for(let i=W+1;i<d.length;i++)d[i]=Math.min(d[i],d[i-1]+1,d[i-W]+1,d[i-W-1]+Math.SQRT2);
 for(let i=d.length-W-2;i>=0;i--)d[i]=Math.min(d[i],d[i+1]+1,d[i+W]+1,d[i+W+1]+Math.SQRT2);
 const ds=boundary.map(i=>d[i]/ppm).sort((a,b)=>a-b);return {iou:+(both/union).toFixed(4),p95Metres:+ds[Math.floor(ds.length*.95)].toFixed(4),maxMetres:+ds.at(-1).toFixed(4)};
}
function overlay(a,b,file){const c=createCanvas(W,H),ctx=c.getContext('2d'),im=ctx.createImageData(W,H);
 for(let i=0;i<a.length;i++){const aa=a[i],bb=b[i],col=aa&&bb?[216,225,226]:aa?[194,71,51]:bb?[28,128,151]:[249,249,245];im.data.set([...col,255],i*4);}
 ctx.putImageData(im,0,0);fs.writeFileSync(file,c.toBuffer('image/png'));
}
(async()=>{const out=path.join(ROOT,'test-visuals');fs.mkdirSync(out,{recursive:true});const report={units:'metres',pixelsPerMetre:ppm,scope:'Main airframe exterior contours; digitised screenshot outlines, fittings excluded. IoU is strict; outer-edge distance seals <= 2 cm hinge gaps.',results:[]};
 for(const [kind,id]of [['fw190','fw190a8'],['me163','me163b']]){
  const root=await load(fs.readFileSync(path.join(ROOT,'assets/aircraft',id+'-own.glb'))),oldPath=path.join(ROOT,'build',id,'before.glb'),old=fs.existsSync(oldPath)?await load(fs.readFileSync(oldPath)):null;
  for(const view of ['top','side']){const target=mask(reference(kind,view)),actual=mask(projected(root,view)),r={kind,view,current:compare(actual,target),...(old?{build209:compare(mask(projected(old,view)),target)}:{})};report.results.push(r);console.log(JSON.stringify(r));overlay(actual,target,path.join(out,'build210-'+kind+'-'+view+'-contour.png'));}
 }
 fs.writeFileSync(path.join(ROOT,process.argv.includes('--release-report')?'app/release/fw190-komet-contours.json':'test-visuals/build210-contours.json'),JSON.stringify(report,null,2)+'\n');
 for(const r of report.results){assert(r.current.iou>.92,`${r.kind} ${r.view}: contour overlap ${r.current.iou}`);assert(r.current.p95Metres<.12,`${r.kind} ${r.view}: contour deviation ${r.current.p95Metres} m`);}
})().catch(e=>{console.error(e);process.exitCode=1;});
