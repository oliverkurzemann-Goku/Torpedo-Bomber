'use strict';
const coast=['Japan Location Database: Zanpa Cape','https://jl-db.nfaj.go.jp/en/location/470100068/','Location description and photography, rights retained','Limestone coastline and salt-tolerant vegetation'];
const reef=['Japan Ministry of the Environment: Cape Zanpa and Maeda','https://www.env.go.jp/en/nature/biodic/kaiyo-hozen/kaiiki/engan/14805.html','Reference page, rights retained','Regional reef and shallow-water habitat'];
const plants=['Okinawa Forest Resources Research Center: useful plants of Okinawa','https://www.pref.okinawa.jp/rinshi/yuyou_list.html','Prefectural reference, rights retained','Regional plant context'];
const cyc=['National Museum of Nature and Science: Cycas revoluta','https://www.kahaku.go.jp/research/activities/project/hotspot_japan/ryukyus/db/S1531.html','Museum reference, rights retained','Species and Ryukyu distribution'];
const crops=['The Asia-Pacific Journal: Yomitan village reconstruction','https://apjjf.org/wp-content/uploads/2023/11/article-2436.pdf','Published article, rights retained','Traditional sugarcane and sweet potato production'];
const boat=['Aguni Archives: Sabani','https://www.aguni-archive.jp/search/detail.jsp?id__=302','Local archive, rights retained','Fuka-akki fishing form, about 7 m long and 1 m wide'];
const tomb=['Okinawa Prefectural Archives: turtle-back tomb','https://www2.archives.pref.okinawa.jp/opa/SearchPicsDetail2.aspx?pid=80468','Archival record, rights as listed','General curved tomb type and hillside setting'];
const utaki=['Visit Okinawa Japan: Sonohyan Utaki Stone Gate','https://visitokinawajapan.com/discover/world-heritage-top/sonohyan-utaki-ishimon/','Okinawa travel reference, rights retained','Cultural context for a fictional grove and coral-limestone enclosure'];
const well=['Itoman City: Sunjaga Well','https://www.city.itoman.lg.jp/site/kankou-navi/1740.html','Municipal reference, rights retained','1920s village well and local stone masonry context'];
const tern=['IUCN UK Peatland Programme: Little tern','https://www.iucn-uk-peatlandprogramme.org/wildlife-explorer/seabirds/little-tern','Reference text and photograph, rights retained','48–55 cm wingspan, 22–24 cm length, coastal appearance'];
const egret=['Henry Sowell: Little Egret','https://henrysowell.com/birds/little-egret','Copyrighted reference page','88–106 cm wingspan, 55–65 cm length, white plumage'];
const dolphin=['National Museum of Nature and Science: Indo-Pacific bottlenose dolphin record 3267','https://www.kahaku.go.jp/research/db/zoology/marmam/drift/detail.php?id=3267','Museum record, rights retained','Measured 2.60 m specimen as a scale reference'];
const entries=[
 ['limestone-stack','Limestone sea stack','Limestone', [16,13,11],[coast,reef],'An authored sea stack and two layered coral-limestone outcrops.'],
 ['reef-foam','Reef-break foam','FoamRibbons',[66,.18,14],[reef],'Broken white ribbons represent waves on a fictional reef edge.'],
 ['driftwood','Beach driftwood','Driftwood',[3.3,1.35,8],[coast],'An original weathered trunk with root ends and broken branches.'],
 ['pandanus','Adan pandanus','Pandanus',[5.8,4.5,5.4],[coast,plants],'Salt-tolerant screw pine with prop roots and narrow, arched leaf rosettes.'],
 ['cycad','Sotetsu cycad','Cycad',[3.3,2.3,3.3],[cyc],'A squat stem and open crown of long leaves.'],
 ['beach-creepers','Flowering beach creepers','Creepers',[8,.38,5.7],[coast,plants],'A fictional patch of low salt-tolerant groundcover with scattered purple blooms.'],
 ['ryukyu-pine','Wind-shaped Ryukyu pine','Pine',[10.5,12.2,10.7],[plants],'A mature stylized pine with uneven horizontal foliage clusters.'],
 ['bamboo-clump','Bamboo clump','Bamboo',[5.8,8.1,5.9],[plants],'A stylized group of slender leaning culms and light leaf sprays.'],
 ['banyan','Gajumaru banyan','Banyan',[17,11,15],[plants],'A broad forked fig canopy with hanging roots reaching the ground.'],
 ['sugarcane-patch','Sugarcane rows','Sugarcane',[9,2.6,16],[crops],'A small set of raised cane leaves and stems, arranged in visible rows.'],
 ['sweet-potato-beds','Sweet potato beds','SweetPotatoBeds',[22,1.05,26],[crops],'Low ochre ridges and dark, creeping green foliage.'],
 ['rice-paddy','Irrigated rice plot','RicePaddy',[23,.68,31],[reef,crops],'A fictional lowland plot with raised bunds, green seedlings and a baked water-color surface.'],
 ['turtleback-tomb','Turtleback tomb','TurtlebackTomb',[10.2,4.1,7.6],[tomb],'Original hillside landmark with a curved roof, shaded doorway and low forecourt.'],
 ['utaki-grove','Small utaki grove','UtakiGrove',[11,5.5,7.4],[utaki],'Fictional Ryukyuan sacred grove with a modest stone enclosure and trees.'],
 ['stone-well','Stone village well','StoneWell',[3.7,2.6,3.5],[well],'Original ring masonry with a timber crossbar and shaded well interior.'],
 ['fishing-jetty','Timber fishing jetty','FishingJetty',[3.3,2.1,20.2],[coast,boat],'Fictional timber landing with an open deck, piles and mooring posts.'],
 ['sabani','Sabani fishing skiff','SabaniHull',[1,.76,7],[boat],'Open wooden Fuka-akki-style skiff, with an authored .32 m draft.',.32],
 ['tern','Little tern','TernBody',[.53,.11,.23],[tern],'Coastal tern in flight with two separately hinged wings.'],
 ['egret','Little egret','EgretBody',[1.0,.22,.60],[egret],'A small white egret in flight with two separately hinged wings.'],
 ['dolphin','Indo-Pacific bottlenose dolphin','Dolphin',[.90,.85,2.60],[dolphin],'An exterior silhouette with a tapered rostrum, dorsal fin and flukes.'],
];
const specs=entries.map(([shape,title,label,size,refs,description,draft])=>({
 id:shape+'-okinawa-own',shape,title,label,size,refs,description,draft,
 budget:{triangles:1800,meshNodes:3,materials:1,texture:[512,512],bytes:250000},
}));
module.exports=specs;
