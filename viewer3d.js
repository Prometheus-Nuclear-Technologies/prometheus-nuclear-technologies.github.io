(function(){
  const MODEL_URL = 'geometria/iter_0000_nofluid.glb';

  function setOverlayMessage(text, isError){
    const o = document.getElementById('loading-overlay'); if(!o) return; if(!isError){ o.style.display='none'; return; }
    o.innerText = text; o.style.display='flex'; o.style.opacity='1';
  }
  function hideOverlay(){ const o=document.getElementById('loading-overlay'); if(!o) return; o.style.opacity='0'; setTimeout(()=>o.style.display='none',250); }

  async function loadModel(url){
    const lower = url.toLowerCase();
    if(lower.endsWith('.glb') || lower.endsWith('.gltf')){
      return await new Promise((resolve,reject)=>{
        try{
          const loader = new THREE.GLTFLoader();
          loader.load(url, (gltf)=> resolve(gltf), null, (e)=> reject(e));
        }catch(err){ reject(err); }
      });
    }
    throw new Error('Apenas GLB/GLTF são suportados nesta versão: '+url);
  }

  function applyClipping(root, planes){
    const clipsArray = Array.isArray(planes) ? planes : [planes];
    root.traverse(node=>{
      if(!node.isMesh) return;
      const mats = Array.isArray(node.material)? node.material : [node.material];
      for(const m of mats) if(m) m.clippingPlanes = clipsArray;
    });
  }

  function createCapsGenerator(group){
    const caps = new THREE.Group(); group.add(caps);
    const tmp = new THREE.Vector3();

    function clear(){ while(caps.children.length) caps.remove(caps.children[0]); }

    function keyFor(v){ return `${v.x.toFixed(6)}|${v.y.toFixed(6)}|${v.z.toFixed(6)}`; }

    function generate(planes){
      clear();
      const planesArray = Array.isArray(planes) ? planes : [planes];
      for(const plane of planesArray) generateForPlane(plane);
    }

    function generateForPlane(plane){
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
          if(ins.length===2){ const A=ins[0], B=ins[1]; segs.push({a:A.clone(), b:B.clone(), color: meshColor.clone(), len: A.distanceTo(B), mesh: node}); }
        }
      });

      if(segs.length===0) return;

      const groups = new Map();
      for(const s of segs){ const id = s.mesh.uuid || s.mesh.id || 'm'; if(!groups.has(id)) groups.set(id, {mesh: s.mesh, segs: []}); groups.get(id).segs.push(s); }

      const loops = [];
      for(const [id, grp] of groups.entries()){
        const adj = new Map();
        for(const s of grp.segs){ const ka=keyFor(s.a), kb=keyFor(s.b); if(!adj.has(ka)) adj.set(ka,[]); if(!adj.has(kb)) adj.set(kb,[]); adj.get(ka).push(s); adj.get(kb).push(s); }
        const used = new Set();
        for(const s of grp.segs){ if(used.has(s)) continue; const loopPts=[s.a.clone(), s.b.clone()]; const usedSegs=[s]; used.add(s); let cur = s.b.clone();
          for(let iter=0; iter<10000; iter++){
            const list = adj.get(keyFor(cur))||[]; let found=false;
            for(const cand of list){ if(used.has(cand)) continue; used.add(cand); usedSegs.push(cand); const next = keyFor(cand.a)===keyFor(cur)? cand.b.clone() : cand.a.clone(); loopPts.push(next); cur = next; found=true; break; }
            if(!found) break; if(cur.distanceTo(loopPts[0])<1e-3) break;
          }
          if(loopPts.length>=3 && loopPts[0].distanceTo(loopPts[loopPts.length-1])<1e-3){ loopPts.pop(); loops.push({pts: loopPts, segs: usedSegs, mesh: grp.mesh}); }
        }
      }

      const normal = plane.normal.clone().normalize();
      for(const Linfo of loops){
        const loop = Linfo.pts;
        if(loop.length<3) continue;
        const origin = loop[0].clone(); let u = new THREE.Vector3(); u.crossVectors(normal, new THREE.Vector3(0,1,0)); if(u.lengthSq()<1e-6) u.crossVectors(normal,new THREE.Vector3(1,0,0)); u.normalize(); const v = new THREE.Vector3().crossVectors(normal,u).normalize();
        const coords = [];
        for(const p of loop){ const r = p.clone().sub(origin); coords.push(r.dot(u), r.dot(v)); }
        const indices = earcut(coords);
        if(!indices || !indices.length) continue;
        const offset = normal.clone().multiplyScalar(0.0018);
        const segSamples = [];
        for(const s of Linfo.segs){
          const color = s.color.clone();
          const hsl = { h: 0, s: 0, l: 0 };
          color.getHSL(hsl);
          const steps = Math.max(3, Math.ceil((s.len || 1) * 4));
          for(let step=0; step<=steps; step++){
            const t = step / steps;
            const p = s.a.clone().lerp(s.b, t).sub(origin);
            segSamples.push({ x: p.dot(u), y: p.dot(v), color, weight: Math.max(0.25, s.len || 1), sat: hsl.s });
          }
        }

        const pickColor = (x, y)=>{
          const vote = new Map();
          for(const sample of segSamples){
            const dx = x - sample.x, dy = y - sample.y;
            const dist = Math.max(dx*dx + dy*dy, 1e-4);
            const key = sample.color.getHexString();
            const weight = (sample.weight / dist) * (1 + sample.sat * 2.8);
            vote.set(key, (vote.get(key) || 0) + weight);
          }
          let bestKey = '0b1220';
          let bestVal = -Infinity;
          for(const [key, val] of vote.entries()){
            if(val > bestVal){ bestVal = val; bestKey = key; }
          }
          return new THREE.Color(`#${bestKey}`);
        };

        const positions = [];
        const colors = [];
        for(let i=0;i<indices.length;i++){
          const p = loop[indices[i]].clone().add(offset);
          const cx = coords[indices[i]*2];
          const cy = coords[indices[i]*2+1];
          const col = pickColor(cx, cy);
          positions.push(p.x, p.y, p.z);
          colors.push(col.r, col.g, col.b);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, metalness:0.04, roughness:0.78, side: THREE.DoubleSide });
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
    if(rootObj.scene) group.add(rootObj.scene); else group.add(rootObj);
    scene.add(group);

    const box = new THREE.Box3().setFromObject(group); const size = new THREE.Vector3(), center = new THREE.Vector3(); box.getSize(size); box.getCenter(center);
    const radius = Math.max(size.x,size.y,size.z) * 0.6 || 100;
    camera.position.copy(center).add(new THREE.Vector3(radius*2.5, radius*1.7, radius*1.45));
    controls.target.copy(center);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    controls.update();

    // Create three clipping planes for DX (1D) and 3planes (3D) modes
    const planeX = new THREE.Plane(new THREE.Vector3(-1,0,0), 0);
    const planeY = new THREE.Plane(new THREE.Vector3(0,-1,0), 0);
    const planeZ = new THREE.Plane(new THREE.Vector3(0,0,-1), 0);
    
    const capsGen = createCapsGenerator(group);
    
    function updateCutaway(mode){
      if(mode === 'dx'){
        // Single plane cut (DX - one dimension)
        const cutX = box.min.x + size.x * 0.50;
        planeX.setFromNormalAndCoplanarPoint(new THREE.Vector3(-1,0,0), new THREE.Vector3(cutX, center.y, center.z));
        applyClipping(group, [planeX]);
        try { capsGen.generate([planeX]); } catch(e) { console.error(e); }
      } else if(mode === 'threeplanes'){
        // Three orthogonal planes for full corner cut
        const cutX = box.min.x + size.x * 0.35;
        const cutY = box.min.y + size.y * 0.35;
        const cutZ = box.min.z + size.z * 0.35;
        
        planeX.setFromNormalAndCoplanarPoint(new THREE.Vector3(-1,0,0), new THREE.Vector3(cutX, center.y, center.z));
        planeY.setFromNormalAndCoplanarPoint(new THREE.Vector3(0,-1,0), new THREE.Vector3(center.x, cutY, center.z));
        planeZ.setFromNormalAndCoplanarPoint(new THREE.Vector3(0,0,-1), new THREE.Vector3(center.x, center.y, cutZ));
        
        applyClipping(group, [planeX, planeY, planeZ]);
        try { capsGen.generate([planeX, planeY, planeZ]); } catch(e) { console.error(e); }
      }
    }

    function animate(){ controls.update(); renderer.render(scene,camera); requestAnimationFrame(animate); }
    animate(); updateCutaway('dx'); hideOverlay();

    return { updateCutaway, resize: ()=>{ const nw=renderHost.clientWidth, nh=renderHost.clientHeight; renderer.setSize(nw,nh,false); camera.aspect = nw/nh; camera.updateProjectionMatrix(); } };
  }

  async function initViewer(){
    const host = document.getElementById('viewer-container');
    const buttons = document.querySelectorAll('.viewer-button');
    if(!host) return;
    try{
      const model = await loadModel(MODEL_URL);
      const viewer = buildScene(host, model);
      
      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.cut;
          buttons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          viewer.updateCutaway(mode);
        });
      });
      
      window.addEventListener('resize', ()=> viewer.resize());
    }catch(err){ console.error(err); setOverlayMessage('Erro ao carregar modelo: '+(err && err.message?err.message:err), true); }
  }

  window.addEventListener('load', initViewer);
})();
