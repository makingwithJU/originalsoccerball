(function(){
  if (typeof window === 'undefined') return;

  function prepareImage(img){
    if (!img || img.dataset.lazyPrepared === '1') return;
    img.dataset.lazyPrepared = '1';
    if (!img.hasAttribute('loading')) {
      img.setAttribute('loading', 'lazy');
    }
    if (!img.hasAttribute('decoding')) {
      img.setAttribute('decoding', 'async');
    }
    if (!img.hasAttribute('fetchpriority')) {
      img.setAttribute('fetchpriority', 'low');
    }
    if (!img.getAttribute('alt')) {
      img.setAttribute('alt', img.getAttribute('data-alt') || '');
    }
    var setSize = function(){
      if (img.naturalWidth && img.naturalHeight) {
        if (!img.getAttribute('width')) img.setAttribute('width', img.naturalWidth);
        if (!img.getAttribute('height')) img.setAttribute('height', img.naturalHeight);
      }
    };
    if (img.complete) {
      setSize();
    } else {
      img.addEventListener('load', setSize, { once: true });
    }
  }

  function init(){
    var images = Array.prototype.slice.call(document.images || []);
    images.forEach(prepareImage);

    if ('MutationObserver' in window) {
      var mo = new MutationObserver(function(records){
        records.forEach(function(record){
          Array.prototype.slice.call(record.addedNodes || []).forEach(function(node){
            if (node && node.tagName === 'IMG') {
              prepareImage(node);
            } else if (node && node.querySelectorAll) {
              Array.prototype.slice.call(node.querySelectorAll('img')).forEach(prepareImage);
            }
          });
        });
      });
      mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
