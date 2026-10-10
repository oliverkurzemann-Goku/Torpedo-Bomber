/* Ground acceleration in metres/second. Airborne handling remains in each game. */
(function(root){
 'use strict';
 function step(p,dt,options={}){
  dt=Math.max(0,Math.min(.05,dt));
  const throttle=Math.max(0,Math.min(1,p.throttle||0));
  const spoolTime=options.jet?2.6:1.1;
  p.groundPower=(p.groundPower||0)+(throttle-(p.groundPower||0))*(1-Math.exp(-dt/spoolTime));
  const speed=Math.max(0,p.spd||0),power=options.power??1;
  const thrust=(options.carrier?9.5:options.jet?4.8:5.5)*p.groundPower*power;
  const drag=.28+speed*speed*(options.carrier?.0011:.0010);
  const brake=throttle<.05?58:0;
  p.spd=Math.max(0,Math.min(options.limit||90,speed+(thrust-drag-brake)*dt));
  return p.spd;
 }
 root.GroundRun={step};if(typeof module==='object'&&module.exports)module.exports=root.GroundRun;
})(typeof window==='undefined'?globalThis:window);
