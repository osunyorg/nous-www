# 2026-11-19 — API Osuny : runbook de tests et import du CSV repository

Objectif : importer les 153 entrées de `scripts/import-osuny/NOUS_Repository.csv` dans le CMS Osuny
(section **Projets** = page `/repository/`) via l'API, sans passer par l'admin à la main.

## 0. Règle d'or : le token

Le token de l'app (créée dans l'admin Osuny, `/admin/.../apps`, affiché une seule fois) ne
doit **jamais** apparaître dans le chat, dans un log, ou dans un fichier du repo (`.env` n'est
pas gitignoré ici). Uniquement en variable d'env dans le shell :

```bash
export OSUNY_TOKEN="colle-le-jeton-ici"        # terminal local uniquement
echo "longueur du token : ${#OSUNY_TOKEN}"    # vérifie qu'il est défini sans l'afficher
```

## 1. Rappel : c'est quoi une API REST

Le serveur répond à des requêtes HTTP : **méthode** (`GET` = lire, `POST` = créer/modifier)
+ **URL** (endpoint) + **en-têtes** (auth) + éventuellement un **corps JSON**. Réponse =
code de statut + JSON.

| Code | Signification |
|------|---------------|
| 200 / 201 | OK |
| 401 | Token manquant ou invalide |
| 404 | Mauvais chemin ou mauvais id de site |
| 422 | Données invalides (le body indique le champ) |
| 429 | Rate limit, ralentir |

Concept clé : **`upsert`** = update-or-insert. Si un élément avec le même
`migration_identifier` existe, il est mis à jour, sinon créé. Idempotent : on peut rejouer
l'import sans doublons.

## 2. Contrat de l'API (vérifié dans le spec OpenAPI)

- Base : `https://nous.osuny.org/api/osuny/v1`
- Auth : en-tête `X-Osuny-Token: $OSUNY_TOKEN`
- Spec : `https://nous.osuny.org/api/docs/osuny/v1/openapi.json`
  (doc interactive Swagger : `https://nous.osuny.org/api/docs/index.html`)
- Endpoints utiles :
  - `GET /communication/websites` → liste des sites (id, url, git.repository)
  - `GET /communication/websites/{website_id}/portfolio/categories?per_page=100&page_num=1`
  - `POST /communication/websites/{website_id}/portfolio/categories/upsert` body `{categories: [...]}`
  - `GET /communication/websites/{website_id}/portfolio/projects?per_page=100&page_num=1`
  - `POST /communication/websites/{website_id}/portfolio/projects/upsert` body `{projects: [...]}`

Payload catégorie : `{migration_identifier, parent_id, is_taxonomy, position,
localizations: {en: {name, slug, ...}}}`. Les parents « themes » et « types » ont
`is_taxonomy: true` et `slug` = `themes` / `types` ; les enfants ont `parent_id` = id du parent.

Payload projet : `{migration_identifier, year, from_day, category_ids: [uuid...],
localizations: {en: {title, slug, subtitle, summary, published, published_at,
header_cta (bool), header_cta_label, header_cta_url, blocks: [...]}}}`.
Le sync Hugo transforme `header_cta` + label + url en front matter
`header_cta: {target, external, label}` (cf. `content/en/projects/2021/truth-post-truth-...html`).

## 3. Tests progressifs (lecture seule, sans risque)

### Test 1 — le token est accepté (200) ou non (401)

```bash
curl -s -o /tmp/websites.json -w "HTTP %{http_code}\n" \
  -H "X-Osuny-Token: $OSUNY_TOKEN" \
  https://nous.osuny.org/api/osuny/v1/communication/websites

python3 -c "
import json
for w in json.load(open('/tmp/websites.json')):
    print(w['id'], '|', w.get('url'), '|', (w.get('git') or {}).get('repository'))
"
```

Repérer la ligne dont le dépôt git contient `nous-www`, puis :

```bash
export WEBSITE_ID="l-uuid-trouve"
```

### Test 2 — lister les catégories (trouver les ids des parents themes/types)

```bash
curl -s -w "\nHTTP %{http_code}\n" -H "X-Osuny-Token: $OSUNY_TOKEN" \
  "https://nous.osuny.org/api/osuny/v1/communication/websites/$WEBSITE_ID/portfolio/categories?per_page=100" \
  -o /tmp/categories.json

python3 -c "
import json
for c in json.load(open('/tmp/categories.json')):
    loc = c['localizations'].get('en', {})
    print(c['id'], '| taxonomie:', c.get('is_taxonomy'), '| parent:', c.get('parent_id'), '|', loc.get('slug'), '|', loc.get('name'))
"
```

### Test 3 — voir la forme des projets existants

```bash
curl -s -H "X-Osuny-Token: $OSUNY_TOKEN" \
  "https://nous.osuny.org/api/osuny/v1/communication/websites/$WEBSITE_ID/portfolio/projects?per_page=2" \
  | python3 -m json.tool | head -60
```

### Test 4 — première écriture : un projet de test (à supprimer ensuite dans l'admin)

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST \
  -H "X-Osuny-Token: $OSUNY_TOKEN" -H "Content-Type: application/json" \
  -d '{"projects":[{"migration_identifier":"nous-repository-test","localizations":{"en":{"title":"Test API","slug":"test-api","published":true}}}]}' \
  "https://nous.osuny.org/api/osuny/v1/communication/websites/$WEBSITE_ID/portfolio/projects/upsert"
```

Vérifier dans l'admin que « Test API » apparaît dans les projets, le supprimer, et
éventuellement rejouer la commande pour confirmer qu'aucun doublon n'est créé (upsert).

## 4. Mapping CSV → projet (pour le script `scripts/import-osuny/import-repository.rb`)

| Colonne CSV | Champ API |
|---|---|
| `Title` | `localizations.en.title` + `slug` (slugifié) |
| `Source/Citation` | `localizations.en.subtitle` |
| `Key Takeaway` | `localizations.en.summary` |
| `Link` | `header_cta: true`, `header_cta_url`, `header_cta_label: "Open external resource"` |
| `Theme` (séparés par `;`) | `category_ids` (enfants de la catégorie `themes`) |
| `Type` | `category_ids` (enfant de la catégorie `types`) |
| année trouvée dans la citation | `year` / `from_day` (facultatif) |

- `migration_identifier` = `nous-repository-<slug>` → import idempotent.
- Catégories : `migration_identifier` = `nous-repository-theme-<slug>` / `-type-<slug>`,
  `parent_id` = id du parent themes/types.
- Le script aura un mode `--dry-run` (aucun appel réseau, affiche le récap et des exemples
  de payloads) puis le mode réel avec `OSUNY_TOKEN` en env.

## 5. Suite

1. `bundle exec ruby scripts/import-osuny/import-repository.rb` → validation du payload.
2. `bundle exec ruby scripts/import-osuny/import-repository.rb --apply` → import réel (par lots).
3. « Sync from osuny » dans l'admin → `git pull` → rebuild local → vérifier les 153 entrées,
   la pagination JS et les filtres sur `/repository/`.
