/*
  Régénère static/hr-map.json au build, depuis le CSV de la carte HR.

  Source principale : le bloc « files » de la page hr-map-data (rempli à la main dans
  l'admin Osuny) :
    content/en/pages/.../hr-map-data/_index.html -> data.files[0].file (page File)
      -> original_blob.id -> data/media/<id[0,2]>/<id>.yml -> direct_url (S3, publique)
      -> fetch du CSV

  Fallback : hr-map/fallback.csv (CSV initial, conservé dans le repo) si le bloc files
  est absent, vide, ou si le fetch échoue (ex. fichier supprimé du CMS par erreur).

  Dans tous les cas : hr-map/csv-to-json.js -> static/hr-map.json (écrasé au build ;
  la version committée sert de filet de sécurité si ce script ne tourne pas).

  Usage : node scripts/build-hr-map.js   (à lancer avant `yarn osuny build`)
*/
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const FALLBACK_CSV = path.join(ROOT, "hr-map", "fallback.csv");
const OUT = path.join(ROOT, "static", "hr-map.json");

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

function generate(csvPath, label) {
  execFileSync(process.execPath, [path.join(ROOT, "hr-map", "csv-to-json.js"), csvPath, OUT], { stdio: "inherit" });
  console.log("[hr-map] " + OUT + " régénéré depuis " + label);
}

(async () => {
  const url = csvUrlFromFilesBlock();
  if (url) {
    console.log("[hr-map] CSV média : " + url);
    try {
      const res = await fetch(url);
      if (res.ok) {
        const tmp = path.join(os.tmpdir(), "hr-map-" + Date.now() + ".csv");
        fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
        generate(tmp, "le CSV du bloc files (média " + url.slice(0, 60) + "…)");
        return;
      }
      console.error("[hr-map] fetch du CSV en échec (HTTP " + res.status + ") -> fallback");
    } catch (e) {
      console.error("[hr-map] fetch du CSV en erreur (" + e.message + ") -> fallback");
    }
  } else {
    console.log("[hr-map] pas de bloc files résolu -> fallback");
  }
  if (!fs.existsSync(FALLBACK_CSV)) {
    console.error("[hr-map] " + FALLBACK_CSV + " absent : on garde le JSON commité tel quel");
    process.exit(0);
  }
  generate(FALLBACK_CSV, "hr-map/fallback.csv (repo)");
})();
