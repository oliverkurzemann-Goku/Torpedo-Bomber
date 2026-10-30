(function(){
 'use strict';
 const C=CustomSortie,$=id=>document.getElementById(id),draftKey='hangar-draft-v1';let c=C.defaults();
 try{const saved=localStorage.getItem(draftKey);if(saved)c=C.normalize(JSON.parse(saved));}catch(_){}
 const requested=new URLSearchParams(location.search).get('theatre');if(['europe','pacific'].includes(requested)&&requested!==c.theatre)c=C.defaults(requested);
 const preview=SortiePreview.create({host:$('aircraftPreview'),status:$('previewStatus'),reset:$('previewReset'),closer:$('previewIn'),further:$('previewOut'),retry:$('previewRetry')});
 function options(el,rows,value){el.replaceChildren(...rows.map(([key,label])=>{const o=document.createElement('option');o.value=key;o.textContent=label;return o;}));el.value=value;}
 function draw(){
  const allowed=C.aircraft(c.theatre,c.task);if(!allowed.includes(c.ac))c.ac=allowed[0];
  const kits=C.loadouts(c.ac,c.task);if(!kits.includes(c.kit))c.kit=kits[0];
  if(C.planes[c.ac].airOnly)c.start='air';if(c.task==='free'){c.enemies=0;c.fuel=100;}else if(['fighter','intercept','defend'].includes(c.task)&&c.enemies===0)c.enemies=2;
  c=C.normalize(c);const detail=C.summary(c);
  document.querySelectorAll('[data-theatre]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theatre===c.theatre)));
  options($('task'),C.tasks[c.theatre].map(t=>[t.id,t.name]),c.task);$('taskNote').textContent=C.tasks[c.theatre].find(t=>t.id===c.task).note;
  $('aircraft').replaceChildren(...allowed.map(ac=>{const b=document.createElement('button');b.type='button';b.textContent=C.planes[ac].name;b.dataset.aircraft=ac;b.setAttribute('aria-pressed',String(ac===c.ac));b.onclick=()=>{c.ac=ac;draw();};return b;}));
  options($('kit'),kits.map(k=>[k,C.kitNames[k]]),c.kit);
  for(const key of ['weather','time','start','difficulty','enemies','fuel'])$(key).value=String(c[key]);
  $('start').disabled=!!C.planes[c.ac].airOnly;$('enemies').disabled=$('fuel').disabled=c.task==='free';
  $('enemyLabel').textContent=c.task==='intercept'?'Enemy bombers':c.task==='defend'?'Incoming Avengers':['ships','torpedo','convoy','bridge','factory'].includes(c.task)?'Fighter cover':'Enemy fighters';
  $('enemies').querySelector('option[value="0"]').disabled=['fighter','intercept','defend'].includes(c.task);
  $('stores').textContent=detail.armament;$('aircraftNote').textContent=c.ac==='me163'?'The Komet starts airborne after trolley release. Plan an unpowered skid landing.':c.kit==='range'?'External fuel is consumed first. Jettison the drop tank before combat.':c.kit==='torpedo'?'One torpedo in the internal bay. Land aboard to rearm for another attack.':c.ac==='avenger'&&c.kit==='bombs'?'Two bombs inside the Avenger bomb bay; no external racks.':'Gun installation stays specific to the selected aircraft.';
  const art=$('theatreArt');art.src=c.theatre==='pacific'?'assets/pacific-campaign.webp':'assets/europe-campaign.webp';art.alt=c.theatre==='pacific'?'Pacific carrier operations':'Rhine valley operations';
  const strong=document.createElement('strong');strong.textContent=detail.title+' · '+detail.aircraft;const line=document.createElement('small');line.textContent=detail.conditions+' · '+(c.task==='free'?'Unlimited practice fuel':c.fuel+'% fuel')+' · '+({rookie:'Rookie',vet:'Veteran',ace:'Ace'})[c.difficulty];$('summary').replaceChildren(strong,line);
  preview.update(c);
  try{localStorage.setItem(draftKey,JSON.stringify(c));}catch(_){}
 }
 options($('weather'),Object.entries(C.weatherNames),'clear');
 document.querySelectorAll('[data-theatre]').forEach(b=>b.onclick=()=>{c=C.defaults(b.dataset.theatre);draw();});
 for(const key of ['task','kit','weather','time','start','difficulty','enemies','fuel'])$(key).addEventListener('change',()=>{c[key]=['enemies','fuel'].includes(key)?Number($(key).value):$(key).value;draw();});
 $('setup').addEventListener('submit',e=>{e.preventDefault();try{const valid=C.normalize(c);location.href=C.url(valid);}catch(error){$('error').hidden=false;$('error').textContent=error.message;}});
 draw();
})();
