# TURBO GP – Formel-1-Rennsimulator (Ego-Perspektive)

`index.html` im Browser öffnen (funktioniert offline, Three.js liegt bei).

- **Steuerung:** W Gas · S Bremse/Rückwärts · A/D Lenken (auch Pfeiltasten) · C Kamera · R zurücksetzen · M Ton · Esc Pause
- **3 Strecken:** Green Valley GP (Tag), Neon City Circuit (Nacht), Sunset Desert Speedway (Sonnenuntergang)
- **Bot-Schwierigkeit:** Leicht / Mittel / Schwer (mehr Preisgeld, schnellere Bots, schlechterer Startplatz)
- **Geld:** Platz 1–3 bringt Preisgeld; damit in der Garage 5 Fahrzeuge freischalten. Speicherstand im Browser (localStorage).
- **Unfälle:** Wand- und Auto-Kollisionen verursachen Schaden (Anzeige unten links): Spins, abfallende Flügel und Räder, Rauch, Feuer, Funken, verbeulte Karosserie und weniger Leistung. Der Schaden gilt pro Rennen.
- Dateien: `core.js` (Strecken, Physik, Bot-KI), `game.js` (3D, HUD, Audio, Menü)
