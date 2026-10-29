/* Render actual native Web Audio; verify throttle response across all ten models. */
(function(root){
'use strict';
const steps=[0,.1,.25,.5,.75,.9,1];
const check=(ok,message)=>{if(!ok)throw Error(message);};
function stats(a,rate,from,to){let sum=0,peak=0;for(let i=from*rate;i<to*rate;i++){const v=a[i];check(Number.isFinite(v),'Non-finite audio');sum+=v*v;peak=Math.max(peak,Math.abs(v));}return {rms:Math.sqrt(sum/((to-from)*rate)),peak};}
async function create(ctx,kind){
 if(AircraftEngine.profiles[kind]){const n=AircraftEngine.create(ctx,ctx.destination);await n.ready(kind);n.select(kind);await Promise.resolve();return {node:n,update:(dt,t,on)=>n.update(dt,kind,t,on)};}
 const n=JetEngine.create(ctx,ctx.destination,{rocket:kind==='me163'});return {node:n,update:(dt,t,on)=>n.update(dt,t,on)};
}
root.runLinearThrottleChecks=async function(progress=()=>{}){
 const result={build:218,rates:{},sustain:{},pause:{}};
 const kinds=[...Object.keys(AircraftEngine.profiles),'me262','me163'];
 for(const rate of [24000,48000]){
  result.rates[rate]={};
  for(const kind of kinds){
   progress(kind+' · '+rate+' Hz · linear throttle');const levels=[];
   for(const t of steps){
    const ctx=new OfflineAudioContext(1,rate*8,rate),v=await create(ctx,kind);for(let i=0;i<1500;i++)v.update(1/60,t,true);
    const a=(await ctx.startRendering()).getChannelData(0),m=stats(a,rate,2,8);levels.push({throttle:t,...m});
    check(m.peak<.97,kind+' output headroom at '+t);
   }
   const idle=levels[0].rms,full=levels.at(-1).rms,span=full-idle;
   check(full>.22&&full<.34,kind+' stronger full power with headroom');
   let maxDeviation=0;
   for(let i=1;i<levels.length;i++){
    check(levels[i].rms>levels[i-1].rms*1.02,kind+' audible progressive throttle');
    const deviation=Math.abs((levels[i].rms-idle)/span-levels[i].throttle);maxDeviation=Math.max(maxDeviation,deviation);
   }
   check(maxDeviation<.09,kind+' actual rendered response is approximately linear: '+maxDeviation);
   const half=levels.find(l=>l.throttle===.5);check(Math.abs((half.rms-idle)/span-.5)<.07,kind+' half throttle is midpoint');
   result.rates[rate][kind]={levels,maxDeviation};
  }
 }
 for(const kind of kinds){
  progress(kind+' · sustain and pause');const rate=24000,ctx=new OfflineAudioContext(1,rate*65,rate),v=await create(ctx,kind);
  for(let i=0;i<1500;i++)v.update(1/60,1,true);
  const stopped=ctx.suspend(60).then(()=>{v.update(.1,1,false);return ctx.resume();});
  const a=(await ctx.startRendering()).getChannelData(0);await stopped;
  const windows=[];let peak=0;
  for(let t=3;t<59.75;t+=.25){const m=stats(a,rate,t,t+.25);windows.push(m.rms);peak=Math.max(peak,m.peak);}
  const rangeDb=20*Math.log10(Math.max(...windows)/Math.min(...windows)),seconds=[];
  for(let t=3;t<59;t++)seconds.push(stats(a,rate,t,t+1).rms);
  const slowRangeDb=20*Math.log10(Math.max(...seconds)/Math.min(...seconds));
  // Short exhaust beats can be uneven; slow recurring recording fades cannot.
  check(rangeDb<3.2&&slowRangeDb<1.8,kind+' steady full power: '+rangeDb+'/'+slowRangeDb);check(peak<.97,kind+' sustained output headroom');
  result.sustain[kind]={rangeDb,slowRangeDb,peak};const mute=stats(a,rate,64,65);check(mute.rms<1e-6,kind+' muted on pause');result.pause[kind]=mute.rms;
 }
 result.checks=['Ten aircraft including Corsair/Stuka/jet/rocket','Seven throttle levels at 24 and 48 kHz','Half throttle near audible midpoint','Stronger full-power output','Native output peak headroom','Ten one-minute sustain/pause renders'];return result;
};
})(window);
