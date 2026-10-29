"use strict";

(() => {
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const { clamp, ease, state, transition } = window.JUSceneMath;
  const scenes = [];
  const byId = new Map();
  const units = {
    hero: 18,
    order: 84,
    gallery: 66,
    specs: 16,
    "usage-title": 16,
    "event-shop-title": 16,
    works: 3.5,
    design: 3,
    policy: 4.5,
    "design-intro": 3,
    modeling: 6,
    simulator: 6,
  };
  // Distances, not scroll locks. Relative to the first preview, internal motion
  // Distances, not scroll locks. Relative to the first preview, internal motion
  // takes 1.05x the scrolling distance. Keep chapter pacing independent of the
  // decorative interlude (22 screens) and upright-copy intervals.
  const pace = {
    animation: 1.05,
    hold: 0.75,
    transition: 22,
    copyDelay: 0.125,
    copyReveal: 0.575,
  };
  // Start gently once the aperture reveals a quarter of the incoming viewport.
  // Sphere leads stay within their large, centred opening phase.
  const entryLead = {
    order: 0.035,
    gallery: 0.035,
    works: 0.16,
    design: 0.16,
    policy: 0.16,
    "design-intro": 0.16,
  };
  const linkedScenes = new Set([
    "modeling",
    "simulator",
    "usage-title",
    "event-shop-title",
    "hero-2-slide",
  ]);
  const fixedScenes = new Set([
    "hero",
    "order",
    "gallery",
    "specs",
    "design",
    "modeling",
    "simulator",
    "usage-title",
    "event-shop-title",
    "hero-2-slide",
    "contact-apology",
  ]);
  let frame = 0,
    resizeFrame = 0,
    unit = 0,
    lastWidth = innerWidth;
  let suppressObserverUntil = 0;
  let lastScene = null,
    lastLocal = 0;
  let orientationAnchor = null,
    isRotating = false;
  let footerLatched = false;
  let renderedY = 0;

  // Public read-only progress is consumed by HERO, image rolls and galleries.
  window.JUScenes = {
    get isRotating() {
      return isRotating;
    },
    get active() {
      return lastScene?.section?.id || (scenes[0]?.section?.id ?? null);
    },
    progress(id) {
      return reduced.matches ? 1 : (byId.get(id)?.progress ?? 0);
    },
    visible(id) {
      return reduced.matches || (byId.get(id)?.visible ?? false);
    },
    near(id) {
      const s = byId.get(id);
      if (!s) return false;
      // Tight margin keeps Three.js spatial galleries, 140 intro frames, and WebGL simulator
      // bounded in memory so iOS Safari does not exceed its per-tab limit and crash.
      const y = renderedY ?? scrollY;
      return y > s.start - unit * pace.transition * 0.7 && y < s.end + unit;
    },
    go(id) {
      const s = byId.get(id);
      if (!s) return;
      if (reduced.matches) s.section.scrollIntoView({ behavior: "auto" });
      else {
        // Fractional section starts must land inside, not just before, a scene.
        scrollTo({ top: Math.ceil(s.start), behavior: "auto" });
      }
    },
    snapshot() {
      return scenes.map(
        ({
          section,
          start,
          end,
          animation,
          overflow,
          readSpan,
          hold,
          transition: span,
          progress,
          visible,
        }) => ({
          id: section.id,
          start,
          end,
          animation,
          overflow,
          readSpan,
          hold,
          transition: span,
          progress,
          visible,
        }),
      );
    },
  };

  function measureDevices() {
    const header = document.querySelector(".site-header")?.offsetHeight || 0;
    const bottom = footerLatched
      ? parseFloat(
          getComputedStyle(root).getPropertyValue("--footer-height"),
        ) || 0
      : 0;
    for (const scene of scenes) {
      const device = scene.section.querySelector(".device-shell");
      if (!device) continue;
      const w = device.offsetWidth || 340;
      const h = device.offsetHeight || 500;
      scene.deviceBox = {
        width: w,
        height: h,
        x: innerWidth / 2,
        y: (innerHeight + header - bottom) / 2,
        header,
        bottom,
      };
    }
  }

  function deviceScale(box, angle) {
    if (!box) return 1;
    const rooms = [
      box.x - 8,
      innerWidth - box.x - 8,
      box.y - box.header - 8,
      innerHeight - box.bottom - box.y - 8,
    ];
    const c = Math.cos(angle),
      s = Math.sin(angle),
      axis = Math.SQRT1_2;
    let fit = 1;
    // Project all eight corners through the SAME perspective as the shell.
    // Solve each screen-edge bound for scale, not a viewport-diagonal guess.
    for (const x of [-box.width / 2, box.width / 2])
      for (const y of [-box.height / 2, box.height / 2])
        for (const z of [-18, 2]) {
          const dot = axis * (x + y);
          const X = x * c + axis * z * s + axis * dot * (1 - c);
          const Y = y * c - axis * z * s + axis * dot * (1 - c);
          const Z = z * c + axis * (y - x) * s;
          for (const [value, room] of [
            [-X, rooms[0]],
            [X, rooms[1]],
            [-Y, rooms[2]],
            [Y, rooms[3]],
          ]) {
            const divisor = value + (room * Z) / 1600;
            if (divisor > 0 && room > 0) fit = Math.min(fit, room / divisor);
          }
        }
    return Math.max(0.05, fit);
  }

  let cachedHeaderHeight = 0;
  let cachedFooterHeight = 0;

  function paint(scene, opacity, read, interactive, transferring) {
    const section = scene.section;
    const visible = opacity > 0.00001;
    scene.visible = visible;
    section.dataset.covered = String(!visible);
    section.dataset.sceneVisible = String(visible);
    section.dataset.sceneInteractive = String(interactive && visible);
    section.dataset.sceneTransitioning = String(transferring && visible);
    section.dataset.motionReady = String(
      (interactive || scene.motionOverlap) && visible,
    );
    section.inert = !interactive || !visible;
    section.setAttribute("aria-hidden", String(!visible));
    section.style.opacity = String(opacity);

    if (!visible) {
      section.style.visibility = "hidden";
      section.style.transform = "";
      section.style.clipPath = "";
      return;
    }

    section.style.visibility = "visible";
    const vvOffset = window.visualViewport
      ? Math.round(window.visualViewport.offsetTop)
      : 0;
    section.style.transform = `translateY(${vvOffset - read}px)`;
    // Clip reading content to the safe frame even while its document offset moves.
    if (!fixedScenes.has(section.id)) {
      const header = cachedHeaderHeight;
      const bottom = cachedFooterHeight;
      const sHeight = scene.sectionHeight || (scene.sectionHeight = section.offsetHeight);
      const clipBottom = Math.max(
        0,
        sHeight - read - innerHeight + bottom,
      );
      section.style.clipPath = `inset(${header + read}px 0 ${clipBottom}px 0)`;
    } else {
      section.style.clipPath = "";
    }
    section.style.setProperty("--chapter-progress", scene.progress);
    const local = renderedY - scene.start;
    const enterCopy =
      section.id === "hero"
        ? 1
        : 0.08 + 0.92 * ease((local / unit - pace.copyDelay) / pace.copyReveal);
    section.style.setProperty(
      "--scene-copy-opacity",
      !visible ? 0 : transferring ? scene.copyOverlap || 0 : enterCopy,
    );
    const device = section.querySelector(".device-shell");
    if (device) {
      const p = ease(scene.progress / 0.55);
      const ready = p >= 1 && interactive && visible;
      if (!ready && device.contains(document.activeElement))
        document.activeElement.blur();
      device.inert = !ready;
      device.dataset.rotationComplete = String(ready);
      const fit = deviceScale(scene.deviceBox, -2 * Math.PI * p);
      // An exact full turn is the identity. Avoid residual 3D depth rounding
      // at -360deg, which can sort the front behind the depth slices in Chrome.
      device.style.transform =
        p === 0 || p === 1
          ? "none"
          : `perspective(1600px) rotate3d(1,1,0,${-360 * p}deg) scale(${fit})`;
    }
  }

  function draw() {
    frame = 0;
    if (!unit || reduced.matches) return;
    // Safari rubber-band coordinates can leave the document's valid range.
    // One input, one timeline. Native touch/trackpad momentum may move scrollY,
    // but the site never accumulates a second playhead or releases scroll debt.
    if (!isRotating) {
      renderedY = Math.max(
        0,
        Math.min(scrollY, document.documentElement.scrollHeight - innerHeight),
      );
    }
    const y = renderedY;
    let index = scenes.findIndex((scene) => y < scene.end - 0.5);
    if (index < 0) index = scenes.length - 1;
    const current = scenes[index];
    const s = state(current, y);
    const blend = transition(s.transition);
    const next = s.transition > 0 ? scenes[index + 1] : null;
    const aperture = window.JUSceneMath.portal(
      s.transition,
      innerWidth,
      innerHeight,
    );
    const entry = ease((aperture.revealed - 0.25) / 0.75);
    // Every boundary starts the same field; reverse scroll retraces it exactly.
    const portalAvailable =
      window.JUSpiral?.draw(
        index + s.transition,
        next ? blend.spiralOpacity : 0,
        s.transition,
      ) === true;
    if (!portalAvailable) {
      // If WebGL is unavailable, use a complete two-layer crossfade.
      blend.outgoingOpacity = 1 - ease(s.transition);
      blend.incomingOpacity = ease(s.transition);
    }
    if (!isRotating) {
      lastScene = current;
      lastLocal = clamp((y - current.start) / (current.end - current.start));
    }
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const initial = entryLead[scene.section.id] || 0;
      scene.progress = linkedScenes.has(scene.section.id)
        ? clamp(
            (y - scene.motionStart) /
              (scene.start + scene.animation - scene.motionStart),
          )
        : i < index
          ? 1
          : i === index
            ? initial + (1 - initial) * s.animation
            : scene === next
              ? initial * entry
              : 0;
      scene.motionOverlap = scene === next && scene.progress > 0;
      scene.copyOverlap =
        scene === next
          ? 0.08 * ease((s.transition - 0.94) / 0.06)
          : scene === current
            ? 1
            : 0;
      if (scene === current)
        paint(
          scene,
          blend.outgoingOpacity,
          s.read,
          !next || (blend.spiralOpacity < 0.25 && s.transition < 0.5),
          !!next,
        );
      else if (scene === next) {
        const portalInteractive =
          linkedScenes.has(scene.section.id) && blend.incomingOpacity >= 0.5;
        paint(scene, blend.incomingOpacity, 0, portalInteractive, true);
      } else if (scene.visible !== false) paint(scene, 0, 0, false, false);
    }
    if (!footerLatched && current.section.id === "contact-apology") {
      footerLatched = true;
      // Footer geometry is visual-only. Suppress ResizeObserver remeasurement so
      // backward scrolling keeps the exact same scene timeline/progress.
      suppressObserverUntil = performance.now() + 1500;
      root.classList.add("footer-visible");
      cachedFooterHeight = parseFloat(getComputedStyle(root).getPropertyValue("--footer-height")) || 0;
    }
    root.dataset.scene = current.section.id;
    root.dataset.scenePhase = next
      ? "transition"
      : s.animation < 1
        ? "animation"
        : "hold";
    root.dataset.sceneReading = String(s.read > 0);
    document.dispatchEvent(new Event("jugend:chapter-visibility"));
    document.dispatchEvent(new Event("jugend:chapter-motion"));
    document.dispatchEvent(new Event("jugend:scroll-frame"));
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(draw);
  }
  function updateViewport() {
    // Visual coverage follows the live viewport; scroll distances remain stable.
    const vv = window.visualViewport;
    const h = vv ? Math.round(vv.height) : innerHeight;
    const offsetTop = vv ? Math.round(vv.offsetTop) : 0;
    root.style.setProperty("--scene-height", `${h}px`);
    root.style.setProperty("--viewport-offset-y", `${offsetTop}px`);
  }

  function measure(preserve = false) {
    resizeFrame = 0;
    suppressObserverUntil = Math.max(suppressObserverUntil, performance.now() + 600);
    if (reduced.matches) {
      root.classList.remove("spiral-scenes");
      root.classList.add("intro-complete", "hero-media-ready");
      root.dataset.heroState = "site";
      for (const scene of scenes) {
        scene.slot.style.height = "";
        scene.section.style.opacity = "";
        scene.section.style.transform = "";
        scene.section.style.clipPath = "";
        scene.section.style.maskImage = "";
        scene.section.style.visibility = "";
        scene.section.style.webkitMaskImage = "";
        scene.section.style.backgroundColor = "";
        scene.section.inert = false;
        scene.section.removeAttribute("aria-hidden");
        scene.section.dataset.covered = "false";
        const device = scene.section.querySelector(".device-shell");
        if (device) {
          device.style.removeProperty("transform");
          device.inert = false;
          delete device.dataset.rotationComplete;
        }
      }
      window.JUSpiral?.draw(0, 0);
      document.dispatchEvent(new Event("jugend:scroll-frame"));
      return;
    }
    root.classList.add("spiral-scenes");
    let anchor = null;
    if (orientationAnchor && byId.has(orientationAnchor.id)) {
      const s = byId.get(orientationAnchor.id);
      anchor = { scene: s, local: orientationAnchor.local, fromRotation: true };
      orientationAnchor = null;
    } else if (preserve && lastScene) {
      anchor = {
        scene: lastScene,
        local: lastLocal,
        offset: Math.max(0, scrollY - lastScene.start),
      };
    }
    // PC detection: fine pointer and NOT a coarse touch device
    const isCoarseTouch = matchMedia(
      "(hover: none) and (pointer: coarse)",
    ).matches;
    const isPC = !isCoarseTouch && matchMedia("(pointer: fine)").matches;

    // Stable CSS viewport height: mobile toolbar collapse cannot alter the track.
    // On mobile touch devices, unit is fixed to the stable screen height so that
    // rotating between portrait and landscape never collapses the 480k scroll track,
    // avoiding massive 240k scroll jumps, tile thrashing, and WebKit process crashes.
    if (!unit) {
      unit = isCoarseTouch
        ? Math.max(probe.offsetHeight, window.screen?.height || innerHeight, window.screen?.width || innerWidth, 600)
        : probe.offsetHeight;
    } else if (!isCoarseTouch && preserve === true) {
      unit = probe.offsetHeight;
    }
    updateViewport();

    // Phase 1 (Batch Read): read all layout metrics before any DOM writes to prevent layout thrashing
    for (const scene of scenes) scene.sectionHeight = 0;
    cachedHeaderHeight = document.querySelector(".site-header")?.offsetHeight || 0;
    cachedFooterHeight = footerLatched
      ? parseFloat(
          getComputedStyle(root).getPropertyValue("--footer-height"),
        ) || 0
      : 0;
    const bottom = cachedFooterHeight;
    const overflows = scenes.map((scene) =>
      fixedScenes.has(scene.section.id)
        ? 0
        : Math.max(0, scene.section.scrollHeight - innerHeight + bottom),
    );

    // Phase 2 (Pure Math): compute scene timelines without triggering reflows
    let start = 0;
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      scene.start = start;
      const sceneUnits =
        scene.section.id === "specs" &&
        scene.section.dataset.specLayout === "grid"
          ? 3.5
          : (units[scene.section.id] ?? 1.6);

      // PC only: scale scroll distance to 2/3 (1.5x speed) for all scenes after HERO. HERO is strictly preserved.
      const pcFactor = isPC && scene.section.id !== "hero" ? 2 / 3 : 1;

      scene.animation = sceneUnits * pace.animation * unit * pcFactor;
      scene.overflow = overflows[i];
      const isAccordionScene =
        scene.section.id === "policy" ||
        scene.section.id === "originalballmaking-accordion" ||
        scene.section.id === "faq-slide";
      // On PC, readPace is 1.1; on mobile/tablet, accordion scenes use 1.1 for instant responsive scrolling, others retain 1.8
      scene.readPace = isPC ? 1.1 : isAccordionScene ? 1.1 : 1.8;
      scene.readSpan = scene.overflow * scene.readPace;
      scene.hold = pace.hold * unit * pcFactor;
      scene.transition =
        (i === scenes.length - 1 ? 0 : pace.transition * unit) * pcFactor;
      scene.end =
        start +
        scene.animation +
        scene.readSpan +
        scene.hold +
        scene.transition;
      start = scene.end;
      const previous = scenes[i - 1];
      let t = 0.66;
      while (
        previous &&
        t < 1 &&
        window.JUSceneMath.portal(t, innerWidth, innerHeight).revealed < 0.25
      )
        t += 0.001;
      scene.motionStart = previous
        ? previous.end - previous.transition * (1 - t)
        : scene.start;
    }

    // Phase 3 (Batch Write): commit slot heights in a single batch
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const slotHeight = `${scene.end - scene.start + (i === scenes.length - 1 ? unit : 0)}px`;
      if (scene.slot.style.height !== slotHeight) {
        scene.slot.style.height = slotHeight;
      }
    }
    measureDevices();
    if (anchor) {
      const span = anchor.scene.end - anchor.scene.start;
      const rawY = anchor.scene.start + anchor.local * span;
      const y = anchor.fromRotation
        ? anchor.scene.id === "hero" && anchor.local === 0
          ? 0
          : Math.min(anchor.scene.end - 1, Math.max(anchor.scene.start + 0.5, rawY))
        : preserve === "offset"
          ? anchor.scene.start + Math.min(anchor.offset, span)
          : rawY;
      if (Math.abs(y - scrollY) > 0.5) scrollTo(0, y);
      renderedY = y;
      lastScene = anchor.scene;
      lastLocal = anchor.local;
    }
    draw();
    if (anchor?.fromRotation) {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        isRotating = false;
        renderedY = Math.max(
          0,
          Math.min(scrollY, document.documentElement.scrollHeight - innerHeight),
        );
        draw();
        document.dispatchEvent(new Event("jugend:layout"));
      }, 200);
    } else {
      isRotating = false;
    }
  }

  const probe = document.createElement("div");
  Object.assign(probe.style, {
    position: "fixed",
    height: "100svh",
    width: "0",
    visibility: "hidden",
    pointerEvents: "none",
  });
  probe.setAttribute("aria-hidden", "true");
  document.body.append(probe);
  document.querySelectorAll("#hero, main > .chapter").forEach((section) => {
    const slot =
      section.id === "hero"
        ? section.parentElement
        : document.createElement("div");
    if (section.id !== "hero") {
      section.before(slot);
      slot.append(section);
    }
    slot.classList.add("scene-slot");
    const copySelector =
      "h1,h2,h3,h4,p,ul,ol,summary,label,button,form,blockquote,.btn-container,.gs-work-content,.ju-line-badge";
    section.querySelectorAll(copySelector).forEach((copy) => {
      if (!copy.parentElement.closest(copySelector))
        copy.setAttribute("data-scene-copy", "");
    });
    const scene = { section, slot, progress: 0, visible: null };
    scenes.push(scene);
    byId.set(section.id, scene);
    // Device depth is local to its own animation, never another page controller.
    const device = section.querySelector(".device-shell");
    if (device)
      for (let n = 1; n <= 16; n++) {
        const layer = document.createElement("span");
        layer.className = n === 16 ? "device-back" : "device-depth";
        layer.setAttribute("aria-hidden", "true");
        layer.style.setProperty("--device-z", `${-n}px`);
        device.append(layer);
      }
  });
  root.classList.add("spiral-scenes");
  root.dataset.motionBuild = "spiral";
  measure();
  const savedY = parseFloat(sessionStorage.getItem("jugend_last_y")) || 0;
  const navType =
    window.performance?.getEntriesByType?.("navigation")?.[0]?.type;
  const crashed = sessionStorage.getItem("jugend_crashed") === "1";
  const shouldRestore =
    (crashed || navType === "back_forward" || navType === "reload") &&
    savedY > 0;
  if (shouldRestore) {
    root.classList.add("intro-complete");
    scrollTo(0, savedY);
    draw();
    requestAnimationFrame(() => {
      if (Math.abs(scrollY - savedY) > 5) {
        scrollTo(0, savedY);
        draw();
      }
    });
    sessionStorage.removeItem("jugend_crashed");
  }
  const observer = new ResizeObserver(() => {
    // Browser UI show/hide and orientation generate ResizeObserver bursts for
    // viewport-sized chapters. Ignore those; explicit resize handling below
    // owns viewport changes. Content expansion (details) still remeasures.
    if (isRotating || performance.now() < suppressObserverUntil) return;
    if (!resizeFrame)
      resizeFrame = requestAnimationFrame(() => measure("offset"));
  });
  const accordionSections = [
    "policy",
    "originalballmaking-accordion",
    "faq-slide",
  ]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  accordionSections.forEach((sec) => observer.observe(sec));
  // A fixed-height chapter does not resize when a details panel expands.
  document.addEventListener(
    "toggle",
    (event) => {
      if (!event.target.matches("details") || !event.target.closest(".chapter"))
        return;
      const details = event.target;
      const chapter = details.closest(".chapter");
      const scene = byId.get(chapter?.id);

      cancelAnimationFrame(resizeFrame);
      suppressObserverUntil = performance.now() + 300;
      measure("offset");

      if (details.open && scene) {
        const readingStart = scene.start + scene.animation;
        // When opening an accordion, immediately jump past the entry deadzone using instant behavior: 'auto'
        // so the user's very next swipe/scroll immediately moves the text without delay or gesture conflict.
        if (scrollY < readingStart) {
          window.scrollTo({ top: readingStart, behavior: "auto" });
          draw();
        }
      }
    },
    true,
  );
  // Cancel only an outward gesture at the document boundary. Internal scroll
  // areas (including the simulator) keep their own input and momentum.
  let touchY = null;
  addEventListener(
    "touchstart",
    (event) => {
      touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
    },
    { passive: true },
  );
  addEventListener(
    "touchmove",
    (event) => {
      if (touchY === null || event.touches.length !== 1 || reduced.matches)
        return;
      const nextY = event.touches[0].clientY,
        delta = touchY - nextY;
      touchY = nextY;
      const max = Math.max(0, root.scrollHeight - innerHeight);
      if (!((delta < 0 && scrollY <= 1) || (delta > 0 && scrollY >= max - 1)))
        return;
      for (const node of event.composedPath()) {
        if (
          !(node instanceof HTMLElement) ||
          node === root ||
          node === document.body ||
          node.scrollHeight <= node.clientHeight
        )
          continue;
        if (!/(auto|scroll)/.test(getComputedStyle(node).overflowY)) continue;
        if (
          (delta > 0 &&
            node.scrollTop + node.clientHeight < node.scrollHeight - 1) ||
          (delta < 0 && node.scrollTop > 0)
        )
          return;
      }
      if (event.cancelable) event.preventDefault();
    },
    { passive: false },
  );
  addEventListener(
    "touchend",
    () => {
      touchY = null;
      if (window.visualViewport && window.visualViewport.offsetTop !== 0) {
        window.scrollTo(window.scrollX, window.scrollY);
      }
    },
    { passive: true },
  );
  addEventListener(
    "scroll",
    () => {
      if (isRotating) return;
      schedule();
    },
    { passive: true },
  );
  let settleTimer = 0;
  function captureOrientationAnchor() {
    if (!orientationAnchor) {
      const curY = renderedY ?? scrollY;
      let target = lastScene;
      if (!target) {
        let idx = scenes.findIndex((scene) => curY < scene.end - 0.5);
        if (idx < 0) idx = scenes.length - 1;
        target = scenes[idx] || scenes[0];
      }
      if (target) {
        const span = target.end - target.start;
        const local = span > 0 ? clamp((curY - target.start) / span) : (lastLocal || 0);
        orientationAnchor = { id: target.section.id, local };
      }
    }
    isRotating = true;
  }
  function handleOrientationChange() {
    captureOrientationAnchor();
    suppressObserverUntil = performance.now() + 1500;
    clearTimeout(settleTimer);
    cancelAnimationFrame(resizeFrame);
    settleTimer = setTimeout(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => measure(true));
    }, 250);
  }
  addEventListener("orientationchange", handleOrientationChange, {
    passive: true,
  });
  window.screen?.orientation?.addEventListener?.("change", handleOrientationChange);
  const orientationMql = matchMedia("(orientation: portrait)");
  orientationMql.addEventListener?.("change", handleOrientationChange);
  addEventListener(
    "resize",
    () => {
      updateViewport();
      suppressObserverUntil = performance.now() + 1200;
      if (innerWidth === lastWidth) {
        if (!isRotating) schedule();
        return;
      }
      captureOrientationAnchor();
      lastWidth = innerWidth;
      cancelAnimationFrame(resizeFrame);
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => measure(true));
      }, 250);
    },
    { passive: true },
  );
  window.visualViewport?.addEventListener(
    "resize",
    () => {
      suppressObserverUntil = performance.now() + 500;
      updateViewport();
      schedule();
    },
    { passive: true },
  );
  window.visualViewport?.addEventListener(
    "scroll",
    () => {
      suppressObserverUntil = performance.now() + 500;
      updateViewport();
      schedule();
    },
    { passive: true },
  );
  document.addEventListener("jugend:layout", () => {
    // Layout event consumed by sub-components (context-gallery, etc.)
  });
  document.fonts?.ready.then(() => measure("offset"));
  addEventListener("load", () => measure("offset"), { once: true });
  reduced.addEventListener("change", () => measure(false));
  document.addEventListener("click", (event) => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor) return;
    const id = anchor.getAttribute("href").slice(1);
    if (byId.has(id)) {
      event.preventDefault();
      window.JUScenes.go(id);
    }
  });
})();
