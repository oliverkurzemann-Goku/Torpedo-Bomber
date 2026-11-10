/* Build 238: unit test of the 2-player duel modules, duel-net.js (codes, link, heartbeat) and duel.js (packets, interpolation,
 * damage normalisation, match rules, spawns, arena). The real WebRTC link between two game pages is in duel-browser.cjs. */
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const DuelNet=require(path.join(root,'duel-net.js')),Duel=require(path.join(root,'duel.js'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// ---- a fake RTCPeerConnection pair (enough of the API for DuelNet) ----
const registry=new Map();let ids=0;
const allChannels=[];
class FakeChannel{
  constructor(label){allChannels.push(this);this.label=label;this.readyState='connecting';this.peer=null;this.drop=false;this.onopen=this.onmessage=this.onclose=this.onerror=null;}
  send(d){if(this.readyState!=='open')throw Error('closed');const p=this.peer;if(this.drop)return;setImmediate(()=>p.readyState==='open'&&p.onmessage&&p.onmessage({data:d}));}
  close(){if(this.readyState==='closed')return;this.readyState='closed';this.onclose&&this.onclose();const p=this.peer;if(p&&p.readyState!=='closed'){p.readyState='closed';setImmediate(()=>p.onclose&&p.onclose());}}
}
class FakeRTC{
  constructor(cfg){this.cfg=cfg;this.iceGatheringState='new';this.channels=[];this.ondatachannel=null;this.id=++ids;registry.set(this.id,this);this.listeners=[];this.connectionState='new';}
  createDataChannel(label){const c=new FakeChannel(label);this.channels.push(c);return c;}
  async createOffer(){return {type:'offer',sdp:'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=fake host '+this.id+'\r\na=candidate:1 1 udp 1 10.0.0.1 5000 typ host\r\n'};}
  async createAnswer(){return {type:'answer',sdp:'v=0\r\no=- 3 4 IN IP4 127.0.0.1\r\ns=fake guest '+this.id+'\r\na=candidate:1 1 udp 1 10.0.0.2 5000 typ host\r\n'};}
  async setLocalDescription(d){this.localDescription=d;setImmediate(()=>{this.iceGatheringState='complete';this.listeners.forEach(f=>f());});}
  addEventListener(n,f){this.listeners.push(f);}removeEventListener(n,f){this.listeners=this.listeners.filter(x=>x!==f);}
  async setRemoteDescription(d){
    const m=/fake (host|guest) (\d+)/.exec(d.sdp);this.remoteId=+m[2];
    if(d.type!=='answer')return;
    const guest=registry.get(this.remoteId);
    const pairs=this.channels.map(c=>{const g=new FakeChannel(c.label);g.peer=c;c.peer=g;return [c,g];});
    for(const [,g] of pairs)guest.ondatachannel&&guest.ondatachannel({channel:g});
    setImmediate(()=>{for(const [c,g] of pairs){c.readyState=g.readyState='open';c.onopen&&c.onopen();g.onopen&&g.onopen();}});
  }
  close(){this.channels.forEach(c=>c.close());}
}

(async()=>{
 // ===================== duel-net.js: codes =====================
 const sdp='v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=ice-ufrag:abcd\r\na=ice-pwd:'+'x'.repeat(24)+'\r\na=fingerprint:sha-256 '+Array.from({length:32},(_,i)=>(i*7%256).toString(16).padStart(2,'0').toUpperCase()).join(':')+'\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=candidate:1 1 udp 2122260223 192.168.1.20 54321 typ host\r\na=candidate:1 1 udp 2122260223 192.168.1.20 54321 typ host\r\na=candidate:2 1 udp 1686052607 85.1.2.3 54321 typ srflx raddr 192.168.1.20 rport 54321\r\n\r\n';
 const code=await DuelNet.encode({type:'offer',sdp});
 assert.ok(code.startsWith('TB1.o'),'an invitation code is recognisable');assert.ok(code.length<700,'a code is short enough for any messenger ('+code.length+')');
 assert.ok(/^[A-Za-z0-9._-]+$/.test(code),'a code is plain URL-safe text');
 const back=await DuelNet.decode('  "'+code.slice(0,50)+'\n'+code.slice(50)+'". ');
 assert.equal(back.type,'offer','pasted with line breaks, quotes and trailing punctuation');assert.equal(back.sdp,DuelNet.trimSdp(sdp),'the description comes back unchanged (duplicates and blank lines trimmed)');
 assert.equal(DuelNet.trimSdp(sdp).split('a=candidate:1 1 udp').length-1,1,'a duplicate candidate is dropped');
 const parts=code.split('.');parts[2]=parts[2].slice(0,-6)+parts[2].slice(-5,-1)+'A';
 await assert.rejects(DuelNet.decode(parts.join('.')),/incomplete|damaged/,'a damaged code is refused with a clear message');
 await assert.rejects(DuelNet.decode(code.slice(0,code.length-12)),/not an invitation/,'a cut-off code is refused');
 await assert.rejects(DuelNet.decode('hello world'),/not an invitation/,'plain text is refused');
 const ans=await DuelNet.encode({type:'answer',sdp});assert.equal((await DuelNet.decode(ans)).type,'answer');assert.ok(ans.startsWith('TB1.a'));
 const plain=await (async()=>{const cs=globalThis.CompressionStream;globalThis.CompressionStream=undefined;try{return await DuelNet.encode({type:'offer',sdp});}finally{globalThis.CompressionStream=cs;}})();
 assert.ok(plain.startsWith('TB1.op.'),'without CompressionStream the code is plain (and still readable)');assert.equal((await DuelNet.decode(plain)).sdp,DuelNet.trimSdp(sdp));

 // ===================== duel-net.js: the link =====================
 const mk=(o)=>DuelNet.create({RTC:FakeRTC,beatMs:25,timeoutMs:250,gatherMs:200,...o});
 const host=mk(),guest=mk();
 const statuses={host:[],guest:[]},events={host:[],guest:[]},states={host:[],guest:[]};
 host.on('status',s=>statuses.host.push(s)).on('event',e=>events.host.push(e)).on('state',e=>states.host.push(e));
 guest.on('status',s=>statuses.guest.push(s)).on('event',e=>events.guest.push(e)).on('state',e=>states.guest.push(e));
 const invite=await host.createInvite();
 assert.equal(host.role,'host');assert.equal(host.status,'inviting');
 await assert.rejects(host.acceptAnswer(invite),/invitation code/,'the host cannot paste its own invitation as the answer');
 await assert.rejects(guest.acceptInvite(await DuelNet.encode({type:'answer',sdp:'x'})),/answer code/,'the guest cannot paste an answer as the invitation');
 const answer=await guest.acceptInvite(invite);
 assert.equal(guest.role,'guest');assert.equal(guest.status,'answering');
 await assert.rejects(guest.acceptAnswer(answer),/Create an invitation/,'only the host takes an answer');
 await host.acceptAnswer(answer);
 await sleep(30);
 assert.equal(host.status,'open');assert.equal(guest.status,'open','both ends open once the answer is accepted');
 assert.ok(statuses.host.includes('inviting')&&statuses.host.includes('connecting')&&statuses.host.includes('open'));
 host.sendEvent({t:'hello',n:1});guest.sendEvent({t:'hello',n:2});host.sendState([1,2,3]);
 await sleep(30);
 assert.deepEqual(events.guest.filter(e=>e.t==='hello'),[{t:'hello',n:1}],'reliable events arrive');assert.deepEqual(events.host.filter(e=>e.t==='hello'),[{t:'hello',n:2}]);
 assert.deepEqual(states.guest,[[1,2,3]],'state packets arrive on their own channel');assert.deepEqual(states.host,[]);
 assert.ok(!events.guest.some(e=>e.t==='ping'||e.t==='pong'),'ping and pong stay inside the link');
 await sleep(120);assert.ok(host.rtt!=null&&host.rtt>=0&&guest.rtt!=null,'the heartbeat measures the round trip ('+host.rtt+' ms)');
 // silence for longer than the timeout: 'lost'; traffic again: 'open'
 for(const ch of allChannels)ch.drop=true;
 await sleep(420);assert.equal(host.status,'lost','no data for a while: lost');assert.equal(guest.status,'lost');
 for(const ch of allChannels)ch.drop=false;
 await sleep(120);assert.equal(host.status,'open','data again: open');
 host.close();await sleep(30);
 assert.equal(host.status,'closed');assert.equal(guest.status,'closed','closing one end tells the other');
 assert.ok(!host.sendEvent({t:'x'})&&!host.sendState([1]),'a closed link does not send');
 const noRtc=DuelNet.create({RTC:null});noRtc.role=null;await assert.rejects(noRtc.createInvite(),/no WebRTC/,'a browser without WebRTC says so');
 const stunOff=[];const Spy=class extends FakeRTC{constructor(c){super(c);stunOff.push(c.iceServers.length);}};
 await DuelNet.create({RTC:Spy,stun:false,gatherMs:50}).createInvite();await DuelNet.create({RTC:Spy,gatherMs:50}).createInvite();
 assert.deepEqual(stunOff,[0,1],'STUN is only used when the player allows it');

 // ===================== duel.js: packets =====================
 const q0=[0,0,0,1];
 const snap={pos:[1234.56,789.04,-55.55],q:[.1,.2,.3,Math.sqrt(1-.14)],spd:101.26,thr:.753,hull:88.8,flags:Duel.FLAG.ALIVE|Duel.FLAG.FIRING,flap:.5,epoch:2,volley:17};
 const pk=Duel.packState(7,123456.4,snap);
 assert.equal(pk.length,16);assert.ok(JSON.stringify(pk).length<170,'a state packet is small ('+JSON.stringify(pk).length+' bytes)');
 const up=Duel.unpackState(JSON.parse(JSON.stringify(pk)));
 assert.equal(up.n,7);assert.equal(up.t,123456);assert.ok(Math.abs(up.pos[0]-1234.56)<=.0501&&Math.abs(up.pos[2]+55.55)<=.0501&&Math.abs(up.pos[1]-789.04)<=.0501,'position to 0.1 m');
 assert.ok(Math.hypot(...up.q)>.999&&Math.hypot(...up.q)<1.001,'unit quaternion after unpacking');assert.equal(up.flags,snap.flags);assert.equal(up.epoch,2);assert.equal(up.volley,17);
 for(const bad of [null,[],[1,2,3],pk.slice(0,15),pk.map((v,i)=>i===3?NaN:v),pk.map((v,i)=>i===2?'x':v),pk.map((v,i)=>i>=5&&i<=8?0:v)])assert.equal(Duel.unpackState(bad),null,'a broken packet is dropped: '+JSON.stringify(bad));

 // quaternion helpers against THREE (the game's own aircraft orientation)
 const THREE=require('three');
 for(const [pitch,heading,roll] of [[0,0,0],[.3,1.2,-.5],[-.6,-2.5,.9],[1.1,3.0,2.0]]){
  const e=new THREE.Euler(-pitch,heading,-roll,'YXZ'),tq=new THREE.Quaternion().setFromEuler(e),mine=[tq.x,tq.y,tq.z,tq.w];
  const n=new THREE.Vector3(0,0,1).applyQuaternion(tq),m=Duel.qRotate(mine,[0,0,1]);
  assert.ok(Math.hypot(n.x-m[0],n.y-m[1],n.z-m[2])<1e-9,'qRotate agrees with THREE');
  const expectNose=[Math.sin(heading)*Math.cos(pitch),Math.sin(pitch),Math.cos(heading)*Math.cos(pitch)];
  assert.ok(Math.hypot(n.x-expectNose[0],n.y-expectNose[1],n.z-expectNose[2])<1e-9,'the nose is (sin h cos p, sin p, cos h cos p): the same vector the game uses');
 }
 const half=Duel.qSlerp(q0,[0,Math.sin(Math.PI/4),0,Math.cos(Math.PI/4)],.5);
 assert.ok(Math.abs(half[1]-Math.sin(Math.PI/8))<1e-9&&Math.abs(half[3]-Math.cos(Math.PI/8))<1e-9,'slerp halves a 90 degree turn');
 assert.deepEqual(Duel.qSlerp(q0,[0,0,0,-1],.3).map(v=>Math.round(v*1e6)/1e6),[0,0,0,1],'slerp takes the short way (q and -q are one rotation)');

 // ===================== duel.js: the track of the other pilot =====================
 const mkSnap=(n,t,x,extra={})=>Duel.unpackState(Duel.packState(n,t,{pos:[x,500,0],q:q0,spd:100,thr:1,hull:100,flags:Duel.FLAG.ALIVE,epoch:0,...extra}));
 {
  const T=new Duel.Track({delay:.1});
  assert.equal(T.sample(0),null,'nothing to show before the first packet');
  // 20 Hz packets, 100 m/s along x; sender clock = receiver clock - 5000 ms, plus 30..60 ms network jitter
  for(let i=0;i<40;i++){const t=1000+i*50;T.push(mkSnap(i,t,i*5),t+5000+30+(i%4)*10);}
  assert.equal(T.offset,5030,'the clock offset is the fastest delivery seen');
  const at=T.sample(5030+1000+20*50+100);   // render time = packet 20
  assert.ok(Math.abs(at.pos[0]-100)<.01,'a render time that matches a packet shows that packet ('+at.pos[0]+')');
  const mid=T.sample(5030+1000+20*50+100+25);
  assert.ok(Math.abs(mid.pos[0]-102.5)<.01,'half way between two packets is half way in position');assert.ok(!mid.extrapolated);
  // late and duplicate packets are ignored
  const n0=T.count;assert.equal(T.push(mkSnap(10,2000,50),9000),false);assert.equal(T.push(mkSnap(39,2950,195),9100),false);assert.equal(T.count,n0);
  // starved: extrapolate along the last velocity, then stop
  const last=1000+39*50;
  const ex=T.sample(5030+last+100+200);
  assert.ok(ex.extrapolated&&!ex.stale&&Math.abs(ex.pos[0]-(195+200/50*5))<.5,'200 ms without data: carried on at the last speed ('+ex.pos[0]+')');
  const st=T.sample(5030+last+100+3000);
  assert.ok(st.stale&&Math.abs(st.pos[0]-(195+.4/.05*5))<.5,'long silence: held at the extrapolation limit and flagged stale ('+st.pos[0]+')');
  assert.ok(st.age>2.5);
  // a respawn (new epoch) or a jump is never interpolated across
  const J=new Duel.Track({delay:.1});
  J.push(mkSnap(1,1000,0),1000);J.push(mkSnap(2,1050,9000,{epoch:1}),1050);J.push(mkSnap(3,1100,9005,{epoch:1}),1100);
  const across=J.sample(1000+75+100);assert.ok(across.pos[0]>=9000,'between epochs the new position is taken as it is ('+across.pos[0]+')');assert.equal(across.epoch,1);
  const K=new Duel.Track({delay:.1});K.push(mkSnap(1,1000,0),1000);K.push(mkSnap(2,1050,800),1050);K.push(mkSnap(3,1100,805),1100);
  assert.ok(K.sample(1075+100).pos[0]>=800,'a jump of hundreds of metres is a teleport, not a flight');
  // rotation is interpolated on the short path
  const R=new Duel.Track({delay:.1});
  R.push(Duel.unpackState(Duel.packState(1,1000,{pos:[0,0,0],q:q0,flags:8})),1000);
  R.push(Duel.unpackState(Duel.packState(2,1100,{pos:[0,0,0],q:[0,Math.sin(Math.PI/4),0,Math.cos(Math.PI/4)],flags:8})),1100);
  const rm=R.sample(1050+100);assert.ok(Math.abs(rm.q[1]-Math.sin(Math.PI/8))<1e-3,'half way through a 90 degree turn');
 }

 // ===================== duel.js: damage normalisation =====================
 // the game's own gun figures (AC in remagen-mission.html): per-round damage, rate, muzzles
 const ACS={p47:{gunDmg:1.0,gunRate:.055},fw190:{gunDmg:1.5,gunRate:.075},me262:{gunDmg:3.0,gunRate:.09},me163:{gunDmg:2.8,gunRate:.14},
  bf109:{gunDmg:1.35,guns:[{dmg:.25,interval:25.5/500},{dmg:.25,interval:25.5/500},{dmg:.625,interval:15/200}]}};
 const dps={p47:Duel.gunDps(ACS.p47,'p47',8,false),fw190:Duel.gunDps(ACS.fw190,'fw190',4,false),me262:Duel.gunDps(ACS.me262,'me262',4,true),me163:Duel.gunDps(ACS.me163,'me163',2,true),bf109:Duel.gunDps(ACS.bf109,'bf109',3,false)};
 assert.ok(Math.abs(dps.p47-72.7)<.1&&Math.abs(dps.me262-133.3)<.1&&Math.abs(dps.fw190-20)<.1,'the raw figures differ by a factor of seven: '+JSON.stringify(dps));
 for(const [kind,d] of Object.entries(dps)){
  // a stream of bullets at full cadence, each carrying dps*interval damage in the game's units: the same percent per second for every type
  const perSecond=Duel.hitPct(d*.01,d)*100;   // 100 bullets of 1% of a second of fire
  assert.ok(Math.abs(perSecond-100/Duel.TTK)<1e-9,kind+': sustained hits take '+(100/Duel.TTK).toFixed(1)+'% a second whatever the raw figures are');
 }
 assert.ok(Duel.victimPct(10,'p47')<Duel.victimPct(10,'bf109')&&Duel.victimPct(10,'bf109')<Duel.victimPct(10,'me163'),'tougher types take less');
 assert.equal(Duel.hitPct(5,0),0,'no division by zero');
 assert.ok(Duel.RELOAD>5&&Duel.RELOAD<60&&Duel.RESPAWN>=2&&Duel.PROTECT>=2,'sane timers');

 // ===================== duel.js: the match =====================
 {
  const m=Duel.createMatch({target:3,minutes:10});
  m.localDeath('crash');assert.deepEqual([m.me,m.them],[{kills:0,deaths:1},{kills:0,deaths:0}],'a crash is a death without a kill for the other pilot');
  m.remoteDeath('shot');m.remoteDeath('shot');assert.equal(m.me.kills,2);assert.ok(!m.over);
  m.localDeath('shot');assert.equal(m.them.kills,1);m.remoteDeath('shot');
  assert.ok(m.over&&m.winner==='me'&&m.reason==='score','first to the target wins');
  m.localDeath('shot');assert.equal(m.winner,'me','a finished match does not change its winner');
  const t=Duel.createMatch({target:5,minutes:1});t.remoteDeath('shot');t.tick(59);assert.ok(!t.over);t.tick(2);
  assert.ok(t.over&&t.winner==='me'&&t.reason==='time','time up: more kills wins');
  const e=Duel.createMatch({target:5,minutes:1});e.localDeath('crash');e.tick(61);assert.equal(e.winner,'them','equal kills: fewer deaths wins');
  const d=Duel.createMatch({target:5,minutes:1});d.tick(61);assert.equal(d.winner,'draw');
  const free=Duel.createMatch({target:5,minutes:0});free.tick(99999);assert.ok(!free.over,'no time limit means none');
  const both=Duel.createMatch({target:1});both.me.kills=1;both.them.kills=1;both.localDeath('crash');assert.equal(both.winner,'draw','both at the target in one moment: a draw');
  // the host's verdict, seen from the guest
  const h=Duel.createMatch({target:2});h.remoteDeath('shot');h.remoteDeath('shot');
  const g=Duel.createMatch({target:2,minutes:10});g.applyFinal(h.final(),true);
  assert.deepEqual([g.me,g.them,g.winner,g.over],[{kills:0,deaths:2},{kills:2,deaths:0},'them',true],'the guest sees the host\'s numbers from its own side');
  const h2=Duel.createMatch({});h2.applyFinal(h.final(),false);assert.equal(h2.winner,'me','the host keeps its own view');
  assert.equal(Duel.timeText(61.2),'1:02');assert.equal(Duel.timeText(-3),'0:00');
  assert.equal(Duel.scoreText(Duel.createMatch({target:5,minutes:10}),'BOB'),'YOU 0 — 0 BOB  ·  10:00  ·  FIRST TO 5');
 }

 // ===================== duel.js: arena, spawns, names =====================
 const ar=Duel.arena(28000,32000);
 assert.deepEqual([ar.cx,ar.cz],[14000,16000]);
 for(const seed of [1,5,123456,2147483647]){
  const a=Duel.startSpawn('host',ar,seed),b=Duel.startSpawn('guest',ar,seed);
  assert.ok(Math.abs(Math.hypot(a.x-b.x,a.z-b.z)-3000)<1e-6,'the two start 3 km apart');
  assert.ok(Math.abs((a.x+b.x)/2-ar.cx)<1e-6&&Math.abs((a.z+b.z)/2-ar.cz)<1e-6,'on opposite sides of the centre');
  const nose=h=>[Math.sin(h),Math.cos(h)];
  const na=nose(a.heading),toB=[(b.x-a.x)/3000,(b.z-a.z)/3000];
  assert.ok(na[0]*toB[0]+na[1]*toB[1]>.999,'each one starts facing the other');
  assert.deepEqual(Duel.startSpawn('host',ar,seed),a,'the same seed gives the same start on both devices');
 }
 const rng=Duel.mulberry(9);
 for(let i=0;i<50;i++){
  const opp=[ar.cx+(rng()-.5)*8000,600,ar.cz+(rng()-.5)*8000],sp=Duel.respawnPoint(ar,opp,rng);
  assert.ok(Math.hypot(sp.x-opp[0],sp.z-opp[2])>2500,'a respawn is never right next to the enemy');
  assert.ok(Math.hypot(sp.x-ar.cx,sp.z-ar.cz)<=5500+1,'inside the arena');
 }
 assert.ok(Duel.respawnPoint(ar,null,rng).heading!==undefined,'a respawn without a known opponent still works');
 assert.deepEqual(Duel.arenaPenalty(ar,ar.cx,ar.cz),{dist:0,warn:false,out:false,dps:0});
 assert.ok(Duel.arenaPenalty(ar,ar.cx+ar.radius-500,ar.cz).warn&&!Duel.arenaPenalty(ar,ar.cx+ar.radius-500,ar.cz).out,'a warning before the edge');
 const out=Duel.arenaPenalty(ar,ar.cx+ar.radius+2000,ar.cz);assert.ok(out.out&&out.dps>4&&out.dps<=14,'outside: structural damage ('+out.dps+' %/s)');
 assert.equal(Duel.cleanName('  bob <b>the</b>  pilot_1234567 '),'BOB BTHEB PI','names are plain capitals and digits, twelve characters');
 assert.equal(Duel.cleanName('äö'),'');assert.equal(Duel.hello({name:'',ac:'p47'}).name,'PILOT');
 assert.ok(Duel.compatible(Duel.hello({name:'a',ac:'p47'}),{v:Duel.PROTOCOL}));assert.ok(!Duel.compatible({v:99},{v:Duel.PROTOCOL}));

 console.log('Duel (net + rules): codes, link, packets, track, damage, match, arena: OK');
})().catch(e=>{console.error(e);process.exit(1);});
