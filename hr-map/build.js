/*
  Régénère static/data/hr-map.json au build, depuis le CSV de la carte HR.

  Source principale : le bloc « files » de la page hr-map-data (rempli à la main dans
  l'admin Osuny) :
    content/en/pages/.../hr-map-data/_index.html -> data.files[0].file (page File)
      -> original_blob.id -> data/media/<id[0,2]>/<id>.yml -> direct_url (S3, publique)
      -> fetch du CSV

  Fallback : hr-map/fallback.csv (CSV initial, conservé dans le repo) si le bloc files
  est absent, vide, ou si le fetch échoue (ex. fichier supprimé du CMS par erreur).

  Dans tous les cas : hr-map/csv-to-json.js -> static/data/hr-map.json (écrasé au build ;
  la version committée sert de filet de sécurité si ce script ne tourne pas).

  Usage : node scripts/build-hr-map.js   (à lancer avant `yarn osuny build`)
*/
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { detectDelimiter, parse, norm, stringify, noPoint } = require(path.join(__dirname, "csv.js"));
const { buildQueries } = require(path.join(__dirname, "geocode.js"));

const ROOT = path.join(__dirname, "..");
const FALLBACK_CSV = path.join(ROOT, "hr-map", "fallback.csv");
const PLACES_CSV = path.join(ROOT, "hr-map", "places.csv");
const OUT = path.join(ROOT, "static", "data", "hr-map.json");

// Géocodage au build (Nominatim) : uniquement les lieux ABSENTS de places.csv,
// jamais plus de MAX_GEOCODE pour ne pas allonger le déploiement, 1 req/s (politique Nominatim).
const MAX_GEOCODE = 20;
const GEOCODE_DELAY_MS = 1100;
const GEOCODE_CONTACT = process.env.GEOCODE_CONTACT || "hr-map-build@nous.osuny.site";

function findPageFile(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findPageFile(p);
      if (found) return found;
    } else if (entry.name === "_index.html" && p.includes("hr-map-data")) {
      return p;
    }
  }
  return null;
}

function mediaDirectUrl(mediaId) {
  const mediaYml = path.join(ROOT, "data", "media", mediaId.slice(0, 2), mediaId + ".yml");
  if (!fs.existsSync(mediaYml)) return null;
  return (fs.readFileSync(mediaYml, "utf8").match(/^direct_url:\s*"?(\S+?)"?\s*$/m) || [])[1] || null;
}

// Résout le CSV du bloc files : retourne une URL, ou null si bloc absent/incomplet
function csvUrlFromFilesBlock() {
  const pageFile = findPageFile(path.join(ROOT, "content"));
  if (!pageFile) return null;
  const fm = fs.readFileSync(pageFile, "utf8").match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const m = fm[1].match(/template:\s*files\b[\s\S]*?file:\s*"(content\/en\/files\/[^"]+)"/);
  if (!m) return null;
  const filePage = path.join(ROOT, m[1]);
  if (!fs.existsSync(filePage)) return null;
  const fileFm = fs.readFileSync(filePage, "utf8").match(/^---\n([\s\S]*?)\n---/);
  const blobId = fileFm && (fileFm[1].match(/^original_blob:\s*\n\s*id:\s*"?([0-9a-f-]{36})"?/m) || [])[1];
  if (!blobId) return null;
  const url = mediaDirectUrl(blobId);
  if (url) console.log("[hr-map] CSV résolu via le bloc files -> " + m[1]);
  return url;
}

/* Lit places.csv -> Map norm(place) -> {lat, lon} */
function readPlaces() {
  const map = new Map();
  if (!fs.existsSync(PLACES_CSV)) return map;
  const t = fs.readFileSync(PLACES_CSV, "utf8").replace(/^﻿/, "");
  const rows = parse(t, detectDelimiter(t));
  const h = rows.shift().map(x => x.trim().toLowerCase());
  const ip = h.indexOf("place"), ila = h.indexOf("lat"), ilo = h.indexOf("lon");
  for (const r of rows) {
    const p = norm(r[ip]);
    const lat = parseFloat(String(r[ila] || "").replace(",", "."));
    const lon = parseFloat(String(r[ilo] || "").replace(",", "."));
    if (p && !isNaN(lat) && !isNaN(lon)) map.set(p, { lat, lon });
  }
  return map;
}

