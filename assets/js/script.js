// --- Unlock Logic ---
window.is3DAnimationDone = false;
window.isVideoDone = false;

const isSafariDesktop = (() => {
  try {
    const ua = navigator.userAgent || '';
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|Android/.test(ua);
    const isIOS = /iP(ad|hone|od)/.test(ua);
    return isSafari && !isIOS;
  } catch(_){
    return false;
  }
})();

const FORCE_WEBGL_TIMEOUT_MS = 6000;
let webglFailSafeId = null;

if (isSafariDesktop) {
  try {
    document.documentElement.classList.add('is-safari-desktop');
  } catch(_){}
}

function setupHeroVideoAutoplay(video){
  if (!video || video.__juAutoplaySetup) return;
  video.__juAutoplaySetup = true;

  const ensureAttributes = () => {
    if (!video.dataset.autoplayState) {
      video.dataset.autoplayState = 'pending';
    }
    try { video.muted = true; } catch(_){}
    try { video.defaultMuted = true; } catch(_){}
    try { video.volume = 0; } catch(_){}
    try { video.autoplay = true; } catch(_){}
    try { video.playsInline = true; } catch(_){}
    try { video.webkitPlaysInline = true; } catch(_){}
    ['muted','autoplay','playsinline','webkit-playsinline'].forEach(attr => {
      if (!video.hasAttribute(attr)) video.setAttribute(attr, '');
    });
    video.setAttribute('preload', 'auto');
    try {
      if (video.readyState < 2) {
        video.load();
      }
    } catch(_){}
  };
  ensureAttributes();

  let attempts = 0;
  const MAX_ATTEMPTS = isSafariDesktop ? 40 : 10;
  const RETRY_DELAY = isSafariDesktop ? 250 : 600;

  const tryPlay = (fromUser = false) => {
    if (window.isVideoDone) return;
    if (!video) return;
    if (!fromUser && video.dataset.autoplayState === 'blocked' && !isSafariDesktop) return;
    if (video.readyState < 2) {
      if (attempts < MAX_ATTEMPTS) {
        setTimeout(() => tryPlay(fromUser), fromUser ? 150 : RETRY_DELAY);
      }
      return;
    }
    attempts++;
    let playPromise;
    try {
      playPromise = video.play();
    } catch (err) {
      handleFailure(err, fromUser);
      return;
    }
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(() => {
        video.dataset.autoplayState = 'playing';
      }).catch(err => handleFailure(err, fromUser));
    } else if (video.paused) {
      handleFailure(undefined, fromUser);
    } else {
      video.dataset.autoplayState = 'playing';
    }
  };

  function handleFailure(err, fromUser){
    if (!fromUser) {
      if (attempts < MAX_ATTEMPTS || isSafariDesktop) {
        setTimeout(() => tryPlay(false), RETRY_DELAY * (isSafariDesktop ? 2 : 1));
      } else {
        video.dataset.autoplayState = 'blocked';
      }
    }
    if (err && !video.__juAutoplayWarned) {
      video.__juAutoplayWarned = true;
    }
  }

  video.__juTryPlay = (fromUser = false) => tryPlay(!!fromUser);

  const unlockOnce = evt => {
    if (window.isVideoDone) return;
    video.__juTryPlay(true);
  };
  ['pointerdown','touchstart'].forEach(evtName => {
    document.addEventListener(evtName, unlockOnce, { once: true, passive: true });
  });
  document.addEventListener('keydown', unlockOnce, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (window.isVideoDone) return;
    if (!document.hidden && video.paused) {
      video.__juTryPlay();
    }
  });
  video.addEventListener('loadeddata', () => { if (!window.isVideoDone) video.__juTryPlay(); }, { once: true });
  video.addEventListener('suspend', () => {
    if (window.isVideoDone) return;
    if (video.paused && !document.hidden) {
      setTimeout(() => video.__juTryPlay(), 220);
    }
  });
  video.addEventListener('playing', () => {
    video.dataset.autoplayState = 'playing';
    if (video.__juAutoplayTicker) {
      clearInterval(video.__juAutoplayTicker);
      video.__juAutoplayTicker = null;
    }
  });

  if (!video.__juAutoplayTicker) {
    video.__juAutoplayTicker = setInterval(() => {
      if (window.isVideoDone) {
        clearInterval(video.__juAutoplayTicker);
        video.__juAutoplayTicker = null;
        return;
      }
      if (!document.hidden && video.dataset.autoplayState !== 'playing') {
        video.__juTryPlay();
      } else if (video.dataset.autoplayState === 'playing') {
        clearInterval(video.__juAutoplayTicker);
        video.__juAutoplayTicker = null;
      }
    }, isSafariDesktop ? 1200 : 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { if (!window.isVideoDone) video.__juTryPlay(); }, { once: true });
  } else {
    if (!window.isVideoDone) video.__juTryPlay();
  }
}

