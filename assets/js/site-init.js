// Shared site initialization helpers (kept layout-neutral)
(function(){
  if (typeof window === 'undefined') return;
  var JU = window.JU = window.JU || {};

  JU.CONFIG = JU.CONFIG || {
    // Placeholder for future centralized versioning; static HTML currently hardcodes query strings.
    versions: {}
  };
  JU.CONFIG.youtube = JU.CONFIG.youtube || {
    mobilePrimary: { idPrefix: 'ju-yt-m-', autoplayDelayMs: 350, sendListeningEvent: true },
    mobileFooter: { idPrefix: 'ju-yt-mobile-', autoplayDelayMs: 250, sendListeningEvent: false },
    pc: { idPrefix: 'ju-yt-', autoplayDelayMs: 350, sendListeningEvent: true }
  };
  JU.CONFIG.hero = JU.CONFIG.hero || {
    videoId: 'hero-video'
  };

  JU.updateHeaderHeightVar = function updateHeaderHeightVar(){
    try{
      var header = document.querySelector('.site-header');
      if (!header) return { ok:false };
      var h = header.getBoundingClientRect ? header.getBoundingClientRect().height : header.offsetHeight;
      if (!h || !isFinite(h)) return { ok:false };
      document.documentElement.style.setProperty('--ju-header-h', Math.round(h) + 'px');
      return { ok:true, height:h };
    }catch(_){
      return { ok:false };
    }
  };

  function ensureSet(obj, key, value){
    if (!Object.prototype.hasOwnProperty.call(obj, key)) obj[key] = value;
    return obj[key];
  }

  function onReady(fn){
    try{
      if (document.readyState !== 'loading') fn();
      else document.addEventListener('DOMContentLoaded', fn, { once:true });
    }catch(_){ }
  }

  JU.initHeroVideoAutoplay = function initHeroVideoAutoplay(opts){
    opts = opts || {};
    var id = opts.id || 'hero-video';
    var video;
    try{ video = document.getElementById(id); }catch(_){ video = null; }
    if (!video) return { ok:false, reason:'missing' };

    function prime(){
      try{
        video.setAttribute('muted', 'muted');
        video.muted = true;
        video.defaultMuted = true;
        video.volume = 0;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('autoplay', '');
        video.autoplay = true;
        video.setAttribute('preload', 'auto');
        try{ if (video.readyState < 2) video.load(); }catch(_){ }
      }catch(_){ }
    }

    function requestPlay(fromUser){
      var user = !!fromUser;
      try{
        if (typeof video.__juTryPlay === 'function'){
          if (!user && video.dataset && video.dataset.autoplayState === 'blocked') return;
          video.__juTryPlay(user);
          return;
        }
      }catch(_){ }
      if (!user) return;
      try{ video.play(); }catch(_){ }
    }

    prime();
    onReady(function(){ requestPlay(false); });

    document.addEventListener('visibilitychange', function(){
      try{
        if (!document.hidden && video.paused) requestPlay(false);
      }catch(_){ }
    });
    document.addEventListener('pointerdown', function(){ requestPlay(true); }, { once:true, passive:true });
    document.addEventListener('keydown', function(){ requestPlay(true); }, { once:true });

    return { ok:true };
  };

  JU.initYouTubeEmbeds = function initYouTubeEmbeds(opts){
    opts = opts || {};
    var selector = opts.selector || 'iframe[src*="youtube.com/embed/"]';
    var idPrefix = opts.idPrefix || 'ju-yt-';
    var markAttr = opts.markAttr || 'data-ju-yt-init';
    var setOrigin = opts.setOrigin !== false;
    var autoplayDelayMs = typeof opts.autoplayDelayMs === 'number' ? opts.autoplayDelayMs : 350;
    var autoplayOnLoad = opts.autoplayOnLoad !== false;
    var autoplayOnUser = opts.autoplayOnUser !== false;
    var muteOnStart = opts.muteOnStart !== false;
    var sendListeningEvent = opts.sendListeningEvent === true;

    var frames;
    try{
      frames = Array.prototype.slice.call(document.querySelectorAll(selector));
    }catch(_){
      frames = [];
    }
    frames.forEach(function(iframe, idx){
      try{
        if (!iframe || iframe.getAttribute(markAttr) === '1') return;
        iframe.setAttribute(markAttr, '1');

        try{
          var url = new URL(iframe.src, location.href);
          if (!url.searchParams.has('playsinline')) url.searchParams.set('playsinline', '1');
          if (!url.searchParams.has('mute')) url.searchParams.set('mute', '1');
          if (!url.searchParams.has('autoplay')) url.searchParams.set('autoplay', '1');
          if (setOrigin && location && location.origin && location.origin !== 'null') {
            url.searchParams.set('origin', location.origin);
          }
          iframe.src = url.toString();
        }catch(_){ }

        var allow = new Set((iframe.getAttribute('allow') || '').split(';').map(function(s){ return s.trim(); }).filter(Boolean));
        ['autoplay', 'fullscreen', 'picture-in-picture'].forEach(function(flag){ allow.add(flag); });
        iframe.setAttribute('allow', Array.from(allow).join('; '));
        if (!iframe.hasAttribute('referrerpolicy')) iframe.setAttribute('referrerpolicy', 'origin-when-cross-origin');
        iframe.setAttribute('playsinline', '');

        var id = iframe.id || (idPrefix + String(idx));
        iframe.id = id;

        var post = function(payload){
          try{
            if (iframe.contentWindow){
              iframe.contentWindow.postMessage(JSON.stringify(payload), '*');
            }
          }catch(_){ }
        };

        var didTrigger = false;
        var triggerPlay = function(){
          if (didTrigger) return;
          didTrigger = true;
          if (sendListeningEvent) post({ event:'listening', id:id });
          if (muteOnStart) post({ event:'command', func:'mute', args:[], id:id });
          post({ event:'command', func:'playVideo', args:[], id:id });
        };

        if (autoplayOnLoad){
          iframe.addEventListener('load', function(){ setTimeout(triggerPlay, autoplayDelayMs); }, { once:true });
          // In case the iframe load event already fired before handlers were attached.
          setTimeout(triggerPlay, autoplayDelayMs);
        }
        if (autoplayOnUser){
          document.addEventListener('pointerdown', triggerPlay, { once:true, passive:true });
          document.addEventListener('keydown', triggerPlay, { once:true });
        }
      }catch(_){ }
    });

    return { count: frames.length };
  };

  // Minimal queue so inline scripts can register init work without depending on load order.
  var q = ensureSet(window, 'JUQ', []);
  if (Array.isArray(q) && q.length){
    try{
      q.splice(0).forEach(function(fn){ try{ fn(JU); }catch(_){ } });
    }catch(_){ }
  }

  // Keep CSS variable for sticky header height in sync for section layout fixes.
  onReady(function(){
    try{ JU.updateHeaderHeightVar(); }catch(_){ }
    window.addEventListener('resize', function(){ try{ JU.updateHeaderHeightVar(); }catch(_){ } });
  });
})();
