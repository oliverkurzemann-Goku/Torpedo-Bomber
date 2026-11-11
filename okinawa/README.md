# Okinawa coastal study — build 1

Open `../okinawa-preview.html` for the scenery viewer, using the carrier game’s vegetation density. Torpedo Squadron BUILD 125 includes two **Okinawa coastal combat sorties** after the carrier sorties and **Okinawa Coast · Free Flight** as an optional practice mission. The game builds the same environment for these missions, with 45% of the viewer's decorative vegetation for a lower iPad rendering cost. Thunderbolt Squadron and Remagen form the second campaign with a chapter transition.

## Scope and provenance

The first region is a **16 × 16 km section of central western Okinawa**, including Cape Zanpa, Yomitan/Hagushi and the surrounding inland hills. It is not the whole island.

- `data.js` contains 16 real elevation tiles and water/forest/field polygons recovered from this repository's previous geographic data pipeline at commit `17048c9`. No code or decorative assets from the removed Okinawa testbed have been restored.
- Source elevations: Copernicus GLO-30, resampled by the existing pipeline at **62.5 m** spacing. The rendered grid interpolates these samples; it does not provide additional survey accuracy.
- Source planimetry: Overture Maps/underlying OpenStreetMap data, from the same archived conversion. Polygon coordinates rounded to 0.1 m for compact storage; source accuracy is not 0.1 m.
- CRS: **WGS 84 / UTM zone 52N, EPSG:32652**. Runtime origin: easting 377000, northing 2919000. Metres, X east, Y elevation, **negative Z north**. Original DEM sample rows increase northward.
- Coverage: eastings 369000–385000, northings 2911000–2927000. Boundaries are an explicit study-area limit.
- Coast cells are feathered to sea level. Underwater relief, reef bands, textures, vegetation, small hamlets and cloud shadows are artistic approximations. This is **not a historically surveyed 1945 reconstruction**. Current geographic data also contain modern shoreline alterations.

The material direction follows the region's limestone shore, subtropical broadleaf vegetation, and traditional low houses with red tiled hip roofs and coral garden walls. Small settlements are representative scenery, not individually geolocated historical buildings. No modern lighthouse is added to a potential WWII setting.

## Integration

Load Three.js r128, `data.js` and `world.js`, then (the shipped game and viewer also load `vendor/GLTFLoader-r128.js` and `fortification-assets.js` for the uploaded fortifications):

```js
const environment = await new OkinawaWorld(OKINAWA_DATA).build();
scene.add(environment.root);
environment.getHeight(worldX, worldZ); // synchronous collision-height query
environment.update(dt);              // animated sea and lighting detail
environment.setLight(true);          // late-afternoon water/sky palette
// Remove and release GPU resources when leaving the region:
environment.dispose();
```

The caller owns camera, renderer, fog, lights and game state. `viewer.js` is only the standalone inspection UI. In Torpedo Squadron, the carrier stays at its original sea coordinates; the environment root is shifted 10 km east. Every sortie now uses the mapped coast, including training and the fleet defence sorties. The carrier game's animated, reflective sea stays active and reads the Okinawa shoreline texture to clip water over land; the viewer's flat water is hidden. Terrain controls collision, aircraft shadow, ship shore avoidance and minimap. Leaving for the menu disposes of the world and its GPU resources; the next sortie rebuilds it. The coastal ship strikes remain fictional. Target positions are over water and do not claim to reconstruct historical 1945 operations.

The viewer's **Download terrain model** button exports a glTF 2.0 binary (`.glb`) containing the textured elevation mesh. Instanced vegetation, buildings, sky and animated water stay in `world.js` and must be integrated as scenery. Water is intentionally not baked into the collision model.

Controls: drag to look; pinch or mouse wheel to travel; WASD/arrows to move; E/Q or +/− to change altitude; Shift for faster travel; Space toggles the guided flyover; Escape restores the interface. Three viewpoints and daylight/late-afternoon lighting are provided.

## Credits and licence notices

**Elevation:** produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.

The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30. No endorsement is implied. Subsequent redistribution must preserve these notices and the applicable data licence.