function isTrueTouchDevice(){
  try {
    if (navigator && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0) {
      return true;
    }
    if (navigator && typeof navigator.userAgent === 'string' && /Mobile|Android|iP(ad|hone)/i.test(navigator.userAgent)) {
      return true;
    }
    if (window.matchMedia && typeof window.matchMedia === 'function') {
      return window.matchMedia('(pointer:coarse)').matches;
    }
  } catch(_){}
  return false;
}

// iPad / タブレット: HEROの文字ブロック位置調整（現在はCSSで制御）
function nudgeHeroVisualForTablet(){
  // 位置の最終調整は CSS (media query) で行う。
  return;
}

function safeStartGooey(){
  try {
    if (!window.__gooeyStarted) {
      gooeyTextAnimation();
    }
  } catch(err){
    try { console.error('Gooey animation fallback failed:', err); } catch(_){}
  }
}

function attemptPageUnlock() {
  const isTouch = isTrueTouchDevice();
  const canUnlock = isTouch
    ? window.isVideoDone // タッチデバイスなら動画完了だけでOK
    : window.is3DAnimationDone && window.isVideoDone; // PCなら両方必要

  if (!canUnlock) return;

  const wasLocked = document.documentElement.classList.contains('scroll-locked') || document.body.classList.contains('scroll-locked');

  if (wasLocked) {
    try {
      document.documentElement.classList.remove('scroll-locked');
      document.body.classList.remove('scroll-locked');
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
      document.documentElement.style.overscrollBehavior = '';
    } catch(err) {
      console.error('Error unlocking page scroll:', err);
    }
  }

  showHeaderOnce();
}

// 3Dアニメーションが完了したときに face3d.umd.js から呼び出される
window.animationCompleted = function() {
  // console log removed for production performance
  window.is3DAnimationDone = true;
  if (webglFailSafeId) {
    clearTimeout(webglFailSafeId);
    webglFailSafeId = null;
  }
  // 3Dアニメーション完了と同時に動画再生を開始する
  const heroVideo = document.getElementById('hero-video');
  if (heroVideo) {
    setupHeroVideoAutoplay(heroVideo);
    if (typeof heroVideo.__juTryPlay === 'function') {
      heroVideo.__juTryPlay();
    } else {
      try {
        const playPromise = heroVideo.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(err => {
            console.error("Video play failed inside animationCompleted:", err);
            window.isVideoDone = true;
            attemptPageUnlock();
          });
        }
      } catch(err) {
        console.error("Video play failed inside animationCompleted:", err);
        window.isVideoDone = true;
        attemptPageUnlock();
      }
    }
  }
  attemptPageUnlock();
};

