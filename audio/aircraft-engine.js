/* Recorded piston engines. Attribution and exact cuts: engines/provenance.json.
 * Approved voices combine credited ground recordings and original exhaust accents. */
(function(root){
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const script=typeof document!=='undefined'?document.currentScript:null;
const base=script?new URL('engines/',script.src).href:'audio/engines/';
const profiles={
 p47:{"engine":"R-2800 · 18-cylinder radial","bank":"r2800","revision":217,"approved":true,"approvedChoice":"P47 A","idleFile":"approved/r2800-idle.wav","powerFile":"approved/p47-a-power.wav","rate":1,"spool":0.3,"bass":0,"bright":10000,"source":"Fight2FlyPhoto ground recording + original game exhaust accents","match":"Approved deep, gritty P-47 audition A. Ground recording plus original exhaust accents."},
 corsair:{engine:'R-2800 · 18-cylinder radial',bank:'r2800',revision:216,growl:true,rate:1.035,spool:.9,bass:.5,bright:7100,source:'R-2800 recordings from a P-47D · Fight2FlyPhoto',match:'Same engine family; Corsair exhaust and three-blade propeller are an approximation.'},
 fw190:{"engine":"BMW 801 · 14-cylinder radial","bank":"bmw801","revision":217,"approved":true,"approvedChoice":"Fw190 Kerniger Sternmotor","idleFile":"approved/bmw801-idle.wav","powerFile":"approved/fw190-power.wav","rate":1,"spool":0.3,"bass":0,"bright":10000,"source":"Fight2FlyPhoto ground recording + original game exhaust accents","match":"Approved Fw 190 audition: BMW ground recording with original exhaust accents."},
 bf109:{"engine":"DB 601 · inverted V12","bank":"db601","revision":217,"approved":true,"approvedChoice":"Me109 Trockenes V12 Knurren","idleFile":"approved/db601-idle.wav","powerFile":"approved/bf109-power.wav","rate":1,"spool":0.3,"bass":0,"bright":10000,"source":"Fight2FlyPhoto ground recording + original game exhaust accents","match":"Approved dry V12 audition: DB 601 ground recording with original exhaust accents."},
 ju87:{engine:'Jumo 211 · inverted V12',bank:'jumo',rate:1,spool:.9,bass:1,bright:5800,source:'Stuka-labelled archival effect · craigsmith / USC',match:'Archival film sound effect; exact engine provenance is unverified.'},
 avenger:{"engine":"R-2600 · 14-cylinder radial","bank":"r2800","revision":217,"approved":true,"approvedChoice":"P47 C","idleFile":"approved/r2800-idle.wav","powerFile":"approved/avenger-c-power.wav","rate":1,"spool":0.3,"bass":0,"bright":10000,"source":"Fight2FlyPhoto ground recording + original game exhaust accents","match":"Approved powerful audition C, adapted from the P-47 source family for Avenger."},
 sbd:{"engine":"R-1820 · 9-cylinder radial","bank":"r2800","revision":217,"approved":true,"approvedChoice":"P47 B","idleFile":"approved/r2800-idle.wav","powerFile":"approved/sbd-b-power.wav","rate":1,"spool":0.3,"bass":0,"bright":10000,"source":"Fight2FlyPhoto ground recording + original game exhaust accents","match":"Approved rough, uneven audition B, adapted from the P-47 source family for Dauntless."},
 zero:{"engine":"Sakae · 14-cylinder radial","bank":"bmw801","revision":217,"approved":true,"approvedChoice":"Zero Leicht und lebhaft","idleFile":"approved/bmw801-idle.wav","powerFile":"approved/zero-power.wav","rate":1.075,"spool":0.3,"bass":0,"bright":10000,"source":"Fight2FlyPhoto ground recording + original game exhaust accents","match":"Approved lively Zero audition. Adapted BMW source; not a Sakae recording."},
};
for(const p of Object.values(profiles))Object.freeze(p);Object.freeze(profiles);
// Prepare each loaded voice once while loading. Native offline filters remove
// cabin tones; circular leveling keeps low-band drift from becoming loop pumping.
async function preparePower(ctx,buffer,p,kind){
 const Offline=root.OfflineAudioContext||root.webkitOfflineAudioContext;
 if(!Offline)throw Error('Offline audio processing unavailable');
 const rate=buffer.sampleRate,pad=Math.round(rate*.5),length=buffer.length;
 const offline=new Offline(1,length+pad*2,rate),source=offline.createBufferSource();
 source.buffer=buffer;source.loop=true;
 let input=source;
 const speed=p.powerRate||p.rate*1.04,ratio=p.powerFile?.startsWith('radial14')?14/18:1;
 for(const hz of p.powerFile?[492,648]:[]){const f=offline.createBiquadFilter();f.type='notch';f.Q.value=2.4;f.frequency.value=hz*ratio;input.connect(f);input=f;}
 const low=offline.createBiquadFilter(),dry=offline.createGain();
 low.type='lowpass';low.Q.value=.5;low.frequency.value=({p47:820,corsair:860,fw190:940,avenger:760,sbd:900,zero:980}[kind])/speed;
 dry.gain.value=.90;input.connect(low);low.connect(dry);dry.connect(offline.destination);
 // Broad recorded exhaust transients with mild saturation; no periodic sound bed.
 const bodyCut=offline.createBiquadFilter(),grit=offline.createWaveShaper(),gritLow=offline.createBiquadFilter(),weight=offline.createGain();
 bodyCut.type='bandpass';bodyCut.frequency.value=210/speed;bodyCut.Q.value=.55;
 const curve=new Float32Array(2049);for(let j=0;j<curve.length;j++){const x=j/(curve.length-1)*2-1;curve[j]=Math.tanh(x*3)/Math.tanh(3);}
 grit.curve=curve;grit.oversample='2x';gritLow.type='lowpass';gritLow.frequency.value=720/speed;gritLow.Q.value=.5;weight.gain.value=.42;
 input.connect(bodyCut);bodyCut.connect(grit);grit.connect(gritLow);gritLow.connect(weight);weight.connect(offline.destination);
 source.start(0,Math.max(0,buffer.duration-.5));
 const rendered=(await offline.startRendering()).getChannelData(0).slice(pad,pad+length);
 function circularMean(a,width){
  const out=new Float32Array(length),half=Math.floor(width/2);let sum=0;
  for(let j=-half;j<width-half;j++)sum+=a[(j+length)%length];
  for(let i=0;i<length;i++){out[i]=sum/width;sum+=a[(i+width-half)%length]-a[(i-half+length)%length];}return out;
 }
 let total=0;const energy=new Float32Array(length);for(let i=0;i<length;i++){energy[i]=rendered[i]**2;total+=energy[i];}
 const rms=Math.sqrt(total/length),envelope=circularMean(energy,Math.round(rate*.16));
 const gains=new Float32Array(length);for(let i=0;i<length;i++)gains[i]=clamp(rms/Math.sqrt(envelope[i]+1e-12),.4,2.5);
 const smooth=circularMean(gains,Math.round(rate*.10));total=0;
 for(let i=0;i<length;i++){rendered[i]*=smooth[i];total+=rendered[i]**2;}
 const normalize=.205/Math.sqrt(total/length),out=ctx.createBuffer(1,length,rate),samples=out.getChannelData(0);
 for(let i=0;i<length;i++){let x=rendered[i]*normalize,mag=Math.abs(x);samples[i]=mag>.64?Math.sign(x)*(.64+.12*(-Math.expm1(-(mag-.64)/.12))):x;}
 return out;
}
function create(ctx,destination){
 const bus=ctx.createGain(),hp=ctx.createBiquadFilter(),tone=ctx.createBiquadFilter(),body=ctx.createBiquadFilter();
 bus.gain.value=0;hp.type='highpass';hp.frequency.value=28;hp.Q.value=.5;
 tone.type='lowpass';tone.frequency.value=6500;tone.Q.value=.5;
 body.type='lowshelf';body.frequency.value=180;body.gain.value=0;
 hp.connect(body);body.connect(tone);tone.connect(bus);bus.connect(root.EngineThrottle.peakGuard(ctx,destination));
 const buffers=new Map();let current=null,selected=null,load=0,rpm=1,version=0,error=null;
 function ready(kind){
  const p=profiles[kind];if(!p)return Promise.resolve(null);
  const key=(p.idleFile||p.bank)+'|'+(p.powerFile||'')+(p.growl?'|growl216|'+kind:'');
  if(!buffers.has(key)){
   const promise=Promise.all(['idle','power'].map(async layer=>{
    const file=layer==='idle'&&p.idleFile?p.idleFile:layer==='power'&&p.powerFile?p.powerFile:p.bank+'-'+layer+'.wav';
    const url=base+file+(p.revision?'?v='+p.revision:''),res=await fetch(url);
    if(!res.ok)throw Error('Engine sample '+res.status+': '+url);
    const decoded=await ctx.decodeAudioData(await res.arrayBuffer());
    return layer==='power'&&p.growl?preparePower(ctx,decoded,p,kind):decoded;
   }));buffers.set(key,promise);
   promise.catch(()=>{if(buffers.get(key)===promise)buffers.delete(key);});
  }
  return buffers.get(key);
 }
 function retire(voice){if(!voice)return;voice.fade.gain.setTargetAtTime(0,ctx.currentTime,.05);for(const source of voice.sources)source.stop(ctx.currentTime+.4);}
 function select(kind){
  if(selected===kind)return;
  selected=kind;const ticket=++version;retire(current);current=null;error=null;load=0;
  if(!profiles[kind])return;
  ready(kind).then(decoded=>{
   if(ticket!==version)return;
   const fade=ctx.createGain();fade.gain.value=0;fade.connect(profiles[kind].approved?bus:hp);
   const layers=decoded.map((buffer,i)=>{
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;source.loop=true;source.playbackRate.value=profiles[kind].approved&&i===1?1:profiles[kind].rate;
    gain.gain.value=i===0?1:0;source.connect(gain);gain.connect(fade);
    source.onended=()=>{source.disconnect();gain.disconnect();};source.start();return {source,gain};
   });
   current={kind,fade,layers,sources:layers.map(l=>l.source)};
   // Both sources share one fade; disconnect it after the last one ends.
   let ended=0;for(const layer of layers){const cleanup=layer.source.onended;layer.source.onended=()=>{cleanup();if(++ended===2)fade.disconnect();};}
   fade.gain.setTargetAtTime(1,ctx.currentTime,.08);
  }).catch(e=>{if(ticket===version){error=e.message;console.warn(error);}});
 }
 return {ready,select,update(dt,kind,throttle,active,options={}){
  select(kind);const p=profiles[kind],now=ctx.currentTime;
  if(!p||!current){bus.gain.setTargetAtTime(0,now,.045);return;}
  const powered=options.fuel!==false,t=powered?clamp(throttle||0,0,1):0;
  load+=(t-load)*(1-Math.exp(-Math.max(0,dt)/p.spool));
  // The power layer contributes throughout the range. Squared layer gains
  // represent a linear share of sound energy: half throttle is half of each voice.
  const mix=load;
  current.layers[0].gain.gain.setTargetAtTime(Math.sqrt(1-mix),now,.08);
  current.layers[1].gain.gain.setTargetAtTime(Math.sqrt(mix),now,.08);
  rpm=p.rate*(.94+.18*load);
  const powerRate=p.approved?.68+.44*load:p.rate*(.78+.34*load);
  current.layers[0].source.playbackRate.setTargetAtTime(rpm,now,.08);
  current.layers[1].source.playbackRate.setTargetAtTime(powerRate,now,.08);
  hp.frequency.setTargetAtTime(p.lowCut||28,now,.12);
  body.gain.setTargetAtTime(p.bass,now,.15);
  tone.frequency.setTargetAtTime(p.bright*(options.cockpit?.65:1),now,.12);
  const damage=clamp(options.damage||0,0,1),gain=powered?root.EngineThrottle.level('piston',load)/.20:.025;
  bus.gain.setTargetAtTime(active?gain*(1-damage*.28)*(1-.25*(options.duck||0)):0,now,active?.10:.035);
 },get state(){return {kind:profiles[selected]?selected:null,loaded:current?.kind===selected,loading:!!profiles[selected]&&!current&&!error,error,rpm,load,powerFile:profiles[selected]?.powerFile||null,approvedChoice:profiles[selected]?.approvedChoice||null,powerBlend:load,powerPlaybackRate:current?.layers[1].source.playbackRate.value||0};},output:bus};
}
root.AircraftEngine={profiles,create};if(typeof module==='object'&&module.exports)module.exports=root.AircraftEngine;
})(typeof window==='undefined'?globalThis:window);
