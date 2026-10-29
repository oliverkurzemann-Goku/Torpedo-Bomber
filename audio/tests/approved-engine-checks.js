/* Native-browser integration checks for the six approved audition choices. */
(function(root){
'use strict';
const expected={p47:'P47 A',avenger:'P47 C',sbd:'P47 B',fw190:'Fw190 Kerniger Sternmotor',zero:'Zero Leicht und lebhaft',bf109:'Me109 Trockenes V12 Knurren'};
function check(ok,message){if(!ok)throw Error(message);}
function stats(data,rate,from,to){let sum=0,peak=0;const start=Math.round(from*rate),end=Math.round(to*rate);for(let i=start;i<end;i++){const v=data[i];check(Number.isFinite(v),'Non-finite audio');sum+=v*v;peak=Math.max(peak,Math.abs(v));}return {rms:Math.sqrt(sum/(end-start)),peak};}
root.runApprovedEngineChecks=async function(progress=()=>{}){
 const output={build:217,checks:[],rates:{},sustain:{},transitions:{}};
 for(const rate of [24000,48000]){
  output.rates[rate]={};
  for(const [kind,choice] of Object.entries(expected)){
   progress(kind+' · '+rate+' Hz · throttle and native waveform');const levels=[];
   for(const throttle of [0,.25,.5,.65,.75,.9,1]){
    const ctx=new OfflineAudioContext(1,rate*4,rate),node=AircraftEngine.create(ctx,ctx.destination),decoded=await node.ready(kind);
    node.select(kind);await Promise.resolve();for(let i=0;i<600;i++)node.update(1/60,kind,throttle,true);
    check(node.state.approvedChoice===choice,kind+' approved choice');
    const data=(await ctx.startRendering()).getChannelData(0),m=stats(data,rate,1,4);levels.push({throttle,...m});
    check(m.rms>.06&&m.peak<.95,kind+' audible with headroom at '+throttle);
    if(throttle===1){
     const buffer=decoded[1].getChannelData(0);let dot=0,xx=0,yy=0;
     for(let i=rate*2;i<rate*4;i++){const a=data[i],b=buffer[i%buffer.length];dot+=a*b;xx+=a*a;yy+=b*b;}
     m.approvedBufferCorrelation=dot/Math.sqrt(xx*yy);check(m.approvedBufferCorrelation>.995,kind+' full-power waveform preserves approved loop');
     levels.at(-1).approvedBufferCorrelation=m.approvedBufferCorrelation;
    }
   }
   for(let i=1;i<levels.length;i++)check(levels[i].rms>levels[i-1].rms*1.015,kind+' progressively louder across throttle steps');
   check(levels.at(-1).rms>levels[2].rms*1.6,kind+' distinct full power above half throttle');
   output.rates[rate][kind]={choice,levels};
  }
 }
 for(const kind of Object.keys(expected)){
  progress(kind+' · 90-second sustain and pause/resume');
  const rate=24000,ctx=new OfflineAudioContext(1,rate*90,rate),node=AircraftEngine.create(ctx,ctx.destination);
  await node.ready(kind);node.select(kind);await Promise.resolve();for(let i=0;i<600;i++)node.update(1/60,kind,1,true);
  const a=(await ctx.startRendering()).getChannelData(0),quarters=[];let peak=0;
  for(let t=3;t<89.75;t+=.25){const m=stats(a,rate,t,t+.25);quarters.push(m.rms);peak=Math.max(peak,m.peak);}
  const quarterRangeDb=20*Math.log10(Math.max(...quarters)/Math.min(...quarters));
  check(quarterRangeDb<1.8&&peak<.95,kind+' steady circular loops without overload');
  output.sustain[kind]={seconds:90,quarterRangeDb,peak};
  const dynamic=new OfflineAudioContext(1,rate*12,rate),voice=AircraftEngine.create(dynamic,dynamic.destination);
  await voice.ready(kind);voice.select(kind);await Promise.resolve();voice.update(5,kind,1,true);
  const stops=[dynamic.suspend(3).then(()=>{voice.update(.1,kind,1,false);return dynamic.resume();}),dynamic.suspend(5).then(()=>{voice.update(.1,kind,1,true);return dynamic.resume();}),dynamic.suspend(9).then(()=>{for(let i=0;i<300;i++)voice.update(1/60,kind,0,true);return dynamic.resume();})];
  const samples=(await dynamic.startRendering()).getChannelData(0);await Promise.all(stops);
  const m={full:stats(samples,rate,1,2),paused:stats(samples,rate,4,5),resumed:stats(samples,rate,7,8),idle:stats(samples,rate,11,12)};
  check(m.paused.rms<1e-6,kind+' mute on pause');check(m.resumed.rms>m.full.rms*.95,kind+' restored after pause');check(m.idle.rms<m.full.rms*.5,kind+' return to idle');output.transitions[kind]=m;
 }
 progress('Fetch errors, cache isolation and delayed type switching');
 const oldFetch=root.fetch,urls=[];
 try{
  root.fetch=(url,...args)=>{urls.push(String(url));return oldFetch(url,...args);};
  const ctx=new OfflineAudioContext(1,24000,24000),node=AircraftEngine.create(ctx,ctx.destination);
  for(const kind of Object.keys(expected))await node.ready(kind);
  for(const file of ['p47-a','avenger-c','sbd-b','fw190','zero','bf109'])check(urls.some(u=>u.includes('/approved/'+file+'-power.wav')),file+' separate approved buffer');
 }finally{root.fetch=oldFetch;}
 try{
  root.fetch=async()=>({ok:false,status:404});const ctx=new OfflineAudioContext(1,24000,24000),node=AircraftEngine.create(ctx,ctx.destination);node.select('fw190');await new Promise(r=>setTimeout(r,40));check(!!node.state.error&&!node.state.loaded,'Missing approved sample surfaces error');
 }finally{root.fetch=oldFetch;}
 try{
  root.fetch=async(url,...args)=>{if(String(url).includes('p47-a-power'))await new Promise(r=>setTimeout(r,40));return oldFetch(url,...args);};
  const ctx=new OfflineAudioContext(1,24000,24000),node=AircraftEngine.create(ctx,ctx.destination);node.select('p47');node.select('zero');await node.ready('zero');await new Promise(r=>setTimeout(r,80));check(node.state.kind==='zero'&&node.state.loaded,'Delayed previous type cannot replace selected type');
 }finally{root.fetch=oldFetch;}
 output.checks=['Six exact approved choices','Progressive throttle levels at 24/48 kHz','Native full-power waveform matches approved buffer','Six 90-second loop sustains','Pause/resume and return to idle','Distinct files/cache isolation','Missing-file reporting','Delayed selection race'];return output;
};
})(window);
