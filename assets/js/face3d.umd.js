// UMD版 Three.js 前提で、GLBをスクロールで下から拡大・回転させる
(function(){
  // suppress noisy diagnostics in production
  var layer = document.getElementById('face3d-layer');
  var hero = document.getElementById('hero');
  if (!layer || !hero || !window.THREE) return;

  // 最前面固定（ヘッダ/タイトルより上。カーソルより下）
  (function pinLayerFront(){
    try{
      // 一度 body 末尾へ移動
      if (layer.parentElement !== document.body) document.body.appendChild(layer);
      else { try { document.body.removeChild(layer); document.body.appendChild(layer); } catch(_){ } }
      // 強制スタイル
      layer.style.position = 'fixed';
      layer.style.left = '0'; layer.style.top = '0'; layer.style.right = '0'; layer.style.bottom = '0';
      layer.style.pointerEvents = 'none';
      layer.style.zIndex = '2500'; // header(1000), modal(2000) より上、cursor(100000) より下
      // もし他のスクリプトが後から前面要素を追加しても、末尾に保つ
      var mo = new MutationObserver(function(){
        try { if (document.body.lastElementChild !== layer) { document.body.appendChild(layer); } } catch(_){ }
      });
      mo.observe(document.body, { childList: true });
    }catch(_){ }
  })();

  var renderer, scene, camera, model = null;
  var width = layer.clientWidth || window.innerWidth;
  var height = layer.clientHeight || window.innerHeight;
  var isTouchDevice = false;
  try{
    isTouchDevice = (navigator && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0) ||
      (!!window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }catch(_){ }
  var spinVel = 0, spin = 0; // ホイール回転の慣性
  var BASE_SCROLL_SENSITIVITY = 1400 * 4.5;    // さらに軽く
  var LATE_SCROLL_SENSITIVITY = 1400 * 2.5;    // 終盤はかなり軽く
  var BASE_SPIN_SENSITIVITY   = 2300 * 4.5;
  var LATE_SPIN_SENSITIVITY   = 2300 * 2.5;
  var BASE_LERP = 0.18;                      // 追従係数の基準値
  var LATE_LERP = 0.36;                      // 終盤の慣性をさらに効かせる
  function clamp01(v){ return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function scrollSensitivityFor(p){
    var t = clamp01(p);
    return BASE_SCROLL_SENSITIVITY - (BASE_SCROLL_SENSITIVITY - LATE_SCROLL_SENSITIVITY) * t;
  }
  function spinSensitivityFor(p){
    var t = clamp01(p);
    return BASE_SPIN_SENSITIVITY - (BASE_SPIN_SENSITIVITY - LATE_SPIN_SENSITIVITY) * t;
  }
  function lerpFactorFor(p){
    var t = clamp01(p);
    return BASE_LERP + (LATE_LERP - BASE_LERP) * t;
  }
  // ホイール進捗のグローバル状態（tick からも参照するため外に）
  var targetP = 0.0, currP = 0.0;
  var interactionDone = false; // 完了後にスクロール解除
  var cleanupInputs = function(){};
  var yStart = 0;              // 初期Y（タイトル2行分下）
  var line2px = 0;             // 2行分ピクセル
  var lockScrollY = 0;         // ロック前のスクロール位置
  var camFitDist = 6;          // カメラ距離（fit計算後に更新）
  var baseRot = {x:0, y:Math.PI, z:0}; // 初期の裏表反転を常時適用
  var impactKickDone = false;  // インパクト初速の付与フラグ
  var yTarget = 0;             // 最終到達Y（ヒーローのテキスト中心付近）
  var _lastTargetUpdate = 0;   // yTarget再計算のスロットル
  var rafId = 0;
  var running = true;
  function setScrollLocked(lock){
    try {
      if (lock){
        lockScrollY = window.scrollY || window.pageYOffset || 0;
        var st = document.body.style;
        st.position = 'fixed';
        st.top = (-lockScrollY) + 'px';
        st.left = '0'; st.right = '0';
        st.width = '100%';
        st.overflow = 'hidden';
        st.touchAction = 'none';
        document.documentElement.style.overscrollBehavior = 'contain';
      } else {
        var st2 = document.body.style;
        st2.position = '';
        st2.top = '';
        st2.left = ''; st2.right = '';
        st2.width = '';
        st2.overflow = '';
        st2.touchAction = '';
        document.documentElement.style.overscrollBehavior = '';
        window.scrollTo(0, lockScrollY|0);
      }
    }catch(_){ }
  }
  function lerp(a,b,t){ return a + (b-a)*t; }
  function viewportWorldHeightAtZ(z){
    var fov = (camera.fov||45) * Math.PI/180;
    var dist = Math.max(0.0001, (camera.position ? (camera.position.z - z) : 1));
    return 2 * Math.tan(fov/2) * dist;
  }
  // サイズ制御用パラメータ（画面依存）
  var INIT_VIEW_FRAC = 0.24;   // 初期直径=ビューポート高さの24%
  var FULL_VIEW_FRAC = 0.95;   // 画面いっぱい（以前の閾値）で即退場
  function initialRadiusAt(z){ return 0.5 * viewportWorldHeightAtZ(z) * INIT_VIEW_FRAC; }
  function currentViewRadiusFrac(z, radius){ var vh = viewportWorldHeightAtZ(z); return (radius*2) / Math.max(1e-6, vh); }
  function computeYStart(){
    try{
      var vhWorld = viewportWorldHeightAtZ(0);
      // 開始位置を少しだけ下げる（画面高の1.2倍下側）
      yStart = -1.2 * vhWorld;
    }catch(_){ yStart = -0.8; }
    // suppress debug trace
  }
  var TOP_ANCHOR_FRAC = 0.10; // 上からの比率（8段階の近辺）
  var TARGET_BIAS_UP = 0.12;  // タイトル中央から少し上（12%）
  function computeYTarget(){
    try{
      // 終了位置は中央より上（バックアップ挙動より少し下）
      var vhWorld = viewportWorldHeightAtZ(0);
      yTarget = +2.6 * vhWorld;
      // suppress debug trace
    }catch(_){ yTarget = 0; }
  }
// 軽いデバッグ出力（URLに ?debug3d=1 を付けるか、window.face3dDebug=true で有効化）
var __debug3d = (function(){
  try {
    if (window.face3dDebug === true) return true;
    var qs = (location.search||"").replace(/^\?/,'').split('&').reduce(function(a,p){var kv=p.split('='); a[kv[0]]=kv[1]||''; return a;},{});
    return !!(qs.debug3d||qs.d3d);
  } catch(_) { return false; }
})();
function dbg(msg){}

  function init(){
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, (width)/(height), 0.01, 2000);
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // iPad/iPhone: cap DPR to reduce scroll jank without changing animation timing.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouchDevice ? 1.0 : 1.5));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    // 黒潰れ対策: 色空間とトーンマッピング
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.physicallyCorrectLights = true;
    layer.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    var ambient = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambient);
    var dir = new THREE.DirectionalLight(0xffffff, 1.8);
    dir.position.set(2.4, 2.0, 3.0);
    scene.add(dir);
    var hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 0.8);
    scene.add(hemi);

    // GLBロードの候補（環境により解決基点がずれる場合があるため複数試行）
    var baseCandidates = [
      '/assets/images/test3Dface_patched.glb',
      'assets/images/test3Dface_patched.glb'
    ];
    var urlIdx = 0;
    var glbVersionKey = 'v20251005';
    function currentUrl(){
      var base = baseCandidates[urlIdx];
      if (!glbVersionKey) return base;
      try { return base + (base.indexOf('?')>=0?'&':'?') + glbVersionKey; } catch(_){ return base; }
    }
    dbg('[face3d] load start candidates: ' + baseCandidates.join(', '));
    function loadGLBWith(loaderCtor){
      try{
        var loader = new loaderCtor();
        // Draco対応（ローカル同梱）
        if (window.THREE && window.THREE.DRACOLoader) {
          var draco = new THREE.DRACOLoader();
          draco.setDecoderPath('/assets/libs/draco/');
          loader.setDRACOLoader(draco);
          dbg('[face3d] DRACOLoader attached');
        }
        // Meshopt
        if (window.MeshoptDecoder) {
          try { loader.setMeshoptDecoder(window.MeshoptDecoder); dbg('[face3d] MeshoptDecoder attached'); } catch(_){ }
        }
        // KTX2
        if (window.THREE && window.THREE.KTX2Loader) {
          try {
            var ktx2 = new THREE.KTX2Loader();
            ktx2.setTranscoderPath('libs/basis/');
            try { ktx2.detectSupport && ktx2.detectSupport(renderer); } catch(_){ }
            loader.setKTX2Loader(ktx2);
            dbg('[face3d] KTX2Loader attached');
          } catch(e){ dbg('[face3d] KTX2 attach failed '+e); }
        }
        function onLoad(gltf){
          model = gltf.scene;
          // 全ノードを強制表示・デフォルトレイヤーへ
          model.traverse(function(obj){
            obj.visible = true;
            if (obj.layers && obj.layers.enable) { try { obj.layers.enable(0); } catch(_){} }
            obj.frustumCulled = false;
            obj.matrixAutoUpdate = true;
          });
          // マテリアルはGLB本来のまま（PBR）。BaseColorのsRGB補正のみ適用
          var meshCount = 0;
          var vertSum = 0;
          model.traverse(function(obj){
            if (obj.isMesh){
              meshCount++;
              obj.visible = true; obj.matrixAutoUpdate = true; obj.frustumCulled=false;
              var g = obj.geometry;
              if (g && g.attributes && g.attributes.position){
                var cnt = g.index ? g.index.count : g.attributes.position.count;
                vertSum += cnt;
                try { g.setDrawRange(0, cnt); } catch(_){ }
                try { if (!g.boundingSphere) g.computeBoundingSphere(); } catch(_){ }
              }
              try{
                if (obj.material && obj.material.map && THREE.sRGBEncoding){
                  obj.material.map.encoding = THREE.sRGBEncoding;
                  obj.material.map.needsUpdate = true;
                }
              }catch(_){ }
            }
          });
          // 原点正規化
          try {
            var box = new THREE.Box3().setFromObject(model);
            var sphere = box.getBoundingSphere(new THREE.Sphere());
            var c = sphere.center.clone();
            model.position.sub(c);
            var normalize = (sphere.radius > 0.0001) ? (1 / sphere.radius) : 1;
            model.scale.multiplyScalar(normalize);
            dbg('[face3d] norm r='+sphere.radius.toFixed(3)+' center=('+c.x.toFixed(2)+','+c.y.toFixed(2)+','+c.z.toFixed(2)+')');
          } catch(e){ dbg('[face3d] normalize failed '+e); }
          scene.add(model);
          if (model.updateMatrixWorld) model.updateMatrixWorld(true);
          // 初期姿勢（タイトル2行分下・小さく開始）
          computeYStart();
          computeYTarget();
          model.position.set(0, yStart, 0);
          // 初期向きを裏表逆（180deg Y）
          model.rotation.set(0, Math.PI, 0);
          // 初期半径を画面サイズに追従させる（90%縮小相当）
          var r0 = initialRadiusAt(0);
          model.scale.set(r0, r0, r0);
          var fov = camera.fov * Math.PI / 180;
          var fitDist = 6.0 / Math.tan(fov/2);
          camFitDist = fitDist;
          camera.position.set(0, 0, fitDist);
          camera.lookAt(0, 0, 0);
          dbg('[face3d] onLoad fitDist='+fitDist.toFixed(2)+' meshes='+meshCount+' verts~'+vertSum+' (basic+wire)');
          // スクロールロックは使用しない（自動復旧）
        }
        function onProgress(evt){ if (evt && evt.total) dbg('[face3d] loading '+Math.round(evt.loaded/evt.total*100)+'%'); }
        function onError(err){
          try{ console.error('[face3d] GLB load error @'+currentUrl()+':', err); }catch(_){ }
          try{
            urlIdx++;
            if (urlIdx < baseCandidates.length){
              var next = currentUrl();
              dbg('[face3d] retry with: ' + next);
              begin();
            }
          }catch(_){ }
        }
        function begin(){ var u = currentUrl(); dbg('[face3d] loading '+u+' with '+(loaderCtor.name||'GLTFLoader')); loader.load(u, onLoad, onProgress, onError); }
        begin();
      }catch(e){ console.error('[face3d] GLTFLoader instantiation failed', e); }
    }

    // GLTFLoader の取得（複数Threeがある場合にも対応）
    var GLTFLoaderCtor = (window.GLTFLoader || (window.THREE && window.THREE.GLTFLoader));
    if (GLTFLoaderCtor) {
      loadGLBWith(GLTFLoaderCtor);
    } else {
      console.warn('[face3d] GLTFLoader not found; injecting fallback CDN');
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/loaders/GLTFLoader.js';
      s.onload = function(){
        var C = (window.GLTFLoader || (window.THREE && window.THREE.GLTFLoader));
        if (!C) { console.error('[face3d] GLTFLoader still unavailable'); return; }
        loadGLBWith(C);
      };
      s.onerror = function(){ console.error('[face3d] Failed to inject GLTFLoader from CDN'); };
      document.head.appendChild(s);
    }

    window.addEventListener('resize', function(){ onResize(); computeYStart(); computeYTarget(); });
    // 初期は最小から（0..1）
    targetP = 0.0; currP = 0.0;
    var wheelHandler = function(e){
      if (!interactionDone) { try{ e.preventDefault(); }catch(_){ } }
      var d = Math.max(-400, Math.min(400, e.deltaY));
      // 下スクロールで前方へ／拡大、上で戻す
      var scrollSens = scrollSensitivityFor(targetP);
      targetP += (d / scrollSens); // 進捗が進むほど軽く
      if (targetP < 0) targetP = 0; if (targetP > 1) targetP = 1;
      // 回転慣性も付与（弱め）
      var spinSens = spinSensitivityFor(targetP);
      spinVel += (d / spinSens);
    };
    window.addEventListener('wheel', wheelHandler, { passive: false });

    // --- TOUCH SUPPORT ---
    var lastTouchY = 0;
    window.addEventListener('touchstart', function(e) {
      if (e.touches && e.touches.length > 0) {
        lastTouchY = e.touches[0].clientY;
      }
    }, { passive: true });

    var touchMoveHandler = function(e){
      if (!interactionDone){
        try{ e.preventDefault(); }catch(_){ }
        if (e.touches && e.touches.length > 0) {
            var currentY = e.touches[0].clientY;
            var d = lastTouchY - currentY; // Match wheel direction
            lastTouchY = currentY;

            var touchScrollSens = scrollSensitivityFor(targetP);
            targetP += (d / touchScrollSens); // Wheel と同じ感度
            if (targetP < 0) targetP = 0; if (targetP > 1) targetP = 1;
            var touchSpinSens = spinSensitivityFor(targetP);
            spinVel += (d / touchSpinSens); // Wheel と同じ感度
        }
      }
    };
    window.addEventListener('touchmove', touchMoveHandler, { passive: false });

    cleanupInputs = function(){
      try{ window.removeEventListener('wheel', wheelHandler, { passive: false }); }catch(_){ window.removeEventListener('wheel', wheelHandler); }
      try{ window.removeEventListener('touchmove', touchMoveHandler, { passive: false }); }catch(_){ window.removeEventListener('touchmove', touchMoveHandler); }
    };

    startLoop();
  }

  function onResize(){
    width = layer.clientWidth || window.innerWidth;
    height = layer.clientHeight || window.innerHeight;
    if (!width || !height) return;
    camera.aspect = width/height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function progress(){
    var top = hero.offsetTop;
    var h = hero.offsetHeight || window.innerHeight;
    var y = window.scrollY || window.pageYOffset || 0;
    var vh = window.innerHeight || h;
    // ヒーローに入る少し手前から、終盤までを0→1に
    var start = top - vh * 0.1;
    var end   = top + h  * 0.9;
    var raw = (y - start) / Math.max(1, (end - start));
    if (raw < 0) raw = 0; if (raw > 1) raw = 1;
    return raw;
  }
  function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

  var _tLast = performance.now ? performance.now() : Date.now();
  var _t = 0;
  // Reuse math objects to avoid per-frame allocations (no visual/behavioral change intended).
  var _qBase = null, _qSpin = null, _qAxis = null, _qFinal = null;
  var _eBase = null, _vSpinAxis = null, _vWobbleAxis = null;
  function startLoop(){
    if (rafId) return;
    running = true;
    rafId = requestAnimationFrame(tick);
  }
  function stopLoop(){
    running = false;
    if (rafId){
      try{ cancelAnimationFrame(rafId); }catch(_){ }
      rafId = 0;
    }
  }
  function tick(){
    if (!running){ rafId = 0; return; }
    // schedule next frame early so we can cancel it immediately on completion
    rafId = requestAnimationFrame(tick);
    if (!renderer || !scene || !camera || !model){ renderer && renderer.render(scene, camera); return; }
    var now = performance.now ? performance.now() : Date.now();
    var dt = Math.max(0, Math.min(0.05, (now - _tLast)/1000));
    _tLast = now; _t += dt;
    // ホイール進捗をスムーズに反映
    currP += (targetP - currP) * lerpFactorFor(targetP);
    var p = easeOutCubic(currP);
    if (!impactKickDone && p > 0.04){ spinVel += 6.0; impactKickDone = true; }
    // 位置: 下から上（yStart → yTarget）へ遷移、Zは中央
    var yy = lerp(yStart, yTarget, p);
    var zz = 0;
    model.position.set(0, yy, zz);

    // 回転: 高速・複合（クォータニオンでXYZ複雑回転 + 斜めスピン）
    spin += spinVel; spinVel *= 0.975;
    var amp = 0.6 + 1.2 * p; // 振れを少し控えめに
    var tfast = 2.2 + 2.4 * p; // 時間スケールも少し緩めに
    // 可変“斜め”スピン軸（YにX/Zを混ぜる）
    var sx = 0.45 + 0.25*Math.sin(_t*0.8);
    var sy = 1.00;
    var sz = 0.32 + 0.22*Math.cos(_t*1.1);
    var sl = Math.max(1e-6, Math.sqrt(sx*sx+sy*sy+sz*sz)); sx/=sl; sy/=sl; sz/=sl;
    // 細かい“うねり”用の可変軸
    var ax = Math.sin(_t*0.9 + 0.3), ay = Math.cos(_t*1.3 - 0.2), az = Math.sin(_t*1.7 + 1.1);
    var al = Math.max(1e-6, Math.sqrt(ax*ax+ay*ay+az*az)); ax/=al; ay/=al; az/=al;
    var angle = amp * (0.6 + 0.8*Math.sin(_t*tfast));
    // 基準（裏表反転） + 斜めスピン + うねり
    if (!_qBase){
      _qBase = new THREE.Quaternion();
      _qSpin = new THREE.Quaternion();
      _qAxis = new THREE.Quaternion();
      _qFinal = new THREE.Quaternion();
      _eBase = new THREE.Euler(baseRot.x, baseRot.y, baseRot.z, 'XYZ');
      _vSpinAxis = new THREE.Vector3();
      _vWobbleAxis = new THREE.Vector3();
      _qBase.setFromEuler(_eBase);
    }
    _vSpinAxis.set(sx, sy, sz);
    _vWobbleAxis.set(ax, ay, az);
    _qSpin.setFromAxisAngle(_vSpinAxis, spin + _t*(1.8+1.3*p));
    _qAxis.setFromAxisAngle(_vWobbleAxis, angle);
    _qFinal.copy(_qBase).multiply(_qSpin).multiply(_qAxis);
    model.quaternion.copy(_qFinal);

    // スケール: 画面サイズ連動拡大（初期半径→拡大）
    var r0 = initialRadiusAt(0);
    var sPow = Math.pow(2, 1.6 * p);
    var boost = 1 + 8 * p;
    var radiusNow = r0 * sPow * boost;
    model.scale.set(radiusNow, radiusNow, radiusNow);

    // 画面いっぱいに達したら即退場（以前の仕様）
    var frac = currentViewRadiusFrac(zz, radiusNow);
    if (!interactionDone && frac >= FULL_VIEW_FRAC){
      interactionDone = true;
      if (window.animationCompleted) { window.animationCompleted(); }
      try{ layer.style.pointerEvents = 'none'; }catch(_){ }
      try{ layer.style.display = 'none'; }catch(_){ }
      cleanupInputs();
      stopLoop();
      // Release GPU resources; no visual impact because the layer is hidden at this point.
      try{
        if (renderer && renderer.dispose) renderer.dispose();
        if (renderer && renderer.forceContextLoss) renderer.forceContextLoss();
        if (renderer && renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }catch(_){ }
      return;
    }

    // p終端でのフェード退場は使わない（満画面判定のみ）

    renderer.render(scene, camera);
  }

  init();
})();
