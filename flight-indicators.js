/* Steady warning lamps follow actual damage/fuel, including repair and restart. */
(function(root){
 'use strict';
 function states(p){
  const d=p.systemDamage||{},hull=100*p.hull/(d.maxHull||100);
  return [
   {key:'engine',label:'ENG',level:(d.engine??1)<.8?2:(d.engine??1)<1?1:0,text:(d.engine??1)<1?'Power reduced to '+Math.round(d.engine*100)+'%':'Engine normal'},
   {key:'fuel',label:'FUEL',level:p.fuel<10?2:d.fuelLeak>0||p.fuel<25?1:0,text:d.fuelLeak>0?'Fuel leak':p.fuel<25?'Low fuel':'Fuel normal'},
   {key:'gear',label:'GEAR',level:d.gearLock!=null?(d.gearLock<.6?2:1):0,text:d.gearLock!=null?'Gear jammed '+(d.gearLock<.6?'up':'down'):'Gear normal'},
   {key:'hull',label:'HULL',level:hull<25?2:hull<50?1:0,text:hull<50?'Hull damage '+Math.round(hull)+'%':'Hull normal'}
  ];
 }
 function mount(element){
  element.textContent='';element.classList.add('warningLamps');
  const lamps=states({hull:100,fuel:100}).map(s=>{const lamp=element.ownerDocument.createElement('span');lamp.className='warningLamp';lamp.dataset.system=s.key;lamp.textContent='● '+s.label;element.appendChild(lamp);return lamp;});
  return {update(p){const status=states(p);status.forEach((s,i)=>{const lamp=lamps[i],level=String(s.level);if(lamp.dataset.level!==level)lamp.dataset.level=level;lamp.title=s.text;lamp.setAttribute('aria-label',s.text);});element.setAttribute('aria-label',status.filter(s=>s.level).map(s=>s.text).join('; ')||'Aircraft systems normal');},element};
 }
 root.FlightIndicators={states,mount};if(typeof module==='object'&&module.exports)module.exports=root.FlightIndicators;
})(typeof window==='undefined'?globalThis:window);
