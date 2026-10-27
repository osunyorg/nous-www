// Page des projets : transforme les liens de catégories en cases à cocher
// et filtre la liste sans recharger la page.
// Au sein d'un groupe : OU. Entre groupes : ET.
// Chaque groupe a une entrée "All" cochée quand rien d'autre ne l'est.
( function () {
    'use strict';

    var groups = [],
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
        apply();
    }

    function onAllChange (group) {
        group.inputs.forEach( function (input) {
            input.checked = false;
        } );
        group.all.checked = true;
        apply();
    }

    function buildGroups () {
        var dropdowns = document.querySelectorAll('.projects__section .taxonomies-list .dropdown');

        toArray(dropdowns).forEach( function (dropdown) {
            var list = dropdown.querySelector('.taxonomy-categories-list'),
                button = dropdown.querySelector('button'),
                title = button ? button.textContent.replace(/\s+/g, ' ').trim() : '',
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

            all = createLabel('All ' + title.toLowerCase(), '');
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

    function apply () {
        items.forEach( function (item) {
            var visible = groups.every( function (group) {
                return matchesGroup(item, group);
            } );
            item.element.hidden = !visible;
        } );
    }

    function init () {
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