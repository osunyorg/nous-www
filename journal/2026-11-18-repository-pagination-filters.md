# 2026-11-18 — Page Repository (/repository/) : décisions pagination, filtres, import

Contexte : `/repository/` est la section `projects` (`content/en/projects/_index.html`, `url: "/repository/"`).
Travail fait sur la branche `repo-page` (4 commits : cartes en liens externes, layout de page, filtres+pagination JS, UI de pagination globale).

## Décisions

1. **Pagination en JS côté client, uniquement sur la page section.** Le filtrage est en JS
   (cases à cocher), donc la pagination doit l'être aussi — sinon un filtre ne voit que la
   page courante. `layouts/_partials/projects/section/helpers/GetPaginator.html` fait
   `.Paginate $projects 10000` seulement si `.Kind == "section"` ; les pages de terme
   (`/repository/themes/.../`) gardent la pagination serveur (36 par défaut, thème).
   Taille de page JS = `PAGE_SIZE` en haut de `assets/js/repository-filters.js`
   (actuellement 3 pour tester le style — à augmenter avant l'import des 153 entrées).

2. **UI de pagination globale, numéros seuls.** Overrides de
   `layouts/_partials/commons/section/pagination.html` (flèches first/prev/next/last
   supprimées) et `.../page-numbers.html` (page active = `<span aria-current="page">`
   non cliquable). Style global dans `assets/sass/_theme-fixes.sass` (`.pagination`) :
   aligné à gauche, `gap: .5rem`, carrés 2.5rem bordure 2px `$color-green`, hover
   `$color-light-green`, active remplie `$color-accent` (#3E0A38) texte blanc ; icônes
   fléchées `::before` du thème sur les `li` de bord neutralisées (`content: none`).
   `.pagination` n'est utilisé que par les navs de section (les sliders utilisent
   `.slider-pagination`).

3. **Les cartes projet sont des liens externes, sans page single.** `config/_default/config.yaml`
   cascade `outputs: [RSS]` sur `/projects/**` ; override `GetPermalink.html` →
   `header_cta.target` ; `heading.html` ouvre dans un nouvel onglet ; `summary.html`
   affiche le CTA sous le résumé de la carte. Conséquence : les entrées ne sont ni dans
   le sitemap ni dans la recherche — acceptable, elles pointent vers l'extérieur.

4. **Filtres = cases à cocher en JS** (OU dans un groupe, ET entre groupes ; le libellé
   « All <slug> » vient de `aria-controls="categories-<slug>"`, pas du titre du bouton).
   Les libellés de groupes (« Filter Themes ») sont à renommer **dans le CMS Osuny**
   (synchronisés dans `section_taxonomies`), pas via un override de template —
   l'override `dropdown.html` a été supprimé pour ça.

5. **`repository-filters.js` n'est chargé que sur la page section projects** via
   `layouts/_partials/main/hooks/before-end.html` (`Type=projects` + `Kind=section`),
   retiré du bundle global `main.js` ; garde-fou en haut de l'IIFE.

6. **Import des 153 entrées** (source : `hr-map/NOUS_Repository.csv`, tracké ;
   colonnes `Type,Title,Source/Citation,Theme,Key Takeaway,Link`, valeurs multiples
   séparées par `;`, 14 thèmes / 17 types dans le CSV vs 7 / 3 existants) :
   - Privilégié : API Osuny v1 sur `https://nous.osuny.org/api/osuny/v1`, header
     `X-Osuny-Token` = **token d'app université** (créé à
     `/admin/fr/<directory-universite>/apps`, affiché une seule fois — régénérer si perdu).
     Endpoints : `GET /communication/websites`, `GET/POST .../portfolio/categories/upsert`
     (parent_id pour themes/types), `POST .../portfolio/projects/upsert`
     (`migration_identifier` obligatoire par projet ; dédoublonner via `GET .../projects`
     + update par slug). Mapping : Title→title+slug, Source/Citation→subtitle,
     Key Takeaway→summary, Link→header_cta{target,external,label:"Open external resource"},
     Theme/Type→category_ids, year/from_day parsés depuis la citation.
   - Repli si pas d'accès API : script node réutilisant `hr-map/csv.js` →
     `static/repository.json`, fetché par la page (la liste est rendue en JS de toute façon).
     Ne PAS uploader le CSV dans le CMS (Fichiers) : les URLs média sont signées/côté admin.
   - Ne jamais générer `content/en/projects/*.html` à la main : le prochain
     « Sync from osuny » les écraserait/supprimerait.

## Pièges appris

- `.env` n'est PAS dans `.gitignore` — ne jamais mettre de token dans un fichier du repo ;
  utiliser `export OSUNY_TOKEN=...` dans le shell.
- Build local : hugo-extended 0.165 via mise
  (`/home/audrey/.local/share/mise/installs/hugo-extended/0.165.0/hugo`),
  lancer avec `-e development` (saute PostCSS) et `--destination /tmp/...` ;
  dans une copie de l'arbre, symlinker `node_modules` (js.Build en a besoin).
- `.Paginate` ignore le `pagerSize` du front matter — la taille par section passe
  obligatoirement par le 2e argument de `.Paginate` (d'où l'override GetPaginator).
- `return` dans un `{{ if }}` échoue dans les partials Hugo — assigner puis return.
- Vérifié par : build + curl du serveur de dev (localhost:1313) + exécution jsdom du
  HTML/JS servis (génération de la nav, items masqués).