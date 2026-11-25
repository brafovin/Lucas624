# TURBO GP – Formel-1-Rennsimulator (Ego-Perspektive)

`index.html` im Browser öffnen (funktioniert offline, Three.js liegt bei).

- **Steuerung:** W Gas · S Bremse/Rückwärts · A/D Lenken (auch Pfeiltasten) · C Kamera · R zurücksetzen · M Ton · Esc Pause
- **4 Strecken** (alle fahrbar mit Bots; Details beim Überfahren im Menü): Green Valley GP (Tag), Neon City Circuit (Nacht), Sunset Desert Speedway (Sonnenuntergang), Port Azur GP (von Monaco inspiriert: Hafen, Kasino, Haarnadel, Tunnel)
- **Bot-Schwierigkeit:** Leicht / Mittel / Schwer (mehr Preisgeld, schnellere Bots, schlechterer Startplatz)
- **Geld:** Platz 1–3 bringt Preisgeld; damit in der Garage 5 Fahrzeuge freischalten. Speicherstand im Browser (localStorage).
- **Unfälle:** Das getroffene Teil fliegt sofort ab. Spoiler weg = 5 % langsamer je Flügel und schlechtere Beschleunigung. Reifen weg = Fahrzeug nicht mehr fahrbar (ausgeschieden, kein Preisgeld). Dazu Spins, Rauch, Feuer, Funken und Verformungen.
- Dateien: `core.js` (Strecken, Physik, Bot-KI), `game.js` (3D, HUD, Audio, Menü)

## Texturen
Asphalt, Gras, Sand, Pflaster, Beton, Putz und Dachziegel sind echte PBR-Texturen (Farbe + Normal-Map) von [ambientCG](https://ambientcg.com) (CC0 / Public Domain). Sie liegen als Data-URIs in `textures.js`, damit das Spiel auch offline und per Doppelklick (`file://`) läuft. Lackierung, Reifen, Carbon, Wasser und Fahrbahnmarkierungen werden prozedural erzeugt.
