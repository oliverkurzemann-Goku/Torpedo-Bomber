# Remagen vehicle credits

## Campaign menu artwork (Build 159)

`assets/pacific-campaign.webp` and `assets/europe-campaign.webp` are original
AI-generated campaign illustrations made with built-in ImageGen. They are not
historical photographs or documented reconstructions. Full prompts and asset
paths are recorded in [Campaign artwork](assets/CAMPAIGN-ART.md).

## Vehicle models

Build 14 uses existing repository models as static scenery. Build 19 also reuses the
selected Tiger as the moving tracked-target visual. Build 21 adds licensed period traffic.
Vehicle positions are illustrative, not a reconstruction of documented unit positions in
March 1945.

Build 137 also uses two previously inactive repository GLBs:

- **Jadgpanther (War Thunder)** — PolyDucky. Source:
  https://sketchfab.com/3d-models/jadgpanther-war-thunder-813e100326194334b52887a17416e0b8
  License recorded in `jagdpanther.glb`: **CC BY 4.0**. One shared 5,406-triangle
  template replaces the lead vehicle in the moving Remagen road column.
- **Me 163 B (War Thunder)** — KojfDiscord. Source:
  https://sketchfab.com/3d-models/me-163-b-war-thunder-b803273028ee4ebc87ca4af2e15766fb
  License recorded in `me163.glb`: **CC BY 4.0**. One enemy rocket interceptor
  appears in the Valley Patrol sortie; no propeller or synthetic wheels are added.

- **M16 MGMC (War Thunder)** — KojfDiscord. Source:
  https://sketchfab.com/3d-models/m16-mgmc-war-thunder-fbdb51b1f92f45eebe791a16d805acd4
  Author: https://sketchfab.com/KojfDiscord
  License recorded in the supplied GLB: **CC BY 4.0**,
  https://creativecommons.org/licenses/by/4.0/
  File: `m16_mgmc.glb`. Runtime changes: Lambert material conversion, centring,
  metre-scale normalization and terrain placement; original GLB unchanged.
- **Free Tiger And Crew Kit** — adrielcz. Source:
  https://sketchfab.com/3d-models/free-tiger-and-crew-kit-6290669ab2cb49599f1606507626af39
  Author: https://sketchfab.com/adrielcz
  License recorded in the supplied GLB: **CC BY 4.0**,
  https://creativecommons.org/licenses/by/4.0/
  File: `tiger.glb`. Runtime changes: only the `TIGER_H1` subtree is displayed
  (spare kit pieces and crew excluded), Lambert material conversion, normalization
  and terrain placement; Build 19 also clones this selected subtree for moving
  tracked targets. The original GLB remains unchanged.
- **8,8 cm Flak 37 Sfl. (War Thunder)** — KojfDiscord. Source:
  https://sketchfab.com/3d-models/88-cm-flak-37-sfl-war-thunder-7a9b4abbc2884ef6bbf5dbffbe8adf2b
  Author: https://sketchfab.com/KojfDiscord
  License recorded in the supplied GLB: **CC BY 4.0**,
  https://creativecommons.org/licenses/by/4.0/
  File: `flak88_sfl.glb`. Build 20 runtime changes: Lambert material conversion,
  metre-scale normalization and two shared clones at the existing gun positions;
  the original GLB remains unchanged.
- **1940 Ford V8** — Saurav Maity. Primary source:
  https://sketchfab.com/3d-models/1940-ford-v8-d9e2efb283534eebae96cf0963820d35
  Author: https://sketchfab.com/saurav.maity
  License shown on the source page: **CC BY 4.0**,
  https://creativecommons.org/licenses/by/4.0/
  Files: `assets/remagen/ford1940/1940_ford_v8.fbx` plus its supplied textures. The
  source archive was obtained from the public author-attributed mirror
  https://downloadfree3d.com/3d-models/vehicles/classic-car/1940-ford-v8/
  Runtime changes: Lambert material conversion, centring and 4.75m normalization. To
  match the archive's supplied PNG files, the FBX's external `.dds` filename suffixes
  were changed to `.png`; geometry is unchanged. The 78 source meshes are combined by
  shared material into no more than 23 render batches and cloned for four civilian cars.
