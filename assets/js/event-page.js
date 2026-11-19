// Event page (Futures Labs): table of contents in the left column,
// built from the titles of the blocks (Concept note, Report, Photos, Video…).
// Works whatever the titles typed in Osuny; shown only with 2 titled blocks or more.
const initEventToc = () => {
  if (!document.body.classList.contains('events__page')) return
  const sidebar = document.querySelector('.event-sidebar')
  const titles = [...document.querySelectorAll('.document-content .blocks .block-titled .block-title')]
  if (!sidebar || titles.length < 2) return

  const slugify = (text) =>
    text.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const nav = document.createElement('nav')
  nav.className = 'event-toc'
  nav.setAttribute('aria-label', 'On this page')
  const list = document.createElement('ol')
  nav.appendChild(list)

  const links = titles.map((title, i) => {
    const block = title.closest('.block')
    if (!block.id) block.id = slugify(title.textContent) || `section-${i + 1}`
    const li = document.createElement('li')
    const a = document.createElement('a')
    a.href = `#${block.id}`
    a.textContent = title.textContent.trim()
    li.appendChild(a)
    list.appendChild(li)
    return { a, block }
  })

  sidebar.appendChild(nav)
  document.body.classList.add('has-event-toc')

  // Highlights the section being read
  if (!('IntersectionObserver' in window)) return
  const setCurrent = (block) =>
    links.forEach(({ a, block: b }) => {
      if (b === block) a.setAttribute('aria-current', 'true')
      else a.removeAttribute('aria-current')
    })
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting)
    if (visible.length) setCurrent(visible[0].target)
  }, { rootMargin: '-30% 0px -60% 0px' })
  links.forEach(({ block }) => observer.observe(block))
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEventToc)
} else {
  initEventToc()
}
