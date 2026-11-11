'use strict';
const {build}=require('./aircraft.cjs');
const {reference}=require('./config.cjs');
build({
 id:'bf110g4-own',title:'Messerschmitt Bf 110 G-4 (Lichtenstein SN-2)',kind:'bf110',class:'twin-tailwheel-fighter',
 aircraft:true,night:true,twin:true,retract:true,doubleFin:2.20,texture:2048,seed:1101944,span:16.25,length:12.65,height:4.16,
 colors:['6f7482','3d4248','1b1d1f'],number:'N4',mark:.341,engine:[2.27,4.13,2.54,3.50,3],
 engineRows:[[-1.76,.14,.16,.055],[-1.24,.32,.32,.031],[-.61,.50,.55,-.04],[.31,.57,.68,-.06],
  [1.45,.56,.59,-.019],[2.63,.53,.49,0],[3.39,.46,.42,0],[3.88,.32,.37,0],[4.05,.176,.20,0]],
 gear:[2.55,1.88,1.30,.402,.238,-5.55,.195],tailGearHeight:.62,flapSpan:4.68,glassFrame:.036,
 body:[[-6.325,.037,.053,1.18],[-5.95,.143,.167,1.26],[-5.12,.235,.28,1.40],[-3.81,.36,.386,1.56],
  [-2.25,.49,.485,1.76],[-.98,.56,.559,1.91],[.46,.60,.59,2.02],[2.05,.55,.54,2.08],[3.27,.51,.463,2.13],
  [4.29,.485,.395,2.16],[4.99,.41,.33,2.15],[5.43,.274,.24,2.13],[5.67,.14,.15,2.12]],
 canopy:[[-1.88,2.28,.292,.099],[-1.39,2.38,.405,.35],[-.57,2.45,.49,.59],[.18,2.49,.51,.65],[1.13,2.54,.492,.62],
  [1.96,2.57,.442,.57],[2.59,2.58,.36,.26],[2.85,2.54,.315,.059]],
 wing:[[0,1.72,1.96,-1.37,.53],[1.2,1.73,1.98,-1.38,.52],[2.52,1.75,1.94,-1.38,.51],[4.55,1.89,1.73,-1.16,.40],
  [6.21,2.01,1.36,-.95,.29],[7.54,2.12,1.02,-.75,.18],[7.97,2.15,.75,-.59,.11],[8.125,2.166,.55,-.35,.06]],
 tail:[[.15,1.72,-4.52,-6.14,.223],[.93,1.75,-4.64,-6.15,.181],[2.20,1.81,-4.89,-6.03,.126],[2.59,1.84,-5.11,-5.87,.072]],
 fin:[[1.39,-5.12,-6.21,.193],[1.89,-4.88,-6.24,.22],[2.70,-5.01,-6.23,.20],[3.49,-5.24,-6.06,.164],
  [3.98,-5.54,-5.94,.11],[4.16,-5.68,-5.85,.064]],
 references:[
  reference('Striking by Night: Messerschmitt Bf 110, Australian War Memorial','https://www.awm.gov.au/visit/exhibitions/striking/planes/german/bf110','AWM reference page, copyrighted text and reference photograph','16.25 m span, 12.65 m length and G-4 exterior.'),
  reference('Messerschmitt Bf 110G-4 technical data, Revell','https://downloads.revell.de/Manuals-Modelkits/CM_04857.pdf','Revell copyright','4.16 m height and SN-2 appearance comparison.'),
  reference('Messerschmitt Bf 110G-4, Royal Air Force Museum','https://www.rafmuseum.org.uk/research/collections/messerschmitt-bf-110g-2/','RAF Museum copyright','External antenna array and survivor silhouette.'),
 ],
});
