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
      vx *= 0.92;
      if (Math.abs(vx) < 0.1) {
        vx = 0;
        inertiaId = 0;
        return;
      }
      tx += vx;
      wrap();
      render();
      inertiaId = requestAnimationFrame(stepInertia);
    };

    const pointerMove = (clientX) => {
      if (!isDown) return;
      const delta = clientX - prevX;
      prevX = clientX;
      tx += delta;
      wrap();
      render();
      vx = delta;
    };

    const endDrag = () => {
      if (!isDown) return;
      isDown = false;
      if (Math.abs(vx) > 0.1) {
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

    rail.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      isDown = true;
      prevX = e.clientX;
      vx = 0;
      stopInertia();
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

    rail.addEventListener('touchstart', (e) => {
      if (!e.touches.length) return;
      isDown = true;
      prevX = e.touches[0].clientX;
      vx = 0;
      stopInertia();
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
