/* Mission choreography and damage, independent of the confirmed player controls. */
(function(root){
'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
// Gameplay mass fractions, not certified aircraft weights. Reference loading is
// half an internal tank and no external stores. Existing stick modes are retained.
const loadProfiles={
 p47:{fuel:.12,bomb:.045,rocket:.0025,tank:.028,tankFuel:.07},
 bf109:{fuel:.11,bomb:.085,rocket:.002,tank:.022,tankFuel:.0825}, // tankFuel: 300 l at the 400 l internal fraction
 fw190:{fuel:.12,bomb:.065,rocket:.0025,tank:.025,tankFuel:.06},
 ju87:{fuel:.12,bomb:.055,rocket:.002},me262:{fuel:.14,bomb:.055,rocket:.002},
 me163:{fuel:.20,bomb:0,rocket:0},
 avenger:{fuel:.15,bomb:.040,torpedo:.095},sbd:{fuel:.12,bomb:.045},
 corsair:{fuel:.12,bomb:.040,rocket:.0025},zero:{fuel:.10,bomb:.045,torpedo:0}
};
const Handling={
 // Normal final approach (m/s), not touchdown speed; gameplay reference loading.
 fieldLanding:{p47:{reference:130*.44704,cleanAdd:5.4,flapGain:6},bf109:{reference:105.5*.44704,cleanAdd:6,flapGain:7}, // Bf 109 F: G-6 110 MPH x sqrt(180/195 kg/m2) from the PDF wing loadings
  fw190:{reference:125*.44704,cleanAdd:6,flapGain:7},ju87:{reference:150/3.6,cleanAdd:6.5,flapGain:7},
  me262:{reference:230/3.6,cleanAdd:8,flapGain:5},me163:{reference:200/3.6,cleanAdd:9,flapGain:10}},
 configure(p,kind,weapon='bomb',theatre='europe'){p.loadProfile={kind,weapon,theatre};},
 configuration(p,stall){
  const kind=p.loadProfile?.kind||p.ac,gear=kind==='ju87'?0:clamp(p.gear||0,0,1),flap=Damage.controls(p).flaps.mean;
  const slow=clamp((1.95-p.spd/Math.max(1,stall))/.85,0,1);
  return {authority:1-(gear*.13+flap*.17)*(.45+.55*slow),bank:1-(gear*.10+flap*.12)*slow,
   gFactor:1-(gear*.12+flap*.14)*slow,climb:1-gear*.10-flap*.12};
 },
 beginDeparture(p){p.departureAge=0;},
 departure(p,dt,stall){
  if(p.departureAge==null)return {release:1,rate:Infinity,acceleration:Infinity};
  p.departureAge+=dt;
  const kind=p.loadProfile?.kind||p.ac;
  const initial={p47:17.5,bf109:12,fw190:11,ju87:7.5,me262:14,me163:24,avenger:8,sbd:8.5,corsair:12,zero:11}[kind]||9;
  const climbSpeed={p47:92,bf109:105,fw190:108,ju87:78,me262:140,me163:200,avenger:90,sbd:86,corsair:110,zero:94}[kind]||100;
  // Only airspeed opens the envelope: waiting or gaining height cannot release it.
  const entry=stall*1.12,phase=clamp((p.spd-entry)/Math.max(15,climbSpeed-entry),0,1),release=phase*phase*(3-2*phase);
  const rate=(initial+Math.max(0,p.spd-entry)*.16)*(.35+.65*clamp(p.throttle||0,0,1))*Damage.power(p);
  if(release>=1)p.departureAge=null;
  const acceleration={p47:4.5,bf109:3.8,fw190:3.5,ju87:2,me262:5,me163:8,avenger:2.2,sbd:2.4,corsair:3.8,zero:3.6}[kind]||3;
  return {release,rate,acceleration};
 },
 sample(p){
  const config=p.loadProfile,profile=config&&loadProfiles[config.kind];
  if(!profile)return {ratio:1,speed:1,acceleration:1,climb:1,turn:1,inertia:1,stores:0};
  let stores=Math.max(0,p.bombs||0)*(profile.bomb||0)+Math.max(0,p.rockets||0)*(profile.rocket||0);
  if(p.torps)stores+=Math.max(0,p.torps)*(config.weapon==='torpedo'?(profile.torpedo||0):(profile.bomb||0));
  if(p.tankAttached)stores+=(profile.tank||0)+(profile.tankFuel||0)*clamp((p.tankFuel||0)/(p.tankCapacity||60),0,1);
  const ratio=clamp(1+profile.fuel*(clamp(p.fuel??50,0,100)/100-.5)+stores,.90,1.24);
  return {ratio,speed:Math.sqrt(ratio),acceleration:1/ratio,climb:clamp(1-(ratio-1)*.65,.84,1.07),
   turn:1/Math.sqrt(ratio),inertia:1/Math.pow(ratio,.35),stores};
 },
 speeds(p,stall,reference,flapGain=4,gearGain=2){
  const load=this.sample(p),controls=Damage.controls(p),kind=p.loadProfile?.kind||p.ac;
  const field=p.loadProfile?.theatre==='europe'?this.fieldLanding[kind]:null;
  const carrier=p.loadProfile?.theatre==='pacific'&&root.FlightDynamics?.profiles[kind];
  if(carrier){stall=carrier.stall??stall;reference=carrier.reference??reference;}
  if(kind==='p47'&&root.P47Performance){const speeds=root.P47Performance.speeds(p,controls.flaps.mean,load.ratio,controls.stallPenalty);speeds.reference*=1+controls.flaps.asymmetry*.08;return speeds;}
  const limit=(stall+(p.gear||0)*gearGain-controls.flaps.mean*(field?.flapGain??flapGain))*load.speed+controls.stallPenalty;
  let target=field?field.reference+field.cleanAdd*(1-controls.flaps.mean):reference;
  if(field&&kind==='p47'&&(p.throttle||0)<.05)target+=2.2;
  target*=load.speed*(1+controls.flaps.asymmetry*.08);
  if(field)target=Math.max(target,limit*1.25);
  return {stall:limit,warning:limit*1.15,reference:target,
   low:p.spd<limit*1.15,stalled:p.spd<limit};
 },
 fieldSink(p,stall){
  const controls=Damage.controls(p),speed=Math.max(1,p.spd),supported=stall*1.10;
  const deficit=clamp(1-speed*speed/(supported*supported),0,1);
  return deficit*20+controls.flaps.mean*.65*(1-clamp(p.throttle||0,0,1));
 }
};
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
 reset(p,maxHull=100){p.systemDamage={fuelLeak:0,engine:1,gearLock:null,taken:0,next:18,maxHull,smokeT:0,
  surfaces:{aileronLeft:1,aileronRight:1,elevator:1,flapLeft:null,flapRight:null}};},
 hit(p,amount,cause='',random=Math.random){
  const s=p.systemDamage;if(!s||!p.alive)return null;
  s.taken+=Math.max(0,amount);
  if(s.taken<s.next||p.hull>s.maxHull*.8)return null;
  s.next=s.taken+26;
  const roll=random(),fixed=p.ac==='ju87'||p.ac==='me163';
  // Preserve the previous system failures; a bounded portion of serious hits
  // now damages a particular control surface instead of another generic fault.
  if(p.loadProfile&&roll>=.82&&roll<.94){
   const left=roll<.84||roll>=.90&&roll<.92;
   const type=roll<.86?'aileron':roll<.90?'elevator':loadProfiles[p.loadProfile.kind]?.flaps===false?'aileron':'flap';
   return this.surfaceHit(p,type,left?'left':'right',.32);
  }
  if(roll<.4){s.fuelLeak=Math.min(.16,s.fuelLeak+.07);return 'FUEL LEAK — RETURN TO BASE';}
  if(roll<.78||fixed){s.engine=Math.max(.68,s.engine-.14);return 'ENGINE HIT — POWER REDUCED';}
  if(s.gearLock==null){s.gearLock=clamp(p.gear||0,0,1);return s.gearLock<.6?'GEAR JAMMED UP — GENTLE BELLY LANDING REQUIRED':'GEAR JAMMED DOWN — EXPECT DRAG';}
  s.fuelLeak=Math.min(.16,s.fuelLeak+.04);return 'WING TANK HIT — FUEL LEAK WORSENING';
 },
 power(p){return p.systemDamage?.engine??1;},
 surfaceHit(p,type,side='left',severity=.32){
  if(!p.systemDamage||!p.alive)return null;
  const s=p.systemDamage.surfaces||(p.systemDamage.surfaces={aileronLeft:1,aileronRight:1,elevator:1,flapLeft:null,flapRight:null});
  const suffix=side==='left'?'Left':'Right',label=side.toUpperCase();
  if(type==='flap'){
   if(loadProfiles[p.loadProfile?.kind||p.ac]?.flaps===false)return null;
   const key='flap'+suffix;if(s[key]!=null)return null;s[key]=clamp(p.flap||0,0,1);
   return label+' FLAP JAMMED — EXPECT ASYMMETRIC LIFT';
  }
  if(type==='elevator'){s.elevator=Math.max(.55,s.elevator-clamp(severity,.05,.45));return 'ELEVATOR HIT — REDUCED PITCH AUTHORITY';}
  if(type==='aileron'){const key='aileron'+suffix;s[key]=Math.max(.45,s[key]-clamp(severity,.05,.45));return label+' AILERON HIT — COUNTER WITH STICK';}
  return null;
 },
 controls(p){
  const s=p.systemDamage?.surfaces,flap=clamp(p.flap||0,0,1),left=s?.flapLeft??flap,right=s?.flapRight??flap;
  const aL=s?.aileronLeft??1,aR=s?.aileronRight??1,pitch=s?.elevator??1,roll=(aL+aR)/2,asymmetry=Math.abs(left-right);
  // Both player conventions bank the pilot's LEFT wing down for positive roll:
  // Rhine noses +Z / rotates -roll, Pacific noses -Z / rotates +roll.
  const sign=-1;
  return {roll,pitch,bias:clamp(((aL-aR)*.06+(left-right)*.14)*sign,-.16,.16),
   drag:asymmetry*5+(1-roll)*2,stallPenalty:asymmetry*2+(1-roll)*1.5,
   flaps:{left,right,mean:(left+right)/2,asymmetry}};
 },
 hullPercent(p){return Math.round(clamp(p.hull/(p.systemDamage?.maxHull||100)*100,0,100));},
 gearLocked(p){return p.systemDamage?.gearLock!=null;},
 needsBelly(p){return this.gearLocked(p)&&p.systemDamage.gearLock<.6;},
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
  const surface=s.surfaces||{};
  return [s.fuelLeak?'FUEL LEAK':'',s.engine<1?'ENGINE '+Math.round(s.engine*100)+'%':'',s.gearLock!=null?'GEAR JAM '+(s.gearLock<.6?'UP':'DOWN'):'',
   surface.aileronLeft<1?'L AILERON':'',surface.aileronRight<1?'R AILERON':'',surface.elevator<1?'ELEVATOR':'',
   surface.flapLeft!=null?'L FLAP JAM':'',surface.flapRight!=null?'R FLAP JAM':''].filter(Boolean).join(' · ');
 },
 belly(p,sink,speedLimit){return p.systemDamage?.gearLock!=null&&p.systemDamage.gearLock<.6&&sink<3&&p.spd<speedLimit&&Math.abs(p.roll)<.16&&Math.abs(p.pitch)<.18;}
};
root.SortieFeatures={flyRaider,segmentDistance,Damage,Handling};
})(typeof window!=='undefined'?window:globalThis);
