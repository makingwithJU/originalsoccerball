'use strict';

(() => {
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = matchMedia('(hover: none) and (pointer: coarse)');

  // Keep native sticky boundaries. The alternate mode also enables clipping
  // in chapter-visuals.js; it is not a speed switch. Adjust BUILD_SCROLL_VH below.
  const SLOW_SCROLL_ENABLED = false;
  const DEFAULT_SCROLL_VH = 3;
  const SECTION_SCROLL_VH = Object.freeze({
    order: 12,
    gallery: 10,
    'usage-title': 6,
    'event-shop-title': 6
  });
  const BUILD_SCROLL_VH = Object.freeze({
    default: 4.5,
    order: 36,
    gallery: 30,
    'usage-title': 21,
    'event-shop-title': 21
  });
  if (root?.dataset) root.dataset.motionBuild = SLOW_SCROLL_ENABLED ? 'slow' : 'fast';
  const PHASES = Object.freeze({
    entryEnd: 0.18,
    revealEnd: 0.38,
    holdEnd: 0.72,
    exitStart: 0.82
  });
  const STATIC_SECTION_IDS = new Set([
    'contact-apology',
    'manufacturing-status',
    'design-intro',
    'originalballmaking-accordion'
  ]);

  const scenes = [];
  let sceneHeight = innerHeight;
  let sceneWidth = innerWidth;
  let measuredViewportHeight = innerHeight;
  let frame = 0;
  let resizeTimer = 0;
  let touching = false;
  let previousDrawY = 0;

  // Rotation changes every vh-based stage height. Keep a logical location
  // (chapter + local progress) instead of an absolute scrollY so the same
  // scene survives portrait/landscape reflow without reloading the page.
  let logicalAnchor = null;
  let rotationAnchor = null;
  let rotationPending = false;
  let rotationTimer = 0;
  let rotationGeneration = 0;
  let layoutOrientation = innerWidth >= innerHeight ? 'landscape' : 'portrait';

  const clamp01 = value => Math.max(0, Math.min(1, value));
  const smoothstep = value => value * value * (3 - 2 * value);
  const currentScrollY = () => (typeof scrollY === 'number' && Number.isFinite(scrollY) ? scrollY : 0);
  const orientationKey = () => (innerWidth >= innerHeight ? 'landscape' : 'portrait');
  const documentMaxScroll = () => Math.max(
    0,
    ((document.documentElement.scrollHeight || document.body?.scrollHeight || innerHeight) - innerHeight)
  );

  function scrollVhFor(section) {
    return SLOW_SCROLL_ENABLED
      ? (SECTION_SCROLL_VH[section.id] ?? DEFAULT_SCROLL_VH)
      : (BUILD_SCROLL_VH[section.id] ?? BUILD_SCROLL_VH.default);
  }

  function scrollSpanFor(section) {
    return sceneHeight * scrollVhFor(section);
  }

  function measureNow(scheduleDraw = true) {
    // ResizeObserver/touchend may measure before the window resize listener.
    // Preserve the old endpoint in this path too, before draw can replace it.
    const preserveEndpoint = coarsePointer.matches && !rotationPending &&
      innerWidth === sceneWidth && innerHeight !== measuredViewportHeight &&
      logicalAnchor?.kind === 'bottom' &&
      !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
    const heroHeight = document.querySelector?.('#hero')?.offsetHeight;
    if (heroHeight > 0) {
      sceneHeight = heroHeight;
    } else if (!coarsePointer.matches || innerWidth !== sceneWidth) {
      sceneHeight = innerHeight;
    }
    sceneWidth = innerWidth;
    measuredViewportHeight = innerHeight;

    for (const scene of scenes) {
      const { section, stage } = scene;
      const sectionHeight = section.offsetHeight;
      const scrollSpan = reducedMotion.matches ? 0 : scrollSpanFor(section);
      scene.scrollSpan = scrollSpan;

      stage.style.height = `${sectionHeight + scrollSpan}px`;
      stage.dataset.scrollVh = String(scrollVhFor(section));
      section.style.setProperty('--stack-top', '0px');
      section.dataset.long = String(sectionHeight > sceneHeight + 2);
    }

    if (preserveEndpoint) scrollTo(0, documentMaxScroll());
    if (scheduleDraw) schedule();
  }

  function measure() {
    if (touching || rotationPending) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measureNow, 60);
  }

  function chapterAnchor(scene, rect) {
    const passed = Math.max(0, -rect.top);
    const scrollSpan = Math.max(1, scene.scrollSpan || 0);

    if (rect.top > 0) {
      return {
        kind: 'chapter',
        id: scene.section.id,
        phase: 'entry',
        progress: clamp01((sceneHeight - rect.top) / Math.max(1, sceneHeight))
      };
    }

    if (passed <= scrollSpan) {
      return {
        kind: 'chapter',
        id: scene.section.id,
        phase: 'progress',
        progress: clamp01(passed / scrollSpan)
      };
    }

    const tailSpan = Math.max(0, scene.section.offsetHeight - sceneHeight);
    return {
      kind: 'chapter',
      id: scene.section.id,
      phase: tailSpan > 1 ? 'tail' : 'progress',
      progress: tailSpan > 1 ? clamp01((passed - scrollSpan) / tailSpan) : 1
    };
  }

  function captureLogicalAnchor(layouts) {
    const y = Math.max(0, currentScrollY());
    const maxScroll = documentMaxScroll();
    const edgeTolerance = Math.max(3, Math.min(24, sceneHeight * 0.02));

    if (y <= edgeTolerance) return { kind: 'top' };
    if (maxScroll - y <= edgeTolerance) return { kind: 'bottom' };

    const firstStageTop = layouts[0]?.absoluteTop ?? Infinity;
    if (y < firstStageTop) {
      const zone = document.querySelector?.('#hero-scroll-zone');
      const hero = document.querySelector?.('#hero');
      if (zone && hero) {
        const zoneTop = y + zone.getBoundingClientRect().top;
        const span = Math.max(1, zone.offsetHeight - hero.offsetHeight);
        return { kind: 'hero', progress: clamp01((y - zoneTop) / span) };
      }
      return { kind: 'top' };
    }

    const viewportCenter = y + sceneHeight * 0.5;
    let selected = null;
    let nearestDistance = Infinity;

    for (const layout of layouts) {
      const bottom = layout.absoluteTop + layout.height;
      if (viewportCenter >= layout.absoluteTop && viewportCenter <= bottom) {
        selected = layout;
        break;
      }
      const distance = viewportCenter < layout.absoluteTop
        ? layout.absoluteTop - viewportCenter
        : viewportCenter - bottom;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        selected = layout;
      }
    }

    return selected ? chapterAnchor(selected.scene, selected.rect) : { kind: 'bottom' };
  }

  function resolveLogicalAnchor(anchor) {
    if (!anchor) return currentScrollY();
    const maxScroll = documentMaxScroll();

    if (anchor.kind === 'top') return 0;
    if (anchor.kind === 'bottom') return maxScroll;

    if (anchor.kind === 'hero') {
      const zone = document.querySelector?.('#hero-scroll-zone');
      const hero = document.querySelector?.('#hero');
      if (!zone || !hero) return currentScrollY();
      const y = currentScrollY();
      const zoneTop = y + zone.getBoundingClientRect().top;
      const span = Math.max(1, zone.offsetHeight - hero.offsetHeight);
      return Math.max(0, Math.min(maxScroll, zoneTop + clamp01(anchor.progress) * span));
    }

    const scene = scenes.find(item => item.section.id === anchor.id);
    if (!scene) return currentScrollY();

    const y = currentScrollY();
    const stageTop = y + scene.stage.getBoundingClientRect().top;
    let target = stageTop;

    if (anchor.phase === 'entry') {
      target -= sceneHeight * (1 - clamp01(anchor.progress));
    } else if (anchor.phase === 'tail') {
      const tailSpan = Math.max(0, scene.section.offsetHeight - sceneHeight);
      target += scene.scrollSpan + tailSpan * clamp01(anchor.progress);
    } else {
      target += scene.scrollSpan * clamp01(anchor.progress);
    }

    return Math.max(0, Math.min(maxScroll, target));
  }

  function finishRotation(generation) {
    if (generation !== rotationGeneration) return;
    clearTimeout(resizeTimer);
    measureNow(false);

    requestAnimationFrame(() => {
      if (generation !== rotationGeneration) return;
      window.ScrollTrigger?.refresh?.();

      requestAnimationFrame(() => {
        if (generation !== rotationGeneration) return;
        const target = resolveLogicalAnchor(rotationAnchor || logicalAnchor);
        if (typeof scrollTo === 'function' && Number.isFinite(target)) {
          scrollTo(0, target);
        }
        window.ScrollTrigger?.update?.();
        rotationPending = false;
        rotationAnchor = null;
        layoutOrientation = orientationKey();
        schedule();
      });
    });
  }

  function queueRotationRestore() {
    if (!rotationPending) {
      rotationPending = true;
      rotationAnchor = logicalAnchor;
    }
    clearTimeout(resizeTimer);
    clearTimeout(rotationTimer);
    const generation = ++rotationGeneration;
    rotationTimer = setTimeout(() => finishRotation(generation), 180);
  }

  function handleResize() {
    const nextOrientation = orientationKey();
    // A toolbar/viewport height change also changes the final stage span.
    // Keep a reader already at the endpoint there, instead of adding a new
    // scroll tail. Other same-orientation positions retain native scrolling.
    const editing = document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
    const preserveEndpoint = coarsePointer.matches && !editing && logicalAnchor?.kind === 'bottom';
    if (rotationPending || nextOrientation !== layoutOrientation || preserveEndpoint) {
      layoutOrientation = nextOrientation;
      queueRotationRestore();
      return;
    }
    measure();
  }

  function draw() {
    frame = 0;
    let visibilityChanged = false;
    const layouts = [];
    const y = currentScrollY();
    const now = Date.now();
    let animating = false;

    for (const scene of scenes) {
      const { section, stage, entrance } = scene;
      const rect = stage.getBoundingClientRect();
      const covered = rect.bottom <= 0 || rect.top >= sceneHeight;
      const height = stage.offsetHeight || Math.max(0, rect.bottom - rect.top);
      layouts.push({ scene, rect, absoluteTop: y + rect.top, height });

      if (section.dataset.covered !== String(covered)) {
        section.dataset.covered = String(covered);
        visibilityChanged = true;
      }

      const entryLinear = reducedMotion.matches
        ? 1
        : clamp01((sceneHeight - rect.top) / Math.max(1, sceneHeight));
      const entry = smoothstep(entryLinear);
      const scrollSpan = Math.max(1, scene.scrollSpan || 0);
      const progress = reducedMotion.matches ? 1 : clamp01(-rect.top / scrollSpan);
      const phaseEntry = reducedMotion.matches
        ? 1
        : smoothstep(clamp01(progress / PHASES.entryEnd));
      const reveal = reducedMotion.matches
        ? 1
        : smoothstep(clamp01((progress - PHASES.entryEnd) / Math.max(0.001, PHASES.revealEnd - PHASES.entryEnd)));
      const hold = reducedMotion.matches
        ? 1
        : smoothstep(clamp01((progress - PHASES.revealEnd) / Math.max(0.001, PHASES.holdEnd - PHASES.revealEnd)));
      const exit = reducedMotion.matches
        ? 0
        : smoothstep(clamp01((progress - PHASES.exitStart) / Math.max(0.001, 1 - PHASES.exitStart)));

      // A timed entrance, independent of wheel delta: native page scrolling
      // stays untouched. Re-arm only after the entire chapter leaves view.
      if (covered) scene.motionStarted = null;
      if (!covered && scene.motionStarted == null) {
        scene.motionStarted = now;
        scene.motionDirection = y < previousDrawY ? -1 : 1;
      }
      const motionLinear = reducedMotion.matches || covered ? 1 : clamp01((now - scene.motionStarted) / 2400);
      const motion = smoothstep(motionLinear);
      if (!covered && motionLinear < 1) animating = true;
      const slide = reducedMotion.matches || covered ? 0 : scene.motionDirection * sceneHeight * 0.65 * (1 - motion);
      section.dataset.motionReady = String(motionLinear >= 1 && (!section.querySelector('.device-shell') || now - scene.motionStarted >= 3200));
      section.style.setProperty('--chapter-slide', `${slide}px`);
      section.style.setProperty('--chapter-entry', entry);
      section.style.setProperty('--chapter-progress', progress);
      section.style.setProperty('--chapter-phase-entry', phaseEntry);
      section.style.setProperty('--chapter-reveal', reveal);
      section.style.setProperty('--chapter-hold', hold);
      section.style.setProperty('--chapter-exit', exit);
      section.dataset.chapterPhase = entry < 0.999
        ? 'entry'
        : progress < PHASES.revealEnd
          ? 'reveal'
          : progress < PHASES.exitStart
            ? 'hold'
            : 'exit';

      if (entrance) entrance.progress(entry);

      const device = section.querySelector('.device-shell');
      if (device) {
        if (reducedMotion.matches) {
          device.style.transform = 'none';
          device.style.opacity = '1';
        } else {
          // One complete diagonal turn during entrance, then a
          // stable front face for reading / operating the real iframe.
          const turn = reducedMotion.matches || covered ? 1 : smoothstep(clamp01((now - scene.motionStarted) / 3000));
          if (!covered && turn < 1) animating = true;
          const w = device.offsetWidth || 1, h = device.offsetHeight || 1;
          const diagonal = Math.hypot(w, h);
          const room = Math.min(innerWidth * 0.86, sceneHeight * 0.70);
          const fit = Math.min(0.78, room / diagonal);
          const scale = 1 - (1 - fit) * Math.sin(Math.PI * turn);
          device.style.transform = `perspective(1600px) rotate3d(1,1,0,${-360 * turn}deg) scale(${scale})`;
          device.style.opacity = '1';
        }
      }
    }

    if (!rotationPending && innerHeight === measuredViewportHeight && innerWidth === sceneWidth && orientationKey() === layoutOrientation) {
      logicalAnchor = captureLogicalAnchor(layouts);
    }

    if (visibilityChanged) {
      document.dispatchEvent(new Event('jugend:chapter-visibility'));
    }
    document.dispatchEvent(new Event('jugend:chapter-motion'));
    previousDrawY = y;
    if (animating) schedule();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function createScene(section) {
    if (section.parentElement?.classList.contains('chapter-stage')) return;

    const stage = document.createElement('div');
    stage.className = 'chapter-stage';
    stage.dataset.chapterAnchor = section.id;
    section.before(stage);
    stage.append(section);

    const headline = STATIC_SECTION_IDS.has(section.id) || ['usage-title', 'event-shop-title'].includes(section.id)
      ? null
      : section.querySelector('h2:not(#faq-title):not(.eyebrow)');
    const entrance = headline && window.gsap
      ? gsap.timeline({ paused: true }).fromTo(
          headline,
          {
            yPercent: 35,
            rotationX: -18,
            scale: 0.94,
            opacity: 0,
            transformPerspective: 1000,
            transformOrigin: '50% 100%'
          },
          {
            yPercent: 0,
            rotationX: 0,
            scale: 1,
            opacity: 1,
            duration: 1.5,
            ease: 'power2.out'
          }
        )
      : null;

    const device = section.querySelector('.device-shell');
    if (device && !device.querySelector('.device-back')) {
      for (let depth = 1; depth <= 16; depth++) {
        const layer = document.createElement('span');
        layer.className = depth === 16 ? 'device-back' : 'device-depth';
        layer.setAttribute('aria-hidden', 'true');
        layer.style.setProperty('--device-z', `${-depth}px`);
        device.append(layer);
      }
    }

    scenes.push({ section, stage, entrance, scrollSpan: 0 });
  }

  document.querySelectorAll('main > .chapter').forEach(createScene);
  root.classList.add('stages-ready');

  const observer = new ResizeObserver(measure);
  scenes.forEach(({ section }) => observer.observe(section));

  addEventListener('resize', handleResize, { passive: true });
  if (typeof screen !== 'undefined' && screen.orientation?.addEventListener) {
    screen.orientation.addEventListener('change', queueRotationRestore);
  }
  addEventListener('scroll', schedule, { passive: true });

  // WebKit still allows elastic bottom overscroll in cases where
  // overscroll-behavior is not honored. Suppress only the gesture that tries
  // to move past the true document end; normal page/nested scrolling remains native.
  let lastTouchY = null;
  const isEditableTarget = target => target?.closest?.('input, textarea, select, [contenteditable="true"], dialog');

  addEventListener('touchstart', event => {
    touching = true;
    lastTouchY = event.touches?.length === 1 ? event.touches[0].clientY : null;
  }, { passive: true });
  addEventListener('touchmove', event => {
    if (event.touches?.length !== 1 || lastTouchY == null || isEditableTarget(event.target)) return;
    const currentY = event.touches[0].clientY;
    const attemptingPastBottom = currentY < lastTouchY && currentScrollY() >= documentMaxScroll() - 2;
    lastTouchY = currentY;
    if (attemptingPastBottom) event.preventDefault();
  }, { passive: false });
  addEventListener('touchend', () => { touching = false; lastTouchY = null; measure(); schedule(); }, { passive: true });
  addEventListener('touchcancel', () => { touching = false; lastTouchY = null; measure(); }, { passive: true });
  reducedMotion.addEventListener('change', measure);

  measureNow();
  document.addEventListener('jugend:scroll-frame',()=>{cancelAnimationFrame(frame);frame=0;draw();});
})();
