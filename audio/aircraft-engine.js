/* Recorded piston engines. Attribution and exact cuts: engines/provenance.json.
 * Idle/load crossfade retains real exhaust transients. No oscillator bed. */
(function(root){
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const script=typeof document!=='undefined'?document.currentScript:null;
const base=script?new URL('engines/',script.src).href:'audio/engines/';
const profiles={
 p47:{engine:'R-2800 · 18-cylinder radial',bank:'r2800',revision:216,growl:true,powerFile:'r2800-detail-power.wav',powerRate:1.12,lowCut:45,rate:1,spool:.8,bass:-.5,bright:7500,source:'R-2800 flight recording · Pole Position / Sonniss GDC',match:'Loaded Bearcat recording with cabin tones and hiss reduced; adapted for P-47. Source RPM is unmeasured. Accepted ground recording retained at idle.'},
 corsair:{engine:'R-2800 · 18-cylinder radial',bank:'r2800',revision:216,growl:true,rate:1.035,spool:.9,bass:.5,bright:7100,source:'R-2800 recordings from a P-47D · Fight2FlyPhoto',match:'Same engine family; Corsair exhaust and three-blade propeller are an approximation.'},
 fw190:{engine:'BMW 801 · 14-cylinder radial',bank:'bmw801',revision:216,growl:true,powerFile:'radial14-detail-power.wav',powerRate:1.15,rate:1,spool:.7,bass:1,bright:6800,source:'BMW idle + composite loaded radial · Fight2FlyPhoto / Pole Position',match:'Ground BMW recording at idle; cleaned composite of airborne R-2800 and recorded R-2600 low-band texture under load. Not an original BMW full-power take.'},
 bf109:{engine:'DB 601 · inverted V12',bank:'db601',rate:1,spool:.6,bass:0,bright:7200,source:'Bf 109E-3 Daimler-Benz run-up · Fight2FlyPhoto',match:'DB 601 family recording; E-3 installation adapted for the F-2.'},
 ju87:{engine:'Jumo 211 · inverted V12',bank:'jumo',rate:1,spool:.9,bass:1,bright:5800,source:'Stuka-labelled archival effect · craigsmith / USC',match:'Archival film sound effect; exact engine provenance is unverified.'},
 avenger:{engine:'R-2600 · 14-cylinder radial',bank:'bmw801',revision:216,growl:true,powerFile:'radial14-detail-power.wav',powerRate:1.09,rate:.94,spool:1.0,bass:1.5,bright:6200,source:'Recorded R-2600 texture + airborne radial · Pole Position / Sonniss GDC',match:'Cleaned composite loaded game voice; idle remains the BMW substitute. Not an original Avenger recording or a measured R-2600 full-power take.'},
 sbd:{engine:'R-1820 · 9-cylinder radial',bank:'r2800',revision:216,growl:true,powerFile:'r2800-detail-power.wav',powerRate:1.28,rate:.95,spool:.9,bass:.5,bright:6000,source:'Recorded R-2800 radial · Fight2FlyPhoto / Pole Position',match:'Ground radial at idle, cleaned airborne radial under load with quicker playback at high power. Adapted game voice, not an R-1820 recording or measured RPM.'},
 zero:{engine:'Sakae · 14-cylinder radial',bank:'bmw801',revision:216,growl:true,powerFile:'radial14-detail-power.wav',powerRate:1.31,rate:1.045,spool:.55,bass:1,bright:6500,source:'BMW idle + composite loaded radial · Fight2FlyPhoto / Pole Position',match:'BMW idle retained; quicker, cleaned composite airborne radial under load. Adapted game voice, not a Sakae recording or measured RPM.'}
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
 const rms=Math.sqrt(total/length),envelope=circularMean(energy,Math.round(rate*.22));
 const gains=new Float32Array(length);for(let i=0;i<length;i++)gains[i]=clamp(rms/Math.sqrt(envelope[i]+1e-12),.4,2.5);
 const smooth=circularMean(gains,Math.round(rate*.16));total=0;
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
 hp.connect(body);body.connect(tone);tone.connect(bus);bus.connect(destination);
 const buffers=new Map();let current=null,selected=null,load=0,rpm=1,version=0,error=null;
 function ready(kind){
  const p=profiles[kind];if(!p)return Promise.resolve(null);
  const key=p.bank+'|'+(p.powerFile||'')+(p.growl?'|growl216|'+kind:'');
  if(!buffers.has(key)){
   const promise=Promise.all(['idle','power'].map(async layer=>{
    const file=layer==='power'&&p.powerFile?p.powerFile:p.bank+'-'+layer+'.wav';
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
   const fade=ctx.createGain();fade.gain.value=0;fade.connect(hp);
   const layers=decoded.map((buffer,i)=>{
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;source.loop=true;source.playbackRate.value=profiles[kind].rate;
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
  // Preserve recorded idle and RPM pacing; loaded radials use the low exhaust path.
  const detailed=p.revision>=215;
  const mix=clamp((load-.08)/(detailed?.72:p.powerFile?.64:.82),0,1),idle=Math.cos(mix*Math.PI/2),power=Math.sin(mix*Math.PI/2);
  rpm=p.rate*(.94+.10*load);
  current.layers[0].gain.gain.setTargetAtTime(idle*.8,now,.10);
  current.layers[1].gain.gain.setTargetAtTime(power,now,.10);
  current.layers[0].source.playbackRate.setTargetAtTime(rpm,now,.10);
  const powerRate=p.powerFile?p.powerRate*(detailed?.78+.22*load:.90+.10*load):rpm;
  current.layers[1].source.playbackRate.setTargetAtTime(powerRate,now,.10);
  hp.frequency.setTargetAtTime(p.lowCut||28,now,.12);
  body.gain.setTargetAtTime(p.bass,now,.15);
  tone.frequency.setTargetAtTime(p.bright*(options.cockpit?.65:1),now,.12);
  const damage=clamp(options.damage||0,0,1);
  bus.gain.setTargetAtTime(active?(powered?.45+(detailed?.50:.35)*load:.025)*(1-damage*.28)*(1-.25*(options.duck||0)):0,now,active?.10:.035);
 },get state(){return {kind:profiles[selected]?selected:null,loaded:current?.kind===selected,loading:!!profiles[selected]&&!current&&!error,error,rpm,load,powerFile:profiles[selected]?.powerFile||null};},output:bus};
}
root.AircraftEngine={profiles,create};if(typeof module==='object'&&module.exports)module.exports=root.AircraftEngine;
})(typeof window==='undefined'?globalThis:window);
