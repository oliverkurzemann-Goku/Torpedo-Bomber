/* Original gun reports: short crack, low mechanical body; no rocket-like sustained hiss. */
(function(root){
 const cache=new WeakMap();
 root.WeaponSound={fire(ctx,destination,kind){
  if(!ctx||!destination)return;
  let buffer=cache.get(ctx);if(!buffer){buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.16),ctx.sampleRate);const a=buffer.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*Math.pow(1-i/a.length,2);cache.set(ctx,buffer);}
  const heavy=kind==='me262',medium=heavy||kind==='fw190'||kind==='bf109',t=ctx.currentTime;
  const n=ctx.createBufferSource();n.buffer=buffer;n.playbackRate.value=.96+Math.random()*.08;
  const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=heavy?1320:medium?1450:2100;f.Q.value=heavy?.52:.65;
  const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(heavy?1.08:.58,t+.002);g.gain.exponentialRampToValueAtTime(.001,t+(heavy?.16:.085));
  n.connect(f);f.connect(g);g.connect(destination);n.start(t);n.stop(t+.17);n.onended=()=>{n.disconnect();f.disconnect();g.disconnect();};
  const body=ctx.createOscillator(),bg=ctx.createGain();body.type='sine';body.frequency.setValueAtTime(heavy?190:290,t);body.frequency.exponentialRampToValueAtTime(heavy?75:135,t+.075);
  bg.gain.setValueAtTime(0,t);bg.gain.linearRampToValueAtTime(heavy?.34:.11,t+.003);bg.gain.exponentialRampToValueAtTime(.001,t+(heavy?.16:.075));
  body.connect(bg);bg.connect(destination);body.start(t);body.stop(t+.17);body.onended=()=>{body.disconnect();bg.disconnect();};
 }};
})(typeof window==='undefined'?globalThis:window);
