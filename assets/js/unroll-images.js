'use strict';

// Progressive enhancement inspired by https://github.com/akella/UnrollingImages.
// A segmented plane bends around a moving roll edge. No custom page scrolling.
// One shared WebGL context draws into local 2D canvases: these scroll with their
// images, avoiding the one-frame lag of a fixed viewport overlay.
(() => {
  if (!window.THREE) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const selector = '#works .gs-work-image, #design .ju-design__image img, #policy .ju-policy__img, #design-intro .ju-design__image img';
  const items = [...document.querySelectorAll(selector)].map(img => ({
    img, canvas:null, texture:null, key:'', section:null, order:0, sectionCount:1
  }));
  const sectionGroups = new Map();
  for (const item of items) {
    item.section = item.img.closest('.chapter');
    const key = item.section || document.body;
    if (!sectionGroups.has(key)) sectionGroups.set(key, []);
    sectionGroups.get(key).push(item);
  }
  for (const group of sectionGroups.values()) {
    group.forEach((item, index) => {
      item.order = index;
      item.sectionCount = group.length;
    });
  }
  let renderer, scene, camera, mesh, frame = 0;
  let unavailable = false;
  function init() {
    if (renderer || unavailable) return !!renderer;
    try {
      renderer = new THREE.WebGLRenderer({alpha:true, antialias:true, preserveDrawingBuffer:true});
      renderer.setClearColor(0, 0);
      scene = new THREE.Scene();
      camera = new THREE.OrthographicCamera(-.5,.5,.5,-.5,.01,10);
      camera.position.z = 3;
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(1,1,24,160), new THREE.ShaderMaterial({
        transparent:true, side:THREE.DoubleSide,
        uniforms:{map:{value:null}, progress:{value:0}},
        vertexShader:`
          uniform float progress;
          varying vec2 vUv;
          varying float shade;
          void main() {
            vUv = uv;
            vec3 p = position;
            float edge = progress * 1.16;
            float distance = 1.0 - uv.y + 0.12 * uv.x;
            float rolled = max(0.0, distance - edge);
            float radius = 0.075 + rolled * 0.009;
            float angle = rolled / radius;
            if (rolled > 0.0) {
              p.y += rolled - radius * sin(angle);
              p.z = radius * (1.0 - cos(angle));
              p.x -= p.z * 0.12;
            }
            shade = 0.70 + 0.30 * cos(angle);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
          }`,
        fragmentShader:`
          uniform sampler2D map;
          varying vec2 vUv;
          varying float shade;
          void main() {
            vec4 color = texture2D(map, vUv);
            color.rgb *= gl_FrontFacing ? shade : shade * 0.76;
            gl_FragColor = color;
          }`
      }));
      scene.add(mesh);
      renderer.domElement.addEventListener('webglcontextlost', event => {
        event.preventDefault(); unavailable = true;
        for (const item of items) restore(item);
      });
      return true;
    } catch (_) {
      unavailable = true;
      return false;
    }
  }
  function restore(item) {
    item.img.classList.remove('unroll-source');
    if (item.canvas) item.canvas.hidden = true;
  }
  function prepare(item, rect) {
    if (!item.canvas) {
      const parent = item.img.parentElement.tagName === 'PICTURE' ? item.img.parentElement.parentElement : item.img.parentElement;
      parent.classList.add('unroll-anchor');
      item.canvas = document.createElement('canvas');
      item.canvas.className = 'unroll-canvas';
      item.canvas.setAttribute('aria-hidden','true');
      item.canvas.hidden = true;
      parent.append(item.canvas);
    }
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.max(1,Math.round(rect.width*dpr)), height = Math.max(1,Math.round(rect.height*dpr));
    const key = `${width}:${height}:${item.img.currentSrc}`;
    if (item.key !== key || !item.texture) {
      item.texture?.dispose();
      const raster = document.createElement('canvas'); raster.width=width; raster.height=height;
      const ctx = raster.getContext('2d');
      ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);
      const img=item.img, style=getComputedStyle(img);
      const cover=style.objectFit==='cover';
      const ratio=cover ? Math.max(width/img.naturalWidth,height/img.naturalHeight) : Math.min(width/img.naturalWidth,height/img.naturalHeight);
      const w=img.naturalWidth*ratio,h=img.naturalHeight*ratio;
      ctx.drawImage(img,(width-w)/2,(height-h)/2,w,h);
      item.texture=new THREE.CanvasTexture(raster);
      item.texture.minFilter=THREE.LinearFilter; item.texture.generateMipmaps=false;
      item.key=key;
      item.canvas.width=width; item.canvas.height=height;
    }
    const parent=item.canvas.parentElement, bounds=parent.getBoundingClientRect();
    Object.assign(item.canvas.style,{
      left:`${rect.left-bounds.left+parent.scrollLeft}px`, top:`${rect.top-bounds.top+parent.scrollTop}px`,
      width:`${rect.width}px`,height:`${rect.height}px`
    });
    renderer.setSize(width,height,false);
  }
  function paint(item, rect, progress) {
    if (!init()) return false;
    try {
      prepare(item,rect);
      mesh.material.uniforms.map.value=item.texture;
      mesh.material.uniforms.progress.value=progress;
      renderer.render(scene,camera);
      const ctx=item.canvas.getContext('2d');
      ctx.clearRect(0,0,item.canvas.width,item.canvas.height);
      ctx.drawImage(renderer.domElement,0,0);
      item.canvas.hidden=false;
      item.img.classList.add('unroll-source');
      item.canvas.dataset.progress=String(progress);
      return true;
    } catch (_) {
      restore(item);
      return false;
    }
  }

  // Progress depends only on chapter scroll position, never elapsed time or direction.
  // All images finish by 60%, leaving the rest of the chapter available for reading.
  function draw() {
    frame = 0;
    for (const item of items) {
      const rect = item.img.getBoundingClientRect();
      const section = item.section;
      const stage = section?.closest('.chapter-stage');
      if (!stage || rect.bottom <= 0 || rect.top >= innerHeight || section.dataset.covered === 'true') {
        restore(item);
        if (item.texture) { item.texture.dispose(); item.texture = null; }
        continue;
      }
      if (reduced.matches || unavailable || !item.img.complete || !item.img.naturalWidth || rect.width < 1 || rect.height < 1) {
        restore(item);
        continue;
      }
      const span = Math.max(1, stage.offsetHeight - section.offsetHeight);
      const chapterProgress = Math.max(0, Math.min(1, -stage.getBoundingClientRect().top / span));
      const stagger = item.sectionCount > 1 ? .24 * item.order / (item.sectionCount - 1) : 0;
      // Open over 40% of the chapter; the last stagger still finishes at 72%.
      // Forward and backward scrolling share this exact mapping.
      const linear = Math.max(0, Math.min(1, (chapterProgress - .08 - stagger) / .40));
      const progress = linear * linear * (3 - 2 * linear);
      if (item.canvas) item.canvas.dataset.progress = String(progress);
      if (progress === 1) {
        restore(item);
      } else {
        paint(item, rect, progress);
      }
    }
  }
  function schedule() { if (!frame) frame=requestAnimationFrame(draw); }
  for (const item of items) item.img.addEventListener('load',schedule);
  const resize=new ResizeObserver(schedule);
  for (const item of items) resize.observe(item.img);
  document.addEventListener('jugend:chapter-motion',schedule);
  addEventListener('scroll',schedule,{passive:true});
  addEventListener('resize',schedule,{passive:true});
  reduced.addEventListener('change',schedule);
  schedule();
  document.addEventListener('jugend:scroll-frame',()=>{cancelAnimationFrame(frame);frame=0;draw();});
})();
