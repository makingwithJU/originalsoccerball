'use strict';
(() => {
  function init() {
    const root = document.documentElement;
    const hero = document.querySelector('#hero');
    const zone = document.querySelector('#hero-scroll-zone');
    const video = document.querySelector('#hero-video');
    const media = hero?.querySelector('.hero-video');
    if (!root || !hero || !zone || !video || !media) return;

    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const coarsePointer = matchMedia('(pointer: coarse)');
    const clamp = n => Math.max(0, Math.min(1, n));

    // IMPORTANT: these timing relationships are the approved pre-V19 HERO
    // timeline. Do not change them when changing the media transport.
    const HERO_TRANSITION_START = .60;
    const HERO_SITE_START = .94;
    const FACE_START = .15;
    const FACE_SPAN = .45;
    const FILM_SCROLL_END = .60;
    const FRAME_COUNT = 140; // newhero.mp4: 5.833333 s @ 24 fps

    function deviceTier() {
      const minSide = Math.min(innerWidth, innerHeight);
      if (coarsePointer.matches && minSide < 600) return 'phone';
      if (coarsePointer.matches || innerWidth < 1000) return 'tablet';
      return 'desktop';
    }

    let tier = deviceTier();
    let currentProgress = 0;
    let requestedProgress = 0;
    let displayedFrame = -1;
    let scrollRaf = 0;
    let resizeRaf = 0;
    let introReady = false;
    let firstFrameReady = false;
    let waitingTimer = 0;
    const decoded = new Map();
    const pending = new Map();
    const failedFrames = new Set();
    const retries = new Map();
    const retryTimers = new Map();
    const retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.className = 'hero-media-retry';
    retryButton.textContent = '映像を再読み込み';
    retryButton.hidden = true;
    hero.append(retryButton);
    retryButton.addEventListener('click', () => {
      for (const timer of retryTimers.values()) clearTimeout(timer);
      retryTimers.clear(); retries.clear(); failedFrames.clear();
      retryButton.hidden = true;
      scheduleSync();
    });
    function markFailed(index) {
      failedFrames.add(index);
      const attempt = (retries.get(index) || 0) + 1;
      retries.set(index, attempt);
      if (attempt > 3) return;
      const expectedTier = tier;
      retryTimers.set(index, setTimeout(() => {
        retryTimers.delete(index);
        if (expectedTier !== tier) return;
        failedFrames.delete(index);
        if (heroIsNear()) scheduleSync();
      }, 750 * 2 ** (attempt - 1)));
    }
    // Bound decoded RGBA residency, not just compressed transfer size.
    const MAX_DECODED = 18;
    const MAX_PENDING = 6;
    const heroIsNear = () => !window.JUScenes || window.JUScenes.visible('hero') || window.JUScenes.near('hero');
    const loadingStatus = document.createElement('p');
    loadingStatus.className = 'hero-loading-status';
    loadingStatus.setAttribute('role', 'status');
    loadingStatus.setAttribute('aria-label', '映像を読み込んでいます');
    loadingStatus.hidden = true;
    hero.append(loadingStatus);
    function waiting(active) {
      if (!active) {
        clearTimeout(waitingTimer); waitingTimer = 0;
        loadingStatus.hidden = true;
        hero.setAttribute('aria-busy', 'false');
      } else if (!waitingTimer && loadingStatus.hidden) {
        waitingTimer = setTimeout(() => {
          waitingTimer = 0;
          loadingStatus.hidden = false;
          hero.setAttribute('aria-busy', 'true');
        }, 500);
      }
    }

    if (location.hash) history.replaceState(history.state, '', location.pathname + location.search);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    video.autoplay = false;
    video.loop = false;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'none';
    video.pause();

    const canvas = document.createElement('canvas');
    canvas.id = 'hero-sequence-canvas-v23';
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      display: 'block', pointerEvents: 'none', opacity: '0',
    });
    media.append(canvas);
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

    function frameUrl(index) {
      return `./assets/media/hero-frames-v24/${tier}/frame_${String(index + 1).padStart(3, '0')}.webp`;
    }

    function revealFilm() {
      root.classList.add('hero-media-ready');
    }

    // This is intentionally the original approved timing map. Media transport
    // (MP4 seek vs frame sequence) must never alter these values.
    function render(value) {
      currentProgress = value;
      const p = reduced.matches ? 1 : clamp(value);
      const state = p >= HERO_SITE_START ? 'site' : p >= HERO_TRANSITION_START ? 'transition' : 'hero';
      if (state !== 'hero') revealFilm();
      root.dataset.heroState = state;
      root.style.setProperty('--hero-progress', p);
      canvas.style.opacity = String(p > .5 ? clamp((.6 - p) / .1) : 1);
      window.JUHeroProgress = clamp((p - FACE_START) / FACE_SPAN);
      window.dispatchEvent(new CustomEvent('ju:hero-progress', { detail: { progress: window.JUHeroProgress, state } }));
      window.updateGooeyScroll?.(p);
      if (state === 'site' && !introReady) {
        introReady = true;
        root.classList.add('intro-complete');
        window.dispatchEvent(new Event('jugend:intro-complete'));
      }
    }

    function resizeCanvas() {
      const rect = hero.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, tier === 'desktop' ? 1.5 : 1.0);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      if (displayedFrame >= 0) drawFrame(displayedFrame);
    }

    function drawCover(image, opacity = 1, clear = true) {
      if (!ctx || !image?.naturalWidth || !image?.naturalHeight) return false;
      const cw = canvas.width;
      const ch = canvas.height;
      const scale = Math.max(cw / image.naturalWidth, ch / image.naturalHeight);
      const dw = image.naturalWidth * scale;
      const dh = image.naturalHeight * scale;
      ctx.globalAlpha = 1;
      if (clear) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch); }
      ctx.globalAlpha = opacity;
      ctx.drawImage(image, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;
      return true;
    }

    function evictDecoded(target) {
      if (decoded.size <= MAX_DECODED) return;
      const keep = new Set([displayedFrame, target]);
      for (const key of [...decoded.keys()].sort((a,b)=>Math.abs(b-target)-Math.abs(a-target))) {
        if (decoded.size <= MAX_DECODED) break;
        if (!keep.has(key)) decoded.delete(key);
      }
    }

    function loadFrame(index, priority = 'auto') {
      index = Math.max(0, Math.min(FRAME_COUNT - 1, index));
      if (decoded.has(index)) return Promise.resolve(decoded.get(index));
      if (pending.has(index)) return pending.get(index).promise;
      if (failedFrames.has(index)) return Promise.reject(new Error('Unavailable HERO frame'));
      const expectedTier = tier;
      const request = { promise: null, cancel: null };
      const promise = new Promise((resolve, reject) => {
        const image = new Image();
        let active = true;
        const release = () => {
          active = false;
          clearTimeout(timeout);
          image.onload = image.onerror = null;
          if (pending.get(index) === request) pending.delete(index);
        };
        request.cancel = () => {
          if (!active) return;
          release();
          image.removeAttribute('src');
          reject(new DOMException('Obsolete HERO request', 'AbortError'));
        };
        const timeout = setTimeout(() => {
          if (!active) return;
          release();
          image.removeAttribute('src');
          markFailed(index);
          reject(new Error('HERO frame request timed out'));
          scheduleSync();
        }, 8000);
        image.decoding = 'async';
        try { image.fetchPriority = priority; } catch (_) {}
        image.onload = async () => {
          try { await image.decode?.(); } catch (_) {}
          if (!active) return;
          release();
          if (expectedTier !== tier) { reject(new Error('stale hero tier')); return; }
          // A request can finish after the reader has left HERO. Do not keep
          // decoded film frames resident throughout the remaining 22 scenes.
          if (!heroIsNear()) { resolve(image); return; }
          decoded.set(index, image);
          evictDecoded(Math.round(clamp(requestedProgress / FILM_SCROLL_END) * (FRAME_COUNT - 1)));
          resolve(image);
          scheduleSync();
        };
        image.onerror = error => {
          if (!active) return;
          release();
          if (expectedTier === tier) {
            markFailed(index);
            scheduleSync();
          }
          reject(error);
        };
        image.src = frameUrl(index);
      });
      request.promise = promise;
      pending.set(index, request);
      return promise;
    }

    function drawFrame(index) {
      const image = decoded.get(index);
      if (!image || !drawCover(image)) return false;
      displayedFrame = index;
      if (!firstFrameReady) {
        firstFrameReady = true;
        video.style.visibility = 'hidden';
        revealFilm();
      }
      return true;
    }

    function prefetchAround(index) {
      if (!heroIsNear()) return;
      // Target + twelve ahead + four behind fit inside the 18-image budget.
      // A larger window repeatedly evicted/reloaded its own furthest frame.
      const lookahead = tier === 'phone' || tier === 'tablet' ? 12 : 8;
      for (let d = 1; d <= lookahead; d++) {
        if (pending.size >= MAX_PENDING - 2) break;
        const forward = index + d;
        const backward = index - d;
        if (forward < FRAME_COUNT) loadFrame(forward, d <= 4 ? 'high' : 'low').catch(() => {});
        if (backward >= 0 && d <= 4 && pending.size < MAX_PENDING - 2) loadFrame(backward, 'low').catch(() => {});
      }
      evictDecoded(index);
    }

    function presentRequested(progress) {
      requestedProgress = clamp(progress);
      // One timeline for film, type and ball. A completed image request may
      // repaint this position, but never publish its older frame's progress.
      render(requestedProgress);
      const filmProgress = Math.min(requestedProgress, FILM_SCROLL_END);
      const fractionalFrame = filmProgress / FILM_SCROLL_END * (FRAME_COUNT - 1);
      const target = Math.floor(fractionalFrame);
      const following = Math.min(FRAME_COUNT - 1, target + 1);
      // A fast swipe/reversal must not queue behind downloads for an old pose.
      // Cancel obsolete work, and reserve the first two slots for this frame pair.
      for (const [index, request] of pending) {
        if (Math.abs(index - target) > 16) request.cancel();
      }
      const needed = [target, following].filter(index => !decoded.has(index) && !pending.has(index) && !failedFrames.has(index));
      for (const [index, request] of [...pending].sort((a,b)=>Math.abs(b[0]-target)-Math.abs(a[0]-target))) {
        if (pending.size + needed.length <= MAX_PENDING) break;
        if (index !== target && index !== following) request.cancel();
      }
      if (decoded.has(target)) {
        drawFrame(target);
        if (following !== target && decoded.has(following)) drawCover(decoded.get(following), fractionalFrame - target, false);
      } else {
        // During fast swipes/reversals keep motion continuous with the closest
        // already-decoded neighbouring frame; never snap back to frame 0.
        let nearest = -1, distance = Infinity;
        for (const index of decoded.keys()) {
          const d = Math.abs(index - target);
          if (d <= 10 && d < distance) { nearest = index; distance = d; }
        }
        if (nearest >= 0) drawFrame(nearest);
      }
      const unavailable = failedFrames.has(target);
      retryButton.hidden = !unavailable;
      waiting(!decoded.has(target) && !unavailable && displayedFrame < 0);
      root.dataset.heroMediaFallback = String(unavailable);
      for (const index of [target, following]) {
        if (pending.size < MAX_PENDING && !pending.has(index) && !decoded.has(index) && !failedFrames.has(index)) {
          loadFrame(index, 'high').catch(() => {});
        }
      }
      prefetchAround(target);
      if (unavailable) revealFilm();
    }

    const scrollDistance = () => Math.max(1, zone.offsetHeight - hero.offsetHeight);
    const zoneTop = () => scrollY + zone.getBoundingClientRect().top;

    function syncFromScroll() {
      scrollRaf = 0;
      const progress = window.JUScenes ? window.JUScenes.progress('hero') : clamp((scrollY - zoneTop()) / scrollDistance());
      if (heroIsNear()) {
        if (canvas.width <= 1 || canvas.height <= 1) resizeCanvas();
        presentRequested(progress);
      } else {
        waiting(false);
        for (const request of pending.values()) request.cancel();
        decoded.clear();
        if (canvas && (canvas.width > 1 || canvas.height > 1)) {
          canvas.width = 1;
          canvas.height = 1;
        }
        render(progress);
      }
      window.JUHeroDebug = {
        driver: 'frame-sequence-v24-original-timing',
        tier,
        requestedProgress: progress,
        presentedProgress: currentProgress,
        displayedFrame,
        frameCount: FRAME_COUNT,
        decodedFrames: decoded.size,
        pendingFrames: pending.size,
        timing: { transition: HERO_TRANSITION_START, site: HERO_SITE_START, faceStart: FACE_START, faceSpan: FACE_SPAN, filmEnd: FILM_SCROLL_END },
      };
    }

    function scheduleSync() {
      if (!scrollRaf) scrollRaf = requestAnimationFrame(syncFromScroll);
    }

    function handleResize() {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        const nextTier = deviceTier();
        if (nextTier !== tier) {
          tier = nextTier;
          decoded.clear();
          for (const request of pending.values()) request.cancel();
          pending.clear();
          for (const timer of retryTimers.values()) clearTimeout(timer);
          retryTimers.clear(); retries.clear(); failedFrames.clear();
          displayedFrame = -1;
          firstFrameReady = false;
          video.style.visibility = '';
          canvas.style.opacity = '0';
        }
        resizeCanvas();
        syncFromScroll();
      });
    }

    addEventListener('scroll', () => { if (!window.JUScenes) scheduleSync(); }, { passive: true });
    document.addEventListener('jugend:scroll-frame', () => {
      cancelAnimationFrame(scrollRaf);
      syncFromScroll();
    });
    addEventListener('resize', handleResize, { passive: true });
    window.visualViewport?.addEventListener('resize', handleResize, { passive: true });
    new ResizeObserver(handleResize).observe(hero);

    const navigation = window.performance?.getEntriesByType?.('navigation')?.[0];
    if (!navigation || navigation.type === 'navigate' || navigation.type === 'reload') scrollTo(0, 0);

    resizeCanvas();
    render(0);
    loadFrame(0, 'high').then(() => {
      syncFromScroll();
    }).catch(error => {
      if (error?.name === 'AbortError') return;
      revealFilm();
      video.style.visibility = '';
    });
  }

  if (document.readyState === 'complete') init();
  else document.addEventListener('DOMContentLoaded', init, { once: true });
})();
