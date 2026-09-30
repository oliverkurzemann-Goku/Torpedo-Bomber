/* Radio guidance only: never changes navigation arrows, aircraft AI or controls. */
(function(root){
 'use strict';
 function solution(player,target){
  const p=player.pos,q=target.pos,rx=q.x-p.x,rz=q.z-p.z,v=target.vel||{x:0,z:0};
  const speed=Math.max(1,(player.spd||0)*Math.abs(Math.cos(player.pitch||0))),a=v.x*v.x+v.z*v.z-speed*speed;
  const b=2*(rx*v.x+rz*v.z),c=rx*rx+rz*rz;
  let time=Infinity;
  if(Math.abs(a)<1e-6){if(b<0)time=-c/b;}
  else{
   const disc=b*b-4*a*c;
   if(disc>=0)for(const t of [(-b-Math.sqrt(disc))/(2*a),(-b+Math.sqrt(disc))/(2*a)])
    if(t>=0&&t<time)time=t;
  }
  const solved=Number.isFinite(time)&&time<=180;
  const x=rx+(solved?v.x*time:0),z=rz+(solved?v.z*time:0);
  const course=(Math.atan2(x,z)*180/Math.PI+360)%360;
  const delta=q.y-p.y,feet=Math.round(Math.abs(delta)*3.28084/100)*100;
  const vertical=Math.abs(delta)<60?'LEVEL':(delta>0?'CLIMB ':'DESCEND ')+feet.toLocaleString('en-US')+' FT';
  return {time,solved,course,range:Math.hypot(rx,rz),altitude:q.y,vertical};
 }
 function create(){
  let timer=8,tracked=null;
  return {
   reset(){timer=8;tracked=null;},
   tick(dt,player,contacts,busy=false){
    timer=Math.max(0,timer-dt);
    if(timer>0||busy||player.onGround||!player.alive||player.spd<45)return null;
    const eligible=contacts.filter(e=>e.alive&&e.pos&&Math.hypot(e.pos.x-player.pos.x,e.pos.z-player.pos.z)<=15000);
    if(!eligible.includes(tracked))tracked=eligible.filter(e=>e.bomber).sort((a,b)=>
      Math.hypot(a.pos.x-player.pos.x,a.pos.z-player.pos.z)-Math.hypot(b.pos.x-player.pos.x,b.pos.z-player.pos.z))[0]
      ||eligible.sort((a,b)=>Math.hypot(a.pos.x-player.pos.x,a.pos.z-player.pos.z)-Math.hypot(b.pos.x-player.pos.x,b.pos.z-player.pos.z))[0];
    if(!tracked){timer=4;return null;}
    const s=solution(player,tracked);timer=20;
    if(s.range<700)return null; // no chatter during a close gun pass
    return 'CONTROL — '+(tracked.bomber?'BOMBERS':'BANDIT')+' '+(s.range/1000).toFixed(1)+' KM · ALT '
      +Math.round(s.altitude*3.28084/100)*100+' FT MSL · '+(s.solved?'INTERCEPT ':'CONTACT ')
      +String(Math.round(s.course)%360).padStart(3,'0')+'° · '+s.vertical+(s.solved?'':' — GAIN SPEED');
   }
  };
 }
 root.RadioIntercept={solution,create};
 if(typeof module==='object'&&module.exports)module.exports=root.RadioIntercept;
})(typeof window!=='undefined'?window:globalThis);