- **DRB 01.10 Steam Locomotive (low poly)** — Götz von Berlichingen. Primary source:
  https://sketchfab.com/3d-models/drb-0110-steam-locomotive-low-poly-b4e4252632f44492b6c018627a6b4a60
  Author: https://sketchfab.com/vonBerlichingen
  License shown on the source page: **CC BY 4.0**,
  https://creativecommons.org/licenses/by/4.0/
  File: `assets/remagen/drb0110/drb0110.glb`. The Collada source and its textures were
  obtained from the public author-attributed mirror
  https://downloadfree3d.com/3d-models/vehicles/trains/drb-01-10-steam-locomotive-low-poly/
  and converted locally to one texture-embedded GLB. Runtime changes: Lambert material
  conversion, centring and 24.1m normalization. The shipped result is two meshes and
  6,940 triangles and replaces the procedural train target.
- **Horse** — Quaternius. Source:
  https://poly.pizza/m/qvTrSG9pZF
  Author: https://quaternius.com/
  License shown on the source page: **CC0 1.0**,
  https://creativecommons.org/publicdomain/zero/1.0/
  File: `assets/remagen/horse/quaternius_horse.glb`. Runtime changes: Lambert material
  conversion, centring and 2.5m normalization. Eight skeleton-safe clones use the supplied
  `Walk` animation and are paired with the project's low-cost wooden cart geometry. The
  source horse is eight skinned meshes, 2,182 triangles and 50 bones.

Build 19 also reuses the repository's existing `merchant_ship.glb` as a two-copy,
30m Rhine workboat silhouette. The GLB contains no embedded author, source or licence
metadata, so none is invented here. It is a visual stand-in, not a historically exact
Remagen ferry; the original file remains unchanged.

- **Me 262 engine loop** — LEJ.approach/dvldi, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Messerschmitt_Me-262_At_Hahnweide_Air_Show_2011.ogv),
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The source is a 2011
  airshow video of a Me 262 replica powered by modern GE J85 jet engines, not an
  original Jumo 004 recording. `me262-engine-loop.wav` is a 1.6-second mono PCM loop derived from the
  excerpt around 1:15–1:17 of that video. Build 129 applies a circular 240 Hz high-pass,
  reduces short level surges and crossfades the seam; PCM avoids codec padding during
  repetition. Both this WAV and `me262-engine.mp3` are unused archival assets as of Build 131.

Attribution for the original repository GLBs is transcribed from each GLB's
`asset.extras`. Build 21 attribution and licenses were checked against the linked primary
model pages; public mirrors supplied the two downloadable source archives. This record does
not establish rights beyond those granted by the named uploaders.

## Me 262 aircraft and low-poly tree pack

Not previously listed here even though both are active runtime assets, not archival —
found while syncing this file against the actual code (`grep` for each `.glb` filename,
not assumed). Attribution below is transcribed from each GLB's own `asset.extras`, the
same method this file already uses for the vehicle models above.

- **Me 262 A-1a/Jabo (War Thunder)** — KojfDiscord. Source:
  https://sketchfab.com/3d-models/me-262-a-1ajabo-war-thunder-a6e4bd7a047f49b292e59ad285850310
  Author: https://sketchfab.com/KojfDiscord
  License recorded in the supplied GLB: **CC BY 4.0**,
  https://creativecommons.org/licenses/by/4.0/
  File: `me262.glb`. Used as the player's Me 262 in both `thunderbolt-europe.html` (EU
  BUILD 50+) and `remagen-mission.html`. Runtime changes: standard rigging shared with
  every other playable aircraft in these files (gear/canopy fitting, `KHR_materials_
  pbrSpecularGlossiness` replaced by a plain textured `MeshStandardMaterial` for iOS
  texture-loading reliability); the model is a jet, so the shared propeller-cutting
  step (3.1) is skipped for it. Original GLB unchanged.
- **Low Poly Forest Tree Pack** — 99.Miles. Source:
  https://sketchfab.com/3d-models/low-poly-forest-tree-pack-5ff5a51e74324845a4e4905f182dfb2b
  Author: https://sketchfab.com/99.Miles
  License recorded in the supplied GLB: **CC BY 4.0**,
  https://creativecommons.org/licenses/by/4.0/
  File: `treepack.glb`. Used by `thunderbolt-europe.html` (EU BUILD 51+) to upgrade the
  procedural conifer/rock scenery to real geometry once it finishes loading (the
  procedural version stays as a fallback and during load). Runtime changes: each
  trunk/crown pair's `matrixWorld` is baked into its own geometry before cloning
  (the pack ships as one arranged scene, not origin-centred parts); `material.
  vertexColors` is forced off (the source file's `COLOR_0` attribute produced no
  usable per-vertex color and just re-tinted the texture); Lambert/Standard material
  conversion. Original GLB unchanged.

