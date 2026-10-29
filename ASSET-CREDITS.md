## Pacific aircraft details (Build 220)

Runtime adaptations by this project, with the source model credits below retained:

- `zero-canopy.js`: splits the A6M canopy's existing UV islands into clear glazing
  and alpha-tested original painted frames; adds an original cockpit interior and
  the project's seated IJN crew figure. `zero.glb` remains byte-for-byte intact.
- `sbd-native.js`: removes the two disconnected static centre-flap islands that
  appeared as a white strip under the HappySunpore Dauntless wing root (88 triangles).
  Original articulated perforated brakes, bomb cradle and landing gear are retained.
- `avenger-bay.js`: splits the existing helijah Avenger belly skin into two painted,
  hinged bay doors, retaining source UVs/materials. Adds original internal bay walls
  and the project's procedural torpedo, limited to one carried store. The original
  GLB remains unchanged; release, reload and saved-flight counts use one torpedo.

## Build 215 — cleaner loaded voices (29 October 2026)

P-47, Fw 190 and Avenger use the prepared 25-second loaded recordings with
persistent cabin tones and hiss reduced and circular envelope leveling. The same
adapted source families now supply the SBD and Zero power layers, with quicker
playback at high power. These remain declared substitutes, not authenticated
R-1820/Sakae recordings or measured engine RPM. Accepted idle recordings and
processing, Bf 109, Ju 87, Corsair and jet/rocket audio are unchanged.

Output rises across idle, 25%, 50%, 75% and full power. Actual Web Audio rendering
checks sixty-second sustain, short level dips, clipping headroom, throttle return,
stop silence, cache isolation and missing-file reporting. Source cuts, processing,
output SHA-256 and measured sample statistics are in `detail-provenance.json`.
Reproduce with `scripts/engine-audio/refine-loaded-radials.py --source-dir <external-source-dir>`
after acquiring the same verified sources as Build 214. Existing source licenses
and attribution below apply. Raw WAV sources remain outside the checkout.

# Squadron asset credits

## Build 214 — loaded radial sound (28 October 2026)

P-47 uses a new 25-second onboard flying R-2800 recording from Pole Position
Production's Grumman F8F Bearcat selection in the free SONNISS GameAudioGDC 2017
bundle. The onboard microphone travels with the aircraft, avoiding an exterior
pass-by Doppler sweep. The P-47 exhaust installation is adapted; source RPM and
manifold pressure are unmeasured. This is not a calibrated 2,700-RPM P-47 take.

Fw 190 and Avenger use an explicitly composite loaded game voice: airborne R-2800
exhaust texture retimed at 14/18, mixed with low-band R-2600 texture from the B-25
exterior startup/idle recording. This is not an original BMW 801 or Avenger
full-power take, and is not a physical firing-order reconstruction. Existing
idle recordings are retained. Separate power playback rate and an earlier
idle/load crossfade make throttle affect timbre as well as level.

