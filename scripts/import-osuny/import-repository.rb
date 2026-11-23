#!/usr/bin/env ruby
# frozen_string_literal: true

# Import du repository CSV (NOUS_Repository.csv, à côté de ce script) dans Osuny,
# via le client API officiel (gem osuny_api, même gem que osunyorg/importers).
#
# Usage :
#   bundle exec ruby import-repository.rb                # dry-run : lit le CSV, affiche le mapping, AUCUN appel réseau
#   bundle exec ruby import-repository.rb --categories   # liste les catégories portfolio (lecture seule)
#   bundle exec ruby import-repository.rb --apply        # importe réellement (upsert idempotent)
#   bundle exec ruby import-repository.rb --verify       # lecture seule : vérifie côté CMS que chaque
#                                                        # entrée du CSV a bien son CTA (bloc call_to_action) persisté
#
# Config : cp .env.example .env puis coller le jeton dans OSUNY_API_TOKEN (.env est gitignoré).

require 'csv'
require 'json'
require 'date'

# Charge .env sans dépendance (dotenv n'est utile qu'en mode réel, via le Gemfile)
env_file = File.join(__dir__, '.env')
if File.exist?(env_file)
  File.foreach(env_file) do |line|
    line = line.strip
    next if line.empty? || line.start_with?('#')
    k, v = line.split('=', 2)
    ENV[k] = v if k && !k.empty? && !ENV.key?(k)
  end
end

CSV_PATH = File.join(__dir__, 'NOUS_Repository.csv')
HOST     = ENV.fetch('OSUNY_API_HOST', 'nous.osuny.org')
WEBSITE_ID = ENV.fetch('OSUNY_WEBSITE_ID') { abort 'OSUNY_WEBSITE_ID manquant (voir .env.example)' }

MODE = if ARGV.include?('--apply')       then :apply
       elsif ARGV.include?('--verify')     then :verify
       elsif ARGV.include?('--categories') then :categories
       else :dry
       end

# --limit N : en mode --apply, n'importe que les N premières lignes du CSV (test d'écriture)
LIMIT = ARGV.include?('--limit') ? ARGV[ARGV.index('--limit') + 1].to_i : nil

BATCH_SIZE = 50

# --- helpers ---------------------------------------------------------------

def slugify(str)
  str.to_s
     .unicode_normalize(:nfd).gsub(/\p{Mn}/, '')
     .downcase
     .gsub(/[^a-z0-9]+/, '-')
     .gsub(/\A-+|-+\z/, '')
end

# Le serveur tronque le slug à 100 caractères et strippe le tiret final si la
# troncature tombe dessus (mais PAS le migration_identifier, qui contient le slug
# complet) : pour retrouver un projet existant par son slug, il faut faire pareil.
SLUG_MAX = 100
def cms_slug(str) = slugify(str)[0, SLUG_MAX].gsub(/-+\z/, '')

# Les modèles Swagger répondent aux accessors, mais on reste tolérant aux Hash.
def field(obj, name)
  return nil if obj.nil?
  return obj.public_send(name) if obj.respond_to?(name)
  return obj[name] || obj[name.to_sym] if obj.is_a?(Hash)
  nil
end

def connect!
  require 'osuny_api' # gem du Gemfile, nécessaire uniquement pour les appels réseau
  token = ENV['OSUNY_API_TOKEN'].to_s
  abort 'OSUNY_API_TOKEN vide — copie .env.example en .env et colle le jeton (jamais commité)' if token.empty?
  OsunyApi.configure do |config|
    config.host = HOST
    config.base_path = '/api/osuny/v1'
    config.api_key['X-Osuny-Token'] = token
  end
end

def categories_api = OsunyApi::CommunicationWebsitePortfolioCategoryApi.new
def projects_api   = OsunyApi::CommunicationWebsitePortfolioProjectApi.new

def fetch_categories
  categories_api.communication_websites_website_id_portfolio_categories_get(
    WEBSITE_ID, per_page: 10_000, page_num: 1
  )
end

# Tous les projets du site, paginés (per_page=100 au-delà => toutes les pages)
def fetch_all_projects
  all  = []
  page = 1
  loop do
    batch = projects_api.communication_websites_website_id_portfolio_projects_get(WEBSITE_ID, per_page: 100, page_num: page)
    break if batch.nil? || batch.empty?
    all.concat(batch)
    break if batch.size < 100
    page += 1
  end
  all
end

# Localization EN d'un projet (le hash rendu par to_hash a des clés symbol)
def en_loc(project)
  locs = project.to_hash[:localizations] || {}
  locs[:en] || locs['en'] || {}
end

# URL du premier élément du premier bloc call_to_action d'une localization
def cta_url(loc)
  blocks = loc[:blocks] || loc['blocks'] || []
  blocks.each do |b|
    next unless (b[:template_kind] || b['template_kind']).to_s == 'call_to_action'
    data     = b[:data] || b['data'] || {}
    elements = data[:elements] || data['elements'] || []
    first    = elements.first || {}
    url      = first[:url] || first['url']
    return url if url
  end
  nil
