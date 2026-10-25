"use strict";
(() => {
  const frames = [
    ...document.querySelectorAll('iframe.ju-yt, iframe[data-src*="youtube"]'),
  ];
  const visible = new Set(),
    players = new Map(),
    pending = new Set();
  const playback = new WeakMap();
  let requested = false;
  function shouldPlay(frame) {
    const chapter = frame.closest(".chapter");
    const device = frame.closest(".device-shell");
    const reducedMotion = matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const motionReady =
      !window.JUScenes ||
      chapter?.dataset.motionReady === "true" ||
      reducedMotion;
    const deviceReady =
      !device || device.dataset.rotationComplete === "true" || reducedMotion;
    return (
      visible.has(frame) &&
      !document.hidden &&
      chapter?.dataset.covered !== "true" &&
      motionReady &&
      deviceReady
    );
  }
  function near(frame) {
    const id = frame.closest(".chapter")?.id;
    return !window.JUScenes || !id || window.JUScenes.near(id);
  }
  function prime(frame, player) {
    if (
      !near(frame) ||
      document.hidden ||
      !player ||
      frame.dataset.primed === "true" ||
      frame.dataset.priming === "true"
    )
      return;
    frame.dataset.priming = "true";
    try {
      player.mute();
      player.playVideo();
    } catch (_) {}
  }
  function status() {}
  function sync(frame) {
    const player = players.get(frame);
    if (!player || frame.dataset.ready !== "true") return;
    // Never expose YouTube's thumbnail/play-button state as the presentation
    // frame. Decode the real first video frame once, then pause/play that frame.
    if (frame.dataset.primed !== "true") {
      prime(frame, player);
      return;
    }
    const playing = shouldPlay(frame);
    if (playback.get(frame) === playing) return;
    playback.set(frame, playing);
    if (playing) {
      player.mute();
      player.playVideo();
    } else player.pauseVideo();
  }
  function connect(frame) {
    if (players.has(frame) || !window.YT?.Player) return;
    players.set(
      frame,
      new YT.Player(frame, {
        events: {
          onReady: (event) => {
            frame.dataset.ready = "true";
            prime(frame, event.target);
          },
          onStateChange: (event) => {
            if (event.data !== 1) return;
            if (!shouldPlay(frame)) {
              event.target.pauseVideo();
              playback.set(frame, false);
            }
            if (frame.dataset.primed !== "true") {
              frame.dataset.primed = "true";
              delete frame.dataset.priming;
              playback.delete(frame);
              if (!shouldPlay(frame)) event.target.pauseVideo();
              sync(frame);
              return;
            }
          },
          onAutoplayBlocked: () => {
            delete frame.dataset.priming;
            const resumeOnInteraction = () => {
              const player = players.get(frame);
              if (player) {
                try {
                  player.mute();
                  player.playVideo();
                } catch (_) {}
              }
            };
            window.addEventListener("pointerdown", resumeOnInteraction, {
              once: true,
              passive: true,
            });
            window.addEventListener("touchstart", resumeOnInteraction, {
              once: true,
              passive: true,
            });
            window.addEventListener("scroll", resumeOnInteraction, {
              once: true,
              passive: true,
            });
          },
          onError: () => {
            delete frame.dataset.primed;
            delete frame.dataset.priming;
          },
        },
      }),
    );
  }
  // Release a far-away player so only the scenes around the viewport stay
  // resident in memory. The same iframe element is re-attached by load().
  function unload(frame) {
    if (!frame.dataset.loadedSrc) return;
    players.delete(frame);
    pending.delete(frame);
    playback.delete(frame);
    visible.delete(frame);
    delete frame.dataset.ready;
    delete frame.dataset.primed;
    delete frame.dataset.priming;
    delete frame.dataset.loadedSrc;
    frame.src = "about:blank";
  }
  function load(frame) {
    if (!frame.dataset.loadedSrc) {
      frame.loading = "eager";
      const url = new URL(frame.dataset.src);
      url.searchParams.set("autoplay", "1");
      url.searchParams.set("mute", "1");
      url.searchParams.set("playsinline", "1");
      url.searchParams.set("fs", "0");
      url.searchParams.set("disablekb", "1");
      url.searchParams.set("origin", location.origin);
      frame.src = url.href;
      frame.dataset.loadedSrc = url.href;
    }
    pending.add(frame);
    if (window.YT?.Player) {
      connect(frame);
      return;
    }
    if (requested) return;
    requested = true;
    window.onYouTubeIframeAPIReady = () => pending.forEach(connect);
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.addEventListener("error", () => {
      requested = false;
      script.remove();
    });
    document.head.append(script);
  }
  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach(({ target, isIntersecting }) => {
        if (
          isIntersecting &&
          (!window.JUScenes ||
            window.JUScenes.visible(target.closest(".chapter")?.id))
        ) {
          visible.add(target);
          load(target);
        } else visible.delete(target);
        sync(target);
      }),
    { threshold: 0.15 },
  );
  frames.forEach((frame, index) => {
    frame.id ||= "jugend-video-" + (index + 1);
    // Presentation iframe never receives direct pointer/tab input; controls stay site-owned.
    frame.tabIndex = -1;
    observer.observe(frame);
  });
  document.addEventListener("visibilitychange", () => frames.forEach(sync));
  function warmAndSync(frame) {
    const id = frame.closest(".chapter")?.id;
    if (!window.JUScenes || !id || window.JUScenes.near(id)) load(frame);
    else unload(frame);
    if (window.JUScenes?.visible(id)) visible.add(frame);
    else visible.delete(frame);
    const player = players.get(frame);
    if (
      player &&
      frame.dataset.ready === "true" &&
      frame.dataset.primed !== "true"
    )
      prime(frame, player);
    sync(frame);
  }
  let lastActiveChapter = "";
  function checkChapterMediaSync() {
    const current = window.JUScenes?.active;
    if (current && current !== lastActiveChapter) {
      lastActiveChapter = current;
      frames.forEach(warmAndSync);
    }
  }
  document.addEventListener("jugend:chapter-visibility", () => {
    lastActiveChapter = window.JUScenes?.active || "";
    frames.forEach(warmAndSync);
  });
  document.addEventListener("jugend:scroll-frame", checkChapterMediaSync);

  // Simulator (WebGL): no eager preboot. It is attached only while its scene
  // is on screen and released when the scene is far, so it never coexists
  // with the YouTube players at the end of the page.
  const simulator = document.querySelector("#simulatorIframe");
  const simulatorSrc = simulator?.getAttribute("src");
  function syncSimulator() {
    if (!simulator || !window.JUScenes) return;
    if (window.JUScenes.visible("simulator")) {
      if (simulator.getAttribute("src") !== simulatorSrc)
        simulator.src = simulatorSrc;
    } else if (!window.JUScenes.near("simulator")) {
      if (simulator.getAttribute("src") === simulatorSrc)
        simulator.src = "about:blank";
    }
  }
  document.addEventListener("jugend:chapter-visibility", syncSimulator);
  const notice = document.querySelector("#site-notice");
  const footer = document.querySelector("footer");
  const header = document.querySelector(".site-header");
  function measureHeader() {
    document.documentElement.style.setProperty(
      "--header-height",
      `${header.offsetHeight}px`,
    );
  }
  new ResizeObserver(measureHeader).observe(header);
  measureHeader();
  function measureFooter() {
    document.documentElement.style.setProperty(
      "--notice-height",
      `${notice.offsetHeight}px`,
    );
    document.documentElement.style.setProperty(
      "--footer-height",
      `${footer.offsetHeight + notice.offsetHeight}px`,
    );
  }
  const finalSection = document.querySelector("#contact-apology");
  const footerObserver = new IntersectionObserver(
    (entries) => {
      if (document.documentElement.classList.contains("spiral-scenes")) return;
      const entry = entries.find((item) => item.target === finalSection);
      if (!entry?.isIntersecting) return;
      // Once reached, retain the footer and its established safe-area layout
      // throughout backward navigation as well.
      document.documentElement.classList.add("footer-visible");
      measureFooter();
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
  );
  if (finalSection) footerObserver.observe(finalSection);
  new ResizeObserver(measureFooter).observe(footer);
  new ResizeObserver(measureFooter).observe(notice);
  measureFooter();
})();