// --- Main Logic ---
window.addEventListener('DOMContentLoaded', () => {
  // ★★★ 初期スクロールロック ★★★
  const isTouch = isTrueTouchDevice();
  document.documentElement.classList.add('scroll-locked');
  document.body.classList.add('scroll-locked');
  // drop verbose logging in production

  // スクロールバー幅を計測
  try {
    const meas = document.createElement('div');
    meas.style.cssText = 'position:absolute;top:-9999px;width:120px;height:120px;overflow:scroll;';
    document.body.appendChild(meas);
    let sbw = meas.offsetWidth - meas.clientWidth;
    if (sbw < 0 || !isFinite(sbw)) sbw = 0;
    if (!sbw) {
      try {
        sbw = window.innerWidth - document.documentElement.clientWidth;
        if (sbw < 0 || !isFinite(sbw)) sbw = 0;
      } catch(_){}
    }
    document.documentElement.style.setProperty('--sbw', sbw + 'px');
    meas.remove();
  } catch(_){}

  const header = document.querySelector('.site-header');
  const heroSection = document.getElementById('hero');
  const heroTitle = document.getElementById('hero-title');
  if (header) {
    header.classList.remove('blurry-start','blur','condensed','hide','revealed','is-visible');
    header.classList.add('before-unlock');
    const inner = header.querySelector('.header-inner');
    if (inner) inner.classList.add('before-unlock');
    header.style.boxShadow = 'none';
  }
  if (heroTitle) {
    heroTitle.classList.remove('is-visible');
  }

  // HEROのgooey-wrapperを1段ラップして、位置調整用のレイヤーを分離
  (function(){
    try{
      var gooey = document.querySelector('#hero .gooey-wrapper');
      if (!gooey) return;
      var parent = gooey.parentElement;
      if (parent && parent.classList.contains('hero-shift-wrapper')) return;
      var shift = document.createElement('div');
      shift.className = 'hero-shift-wrapper';
      shift.style.display = 'inline-block';
      shift.style.willChange = 'transform';
      shift.style.transformOrigin = 'center center';
      parent.insertBefore(shift, gooey);
      shift.appendChild(gooey);
    }catch(_){}
  })();

  // 位置調整は CSS に委ねる（JS側では何もしない）

  // --- Event Listeners ---
  const heroVideo = document.getElementById('hero-video');
  if (heroVideo) {
    setupHeroVideoAutoplay(heroVideo);
    const fallbackDelay = isSafariDesktop ? 1800 : 4000;
    const markHeroVideoAsVisible = () => {
      if (window.isVideoDone) return;
      try {
        heroVideo.style.display = 'block';
        if (heroSection) heroSection.classList.remove('ended');
      } catch(_){}
    };
    const markHeroVideoAsEnded = () => {
      try {
        heroVideo.style.display = 'none';
        if (heroSection) heroSection.classList.add('ended');
      } catch(_){}
    };
    if (typeof heroVideo.__juTryPlay === 'function' && !heroVideo.__juTryPlay.__juHeroVisibilityPatched) {
      const originalTryPlay = heroVideo.__juTryPlay;
      const patchedTryPlay = function patchedTryPlay(...args) {
        markHeroVideoAsVisible();
        return originalTryPlay.apply(this, args);
      };
      patchedTryPlay.__juHeroVisibilityPatched = true;
      heroVideo.__juTryPlay = patchedTryPlay;
    }
    const finalizeVideoFlow = state => {
      if (window.isVideoDone) return;
      if (state === 'ended' || state === 'failed') {
        markHeroVideoAsEnded();
      }
      window.isVideoDone = true;
      attemptPageUnlock();
    };
    const clearFallbackTimer = () => {
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    };
    const isVideoActivelyPlaying = () => {
      try {
        return heroVideo.readyState >= 2 && !heroVideo.paused && !heroVideo.ended;
      } catch(_){
        return false;
      }
    };
    let fallbackTimer = setTimeout(() => {
      if (typeof heroVideo.__juTryPlay === 'function') {
        heroVideo.__juTryPlay();
      }
      if (!window.isVideoDone) {
        if (isVideoActivelyPlaying()) {
          markHeroVideoAsVisible();
          try { safeStartGooey(); } catch (e) { console.error('Gooey animation failed to start:', e); }
          fallbackTimer = null;
          return;
        }
        safeStartGooey();
        const state = heroVideo.dataset.autoplayState === 'blocked' ? 'failed' : 'fallback';
        finalizeVideoFlow(state);
      } else {
        safeStartGooey();
      }
      fallbackTimer = null;
    }, fallbackDelay);
    // The video is now played by the animationCompleted function.

    heroVideo.addEventListener('play', markHeroVideoAsVisible);

    // 動画再生開始でテキストアニメーションを開始
    heroVideo.addEventListener('playing', () => {
      if (window.isVideoDone) return;
      clearFallbackTimer();
      markHeroVideoAsVisible();
      try {
        safeStartGooey();
      } catch (e) {
        console.error('Gooey animation failed to start:', e);
      }
    }, { once: true });

    // 動画・Gooey開始後にも、念のため位置を再調整
    setTimeout(nudgeHeroVisualForTablet, 800);

    if (isVideoActivelyPlaying()) {
      markHeroVideoAsVisible();
      try {
        safeStartGooey();
      } catch (e) {
        console.error('Gooey animation failed to start:', e);
      }
    }

    // 動画終了でフラグを立て、ロック解除を試みる
    heroVideo.addEventListener('ended', () => {
      // console log removed for production performance
      // 指示通り、動画を非表示にして背景を黒にする
      clearFallbackTimer();
      finalizeVideoFlow('ended');
    }, { once: true });

    heroVideo.addEventListener('error', () => {
      clearFallbackTimer();
      safeStartGooey();
      finalizeVideoFlow('failed');
    }, { once: true });
  } else {
    // 動画がない場合は、即座に動画終了フラグを立てる
    // fallback: mark video condition as met when no source is available
    window.isVideoDone = true;
    safeStartGooey();
  }

  if (!isTouch) {
    if (webglFailSafeId) {
      clearTimeout(webglFailSafeId);
    }
    webglFailSafeId = setTimeout(() => {
      if (!window.is3DAnimationDone && typeof window.animationCompleted === 'function') {
        try {
          window.__juForcedWebGL = true;
          window.animationCompleted();
        } catch(err) {
          window.is3DAnimationDone = true;
          attemptPageUnlock();
        }
      }
    }, FORCE_WEBGL_TIMEOUT_MS);
  }
});

