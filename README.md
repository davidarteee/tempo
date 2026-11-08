<p align="center">
  <img src="public/icons/icon-192.png" width="96" height="96" alt="Tempo" />
</p>

<h1 align="center">Tempo</h1>

<p align="center">
  Calendari personal i gestió de tasques en una sola aplicació.<br />
  Ràpida, instal·lable com a app (PWA), funciona sense connexió i se sincronitza entre dispositius.
</p>

---

## Índex

0. [Estat del projecte i com continuar](#estat-del-projecte-i-com-continuar) ← **comença aquí**
1. [Què és Tempo](#què-és-tempo)
2. [Funcionalitats](#funcionalitats)
3. [Com s'utilitza](#com-sutilitza)
4. [Tecnologia](#tecnologia)
5. [Arquitectura](#arquitectura)
6. [Model de dades](#model-de-dades)
7. [Sincronització i funcionament sense connexió](#sincronització-i-funcionament-sense-connexió)
8. [Recurrència](#recurrència)
9. [Google Calendar](#google-calendar)
10. [Notificacions](#notificacions)
11. [Seguretat](#seguretat)
12. [Estructura del codi](#estructura-del-codi)
13. [Desenvolupament local](#desenvolupament-local)
14. [Configuració](#configuració)
15. [Desplegament a Vercel](#desplegament-a-vercel)
16. [Limitacions conegudes](#limitacions-conegudes)
17. [Historial de canvis](#historial-de-canvis)

---

## Estat del projecte i com continuar

> Aquesta secció es manté al dia amb cada canvi. Conté tot el necessari per reprendre el projecte en qualsevol
> moment. **Els valors secrets no són aquí**: només el nom de cada variable i on obtenir-la.

### On és cada cosa

| Peça | Detall |
|---|---|
| Codi | GitHub: [davidarteee/tempo](https://github.com/davidarteee/tempo) · carpeta local `Documents/TEMPO` · branca `main` |
| Base de dades i comptes | Supabase, organització **David Arté**, projecte **`tempo`** · ref `irkzvtnrofzbivolqwji` · regió `eu-west-1` · pla gratuït · [panell](https://supabase.com/dashboard/project/irkzvtnrofzbivolqwji) |
| URL de Supabase | `https://irkzvtnrofzbivolqwji.supabase.co` |
| Inici de sessió amb Google | Google Cloud, projecte **Tempo** · client OAuth "Aplicació web" (ID comença per `83590316489-`) · pantalla de consentiment en mode **prova** |
| App en producció | **https://tempo-weld-nine.vercel.app** |
| Allotjament | Vercel, projecte **tempo**, connectat al repositori (cada `git push` a `main` desplega). Supabase connectat amb la integració oficial de Vercel |
| Secrets | Fitxer `.env.local` (no és a git). Noms a [`.env.example`](.env.example) |
| Desenvolupament local | `npm run dev -- -p 3101` → http://localhost:3101 (port registrat a Supabase i Google) |

### Supabase

- **Migracions aplicades** (en aquest ordre):
  1. `20261108000000_init.sql` — taules, triggers (LWW, perfil i categories inicials), RLS, Realtime.
  2. `20261108000100_hardening.sql` — `search_path` fix, revocació d'execució de funcions de trigger, índexs de
     claus foranes.
  3. `20261108000200_push_cron.sql` — extensions `pg_cron` i `pg_net`, funció `tempo_dispatch_reminders()` i
     tasca programada `tempo-reminders` (cada minut) que crida `/api/cron/reminders` de l'app.
- **Vault (secrets de Supabase)** — necessaris perquè funcionin els recordatoris amb l'app tancada:
  `tempo_app_url` (adreça de Vercel) i `tempo_cron_secret` (el mateix valor que `CRON_SECRET` a Vercel).
  Es creen al *SQL Editor*:
  ```sql
  select vault.create_secret('https://<domini>.vercel.app', 'tempo_app_url');
  select vault.create_secret('<CRON_SECRET>', 'tempo_cron_secret');
  ```
  Per canviar-ne un: `select vault.update_secret(id, '<nou valor>') from vault.secrets where name = 'tempo_app_url';`
  Per veure si la tasca s'executa: `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;`
  i les respostes de l'app: `select status_code, content, created from net._http_response order by created desc limit 5;`
- **Afegir una migració nova:** crea `supabase/migrations/AAAAMMDDHHMMSS_nom.sql` i aplica-la:
  - des del panell (*SQL Editor* → enganxa i executa), o
  - amb la CLI: `npx supabase link --project-ref irkzvtnrofzbivolqwji` i `npx supabase db push`.
  Després revisa *Advisors* (seguretat i rendiment) i anota-la aquí.
- **Auth:** proveïdor Google activat amb el client OAuth de Google Cloud.
  *URL Configuration*: Site URL `https://tempo-weld-nine.vercel.app` · Redirect URLs `https://tempo-weld-nine.vercel.app/auth/callback` i
  `http://localhost:3101/auth/callback`. Si l'adreça s'escriu sense `https://`, en entrar surt l'error
  `{"error":"requested path is invalid"}`.
- **Avisos acceptats a propòsit:** `notification_log` i `google_sync_records` tenen RLS sense polítiques (només hi
  accedeix el servidor); "índexs no usats" mentre hi hagi poques dades.
- **Claus:** URL i clau publicable a *Project Settings → API Keys* (són públiques); clau secreta a la mateixa
  pàgina, secció *Secret keys* (només servidor).

### Google Cloud

- APIs activades: **Google Calendar API**.
- Àmbits de la pantalla de consentiment: `calendar.events`, `calendar.readonly` (més `openid`/`email`).
- Usuaris de prova: el compte del propietari. Per obrir l'app a altres persones caldria publicar-la i passar la
  verificació de Google (àmbits sensibles de Calendar).
- Client OAuth — orígens autoritzats: `http://localhost:3101` i `https://tempo-weld-nine.vercel.app`.
  URI de redirecció: `https://irkzvtnrofzbivolqwji.supabase.co/auth/v1/callback`,
  `http://localhost:3101/api/google/callback` i `https://tempo-weld-nine.vercel.app/api/google/callback`.

### Variables a Vercel

- La **integració de Supabase** de Vercel ha creat les variables de Supabase (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` i altres que l'app no fa servir, com `POSTGRES_*`).
- Afegides a mà (*Settings → Environments → Production*):
  tipus **Config** → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`;
  tipus **Secret** → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_STATE_SECRET`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`.
- `NEXT_PUBLIC_APP_URL` no cal a Vercel: si falta, el servidor fa servir l'adreça des d'on s'obre l'app.
- Les variables noves només s'apliquen en un desplegament nou (*Deployments → ⋯ → Redeploy*).

### Variables d'entorn (on és cada valor)

| Variable | D'on surt |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → *Project Settings → API Keys* |
| `SUPABASE_SECRET_KEY` | Supabase → *API Keys → Secret keys* |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud → *Google Auth Platform → Clients → Tempo* (el secret no es pot tornar a veure: si es perd, se'n crea un de nou) |
| `GOOGLE_STATE_SECRET`, `CRON_SECRET` | Cadenes aleatòries generades (`node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Generades amb `npx web-push generate-vapid-keys` (si es canvien, els dispositius s'han de tornar a subscriure) |
| `VAPID_SUBJECT` | `mailto:` del propietari |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3101` en local; a Vercel no cal (seria `https://tempo-weld-nine.vercel.app`) |

### Què funciona i què falta

**Fet i verificat**
- Tota la interfície (Avui, Calendari en 5 vistes, Tasques, Ajustos), temes clar/fosc, mòbil i ordinador.
- Esdeveniments, tasques, subtasques, categories, recurrència amb excepcions, arrossegar i deixar anar.
- Base de dades a Supabase amb RLS; inici de sessió amb Google; sincronització pujada/baixada i temps real
  provada entre l'app i la base de dades.
- 18 proves unitàries (`npm test`), `typecheck`, `lint` i `build` sense errors.

- Desplegat a Vercel; inici de sessió amb Google funcionant en producció.
- Botó de mode clar/fosc i instal·lació com a app (mòbil i ordinador).
- Notificacions push amb l'app tancada al mòbil (pg_cron → Vercel → Web Push) verificades.

**Pendent**
- [x] Domini de producció: `https://tempo-weld-nine.vercel.app`.
- [ ] Comprovar que a Google Cloud hi ha l'origen `https://tempo-weld-nine.vercel.app` i la redirecció `https://tempo-weld-nine.vercel.app/api/google/callback`, i connectar Google Calendar.
- [ ] Provar la connexió amb Google Calendar (*Ajustos → Google Calendar → Connecta*).
- [x] Tasca programada de recordatoris a Supabase (pg_cron).
- [x] Secrets `tempo_app_url` i `tempo_cron_secret` a Vault; avisos push amb l'app tancada provats al mòbil.
- [x] App instal·lada al mòbil.
- [x] App instal·lada a l'ordinador.

### Convencions per continuar

- Llegeix [`AGENTS.md`](AGENTS.md): aquesta versió de Next.js (16) té canvis respecte a versions anteriors
  (p. ex. `middleware` es diu `proxy`); la documentació és a `node_modules/next/dist/docs/`.
- Tota escriptura de dades passa per `src/lib/db/repo.ts` (mai directament a Supabase des de la interfície).
- Els canvis d'esquema sempre amb una migració nova a `supabase/migrations/`; actualitza també
  `src/lib/types.ts` i, si cal, l'índex de Dexie a `src/lib/db/local.ts` (pujant-ne la versió).
- Abans de fer commit: `npm run typecheck && npm run lint && npm test && npm run build`.
- Actualitza aquesta secció i l'[historial](#historial-de-canvis) amb cada canvi.

---

## Què és Tempo

Tempo uneix un **calendari** (amb l'estil net i natiu d'Apple Calendar) i un **gestor de tasques** (amb la
flexibilitat d'Apple Reminders). L'objectiu és obrir l'app i entendre a l'instant:

- què he de fer **avui**,
- què tinc previst **aquesta setmana**,
- quines **tasques encara he de programar**.

Esdeveniments i tasques són entitats independents, però es veuen junts al mateix calendari. Una tasca pot existir
sense data (a la safata) i, quan rep una data, apareix automàticament al calendari.

## Funcionalitats

### Avui
- Data d'avui i resum ("3 esdeveniments · 2 tasques pendents") amb barra de progrés de les tasques del dia.
- **Tot el dia**: esdeveniments i tasques sense hora, en una secció pròpia.
- **Agenda**: els elements amb hora en ordre cronològic, amb un marcador d'**ara**; els passats es mostren atenuats.
- **Endarrerides**: tasques que havien de fer-se abans d'avui i encara no estan fetes.
- **Per programar**: tasques sense data, amb accés ràpid per assignar-ne una.
- **Propers dies**: resum dels 7 dies següents.
- Afegir una tasca per avui escrivint-la i prement Enter.

### Calendari
- Vistes **diària, setmanal, mensual, anual i llista** (agenda cronològica).
- Els elements **amb hora** van a la línia temporal; els de **tot el dia** van a un carril superior i no ocupen
  espai a la línia horària. Els esdeveniments de diversos dies es mostren com una barra contínua.
- Els elements que se solapen es col·loquen en columnes perquè sempre siguin llegibles.
- **Clic en un espai buit** → nou esdeveniment a aquella hora.
- **Arrossegar** per moure (entre hores, entre dies o cap al carril de tot el dia) i **estirar la vora inferior**
  per canviar la durada. Al mòbil, mantén premut un moment per començar a arrossegar.
- Navegació amb fletxes, botó "Avui", mini calendari lateral i lliscament horitzontal al mòbil.
- A l'ordinador, la barra lateral mostra les **tasques per programar**: arrossega-les a un dia o a una hora.

### Tasques
- Pestanyes: **Pendents**, **Sense data**, **Programades** i **Fetes** (historial agrupat per mes).
- Filtre per categoria.
- Cada tasca pot tenir: títol, notes, **subtasques** (llista de verificació), data i hora programades, durada,
  **data límit**, categoria, repetició i recordatoris.
- Programar una tasca: icona del calendari (Avui, Demà, Aquest cap de setmana, La setmana vinent o una data
  concreta), editant-la, o arrossegant-la al calendari.
- Completar amb una casella rodona; apareix un avís amb **Desfés**.
- Sense prioritats ni estats ("pendent", "en curs"...): una tasca està feta o no.

### Esdeveniments
- Títol, ubicació, notes, inici i final (hora final opcional), tot el dia, categoria, repetició i recordatoris.
- Edició i eliminació amb **Desfés**.

### Categories
- Compartides entre esdeveniments i tasques (un únic sistema).
- Crear, reanomenar, canviar el color (paleta o color personalitzat) i eliminar.
- En eliminar una categoria en ús, es demana a quina categoria moure'n els elements (o deixar-los sense).
- Cada element hereta el color de la seva categoria a tota l'app.

### Mode clar / fosc
- Botó ràpid (sol / lluna): a la barra lateral a l'ordinador i a la capçalera d'**Avui** al mòbil.
- A *Ajustos → Aparença* també hi ha l'opció **Automàtic** (segueix el sistema operatiu).
- La preferència es desa al dispositiu i s'aplica abans de pintar la pàgina (sense parpelleig).

### Instal·lació com a aplicació
- **iPhone / iPad (Safari):** a *Avui* surt una targeta amb les instruccions: *Comparteix → Afegeix a la pantalla
  d'inici*. Cal obrir Tempo sempre des d'aquesta icona (necessari per a les notificacions a iOS).
- **Android (Chrome):** targeta a *Avui* amb el botó **Instal·la**.
- **Ordinador (Chrome / Edge):** botó **Instal·la l'app** a la barra lateral, o la icona d'instal·lar de la barra
  d'adreces. Crea una icona a l'escriptori i al menú d'inici i s'obre en una finestra pròpia.
  **Mac (Safari):** *Arxiu → Afegeix al Dock*.
- La targeta es pot tancar (no torna a sortir en 30 dies); les instruccions també són a *Ajustos*.

### Ajustos
- Tema **automàtic, clar o fosc**.
- Inici de setmana, mostrar o amagar tasques fetes al calendari, durada i avís per defecte.
- Gestió de categories, notificacions, Google Calendar, estat de la sincronització i instal·lació de l'app.

### Dreceres de teclat (ordinador)

| Tecla | Acció |
|---|---|
| `N` | Nou esdeveniment |
| `T` | Nova tasca |
| `D` `S` `M` `A` `L` | Vista dia / setmana / mes / any / llista |
| `←` `→` | Anterior / següent |
| `.` | Anar a avui |
| `Esc` | Tancar |

## Com s'utilitza

1. Entra amb el teu compte de Google.
2. A **Avui**, escriu una tasca i prem Enter, o toca **+** per crear un esdeveniment o una tasca.
3. A **Tasques**, apunta tot el que has de fer encara que no sàpigues quan. Després programa-ho arrossegant-ho al
   calendari o amb la icona del calendari.
4. A **Calendari**, fes clic en una hora buida per crear un esdeveniment, o arrossega'l per moure'l.
5. A **Ajustos**, connecta Google Calendar i activa les notificacions.
6. Instal·la l'app: al mòbil, *Comparteix → Afegeix a la pantalla d'inici* (iPhone) o *Instal·la l'aplicació*
   (Android); a l'ordinador, la icona d'instal·lar de la barra d'adreces.

## Tecnologia

| Àmbit | Eina |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Estils | Tailwind CSS v4, components propis inspirats en iOS/macOS |
| Dades locals | IndexedDB amb Dexie (`dexie-react-hooks` per a lectures reactives) |
| Backend | Supabase: Postgres, Auth (Google), Realtime, polítiques RLS |
| Recurrència | `rrule` (RFC 5545) |
| Dates | `date-fns` (locale català) + utilitats pròpies de zona horària amb `Intl` |
| Push | Web Push API + `web-push` |
| Validació | `zod` a les rutes de servidor |
| Proves | Vitest + `fake-indexeddb` |
| Allotjament | Vercel |

## Arquitectura

```
Navegador                                                     Servidor
┌───────────────────────────────────────────────┐            ┌──────────────────────────────┐
│ UI (React)                                    │            │ Supabase                     │
│   ▲ lectures reactives (Dexie liveQuery)      │            │  Postgres + RLS per usuari   │
│   │                                           │   upsert   │  trigger Last-Write-Wins     │
│ IndexedDB ◀── repo.ts (mutacions) ── outbox ──┼──────────▶ │  server_updated_at (cursor)  │
│   ▲                                           │            │  Realtime (postgres_changes) │
│   └──── sync/engine.ts ◀── pull + realtime ───┼─────────── │                              │
│                                               │            ├──────────────────────────────┤
│ Service Worker: closca offline + push         │            │ Rutes /api de Next (Vercel)  │
└───────────────────────────────────────────────┘            │  /api/google/*  ↔ Google API │
                                                             │  /api/cron/reminders → push  │
                                                             └──────────────────────────────┘
```

**Local-first.** La interfície llegeix sempre d'IndexedDB i escriu primer a IndexedDB. Per això crear, editar o
completar és instantani i tot funciona sense connexió. Cada escriptura s'afegeix a una cua de sortida (*outbox*)
dins la mateixa transacció, i el motor de sincronització la puja quan hi ha xarxa.

**Mode local.** Si no hi ha variables de Supabase, l'app funciona sense compte (dades només al navegador).
En iniciar sessió més endavant, aquestes dades s'adopten al compte i es pugen.

**Rendiment.** Les taules es llegeixen una sola vegada a memòria i cada vista només calcula les ocurrències del seu
interval visible (memoritzat). Els esdeveniments recurrents no es dupliquen a la base de dades: s'expandeixen al vol.

## Model de dades

| Taula | Contingut |
|---|---|
| `profiles` | Perfil de l'usuari (es crea automàticament en registrar-se) |
| `calendars` | Calendari per defecte de cada usuari; preparat per a calendaris compartits |
| `categories` | Categories compartides (nom, color, ordre) |
| `events` | Esdeveniments: hora o tot el dia, zona horària, regla `rrule`, recordatoris (`integer[]`), `series_parent_id` |
| `event_exceptions` | Ocurrències concretes modificades o cancel·lades |
| `tasks` | Tasques: data límit, data/hora programades, durada, `rrule`, compleció, recordatoris |
| `task_subtasks` | Subtasques |
| `task_exceptions` | Estat per ocurrència de tasques recurrents (feta, moguda, cancel·lada) |
| `push_subscriptions` | Dispositius subscrits a notificacions |
| `notification_log` | Registre per no enviar el mateix avís dues vegades |
| `google_integrations` | Tokens de Google (inaccessibles des del navegador) |
| `google_sync_records` | Vincle entre esdeveniments de Tempo i de Google (etag i empremta) |

Totes les files sincronitzables tenen `user_id`, `updated_at` (hora del canvi al client), `server_updated_at`
(assignat pel servidor) i `deleted_at` (esborrat lògic, necessari perquè els altres dispositius s'assabentin).
En registrar-se, un trigger crea el perfil, el calendari i les categories inicials
(Personal, Universitat, Treball, Esport, Altres).

**Preparat per al futur multiusuari:** per afegir calendaris compartits n'hi ha prou amb una taula
`calendar_members (calendar_id, user_id, role)` i ampliar les polítiques RLS amb un `EXISTS` sobre aquesta taula.

Les migracions són a [`supabase/migrations`](supabase/migrations).

## Sincronització i funcionament sense connexió

- **Pujada (push):** llegeix l'estat actual de cada fila pendent (els canvis successius d'una mateixa fila es
  fusionen) i en fa *upsert* per lots, respectant l'ordre de les claus foranes. Reintentar és segur (idempotent).
- **Baixada (pull):** per a cada taula, demana les files amb `server_updated_at` posterior a l'últim cursor.
- **Temps real:** Supabase Realtime aplica a l'instant els canvis d'altres dispositius i, en reconnectar,
  es fa un pull per recuperar el que s'hagi perdut.
- **Conflictes:** *Last-Write-Wins* per fila segons `updated_at`, aplicat al servidor (trigger) i al client.
  Una fila amb canvis locals pendents no es sobreescriu fins que s'ha pujat.
- **Duplicats:** els IDs són UUID generats al client; les excepcions d'ocurrències tenen un ID determinista, de
  manera que dos dispositius que editen la mateixa ocurrència sense connexió no creen dues files.
- **Errors:** reintents amb espera exponencial; els canvis que el servidor rebutja definitivament es mostren a
  *Ajustos → Sincronització* per tornar-los a provar o descartar-los.
- **Diverses pestanyes:** un *Web Lock* garanteix que només una sincronitza alhora.
- **Indicador:** la barra lateral (o un indicador discret al mòbil) mostra si estàs sense connexió i quants canvis
  queden pendents.
- **Service Worker:** guarda la closca de l'app i els recursos estàtics, de manera que s'obre sense xarxa.

## Recurrència

- Cada dia, cada dia feiner, cada setmana, cada 2 setmanes, cada mes, cada any i **regles personalitzades**
  (interval, dies de la setmana, "el segon dimarts de cada mes", final per data o per nombre de vegades).
- Format RFC 5545 (`RRULE`), el mateix que fa servir Google Calendar.
- En editar o eliminar una ocurrència es pregunta l'abast:
  1. **Només aquesta ocurrència** → es crea una excepció.
  2. **Aquesta i les futures** → la sèrie es divideix en dues (la nova apunta a l'original amb `series_parent_id`).
  3. **Totes les ocurrències** → es modifica la sèrie; si canvia l'hora, les excepcions es desplacen igual.
- Les recurrències s'expandeixen en "hora de paret" de la zona horària de l'element, de manera que una classe a
  les 10:00 continua a les 10:00 després del canvi d'horari d'estiu.
- Les tasques recurrents es completen per ocurrència (completar la d'avui no completa la de demà).

## Google Calendar

Integració **opcional**: si no està configurada, l'app funciona igual.

- Connexió OAuth des d'*Ajustos → Google Calendar*. El token de refresc es desa només al servidor.
- Sincronització **bidireccional** amb el calendari principal: importació inicial (últim any i futur), creacions,
  modificacions, eliminacions, sèries recurrents i ocurrències modificades o cancel·lades.
- **Sense bucles ni duplicats:** es desa l'etag de Google i una empremta del contingut local després de cada
  operació; un canvi només es propaga si realment és nou. Els esdeveniments creats des de Tempo porten un
  identificador propi a Google per tornar-los a reconèixer.
- **Conflictes:** si un esdeveniment ha canviat als dos llocs, guanya la modificació més recent.
- S'executa en obrir l'app, cada 5 minuts mentre és visible i poc després de cada canvi.
- **Les tasques no s'envien a Google Calendar.**

## Notificacions

- Recordatoris per element (a l'hora, 5/10/15/30 minuts, 1–2 hores, 1–2 dies, 1 setmana o personalitzat), i
  diversos per element.
- Amb l'app oberta, els avisos es programen localment (funcionen fins i tot sense connexió).
- Amb l'app tancada, el servidor envia **Web Push** (`/api/cron/reminders`, cridat cada minut).
- Els avisos d'elements de tot el dia es calculen respecte a les 09:00 del dia.
- **iPhone/iPad:** només funcionen amb l'app instal·lada a la pantalla d'inici (iOS 16.4 o posterior).

## Seguretat

- **RLS** a totes les taules: cada usuari només pot llegir i escriure les seves files.
- Triggers que impedeixen canviar el propietari d'una fila i referenciar categories o elements d'un altre usuari.
- Els tokens de Google i el registre de notificacions no són accessibles des del navegador; només hi accedeixen les
  rutes de servidor amb la clau secreta.
- La clau secreta de Supabase i els secrets de Google **mai** porten el prefix `NEXT_PUBLIC_`.
- L'estat d'OAuth de Google va signat (HMAC) i caduca als 10 minuts.
- El cron de recordatoris està protegit amb `CRON_SECRET`.

## Estructura del codi

```
src/
├── app/
│   ├── (app)/            today, calendar, tasks, settings (rutes protegides)
│   ├── api/              google/{connect,callback,sync}, push/subscribe, cron/reminders
│   ├── auth/callback/    retorn de l'inici de sessió
│   ├── login/
│   ├── layout.tsx        tema sense parpelleig, registre del Service Worker
│   └── manifest.ts       manifest de la PWA
├── components/
│   ├── calendar/         TimeGrid (dia/setmana), MonthView, YearView, AgendaView, MiniMonth…
│   ├── editors/          EventEditor, TaskEditor, selectors de recurrència/recordatoris/categoria
│   ├── tasks/            TasksScreen, TaskRow, ScheduleSheet
│   ├── today/            TodayScreen
│   ├── settings/         SettingsScreen, CategoryManager
│   ├── shell/            AppShell, AuthGate, indicador de sincronització, recordatoris, Google
│   └── ui/               primitives, Sheet (full mòbil / diàleg), avisos i diàlegs
└── lib/
    ├── db/               IndexedDB (local.ts), mutacions i lògica de sèries (repo.ts), IDs
    ├── sync/             motor de sincronització
    ├── recurrence/       RRULE i motor d'ocurrències (comú a client i servidor)
    ├── google/           OAuth, mapatge i sincronització
    ├── notifications/    càlcul de recordatoris i Web Push
    ├── time/             dates i zones horàries
    ├── data/             proveïdor de dades reactiu i derivacions de tasques
    └── ui/               estat de la interfície, accions, arrossegar i deixar anar
public/sw.js              Service Worker
supabase/migrations/      esquema de la base de dades
tests/                    proves unitàries
```

## Desenvolupament local

Requisits: Node.js 20 o superior.

```bash
npm install
cp .env.example .env.local   # i omple les variables (vegeu Configuració)
npm run dev -- -p 3101       # http://localhost:3101
```

| Ordre | Què fa |
|---|---|
| `npm run dev` | Servidor de desenvolupament |
| `npm run build` | Compilació de producció |
| `npm test` | Proves unitàries (recurrència, sèries, tasques, categories, mapatge de Google) |
| `npm run typecheck` | Comprovació de tipus |
| `npm run lint` | ESLint |
| `npm run icons` | Regenera les icones de la PWA |

> El Service Worker només s'activa en producció (o en desenvolupament si defineixes `localStorage['tempo:sw-dev']`).

## Configuració

Totes les variables són a [`.env.example`](.env.example).

| Variable | Obligatòria | Ús |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Per a comptes | URL del projecte de Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Per a comptes | Clau publicable (o la clau `anon` antiga) |
| `SUPABASE_SECRET_KEY` | Google i push | Clau secreta, **només servidor** |
| `NEXT_PUBLIC_APP_URL` | Google | URL pública de l'app (per a la redirecció d'OAuth) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google | Client OAuth de Google Cloud |
| `GOOGLE_STATE_SECRET` | Google | Cadena aleatòria per signar l'estat d'OAuth |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Push | Claus VAPID (`npx web-push generate-vapid-keys`) |
| `VAPID_SUBJECT` | Push | `mailto:` de contacte |
| `CRON_SECRET` | Push | Protegeix `/api/cron/reminders` |

### Supabase
1. Crea un projecte i aplica les migracions de `supabase/migrations/` en ordre (SQL Editor o `npx supabase db push`).
2. *Project Settings → API Keys*: URL, clau publicable i clau secreta.
3. *Authentication → Sign In / Providers → Google*: activa'l amb l'ID i el secret del client OAuth de Google.
4. *Authentication → URL Configuration*: **Site URL** = URL de producció; a **Redirect URLs** afegeix
   `http://localhost:3101/auth/callback` i `https://<domini>/auth/callback`.

### Google Cloud
1. Activa la **Google Calendar API**.
2. Pantalla de consentiment: tipus extern, àmbits `calendar.events` i `calendar.readonly`, i afegeix-te com a
   usuari de prova mentre l'app no estigui verificada.
3. Client OAuth de tipus **Aplicació web**:
   - Orígens: `http://localhost:3101` i `https://<domini>`
   - URI de redirecció: `https://<projecte>.supabase.co/auth/v1/callback`,
     `http://localhost:3101/api/google/callback` i `https://<domini>/api/google/callback`

### Recordatoris push (cada minut)
El cron de Vercel Hobby només s'executa un cop al dia, per això ho fa **pg_cron** de Supabase. La migració
`20261108000200_push_cron.sql` ja crea la tasca; només cal guardar l'adreça de l'app i el `CRON_SECRET` a
Supabase Vault (vegeu [Supabase](#supabase) a "Estat del projecte").

Circuit complet: **pg_cron** (cada minut) → `GET https://<domini>/api/cron/reminders` amb `CRON_SECRET` → l'app
calcula els avisos que toquen → **Web Push** a cada dispositiu subscrit → el Service Worker mostra la notificació.

Per rebre'ls en un dispositiu: obre Tempo (a l'iPhone, **des de la icona de la pantalla d'inici**), ves a
*Ajustos → Notificacions → Activa* i prova *Prova des del servidor*.

## Desplegament a Vercel

1. Importa el repositori a [vercel.com/new](https://vercel.com/new) (es detecta Next.js automàticament).
2. A *Environment Variables*, afegeix totes les variables de la taula anterior, amb
   `NEXT_PUBLIC_APP_URL=https://<domini>`.
3. Desplega i, amb el domini definitiu, actualitza:
   - Supabase → *URL Configuration* (Site URL i Redirect URLs),
   - Google Cloud → orígens i URI de redirecció.
4. Programa el cron de recordatoris amb el domini de producció.

## Limitacions conegudes

- Les hores es mostren a la zona horària del dispositiu; cada element desa la seva zona per expandir bé les
  recurrències.
- La resolució de conflictes és per fila, no per camp.
- Google Calendar es sincronitza per consulta periòdica (no amb webhooks): els canvis fets a Google arriben quan
  algun dispositiu té l'app oberta.
- Els recordatoris de Google dels esdeveniments de tot el dia es llegeixen però no s'hi envien.
- Les notificacions push depenen del navegador i del sistema operatiu (vegeu [Notificacions](#notificacions)).

## Historial de canvis

### 2026-11-08
- Primera versió completa de l'app: Avui, Calendari (dia/setmana/mes/any/llista), Tasques i Ajustos.
- Capa local-first (IndexedDB + outbox), sincronització amb Supabase i Realtime.
- Recurrència RRULE amb excepcions (només aquesta / aquesta i futures / totes) per a esdeveniments i tasques.
- Integració bidireccional amb Google Calendar, Web Push, Service Worker i manifest PWA.
- Projecte Supabase `tempo` creat; migracions `init` i `hardening` aplicades.
- Inici de sessió amb Google configurat i provat.
- Correccions: colors de text dels botons (regla CSS sense capa), avís duplicat en iniciar sessió.
- Repositori a GitHub (`davidarteee/tempo`) i desplegament a Vercel amb la integració de Supabase.
- Botó ràpid de mode clar/fosc (barra lateral i capçalera d'Avui).
- Instal·lació com a app: targeta a Avui (instruccions per a iPhone, botó a Android), botó a la barra lateral de
  l'ordinador i secció a Ajustos; captura de `beforeinstallprompt` des de l'inici.
- Manifest: eliminat `window-controls-overlay` (la barra de títol de l'app d'escriptori no tapa la interfície).
- Notificacions sense dependre de cap ordinador: tasca `pg_cron` a Supabase cada minut (migració
  `push_cron`) amb l'adreça i el secret a Vault; ruta `/api/push/test`.
- Ajustos → Notificacions: estat real per dispositiu, botó *Prova des del servidor*, re-registre automàtic de la
  subscripció i missatges d'error clars (abans podia dir "Activats" sense estar subscrit).
- Verificat en producció: 1 dispositiu subscrit, la tasca `tempo-reminders` s'executa cada minut amb resposta
  200 de l'app i el primer recordatori s'ha enviat.
- Domini de producció anotat (`https://tempo-weld-nine.vercel.app`); app instal·lada al mòbil i a l'ordinador.
