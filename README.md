# TURBO GP – Formel-1-Rennsimulator (Ego-Perspektive)

`index.html` im Browser öffnen (funktioniert offline, Three.js liegt bei).

- **Steuerung:** W Gas · S Bremse/Rückwärts · A/D Lenken (auch Pfeiltasten) · Leertaste Driften · C Kamera · R zurücksetzen · M Ton · Esc Pause
- **4 Strecken** (alle fahrbar mit Bots; Details beim Überfahren im Menü): Green Valley GP (Tag), Neon City Circuit (Nacht), Sunset Desert Speedway (Sonnenuntergang), Port Azur GP (von Monaco inspiriert: Hafen, Kasino, Haarnadel, Tunnel)
- **Einstellungen** (Menü oben rechts): Anzahl der Bots (1–15), Grafikqualität (Niedrig–Ultra), Sichtfeld, Auto-Qualität, Ton.
- **Bot-Schwierigkeit:** Leicht / Mittel / Schwer (mehr Preisgeld, schnellere Bots, schlechterer Startplatz)
- **Geld:** Platz 1–3 bringt Preisgeld; damit in der Garage 5 Fahrzeuge freischalten. Speicherstand im Browser (localStorage).
- **Rennunfälle:** In jeder Runde bauen 1–5 Bots einen Unfall, die Wracks bleiben mitten auf der Strecke liegen (Hindernisse für spätere Runden, auf der Minimap rot markiert, Warnung „WRACK VORAUS“). Die anderen Bots umfahren sie.
- **Unfälle:**  Das getroffene Teil fliegt sofort ab. Spoiler weg = 5 % langsamer je Flügel und schlechtere Beschleunigung. Reifen weg = Fahrzeug nicht mehr fahrbar (ausgeschieden, kein Preisgeld). Dazu Spins, Rauch, Feuer, Funken und Verformungen.
- Dateien: `core.js` (Strecken, Physik, Bot-KI), `game.js` (3D, HUD, Audio, Menü)

## Texturen
Asphalt, Gras, Sand, Pflaster, Beton, Putz und Dachziegel sind echte PBR-Texturen (Farbe + Normal-Map) von [ambientCG](https://ambientcg.com) (CC0 / Public Domain). Sie liegen als Data-URIs in `textures.js`, damit das Spiel auch offline und per Doppelklick (`file://`) läuft. Lackierung, Reifen, Carbon, Wasser und Fahrbahnmarkierungen werden prozedural erzeugt.

## Ultra-Grafik
Im Einstellungsmenü auf **Ultra** schalten (braucht eine starke Grafikkarte):
- Post-Processing: Bloom, Umgebungsverdeckung (GTAO), 4x-MSAA, Bewegungsunschärfe, chromatische Aberration, Vignette, Filmkorn
- Hochdetaillierte Autos (geloftete Karosserie, Flügelprofile, Halo, Fahrer, Reifen mit Schriftzug) mit Echtzeit-Spiegelungen
- Fangzäune, Reifenstapel in Kurven, realistische Bäume, größere Schattenqualität
- Leistung: dynamische Auflösung (bei zu niedrigen FPS), AO und Spiegelungen einzeln schaltbar
- Ab **Hoch**: Wolken-Himmel, Kiesbetten, Reifenspuren, Bodendetail

`three.bundle.js` enthält three.js r160 + Postprocessing und wird mit `npx esbuild build/entry.js --bundle --minify --format=iife --outfile=three.bundle.js` gebaut (Pakete `three@0.160.0`, `esbuild`).
