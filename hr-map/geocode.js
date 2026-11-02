/*
  Cherche les coordonnées de chaque lieu de la colonne « Place / geography »
  avec Nominatim (OpenStreetMap) et les écrit dans hr-map/places.csv.

  Usage :
    GEOCODE_CONTACT=toi@exemple.org node hr-map/geocode.js
    node hr-map/geocode.js --retry   (réessaie les lieux restés vides)

  - Une seule recherche par lieu distinct (1 par seconde, règle de Nominatim).
  - Ne modifie jamais une ligne déjà présente dans places.csv : tes corrections
    manuelles sont conservées. Pour corriger un lieu, édite lat/lon dans places.csv.
*/
const fs = require("fs");
const path = require("path");
const { detectDelimiter, parse, stringify, norm } = require("./csv");

const DIR = __dirname;
const NO_POINT = /^(global|international|worldwide|world|multiple|various|n\/a|unknown)\b/i;

/* "Babylonia / Mesopotamia (present-day Iraq)" -> requêtes à essayer, de la plus précise à la plus large */
function buildQueries(place) {
  const modern = (place.match(/present[- ]day\s+([^)]+)\)/i) || [])[1];
  const base = place.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const parts = base.split(/\s*[\/;]\s*/).map(s => s.trim()).filter(Boolean);
  const modernParts = modern ? modern.split(/\s*(?:\/|,| and )\s*/).map(s => s.trim()).filter(Boolean) : [];
  const q = [];
  if (parts[0] && modernParts[0]) q.push(parts[0] + ", " + modernParts[0]);
  parts.forEach(p => q.push(p));
  modernParts.forEach(p => q.push(p));
  return q.filter((v, i) => v && q.indexOf(v) === i);
}

async function lookup(query, fetchFn, contact) {
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&q=" +
    encodeURIComponent(query);
  const res = await fetchFn(url, { headers: { "User-Agent": "nous-hr-map/1.0 (" + contact + ")" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  return data[0] || null;
}

async function run(opts) {
  opts = opts || {};
  const fetchFn = opts.fetchFn || fetch;
  const delay = opts.delay == null ? 1100 : opts.delay;
  const csvFile = opts.csvFile || path.join(DIR, "hr-map.csv");
  const placesFile = opts.placesFile || path.join(DIR, "places.csv");
  const contact = opts.contact || process.env.GEOCODE_CONTACT;
  const retry = !!opts.retry;
  if (!contact) { throw new Error("Indique un contact : GEOCODE_CONTACT=toi@exemple.org (exigé par Nominatim)"); }

  const t = fs.readFileSync(csvFile, "utf8").replace(/^\uFEFF/, "");
  const rows = parse(t, detectDelimiter(t));
  const h = rows.shift().map(x => x.trim().toLowerCase());
  const ip = h.findIndex(x => x.startsWith("place"));
  if (ip < 0) throw new Error("Colonne « Place / geography » introuvable");
  const wanted = [];
  rows.forEach(r => { const p = norm(r[ip]); if (p && wanted.indexOf(p) < 0) wanted.push(p); });

  /* places.csv existant */
  const header = ["place", "lat", "lon", "status", "matched"];
  let table = [];
  if (fs.existsSync(placesFile)) {
    const pt = fs.readFileSync(placesFile, "utf8").replace(/^\uFEFF/, "");
    const pr = parse(pt, detectDelimiter(pt)); pr.shift();
    table = pr.map(r => [norm(r[0]), r[1] || "", r[2] || "", r[3] || "", r[4] || ""]);
  }
  const save = () => fs.writeFileSync(placesFile, stringify([header].concat(table), ";"));
  const find = p => table.find(r => r[0] === p);

  const todo = wanted.filter(p => { const r = find(p); return !r || (retry && !r[1] && r[3] !== "no point"); });
  const stats = { found: 0, missing: [], skipped: wanted.length - todo.length };

  for (let i = 0; i < todo.length; i++) {
    const place = todo[i];
    let row = find(place);
    if (!row) { row = [place, "", "", "", ""]; table.push(row); }
    if (NO_POINT.test(place)) { row[3] = "no point"; save(); continue; }
    let hit = null, used = "";
    for (const q of buildQueries(place)) {
      try { hit = await lookup(q, fetchFn, contact); } catch (e) { hit = null; console.warn("  erreur pour « " + q + " » : " + e.message); }
      if (delay) await new Promise(r => setTimeout(r, delay));
      if (hit) { used = q; break; }
    }
    if (hit) {
      row[1] = Number(hit.lat).toFixed(4); row[2] = Number(hit.lon).toFixed(4);
      row[3] = "auto";
      row[4] = used + " → " + (hit.display_name || "").split(",").slice(0, 3).join(",") + " [" + (hit.addresstype || hit.type || "?") + "]";
      stats.found++;
    } else {
      row[3] = "not found"; stats.missing.push(place);
    }
    save();
    console.log("(" + (i + 1) + "/" + todo.length + ") " + place + " → " + (hit ? row[1] + ", " + row[2] : "introuvable"));
  }
  if (!todo.length) save();
  return stats;
}

module.exports = { buildQueries, run };

if (require.main === module) {
  run({ retry: process.argv.includes("--retry") }).then(s => {
    console.log("\n" + s.found + " lieux trouvés, " + s.skipped + " déjà connus.");
    if (s.missing.length) console.log("À compléter à la main dans places.csv :\n  " + s.missing.join("\n  "));
    console.log("Vérifie la colonne « matched » : un lieu trouvé via un pays ou une région est placé en son centre.");
  }).catch(e => { console.error(e.message); process.exit(1); });
}