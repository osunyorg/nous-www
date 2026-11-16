// Form popups (contact, pitch…) — markup: layouts/_partials/footer/form-modals.html, texts: data/forms.yaml
// A popup "<key>-modal" opens with:
// - a link to "#<key>" (e.g. "#contact"),
// - an element with data-modal-open="<key>" (e.g. the "Submit a Pitch!" button),
// - a link with URL "#" whose text is the popup's trigger_text (e.g. "Get in touch").

const initForm = (dialog) => {
  const form = dialog.querySelector('.modal-form')
  const status = form.querySelector('.modal-form__status')
  const submit = form.querySelector('.modal-form__submit')
  const fields = form.querySelectorAll('input:not([type="hidden"]):not(.modal-form__hp), select, textarea')

  const close = () => dialog.close()
  dialog.querySelector('[data-modal-close]').addEventListener('click', close)
  // Click on the backdrop closes the popup
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close() })

  // Character counters ("0 / 1500")
  const counters = form.querySelectorAll('.modal-form__counter')
  const updateCounters = () => counters.forEach((counter) => {
    const field = form.querySelector(`#${counter.dataset.counterFor}`)
    counter.textContent = `${field.value.length} / ${field.maxLength}`
  })
  form.addEventListener('input', updateCounters)

  // Validation: message under each invalid field, after a first try
  const check = (field) => {
    const valid = field.checkValidity()
    field.setAttribute('aria-invalid', valid ? 'false' : 'true')
    const error = form.querySelector(`.modal-form__error[data-for="${field.id}"]`)
    if (error) {
      error.hidden = valid
      if (valid) field.removeAttribute('aria-describedby')
      else field.setAttribute('aria-describedby', error.id)
    }
    return valid
  }
  fields.forEach((field) => {
    const recheck = () => { if (field.getAttribute('aria-invalid') === 'true') check(field) }
    field.addEventListener('input', recheck)
    field.addEventListener('change', recheck)
    field.addEventListener('blur', () => { if (field.value) check(field) })
  })

  const setStatus = (text, type) => {
    status.textContent = text || ''
    status.dataset.type = type || ''
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    setStatus('')
    const invalid = [...fields].filter((field) => !check(field))
    if (invalid.length) {
      invalid[0].focus()
      return
    }

    const action = form.getAttribute('action')
    if (!action) {
      setStatus(form.dataset.error, 'error')
      console.warn(`[forms] No "action" for ${dialog.id} in data/forms.yaml: the form is not sent.`)
      return
    }

    submit.disabled = true
    try {
      const response = await fetch(action, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      })
      if (!response.ok) throw new Error(response.status)
      form.reset()
      fields.forEach((field) => field.removeAttribute('aria-invalid'))
      updateCounters()
      setStatus(form.dataset.success, 'success')
    } catch (err) {
      setStatus(form.dataset.error, 'error')
    } finally {
      submit.disabled = false
    }
  })
}

const initFormModals = () => {
  const dialogs = [...document.querySelectorAll('dialog.form-modal')]
    .filter((dialog) => typeof dialog.showModal === 'function')
  if (!dialogs.length) return
  dialogs.forEach(initForm)

  const byKey = Object.fromEntries(dialogs.map((d) => [d.id.replace(/-modal$/, ''), d]))

  const findDialog = (el) => {
    if (el.dataset.modalOpen) return byKey[el.dataset.modalOpen]
    if (el.tagName !== 'A') return null
    const href = el.getAttribute('href') || ''
    const hash = href.split('#')[1]
    if (hash && byKey[hash] && (href.startsWith('#') || href.startsWith('/#'))) return byKey[hash]
    if (href === '#' || href === '') {
      const text = el.textContent.trim().toLowerCase()
      return dialogs.find((d) => (d.dataset.triggerText || '').toLowerCase() === text)
    }
    return null
  }

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('a, [data-modal-open]')
    const dialog = trigger && findDialog(trigger)
    if (!dialog) return
    e.preventDefault()
    dialog.showModal()
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFormModals)
} else {
  initFormModals()
}