end

# Retourne [parents, children] :
#   parents  = { 'themes' => id, 'types' => id }            (slug de la taxonomie => id)
#   children = { parent_id => { slug => id } }              (enfants)
def category_maps(cats)
  parents  = {}
  children = Hash.new { |h, k| h[k] = {} }
  cats.each do |c|
    slug = field(field(c.localizations, 'en'), :slug)
    if field(c, :is_taxonomy)
      parents[slug] = c.id
    else
      children[field(c, :parent_id)][slug] = c.id
    end
  end
  [parents, children]
end

def read_rows
  CSV.read(CSV_PATH, headers: true).map(&:to_h)
end

def split_multi(value)
  value.to_s.split(';').map(&:strip).reject(&:empty?)
end

# Extrait une date complète "3 March 2021" de la citation, sinon nil
def extract_date(citation)
  m = citation.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+((?:19|20)\d{2})\b/)
  return nil unless m
  month = Date::MONTHNAMES.index(m[2].capitalize) || Date::ABBR_MONTHNAMES.index(m[2].capitalize)
  return nil unless month
  Date.new(m[3].to_i, month, m[1].to_i)
rescue Date::Error
  nil
end

def project_payload(row, category_ids, slug = nil)
  title    = row['Title'].to_s.strip
  slug   ||= slugify(title)
  citation = row['Source/Citation'].to_s.strip
  date     = extract_date(citation)
  year     = date&.year || citation[/\b(?:19|20)\d{2}\b/]

  loc = {
    title:    title,
    slug:     slug,
    subtitle: citation,
    summary:  row['Key Takeaway'].to_s.strip,
    published: true
  }
  loc[:published_at] = date.iso8601 if date # sinon le serveur met la date du jour
  link = row['Link'].to_s.strip
  unless link.empty?
    # header_cta* : ignoré par l'API sur les projets (whitelist serveur) — posé pour le jour
    # où la PR osunyorg/admin sera mergée. En attendant, le bloc call_to_action ci-dessous
    # est le fallback lu par le layout du hero.
    loc[:header_cta]       = true
    loc[:header_cta_label] = 'Open external resource'
    loc[:header_cta_url]   = link
    loc[:blocks] = [{
      template_kind: 'call_to_action',
      data: { elements: [{ title: 'Open external resource', url: link, target_blank: true }] }
    }]
  end

  payload = {
    migration_identifier: "nous-repository-#{slug}",
    year:                 year&.to_i,
    category_ids:         category_ids,
    localizations:        { en: loc }
  }
  # Le serveur exige from_day (déduit de year quand il est absent) :
  # date exacte si trouvée, year-01-01 si année seule, date du jour sinon.
  payload[:from_day] = (date&.iso8601) || (year ? "#{year}-01-01" : Date.today.iso8601)
  payload.compact
end

# --- modes -----------------------------------------------------------------

case MODE
when :dry
  rows = read_rows
  themes = rows.flat_map { |r| split_multi(r['Theme']) }.uniq.sort
  types  = rows.flat_map { |r| split_multi(r['Type']) }.uniq.sort
  puts "CSV : #{rows.size} lignes"
  puts "Thèmes distincts (#{themes.size}) : #{themes.join(' | ')}"
  puts "Types distincts (#{types.size}) : #{types.join(' | ')}"
  puts "\nExemple de payloads (sans résolution des category_ids, aucun appel réseau) :\n\n"
  rows.first(2).each do |row|
    puts JSON.pretty_generate(project_payload(row, ['<id-theme-...>', '<id-type-...>']))
    puts
  end
  puts "Lancer avec --apply pour importer (upsert idempotent via migration_identifier)."

when :categories
  connect!
  fetch_categories.each do |c|
    loc = field(c.localizations, 'en')
    puts [c.id, "taxonomie=#{field(c, :is_taxonomy)}", "parent=#{field(c, :parent_id)}",
          field(loc, :slug), field(loc, :name)].join(' | ')
  end

when :verify
  # Lecture seule : pour chaque ligne du CSV, vérifie que le projet existe côté CMS
  # et que son bloc call_to_action contient bien l'URL du CSV. Utile après un import
  # pour distinguer "l'API a persisté le CTA" de "le sync Hugo ne l'a pas sérialisé".
  connect!
  rows  = read_rows
  index = {}
  fetch_all_projects.each do |p|
    loc = en_loc(p)
    slug = loc[:slug] || loc['slug']
    index[slug] = loc if slug
  end
  ok = 0
  ko = []
  rows.each do |row|
    slug = cms_slug(row['Title'].to_s.strip)
    link = row['Link'].to_s.strip
    loc  = index[slug]
    if loc.nil?
      ko << [slug, 'projet absent du CMS']
      next
    end
    url = cta_url(loc)
    if link.empty? ? url.nil? : url == link
      ok += 1
    else
      ko << [slug, "url persistée=#{url.inspect} vs CSV=#{link.inspect}"]
    end
  end
  puts "#{ok}/#{rows.size} entrées avec CTA vérifié côté CMS (lecture seule, aucun écrit)"
  ko.each { |slug, why| puts "  KO #{slug} — #{why}" }
  abort "#{ko.size} entrée(s) en écart — relancer --apply ou vérifier le sync" unless ko.empty?

