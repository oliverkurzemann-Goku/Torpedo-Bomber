/* Gameplay balance against the assisted P-47; simplified jet energy model. */
(function(global){
 'use strict';
 const data={maxSpeed:242,thrust:4.8,spoolSeconds:2.6};
 function step(p,dt,options={}){
  const throttle=Math.max(0,Math.min(1,p.throttle||0));
  p.groundPower=(p.groundPower||0)+(throttle-(p.groundPower||0))*(1-Math.exp(-dt/data.spoolSeconds));
  const mass=Math.max(.8,options.loadRatio||1),speed=Math.max(0,p.spd||0);
  const thrust=data.thrust*p.groundPower*Math.max(0,options.power??1)/mass;
  const bank=Math.abs(Math.sin(options.bank||0));
  const drag=data.thrust*(speed/data.maxSpeed)**2+bank*bank*.8+(p.gear||0)*.7+(options.flaps||0)*1.2+(options.drag||0)*.15;
  p.spd=Math.max(6,speed+(thrust-drag-9.81*Math.sin(p.pitch||0))*dt);
  return p.spd;
 }
 global.Me262Performance={data,step};
 if(typeof module==='object'&&module.exports)module.exports=global.Me262Performance;
})(typeof window==='undefined'?globalThis:window);
