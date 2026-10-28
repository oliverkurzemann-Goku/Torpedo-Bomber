/* Original combustion/propeller sound design. No sawtooth, recordings or worklet.
 * Historical engine families; timbres are game approximations for tablet speakers. */
(function(root){
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const profiles={
 p47:{engine:'R-2800 · 18-cylinder radial',cylinders:18,blades:4,gear:.50,rpm:2700,body:116,rough:.24,prop:.70,exhaust:.82,air:.15,bright:1600,spool:1.25,seed:47},
 corsair:{engine:'R-2800 · 18-cylinder radial',cylinders:18,blades:3,gear:.50,rpm:2700,body:128,rough:.22,prop:.87,exhaust:.74,air:.19,bright:1800,spool:1.1,seed:41},
 fw190:{engine:'BMW 801 · 14-cylinder radial',cylinders:14,blades:3,gear:.54,rpm:2700,body:146,rough:.29,prop:.68,exhaust:.91,air:.19,bright:1900,spool:.95,seed:190},
 bf109:{engine:'DB 601 · inverted V12',cylinders:12,blades:3,gear:.59,rpm:2600,body:210,rough:.07,prop:.42,exhaust:.98,air:.10,bright:2400,spool:.70,seed:109,inline:true},
 ju87:{engine:'Jumo 211 · inverted V12',cylinders:12,blades:3,gear:.65,rpm:2400,body:173,rough:.12,prop:.56,exhaust:.91,air:.12,bright:1950,spool:1.05,seed:87,inline:true},
 avenger:{engine:'R-2600 · 14-cylinder radial',cylinders:14,blades:3,gear:.56,rpm:2600,body:102,rough:.32,prop:.79,exhaust:.85,air:.18,bright:1450,spool:1.45,seed:2600},
 sbd:{engine:'R-1820 · 9-cylinder radial',cylinders:9,blades:3,gear:.56,rpm:2500,body:135,rough:.36,prop:.66,exhaust:.89,air:.16,bright:1650,spool:1.05,seed:1820},
 zero:{engine:'Sakae · 14-cylinder radial',cylinders:14,blades:3,gear:.69,rpm:2750,body:187,rough:.18,prop:.54,exhaust:.80,air:.13,bright:2200,spool:.65,seed:21}
};
for(const p of Object.values(profiles))Object.freeze(p);Object.freeze(profiles);
function synthesize(kind,rate=24000){
 const p=profiles[kind]||profiles.p47,n=rate*8,data=new Float32Array(n),tau=Math.PI*2,crank=40;
 let seed=p.seed,red=0,prev=0,mean=0;
 const bladeHz=Math.round(crank*p.gear*p.blades),fireHz=crank*p.cylinders/2;
 for(let i=0;i<n;i++){
  const t=i/rate,cycle=t*fireHz,event=Math.floor(cycle),phase=cycle-event;
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;const white=seed/2147483648-1;red=.965*red+.035*white;
  const weight=1+p.rough*Math.sin((event%p.cylinders)*2.39996);
  const pulse=Math.sin(Math.PI*phase)*Math.exp(-phase*(p.inline?2.0:3.4));
  const firing=weight*(pulse-.12)+.17*Math.sin(tau*fireHz*t)+.07*Math.sin(tau*fireHz*2*t+.4);
  const blade=.60*Math.sin(tau*bladeHz*t)+.25*Math.sin(tau*bladeHz*2*t+.6)+.12*Math.sin(tau*bladeHz*3*t+.2);
  const body=(.25*Math.sin(tau*p.body*t)+.12*Math.sin(tau*(p.body+1)*t+.3))*(1+p.rough*.3*Math.sin(tau*13*t));
  const texture=(red*6*.7+white*.09)*(1+.20*Math.sin(tau*bladeHz*t));
  const x=firing*p.exhaust+blade*p.prop+body+texture*p.air;
  prev+=(x-prev)*(p.inline?.57:.40);data[i]=prev;mean+=prev;
 }
 mean/=n;let rms=0;
 for(let i=0;i<n;i++){data[i]-=mean;rms+=data[i]*data[i];}
 const gain=.31/Math.sqrt(rms/n);
 for(let i=0;i<n;i++)data[i]=Math.tanh(data[i]*gain);
 // Whole-second overlap preserves every periodic component and joins the noise
 // continuously: the last returned sample precedes the tail's first sample.
 const blend=rate,out=data.slice(0,n-blend);
 for(let i=0;i<blend;i++){const a=i/blend;out[i]=data[n-blend+i]*(1-a)+data[i]*a;}
 return out;
}
function create(ctx,destination){
 const bus=ctx.createGain(),hp=ctx.createBiquadFilter(),tone=ctx.createBiquadFilter(),presence=ctx.createBiquadFilter();
 bus.gain.value=0;hp.type='highpass';hp.frequency.value=48;hp.Q.value=.5;
 tone.type='lowpass';tone.frequency.value=1800;tone.Q.value=.55;
 presence.type='peaking';presence.frequency.value=280;presence.Q.value=.65;presence.gain.value=2.5;
 hp.connect(tone);tone.connect(presence);presence.connect(bus);bus.connect(destination);
 const cache=new Map();let current=null,rpm=.55,load=0;
 function select(kind){
  if(current?.kind===kind)return;
  const previous=current;
  if(!profiles[kind]){current=null;if(previous){previous.gain.gain.setTargetAtTime(0,ctx.currentTime,.055);previous.source.stop(ctx.currentTime+.4);}return;}
  if(!cache.has(kind)){const samples=synthesize(kind),b=ctx.createBuffer(1,samples.length,24000);b.getChannelData(0).set(samples);cache.set(kind,b);}
  const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=cache.get(kind);source.loop=true;
  gain.gain.value=0;source.connect(gain);gain.connect(hp);source.start();gain.gain.setTargetAtTime(1,ctx.currentTime,.07);
  if(previous){previous.gain.gain.setTargetAtTime(0,ctx.currentTime,.055);previous.source.stop(ctx.currentTime+.4);}
  source.onended=()=>{source.disconnect();gain.disconnect();};
  current={kind,source,gain};rpm=.55;load=0;
 }
 return {update(dt,kind,throttle,active,options={}){
  select(kind);const p=profiles[kind];if(!p){bus.gain.setTargetAtTime(0,ctx.currentTime,.045);return;}
  const t=clamp(throttle||0,0,1),now=ctx.currentTime,powered=options.fuel!==false;
  load+=(t-load)*(1-Math.exp(-Math.max(0,dt)/p.spool));
  // A governor keeps RPM in a narrow working band: load changes timbre/weight.
  const target=powered?.40+.60*Math.pow(load,.38):clamp((options.speed||0)/200,0,.45);
  rpm+=(target-rpm)*(1-Math.exp(-Math.max(0,dt)/(powered?.55:1.6)));
  current.source.playbackRate.setTargetAtTime((p.rpm/2400)*Math.max(.18,rpm),now,.08);
  const damage=clamp(options.damage||0,0,1);
  tone.frequency.setTargetAtTime((p.bright*(.48+.52*load))*(options.cockpit?.76:1),now,.12);
  presence.gain.setTargetAtTime(1.5+load*3,now,.12);
  bus.gain.setTargetAtTime(active?(powered?.20+.32*load:.035)*(1-damage*.28)*(1-.25*(options.duck||0)):0,now,active?.10:.045);
 },select,get state(){return {kind:current?.kind||null,rpm,load};},output:bus};
}
root.AircraftEngine={profiles,synthesize,create};if(typeof module==='object'&&module.exports)module.exports=root.AircraftEngine;
})(typeof window==='undefined'?globalThis:window);
