#!/usr/bin/env ruby
# frozen_string_literal: true

# Prépare la page de données de la carte HR (/hr-genealogies/) dans Osuny, via le
# client API officiel (gem osuny_api) : la page « hr-map-data » (parent hr-genealogies,
# publiée — le sync git ne génère que les contenus publiés) porte un bloc « files ».
#
# Le CSV est déposé À LA MAIN dans ce bloc, dans l'admin (le bloc crée alors
# automatiquement la page Fichier). Au build, scripts/build-hr-map.js suit :
#   front matter hr-map-data -> data.files[0].file -> page File -> original_blob.id
#   -> data/media/<xx>/<id>.yml -> direct_url (S3) -> fetch -> static/hr-map.json
# avec hr-map/fallback.csv (repo) en fallback si le bloc est absent ou le fetch échoue.
#
# La page est rendue invisible côté site par la cascade `_build.render: never`
# dans config/_default/config.yaml.
#
# Usage :
#   bundle exec ruby import-hr-map.rb --init-block   # pose le bloc files (vide) — première fois seulement
#   bundle exec ruby import-hr-map.rb --apply        # upsert la page SANS toucher aux blocs (conserve le
#                                                    # fichier rempli à la main) et vide featured_media_id
#   bundle exec ruby import-hr-map.rb --verify       # lecture seule : page + bloc files rempli ?
#   bundle exec ruby import-hr-map.rb                # dry-run (plan, aucun réseau)
#
# Config : même .env que import-repository.rb (OSUNY_API_HOST, OSUNY_API_TOKEN, OSUNY_WEBSITE_ID).

require 'json'

# Charge .env sans dépendance (même convention que import-repository.rb)
env_file = File.join(__dir__, '.env')
if File.exist?(env_file)
  File.foreach(env_file) do |line|
    line = line.strip
    next if line.empty? || line.start_with?('#')
    k, v = line.split('=', 2)
    ENV[k] = v if k && !k.empty? && !ENV.key?(k)
  end
end

HOST       = ENV.fetch('OSUNY_API_HOST', 'nous.osuny.org')
WEBSITE_ID = ENV.fetch('OSUNY_WEBSITE_ID') { abort 'OSUNY_WEBSITE_ID manquant (voir .env.example)' }

PARENT_SLUG   = 'hr-genealogies'        # page parente dans l'admin (non modifiée)
PAGE_MIG      = 'nous-hr-map-data'      # migration_identifier de la page de données
PAGE_SLUG     = 'hr-map-data'
BLOCK_MIG     = 'nous-hr-map-csv'       # migration_identifier du bloc files
OLD_BLOCK_MIG = 'nous-hr-map-datatable' # ancien bloc datatable (expériences), supprimé

MODE = if ARGV.include?('--apply')      then :apply
       elsif ARGV.include?('--init-block') then :init_block
       elsif ARGV.include?('--verify')     then :verify
       else :dry
       end

# --- helpers ---------------------------------------------------------------

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

def pages_api = OsunyApi::CommunicationWebsitePageApi.new

def fetch_all_pages
  all  = []
  page = 1
  loop do
    batch = pages_api.communication_websites_website_id_pages_get(WEBSITE_ID, per_page: 100, page_num: page)
    break if batch.nil? || batch.empty?
    all.concat(batch)
    break if batch.size < 100
    page += 1
  end
  all
end

def page_id_by_slug(slug)
  p = fetch_all_pages.find do |pg|
    loc = (pg.to_hash[:localizations] || {})[:en] || {}
    (loc[:slug] || loc['slug']) == slug
  end
  p && p.id
end

def data_page
  fetch_all_pages.find { |pg| pg.to_hash[:migration_identifier] == PAGE_MIG }
end

def en_loc(page)
  locs = page.to_hash[:localizations] || {}
  locs[:en] || locs['en'] || {}
end

def files_block(empty: true)
  {
    migration_identifier: BLOCK_MIG,
    template_kind: 'files',
    title: 'HR map CSV',
    published: true,
    data: { elements: [empty ? { title: 'hr-map.csv', file: {} } : {}] }
  }
end

# --- modes -----------------------------------------------------------------

case MODE
when :dry
  puts "Plan : page « #{PAGE_SLUG} » (mig #{PAGE_MIG}, parent #{PARENT_SLUG}, published=true) + bloc files « #{BLOCK_MIG} »"
  puts "  --init-block : pose le bloc (élément vide, à remplir à la main dans l'admin)"
  puts "  --apply      : upsert la page sans toucher aux blocs, vide featured_media_id"
  puts "  --verify     : vérifie que le bloc files pointe vers une page Fichier remplie"
  puts "Au build : scripts/build-hr-map.js lit le bloc files (fallback : hr-map/fallback.csv)."

when :verify
  # Lecture seule : la page existe, le bloc files a un communication_file_id renseigné.
  connect!
  page = data_page
  abort "Page '#{PAGE_MIG}' introuvable" if page.nil?
  loc  = en_loc(page)
  blocks = loc[:blocks] || loc['blocks'] || []
  block = blocks.find { |b| (b[:migration_identifier] || b['migration_identifier']) == BLOCK_MIG }
  abort "Bloc files #{BLOCK_MIG} absent de la page (lancer --init-block)" if block.nil?
  data = block[:data] || block['data'] || {}
  file = ((data[:elements] || data['elements'] || []).first || {})[:file] || {}
  file_id = file[:communication_file_id] || file['communication_file_id']
  if file_id.nil?
    puts "Bloc présent mais VIDE — à remplir à la main dans l'admin (ajouter un document dans le bloc)."
    exit 1
  end
  puts "OK page=#{page.id[0, 8]} bloc=#{BLOCK_MIG} communication_file_id=#{file_id}"

when :init_block, :apply
  connect!
  parent_id = page_id_by_slug(PARENT_SLUG)
  abort "Page parente '#{PARENT_SLUG}' introuvable dans le CMS" if parent_id.nil?

  loc = {
    title: 'HR map data',
    slug: PAGE_SLUG,
    published: true,          # obligatoire : le sync git ne génère que les publiés (render:never côté Hugo)
    featured_media_id: nil    # plus de média en « image » : le fallback build est hr-map/fallback.csv
  }
  if MODE == :init_block
    loc[:blocks] = [files_block(empty: true), { migration_identifier: OLD_BLOCK_MIG, _destroy: true }]
  end
  # En --apply, pas de clé blocks -> les blocs existants (dont le files rempli à la main) sont conservés.
  payload = { migration_identifier: PAGE_MIG, parent_id: parent_id, localizations: { en: loc } }
  pages_api.communication_websites_website_id_pages_upsert_post(WEBSITE_ID, body: { pages: [payload] })
  puts MODE == :init_block ?
    "Page #{PAGE_SLUG} créée/màj, bloc files posé (élément vide — à remplir dans l'admin)." :
    "Page #{PAGE_SLUG} mise à jour (blocs conservés, featured_media_id vidé)."
  puts "Puis : « Sync from osuny » dans l'admin, git pull ici, et --verify."
end