- [Copernicus DEM data and licence](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM)
- [Copernicus DEM public source](https://registry.opendata.aws/copernicus-dem/)
- [Overture Maps attribution](https://docs.overturemaps.org/attribution/)
- Map features © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL; Overture Maps and respective upstream contributors. `data.js` is an adapted geographic database; preserve applicable upstream attribution/licensing when redistributing it.
- [Regional architecture reference](https://visitokinawajapan.com/discover/traditional-culture/traditional-okinawan-houses/)
- [Yomitan geographic reference](https://visitokinawajapan.com/destinations/okinawa-main-island/central-okinawa-main-island/yomitan/)
- [Three.js](https://github.com/mrdoob/three.js), MIT licence, r128 as used by the existing games.

Procedural scenery meshes, materials and viewer code were created for this project. The two fortification models are user-supplied scans: `putsborough__wwii_observation_post.glb` and `bunker_o323a-160_z.glb`. Their original photographic materials and shapes are retained in optimized `assets/buildings/observation-post.glb` and `bunker.glb`; source hashes and processing statistics are embedded in each GLB. These representative coastal placements do not identify actual Okinawan fortifications.

Reproduce optimization with `node scripts/prepare-fortifications.mjs <original-post.glb> <original-bunker.glb>`. Runtime assets use ordinary glTF 2.0, with textures capped at 512px. Only one bunker and two observation posts draw full geometry near the camera. Cached models share resources and survive individual world disposal.

Build 242 ergänzt eine gestaltete Servicefläche im Gelände neben den
Luftfeldzielen. Korallenschotter und Reifenspuren folgen dem vorhandenen Mesh.
Zwei Isuzu-Varianten, Materialwagen und Bodenpersonal sind im Nahbereich aktiv.
Die eigene Okinawa-Vorschau hat dafür den Blickpunkt **Airfield**.
Die Detailstufe der roten Ziegeldächer ergänzt eine niedrige Sichtwand nach
Ryūkyū-Vorbild. Modelle und Referenzen stehen in [GROUND-MODELS.md](../GROUND-MODELS.md).

## Build 244 — coastal details

The carrier game and the Okinawa viewer share 20 original scenery templates.
Six coastal zones contain limestone stacks, reef breakers, fishing landings,
groves, farms and small landmarks. Terns, egrets and dolphins use instanced
animation. The viewer’s **Coastal details** viewpoint starts at a fishing jetty.

- Regenerate the offline runtime bundle with `node scripts/build-okinawa-scenery.cjs`.
  The same deterministic geometry generator exports the standalone GLBs.
- The additions use one shared 512 × 512 atlas and one Lambert material in
  the game. Each zone displays either its close batch or its distant batch.
  At most four zone batches and seven wildlife batches can be visible.
- Placement uses the rendered terrain and shoreline. The 30,000-instance
  budget from the Okinawa integration test applies to the carrier setup.
  Terrain height, runway clearance and decorative disposal are covered by
  `node okinawa/tests/coastal-scenery.cjs`.

## Build 245 — farmland, villages and groves

The existing ground atlas now carries larger crop parcels, limestone shore
tones and a relief cue calculated from the elevation samples. The fields,
roads and two coastal villages are illustrative scenery. Hagushi and the
southern village each have a square, red tile roofs and a street that joins
the island road network. The landscape overview starts at
[`okinawa-preview.html?view=towns`](../okinawa-preview.html?view=towns).

Trees grow in small stands within larger woodland patches, with gaps for
fields, roads and courtyards. The terrain uses the existing 2048² atlas,
terrain vertices and shoreline distance map. The village streets and squares
are painted into that atlas. The coastal scenery regression checks farm
coverage, road connections, tree spacing and the instance budget.

## Forested ridges

The Nago and Kushi reference photos guided the colour and relief of the
existing Yomitan map. The source DEM and shoreline remain intact. An artistic
adjustment strengthens the existing inland ridges and ravines, tapering out at
low elevations and around water and the airfield. The game samples the
rendered triangles for terrain contact and aircraft shadows.

Continuous, dark-green woodland and shaded gullies are baked into the same
2048² colour atlas. The terrain retains 16 meshes and 524,288 triangles.
The viewer’s [Inland viewpoint](../okinawa-preview.html?view=inland) overlooks
the reshaped interior. The reference photos are used for comparison only.
