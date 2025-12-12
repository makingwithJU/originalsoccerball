(()=> {
  const waitForImages = (imgs) => {
    if (!imgs.length) return Promise.resolve();
    return Promise.all(imgs.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(res => {
        img.addEventListener('load', res, { once: true });
        img.addEventListener('error', res, { once: true });
      });
    }));
  };

  const collectImages = (nodes) => {
    const gathered = [];
    nodes.forEach(node => {
      if (node.tagName === 'IMG') {
        gathered.push(node);
      } else {
        gathered.push(...node.querySelectorAll('img'));
      }
    });
    return gathered;
  };

  const setup = (rail) => {
    const track = rail.querySelector('.ju-track');
    if (!track || track.dataset.juGalleryInit === '1') return;
    track.dataset.juGalleryInit = '1';

    const originals = Array.from(track.children);
    if (!originals.length) return;

    const beforeFrag = document.createDocumentFragment();
    const afterFrag = document.createDocumentFragment();
    originals.forEach(node => {
      beforeFrag.appendChild(node.cloneNode(true));
      afterFrag.appendChild(node.cloneNode(true));
    });
    track.insertBefore(beforeFrag, track.firstChild);
    track.appendChild(afterFrag);

    track.querySelectorAll('img[loading="lazy"]').forEach(img => {
      try {
        img.loading = 'eager';
      } catch (_) {
        img.removeAttribute('loading');
      }
    });

    const images = collectImages(originals);
    const ready = waitForImages(images);

    let sectionWidth = 0;
    let tx = 0;
    let vx = 0;
    let isDown = false;
    let prevX = 0;
    let inertiaId = 0;
    let resizeRaf = 0;

    // --- New variables for robust velocity tracking ---
    let velHistory = [];
    let lastMoveTimestamp = 0;

    const computeWidth = () => {
      const style = getComputedStyle(track);
      const gap = parseFloat(style.columnGap || style.gap || '0') || 0;
      const singleWidth = originals.reduce((sum, node) => sum + node.getBoundingClientRect().width, 0);
      sectionWidth = singleWidth + gap * Math.max(0, originals.length - 1);
    };

    const wrap = () => {
      if (!sectionWidth) return;
      const lower = -sectionWidth * 2;
      const upper = 0;
      while (tx < lower) {
        tx += sectionWidth;
      }
      while (tx > upper) {
        tx -= sectionWidth;
      }
    };

    const render = () => {
      track.style.transform = `translate3d(${tx}px,0,0)`;
    };

    const stopInertia = () => {
      if (inertiaId) {
        cancelAnimationFrame(inertiaId);
        inertiaId = 0;
      }
    };

    const stepInertia = () => {
      // Friction for inertia
      vx *= 0.985;
      if (Math.abs(vx) < 0.05) { // Stop if velocity is negligible
        vx = 0;
        inertiaId = 0;
        return;
      }
      tx += vx;
      wrap();
      render();
      inertiaId = requestAnimationFrame(stepInertia);
    };
    
    // --- MODIFIED: pointerMove function ---
    const pointerMove = (clientX) => {
      if (!isDown) return;
      const delta = clientX - prevX;
      prevX = clientX;
      
      // Direct dragging feel
      tx += delta * 1.4;
      wrap();
      render();

      // Record history for velocity calculation
      const now = performance.now();
      if (now - lastMoveTimestamp > 5) { // Throttle recording
          velHistory.push({ x: clientX, time: now });
          if (velHistory.length > 30) { // Keep a limited history
              velHistory.shift();
          }
          lastMoveTimestamp = now;
      }
    };

    // --- MODIFIED: endDrag function ---
    const endDrag = () => {
      if (!isDown) return;
      isDown = false;

      // Calculate velocity from recent history for a flick gesture
      const now = performance.now();
      const relevantHistory = velHistory.filter(p => now - p.time < 100); // last 100ms

      vx = 0; // Default to no velocity
      if (relevantHistory.length > 2) {
          const first = relevantHistory[0];
          const last = relevantHistory[relevantHistory.length - 1];
          const dist = last.x - first.x;
          const time = last.time - first.time;
          
          if (time > 0) {
              const velocity = dist / time; // pixels per millisecond
              vx = velocity * 15; // Amplify for a better feel
          }
      }
      
      velHistory = []; // Clear history

      // Start inertia if velocity is significant
      if (Math.abs(vx) > 1) {
        stopInertia();
        inertiaId = requestAnimationFrame(stepInertia);
      }
    };

    ready.then(() => {
      computeWidth();
      if (!sectionWidth) {
        requestAnimationFrame(() => {
          computeWidth();
          if (sectionWidth) {
            tx = -sectionWidth;
            wrap();
            render();
          }
        });
        return;
      }
      tx = -sectionWidth;
      wrap();
      render();
    });

    const handleResize = () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        const prev = sectionWidth;
        computeWidth();
        if (!sectionWidth) return;
        if (prev) {
          tx = (tx / prev) * sectionWidth;
          wrap();
        } else {
          tx = -sectionWidth;
        }
        render();
        resizeRaf = 0;
      });
    };

    window.addEventListener('resize', handleResize, { passive: true });

    // --- MODIFIED: pointerdown event ---
    rail.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      isDown = true;
      prevX = e.clientX;
      vx = 0;
      stopInertia();
      velHistory = [{x: e.clientX, time: performance.now()}]; // Reset and seed history
      lastMoveTimestamp = performance.now();
      rail.classList.add('ju-rail--dragging');
      rail.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });

    rail.addEventListener('pointermove', (e) => {
      if (!isDown) return;
      pointerMove(e.clientX);
      e.preventDefault();
    }, { passive: false });

    rail.addEventListener('pointerup', (e) => {
      if (!isDown) return;
      rail.classList.remove('ju-rail--dragging');
      rail.releasePointerCapture?.(e.pointerId);
      endDrag();
    });

    rail.addEventListener('pointercancel', () => {
      if (!isDown) return;
      rail.classList.remove('ju-rail--dragging');
      endDrag();
    });

    // --- MODIFIED: touchstart event ---
    rail.addEventListener('touchstart', (e) => {
      if (!e.touches.length) return;
      isDown = true;
      prevX = e.touches[0].clientX;
      vx = 0;
      stopInertia();
      velHistory = [{x: e.touches[0].clientX, time: performance.now()}]; // Reset and seed history
      lastMoveTimestamp = performance.now();
      rail.classList.add('ju-rail--dragging');
    }, { passive: true });

    rail.addEventListener('touchmove', (e) => {
      if (!isDown || !e.touches.length) return;
      pointerMove(e.touches[0].clientX);
      e.preventDefault();
    }, { passive: false });

    const endTouch = () => {
      if (!isDown) return;
      rail.classList.remove('ju-rail--dragging');
      endDrag();
    };
    rail.addEventListener('touchend', endTouch);
    rail.addEventListener('touchcancel', endTouch);

    rail.addEventListener('wheel', (e) => {
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);
      if (absX === 0 || absX <= absY) return;
      const delta = e.deltaX;
      tx -= delta;
      wrap();
      render();
      vx = -delta;
      stopInertia();
      inertiaId = requestAnimationFrame(stepInertia);
      e.preventDefault();
    }, { passive: false });
  };

  const init = () => {
    document.querySelectorAll('.ju-rail').forEach(setup);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();