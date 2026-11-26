#!/usr/bin/env node
// Prepares the built site (public/) for the Infomaniak web hosting (Apache + PHP).
// Run after the Hugo build:  node hosting/infomaniak/build.js
//
// - public/.htaccess = htaccess.base + static/.htaccess (custom Apache config synced by Osuny)
// - public/contact.php = contact form endpoint
//
// These files are not in static/ on purpose: on the current Deuxfleurs hosting,
// contact.php would be served as plain text.

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const publicDir = path.resolve(root, process.argv[2] || 'public')

if (!fs.existsSync(publicDir)) {
  console.error(`No ${publicDir}: build the site with Hugo first.`)
  process.exit(1)
}

// Custom Apache configuration, synced by Osuny from the admin field
// "Custom Apache configuration (.htaccess)" into static/.htaccess (Hugo copies
// it verbatim to public/.htaccess; here it is merged after our base instead).
const customPath = path.join(root, 'static', '.htaccess')
const custom = fs.existsSync(customPath) ? fs.readFileSync(customPath, 'utf8') : ''
if (!custom) console.warn('static/.htaccess absent: public/.htaccess = htaccess.base only')

const base = fs.readFileSync(path.join(__dirname, 'htaccess.base'), 'utf8')

const htaccess = `${base}
# Custom Apache configuration (synced by Osuny: static/.htaccess)
${custom}
`

fs.writeFileSync(path.join(publicDir, '.htaccess'), htaccess)
fs.copyFileSync(path.join(__dirname, 'contact.php'), path.join(publicDir, 'contact.php'))

console.log('public/.htaccess: htaccess.base + static/.htaccess (Osuny)')
console.log('public/contact.php: copied')
