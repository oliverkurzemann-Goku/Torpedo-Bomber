/* duel-net.js - Build 238: serverless link for the 2-player duel (WebRTC data channels).
 *
 * No THREE, no DOM, no game state. The two players exchange two short text codes by any
 * messenger (an invitation from the host, an answer from the guest); after that the browsers talk
 * directly. There is no server: GitHub Pages stays static.
 *
 *   host:   code = await link.createInvite();            -> send the code to the guest
 *   guest:  answer = await link.acceptInvite(code);      -> send the answer back to the host
 *   host:   await link.acceptAnswer(answer);             -> both sides reach status 'open'
 *
 * Two channels: 'st' (unordered, no retransmit: the 20 Hz position stream, a late packet is useless)
 * and 'ev' (reliable, ordered: hits, deaths, match control, ping). A code is the session description
 * (deflate-raw + base64url when the browser can, plain base64url otherwise) with a short checksum so a
 * truncated paste is rejected instead of failing deep inside WebRTC.
 */
(function(root){
'use strict';
const PREFIX='TB1';
const STUN=[{urls:'stun:stun.l.google.com:19302'}];

// ---- code format -------------------------------------------------------------------------------------
function toB64u(bytes){
  let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function fromB64u(text){
  const s=atob(text.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((text.length+3)%4));
  const out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;
}
function checksum(text){let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h.toString(36).slice(-5).padStart(5,'0');}
async function pipe(bytes,stream){
  const out=new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
const canDeflate=()=>typeof CompressionStream!=='undefined'&&typeof DecompressionStream!=='undefined'&&typeof Blob!=='undefined'&&typeof Response!=='undefined';
// Keep only what a data-channel session needs; trailing blank lines and duplicate candidates only make the code longer.
function trimSdp(sdp){
  const seen=new Set(),out=[];
  for(const raw of String(sdp).split(/\r?\n/)){
    const line=raw.trim();if(!line||seen.has(line))continue;seen.add(line);out.push(line);
  }
  return out.join('\r\n')+'\r\n';
}
async function encode(desc){
  const json=JSON.stringify({t:desc.type==='offer'?'o':'a',s:trimSdp(desc.sdp)});
  const raw=new TextEncoder().encode(json);
  let method='p',bytes=raw;
  if(canDeflate()){try{bytes=await pipe(raw,new CompressionStream('deflate-raw'));method='z';}catch(e){bytes=raw;method='p';}}
  const body=toB64u(bytes),kind=(desc.type==='offer'?'o':'a')+method;
  return PREFIX+'.'+kind+'.'+body+'.'+checksum(kind+body);
}
// Pasted text arrives with line breaks, quotes, spaces or a chat app's trailing punctuation.
function clean(code){
  const m=String(code||'').replace(/[\s"'`<>]+/g,'').match(/TB1\.[a-z]{2}\.[A-Za-z0-9_-]+\.[a-z0-9]{5}/);
  return m?m[0]:'';
}
async function decode(code){
  const text=clean(code);
  if(!text)throw new Error('That is not an invitation code.');
  const [,kind,body,sum]=text.split('.');
  if(checksum(kind+body)!==sum)throw new Error('The code is incomplete or damaged - copy it again.');
  let bytes=fromB64u(body);
  if(kind[1]==='z'){
    if(!canDeflate())throw new Error('This browser cannot read compressed codes.');
    bytes=await pipe(bytes,new DecompressionStream('deflate-raw'));
  }
  const data=JSON.parse(new TextDecoder().decode(bytes));
  return {type:data.t==='o'?'offer':'answer',sdp:data.s};
}

// ---- the link ----------------------------------------------------------------------------------------
function create(opts={}){
  const RTC=opts.RTC||root.RTCPeerConnection,now=opts.now||(()=>Date.now());
  const handlers={status:[],state:[],event:[]};
  const link={role:null,status:'idle',rtt:null,sent:0,received:0,lastRx:0};
  let pc=null,chSt=null,chEv=null,beat=null,pingN=0,statusInfo='';
  const emit=(k,...a)=>{for(const h of handlers[k]){try{h(...a);}catch(e){if(opts.onError)opts.onError(e);}}};
  function setStatus(s,info=''){
    if(link.status===s&&statusInfo===info)return;
    link.status=s;statusInfo=info;
    if((s==='closed'||s==='failed')&&beat){clearInterval(beat);beat=null;}       // a dead link stops its heartbeat
    emit('status',s,info);
  }
  link.on=(k,h)=>{handlers[k].push(h);return link;};
  link.off=(k,h)=>{const i=handlers[k].indexOf(h);if(i>=0)handlers[k].splice(i,1);return link;};
  function open(){return chSt&&chEv&&chSt.readyState==='open'&&chEv.readyState==='open';}
  function checkOpen(){
    if(!open())return;
    link.lastRx=now();
    if(!beat)beat=setInterval(heartbeat,opts.beatMs||1000);
    setStatus('open');
  }
  function heartbeat(){
    if(!open())return;
    link.sendEvent({t:'ping',ts:now(),n:++pingN});
    if(now()-link.lastRx>(opts.timeoutMs||6000))setStatus('lost','No data from the other pilot for a few seconds.');
  }
  function onMessage(label,data){
    link.lastRx=now();link.received++;
    let msg;try{msg=JSON.parse(data);}catch(e){return;}
    if(link.status==='lost'&&open())setStatus('open');      // any traffic at all ends the 'lost' state (a ping is enough)
    if(label==='st'){emit('state',msg);return;}
    if(msg&&msg.t==='ping'){link.sendEvent({t:'pong',ts:msg.ts,n:msg.n});return;}
    if(msg&&msg.t==='pong'){const r=now()-msg.ts;link.rtt=link.rtt==null?r:link.rtt*.7+r*.3;return;}
    emit('event',msg);
  }
  function attach(ch){
    if(ch.label==='st')chSt=ch;else chEv=ch;
    ch.onopen=checkOpen;
    ch.onmessage=e=>onMessage(ch.label,e.data);
    ch.onclose=()=>{if(link.status==='open'||link.status==='lost')setStatus('closed','The other pilot left.');};
    ch.onerror=()=>{};
    checkOpen();
  }
  function make(){
    if(!RTC)throw new Error('This browser has no WebRTC, so a duel cannot be started.');
    pc=new RTC({iceServers:opts.stun===false?[]:STUN});
    pc.ondatachannel=e=>attach(e.channel);
    const watch=()=>{
      const s=pc.connectionState||pc.iceConnectionState;
      if(s==='failed')setStatus('failed','The two devices could not reach each other (different networks or a strict router). Try the same Wi-Fi.');
      else if((s==='disconnected'||s==='closed')&&(link.status==='open'||link.status==='lost'))setStatus('lost','Connection interrupted.');
    };
    pc.onconnectionstatechange=watch;pc.oniceconnectionstatechange=watch;
  }
  function gathered(){
    return new Promise(resolve=>{
      if(pc.iceGatheringState==='complete')return resolve();
      const done=()=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve();};
      const check=()=>{if(pc.iceGatheringState==='complete')done();};
      const timer=setTimeout(done,opts.gatherMs||4500);
      pc.addEventListener('icegatheringstatechange',check);
    });
  }
  link.createInvite=async function(){
    link.role='host';make();
    attach(pc.createDataChannel('ev',{ordered:true}));
    attach(pc.createDataChannel('st',{ordered:false,maxRetransmits:0}));
    await pc.setLocalDescription(await pc.createOffer());
    setStatus('inviting');
    await gathered();
    return encode(pc.localDescription);
  };
  link.acceptInvite=async function(code){
    const d=await decode(code);
    if(d.type!=='offer')throw new Error('This is an answer code. Paste the host\'s invitation here.');
    link.role='guest';make();
    await pc.setRemoteDescription(d);
    await pc.setLocalDescription(await pc.createAnswer());
    setStatus('answering');
    await gathered();
    return encode(pc.localDescription);
  };
  link.acceptAnswer=async function(code){
    if(link.role!=='host'||!pc)throw new Error('Create an invitation first.');
    const d=await decode(code);
    if(d.type!=='answer')throw new Error('This is an invitation code. Paste the guest\'s answer here.');
    await pc.setRemoteDescription(d);
    setStatus('connecting');
  };
  link.sendState=function(msg){
    if(!chSt||chSt.readyState!=='open')return false;
    try{chSt.send(JSON.stringify(msg));link.sent++;return true;}catch(e){return false;}
  };
  link.sendEvent=function(msg){
    if(!chEv||chEv.readyState!=='open')return false;
    try{chEv.send(JSON.stringify(msg));link.sent++;return true;}catch(e){return false;}
  };
  link.close=function(){
    clearInterval(beat);beat=null;
    try{link.sendEvent({t:'bye'});}catch(e){}
    for(const ch of [chSt,chEv]){try{ch&&ch.close();}catch(e){}}
    try{pc&&pc.close();}catch(e){}
    pc=chSt=chEv=null;setStatus('closed','');
  };
  return link;
}

const API={create,encode,decode,clean,checksum,trimSdp,STUN,PREFIX};
if(typeof module!=='undefined'&&module.exports)module.exports=API;
root.DuelNet=API;
})(typeof globalThis!=='undefined'?globalThis:this);
