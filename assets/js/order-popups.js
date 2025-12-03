(function(){
  const root = document.getElementById('order'); if(!root) return;

  // タイトル正規化
  const N = s => (s||'').toLowerCase()
      .replace(/[’`]/g,"'")
      .replace(/\s+/g,' ')
      .trim();

  // 指定のマッピング（元データ準拠）
  const MAP = new Map([
    ['kaleidoscope ball 01','fullcolorballs'],
    ['kaleidoscope ball 02','fullcolorballs'],
    ['bee ball','fullcolorballs'],
    ['face ball','fullcolorballs'],
    ['escher ball','fullcolorballs'],
    ['halloween ball','fullcolorballs'],
    ["benham's disk ball",'fullcolorballs'],
    ['blue marble ball','fullcolorballs'],
    ['fun ball 01','fullcolorballs'],
    ['fun ball 02','fullcolorballs'],
    ['funball 03','fullcolorballs'],
    ['england ball','silkscreenballs'],           // ← fsilkscreenballs は誤記と解釈
    ['brand ball 01','fullcolorballs'],
    ['brand ball 02','fullcolorballs'],
    ['brand ball 03','fullcolorballs'],
    ['brand ball 04','fullcolorballs'],
    ['wedding ball 04','fullcolorballs'],
    ['rainy conditions hi-vis ball','silkscreenballs'],
    ['c140 ball','originalballmaking'],
    ['denim ball','originalballmaking'],
    ['team ball 01','fullcolorballs'],
    ['team ball 02','fullcolorballs'],
    ['team ball 03','fullcolorballs'],
    ['equipment','other'],
    ['tiger shot','fullcolorballs'],
    ['blue marble ball v2','fullcolorballs'],
    ['blue marble ball mascot','fullcolorballs'],
    ['leather ball bag','other'],
  ]);

  // バッジの見た目
  (function injectStyle(){
    if(document.getElementById('order-badge-style')) return;
    const st = document.createElement('style');
    st.id = 'order-badge-style';
    st.textContent = `
      #order .gs-work-image-wrapper{ position:relative; }
      #order .ju-line-badge{
        position:absolute; top:8px; left:8px;
        padding:6px 10px; border-radius:999px;
        font-size:12px; line-height:1; letter-spacing:.02em;
        background:rgba(0,0,0,.78); color:#fff;
        border:1px solid rgba(255,255,255,.24);
        opacity:0; transform:translateY(-6px);
        transition:opacity .35s ease, transform .35s ease;
        pointer-events:none; user-select:none;
      }
      #order .gs-work-card:hover .ju-line-badge{ opacity:1; transform:translateY(0); }
    `;
    document.head.appendChild(st);
  })();

  // カードに付与
  const cards = root.querySelectorAll('.gs-work-card');
  cards.forEach(card=>{
    const title = card.querySelector('.gs-work-title');
    if(!title) return;
    const key = N(title.textContent);
    const group = MAP.get(key);
    if(!group) return;

    // data-*（既存ロジック互換）
    card.setAttribute('data-popup', group);
    card.setAttribute('data-group', group);

    // バッジが無ければ作成
    const wrap = card.querySelector('.gs-work-image-wrapper');
    if(!wrap) return;
    if(!wrap.querySelector('.ju-line-badge')){
      const b = document.createElement('span');
      b.className = 'ju-line-badge ju-line--'+group;
      b.textContent = group;
      wrap.appendChild(b);
    }
  });
})();
