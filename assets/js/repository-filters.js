// Page des projets : transforme les liens de catégories en cases à cocher
// et filtre la liste sans recharger la page, puis pagine le résultat côté client.
// Au sein d'un groupe : OU. Entre groupes : ET.
// Chaque groupe a une entrée "All" cochée quand rien d'autre ne l'est.
// La pagination serveur est désactivée (GetPaginator -> 10000) : toutes les entrées
// doivent être dans le DOM pour que filtre + pagination fonctionnent ensemble.
( function () {
    'use strict';

    // Garde-fou : ce script ne sert que sur la page section projects
    if (!document.querySelector('.projects__section')) {
        return;
    }

    var PAGE_SIZE = 3, // taille de page côté client
        currentPage = 1,
        groups = [],
        items = [];

    function toArray (list) {
        return Array.prototype.slice.call(list);
    }

    function normalize (pathname) {
        return pathname.replace(/\/?$/, '/');
    }

    function createLabel (text, value) {
        var label = document.createElement('label'),
            input = document.createElement('input'),
            span = document.createElement('span');

        input.type = 'checkbox';
        input.value = value;
        span.textContent = text;
        label.appendChild(input);
        label.appendChild(span);

        return { label: label, input: input };
    }

    function hasChecked (group) {
        return group.inputs.some( function (input) {
            return input.checked;
        } );
    }

    function onSpecificChange (group) {
        group.all.checked = !hasChecked(group);
        currentPage = 1;
        apply();
    }

    function onAllChange (group) {
        group.inputs.forEach( function (input) {
            input.checked = false;
        } );
        group.all.checked = true;
        currentPage = 1;
        apply();
    }

    function buildGroups () {
        var dropdowns = document.querySelectorAll('.projects__section .taxonomies-list .dropdown');

        toArray(dropdowns).forEach( function (dropdown) {
            var list = dropdown.querySelector('.taxonomy-categories-list'),
                button = dropdown.querySelector('button'),
                // slug de la taxonomie (aria-controls="categories-themes" -> "themes"),
                // pour libeller "All themes" / "All types" indépendamment du titre du bouton
                slug = button ? (button.getAttribute('aria-controls') || '').replace(/^categories-/, '') : '',
                links = dropdown.querySelectorAll('.taxonomy-categories-list a'),
                group = { all: null, inputs: [] },
                all,
                li;

            if (!list || !links.length) {
                return;
            }

            toArray(links).forEach( function (link) {
                var option = createLabel(link.textContent, normalize(link.pathname));

                option.input.addEventListener('change', function () {
                    onSpecificChange(group);
                } );
                link.parentNode.replaceChild(option.label, link);
                group.inputs.push(option.input);
            } );

            all = createLabel('All ' + slug, '');
            all.input.checked = true;
            all.input.addEventListener('change', function () {
                onAllChange(group);
            } );
            li = document.createElement('li');
            li.appendChild(all.label);
            list.insertBefore(li, list.firstChild);
            group.all = all.input;

            groups.push(group);
        } );
    }

    function buildItems () {
        var lis = document.querySelectorAll('.projects__section ul.projects--grid > li');

        toArray(lis).forEach( function (li) {
            var links = li.querySelectorAll('.project-categories a'),
                categories = li.querySelectorAll('.project-categories li'),
                typeItem = null,
                paths = toArray(links).map( function (link) {
                    return normalize(link.pathname);
                } );

            // Repère la catégorie "type" (groupe "types") pour l'afficher en premier
            toArray(categories).forEach( function (category) {
                var link = category.querySelector('a');

                if (link && normalize(link.pathname).indexOf('/types/') !== -1) {
                    category.classList.add('is-type');
                    typeItem = category;
                }
            } );

            // Séparateur seulement s'il y a d'autres catégories après le type
            if (typeItem && categories.length > 1) {
                typeItem.classList.add('has-separator');
            }

            items.push( { element: li, paths: paths } );
        } );
    }
    
    function matchesGroup (item, group) {
        var checked = group.inputs.filter( function (input) {
                return input.checked;
            } ),
            i;

        if (checked.length === 0) {
            return true;
        }
        for (i = 0; i < checked.length; i++) {
            if (item.paths.indexOf(checked[i].value) !== -1) {
                return true;
            }
        }
        return false;
    }

    function visibleItems () {
        return items.filter( function (item) {
            return groups.every( function (group) {
                return matchesGroup(item, group);
            } );
        } );
    }

    function ensurePaginationNav () {
        var container = document.querySelector('.projects__section .document-content > .container'),
            projects = document.querySelector('.projects__section div.projects'),
            nav,
            ul;

        if (!container) {
            return null;
        }
        nav = container.querySelector('nav[aria-label="Pagination"]');
        if (!nav) {
            nav = document.createElement('nav');
            nav.setAttribute('aria-label', 'Pagination');
            ul = document.createElement('ul');
            ul.className = 'pagination';
            nav.appendChild(ul);
            if (projects && projects.parentNode === container) {
                container.insertBefore(nav, projects.nextSibling);
            } else {
                container.appendChild(nav);
            }
        }
        return nav;
    }

    function renderPagination (totalPages) {
        var nav = ensurePaginationNav(),
            ul,
            i,
            li;

        if (!nav) {
            return;
        }
        ul = nav.querySelector('ul.pagination');
        ul.textContent = '';
        nav.style.display = totalPages > 1 ? '' : 'none';

        for (i = 1; i <= totalPages; i++) {
            li = document.createElement('li');
            if (i === currentPage) {
                li.className = 'active';
                li.innerHTML = '<span aria-current="page">' + i + '</span>';
            } else {
                li.innerHTML = '<button type="button" aria-label="Go to page ' + i + '">' + i + '</button>';
                li.querySelector('button').addEventListener('click', ( function (page) {
                    return function () {
                        currentPage = page;
                        apply();
                        var list = document.querySelector('.projects__section ul.projects--grid');
                        if (list && list.scrollIntoView) {
                            list.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    };
                } )(i) );
            }
            ul.appendChild(li);
        }
    }

    function apply () {
        var visible = visibleItems(),
            totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE)),
            start;

        if (currentPage > totalPages) {
            currentPage = totalPages;
        }
        start = (currentPage - 1) * PAGE_SIZE;

        items.forEach( function (item) {
            var index = visible.indexOf(item);
            item.element.hidden = index === -1 || index < start || index >= start + PAGE_SIZE;
        } );

        renderPagination(totalPages);
    }

    // Bouton "Show/Hide filters" (mobile) : replie tout le panneau de filtres.
    // Fermé par défaut en mobile (< 768px), ouvert sinon ; le bouton est masqué
    // en desktop par le CSS (.filters-toggle { display: none }).
    function buildCollapseToggle () {
        var container = document.querySelector('.projects__section .section-taxonomies-container'),
            list = container ? container.querySelector('.taxonomies-list') : null,
            toggle;

        if (!container || !list) {
            return;
        }

        toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'btn filters-toggle';
        toggle.setAttribute('aria-expanded',
            (window.matchMedia && window.matchMedia('(max-width: 767.98px)').matches) ? 'false' : 'true');

        function render () {
            var open = toggle.getAttribute('aria-expanded') === 'true';
            toggle.textContent = open ? 'Hide filters' : 'Show filters';
            container.classList.toggle('filters-collapsed', !open);
        }

        toggle.addEventListener('click', function () {
            toggle.setAttribute('aria-expanded',
                toggle.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
            render();
        });

        container.insertBefore(toggle, list);
        render();
    }

    function init () {
        buildCollapseToggle();
        buildGroups();
        buildItems();
        groups.forEach( function (group) {
            group.all.checked = !hasChecked(group);
        } );
        apply();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
} )();