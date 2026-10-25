/* Silhouette gate: a calibrated line drawing of a known shape, rasterised independently by canvas,
 * must match the GLB projection of that shape (IoU, boundary distance in metres) and a 3-4%
 * distorted model must fail. Synthetic three-view, no game model and no real drawing involved. */
'use strict';
const assert=require('node:assert/strict');
const {createCanvas}=require('@napi-rs/canvas');
const {GlbWriter,box}=require('../../scripts/lib/glb-writer.cjs');

// [centre, size] boxes in the contract frame (X span, Y up, Z nose), metres
const SHAPE=[[[0,0,0],[.9,1.1,8.4]],[[0,-.35,.6],[9.9,.2,1.7]],[[0,.95,-3.75],[.12,1.3,.9]],[[0,.25,-3.85],[3.2,.1,.7]],[[0,0,4.35],[.5,.5,.3]]];
function glb(shape){const w=new GlbWriter(),m=w.material({pbrMetallicRoughness:{baseColorFactor:[1,1,1,1]}}),top=w.node({name:'Shape'});shape.forEach(([c,s],i)=>w.node({name:'b'+i,mesh:w.mesh('b'+i,{...box(c,s),material:m})},top));return w.glb();}
const VIEWS={side:{u:2,v:1},top:{u:0,v:2},front:{u:0,v:1}};
// Drawing conventions differ per view: side view nose left (u mirrored), plan view nose up.
const CAL={side:{s:110,ou:620,ov:330,su:-1,sv:-1},top:{s:110,ou:620,ov:600,su:1,sv:-1},front:{s:110,ou:620,ov:330,su:1,sv:-1}};
function drawing(view,{gap=false}={}){
  const {u,v}=VIEWS[view],c=CAL[view],W=1240,H=1180,fill=createCanvas(W,H),f=fill.getContext('2d');
  f.fillStyle='#fff';f.fillRect(0,0,W,H);f.fillStyle='#000';
  for(const [cen,size] of SHAPE){const x0=c.ou+c.su*(cen[u]-size[u]/2)*c.s,x1=c.ou+c.su*(cen[u]+size[u]/2)*c.s,y0=c.ov+c.sv*(cen[v]-size[v]/2)*c.s,y1=c.ov+c.sv*(cen[v]+size[v]/2)*c.s;f.fillRect(Math.min(x0,x1),Math.min(y0,y1),Math.abs(x1-x0),Math.abs(y1-y0));}
  const solid=f.getImageData(0,0,W,H).data,out=createCanvas(W,H),o=out.getContext('2d');o.fillStyle='#fff';o.fillRect(0,0,W,H);
  const img=o.getImageData(0,0,W,H),inside=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&solid[(y*W+x)*4]<128;
  // 2 px outline drawn on the airframe edge, like an ink line
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(inside(x,y)&&(!inside(x-2,y)||!inside(x+2,y)||!inside(x,y-2)||!inside(x,y+2)))img.data.fill(0,(y*W+x)*4,(y*W+x)*4+3);
  o.putImageData(img,0,0);o.strokeStyle='#000';o.lineWidth=1;
  o.beginPath();o.moveTo(c.ou-.2*c.s*c.su,40);o.lineTo(c.ou-.2*c.s*c.su,H-40);o.stroke();// interior panel/datum line crossing the airframe
  o.beginPath();o.moveTo(30,H-20);o.lineTo(W-30,H-20);o.stroke();// dimension line outside
  if(gap){o.fillStyle='#fff';o.fillRect(c.ou-1,0,1,H);}// a 1 px break through every outline
  const data=o.getImageData(0,0,W,H);
  const cal={u:[[c.ou,0],[c.ou+c.su*c.s,1]],v:[[c.ov,0],[c.ov+c.sv*c.s,1]]};
  return {data,cal};
}
(async()=>{
  const gate=await import('../../scripts/silhouette-gate.mjs'),{worldTriangles}=await import('../../scripts/check-rig-contract.mjs');
  const run=(shape,view,opts={})=>{const {data,cal}=drawing(view,opts),map=gate.mapping(cal),ref=gate.referenceMask(data,{close:1}),model=gate.modelMask(worldTriangles(glb(shape)),view,map,data.width,data.height);return gate.compare(model,ref,data.width,data.height,map.pxPerMetre);};
  const exact={};for(const view of Object.keys(VIEWS)){const r=run(SHAPE,view);exact[view]=r;assert(r.passed,view+' exact shape passes: '+JSON.stringify(r));assert(r.iou>.96&&r.p95M<.03,view+' within 3 cm: '+JSON.stringify(r));}
  const gap=run(SHAPE,'side',{gap:true});assert(gap.passed,'1 px outline breaks are closed');
  const wrong=SHAPE.map(([c,s],i)=>i===0?[[c[0],c[1],c[2]-.15],[s[0],s[1],s[2]*1.035]]:i===2?[[c[0],c[1]+.04,c[2]-.29],[s[0],s[1]*1.06,s[2]]]:[c,s]);
  const bad=run(wrong,'side');assert(!bad.passed&&bad.p95Fraction>gate.GATE.p95,'3.5% longer fuselage and 6% taller fin fail: '+JSON.stringify(bad));
  const thin=SHAPE.map(([c,s],i)=>i===1?[c,[s[0]*.97,s[1],s[2]]]:[c,s]);assert(!run(thin,'top').passed,'3% shorter span fails the plan view');
  assert.throws(()=>gate.mapping({u:[[0,0],[100,1]],v:[[0,0],[-120,1]]}),/distorted/);
  // File-based path as used on real scans: reference.json + PNG views, gate and outline trace.
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'gate-'));
  const reference={title:'synthetic three-view',views:{}};
  for(const view of Object.keys(VIEWS)){const {data,cal}=drawing(view),c=createCanvas(data.width,data.height);c.getContext('2d').putImageData(data,0,0);fs.writeFileSync(path.join(dir,view+'.png'),c.toBuffer('image/png'));reference.views[view]={file:view+'.png',mode:'lines',close:1,calibration:cal};}
  fs.writeFileSync(path.join(dir,'reference.json'),JSON.stringify(reference));fs.writeFileSync(path.join(dir,'shape.glb'),glb(SHAPE));
  const files=await gate.runGate(fs.readFileSync(path.join(dir,'shape.glb')),path.join(dir,'reference.json'),dir);
  assert(files.passed&&fs.existsSync(path.join(dir,'side-overlay.png')),'file-based gate passes and writes overlays');
  const trace=await gate.traceReference(path.join(dir,'reference.json'),.05),mid=trace.views.side.byU.find(r=>r[0]===0);
  assert(Math.abs(mid[1]+.55)<.02&&Math.abs(mid[2]-.55)<.02,'side trace at z=0 measures the fuselage box: '+mid);
  const span=trace.views.top.byV.find(r=>r[0]===.6);assert(Math.abs(span[1]+4.95)<.02&&Math.abs(span[2]-4.95)<.02,'plan trace measures the 9.9 m span: '+span);
  fs.rmSync(dir,{recursive:true,force:true});
  console.log(JSON.stringify({files:'reference.json + PNG views: gate, overlays and outline trace verified',gate:gate.GATE,exact:Object.fromEntries(Object.entries(exact).map(([k,r])=>[k,{iou:+r.iou.toFixed(4),p95cm:+(r.p95M*100).toFixed(2),maxcm:+(r.maxM*100).toFixed(2)}])),gapClosed:gap.passed,distortedSide:{iou:+bad.iou.toFixed(4),p95cm:+(bad.p95M*100).toFixed(1),passed:bad.passed}}));
})().catch(e=>{console.error(e);process.exitCode=1;});
