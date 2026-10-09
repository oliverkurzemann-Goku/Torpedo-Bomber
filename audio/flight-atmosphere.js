/* Local device voices only; bounded native WebAudio ambience, no service/download. */
(function(root){
'use strict';
function voiceRadio(env=root){
 let enabled=false,unlocked=false,current=null,timeout=null,scheduled=null,cachedVoice=null;
 const synth=env.speechSynthesis,available=!!(synth&&env.SpeechSynthesisUtterance);
 const refreshVoice=()=>{cachedVoice=available?synth.getVoices().find(v=>v.localService&&/^en\b/i.test(v.lang)):null;};
 if(available){refreshVoice();if(synth.addEventListener)synth.addEventListener('voiceschanged',refreshVoice);}
 const voice=()=>cachedVoice;
 const cancel=()=>{if(scheduled!==null){env.clearTimeout(scheduled);scheduled=null;}if(timeout){env.clearTimeout(timeout);timeout=null;}if(current&&available)synth.cancel();current=null;};
 const api={
  bind(control){if(!control)return;
   // Earlier releases spoke by default. Require a fresh, explicit opt-in.
   try{enabled=env.localStorage.getItem('spokenRadioOptIn')==='1';}catch(e){}
   control.checked=enabled;
   if(!available){control.checked=false;control.disabled=true;control.title='Device speech is unavailable; text radio remains active.';}
   control.addEventListener('change',()=>{enabled=control.checked;cancel();try{env.localStorage.setItem('spokenRadioOptIn',enabled?'1':'0');}catch(e){}if(enabled)api.unlock();});
  },
  unlock(){unlocked=true;if(available&&!cachedVoice)refreshVoice();if(enabled)api.say('Radio check.');},
  say(text){
   if(!enabled||!unlocked||!available||current||!voice())return false;
   // Radio panel owns the queue. Never let native speech build an independent backlog.
   const short=text.replace(/CONTROL — /,'Control. ').replace(/[·—]/g,', ').replace(/\bRTB\b/g,'return to base').replace(/\bFT\b/g,'feet').replace(/\bKM\b/g,'kilometres').slice(0,145);
   const u=new env.SpeechSynthesisUtterance(short);u.voice=voice();u.lang=u.voice.lang;u.rate=1.12;u.pitch=.82;u.volume=.66;
   current=u;u.onend=u.onerror=()=>{if(current===u){current=null;if(timeout)env.clearTimeout(timeout);timeout=null;}};
   // Native speech dispatch runs outside the animation frame; one pending task only.
   scheduled=env.setTimeout(()=>{scheduled=null;if(current!==u)return;try{synth.speak(u);timeout=env.setTimeout(cancel,11000);}catch(e){cancel();}},0);return true;
  },cancel,
  get speaking(){return !!current;},get available(){return available&&!!voice();}
 };
 return api;
}
function soundscape(){
 let ctx=null,destination=null,noise=null,fieldT=3,battleT=9;
 const sources=new Set();
 function sound(kind,distance){
  if(!ctx||ctx.state!=='running'||!destination||sources.size>=4)return;
  const t=ctx.currentTime,engine=kind==='engine',duration=engine?4.5:1.8;
  const source=ctx.createBufferSource();source.buffer=noise;source.loop=true;
  const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=engine?220:420;
  const gain=ctx.createGain(),attenuation=Math.max(.015,1-distance/(engine?2200:10000));
  gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime((engine?.045:.032)*attenuation,t+(engine?1.2:.045));gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
  source.playbackRate.setValueAtTime(engine?.35:.75,t);if(engine)source.playbackRate.linearRampToValueAtTime(1.5,t+3.2);
  source.connect(filter);filter.connect(gain);gain.connect(destination);sources.add(source);
  source.onended=()=>{sources.delete(source);source.disconnect();filter.disconnect();gain.disconnect();};source.start(t);source.stop(t+duration);
 }
 return {
  attach(audio,master){if(ctx===audio)return;ctx=audio;destination=master;if(!ctx)return;
   noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.7),ctx.sampleRate);const samples=noise.getChannelData(0);
   for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*(.65+.35*Math.sin(i*.029));
  },
  reset(){for(const source of sources){try{source.stop();}catch(e){}}fieldT=3;battleT=9;this.fieldCalled=false;},
  tick(dt,{baseRange=Infinity,combatRange=Infinity,combat=false}={}){
   fieldT-=dt;battleT-=dt;const events=[];
   if(fieldT<=0&&baseRange<1800){fieldT=20;sound('engine',baseRange);events.push('engine');}
   if(battleT<=0&&combat&&combatRange>1200&&combatRange<10000){battleT=13;sound('battle',combatRange);events.push('battle');}
   return events;
  },
  stop(){for(const source of sources){try{source.stop();}catch(e){}}},get count(){return sources.size;}
 };
}
const radioBuffers=new WeakMap();
function prepareRadio(ctx){
 if(radioBuffers.has(ctx))return radioBuffers.get(ctx);
 const b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.1),ctx.sampleRate),p=b.getChannelData(0);let old=0;
 for(let i=0;i<p.length;i++){const t=i/ctx.sampleRate,n=Math.random()*2-1,env=Math.min(1,t/.015)*Math.exp(-t*48);p[i]=env*(Math.sin(t*1400*Math.PI*2)*.05+(n-old)*.04*(t<.05?1:0));old=n;}
 radioBuffers.set(ctx,b);return b;
}
function radioTone(ctx,destination){
 if(ctx.state!=='running')return;const source=ctx.createBufferSource();source.buffer=prepareRadio(ctx);source.connect(destination);source.onended=()=>source.disconnect();source.start();
}
root.FlightAtmosphere={voiceRadio,soundscape,prepareRadio,radioTone};
})(typeof window!=='undefined'?window:globalThis);
