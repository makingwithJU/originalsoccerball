'use strict';

// One reversible timeline. No elapsed time, direction flags or input capture.
((scope) => {
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  function transition(value) {
    const t = clamp(value);
    // The incoming page is revealed by the ring aperture, not a whole-page fade.
    const out = ease(t / .50);
    const incoming = t >= .66 ? 1 : 0;
    return {
      outgoingOpacity: 1 - out, incomingOpacity: incoming,
      spiralOpacity: out * (1 - ease((t - .84) / .16)),
      ready: t === 1,
    };
  }
  function portal(value, width, height) {
    const t = clamp(value);
    // At time=49 the original field forms the reference rainbow rings (at 50
    // their colour almost disappears). Magnify the
    // field and its central opening together, never as independent circles.
    const innerRadius = height * .10;
    const cornerRadius = Math.hypot(width, height) / 2 + height * .04;
    // One expansion curve, shared by the rainbow coordinates and the aperture.
    // Previously two separately eased ramps multiplied their acceleration.
    const expansion = ease((t - .66) / .34);
    const radius = cornerRadius * expansion;
    const scale = 1 + (cornerRadius / innerRadius - 1) * expansion;
    const opening = radius / (innerRadius * scale);
    return {
      time: 49 * ease(t / .66), scale,
      opening,
      radius,
      revealed: clamp(Math.PI * radius ** 2 / (width * height)),
    };
  }
  function state(scene, y) {
    const local = y - scene.start;
    return {
      animation: scene.animation > 0 ? clamp(local / scene.animation) : 1,
      read: Math.max(0, Math.min(scene.overflow, local - scene.animation)),
      transition: scene.transition > 0 ? clamp((local - scene.animation - scene.overflow - scene.hold) / scene.transition) : 0,
    };
  }
  const api = { clamp, ease, transition, portal, state };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.JUSceneMath = api;
})(globalThis);