async function geocodeOne(place) {
  const queries = buildQueries(place);
  for (const q of queries) {
    const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&q=" +
      encodeURIComponent(q);
    const res = await fetch(url, { headers: { "User-Agent": "nous-hr-map/1.0 (" + GEOCODE_CONTACT + ")" } });
    if (!res.ok) continue;
    const data = await res.json();
    if (data[0]) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), matched: data[0].display_name,
               exact: q === queries[0] }; // match sur le libellé complet = pas approx
    }
    await new Promise(r => setTimeout(r, GEOCODE_DELAY_MS));
  }
  return null;
}

/* Géocode les lieux du CSV absents de places.csv, retourne un fichier places fusionné (tmp) ou null. */
async function geocodeMissingPlaces(csvPath) {
  const known = readPlaces();
  const t = fs.readFileSync(csvPath, "utf8").replace(/^﻿/, "");
  const rows = parse(t, detectDelimiter(t));
  const h = rows.shift().map(x => x.trim().toLowerCase());
  const ip = h.findIndex(x => x.startsWith("place"));
  if (ip < 0) return null;
  const wanted = [...new Set(rows.map(r => norm(r[ip])).filter(Boolean))];
  // ne jamais géocoder un libellé générique (Global, Not specified…) : ce sera une entrée globale
  const missing = wanted.filter(p => !known.has(p) && !noPoint(p)).slice(0, MAX_GEOCODE);
  if (!missing.length) return PLACES_CSV; // rien à géocoder : on réutilise places.csv tel quel
  console.log("[hr-map] " + missing.length + " lieu(x) inconnu(s) de places.csv, géocodage Nominatim… " +
    (wanted.length - known.size > MAX_GEOCODE ? "(tronqué à " + MAX_GEOCODE + ")" : ""));
  const extra = [];
  for (const p of missing) {
    const found = await geocodeOne(p);
    if (found) {
      console.log("[hr-map] " + p + " -> " + found.lat + ", " + found.lon + (found.exact ? "" : " (approx)"));
      extra.push([p, String(found.lat), String(found.lon), "auto", found.matched || "", found.exact ? "" : "yes"]);
    } else {
      console.log("[hr-map] " + p + " -> non trouvé (ignoré, comme avant)");
    }
    await new Promise(r => setTimeout(r, GEOCODE_DELAY_MS));
  }
  const placesTmp = path.join(os.tmpdir(), "hr-map-places-" + Date.now() + ".csv");
  const header = "place;lat;lon;status;matched;approx";
  const orig = fs.readFileSync(PLACES_CSV, "utf8").replace(/^﻿/, "");
  fs.writeFileSync(placesTmp, orig.replace(/\n*$/, "\n") + stringify(extra, ";") + "\n");
  return placesTmp;
}

function generate(csvPath, placesPath, label) {
  execFileSync(process.execPath,
    [path.join(ROOT, "hr-map", "csv-to-json.js"), csvPath, OUT, placesPath], { stdio: "inherit" });
  console.log("[hr-map] " + OUT + " régénéré depuis " + label);
}

(async () => {
  let csvPath = null, label = null;
  const url = csvUrlFromFilesBlock();
  if (url) {
    console.log("[hr-map] CSV média : " + url);
    try {
      const res = await fetch(url);
      if (res.ok) {
        csvPath = path.join(os.tmpdir(), "hr-map-" + Date.now() + ".csv");
        fs.writeFileSync(csvPath, Buffer.from(await res.arrayBuffer()));
        label = "le CSV du bloc files (média " + url.slice(0, 60) + "…)";
      } else {
        console.error("[hr-map] fetch du CSV en échec (HTTP " + res.status + ") -> fallback");
      }
    } catch (e) {
      console.error("[hr-map] fetch du CSV en erreur (" + e.message + ") -> fallback");
    }
  } else {
    console.log("[hr-map] pas de bloc files résolu -> fallback");
  }
  if (!csvPath) {
    if (!fs.existsSync(FALLBACK_CSV)) {
      console.error("[hr-map] " + FALLBACK_CSV + " absent : on garde le JSON commité tel quel");
      process.exit(0);
    }
    csvPath = FALLBACK_CSV;
    label = "hr-map/fallback.csv (repo)";
  }
  // Géocodage au build des lieux absents de places.csv (en mémoire, places.csv du repo intact)
  let placesPath = PLACES_CSV;
  try {
    placesPath = (await geocodeMissingPlaces(csvPath)) || PLACES_CSV;
  } catch (e) {
    console.error("[hr-map] géocodage en erreur (" + e.message + ") -> places.csv sans les nouveaux lieux");
  }
  generate(csvPath, placesPath, label);
})();
