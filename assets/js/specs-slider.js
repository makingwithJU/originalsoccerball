'use strict';
(() => {
  const section = document.querySelector('#specs');
  const track = section?.querySelector('.specs-slider-track');
  const cards = track ? [...track.children] : [];
  if (cards.length !== 4) return;

  let distance = 0, raf = 0;
  const prop = (name, value) => section.style.setProperty(name, value);
  const px = value => `${Math.max(0, value)}px`;

  function measureTitleHeight() {
    return Math.max(...cards.map(card => card.querySelector('.gs-work-title')?.scrollHeight || 0));
  }

  function measureRows() {
    return [0, 1, 2].map(index => Math.max(...cards.map(card => {
      const group = card.querySelectorAll('.spec-caption-group')[index];
      return group ? group.scrollHeight : 0;
    })));
  }

  function layout() {
    const previousMode = section.dataset.specLayout;
    const css = getComputedStyle(section);
    const root = getComputedStyle(document.documentElement);
    const headerInner = document.querySelector('.header-inner');
    const gutter = parseFloat(headerInner ? getComputedStyle(headerInner).paddingLeft : '') || 24;
    const bottom = parseFloat(root.getPropertyValue('--persistent-bottom')) || 0;
    const paddingTop = parseFloat(css.paddingTop) || 0;
    const paddingBottom = parseFloat(css.paddingBottom) || 0;
    const height = Math.max(1, innerHeight - paddingTop - Math.max(paddingBottom, bottom + 16));
    const gap = Math.max(16, Math.min(32, innerWidth * .022));
    const gridWidth = (Math.min(1280, innerWidth - 2 * gutter) - 3 * gap) / 4;

    prop('--spec-height', px(height));
    prop('--spec-gap', px(gap));
    prop('--spec-card-gap', '12px');
    prop('--spec-width', px(gridWidth));
    prop('--spec-image', px(gridWidth));
    prop('--spec-title-height', 'auto');
    prop('--spec-copy-height', 'auto');
    prop('--spec-card-height', 'auto');
    prop('--spec-slide-group-gap', '6px');
    prop('--spec-side-copy-max', '600px');
    prop('--spec-side-col-max', '190px');
    section.dataset.specLayout = 'grid';

    const gridRows = measureRows();
    prop('--spec-rows', gridRows.map(px).join(' '));
    const required = Math.max(...cards.map(card => card.offsetHeight));
    const canGrid = gridWidth >= 190 && required <= height;
    const side = innerWidth > innerHeight && (innerHeight <= 620 || !canGrid);
    const grid = !side && canGrid;

    if (grid) {
      track.style.paddingInline = px((innerWidth - (gridWidth * 4 + gap * 3)) / 2);
      distance = 0;
    } else if (side) {
      section.dataset.specLayout = 'side';
      const rhythm = 16;
      const image = Math.max(1, Math.min(height * .76, 320));
      const copyMax = 580;
      const colMax = 180;
      const contentWidth = image + rhythm + copyMax;
      const cardWidth = Math.min(innerWidth - 2 * gutter, contentWidth);
      const sideGap = Math.max(24, Math.min(48, innerWidth * .025));

      prop('--spec-gap', px(sideGap));
      prop('--spec-width', px(cardWidth));
      prop('--spec-image', px(image));
      prop('--spec-side-copy-max', px(copyMax));
      prop('--spec-side-col-max', px(colMax));
      track.style.paddingInline = px((innerWidth - cardWidth) / 2);
      distance = (cardWidth + sideGap) * 3;
    } else {
      section.dataset.specLayout = 'slide';
      const cardWidth = Math.max(1, Math.min(660, innerWidth - 2 * gutter));
      const groupGap = innerWidth <= 520 ? 5 : 6;
      const cardGap = 12;
      const titleMarginTop = innerWidth <= 520 ? 8 : 10;
      const titleMarginBottom = innerWidth <= 520 ? 8 : 10;
      prop('--spec-width', px(cardWidth));
      prop('--spec-slide-group-gap', px(groupGap));
      prop('--spec-card-gap', px(cardGap));
      prop('--spec-title-margin-top', px(titleMarginTop));
      prop('--spec-title-margin-bottom', px(titleMarginBottom));

      const provisionalImage = Math.max(1, Math.min(cardWidth * .66, height * .58));
      prop('--spec-image', px(provisionalImage));
      const titleHeight = measureTitleHeight();
      const rows = measureRows();
      const copyHeight = titleHeight + titleMarginTop + titleMarginBottom + rows.reduce((sum, value) => sum + value, 0) + groupGap * 2;
      const portrait = innerHeight > innerWidth;
      const imageCap = portrait ? cardWidth * .66 : cardWidth * .78;
      const image = Math.max(1, Math.min(imageCap, height - copyHeight - cardGap));
      const cardHeight = image + cardGap + copyHeight;

      prop('--spec-title-height', px(titleHeight));
      prop('--spec-rows', rows.map(px).join(' '));
      prop('--spec-copy-height', px(copyHeight));
      prop('--spec-image', px(image));
      prop('--spec-card-height', px(cardHeight));
      track.style.paddingInline = px(gutter);
      distance = (cardWidth + gap) * 3;
    }

    render();
    if (previousMode !== section.dataset.specLayout) document.dispatchEvent(new Event('jugend:layout'));
  }

  function render() {
    raf = 0;
    if (!document.documentElement.classList.contains('spiral-scenes')) {
      track.style.removeProperty('transform');
      return;
    }
    const p = window.JUScenes?.progress('specs') || 0;
    track.style.transform = `translate3d(${-distance * p}px,0,0)`;
    cards.forEach(card => {
      card.inert = false;
      card.removeAttribute('aria-hidden');
      const img = card.querySelector('.gs-work-image');
      if (img) {
        img.style.opacity = '1';
        img.style.visibility = 'visible';
      }
    });
  }

  document.addEventListener('jugend:scroll-frame', () => { if (!raf) raf = requestAnimationFrame(render); });
  new ResizeObserver(layout).observe(document.querySelector('.site-header'));
  new MutationObserver(layout).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', layout, { passive: true });
  document.fonts.ready.then(layout);
  layout();
})();