Sources: [free GDC collection](https://sonniss.com/gameaudiogdc/),
[Bearcat](https://sonniss.com/sound-effects/grumman-f8f-bearcat/),
[B-25](https://pole.se/product/north-american-b-25-mitchell/),
[SONNISS GDC Bundle License](https://sonniss.com/gdc-bundle-license/), v2.0 effective
27 August 2026, acquired 28 October 2026. The selected free bundle recordings permit
incorporation and modification in commercial/noncommercial games and interactive
projects; attribution is not required. No standalone sound/sample-library
redistribution or AI training. Only edited game loops are included here; raw
source WAVs remain outside the public checkout and app payload.

Exact source identities, archive ranges, SHA-256 values, cuts, transformations and
output hashes are in `audio/engines/loaded-provenance.json`. Rebuild with
`scripts/engine-audio/build-loaded-radials.py --source-dir <external-source-dir>`;
`scripts/engine-audio/fetch-loaded-sources.py --dest <external-source-dir>` acquires
only the two used free bundle files. Seven other aircraft voices remain as in
Build 213. Actual Web Audio tests cover 60-second sustain and timed idle/full/idle
transitions; numerical results do not establish subjective iPad listening quality.
The reported P-47 lift-off difficulty is still open; no flight tuning in this build.

## Fw 190 A-8 and Me 163 B Komet — reference rebuild, Build 210

`assets/aircraft/fw190a8-own.glb` and `assets/aircraft/me163b-own.glb` replace the
inaccurate Build 209 forms. `scripts/own-aircraft/measure-fw190-komet.cjs` converts
recorded screenshot landmarks into metre-scale stations; `scripts/build-own-fw190-komet.cjs`
builds new lofts, UVs and procedural paint. Pixel calibration and raw landmarks are
kept in `scripts/own-aircraft/fw190-komet-landmarks.json`, with editable output tables
under `fw190a8/shape.json` and `me163b/shape.json`. No third-party mesh, source artwork
pixels or texture is embedded in the models.

Overall dimensions and configuration references, consulted 27 October 2026:
- Fw 190 A-8: [Luftfahrtmuseum Hannover](https://luftfahrtmuseum-hannover.de/index.php/en/infotext/schild-focke-wulf-190gb), span 10.50 m, length 8.95 m.
- Me 163 B: [Australian War Memorial](https://www.awm.gov.au/visit/exhibitions/striking/planes/german/me163), span 9.32 m, length 5.69 m; jettisoned takeoff wheels and landing skid.

The user supplied IMG_0728 (Fw 190 three-view, the-blueprints.com), IMG_0729 (variant
profiles, Reddit screenshot), IMG_0730 (Fw 190 profiles, hyperscale.com), and IMG_0731
(Me 163 B-1 multi-view, the-blueprints.com). These supply exterior contours and colour
arrangements: yellow 12 Fw 190 and white 54 Komet, with simplified small markings.
The screenshots are not redistributed. Their underlying artwork authors/licences are
not established here; reference/adaptation review remains open as recorded in the register.
Cross sections, surface thickness, cockpit interiors and kinematics remain visual
approximations. Contour QA measures agreement with digitised screenshot outlines, not
engineering accuracy. Original project code/UV/paint work is reserved to Oliver Kurzemann;
this does not change the repository's UNLICENSED status.
The Fw 190 includes its own three-blade rotor, inward-folding wide-track gear, flaps,
ailerons, elevators, rudder and six named visual muzzle origins. The tailless Komet
includes mixed elevons, split landing flaps, rudder, retractable skid/tailwheel and
a small air-driven nose generator. Its existing sorties begin after trolley release.
`fw190.glb` and `me163.glb` are retained only as historical test fixtures, excluded
from active aircraft loaders and the offline app payload. Preview: `fw190-komet-preview.html`.

## Bf 109 F-2, own build (Build 203)

Messerschmitt Bf 109 F-2, Stab/JG 51, Werner Mölders, June 1941 — `assets/aircraft/bf109f2-own.glb`
Built by this project in code (scripts/build-own-bf109.cjs); no third-party mesh or texture.
Shape measured on the three-view in the owner-supplied PDF (German Wikipedia article
"Messerschmitt Bf 109", oldid 71076859, exported 2010-02-24):
- Abb. 16 three-view `Bf109F_3Seiten_neu.jpg` — Björn Huber (de.wikipedia), CC BY-SA 2.0
  https://creativecommons.org/licenses/by-sa/2.0/
Finish positions and colours measured on:
- Abb. 53 profile `Bf109F-2_Moelders_JG51_kl96.jpg` — Herbert Ringlstetter (Aviaticus.com), CC BY-SA 2.5
  https://creativecommons.org/licenses/by-sa/2.5/
Dimensions, engine, tank and armament from the article's tables (text CC BY-SA 3.0 / GFDL).

Neither drawing is embedded or copied into the model: outlines become a measured station table
(app/model-candidates/references/bf109f2/shape.json), the paint is drawn procedurally from
measured positions and colours. Whether that makes the model an adaptation of the drawings
(attribution / share-alike) is an open rights question, not decided here.
Swastika on the fin deliberately omitted. 71,162 triangles; 2048 px albedo, 1024 px normal map.
Output SHA256: efb76f22bf5057a1f24feab3f450787f1bc5decad8a76f79cbbac16698981f1f

## SBD Dauntless (Build 201)

SBD Dauntless — Squadron 1942 animated derivative (Build 201)
Original model: STB Dauntless, HappySunpore
Author: https://sketchfab.com/happysunpore
Source: https://sketchfab.com/3d-models/stb-dauntless-31e14fecfd9b4d51bdf0c4b27a0572f0
License: Creative Commons Attribution 4.0 International (CC BY 4.0)
https://creativecommons.org/licenses/by/4.0/

Changes for Oliver Kurzemann: original airframe, cockpit, engine and three-blade
propeller retained; uniform normalization to 12.66 m span, metres, +Z forward;
original gear, controls, rear guns and arrestor hook articulated; seven embedded
animation clips; same-outline perforated split dive brakes, recessed forward
barrel stubs and two procedural crew added. Newly painted blue-gray/light-gray
atlas, weathering, panel lines and 1942 white stars in dark-blue circles. No bars,
red rudder stripes, museum branding or reference photograph embedded. Smoothing
does not move the original skin. Adaptation offered under the same CC BY 4.0 terms.

This is an adaptation of the supplied mesh, not independently authored airframe
geometry or a CAD-accurate reconstruction. Source proportions are preserved:
12.66 m span and approximately 9.515 m source length, without longitudinal stretch.
73,414 triangles; 7,229,376 bytes; 2048 x 2048 embedded JPEG atlas.
Source SHA256: 41041f1cef18175ccffdf36338859c4159fb931bbe264fa5305ffa5cf2098774
Output SHA256: 80b06926d6c4d3168e9a52a61379b1a00a1841a8130afcca71f842870d8336e1
Original upload stb_dauntless.glb is preserved separately, unchanged.

Runtime: sbd-native.js; native clone-local pivots and barrel origins, no generic
replacement gear or stationary duplicate propeller. Former War-Thunder-labelled
sbd dauntless.glb excluded from runtime and app payload; repository history retained.
A repaint does not remove source-license obligations. Other app assets retain
their own provenance and unresolved release status. No physical-iPad certification.


## B-17 original-component animation (Build 200)

Boeing B-17 Flying Fortress — animated derivative (Squadron Build 200)
Original model and textures: helijah (Emmanuel Baranger), https://sketchfab.com/helijah
Source: https://sketchfab.com/3d-models/boeing-b-17-flying-fortress-927f07f6ddcf470ab0387ce5829024d5
License: Creative Commons Attribution 4.0 International (CC BY 4.0)
https://creativecommons.org/licenses/by/4.0/
Changes: named original propellers, gear, flaps, flight controls and turret pivots;
seven animation clips and actual barrel origins; uniform metre-scale normalization
to 31.62 m span, +Z forward; cooling fins and cockpit instruments simplified for
formations. Original exterior geometry, UVs and paint retained. This adaptation
is offered under the same CC BY 4.0 terms. Source/output hashes are recorded in
b17-helijah-provenance.json. No photograph embedded. This is an adaptation of the
supplied model, not a claim of newly authored geometry or CAD accuracy.
The former sabrezor/Arma CC BY-NC model b17.glb is excluded from runtime and the
native app payload; it remains a historical repository file and legacy test fixture.


## P-47 independent replacement (Build 203)

`assets/aircraft/p47-independent.glb` replaces the former War Thunder-derived
P-47 in active loaders and in the offline iPad package. Base model: mgg8 /
Aviation Gazetteer, CC0 1.0, creator-hosted original:
https://airmuseums.co.uk/models/aircraft/republic-p-47-thunderbolt.glb
https://sketchfab.com/3d-models/republic-p-47d-thunderbolt-raf-scheme-e831a70ab29c42d3a1dbd352d8bd4684

New original livery, panel/rivet/wear maps, fittings and extended tail gear are
project work for Oliver Kurzemann, with all reserved rights. No former-game mesh
or texture pixels were used. See `assets/aircraft/P47-CREDITS.txt`, documented
sources and editable Blender in `assets/aircraft/source/p47-independent/`.
The legacy root `p47new.glb` is retained only for historical mesh-cut regression
tests; it is excluded from the app payload and is not a runtime fallback.
The obsolete derivative `p47-weathered.glb` was removed from the active assets.
Historical performance anchors and explicit approximations: `P47-PERFORMANCE.md`.

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

Build 175 replaced the earlier procedural observation-post stand-ins with optimized versions of the supplied photographic scans. `assets/buildings/observation-post.glb` derives from davidetheridge’s Putsborough scan; `assets/buildings/bunker.glb` derives from matousekfoto’s bunker scan. Their exact original hashes and attribution are recorded in `app/release/model-provenance.json`. Large warehouse and Carentan files remain references, excluded from the native payload.


## Build 196 — complete native model inventory, checked 2026-10-14

The Build 196 offline package contained 35 model files (34 GLB + one FBX). The full exact-file
register is [app/release/asset-register.md](app/release/asset-register.md), with SHA-256
hashes and all 302 payload files in its adjacent JSON. Source metadata observations
are dated, and uploader declarations are kept separate from underlying rights grants.

Historical qualification: `b17.glb` carried **CC BY-NC 4.0** and was replaced in Build 200 by helijah’s separately supplied CC BY model;
several aircraft/vehicles explicitly identify War Thunder; three ships identify
Call of Duty: World at War; the IJN carrier metadata names World of Warships.
`uss_midway.glb` has no embedded author/license/source. App distribution clearance
remains open; see [APP-ASSET-AUDIT.md](APP-ASSET-AUDIT.md).

Previously missing aircraft/scan attribution is listed below. These are source
metadata declarations, not assertions that the uploader owns all underlying rights.
Original runtime model binaries remain unchanged by this preparation.

| File | Title / uploader | Declared license | Source |
| --- | --- | --- | --- |
| `assets/buildings/bunker.glb` | Bunker O3/23/A-160 Z — matousekfoto (https://sketchfab.com/matousekfoto) | CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/bunker-o323a-160-z-11ae7599f3b640569f7ed4692acabf38 |
| `assets/buildings/observation-post.glb` | Putsborough  WWII Observation Post — davidetheridge (https://sketchfab.com/davidetheridge) | CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/putsborough-wwii-observation-post-05255e1e580140e6ab6742c399c8affb |
| `b17.glb` | Helijah's B-17 — Secret Weapons - Arma 3 Mod (https://sketchfab.com/sabrezor) | CC-BY-NC-4.0 (http://creativecommons.org/licenses/by-nc/4.0/) | https://sketchfab.com/3d-models/helijahs-b-17-fe911eaf8d5e41eab65fae25b58664b1 |
| `b24.glb` | B-24 Liberator — CreadorDeMu (https://sketchfab.com/creadordemu) | CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/b-24-liberator-c64e58edfacb4c519b5602278a7e51aa |
| `bf109new.glb` | Bf 109 F-1 (War Thunder) — KojfDiscord (https://sketchfab.com/KojfDiscord) | CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/bf-109-f-1-war-thunder-0fec6a4fbae549e1929bd5978e89c4f4 |
| `fw190.glb` | Fw 190 F-8 (#2 Custom Payload) (War Thunder) — KojfDiscord (https://sketchfab.com/KojfDiscord) | CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/fw-190-f-8-2-custom-payload-war-thunder-17aea959a7a949c6801a7ea19d43e9b4 |
| `grumman tbm avenger.glb` | Grumman Tbm Avenger — helijah (https://sketchfab.com/helijah) | CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/grumman-tbm-avenger-4db814ed356a498cabe4badafd06ff6c |
| `ijn carrier.glb` | 小鬼子Japs瑞凤 Leyte1944 ( 战舰世界 ) — 世界战争游戏 World of WarGames (https://sketchfab.com/123112) | CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/japs-leyte1944-5054abd931554d1d81d0b8a3af77c08c |
| `p47new.glb` | P-47D-28 Thunderbolt (#1 Custom) (War Thunder) — KojfDiscord (https://sketchfab.com/KojfDiscord) | CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/p-47d-28-thunderbolt-1-custom-war-thunder-1d469251c5994dfd9169f11a97b1b56a |
| `sbd dauntless.glb` | SBD-3 Dauntless (War Thunder) — KojfDiscord (https://sketchfab.com/KojfDiscord) | CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/sbd-3-dauntless-war-thunder-6c950d0b5ff34bd1b43d713ec7237a59 |
| `sherman_m4a1.glb` | M4A1 (76) W (War Thunder) — KojfDiscord (https://sketchfab.com/KojfDiscord) | CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/m4a1-76-w-war-thunder-8492cfd6dec94c90ae7d210acf7e58ed |
| `uss_midway.glb` | uss_midway.glb — unknown | unknown | not established |
| `zero.glb` | A6M Zero Low Poly — Waroxed (https://sketchfab.com/Waroxed) | CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/) | https://sketchfab.com/3d-models/a6m-zero-low-poly-38311e82157449448f703b53648614a5 |

### Avenger 1942 livery (Build 199)

`assets/aircraft/avenger-1942-livery.webp` and `assets/aircraft/avenger-1942-normal.png` are an
**adaptation** of the airframe texture inside `grumman tbm avenger.glb`: "Grumman Tbm Avenger"
by **helijah** (Emmanuel Baranger), with **Laurent Hayvel** credited in the original texture
("GRUMMAN TBM/TBF Avenger : 2008 - BARANGER Emmanuel / HAYVEL Laurent"), Sketchfab,
CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/). Changes: repainted from the
tri-colour scheme to 1942 non-specular Blue-Gray over Light Gray; 1941 rudder stripes,
1943 insignia bars, numbers, diamonds and the carrier name removed; star-in-circle insignia,
fin number, an original squadron badge, stencils, weathering, walkways, chipped edges and
yellow propeller tips added; panel-line normal map derived from the original art. Made by
`scripts/bake-avenger-livery.cjs`; the GLB itself is unchanged. The adapted files are
offered under the same CC BY 4.0 terms.

Geographic source notices: [okinawa/README.md](okinawa/README.md) and [TERRAIN.md](TERRAIN.md). Offline packaging does not remove database/attribution obligations or resolve exact upstream contributor tracing.


## Me 262 Noel (Build 206)

Runtime: `assets/aircraft/me262-noel.glb`. Independent CC0 base by mgg8 / Aviation Gazetteer; original Noel livery and detailing by Oliver Kurzemann. Native mechanical groups and five animation clips retained. The two Noel names use black Z003 Medium Italic outlines, 0.62 m wide (38% smaller than the original 1 m name). Z003 is from URW Base35, licensed AGPL-3 with the font embedding exception; no font file is needed at runtime. Original supplied model archived under `assets/aircraft/source/me262-noel/original.glb`. Retired root `me262.glb` remains for historical tests only and is excluded from the app payload.

## Ju 87 B-2 — original model (Build 207)

`assets/aircraft/ju87b2-own.glb` is an original procedural exterior model, generated by
`scripts/build-own-ju87.cjs`. All geometry, UVs, camouflage, markings and wear are authored
for this project. No mesh or texture from the supplied War Thunder model is used.
Reference: user-supplied *Betriebsanleitung Ju 87 B-2*, June 1940, exterior overview and
dimensions on PDF pages 11–15. The source SHA-256, pixel measurements and assumptions
are in `scripts/own-aircraft/ju87b2/shape.json`. The source PDF is not redistributed.
Cross sections, airfoil thickness, gull-wing height, interior and small fittings are visual
approximations. S2+AN camouflage/markings are fictional. The game flight model is unchanged.
Six preview clips are embedded; the runtime drives the same named parts directly.
The previous `ju87.glb` remains only as a historical test fixture and is excluded from the
offline app payload. Preview: `ju87-preview.html`.

## Original F4U-1D Corsair — Build 208

`assets/aircraft/corsair-f4u1d-own.glb` is generated from independently authored station tables and code in `scripts/build-own-corsair.cjs`. Geometry, UVs, paint and weathering are original project work. No War Thunder geometry, textures or raster artwork are used. The supplied AN 01-45HA-1 manual provides general dimensions and configuration only; its SHA-256 and relevant pages are recorded in `scripts/own-aircraft/corsair/shape.json`. Number 27 and wear are fictional. This is an approximate visual game model. The old F4U-1C file is excluded from the runtime and offline app payload. Other existing assets retain their individual provenance statuses.


## Build 212 aircraft engine sound

Piston sound uses edited recordings by **Fight2FlyPhoto (CC BY 3.0)** and
**craigsmith / USC archive (CC0)**. Full titles, source links, license links,
changes and explicit aircraft substitutions: [audio/engines/CREDITS.md](audio/engines/CREDITS.md).
Exact source/loop hashes and cut intervals: [audio/engines/provenance.json](audio/engines/provenance.json).
P-47, BMW-powered Fw 190 and DB 601-powered Bf 109 recordings replace the rejected
Build 211 tonal synthesis. Other correspondences and limits are recorded in the notice.
Jet/rocket voices remain original procedural audio in `audio/jet-engine.js`.

## Build 213 ground-running radial voices

The P-47 and Fw 190 powered voices now use the already credited Fight2FlyPhoto ground
recordings, with 14.5/12.5 s loops. Avenger/Zero use an adapted BMW 14-cylinder recording;
SBD uses a single R-2800 substitute. These are explicit game approximations, not recordings
of the named R-2600/Sakae/R-1820 engines. Details and exact intervals:
[audio/engines/CREDITS.md](audio/engines/CREDITS.md). No new third-party source added.
