// Showcase tabs: a badge shows its panel in the purple frame, the other tabs are shown as cards
document.querySelectorAll('[data-showcase]').forEach((showcase) => {
  const tabs = Array.from(showcase.querySelectorAll('[role="tab"]'));

  const select = (selected) => {
    tabs.forEach((tab) => {
      const isSelected = tab === selected;
      tab.setAttribute('aria-selected', isSelected);
      tab.tabIndex = isSelected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !isSelected;
      const card = showcase.querySelector(`[data-showcase-card="${tab.id}"]`);
      if (card) {
        card.hidden = isSelected;
      }
    });
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));

    tab.addEventListener('keydown', (event) => {
      let next = null;
      if (event.key === 'ArrowRight') {
        next = tabs[(index + 1) % tabs.length];
      } else if (event.key === 'ArrowLeft') {
        next = tabs[(index - 1 + tabs.length) % tabs.length];
      }
      if (next) {
        event.preventDefault();
        select(next);
        next.focus();
      }
    });
  });
});
