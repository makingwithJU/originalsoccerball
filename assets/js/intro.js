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
    let requestSerial = 0;
    let scrollRaf = 0;
    let resizeRaf = 0;
    let introReady = false;
    let firstFrameReady = false;
    const decoded = new Map();
    const pending = new Map();
    const failedFrames = new Set();
    const MAX_DECODED = tier === 'phone' ? 40 : tier === 'tablet' ? 50 : 36;
    const MAX_PENDING = 6;

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
      return `./assets/media/hero-frames-v23/${tier}/frame_${String(index + 1).padStart(3, '0')}.webp`;
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
      if (displayedFrame >= 0) drawFrame(displayedFrame, false);
    }

    function drawCover(image) {
      if (!ctx || !image?.naturalWidth || !image?.naturalHeight) return false;
      const cw = canvas.width;
      const ch = canvas.height;
      const scale = Math.max(cw / image.naturalWidth, ch / image.naturalHeight);
      const dw = image.naturalWidth * scale;
      const dh = image.naturalHeight * scale;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(image, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      return true;
    }

    function evictDecoded(target) {
      if (decoded.size <= MAX_DECODED) return;
      const keep = new Set([displayedFrame, target]);
      for (let d = 1; d <= 16; d++) {
        if (target - d >= 0) keep.add(target - d);
        if (target + d < FRAME_COUNT) keep.add(target + d);
      }
      for (const key of [...decoded.keys()]) {
        if (decoded.size <= MAX_DECODED) break;
        if (!keep.has(key)) decoded.delete(key);
      }
    }

    function loadFrame(index, priority = 'auto') {
      index = Math.max(0, Math.min(FRAME_COUNT - 1, index));
      if (decoded.has(index)) return Promise.resolve(decoded.get(index));
      if (pending.has(index)) return pending.get(index);
      if (failedFrames.has(index)) return Promise.reject(new Error('Unavailable HERO frame'));
      const expectedTier = tier;
      const promise = new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        try { image.fetchPriority = priority; } catch (_) {}
        image.onload = async () => {
          try { await image.decode?.(); } catch (_) {}
          if (expectedTier !== tier) { reject(new Error('stale hero tier')); return; }
          pending.delete(index);
          decoded.set(index, image);
          evictDecoded(Math.round(clamp(requestedProgress / FILM_SCROLL_END) * (FRAME_COUNT - 1)));
          resolve(image);
          scheduleSync();
        };
        image.onerror = error => {
          if (expectedTier === tier) {
            pending.delete(index);
            failedFrames.add(index);
            scheduleSync();
          }
          reject(error);
        };
        image.src = frameUrl(index);
      });
      pending.set(index, promise);
      return promise;
    }

    function frameProgress(index) {
      return (index / Math.max(1, FRAME_COUNT - 1)) * FILM_SCROLL_END;
    }

    function drawFrame(index, publish = true) {
      const image = decoded.get(index);
      if (!image || !drawCover(image)) return false;
      displayedFrame = index;
      if (!firstFrameReady) {
        firstFrameReady = true;
        canvas.style.opacity = '1';
        video.style.visibility = 'hidden';
        revealFilm();
      }
      if (publish) render(frameProgress(index));
      return true;
    }

    function findClosestDecoded(target) {
      if (decoded.has(target)) return target;
      let closest = -1;
      let minDiff = Infinity;
      for (const idx of decoded.keys()) {
        const diff = Math.abs(idx - target);
        if (diff < minDiff) {
          minDiff = diff;
          closest = idx;
        }
      }
      return closest;
    }

    function prefetchAround(index) {
      const lookahead = tier === 'phone' || tier === 'tablet' ? 14 : 8;
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

      // Navigation must not wait for a media request: a missing or slow final
      // frame must never trap the page in HERO with the header hidden.
      if (requestedProgress >= FILM_SCROLL_END) render(requestedProgress);
      if (requestedProgress >= FILM_SCROLL_END && displayedFrame === FRAME_COUNT - 1) {
        render(requestedProgress);
        return;
      }

      const filmProgress = clamp(requestedProgress / FILM_SCROLL_END);
      const target = Math.round(filmProgress * (FRAME_COUNT - 1));
      if (target === displayedFrame) return;
      const serial = ++requestSerial;
      if (decoded.has(target)) {
        drawFrame(target, requestedProgress < FILM_SCROLL_END);
        prefetchAround(target);
        if (requestedProgress >= FILM_SCROLL_END && target === FRAME_COUNT - 1) render(requestedProgress);
        return;
      }

      // Smooth scrub fallback: if exact target is decoding, present nearest available frame
      // so visual scrub never drops dead or stutters during fast scroll gestures.
      const nearest = findClosestDecoded(target);
      if (nearest >= 0 && nearest !== displayedFrame && Math.abs(nearest - target) <= 12) {
        drawFrame(nearest, requestedProgress < FILM_SCROLL_END);
      }

      if (pending.size >= MAX_PENDING && !pending.has(target)) return;

      loadFrame(target, 'high').then(() => {
        if (serial !== requestSerial) return;
        drawFrame(target, requestedProgress < FILM_SCROLL_END);
        prefetchAround(target);
        if (requestedProgress >= FILM_SCROLL_END && target === FRAME_COUNT - 1) render(requestedProgress);
      }).catch(() => {
        if (serial !== requestSerial) return;
        render(requestedProgress);
        revealFilm();
      });
    }

    const scrollDistance = () => Math.max(1, zone.offsetHeight - hero.offsetHeight);
    const zoneTop = () => scrollY + zone.getBoundingClientRect().top;

    function syncFromScroll() {
      scrollRaf = 0;
      const progress = clamp((scrollY - zoneTop()) / scrollDistance());
      presentRequested(progress);
      window.JUHeroDebug = {
        driver: 'frame-sequence-v23-original-timing',
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
          pending.clear();
          failedFrames.clear();
          displayedFrame = -1;
          requestSerial++;
          firstFrameReady = false;
          video.style.visibility = '';
          canvas.style.opacity = '0';
        }
        resizeCanvas();
        syncFromScroll();
      });
    }

    addEventListener('scroll', scheduleSync, { passive: true });
    addEventListener('resize', handleResize, { passive: true });
    window.visualViewport?.addEventListener('resize', handleResize, { passive: true });

    const navigation = window.performance?.getEntriesByType?.('navigation')?.[0];
    if (!navigation || navigation.type === 'navigate' || navigation.type === 'reload') scrollTo(0, 0);

    resizeCanvas();
    render(0);
    loadFrame(0, 'high').then(() => {
      drawFrame(0, true);
      prefetchAround(0);
      syncFromScroll();
    }).catch(() => {
      revealFilm();
      video.style.visibility = '';
    });
  }

  if (document.readyState === 'complete') init();
  else document.addEventListener('DOMContentLoaded', init, { once: true });
})();
