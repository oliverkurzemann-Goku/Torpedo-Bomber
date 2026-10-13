/* Versioned, bounded airborne checkpoints. No renderer resources are persisted.
 * Dual slots retain the last valid snapshot if a write is corrupt/interrupted.
 * Native builds additionally mirror slots to Capacitor Preferences (UserDefaults).
 * No achievement/logbook methods run during restoration. */
(function(global){
 'use strict';
 const SCHEMA=1,COMPATIBILITY=196,MAX_BYTES=2*1024*1024;
 const forbidden=new Set(['__proto__','constructor','prototype']);
 const referenceKeys=['mesh','group','sub','entity','visual','model','prop','rotors','gunStations','disk','disc','bombRack','foeW','target','tgt','builtFrom'];
 function pack(value,seen=new Set(),depth=0){
  if(depth>18)return undefined;
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number')return Number.isFinite(value)?value:undefined;
  if(!value||typeof value!=='object'||value.isObject3D||value.isTexture||value.isMaterial||value.isBufferGeometry)return undefined;
  if(value.isVector3||value.isQuaternion)return {$t:value.isVector3?'Vector3':'Quaternion',v:value.toArray()};
  if(value instanceof Set)return {$t:'Set',v:[...value].map(v=>pack(v,seen,depth+1))};
  if(seen.has(value))return undefined;seen.add(value);
  let out;
  if(Array.isArray(value))out=value.map(v=>pack(v,seen,depth+1)??null);
  else if(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null){
   out={};for(const key of Object.keys(value))if(!forbidden.has(key)){
    const p=pack(value[key],seen,depth+1);if(p!==undefined)out[key]=p;
   }
  }
  seen.delete(value);return out;
 }
 function capture(record,omit=[]){
  const out={},skip=new Set(omit);for(const key of Object.keys(record))if(!skip.has(key)&&!forbidden.has(key)){
   const v=pack(record[key]);if(v!==undefined)out[key]=v;
  }return out;
 }
 function revive(value,current,depth=0){
  if(depth>18)throw Error('Checkpoint nesting exceeded');
  if(!value||typeof value!=='object')return value;
  if(value.$t){
   if(!Array.isArray(value.v)||!value.v.every(Number.isFinite))throw Error('Invalid checkpoint vector');
   if(value.$t==='Set')return new Set(value.v);
   const size=value.$t==='Vector3'?3:value.$t==='Quaternion'?4:0;
   if(!size||value.v.length!==size)throw Error('Invalid checkpoint type');
   const object=current&&typeof current.fromArray==='function'?current:new global.THREE[value.$t]();
   return object.fromArray(value.v);
  }
  if(Array.isArray(value))return value.map((v,i)=>revive(v,current?.[i],depth+1));
  const out=current&&Object.getPrototypeOf(current)===Object.prototype?current:{};
  for(const key of Object.keys(value))if(!forbidden.has(key))out[key]=revive(value[key],out[key],depth+1);
  return out;
 }
 function restore(record,saved){for(const key of Object.keys(saved))if(!forbidden.has(key))record[key]=revive(saved[key],record[key]);return record;}
 function transform(object){return {pos:object.position.toArray(),q:object.quaternion.toArray(),scale:object.scale.toArray(),visible:object.visible};}
 function applyTransform(object,saved){object.position.fromArray(saved.pos);object.quaternion.fromArray(saved.q);object.scale.fromArray(saved.scale);object.visible=saved.visible;object.updateMatrixWorld(true);}
 function entity(record,object=record.group||record.mesh){return {state:capture(record,referenceKeys),transform:object?transform(object):null};}
 function applyEntity(record,saved,object=record.group||record.mesh){restore(record,saved.state);if(object&&saved.transform)applyTransform(object,saved.transform);return record;}
 function projectiles(list){return list.map(p=>({...entity(p,p.mesh),roundKind:p.mesh?.userData.roundKind,litTracer:p.mesh?.userData.litTracer}));}
 function restoreProjectiles(saved,kind,scene){return saved.map(s=>{
  const mesh=typeof kind==='function'?kind(s):kind==='round'||kind==='aa'?global.CombatFX.round(s.roundKind||(kind==='aa'?'aa':s.state.weapon||'rifle'),s.litTracer?0:1):kind==='rocket'?
   global.GameRuntime.own(new global.THREE.Mesh(new global.THREE.CylinderGeometry(.16,.2,1.6,8),new global.THREE.MeshLambertMaterial({color:0x5a5040}))):global.Ordnance.create(kind);
  // Round/ordnance resources belong to shared pools, not to this checkpoint.
  scene.add(mesh);const p=applyEntity({mesh},s,mesh);return p;
 });}
 function navigationState(n){const selected=n?.contacts().find(c=>c.ref===n.selected);return {mode:n?.mode||'AUTO',selected:selected?{kind:selected.kind,label:selected.label}:null};}
 function restoreNavigation(n,saved){if(!n)return;n.reset();const contacts=n.contacts();
  const selected=saved?.mode==='BASE'?contacts.find(c=>c.kind==='BASE'):saved?.mode==='SELECT'?contacts.find(c=>c.kind===saved.selected?.kind&&c.label===saved.selected?.label):null;
  if(selected)n.choose(selected);
 }
 function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
 function decode(text,campaign,identity){
  if(!text||text.length>MAX_BYTES)return null;
  try{const envelope=JSON.parse(text);
   if(envelope.schema!==SCHEMA||envelope.compatibility!==COMPATIBILITY||envelope.campaign!==campaign||
      typeof envelope.payload!=='string'||hash(envelope.payload)!==envelope.hash||!Number.isSafeInteger(envelope.sequence)||
      envelope.sequence<1||!Number.isFinite(envelope.savedAt))return null;
   const data=JSON.parse(envelope.payload);
   if(!Number.isInteger(data.mission)||data.identity!==identity(data.mission)||!data.player?.pos?.v?.every(Number.isFinite)||
      data.player.pos.v.length!==3||data.player.alive!==true||!Number.isFinite(data.player.spd)||data.player.spd<0)return null;
   return {...envelope,data};
  }catch(_){return null;}
 }
 function create({campaign,identity,snapshot,load,canSave,document=global.document}){
  const prefix='sortie-v1-'+campaign,slots=[prefix+'.a',prefix+'.b'],memory=new Map();
  let age=18,sequence=0,generation=0,restoring=false,button=null,nativeQueue=Promise.resolve(),ready=false,lastError='';
  const get=key=>{if(memory.has(key))return memory.get(key);try{return global.localStorage.getItem(key);}catch(_){return null;}};
  const read=()=>slots.map(key=>decode(get(key),campaign,identity)).filter(Boolean).sort((a,b)=>b.sequence-a.sequence)[0]||null;
  const mirror=(key,value)=>{
   if(!global.SquadronNative)return;
   nativeQueue=nativeQueue.catch(()=>{}).then(()=>value===null?global.SquadronNative.remove(key):global.SquadronNative.set(key,value))
    .catch(error=>{lastError='Native save unavailable: '+error.message;console.warn(lastError);});
  };
  const refresh=()=>{if(!button)return;const saved=read();button.hidden=!saved;button.disabled=!ready||restoring;
   button.parentElement?.classList.toggle('checkpointAvailable',!!saved);
   if(saved){button.textContent='Continue saved flight · '+saved.data.label;button.title=new Date(saved.savedAt).toLocaleString();}
  };
  const api={
   get restoring(){return restoring;},get lastError(){return lastError;},get ready(){return ready;},read,
   clear(){generation++;for(const key of slots){memory.delete(key);try{global.localStorage.removeItem(key);}catch(_){}mirror(key,null);}age=18;refresh();},
   save(){
    if(!ready||restoring||!canSave())return {ok:false,reason:'Airborne checkpoint only — the previous saved flight is kept.'};
    try{const data=snapshot(),payload=JSON.stringify(data);
     if(payload.length>MAX_BYTES-512)throw Error('Checkpoint exceeds size budget');
     const latest=read();sequence=Math.max(sequence,latest?.sequence||0)+1;
     const text=JSON.stringify({schema:SCHEMA,compatibility:COMPATIBILITY,campaign,sequence,savedAt:Date.now(),hash:hash(payload),payload});
     if(!decode(text,campaign,identity))throw Error('Invalid sortie checkpoint');
     const key=slots[sequence%2];memory.set(key,text);let persistent=true;
     try{global.localStorage.setItem(key,text);}catch(_){persistent=false;}
     mirror(key,text);age=0;lastError='';refresh();
     if(!persistent&&!global.SquadronNative){const note=document?.querySelector?.('.pauseNote');if(note)note.textContent='Storage unavailable — this flight is held only until this page closes. Your older record is unchanged.';}
     return {ok:true,persistent:persistent||!!global.SquadronNative};
    }catch(error){lastError=error.message;console.warn('Sortie checkpoint:',error);return {ok:false,reason:'Checkpoint could not be saved: '+error.message};}
   },
   tick(dt){if(!canSave()||restoring)return;age+=dt;if(age>=20)api.save();},
   async resume(){
    const saved=read();if(!saved||!ready||restoring)return false;
    restoring=true;refresh();
    try{await load(saved.data);age=0;return true;}
    catch(error){lastError=error.message;console.error('Checkpoint restore:',error);throw error;}
    finally{restoring=false;refresh();}
   },
   async flush(){let timeout;try{return await Promise.race([nativeQueue.then(()=>!lastError),new Promise(resolve=>{timeout=global.setTimeout(()=>resolve(false),1500);})]);}finally{global.clearTimeout(timeout);}},
   mount(onResume){
    const actions=document?.querySelector?.('#menu .menuActions');
    if(actions){button=document.createElement('button');button.type='button';button.className='btn checkpointResume';button.id='continueFlight';button.hidden=true;
     button.onclick=onResume;actions.appendChild(button);}
    for(const type of ['pagehide','squadronbackground'])global.addEventListener?.(type,()=>api.save());
    document?.addEventListener?.('visibilitychange',()=>{if(document.hidden)api.save();});
    api.initialized=(async()=>{
     const hydrationGeneration=generation;
     if(global.SquadronNative)for(const key of slots){try{
      const native=await global.SquadronNative.get(key);if(generation!==hydrationGeneration)continue;
      const old=decode(get(key),campaign,identity),newer=decode(native,campaign,identity);
      if(newer&&(!old||newer.sequence>old.sequence)){memory.set(key,native);try{global.localStorage.setItem(key,native);}catch(_){}}
     }catch(error){console.warn('Native checkpoint read:',error);}}
     ready=true;refresh();
    })();return api;
   }
  };return api;
 }
 global.SortieCheckpoint={create,capture,restore,entity,applyEntity,transform,applyTransform,projectiles,restoreProjectiles,navigationState,restoreNavigation,hash,decode};
 if(typeof module==='object'&&module.exports)module.exports=global.SortieCheckpoint;
})(typeof window==='undefined'?globalThis:window);
