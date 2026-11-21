# 2026-11-20 — Import Osuny via la gem officielle + leçons apprises

Suite de `2026-11-19-api-osuny-tests-import-csv.md`. L'import des 153 entrées est fait
via le client officiel (`gem osuny_api`), script dans `scripts/import-osuny/`.

## Résultat

- 153 projets dans le CMS, tous avec `migration_identifier: nous-repository-<slug>`
  → ré-import idempotent (`--apply` rejouable sans doublon).
- Champs posés : `title`, `slug`, `subtitle` (citation), `summary` (key takeaway),
  `published`, `published_at` (date complète extraite de la citation, ex. « 3 March 2021 » ;
  sinon `from_day` = date du jour), `year`, `category_ids` (thèmes + types résolus par slug),
  bloc `call_to_action` (bouton « Open external resource » → colonne `Link`).
- `header_cta*` est envoyé mais **ignoré par l'API** (voir leçons) → contourné par un bloc
  `call_to_action`. Les projets n'ont pas de page single (config : `outputs: [RSS]`), donc
  le CTA s'affiche sur les **cards de /repository/** : l'override
  `layouts/_partials/projects/partials/project/core/summary.html` lit `.Params.header_cta`,
  et en fallback le premier bouton du premier bloc `call_to_action` de l'entrée
  (sous le résumé de la card). Vérifié en build : 36/36 cards avec CTA.
  NB : le sync Hugo ne sérialise pas `html_class` des blocs → ne pas compter dessus côté
  template ; `data.elements` devient `data.buttons` dans le front matter.

## Comment le script a été construit (sources, dans l'ordre)

1. Runbook interne `2026-11-19-api-osuny-tests-import-csv.md` : mapping CSV → payload.
2. `github.com/osunyorg/importers` (`json/import.rb`) : pattern `.env`
   (`OSUNY_API_HOST` / `OSUNY_API_TOKEN` / `OSUNY_WEBSITE_ID`) + boucle d'import.
   **Pas besoin de forker** ce repo : on consomme la gem publiée sur rubygems.org.
3. Code de la gem (`gem unpack osuny_api-1.1.0.gem`) : vrais noms de méthodes
   (`communication_websites_website_id_portfolio_projects_upsert_post`, etc.), config
   (`config.host`, `config.base_path = '/api/osuny/v1'`, `config.api_key['X-Osuny-Token']`).
4. Spec OpenAPI live (`/api/docs/osuny/v1/openapi.json`) pour les schémas.
5. Code source du serveur (clone `osunyorg/admin`) pour les comportements réels.

## Leçons (à retenir)

- **Le spec OpenAPI décrit le modèle, pas les permissions.** Il déclare `header_cta`
  sur `portfolio_project_localization`, mais le contrôleur API filtre les params
  (`l10n_permitted_keys` dans `api/osuny/communication/websites/portfolio/projects_controller.rb`
  ne contient pas `header_cta*`) → champ accepté sans erreur mais jamais enregistré.
  Même constat en POST create et PATCH. Seul l'endpoint `pages` l'autorise.
  → Toujours tester un champ en conditions réelles avant de s'appuyer dessus.
- **PATCH exige le `migration_identifier` exact** de l'entrée (422 sinon, 400 si absent).
  Une entrée sans `migration_identifier` ne peut être ni patchée ni upsertée : la
  recréer (DELETE + upsert) — ici sans perte, les 5 anciennes entrées n'avaient que
  des champs issus du CSV (vérifié : pas de média, pas de blocs).
- **Bloc `call_to_action`** : l'API prend `data.elements: [{title, url, target_blank}]` ;
  le `buttons` du front matter est généré au sync Hugo. Le tag `html_class` est utile pour
  distinguer un bloc importé (source du hero) d'un bloc éditorial en bas de page.
- **`from_day` est exigé** par le serveur (déduit de `year` si absent ; 422 « can't be blank »
  si aucun des deux) → fallback `Date.today`.
- **Ne jamais mettre le token dans un fichier tracké, un /tmp ou un chat** : variable
  d'env ou `.env` gitignoré (`scripts/import-osuny/.env` est dans `.gitignore`).
- Le `website_id` n'est pas un secret (UUID public) ; le token, si.

## PR en cours (parallèle)

Branche `fix/api-portfolio-project-header-cta` (1 ligne : ajouter
`:header_cta, :header_cta_label, :header_cta_url` à `l10n_permitted_keys` des projets),
à pousser depuis un fork de `osunyorg/admin`. Review/merge/déploiement par l'équipe Osuny.
Une fois déployé : relancer `bundle exec ruby scripts/import-osuny/import-repository.rb --apply`
pour poser le `header_cta` natif, puis simplifier l'override de `summary.html`
(le fallback bloc deviendra inutile).

## Mise à jour 2026-11-20 (soir) — les 13 CTA manquants n'étaient PAS un problème d'import

Symptôme : build local = 153 cartes mais 140 CTA seulement. Diagnostic :

- Côté CMS, **153/153** blocs `call_to_action` ont bien leur URL (vérifié en lecture seule
  via l'API, et nouveau mode `--verify` du script : `bundle exec ruby import-repository.rb --verify`).
- Les 13 fichiers locaux concernés avaient un `buttons:` vide : le dernier « Sync from osuny »
  vers git (18:44) datait d'avant la correction serveur des blocs (18:54). **Le sync local était
  simplement en retard** → re-sync admin + `git pull` (merge origin/main) + rebuild = 153/153 CTA.
- Piège : le serveur **tronque le slug à 100 caractères** (et strippe le tiret final) mais garde
  le `migration_identifier` complet. Le script a un `cms_slug` (truncate 100) pour matcher les
  projets existants ; ne pas confondre avec `slugify` utilisé dans les payloads (idempotence upsert).
- La gem `osuny_api` lève une `ApiError` sur tout non-2xx : un échec d'écriture n'est PAS silencieux,
  il fait planter le script (contrairement à ce qu'on a suspecté un moment).

## Commandes

```bash
cd scripts/import-osuny
cp .env.example .env   # puis coller OSUNY_API_TOKEN (jamais commité)
bundle install
bundle exec ruby import-repository.rb                # dry-run, aucun appel réseau
bundle exec ruby import-repository.rb --categories   # liste les catégories (lecture seule)
bundle exec ruby import-repository.rb --apply        # importe/met à jour les 153 entrées
bundle exec ruby import-repository.rb --apply --limit 2   # test sur 2 entrées
bundle exec ruby import-repository.rb --verify       # lecture seule : CTA persisté côté CMS pour chaque ligne du CSV
```

Puis « Sync from osuny » dans l'admin → `git pull` → rebuild → vérifier `/repository/`.
