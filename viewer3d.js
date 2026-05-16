(function () {
    const MODEL_URL = 'geometria/iter_0000_nofluid.step';
    const DEFAULT_CUT_RATIO = 0.75;

    function setOverlayMessage(text, isError) {
        const overlay = document.getElementById('loading-overlay');
        if (!overlay) {
            return;
        }
        overlay.innerHTML = `
            <div style="max-width:320px; background: rgba(5,11,20,0.72); border: 1px solid ${isError ? 'rgba(255, 99, 99, 0.35)' : 'rgba(0,242,255,0.25)'}; backdrop-filter: blur(10px); padding: 1.25rem 1rem; border-radius: 14px;">
                <div style="font-size: 0.95rem; color: ${isError ? '#ff8b8b' : 'var(--primary-accent)'}; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.35rem;">${isError ? 'Falha no carregamento' : 'Carregando núcleo 3D'}</div>
                <div style="font-size: 0.92rem; color: rgba(255,255,255,0.82); line-height: 1.45;">${text}</div>
            </div>
        `;
        overlay.style.display = 'flex';
        overlay.style.opacity = '1';
    }

    function hideOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (!overlay) {
            return;
        }
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 350);
    }

    function createMaterial(colorArray) {
        const color = Array.isArray(colorArray) && colorArray.length === 3
            ? new THREE.Color(colorArray[0], colorArray[1], colorArray[2])
            : new THREE.Color(0xcdd6df);

        return new THREE.MeshStandardMaterial({
            color,
            metalness: 0.12,
            roughness: 0.62,
            side: THREE.DoubleSide,
            clippingPlanes: [],
            clipShadows: true
        });
    }

    function buildGeometry(resultMesh) {
        const geometry = new THREE.BufferGeometry();
        const positions = resultMesh.attributes && resultMesh.attributes.position ? resultMesh.attributes.position.array : [];
        const normals = resultMesh.attributes && resultMesh.attributes.normal ? resultMesh.attributes.normal.array : null;
        const indices = resultMesh.index && resultMesh.index.array ? resultMesh.index.array : [];

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        if (normals && normals.length > 0) {
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        } else {
            geometry.computeVertexNormals();
        }
        geometry.setIndex(indices);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return geometry;
    }

    function buildSceneFromGeometries(renderHost, geometries) {
        const width = renderHost.clientWidth;
        const height = renderHost.clientHeight;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(width, height, false);
        renderer.setClearColor(0x07111d, 1);
        renderer.localClippingEnabled = true;
        renderHost.innerHTML = '';
        renderHost.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x07111d, 250, 1500);

        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100000);
        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 20;
        controls.maxDistance = 5000;
        controls.target.set(0, 0, 0);

        const ambient = new THREE.AmbientLight(0xffffff, 1.7);
        scene.add(ambient);

        const keyLight = new THREE.DirectionalLight(0x9fefff, 2.1);
        keyLight.position.set(500, 300, 800);
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x4d8dff, 1.1);
        fillLight.position.set(-500, -250, 450);
        scene.add(fillLight);

        const group = new THREE.Group();
        scene.add(group);

        const clippingPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
        const meshes = [];

        for (const geom of geometries) {
            const material = createMaterial([0.75, 0.8, 0.85]);
            material.clippingPlanes = [clippingPlane];
            const mesh = new THREE.Mesh(geom, material);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            group.add(mesh);
            meshes.push(mesh);
        }

        const box = new THREE.Box3().setFromObject(group);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const radius = Math.max(size.x, size.y, size.z) * 0.6 || 100;

        controls.target.copy(center);
        camera.position.copy(center).add(new THREE.Vector3(radius * 1.9, radius * 1.3, radius * 1.05));
        camera.near = Math.max(radius / 500, 0.05);
        camera.far = radius * 100;
        camera.updateProjectionMatrix();
        controls.update();

        function updateCutaway(ratio) {
            const cutX = box.min.x + size.x * ratio;
            clippingPlane.setFromNormalAndCoplanarPoint(
                new THREE.Vector3(-1, 0, 0),
                new THREE.Vector3(cutX, center.y, center.z)
            );
            renderer.render(scene, camera);
        }

        function animate() {
            controls.update();
            renderer.render(scene, camera);
            requestAnimationFrame(animate);
        }

        animate();
        updateCutaway(DEFAULT_CUT_RATIO);
        hideOverlay();

        return {
            updateCutaway,
            resize() {
                const newWidth = renderHost.clientWidth;
                const newHeight = renderHost.clientHeight;
                renderer.setSize(newWidth, newHeight, false);
                camera.aspect = newWidth / newHeight;
                camera.updateProjectionMatrix();
            }
        };
    }

    function buildScene(renderHost, result) {
        const width = renderHost.clientWidth;
        const height = renderHost.clientHeight;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(width, height, false);
        renderer.setClearColor(0x07111d, 1);
        renderer.localClippingEnabled = true;
        renderHost.innerHTML = '';
        renderHost.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x07111d, 250, 1500);

        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100000);
        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 20;
        controls.maxDistance = 5000;
        controls.target.set(0, 0, 0);

        const ambient = new THREE.AmbientLight(0xffffff, 1.7);
        scene.add(ambient);

        const keyLight = new THREE.DirectionalLight(0x9fefff, 2.1);
        keyLight.position.set(500, 300, 800);
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x4d8dff, 1.1);
        fillLight.position.set(-500, -250, 450);
        scene.add(fillLight);

        const group = new THREE.Group();
        scene.add(group);

        const clippingPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
        const meshes = [];

        for (const resultMesh of result.meshes) {
            const geometry = buildGeometry(resultMesh);
            const material = createMaterial(resultMesh.color);
            material.clippingPlanes = [clippingPlane];
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            group.add(mesh);
            meshes.push(mesh);
        }

        const box = new THREE.Box3().setFromObject(group);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const radius = Math.max(size.x, size.y, size.z) * 0.6 || 100;

        controls.target.copy(center);
        camera.position.copy(center).add(new THREE.Vector3(radius * 1.9, radius * 1.3, radius * 1.05));
        camera.near = Math.max(radius / 500, 0.05);
        camera.far = radius * 100;
        camera.updateProjectionMatrix();
        controls.update();

        function updateCutaway(ratio) {
            const cutX = box.min.x + size.x * ratio;
            clippingPlane.setFromNormalAndCoplanarPoint(
                new THREE.Vector3(-1, 0, 0),
                new THREE.Vector3(cutX, center.y, center.z)
            );
            renderer.render(scene, camera);
        }

        function animate() {
            controls.update();
            renderer.render(scene, camera);
            requestAnimationFrame(animate);
        }

        animate();
        updateCutaway(DEFAULT_CUT_RATIO);
        hideOverlay();

        return {
            updateCutaway,
            resize() {
                const newWidth = renderHost.clientWidth;
                const newHeight = renderHost.clientHeight;
                renderer.setSize(newWidth, newHeight, false);
                camera.aspect = newWidth / newHeight;
                camera.updateProjectionMatrix();
            }
        };
    }

    async function initViewer() {
        const viewerHost = document.getElementById('viewer-container');
        const cutSlider = document.getElementById('cut-slider');
        const cutValue = document.getElementById('cut-value');
        const buttons = document.querySelectorAll('.viewer-button');

        if (!viewerHost || !cutSlider || !cutValue) {
            return;
        }

        setOverlayMessage('Procurando versão pré-processada (STL) do modelo. Se não existir, converta o STEP para STL e coloque em /geometria.', false);

        const stlUrl = MODEL_URL.replace(/\.step$/i, '.stl');
        try {
            const head = await fetch(stlUrl, { method: 'HEAD' });
            if (head.ok) {
                setOverlayMessage('Carregando STL pré-processado e preparando o corte interno do reator.', false);
                const res = await fetch(stlUrl);
                if (!res.ok) throw new Error('Falha ao baixar STL');
                const array = await res.arrayBuffer();
                const loader = new THREE.STLLoader();
                const geom = loader.parse(array);
                const viewer = buildSceneFromGeometries(viewerHost, [geom]);

                const applyCut = (ratio) => {
                    const normalized = Math.max(0.5, Math.min(0.95, ratio));
                    cutSlider.value = normalized;
                    cutValue.textContent = `${Math.round(normalized * 100)}%`;
                    buttons.forEach((button) => {
                        const isActive = Number(button.dataset.cut) === Number(normalized.toFixed(3));
                        button.classList.toggle('active', isActive);
                    });
                    viewer.updateCutaway(normalized);
                };

                cutSlider.addEventListener('input', (event) => {
                    applyCut(Number(event.target.value));
                });

                buttons.forEach((button) => {
                    button.addEventListener('click', () => {
                        applyCut(Number(button.dataset.cut));
                    });
                });

                window.addEventListener('resize', () => viewer.resize());
                applyCut(Number(cutSlider.value));
            } else {
                setOverlayMessage('Modelo STL não encontrado. Converta "geometria/iter_0000_nofluid.step" → "geometria/iter_0000_nofluid.stl" e recarregue.', true);
            }
        } catch (error) {
            console.error(error);
            setOverlayMessage('Erro ao buscar o modelo STL. Verifique o arquivo e tente novamente.', true);
        }
    }

    window.addEventListener('load', initViewer);
})();
