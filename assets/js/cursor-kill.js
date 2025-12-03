(function(){
  // タッチデバイスの場合はカーソル関連の処理を無効化
  if (document.documentElement.classList.contains('is-touch-device')) {
    return;
  }

  // inline の cursor 指定を徹底除去
  const wipe = el => { try { el.style && el.style.setProperty('cursor','none','important'); } catch(e){} };
  document.querySelectorAll('*[style*="cursor"]').forEach(wipe);

  // 後追いで cursor を付け直すJS/CSSに備えて監視
  const mo = new MutationObserver(muts=>{
    for (const m of muts){
      if (m.type === 'attributes' && m.attributeName === 'style') wipe(m.target);
      if (m.type === 'childList') m.addedNodes.forEach(n=>{
        if (n.nodeType===1){
          if (n.hasAttribute('style')) wipe(n);
          n.querySelectorAll && n.querySelectorAll('*[style*="cursor"]').forEach(wipe);
          if (n.tagName==='IFRAME' && isSameOriginIframe(n)) tryInjectIframe(n);
        }
      });
    }
  });
  mo.observe(document.documentElement, {subtree:true, childList:true, attributes:true, attributeFilter:['style']});

  // 同一オリジンの stylesheet に含まれる cursor も none に書き換え
  Array.from(document.styleSheets).forEach(ss=>{
    try {
      Array.from(ss.cssRules||[]).forEach(rule=>{
        if (rule.style && rule.style.cursor) rule.style.setProperty('cursor','none','important');
      });
    } catch(e) { /* クロスオリジンは触れない */ }
  });

  // 同一オリジンの iframe にも CSS を注入
  function isSameOriginIframe(node){
    try{
      const src = node.getAttribute && node.getAttribute('src');
      if (!src || src === 'about:blank') return true;
      const url = new URL(src, location.href);
      return url.protocol === location.protocol && url.host === location.host;
    }catch(e){}
    return false;
  }

  function tryInjectIframe(iframe){
    if (!isSameOriginIframe(iframe)) return;
    try{
      const doc = iframe.contentDocument || iframe.contentWindow && iframe.contentWindow.document;
      if (!doc) return;
      const link = doc.createElement('link');
      link.rel='stylesheet';
      link.href = (new URL('/assets/css/cursor-kill.css', location.href)).href;
      (doc.head || doc.documentElement).appendChild(link);
    }catch(e){}
  }
  document.querySelectorAll('iframe').forEach(node => {
    if (isSameOriginIframe(node)) tryInjectIframe(node);
  });

  // rAFやsetIntervalで cursor を再設定するコードに対する定期再固定
  setInterval(()=>{
    wipe(document.documentElement);
    wipe(document.body);
  }, 500);
})();
