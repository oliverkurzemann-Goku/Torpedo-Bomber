/* Shared linear engine response and a transparent guard for rare audio peaks. */
(function(root){
'use strict';
const clamp=x=>Math.max(0,Math.min(1,x));
const level=(kind,load)=>{const t=clamp(load);return kind==='rocket'?.28*t:kind==='jet'?.07+.19*t:.078+.202*t;};
function peakGuard(ctx,destination){
 const input=ctx.createGain(),guard=ctx.createWaveShaper();input.gain.value=.75;
 const curve=new Float32Array(8193);
 for(let i=0;i<curve.length;i++){
  const x=(i/(curve.length-1)*2-1)/.75,mag=Math.abs(x);
  curve[i]=mag<=.82?x:Math.sign(x)*(.82+.12*(-Math.expm1(-(mag-.82)/.12)));
 }
 guard.curve=curve;guard.oversample='2x';input.connect(guard);guard.connect(destination);return input;
}
const api=Object.freeze({clamp,level,peakGuard});root.EngineThrottle=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
