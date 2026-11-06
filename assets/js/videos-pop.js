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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initJams)
} else {
  initJams()
}
