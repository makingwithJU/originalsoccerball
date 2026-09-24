'use strict';

(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = matchMedia('(hover: none) and (pointer: coarse)');
  const observedIds = ['usage-title', 'event-shop-title'];
  const OPENING_HOLD_END = 0.20;
  const FINAL_HOLD_START = 0.80;
  const INITIAL_ROTATION = 0.5;
  const REFERENCE_ROTATION = Math.PI * 2;
  const activeGalleries = new Map();
  const pendingGalleries = new Set();
  let activationFrame = 0;
  const clamp01 = value => Math.max(0, Math.min(1, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = t => t * t * (3 - 2 * t);

  async function waitForImage(image) {
    image.loading = 'eager';
    if (image.complete && image.naturalWidth) return;
    if (image.decode) return image.decode().catch(() => undefined);
    await new Promise(resolve => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    });
  }

  // Each cell uses the source's full aspect ratio. Its UV width and its arc
  // length agree, so changing the viewport never stretches or crops a photo.
  function completeImageCount(count, sourceCount) {
    return Math.ceil(count / sourceCount) * sourceCount;
  }

  function createAtlas(images, count, renderer) {
    count = completeImageCount(count, images.length);
    const cells = Array.from({ length: count }, (_, i) => images[i % images.length]);
    const sumAspect = cells.reduce((sum, image) => sum + image.naturalWidth / image.naturalHeight, 0);
    const limit = Math.min(renderer.capabilities.maxTextureSize, 8192);
    const height = Math.min(coarsePointer.matches ? 256 : 512, Math.floor((limit - count) / sumAspect));
    const widths = cells.map(image => Math.max(1, Math.round(height * image.naturalWidth / image.naturalHeight)));
    const canvas = document.createElement('canvas');
    canvas.width = widths.reduce((sum, width) => sum + width, 0);
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    let x = 0;
    cells.forEach((image, i) => {
      ctx.drawImage(image, x, 0, widths[i], height);
      x += widths[i];
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    let edge = 0;
    const ends = new Float32Array(96);
    widths.forEach((width, i) => { edge += width; ends[i] = edge / canvas.width; });
    return { texture, aspect: canvas.width / canvas.height, ends };
  }

  function viewportProfile(width, height) {
    const aspect = width / height;
    return {
      width: aspect < 1 ? 0.92 : aspect > 3 ? 0.88 : 0.805,
      height: aspect < 0.72 ? 0.23 : aspect < 1.08 ? 0.32 : 0.447,
      center: aspect < 1 ? 0.53 : 0.52,
      minImages: 10
    };
  }

  async function createGallery(id) {
    const section = document.getElementById(id);
    const rail = section?.querySelector('.rail');
    const heading = section?.querySelector('.gs-heading');
    if (!section || !rail || !heading || !window.THREE) return null;
    const sourceImages = [...rail.querySelectorAll('img')];
    await Promise.all(sourceImages.map(waitForImage));
    const images = sourceImages.filter(image => image.naturalWidth && image.naturalHeight);
    if (!images.length) return null;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !coarsePointer.matches, alpha: true, powerPreference: 'high-performance' });
    } catch { return null; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, coarsePointer.matches ? 1 : 1.5));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.className = 'cylinder-canvas';
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 150);
    const cylinderRadius = 2.8;
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const atlasEdges = { value: new Float32Array(96) };
    const atlasCount = { value: 0 };
    // Both sides are printed with readable images. Mirror UVs inside each cell
    // on the back face, rather than reflecting the photograph's lettering.
    material.onBeforeCompile = shader => {
      shader.uniforms.galleryEdges = atlasEdges;
      shader.uniforms.galleryCount = atlasCount;
      shader.fragmentShader = 'uniform float galleryEdges[96];\nuniform int galleryCount;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec2 galleryUv = vUv;
          if (!gl_FrontFacing) {
            float leftEdge = 0.0;
            for (int i = 0; i < 96; i++) {
              if (i >= galleryCount) break;
              float rightEdge = galleryEdges[i];
              if (vUv.x <= rightEdge) {
                galleryUv.x = leftEdge + rightEdge - vUv.x;
                break;
              }
              leftEdge = rightEdge;
            }
          }
          vec4 texelColor = texture2D(map, galleryUv);
          diffuseColor *= mapTexelToLinear(texelColor);
        #endif
      `);
    };
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(), material);
    scene.add(cylinder);
    section.dataset.galleryMode = 'codrops-cylinder';
    rail.classList.add('cylinder-scene');
    rail.append(renderer.domElement);
    let disposed = false;
    let raf = 0;
    let imageCount = 0;
    let lastProgress = -1;
    let needsRender = true;
    let cylinderHeight = 1;
    let openingZ = 8;
    let openingAimY = 0;
    let openingFov = 45;
    let finalFov = 45;
    let finalPitch = 0;
    const eye = new THREE.Vector3();
    const aim = new THREE.Vector3();

    function measure() {
      if (disposed) return;
      needsRender = true;
      const width = section.clientWidth;
      const height = section.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      openingFov = 2 * Math.atan(Math.tan(33 * Math.PI / 180) / camera.aspect) * 180 / Math.PI;
      camera.fov = openingFov;
      camera.updateProjectionMatrix();
      const profile = viewportProfile(width, height);
      const tanFov = Math.tan(openingFov * Math.PI / 360);
      // Tangents to a circular cross-section set the opening width exactly.
      openingZ = Math.sqrt(cylinderRadius ** 2 + (cylinderRadius / (profile.width * camera.aspect * tanFov)) ** 2);
      const desiredHeight = profile.height * 2 * (openingZ - cylinderRadius) * tanFov;
      const desiredAspect = 2 * Math.PI * cylinderRadius / desiredHeight;
      let count = 0;
      let sum = 0;
      while (count < profile.minImages || (sum < desiredAspect && count < 96)) {
        const image = images[count % images.length];
        sum += image.naturalWidth / image.naturalHeight;
        count += 1;
      }
      count = completeImageCount(count, images.length);
      if (count !== imageCount) {
        const atlas = createAtlas(images, count, renderer);
        material.map?.dispose();
        material.map = atlas.texture;
        atlasEdges.value = atlas.ends;
        atlasCount.value = count;
        material.needsUpdate = true;
        cylinderHeight = 2 * Math.PI * cylinderRadius / atlas.aspect;
        cylinder.geometry.dispose();
        cylinder.geometry = new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, cylinderHeight, 192, 1, true);
        imageCount = count;
      }
      openingAimY = (profile.center - 0.5) * 2 * openingZ * tanFov;
      // Keep the same horizontal view into the arc on portrait and wide screens.
      finalFov = 2 * Math.atan(Math.tan(Math.PI / 5) / camera.aspect) * 180 / Math.PI;
      const bottom = width / height < 1 ? 0.39 : 0.35;
      const elevation = cylinderHeight * 0.9;
      const angleToRim = Math.atan2(-cylinderHeight / 2 - elevation, cylinderRadius * 1.62);
      finalPitch = angleToRim - Math.atan((1 - bottom * 2) * Math.tan(finalFov * Math.PI / 360));
      section.dataset.cylinderImages = String(imageCount);
      section.dataset.cylinderAspect = String(material.map.image.width / material.map.image.height);
      section.dataset.cylinderHeight = String(cylinderHeight);
    }

    function applyProgress(progress) {
      const motion = smoothstep(clamp01((progress - OPENING_HOLD_END) / (0.72 - OPENING_HOLD_END)));
      // Travel over the rim into the cylinder. The final inside view retains
      // the concave arc; it does not return to an outside, flattened band.
      const endEye = new THREE.Vector3(0, cylinderHeight * 0.9, cylinderRadius * 0.62);
      const endAim = new THREE.Vector3(0, endEye.y + Math.sin(finalPitch) * 5, endEye.z - Math.cos(finalPitch) * 5);
      if (motion < 0.5) {
        const t = smoothstep(motion * 2);
        eye.set(lerp(0, cylinderRadius * 0.28, t), lerp(0, Math.max(cylinderHeight * 1.2, cylinderRadius * 0.9), t), lerp(openingZ, cylinderRadius * 1.12, t));
        aim.set(0, lerp(openingAimY, 0, t), 0);
      } else {
        const t = smoothstep((motion - 0.5) * 2);
        eye.set(lerp(cylinderRadius * 0.28, endEye.x, t), lerp(Math.max(cylinderHeight * 1.2, cylinderRadius * 0.9), endEye.y, t), lerp(cylinderRadius * 1.12, endEye.z, t));
        aim.set(0, lerp(0, endAim.y, t), lerp(0, endAim.z, t));
      }
      camera.fov = lerp(openingFov, finalFov, smoothstep(clamp01((motion - 0.5) * 2)));
      camera.updateProjectionMatrix();
      camera.position.copy(eye);
      camera.lookAt(aim);
      cylinder.rotation.y = INITIAL_ROTATION + motion * REFERENCE_ROTATION;
      let opacity = 0;
      const top = '50%';
      let phase = 'hidden';
      if (progress >= 0.30) {
        opacity = smoothstep(clamp01((progress - 0.30) / 0.08));
        phase = progress >= FINAL_HOLD_START ? 'hold' : 'center';
      }
      heading.dataset.cinematicPhase = phase;
      heading.style.opacity = String(opacity);
      heading.style.top = top;
      heading.style.transform = 'translate3d(-50%,-50%,0)';
      section.style.setProperty('--gallery-progress', progress);
    }

    function tick() {
      if (disposed) return;
      const stage = section.closest('.chapter-stage');
      const span = Math.max(1, stage.offsetHeight - section.offsetHeight);
      const scrollProgress = clamp01(-stage.getBoundingClientRect().top / span);
      // Keep the approved camera path, but let the reader seek both directions
      // and stop on any frame. Reserve the final 15% for the settled heading.
      const journey = clamp01(scrollProgress / 0.85);
      const progress = reducedMotion.matches ? 1 : OPENING_HOLD_END + journey * (FINAL_HOLD_START - OPENING_HOLD_END);
      section.dataset.galleryReady = String(journey >= 1);
      if (needsRender || progress !== lastProgress) {
        applyProgress(progress);
        renderer.render(scene, camera);
        lastProgress = progress;
        needsRender = false;
      }
      raf = requestAnimationFrame(tick);
    }
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(section);
    measure();
    tick();
    const syncFrame=()=>{cancelAnimationFrame(raf);tick();};
    document.addEventListener('jugend:scroll-frame',syncFrame);
    function dispose() {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('jugend:scroll-frame',syncFrame);
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      cylinder.geometry.dispose();
      material.map?.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      heading.style.removeProperty('opacity');
      heading.style.removeProperty('top');
      heading.style.removeProperty('transform');
      delete heading.dataset.cinematicPhase;
      rail.classList.remove('cylinder-scene');
      delete section.dataset.galleryMode;
    }
    return { id, section, dispose };
  }

  function clearActiveGallery() {
    for(const gallery of activeGalleries.values())gallery.dispose();
    activeGalleries.clear();
  }
  async function activate(section) {
    if(reducedMotion.matches||activeGalleries.has(section.id)||pendingGalleries.has(section.id))return;
    pendingGalleries.add(section.id);
    try {
      const gallery=await createGallery(section.id);
      const rect=section.getBoundingClientRect();
      if(gallery&&!reducedMotion.matches&&rect.bottom>-innerHeight&&rect.top<innerHeight*2){
        section.classList.remove('cylinder-fallback');activeGalleries.set(section.id,gallery);
      } else {gallery?.dispose();if(!gallery)section.classList.add('cylinder-fallback');}
    } finally {pendingGalleries.delete(section.id);}
  }

  const targets = observedIds
    .map(id => document.getElementById(id))
    .filter(Boolean);

  targets.forEach(section => section.classList.add('cylinder-target'));

  function chooseVisibleTarget() {
    activationFrame = 0;
    if (reducedMotion.matches) {
      clearActiveGallery();
      return;
    }

    // Both canvases must survive the overlapping reveal. Retire a canvas
    // only after its scene has fully left the viewport and prefetch margin.
    for(const section of targets){
      const rect=section.getBoundingClientRect();
      if(rect.bottom>-innerHeight&&rect.top<innerHeight*2)activate(section);
      else if(activeGalleries.has(section.id)){activeGalleries.get(section.id).dispose();activeGalleries.delete(section.id);}
    }
  }

  function scheduleActivation() {
    if (!activationFrame) activationFrame = requestAnimationFrame(chooseVisibleTarget);
  }

  const lifecycleObserver = new IntersectionObserver(() => scheduleActivation(), {
    rootMargin: '35% 0px 35% 0px',
    threshold: 0.01
  });
  targets.forEach(section => lifecycleObserver.observe(section));

  addEventListener('scroll', scheduleActivation, { passive: true });
  addEventListener('resize', scheduleActivation, { passive: true });
  window.addEventListener('jugend:intro-complete', scheduleActivation);
  scheduleActivation();

  reducedMotion.addEventListener('change', () => {
    clearActiveGallery();
    scheduleActivation();
  });
})();
