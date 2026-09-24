'use strict';
(() => {
  const frames = [...document.querySelectorAll('iframe[data-src*="youtube.com"]')];
  const visible = new Set(), players = new Map(), pending = new Set();
  let requested = false;
  function sync(frame) {
    const player = players.get(frame);
    if (!player || frame.dataset.ready !== 'true') return;
    if (visible.has(frame) && !document.hidden && frame.closest('.chapter')?.dataset.covered !== 'true') {
      player.mute(); player.playVideo();
    } else player.pauseVideo();
  }
  function connect(frame) {
    if (players.has(frame) || !window.YT?.Player) return;
    players.set(frame, new YT.Player(frame, {events:{
      onReady: () => { frame.dataset.ready = 'true'; sync(frame); }
    }}));
  }
  function load(frame) {
    if (!frame.src) {
      const url = new URL(frame.dataset.src);
      url.searchParams.set('origin', location.origin); frame.src = url.href;
    }
    pending.add(frame);
    if (window.YT?.Player) { connect(frame); return; }
    if (requested) return;
    requested = true;
    window.onYouTubeIframeAPIReady = () => pending.forEach(connect);
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
    document.head.append(script);
  }
  const observer = new IntersectionObserver(entries => entries.forEach(({target,isIntersecting}) => {
    if (isIntersecting) { visible.add(target); load(target); }
    else visible.delete(target);
    sync(target);
  }), {threshold:.15});
  frames.forEach((frame,index) => { frame.id ||= 'jugend-video-'+(index+1); observer.observe(frame); });
  document.addEventListener('visibilitychange', () => frames.forEach(sync));
  document.addEventListener('jugend:chapter-visibility', () => frames.forEach(sync));
  const notice = document.querySelector('#site-notice'); const footer = document.querySelector('footer');
  const header = document.querySelector('.site-header');
  function measureHeader() {
    document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
  }
  new ResizeObserver(measureHeader).observe(header);
  measureHeader();
  function measureFooter() {
    document.documentElement.style.setProperty('--notice-height', `${notice.offsetHeight}px`);
    document.documentElement.style.setProperty('--footer-height', `${footer.offsetHeight + notice.offsetHeight}px`);
  }
  const finalSection = document.querySelector('#contact-apology');
  const footerObserver = new IntersectionObserver(entries => {
    const entry = entries.find(item => item.target === finalSection);
    if (!entry?.isIntersecting) return;
    // Once reached, retain the footer and its established safe-area layout
    // throughout backward navigation as well.
    document.documentElement.classList.add('footer-visible');
    measureFooter();
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
  if (finalSection) footerObserver.observe(finalSection);
  new ResizeObserver(measureFooter).observe(footer); new ResizeObserver(measureFooter).observe(notice);
})();
