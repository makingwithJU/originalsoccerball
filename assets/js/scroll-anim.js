// Section-level scroll animations (HERO untouched)
(function(){
  // タッチデバイスの場合はスクロールアニメーションを無効化
  if (document.documentElement.classList.contains('is-touch-device')) {
    return;
  }

  function $(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }
  function once(fn){ var done=false; return function(){ if(!done){ done=true; fn(); } }; }

  function setupStagger(section){
    var targets = [];
    targets = targets.concat($(".gs-overline, .gs-heading", section).filter(function(el){
      return !el.matches('[data-ju-slide="heading"]');
    }));
    targets = targets.concat($(".gs-card, .gs-work-card, .gs-feature-card", section));
    targets.forEach(function(el, i){ el.style.transitionDelay = (Math.min(i, 8) * 80) + 'ms'; });
  }

  function markAnim(section){
    if (section.dataset.juAnim === '1') return;
    section.classList.add('ju-anim'); // base animation
    section.dataset.juAnim = '1';
    setupStagger(section);
  }

  function init(){
    var hero = document.getElementById('hero');
    var sections = $('main section');
    sections.forEach(function(sec){
      if (sec !== hero) markAnim(sec);
    });

    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if (!e.isIntersecting) return;
        e.target.classList.add('is-inview');
        if (io && io.unobserve) { io.unobserve(e.target); }
      });
    }, { root:null, rootMargin:'0px', threshold:0.14 });
    sections.forEach(function(sec){ if (sec !== hero) io.observe(sec); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
})();
