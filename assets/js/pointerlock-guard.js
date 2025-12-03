/*! pointerlock-guard (reversible) */
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) { try { document.exitPointerLock(); } catch(e){} }
}, {passive:true});
