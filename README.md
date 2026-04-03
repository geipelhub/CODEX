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

In Supabase SQL Editor:

```sql
create table if not exists leaderboard_entries (
  id uuid primary key,
  name text not null,
  old_tariff_name text not null,
  old_work_price_cents numeric not null,
  old_base_price_euro numeric not null,
  new_tariff_name text not null,
  new_work_price_cents numeric not null,
  new_base_price_euro numeric not null,
  old_annual_cost numeric not null,
  new_annual_cost numeric not null,
  annual_savings numeric not null,
  created_at timestamptz not null default now()
);
```

### 2. Schreib- und Leserechte freigeben

Fuer ein unkompliziertes Event kannst du temporaer passende Policies setzen. Wenn du magst, kann ich dir im naechsten Schritt auch die genauen Supabase-RLS-Policies dafuer vorbereiten.

### 3. Konfiguration hinterlegen

1. [config.example.js](C:\Users\Admin\OneDrive\Desktop\CODEX\config.example.js) nach `config.js` kopieren
2. Supabase URL und Anon Key eintragen

### 4. Deployment

Du kannst die Seite danach sehr leicht auf GitHub Pages oder Netlify hosten.
