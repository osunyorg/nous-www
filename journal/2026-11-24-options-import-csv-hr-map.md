# 2026-11-24 — Carte HR (Genealogies) : options pour déposer un CSV de nouveaux points

Objectif : permettre d'ajouter des points sur la carte `/hr-genealogies/` à partir d'un CSV,
sans passer par un commit manuel dans le repo. Ce doc liste les options creusées dans le code,
pour décision. Aujourd'hui le flux est : `hr-map/hr-map.csv` → `node hr-map/csv-to-json.js` →
`static/hr-map.json` (commité) → lu par `static/js/hr-map.js` via le bloc embed de
`content/en/exhibitions/_index.html` (`data-src="/hr-map.json"`).

## 0. Contraintes vérifiées dans le repo

- **Hébergements** : aujourd'hui Deuxfleurs (S3 100 % statique, `www.nous.osuny.site` via
  `.github/workflows/deuxfleurs.yml`) et Netlify (`netlify.toml`, previews). **Cible à terme :
  Infomaniak mutualisé** (Apache + PHP) — déjà préparé dans `hosting/infomaniak/`
  (`build.js` copie `.htaccess` + `contact.php` dans `public/` ; `contact.php` est un
  endpoint de formulaire en PHP). Conséquence : pas de Netlify Function en prod, mais du
  **PHP disponible** → un endpoint d'upload en PHP est viable en production (option 4).
- **Ce qu'on peut déposer dans l'admin Osuny** : uniquement des médias / pages « File ».
  Le binaire n'atterrit pas dans le repo : il part sur le bucket S3 Osuny et le repo ne reçoit
  qu'une méta `data/media/<xx>/<uuid>.yml` avec une `direct_url` publique.
  Testé le 2026-11-24 : le bucket répond `access-control-allow-origin: *` → un `fetch`
  navigateur vers un CSV uploadé dans l'admin fonctionne (pas de blocage CORS).
- **La carte** : lit un JSON statique. Changer la source = changer `data-src` et/ou le JS.

## 1. Les options

| # | Option | Dépôt du CSV où ? | Changements | Avantages | Inconvénients |
|---|--------|-------------------|-------------|-----------|---------------|
| 1 | **CSV = média Osuny, lu au runtime par la carte** | Admin Osuny (page File dédiée, ex. « HR map data ») | Le template Hugo de `/hr-genealogies/` injecte l'URL S3 du média (`original_blob.id` → `GetMedia` → `direct_url`) dans `data-src` ; porter `hr-map/csv.js` en browser dans `hr-map.js` (fetch → parse → dessin) ; `/hr-map.json` reste en fallback | 100 % dans l'admin, instantané (pas de rebuild), marche sur les 3 hébergements, historique des médias côté Osuny, CORS OK (vérifié) | Plus de validation au build (lignes sans coordonnées silencieuses), fetch + parse à chaque visite, dépendance au bucket S3 |
| 2 | **Points = contenus Osuny (custom type `hr-points`) + JSON généré par Hugo au build** | Admin Osuny fiche par fiche ; CSV en masse via script API (pattern `scripts/import-osuny/import-repository.rb`) | Nouveau custom type (layouts + config, comme `exhibitions`), output format JSON Hugo pour `/hr-map.json`, script d'import CSV → API (dry-run/apply, token) | Le plus CMS-native : validation, recherche, multilingue, versionné git, le build vérifie les coordonnées ; `hr-map.js` ne change pas | Migration des 143 points existants, plus de code, nouveau type à déclarer côté app Osuny |
| 3 | **CSV reste dans le repo, génération auto au build** | GitHub (édition directe ou PR) — pas l'admin | `node hr-map/csv-to-json.js` ajouté aux commandes de build (netlify.toml, workflow deuxfleurs, build Infomaniak) ; `static/hr-map.json` n'est plus commité | Simple, versionné, validation au build conservée (warnings coordonnées manquantes) | Nécessite un compte GitHub et de comprendre le repo |
| 4 | **Endpoint d'upload dédié** : `hr-map-import.php` sur Infomaniak (prod cible), Netlify Function en preview uniquement | Formulaire web protégé par token | L'endpoint parse le CSV (PHP `fgetcsv`), le convertit en JSON et le sert via un second endpoint (`hr-map-data.php`) lu en priorité par la carte ; fallback `/hr-map.json` | Vrai upload hors admin et hors GitHub, **disponible en prod** grâce au PHP Infomaniak | Endpoint public à sécuriser (token, taille max, rate-limit) ; le stockage doit être hors du dossier déployé pour survivre aux redéploiements |
| 5 | **Source externe** (Google Sheets / Airtable, export CSV public) | Google Sheets | `data-src` = URL externe + parsing client comme l'option 1 | Zéro infra, édition familière | Dépendance externe (dispo, droits), pas de versioning, pas dans le CMS |

## 2. Détails d'implémentation (esquisses)

### Option 1 — média Osuny + runtime

