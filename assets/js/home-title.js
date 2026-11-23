// Rotating words of the home title: "Header text" field of the Home page in Osuny,
// words separated by " / " (see layouts/_partials/home/hero.html)
const wordsData = document.getElementById('home-title-words');
const WORDS = wordsData ? JSON.parse(wordsData.dataset.words).slice(1) : [];
const DELAY = 3000;
const FADE = 400;

const title = document.querySelector('.page__home .hero h1');

if (title && WORDS.length) {
  const textNode = Array.from(title.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());

  if (textNode) {
    const original = textNode.textContent.trim();
    const words = [original, ...WORDS];
    let index = 0;

    // Screen readers keep the original title, the rotating word is decorative
    const srText = document.createElement('span');
    srText.className = 'sr-only';
    srText.textContent = original;

    const rotating = document.createElement('span');
    rotating.className = 'hero-rotating';
    rotating.setAttribute('aria-hidden', 'true');
    rotating.textContent = original;

    title.replaceChild(rotating, textNode);
    title.insertBefore(srText, rotating);

    setInterval(() => {
      rotating.classList.add('is-hidden');
      setTimeout(() => {
        index = (index + 1) % words.length;
        rotating.textContent = words[index];
        rotating.classList.remove('is-hidden');
      }, FADE);
    }, DELAY);
  }
}
