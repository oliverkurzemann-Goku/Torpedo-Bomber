'use strict';
// Build 281: cloud puffs are big camera-facing sprites. Me 262 and Komet climb
// through the cloud layer at 200+ m/s: a puff whose centre was just ahead filled
// the screen and vanished the instant the centre passed behind the camera, and the
// pool wrapped clouds from 5 km behind to 5 km ahead, where they popped into view.
// FlightOps.fadeClouds must make both invisible: no puff at full opacity around the
// camera, opacity changing smoothly while flying through, zero at the wrap edge.
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const ctx={console,Math};ctx.window=ctx;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../sortie-systems.js'),'utf8'),ctx);
const F=ctx.FlightOps;assert.equal(typeof F.fadeClouds,'function');

// The Rhine pool: 40 clouds, 4-8 puffs, like buildClouds() (seeded, deterministic).
function pool(seed){
  let s=seed;const r=()=>((s=(s*16807)%2147483647)-1)/2147483646;
  const out=[];
  for(let i=0;i<40;i++){
    const base=320+r()*300,c={position:{x:(r()-.5)*10000,y:0,z:(r()-.5)*10000},scale:{x:1,y:1,z:1,set(x,y,z){this.x=x;this.y=y;this.z=z;}},children:[],userData:{}};
    const n=4+Math.floor(r()*5);
    for(let j=0;j<n;j++){const sc=base*(.6+r()*.7);
      c.children.push({material:{opacity:.6,color:{setHex(){}}},userData:{},visible:true,scale:{x:sc,y:sc*.62},position:{x:(r()-.5)*base*1.8,y:(r()-.4)*base*.5,z:(r()-.5)*base*1.8}});}
    out.push(c);
  }
  return out;
}
const span=10000,half=span/2;
function wrap(clouds,p){for(const c of clouds){const dx=c.position.x-p.x,dz=c.position.z-p.z;
  if(dx>half)c.position.x-=span;else if(dx<-half)c.position.x+=span;if(dz>half)c.position.z-=span;else if(dz<-half)c.position.z+=span;}}

// weather sets the base opacity; it is remembered for the fade
const clouds=pool(7);F.clouds(clouds,'broken');
for(const c of clouds)for(const p of c.children)assert.ok(p.userData.wxOpacity>.5);

for(const fps of [20,60,120]){
  const cl=pool(7);F.clouds(cl,'broken');
  const dt=1/fps,v=230;let maxStep=0,inside=0,worst=0,wrapped=0;const prev=new Map();
  // a jet climbing gently through the layer (950-1650 m) on a long straight line
  const pos={x:0,y:900,z:0};
  for(let t=0;t<60;t+=dt){
    pos.z+=v*dt;pos.y+=12*dt;
    const before=cl.map(c=>c.position.x+','+c.position.z);
    wrap(cl,pos);
    const cam={x:pos.x,y:pos.y+9,z:pos.z-28};
    F.fadeClouds(cl,cam,pos,half);
    cl.forEach((c,i)=>{
      const moved=before[i]!==c.position.x+','+c.position.z;if(moved)wrapped++;
      for(const p of c.children){
        const o=p.material.opacity,last=prev.get(p);
        // a wrap teleports the cloud: it must have been (and stay) invisible
        if(moved){assert.ok(o<.01,'visible after wrap: '+o);if(last!=null)assert.ok(last<.03,'visible before wrap: '+last);}
        else if(last!=null)maxStep=Math.max(maxStep,Math.abs(o-last));
        prev.set(p,o);
        // world position and size include the cloud group's weather scale
        const wx=c.position.x+p.position.x*c.scale.x,wy=c.position.y+p.position.y*c.scale.y,wz=c.position.z+p.position.z*c.scale.z;
        const d=Math.hypot(wx-cam.x,wy-cam.y,wz-cam.z),r=.5*p.scale.x*c.scale.x;
        if(d<r){inside++;worst=Math.max(worst,o);}
      }
    });
  }
  assert.ok(inside>0,'the flight passes through puffs');
  assert.ok(worst<.06,'puff around the camera still drawn at '+worst);
  assert.ok(wrapped>0,'clouds wrapped during the flight');
  // 230 m/s through a ~200 m fade band: the largest step per frame scales with dt
  assert.ok(maxStep<Math.min(.2,8*dt),'opacity jump '+maxStep.toFixed(3)+' at '+fps+' FPS');
  console.log(fps,'FPS: frames with camera in a puff',inside,'max opacity there',worst.toFixed(3),'max step',maxStep.toFixed(3),'wraps',wrapped);
}

// The adaptive quality budget may hide puffs; the fade must not show them again.
{const cl=pool(3);F.clouds(cl,'clear');cl[0].children[0].userData.qualityHidden=true;
 F.fadeClouds(cl,{x:1e5,y:0,z:0},{x:cl[0].position.x,y:0,z:cl[0].position.z},half);
 assert.equal(cl[0].children[0].visible,false);}
console.log('cloud-fade: ok');
