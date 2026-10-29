# Selbstgebaute A6M2 Zero (Build 207, alter Stand) – Wiederherstellung

**Stand 29.10.2026.** Die Zero (V-103, Tainan Kokutai, Lae, Juli 1942) wurde in einer früheren Sitzung gebaut
(lokaler Commit `979949b`, „Own A6M2 Zero: measured shape, traced panel lines, rig-contract GLB"), aber **nie gepusht**.
Beim Zurücksetzen der Arbeitsumgebung ging der Commit verloren. In keinem Branch auf GitHub liegt eine A6M2-Datei.
Hier liegt, was sich aus dem Sitzungsprotokoll wörtlich zurückholen ließ. Nichts davon ist im Spiel verdrahtet,
nichts wird von Tests, Payload oder Build gelesen.

## Was hier liegt

| Datei | Inhalt | Zuverlässigkeit |
|---|---|---|
| `build-own-a6m2.cjs` | Builder, Zwischenstand aus einem vollständigen Lesen (436 Zeilen) plus alle 14 danach protokollierten Patches in Reihenfolge eingespielt (474 Zeilen, Syntax ok, kein Patch ohne Wirkung). Gehört nach `scripts/` (die `require`-Pfade gehen von dort aus). | hoch, aber nie gelaufen: es fehlen die Daten unten |
| `paint-and-parts.patch` | Änderungen an `scripts/own-aircraft/paint.cjs` (Rauigkeits-/Metallkanal, `roughnessPng`) und `parts.cjs` (`chordPoints`). Lässt sich mit `git apply` auf den heutigen Stand legen. | hoch (Patches aus dem Protokoll) |
| `own-a6m2-pipeline.cjs`, `own-a6m2-browser.cjs` | Die beiden Tests, wörtlich aus den Schreibaufrufen. Nach `okinawa/tests/` erst wieder legen, wenn die GLB existiert, sonst sind sie rot. | hoch |
| `integration-patches.txt` | Python/Shell-Patches der Spiel-Einbindung (`loadZeroModel`, `zeroFrame`, Mündungen, Payload) auf dem alten Stand. Nur Vorlage, passt nicht mehr auf Build 215. | Referenz |
| `CLAUDE-entry-build207.md` | Der damals formulierte Doku-Eintrag mit allen Maßen, Messwerten und Entscheidungen. | Referenz |
| `partial-shape-dump.txt` | Teilausgabe von `shape.json` (Fahrwerk, Lackierung, Haube, Details, Propeller, Haubenring). | teilweise |

## Was fehlt (nicht aus dem Protokoll zu holen)

1. **Referenz-PDF** „Profile Publications Aircraft No. 129 – The Mitsubishi A6M2 Zero-Sen" (vom Nutzer geliefert, SHA256 beginnt `9c3991af`, endet `0847`).
   Der Upload-Ordner der alten Sitzung existiert nicht mehr. Die Zeichnung ist urheberrechtlich geschützt und gehört nie ins Repo.
2. **`app/model-candidates/references/a6m2/shape.json`** – Stationstabellen von Rumpf, Flügel, Leitwerk, Spezifikation. Nur die Teile in `partial-shape-dump.txt` sind erhalten.
3. **`lines.json`** – die nachgezeichneten Fugen- und Luken-Linien.
4. **Werkzeuge**: `prepare-a6m2-reference.py`, `measure-a6m2.mjs`, `trace-a6m2-lines.py`, `scripts/own-aircraft/linefield.cjs`.
   Von `linefield.cjs` ist nur die Schnittstelle aus dem Builder bekannt: `new LineField(lines, bounds, {res:.005, cap:.03, minLength})` mit `.dist(u,v)`, `.grad(u,v)`, `.count`.
5. **Die GLB** `assets/aircraft/a6m2-own.glb` (71 012 Dreiecke, 4,86 MB) und die Silhouetten-Referenzzuschnitte.

## Weg zur Wiederherstellung

PDF erneut bereitstellen → die vier Werkzeuge neu schreiben (Anforderungen stehen in `CLAUDE-entry-build207.md`) → `shape.json`/`lines.json`
neu erzeugen → Builder nach `scripts/` legen, Patch anwenden → Silhouetten-Gate (Soll: IoU Seite/Draufsicht/Front 0,996/0,993/0,963) →
Einbindung auf Build 215 neu aufsetzen (nicht die alten Patches blind einspielen) → Tests zurück nach `okinawa/tests/`.
Die neu gemessenen Zahlen weichen minimal von den alten ab; das alte Modell ist nicht bitgleich reproduzierbar.

Rechtliche Lage unverändert offen: ob Vermessen und Nachzeichnen der Linienlage aus der Zeichnung eine Bearbeitung ist,
wurde nicht entschieden (Register-Status `own-build-reference-review-open`).
