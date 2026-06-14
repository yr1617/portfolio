// 맨 위 import 구문들은 전부 삭제해야 합니다!

(function () {
    // 혹시 모를 이전 애니메이션 루프 제거
    if (window.animFrameId) {
        cancelAnimationFrame(window.animFrameId);
        window.animFrameId = null;
    }

    let scene, camera, renderer, modelAnchor;
    let mouseX = 0, mouseY = 0;
    let isHoveringModel = false;
    let clock = 0;
    const rotState = { x: 0, y: 0 };

    const displayShell = document.querySelector('.landing-display-shell') || document.querySelector('#landing-display');

    // 거울 같은 크롬 효과를 위한 가상 스튜디오 환경 맵
    const setupEnvironmentMap = (targetScene, targetRenderer) => {
        const envScene = new THREE.Scene();
        
        const baseLight = new THREE.AmbientLight(0xffffff, 1.2);
        envScene.add(baseLight);

        const plate1 = new THREE.Mesh(
            new THREE.PlaneGeometry(60, 60),
            new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
        );
        plate1.position.set(0, 15, 35);
        plate1.lookAt(0, 0, 0);
        envScene.add(plate1);

        const plate2 = new THREE.Mesh(
            new THREE.PlaneGeometry(35, 70),
            new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
        );
        plate2.position.set(-30, 20, 15);
        plate2.lookAt(0, 0, 0);
        envScene.add(plate2);

        const plate3 = new THREE.Mesh(
            new THREE.PlaneGeometry(25, 60),
            new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
        );
        plate3.position.set(30, -5, 20);
        plate3.lookAt(0, 0, 0);
        envScene.add(plate3);

        const pmremGenerator = new THREE.PMREMGenerator(targetRenderer);
        pmremGenerator.compileEquirectangularShader();
        const envMapTexture = pmremGenerator.fromScene(envScene).texture;
        
        targetScene.environment = envMapTexture;
        
        envScene.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
        pmremGenerator.dispose();
    };

    // THREE.JS 초기화 (다른 UI 콘텐츠를 절대 방해하지 않음)
    const initThree = () => {
        if (!displayShell) return;

        const oldCanvas = document.querySelector('#model-canvas');
        if (oldCanvas) oldCanvas.remove();

        const newCanvas = document.createElement('canvas');
        newCanvas.id = 'model-canvas';
        newCanvas.style.width = '100%';
        newCanvas.style.height = '100%';
        displayShell.appendChild(newCanvas);

        const width = displayShell.clientWidth || 650;
        const height = displayShell.clientHeight || 650;

        scene = new THREE.Scene();
        
        renderer = new THREE.WebGLRenderer({
            canvas: newCanvas,
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance'
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.6;

        camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
        camera.position.set(0, 0, 5.8);

        setupEnvironmentMap(scene, renderer);

        const dirLight1 = new THREE.DirectionalLight(0xffffff, 3.0);
        dirLight1.position.set(5, 15, 10);
        scene.add(dirLight1);

        // CDN 전역 객체(THREE.GLTFLoader)를 사용하여 에러 발생 원천 차단
        const loader = new THREE.GLTFLoader();
        const draco = new THREE.DRACOLoader();
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        loader.setDRACOLoader(draco);

        loader.load(
            './modeling.glb',
            (gltf) => {
                if (!gltf || !gltf.scene) return;
                const model = gltf.scene;

                const chromeMaterial = new THREE.MeshStandardMaterial({
                    color: 0xffffff,          
                    metalness: 1.0,           
                    roughness: 0.02,          
                    envMapIntensity: 5.0,     
                    side: THREE.DoubleSide
                });

                model.traverse((child) => {
                    if (child.isMesh) {
                        child.material = chromeMaterial;
                    }
                });

                const box = new THREE.Box3().setFromObject(model);
                const center = new THREE.Vector3();
                box.getCenter(center);
                const size = new THREE.Vector3();
                box.getSize(size);

                const maxDim = Math.max(size.x, size.y, size.z);
                const targetBounds = 2.6; 
                const scale = targetBounds / maxDim;
                
                model.scale.setScalar(scale);
                model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
                
                model.rotation.set(Math.PI * 0.38, Math.PI * 0.05, Math.PI * 0.12);

                modelAnchor = new THREE.Group();
                modelAnchor.add(model);
                scene.add(modelAnchor);

                const siteLoader = document.querySelector('#site-loader');
                if (siteLoader) siteLoader.classList.add('is-loaded');
            },
            undefined,
            (err) => { console.warn('모델 로드 실패:', err); }
        );
    };

    const animate = () => {
        window.animFrameId = requestAnimationFrame(animate);
        clock += 0.01;

        if (renderer && scene && camera) {
            if (modelAnchor) {
                if (isHoveringModel) {
                    const targetX = -mouseY * 0.35;
                    const targetY = mouseX * 0.45;
                    rotState.x += (targetX - rotState.x) * 0.08;
                    rotState.y += (targetY - rotState.y) * 0.08;
                } else {
                    rotState.x += (0 - rotState.x) * 0.05;
                    rotState.y += 0.004;
                }
                modelAnchor.rotation.x = rotState.x;
                modelAnchor.rotation.y = rotState.y;
                modelAnchor.position.y = Math.sin(clock * 0.8) * 0.05;
            }
            renderer.render(scene, camera);
        }
    };

    const handleResize = () => {
        if (!renderer || !camera || !displayShell) return;
        const width = displayShell.clientWidth;
        const height = displayShell.clientHeight;

        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    };

    window.addEventListener('mousemove', (e) => {
        const width = window.innerWidth || 1;
        const height = window.innerHeight || 1;
        mouseX = (e.clientX / width) * 2 - 1;
        mouseY = -(e.clientY / height) * 2 + 1;

        const follower = document.querySelector('.cursor-follower');
        if (follower) {
            follower.style.left = `${e.clientX}px`;
            follower.style.top = `${e.clientY}px`;
        }
    }, { passive: true });

    if (displayShell) {
        displayShell.addEventListener('pointerenter', () => { isHoveringModel = true; });
        displayShell.addEventListener('pointerleave', () => { isHoveringModel = false; });
    }

    window.addEventListener('resize', handleResize);

    // 0.1초 뒤 부드럽고 안전하게 실행하여 다른 컨텐츠 마비 전면 차단
    setTimeout(() => {
        initThree();
        animate();
    }, 100);
})();
