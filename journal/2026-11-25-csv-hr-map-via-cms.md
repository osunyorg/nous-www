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

## Repères

- website_id : `072641b5-6716-49b3-8c74-b761bc68f78b` ; host `nous.osuny.org` ;
  token dans `scripts/import-osuny/.env` (gitignoré, ne jamais l'afficher).
- Pages CMS : `967b6877` = `/hr-genealogies/` (carte) ; `347f7ea3` = `hr-map-data`
  (sous-page data, bloc files). L'ancienne special page est devenue `/exhibitions/`
  (dépubliée) ; `hr-map-data-old` dépublié et retiré du repo.
- Fichiers : `hr-map/build.js` (build complet), `csv-to-json.js`, `csv.js`, `geocode.js`,
  `fallback.csv`, `places.csv` ; sortie `static/data/hr-map.json` ; JS `assets/js/hr-map.js`
  (chargé par hook de layout avec fingerprint, voir ci-dessus).