1. Créer dans l'admin une page **File** dédiée (ex. `/files/hr-map-data/`) pointant vers le
   CSV uploadé. Front matter : `original_blob.id` du média (comme
   `content/en/files/2026/nova.html`).
2. Dans le layout de la page exhibitions, résoudre l'URL :
   `.Site.GetPage "/files/hr-map-data"` → `.Params.original_blob.id` → `partial "GetMedia"`
   → `.direct_url`, puis `data-src="{{ ... }}"` sur `#nous-worldmap`.
3. Dans `static/js/hr-map.js` : si `data-src` finit par `.csv`, fetcher le texte et le parser
   avec une version navigateur de `hr-map/csv.js` (`detectDelimiter` / `parse`), puis mapper
   les colonnes (`Date / period`, `Place / geography`, `What happened`, `Explanation`,
   `Thematic Categorisation`, `Lat`, `Lon`) vers le format attendu. Fallback sur
   `/hr-map.json` si le fetch échoue.
4. Coordonnées : soit exiger `Lat`/`Lon` dans le CSV uploadé, soit publier aussi
   `static/hr-map-places.json` (généré au build depuis `hr-map/places.csv`) pour résoudre
   les lieux côté client.

### Option 2 — custom type + build

1. Nouveau type `content/en/hr-points/*.html` (champs : title, date, place, lat, lon, text,
   category, url) + `layouts/hr-points/` dans le thème local, comme `exhibitions`.
2. Output format JSON : `layouts/hr-points/list.json` (ou `index.json`) produisant
   `/hr-map.json` depuis `.Site.RegularPages` where type = `hr-points`.
3. Script d'import CSV → API : copier le pattern de `scripts/import-osuny/import-repository.rb`
   (gem `osuny_api`, `X-Osuny-Token`, upsert idempotent par `migration_identifier`).
4. Migration one-shot des 143 lignes de `hr-map/hr-map.csv` vers des fiches.

### Option 3 — build auto

- `netlify.toml` : `command = "node hr-map/csv-to-json.js && yarn osuny build"`.
- `.github/workflows/deuxfleurs.yml` : insérer `node hr-map/csv-to-json.js` avant
  `yarn osuny build` (Node est déjà installé dans le workflow).
- Retirer `static/hr-map.json` du repo (ou le garder en fallback, mais alors penser à le
  régénérer).

### Option 4 — endpoint PHP Infomaniak (prod cible)

1. `hosting/infomaniak/hr-map-import.php`, copié dans `public/` par `build.js` comme
   `contact.php` : reçoit le CSV en POST multipart + un token (`X-Hr-Map-Token` comparé à une
   constante définie dans le fichier PHP — jamais dans un fichier servi côté client), limite
   la taille (ex. 2 Mo), parse avec `fgetcsv` (délimiteur `;` ou `,` auto), valide les
   colonnes attendues et les coordonnées, puis écrit le JSON dans un dossier **persistant
   hors du dossier déployé** (ex. `~/hr-map/hr-map-upload.json`) pour qu'un redéploiement du
   site statique ne l'écrase pas.
2. `hosting/infomaniak/hr-map-data.php` : lit ce JSON et le renvoie avec
   `Content-Type: application/json` + `Cache-Control: no-cache`. La page exhibitions prend
   `data-src="/hr-map-data.php"` ; si le fetch échoue ou renvoie vide, `hr-map.js` retombe
   sur `/hr-map.json` (comportement à ajouter, ~10 lignes).
3. En preview (Netlify / Deuxfleurs, statique pur) : pas de PHP → la carte retombe
   toujours sur `/hr-map.json` ; le formulaire d'upload n'y existe pas (ou Netlify Function
   équivalente, preview only).
4. Sécurité : token en constante PHP (serveur only), rate-limit basique (fichier de
   timestamps côté home), taille max, `Content-Type` forcé, nom de fichier fixe (pas de
   path traversal), log des uploads sans contenu du CSV.

## 3. Recommandation

- Besoin = « le client dépose un CSV dans l'admin Osuny » → **option 1** : seule option qui
  colle sans changer l'architecture, et le CORS du bucket média est vérifié. On garde
  `static/hr-map.json` en fallback si le fetch échoue.
- Besoin = « les éditeurs gèrent les points un par un avec validation » → **option 2**.
- GitHub acceptable pour le client → **option 3** (quick win).
- Avec la cible **Infomaniak mutualisé**, l'**option 4 en PHP** devient disponible en prod :
  c'est le complément naturel de l'option 1 (dépôt admin Osuny) si on veut aussi un
  formulaire d'upload autonome. La variante Netlify Function ne vaudrait que pour les
  previews (statique pur ailleurs).
- Option 5 à écarter : dépendance externe, pas de versioning, pas dans le CMS.

## 4. Hybride possible

Option 1 (dépôt admin, lecture runtime) + option 3 (régénération du JSON au build depuis le
CSV du repo) : le dépôt admin sert au quotidien, le build régénère le JSON statique comme
filet de sécurité et pour la perf (le JS peut préférer le JSON s'il est plus récent — à
définir, ex. comparer `lastmod`).
