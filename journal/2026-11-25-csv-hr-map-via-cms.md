# 2026-11-25 — Carte HR : logique retenue pour le CSV (déposé dans le CMS, lu au build)

Voir `journal/2026-11-24-options-import-csv-hr-map.md` pour les options étudiées.
**Retenu : variante de l'option 1 (CSV = média Osuny) mais lu au build, pas au runtime** —
le CSV déposé dans l'admin est fetché pendant le déploiement, et c'est le JSON généré
qui est servi à la carte.

## Flux complet

1. **Édition** (admin Osuny) : page « Alternative Human Rights Genealogies » (`/hr-genealogies/`)
   → sous-page « HR map data » (`hr-map-data`) → bloc **files** → déposer le CSV.
   - CSV **UTF-8 obligatoire** (depuis Excel : exporter en CSV). Tout autre format = erreur
     loguée + fallback.
   - Le binaire part sur le bucket S3 Osuny ; le repo ne reçoit que des métadonnées.
2. **Sync** : le bot pousse « Sync from osuny » → le repo reçoit
   `content/en/pages/hr-genealogies/hr-map-data/_index.html` (bloc files → page File)
   et `data/media/<xx>/<id>.yml` contenant la `direct_url` publique du CSV.
3. **Build** : `node hr-map/build.js`, lancé avant `yarn osuny build` dans
   `.github/workflows/deuxfleurs.yml` et `netlify.toml` :
   - retrouve la page qui porte un bloc files avec un `.csv` (scan de tous les
     `_index.html` de `content/`, **insensible au slug/renommage** de la page) ;
   - suit `files[0].file` → `original_blob.id` → `data/media/<xx>/<id>.yml` → `direct_url` → fetch ;
   - parse via `hr-map/csv-to-json.js` (détection du délimiteur `;` `,` tab) →
     `static/data/hr-map.json` (écrasé à chaque build) ;
   - **géocodage au build** (Nominatim) des lieux absents de `hr-map/places.csv` :
     max 20 lieux, 1 req/s, ordre des requêtes = adresse complète → dernier segment
     (pays) → premier segment → autres ; les matchs non exacts sont marqués `approx`.
4. **Rendu** : la page carte porte un bloc embed contenant uniquement
   `<div id="nous-worldmap" class="nwm" data-src="/data/hr-map.json"></div>` ;
   le JS `assets/js/hr-map.js` est inclus par le hook `layouts/_partials/main/hooks/before-end.html`
   (cible bodyclass `page-hr-map`) via `resources.Get | js.Build | fingerprint` :
   minifié en prod + **cache-busting automatique par empreinte** (plus de `?v=` manuel).
   Le JS lit le JSON, ignore l'entrée `_build` (méta), dessine points + filtres.

### Schéma de la chaîne

```
ADMIN OSUNY (CMS)
  page /hr-genealogies/ → sous-page « HR map data » → bloc « files » → upload du CSV
        │  (le binaire part sur le bucket S3 Osuny)
        ▼
BOT « Sync from osuny » (push GitHub sur main)
        ▼
REPO (fichiers syncés)
  content/en/pages/hr-genealogies/hr-map-data/_index.html   (bloc files → réf page File)
        → content/en/files/2026/hr-map-v2.html               (page File → original_blob.id)
        → data/media/<xx>/<id>.yml                            (méta média → direct_url S3)
        ▼
BUILD (GitHub Actions deuxfleurs.yml / netlify.toml, avant `yarn osuny build`)
  node hr-map/build.js
        │  fetch de la direct_url (CSV sur S3)
        │  + hr-map/csv.js (parse) · hr-map/geocode.js → Nominatim (1 req/s, max 20 lieux)
        │  + hr-map/places.csv (coordonnées manuelles, jamais écrasé)
        ▼
  node hr-map/csv-to-json.js  →  static/data/hr-map.json  (+ entrée _build {hash})
        │  (hash identique au précédent → skip, JSON conservé)
        ▼
DÉPLOIEMENT STATIQUE (public/ → Deuxfleurs S3 / Netlify)
        ▼
NAVIGATEUR sur /hr-genealogies/
  bloc embed : <div id="nous-worldmap" data-src="/data/hr-map.json">
  + assets/js/hr-map.js (chargé par hook de layout, js.Build + fingerprint)
        │  lit /data/hr-map.json (ignore l'entrée _build)
        ▼
  CARTE : points, filtres de catégories, entrées globales

FALLBACKS si le CSV du CMS est indisponible :
  hr-map/fallback.csv (repo) → même pipeline → static/data/hr-map.json
  et si build.js ne tourne pas : static/data/hr-map.json committé (filet de sécurité)
```

## Fallbacks (dans l'ordre)

1. CSV du bloc files (source principale) ;
2. `hr-map/fallback.csv` (CSV initial, conservé dans le repo) si le bloc est absent/vide,
   si le fetch échoue, ou si le fichier déposé n'est pas un CSV ;
