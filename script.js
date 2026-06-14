import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    🧹 이전 잔여 데이터 및 유령 모델 파괴
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

// 3D 별이 들어갈 레이아웃 박스 가져오기
const displayShell = document.querySelector('.landing-display-shell') || document.querySelector('#landing-display');

/* ════════════════════════════════════════
    ✨ 거울 같은 크롬 효과를 위한 가상 스튜디오 환경 맵
════════════════════════════════════════ */
const setupEnvironmentMap = (targetScene, targetRenderer) => {
    const envScene = new THREE.Scene();
    
    // 사방을 채워줄 기본 은은한 조명
    const baseLight = new THREE.AmbientLight(0xffffff, 1.2);
    envScene.add(baseLight);

    // 1. 전면 모서리를 쨍하게 깎아줄 초대형 흰색 반사판
    const plate1 = new THREE.Mesh(
        new THREE.PlaneGeometry(60, 60),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    plate1.position.set(0, 15, 35);
    plate1.lookAt(0, 0, 0);
    envScene.add(plate1);

    // 2. 좌측면 각도를 살려줄 날카로운 하이라이트 판
    const plate2 = new THREE.Mesh(
        new THREE.PlaneGeometry(35, 70),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    plate2.position.set(-30, 20, 15);
    plate2.lookAt(0, 0, 0);
    envScene.add(plate2);

    // 3. 우측면 음영 대비를 극대화할 반사판
    const plate3 = new THREE.Mesh(
        new THREE.PlaneGeometry(25, 60),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    plate3.position.set(30, -5, 20);
    plate3.lookAt(0, 0, 0);
    envScene.add(plate3);

    // 가상 스튜디오 조명들을 360도 환경 텍스처로 굽기
    const pmremGenerator = new THREE.PMREMGenerator(targetRenderer);
    pmremGenerator.compileEquirectangularShader();
    const envMapTexture = pmremGenerator.fromScene(envScene).texture;
    
    // 메인 장면에 환경 맵 적용 (이제 별 표면에 이 판들이 거울처럼 비칩니다)
    targetScene.environment = envMapTexture;
    
    // 메모리 정리
    envScene.traverse((child) => {
        if (child.isMesh) {
            child.geometry.dispose();
            child.material.dispose();
        }
    });
    pmremGenerator.dispose();
};

/* ════════════════════════════════════════
    📦 THREE.JS 코어 빌드 (물리적 캔버스 리셋)
════════════════════════════════════════ */
const initThree = () => {
    if (!displayShell) return;

    // 중복 생성 차단: 이미 존재하던 옛날 캔버스는 무조건 삭제
    const oldCanvas = document.querySelector('#model-canvas');
    if (oldCanvas) oldCanvas.remove();

    // 완전히 깨끗한 새 캔버스 생성 및 삽입
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
    renderer.toneMappingExposure = 1.6; // 탁한 기운을 날려버릴 화사한 노출 값

    // 📐 [잘림 방지 1] 카메라를 뒤로 물려 전체적인 시야 확보
    camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0, 5.8);

    // 반사 텍스처 환경 세팅 가동
    setupEnvironmentMap(scene, renderer);

    // 입체감을 더해줄 기본 직사광선 보강
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 3.0);
    dirLight1.position.set(5, 15, 10);
    scene.add(dirLight1);

    // 3D 모델 로드 시작
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/libs/draco/');
    loader.setDRACOLoader(draco);

    loader.load(
        './modeling.glb',
        (gltf) => {
            if (!gltf || !gltf.scene) return;
            const model = gltf.scene;

            // 🌟 반사광을 5배 뻥튀기한 초고광택 실버 크롬 재질 강제 주입
            const chromeMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,          // 탁한 회색 없는 순백의 은색
                metalness: 1.0,           // 금속성 100% 완전 메탈
                roughness: 0.02,          // 표면 거칠기 최소화 (유리 같은 선명한 반사)
                envMapIntensity: 5.0,     // 가상 반사판들의 빛을 극대화
                side: THREE.DoubleSide
            });

            model.traverse((child) => {
                if (child.isMesh) {
                    child.material = chromeMaterial;
                }
            });

            // 바운딩 박스로 크기 및 중심점 재정렬
            const box = new THREE.Box3().setFromObject(model);
            const center = new THREE.Vector3();
            box.getCenter(center);
            const size = new THREE.Vector3();
            box.getSize(size);

            const maxDim = Math.max(size.x, size.y, size.z);
            // 📐 [잘림 방지 2] 크기 비율을 안전 범위(2.6)로 축소하여 화면 정중앙 안착
            const targetBounds = 2.6; 
            const scale = targetBounds / maxDim;
            
            model.scale.setScalar(scale);
            model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
            
            // 기획서에 있던 시그니처 얼짱 각도 세팅
            model.rotation.set(Math.PI * 0.38, Math.PI * 0.05, Math.PI * 0.12);

            modelAnchor = new THREE.Group();
            modelAnchor.add(model);
            scene.add(modelAnchor);

            // 로딩 화면 제거
            const siteLoader = document.querySelector('#site-loader');
            if (siteLoader) siteLoader.classList.add('is-loaded');
        },
        undefined,
        (err) => { console.warn('모델 로드 실패:', err); }
    );
};

/* ════════════════════════════════════════
    🔄 루프 애니메이션 및 부드러운 회전 효과
════════════════════════════════════════ */
const animate = () => {
    window.animFrameId = requestAnimationFrame(animate);
    clock += 0.01;

    if (renderer && scene && camera) {
        if (modelAnchor) {
            if (isHoveringModel) {
                // 마우스 트래킹 반응 (유연한 보간 적용)
                const targetX = -mouseY * 0.35;
                const targetY = mouseX * 0.45;
                rotState.x += (targetX - rotState.x) * 0.08;
                rotState.y += (targetY - rotState.y) * 0.08;
            } else {
                // 마우스가 없을 때 은은하게 자동 자전
                rotState.x += (0 - rotState.x) * 0.05;
                rotState.y += 0.004;
            }
            modelAnchor.rotation.x = rotState.x;
            modelAnchor.rotation.y = rotState.y;
            // 위아래로 부드럽게 둥둥 뜨는 가속도 효과
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

/* ════════════════════════════════════════
    🖱️ 마우스 이벤트 감지
════════════════════════════════════════ */
window.addEventListener('mousemove', (e) => {
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    mouseX = (e.clientX / width) * 2 - 1;
    mouseY = -(e.clientY / height) * 2 + 1;

    // 마우스 커서 follower가 있다면 연동
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

// 모든 스타일과 배치가 끝난 시점에 완벽하게 실행
window.onload = () => {
    initThree();
    animate();
};
