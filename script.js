import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    🧹 이전 잔여 데이터 및 애니메이션 루프 즉시 파괴
════════════════════════════════════════ */
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
    ✨ 크롬 재질을 거울처럼 반사시켜 줄 가상 조명판 환경 세팅
════════════════════════════════════════ */
const setupEnvironmentMap = (targetScene, targetRenderer) => {
    const envScene = new THREE.Scene();
    
    const baseLight = new THREE.AmbientLight(0xffffff, 1.2);
    envScene.add(baseLight);

    // 1. 전면 각도를 은빛으로 날카롭게 깎아줄 대형 반사판
    const plate1 = new THREE.Mesh(
        new THREE.PlaneGeometry(60, 60),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    plate1.position.set(0, 15, 35);
    plate1.lookAt(0, 0, 0);
    envScene.add(plate1);

    // 2. 좌측면의 메탈 엣지를 살려줄 반사판
    const plate2 = new THREE.Mesh(
        new THREE.PlaneGeometry(35, 70),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    plate2.position.set(-30, 20, 15);
    plate2.lookAt(0, 0, 0);
    envScene.add(plate2);

    // 3. 우측면 음영 대비를 위한 반사판
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

/* ════════════════════════════════════════
    📦 THREE.JS 독자 실행 (컨텐츠 먹통 현상 해결 방안)
════════════════════════════════════════ */
const initThree = () => {
    if (!displayShell) return;

    // 기존 캔버스 제거 후 독자 생성 (중복 버그 방지)
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
    renderer.toneMappingExposure = 1.6; // 크롬의 하이라이트를 더 쨍하고 화사하게 보정

    // 카메라 위치 확보 (사방 잘림 현상 방지)
    camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0, 5.8);

    setupEnvironmentMap(scene, renderer);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 3.0);
    dirLight1.position.set(5, 15, 10);
    scene.add(dirLight1);

    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/libs/draco/');
    loader.setDRACOLoader(draco);

    loader.load(
        './modeling.glb',
        (gltf) => {
            if (!gltf || !gltf.scene) return;
            const model = gltf.scene;

            // 🌟 거울처럼 주변 가상 스튜디오를 반사하는 리얼 하이퍼 크롬 재질
            const chromeMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,          
                metalness: 1.0,           // 금속성 100% 완전 메탈
                roughness: 0.02,          // 표면을 매끄럽게 깎아 흐릿함 제거
                envMapIntensity: 5.0,     // 반사판 효과 최대치 증폭
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
            const targetBounds = 2.6; // 크기 조절로 위아래 잘림 버그 차단
            const scale = targetBounds / maxDim;
            
            model.scale.setScalar(scale);
            model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
            
            // 정면 얼짱 각도 배치
            model.rotation.set(Math.PI * 0.38, Math.PI * 0.05, Math.PI * 0.12);

            modelAnchor = new THREE.Group();
            modelAnchor.add(model);
            scene.add(modelAnchor);

            // 로딩 스크린 해제
            const siteLoader = document.querySelector('#site-loader');
            if (siteLoader) siteLoader.classList.add('is-loaded');
        },
        undefined,
        (err) => { console.warn('모델 로드 실패:', err); }
    );
};

/* ════════════════════════════════════════
    🔄 루프 애니메이션 및 인터랙션
════════════════════════════════════════ */
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
                rotState.y += 0.004; // 부드러운 평상시 자동 회전
            }
            modelAnchor.rotation.x = rotState.x;
            modelAnchor.rotation.y = rotState.y;
            modelAnchor.position.y = Math.sin(clock * 0.8) * 0.05; // 둥둥 뜨는 효과
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

// 🔥 [핵심 변경] window.onload를 파괴하여 다른 UI 컨텐츠 로딩을 방해하지 않고 독립 실행합니다.
setTimeout(() => {
    initThree();
    animate();
}, 100);