3. `static/data/hr-map.json` committé — filet de sécurité si le script ne tourne pas
   (il est écrasé à chaque build quand il tourne).

## Comportements / optimisations

- **Hash** (blob id + contenu du CSV + `places.csv`) stocké dans l'entrée `_build` du JSON :
  si inchangé, le JSON n'est pas regénéré (skip, build plus rapide).
- **`hr-map/places.csv`** : coordonnées corrigées à la main (ex. Médine, Babylone, Barcelone
  en `manual`) — **jamais écrasé** par le build ; un lieu présent ici n'est jamais géocodé.
- Libellés génériques (`NO_POINT` / `noPoint` dans `hr-map/csv.js`) = entrée globale
  (sidebar), jamais géocodée.
- La sous-page `hr-map-data` reste **publiée** dans le CMS (sinon le sync git ne génère plus
  son fichier et le CSV disparaît) mais n'est **jamais rendue** : cascade
  `build: {render: never, list: never}` sur le path exact `/pages/hr-genealogies/hr-map-data`
  dans `config/_default/config.yaml`. NB : clé `build`, pas `_build` (supprimée dans Hugo ≥ 0.145,
  c'est ce qui avait cassé le déploiement).

## Où voir les erreurs

Logs GitHub Actions → workflow `deuxfleurs` → étape « Régénération de hr-map.json depuis le
CSV Osuny » (lignes préfixées `[hr-map]`). Pas dans l'admin CMS. Piste à terme : notification
mail/Slack en cas d'erreur.

## Workflow éditeur (ajouter une entrée)

Modifier le CSV dans le bloc files de la sous-page `hr-map-data` → attendre le commit
« Sync from osuny » → le déploiement regénère `hr-map.json` tout seul. Les nouveaux lieux
sont géocodés automatiquement au build (marqués `approx` si le match n'est pas exact) ;
les corrections fines se font en commitant `hr-map/places.csv`.

## Checklist CSV à transmettre au client

À copier tel quel dans un mail / une doc client :

1. **Format : CSV UTF-8 obligatoire.** Depuis Excel : *Fichier → Enregistrer sous →
   « CSV UTF-8 »*. Ne jamais renommer un `.xlsx` en `.csv`, et éviter le « CSV » simple
   (souvent encodé Latin-1, les accents cassent). Le fichier déposé dans le CMS doit
   porter l'extension `.csv`.
2. **Ne pas modifier la ligne d'en-tête** ni l'ordre des colonnes :
   `Date / period`, `Place / geography`, `What happened`, `Explanation`,
   `Thematic Categorisation` (+ colonnes optionnelles `Url`, `Lat`, `Lon`).
   La colonne `What happened` est obligatoire.
3. **Délimiteur au choix** (tabulation, `;` ou `,`) : il est détecté automatiquement,
   mais rester cohérent sur tout le fichier.
4. **Guillemets** : entourer de `"` toute cellule contenant une virgule, un point-virgule
   ou un retour à la ligne ; un guillemet à l'intérieur d'une cellule se double (`""`).
5. **Lieu le plus précis possible** (ville, région, pays) : il est géocodé automatiquement
   au déploiement. Les libellés globaux (`Global`, `International`, `Worldwide`,
   `Multiple`, `Various`, `N/A`…) sont acceptés : ils deviennent des entrées sans point
   sur la carte, listées à part.
6. **Pas besoin de colonnes `Lat` / `Lon`** : elles sont optionnelles. Si elles sont absentes
   ou vides, le lieu est géocodé automatiquement au déploiement à partir de « Place / geography »
   — d'où l'intérêt d'un lieu précis (point 5). Un lieu introuvable est simplement ignoré sur
   la carte et signalé dans les logs de build.
7. **Thematic Categorisation** : simple texte, rien à déclarer dans l'app. Les filtres de la
   carte sont construits automatiquement à partir des catégories présentes dans le fichier :
   une **nouvelle catégorie apparaîtra toute seule** comme nouveau filtre. Plusieurs
   catégories par entrée : les séparer par `;`. Pour rester homogène, reprendre de préférence
   les 8 existantes : `Culture & Ideas`, `Decolonisation & Self-Determination`,
   `Equality & Inclusion`, `Land & Environment`, `Law & Institutions`, `Protest & Resistance`,
   `Social & Economic Rights`, `Violence & Displacement`.
8. **Pas d'accès git/code côté client** : le client ne touche que le CSV dans le CMS. Si un
   point est mal placé (géocodage imprécis), il nous le signale et **nous** corrigeons les
   coordonnées dans `hr-map/places.csv` (repo) — le build ne l'écrase jamais.
9. **Un seul CSV à la fois** dans le bloc « files » de la sous-page « HR map data »
   (sous `/hr-genealogies/` dans l'admin) : déposer le nouveau fichier **à la place de**
   l'ancien, pas à côté.
10. **Délai** : après le dépôt, attendre le sync + le déploiement (quelques minutes), puis
    vérifier sur `/hr-genealogies/`. Si un point manque ou est mal placé, ne pas republier
    à l'aveugle : nous signaler le point concerné (correction de coordonnées côté nous,
    point 8) et consulter les logs GitHub Actions (workflow `deuxfleurs`, étape
    « Régénération de hr-map.json », lignes `[hr-map]`).
11. **Ne pas toucher au CSV du repo** (`hr-map/fallback.csv`) : c'est le filet de sécurité,
    il ne sert que si le fichier CMS est indisponible.

## CSV checklist — English version (for the client)

Copy-paste ready:

1. **Format: UTF-8 CSV is mandatory.** From Excel: *File → Save as → "CSV UTF-8"*. Never
   rename an `.xlsx` to `.csv`, and avoid plain "CSV" (often Latin-1 encoded — accents break).
   The file uploaded in the CMS must have the `.csv` extension.
2. **Do not change the header row** or the column order:
   `Date / period`, `Place / geography`, `What happened`, `Explanation`,
   `Thematic Categorisation` (+ optional `Url`, `Lat`, `Lon` columns).
   The `What happened` column is required.
3. **Delimiter: your choice** (tab, `;` or `,`) — it is auto-detected, but keep it consistent
   across the whole file.
4. **Quotes**: wrap any cell containing a comma, semicolon or line break in `"`;
   a literal quote inside a cell is doubled (`""`).
5. **Be as precise as possible with the place** (city, region, country): it is geocoded
   automatically at deploy time. Global labels (`Global`, `International`, `Worldwide`,
   `Multiple`, `Various`, `N/A`…) are accepted: they become point-less entries listed
   separately from the map.
6. **No `Lat` / `Lon` columns needed**: they are optional. If missing or empty, the place is
   geocoded automatically from `Place / geography` — that is why a precise place matters
   (point 5). A place that cannot be found is simply left off the map and reported in the
   build logs.
7. **Thematic Categorisation** is plain text — nothing to declare in the app. The map filters
   are built automatically from the categories present in the file: a **new category
   automatically appears as a new filter**. Several categories per entry: separate them with
   `;`. To stay consistent, prefer the 8 existing ones: `Culture & Ideas`,
   `Decolonisation & Self-Determination`, `Equality & Inclusion`, `Land & Environment`,
   `Law & Institutions`, `Protest & Resistance`, `Social & Economic Rights`,
   `Violence & Displacement`.
8. **Client-side access = CMS only** (no git / no code): edit only the CSV in the CMS.
   If a point is misplaced (imprecise geocoding), report it to us and **we** fix the
   coordinates in `hr-map/places.csv` on the repo side (the build never overwrites it).
9. **One CSV at a time** in the "files" block of the "HR map data" sub-page
   (under `/hr-genealogies/` in the admin): upload the new file **in place of** the old one,
   not next to it.
10. **Timing**: after uploading, wait for the sync + deployment (a few minutes), then check
    `/hr-genealogies/`. If an entry is missing or misplaced, do not re-upload blindly: tell us
    which entry, and check the GitHub Actions logs (workflow `deuxfleurs`, step
    "Régénération de hr-map.json", `[hr-map]` lines).
11. **Do not edit the repo CSV** (`hr-map/fallback.csv`): it is the safety net, only used if
    the CMS file is unavailable.

**Geocoding note**: places are geocoded automatically at build time with
[Nominatim](https://nominatim.org/), the open-source geocoder of the OpenStreetMap project
(software under GPLv2; the geocoding **data** is © OpenStreetMap contributors, published under
the [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) license — attribution required).
We follow the public [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/):
maximum 1 request per second and a contact email sent with each request, which is why the
build caps automatic geocoding at 20 new places per deployment. Entries whose place cannot be
resolved precisely are marked as approximate (`approx`) on the map.

## Repères

- website_id : `072641b5-6716-49b3-8c74-b761bc68f78b` ; host `nous.osuny.org` ;
  token dans `scripts/import-osuny/.env` (gitignoré, ne jamais l'afficher).
- Pages CMS : `967b6877` = `/hr-genealogies/` (carte) ; `347f7ea3` = `hr-map-data`
  (sous-page data, bloc files). L'ancienne special page est devenue `/exhibitions/`
  (dépubliée) ; `hr-map-data-old` dépublié et retiré du repo.
- Fichiers : `hr-map/build.js` (build complet), `csv-to-json.js`, `csv.js`, `geocode.js`,
  `fallback.csv`, `places.csv` ; sortie `static/data/hr-map.json` ; JS `assets/js/hr-map.js`
  (chargé par hook de layout avec fingerprint, voir ci-dessus).
