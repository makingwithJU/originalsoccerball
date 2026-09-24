'use strict';
(() => {
  // Boundary masking belongs to the production slow-motion pass. Keep the
  // implementation available, but do not transform chapter geometry while
  // the build is explicitly running in fast/native-scroll mode.
  if (document.documentElement.dataset.motionBuild !== 'slow') return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let previous = new Set(), frame = 0;
  function paint() {
    frame = 0;
    const active = new Set();
    if (!reduced.matches) {
      const blocks = [document.querySelector('#hero-scroll-zone'), ...document.querySelectorAll('.chapter-stage')].filter(Boolean);
      const y = scrollY, height = innerHeight;
      for (let i = 0; i < blocks.length - 1; i++) {
        const start = y + blocks[i].getBoundingClientRect().bottom - height;
        const end = y + blocks[i + 1].getBoundingClientRect().top;
        if (y < start || y >= end || end <= start) continue;
        const outgoing = blocks[i].querySelector(':scope > .chapter');
        const incoming = blocks[i + 1].querySelector(':scope > .chapter');
        if (!outgoing || !incoming) continue;
        const distance = end - start, p = (y - start) / distance;
        function set(section, shift, top, bottom, layer) {
          active.add(section);
          section.classList.add('chapter-boundary-visual');
          section.style.setProperty('--boundary-y', `${shift}px`);
          section.style.setProperty('--boundary-top', `${top}px`);
          section.style.setProperty('--boundary-bottom', `${bottom}px`);
          section.style.setProperty('--boundary-layer', layer);
        }
        // Moving reveal edge with only 15% content travel, like the reference's
        // opposing outer/inner wrappers. Parent geometry stays untransformed.
        set(outgoing, (distance - height * .15) * p, 0, height * .85 * p, 1);
        set(incoming, -(distance - height * .15) * (1 - p), height * .85 * (1 - p), 0, 2);
        break;
      }
    }
    for (const section of previous) if (!active.has(section)) {
      section.classList.remove('chapter-boundary-visual');
      for (const name of ['y','top','bottom','layer']) section.style.removeProperty(`--boundary-${name}`);
    }
    previous = active;
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(paint); }
  addEventListener('scroll', schedule, {passive:true});
  addEventListener('resize', schedule, {passive:true});
  document.addEventListener('jugend:chapter-visibility', schedule);
  reduced.addEventListener('change', schedule);
  schedule();
  document.addEventListener('jugend:scroll-frame',()=>{cancelAnimationFrame(frame);frame=0;paint();});
})();
