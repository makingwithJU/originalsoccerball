'use strict';
// Order / Design Gallery
// 1. Measure the usable viewport, excluding the visible header/footer.
// 2. Build image textures using the approved crop, without changing source files.
// 3. Move those planes on the sphere; share their final sizes with HTML captions.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp01 = value => Math.max(0, Math.min(1, value));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const ease = value => value * value * (3 - 2 * value);
  const lerp = (a, b, t) => a + (b - a) * t;
  const px = value => Number.parseFloat(value) || 0;
  const CAMERA_Z = 1900;
  const EDGE = 8;
  const CONNECTOR_OPACITY = 1;
  const PC_CINEMATIC_QUERY = '(min-width: 1100px) and (pointer: fine) and (min-height: 620px) and (min-aspect-ratio: 4/3) and (max-aspect-ratio: 23/10)';
  const TABLET_QUERY = '(min-width: 700px) and (max-width: 1099px)';
  const galleries = [];
  let raf = 0;

  function viewportRect() {
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0;
    const top = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth;
    const height = viewport?.height || innerHeight;
    return { left, top, right: left + width, bottom: top + height, width, height };
  }

  function gridRect(viewport) {
    const grid = document.querySelector('.header-inner.container');
    if (!grid) return { left: viewport.left, right: viewport.right };
    const rect = grid.getBoundingClientRect();
    const style = getComputedStyle(grid);
    const left = clamp(rect.left + px(style.paddingLeft), viewport.left, viewport.right);
    const right = clamp(rect.right - px(style.paddingRight), viewport.left, viewport.right);
    return { left, right: Math.max(left + 1, right) };
  }

  function reservedFooterTop(viewport) {
    // The footer/notice only becomes a visual constraint after the one-way
    // footer latch is actually visible. Before that, Gallery gets the full
    // viewport below the header so the composition does not look undersized.
    if (!document.documentElement.classList.contains('footer-visible')) return viewport.bottom;
    let bottom = viewport.bottom;
    for (const node of [document.querySelector('footer'), document.getElementById('site-notice')]) {
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      if (rect.height > 0 && rect.top > viewport.top && rect.top < bottom) bottom = rect.top;
    }
    return bottom;
  }

  function measureFrame(section, fullBleed = false) {
    const viewport = viewportRect();
    const grid = fullBleed ? { left: viewport.left, right: viewport.right } : gridRect(viewport);
    const header = document.querySelector('.site-header');
    const top = Math.max(viewport.top, header?.getBoundingClientRect().bottom || viewport.top);
    const bottom = Math.max(top + 1, reservedFooterTop(viewport));
    const rect = section.getBoundingClientRect();
    return {
      left: grid.left,
      right: grid.right,
      top,
      bottom,
      width: Math.max(1, grid.right - grid.left),
      height: Math.max(1, bottom - top),
      localLeft: grid.left - rect.left,
      localTop: top - rect.top,
      portrait: viewport.height > viewport.width,
    };
  }

  function layoutFor(frame) {
    const portrait = frame.portrait;
    const tablet = matchMedia(TABLET_QUERY).matches;
    const captionReserve = tablet ? (portrait ? 112 : 96) : (portrait ? 62 : 74);
    const desktop = matchMedia('(min-width: 1100px) and (pointer: fine)').matches;

    if (portrait && tablet) {
      // Tablet portrait: fit the complete sphere + released card + caption inside
      // the measured header/footer safe frame. This branch does not change
      // phone portrait or any desktop layout.
      const radius = clamp(Math.min(frame.width * .285, frame.height * .19), 108, 170);
      const headingBand = clamp(frame.width * .10, 42, 58);
      const sphereX = frame.width * .50;
      const sphereY = clamp(frame.height * .255, radius + EDGE, frame.height - radius - EDGE);
      const sphereBottom = sphereY + radius;
      const rowTopMin = sphereBottom + headingBand + 14;
      const availableBelow = Math.max(120, frame.height - rowTopMin - captionReserve - EDGE);
      const tileHeight = clamp(Math.min(frame.width * .62, frame.height * .34, availableBelow), 150, 300);
      const minRowY = rowTopMin + tileHeight / 2;
      const maxRowY = frame.height - captionReserve - EDGE - tileHeight / 2;
      const rowY = maxRowY >= minRowY ? clamp((minRowY + maxRowY) / 2, minRowY, maxRowY) : frame.height * .68;
      return {
        portrait, tablet: true, radius, sphereX, sphereY,
        rowX: frame.width * .50, rowY, tileHeight, headingBand, captionReserve,
      };
    }

    if (portrait) {
      // Portrait keeps the stacked composition. The sphere/card dimensions are
      // intentionally conservative so the mobile layout remains readable.
      const radius = Math.max(72, Math.min(170, frame.width * .34, frame.height * .225));
      const headingBand = clamp(frame.width * .12, 46, 68);
      const sphereX = frame.width * .50;
      const sphereY = clamp(frame.height * .30, radius * .82, frame.height - radius * .78);
      const sphereBottom = sphereY + radius;
      const rowTopMin = sphereBottom + headingBand + 20;
      const availableBelow = Math.max(96, frame.height - rowTopMin - captionReserve - EDGE);
      const tileHeight = Math.max(110, Math.min(360, frame.width * .78, frame.height * .40, availableBelow));
      const rowY = Math.min(
        frame.height - captionReserve - EDGE - tileHeight / 2,
        rowTopMin + tileHeight / 2
      );
      return {
        portrait,
        radius,
        sphereX,
        sphereY,
        rowX: frame.width * .50,
        rowY,
        tileHeight,
        headingBand,
        captionReserve,
      };
    }

    // PC-only composition. Keep tablet/mobile on the untouched branch below.
    // The heading owns the upper centre, while the 3D sphere and released work
    // form a balanced left/right pair. Short desktop viewports may crop the
    // sphere/card slightly for impact, but never scale them to absurd sizes.
    if (desktop) {
      const shortDesktop = frame.height < 520;
      if (shortDesktop) {
        // Short/wide PC only: keep every other viewport on the V11 geometry.
        // The product caption gets its own column to the right of the released
        // product image so the product is never covered by text.
        const shortCaptionReserve = 0;
        const radius = clamp(frame.height * .95, 210, 250);
        const sphereX = frame.width * .29;
        const sphereY = frame.height * .60;
        const tileHeight = clamp(frame.height - EDGE * 2, 180, 232);
        const captionWidth = clamp(frame.width * .14, 190, 250);
        const captionGap = clamp(frame.width * .012, 16, 24);
        const objectGap = clamp(frame.width * .022, 26, 46);
        const sphereRight = sphereX + radius;
        const desiredRowX = frame.width * .72;
        const minRowX = sphereRight + objectGap + tileHeight / 2;
        const maxRowX = frame.width - EDGE - captionWidth - captionGap - tileHeight / 2;
        const rowX = maxRowX >= minRowX
          ? clamp(desiredRowX, minRowX, maxRowX)
          : Math.max(tileHeight / 2 + EDGE, Math.min(desiredRowX, maxRowX));
        const minRowY = tileHeight / 2 + EDGE;
        const maxRowY = frame.height - EDGE - tileHeight / 2;
        const rowY = maxRowY >= minRowY
          ? clamp(frame.height * .52, minRowY, maxRowY)
          : frame.height / 2;

        return {
          portrait,
          desktop: true,
          shortDesktop: true,
          radius,
          sphereX,
          sphereY,
          rowX,
          rowY,
          tileHeight,
          captionWidth,
          captionGap,
          headingBand: 0,
          captionReserve: shortCaptionReserve,
        };
      }

      const desiredTile = clamp(Math.min(frame.height * .66, frame.width * .42), 430, 600);
      const tileHeight = Math.min(
        desiredTile,
        Math.max(220, frame.height - captionReserve - EDGE * 2)
      );
      const minRowY = tileHeight / 2 + EDGE;
      const maxRowY = frame.height - captionReserve - EDGE - tileHeight / 2;
      const rowY = maxRowY >= minRowY
        ? clamp(frame.height * .58, minRowY, maxRowY)
        : frame.height / 2;

      return {
        portrait,
        desktop: true,
        shortDesktop: false,
        radius: clamp(frame.height * .37, 245, 340),
        sphereX: frame.width * .29,
        sphereY: frame.height * .60,
        rowX: frame.width * .73,
        rowY,
        tileHeight,
        headingBand: 0,
        captionReserve,
      };
    }

    if (tablet) {
      // Tablet landscape: keep both subjects completely inside the same safe
      // frame. The old hard minimums (200/260) were larger than the usable
      // Safari viewport after browser chrome/footer and caused clipping.
      const radius = clamp(Math.min(frame.width * .17, frame.height * .30), 112, 190);
      const tileHeight = clamp(Math.min(frame.width * .30, frame.height * .50), 160, 300);
      const sphereX = clamp(frame.width * .30, radius + EDGE, frame.width * .42);
      const sphereY = clamp(frame.height * .52, radius + EDGE, frame.height - radius - EDGE);
      const rowX = frame.width * .74;
      const minRowY = tileHeight / 2 + EDGE;
      const maxRowY = frame.height - captionReserve - EDGE - tileHeight / 2;
      const rowY = maxRowY >= minRowY ? clamp(frame.height * .50, minRowY, maxRowY) : frame.height * .50;
      return {
        portrait, tablet: true, radius, sphereX, sphereY, rowX, rowY, tileHeight,
        headingBand: 0, captionReserve,
      };
    }

    // Non-PC landscape phone: preserve the previous geometry exactly.
    const radius = clamp(
      Math.min(frame.width * .20, frame.height * .58),
      200,
      340
    );
    const tileHeight = clamp(
      Math.min(frame.width * .34, frame.height * .76),
      260,
      560
    );
    const sphereX = frame.width * .36;
    const sphereY = frame.height * .58;
    const rowX = frame.width * .74;
    const idealRowY = frame.height * .58;
    const maxRowY = frame.height - captionReserve - EDGE - tileHeight / 2;
    const rowY = Math.max(tileHeight / 2 - EDGE, Math.min(idealRowY, maxRowY));

    return {
      portrait,
      radius,
      sphereX,
      sphereY,
      rowX,
      rowY,
      tileHeight,
      headingBand: 0,
      captionReserve,
    };
  }

  function buildCells(count) {
    const cells = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - 2 * ((i + .5) / count);
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = i * golden;
      cells.push({ x: Math.cos(theta) * ring, y, z: Math.sin(theta) * ring, minChord: Infinity });
    }
    for (let i = 0; i < cells.length; i++) {
      let min = Infinity;
      for (let j = 0; j < cells.length; j++) {
        if (i === j) continue;
        const dx = cells[i].x - cells[j].x;
        const dy = cells[i].y - cells[j].y;
        const dz = cells[i].z - cells[j].z;
        min = Math.min(min, Math.hypot(dx, dy, dz));
      }
      cells[i].minChord = Number.isFinite(min) ? min : 1;
    }
    return cells;
  }

  function create(id) {
    const section = document.getElementById(id);
    const rail = section?.querySelector('.rail');
    if (!section || !rail) return null;

    const items = [...rail.children];
    const art = items.map(item => item.querySelector('.gs-work-image-wrapper') || item.querySelector('img'));
    const sources = items.map(item => item.querySelector('img'));
    const captions = items.map(item => item.querySelector('.gs-work-content'));
    const heading = id === 'order' ? section.querySelector('.order-gallery__head') : null;
    const cells = buildCells(items.length);

    rail.classList.add('cinematic-rail', 'sphere-unroll-rail', 'ribbon-rail');
    section.classList.add('gallery-pending');
    section.dataset.galleryMode = 'sphere-unroll-v23';
    sources.forEach(image => {
      image.draggable = false;
      image.loading = 'eager';
    });
    rail.addEventListener('dragstart', event => event.preventDefault());

    const visualLayer = document.createElement('div');
    visualLayer.className = 'gallery-visual-layer';
    visualLayer.hidden = true;
    section.append(visualLayer);

    const connectorLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    connectorLayer.classList.add('gallery-connector-layer');
    connectorLayer.setAttribute('aria-hidden', 'true');
    connectorLayer.setAttribute('preserveAspectRatio', 'none');
    visualLayer.append(connectorLayer);

    let renderer;
    let scene;
    let camera;
    let entries;
    let textureKey = '';
    let rotation = .55;
    let lastTime = 0;
    let failed = false;
    let zAxis;
    let identityQuat;
    let tempNormal;
    let tempPosition;
    let tempQuat;
    let sphereCenter;
    let projectedStart;
    let projectedEnd;

    function initialize() {
      if (renderer) return true;
      if (failed) return false;
      if (!window.THREE) {
        failed = true;
        return false;
      }
      // A failed request is complete too. It gets a placeholder, not an endless wait.
      if (sources.some(image => !image.complete)) return false;

      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      } catch {
        failed = true;
        return false;
      }

      zAxis = new THREE.Vector3(0, 0, 1);
      identityQuat = new THREE.Quaternion();
      tempNormal = new THREE.Vector3();
      tempPosition = new THREE.Vector3();
      tempQuat = new THREE.Quaternion();
      sphereCenter = new THREE.Vector3();
      projectedStart = new THREE.Vector3();
      projectedEnd = new THREE.Vector3();

      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.setClearColor(0, 0);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.domElement.className = 'ribbon-canvas';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      visualLayer.append(renderer.domElement);
      visualLayer.append(connectorLayer);

      scene = new THREE.Scene();
      // The sphere is a positioning guide only; it must never occlude artwork.
      camera = new THREE.PerspectiveCamera(30, 1, 1, 12000);

      entries = sources.map((image, index) => {
        const canvas = document.createElement('canvas');
        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        texture.minFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
        mesh.frustumCulled = false;
        mesh.renderOrder = 2;
        scene.add(mesh);

        const connector = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        connector.classList.add('gallery-connector');
        connector.setAttribute('vector-effect', 'non-scaling-stroke');
        connectorLayer.append(connector);

        return {
          mesh, connector, canvas, image, cell: cells[index],
          basePosition: new THREE.Vector3(), baseQuaternion: new THREE.Quaternion(),
          baseWidth: 1, baseHeight: 1, aspect: 1,
        };
      });

      section.classList.add('gallery-enhanced');
      visualLayer.hidden = false;
      return true;
    }

    function updateTextures() {
      const key = sources.map(image => `${image.currentSrc}:${image.naturalWidth}x${image.naturalHeight}`).join('|');
      if (key === textureKey) return;
      textureKey = key;
      entries.forEach((entry, index) => {
        const image = sources[index];
        // Public Order cards use a centered square crop. Explicit exceptions
        // retain their approved framing; Design Gallery keeps the full image.
        const squareCrop = id === 'order' && image.dataset.framing !== 'preserve';
        const available = image.naturalWidth > 0 && image.naturalHeight > 0;
        const aspect = squareCrop || !available ? 1 : image.naturalWidth / image.naturalHeight;
        entry.aspect = aspect;
        const maxSide = 768;
        let width = maxSide;
        let height = maxSide;
        if (aspect >= 1) height = Math.max(1, Math.round(maxSide / aspect));
        else width = Math.max(1, Math.round(maxSide * aspect));
        entry.canvas.width = width;
        entry.canvas.height = height;
        const context = entry.canvas.getContext('2d');
        context.fillStyle = '#000';
        context.fillRect(0, 0, width, height);
        if (!available) {
          context.fillStyle = '#aaa';
          context.font = '28px sans-serif';
          context.textAlign = 'center';
          context.fillText('画像を読み込めません', width / 2, height / 2);
        } else if (squareCrop) {
          const side = Math.min(image.naturalWidth, image.naturalHeight);
          context.drawImage(image, (image.naturalWidth - side) / 2,
            (image.naturalHeight - side) / 2, side, side, 0, 0, width, height);
        } else {
          context.drawImage(image, 0, 0, width, height);
        }
        entry.mesh.material.map.needsUpdate = true;
      });
    }

    function resetStatic() {
      section.classList.remove('gallery-pending');
      rail.classList.add('finite-static');
      section.classList.remove('gallery-enhanced', 'gallery-cinematic-pc');
      visualLayer.hidden = true;
      if (renderer) renderer.domElement.hidden = true;
      if (heading) heading.style.cssText = '';
      items.forEach((item, index) => {
        item.style.cssText = '';
        item.inert = false;
        art[index].style.visibility = '';
        if (captions[index]) captions[index].style.opacity = '';
      });
    }

    function positionHeading(frame, layout) {
      if (!heading) return;
      heading.style.left = `${frame.localLeft}px`;
      heading.style.width = `${frame.width}px`;
      heading.style.transform = 'none';
      heading.style.textAlign = 'center';
      if (layout.portrait) {
        heading.style.top = `${frame.localTop + layout.sphereY + layout.radius + 12}px`;
      } else if (layout.desktop) {
        heading.style.left = '50%';
        heading.style.width = `${frame.width}px`;
        heading.style.transform = 'translateX(-50%)';
        const headingTop = layout.shortDesktop ? clamp(frame.height * .12, 34, 44) : clamp(frame.height * .065, 28, 48);
        heading.style.top = `${frame.localTop + headingTop}px`;
      } else {
        heading.style.top = `${frame.localTop + clamp(frame.height * .065, 28, 58)}px`;
      }
    }

    function projectPoint(world, frame, target) {
      target.copy(world).project(camera);
      const x = (target.x * .5 + .5) * frame.width;
      const y = (-target.y * .5 + .5) * frame.height;
      const visible = target.z >= -1 && target.z <= 1 && x >= -2 && x <= frame.width + 2 && y >= -2 && y <= frame.height + 2;
      return { x, y, visible };
    }

    function setLine(entry, start, end, opacity, frame) {
      const line = entry.connector;
      if (!line || opacity <= .004) {
        if (line) line.style.opacity = '0';
        return;
      }
      const a = projectPoint(start, frame, projectedStart);
      const b = projectPoint(end, frame, projectedEnd);
      if (!a.visible || !b.visible) {
        line.style.opacity = '0';
        return;
      }
      line.setAttribute('x1', a.x.toFixed(2));
      line.setAttribute('y1', a.y.toFixed(2));
      line.setAttribute('x2', b.x.toFixed(2));
      line.setAttribute('y2', b.y.toFixed(2));
      line.style.opacity = String(clamp01(opacity));
    }

    function rotatedNormal(cell, angle, target) {
      const c = Math.cos(angle), s = Math.sin(angle);
      target.set(cell.x * c + cell.z * s, cell.y, -cell.x * s + cell.z * c).normalize();
      return target;
    }

    function spherePlane(entry, radius, angle) {
      rotatedNormal(entry.cell, angle, tempNormal);
      entry.basePosition.copy(tempNormal).multiplyScalar(radius * 1.035).add(sphereCenter);
      entry.baseQuaternion.setFromUnitVectors(zAxis, tempNormal);
      const maxDiagonal = Math.max(18, radius * entry.cell.minChord * .52);
      entry.baseHeight = maxDiagonal / Math.sqrt(entry.aspect * entry.aspect + 1);
      entry.baseWidth = entry.baseHeight * entry.aspect;
      return entry;
    }

    function applyPlane(entry, position, quaternion, width, height) {
      entry.mesh.position.copy(position);
      entry.mesh.quaternion.copy(quaternion);
      entry.mesh.scale.set(width, height, 1);
      entry.mesh.visible = width > .5 && height > .5;
    }

    function focusDisplay(frame, layout, aspect, hasCaption) {
      // Use the real free vertical space above the footer instead of centring the
      // released work too low. The source rectangle is preserved 1:1: no crop,
      // cover, zoom or object-position adjustment is applied here.
      const topSafe = clamp(frame.height * .15, 86, 132);
      const bottomReserve = hasCaption ? clamp(frame.height * .145, 88, 116) : EDGE;
      const availableH = Math.max(120, frame.height - topSafe - bottomReserve - EDGE);
      const maxH = Math.min(layout.tileHeight, availableH);
      const maxW = Math.min(frame.width * .36, 620);
      let height = maxH;
      let width = height * aspect;
      if (width > maxW) { width = maxW; height = width / aspect; }
      const screenY = clamp(
        topSafe + height / 2,
        height / 2 + EDGE,
        frame.height - bottomReserve - height / 2 - EDGE
      );
      return { width, height, screenY };
    }

    function ellipseOffset(t, width, height, reverse = false) {
      const phase = (reverse ? 1 - t : t) * Math.PI * 2;
      return {
        x: Math.sin(phase) * width,
        y: (Math.cos(phase) - 1) * height * .5,
      };
    }

    function render(now) {
      if (reduced.matches) {
        resetStatic();
        return false;
      }

      rail.classList.remove('finite-static');
      if (!initialize()) {
        if (failed) resetStatic();
        return !failed;
      }

      const stage = section.closest('.chapter-stage');
      if (!stage) return false;
      const scrollSpan = Math.max(1, stage.offsetHeight - section.offsetHeight);
      const progress = clamp01(-stage.getBoundingClientRect().top / scrollSpan);
      const journey = clamp01((progress - .08) / .82);
      const opening = progress < .08;
      if (journey < 1 && lastTime) rotation += Math.min(50, now - lastTime) * .00012;
      lastTime = now;

      // Only ordinary landscape desktop gets the new cinematic camera path.
      // Short/wide PC, portrait desktop, tablet and phone keep the V18 timing.
      const cinematicCandidate = matchMedia(PC_CINEMATIC_QUERY).matches;
      const frame = measureFrame(section, cinematicCandidate);
      if (frame.width < 2 || frame.height < 2) return false;
      const layout = layoutFor(frame);
      const cinematicDesktop = Boolean(cinematicCandidate && layout.desktop && !layout.shortDesktop && !layout.portrait);
      section.classList.toggle('gallery-cinematic-pc', cinematicDesktop);
      positionHeading(frame, layout);

      if (layout.desktop && layout.shortDesktop) {
        section.style.setProperty('--gallery-caption-width', `${layout.captionWidth}px`);
        section.style.setProperty('--gallery-caption-gap', `${layout.captionGap}px`);
      } else {
        section.style.removeProperty('--gallery-caption-width');
        section.style.removeProperty('--gallery-caption-gap');
      }

      visualLayer.style.left = `${frame.localLeft}px`;
      visualLayer.style.top = `${frame.localTop}px`;
      visualLayer.style.width = `${frame.width}px`;
      visualLayer.style.height = `${frame.height}px`;
      connectorLayer.setAttribute('viewBox', `0 0 ${frame.width} ${frame.height}`);

      const canvas = renderer.domElement;
      canvas.hidden = false;
      if (
        canvas.width !== Math.floor(frame.width * renderer.getPixelRatio()) ||
        canvas.height !== Math.floor(frame.height * renderer.getPixelRatio())
      ) renderer.setSize(frame.width, frame.height, false);

      camera.aspect = frame.width / frame.height;
      camera.fov = 2 * Math.atan(frame.height / 2 / CAMERA_Z) * 180 / Math.PI;
      camera.position.set(0, 0, CAMERA_Z);
      camera.updateProjectionMatrix();
      updateTextures();

      const releaseSizes = entries.map(entry => {
        const maxWidthRatio = layout.portrait ? .76 : layout.desktop ? .40 : .34;
        const maxWidth = frame.width * maxWidthRatio;
        let height = layout.tileHeight;
        let width = height * entry.aspect;
        if (width > maxWidth) {
          width = maxWidth;
          height = width / entry.aspect;
        }
        return { width, height };
      });
      const gap = clamp(layout.tileHeight * .08, 8, 24);
      const centers = [0];
      for (let index = 1; index < items.length; index++) centers[index] = centers[index - 1] + (releaseSizes[index - 1].width + releaseSizes[index].width) / 2 + gap;

      const settledX = layout.sphereX - frame.width / 2;
      const settledY = frame.height / 2 - layout.sphereY;
      const rowX = layout.rowX - frame.width / 2;
      let sphereDepth = 0;
      let sphereRadius = layout.radius;
      let sphereAngle = rotation;
      let activeIndex = -1;
      let activeLocal = 0;
      let sequencePhase = 'legacy';

      if (cinematicDesktop) {
        const introEnd = .22;
        const focusEnd = .88;
        if (journey < introEnd) {
          sequencePhase = 'planet-orbit-out';
          const t = ease(clamp01(journey / introEnd));
          const envelope = Math.sin(Math.PI * t);
          const angle = t * Math.PI * 2 * 1.25;
          sphereCenter.set(
            lerp(0, settledX, t) + Math.sin(angle) * frame.width * .15 * envelope,
            lerp(0, settledY, t) + Math.cos(angle) * frame.height * .11 * envelope,
            lerp(260, -680, t)
          );
          sphereDepth = sphereCenter.z;
          const startProjected = Math.max(layout.radius * 2.05, frame.height * .62);
          const projected = lerp(startProjected, layout.radius, t);
          sphereRadius = projected * (CAMERA_Z - sphereDepth) / CAMERA_Z;
          sphereAngle = rotation + (1 - t) * Math.PI * 1.3;
        } else if (journey < focusEnd) {
          sequencePhase = 'focus-return';
          sphereCenter.set(settledX, settledY, -680);
          sphereDepth = -680;
          sphereRadius = layout.radius * (CAMERA_Z - sphereDepth) / CAMERA_Z;
          const seq = clamp01((journey - introEnd) / (focusEnd - introEnd)) * items.length;
          activeIndex = Math.min(items.length - 1, Math.floor(Math.min(items.length - 1e-7, seq)));
          activeLocal = clamp01(seq - activeIndex);
        } else {
          sequencePhase = 'planet-orbit-home';
          const t = ease(clamp01((journey - focusEnd) / (1 - focusEnd)));
          const envelope = Math.sin(Math.PI * t);
          const angle = (1 - t) * Math.PI * 2 * 1.25;
          sphereCenter.set(
            lerp(settledX, 0, t) - Math.sin(angle) * frame.width * .15 * envelope,
            lerp(settledY, 0, t) + Math.cos(angle) * frame.height * .11 * envelope,
            lerp(-680, 260, t)
          );
          sphereDepth = sphereCenter.z;
          const endProjected = Math.max(layout.radius * 2.05, frame.height * .62);
          const projected = lerp(layout.radius, endProjected, t);
          sphereRadius = projected * (CAMERA_Z - sphereDepth) / CAMERA_Z;
          sphereAngle = rotation + t * Math.PI * 1.3;
        }
      } else {
        sphereCenter.set(settledX, settledY, 0);
      }

      let legacyTotal = 0;


      let legacyCursor = 0;
      let legacyCenter = 0;
      if (!cinematicDesktop) {
        legacyTotal = journey * items.length;
        const whole = Math.floor(legacyTotal);
        const fraction = legacyTotal - whole;
        legacyCursor = Math.max(0, Math.min(items.length - 1, whole - 1 + ease(clamp01((fraction - .62) / .38))));
        const ci = Math.floor(legacyCursor);
        const nc = centers[ci + 1] ?? centers[ci] ?? 0;
        legacyCenter = (centers[ci] ?? 0) + (nc - (centers[ci] ?? 0)) * (legacyCursor - ci);
      }

      entries.forEach((entry, index) => {
        const item = items[index];
        const base = spherePlane(entry, sphereRadius, sphereAngle);
        tempPosition.copy(base.basePosition);
        tempQuat.copy(base.baseQuaternion);
        let width = base.baseWidth;
        let height = base.baseHeight;
        let lineOpacity = 0;
        let showCaption = false;

        if (cinematicDesktop) {
          // Every artwork remains connected to the sphere centre. Only one work
          // becomes the visual subject at a time; it leaves, holds, and returns
          // before the next work begins.
          lineOpacity = CONNECTOR_OPACITY;
          if (index === activeIndex && sequencePhase === 'focus-return') {
            const departEnd = .28;
            const holdEnd = .62;
            let pulse = 0;
            let pathT = 0;
            let reverse = false;
            if (activeLocal < departEnd) {
              pathT = ease(activeLocal / departEnd);
              pulse = pathT;
            } else if (activeLocal < holdEnd) {
              pathT = 1;
              pulse = 1;
            } else {
              const back = ease((activeLocal - holdEnd) / (1 - holdEnd));
              pathT = 1 - back;
              pulse = 1 - back;
              reverse = true;
            }

            const display = focusDisplay(frame, layout, entry.aspect, id === 'order');
            const targetZ = 690;
            // Camera projection magnifies positive-Z objects. Convert the desired
            // screen-space target back into world space so the released artwork
            // actually lands at layout.rowX/rowY and stays inside the measured frame.
            const targetDepthScale = (CAMERA_Z - targetZ) / CAMERA_Z;
            const focusRowY = frame.height / 2 - display.screenY;
            const target = new THREE.Vector3(rowX * targetDepthScale, focusRowY * targetDepthScale, targetZ);
            tempPosition.copy(base.basePosition).lerp(target, pulse);
            if (pulse > 0 && pulse < 1) {
              const orbit = ellipseOffset(pathT, frame.width * .13, frame.height * .16, reverse);
              const orbitDepthScale = (CAMERA_Z - tempPosition.z) / CAMERA_Z;
              tempPosition.x += orbit.x * orbitDepthScale;
              tempPosition.y += orbit.y * orbitDepthScale;
            }
            tempQuat.copy(base.baseQuaternion).slerp(identityQuat, pulse);
            width = lerp(base.baseWidth, display.width * targetDepthScale, pulse);
            height = lerp(base.baseHeight, display.height * targetDepthScale, pulse);
            lineOpacity = CONNECTOR_OPACITY;
            showCaption = pulse > .86;
          }
          applyPlane(entry, tempPosition, tempQuat, width, height);
          setLine(entry, sphereCenter, tempPosition, lineOpacity, frame);

          // WebGL owns the artwork for the whole cinematic pass. DOM is used
          // only for the active caption, preventing duplicate/overlapping cards.
          art[index].style.visibility = 'hidden';
          const domDisplay = focusDisplay(frame, layout, entry.aspect, id === 'order');
          item.style.setProperty('--gallery-card-height', `${domDisplay.height}px`);
          item.style.width = `${domDisplay.width}px`;
          item.style.left = `${frame.localLeft + layout.rowX - domDisplay.width / 2}px`;
          item.style.top = `${frame.localTop + domDisplay.screenY - domDisplay.height / 2}px`;
          item.style.transform = 'none';
          item.style.visibility = showCaption ? 'visible' : 'hidden';
          item.inert = true;
          if (captions[index]) captions[index].style.opacity = showCaption ? '1' : '0';
        } else {
          const peel = clamp01(legacyTotal - index);
          const active = peel > 0 && peel < 1;
          const orbit = ease(clamp01(peel / .62));
          const unfold = ease(clamp01((peel - .62) / .38));

          if (active) {
            // Keep the old timing, but move a flat plane around the sphere rather
            // than bending the image itself across a segmented surface.
            const orbitAngle = sphereAngle + Math.PI * 2 * orbit;
            spherePlane(entry, sphereRadius, orbitAngle);
            tempPosition.copy(entry.basePosition);
            tempQuat.copy(entry.baseQuaternion);
            width = entry.baseWidth;
            height = entry.baseHeight;
          }

          const released = releaseSizes[index];
          item.style.setProperty('--gallery-card-height', `${released.height}px`);
          item.style.width = `${released.width}px`;
          // Measure the caption at the actual card width, including wrapped
          // titles and the badge. Short desktop captions sit beside the image.
          const captionReserve = layout.shortDesktop ? 0 : Math.max(
            layout.captionReserve, captions[index]?.offsetHeight || 0
          );
          const safeScreenX = layout.tablet
            ? clamp(layout.rowX, released.width / 2 + EDGE, frame.width - released.width / 2 - EDGE)
            : layout.rowX;
          const minScreenY = released.height / 2 + EDGE;
          const maxScreenY = frame.height - captionReserve - EDGE - released.height / 2;
          const safeScreenY = maxScreenY >= minScreenY
            ? clamp(layout.rowY, minScreenY, maxScreenY)
            : layout.rowY;
          const targetX = safeScreenX - frame.width / 2 - ((centers[index] ?? 0) - legacyCenter);
          const targetY = frame.height / 2 - safeScreenY;
          const target = new THREE.Vector3(targetX, targetY, 0);
          tempPosition.lerp(target, unfold);
          tempQuat.slerp(identityQuat, unfold);
          width = lerp(width, released.width, unfold);
          height = lerp(height, released.height, unfold);
          applyPlane(entry, tempPosition, tempQuat, width, height);

          // Portrait, landscape and short-PC use one reversible return path.
          // Lines belong to panels that are still on the sphere or are currently
          // travelling. Once a card is fully released, its connector disappears;
          // scrolling back makes the same line reappear and shrink into the sphere.
          setLine(entry, sphereCenter, tempPosition, peel < 1 ? CONNECTOR_OPACITY : 0, frame);

          const current = Math.abs(index - legacyCursor) <= .6;
          const showDom = peel === 1 && current;
          entry.mesh.visible = peel < 1 || (current && !showDom);
          art[index].style.visibility = showDom ? 'visible' : 'hidden';
          item.style.left = `${frame.localLeft + safeScreenX - released.width / 2}px`;
          item.style.top = `${frame.localTop + safeScreenY - released.height / 2}px`;
          item.style.transform = `translate3d(${-((centers[index] ?? 0) - legacyCenter)}px,0,0)`;
          if (layout.desktop) item.style.visibility = showDom ? 'visible' : 'hidden';
          else item.style.visibility = '';
          item.inert = peel < 1 || !current;
          if (captions[index]) captions[index].style.opacity = String(peel === 1 && current ? clamp01(1 - Math.abs(index - legacyCursor) * 2) : 0);
        }
      });

      renderer.render(scene, camera);
      // Reveal only after the first composed sphere frame, never raw source cards.
      section.classList.remove('gallery-pending');
      section.dataset.galleryPhase = cinematicDesktop ? sequencePhase : opening ? 'sphere' : journey >= 1 ? 'hold' : 'unfold';
      section.dataset.galleryCinematic = cinematicDesktop ? 'orbital-single-focus-v23' : 'legacy-timing-flat-panels-v23';
      section.dataset.galleryReady = String(journey >= 1);
      section.dataset.galleryRotation = String(rotation);
      section.style.setProperty('--gallery-progress', journey);
      section.style.setProperty('--gallery-debug-radius', `${sphereRadius}px`);
      section.style.setProperty('--gallery-debug-tile', `${layout.tileHeight}px`);
      section.style.setProperty('--gallery-tile-height', `${layout.tileHeight}px`);
      section.dataset.galleryFrame = `${Math.round(frame.width)}x${Math.round(frame.height)}`;
      section.dataset.galleryPcCinematic = cinematicDesktop ? 'true' : 'false';
      return journey < 1;
    }

    sources.forEach(image => {
      image.addEventListener('load', schedule, { once: true });
      image.addEventListener('error', schedule, { once: true });
    });
    return { id, section, render };
  }

  function update(now) {
    raf = 0;
    if (document.hidden) return;
    let spinning = false;
    for (const gallery of galleries) {
      if (gallery.section.dataset.covered !== 'true') spinning = gallery.render(now) || spinning;
    }
    if (spinning) schedule();
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(update);
  }

  for (const id of ['order', 'gallery']) {
    const gallery = create(id);
    if (gallery) galleries.push(gallery);
  }

  new MutationObserver(schedule).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  document.addEventListener('jugend:chapter-visibility', schedule);
  reduced.addEventListener('change', schedule);
  document.addEventListener('jugend:scroll-frame', () => {
    cancelAnimationFrame(raf);
    raf = 0;
    update(performance.now());
  });
  schedule();
})();
