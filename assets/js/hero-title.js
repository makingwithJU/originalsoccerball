'use strict';
(() => {
  const texts = ['making', 'with', 'JU.', 'making with JU.'];
  const starts = [.03,.14,.28].map(value=>value*1.15), ends = [.12,.24,.40].map(value=>value*1.15);
  const first = document.querySelector('#text1'), second = document.querySelector('#text2');
  const wrapper = document.querySelector('.gooey-wrapper');
  wrapper.style.filter = 'url(#threshold)';
  window.updateGooeyScroll = progress => {
    let index = 0;
    while (index < 3 && progress >= ends[index]) index++;
    if (index === 3) {
      // The settled heading needs no threshold pass (or offscreen filter surface).
      wrapper.style.filter = 'none';
      first.textContent = second.textContent = texts[3];
      first.style.opacity = '0'; second.style.opacity = '1';
      first.style.filter = second.style.filter = 'none';
      first.style.letterSpacing = second.style.letterSpacing = '';
      return;
    }
    wrapper.style.filter = 'url(#threshold)';
    const f = Math.max(0,Math.min(1,(progress-starts[index])/(ends[index]-starts[index])));
    first.textContent = texts[index]; second.textContent = texts[index+1];
    first.style.filter='blur('+Math.min(45,8/Math.max(.001,1-f)-8)+'px)';
    second.style.filter='blur('+Math.min(45,8/Math.max(.001,f)-8)+'px)';
    first.style.opacity=String(Math.pow(1-f,.4));second.style.opacity=String(Math.pow(f,.4));
  };
})();
