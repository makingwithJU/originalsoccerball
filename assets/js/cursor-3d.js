'use strict';
(() => {
  if (!matchMedia('(any-pointer: fine)').matches || !window.THREE?.STLLoader) return;
  const host = document.createElement('div');
  host.id = 'cursor3d';
  host.setAttribute('aria-hidden', 'true');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); }
  catch { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(32, 32);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, .01, 100);
  camera.position.set(0, 0, 4);
  new THREE.STLLoader().load('./assets/models/truncated_icosahedron_wireframe.stl', geometry => {
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    const scale = 1.2 / geometry.boundingSphere.radius;
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    const ball = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color: 0xffffff }));
    ball.scale.setScalar(scale);
    ball.position.copy(center).multiplyScalar(-scale);
    scene.add(ball);
    host.append(renderer.domElement);
    document.body.append(host);
    let visible = false;
    let frame = 0;

    function sleep() {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    }

    function render() {
      frame = 0;
      if (!visible || document.hidden) return;
      ball.rotation.y += .02;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    }

    function hide() {
      visible = false;
      sleep();
      host.style.opacity = '0';
      document.documentElement.classList.remove('ju-hide-cursor');
    }

    document.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse' || event.target.closest('dialog')) { hide(); return; }
      host.style.left = `${event.clientX}px`;
      host.style.top = `${event.clientY}px`;
      host.style.opacity = '1';
      host.classList.toggle('is-interactive', Boolean(event.target.closest('a[href],button:not(:disabled),summary,input,textarea,select,[role="button"]')));
      document.documentElement.classList.add('ju-hide-cursor');
      visible = true;
      if (!frame) render();
    }, { passive: true });
    document.addEventListener('mouseleave', hide);
    document.addEventListener('pointerdown', event => { if (event.pointerType !== 'mouse') hide(); }, { passive: true });
    document.addEventListener('touchstart', hide, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  }, undefined, () => renderer.dispose());
})();
