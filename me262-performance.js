/* Gameplay balance against the assisted P-47; simplified jet energy model.
 * Build 232: pitchCeiling() - how steeply the ARCADE Me 262 may climb right now. It shares dragOf() with step(), so the
 * ceiling and the energy model cannot disagree: at the ceiling the thrust surplus plus the speed that can be spent
 * over a few seconds just pays for the climb. See FLIGHT-AND-SOUND.md. */
(function(global){
 'use strict';
 const data={maxSpeed:242,thrust:4.8,spoolSeconds:2.6};
 const G=9.81;
 // Game decisions (class C, tune here): the nose never has to drop below `floor` (landing flare, idle pull-up),
 // the speed above `protect` x the stall speed may be traded for height over `horizon` seconds.
 // `minRate` (rad/s): the sheet's lift limit leaves the Me 262 only the global 0.25 rad/s pitch floor (14 deg/s) below 80 m/s - the slowest
 // nose in the fleet (Bf 109: 24 deg/s at 65 m/s). ARCADE lifts it to what the type already gets at 100 m/s.
 const climb={floor:.26,protect:1.2,horizon:10,minRate:.40};
 function dragOf(p,speed,options){
  const bank=Math.abs(Math.sin(options.bank||0));
  return data.thrust*(speed/data.maxSpeed)**2+bank*bank*.8+(p.gear||0)*.7+(options.flaps||0)*1.2+(options.drag||0)*.15;
 }
 function thrustOf(p,options){
  const mass=Math.max(.8,options.loadRatio||1);
  return data.thrust*(p.groundPower||0)*Math.max(0,options.power??1)/mass;
 }
 function step(p,dt,options={}){
  const throttle=Math.max(0,Math.min(1,p.throttle||0));
  p.groundPower=(p.groundPower||0)+(throttle-(p.groundPower||0))*(1-Math.exp(-dt/data.spoolSeconds));
  const speed=Math.max(0,p.spd||0);
  p.spd=Math.max(6,speed+(thrustOf(p,options)-dragOf(p,speed,options)-G*Math.sin(p.pitch||0))*dt);
  return p.spd;
 }
 // Steepest nose-up attitude (rad) the aircraft can hold without bleeding into the stall:
 //   sin(ceiling) = (thrust surplus + (speed - protect x stall) / horizon) / g,   limited to [floor, options.limit].
 // The first term is what the engines sustain in this configuration (gear, flaps, bank, load, damage); the second is
 // the speed above the protected margin, spent over `horizon` seconds - so a zoom climb is possible while there is
 // speed to spend and settles at the sustained angle as it is used up. Without options.stall the speed term is 0.
 function pitchCeiling(p,options={}){
  const speed=Math.max(0,p.spd||0),limit=options.limit??Math.PI/2,floor=Math.min(limit,options.floor??climb.floor);
  const surplus=thrustOf(p,options)-dragOf(p,speed,options);
  const protectedSpeed=(options.protect??climb.protect)*(options.stall>0?options.stall:Infinity);
  const spend=Number.isFinite(protectedSpeed)?Math.max(0,speed-protectedSpeed)/(options.horizon??climb.horizon):0;
  const s=Math.max(-1,Math.min(1,(surplus+spend)/G));
  return Math.max(floor,Math.min(limit,Math.asin(s)));
 }
 // Pitch-rate cap (rad/s) for the ARCADE Me 262: the envelope's own cap, but never below `minRate` while the wing flies.
 // The extra rate fades out between 1.0 and 1.15 x the stall speed, so it never helps a stalled wing; the energy
 // ceiling above is what keeps the speed, a quicker nose cannot spend more than that.
 function pitchRateCap(base,speed,stall){
  const fade=stall>0?Math.max(0,Math.min(1,(speed/stall-1)/.15)):0;
  return Math.max(base,climb.minRate*fade);
 }
 global.Me262Performance={data,climb,step,dragOf,thrustOf,pitchCeiling,pitchRateCap};
 if(typeof module==='object'&&module.exports)module.exports=global.Me262Performance;
})(typeof window==='undefined'?globalThis:window);
