(function(){
  // タッチデバイスの場合はカーソル関連の処理を無効化
  if (document.documentElement.classList.contains('is-touch-device')) {
    return;
  }
  const NO = 'none';
  const apply = el => { try { el.style.setProperty('cursor', NO, 'important'); } catch(e){} };
  const wipe  = el => {
    if (el && el.style && el.style.cursor && el.style.cursor !== NO) {
      el.style.setProperty('cursor', NO, 'important');
    }
  };
  apply(document.documentElement);
  apply(document.body);

  // 既存ノードの inline cursor を一掃
  const scan = root => {
    const all = root.querySelectorAll('*');
    for (let i=0; i<all.length; i++) wipe(all[i]);
  };
  scan(document);

  // 以後の変化も監視して徹底的に none に固定
  const mo = new MutationObserver(muts=>{
    for (const m of muts){
      if (m.type === 'attributes' && m.attributeName === 'style') {
        wipe(m.target);
      } else if (m.type === 'childList') {
        m.addedNodes.forEach(node=>{
          if (node.nodeType === 1) { wipe(node); scan(node); }
        });
      }
    }
  });
  mo.observe(document.documentElement, {subtree:true, childList:true, attributes:true, attributeFilter:['style']});
})();
