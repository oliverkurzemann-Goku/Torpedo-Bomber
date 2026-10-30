(function(root){
 'use strict';
 const check=(ok,m)=>{if(!ok)throw Error(m);},stats=(a,rate,from,to)=>{let energy=0,peak=0;const start=Math.round(from*rate),end=Math.round(to*rate);for(let i=start;i<end;i++){check(Number.isFinite(a[i]),'finite audio');energy+=a[i]*a[i];peak=Math.max(peak,Math.abs(a[i]));}return {rms:Math.sqrt(energy/(end-start)),peak};};
 root.runPlayerAudioChecks=async()=>{
  const rate=24000,result={engines:{},guns:{}};
  for(const kind of ['ju87','corsair']){
   const levels=[];for(const throttle of [0,.5,1]){const ctx=new OfflineAudioContext(1,rate*25,rate),n=AircraftEngine.create(ctx,ctx.destination);await n.ready(kind);n.select(kind);await Promise.resolve();for(let i=0;i<1200;i++)n.update(1/60,kind,throttle,true);
    const a=(await ctx.startRendering()).getChannelData(0),m=stats(a,rate,3,25),windows=[];for(let t=3;t<24.75;t+=.25)windows.push(stats(a,rate,t,t+.25).rms);
    const rippleDb=20*Math.log10(Math.max(...windows)/Math.min(...windows));levels.push({throttle,...m,rippleDb,powerFile:n.state.powerFile});console.log('AUDIO',kind,throttle,JSON.stringify(levels.at(-1)));
    check(m.peak<.97,kind+' output headroom');if(kind==='ju87'&&throttle===1)check(rippleDb<.8,'Ju87 steady full throttle '+rippleDb);
   }
   const [idle,half,full]=levels;check(half.rms>idle.rms*1.7,kind+' half throttle distinct from idle');check(Math.abs((half.rms-idle.rms)/(full.rms-idle.rms)-.5)<.08,kind+' linear midpoint');result.engines[kind]=levels;
  }
  for(const kind of Object.keys(AircraftEngine.profiles).concat(['me262','me163'])){
   const ctx=new OfflineAudioContext(1,rate,rate);let seed=3;const random=Math.random;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   try{WeaponSound.fire(ctx,ctx.destination,kind);}finally{Math.random=random;}
   const a=(await ctx.startRendering()).getChannelData(0),m=stats(a,rate,0,.17);console.log('GUN',kind,JSON.stringify(m));check(m.rms>.07,kind+' clear gun report');check(m.peak<1,kind+' gun transient headroom');result.guns[kind]=m;
  }
  return result;
 };
})(window);
