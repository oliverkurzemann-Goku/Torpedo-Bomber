'use strict';
const {build}=require('./aircraft.cjs');
const {reference}=require('./config.cjs');
build({
 id:'g4m1-own',title:'Mitsubishi G4M1 Model 11 Betty (1942)',kind:'g4m',class:'twin-bomber-tailwheel',
 aircraft:true,twin:true,radial:true,retract:true,japan:true,texture:2048,seed:4111942,span:24.89,length:19.97,height:4.90,
 colors:['3a5a38','45653e','a5a88a'],number:'62',band:.292,mark:.379,engine:[2.43,4.89,4.19,3.40,3],
 engineRows:[[.11,.188,.203,.010],[.59,.419,.407,-.048],[1.25,.70,.67,-.069],[2.10,.91,.83,-.039],[3.02,.96,.91,-.006],
  [3.79,1.006,.976,0],[4.32,.993,.969,0],[4.62,.944,.907,0],[4.78,.867,.861,0]],
 gear:[4.19,1.93,3.22,.53,.32,-8.30,.211],tailGearHeight:.73,flapSpan:7.27,glassFrame:.045,
 body:[[-8.98,.373,.394,1.17],[-8.33,.52,.53,1.29],[-7.39,.685,.71,1.48],[-6.13,.854,.85,1.67],[-4.61,.987,.98,1.92],
  [-2.97,1.12,1.09,2.12],[-1.41,1.204,1.17,2.23],[.77,1.24,1.19,2.36],[2.98,1.26,1.18,2.49],[4.62,1.19,1.09,2.58],
  [6.01,1.034,.94,2.63],[7.19,.877,.778,2.69],[8.09,.712,.62,2.68]],
 canopy:[[3.25,3.28,.57,.31],[4.16,3.48,.67,.54],[5.11,3.51,.67,.65],[5.98,3.47,.645,.64],[6.70,3.42,.595,.50],
  [7.24,3.33,.51,.23],[7.54,3.30,.42,.06]],
 wing:[[0,2.46,4.07,-2.02,.84],[1.92,2.46,4.12,-2.01,.83],[4.18,2.50,3.83,-1.80,.73],[6.19,2.65,3.33,-1.38,.60],
  [8.22,2.83,2.78,-.94,.46],[10.38,3.03,2.19,-.66,.32],[11.81,3.17,1.58,-.47,.21],[12.20,3.20,1.25,-.29,.13],
  [12.445,3.22,.98,-.04,.071]],
 tail:[[.12,1.83,-6.79,-9.62,.35],[1.59,1.88,-7.13,-9.59,.29],[3.27,1.99,-7.72,-9.46,.23],
  [4.57,2.07,-8.38,-9.19,.153],[4.91,2.10,-8.67,-9.05,.092]],
 fin:[[1.82,-5.66,-9.59,.44],[2.63,-6.35,-9.65,.39],[3.51,-7.13,-9.60,.33],[4.29,-7.81,-9.40,.24],
  [4.73,-8.31,-9.12,.18],[4.9,-8.62,-8.97,.103]],
 references:[
  reference('Mitsubishi G4M Betty, Aircraftube technical summary','https://www.aircraftube.com/index.php?fichid=504&lang=en','Copyrighted reference page','Model 11 dimensions: 24.89 m span, 19.97 m length and 4.90 m height in horizontal attitude.'),
  reference('Mitsubishi G4M Betty, Profile Publications 210','https://www.gruppofalchi.com/files/Profile-Publications-Aircraft-210---Mitsubishi-G4M-Betty.pdf','Published reference, copyright retained','Model 11 cross-check, crew glazing and exterior profile.'),
  reference('G4M1 Model 11 mod. 1941, community technical summary','https://forum.warthunder.com/t/mitsubishi-g4m1-model-11-mod-1941-betty/260159','Copyrighted forum text, reference only','3.40 m propeller diameter cross-check. No game asset, image or drawing incorporated.'),
 ],
});
