# Stromspar-Leaderboard

Kleine Web-App fuer ein Lunch-and-Learn-Wechselcafe rund um Stromtarifwechsel.

Features:
- Eingabe von Name, altem Tarif und neuem Tarif
- Berechnung der Jahreskosten auf Basis von `3500 kWh`
- Automatische Ersparnisberechnung
- Sortiertes Leaderboard nach groesster Ersparnis
- Lokaler Fallback ohne Backend
- Gemeinsames Live-Leaderboard mit Supabase

## Lokal starten

1. [index.html](C:\Users\Admin\OneDrive\Desktop\CODEX\index.html) im Browser oeffnen

Ohne weiteres Setup speichert die App nur lokal im Browser.

## Gemeinsames Leaderboard fuer mehrere Laptops

Fuer dein Event solltest du Supabase verwenden, damit alle dieselbe Liste sehen.

### 1. Tabelle anlegen

In Supabase SQL Editor kannst du direkt [supabase-setup.sql](C:\Users\Admin\OneDrive\Desktop\CODEX\supabase-setup.sql) verwenden.

Der Inhalt legt Tabelle, RLS-Policies und Realtime-Publication an.
Wenn du die App schon einmal eingerichtet hattest, fuehre die SQL-Datei bitte jetzt noch einmal aus, damit die neuen Spalten fuer dynamische Tarife und die Admin-Delete-Policy hinzugefuegt werden.

### 2. Konfiguration hinterlegen

1. [config.example.js](C:\Users\Admin\OneDrive\Desktop\CODEX\config.example.js) nach `config.js` kopieren
2. Supabase URL und Publishable Key eintragen
3. Danach `config.js` mit committen, weil die Seite auf GitHub Pages darauf zugreift

Beispiel:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://your-project-ref.supabase.co",
  supabaseAnonKey: "your-publishable-anon-key",
};
```

### 3. Deployment

Du kannst die Seite danach sehr leicht auf GitHub Pages oder Netlify hosten.

## Admin-Login

Die App unterstuetzt einen Admin-Login per Supabase E-Mail-Link fuer `jaspergeipel@gmail.com`.

Falls der Login-Link nicht sauber zur Seite zurueckkommt, setze in Supabase unter Authentication URL Configuration als erlaubte Redirect-URL:

- `https://geipelhub.github.io/CODEX/`

Nach jeder Aenderung:

```powershell
& "C:\Program Files\Git\cmd\git.exe" add .
& "C:\Program Files\Git\cmd\git.exe" commit -m "Configure shared leaderboard"
& "C:\Program Files\Git\cmd\git.exe" push origin main
```

Dann ist die gemeinsame Seite wieder unter [https://geipelhub.github.io/CODEX/](https://geipelhub.github.io/CODEX/) erreichbar.
