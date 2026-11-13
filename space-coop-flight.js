/* Shared flight and mission rules for the 3D co-op sortie. All distances are in metres. */
(function(root){
 'use strict';
 const RADIUS=2600, MAX_SHIELD=4, SHOT_SPEED=430;
 const clamp=(x,min,max)=>Math.max(min,Math.min(x,max));
 function randomFor(seed){
  let state=seed>>>0;
  return ()=>((state=(Math.imul(1664525,state)+1013904223)>>>0)/4294967296);
 }
 function createWorld(T,seed){
  const random=randomFor(seed),vector=(x,y,z)=>new T.Vector3(x,y,z);
  const shuttle=vector(410,100,-750),station=vector(570,210,-490),gate=vector(-540,-160,-1020);
  const boss=vector(-660,-40,-1400);
  const cells=[vector(195,225,-635),vector(745,35,-865)];
  const protectedPoints=[vector(0,0,0),shuttle,station,gate,boss,...cells];
  const rocks=[];
  for(let i=0;i<125;i++){
   const rock={position:vector((random()-.5)*3400,(random()-.5)*2300,-600+(random()-.5)*3300),
    radius:13+random()**2*76,angle:random()*Math.PI*2};
   if(rock.position.length()>RADIUS-100)continue;
   if(protectedPoints.some(p=>p.distanceTo(rock.position)<rock.radius+110))continue;
   rocks.push(rock);
  }
  return {shuttle,station,gate,boss,cells,rocks};
 }
 function pilot(T,index){
  return {position:new T.Vector3(index?22:-22,0,0),rotation:new T.Quaternion(),
   speed:65,throttle:.45,fire:false,boost:false,boostTime:0,cooldown:0,bank:0};
 }
 function flight(T){
  const turn=new T.Quaternion(),euler=new T.Euler(0,0,0,'YXZ'),forward=new T.Vector3();
  return function step(p,input,dt){
   p.cooldown=Math.max(0,p.cooldown-dt);
   if(input.boost&&p.cooldown===0){p.boostTime=.85;p.cooldown=3.5;}
   p.boostTime=Math.max(0,p.boostTime-dt);
   p.boost=p.boostTime>0;
   p.throttle=clamp(input.throttle,0,1);p.fire=!!input.fire;
   const targetSpeed=28+82*p.throttle+(p.boost?72:0);
   p.speed+=(targetSpeed-p.speed)*(1-Math.exp(-dt*3.8));
   // Rotate around the jet's own axes. Releasing the stick eases the visual bank.
   const pitch=clamp(input.pitch||0,-1,1),yaw=clamp(input.yaw||0,-1,1),roll=clamp(input.roll||0,-1,1);
   euler.set(pitch*1.65*dt,-yaw*1.48*dt,-roll*2.25*dt);
   p.rotation.multiply(turn.setFromEuler(euler)).normalize();
   p.bank+=(-yaw*.55-p.bank)*(1-Math.exp(-dt*7));
   forward.set(0,0,-1).applyQuaternion(p.rotation);
   p.position.addScaledVector(forward,p.speed*dt);
   if(p.position.lengthSq()>RADIUS*RADIUS)p.position.setLength(RADIUS);
  };
 }
 function packPilot(p){
  return [...p.position.toArray(),...p.rotation.toArray(),p.speed,p.throttle,+p.fire,+p.boost,p.bank]
   .map(n=>Math.round(n*10000)/10000);
 }
 function readPilot(p,data){
  if(!Array.isArray(data)||data.length!==12||!data.every(Number.isFinite))return false;
  const [x,y,z,qx,qy,qz,qw,speed,throttle,fire,boost,bank]=data;
  const norm=qx*qx+qy*qy+qz*qz+qw*qw;
  if(x*x+y*y+z*z>(RADIUS+1)**2||norm<.95||norm>1.05)return false;
  p.position.set(x,y,z);p.rotation.set(qx,qy,qz,qw).normalize();
  p.speed=clamp(speed,0,182);p.throttle=clamp(throttle,0,1);
  p.fire=fire===1;p.boost=boost===1;p.bank=clamp(bank,-.6,.6);
  return true;
 }
 function mission(T,world,seed){
  const random=randomFor(seed^0xb5f12ad),vector=(x,y,z)=>new T.Vector3(x,y,z);
  const forward=vector(0,0,-1),delta=vector(),segment=vector(),nearest=vector();
  const shuttle=world.shuttle.clone();
  const shields=[MAX_SHIELD,MAX_SHIELD],down=[false,false],recovery=[0,0],impact=[0,0],fire=[0,0];
  const cells=[false,false],generators=[3,3];let core=8,escort=10,stage='search',spawn=1.5,time=0,nextId=1;
  const drones=[],shots=[];
  const nodes=[world.boss.clone().add(vector(-56,12,22)),world.boss.clone().add(vector(56,12,22))];
  const corePosition=world.boss.clone().add(vector(0,0,23));
  function shot(p,v,enemy){
   if(shots.length>=42)return;
   shots.push({id:nextId++,position:p.clone(),velocity:v.clone(),life:2.35,enemy});
  }
  function hit(i){
   if(impact[i]>0||down[i])return;
   shields[i]--;impact[i]=1.2;
   if(shields[i]===0)down[i]=true;
  }
  function reaches(a,b,target,r){
   segment.subVectors(b,a);
   const t=clamp(nearest.subVectors(target,a).dot(segment)/(segment.lengthSq()||1),0,1);
   return nearest.copy(a).addScaledVector(segment,t).distanceToSquared(target)<r*r;
  }
  const close=(p,target,r)=>p.position.distanceToSquared(target)<r*r;
  function step(pilots,dt){
   if(stage==='won'||stage==='lost')return;
   time+=dt;
   for(const [i,p] of pilots.entries()){
    impact[i]=Math.max(0,impact[i]-dt);
    fire[i]-=dt;
    const wingman=pilots[1-i];
    if(down[i]&&!down[1-i]&&close(wingman,p.position,105)){
     recovery[i]+=dt;
     if(recovery[i]>=2){down[i]=false;shields[i]=2;impact[i]=3;}
    }else recovery[i]=0;
    if(down[i])continue;
    if(world.rocks.some(rock=>close(p,rock.position,rock.radius*.84+4)))hit(i);
    if(close(p,world.station,75)&&shields[i]<MAX_SHIELD&&impact[i]===0){
     shields[i]++;impact[i]=1.2;
    }
    if(p.fire&&fire[i]<=0){
     delta.copy(forward).applyQuaternion(p.rotation);
     shot(nearest.copy(p.position).addScaledVector(delta,11),delta.multiplyScalar(SHOT_SPEED+p.speed),false);
     fire[i]=.18;
    }
   }
   if(down.every(Boolean)){stage='lost';return;}
   const active=pilots.filter((_,i)=>!down[i]);
   if(stage==='search'&&active.some(p=>close(p,shuttle,180)))stage='recover';
   if(stage==='recover'){
    for(const [i,cell] of world.cells.entries())if(active.some(p=>close(p,cell,64)))cells[i]=true;
    if(cells.every(Boolean))stage='return';
   }
   if(stage==='return'&&active.some(p=>close(p,shuttle,115)))stage='escort';
   if(stage==='escort'&&active.some(p=>close(p,shuttle,310))){
    delta.subVectors(world.gate,shuttle);
    if(delta.length()<8)stage='boss';
    else shuttle.addScaledVector(delta.normalize(),43*dt);
   }
   if(stage!=='search'&&drones.length<5&&(spawn-=dt)<=0){
    spawn=stage==='boss'?6:4.5;
    const anchor=stage==='boss'?world.boss:shuttle;
    drones.push({id:nextId++,position:anchor.clone().add(vector((random()-.5)*400,(random()-.5)*350,-210)),
     direction:vector(0,0,1),health:2,fire:2+random()*2,phase:random()*6.28});
   }
   for(const drone of drones){
    const target=stage==='escort'&&drone.id%3===0?shuttle:
     active.reduce((a,b)=>a.position.distanceToSquared(drone.position)<b.position.distanceToSquared(drone.position)?a:b).position;
    delta.subVectors(target,drone.position);
    const distance=delta.length();
    if(distance>35)drone.direction.lerp(delta.normalize(),1-Math.exp(-dt*2.4)).normalize();
    drone.position.addScaledVector(drone.direction,(distance>65?77:48)*dt);
    drone.position.y+=Math.sin(time*1.7+drone.phase)*10*dt;
    if((drone.fire-=dt)<=0&&distance>22&&distance<340){
     delta.subVectors(target,drone.position).normalize();
     shot(nearest.copy(drone.position).addScaledVector(delta,8),delta.multiplyScalar(183),true);
     drone.fire=2.4;
    }
   }
   for(let i=shots.length-1;i>=0;i--){
    const bullet=shots[i],p=bullet.position;
    delta.copy(p);p.addScaledVector(bullet.velocity,dt);bullet.life-=dt;
    if(bullet.life<=0||world.rocks.some(r=>reaches(delta,p,r.position,r.radius*.79))){shots.splice(i,1);continue;}
    if(bullet.enemy){
     const player=pilots.findIndex((jet,j)=>!down[j]&&reaches(delta,p,jet.position,9));
     if(player>=0){hit(player);shots.splice(i,1);}
     else if(stage==='escort'&&reaches(delta,p,shuttle,21)){
      escort--;shots.splice(i,1);if(!escort){stage='lost';return;}
     }
     continue;
    }
    const drone=drones.findIndex(d=>reaches(delta,p,d.position,14));
    if(drone>=0){
     if(--drones[drone].health===0)drones.splice(drone,1);
     shots.splice(i,1);continue;
    }
    if(stage==='boss'){
     const node=nodes.findIndex((pos,j)=>generators[j]&&reaches(delta,p,pos,18));
     if(node>=0){generators[node]--;shots.splice(i,1);}
     else if(!generators.some(Boolean)&&reaches(delta,p,corePosition,18)){
      core--;shots.splice(i,1);if(!core){stage='won';return;}
     }
    }
   }
  }
  function snapshot(){
   const xyz=v=>v.toArray().map(x=>Math.round(x*10)/10);
   return {stage,shields:[...shields],down:[...down],cells:[...cells],generators:[...generators],core,escort,shuttle:xyz(shuttle),
    drones:drones.map(d=>[d.id,...xyz(d.position),...xyz(d.direction)]),
    shots:shots.map(s=>[s.id,...xyz(s.position),...xyz(s.velocity),+s.enemy])};
  }
  return {step,snapshot,nodes};
 }
 const api={RADIUS,MAX_SHIELD,createWorld,pilot,flight,packPilot,readPilot,mission};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.SpaceCoopFlight=api;
})(globalThis);
