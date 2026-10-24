/* P-47D game envelope, SI internally (true airspeed), IAS for pilot references.
 * Primary anchors and approximation boundaries: assets/aircraft/P47-PERFORMANCE.md.
 * 100% throttle uses the 6-Oct-1944 AAF 2600-bhp WEP envelope. Engine thermal,
 * boost-duration, prop-governor and fuel-mixture systems are not simulated.
 */
(function(root){
 'use strict';
 const MPH=.44704,FT=.3048,FPM=.00508,G=9.81;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const data=Object.freeze({variant:'P-47D bubbletop',engine:'Pratt & Whitney R-2800-59',
  wepHP:2600,span:12.42,wingArea:300*.09290304,referenceWeightKg:12731*.45359237,
  ceiling:42000*FT,cleanStallIAS:116*MPH,landingStallIAS:98*MPH,approachIAS:130*MPH,
  // AAF 6-Oct-1944 comparison: 32,000-ft speed was estimated in the original.
  maxSpeed:[[0,345],[10000,383],[20000,417],[32000,435]],
  climb:[[0,3180],[10000,2920],[20000,2470],[32000,1100],[42000,100]]});
 function interpolate(table,feet){
  if(feet<=table[0][0])return table[0][1];
  for(let i=1;i<table.length;i++)if(feet<=table[i][0]){
   const a=table[i-1],b=table[i];return a[1]+(b[1]-a[1])*(feet-a[0])/(b[0]-a[0]);
  }
  return table[table.length-1][1];
 }
 function densityRatio(altitude=0){
  const h=clamp(altitude,0,14000);
  return h<=11000?Math.pow(1-2.25577e-5*h,4.25588):.29708*Math.exp(-(h-11000)/6341.6);
 }
 // Low-Mach IAS/EAS approximation; P.spd remains TAS for world integration.
 function indicated(tas,altitude=0){return tas*Math.sqrt(densityRatio(altitude));}
 function trueSpeed(ias,altitude=0){return ias/Math.sqrt(densityRatio(altitude));}
 function maximum(altitude=0){
  const feet=Math.max(0,altitude/FT),base=interpolate(data.maxSpeed,feet);
  // Above the last measured/estimated anchor: explicit game extrapolation.
  return (feet<=32000?base:Math.max(310,base-(feet-32000)*.005))*MPH;
 }
 function climb(altitude=0){return interpolate(data.climb,Math.max(0,altitude/FT))*FPM;}
 function speeds(p,flaps=0,loadRatio=1,stallPenalty=0){
  const f=clamp(flaps,0,1),mass=Math.sqrt(clamp(loadRatio,.8,1.5));
  // 116/98-mph idle-stall anchors were measured at 13,230 lb in July 1944.
  // Normalize them to the AAF comparison's 12,731-lb reference before loading.
  const weight=Math.sqrt(12731/13230)*mass;
  const stallIAS=(data.cleanStallIAS+(data.landingStallIAS-data.cleanStallIAS)*f)*weight+stallPenalty;
  const refIAS=Math.max(data.approachIAS*mass+12*MPH*(1-f),stallIAS*1.3);
  const altitude=p.pos?.y||0,ias=indicated(p.spd||0,altitude),stall=trueSpeed(stallIAS,altitude);
  return {stall,warning:stall*1.15,reference:trueSpeed(refIAS,altitude),stallIAS,referenceIAS:refIAS,indicated:ias,
   low:ias<stallIAS*1.15,stalled:ias<stallIAS};
 }
 function acceleration(p,{loadRatio=1,flaps=0,damage=1,drag=0,bank=0}={}){
  const altitude=p.pos?.y||0,v=Math.max(35,p.spd||0),vmax=maximum(altitude),vy=trueSpeed(170*MPH,altitude);
  const rate=climb(altitude),induced=3000;
  // Fit a power curve to BOTH level-speed and climb anchors. The induced term
  // gives a finite idle glide; its polar and transient rates are game estimates.
  const c=(G*rate+induced/vy-induced/vmax)/(vmax**3-vy**3);
  const power=c*vmax**3+induced/vmax;
  const throttle=clamp(p.throttle||0,0,1),mass=clamp(loadRatio,.8,1.5);
  const n=1/Math.max(.35,Math.cos(Math.min(1.3,Math.abs(bank))));
  const available=power*throttle*clamp(damage,0,1);
  const dragPower=c*v**3+induced*mass*mass*n*n/v;
  const configuration=(p.gear||0)*.85+flaps*1.15+(p.tankAttached?.30:0)+drag*.15;
  return clamp((available-dragPower)/(v*mass)-G*Math.sin(p.pitch||0)-configuration,-14,4.5);
 }
 const api={data,maximum,climb,densityRatio,indicated,trueSpeed,speeds,acceleration};
 root.P47Performance=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
