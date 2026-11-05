"use strict";
(() => {
  function init() {
    const root = document.documentElement;
    const hero = document.querySelector("#hero");
    const zone = document.querySelector("#hero-scroll-zone");
    const video = document.querySelector("#hero-video");
    const media = hero?.querySelector(".hero-video");
    if (!root || !hero || !zone || !video || !media) return;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const clamp = (n) => Math.max(0, Math.min(1, n));

    const HERO_TRANSITION_START = 0.6;
    const HERO_SITE_START = 0.94;
    const FACE_START = 0.15;
    const FACE_SPAN = 0.45;
    const FILM_SCROLL_END = 0.6;

    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isMobileOrTablet = hasTouch || (window.matchMedia && window.matchMedia('(max-width: 1024px)').matches);

    const videoSrc = isMobileOrTablet
      ? './assets/media/hero/hero_mobile.mp4?v=134'
      : './assets/media/hero/hero_pc.mp4?v=134';

    // State for smooth, jitter-free video scrub & 3D ball synchronisation
    let heroQ = 0;
    let heroQt = 0;
    let heroLast = performance.now();
    let heroRaf = 0;
    let lastSeekTime = 0;

    let introReady = false;
    let firstFrameReady = false;
    let decoderUnlocked = false;
    let decoderUnlocking = false;

    video.style.display = "block";
    video.removeAttribute("aria-hidden");
    video.muted = true;
    video.playsInline = true;

    function revealFilm() {
      if (!firstFrameReady) {
        firstFrameReady = true;
        root.classList.add("hero-media-ready");
      }
    }

    function unlockDecoder() {
      if (decoderUnlocked || decoderUnlocking) return;
      decoderUnlocking = true;
      try {
        video.muted = true;
        video.playbackRate = 0.0001;
        const finish = () => {
          decoderUnlocking = false;
          decoderUnlocked = true;
          try {
            video.pause();
            video.playbackRate = 1;
            startHeroLoop();
          } catch (e) {}
        };
        const timer = setTimeout(finish, 24);
        const p = video.play();
        if (p && typeof p.then === "function") {
          p.then(() => { clearTimeout(timer); finish(); }).catch(() => { clearTimeout(timer); decoderUnlocking = false; });
        } else {
          clearTimeout(timer);
          finish();
        }
      } catch (e) {
        decoderUnlocking = false;
      }
    }

    async function preloadVideoBlob(url) {
      try {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) return;
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        if (video && !video.ended && video.src !== blobUrl) {
          const curT = (Number.isFinite(video.currentTime) && video.currentTime > 0) ? video.currentTime : 0;
          const wasPaused = video.paused;
          video.src = blobUrl;
          try { video.currentTime = curT; } catch (_) {}
          if (wasPaused) { try { video.pause(); } catch (_) {} }
          startHeroLoop();
        }
      } catch (e) {}
    }

    function render(value) {
      const p = reduced.matches ? 1 : clamp(value);
      const state =
        p >= HERO_SITE_START
          ? "site"
          : p >= HERO_TRANSITION_START
            ? "transition"
            : "hero";
      if (state !== "hero") revealFilm();
      root.dataset.heroState = state;
      root.style.setProperty("--hero-progress", p);

      // Smooth video opacity fade into 3D ball
      video.style.opacity = String(p > 0.5 ? clamp((0.6 - p) / 0.1) : 1);

      // Master scroll timeline synchronization:
      // JUHeroProgress is driven directly and smoothly by p, exactly matching PC.
      // Between FACE_START (0.15: kicker strike) and FACE_START + FACE_SPAN (0.60: video end),
      // the 3D ball ascends and spins at full 60fps WebGL rate without decoder blocking.
      window.JUHeroProgress = clamp((p - FACE_START) / FACE_SPAN);
      window.dispatchEvent(
        new CustomEvent("ju:hero-progress", {
          detail: { progress: window.JUHeroProgress, state },
        }),
      );
      window.updateGooeyScroll?.(p);
      if (state === "site" && !introReady) {
        introReady = true;
        root.classList.add("intro-complete");
        window.dispatchEvent(new Event("jugend:intro-complete"));
      }
    }

    function heroLoop(now) {
      const dt = Math.min(0.08, (now - heroLast) / 1000 || 0.016);
      heroLast = now;

      // Snappy lerp smoothing that follows touch and wheel momentum without lag
      const diff = heroQt - heroQ;
      const lerpSpeed = hasTouch ? 28 : 20;
      if (Math.abs(diff) > 0.0003) {
        heroQ += diff * Math.min(1, dt * lerpSpeed);
      } else {
        heroQ = heroQt;
      }

      render(heroQ);

      const filmProgress = Math.min(heroQ, FILM_SCROLL_END);
      const dur = (Number.isFinite(video.duration) && video.duration > 0) ? video.duration : 5.8;
      const targetTime = Math.max(0.001, Math.min(dur - 0.04, (filmProgress / FILM_SCROLL_END) * dur));

      if (video && Number.isFinite(video.duration) && video.duration > 0 && heroQ <= 0.65) {
        if (!decoderUnlocking && !video.paused) {
          try { video.pause(); } catch (_) {}
        }
        if (video.hasAttribute("poster") && targetTime > 0.05 && video.readyState >= 2) {
          video.removeAttribute("poster");
        }
        // Proven PORTFOLIO scrub engine:
        // Issue seek if video is idle (!seeking) OR if >= 60ms has passed since last seek.
        // This throttles hardware seek requests to ~16-20fps max, giving mobile GPU decoders
        // sufficient throughput while preventing frame drops, decoder buffer overflow, and stutter.
        if ((!video.seeking || (now - lastSeekTime > 60)) && Math.abs(video.currentTime - targetTime) > 0.012) {
          lastSeekTime = now;
          try {
            video.currentTime = targetTime;
          } catch (_) {}
        }
      }

      if (Math.abs(heroQt - heroQ) > 0.0003) {
        heroRaf = requestAnimationFrame(heroLoop);
      } else {
        heroRaf = 0;
        if (video && Number.isFinite(video.duration) && video.duration > 0 && heroQ <= 0.65) {
          lastSeekTime = now;
          try { video.currentTime = targetTime; } catch (_) {}
        }
      }
    }

    function startHeroLoop() {
      if (!heroRaf) {
        heroLast = performance.now();
        heroRaf = requestAnimationFrame(heroLoop);
      }
    }

    video.addEventListener("seeked", () => {
      revealFilm();
    }, { passive: true });

    video.addEventListener("loadeddata", revealFilm, { once: true });
    video.addEventListener("canplay", revealFilm, { once: true });

    ["touchstart", "pointerdown", "wheel", "keydown", "scroll"].forEach((ev) => {
      window.addEventListener(ev, unlockDecoder, { passive: true, once: true });
    });

    const scrollDistance = () =>
      Math.max(1, zone.offsetHeight - hero.offsetHeight);
    const zoneTop = () => scrollY + zone.getBoundingClientRect().top;

    function syncFromScroll() {
      let progress = 0;
      if (window.JUScenes) {
        const snap = window.JUScenes.snapshot ? window.JUScenes.snapshot()[0] : null;
        if (snap && snap.animation > 0) {
          progress = clamp(scrollY / snap.animation);
        } else {
          progress = window.JUScenes.progress("hero");
        }
      } else {
        progress = clamp((scrollY - zoneTop()) / scrollDistance());
      }

      heroQt = clamp(progress);
      startHeroLoop();
    }

    if (location.hash) {
      history.replaceState(history.state, "", location.pathname + location.search);
    }
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";

    addEventListener("scroll", syncFromScroll, { passive: true });
    document.addEventListener("jugend:scroll-frame", syncFromScroll);
    addEventListener("resize", syncFromScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", syncFromScroll, { passive: true });
    new ResizeObserver(syncFromScroll).observe(hero);

    const crashed = sessionStorage.getItem("jugend_crashed") === "1";
    const navigation = window.performance?.getEntriesByType?.("navigation")?.[0];
    const isBackForward = navigation?.type === "back_forward";
    const isReload = navigation?.type === "reload";
    const savedY = parseFloat(sessionStorage.getItem("jugend_last_y")) || 0;
    const shouldRestore = (crashed || isBackForward || isReload) && savedY > 0;
    if (!shouldRestore) scrollTo(0, 0);

    render(0);
    syncFromScroll();
    preloadVideoBlob(videoSrc);
  }

  if (document.readyState === "complete") init();
  else document.addEventListener("DOMContentLoaded", init, { once: true });
})();
