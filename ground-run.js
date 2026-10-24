/* Ground acceleration in metres/second. Airborne handling remains in each game. */
(function(root){
 'use strict';
 function step(p,dt,options={}){
  dt=Math.max(0,Math.min(.05,dt));
  const throttle=Math.max(0,Math.min(1,p.throttle||0));
  const spoolTime=options.jet?2.6:1.1;
  p.groundPower=(p.groundPower||0)+(throttle-(p.groundPower||0))*(1-Math.exp(-dt/spoolTime));
  const speed=Math.max(0,p.spd||0),power=options.power??1;
  // Jet calibration must clear the game's 900m strip even with two bombs;
  // retain its slow spool and mass penalty, without an unreachable rotation speed.
  const thrust=(options.acceleration??(options.carrier?9.5:options.jet?6.8:5.5))*p.groundPower*power/(options.massRatio||1);
  const drag=.28+speed*speed*(options.carrier?.0011:.0010);
  const brake=throttle<.05?58:0;
  p.spd=Math.max(0,Math.min(options.limit||90,speed+(thrust-drag-brake)*dt));
  return p.spd;
 }
 function landing(p,dt,options={}){
  dt=Math.max(0,Math.min(.05,dt));
  const speed=Math.max(0,p.spd),throttle=Math.max(0,Math.min(1,p.throttle||0)),run=p.landingRoll;
  if(!run)return {travel:0,stopped:false};
  run.elapsed+=dt;
  p.groundPower=(p.groundPower??throttle)+(throttle-(p.groundPower??throttle))*(1-Math.exp(-dt/(options.jet?2.6:1.1)));
  const rough=options.offField?1.6:1,skid=options.skid||run.belly;
  const drag=rough*((skid?2.1:.85)+speed*speed*(skid?.0015:.0008));
  const brake=skid?0:throttle<.15?1.35*(1-Math.exp(-run.elapsed/.7)):0;
  const thrust=skid?0:(options.jet?6.8:5.5)*p.groundPower*(options.power??1)/(options.massRatio||1);
  p.spd=Math.max(0,speed+(thrust-drag-brake)*dt);
  const travel=(speed+p.spd)*.5*dt;run.travel+=travel;
  return {travel,stopped:p.spd<.65&&run.elapsed>=3};
 }
 root.GroundRun={step,landing};if(typeof module==='object'&&module.exports)module.exports=root.GroundRun;
})(typeof window==='undefined'?globalThis:window);
