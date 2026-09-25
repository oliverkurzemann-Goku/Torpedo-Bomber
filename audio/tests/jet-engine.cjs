// Execute the game's actual audio functions and render their Web Audio graph to PCM.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {RenderingAudioContext}=require('web-audio-engine');
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8');
class AudioContext extends RenderingAudioContext{constructor(){super({sampleRate:24000,numberOfChannels:1});}resume(){return Promise.resolve();}}
const c=vm.createContext({console,Math,Float32Array,AudioContext,actx:null,eng:null,P:{alive:true,throttle:0,spd:90,ac:'me262',hull:100},state:1,ST:{FLIGHT:1},JET_KINDS:['me262'],MAX_SPD:250,sfxSputter(){throw Error('Jet must not use piston misfires');}});c.window=c;
vm.runInContext(fs.readFileSync(path.join(root,'audio/jet-engine.js'),'utf8'),c);
vm.runInContext(html.slice(html.indexOf('let jetEngine=null;'),html.indexOf('function nburst(')),c);
c.initAudio();const ctx=c.actx;
function run(seconds){const end=ctx.currentTime+seconds;while(ctx.currentTime<end){c.updateAudio(.05);ctx.processTo(ctx.currentTime+.05);}}
run(8);const idleEnd=ctx.currentTime;c.P.throttle=1;run(32);const fullEnd=ctx.currentTime;
c.P.hull=20;run(2);c.P.alive=false;run(1);
const a=ctx.exportAsAudioData().channelData[0],rate=ctx.sampleRate;
function rms(from,to){let sum=0;const lo=Math.floor(from*rate),hi=Math.floor(to*rate);for(let i=lo;i<hi;i++)sum+=a[i]*a[i];return Math.sqrt(sum/(hi-lo));}
let peak=0;for(const v of a){assert(Number.isFinite(v));peak=Math.max(peak,Math.abs(v));}
const idle=rms(idleEnd-2,idleEnd),full=rms(fullEnd-10,fullEnd);
assert(peak<.85,'headroom must remain for weapons');assert(full>idle*1.5,'throttle must audibly change thrust');
const windows=[];for(let t=fullEnd-12;t<fullEnd-.26;t+=.25)windows.push(rms(t,t+.25));
const variationDb=20*Math.log10(Math.max(...windows)/Math.min(...windows));
assert(variationDb<1.5,'steady throttle must not produce recurrent volume surges');
assert(rms(ctx.currentTime-.2,ctx.currentTime)<.0001,'dead engine fades out');
// Check actual mute routing when selecting a piston aircraft, then returning to the jet.
c.P.alive=true;c.P.hull=100;c.P.ac='p47';run(1);c.P.ac='me262';run(2);
assert(c.eng.eg.gain.value<.0001&&c.eng.ng.gain.value<.0001&&c.eng.lfoG.gain.value<.0001,'piston tone/noise/pulse muted for jet');
c.state=0;run(1);
const menu=ctx.exportAsAudioData().channelData[0];assert(Math.max(...menu.slice(-2400).map(Math.abs))<.0001,'menu mutes jet');
assert(!html.includes('me262-engine-loop.wav'),'old flyby must not be fetched');
console.log(JSON.stringify({idleRms:idle,fullRms:full,peak,steadyVariationDb:variationDb,renderedSeconds:ctx.currentTime}));
if(process.env.JET_PREVIEW){ctx.encodeAudioData(ctx.exportAsAudioData()).then(b=>fs.writeFileSync(process.env.JET_PREVIEW,Buffer.from(b)));}
