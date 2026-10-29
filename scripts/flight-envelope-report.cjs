/* Prints (and writes to app/release/flight-envelope.json) the quantities derived from the aircraft data
 * sheet in flight-envelope.js, so every game coefficient can be traced back to a real figure.
 * Usage: node scripts/flight-envelope-report.cjs */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
require(path.join(root,'p47-performance.js'));require(path.join(root,'me262-performance.js'));
const E=require(path.join(root,'flight-envelope.js'));require(path.join(root,'flight-dynamics.js'));
const DEG=E.DEG,speeds=[60,90,120,150];
const out={arcade:E.ARC,aircraft:{}};
const line=(...c)=>console.log(c.join(' | '));
line('type','m kg','S m2','WL kg/m2','Vs m/s','CLmax','n limit','corner m/s','roll peak game deg/s','loop entry m/s');
for(const kind of Object.keys(E.derived)){
 const d=E.derived[kind],sheet=E.SHEETS[kind];
 const rows={};
 for(const v of speeds){
  const n=E.loadLimit(kind,v),t=E.turn(kind,1.3,v);
  rows[v]={n:+n.toFixed(2),turn360Real:+(2*Math.PI/(E.G*Math.sqrt(Math.max(1e-6,n*n-1))/v)).toFixed(1),turn360Game:+(2*Math.PI/t.rate).toFixed(1),
   rollRealDegS:+(E.rollRateReal(kind,v)/DEG).toFixed(0),rollGameDegS:+(E.rollRate(kind,v)/DEG).toFixed(0),
   pitchCapDegS:+(E.pitchRateLimit(kind,v,0)/DEG).toFixed(0),idleWindmill:+E.idleDrag(kind,v,0).toFixed(2)};
 }
 out.aircraft[kind]={name:d.name,sheet,wingLoading:+d.wl.toFixed(0),aspectRatio:+d.ar.toFixed(2),clmax:+d.clmax.toFixed(2),stall:+d.vs.toFixed(1),
  corner:+d.corner.toFixed(0),loopEntry:+E.aeroEntry(kind).toFixed(0),atSpeed:rows};
 line(kind,sheet.m,sheet.S,d.wl.toFixed(0),d.vs.toFixed(1),d.clmax.toFixed(2),d.nLimit,d.corner.toFixed(0),(E.rollPeak(kind)/DEG).toFixed(0),E.aeroEntry(kind).toFixed(0));
}
console.log('\nPer speed (60/90/120/150 m/s): load factor n, real 360 deg time, game 360 deg time at full bank, roll real/game deg/s, pitch cap deg/s');
for(const kind of Object.keys(out.aircraft)){
 const r=out.aircraft[kind].atSpeed;
 console.log(kind.padEnd(8),speeds.map(v=>'n'+r[v].n+' '+r[v].turn360Real+'s/'+r[v].turn360Game+'s roll'+r[v].rollRealDegS+'/'+r[v].rollGameDegS+' q'+r[v].pitchCapDegS).join('  |  '));
}
fs.mkdirSync(path.join(root,'app/release'),{recursive:true});
fs.writeFileSync(path.join(root,'app/release/flight-envelope.json'),JSON.stringify(out,null,1)+'\n');
