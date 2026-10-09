/* Shared swept surface tests, local vegetation collisions and selectable navigation. */
(function(root){
'use strict';
function surfaceHit(a,b,heightAt,clearance=.15){
 const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/8));
 let previous=0;
 for(let i=0;i<=n;i++){
  const t=i/n,x=a.x+dx*t,z=a.z+dz*t;
  if(a.y+dy*t<=heightAt(x,z)+clearance){
   let lo=previous,hi=t;
   for(let j=0;j<10;j++){const m=(lo+hi)/2;if(a.y+dy*m>heightAt(a.x+dx*m,a.z+dz*m)+clearance)lo=m;else hi=m;}
   const x=a.x+dx*hi,z=a.z+dz*hi;return new THREE.Vector3(x,heightAt(x,z)+clearance,z);
  }
  previous=t;
 }
 return null;
}
function skinHeight(model,parent,x,z){
 // r128 CPU raycasts do not decode the SBD's normalized Int16 positions.
 parent.updateWorldMatrix(true,true);const inverse=parent.matrixWorld.clone().invert(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();let top=-Infinity;
 model.traverse(o=>{
  if(!o.isMesh||!o.geometry)return;
  for(let node=o;node&&node!==parent;node=node.parent)if(!node.visible)return;
  const p=o.geometry.attributes.position,idx=o.geometry.index,m=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld);
  const divisor=p.array instanceof Int16Array?32767:p.array instanceof Uint16Array?65535:p.array instanceof Int8Array?127:255;
  const read=(i,v)=>{v.fromBufferAttribute(p,i);if(p.normalized)v.set(Math.max(-1,v.x/divisor),Math.max(-1,v.y/divisor),Math.max(-1,v.z/divisor));return v.applyMatrix4(m);};
  for(let i=0;i<(idx?idx.count:p.count);i+=3){
   read(idx?idx.getX(i):i,a);read(idx?idx.getX(i+1):i+1,b);read(idx?idx.getX(i+2):i+2,c);
   if(x<Math.min(a.x,b.x,c.x)||x>Math.max(a.x,b.x,c.x)||z<Math.min(a.z,b.z,c.z)||z>Math.max(a.z,b.z,c.z))continue;
   const det=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);if(Math.abs(det)<1e-10)continue;
   const u=((x-a.x)*(c.z-a.z)-(z-a.z)*(c.x-a.x))/det,v=((b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x))/det;
   if(u<-.000001||v<-.000001||u+v>1.000001)continue;
   const y=a.y+u*(b.y-a.y)+v*(c.y-a.y);if(Math.abs(y)<3)top=Math.max(top,y);
  }
 });return Number.isFinite(top)?top:null;
}
class TreeIndex{
 constructor(groundAt=null){this.cells=new Map();this.size=64;this.count=0;this.groundAt=groundAt;}
 add(x,z,y,height,radius,trunk=.2){
  const item={x,z,y,height,radius,trunk,foundationOffset:this.groundAt?y-this.groundAt(x,z):0};this.count++;
  for(let ix=Math.floor((x-radius)/64);ix<=Math.floor((x+radius)/64);ix++)for(let iz=Math.floor((z-radius)/64);iz<=Math.floor((z+radius)/64);iz++){
   const key=ix+','+iz;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(item);
  }
 }
 hit(a,b,padding=.65){
  const visited=new Set();
  for(let ix=Math.floor((Math.min(a.x,b.x)-padding)/64);ix<=Math.floor((Math.max(a.x,b.x)+padding)/64);ix++)for(let iz=Math.floor((Math.min(a.z,b.z)-padding)/64);iz<=Math.floor((Math.max(a.z,b.z)+padding)/64);iz++){
   for(const t of this.cells.get(ix+','+iz)||[]){
    if(visited.has(t))continue;visited.add(t);
    if(this.groundAt)t.y=this.groundAt(t.x,t.z)+t.foundationOffset;
    if(Math.min(a.y,b.y)>t.y+t.height+padding||Math.max(a.y,b.y)<t.y-padding)continue;
    const ellipsoid=(cy,ry,r)=>{
     const ax=(a.x-t.x)/r,ay=(a.y-cy)/ry,az=(a.z-t.z)/r,dx=(b.x-a.x)/r,dy=(b.y-a.y)/ry,dz=(b.z-a.z)/r;
     const l=dx*dx+dy*dy+dz*dz,f=Math.max(0,Math.min(1,l?-(ax*dx+ay*dy+az*dz)/l:0));
     return (ax+dx*f)**2+(ay+dy*f)**2+(az+dz*f)**2<=1;
    };
    if(ellipsoid(t.y+t.height*.72,t.height*.3+padding,t.radius+padding)||ellipsoid(t.y+t.height*.35,t.height*.4+padding,t.trunk+padding))return t;
   }
  }
  return null;
 }
}
function treeStrike(index,from,to,right,span=5){
 if(!index)return null;
 for(const offset of [0,-span,span]){
  const a=from.clone().addScaledVector(right,offset),b=to.clone().addScaledVector(right,offset);
  const hit=index.hit(a,b);if(hit)return hit;
 }
 // The leading edge itself can hit a trunk between the three swept samples.
 return index.hit(to.clone().addScaledVector(right,-span),to.clone().addScaledVector(right,span),.35);
}
class Navigation{
 constructor(canvas,contacts,changed){
  this.canvas=canvas;this.contacts=contacts;this.changed=changed;this.selected=null;this.mode='AUTO';this.markers=[];
  const button=document.createElement('button');button.className='navSelect';button.textContent='TARGET / RTB';button.type='button';button.title='Choose a radar contact or return to base';
  const panel=document.createElement('div');panel.className='navChoices';panel.hidden=true;
  canvas.after(button,panel);this.button=button;this.panel=panel;
  button.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();this.open();});
  canvas.style.touchAction='none';canvas.title='Tap a contact to select it';
  canvas.addEventListener('pointerdown',e=>{
   e.preventDefault();e.stopPropagation();const box=canvas.getBoundingClientRect(),x=(e.clientX-box.left)*canvas.width/box.width,y=(e.clientY-box.top)*canvas.height/box.height;
   const near=this.markers.filter(m=>Math.hypot(m.x-x,m.y-y)<12).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));
   if(near.length===1)this.choose(near[0].contact);else this.open(near.length?near.map(m=>m.contact):null);
  });
 }
 reset(){this.selected=null;this.mode='AUTO';this.panel.hidden=true;this.button.textContent='TARGET / RTB';this.button.title='Choose a radar contact or return to base';}
 choose(c){this.selected=c?.ref||null;this.mode=c?.kind==='BASE'?'BASE':c?'SELECT':'AUTO';this.button.textContent=c?.kind==='BASE'?'RTB':c?c.kind+' SELECTED':'TARGET / RTB';this.button.title=c?.label||'Choose a radar contact or return to base';this.panel.hidden=true;this.changed();}
 open(choices=null){
  this.panel.replaceChildren();
  const items=[{label:'AUTO — MISSION',auto:true},...choices||this.contacts()];
  for(const c of items){const b=document.createElement('button');b.type='button';b.textContent=c.label+(c.range?' · '+c.range:'');b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();this.choose(c.auto?null:c);});this.panel.append(b);}
  this.panel.hidden=!this.panel.hidden;
 }
 resolve(fallback){
  const all=this.contacts();
  if(this.mode==='BASE')return all.find(c=>c.kind==='BASE')||fallback;
  if(this.mode==='SELECT'){
   const c=all.find(c=>c.ref===this.selected);if(c)return c;
   this.reset();
  }
  return fallback;
 }
 paint(ctx,put,center,radius){
  this.markers=[];
  for(const contact of this.contacts()){
   const p=put(contact.pos.x,contact.pos.z),dx=p[0]-center,dy=p[1]-center,l=Math.hypot(dx,dy),f=l>radius?radius/l:1,x=center+dx*f,y=center+dy*f;
   ctx.fillStyle=contact.kind==='BASE'?'#8ed77e':contact.kind==='RECON'?'#80d5ee':contact.kind==='BANDIT'||contact.kind==='BOMBER'?'#ff694e':'#ebbf5b';
   ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();
   if(contact.ref===this.selected||this.mode==='BASE'&&contact.kind==='BASE'){ctx.strokeStyle='#fff4c5';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.stroke();}
   this.markers.push({x,y,contact});
  }
 }
}
root.FlightSupport={surfaceHit,skinHeight,TreeIndex,treeStrike,Navigation};
})(typeof window==='undefined'?globalThis:window);