function showHeaderOnce(){
  if (window.__headerShown) return; window.__headerShown = true;
  const header = document.querySelector('.site-header'); if (!header) return;
  header.classList.remove('before-unlock');
  header.classList.add('is-visible');
  const inner = header.querySelector('.header-inner');
  if (inner) inner.classList.remove('before-unlock');
}

// Gooey開始の多重起動防止
window.__gooeyStarted = false;

// Gooey テキストモーフィング
function gooeyTextAnimation() {
  if (window.__gooeyStarted) return;
  window.__gooeyStarted = true;
  const heroTitle = document.getElementById('hero-title');
  const text1 = document.getElementById('text1');
  const text2 = document.getElementById('text2');
  if (!heroTitle || !text1 || !text2) return;
  const wrapper = heroTitle.querySelector('.gooey-wrapper');
  const texts = ["making", "with", "JU.", "making with JU."];
  const MAX_MORPH_BLUR = 45;
  text1.textContent = texts[0];
  text2.textContent = texts[0];
  heroTitle.classList.add('is-visible');
  setTimeout(()=> {
    if (wrapper) { wrapper.style.filter = 'url(#threshold)'; }
    heroTitle.classList.add('gooey-on');
  }, 180);
  const morphTime = 1.5;
  const cooldownTime = 0.25;
  const initialHold = 0.9;
  let idx = 0;
  let time = new Date();
  let morph = 0;
  let cooldown = cooldownTime;
  let hold = initialHold;
  let startedMorph = false;
  let rafId;

  const setMorph = (fraction) => {
    fraction = Math.max(0, Math.min(1, fraction));
    const eased = Math.min(MAX_MORPH_BLUR, Math.max(0, (8 / fraction) - 8));
    const blurValue = `blur(${eased}px)`;
    text2.style.filter = blurValue;
    text2.style.webkitFilter = blurValue;
    text2.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`;
    const inv = 1 - fraction;
    const easedInv = Math.min(MAX_MORPH_BLUR, Math.max(0, (8 / inv) - 8));
    const blurValueInv = `blur(${easedInv}px)`;
    text1.style.filter = blurValueInv;
    text1.style.webkitFilter = blurValueInv;
    text1.style.opacity = `${Math.pow(inv, 0.4) * 100}%`;
  };

  const doCooldown = () => {
    morph = 0;
    text2.style.filter = '';
    text2.style.webkitFilter = '';
    text1.style.filter = '';
    text1.style.webkitFilter = '';
    text2.style.opacity = '100%';
    text1.style.opacity = '0%';
  };

  const doMorph = () => {
    morph -= cooldown;
    cooldown = 0;
    let fraction = morph / morphTime;
    if (fraction > 1) {
      cooldown = cooldownTime;
      fraction = 1;
    }
    setMorph(fraction);
  };

  const showFinal = () => {
    cancelAnimationFrame(rafId);
    text1.textContent = 'making with JU.';
    text2.textContent = 'making with JU.';
    try { text1.removeAttribute('dir'); text2.removeAttribute('dir'); text1.removeAttribute('lang'); text2.removeAttribute('lang'); } catch(_){}
    text1.style.opacity = '100%';
    text2.style.opacity = '100%';
    text1.style.filter = '';
    text1.style.webkitFilter = '';
    text2.style.filter = '';
    text2.style.webkitFilter = '';
    if (wrapper) {
      wrapper.style.filter = 'url(#threshold)';
    }
    heroTitle.classList.add('gooey-on');
  };

  function animate() {
    rafId = requestAnimationFrame(animate);
    const now = new Date();
    const dt = (now.getTime() - time.getTime()) / 1000;
    time = now;
    if (!startedMorph && hold > 0) {
      hold -= dt;
      text1.style.opacity = '100%';
      text2.style.opacity = '100%';
      text1.style.filter = '';
      text2.style.filter = '';
      return;
    }
    if (!startedMorph) {
      text1.textContent = texts[0];
      text2.textContent = texts[1];
      startedMorph = true;
      cooldown = 0;
    }
    const shouldInc = cooldown > 0;
    cooldown -= dt;

    if (cooldown <= 0) {
      if (shouldInc) {
        idx++;
        if (idx >= texts.length - 1) {
          showFinal();
          return;
        }
        text1.textContent = texts[idx];
        text2.textContent = texts[idx + 1];
      }
      doMorph();
    } else {
      doCooldown();
    }
  }
  animate();
}

// セクションのフェードイン
(function scrollAnimation() {
  if (document.documentElement.classList.contains('is-touch-device')) {
    return;
  }
  // Section-level: add is-inview to scroll panels for reliable child reveals
  const panels = document.querySelectorAll('.scroll-panel');
  const panObs = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-inview');
      obs.unobserve(e.target);
    });
  }, { threshold: 0.35, rootMargin: '0px 0px -40% 0px' });
  panels.forEach(p => panObs.observe(p));

  // Element-level: fine grained reveal for elements outside panels (fallback)
  const animatedElements = Array.prototype.filter.call(
    document.querySelectorAll(
      '.section, .gs-card, .gs-work-card, .gs-feature-card,' +
      ' .ju-design__eyebrow, .ju-design__text,' +
      ' .ju-policy .ju-acc__btn .ttl, .ju-policy .ju-acc__text, .ju-policy figure, .ju-policy img'
    ),
    el => !el.matches('[data-ju-slide="heading"]')
  );
  const elObs = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); obs.unobserve(entry.target); } });
  }, { threshold: 0.35, rootMargin: '0px 0px -40% 0px' });
  animatedElements.forEach(el => elObs.observe(el));
})();

// Story 3D: GLB を右スペースに、スクロールで入場＋回転
(function story3D(){
  // Storyセクション専用（ヒーローは face3d.umd.js が担当）
  const mount = document.getElementById('story-3d');
  if (!mount) return;
  const log = (...a)=>{ };
  log('init');

  // タッチデバイスの場合は3Dアニメーションを無効化
  const isTouch = isTrueTouchDevice();
  if (isTouch) {
    if (mount) {
      mount.style.backgroundColor = '#000'; // フォールバックとして黒い背景色を設定
    }
    return;
  }

  function ensureThree(next){
    function add(src, cb){
      var s=document.createElement('script');
      s.src=src;
      s.onload=cb||null;
      s.onerror=cb||null;
      document.head.appendChild(s);
    }

    function ensureLoaders(){
      var hasThree = !!window.THREE;
      var hasGLTF = hasThree && !!window.THREE.GLTFLoader;
      var hasDRACO = hasThree && !!window.THREE.DRACOLoader;
      if (!hasThree) return;
      // GLTF / DRACO が揃っていなければ順次ロード
      if (!hasGLTF){
        add('assets/libs/GLTFLoader.js', ensureLoaders);
        return;
      }
      if (!hasDRACO){
        add('assets/libs/DRACOLoader.js', function(){
          // Meshopt は任意（存在すれば使う）
          add('assets/libs/meshopt_decoder.js', ensureLoaders);
        });
        return;
      }
      // ここまで来たら Three + Loader 完備
      next();
    }

    // グローバルローダがあればそれを利用（複数箇所からのロードを一本化）
    if (typeof window.juEnsureThree === 'function'){
      window.juEnsureThree(ensureLoaders);
    } else if (window.THREE){
      ensureLoaders();
    } else {
      // フォールバック: 自前で Three をロード
      add('assets/libs/three-0.128.0.min.js', ensureLoaders);
    }
  }

  ensureThree(init);

  function init(){
    const THREE = window.THREE;
    log('three ready', !!THREE);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    renderer.setClearColor(0x000000, 0); // 透明（枠が見えない）
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.physicallyCorrectLights = true;
    mount.appendChild(renderer.domElement);
    // デバッグ枠は無効化
    // Canvas要素が枠いっぱいになるように
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
    camera.position.set(0, 0.18, 3.0);

    // 自然光: 柔らかい空光＋地面反射、やや弱めの直射
    const hemi = new THREE.HemisphereLight(0xffffff, 0x111111, 1.1);
    scene.add(hemi);
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(2.2, 3.2, 2.2);
    dir.castShadow = false;
    scene.add(dir);

    // GLB 読み込み
    const loader = new THREE.GLTFLoader();
    // Draco / Meshopt 対応
    try {
      const draco = new THREE.DRACOLoader();
      draco.setDecoderPath('libs/draco/');
      loader.setDRACOLoader(draco);
    } catch(_){}
    try {
      if (window.MeshoptDecoder) loader.setMeshoptDecoder(window.MeshoptDecoder);
    } catch(_){}
    let model, pivot = new THREE.Group();
    scene.add(pivot);
    loader.load('assets/images/test3Dface_patched.glb', (gltf)=>{
      model = gltf.scene;
      log('glb loaded');
      model.traverse(n=>{
        if(n.isMesh){
          n.castShadow=false; n.receiveShadow=false;
          if(n.material){ n.material.needsUpdate = true; }
        }
      });
      // サイズ合わせ（基準スケールを保存）
      let box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3(); box.getSize(size);
      const targetH = 1.2; // 基準高さ（=100%）
      const baseScale = targetH / (size.y || 1);
      model.userData.baseScale = baseScale;
      model.scale.setScalar(baseScale); // モデル自体の基準スケール
      // スケール反映後に再度中心を取得して原点へ
      box = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3(); box.getCenter(center);
      model.position.sub(center);
      pivot.add(model);
      // 初期はpivotを画面外に置く（Zも手前から飛び込む）
      pivot.position.set(3.0, 0.8, 1.2);
      pivot.rotation.set(0.12, Math.PI*0.9, 0);
    }, undefined, (err)=>{
      try { console.error('GLB load error:', err); } catch(_){ }
      // フォールバック: 簡易ボールを表示
      try {
        const geo = new THREE.SphereGeometry(0.6, 32, 32);
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.2 });
        model = new THREE.Mesh(geo, mat);
        model.userData.baseScale = 1;
        pivot.add(model);
      } catch(_){}
    });

    function resize(){
      const w = Math.max(1, mount.clientWidth || 400);
      const h = Math.max(1, mount.clientHeight || 300);
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      log('resize', w, h);
    }
    resize();
    window.addEventListener('resize', resize);

    // スクロール進捗: セクション中央基準で入場→所定位置に着地
  const section = document.getElementById('story');
  const landingTrigger = document.getElementById('contact-apology');
  let progress = 0; // 0..1
  const distanceMultiplier = 100; // スクロール距離を大きくする（ビューポート100個分）
  function updateProgress(){
    if (!section) return;
    const vh = window.innerHeight || 1;
    const scrollTop = (window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0);
    const rect = section.getBoundingClientRect();
    const absoluteTop = rect.top + scrollTop;
    const startScroll = absoluteTop - vh * 0.8;
    const endScroll = startScroll + vh * distanceMultiplier;
    const centerScroll = scrollTop + vh * 0.5;
    const raw = (centerScroll - startScroll) / (endScroll - startScroll);
    progress = Math.max(0, Math.min(1, raw));
  }
    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });

    // 目標位置（テキストの横）
    // 全画面キャンバス前提: 右外から入り、テキスト横（中央やや右）に着地
  const targetPos = new THREE.Vector3(0.9, 0.05, 0.4);
  const offPos = new THREE.Vector3(3.0, 0.8, 0.9);
  const landingTargetPos = new THREE.Vector3(0.38, -2.25, 0.6);
  const landingTempVec = new THREE.Vector3();
  const landingTargetScale = 0.32;
  const landingBounceHeight = 0.32;
  const landingDurationSec = 4.6;
  let landingStartTime = null;
  let landingInitialState = null;
  let tClock = 0;

    function easeOutCubic(x){ return 1 - Math.pow(1 - x, 3); }

    camera.lookAt(0,0,0);

    let rafId = 0;
    let active = true;
    function render(){
      if (!active) { rafId = 0; return; }
      rafId = requestAnimationFrame(render);
      if (model){
        const now = performance.now ? performance.now() : Date.now();
        if (!landingStartTime){
          const e = easeOutCubic(progress); // 元のイージングに戻す
          pivot.position.lerpVectors(offPos, targetPos, e);
          const s = 1 - 0.5 * e;
          pivot.scale.setScalar(s);
          tClock += 0.0035;
          pivot.rotation.y += 0.003 + (1-e)*0.0045;
          pivot.rotation.x = 0.10 + Math.sin(tClock)*0.016;
        } else {
          const elapsed = Math.min((now - landingStartTime) / 1000, landingDurationSec);
          const ratio = Math.min(elapsed / landingDurationSec, 1);
          const ease = easeOutCubic(ratio);
          landingTempVec.lerpVectors(landingInitialState.position, landingTargetPos, ease);
          let bounceY = 0;
          if (ratio > 0.55){
            const bouncePhase = Math.min((ratio - 0.55) / 0.45, 1);
            bounceY = Math.sin(bouncePhase * Math.PI) * landingBounceHeight * (1 - bouncePhase);
          }
          pivot.position.copy(landingTempVec);
          pivot.position.y += bounceY;
          const s = THREE.MathUtils.lerp(landingInitialState.scale, landingTargetScale, ease);
          pivot.scale.setScalar(s);
          tClock += 0.0025;
          const spinDamp = ratio < 1 ? (0.002 + (1 - ease) * 0.0032) : 0.0008;
          pivot.rotation.y += spinDamp;
          pivot.rotation.x = 0.08 + Math.sin(tClock)*0.012 * (1 - ratio * 0.6);
        }
      }
      renderer.render(scene, camera);
    }
    render();

    // Stop the rAF loop when this section is off-screen (no visual change while hidden).
    const vis = new IntersectionObserver((entries)=>{
      const on = entries.some(e => e.isIntersecting);
      if (on){
        if (!active){
          active = true;
          if (!rafId) render();
        }
      } else {
        active = false;
        if (rafId){ try{ cancelAnimationFrame(rafId); }catch(_){ } rafId = 0; }
      }
    }, { threshold: 0.01, rootMargin: '200px 0px 200px 0px' });
    vis.observe(mount);

    function beginLanding(){
      if (landingStartTime || !model) return;
      landingStartTime = performance.now ? performance.now() : Date.now();
      landingInitialState = {
        position: pivot.position.clone(),
        scale: pivot.scale.x
      };
    }

    if (landingTrigger){
      const landingObserver = new IntersectionObserver((entries)=>{
        for (const entry of entries){
          if (entry.isIntersecting){
            beginLanding();
            break;
          }
        }
      }, { threshold: 0.4, rootMargin: '0px 0px -30% 0px' });
      landingObserver.observe(landingTrigger);
    }
  }
})();


// === Reveal & Fix: Site notice band and footer on contact/apology center ===
(function(){
  function bindFooterAndNoticeOnContact(){
  function updateNoticeHeight(){
    const band = document.querySelector('#site-notice .band');
    const h = band ? band.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--notice-h', (h||0) + 'px');
  }
  function showFooters(){
    const notice = document.getElementById('site-notice');
    const footer = document.querySelector('footer');
    if (notice){ notice.classList.add('is-fixed'); }
    if (footer){ footer.classList.add('is-fixed'); }
    requestAnimationFrame(()=>{
      if (notice){ notice.classList.add('is-visible'); }
      if (footer){ footer.classList.add('is-visible'); }
      updateNoticeHeight();
    });
  }
  let revealed = false;
  function onReveal(){
    if (revealed) return;
    revealed = true;
    showFooters();
  }
  // 中央帯（上下40%を除いた中央20%付近）にターゲットが入ったら一度だけ表示
  const targets = [
    document.getElementById('contact-form-1'),
    document.getElementById('contact-apology')
  ].filter(Boolean);
  if (targets.length){
    const io = new IntersectionObserver((entries)=>{
      for (const e of entries){
        if (!e.isIntersecting) continue;
        // 100vh級のstickyセクションでも確実に発火させる
        onReveal(); io.disconnect(); break;
      }
    }, { root: null, threshold: 0, rootMargin: '-45% 0% -45% 0%' });
    targets.forEach(t => io.observe(t));
    // 追加の保険: ビューポート中央が対象セクション内に入ったかを手動判定
    function checkCenter(){
      if (revealed) return;
      const cy = window.innerHeight * 0.5;
      for (const t of targets){
        const r = t.getBoundingClientRect();
        if (r.top <= cy && r.bottom >= cy){ onReveal(); break; }
      }
    }
    window.addEventListener('scroll', checkCenter, { passive: true });
    window.addEventListener('resize', checkCenter);
  } else {
    // フォールバック：スクロール末尾付近で表示
    window.addEventListener('scroll', function(){
      if (revealed) return;
      const max = document.documentElement.scrollHeight - innerHeight;
      if (max > 0 && scrollY > max * 0.85) onReveal();
    }, { passive: true });
  }
  // リサイズで高さ再計算
  window.addEventListener('resize', updateNoticeHeight);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindFooterAndNoticeOnContact);
  else bindFooterAndNoticeOnContact();
})();

// --- Hero 2 video fit ---
(function(){
  function ready(fn){
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', fn, { once:true });
    } else {
      fn();
    }
  }
  function fit(){
    var hero = document.getElementById('hero-2');
    if (!hero) return;
    var iframe = hero.querySelector('.hero-video iframe');
    if (!iframe) return;
    var vw = window.innerWidth || document.documentElement.clientWidth || hero.clientWidth || 0;
    var vh = window.innerHeight || document.documentElement.clientHeight || hero.clientHeight || 0;
    if (!vw || !vh) return;
    var ratio = 16 / 9;
    var width, height;
    var isTouch =
      ('ontouchstart' in window) ||
      (navigator.maxTouchPoints > 0) ||
      (!!window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    var isLandscape = !!window.matchMedia && window.matchMedia('(orientation: landscape)').matches;
    var isTabletLike = Math.min(vw, vh) >= 600;
    var useCover = (!isTouch) || (isTouch && isLandscape && isTabletLike);

    if (!useCover) {
      // Touch/iPad: prioritize "contain-ish" so the full frame is mostly visible (avoid aggressive cropping).
      if (vw / vh > ratio){
        height = vh;
        width  = vh * ratio;
      } else {
        width  = vw;
        height = vw / ratio;
      }
    } else {
      // Desktop & tablet-landscape: "cover" so the background fills edge-to-edge (avoid pillarbox black bars).
      if (vw / vh > ratio){
        width  = vw;
        height = vw / ratio;
      } else {
        height = vh;
        width  = vh * ratio;
      }
    }

    // Slight overscan to avoid 1px gaps from rounding / transforms.
    var overscan = 1.04; // ~4% enlargement (crop only a few % at edges)
    width  *= overscan;
    height *= overscan;

    iframe.style.width  = width  + 'px';
    iframe.style.height = height + 'px';
  }
  ready(function(){
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
  });
})();

// === JU helper: enable A/B/C modes from console (default OFF) ===
// Removed previous experimental sticky/overlay implementations
