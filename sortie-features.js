/* Mission choreography and damage, independent of the confirmed player controls. */
(function(root){
'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
function flyRaider(r,goal,dt){
 const dx=goal.x-r.pos.x,dz=goal.z-r.pos.z,d=Math.hypot(dx,dz);
 const bank=clamp(angle(Math.atan2(dx,dz)-r.heading)*1.6,-.78,.78);
 r.roll+=(bank-r.roll)*(1-Math.exp(-2.1*dt));
 r.spd+=((r.dropped?82:r.runIn?76:72)-r.spd)*(1-Math.exp(-.35*dt));
 r.heading+=clamp(9.81*Math.tan(r.roll)/Math.max(55,r.spd),-.2,.2)*dt;
 r.pitch+=(clamp(Math.atan2(goal.y-r.pos.y,Math.max(180,d)),-.20,.16)-r.pitch)*(1-Math.exp(-1.3*dt));
 r.vel.set(Math.sin(r.heading)*Math.cos(r.pitch)*r.spd,Math.sin(r.pitch)*r.spd,Math.cos(r.heading)*Math.cos(r.pitch)*r.spd);
 r.pos.addScaledVector(r.vel,dt);
 if(r.pos.y<32){r.pos.y=32;r.pitch=Math.max(.03,r.pitch);r.vel.y=Math.max(2,r.vel.y);}
}
function segmentDistance(a,b,p){
 const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z;
 const t=clamp(((p.x-a.x)*x+(p.y-a.y)*y+(p.z-a.z)*z)/(x*x+y*y+z*z||1),0,1);
 return Math.hypot(a.x+x*t-p.x,a.y+y*t-p.y,a.z+z*t-p.z);
}
const Damage={
 reset(p,maxHull=100){p.systemDamage={fuelLeak:0,engine:1,gearLock:null,taken:0,next:18,maxHull,smokeT:0};},
 hit(p,amount,cause='',random=Math.random){
  const s=p.systemDamage;if(!s||!p.alive)return null;
  s.taken+=Math.max(0,amount);
  if(s.taken<s.next||p.hull>s.maxHull*.8)return null;
  s.next=s.taken+26;
  const roll=random(),fixed=p.ac==='ju87'||p.ac==='me163';
  if(roll<.4){s.fuelLeak=Math.min(.16,s.fuelLeak+.07);return 'FUEL LEAK — RETURN TO BASE';}
  if(roll<.78||fixed){s.engine=Math.max(.68,s.engine-.14);return 'ENGINE HIT — POWER REDUCED';}
  if(s.gearLock==null){s.gearLock=clamp(p.gear||0,0,1);return s.gearLock<.6?'GEAR JAMMED UP — GENTLE BELLY LANDING REQUIRED':'GEAR JAMMED DOWN — EXPECT DRAG';}
  s.fuelLeak=Math.min(.16,s.fuelLeak+.04);return 'WING TANK HIT — FUEL LEAK WORSENING';
 },
 power(p){return p.systemDamage?.engine??1;},
 tick(p,dt){
  const s=p.systemDamage;if(!s)return false;
  if(s.gearLock!=null)p.gearTgt=s.gearLock;
  const leak=s.fuelLeak*Math.max(0,dt);
  if(leak)p.fuel=Math.max(0,p.fuel-leak);
  s.smokeT-=dt;
  if(s.smokeT<=0&&(s.engine<1||s.fuelLeak>0)){s.smokeT=.28;return true;}
  return false;
 },
 status(p){const s=p.systemDamage;if(!s)return '';
  return [s.fuelLeak?'FUEL LEAK':'',s.engine<1?'ENGINE '+Math.round(s.engine*100)+'%':'',s.gearLock!=null?'GEAR JAM':''].filter(Boolean).join(' · ');
 },
 belly(p,sink,speedLimit){return p.systemDamage?.gearLock!=null&&p.systemDamage.gearLock<.6&&sink<3&&p.spd<speedLimit&&Math.abs(p.roll)<.16&&Math.abs(p.pitch)<.18;}
};
root.SortieFeatures={flyRaider,segmentDistance,Damage};
})(typeof window!=='undefined'?window:globalThis);
