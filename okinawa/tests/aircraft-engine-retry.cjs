/* Build 253: the recorded engine voices fetch their layers on first use. A download that failed once (a weak link while a duel was being set up: the host's P-47 stayed silent
 * for the whole session while the synthesised Me 262 of the other device played) left the aeroplane 'selected' with an error and was never tried again. Now the selection is
 * forgotten after a short wait and the next update() fetches again (four tries). Unit test with a fake audio graph and a fake fetch. */
'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),root=path.resolve(__dirname,'../..');
require(path.join(root,'audio/throttle-response.js'));
const AircraftEngine=require(path.join(root,'audio/aircraft-engine.js'));
const param=()=>({value:0,setTargetAtTime(){},linearRampToValueAtTime(){},setValueAtTime(){}});
const node=()=>({connect(){},disconnect(){},gain:param(),frequency:param(),Q:param(),playbackRate:param(),type:'',curve:null,oversample:'',buffer:null,loop:false,start(){},stop(){},onended:null});
const ctx={currentTime:0,createGain:node,createBiquadFilter:node,createWaveShaper:node,createBufferSource:node,async decodeAudioData(){return {};}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let failures=2,calls=0;
 globalThis.fetch=async()=>{calls++;if(failures>0){failures--;throw Error('Network connection lost');}return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};};
 const engine=AircraftEngine.create(ctx,node());
 const frame=()=>engine.update(.016,'p47',.75,true,{fuel:true,speed:90,damage:0});
 frame();await sleep(80);frame();
 assert.ok(engine.state.error&&!engine.state.loaded,'the first download failed: '+JSON.stringify(engine.state));
 const t0=Date.now();let loadedAt=null;
 while(Date.now()-t0<9000){frame();await sleep(100);if(engine.state.loaded){loadedAt=Date.now()-t0;break;}}
 assert.ok(loadedAt!==null,'the voice is fetched again and loads after the failures (calls '+calls+')');
 assert.ok(loadedAt<6500,'within a few seconds ('+loadedAt+' ms)');
 // a link that never works: no endless retrying
 failures=1e9;calls=0;const dead=AircraftEngine.create(ctx,node());
 const f2=()=>dead.update(.016,'bf109',.5,true,{fuel:true,speed:80,damage:0});
 const t1=Date.now();while(Date.now()-t1<14000){f2();await sleep(100);}
 assert.ok(!dead.state.loaded&&calls>=4&&calls<=24,'four extra tries at most, then it stays quiet: '+calls+' fetches');
 console.log('Aircraft engine retry: loaded again after '+loadedAt+' ms; dead link stopped after '+calls+' fetches.');
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
