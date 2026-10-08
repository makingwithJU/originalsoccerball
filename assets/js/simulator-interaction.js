'use strict';
(() => {
  const touch = navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches;
  if (!touch) return;

  const chapter = document.querySelector('#simulator');
  const shell = chapter?.querySelector('.device-shell');
  const frame = document.querySelector('#simulatorIframe');
  if (!chapter || !shell || !frame) return;

  function sync() {
    const active = chapter.dataset.sceneVisible === 'true' && chapter.dataset.sceneInteractive === 'true' && shell.dataset.rotationComplete === 'true';
    if (active) {
      shell.inert = false;
      frame.style.pointerEvents = 'auto';
    } else {
      frame.style.removeProperty('pointer-events');
    }
  }

  document.addEventListener('jugend:scroll-frame', sync);
  document.addEventListener('jugend:chapter-visibility', sync);
  addEventListener('pageshow', sync, { passive: true });
  sync();
})();
