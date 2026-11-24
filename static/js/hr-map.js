/*
  Carte du monde des entrées « Alternative Human Rights Genealogies ».
  Lit /hr-map.json (généré par hr-map/csv-to-json.js) et dessine les points.
  Styles : _world-map.scss. Les tracés des terres sont à la fin du fichier.
*/
(function (SPHERE, LAND) {
  var root = document.getElementById("nous-worldmap");
  if (!root) { return; }

  /* Fichier généré par hr-map/csv-to-json.js (dossier static/) */
  var DATA_URL = root.getAttribute("data-src") || "/hr-map.json";

  var W = 960, H = 500, R = 6, MAXZ = 12;
  var NS = "http://www.w3.org/2000/svg";

  /* Fond « Blue Marble » (vue satellite, NASA / Tom Patterson, CC0) en projection
     Equal Earth, sans toponymes, converti en WebP. L'image couvre exactement la
     sphère : cadrage x 0..960, y 16.4..483.6, elle suit le zoom et le pan.
     Pyramide de 3 niveaux : on affiche le niveau le plus proche du zoom courant
     et on ne charge que ceux visités (évite de réduire une grosse image à l'écran = flou).
       low  3840 px   zoom < 1.7
       mid  7680 px   zoom < 3.4
       high 14288 px  au-delà (net jusqu'au zoom max x12)
     L'image est clippée sur la sphère : hors de l'ellipse, le SVG reste transparent
     et laisse voir le fond vert du bloc (les « angles » de la carte).
     Variante « carte physique » gardée à côté : world-map-physical-low/mid/high.webp */
  var BG_LEVELS = [
    { maxZoom: 1.7, src: "/assets/images/map/blue-marble-low.webp" },
    { maxZoom: 3.4, src: "/assets/images/map/blue-marble-mid.webp" },
    { maxZoom: Infinity, src: "/assets/images/map/blue-marble-high.webp" }
  ];
  var BG_X = 0, BG_Y = 16.4, BG_W = 960, BG_H = 467.2;

  root.innerHTML =
    '<div class="nwm-main">' +
    '<p class="nwm-stats" hidden>' +
      '<span class="nwm-stat nwm-stat--located"></span>' +
      '<span class="nwm-stat nwm-stat--global"></span>' +
    '</p>' +
    '<div class="nwm-map">' +
      '<svg viewBox="0 0 960 500" role="img" aria-label="World map">' +
        '<defs><clipPath id="nwm-sphere-clip"><path d="' + SPHERE + '"/></clipPath></defs>' +
        '<path class="nwm-sphere" d="' + SPHERE + '"/>' +
        '<path class="nwm-land" d="' + LAND + '"/>' +
        '<image class="nwm-physical" clip-path="url(#nwm-sphere-clip)" href="' + BG_LEVELS[0].src + '" xlink:href="' + BG_LEVELS[0].src + '" x="' + BG_X + '" y="' + BG_Y + '" width="' + BG_W + '" height="' + BG_H + '" preserveAspectRatio="none"/>' +
        '<g class="nwm-points"></g>' +
      '</svg>' +
      '<div class="nwm-tools">' +
        '<button type="button" data-z="in" aria-label="Zoom in">+</button>' +
        '<button type="button" data-z="out" aria-label="Zoom out">\u2212</button>' +
        '<button type="button" data-z="reset" aria-label="Reset the map">\u21ba</button>' +
      '</div>' +
      '<div class="nwm-popup" hidden></div>' +
    '</div>' +
    '<div class="nwm-global" hidden>' +
      '<p class="nwm-eyebrow nwm-global-title">Global / Regional</p>' +
      '<ul class="nwm-global-list"></ul>' +
      '<button type="button" class="nwm-global-more" aria-expanded="false" hidden></button>' +
    '</div>' +
    '</div>' +
    '<aside class="nwm-filters" aria-label="Theme filter" hidden>' +
      '<p class="nwm-eyebrow">Theme filter</p>' +
      '<ul class="nwm-filter-list"></ul>' +
      '<p class="nwm-eyebrow nwm-legend-title">Map legend</p>' +
      '<ul class="nwm-legend">' +
        '<li><span class="nwm-legend-dot nwm-legend-dot--active" aria-hidden="true"></span>Selected / open entry</li>' +
        '<li><span class="nwm-legend-dot" aria-hidden="true"></span>Located entry</li>' +
        '<li><span class="nwm-legend-dot nwm-legend-dot--approx" aria-hidden="true"></span>Regional / broad area</li>' +
      '</ul>' +
      '<p class="nwm-box nwm-legend-note">Markers show approximate historical geographies. Global / international entries are listed separately below the map.</p>' +
    '</aside>';

  /* Note sous la carte (« Open circles… ») : le texte du bloc Osuny qui suit la carte
     est déplacé juste sous la carte, précédé du point « Regional / broad area » */
  var noteBlock = root.closest(".block");
  noteBlock = noteBlock && noteBlock.nextElementSibling;
  var note = noteBlock && noteBlock.classList.contains("block-chapter") ? noteBlock.querySelector(".rich-text") : null;
  if (note) {
    note.classList.add("nwm-box", "nwm-note");
    var noteP = note.querySelector("p");
    if (noteP) {
      noteP.insertAdjacentHTML("afterbegin", '<span class="nwm-legend-dot nwm-legend-dot--approx" aria-hidden="true"></span>');
    }
    root.querySelector(".nwm-main").insertBefore(note, root.querySelector(".nwm-global"));
    noteBlock.style.display = "none";
  }

  var svg = root.querySelector("svg");
  var bgImg = root.querySelector(".nwm-physical");
  var bgLevel = 0;
  var gPts = root.querySelector(".nwm-points");
  var popup = root.querySelector(".nwm-popup");
  var filters = root.querySelector(".nwm-filters");
  var filterList = root.querySelector(".nwm-filter-list");
  var globalBox = root.querySelector(".nwm-global");
  var globalList = root.querySelector(".nwm-global-list");
  var globalMore = root.querySelector(".nwm-global-more");
  var GLOBAL_SHOWN = 4, globalOpen = false;
  var stats = root.querySelector(".nwm-stats");
  /* Badges : déplacés dans le bloc Osuny juste avant la carte (« Explore by geography »),
     à droite du titre et de la description */
  var introBlock = root.closest(".block");
  introBlock = introBlock && introBlock.previousElementSibling;
  var introChapter = introBlock && introBlock.classList.contains("block-chapter") ? introBlock.querySelector(".chapter") : null;
  if (introChapter) {
    introChapter.appendChild(stats);
    introChapter.classList.add("nwm-intro");
  }

  /* Projection Equal Earth (équivalente : conserve les surfaces réelles, identique à d3.geoEqualEarth).
     Échelle choisie pour remplir la largeur W : lon 180, lat 0 tombe exactement sur x = W. */
  var EE_A1 = 1.340264, EE_A2 = -0.081106, EE_A3 = 0.000893, EE_A4 = 0.003796, EE_M = Math.sqrt(3) / 2;
  var EE_SCALE = W * EE_M * EE_A1 / (2 * Math.PI);
  function project(lon, lat) {
    var l = Math.asin(EE_M * Math.sin(lat * Math.PI / 180)), l2 = l * l, l6 = l2 * l2 * l2;
    var x = lon * Math.PI / 180 * Math.cos(l) / (EE_M * (EE_A1 + 3 * EE_A2 * l2 + l6 * (7 * EE_A3 + 9 * EE_A4 * l2)));
    var y = l * (EE_A1 + EE_A2 * l2 + l6 * (EE_A3 + EE_A4 * l2));
    return [W / 2 + EE_SCALE * x, H / 2 - EE_SCALE * y];
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* Vue : zoom et déplacement via le viewBox.
     Vue initiale zoomée (x1.31, centrée) : le viewBox tient entierement dans la sphere,
     donc les coins verts du bloc n'apparaissent pas a l'ouverture. */
  var HOME = { x: 137.04, y: 59.75, w: 685.92, h: 357.25 };
  var view = { x: HOME.x, y: HOME.y, w: HOME.w, h: HOME.h };
  var nodes = [], current = null, dragged = false;

  function apply() {
    view.w = Math.min(W, Math.max(W / MAXZ, view.w));
    view.h = view.w * H / W;
    view.x = Math.min(W - view.w, Math.max(0, view.x));
    view.y = Math.min(H - view.h, Math.max(0, view.y));
    svg.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + view.h);
    /* Niveau de fond adapté au zoom courant : on précharge le niveau visé et on
       ne l'applique que s'il est toujours d'actualité (évite les courses au swap) */
    var z = W / view.w, want = 0;
    while (want < BG_LEVELS.length - 1 && z > BG_LEVELS[want].maxZoom) { want++; }
    if (want !== bgLevel) {
      bgLevel = want;
      var src = BG_LEVELS[want].src, pre = new Image();
      pre.onload = function () {
        if (bgLevel === want) {
          bgImg.setAttribute("href", src);
          bgImg.setAttribute("xlink:href", src);
        }
      };
      pre.src = src;
    }
    var k = W / view.w;
    nodes.forEach(function (n) {
      n.circle.setAttribute("r", n.r / k);
      n.circle.setAttribute("stroke-width", 1.5 / k);
      if (n.label) { n.label.setAttribute("font-size", 9 / k); }
    });
    place();
  }
  function toSvg(cx, cy) {
    var r = svg.getBoundingClientRect();
    return [view.x + (cx - r.left) / (r.width || W) * view.w, view.y + (cy - r.top) / (r.height || H) * view.h];
  }
  function zoomAt(cx, cy, factor) {
    var s = toSvg(cx, cy);
    var nw = Math.min(W, Math.max(W / MAXZ, view.w / factor));
    var ratio = nw / view.w;
    view.x = s[0] - (s[0] - view.x) * ratio;
    view.y = s[1] - (s[1] - view.y) * ratio;
    view.w = nw;
    apply();
  }

  /* Popup */
  function popupHtml(g) {
    var many = g.items.length > 1;
    var h = '<button class="nwm-close" aria-label="Close">\u00d7</button>' +
      '<p class="nwm-eyebrow">' + (many ? "Selected records (" + g.items.length + ")" : "Selected record") + "</p>" +
      '<div class="nwm-list">';
    g.items.forEach(function (d, i) {
      h += '<article class="nwm-item"' + (i > 0 ? " hidden" : "") + '><h3 class="nwm-title">' + esc(d.title) + "</h3>" +
        (d.cats && d.cats.length ? '<div class="nwm-badges">' + d.cats.map(function (c) {
          return '<span class="nwm-badge">' + esc(c) + "</span>";
        }).join("") + "</div>" : "") +
        (d.date || d.place ? '<p class="nwm-meta">' +
          (d.date ? '<span class="nwm-date"><span class="nwm-label">Date / Period</span>' + esc(d.date) + "</span>" : "") +
          (d.place ? '<span class="nwm-place"><span class="nwm-label">Place / Geography</span>' + esc(d.place) + "</span>" : "") + "</p>" : "") +
        (d.text ? '<p class="nwm-text">' + esc(d.text) + "</p>" : "") +
        (d.url ? '<a class="nwm-link" href="' + esc(d.url) + '">Read more \u2192</a>' : "") +
        "</article>";
    });
    h += "</div>";
    /* Plusieurs entrées : une seule affichée, avec Previous / Next */
    if (many) {
      h += '<div class="nwm-nav">' +
        '<button type="button" class="nwm-prev" disabled>\u2190 Previous</button>' +
        '<span class="nwm-pos" aria-live="polite">1 / ' + g.items.length + "</span>" +
        '<button type="button" class="nwm-next">Next \u2192</button>' +
        "</div>";
    }
    return h;
  }
  function show(index) {
    var items = popup.querySelectorAll(".nwm-item");
    items.forEach(function (item, i) { item.hidden = i !== index; });
    popup.querySelector(".nwm-prev").disabled = index === 0;
    popup.querySelector(".nwm-next").disabled = index === items.length - 1;
    popup.querySelector(".nwm-pos").textContent = (index + 1) + " / " + items.length;
    place();
  }
  function open(g, el) {
    current = g;
    nodes.forEach(function (n) { n.circle.classList.remove("is-active"); });
    el.classList.add("is-active");
    popup.innerHTML = popupHtml(g);
    popup.hidden = false;
    popup.querySelector(".nwm-close").addEventListener("click", close);
    if (g.items.length > 1) {
      var index = 0;
      popup.querySelector(".nwm-prev").addEventListener("click", function () { show(--index); });
      popup.querySelector(".nwm-next").addEventListener("click", function () { show(++index); });
    }
    place();
  }
  function close() {
    current = null; popup.hidden = true;
    nodes.forEach(function (n) { n.circle.classList.remove("is-active"); });
  }
  function place() {
    if (!current) { return; }
    var p = project(current.lon, current.lat), r = svg.getBoundingClientRect();
    var x = (p[0] - view.x) / view.w * r.width, y = (p[1] - view.y) / view.h * r.height;
    var w = popup.offsetWidth, h = popup.offsetHeight;
    var left = Math.min(Math.max(x, w / 2), Math.max(w / 2, r.width - w / 2));
    popup.style.left = left + "px";
    popup.style.top = y + "px";
    popup.style.setProperty("--ax", Math.min(Math.max(x - left + w / 2, 16), w - 16) + "px");
    popup.classList.toggle("nwm-below", y - h - 14 < 0);
  }

  /* Points : les entrées situées au même endroit sont regroupées */
  var all = [], active = "";

  function render() {
    close();
    gPts.innerHTML = "";
    nodes = [];
    var items = active ? all.filter(function (d) { return d.cats.indexOf(active) >= 0; }) : all;
    var globals = items.filter(function (d) { return d.global; });
    renderGlobal(globals);
    items = items.filter(function (d) { return !d.global; });
    /* Badges au-dessus de la carte : nombre d'entrées placées / globales (selon le filtre) */
    stats.querySelector(".nwm-stat--located").textContent = items.length + " located";
    stats.querySelector(".nwm-stat--global").textContent = globals.length + " global / regional";
    stats.hidden = false;
    var groups = {}, order = [];
    items.forEach(function (d) {
      var key = d.lat.toFixed(2) + "," + d.lon.toFixed(2);
      if (!groups[key]) { groups[key] = { lat: d.lat, lon: d.lon, items: [] }; order.push(key); }
      groups[key].items.push(d);
    });
    order.forEach(function (key) {
      var g = groups[key], pos = project(g.lon, g.lat), multi = g.items.length > 1;
      /* Lieu approximatif (région, continent) si toutes les entrées du point le sont */
      var approx = g.items.every(function (d) { return d.approx; });
      var c = document.createElementNS(NS, "circle");
      c.setAttribute("class", "nwm-point" + (approx ? " nwm-point--approx" : ""));
      c.setAttribute("cx", pos[0]); c.setAttribute("cy", pos[1]);
      c.setAttribute("tabindex", 0); c.setAttribute("role", "button");
      c.setAttribute("aria-label", multi ? g.items.length + " events: " + g.items[0].title + "\u2026" : g.items[0].title);
      c.addEventListener("click", function (e) { e.stopPropagation(); if (!dragged) { open(g, c); } });
      c.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(g, c); }
      });
      gPts.appendChild(c);
      var node = { circle: c, label: null, r: multi ? R * 1.6 : R };
      if (multi) {
        var t = document.createElementNS(NS, "text");
        t.setAttribute("class", "nwm-count" + (approx ? " nwm-count--approx" : ""));
        t.setAttribute("x", pos[0]); t.setAttribute("y", pos[1]); t.setAttribute("dy", "0.35em");
        t.textContent = g.items.length;
        gPts.appendChild(t);
        node.label = t;
      }
      nodes.push(node);
    });
    apply();
  }

  /* Entrées globales / internationales (sans point) : listées sous la légende */
  function renderGlobal(items) {
    globalList.innerHTML = items.map(function (d, i) {
      return '<li class="nwm-box nwm-global-item"' + (i >= GLOBAL_SHOWN ? " data-extra" : "") + ">" +
        (d.date ? '<span class="nwm-global-date">' + esc(d.date) + "</span>" : "") +
        '<span class="nwm-global-name">' + esc(d.title) + "</span>" +
        (d.place ? '<span class="nwm-global-place">' + esc(d.place) + "</span>" : "") +
        "</li>";
    }).join("");
    globalBox.hidden = !items.length;
    globalMore.hidden = items.length <= GLOBAL_SHOWN;
    globalMore.setAttribute("data-count", items.length);
    toggleGlobal(globalOpen);
  }
  /* Les premières entrées globales sont visibles, « Show all » affiche les autres */
  function toggleGlobal(openAll) {
    globalOpen = openAll;
    globalList.querySelectorAll("[data-extra]").forEach(function (li) { li.hidden = !openAll; });
    globalMore.setAttribute("aria-expanded", openAll ? "true" : "false");
    globalMore.textContent = openAll ? "Show less" : "Show all (" + globalMore.getAttribute("data-count") + ")";
  }
  globalMore.addEventListener("click", function () { toggleGlobal(!globalOpen); });

  /* Filtres : catégories du JSON (plusieurs possibles dans une cellule, séparées par « ; ») */
  function filterButton(value, label, count) {
    return '<li><button type="button" class="nwm-filter" data-cat="' + esc(value) + '" aria-pressed="' + (value === active) + '">' +
      "<span>" + esc(label) + '</span><span class="nwm-filter-count">' + count + "</span></button></li>";
  }
  function buildFilters() {
    var counts = {}, names = [];
    all.forEach(function (d) {
      d.cats.forEach(function (c) {
        if (!counts[c]) { counts[c] = 0; names.push(c); }
        counts[c]++;
      });
    });
    if (!names.length) { return; }
    names.sort(function (a, b) { return a.localeCompare(b); });
    filterList.innerHTML = filterButton("", "All", all.length) +
      names.map(function (c) { return filterButton(c, c, counts[c]); }).join("");
    filters.hidden = false;
  }
  filterList.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button") : null;
    if (!b) { return; }
    var value = b.getAttribute("data-cat");
    active = value === active ? "" : value;
    filterList.querySelectorAll("button").forEach(function (x) {
      x.setAttribute("aria-pressed", x.getAttribute("data-cat") === active ? "true" : "false");
    });
    render();
  });

  function build(items) {
    all = items.filter(function (d) { return d.global || (typeof d.lat === "number" && typeof d.lon === "number"); })
      .map(function (d) {
        d.cats = d.category ? d.category.split(";").map(function (c) { return c.trim(); }).filter(Boolean) : [];
        return d;
      });
    buildFilters();
    render();
  }

  /* Interactions */
  svg.addEventListener("wheel", function (e) {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  var ptrs = new Map(), moved = 0;
  svg.addEventListener("pointerdown", function (e) {
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) { moved = 0; dragged = false; }
  });
  window.addEventListener("pointermove", function (e) {
    if (!ptrs.has(e.pointerId)) { return; }
    var old = ptrs.get(e.pointerId), cur = [e.clientX, e.clientY];
    var r = svg.getBoundingClientRect();
    if (ptrs.size === 1) {
      view.x -= (cur[0] - old[0]) / r.width * view.w;
      view.y -= (cur[1] - old[1]) / r.height * view.h;
      moved += Math.abs(cur[0] - old[0]) + Math.abs(cur[1] - old[1]);
      if (moved > 4) { dragged = true; }
      ptrs.set(e.pointerId, cur);
      apply();
    } else if (ptrs.size === 2) {
      var other = null;
      ptrs.forEach(function (v, id) { if (id !== e.pointerId) { other = v; } });
      var d0 = Math.hypot(old[0] - other[0], old[1] - other[1]);
      var d1 = Math.hypot(cur[0] - other[0], cur[1] - other[1]);
      ptrs.set(e.pointerId, cur);
      dragged = true;
      if (d0 > 0) { zoomAt((cur[0] + other[0]) / 2, (cur[1] + other[1]) / 2, d1 / d0); }
    }
  });
  function end(e) {
    ptrs.delete(e.pointerId);
    setTimeout(function () { if (!ptrs.size) { dragged = false; } }, 0);
  }
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);

  svg.addEventListener("click", function () { if (!dragged) { close(); } });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { close(); } });
  window.addEventListener("resize", place);

  root.querySelectorAll(".nwm-tools button").forEach(function (b) {
    b.addEventListener("click", function () {
      var r = svg.getBoundingClientRect(), z = b.dataset.z;
      if (z === "reset") { view.x = HOME.x; view.y = HOME.y; view.w = HOME.w; apply(); }
      else { zoomAt(r.left + r.width / 2, r.top + r.height / 2, z === "in" ? 1.6 : 1 / 1.6); }
    });
  });

  /* Chargement des données */
  fetch(DATA_URL)
    .then(function (r) { if (!r.ok) { throw new Error(r.status); } return r.json(); })
    .then(build)
    .catch(function (err) { console.warn("[carte] impossible de charger " + DATA_URL, err); });
})(
  "M195.6,16.4L764.4,16.4L789.5,27.7L809.2,37.7L819.9,43.6L830.8,50.1L841.6,57L852.3,64.4L862.7,72.1L872.7,80.2L882.3,88.7L891.4,97.4L900,106.5L908.1,115.7L915.6,125.2L922.6,135L929,144.8L934.8,154.9L940.1,165.1L944.7,175.4L948.7,185.9L952.2,196.4L955,207.1L957.2,217.7L958.7,228.5L959.7,239.2L960,250L959.7,260.8L958.7,271.5L957.2,282.3L955,292.9L952.2,303.6L948.7,314.1L944.7,324.6L940.1,334.9L934.8,345.1L929,355.2L922.6,365L915.6,374.8L908.1,384.3L900,393.5L891.4,402.6L882.3,411.3L872.7,419.8L862.7,427.9L852.3,435.6L841.6,443L830.8,449.9L809.2,462.3L789.5,472.3L765.5,483.1L764.4,483.6L195.6,483.6L170.5,472.3L150.8,462.3L140.1,456.4L129.2,449.9L118.4,443L107.7,435.6L97.3,427.9L87.3,419.8L77.7,411.3L68.6,402.6L60,393.5L51.9,384.3L44.4,374.8L37.4,365L31,355.2L25.2,345.1L19.9,334.9L15.3,324.6L11.3,314.1L7.8,303.6L5,292.9L2.8,282.3L1.3,271.5L0.3,260.8L0,250L0.3,239.2L1.3,228.5L2.8,217.7L5,207.1L7.8,196.4L11.3,185.9L15.3,175.4L19.9,165.1L25.2,154.9L31,144.8L37.4,135L44.4,125.2L51.9,115.7L60,106.5L68.6,97.4L77.7,88.7L87.3,80.2L97.3,72.1L107.7,64.4L118.4,57L129.2,50.1L150.8,37.7L170.5,27.7L194.5,16.9Z",
  "M382,478.5L381.7,479.4L372.3,479L378.5,478.8L380,478.1ZM217,477.9L207.6,476.9L215.6,477.4ZM404.5,476.3L406.8,476.8L408.7,478.5L393.6,479.4L391.3,478.7L394.6,478.4L398.6,476.3L401.8,476ZM268.5,470L272.8,470L271.4,470.9L268.8,470.8L266,469.8ZM260.8,470L258.6,469.6ZM304.5,467.5L308.4,467.5L310.4,468.5L302.3,468.4L298.5,467.4L301.8,467.4ZM357.4,465.8L358.3,467.9L352.4,468.4L352.7,467.8L347.3,467.7L346.6,467.1L348,466.4L351.2,466.2L349.5,463.2L349.9,462.4L351.3,462.1L356.3,465ZM367.1,452.5L363.5,452.8L361.4,453.9L361.1,455.3L362.9,456.8L360.3,457.4L358.4,459.6L358.6,460.3L364.7,462.7L369,465.4L374.1,470.3L369.6,472.7L360.5,474.5L349.3,474.6L356.7,476.1L350.1,476.7L350.8,477.6L356.2,478.7L386.2,481.2L433.1,478.8L430.9,477.7L421.1,477.9L420.3,476.6L431.1,474.6L449.9,472.5L452.9,471.6L453.3,471L451.4,470.6L451.9,470L458.3,468.3L461.6,466.4L466.8,467.1L467.7,465.8L472.3,466.7L478.8,466.3L479.6,467L494,463.9L497.2,464.2L499.4,465.6L504.3,464.1L507.3,464.9L514.9,463.9L518.8,464.3L520.5,465.4L528.8,465L538.1,463.5L542.3,461.4L550.1,463.7L557.1,461.5L568,459.8L577.5,456.9L583.2,456L586.4,456.3L589.4,459L593.6,460.3L599.2,459.2L607.4,460.3L607.1,462.7L602.3,464.7L602.1,465.4L604.1,465.3L600.6,467.4L603.5,468.1L605.7,467.8L613.8,463.9L621.3,463.2L625.7,461L634.3,458.8L641.8,458.7L645.8,456.8L646,458.3L647.3,458.7L658.2,459.2L665.8,458.9L675.1,455.5L678.5,458.3L686.6,457.8L694.8,456.1L696.7,457.8L703.2,458.9L711.5,457.4L721.3,457.9L733.9,456.8L736.9,454.9L737.4,455.5L735.8,458L736.9,458.3L752.1,458.2L752.5,458.9L751,459.6L751.4,460.2L754,461.1L759.3,462.1L763.5,461.5L765.6,463L769.3,463.4L769,464.1L770.6,465.2L780.1,465.6L784,466.6L784.3,467.1L782.9,467.8L775,470.3L767.3,471.4L757.9,474L755.2,476L757.9,476.6L757.5,477.1L748,477.6L741.1,479.4L752,481.6L767.8,482.2L764.4,483.6L195.6,483.6L192.2,482.2L192.9,481.8L251.5,482.3L233.2,481.5L232,480.3L224,479.5L234.5,479.7L239.7,478.8L222.5,477.5L215.7,476.3L212.5,474.9L225.6,475.5L232.3,474.3L229.6,472.8L233.1,473.1L245.9,471.3L270.9,471.6L281.6,470.4L286.4,471.9L307.5,472.7L307.6,472.1L302.1,471L297.4,468.6L312.1,470.2L322.5,469.8L322.8,468.5L331.3,470L338.3,470.6L339.3,469.5L347.6,470.8L359.1,469.3L361.2,468.4L361.1,467.7L355.6,463.6L355.8,461.4L353.9,459.1L354.2,458.2L359.3,453.5L367.7,450.5L369.1,451.1L368.8,451.8ZM335.8,427.5L342.6,429.7L342.2,431L340.3,431.2L338.8,430.2L338.6,431.3L337.2,432.1L334.8,431.8L327,429.2L319.6,424.8L328.9,428.1L329.2,425L330.6,423.9L333.7,425.5ZM352.4,420L354.6,421.3L354.3,422.2L351.7,423L350.4,422.1L349,423.3L347.4,422.1L349.4,420.4L351.5,421.1ZM635,416.2L631.5,416.3L633.3,413.1L636.3,414.3L636.1,414.9ZM821.9,389.8L823.4,390.9L828.5,390.1L822.3,397.2L822.1,396.4L818.9,398.5L817.2,398.2L820.6,389.6ZM886.6,390.2L886,391.5L888.7,390.2L887.2,392.8L879.3,397.7L878.8,399.1L874,400.3L867.4,405.2L862.4,407.4L857.6,406.1L861.5,402.9L875.1,396.7L887.1,388.9ZM902.2,375.3L901.4,378.6L903.1,376.4L903.5,377.3L902.1,379.7L903.2,380.7L907.8,380.1L902.8,384.8L901,384.7L892.6,391.4L889.7,392.6L889.4,391.3L893,388.8L893.6,387.1L892.1,385.8L895.7,383.6L899.5,379.2L900.6,376.5L901.1,370L902.2,369.8L902.3,371.6L903.6,372.4ZM909.8,328.6L908.5,329.4L905.3,325.1L904.6,321.5L905.7,321.5L909.1,327ZM945.3,311.8L945.9,312.8L944.8,314.6L941.7,314.7L942,313.1L943.4,311.9L944.5,312.4ZM948.5,309.9L946.6,310.6L946.7,309.3L951,307.3L950.5,309ZM9.7,308.9L9,307.3L9.5,307.2ZM918.8,308.7L917.8,309.2L917.7,306.7ZM918.4,303.3L918,306.2L916.9,305.9L917.4,302.2ZM611.7,298.5L611.9,306.1L611.4,307.1L610.7,305L610.1,306.1L610,310.2L600,338.1L595.4,340.4L592.2,338.3L591.7,336.5L591.3,328.2L592,325.7L593.3,325.1L594.9,321.3L595.3,319.1L594.7,312L596.3,307.8L601.3,306.3L605.2,302.1L606.2,300.4L605.9,298.8L607,299.3L609.8,293.1L611.2,296.1ZM857.6,299.2L857.9,302L859.9,300.6L861.4,303.5L860.7,305.1L860.2,317.5L865,322.4L864.4,323.3L865.1,325.5L864.7,329.2L866.1,328.4L866.5,329.9L867.4,329.4L866.4,333L868.9,339.2L868.4,341.9L866.4,346L866.2,348.8L858.4,360.6L844.4,373.7L840.1,379.3L838,380.4L835.2,380.5L827.9,384.4L825.7,382.4L827.2,380.8L821.9,383.7L816.4,381.2L816.1,379.2L817.5,375.2L817.1,373.9L815,373.5L816.6,371.9L817.4,369.6L815,371.8L812.5,372.4L817.9,367.1L819,364.7L813.4,368.6L811.1,371.2L809.9,369.9L810.9,368.1L809.9,364.5L810.8,363.8L805.3,360.1L800.7,360.4L793.6,362.7L791.4,362.5L785.5,364.9L782.7,367.9L773.3,368.2L767.1,371.7L763.7,371.6L761.1,368.9L762,367.1L764.1,365.9L766.4,360.5L766.5,357.2L767.6,353.4L767.4,342.1L768,343.6L768.2,340.4L769.4,342.7L770,341L769.4,336.2L774,327.2L773.4,329.8L775.2,327.4L781.6,323.5L783.4,323.7L788.8,320.9L793.2,320L798.2,314.8L799.1,311.5L801.6,308.5L802,311.5L803.3,310.8L802.8,309.2L804,307.5L805,308.2L805.9,305.6L810.2,300.8L811.3,301.3L811.5,300.4L814.1,299.4L816.8,303.1L820,303.5L819.9,301.5L823.1,297.8L822.8,296.9L824.3,294.9L826.2,293.6L827.4,294L829.8,293.4L830,291.5L828.3,290.4L829.8,289.8L832.5,292.2L834.6,293.1L835.4,292.7L836.9,293.8L840.3,292.4L841.2,294.2L838.8,297.5L837.9,297.6L837.9,299.1L835.4,303.6L841.3,309.9L843.1,310.8L843.2,311.9L845.4,313.1L847.5,311.9L851.7,303.7L852.2,299L855.7,289.5L856.9,288.2L857.9,297.9ZM908.9,287.6L909.4,288.8L907.5,288.8L906.9,286.6L908.4,287.4ZM799.5,286.7L798.3,286.8L795.1,284.3L797.7,283.6L799.7,285.7ZM905.9,285.4L902.8,284.5L903.2,283.1L905.6,284.4ZM908.3,284.4L907.7,285.1L906.3,282L906.1,279.8L907,279.8L907.5,282.7ZM809.4,286.3L806.7,286.7L808.5,283.3L811.7,281L816.9,279.7L817.8,280.1L811.4,283.7ZM792.9,279L793.8,280L795.4,279.7L795.9,281.2L789.5,282.4L790.6,280.3L792.1,280.3ZM806.2,279L805.6,281L801.5,282L798,281.6L798.1,280.3L800.3,279.5L801.9,280.6L803.7,280.3ZM904.2,279.9L904.2,280.6L902.3,279.1L900.2,276.6L900.6,276.3L903.7,278.8ZM898.5,276.4L896.8,275.7L896.1,273.7L897.5,275.2ZM768.7,274.3L773.8,274.7L774.5,273.2L779.3,274.9L780,277.2L783.9,277.9L787,280L783.8,281.4L781,279.9L775.9,279.8L770.5,277.8L767.5,277.9L762.8,276.4L762.4,274.8L760,274.6L762.1,271.2L765.3,271.4L768.4,273ZM838.3,272.3L836.7,274.7L836.7,272L837.9,269.5L838.4,270.6ZM894.3,274.5L893.5,274.8L892.5,273.5L891.2,268.4L891.6,268.1L894.8,273.5ZM884.4,269.7L879.5,272.7L878.1,272.7L874.6,270.6L874.9,269.5L878.7,269.8L879.6,268L879.7,269.9L881.3,269.6L883.7,267.1L883.6,265L885.7,265.5L885.5,267.5ZM819,262.4L818,263.6L816.2,263L815.7,261.4L818.4,261.2ZM827.7,261.1L828.5,263.9L826.3,262.4L820.8,262.2L821.5,260.2L824.8,260.1ZM887.8,266.2L886.9,267.1L886,263.6L881.5,259.8L882.3,259L883.7,260L887.6,264.3ZM837.7,254.1L838.3,259.9L840.9,262.1L843.3,258.3L846.4,256.1L848.8,256.1L853,258.7L865.1,263.9L868.2,267.5L868.4,269.6L872.7,271.8L873.1,273.7L870.6,274.1L871,276.5L873,278.8L874.2,282.6L875.8,282.5L875.4,284.1L877.4,284.7L876.5,285.4L879,286.9L878.6,287.9L876.8,288.2L876.3,287.2L871.5,286.3L868.6,282.1L867.6,278.9L864.4,277.4L860.2,279.6L860.2,282.2L857.9,283.4L853.8,282.7L851.8,279.8L849.2,279L848.5,280.1L845.1,280.2L846.6,277.3L848.3,276.3L847,269.4L842.1,266.3L839.9,266L836.1,262.7L835.2,264.5L834.2,264.8L833.7,261.9L831.8,260.1L834.7,258.8L836.6,258.9L836.4,258L832.5,257.9L831.5,255.8L829.1,255.1L828,253.4L831.6,252.5L833,251.3L837.3,252.8ZM813.9,244.9L811.8,248.5L809.8,249.2L807.3,248.5L800.5,249.1L800.1,251.9L802.4,255.1L803.9,253.4L808.9,252.2L808.7,253.9L807.5,253.3L806.3,255.4L803.9,256.8L806.3,261.4L805.8,262.7L807.9,266.8L807.8,269.2L806.3,270.2L805.3,269L806.8,266L804.1,267.4L803.5,266.4L803.9,265L802.1,262.9L802.4,259.4L800.6,260.5L800.4,269.8L798.7,270.4L797.6,269.3L798.6,266L798.4,262.6L797.3,262.5L796.5,260.1L800.1,248L802.3,245.3L804.4,246.4L810.9,246.7L813.4,244.1ZM823.1,245.9L823,249.1L821.7,248.7L821.2,250.9L822.3,252.8L821.6,253.2L820.5,251L819.7,246.4L820.2,243.5L821,242.2L821.3,244.1L822.9,244.5ZM761.5,271L758.5,271.1L753.2,265.2L747,252.3L744.7,249.3L742.9,243.4L740.4,241.2L738.9,238.1L733.9,232.2L733.6,230.3L739.4,231.2L748.3,242.5L751,242.5L753.3,245L754.9,248L756.9,249.6L755.8,252.6L758.3,253.9L759.6,258.4L761.5,258.7L762.8,261L761.9,265.5ZM794.3,243.4L797.3,246.8L794.2,247.2L793.3,249.6L793.4,252.9L790.8,255.3L789.4,264.4L789,263.1L785.9,264.7L785,262.6L783.1,262.4L781.8,261.2L778.6,262.5L777.7,260.8L773.7,260.5L773.5,255.7L772.2,254.7L770.9,251.7L770.8,245.2L772.3,242.8L774.3,244L776.4,243.4L776.8,240.3L781.1,238.9L785.1,232.4L789.1,228L790.2,225.2L791.3,225.1L792.8,227L793,228.5L797.1,230.6L797,232L795.3,232.2L795.9,233.9L794,235.1L792.6,238.4L794.7,241.8ZM815.3,219.8L816.2,224.2L815.6,227.5L814.3,223.8L813.2,225.6L814.3,228.3L813.6,230L810.3,227.9L809.4,225.3L810,223.6L808.2,221.9L807.5,223.4L806.2,223.2L804.4,225.2L803.9,224.2L804.6,221.2L807.5,218.8L808.6,220.4L810.5,219.5L810.8,217.9L812.6,217.8L812.1,215L814.5,216.7L814.9,218.5ZM696,227.8L693.7,228.6L692.3,225.7L691.5,220.6L692.2,214.8L694.2,216.8L697.2,223L697,226.7ZM318.7,213.8L316,213.8L316.9,211.5L319,211.1ZM808.1,213.2L806,217.7L804.1,215.2L805.1,213.2L805,211L806.5,210.8L806.4,213.2L807.8,209.8ZM794,216.6L790.9,220L791.9,217.5L794.8,212.8L795.7,209.3L796.6,212.2L795.1,214.2ZM801.7,207.4L803.4,208.5L805.1,208.5L805.3,210L802.8,212.6L802.4,209.1ZM811.1,206.5L812.4,210.4L810.3,209.5L811.5,212.9L810.3,213.7L809.9,211.2L809,211L808.3,208.8L809.9,209.1L809.6,207.8L807.6,205.1L810.1,205.2ZM800.1,203.3L799.9,206.3L796.6,201.9L798.9,202ZM795.5,184.1L797.4,185.1L797.9,184.2L799.8,189.1L799.8,192L798.5,193.2L799.8,198.8L802.3,198.8L806,200.7L807.1,205.1L803.4,201.5L803,202.8L800.9,200.7L798.6,201.3L797.2,200.5L797.7,198.1L796.8,197.3L796.7,198.6L795,196.5L793.5,191.6L794.8,192.8L793.9,184.1ZM309.3,185.1L308.5,186L305,186.1L305.5,184.1L308.9,184.4ZM279.7,186.4L278.8,186.9L276.1,185.1L277.7,184.1L280,184.5L281.5,186.3ZM292,179.4L294.1,179.9L296.6,179.3L298.7,180.1L299,181.4L300.4,181.3L300.2,182.3L302.4,183.8L301.2,185.2L298,184.4L296.5,185.2L296.2,184.4L293.9,187.3L293.3,185.7L291.6,185.1L287.5,185.8L286.3,184.7L286.7,183.6L290.9,184.3L292,183.6L291,182L291.2,180.7L289.7,180.2L290.4,179.2ZM766.8,183.5L764.9,185.2L762.6,184.1L761.8,181.1L762.7,179.5L766.8,178.6L767.7,180L766.9,181.5ZM76.2,182.1L75.6,182.7L75.1,182.2L76.7,178L78,178.9L78.5,180.6L77.2,181.6ZM76.6,176.7L75.7,176.9L75.3,175.7L77,176.3ZM75.5,174.8L74.3,174.7ZM73.4,174.3L72.2,174.4L72.1,173.4L73.1,173.2ZM69.9,172.1L68.9,171.8L70.2,171.2ZM275.5,169.4L276.2,170.6L278.7,170.2L282.6,174.7L284.8,175.4L284.5,176.4L286.4,176.5L288.1,177.9L285.8,179.2L278.6,179.4L280.6,177.5L278.1,176.3L277.2,173.4L275.7,173.5L272.8,171.9L269.6,171.3L268.8,170.7L270,169.8L267.5,169.6L263.6,172.3L261.3,172.3L266.4,168.6L269.1,167.9L273.3,168.2ZM281.7,165.9L281,166.1L280,163.1L281,161L281.8,161.1L282.1,163.9ZM791,169.3L790.8,172.1L787.5,166.6L789,160.7L790.6,161.7L790.8,163.8ZM283,156.3L280.2,156.9L280.3,155.6L283.2,155.4ZM285.1,156.3L284.1,158.7L283.5,154.8ZM809.1,131.2L810,132.3L809.6,134.3L808.1,133.3L807.2,134L807.5,135.9L805.5,135L804.7,133.4L805.1,131.5L806.6,131.9L806.9,130.5ZM563.8,126.3L562.4,127.7L562.8,128.5L560.4,129.8L558.4,128.1L561.8,127.3ZM537.4,126.2L538.9,127.3L543.9,127.5L543.7,128.4L540.2,128.7L537.1,127.6ZM517.1,118.2L516.4,123.3L509.8,120.1L510.1,118.5L515.3,118.4ZM501.6,108.9L503.1,111.1L503,115.2L501.9,115L501,116L500,115.2L499.2,109.7L500.5,109.8ZM819,121.6L819.6,124.1L821,125.8L821,128L818.8,129.5L814.6,129.7L813.1,133.4L810.8,132.2L809.4,129.8L805.5,130.5L803.4,132L800.6,132.1L804.3,134.5L805.4,140L804.4,141.4L802.6,140.1L801.8,137.2L797.7,134L799.5,133L799.8,130.9L801.3,129.3L801.9,127.1L806.2,126.1L809.2,126.8L808.4,121.1L810.9,122.6L813.1,118.2L812.2,114.4L809.4,110.9L809.1,108.9L811.2,108.4L815.4,112.7L817,115.2L816.9,118.3ZM502.3,106L501.6,108.4L500.5,107.7L499.9,105.7L501.8,103.4ZM810.8,99.9L812.9,100.5L813.6,99.3L816.7,102.6L813.9,103.5L814.1,106.5L808.9,104.4L810,107.7L807.5,107.8L805,104.8L804.5,102.4L806.8,102.3L803.2,95.8L808.3,98.9ZM336.1,92.9L339.8,93.2L337.3,94.6L334.9,93.3L334.7,92.4L335.9,91.5ZM343.1,85.5L339.4,84.7L337.9,83.4L341.4,83.8L343.2,85ZM205.1,87.2L203.6,87.6L201,86.3L200.2,83.5L198.3,83L199.4,80.9L204,82.2L204,84.5L205.3,85.7ZM357.2,81.1L354.9,83.6L356.7,82.6L357.9,83.2L356.8,84.2L361.7,85.1L360.3,87.2L362,86.7L361.9,90L360.2,92.6L357.8,92.1L359.1,89.8L358.5,89.4L355.1,91.9L353.8,91.8L355.8,90.5L353.9,89.7L347.1,89.8L347.1,89L348.9,88L348.2,87.2L354.6,81L358.8,78.5L359.7,78.6L359,79.4ZM198,72L200.2,71.8L196.7,74.8L196.7,77L195.8,77L195.6,73.7L197.3,71.7ZM794,80.9L800.8,85.9L796.7,85L798.9,89.1L803.6,92.1L805.3,94.1L802.1,92.3L802.5,94.6L790.3,80.4L786.5,77.7L783.1,74L783.8,72.8L781.7,71.5L782.3,71.2L790.5,78.2ZM465.3,76.8L461.4,78.4L458.4,78L460.3,75.2L459.4,72.4L464.1,69.2L465.8,69L468,70.7L466.8,72.5L467.1,74.4ZM506.6,67.9L505.5,70L503.2,68.5L502.8,67.5L505.8,66.6ZM163.9,64.1L160.7,65L160.4,64.4L161.5,63.2L166,61.9L167.2,62.1L167.1,62.9ZM473.9,60.3L471.6,63L476,62.6L475.4,64.7L473.5,67L475.6,67.1L477.6,70.5L479.1,70.9L481,75L483.6,75.5L483.4,77.2L482.3,78L483.2,79.4L481.2,80.9L474.5,81.6L473.5,81.1L472.1,82.4L470,82.1L468.5,83.1L467.3,82.6L470.6,79.7L472.6,79.1L469.2,78.6L468.6,77.5L470.9,76.7L469.8,75.2L470.2,73.5L473.4,73.7L473.7,72.2L472.3,70.5L469.8,70L469.3,69.3L470.1,68.2L469.4,67.5L468.3,68.7L468.2,66.2L467.3,64.9L469.8,60.3L471.4,60.5ZM147.1,57.2L145.3,57.6L144.3,56.5L148.1,56.3ZM324.2,52L321.8,53L322,52.1L324,51.5ZM319.9,50.7L316.7,52L315.4,51.9L315.4,51.3L317.6,50.3L320.3,50.3ZM148.1,48.3L152.3,49.4L149.6,50.1L148.7,49.2L146.6,49.2ZM318.6,44.3L318.2,45.3L319.4,44.9L323.3,46.9L322.7,47.9L324.2,47.7L325.1,48.5L322.8,49.2L320.2,48.6L319.9,47.6L313.4,50L313.8,48.7L311,48.9L313.5,47.8L317.4,44.2ZM452.7,42.7L452.1,44L454.1,45.4L451.4,47.1L443.8,49L436.1,48L438.2,47L434.2,45.9L437.7,45.5L437.8,44.9L433.9,44.4L435.5,43.1L438.4,42.8L441,44.2L444.1,43.1L446.4,43.6L449.6,42.5ZM338.5,41.3L336.3,41.4L338.2,39.3L341.2,39.6L340.1,40.7ZM151.6,42.4L152,42.9L154.1,41.5L158.6,41.8L159.1,43.7L152.3,44.8L147.3,47.3L145.6,47.3L143.9,45.9L145,45L141,44.9L143,43.4L139.9,43.9L136.4,45.8L150.7,37.8L153.9,41.2ZM305.3,37.5L303.5,38.2L298.3,37L302.5,35.6L304.9,36.8ZM802.9,34.4L799.7,33.9L800.6,33.2ZM159.7,34.3L157.1,34.4L159.8,33.1L162.3,33.9ZM315.3,36.8L313.5,38.7L317.3,37.2L318.4,38.4L316.5,39.9L317.1,41.2L323.1,38.1L325,36.1L329.9,36.5L331.6,37.4L328.7,39.4L329.1,40.4L328.1,41.4L323.3,42.8L320.4,43.1L319,42.5L313,46.2L304.4,48.7L303,50.2L300.5,50.4L292.4,54.9L287.8,59.5L290.5,59.9L289.3,64.1L292.5,63.6L295.6,64.7L297.7,66.9L301.4,68.7L306.9,69.1L304.3,74L304.1,77.1L306,79.7L308.1,78.8L310.8,76L312,71.7L311.3,70.4L315.4,69.1L321,65.5L321.8,63.9L321.7,61.7L320.4,59.9L324.4,57.3L326.7,51.6L328.5,51.1L333.3,51.9L335.3,51.3L338.2,53.4L338.2,54.3L341.7,54.5L339.4,59.5L341,59.9L341.7,61.3L345.4,60L350.7,56.2L353,64.4L351.4,66L354.7,69L358.8,70.5L358.7,72.7L360.2,73.1L360.7,74.1L359.7,77.1L351.8,80.1L348.2,82.3L334.2,82.4L328.2,85.6L319.7,92.1L321.8,91.6L326.9,87.8L332.6,85.5L336,85.2L337.4,86.6L334.6,88.5L334,93.8L336.4,95.3L340.3,94.8L343.7,91.6L343.1,93.7L344.2,94.7L332.4,99.6L329.1,101.8L327.4,101.6L328.2,99L333.1,96.6L326.7,97L326.7,98L318.3,101.4L315.1,105.4L315.3,107.1L316.2,107.1L316.4,106L316.9,106.7L316.4,107.6L306.8,109.7L310.5,109.2L311,109.8L307.3,110.7L306,110.3L305,111.2L305.7,111.3L304.4,113.5L301.8,115.9L300.9,114.2L300.9,117.6L297.5,121.4L298.8,119.1L298,117.9L298.6,115.3L297.5,118.6L296.1,118.2L297.4,119.1L296.3,126.7L294,129.1L286.1,133.3L278.5,140.1L277.2,144.7L277.6,155.3L275.5,161L273.5,161L272.6,158.7L271.4,151.9L272.5,149.7L272.3,147.8L270.3,144.5L267.4,146.1L264.9,143.5L257.9,143.8L256.7,144.3L256.8,147.2L254.2,147.8L252.5,147.7L251.1,145.9L245.6,145.8L237.3,150.5L234.4,153.6L233.5,158.7L230.5,164.2L228.5,172.3L228.8,176.7L230.8,183L233.4,183.9L234.2,185.4L242.5,182.8L244.5,181.4L246.9,175.4L251.8,173.7L255.6,173.6L255.7,176L252.9,180.1L253.2,180.8L251.4,185L250.4,184.1L249.1,191L247.2,193.3L249.2,194L249.9,193.4L252.4,193.8L257.6,192.9L261.3,195.5L261.9,196.4L261.5,198.9L260.3,201.5L258.5,210.2L262.1,217.8L265.4,218.2L269.2,215.6L272,216.2L274.9,218.9L276.2,219L279.5,216.2L280.4,212L282,210.3L283.7,210.2L284,209.5L286,209.8L290.8,205.5L292.3,206.7L291.5,208.7L290,209.1L290.5,212.6L289.2,214.6L290,217.5L291.1,217.2L291.9,214.7L291.2,213.4L291.3,210.7L294.7,209.3L294.5,207.6L295.5,206.5L296.2,209L298.1,209L299.6,211L299.6,212.2L304.8,211.9L306.2,213.5L308.2,213.9L309.9,211.9L316.4,211.6L314,212.7L314.8,214.4L316.9,214.6L318.8,216.4L319.1,219.2L320.5,219.2L323.1,221.3L324.7,223.6L324.6,225.5L325.6,225.6L328,228.6L331.2,229.3L331.5,228.6L333.6,228.4L336.5,229.3L339.3,230.6L342,233.6L342.4,235.1L343.3,234.9L345.3,243.2L346.8,243.8L346.8,246.2L344.8,249.2L345.6,250.3L350.3,250.8L350.5,254.4L352.5,252.1L360.3,255.6L361.6,257.7L361.2,259.7L364.3,258.6L369.5,260.5L373.5,260.3L377.4,263.3L380.9,267.3L385.3,268.5L386.2,269.6L387.7,276.3L386.9,282.3L382.1,289.5L378.8,296.6L378.1,296.7L377.6,299.3L378.2,305.9L377.7,313.6L377,315L376.9,319.7L374.7,324.2L374.6,327.8L372.7,329.3L372.3,331.4L369.5,331.3L365.6,332.7L364,334.2L361.3,335.2L358.6,337.9L356.9,341.3L357.3,350.7L355.9,352.6L354.1,358.4L351,362.6L350.5,365.7L348.7,369.6L346.3,371.4L343.1,371.1L340.5,369.7L338.9,369.8L337,368L337.2,369.7L341,372.5L341.2,374.7L343,376.1L343.3,377.6L342,381.7L338.9,383.4L331.6,383.7L333.7,389.5L332.7,390.6L330.4,391L327.8,389.9L327.1,390.7L328.4,393.7L330.3,394.6L331.3,393.7L332.5,395.2L330.7,396.2L329.4,398.1L330.2,402.7L328,402.7L326.8,404.2L327,406.4L330.1,408.5L332.4,409.1L332.7,411.7L330.7,413.3L330.7,416.6L329.1,417.7L328.8,419L333,423.5L330.1,423.3L327.9,424.9L328.8,427.4L327.9,427.5L318.2,423.2L311.9,413.2L311.6,410.5L313,408.2L309.2,407.4L310.2,404.8L309,399.9L312,400.9L310.8,394.7L308.9,393.9L309.6,397.7L308,397.2L305.8,387.2L306.2,385.1L303.1,378.4L304.1,378.3L303.8,363.1L302,358.2L302.1,355.5L300.8,351.4L301.3,347.3L299.3,325.9L296.9,315.3L294,313.3L293.6,311.9L280.5,302.3L279,299.4L279.3,298.4L268.1,275.8L263.9,272L264.7,270.4L263.3,267L264,264.5L267.4,259.5L266.8,258L265.8,259.6L264.2,258.1L264.7,257.1L264.2,253.8L265.1,253.3L266.4,247.2L269.7,245L269.4,243.9L270.4,243.7L271,240.6L272.3,240.3L274.5,236.2L273.6,235.3L274.2,233.2L273.7,230L274.3,229L274.1,226L271.8,221.1L272.6,220.2L270.3,217.7L269.1,218L266.4,221L267.5,222.9L265.1,224.1L264.8,222L263.6,222.4L263.1,220.9L260.3,220.3L260.1,221L258.5,219.7L258.3,217.6L255.8,215.5L255.1,213.9L254.5,215.7L253.2,214.4L253.5,211.5L252.8,211L253.5,210.3L249,203.8L250,203.6L249.7,202.5L247,202.9L241.8,200.3L240.1,200.2L235.4,194.3L232.3,192.2L227.1,194.1L216.9,188.8L214.5,186.2L210.7,184.9L207.6,181.3L206.8,179.1L206.6,177.4L207.5,177.1L208.6,174L208.2,171.1L204.1,161.1L202.4,159.7L203.2,156.8L201.3,154.4L201.4,152L200.2,151.7L198.8,148.3L199.3,141L198,139.7L196.1,138.9L194.2,144.3L197.6,156L197.5,164.1L198.7,164.2L199.5,167.9L197.6,169.2L197.5,167.1L194.1,162.6L195.1,158.3L190.9,154.4L190.2,152.5L191.4,152.4L193.4,149.6L191.3,146.3L191.7,134.8L190.9,132.9L190,132.5L190.1,131.6L185.9,129.7L186.5,119.6L185.7,115.9L186.8,113.4L186.6,111.7L190.2,106.5L190.9,104.1L197.9,95.9L201.7,88.2L202.4,87.6L204.9,88.6L204.1,91.3L205.2,90.5L207.6,85.8L204.6,81.9L201.6,80.7L202.4,78.3L204.2,76.6L202.5,75.4L204,73.3L203.2,71.4L204.5,70L203.2,68.2L204.8,66L204.3,63.9L205.6,61.6L200.7,61.3L199.1,60.6L197.7,58.1L193.8,56.8L190.8,57L187.1,54.9L184.2,55.4L182.6,57.1L172.7,59L178,55.3L181.3,54L168.6,58.6L168.6,59.7L164.5,61.5L149.2,66.9L130.9,71.1L155.5,62.9L161.1,59.6L155.5,60.8L155.7,59.6L154.1,60.5L154.9,59.2L150.3,60.2L153.6,57.9L153.5,57L150.2,57.5L149.5,55.8L151.4,54.5L151.3,53.5L154,52.2L159.8,49.7L162.4,49.9L169.2,48.4L170.3,47.4L169.8,47L172.5,46.2L167.2,47.1L163.4,46.9L161.4,46.4L161.9,45.5L161.4,44.3L171.3,42.4L172.9,42.4L171,43.5L175.1,43.4L175.6,42.1L174.5,41.4L174.4,39.5L172.9,38.9L188,35.3L200.7,33.5L202.8,33.8L202.7,34.6L220.6,35.6L230.1,37.9L245.6,35.5L245.8,36.3L249.3,35L250.3,35.2L251.2,36.8L255.2,35.6L253.6,37L259.7,36.2L264.9,37.7L269,37.9L270.4,38.8L266.6,39.8L276.7,39.7L277.4,40.8L280.5,39.8L279.5,39L281.4,38.4L285.4,38.1L287.2,39.6L289.4,39.4L291.8,40.3L297.6,40L298.6,38.8L300.6,38.5L302.8,39.2L301,41L303.7,39.4L305.1,39.5L307.8,37.6L305.6,35.7L307.7,33.7L311.1,32.5L314.2,33.5L314.7,35.5L312.2,36.4ZM280,30.6L278.2,31.3L282.7,30.8L284.1,31.6L287.1,30.8L288.1,31.3L287.6,33L289.3,32.3L290.1,30.6L293.3,30.6L294.5,31.3L292.9,34.1L297.3,35.8L296.3,36.6L293.1,36.8L293.5,37.5L292.2,38.2L286.6,37.4L271.7,38.6L271.8,37.7L268,37.4L267.6,35.9L277.4,35.2L267.9,34.9L267.7,34.2L272.8,33.6L267.4,33.1L272.6,31.2L278.6,30.2ZM297.5,30.1L294.7,31.1L293.3,30L296.6,29.7ZM346.2,30.6L339.8,31.1L338.6,30.2L339.2,29.7L344,29.7ZM328.4,30.5L328.8,31.5L331.7,30.2L336.7,29.6L338.2,31.2L337,32.3L343.2,31.1L348.1,32.8L347.8,33.5L351.4,33.1L352.4,34.2L357.3,35.6L357.8,37.4L353.8,38.2L359.9,39.9L361.4,41.7L364.3,41.9L358,45.7L354.5,42.8L351.9,43.1L350.9,44.3L354.5,47L354.5,49.2L352.9,50.8L347,48.4L349.8,51.7L349.6,52.5L341.5,50.3L339.8,49.2L340.9,48.6L336.7,46.4L336.3,47L330.5,47.4L329.4,46.6L331.8,45.1L339.5,44.8L339.4,44L340.8,43L344.7,41L344.6,39.5L339.3,37.9L340.8,37.4L339.8,36.3L337.4,35.6L332.5,36.3L326.2,35.9L319.3,34.5L321.9,33.7L319.4,33.7L320.5,32L323.3,30.5L330.7,29.5ZM305.5,29.4L310.5,29.6L308,30.8L309.9,31.5L308,33L302.8,33.5L299.3,31.5L303.3,31.2L302.6,30.2ZM731.3,30.4L724.4,30.2L727,29.4L730.5,30ZM316.2,31.1L311,32.3L312.3,30.1L316.1,29L322.6,29.4L318.6,30.8ZM265.2,33.4L259.4,34.3L259.4,33.5L256.5,32.6L264.1,29.7L263.7,28.7L269.9,28.5L276.3,28.9L278.4,30L266.1,32.7ZM738.9,27.6L735,28L730.8,27.5L734,27.2ZM319,27.7L317.5,28.3L313.4,27.8L317.9,26.8L318.9,27.3ZM728.1,26.9L728.5,28L719.8,28.3L714.9,27.3L714.3,26.4L720.7,26.2ZM313.4,25.3L314,26L311.2,27.7L306.6,27.6L307.6,26.8L304.7,26.9L305.9,25.8L313,25.5ZM296.1,26L299.6,26.3L297.2,27.7L285.9,28.6L283.3,28.6L283.7,28.1L288.1,27.5L278.1,27.4L284.3,25.7L293.3,27L292.6,25.7L296.3,25.4ZM583.3,34.6L576.4,34.5L571.9,33.3L571.2,32.4L572.8,32L572.2,31.1L574.9,29.8L573.1,29.6L576.5,28.2L575.6,27.6L583.9,26L595.1,25.1L596.7,25.6L581.2,28.7L577.8,31.8L579,33.2ZM320.4,24.9L325.1,25.3L326.1,25.7L325.2,26.2L327.6,26.8L338.8,26.6L342.8,27.2L342.6,27.8L338.3,28.5L327.5,28.6L320.8,27.9L321.6,26.5L315.8,25.3L317,24.8ZM285.1,24.2L281.6,25.6L275.9,26.2L271,26.1L282.5,24.4ZM660.5,25L661.8,25.7L667.9,25.4L674.6,26.5L675.2,27.2L669.6,28.9L676.3,29.2L678.4,30.2L681.2,29.6L696.2,30.8L694.6,29.6L701.4,29.9L705.5,30.7L707.7,31.7L707.7,32.4L711.8,33.8L715.6,34.5L714.8,32.7L718.7,33.4L729.2,33.2L725.5,31.7L726.8,31L744.4,32L754.4,34.4L765.1,34.3L773,36.9L785.1,36.6L791.2,38.3L792.4,37.7L788.1,35.7L798.4,36.1L809.3,37.8L823.6,45.8L822.7,46.7L820,46.6L829.6,50.1L831.8,51.6L827.3,51.1L823.2,53.1L821.8,56.2L822.6,57.3L817.4,55.6L814.8,57.5L812.6,56.6L812.1,57.6L809,57.3L810.5,58.9L811.1,61.3L815.6,62.8L819.9,66.5L818.1,66.6L819.8,68.8L822,69.9L819.9,71.2L822.6,74.2L820.1,74.9L822.5,77.7L822,80.2L806.4,68.5L803.2,64.9L803.1,63.4L801.8,62.3L804.3,61.7L804.1,56.2L805.1,54.3L802,51.1L799.9,51.3L801.4,53.1L799.9,55.7L794.4,52.8L790.3,53.6L790.6,57.6L794.1,59.1L787.6,59.9L785.5,58.2L781.9,57.8L780.9,59L774.2,58.6L768.4,59.3L765.4,70.2L769.1,70.5L774.4,72.8L774.4,71.4L776.9,71.6L782.9,74.5L785.2,76.8L786.1,79.6L791.9,87.4L792,91.6L792.9,93.6L791.7,102.2L789.9,104L788.4,104L786,102.6L784.4,104.8L784.7,105.8L783.7,105.6L783.4,106.6L784.8,109.9L781.9,113.4L782.5,115.1L785.9,117L791.9,122.7L793.9,126.4L794,128.2L790.8,130.2L788.8,130.4L786.8,126.3L784,122.9L785.5,122.4L782.3,119.7L780.8,119.1L780.3,119.9L778.2,118.5L778.4,116.8L777,114L773.8,112.8L771.1,113.8L770.1,115.2L768.1,116.1L768.5,114.6L767.3,113.4L768,111.3L765.8,109.7L762.9,112.9L762.6,115L760.4,115.1L759.9,116.6L762.3,118.7L764.6,119.2L765.4,120.6L767.8,121.6L769.3,119.3L773.7,120.6L774.9,122.3L772,123.2L771.8,124.9L770.2,126.5L770.1,128.8L773.5,130.5L781.7,139.2L782.7,141.7L781.5,142.6L784.8,145.4L785.9,150.8L784.6,151.1L782.7,163.2L777.5,169.3L774.7,169.7L773.5,171.2L772.3,170.1L771.4,171.8L765.7,174.1L765.7,177.7L764.3,177.9L763,175.4L763.3,174.1L759.5,173L755.8,176.5L754.4,179.8L754.4,182.2L760.5,190.5L765.4,195.5L767.7,202L768.3,208.2L766.4,210.6L763.7,212.9L758.9,219.2L757.7,216.9L758.2,214.5L756,212.4L753.7,211.9L750.6,206.4L748,204.8L745.8,204.8L745.8,202L743.4,202.1L743.8,206L742.5,214.3L743,216.9L744.7,217L746.8,223.3L754,230.2L755.2,232.6L755.9,240L756.8,241L757.9,245.4L756,245.6L750.2,240.1L746.6,230.9L746.1,226.8L741.3,219.9L741.1,222L740.4,220.1L740.9,209L739.7,206.9L739.4,203.1L738.1,201.2L735.4,192.6L733.7,189.6L729.8,193.9L726.5,192.8L726.6,188.4L725.5,185.1L722.7,181.1L722.7,179.9L721.1,179.4L718.7,176.6L714.7,169.4L712.3,169.2L712.4,172.6L709.1,171.8L709,173.1L704.2,173.7L704.9,176.3L703.9,178.4L700.6,180.7L698.4,184.8L694.6,189.3L694.8,191L690.3,193.3L689.9,196L691.5,203.5L690.7,206.9L691.3,212.9L689.9,213.1L689,215.8L689.9,217L687.5,218L685.8,221.4L683.1,218.1L680.1,209.5L677.3,204.4L675.4,197.8L672.5,192.9L667.3,174.2L663.9,176.3L662,175.9L657.9,171.7L659,170.4L658,169.1L652.4,165.3L648.7,160.2L636.6,161.4L625.8,159.2L624,155L622.7,154.4L618.5,156.7L615.3,155.5L612.3,152.9L609.7,152L604.9,144.4L603.7,144.9L601.9,143.8L601.2,145.1L599.7,144.9L601.5,149.7L603,152.6L606.9,156L607.2,158.5L609.5,162.5L609.4,158.3L610,157.9L611,159L611,163L612.4,165L618,164.7L622.8,156.9L623.7,162L625.2,164.3L630.3,166.6L633.7,170.9L631.3,177.4L630.1,177.2L629.6,178.1L629.9,182.6L628.7,182.6L627.2,183.9L626.6,186.3L625,186.3L624.1,187.2L624.2,188.6L617,191.6L616.7,194.3L610.1,197.5L608,200L606,199.9L604.6,201.4L600.1,202.5L598.6,204.6L594.6,204.8L591.7,195.7L592.1,193.2L591.4,190.2L587.1,183.5L586.2,180.7L583,177.7L581,174.4L580.3,170L578.5,166.2L575.7,164.1L573.8,159.6L568.4,151.3L567.1,151.3L567.3,146.5L565.5,152.7L563.2,150.1L560.9,145.3L566.5,157.8L571.2,165.4L571.1,168.2L574.9,172L577.4,183.7L580,185.9L582.8,193.2L593.5,204.6L594.2,207.1L592.8,208L594.9,209.6L596.7,212.6L598,212.6L610.1,209.1L614.9,207L615,211.9L611.4,225.6L607.1,234.8L604.1,239.7L595,248.9L590.9,256L587.3,259.2L585.5,265.6L584.4,266.8L583.2,273.2L584.8,274.5L584,280.4L587,288.6L587,302.5L584.9,307.4L583.1,309.6L577.5,312.7L570.1,320.3L569.7,322.8L571.5,328.3L570.6,335.3L562.7,340.8L563.4,342.4L560.8,351L549.5,364.3L543.5,367.2L543.1,368.1L535.3,367.9L527.8,371L524.9,368.7L524.2,363.8L525,363.2L525.1,360.7L518.4,345.4L516.7,328.4L514.5,324.1L512.7,317.8L510.7,314.3L510.8,306.4L512.9,298.4L516,293.1L516.2,288.4L514.1,282.9L515.1,280.7L511.7,268.1L503.5,254L505.3,246.4L504.8,245.8L506.1,239L505.1,236.6L503.8,236L502.6,232.9L497.8,234.8L495.7,234.7L491.5,227.5L485,228L474.8,233.1L467.6,231.4L464.5,232.1L460,234.4L456,232.6L449.6,225.7L447,223.9L445.6,222L444.9,218.1L441.4,213.4L440.8,211L437.5,208.7L436.2,206.4L436,201.4L433.7,197.4L434.9,196.7L436.9,192.4L438,185.5L437.9,178.6L435.9,175.4L436.3,172.4L438.2,169.6L439.1,166.1L441.5,163.3L443.4,157.4L445.1,156.2L448.3,151.4L450.6,151L456.1,145.1L455.7,140.9L457.1,136.4L458.7,134.2L463.1,131.3L465.6,126L467.4,126L468.8,127.4L474.7,127.9L483.5,123.3L491.6,122.5L492.8,123L495.1,121.7L500.3,122.2L502.8,120.9L504.5,121.3L504.5,122.9L506.5,121.8L506.7,122.4L505.6,123.9L505.6,125.4L506.5,126.2L506.3,129L504.8,130.6L505.3,132.4L506.6,132.4L508.2,134.5L517.6,137.4L518.9,140.3L527.5,144L529.8,141.6L529,139L529.7,137.4L533,135.5L536.4,136.1L537.4,137.6L541.6,138.6L542.3,139.7L545.6,139.6L551.8,142L554.6,140L556.7,139.7L558.5,140.1L559.4,141.7L559.8,140.7L563.9,141.6L565.6,139.7L567.8,129.6L567.6,125.8L566.5,124.4L567.2,123.2L563.6,122.7L562.2,124.5L558.6,124.9L556.4,123.2L553.8,123.1L553.4,124.4L551.8,124.8L549.3,123.1L546.6,123.1L542.9,118.2L543.7,115.8L542.1,114.3L544.3,111.3L547.9,111.2L548.6,108.9L553.1,109.3L555.6,107.3L558.2,106.4L562,106.3L570.1,109.7L574.8,109.5L577.3,107.9L577.3,106.6L576.3,104.5L563.7,96.7L565.2,96.2L566.6,93.8L565.1,92.6L568.1,91.4L567.9,90.8L559.2,93.7L559.7,95.5L560.9,96.2L563.2,96.1L563,97.1L557.8,99.3L556.4,98.7L556.7,97.3L554,96.5L556.3,94.9L555.5,94.3L551.8,93.5L551.5,92.4L549.5,92.8L547.7,97.3L545.9,97.7L545.9,101.3L544.3,104.7L545.8,107.6L547.9,108.6L547.6,109.4L544.9,109.5L542.2,112.2L541.3,110.1L538.6,109.7L535.8,110.5L537.6,112.2L536.5,112.7L535.2,112.7L533.8,111.2L533.4,111.8L535.5,115.2L534.6,115.8L537.4,118.2L537.6,120L535.3,119.1L536.2,120.8L534.7,121.1L535.9,123.9L534.3,123.9L532.2,122.5L530.4,117.9L525.8,111.8L525.7,107.3L524,105.6L517,101.9L514.9,99.7L514,97.2L512.5,96.8L511.9,98L511.2,97L511.7,95.7L509.9,95.3L508.1,96.3L508.1,98.6L509,100.1L511.2,101.7L512.6,104.2L515.3,106.6L517.2,106.6L517.8,107.3L517.2,107.9L523.6,112.1L523.3,113.2L521.9,111.8L519.8,111.3L518.9,113.3L520.7,114.4L520.6,116L519.6,116.2L518.5,118.9L517.5,119.2L518.3,115.9L516.4,112.5L512,109L510.2,108.8L508.3,107.4L504.4,103.6L503.5,100.7L500.4,99.3L495.1,103L490.5,102.2L487.2,103.2L487.1,106.8L484.9,108.8L481.9,109.5L480.3,112.2L479.3,114.8L480.3,116.6L478.9,118L478.4,120L476.5,120.6L474.8,123.1L469.5,123.1L467,125.4L465.8,125.2L464.3,122.2L462.1,121.7L461.1,122.6L458.6,122.5L458.9,118L457.8,117.8L457.3,116.6L459.4,110.3L459.1,104.7L458.2,103.4L461.6,101.2L475.6,102.2L476.8,100.4L477.3,94.5L473.4,89.9L470,88.8L469.8,86.7L472.7,86.1L476.4,86.9L475.7,83.7L477.8,84.9L482.9,82.7L483.6,80.4L488.3,78.5L490.1,74.5L495.1,72.9L497.3,73.4L498.7,72.1L497,68.1L496.8,65.5L497.7,64.1L501.7,62.5L501.2,64.6L502.7,65.7L500.2,68.3L501,70.5L503.2,71.2L503.3,72.1L506.5,70.9L510.1,72.8L517.2,69.9L521.6,71L522,69.8L524.7,69L523.7,64.9L524.5,63.3L526.3,62.5L528.2,64.3L529.9,64.3L529.9,60.9L527.7,60.4L527.3,59L532.2,57.9L536.5,58.3L538.5,56.9L536.1,55.8L526,57.4L522.5,55.3L522.5,53L521.2,51L521.9,49.6L528.4,45.5L528,44.6L525.1,43.6L522,44.2L520.5,45.7L521,47L514.9,50.6L513.9,53.8L517.7,56.8L516.3,59.5L514.2,60.1L513.1,66.6L510.6,66.4L509.6,68.4L507.2,68.6L500.9,58.3L497.1,61.1L494.4,61.7L491.5,60.4L489.8,52.4L500.2,46.8L507.3,40L514.8,36.2L521.6,35.5L523.9,34L530.3,33.8L536.4,35L534.2,35.5L536.5,36.7L538.2,36L554.5,39.7L556.3,40.7L557,42L555.3,43.1L552.5,43.6L542.2,42.3L545.8,43.8L547.1,47L551.5,48.2L551.4,47.1L549.8,46.2L550.8,45.4L555.9,46.7L557.4,46.2L555.5,44.7L559.1,42.6L562.9,43.5L563.4,42.1L561.3,40.9L561.7,39.7L559.8,38.5L565.3,39.1L566.8,40.2L564.6,40.5L565.1,41.6L566.9,42.3L569.6,41.8L569.4,40.5L578.4,38L579.8,38.1L578.7,39.2L581.1,39.4L587.7,37.9L590.5,39.1L591.8,37.8L589.2,36.7L589.7,36.1L595.5,36.7L606.5,39.4L607,38.4L601.8,36.9L601.8,36L599.4,34L601.5,32.5L601.6,31L602.6,30.7L607.6,31.1L608.7,32L608.1,33.4L611.2,35.2L612.7,37.7L615.6,38.8L615.8,40.1L614.1,43L616.5,43.3L618.4,42L618.2,41L619.1,40.1L617.2,39L617.1,37.7L615,37.6L613.7,36.5L613.7,34.7L610.3,33.3L612.5,32.2L611.2,31L613.7,31.9L614.3,33.5L616.5,33.8L614.7,32.6L617.1,31.9L624.8,32.8L620.3,29.7L630.8,29.3L628.7,28.5L629.7,27.5L634.2,26.8L650.9,25.7L651.7,24.6L655,24.1L658.4,24.5L656.5,24.8ZM595.1,108.7L596.9,110.9L598.9,111.8L597,112.1L597,115.6L596.3,116.3L598,120.2L600.4,120.9L602.4,122.5L606,123L609.5,122.2L608.2,115.9L606.1,114.8L606.1,112.7L604.5,112.5L604.4,109.9L606.8,110.7L608.6,109.7L605.2,106.1L603.6,106.9L603.9,109.1L601.9,104.1L598.9,103L595.3,98.6L597.6,98.9L597.1,96.7L601,96.7L599.6,92L595.2,91.4L591.1,93.3L590.5,95.1L588.5,95.5L587,98.6L589.8,101.4L590.1,103.5L593.5,107.1ZM322.4,24.3L318.5,23.9L322.7,24.2ZM295.2,24.1L289.7,24.1L296.3,23.8ZM521.4,23.9L514.8,24.1L515.8,23.8L514.7,23.4L518.9,23.7ZM297.5,23L292.4,23.3L295.7,22.8ZM319.8,23.7L317,23.9L316,23.7L316.2,22.7L320.7,23.3ZM313.1,23.4L304.7,23.3L306.7,23L305,22.7L305.5,22.3L312.5,22.8ZM655.3,23.4L646.4,23.8L647.6,22.3L655.2,22.9ZM510.1,21.9L515.7,22.7L511.7,23.1L508.9,25.2L506.9,25.3L503.1,24.5L504.6,24.1L497.2,21.9L507.9,21.5ZM521.7,21.1L525.1,21.5L522.8,22L513.1,22L508.5,21.2L517.5,20.9ZM563.8,21L558.3,21.5L553.5,21L564.3,20.9ZM645.9,22.7L637.5,22.6L629.7,21.2L636.5,20.4L645.1,21.8ZM336.4,21.9L338.1,22.2L328.4,23.5L325.1,23.3L323.9,22.9L326,22.2L321,21.4L329.3,20.3L335.8,21.2ZM369.6,18.9L379.8,19.4L369.9,20.1L373.4,20.1L362.7,21.7L352.8,22.3L354.9,22.4L353.6,22.6L354.5,23.1L345.7,24.7L348.3,25.3L343,26.1L328.3,25.7L328.7,25L332.1,24.8L332.3,23.9L337.3,24.3L333.3,23.3L339.3,22.2L337.2,21.3L345.8,21.1L336.4,21L331.3,19.8L366.1,18.8ZM436.4,18.6L446.3,19.1L429.1,19.7L460.1,20.3L447.1,21.4L450.9,21.4L447.3,22.9L447,24.2L448.8,25L443.3,25.5L446.3,26.2L446.4,27.3L444.5,27.5L446.5,28.7L442.6,28.8L444.5,29.5L443.8,30L438.8,30.3L440.7,31.3L440.6,32.1L436.2,31.8L440.6,33.3L440.9,34.7L437.6,35L434.5,33.3L434.8,34.5L432.4,35.5L439.6,35.6L429,38.7L421.3,39.4L415.9,42.2L404.4,44.7L402.3,46.1L400.1,49L396.3,50.8L396.4,52.6L392.9,56.8L390.1,56.9L387.8,55L383.9,55L382.5,53.7L382.1,51.5L380,48.7L380.4,45.3L378.8,43.4L380.2,41.9L379.4,41.2L382.4,38.9L385.6,38.2L387.9,36L382.5,37.2L380.6,36.6L382.5,34.4L387.6,34.8L383.8,33.1L380.7,33L383.6,31.4L381.2,28.1L379.3,27.6L379.8,27L375.8,26.2L363.4,26.2L359.5,25L367.7,24.5L357.5,23.7L371.4,22.2L372.3,21.8L368.2,21.4L378.2,19.9L398.5,19.4L407.6,20L404.4,19.2L423.6,18.5Z"
);
