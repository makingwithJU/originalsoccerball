'use strict';
(() => {
  const frames = [...document.querySelectorAll('iframe[data-src*="youtube.com"]')];
  const visible = new Set(), players = new Map(), pending = new Set();
  const playback = new WeakMap(), statuses = new Map();
  let requested = false;
  function status(frame, text, retry = false) {
    const node = statuses.get(frame);
    if (!node) return;
    node.hidden = !text;
    node.textContent = text || '';
    node.disabled = !retry;
  }
  function sync(frame) {
    const player = players.get(frame);
    if (!player || frame.dataset.ready !== 'true') return;
    const chapter = frame.closest('.chapter');
    // Playback is presentation, not user input. It can start inside the portal
    // while the rotating device itself correctly remains inert.
    const ready = !window.JUScenes || chapter?.dataset.motionReady === 'true' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const playing = visible.has(frame) && !document.hidden && chapter?.dataset.covered !== 'true' && ready;
    if (playback.get(frame) === playing) return;
    playback.set(frame, playing);
    if (playing) {
      player.mute(); player.playVideo();
    } else player.pauseVideo();
  }
  function connect(frame) {
    if (players.has(frame) || !window.YT?.Player) return;
    players.set(frame, new YT.Player(frame, {events:{
      onReady: () => { frame.dataset.ready = 'true'; sync(frame); },
      onStateChange: event => { if (event.data === 1) status(frame, ''); },
      onAutoplayBlocked: () => status(frame, 'タップして動画を再生', true),
      onError: () => status(frame, '動画を読み込めませんでした')
    }}));
  }
  function load(frame) {
    if (!frame.src) {
      frame.loading = 'eager';
      const url = new URL(frame.dataset.src);
      url.searchParams.set('autoplay', '0');
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
    if (isIntersecting && (!window.JUScenes || window.JUScenes.visible(target.closest('.chapter')?.id))) { visible.add(target); load(target); }
    else visible.delete(target);
    sync(target);
  }), {threshold:.15});
  frames.forEach((frame,index) => {
    frame.id ||= 'jugend-video-'+(index+1);
    if (frame.closest('.device-shell')) {
      const node = document.createElement('button');
      node.type = 'button'; node.className = 'device-media-status';
      node.setAttribute('aria-live', 'polite');
      frame.parentElement.append(node); statuses.set(frame, node);
      status(frame, '動画を準備中…');
      node.addEventListener('click', () => { players.get(frame)?.mute(); players.get(frame)?.playVideo(); });
    }
    observer.observe(frame);
  });
  document.addEventListener('visibilitychange', () => frames.forEach(sync));
  document.addEventListener('jugend:chapter-visibility', () => frames.forEach(frame => {
    const id = frame.closest('.chapter')?.id;
    if (window.JUScenes?.near(id)) load(frame);
    if (window.JUScenes?.visible(id)) { visible.add(frame); load(frame); }
    else visible.delete(frame);
    sync(frame);
  }));
  // Begin the local simulator's lazy boot before its rotating shell is exposed.
  const simulator = document.querySelector('#simulatorIframe');
  document.addEventListener('jugend:chapter-visibility', () => {
    if (simulator && window.JUScenes?.near('simulator')) simulator.loading = 'eager';
  });
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
    if (document.documentElement.classList.contains('spiral-scenes')) return;
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
