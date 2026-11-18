const initJams = () => {
  const jobs = document.querySelectorAll('.page-hr-jams .job')
  if (!jobs.length) return

  // Extrait l'ID YouTube d'une URL (watch?v=, youtu.be, embed, shorts)
  const getYoutubeId = (url) => {
    try {
      const u = new URL(url.replace(/\u00a0/g, ' ').trim())
      if (u.hostname.includes('youtu.be')) return u.pathname.slice(1)
      if (u.pathname.startsWith('/embed/') || u.pathname.startsWith('/shorts/')) {
        return u.pathname.split('/')[2]
      }
      return u.searchParams.get('v')
    } catch (e) {
      return null
    }
  }

  // Une seule popup pour toute la page
  const dialog = document.createElement('dialog')
  dialog.className = 'jam-modal'
  dialog.setAttribute('aria-label', 'Video')
  dialog.innerHTML = `
    <button type="button" class="jam-modal__close" aria-label="Close">&times;</button>
    <div class="jam-modal__frame"></div>`
  document.body.appendChild(dialog)

  const frame = dialog.querySelector('.jam-modal__frame')

  const close = () => dialog.close()
  dialog.querySelector('.jam-modal__close').addEventListener('click', close)
  // Clic sur le fond = fermeture
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close() })
  // On vide l'iframe pour couper la vidéo
  dialog.addEventListener('close', () => { frame.innerHTML = '' })

  jobs.forEach((job) => {
    const subtitle = job.querySelector('.job-subtitle')
    const media = job.querySelector('.media')
    if (!subtitle || job.dataset.jamReady) return

    const url = subtitle.textContent
    const id = getYoutubeId(url)
    if (!id) return
    job.dataset.jamReady = 'true'

    // Short YouTube = vidéo verticale (cadre 9/16)
    if (url.includes('/shorts/')) job.dataset.vertical = ''

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'jam-play'
    button.textContent = 'Watch the jam'
    button.setAttribute('aria-label', 'Watch the jam')

    button.addEventListener('click', () => {
      frame.innerHTML = `<iframe
        src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0"
        title="Human Rights Jam"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen></iframe>`
      // Popup verticale pour les Shorts (optionnel, voir le Sass .jam-modal--vertical)
      dialog.classList.toggle('jam-modal--vertical', 'vertical' in job.dataset)
      dialog.showModal()
    })

    // Le bouton va sur l'image (sinon dans le contenu s'il n'y a pas d'image)
    ;(media || job.querySelector('.job-content'))?.appendChild(button)

    // Image pour le fond flouté
    const img = media?.querySelector('img')
    if (img) {
      const setBg = () =>
        media.style.setProperty('--jam-img', `url("${img.currentSrc || img.src}")`)
      img.complete ? setBg() : img.addEventListener('load', setBg)
    }
  })

  initJamFilters()
}

// "Browse the jams": filters (All / YouTube videos / YouTube Shorts)
// a "Search jam" field on the titles,
// and a "Load more Jams" button, same logic as "Show all" on /hr-genealogies/:
// the first 3 jams are shown, the button shows the others, then "Show less".
// Shorts are recognised by their /shorts/ link (data-vertical, set above).
// The block is the grid jobs block without the light green background.
const JAMS_SHOWN = 3

const initJamFilters = () => {
  const block = document.querySelector(
    '.page-hr-jams .block-jobs--grid:not(.block-class-light-green-bg)'
  )
  const list = block?.querySelector('ul.jobs')
  const items = list ? [...list.querySelectorAll(':scope > li')] : []
  if (!items.length) return

  const filters = [
    { label: 'All', match: () => true },
    { label: 'YouTube videos', match: (job) => !('vertical' in job.dataset) },
    { label: 'YouTube Shorts', match: (job) => 'vertical' in job.dataset },
  ]
  let current = filters[0]
  let query = ''
  let open = false

  // Search on the titles: case and accents are ignored
  const normalize = (text) =>
    text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const titles = new Map(
    items.map((li) => [li, normalize(li.querySelector('.job-title')?.textContent || '')])
  )

  // Message when no jam matches
  const empty = document.createElement('p')
  empty.className = 'jam-empty'
  empty.textContent = 'No jam found.'
  empty.hidden = true
  list.after(empty)

  // "Load more Jams" / "Show less", under the videos
  const more = document.createElement('button')
  more.type = 'button'
  more.className = 'jam-more'
  more.setAttribute('aria-expanded', 'false')
  empty.after(more)

  const update = () => {
    const matching = items.filter((li) => {
      const job = li.querySelector('.job')
      return job && current.match(job) && titles.get(li).includes(query)
    })
    items.forEach((li) => {
      const index = matching.indexOf(li)
      li.hidden = index === -1 || (!open && index >= JAMS_SHOWN)
    })
    more.hidden = matching.length <= JAMS_SHOWN
    empty.hidden = matching.length > 0
    more.setAttribute('aria-expanded', open ? 'true' : 'false')
    more.textContent = open ? 'Show less' : 'Load More Jams'
  }

  more.addEventListener('click', () => {
    open = !open
    update()
    // Back to the top of the list when closing
    if (!open) block.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })

  const bar = document.createElement('div')
  bar.className = 'jam-filters'
  bar.setAttribute('role', 'group')
  bar.setAttribute('aria-label', 'Filter the jams')

  const buttons = filters.map((filter, i) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'jam-filter'
    button.textContent = filter.label
    button.setAttribute('aria-pressed', i === 0 ? 'true' : 'false')
    button.addEventListener('click', () => {
      buttons.forEach((b) => b.setAttribute('aria-pressed', b === button ? 'true' : 'false'))
      current = filter
      open = false
      update()
    })
    bar.appendChild(button)
    return button
  })

  // "Search jam" field, on the same line, aligned on the right
  const search = document.createElement('input')
  search.type = 'search'
  search.className = 'jam-search'
  search.placeholder = 'Search jam'
  search.setAttribute('aria-label', 'Search jam')
  search.addEventListener('input', () => {
    query = normalize(search.value)
    open = false
    update()
  })
  bar.appendChild(search)

  // Under the description ("Bite-size interventions…"), otherwise at the end of the top
  const top = block.querySelector('.top')
  const description = top?.querySelector('.description')
  if (description) description.after(bar)
  else if (top) top.appendChild(bar)
  else list.before(bar)

  update()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initJams)
} else {
  initJams()
}
