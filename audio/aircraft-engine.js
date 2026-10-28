/* Recorded piston engines. Attribution and exact cuts: engines/provenance.json.
 * Idle/load crossfade retains real exhaust transients. No oscillator bed. */
(function(root){
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const script=typeof document!=='undefined'?document.currentScript:null;
const base=script?new URL('engines/',script.src).href:'audio/engines/';
const profiles={
 p47:{engine:'R-2800 · 18-cylinder radial',bank:'r2800',revision:215,powerFile:'r2800-detail-power.wav',powerRate:1.12,lowCut:45,rate:1,spool:.8,bass:-.5,bright:7500,source:'R-2800 flight recording · Pole Position / Sonniss GDC',match:'Loaded Bearcat recording with cabin tones and hiss reduced; adapted for P-47. Source RPM is unmeasured. Accepted ground recording retained at idle.'},
 corsair:{engine:'R-2800 · 18-cylinder radial',bank:'r2800',revision:213,rate:1.035,spool:.9,bass:.5,bright:7100,source:'R-2800 recordings from a P-47D · Fight2FlyPhoto',match:'Same engine family; Corsair exhaust and three-blade propeller are an approximation.'},
 fw190:{engine:'BMW 801 · 14-cylinder radial',bank:'bmw801',revision:215,powerFile:'radial14-detail-power.wav',powerRate:1.15,rate:1,spool:.7,bass:1,bright:6800,source:'BMW idle + composite loaded radial · Fight2FlyPhoto / Pole Position',match:'Ground BMW recording at idle; cleaned composite of airborne R-2800 and recorded R-2600 low-band texture under load. Not an original BMW full-power take.'},
 bf109:{engine:'DB 601 · inverted V12',bank:'db601',rate:1,spool:.6,bass:0,bright:7200,source:'Bf 109E-3 Daimler-Benz run-up · Fight2FlyPhoto',match:'DB 601 family recording; E-3 installation adapted for the F-2.'},
 ju87:{engine:'Jumo 211 · inverted V12',bank:'jumo',rate:1,spool:.9,bass:1,bright:5800,source:'Stuka-labelled archival effect · craigsmith / USC',match:'Archival film sound effect; exact engine provenance is unverified.'},
 avenger:{engine:'R-2600 · 14-cylinder radial',bank:'bmw801',revision:215,powerFile:'radial14-detail-power.wav',powerRate:1.09,rate:.94,spool:1.0,bass:1.5,bright:6200,source:'Recorded R-2600 texture + airborne radial · Pole Position / Sonniss GDC',match:'Cleaned composite loaded game voice; idle remains the BMW substitute. Not an original Avenger recording or a measured R-2600 full-power take.'},
 sbd:{engine:'R-1820 · 9-cylinder radial',bank:'r2800',revision:215,powerFile:'r2800-detail-power.wav',powerRate:1.28,rate:.95,spool:.9,bass:.5,bright:6000,source:'Recorded R-2800 radial · Fight2FlyPhoto / Pole Position',match:'Ground radial at idle, cleaned airborne radial under load with quicker playback at high power. Adapted game voice, not an R-1820 recording or measured RPM.'},
 zero:{engine:'Sakae · 14-cylinder radial',bank:'bmw801',revision:215,powerFile:'radial14-detail-power.wav',powerRate:1.31,rate:1.045,spool:.55,bass:1,bright:6500,source:'BMW idle + composite loaded radial · Fight2FlyPhoto / Pole Position',match:'BMW idle retained; quicker, cleaned composite airborne radial under load. Adapted game voice, not a Sakae recording or measured RPM.'}
};
for(const p of Object.values(profiles))Object.freeze(p);Object.freeze(profiles);
function create(ctx,destination){
 const bus=ctx.createGain(),hp=ctx.createBiquadFilter(),tone=ctx.createBiquadFilter(),body=ctx.createBiquadFilter();
 bus.gain.value=0;hp.type='highpass';hp.frequency.value=28;hp.Q.value=.5;
 tone.type='lowpass';tone.frequency.value=6500;tone.Q.value=.5;
 body.type='lowshelf';body.frequency.value=180;body.gain.value=0;
 hp.connect(body);body.connect(tone);tone.connect(bus);bus.connect(destination);
 const buffers=new Map();let current=null,selected=null,load=0,rpm=1,version=0,error=null;
 function ready(kind){
  const p=profiles[kind];if(!p)return Promise.resolve(null);
  const key=p.bank+'|'+(p.powerFile||'');
  if(!buffers.has(key)){
   const promise=Promise.all(['idle','power'].map(async layer=>{
    const file=layer==='power'&&p.powerFile?p.powerFile:p.bank+'-'+layer+'.wav';
    const url=base+file+(p.revision?'?v='+p.revision:''),res=await fetch(url);
    if(!res.ok)throw Error('Engine sample '+res.status+': '+url);
    return ctx.decodeAudioData(await res.arrayBuffer());
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
  // Clean loaded voices keep the accepted idle, with progressive output at all
  // power settings. Other voices retain their exact accepted processing.
  const detailed=p.revision===215;
  const mix=clamp((load-.08)/(detailed?.72:p.powerFile?.64:.82),0,1),idle=Math.cos(mix*Math.PI/2),power=Math.sin(mix*Math.PI/2);
  rpm=p.rate*(.94+.10*load);
  current.layers[0].gain.gain.setTargetAtTime(idle*.8,now,.10);
  current.layers[1].gain.gain.setTargetAtTime(power,now,.10);
  current.layers[0].source.playbackRate.setTargetAtTime(rpm,now,.10);
  current.layers[1].source.playbackRate.setTargetAtTime(p.powerFile?p.powerRate*(detailed?.78+.22*load:.90+.10*load):rpm,now,.10);
  hp.frequency.setTargetAtTime(p.lowCut||28,now,.12);
  body.gain.setTargetAtTime(p.bass,now,.15);
  tone.frequency.setTargetAtTime(p.bright*(options.cockpit?.65:1),now,.12);
  const damage=clamp(options.damage||0,0,1);
  bus.gain.setTargetAtTime(active?(powered?.45+(detailed?.50:.35)*load:.025)*(1-damage*.28)*(1-.25*(options.duck||0)):0,now,active?.10:.035);
 },get state(){return {kind:profiles[selected]?selected:null,loaded:current?.kind===selected,loading:!!profiles[selected]&&!current&&!error,error,rpm,load,powerFile:profiles[selected]?.powerFile||null};},output:bus};
}
root.AircraftEngine={profiles,create};if(typeof module==='object'&&module.exports)module.exports=root.AircraftEngine;
})(typeof window==='undefined'?globalThis:window);