when :apply
  connect!
  rows = read_rows
  rows = rows.first(LIMIT) if LIMIT
  puts "#{rows.size} lignes à importer dans le site #{WEBSITE_ID}#{LIMIT ? " (--limit #{LIMIT})" : ''}"

  cats = fetch_categories
  parents, children = category_maps(cats)
  themes_parent = parents['themes'] or abort "Taxonomie 'themes' introuvable — la créer dans l'admin d'abord"
  types_parent  = parents['types']  or abort "Taxonomie 'types' introuvable — la créer dans l'admin d'abord"

  # 1. Créer les catégories manquantes (thèmes / types du CSV)
  wanted = { themes_parent => rows.flat_map { |r| split_multi(r['Theme']) }.uniq,
             types_parent  => rows.flat_map { |r| split_multi(r['Type']) }.uniq }
  missing = []
  wanted.each do |parent_id, names|
    kind = parent_id == themes_parent ? 'theme' : 'type'
    names.each do |name|
      slug = slugify(name)
      missing << { migration_identifier: "nous-repository-#{kind}-#{slug}",
                   parent_id: parent_id,
                   localizations: { en: { name: name, slug: slug } } } unless children[parent_id][slug]
    end
  end
  unless missing.empty?
    puts "Création de #{missing.size} catégories manquantes..."
    categories_api.communication_websites_website_id_portfolio_categories_upsert_post(WEBSITE_ID, body: { categories: missing })
    cats = fetch_categories
    parents, children = category_maps(cats)
  end

  # 2. Indexer les projets existants par slug (toutes locales) pour éviter les doublons :
  #    un slug déjà présent => PATCH par id (on adopte l'entrée avec notre migration_identifier),
  #    sinon => upsert (création).
  existing_by_slug = {}
  fetch_all_projects.each do |p|
    h = p.to_hash
    (h[:localizations] || {}).each_value do |loc|
      existing_by_slug[loc[:slug]] = { id: h[:id], migration_identifier: h[:migration_identifier] } if loc[:slug]
    end
  end
  puts "#{existing_by_slug.size} projets existants indexés par slug"

  to_patch  = [] # [id, migration_identifier, payload]
  to_delete = [] # entrées existantes sans migration_identifier : supprimées puis recréées
  to_create = []
  rows.each do |row|
    slug = slugify(row['Title'].to_s.strip)
    ids  = split_multi(row['Theme']).map { |t| children[themes_parent][slugify(t)] } +
           split_multi(row['Type']).map  { |t| children[types_parent][slugify(t)] }
    payload = project_payload(row, ids.compact, slug)
    ex = existing_by_slug[cms_slug(row['Title'].to_s.strip)]
    if ex && ex[:migration_identifier]
      # Le PATCH exige le migration_identifier de l'entrée (match exact, sinon 422)
      to_patch << [ex[:id], ex[:migration_identifier], payload]
    elsif ex
      to_delete << ex[:id]
      to_create << payload
    else
      to_create << payload
    end
  end
  puts "À supprimer+recréer : #{to_delete.size} | À mettre à jour (PATCH) : #{to_patch.size} | À créer (upsert) : #{to_create.size}"

  to_delete.each do |id|
    projects_api.communication_websites_website_id_portfolio_projects_id_delete(WEBSITE_ID, id)
    puts "DELETE id #{id[0, 8]}… (sera recréé par upsert)"
    sleep 0.2
  end

  to_patch.each_with_index do |(id, mig, payload), i|
    projects_api.communication_websites_website_id_portfolio_projects_id_patch(WEBSITE_ID, id, body: { project: payload.merge(migration_identifier: mig) })
    puts "PATCH #{i + 1}/#{to_patch.size} : #{payload[:localizations][:en][:slug]}"
    sleep 0.3
  end

  to_create.each_slice(BATCH_SIZE).with_index(1) do |slice, i|
    projects_api.communication_websites_website_id_portfolio_projects_upsert_post(WEBSITE_ID, body: { projects: slice })
    puts "Lot #{i} : #{slice.size} projets créés (total #{[i * BATCH_SIZE, to_create.size].min}/#{to_create.size})"
    sleep 0.3 # ménager le rate limit
  end
  puts "Terminé. Pense à lancer « Sync from osuny » dans l'admin, puis git pull ici."
end
