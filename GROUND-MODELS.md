# Torpedo Carrier – Bodenmodelle

Build 241 ersetzt die externen Bodenfahrzeuge und sechs Gebäude der spielbaren Kampagnen. Die GLB-Dateien enthalten eigene Geometrie, UVs und prozedural erzeugte Texturen. Die historischen Beispiele dienen als Orientierung für Silhouette, Oberflächen und Größenordnung. Die Rekonstruktionen sind Spielmodelle mit angenäherten Details und frei entworfenen Lackierungen.

| Modell | Oberfläche | Einsatz |
| --- | --- | --- |
| Tiger I | Sandgelbe Dreifarbtarnung oder Feldgrau, Schmutz, Turmnummer | Remagen |
| Jagdpanther | Mattes Oliv und Braun mit sandigen Tarnfeldern | Remagen |
| Sherman M4A1 (76) W | Oliv mit US-Stern und Stoffstaurollen | Alliierte Kolonne in Remagen |
| M16 MGMC | Dunkles Oliv, ausgeblichene Staukisten, US-Stern | Remagen und bestehender Flak-Platzhalter in Okinawa |
| Sd.Kfz. 9 mit Flak 37 | Sand und Erdbraun, staubiges Fahrwerk | Remagen |
| Ford V8 | Weinrot oder Elfenbein, matte Chromteile | Zivilverkehr in Remagen |
| DRB 01.10 | Rußschwarz, rotbraunes Fahrwerk und separater Tender | Remagen |
| Panzer VIII Maus | Rotbraune Grundierung mit Grün und Sand | Reserve |
| Rheinhaus, Hofruine, Stadtruine | Heller Putz, Bruchstein, offene Ziegelfassade und Balken | Remagen |
| Hangar | Graugrünes Wellblech und Schiebetore | Remagen |
| Bunker und Beobachtungsposten | Grünlich verwitterter Beton bzw. heller Küstenbeton | Remagen und Okinawa |
| Backsteinlager, Zweiraumgebäude, normannische Häuserzeile | Ziegel, Ockerputz, Stein und verschiedene Dächer | Reserve |

Reserveassets liegen in den jeweiligen `source/`-Verzeichnissen. Die drei Gebäude ersetzen die Vorlagentypen Warehouse, Double Room und Carentan-Häuserzeile. Der Maus wird als Prototyp geführt. Das separat dokumentierte animierte CC0-Pferd bleibt im Spiel.

## Reproduzieren

```sh
blender -b -t 8 --python-exit-code 1 --python scripts/build-ground-models.py
blender -b -t 8 --python-exit-code 1 --python scripts/build-ground-models.py -- --preview /tmp/ground-review
```

Die Vorschau rendert jeweils den wieder importierten GLB. Der Generator braucht Blender 4.3 und das dort enthaltene NumPy. Er benötigt keine alten Dateien, Bilder oder Netzwerkverbindung. Jeder Export enthält eine Mesh-Primitivgruppe und einen eingebetteten 512×512-Farbatlas. Die Fahrzeugdetails sind statisch. Die bestehenden Spielskripte bewegen die Fahrzeuge, wählen die Lackierungen, setzen die Modelle auf das Gelände und verwalten Treffer und Reichweite. Die GLBs dokumentieren in `asset.extras` die Projektzuordnung, Erzeugungsweise und Modellabmessungen.

## Historische Referenzen

- [Tiger I, The Tank Museum](https://tankmuseum.org/tank-nuts/tank-collection/tiger-i)
- [Jagdpanther, The Tank Museum](https://tankmuseum.org/tank-nuts/tank-collection/jagdpanther)
- [M4 Sherman, The Tank Museum](https://tankmuseum.org/tank-nuts/tank-collection/m4-sherman)
- [M16, Archivfoto der Sammlung Paris Musées](https://parismuseescollections.paris.fr/en/node/976615)
- [Sd.Kfz. 9, zeitgenössische Aufnahme bei World War Photos](https://www.worldwarphotos.info/gallery/germany/halftracks/sdkfz_9/8-8-cm-flak-37-sf-auf-fgst-zgkw-18t-sdkfz-9/)
- [Maus-Prototyp, The Tank Museum](https://tankmuseum.org/a-maus-tale)
- [Ford V8 von 1940, The Henry Ford](https://www.thehenryford.org/collections/explore/artifact/372471)
- [DRB 01 1104, Eisenbahn-Museumsfahrzeuge](https://www.eisenbahn-museumsfahrzeuge.de/index.php/deutschland/staatsbahnfahrzeuge/dampflokomotiven/baureihe-0110/01-1104)
- [Küstenbunker Putsborough, Historic England](https://historicengland.org.uk/listing/the-list/list-entry/1465822)
- [T2-Hangar, Historic England](https://historicengland.org.uk/images-books/photos/item/KAP01/01/36/111)
