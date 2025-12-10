;(function(){
  try{
    function isTabletLike(){
      // UA や pointer ではなく、ビューポートの長辺・短辺からタブレットらしさを判定する
      var w = window.innerWidth || document.documentElement.clientWidth || 0;
      var h = window.innerHeight || document.documentElement.clientHeight || 0;
      if (!w || !h) return false;
      var minSide = Math.min(w, h);
      var maxSide = Math.max(w, h);
      // ざっくり：短辺が600px以上、長辺が1400px以下ならタブレット扱い
      return (minSide >= 600 && maxSide <= 1400);
    }

    if (!isTabletLike()) return;

    function panels(){
      return Array.prototype.slice.call(document.querySelectorAll('.scroll-panel'));
    }

    function applyCentering(){
      var vh = window.innerHeight || document.documentElement.clientHeight || 0;
      var vw = window.innerWidth || document.documentElement.clientWidth || 0;
      if (!vh) return;
      var isLandscape = vw > vh;
      var list = panels();
      if (!list.length) return;

      list.forEach(function(panel){
        var id = panel.id || '';
        var content;

        // Usage / Event セクションは、見出し＋スライダーをまとめてラップして縮小
        if (id === 'usage-title' || id === 'event-shop-title') {
          if (!panel.__ipadWrap) {
            var wrap = document.createElement('div');
            wrap.className = 'ipad-section-wrap';
            while (panel.firstChild) {
              wrap.appendChild(panel.firstChild);
            }
            panel.appendChild(wrap);
            panel.__ipadWrap = wrap;
          }
          content = panel.__ipadWrap;
        } else {
          content = panel.querySelector('.gs-container, .ju-container, .order-gallery__inner') || panel.firstElementChild;
        }

        if (!content) return;

        // 一旦リセット
        panel.style.display = '';
        panel.style.alignItems = '';
        panel.style.justifyContent = '';
        panel.style.paddingTop = '';
        panel.style.paddingBottom = '';
        content.style.transform = '';
        content.style.transformOrigin = '';

        // コンテンツ高さを取得
        var rect = content.getBoundingClientRect();
        var h = rect.height;
        if (!h || !isFinite(h)) return;

        // セクション別のスケール設定
        var baseScale = 0.75;
        var minScale = 0.55;
        if (id === 'order') {
          baseScale = 0.9;
          minScale = 0.8;
        } else if (id === 'usage-title' || id === 'event-shop-title' || id === 'testimonial-event-shop') {
          baseScale = 0.6;
          minScale = 0.5;
        } else if (!isLandscape && id === 'specs') {
          // 縦向きタブレットの「素材〜」はさらに小さく（4枚が画面に収まりやすく）
          baseScale = 0.55;
          minScale = 0.50;
        } else if (!isLandscape && id === 'production-info') {
          // 縦向きタブレットの「Production/Info」セクションも少し縮小
          baseScale = 0.70;
          minScale = 0.60;
        }

        var maxContentHeight = vh * 0.9; // 画面の 90% を上限
        var scale = baseScale;
        if (h * scale > maxContentHeight) {
          scale = Math.min(baseScale, Math.max(minScale, maxContentHeight / h));
        }

        // スケール後の高さから余白計算（基本は中央配置）
        var used = h * scale;
        var free = Math.max(0, vh - used);
        var topSpace = free / 2;
        var bottomSpace = free / 2;

        // 縦位置の微調整（ランドスケープとポートレートで分岐）
        if (isLandscape) {
          if (id === 'story') {
            // HERO直後のセクション：今より少しだけ下げる（中央寄り）
            topSpace = free * 0.35;
            bottomSpace = free - topSpace;
          } else if (id === 'works' || id === 'features' || id === 'faq-slide') {
            // この3つは今の位置のまま（かなり上）
            topSpace = free * 0.05;
            bottomSpace = free - topSpace;
          } else if (id === 'usage-title' || id === 'event-shop-title') {
            // Usage / イベントショップ：上げすぎているので少し下げる
            topSpace = free * 0.15;
            bottomSpace = free - topSpace;
          }
        } else {
          // 縦向き: Story は中央より少し上、Works/Production はさらに上に
          if (id === 'story') {
            // 「つなぐ〜」を中央より少し上へ
            topSpace = free * 0.40;
            bottomSpace = free - topSpace;
          } else if (id === 'works') {
            // 「平面から〜」をもっと上へ（ほぼ画面上寄り）
            topSpace = free * 0.02;
            bottomSpace = free - topSpace;
          } else if (id === 'production-info') {
            // 「生産工場〜」セクションをもっと下へ（中央より下寄り）
            topSpace = free * 0.45;
            bottomSpace = free - topSpace;
          } else if (id === 'policy' || id === 'faq-slide') {
            topSpace = free * 0.30;
            bottomSpace = free - topSpace;
          } else if (id === 'features') {
            // 「私たちがサッカーボール〜」を少しだけ上へ
            topSpace = free * 0.20;
            bottomSpace = free - topSpace;
          } else if (id === 'originalballmaking-accordion') {
            // originalballmaking セクションを少し下げて中央寄りに
            topSpace = free * 0.45;
            bottomSpace = free - topSpace;
          } else if (id === 'contact-apology') {
            // 製造中止セクションは少しだけ上に
            topSpace = free * 0.25;
            bottomSpace = free - topSpace;
          }
          if (id === 'usage-title' || id === 'event-shop-title') {
            // 縦向き Usage / イベントは少しだけ上寄せ
            topSpace = free * 0.22;
            bottomSpace = free - topSpace;
          }
        }

        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        panel.style.alignItems = 'center';
        panel.style.justifyContent = 'center';
        panel.style.paddingTop = topSpace + 'px';
        panel.style.paddingBottom = bottomSpace + 'px';

        // Order は横幅はそのまま、高さだけ調整（縦方向だけ縮小）
        var scaleX = scale;
        var scaleY = scale;
        if (id === 'order') {
          scaleX = 1;
        }

        content.style.transform = 'scale(' + scaleX.toFixed(3) + ',' + scaleY.toFixed(3) + ')';
        content.style.transformOrigin = 'top center';
      });
    }

    var timer;
    function schedule(){
      if (timer) clearTimeout(timer);
      timer = setTimeout(applyCentering, 150);
    }

    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', schedule, { once:true });
    } else {
      schedule();
    }
    window.addEventListener('resize', schedule);
  }catch(_){}
})();
