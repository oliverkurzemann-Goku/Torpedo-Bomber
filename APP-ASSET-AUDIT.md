# App asset provenance gate

This is a release checklist, **not clearance or a legal opinion**. Existing original
files have not been modified or substituted. `ASSET-CREDITS.md` records known uploader
metadata/attribution; that alone does not establish permission from an original rightsholder.

## Priority evidence to obtain

| Runtime family | Existing evidence/concern | Release action |
| --- | --- | --- |
| War Thunder-labelled aircraft/vehicles | Several source entries explicitly name War Thunder; uploader metadata may not establish original game-asset rights. | Obtain original rightsholder authorization or independently licensed replacements. Confirm every active aircraft file, including P47/Bf109/Fw190/Ju87 and jets, rather than assuming filenames prove origin. |
| Fletcher, Japanese cargo and landing ship | Credits identify a Call of Duty: World at War upload under CC-BY metadata. | Verify authority to license those meshes/textures; otherwise replace before distribution. |
| Avenger, Zero, SBD, B17/B24, carriers, other ships | Attribution/source records exist to differing extents. | Match each shipped file to a source/version, obtain license evidence, satisfy attribution and check any third-party textures. No blanket approval inferred. |
| Buildings, Ford FBX/textures, train, horse, tree pack | Mixed source/licensing records. | Include all embedded/external textures and derived assets in the inventory; document allowed redistribution. |
| Terrain/OSM/Copernicus/Overture | Documented pipeline/data provenance. | Review required notices and database obligations for the shipped offline datasets. |
| Audio and campaign artwork | Current jet audio is procedural; archived recordings are not in the app payload. Campaign images are labelled generated. | Inventory every active sound/image and retain generation/source/license records. |
| Code libraries | Local pinned Three.js/fflate and npm/Capacitor dependencies. | Retain bundled license notices and audit native-package notices before release. |

## Required per-asset record

Runtime path and SHA-256; original author/rightsholder; source URL and acquisition date;
exact license/grant; evidence that the licensor can grant the required rights; commercial
and app-bundle redistribution permission where applicable; attribution text; embedded
texture/audio provenance; replacement decision and approval status.

The offline builder generates a SHA-256 inventory of the payload and preserves the original
binary bytes. **All rights-clearance rows remain open** until documentary evidence is supplied
and reviewed. A successful build/test or existing GitHub publication is not clearance.
