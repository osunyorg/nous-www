// Provocations (posts index): "Show all provocations" button under the green cards,
// same logic as "Load More Gatherings" on /futures-labs/ and "Show all" on /hr-genealogies/:
// the featured post + the first 10 green cards are shown, the button shows the others, then "Show less".
const CARDS_SHOWN = 10

const initProvocations = () => {
  const list = document.querySelector('body.posts__section ul.posts--highlight')
  // The first item is the featured post, the others are the green cards
  const cards = list ? [...list.querySelectorAll(':scope > li')].slice(1) : []
  if (cards.length <= CARDS_SHOWN) return

  let open = false

  const more = document.createElement('button')
  more.type = 'button'
  more.className = 'posts-more'
  list.after(more)

  const update = () => {
    cards.forEach((li, index) => {
      li.hidden = !open && index >= CARDS_SHOWN
    })
    more.setAttribute('aria-expanded', open ? 'true' : 'false')
    more.textContent = open ? 'Show less' : 'Show all provocations'
  }

  more.addEventListener('click', () => {
    open = !open
    update()
    // Back to the top of the list when closing
    if (!open) list.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })

  update()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProvocations)
} else {
  initProvocations()
}
