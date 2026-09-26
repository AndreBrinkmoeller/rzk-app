# RZK-App – Rambo Zambo Kegelverein

Vereins-App für Termine, Chat, Abstimmungen, Kasse, Fotos, Geburtstage und Push-Nachrichten.
Läuft als Web-App (PWA): Link öffnen, „Zum Home-Bildschirm“, fertig.

## Aufbau

| Teil | Wo | Kosten |
|---|---|---|
| App (React + Vite) | Vercel, baut automatisch aus diesem Repo | kostenlos |
| Datenbank, Login, Fotos, Echtzeit-Chat | Supabase, Region Frankfurt | kostenlos |
| Push-Nachrichten | Supabase Edge Functions `notify` und `daily` | kostenlos |
| Tägliche Erinnerungen | GitHub Action `daily.yml` | kostenlos |
| E-Mail-Versand der Login-Codes | eigener SMTP-Dienst (z. B. Resend) | kostenlos bis 100 Mails/Tag |

## Ordner

- `src/` – die App (Ansichten in `src/views/`)
- `supabase/migrations/` – Datenbank-Schema inkl. Zugriffsregeln
- `supabase/functions/` – Push-Funktionen
- `supabase/templates/code.html` – E-Mail mit dem Login-Code
- `.github/workflows/` – automatische Bereitstellung und tägliche Erinnerungen

## Einrichtung (einmalig)

1. **Supabase-Projekt** anlegen (Region *Central EU (Frankfurt)*), Datenbank-Passwort notieren.
2. **GitHub-Secrets** unter *Settings → Secrets and variables → Actions* anlegen:
   - `SUPABASE_ACCESS_TOKEN` (Supabase → Account → Access Tokens)
   - `SUPABASE_PROJECT_REF` (die Kennung in der Projekt-URL)
   - `SUPABASE_DB_PASSWORD`
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (z. B. `mailto:deine@adresse.de`)
   - `CRON_SECRET` (beliebige lange Zeichenfolge)
3. Action **„Datenbank & Push-Funktionen bereitstellen“** einmal manuell starten.
4. In Supabase unter *Authentication*:
   - *Emails → SMTP Settings*: eigenen SMTP-Dienst eintragen
   - *Emails → Templates → Magic Link*: Inhalt aus `supabase/templates/code.html` einfügen (enthält `{{ .Token }}`)
   - *URL Configuration*: Site-URL auf die Vercel-Adresse setzen
5. **Vercel**: Projekt aus GitHub importieren, Umgebungsvariablen setzen:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Supabase → Project Settings → API).
   `VITE_VAPID_PUBLIC_KEY` steht bereits in `.env.production`.
6. Ersten Admin anlegen (Supabase → SQL Editor):
   ```sql
   insert into members (email, first_name, last_name, title, is_admin)
   values ('deine@adresse.de', 'Andre', 'Brinkmöller', 'Vergnügungswart', true);
   ```
   Weitere Mitglieder legst du danach direkt in der App an (Mehr → Mitglieder).

## Entwicklung

```bash
npm install
cp .env.example .env.local   # Werte eintragen
npm run dev
```

## Rechte

- Alle eingetragenen Mitglieder sehen Termine, Chat, Abstimmungen, Kasse und Fotos.
- Admins (Vergnügungswarte) legen Termine, Abstimmungen, Kassenbuchungen und Mitglieder an.
- Jeder darf eigene Zusagen, Stimmen, Nachrichten und Fotos anlegen und löschen.
- Wer nicht in `members` steht, sieht nichts – auch wenn er sich einen Code schicken lässt.
- Die Regeln stehen als Row-Level-Security in `supabase/migrations/`.
