import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// 애니메이션 프레임 전역 관리 및 중복 루프 제거
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
    ✨ 메탈 텍스처를 살려주는 초간결 조명/환경 시스템
════════════════════════════════════════ */
const setupEnvironment = (targetScene) => {
    // 사방에서 들어오는 은은한 기본 빛
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    targetScene.add(ambientLight);

    // 정면과 측면에서 메탈 질감을 하얗게 반사시킬 강력한 직사광선 배치
    const keyLight = new THREE.DirectionalLight(0xffffff, 4.0);
    keyLight.position.set(5, 8, 10);
    targetScene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 2.0);
    fillLight.position.set(-8, 5, 5);
    targetScene.add(fillLight);

    const topLight = new THREE.DirectionalLight(0xffffff, 2.5);
    topLight.position.set(0, 15, 2);
    targetScene.add(topLight);
}; // 🌟 유실되었던 setupEnvironment의 닫는 괄호를 완벽하게 수리 완료했습니다!

const setupEnvironmentMap = (targetScene, targetRenderer) => {
    // 흑화 현상을 막고 금속면에 반사될 고대비 불빛 판들을 가상 공간에 배치합니다.
    const envScene = new THREE.Scene();
    
    const baseLight = new THREE.AmbientLight(0xffffff, 1.0);
    envScene.add(baseLight);

    const plate1 = new THREE.Mesh(
        new THREE.PlaneGeometry(50, 50),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    plate1.position.set(0, 10, 30);
    plate1.lookAt(0, 0, 0);
    envScene.add(plate1);

    const plate2 = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 60),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    plate2.position.set(-25, 15, 10);
    plate2.lookAt(0, 0, 0);
    envScene.add(plate2);

    const plate3 = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 50),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    plate3.position.set(25, -5, 15);
    plate3.lookAt(0, 0, 0);
    envScene.add(plate3);

    const plate4 = new THREE.Mesh(
        new THREE.PlaneGeometry(60, 60),
        new THREE.MeshBasicMaterial({ color: 0xdddddd, side: THREE.DoubleSide })
    );
    plate4.position.set(0, 35, 0);
    plate4.rotation.x = Math.PI / 2;
    envScene.add(plate4);

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
    📦 THREE.JS 완전 초기화 및 모델 로드
════════════════════════════════════════ */
const initThree = () => {
    if (!displayShell) return;

    // 중복 캔버스 충돌 방지 및 물리적 리셋
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
    renderer.toneMappingExposure = 1.5;

    camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0, 5.8);

    setupEnvironmentMap(scene, renderer);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 3.0);
    dirLight1.position.set(5, 15, 10);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight2.position.set(-10, 5, 5);
    scene.add(dirLight2);

    setupEnvironment(scene);

    // 상단에서 명확하게 불러온 클래스 생성자를 안전하게 호출
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

            // 로딩 완료 후 스크린 클래스 제어
            const siteLoader = document.querySelector('#site-loader');
            if (siteLoader) siteLoader.classList.add('is-loaded');
        },
        undefined,
        (err) => { console.warn('모델 로딩 실패:', err); }
    );
};

/* ════════════════════════════════════════
    🔄 루프 애니메이션 및 오리지널 호버 모션 수식
════════════════════════════════════════ */
const animate = () => {
    window.animFrameId = requestAnimationFrame(animate);
    clock += 0.01;

    if (renderer && scene && camera) {
        if (modelAnchor) {
            // ⭐ 마우스 호버 여부에 맞춰 쫀득하게 반응하는 인터랙션 복구 완료!
            if (isHoveringModel) {
                const targetX = -mouseY * 0.35;
                const targetY = mouseX * 0.45;
                rotState.x += (targetX - rotState.x) * 0.08;
                rotState.y += (targetY - rotState.y) * 0.08;
            } else {
                rotState.x += (0 - rotState.x) * 0.05;
                rotState.y += 0.004; // 원래 기획하신 부드러운 자동 자전 효과
            }
            modelAnchor.rotation.x = rotState.x;
            modelAnchor.rotation.y = rotState.y;
            modelAnchor.position.y = Math.sin(clock * 0.8) * 0.05; // 둥둥 유영 효과
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

// 마우스 좌표 정규화 및 커서 팔로워 연동
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

// 마우스 진입/이탈 상태 정상 감지 바인딩
if (displayShell) {
    displayShell.addEventListener('pointerenter', () => { isHoveringModel = true; });
    displayShell.addEventListener('pointerleave', () => { isHoveringModel = false; });
}

window.addEventListener('resize', handleResize);

// 모든 요소 배치가 완벽히 끝난 타이밍에 빌드
window.onload = () => {
    initThree();
    animate();

    // 화면 가림 무한 대기 버그 강제 해결 및 레이아웃 해제
    const siteLoader = document.querySelector('#site-loader');
    if (siteLoader) {
        siteLoader.style.opacity = '0';
        siteLoader.style.pointerEvents = 'none';
        setTimeout(() => { siteLoader.style.display = 'none'; }, 500);
    }
};
