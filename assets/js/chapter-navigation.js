'use strict';

// Finite, forward-only boundary pauses. Never correct scroll backwards.
// Normal reading, nested controls, reverse gestures and direct navigation stay native.
(() => {
  const root = document.documentElement;
  // Site-wide slow chapter pausing is intentionally disabled while the motion
  // pass is still being built. In fast/build mode all wheel/touch input stays
  // native; switching stages.js back to slow re-enables this finite behavior.
  if (root.dataset.motionBuild !== 'slow' || !window.gsap) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const completed = new Set();
  let hold = null, tween = null, timer = 0, touchY = null, touchCaptured = false;
  function blocks() {
    return [document.querySelector('#hero-scroll-zone'), ...document.querySelectorAll('.chapter-stage')].filter(Boolean);
  }
  function candidates() {
    const list=blocks(), y=scrollY;
    return list.slice(0,-1).map((stage,i)=>({
      stage, section:stage.querySelector(':scope > .chapter'), next:list[i+1],
      end:y+stage.getBoundingClientRect().bottom-innerHeight
    }));
  }
  function ready(item) {
    if (item.stage.id==='hero-scroll-zone') return Number(root.style.getPropertyValue('--hero-progress'))>=.94;
    const section=item.section;
    if (section.dataset.motionReady!=='true') return false;
    if (['usage-title','event-shop-title'].includes(section.id) && section.dataset.galleryMode==='codrops-cylinder') return section.dataset.galleryReady==='true';
    return !section.querySelector('.unroll-source');
  }
  function cancel(markComplete=false) {
    clearTimeout(timer); timer=0;
    if (hold && markComplete) completed.add(hold.stage);
    hold=null;
    tween?.kill(); tween=null;
    delete root.dataset.chapterHold;
    delete root.dataset.chapterTransition;
  }
  function advance(item) {
    completed.add(item.stage);
    const target=Math.min(document.documentElement.scrollHeight-innerHeight,scrollY+item.next.getBoundingClientRect().top);
    if (target<=scrollY) { cancel(); return; }
    hold=null; delete root.dataset.chapterHold;
    root.dataset.chapterTransition='forward';
    const position={y:scrollY};
    tween=gsap.to(position,{y:target,duration:1.7,ease:'power1.inOut',onUpdate:()=>{scrollTo(0,position.y);document.dispatchEvent(new Event('jugend:scroll-frame'));},onComplete:()=>{tween=null;delete root.dataset.chapterTransition;}});
  }
  function waitAtEnd(item) {
    hold=item; item.readyAt=null;
    root.dataset.chapterHold='finishing';
    function check() {
      if (hold!==item) return;
      if (!ready(item)) { timer=setTimeout(check,32); return; }
      if (item.readyAt===null) item.readyAt=performance.now();
      root.dataset.chapterHold='rest';
      if (performance.now()-item.readyAt>=800) { advance(item); return; }
      timer=setTimeout(check,32);
    }
    check();
  }
  function excluded(target) {
    if (target?.closest?.('input,textarea,select,button,a,iframe,dialog,[contenteditable="true"]')) return true;
    for(let el=target;el&&el!==document.body;el=el.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+2) return true;
    }
    return false;
  }
  function move(event,delta) {
    if (reduced.matches || excluded(event.target) || !delta) return;
    if (delta < 0) {
      const wasHeld = Boolean(hold);
      cancel();
      // Consume a held gesture exactly once; never change the root scroll container.
      if (wasHeld) { event.preventDefault(); scrollTo(0, scrollY + delta); }
      return;
    }
    if (hold || tween) { event.preventDefault(); return; }
    // Reset a completed visit once the user has gone back above that chapter.
    for(const stage of completed) if(stage.getBoundingClientRect().top>innerHeight) completed.delete(stage);
    const item=candidates().find(item=>!completed.has(item.stage)&&scrollY<=item.end+2&&scrollY+delta>=item.end);
    if(!item) return;
    event.preventDefault();
    // This only consumes the forward part of the user's current gesture.
    if(item.end>scrollY) scrollTo(0,item.end);
    waitAtEnd(item);
  }
  addEventListener('wheel',event=>{
    if(event.ctrlKey||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
    move(event,event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1));
  },{passive:false});
  addEventListener('touchstart', event => {
    if (tween) cancel();
    touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
    // Claim the gesture before the compositor starts native scrolling near a
    // boundary. Cancelling a touchmove after native scrolling began is too late.
    touchCaptured = touchY !== null && !reduced.matches && !excluded(event.target) &&
      (Boolean(hold) || candidates().some(item => !completed.has(item.stage) &&
        item.end >= scrollY && item.end - scrollY <= innerHeight));
    if (touchCaptured) event.preventDefault();
  }, {passive:false});
  addEventListener('touchmove', event => {
    // A native gesture stays native until touchend: taking it over halfway
    // through conflicts with WebKit's asynchronous momentum scrolling.
    if (!touchCaptured || touchY === null || event.touches.length !== 1) return;
    const next = event.touches[0].clientY, delta = touchY - next;
    touchY = next;
    move(event, delta);
    if (touchCaptured) {
      if (!event.defaultPrevented) scrollTo(0, scrollY + delta);
      event.preventDefault();
    }
  }, {passive:false});
  addEventListener('touchend', () => { touchY = null; touchCaptured = false; }, {passive:true});
  addEventListener('touchcancel', () => { touchY = null; touchCaptured = false; cancel(); }, {passive:true});
  addEventListener('keydown',event=>{
    if(['Escape','Home','End','PageUp','ArrowUp'].includes(event.key)){cancel(true);return;}
    if(['PageDown','ArrowDown',' '].includes(event.key))move(event,event.key==='ArrowDown'?40:innerHeight*.9);
  });
  addEventListener('pointerdown', event => {
    if (tween || (hold && excluded(event.target))) cancel(true);
  }, {passive:true});
  for(const type of ['resize','hashchange','pagehide'])addEventListener(type,()=>cancel(),{passive:true});
  reduced.addEventListener('change',()=>cancel());
})();
