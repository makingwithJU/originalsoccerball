'use strict';
(() => {
  const root = document.documentElement;
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  function setTheme(light) {
    root.classList.toggle('theme-invert', light);
    toggle.setAttribute('aria-pressed', String(light));
  }

  setTheme(false);

  toggle.addEventListener('click', () => {
    const isCurrentlyLight = root.classList.contains('theme-invert');
    setTheme(!isCurrentlyLight);
  });
})();
