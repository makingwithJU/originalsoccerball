;(function(){
  try{
    var S = 32; // even smaller cursor
    var host = document.createElement('div');
    host.id='cursor3d';
    host.style.cssText = [
      'position:fixed;left:0;top:0;width:'+S+'px;height:'+S+'px',
      'pointer-events:none;z-index:100000;transform:translate(-50%,-50%)',
      'background:transparent; mix-blend-mode:difference; will-change: transform'
    ].join(';');
    var ready=false, renderer, scene, camera, obj;

    function mount(){ if(!document.getElementById('cursor3d')) document.body.appendChild(host); }
    function onMove(e){ host.style.left=e.clientX+'px'; host.style.top=e.clientY+'px'; }

    // === Global Three.js loader (共有用) ===
    function ensureThreeGlobal(next){
      // 既に THREE があれば即実行
      if (window.THREE){
        try{ next(); }catch(_){ }
        return;
      }
      // 読み込みキューを共有（複数箇所から呼ばれても1回だけロード）
      var q = window.__juThreeQueue;
      if (!q){
        q = [];
        window.__juThreeQueue = q;
        var s=document.createElement('script');
        s.src='/assets/libs/three-0.128.0.min.js';
        s.onload=function(){
          try{
            // Three.js 準備完了を通知
            try{
              document.dispatchEvent(new CustomEvent('ju-three-ready'));
            }catch(_){}
            var list = window.__juThreeQueue || [];
            window.__juThreeQueue = null;
            for (var i=0;i<list.length;i++){
              try{ list[i](); }catch(_){ }
            }
          }catch(_){ }
        };
        document.head.appendChild(s);
      }
      q.push(function(){ try{ next(); }catch(_){ } });
    }
    // グローバル API として公開（他スクリプトと共有）
    if (!window.juEnsureThree){
      window.juEnsureThree = ensureThreeGlobal;
    }

    function ensureTHREE(next){
      if (typeof window.juEnsureThree === 'function'){
        window.juEnsureThree(next);
        return;
      }
      ensureThreeGlobal(next);
    }
    function ensureSTL(next){
      if(window.THREE && (THREE.STLLoader||window.STLLoader)){ next(); return; }
      var s=document.createElement('script'); s.src='/assets/libs/STLLoader.js'; s.onload=next; document.head.appendChild(s);
    }

    function init(){
      renderer = new THREE.WebGLRenderer({alpha:true, antialias:true});
      renderer.setPixelRatio(Math.min(devicePixelRatio||1, 2));
      renderer.setSize(S, S);
      renderer.setClearColor(0x000000, 0); // fully transparent background
      var cvs = renderer.domElement; cvs.style.cssText='width:100%;height:100%;display:block;background:transparent';
      host.appendChild(cvs);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
      camera.position.set(0,0,4);
      var light = new THREE.DirectionalLight(0xffffff, 1.2); light.position.set(2,2,3); scene.add(light);
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));

      var url = '/assets/models/truncated_icosahedron_wireframe.stl';
      function fitAndAdd(geom){
        geom.computeBoundingSphere();
        var bs = geom.boundingSphere; var r = (bs && bs.radius) ? bs.radius : 50;
        // target radius ~1.2 so it fits in camera view comfortably
        var target = 1.2; var scale = target / r;
        // Prefer outline lines for clear wireframe
        var edges = new THREE.EdgesGeometry(geom, 25);
        var mat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1 });
        obj = new THREE.LineSegments(edges, mat);
        obj.scale.setScalar(scale);
        // center
        geom.computeBoundingBox();
        var bb = geom.boundingBox; var cx=(bb.max.x+bb.min.x)/2, cy=(bb.max.y+bb.min.y)/2, cz=(bb.max.z+bb.min.z)/2;
        obj.position.set(-cx*scale, -cy*scale, -cz*scale);
        scene.add(obj); animate();
      }

      if (THREE.STLLoader){
        try{
          new THREE.STLLoader().load(url, function(geom){ fitAndAdd(geom); }, undefined, function(){ fallback(); });
        }catch(e){ fallback(); }
      } else { fallback(); }

      function fallback(){
        var g = new THREE.IcosahedronGeometry(1, 1);
        var w = new THREE.WireframeGeometry(g);
        obj = new THREE.LineSegments(w, new THREE.LineBasicMaterial({color:0xffffff}));
        scene.add(obj); animate();
      }
      function animate(){ ready=true; (function loop(){ if(!ready) return; requestAnimationFrame(loop); obj.rotation.y += 0.02; renderer.render(scene, camera); })(); }
    }

    function start(){ mount(); ensureTHREE(function(){ ensureSTL(init); }); }
    document.addEventListener('mousemove', onMove, {passive:true});
    if(document.readyState!=='loading') start(); else document.addEventListener('DOMContentLoaded', start);
    // Hide system cursor once ready
    var hideOnce = setInterval(function(){ if(host.parentNode){ document.documentElement.classList.add('ju-hide-cursor'); clearInterval(hideOnce);} }, 200);
  }catch(_){ }
})();
