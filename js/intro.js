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
    const DEFAULT_DURATION = 5.79;

    const hasTouch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    const isMobileOrTablet =
      hasTouch || (window.matchMedia && window.matchMedia("(max-width: 1024px)").matches);

    const videoSrc = isMobileOrTablet
      ? "./assets/media/hero/hero_mobile.mp4?v=136"
      : "./assets/media/hero/hero_pc.mp4?v=136";

    let heroQ = 0;
    let heroQt = 0;
    let heroLast = performance.now();
    let heroRaf = 0;
    let lastSeekTime = 0;

    let introReady = false;
    let firstFrameReady = false;
    let decoderUnlocked = false;
    let decoderUnlocking = false;
    let isTouching = false;
    let blobSwapDone = false;
    let diagSeekCount = 0;

    const isDevHost =
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1" ||
      location.hostname.startsWith("192.168.");

    function sendDiag(stage, extra = "") {
      if (!isDevHost) return;
      try {
        const rs = video ? video.readyState : -1;
        const ns = video ? video.networkState : -1;
        const dur = video && Number.isFinite(video.duration) ? video.duration.toFixed(2) : "NaN";
        const ct = video && Number.isFinite(video.currentTime) ? video.currentTime.toFixed(3) : "NaN";
        const isBlob = video && (video.currentSrc || video.src || "").startsWith("blob:") ? 1 : 0;
        const q = heroQ.toFixed(3);
        const url = `/__diag?s=${encodeURIComponent(stage)}&rs=${rs}&ns=${ns}&dur=${dur}&ct=${ct}&blob=${isBlob}&ul=${decoderUnlocked ? 1 : 0}&q=${q}${extra ? "&" + extra : ""}&t=${Date.now()}`;
        fetch(url, { method: "GET", keepalive: true, cache: "no-store" }).catch(() => {});
      } catch (_) {}
    }

    video.style.display = "block";
    video.removeAttribute("aria-hidden");
    video.removeAttribute("poster");
    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");

    const currentAttrSrc = video.getAttribute("src") || "";
    if (!currentAttrSrc) {
      video.src = videoSrc;
      try {
        video.load();
      } catch (_) {}
    }

    function getDuration() {
      return Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : DEFAULT_DURATION;
    }

    function getTargetTime() {
      const filmProgress = Math.min(heroQ, FILM_SCROLL_END);
      const dur = getDuration();
      return Math.max(0.001, Math.min(dur - 0.04, (filmProgress / FILM_SCROLL_END) * dur));
    }

    function revealFilm() {
      if (!firstFrameReady) {
        firstFrameReady = true;
        root.classList.add("hero-media-ready");
      }
    }

    function syncHeroFrame() {
      if (!video || decoderUnlocking) return;
      try {
        if (!video.paused) video.pause();
        if (video.readyState >= 1) {
          const targetTime = getTargetTime();
          if (Math.abs(video.currentTime - targetTime) > 0.012) {
            lastSeekTime = performance.now();
            video.currentTime = targetTime;
          }
        }
      } catch (_) {}
    }

    function unlockDecoder() {
      if (decoderUnlocked || decoderUnlocking || !video) return;
      if (video.readyState === 0) {
        try {
          video.load();
        } catch (_) {}
      }
      decoderUnlocking = true;
      try {
        video.defaultMuted = true;
        video.muted = true;
        video.playsInline = true;
        video.playbackRate = 0.0001;

        const finishUnlock = (didPlay, errName = "") => {
          decoderUnlocking = false;
          if (didPlay) {
            decoderUnlocked = true;
            try {
              video.pause();
              video.playbackRate = 1;
              syncHeroFrame();
            } catch (_) {}
            sendDiag("unlock_ok");
          } else {
            try {
              video.playbackRate = 1;
            } catch (_) {}
            sendDiag("unlock_fail", `err=${encodeURIComponent(errName)}`);
          }
        };

        // Safety timeout: never call video.pause() on timeout if play() hasn't resolved,
        // so we never abort an in-progress AVPlayer initialization on iOS WebKit.
        const safetyTimer = setTimeout(() => {
          if (decoderUnlocking) {
            decoderUnlocking = false;
            try {
              video.playbackRate = 1;
            } catch (_) {}
            sendDiag("unlock_timeout");
          }
        }, 700);

        const p = video.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            clearTimeout(safetyTimer);
            finishUnlock(true);
          }).catch((err) => {
            clearTimeout(safetyTimer);
            finishUnlock(false, err && err.name ? err.name : "err");
          });
        } else {
          clearTimeout(safetyTimer);
          finishUnlock(true);
        }
      } catch (e) {
        decoderUnlocking = false;
      }
    }

    async function preloadVideoBlob(url) {
      if (blobSwapDone) return;
      try {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) return;
        const rawBlob = await response.blob();
        const mp4Blob =
          rawBlob.type === "video/mp4"
            ? rawBlob
            : new Blob([rawBlob], { type: "video/mp4" });
        const blobUrl = URL.createObjectURL(mp4Blob);
        if (!blobUrl || !blobUrl.startsWith("blob:")) return;

        const applyBlobWhenIdle = () => {
          if (blobSwapDone || !video) return;
          if (isTouching || heroRaf !== 0 || decoderUnlocking || heroQ > 0.03) {
            setTimeout(applyBlobWhenIdle, 250);
            return;
          }
          blobSwapDone = true;
          const prevTime = getTargetTime();
          decoderUnlocked = false;
          decoderUnlocking = false;
          video.src = blobUrl;
          try {
            video.load();
          } catch (_) {}
          sendDiag("blob_swap");

          const onBlobLoaded = () => {
            video.removeEventListener("loadeddata", onBlobLoaded);
            clearTimeout(watchdog);
            try {
              video.currentTime = prevTime;
            } catch (_) {}
            unlockDecoder();
            sendDiag("blob_ready");
          };

          const watchdog = setTimeout(() => {
            video.removeEventListener("loadeddata", onBlobLoaded);
            if (video.readyState < 1) {
              sendDiag("blob_watchdog_revert");
              decoderUnlocked = false;
              decoderUnlocking = false;
              video.src = videoSrc;
              try {
                video.load();
              } catch (_) {}
            }
          }, 600);

          video.addEventListener("loadeddata", onBlobLoaded, { once: true });
        };

        applyBlobWhenIdle();
      } catch (_) {}
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

      media.classList.toggle("is-past-poster", p > 0.45);
      video.style.opacity = String(p > 0.5 ? clamp((0.6 - p) / 0.1) : 1);

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

    function seekVideoToTarget(now) {
      if (!video || decoderUnlocking || heroQ > 0.65) return;
      if (!video.paused) {
        try {
          video.pause();
        } catch (_) {}
      }
      if (video.hasAttribute("poster") && video.readyState >= 2) {
        video.removeAttribute("poster");
      }
      if (video.readyState >= 1) {
        const targetTime = getTargetTime();
        if (
          (!video.seeking || now - lastSeekTime > 50) &&
          Math.abs(video.currentTime - targetTime) > 0.012
        ) {
          lastSeekTime = now;
          try {
            video.currentTime = targetTime;
            if (diagSeekCount < 5 && targetTime > 0.05) {
              diagSeekCount++;
              sendDiag("seek_exec", `tt=${targetTime.toFixed(3)}`);
            }
          } catch (e) {
            sendDiag("seek_err", `err=${encodeURIComponent(e && e.name ? e.name : "err")}`);
          }
        }
      }
    }

    function heroLoop(now) {
      const dt = Math.min(0.08, (now - heroLast) / 1000 || 0.016);
      heroLast = now;

      const diff = heroQt - heroQ;
      const lerpSpeed = hasTouch ? 18 : 16;
      if (Math.abs(diff) > 0.0004) {
        heroQ += diff * Math.min(1, dt * lerpSpeed);
      } else {
        heroQ = heroQt;
      }

      render(heroQ);
      seekVideoToTarget(now);

      if (Math.abs(heroQt - heroQ) > 0.0004) {
        heroRaf = requestAnimationFrame(heroLoop);
      } else {
        heroRaf = 0;
        seekVideoToTarget(now);
      }
    }

    function startHeroLoop() {
      if (!heroRaf) {
        heroLast = performance.now();
        heroRaf = requestAnimationFrame(heroLoop);
      }
    }

    ["play", "playing", "timeupdate"].forEach((ev) => {
      video.addEventListener(ev, () => {
        if (!decoderUnlocking && !video.paused) {
          try {
            video.pause();
          } catch (_) {}
        }
      });
    });

    video.addEventListener(
      "seeked",
      () => {
        revealFilm();
        if (!decoderUnlocking && heroQ <= 0.65 && video.readyState >= 1) {
          const targetTime = getTargetTime();
          if (Math.abs(video.currentTime - targetTime) > 0.025) {
            lastSeekTime = performance.now();
            try {
              video.currentTime = targetTime;
            } catch (_) {}
          }
        }
      },
      { passive: true },
    );

    video.addEventListener("error", () => {
      const s = video.currentSrc || video.getAttribute("src") || "";
      sendDiag("video_err", `src=${s.startsWith("blob:") ? "blob" : "http"}`);
      if (s.startsWith("blob:")) {
        decoderUnlocked = false;
        decoderUnlocking = false;
        video.src = videoSrc;
        try {
          video.load();
        } catch (_) {}
      }
    });

    let blobPreloadTriggered = false;
    function triggerBlobPreloadOnce() {
      if (blobPreloadTriggered) return;
      blobPreloadTriggered = true;
      preloadVideoBlob(videoSrc);
    }

    video.addEventListener("loadedmetadata", () => {
      revealFilm();
      syncHeroFrame();
      startHeroLoop();
      sendDiag("loadedmetadata");
    });
    video.addEventListener("loadeddata", () => {
      revealFilm();
      unlockDecoder();
      syncHeroFrame();
      sendDiag("loadeddata");
      triggerBlobPreloadOnce();
    });
    video.addEventListener("canplay", () => {
      revealFilm();
      unlockDecoder();
      syncHeroFrame();
      triggerBlobPreloadOnce();
    });

    if (video.readyState >= 1) {
      revealFilm();
      unlockDecoder();
      syncHeroFrame();
      triggerBlobPreloadOnce();
    } else {
      setTimeout(triggerBlobPreloadOnce, 1800);
    }

    window.addEventListener(
      "touchstart",
      () => {
        isTouching = true;
        unlockDecoder();
      },
      { passive: true },
    );
    window.addEventListener(
      "touchend",
      () => {
        isTouching = false;
        unlockDecoder();
      },
      { passive: true },
    );
    window.addEventListener(
      "touchcancel",
      () => {
        isTouching = false;
      },
      { passive: true },
    );
    window.addEventListener("pointerdown", unlockDecoder, { passive: true });
    window.addEventListener("keydown", unlockDecoder, { passive: true });

    const scrollDistance = () => Math.max(1, zone.offsetHeight - hero.offsetHeight);
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

    const returnTarget =
      window.__juReturnTarget ||
      new URLSearchParams(location.search).get("return") ||
      (location.hash ? location.hash.slice(1) : "");
    if (returnTarget) window.__juReturnTarget = returnTarget;
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
    const shouldRestore =
      ((crashed || isBackForward || isReload) && savedY > 0) ||
      Boolean(window.__juReturnTarget);
    if (!shouldRestore) scrollTo(0, 0);

    if (window.__juReturnTarget) {
      introReady = true;
      firstFrameReady = true;
      root.classList.add("intro-complete", "hero-media-ready");
      root.dataset.heroState = "site";
      heroQ = 1;
      heroQt = 1;
      render(1);
    } else {
      render(0);
      syncFromScroll();
    }
    sendDiag("init");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
