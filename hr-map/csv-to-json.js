/*
  Convertit hr-map.csv en static/hr-map.json
  Usage : node hr-map/csv-to-json.js

  Coordonnées : colonnes Lat / Lon de hr-map.csv si elles sont remplies,
  sinon celles de hr-map/places.csv (une ligne par lieu, voir geocode.js).
*/
const fs = require("fs");
const path = require("path");
const { detectDelimiter, parse, norm } = require("./csv");

const input = process.argv[2] || path.join(__dirname, "hr-map.csv");
const output = process.argv[3] || path.join(__dirname, "..", "static", "hr-map.json");
const placesFile = path.join(__dirname, "places.csv");

const read = f => fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "");
const num = v => parseFloat(String(v || "").trim().replace(",", "."));

/* Table des lieux : place -> [lat, lon] */
const placeCoords = {};
if (fs.existsSync(placesFile)) {
  const t = read(placesFile), rows = parse(t, detectDelimiter(t));
  const h = rows.shift().map(x => x.trim().toLowerCase());
  const ip = h.indexOf("place"), ila = h.indexOf("lat"), ilo = h.indexOf("lon");
  rows.forEach(r => {
    const lat = num(r[ila]), lon = num(r[ilo]);
    if (!isNaN(lat) && !isNaN(lon)) placeCoords[norm(r[ip])] = [lat, lon];
  });
}

const text = read(input);
const rows = parse(text, detectDelimiter(text));
const headers = rows.shift().map(h => h.trim().toLowerCase());
const col = (...keys) => headers.findIndex(h => keys.some(k => h.startsWith(k)));
const idx = {
  date: col("date"), place: col("place"), title: col("what"), text: col("explanation"),
  category: col("thematic", "categor"), url: col("url", "link"),
  lat: col("lat"), lon: col("lon", "lng")
};
if (idx.title < 0) {
  console.error("Colonne « What happened » introuvable. En-têtes lus :", headers);
  process.exit(1);
}

const get = (r, i) => (i >= 0 && r[i] ? norm(r[i]) : "");

const items = [], missing = [], invalid = [];
let fromPlaces = 0;
rows.forEach((r, n) => {
  const line = n + 2;
  const title = get(r, idx.title), place = get(r, idx.place);
  let lat = idx.lat >= 0 ? num(r[idx.lat]) : NaN;
  let lon = idx.lon >= 0 ? num(r[idx.lon]) : NaN;
  if ((isNaN(lat) || isNaN(lon)) && placeCoords[place]) {
    lat = placeCoords[place][0]; lon = placeCoords[place][1]; fromPlaces++;
  }
  if (isNaN(lat) || isNaN(lon)) { missing.push("ligne " + line + " : " + title + " [" + place + "]"); return; }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) { invalid.push("ligne " + line + " : " + title + " (" + lat + ", " + lon + ")"); return; }
  const item = {
    title: title, date: get(r, idx.date), place: place, text: get(r, idx.text),
    category: get(r, idx.category), url: get(r, idx.url),
    lat: Math.round(lat * 10000) / 10000, lon: Math.round(lon * 10000) / 10000
  };
  Object.keys(item).forEach(k => { if (item[k] === "") delete item[k]; });
  items.push(item);
});

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, "[\n" + items.map(i => JSON.stringify(i)).join(",\n") + "\n]\n");

console.log(items.length + " entrées écrites dans " + output + " (" + Math.round(fs.statSync(output).size / 1024) + " Ko)");
if (fromPlaces) console.log(fromPlaces + " placées grâce à places.csv");
if (missing.length) console.warn("\n" + missing.length + " sans coordonnées (ignorées) :\n  " + missing.join("\n  "));
if (invalid.length) console.warn("\n" + invalid.length + " coordonnées invalides (lat/lon inversées ?) :\n  " + invalid.join("\n  "));