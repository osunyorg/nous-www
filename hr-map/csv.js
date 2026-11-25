/* Petit lecteur / écrivain CSV (guillemets, retours à la ligne dans les cellules) */
function detectDelimiter(text) {
  const first = text.split(/\r?\n/)[0] || "";
  const count = ch => first.split(ch).length - 1;
  return [["\t", count("\t")], [";", count(";")], [",", count(",")]]
    .sort((a, b) => b[1] - a[1])[0][0];
}

function parse(text, delim) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; }
      } else { cell += c; }
    } else if (c === '"') { quoted = true; }
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else { cell += c; }
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ""));
}

function stringify(rows, delim) {
  const q = v => {
    v = v == null ? "" : String(v);
    return v.includes(delim) || /["\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  return rows.map(r => r.map(q).join(delim)).join("\n") + "\n";
}

const norm = s => String(s || "").replace(/\s+/g, " ").trim();

// Lieux sans point carte (entrée « globale », listée sous la légende) — partagé geocode.js / csv-to-json.js
const NO_POINT = /^(global|international|worldwide|world|multiple|various|n\/a|not specified|unspecified|unknown)\b/i;
// teste le libellé entier ET chaque morceau séparé par / ; , (« Indigenous territories / Global » -> global)
const noPoint = s => {
  const t = norm(s);
  return NO_POINT.test(t) || t.split(/\s*[\/;,]\s*/).some(p => NO_POINT.test(p));
};

module.exports = { detectDelimiter, parse, stringify, norm, NO_POINT, noPoint };