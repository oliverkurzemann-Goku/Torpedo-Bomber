# App asset rights review — B-17 updated 23 October 2026

**Result: source/license evidence improved; app distribution clearance is still open.**
This review records evidence and concrete unresolved uses. It is not an authoritative
rightsholder grant or a conclusion that any particular file is unlawfully supplied.

Historical Build 196 payload contained **302 files / 266.5 MiB**, including
**35 models: 34 GLB and one FBX**. Every payload file has a SHA-256 in
[asset-register.json](app/release/asset-register.json); embedded GLB textures are covered by
their binary's hash. [Readable model table](app/release/asset-register.md).

## Build 200 replacement

`assets/aircraft/b17-helijah.glb` is the separately supplied Boeing B-17 by helijah,
CC BY 4.0; original embedded declaration and public creator-account API matched on
22 October 2026. It replaces the sabrezor/Arma CC BY-NC file in runtime and app payload.
Author/source/license/change notices and exact source/output hashes are included.
The regenerated register records the current 36-model payload. Other observations
retain their original dates and unresolved status.

## What was actually checked

- Read the exact runtime GLB headers, including embedded author/license/source and image counts.
- Read all 24 supplied original GLBs; distinguish references/alternatives from shipped models.
  In particular, the separately supplied Saratoga is not evidence for `uss_midway.glb`.
- Checked 31 unique Sketchfab source IDs through the public model-metadata API: **29 readable**,
  B-24 returned **404**, IJN carrier **401** on retry. Their retained embedded declarations
  are evidence, but current public-page access was not established.
- Confirmed Quaternius Horse's CC0 label on the creator-attributed Poly Pizza page.
- Matched the two optimized fortification scans' embedded `sourceSha256` to the exact originals.
  Restored their missing source/author/license attribution through a separate provenance record;
  the model binaries and uploaded originals were not edited.
- Read current primary Apple, Creative Commons, Gaijin and Activision guidance. Current source
  terms are distinct from a separate written grant covering this app's exact files and uses.

Evidence: [source observations](app/release/model-source-evidence.json),
[supplemental provenance](app/release/model-provenance.json).
Acquisition dates, private correspondence and grant/receipt records have not been supplied.

## Findings and next actions

| Files / family | Finding | Required next action |
| --- | --- | --- |
| 12 War Thunder-labelled aircraft/vehicle files | Runtime source titles and current uploader metadata identify the game. CC BY labels alone do not establish original mesh/texture authority. | Ask Gaijin/the actual rightsholders for app-bundle redistribution rights, or obtain independently authored replacements. |
| Fletcher, Japanese cargo, landing ship | Three runtime exports derive from a collection explicitly titled Call of Duty: World at War. | Establish original authority with the relevant rightsholder; uploader confirmation alone may be insufficient. |
| `ijn carrier.glb` | Embedded Chinese title names World of Warships. Current API access returned 401; exact original ownership remains unconfirmed. | Verify provenance and Wargaming/other required rights or replace. Do not call this cleared merely because embedded CC BY is present. |
| `assets/aircraft/b17-helijah.glb` | New helijah creator-account source declares CC BY 4.0. Prior NC file excluded from runtime/app. | Retain author/source/license/change notices and source evidence; review actual distribution conditions. |
| `uss_midway.glb` | No embedded author, source or license. | Obtain the actual source/version/license record; do not substitute a different carrier's license. |
| FPS Creator farm ruin | Source title identifies upstream game/tool content. | Verify geometry/texture provenance and redistribution terms, or replace. |
| B-24, independent CC BY assets, Ford/train/horse, scans, tree pack | Embedded or existing credit records identify licenses; many current source declarations match. | Retain source evidence, author/source/license/change notices and verify textures and redistribution conditions. A valid applicable CC grant does not inherently need another bespoke permission. B-24 source access remains unresolved. |
| Copernicus / Overture / OSM datasets | Exact offline datasets and conversion code are inventoried; Rhine pipeline names Overture release 2026-08-19.0. | Preserve Copernicus notices and OSM/Overture attribution; review each shipped adapted database and release's upstream conditions. Conversion strips detailed contributor fields, so blanket attribution alone is not a completed source audit. |
| Code / generated art / procedural audio | MIT notices for bundled runtime libraries are retained; recorded jet audio is excluded; campaign generation prompts retained. | Review native package/store conditions and final notices. Own-code licensing remains the owner's decision; no change to `UNLICENSED`. |

The 16 “original-game-rights-open” model rows comprise the 12 War Thunder files, three
Call of Duty exports and one World of Warships-labelled carrier. The former noncommercial B-17 has been replaced. There is one upstream FPS Creator
row and one missing-source US carrier row. These are review priorities, not findings
of infringement.

## Prepared enquiries and replacement path

[Four targeted request drafts and follow-up record](app/release/rights-requests.md) are ready.
Gaijin's official content-guideline contact is verified; Activision/Wargaming licensing
recipients still require authoritative routing. **No messages have been sent.**

If no suitable grant is available, the practical release route is independently authored,
clearly licensed replacement models/textures. Match proportions, pivots, surface rigs,
weapon origins and deck collision geometry, then rerun the existing actual-model tests.
Do not silently swap models or import another game's asset as a supposed clean replacement.

For valid CC assets, retain notices and review app-store terms/technical restrictions;
separate asset access or an additional grant may be needed depending on the actual distribution
conditions. Do not assume that embedding assets in a signed app settles this question.

## Primary sources checked

- [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): attribution/change notices;
  commercial adaptation and redistribution within the grant; no blanket guarantee of other rights.
- [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/): noncommercial scope.
- [Gaijin Content Creator Guidelines §1.1.5](https://legal.gaijin.net/contentrules): restriction
  on extracting and separately distributing game elements; §4.1 provides the contact route.
  **Inference for this project:** the general content-creator rules do not establish a grant
  for repackaging these labelled meshes in a separate game.
- [Activision Terms of Use §§2–3](https://www.activision.com/legal/terms-of-use): limited product
  use and restrictions on reuse/distribution. No separate app-model license was identified.
- [Quaternius Horse](https://poly.pizza/m/qvTrSG9pZF): creator-attributed CC0 source listing.
- [OpenStreetMap copyright](https://www.openstreetmap.org/copyright),
  [Overture attribution/licensing](https://docs.overturemaps.org/attribution/),
  [Copernicus DEM](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM).

To regenerate the exact register after any payload change: `npm run app:assets`.
The tool verifies bytes/hashes and source links; **it never automatically approves rights**.
