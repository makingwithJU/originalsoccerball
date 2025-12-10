;(function(){
  try{
    function isTabletLike(){
      var ua = navigator.userAgent || '';
      var isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      var w = window.innerWidth || document.documentElement.clientWidth || 0;
      var h = window.innerHeight || document.documentElement.clientHeight || 0;
      var isTabletWidth = w >= 768 && w <= 1366;
      var coarse = false;
      try{
        if (window.matchMedia) {
          coarse = window.matchMedia('(pointer:coarse)').matches;
        }
      }catch(_){}
      return (isIPad || (isTabletWidth && coarse));
    }

    if (!isTabletLike()) return;

    function sections(){
      var list = Array.prototype.slice.call(document.querySelectorAll('.gs-section'));
      return list;
    }

    function applyLayout(){
      var secs = sections();
      if (!secs.length) return;
      var vh = window.innerHeight || document.documentElement.clientHeight || 0;
      if (!vh) return;
      var maxContentHeight = vh * 0.8; // 80%を内容、20%を余白に

      secs.forEach(function(sec){
        var content = sec.querySelector('.gs-container, .ju-container') || sec;
        if (!content) return;

        // 一旦リセット
        content.style.transform = '';
        sec.style.display = '';
        sec.style.alignItems = '';
        sec.style.justifyContent = '';
        sec.style.paddingTop = '';
        sec.style.paddingBottom = '';

        var rect = content.getBoundingClientRect();
        var h = rect.height;
        if (!h || !isFinite(h)) return;

        var scale = Math.min(0.9, maxContentHeight / h);

        // セクションを高さ100vh扱いにし、中央配置
        sec.style.display = 'flex';
        sec.style.flexDirection = 'column';
        sec.style.alignItems = 'center';
        sec.style.justifyContent = 'center';

        var used = h * scale;
        var margin = Math.max(0, (vh - used) / 2);
        // 上下に同じ余白（中央寄せ）。下は必ずmargin ≥ 0
        sec.style.paddingTop = margin + 'px';
        sec.style.paddingBottom = margin + 'px';

        content.style.transform = 'scale(' + scale.toFixed(3) + ')';
        content.style.transformOrigin = 'center top';
      });
    }

    var timer;
    function schedule(){
      if (timer) clearTimeout(timer);
      timer = setTimeout(applyLayout, 150);
    }

    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', schedule, { once:true });
    } else {
      schedule();
    }
    window.addEventListener('resize', schedule);
  }catch(_){}
})();

