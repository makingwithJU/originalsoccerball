'use strict';

// Adapted from Codrops ScrollSpiral Demo 1 by Xoihazard (2017).
// https://github.com/codrops/ScrollSpiral
// Resource license: https://github.com/codrops/ScrollSpiral#license
// Original field, optical scale and 512px buffer are retained.
// Cinematic 9 intentionally lifts the reference's dark overlay and saturation.
// Scroll scrubs the original clock; there is no independent autoplay loop.
// Only scroll/velocity distortion is removed (both source inputs stay zero).
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer, scene, camera, material, unavailable = false;
  let previousSize = '', desiredOpacity = 0, desiredTransition = 0;
  function stop() {
    if (renderer) renderer.domElement.style.opacity = '0';
  }
  function init() {
    if (renderer || unavailable || reduced.matches) return !!renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
      renderer.setPixelRatio(1);
      renderer.domElement.className = 'spiral-background';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.addEventListener('webglcontextlost', event => {
        event.preventDefault(); unavailable = true; stop();
      });
      document.body.append(renderer.domElement);
      scene = new THREE.Scene();
      camera = new THREE.Camera();
      material = new THREE.ShaderMaterial({
        depthTest: false, depthWrite: false, transparent: true,
        uniforms: { aspect: { value: 1 }, globaltime: { value: 0 }, portalScale: { value: 1 }, opening: { value: 0 }, brightness: { value: .90 }, saturation: { value: 1.20 } },
        vertexShader: `varying vec2 uvPoint; void main(){ uvPoint=uv; gl_Position=vec4(position,1.0); }`,
        fragmentShader: `
          precision highp float;
          varying vec2 uvPoint;
          uniform float aspect;
          uniform float globaltime;
          uniform float portalScale;
          uniform float opening;
          uniform float brightness;
          uniform float saturation;
          const float PI = 3.14159265359;
          vec2 rotate(vec2 v,float a){float c=cos(a),s=sin(a);return v*mat2(c,-s,s,c);}
          vec3 coordToHex(vec2 p,float scale,float a){
            vec2 c=rotate(p,a);
            float q=(sqrt(3.0)*c.x-c.y)*scale/3.0;
            float r=2.0*c.y*scale/3.0;
            return vec3(q,r,-q-r);
          }
          float nsin(float v){return sin(v*2.0*PI)*.5+.5;}
          float calc(vec3 hex,float time,float len){
            float value=0.0;
            for(int i=0;i<3;i++){
              vec3 cell=fract(hex/(1.0+float(i)))*2.0-1.0;
              float field=mix(max(max(abs(cell.x),abs(cell.y)),abs(cell.z)),1.0-length(cell)/sqrt(3.0),nsin(len+time+float(i)/3.0));
              value+=nsin(field*2.0+nsin(time*.5));
            }
            return value/3.0;
          }
          void main(){
            vec2 p=(uvPoint-.5)*vec2(aspect,1.0)*2.0/portalScale;
            float len=1.0-length(p)*.3;
            float t=globaltime*.15;
            float zoom=nsin(t*.1);
            // Preserve the opening orientation, halve angular travel only.
            float angle=PI+PI*(nsin(t*.05)-.5);
            vec3 hex=coordToHex(p,20.0*zoom,angle);
            float w1=pow(calc(hex,t,len),3.0);
            float w2=pow(calc(hex,t+.03,len),3.0);
            float w3=pow(calc(hex,t+.06,len),3.0);
            vec3 cPink=vec3(1.0,0.22,0.68);
            vec3 cPurple=vec3(0.58,0.12,0.92);
            vec3 cCyan=vec3(0.0,0.88,0.96);
            vec3 rgb=w1*cPink+w2*cPurple+w3*cCyan;
            rgb*=.2+.8*sin(PI*len*.5);
            vec3 color=rgb+vec3(0.05,0.0,0.12);
            float luma=dot(color,vec3(.2126,.7152,.0722));
            color=clamp(mix(vec3(luma),color,saturation)*brightness,0.0,1.0);
            // The opening shares the rainbow's coordinates. It reveals the
            // site-wide theme background, not a section-sized black rectangle.
            float radius=.20*opening;
            float alpha=opening<=0.0 ? 1.0 : smoothstep(radius*.45,radius*1.55,length(p));
            gl_FragColor=vec4(color,alpha);
          }`
      });
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
      return true;
    } catch (_) { unavailable = true; return false; }
  }
  window.JUSpiral = {
    draw(progress, opacity, boundary = progress % 1) {
      desiredOpacity = opacity;
      desiredTransition = boundary;
      if (opacity <= .00001 || reduced.matches || document.hidden) {
        stop();
        return !unavailable;
      }
      if (unavailable || !init()) return false;
      const size = `${innerWidth}:${innerHeight}`;
      if (size !== previousSize) {
        renderer.setSize(Math.floor(512 * innerWidth / innerHeight), 512, false);
        material.uniforms.aspect.value = innerWidth / innerHeight;
        previousSize = size;
      }
      renderer.domElement.style.opacity = String(opacity);
      const portal = window.JUSceneMath.portal(boundary, innerWidth, innerHeight);
      material.uniforms.globaltime.value = portal.time;
      material.uniforms.portalScale.value = portal.scale;
      material.uniforms.opening.value = portal.opening;
      renderer.render(scene, camera);
      return true;
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else window.JUSpiral.draw(0, desiredOpacity, desiredTransition);
  });
  reduced.addEventListener('change', () => { if (reduced.matches) stop(); });
})();
