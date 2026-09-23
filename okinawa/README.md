# Okinawa coastal study — build 1

Open `../okinawa-preview.html` for the full-density scenery viewer. Torpedo Squadron BUILD 125 includes two **Okinawa coastal combat sorties** after the carrier sorties and **Okinawa Coast · Free Flight** as an optional practice mission. The game builds the same environment for these missions, with 45% of the viewer's decorative vegetation for a lower iPad rendering cost. Thunderbolt Squadron and Remagen form the second campaign with a chapter transition.

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

Load Three.js r128, `data.js` and `world.js`, then:

```js
const environment = await new OkinawaWorld(OKINAWA_DATA).build();
scene.add(environment.root);
environment.getHeight(worldX, worldZ); // synchronous collision-height query
environment.update(dt);              // animated sea and lighting detail
environment.setLight(true);          // late-afternoon water/sky palette
// Remove and release GPU resources when leaving the region:
environment.dispose();
```

The caller owns camera, renderer, fog, lights and game state. `viewer.js` is only the standalone inspection UI. In Torpedo Squadron, the carrier stays at its original sea coordinates; the environment root is shifted 10 km east. The water shader keeps its shoreline lookup in local coordinates. The game's sky and ocean switch off while the Okinawa scene is active; it checks actual ground height for collision, places the aircraft shadow on the land surface, and plots land on the minimap. Leaving for the menu or a different mission disposes of the world and its GPU resources; returning to Okinawa rebuilds it on demand. Two fictional coastal ship strikes now conclude the Pacific campaign before optional free flight. Target positions are verified over water; they do not represent historical Okinawa 1945 operations.

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

All new scenery meshes, procedural materials and viewer code were created for this project. No photographs or satellite imagery have been copied into the assets.
