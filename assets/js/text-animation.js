(function(){
  const supportsMotion = !window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const headings = [];

  function init(){
    const nodes = Array.prototype.slice.call(document.querySelectorAll('.animate-me'));
    nodes.forEach(splitIntoSpans);
    nodes.forEach(registerObserver);
  }

  function splitIntoSpans(node){
    if (!node || node.dataset.juSplit === '1') return;
    const lines = node.innerHTML.split(/<br\s*\/?>/i);
    const frag = document.createDocumentFragment();

    lines.forEach((line, lineIndex) => {
      Array.from(line).forEach((char, index) => {
        const span = document.createElement('span');
        span.className = 'ju-char';
        span.dataset.index = index;
        span.style.setProperty('--ju-char-index', index);
        span.textContent = char === ' ' ? '\u00a0' : char;
        frag.appendChild(span);
      });
      if (lineIndex < lines.length - 1){
        frag.appendChild(document.createElement('br'));
      }
    });

    node.innerHTML = '';
    node.appendChild(frag);
    node.dataset.juSplit = '1';
  }

  function registerObserver(node){
    if (!node) return;
    headings.push(node);
  }

  const animate = (entry) => {
    const el = entry.target;
    if (!supportsMotion){
      el.classList.add('is-visible');
      observer.unobserve(el);
      return;
    }
    observer.unobserve(el);
    playAnimation(el);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) animate(entry);
    });
  }, { root: null, threshold: 0.45, rootMargin: '0px 0px -10%' });

  function playAnimation(node){
    const spans = node.querySelectorAll('.ju-char');
    if (!spans.length){
      node.classList.add('is-visible');
      return;
    }
    node.classList.add('is-visible');
    spans.forEach(span => {
      span.style.willChange = 'transform, opacity';
      span.classList.remove('ju-char-visible');
    });

    spans.forEach((span, index) => {
      const delay = index * 18;
      setTimeout(() => {
        span.classList.add('ju-char-visible');
        if (index === spans.length - 1){
          setTimeout(() => {
            spans.forEach(s => (s.style.willChange = 'auto'));
          }, 320);
        }
      }, delay);
    });
  }

  // This function ensures the animation logic runs only after all fonts are loaded.
async function runTextAnimation() {
  try {
    // Wait for all fonts specified in CSS to be loaded and ready.
    await document.fonts.ready;
    
    // Now that fonts are ready, initialize the animations.
    init();
    headings.forEach(node => observer.observe(node));
  } catch (error) {
    console.error('Font loading failed, running animations with fallback fonts.', error);
    // If fonts fail to load, run the animation anyway to ensure content is visible.
    init();
    headings.forEach(node => observer.observe(node));
  }
}

// Run the animation setup only when the document and fonts are fully ready.
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', runTextAnimation);
} else {
  runTextAnimation();
}

})();
