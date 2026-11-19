// Futures Labs: "Load more" buttons under the Upcoming and Past Gatherings cards,
// same logic as "Load More Jams" on /hr-jams/ and "Show all" on /hr-genealogies/:
// the first 3 events are shown, the button shows the others, then "Show less".
// The number of events available comes from the "quantity" of each block in Osuny.
const EVENTS_SHOWN = 3

const LISTS = [
  // Upcoming: the grid agenda block without the light green background
  {
    selector: '.page-futures-labs .block-agenda--grid:not(.block-class-light-green-bg)',
    label: 'Load More Gatherings',
  },
  // Past Gatherings: the grid agenda block with the light green background
  {
    selector: '.page-futures-labs .block-agenda--grid.block-class-light-green-bg',
    label: 'Load all past gatherings',
  },
]

const initEventsMore = ({ selector, label }) => {
  const block = document.querySelector(selector)
  const list = block?.querySelector('ul.events')
  const items = list ? [...list.querySelectorAll(':scope > li')] : []
  if (items.length <= EVENTS_SHOWN) return

  let open = false

  const more = document.createElement('button')
  more.type = 'button'
  more.className = 'events-more'
  list.after(more)

  const update = () => {
    items.forEach((li, index) => {
      li.hidden = !open && index >= EVENTS_SHOWN
    })
    more.setAttribute('aria-expanded', open ? 'true' : 'false')
    more.textContent = open ? 'Show less' : label
  }

  more.addEventListener('click', () => {
    open = !open
    update()
    // Back to the top of the list when closing
    if (!open) block.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })

  update()
}

const initFuturesLabs = () => LISTS.forEach(initEventsMore)

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFuturesLabs)
} else {
  initFuturesLabs()
}
