// Three.js UMD renderer: scales and rotates GLB model driven by scroll progress
(function () {
  // suppress noisy diagnostics in production
  var layer = document.getElementById("face3d-layer");
  var hero = document.getElementById("hero");
  if (!layer || !hero || !window.THREE) return;

  // Use the video's uncropped coordinate plane; the HERO crops both layers together.
  function alignToVideo() {
    var video = hero.querySelector("video");
    var sourceWidth = video.videoWidth || 1280,
      sourceHeight = video.videoHeight || 720;
    var scale = Math.max(
      hero.clientWidth / sourceWidth,
      hero.clientHeight / sourceHeight,
    );
    var renderWidth = sourceWidth * scale,
      renderHeight = sourceHeight * scale;
    layer.style.width = renderWidth + "px";
    layer.style.height = renderHeight + "px";
    layer.style.left = (hero.clientWidth - renderWidth) / 2 + "px";
    layer.style.top = (hero.clientHeight - renderHeight) / 2 + "px";
  }
  hero.appendChild(layer);
  Object.assign(layer.style, {
    position: "absolute",
    pointerEvents: "none",
    zIndex: "2",
    visibility: "hidden",
  });
  hero.style.overflow = "hidden";
  alignToVideo();

  var renderer,
    scene,
    camera,
    model = null;
  var width = layer.clientWidth || window.innerWidth;
  var height = layer.clientHeight || window.innerHeight;
  var spinVel = 0,
    spin = 0; // Rotational inertia coupled with HERO progress
  var BASE_LERP = 0.18; // Base tracking lerp coefficient
  var LATE_LERP = 0.36; // Enhanced late-phase inertia
  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }
  function lerpFactorFor(p) {
    var t = clamp01(p);
    return BASE_LERP + (LATE_LERP - BASE_LERP) * t;
  }
  // HERO scroll progress received from page timeline
  var targetP = 0.0,
    currP = 0.0;
  var yStart = 0; // Initial Y position (below title line)
  var baseRot = { x: 0, y: Math.PI, z: 0 }; // Inverted initial orientation (180deg Y rotation)
  var impactKickDone = false; // Initial impact velocity flag
  var yTarget = 0; // Target Y position (near center of hero text)
  var rafId = 0;
  var running = true;
  var heroInView = true;
  function computeHeroInView() {
    try {
      if (window.JUScenes) return window.JUScenes.visible("hero");
      var r = hero.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight || 0;
      if (!vh) return true;
      return r.bottom > 0 && r.top < vh;
    } catch (_) {
      return true;
    }
  }
  function heroIsInView() {
    return heroInView;
  }
  function updateHeroInView() {
    heroInView = computeHeroInView();
  }
  var heroInViewRaf = 0;
  function scheduleHeroInView() {
    if (heroInViewRaf) return;
    heroInViewRaf = requestAnimationFrame(function () {
      heroInViewRaf = 0;
      var prev = heroInView;
      updateHeroInView();
      if (heroInView === prev) return;
      if (!heroInView) {
        // Hero is off-screen: stop the render loop to avoid scroll jank.
        stopLoop();
      } else if (!document.hidden) {
        startLoop();
      }
    });
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function viewportWorldHeightAtZ(z) {
    var fov = ((camera.fov || 45) * Math.PI) / 180;
    var dist = Math.max(0.0001, camera.position ? camera.position.z - z : 1);
    return 2 * Math.tan(fov / 2) * dist;
  }
  // Viewport-dependent sizing parameters
  var INIT_VIEW_FRAC = 0.24; // Initial diameter = 24% of viewport height
  function initialRadiusAt(z) {
    return 0.5 * viewportWorldHeightAtZ(z) * INIT_VIEW_FRAC;
  }
  function computeYStart() {
    try {
      var vhWorld = viewportWorldHeightAtZ(0);
      // Keep the ball center at a fixed video-relative height on every viewport.
      // Screen-space Y = 0.990 => world Y = -(0.990 - 0.5) * viewport height.
      yStart = -0.49 * vhWorld;
    } catch (_) {
      yStart = -0.8;
    }
    // suppress debug trace
  }
  function computeYTarget() {
    try {
      // Target position sits above center
      var vhWorld = viewportWorldHeightAtZ(0);
      yTarget = +2.6 * Math.tan(Math.PI / 8) * vhWorld;
      // suppress debug trace
    } catch (_) {
      yTarget = 0;
    }
  }
  // Lightweight debug logging enabled via window.face3dDebug
  function dbg(message) {
    if (window.face3dDebug === true && window.console) console.debug(message);
  }

  function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 2000);
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, 0);

    var coarse = false;
    try {
      coarse =
        window.matchMedia &&
        window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    } catch (_) {}
    var useAntialias = !coarse || (window.devicePixelRatio || 1) <= 1.5;
    renderer = new THREE.WebGLRenderer({
      antialias: useAntialias,
      alpha: true,
      powerPreference: "high-performance",
    });
    // Cap DPR to reduce long frames (rAF handler warnings) on high-DPI devices.
    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(4000000 / Math.max(1, width * height)),
      ),
    );
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    // Prevent crushed blacks: configure color space and tone mapping
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping)
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.physicallyCorrectLights = true;
    layer.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    var ambient = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambient);
    var dir = new THREE.DirectionalLight(0xffffff, 1.8);
    dir.position.set(2.4, 2.0, 3.0);
    scene.add(dir);
    var hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 0.8);
    scene.add(hemi);

    // Normalized model paths: allows relative and absolute candidate URLs
    var baseCandidates = [
      "assets/models/test3Dface_patched.glb",
      "/assets/models/test3Dface_patched.glb",
    ];
    var urlIdx = 0;
    var glbVersionKey = "v20251005";
    function currentUrl() {
      var base = baseCandidates[urlIdx];
      if (!glbVersionKey) return base;
      try {
        return base + (base.indexOf("?") >= 0 ? "&" : "?") + glbVersionKey;
      } catch (_) {
        return base;
      }
    }
    dbg("[face3d] load start candidates: " + baseCandidates.join(", "));
    function loadGLBWith(loaderCtor) {
      try {
        var loader = new loaderCtor();
        function onLoad(gltf) {
          model = gltf.scene;
          // Ensure all nodes are visible on the default render layer
          model.traverse(function (obj) {
            obj.visible = true;
            if (obj.layers && obj.layers.enable) {
              try {
                obj.layers.enable(0);
              } catch (_) {}
            }
            obj.frustumCulled = false;
            obj.matrixAutoUpdate = true;
          });
          // Preserve native PBR materials; apply sRGB color space correction to BaseColor only
          var meshCount = 0;
          var vertSum = 0;
          model.traverse(function (obj) {
            if (obj.isMesh) {
              meshCount++;
              obj.visible = true;
              obj.matrixAutoUpdate = true;
              obj.frustumCulled = false;
              var g = obj.geometry;
              if (g && g.attributes && g.attributes.position) {
                var cnt = g.index ? g.index.count : g.attributes.position.count;
                vertSum += cnt;
                try {
                  g.setDrawRange(0, cnt);
                } catch (_) {}
                try {
                  if (!g.boundingSphere) g.computeBoundingSphere();
                } catch (_) {}
              }
              try {
                if (obj.material && obj.material.map && THREE.sRGBEncoding) {
                  obj.material.map.encoding = THREE.sRGBEncoding;
                  obj.material.map.needsUpdate = true;
                }
              } catch (_) {}
            }
          });
          // Center the visual mesh without changing the public site's apparent size.
          // The old normalize scale was immediately overwritten by model.scale.set(r0),
          // so the child stays at scale 1 and only the animation pivot is scaled.
          try {
            var contentModel = model;
            var box = new THREE.Box3().setFromObject(contentModel);
            var sphere = box.getBoundingSphere(new THREE.Sphere());
            var c = sphere.center.clone();
            contentModel.position.sub(c);
            var pivot = new THREE.Group();
            pivot.add(contentModel);
            model = pivot;
            dbg(
              "[face3d] center r=" +
                sphere.radius.toFixed(3) +
                " center=(" +
                c.x.toFixed(2) +
                "," +
                c.y.toFixed(2) +
                "," +
                c.z.toFixed(2) +
                ")",
            );
          } catch (e) {
            dbg("[face3d] center failed " + e);
          }
          scene.add(model);
          if (model.updateMatrixWorld) model.updateMatrixWorld(true);
          // Initial posture: start small and low below title
          computeYStart();
          computeYTarget();
          model.position.set(0, yStart, 0);
          // Invert initial heading by 180 degrees on Y axis
          model.rotation.set(0, Math.PI, 0);
          // Scale initial radius to match screen dimensions (~90% scale)
          var r0 = initialRadiusAt(0);
          model.scale.set(r0, r0, r0);
          var fov = (camera.fov * Math.PI) / 180;
          var fitDist = 6.0 / Math.tan(fov / 2);
          camera.position.set(0, 0, fitDist);
          camera.lookAt(0, 0, 0);
          computeYStart();
          computeYTarget();
          startLoop();
          dbg(
            "[face3d] onLoad fitDist=" +
              fitDist.toFixed(2) +
              " meshes=" +
              meshCount +
              " verts~" +
              vertSum +
              " (basic+wire)",
          );
          // Do not lock scroll; allow automatic recovery
        }
        function onProgress(evt) {
          if (evt && evt.total)
            dbg(
              "[face3d] loading " +
                Math.round((evt.loaded / evt.total) * 100) +
                "%",
            );
        }
        function onError(err) {
          try {
            console.error(
              "[face3d] GLB load error @" + currentUrl() + ":",
              err,
            );
          } catch (_) {}
          try {
            urlIdx++;
            if (urlIdx < baseCandidates.length) {
              var next = currentUrl();
              dbg("[face3d] retry with: " + next);
              begin();
            }
          } catch (_) {}
        }
        function begin() {
          var u = currentUrl();
          dbg(
            "[face3d] loading " +
              u +
              " with " +
              (loaderCtor.name || "GLTFLoader"),
          );
          loader.load(u, onLoad, onProgress, onError);
        }
        begin();
      } catch (e) {
        console.error("[face3d] GLTFLoader instantiation failed", e);
      }
    }

    // Resolve GLTFLoader instance with multi-bundle compatibility
    var GLTFLoaderCtor =
      window.GLTFLoader || (window.THREE && window.THREE.GLTFLoader);
    if (GLTFLoaderCtor) {
      loadGLBWith(GLTFLoaderCtor);
    } else {
      // Local library may still be completing deferred evaluation; poll briefly
      var retryCount = 0;
      var retryTimer = setInterval(function () {
        retryCount++;
        var C = window.GLTFLoader || (window.THREE && window.THREE.GLTFLoader);
        if (C) {
          clearInterval(retryTimer);
          loadGLBWith(C);
        } else if (retryCount > 20) {
          clearInterval(retryTimer);
          console.warn("[face3d] Local GLTFLoader not available; skipping 3D model");
        }
      }, 50);
    }

    var resizeRaf = 0;
    function scheduleResize() {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(function () {
        resizeRaf = 0;
        onResize();
        computeYStart();
        computeYTarget();
        _frameMinMs = frameIntervalForDevice();
        updateHeroInView();
        startLoop();
      });
    }
    window.addEventListener("resize", scheduleResize, { passive: true });
    // The compositor may resize HERO after the window event has already run.
    // Observe the actual video plane so initial layout and rotation cannot lag.
    new ResizeObserver(scheduleResize).observe(hero);
    hero
      .querySelector("video")
      .addEventListener("loadedmetadata", scheduleResize);
    window.addEventListener("scroll", scheduleHeroInView, { passive: true });
    document.addEventListener("jugend:chapter-visibility", scheduleHeroInView);
    updateHeroInView();
    // Initialize progress from minimum (0..1)
    targetP = 0.0;
    currP = 0.0;
    // The page owns one native scroll timeline. This renderer only consumes it.
    window.addEventListener(
      "ju:hero-progress",
      function (event) {
        var next = event && event.detail ? Number(event.detail.progress) : 0;
        if (!isFinite(next)) return;
        spinVel += (next - targetP) * 18;
        targetP = clamp01(next);
        startLoop();
      },
      { passive: true },
    );
    if (typeof window.JUHeroProgress === "number")
      targetP = clamp01(window.JUHeroProgress);

    startLoop();
  }

  function onResize() {
    alignToVideo();
    width = layer.clientWidth || window.innerWidth;
    height = layer.clientHeight || window.innerHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(4000000 / Math.max(1, width * height)),
      ),
    );
    renderer.setSize(width, height, false);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  var _tLast = performance.now ? performance.now() : Date.now();
  var _t = 0;
  // Reuse math objects to avoid per-frame allocations (no visual/behavioral change intended).
  var _qBase = null,
    _qSpin = null,
    _qAxis = null,
    _qFinal = null;
  var _eBase = null,
    _vSpinAxis = null,
    _vWobbleAxis = null;
  function frameIntervalForDevice() {
    if (window.JUScenes) return 0;
    var coarse = false;
    try {
      coarse =
        window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    } catch (_) {}
    var tabletLike =
      coarse &&
      Math.min(window.innerWidth || 0, window.innerHeight || 0) >= 600;
    return tabletLike ? 1000 / 45 : 16;
  }
  var _frameMinMs = frameIntervalForDevice();
  var _lastFrameNow = 0;
  function startLoop() {
    if (rafId || document.hidden || !computeHeroInView()) return;
    running = true;
    rafId = requestAnimationFrame(tick);
  }
  function stopLoop() {
    running = false;
    if (rafId) {
      try {
        cancelAnimationFrame(rafId);
      } catch (_) {}
      rafId = 0;
    }
  }
  document.addEventListener(
    "visibilitychange",
    function () {
      if (document.hidden) {
        stopLoop();
        return;
      }
      if (heroIsInView() && renderer && scene && camera && model) startLoop();
    },
    { passive: true },
  );
  function tick() {
    if (!running) {
      rafId = 0;
      return;
    }
    // schedule next frame early so we can cancel it immediately on completion
    rafId = requestAnimationFrame(tick);
    if (!renderer || !scene || !camera || !model) {
      renderer && renderer.render(scene, camera);
      return;
    }
    if (document.hidden) return;
    var now = performance.now ? performance.now() : Date.now();
    if (_frameMinMs && now - _lastFrameNow < _frameMinMs) return;
    _lastFrameNow = now;
    var dt = Math.max(0, Math.min(0.05, (now - _tLast) / 1000));
    _tLast = now;
    _t += dt;
    // Smoothly interpolate HERO scroll progress
    if (window.JUScenes) currP = targetP;
    else
      currP +=
        (targetP - currP) * (1 - Math.pow(1 - lerpFactorFor(targetP), dt * 60));
    var p = easeOutCubic(currP);
    if (!impactKickDone && p > 0.04) {
      spinVel += 6.0;
      impactKickDone = true;
    }
    // Position: translate upwards from yStart to yTarget with centered Z
    // Preserve scale/exit progress p and the video's impact cue; soften only
    // the trajectory (initial derivative 1.5 instead of cubic's 3).
    var pathP = 1 - Math.pow(1 - currP, 1.5);
    var yy = lerp(yStart, yTarget, pathP);
    var zz = 0;
    model.position.set(0, yy, zz);

    // Rotation: compound quaternion rotation with multi-axis spin
    // Velocity is radians/second, not radians/frame. A 6-radian impact must
    // not become a complete revolution every display frame (or depend on Hz).
    spin += spinVel * dt;
    spinVel *= Math.exp(-dt * 1.5);
    var amp = 0.6 + 1.2 * p; // Moderate oscillation amplitude
    var tfast = 2.2 + 2.4 * p; // Relaxed temporal oscillation rate
    // Dynamic diagonal spin axis mixing X and Z into Y
    var sx = 0.45 + 0.25 * Math.sin(_t * 0.8);
    var sy = 1.0;
    var sz = 0.32 + 0.22 * Math.cos(_t * 1.1);
    var sl = Math.max(1e-6, Math.sqrt(sx * sx + sy * sy + sz * sz));
    sx /= sl;
    sy /= sl;
    sz /= sl;
    // Subtle undulating axis perturbation
    var ax = Math.sin(_t * 0.9 + 0.3),
      ay = Math.cos(_t * 1.3 - 0.2),
      az = Math.sin(_t * 1.7 + 1.1);
    var al = Math.max(1e-6, Math.sqrt(ax * ax + ay * ay + az * az));
    ax /= al;
    ay /= al;
    az /= al;
    var angle = amp * (0.6 + 0.8 * Math.sin(_t * tfast));
    // Composite rotation: baseline invert + diagonal spin + ripple
    if (!_qBase) {
      _qBase = new THREE.Quaternion();
      _qSpin = new THREE.Quaternion();
      _qAxis = new THREE.Quaternion();
      _qFinal = new THREE.Quaternion();
      _eBase = new THREE.Euler(baseRot.x, baseRot.y, baseRot.z, "XYZ");
      _vSpinAxis = new THREE.Vector3();
      _vWobbleAxis = new THREE.Vector3();
      _qBase.setFromEuler(_eBase);
    }
    _vSpinAxis.set(sx, sy, sz);
    _vWobbleAxis.set(ax, ay, az);
    _qSpin.setFromAxisAngle(_vSpinAxis, spin + _t * (1.8 + 1.3 * p));
    _qAxis.setFromAxisAngle(_vWobbleAxis, angle);
    _qFinal.copy(_qBase).multiply(_qSpin).multiply(_qAxis);
    model.quaternion.copy(_qFinal);

    // Scale: interpolate from initial radius to expanded state
    var r0 = initialRadiusAt(0);
    var sPow = Math.pow(2, 1.6 * p);
    var boost = 1 + 8 * p;
    var radiusNow = r0 * sPow * boost;
    model.scale.set(radiusNow, radiusNow, radiusNow);

    // Hide exactly when the centered mesh reaches the video center.
    // Reverse scrolling retraces the same position and reveals it again.
    var centerReached = yy >= 0;
    // Show the prepared initial pose with the first film frame in the preview.
    // The original impact cue still controls the subsequent ascent/growth.
    var showInitial =
      !!window.JUScenes &&
      document.documentElement.classList.contains("hero-media-ready");
    var showBall = targetP > 0 || showInitial;
    layer.style.visibility = showBall ? "visible" : "hidden";
    layer.style.opacity = centerReached ? "0" : "";

    if (showBall && !centerReached) renderer.render(scene, camera);
    // Natural rotation uses elapsed time; position/scale use scroll directly.
    if (window.JUScenes && (!showBall || centerReached || !computeHeroInView()))
      stopLoop();
  }

  init();
})();
