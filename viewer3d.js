(function(){
  // Minimal viewer: supports .obj/.mtl and .glb, applies a single clipping plane controlled by the slider.
  const MODEL_URL = 'geometria/iter_0000_nofluid.obj';
  const DEFAULT_CUT_RATIO = 0.5;

  function setOverlayMessage(text, isError){
    const o = document.getElementById('loading-overlay'); if(!o) return; if(!isError){ o.style.display='none'; return; }
    o.innerText = text; o.style.display='flex'; o.style.opacity='1';
  }
  function hideOverlay(){ const o=document.getElementById('loading-overlay'); if(!o) return; o.style.opacity='0'; setTimeout(()=>o.style.display='none',250); }

  async function loadObjWithMtl(objUrl){
    return new Promise((resolve,reject)=>{
      try{
        const mtlUrl = objUrl.replace(/\.obj$/i,'.mtl');
        const mtlLoader = new THREE.MTLLoader();
        mtlLoader.load(mtlUrl, (materials)=>{
          materials.preload();
          const objLoader = new THREE.OBJLoader(); objLoader.setMaterials(materials);
          objLoader.load(objUrl, (obj)=>resolve(obj), null, (e)=>reject(e));
        }, null, ()=>{
          // no mtl, load obj directly
          const objLoader = new THREE.OBJLoader();
          objLoader.load(objUrl, (obj)=>resolve(obj), null, (e)=>reject(e));
        });
      }catch(err){ reject(err); }
    });
  }

  async function loadModel(url){
    const lower = url.toLowerCase();
    if(lower.endsWith('.obj')) return await loadObjWithMtl(url);
    // only OBJ supported per request
    throw new Error('Apenas OBJ é suportado nesta versão: '+url);
  }

  function applyClipping(root, plane){
    root.traverse(node=>{
      if(!node.isMesh) return;
      const mats = Array.isArray(node.material)? node.material : [node.material];
      for(const m of mats) if(m) m.clippingPlanes = [plane];
    });
  }

  // Create caps generator: intersect triangles with plane, stitch segments, triangulate and add cap meshes
  function createCapsGenerator(group){
    const caps = new THREE.Group(); group.add(caps);
    const tmp = new THREE.Vector3();

    function clear(){ while(caps.children.length) caps.remove(caps.children[0]); }

    function keyFor(v){ return `${v.x.toFixed(6)}|${v.y.toFixed(6)}|${v.z.toFixed(6)}`; }

    function generate(plane){
      clear();
      const segs = [];
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      group.traverse(node=>{
        if(!node.isMesh || !node.geometry || !node.geometry.attributes || !node.geometry.attributes.position) return;
        const posAttr = node.geometry.attributes.position;
        const idx = node.geometry.index;
        const toWorld = node.matrixWorld;
        let meshColor = new THREE.Color(0x0b1220);
        try{ if(node.material && node.material.color) meshColor = node.material.color.clone(); }catch(e){}

        const getV = (i,out)=> out.fromBufferAttribute(posAttr,i).applyMatrix4(toWorld);
        const triCount = idx ? idx.count/3 : posAttr.count/3;
        for(let t=0;t<triCount;t++){
          let ia,ib,ic;
          if(idx){ ia=idx.getX(t*3); ib=idx.getX(t*3+1); ic=idx.getX(t*3+2); } else { ia=t*3; ib=t*3+1; ic=t*3+2; }
          getV(ia,a); getV(ib,b); getV(ic,c);
          const dA = plane.distanceToPoint(a), dB = plane.distanceToPoint(b), dC = plane.distanceToPoint(c);
          const addIf = (p1,p2,d1,d2)=>{ if((d1>=0)!==(d2>=0)){ const tt = d1/(d1-d2); tmp.lerpVectors(p1,p2,tt); return tmp.clone(); } return null; };
          const i1 = addIf(a,b,dA,dB), i2 = addIf(b,c,dB,dC), i3 = addIf(c,a,dC,dA);
          const ins = [i1,i2,i3].filter(x=>x!==null);
          if(ins.length===2){ const A=ins[0], B=ins[1]; segs.push({a:A.clone(), b:B.clone(), color: meshColor.clone(), len: A.distanceTo(B)}); }
        }
      });

      if(segs.length===0) return;

      // build adjacency
      const adj = new Map();
      for(const s of segs){ const ka=keyFor(s.a), kb=keyFor(s.b); if(!adj.has(ka)) adj.set(ka,[]); if(!adj.has(kb)) adj.set(kb,[]); adj.get(ka).push(s); adj.get(kb).push(s); }

      const loops = [];
      const used = new Set();
      for(const s of segs){ if(used.has(s)) continue; used.add(s); const pts=[s.a.clone(), s.b.clone()]; let cur = s.b.clone(); for(let iter=0;iter<10000;iter++){ const list = adj.get(keyFor(cur))||[]; let found=false; for(const cand of list){ if(used.has(cand)) continue; used.add(cand); const next = keyFor(cand.a)===keyFor(cur)? cand.b.clone() : cand.a.clone(); pts.push(next); cur = next; found=true; break; } if(!found) break; if(cur.distanceTo(pts[0])<1e-3) break; } if(pts.length>=3 && pts[0].distanceTo(pts[pts.length-1])<1e-3){ pts.pop(); loops.push(pts); } }

      const normal = plane.normal.clone().normalize();
      for(const loop of loops){
        if(loop.length<3) continue;
        const origin = loop[0].clone(); let u = new THREE.Vector3(); u.crossVectors(normal, new THREE.Vector3(0,1,0)); if(u.lengthSq()<1e-6) u.crossVectors(normal,new THREE.Vector3(1,0,0)); u.normalize(); const v = new THREE.Vector3().crossVectors(normal,u).normalize();
        const coords = [];
        for(const p of loop){ const r = p.clone().sub(origin); coords.push(r.dot(u), r.dot(v)); }
        const indices = earcut(coords);
        if(!indices || !indices.length) continue;
        const positions = new Float32Array(loop.length*3);
        for(let i=0;i<loop.length;i++){ const p = loop[i].clone().add(normal.clone().multiplyScalar(0.0008)); positions[i*3]=p.x; positions[i*3+1]=p.y; positions[i*3+2]=p.z; }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions,3)); geo.setIndex(indices); geo.computeVertexNormals();
        // length-weighted color
        let r=0,g=0,b=0,tot=0; for(const s of segs){ const L=s.len||1; r+=s.color.r*L; g+=s.color.g*L; b+=s.color.b*L; tot+=L; }
        const col = new THREE.Color(0x0b1220); if(tot>0){ col.r=r/tot; col.g=g/tot; col.b=b/tot; }
        const mat = new THREE.MeshStandardMaterial({ color: col, metalness:0.06, roughness:0.7, side: THREE.DoubleSide });
        caps.add(new THREE.Mesh(geo, mat));
      }
    }

    return { generate, clear };
  }

  function buildScene(renderHost, rootObj){
    renderHost.innerHTML = '';
    const w = renderHost.clientWidth, h = renderHost.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true }); renderer.setPixelRatio(window.devicePixelRatio||1); renderer.setSize(w,h,false); renderer.setClearColor(0x07111d,1); renderer.localClippingEnabled = true; renderHost.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w/h, 0.1, 100000);
    const controls = new THREE.OrbitControls(camera, renderer.domElement); controls.enableDamping=true; controls.dampingFactor=0.08;
    const ambient = new THREE.AmbientLight(0xffffff,1.6); scene.add(ambient);
    const key = new THREE.DirectionalLight(0x9fefff,1.4); key.position.set(500,300,800); scene.add(key);

    const group = new THREE.Group();
    // GLTF returns {scene:...} while OBJ returns Object3D
    if(rootObj.scene) group.add(rootObj.scene); else group.add(rootObj);
    scene.add(group);

    const box = new THREE.Box3().setFromObject(group); const size = new THREE.Vector3(), center = new THREE.Vector3(); box.getSize(size); box.getCenter(center);
    const radius = Math.max(size.x,size.y,size.z) * 0.6 || 100;
    camera.position.copy(center).add(new THREE.Vector3(radius*1.9, radius*1.3, radius*1.05)); controls.target.copy(center); camera.updateProjectionMatrix(); controls.update();

    const clipPlane = new THREE.Plane(new THREE.Vector3(-1,0,0), 0);
    applyClipping(group, clipPlane);

    // caps generator for OBJ meshes
    const capsGen = createCapsGenerator(group);

    function updateCutaway(ratio){
      const cutX = box.min.x + size.x * ratio;
      const planePoint = new THREE.Vector3(cutX, center.y, center.z);
      clipPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(-1,0,0), planePoint);
      try { capsGen.generate(clipPlane); } catch(e) { /* ignore */ }
    }

    function animate(){ controls.update(); renderer.render(scene,camera); requestAnimationFrame(animate); }
    animate(); updateCutaway(DEFAULT_CUT_RATIO); hideOverlay();

    return { updateCutaway, resize: ()=>{ const nw=renderHost.clientWidth, nh=renderHost.clientHeight; renderer.setSize(nw,nh,false); camera.aspect = nw/nh; camera.updateProjectionMatrix(); } };
  }

  async function initViewer(){
    const host = document.getElementById('viewer-container'); const slider = document.getElementById('cut-slider'); const cutValue = document.getElementById('cut-value'); const buttons = document.querySelectorAll('.viewer-button');
    if(!host || !slider || !cutValue) return;
    try{
      const model = await loadModel(MODEL_URL);
      const viewer = buildScene(host, model);
      const apply = (ratio)=>{ const n = Math.max(0.5, Math.min(0.95, ratio)); slider.value = n; cutValue.textContent = Math.round(n*100)+'%'; buttons.forEach(b=> b.classList.toggle('active', Number(b.dataset.cut)===Number(n.toFixed(3)))); viewer.updateCutaway(n); };
      slider.addEventListener('input', (e)=> apply(Number(e.target.value)));
      buttons.forEach(b=> b.addEventListener('click', ()=> apply(Number(b.dataset.cut))));
      window.addEventListener('resize', ()=> viewer.resize());
      apply(Number(slider.value));
    }catch(err){ console.error(err); setOverlayMessage('Erro ao carregar modelo: '+(err && err.message?err.message:err), true); }
  }

  window.addEventListener('load', initViewer);
})();
