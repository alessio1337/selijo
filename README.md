# Seljo – versiune pentru Netlify (site + admin)

## Structura
- `public/index.html` – site-ul public
- `public/admin.html` – panoul admin (la adresa `/admin`)
- `netlify/functions/api.mjs` – API-ul (comenzi, produse, autentificare)
- `netlify.toml`, `package.json` – configurare Netlify

Datele (produse, comenzi) și fișierele de design se salvează în **Netlify Blobs**, inclus în Netlify. Nu ai nevoie de alt serviciu sau cont.

## Publicare (prin GitHub – recomandat)
1. Creează un repository pe GitHub și urcă tot conținutul acestui folder.
2. Pe app.netlify.com: **Add new site → Import an existing project** și alege repository-ul. Setările din `netlify.toml` se citesc automat.
3. În **Site configuration → Environment variables** adaugă:
   - `ADMIN_PASSWORD` = o parolă puternică (obligatoriu)
   - `SESSION_SECRET` = un text lung și aleatoriu (opțional, recomandat)
4. Pornește un deploy nou (**Deploys → Trigger deploy**) ca variabilele să fie luate în calcul.
5. Site: `https://numele-tau.netlify.app` · Admin: `https://numele-tau.netlify.app/admin`

## Publicare (prin Netlify CLI)
```
npm install -g netlify-cli
netlify login
netlify init        # leagă folderul de un site nou
netlify env:set ADMIN_PASSWORD "parola_ta"
netlify deploy --prod
```
Atenție: tragerea folderului în „Netlify Drop" nu funcționează aici, pentru că funcția are nevoie de instalarea pachetului din `package.json`.

## Limite de reținut
- Fișierele de design se încarcă pe site până la **4 MB** (limita cererilor Netlify Functions este ~6 MB). Mai mari se trimit pe WhatsApp, iar mesajul precizează asta.
- Nu există protecție împotriva încercărilor repetate de logare în afară de o întârziere la parolă greșită; folosește o parolă lungă.
- Comenzile se listează toate odată; e în regulă pentru volum mic, la volum mare ar trebui paginare sau o bază de date.