## Build 131 jet sound

`audio/jet-engine.js` is original procedural sound design: filtered combustion noise,
exhaust air rush and quiet sine turbine partials, generated in Web Audio. It contains
no recording or third-party samples and is not presented as an authentic Jumo 004
recording. A 23.75-second equal-power noise loop has constant playback speed;
throttle changes the spectrum and level with gradual spool response. The old
airshow recording is no longer loaded by the game.


## Build 172 — uploaded fleet, Corsair and period buildings

The previous `merchant_ship.glb` is retired. Ship exports preserve original geometry and textures, isolate collection members, bake static world transforms and cap embedded texture size at 1024px. Aircraft preserve the original exterior and animate the original rotor. Optional buildings use 512px textures, shared geometry and bounded nearby detail.

- `assets/ships/fletcher.glb`: [Warships - Call of Duty: World At War ᴴᴰ](https://sketchfab.com/3d-models/warships-call-of-duty-world-at-war-hd-49f465e925f84efa91acb58fc515f90d) by Nazar Okruzhko (Назар Окружко) (https://sketchfab.com/Deduska_1947); CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).
- `assets/ships/japanese-cargo.glb`: [Warships - Call of Duty: World At War ᴴᴰ](https://sketchfab.com/3d-models/warships-call-of-duty-world-at-war-hd-49f465e925f84efa91acb58fc515f90d) by Nazar Okruzhko (Назар Окружко) (https://sketchfab.com/Deduska_1947); CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).
- `assets/ships/ko-hyoteki.glb`: [Type A Ko-hyoteki Japanese Midget Submarine](https://sketchfab.com/3d-models/type-a-ko-hyoteki-japanese-midget-submarine-93cde98a93fd4b2e9820e780e5ec9c91) by Savy (https://sketchfab.com/SavyTheCreator); CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).
- `assets/ships/landing-ship.glb`: [Warships - Call of Duty: World At War ᴴᴰ](https://sketchfab.com/3d-models/warships-call-of-duty-world-at-war-hd-49f465e925f84efa91acb58fc515f90d) by Nazar Okruzhko (Назар Окружко) (https://sketchfab.com/Deduska_1947); CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).
- `assets/ships/liberty.glb`: [Liberty ship](https://sketchfab.com/3d-models/liberty-ship-a1db8e8414464c5d8b11383e202fcf26) by AlanTinka (https://sketchfab.com/AlanTinka); CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).
- `assets/ships/samidare.glb`: [Samidare destroyer](https://sketchfab.com/3d-models/samidare-destroyer-b37939147c854e61857f5b248f9efd29) by everlasting17th (https://sketchfab.com/everlastinggrey); CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).
- `assets/buildings/farm-ruin.glb`: [bombed_farm_buildings from FPS creator classic](https://sketchfab.com/3d-models/bombed-farm-buildings-from-fps-creator-classic-2cf04644ad0944e5b5b845680262d269) by Garbage Raccoon (https://sketchfab.com/GarbageRaccoon); CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).
- `assets/buildings/hangar.glb`: [t2 hangar](https://sketchfab.com/3d-models/t2-hangar-a059de1574c84b0a8a2a00930782006f) by ElectricLeo (https://sketchfab.com/ElectricLeo); CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).
- `assets/buildings/house.glb`: [World War II House 1 - Low Poly](https://sketchfab.com/3d-models/world-war-ii-house-1-low-poly-4b9b73b30c424857b4cf4a72701de115) by BedoyaCamilo (https://sketchfab.com/BedoyaCamilo); CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).
- `assets/buildings/town-ruin.glb`: [BUILDING DESTROYED](https://sketchfab.com/3d-models/building-destroyed-ca13adc8bba0480a8bdde834889c5444) by danieljorge435 (https://sketchfab.com/danieljorge435); CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).
- `f4u-1c_corsair_war_thunder.glb`: [F4U-1C Corsair (War Thunder)](https://sketchfab.com/3d-models/f4u-1c-corsair-war-thunder-440585ee30bc4b6299b4b1bd8d09e3d8) by KojfDiscord (https://sketchfab.com/KojfDiscord); CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).

The concrete observation posts are simple original geometry inspired by the supplied bunker/observation-post references. Large warehouse and Carentan files remain available as reference uploads and are not duplicated throughout the terrain.
