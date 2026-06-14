import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// 기존에 남아있던 유령 루프가 있다면 깨끗하게 리셋
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

/* ════════════════════════════════════════
    ✨ 크롬 반사 질감을 극대화하는 환경 맵 시스템
════════════════════════════════════════ */
const setupEnvironment = (targetScene) => {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    targetScene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 4.0);
    keyLight.position.set(5, 8, 10);
    targetScene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 2.0);
    fillLight.position.set(-8, 5, 5);
    targetScene.add(fillLight);

    const topLight = new THREE.DirectionalLight(0xffffff, 2.5);
    topLight.position.set(0, 15, 2);
    targetScene.add(topLight);
};

const setupEnvironmentMap = (targetScene, targetRenderer) => {
    const envScene = new THREE.Scene();
    envScene.add(new THREE.AmbientLight(0xffffff, 1.0));

    const plate1 = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    plate1.position.set(0, 10, 30); plate1.lookAt(0, 0, 0); envScene.add(plate1);

    const plate2 = new THREE.Mesh(new THREE.PlaneGeometry(30, 60), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    plate2.position.set(-25, 15, 10); plate2.lookAt(0, 0, 0); envScene.add(plate2);

    const plate3 = new THREE.Mesh(new THREE.PlaneGeometry(20, 50), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    plate3.position.set(25, -5, 15); plate3.lookAt(0, 0, 0); envScene.add(plate3);

    const pmremGenerator = new THREE.PMREMGenerator(targetRenderer);
    pmremGenerator.compileEquirectangularShader();
    targetScene.environment = pmremGenerator.fromScene(envScene).texture;
    
    envScene.traverse((c) => { if (c.isMesh) { c.geometry.dispose(); c.material.dispose(); } });
    pmremGenerator.dispose();
};

/* ════════════════════════════════════════
    📦 THREE.JS 인라인 격리 초기화
════════════════════════════════════════ */
const initThree = () => {
    if (!displayShell) return;

    const oldCanvas = document.querySelector('#model-canvas');
    if (oldCanvas) oldCanvas.remove();

    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'model-canvas';
    
    // 주변 레이아웃 배치를 절대 방해하지 않도록 완전 격리 고정
    newCanvas.style.position = 'absolute';
    newCanvas.style.top = '0';
    newCanvas.style.left = '0';
    newCanvas.style.width = '100%';
    newCanvas.style.height = '100%';
    newCanvas.style.pointerEvents = 'auto'; 
    
    displayShell.style.position = 'relative';
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
    renderer.toneMappingExposure = 1.5;

    camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0, 5.8);

    setupEnvironmentMap(scene, renderer);
    setupEnvironment(scene);

    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/libs/draco/');
    loader.setDRACOLoader(draco);

    loader.load(
        './modeling.glb',
        (gltf) => {
            if (!gltf || !gltf.scene) return;
            const model = gltf.scene;

            const chromeMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,          
                metalness: 1.0,           
                roughness: 0.03,          
                envMapIntensity: 5.0,     
                side: THREE.DoubleSide
            });

            model.traverse((child) => {
                if (child.isMesh) child.material = chromeMaterial;
            });

            const box = new THREE.Box3().setFromObject(model);
            const center = new THREE.Vector3(); box.getCenter(center);
            const size = new THREE.Vector3(); box.getSize(size);

            const scale = 2.6 / Math.max(size.x, size.y, size.z);
            model.scale.setScalar(scale);
            model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
            model.rotation.set(Math.PI * 0.38, Math.PI * 0.05, Math.PI * 0.12);

            modelAnchor = new THREE.Group();
            modelAnchor.add(model);
            scene.add(modelAnchor);

            // 모델 로딩이 완료되면 즉시 가림막 파괴 프로스세 가동
            killLoaderScreen();
        },
        undefined,
        (err) => { 
            console.warn('모델 로딩 실패:', err);
            killLoaderScreen(); // 실패하더라도 본문은 무조건 띄우도록 예외 처리
        }
    );
};

/* ════════════════════════════════════════
    💥 [핵심 수리] 무한 가림막 레이어 원천 제거 함수
════════════════════════════════════════ */
const killLoaderScreen = () => {
    const siteLoader = document.querySelector('#site-loader');
    if (siteLoader) {
        // 투명하게 가리고 있는 유리창 레이어를 물리적으로 완벽히 파괴하거나 숨깁니다.
        siteLoader.classList.add('is-loaded');
        siteLoader.style.opacity = '0';
        siteLoader.style.pointerEvents = 'none';
        siteLoader.style.visibility = 'hidden';
        
        // 0.4초 뒤 공간 차지까지 완벽하게 소멸
        setTimeout(() => {
            siteLoader.style.display = 'none';
        }, 400);
    }
};

/* ════════════════════════════════════════
    🔄 루프 애니메이션 및 인터랙션 모션
════════════════════════════════════════ */
const animate = () => {
    window.animFrameId = requestAnimationFrame(animate);
    clock += 0.01;

    if (renderer && scene && camera && modelAnchor) {
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

window.onload = () => {
    initThree();
    animate();
    
    // 혹시나 모델이 늦게 뜨더라도 1초 뒤엔 무조건 글자들이 튀어나오도록 안전장치 설정
    setTimeout(killLoaderScreen, 1000);
};
