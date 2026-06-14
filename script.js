import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// 전역 상태 초기화 및 중복 생성 방지
if (window.animFrameId) cancelAnimationFrame(window.animFrameId);
if (window.threeRenderer) window.threeRenderer.dispose();
/* ════════════════════════════════════════
    🧹 유령 모델링 원천 차단 (CLEANUP CORE)
════════════════════════════════════════ */
if (window.animFrameId) {
    cancelAnimationFrame(window.animFrameId);
    window.animFrameId = null;
}

// 기존에 남아있던 전역 변수나 씬 구조가 있다면 완전히 도려냅니다.
if (window.threeRenderer) {
    window.threeRenderer.dispose();
    window.threeRenderer = null;
}
if (window.threeScene) {
    while(window.threeScene.children.length > 0){ 
        const obj = window.threeScene.children[0];
        window.threeScene.remove(obj); 
    }
    window.threeScene = null;
}

// 완전히 깨끗한 상태에서 새 장면 정의
window.threeScene = new THREE.Scene();
const modelCanvas = document.querySelector('#model-canvas');
const displayShell = document.querySelector('.landing-display-shell') || document.querySelector('#landing-display');
@@ -15,7 +33,6 @@ let isHoveringModel = false;
let clock = 0;
const rotState = { x: 0, y: 0 };

// 로더 가리기
const hideSiteLoader = () => {
    const siteLoader = document.querySelector('#site-loader');
    if (siteLoader) {
@@ -24,62 +41,66 @@ const hideSiteLoader = () => {
};

/* ════════════════════════════════════════
    ✨ 크롬 메탈에 생명을 불어넣는 은빛 반사판 환경 세팅
    ✨ 크롬 하이라이트용 환경 맵 세팅
════════════════════════════════════════ */
const setupEnvironment = (scene, renderer) => {
    // 오브젝트 주변에 가상의 거대한 흰색/회색 불빛 판들을 배치하여 메탈 면에 쨍한 하이라이트가 맺히게 합니다.
    const envGroup = new THREE.Group();

    // 1. 좌측 상단 강한 반사판
    // 반사판 1 (좌측 상단)
    const lightPlate1 = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 30),
        new THREE.PlaneGeometry(35, 35),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    lightPlate1.position.set(-15, 20, 15);
    lightPlate1.lookAt(0, 0, 0);
    envGroup.add(lightPlate1);

    // 2. 우측 정면 백색 반사판 (이게 있어야 전면이 쨍해집니다)
    // 반사판 2 (우측 정면 강한 하이라이트)
    const lightPlate2 = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 40),
        new THREE.PlaneGeometry(45, 45),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    lightPlate2.position.set(20, 5, 25);
    lightPlate2.position.set(20, 8, 25);
    lightPlate2.lookAt(0, 0, 0);
    envGroup.add(lightPlate2);

    // 3. 상단 천장 전체 조명판
    // 반사판 3 (천장 베이스광)
    const lightPlate3 = new THREE.Mesh(
        new THREE.PlaneGeometry(50, 50),
        new THREE.MeshBasicMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide })
        new THREE.PlaneGeometry(60, 60),
        new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide })
    );
    lightPlate3.position.set(0, 30, 0);
    lightPlate3.position.set(0, 35, 0);
    lightPlate3.rotation.x = Math.PI / 2;
    envGroup.add(lightPlate3);

    scene.add(envGroup);

    // PMREM Generator를 이용해 반사판들을 360도 환경 맵 텍스처로 변환
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envMapTexture = pmremGenerator.fromScene(envGroup).texture;

    scene.environment = envMapTexture;
    envGroup.visible = false; // 텍스처를 구운 후 실제 판들은 화면에서 숨김
    envGroup.visible = false; 
    
    // 메모리 누수 방지 리소스 해제
    envGroup.traverse((child) => {
        if (child.isMesh) {
            child.geometry.dispose();
            child.material.dispose();
        }
    });
    pmremGenerator.dispose();
};

/* ════════════════════════════════════════
    📦 THREE.JS 코어 초기화 (왜곡 절대 방지 수식 적용)
    📦 THREE.JS 코어 초기화 (1 프레임 단 한 번만 실행)
════════════════════════════════════════ */
const initThree = () => {
    if (!modelCanvas || !displayShell) { hideSiteLoader(); return; }

    // 찌그러짐 방지: 캔버스가 들어갈 실제 DOM의 크기를 정확하게 측정합니다.
    const width = displayShell.clientWidth || 650;
    const height = displayShell.clientHeight || 650;

    // 렌더러 설정
    window.threeRenderer = new THREE.WebGLRenderer({
        canvas: modelCanvas,
        alpha: true,
@@ -90,41 +111,44 @@ const initThree = () => {
    window.threeRenderer.setSize(width, height);
    window.threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
    window.threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    window.threeRenderer.toneMappingExposure = 1.2;
    window.threeRenderer.toneMappingExposure = 1.25;

    // 카메라 세팅 (종횡비 가로/세로 균등 고정)
    window.threeCamera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    window.threeCamera.position.set(0, 0, 5.2);
    window.threeCamera.position.set(0, 0, 5.3);

    // 은빛 반사 환경 맵 적용
    setupEnvironment(window.threeScene, window.threeRenderer);

    // 기본 조명 추가 (반사 외에 기본 음영 베이스용)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    // 흑화 현상 방지용 기본 조명 보강
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    window.threeScene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(5, 10, 7);
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLight.position.set(5, 12, 8);
    window.threeScene.add(dirLight);

    // GLTF 로더 세팅
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/libs/draco/');
    loader.setDRACOLoader(draco);

    // 중복 호출로 씬에 누적되는 현상 방지를 위해 기존 modelAnchor 완전 삭제
    if (window.modelAnchor) {
        window.threeScene.remove(window.modelAnchor);
        window.modelAnchor = null;
    }

    loader.load(
        './modeling.glb',
        (gltf) => {
            if (!gltf || !gltf.scene) { hideSiteLoader(); return; }
            const model = gltf.scene;

            // ✨ 무조건 거울처럼 쨍하게 반사되도록 만든 완전 크롬 신소재 질감
            // 크롬 실버 메탈 질감 강제 주입
            const chromeMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,          // 백색 베이스
                metalness: 1.0,           // 철 수치 100% (완전 메탈)
                roughness: 0.05,          // 표면 거칠기 최소화 (거울처럼 반사)
                envMapIntensity: 3.5,     // 반사광 강도 극대화
                color: 0xffffff,         
                metalness: 1.0,          
                roughness: 0.08,         
                envMapIntensity: 4.0,    
                side: THREE.DoubleSide
            });

@@ -134,22 +158,19 @@ const initThree = () => {
                }
            });

            // 오브젝트의 정중앙을 잡고 크기 자동 정렬 (아래 묻히는 버그 방지)
            // 바운딩 박스를 기준으로 화면 정중앙 배치 정렬
            const box = new THREE.Box3().setFromObject(model);
            const center = new THREE.Vector3();
            box.getCenter(center);
            const size = new THREE.Vector3();
            box.getSize(size);

            const maxDim = Math.max(size.x, size.y, size.z);
            const targetBounds = 3.2; // 화면 안에 가장 예쁘게 들어오는 크기 비율
            const targetBounds = 3.2; 
            const scale = targetBounds / maxDim;

            model.scale.setScalar(scale);
            // 정중앙 좌표 보정 및 아래 파묻히지 않도록 Y축 중심점 완벽 강제 일치
            model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

            // 초기 각도 기획안 매칭
            model.rotation.set(Math.PI * 0.38, Math.PI * 0.05, Math.PI * 0.12);

            window.modelAnchor = new THREE.Group();
@@ -160,14 +181,14 @@ const initThree = () => {
        },
        undefined,
        (err) => {
            console.warn('모델 로드 오류:', err);
            console.warn('모델 로드 실패:', err);
            hideSiteLoader();
        }
    );
};

/* ════════════════════════════════════════
    🔄 루프 애니메이션 및 반응형 이벤트
    🔄 루프 애니메이션 및 이벤트 바인딩
════════════════════════════════════════ */
const animate = () => {
    window.animFrameId = requestAnimationFrame(animate);
@@ -176,26 +197,22 @@ const animate = () => {
    if (window.threeRenderer && window.threeScene && window.threeCamera) {
        if (window.modelAnchor) {
            if (isHoveringModel) {
                // 마우스 반응 부드럽게 보간
                const targetX = -mouseY * 0.3;
                const targetY = mouseX * 0.4;
                const targetX = -mouseY * 0.35;
                const targetY = mouseX * 0.45;
                rotState.x += (targetX - rotState.x) * 0.08;
                rotState.y += (targetY - rotState.y) * 0.08;
            } else {
                // 마우스를 뗐을 때 은은하게 자동 회전
                rotState.x += (0 - rotState.x) * 0.05;
                rotState.y += 0.003;
                rotState.y += 0.004; // 부드러운 기본 자동 회전
            }
            window.modelAnchor.rotation.x = rotState.x;
            window.modelAnchor.rotation.y = rotState.y;
            // 위아래로 부드럽게 둥둥 뜨는 효과
            window.modelAnchor.position.y = Math.sin(clock * 0.8) * 0.05;
            window.modelAnchor.position.y = Math.sin(clock * 0.8) * 0.05; 
        }
        window.threeRenderer.render(window.threeScene, window.threeCamera);
    }
};

// 윈도우 리사이즈 대응 (화면이 변해도 찌그러짐 원천 봉쇄)
const handleResize = () => {
    if (!window.threeRenderer || !window.threeCamera || !displayShell) return;
    const width = displayShell.clientWidth;
@@ -206,35 +223,31 @@ const handleResize = () => {
    window.threeCamera.updateProjectionMatrix();
};

// 마우스 움직임 추적
window.addEventListener('mousemove', (e) => {
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    mouseX = (e.clientX / width) * 2 - 1;
    mouseY = -(e.clientY / height) * 2 + 1;

    // 마우스 커서 팔로워 연동
    const follower = document.querySelector('.cursor-follower');
    if (follower) {
        follower.style.left = `${e.clientX}px`;
        follower.style.top = `${e.clientY}px`;
    }
}, { passive: true });

// 영역 호버 감지
if (displayShell) {
    displayShell.addEventListener('pointerenter', () => { isHoveringModel = true; });
    displayShell.addEventListener('pointerleave', () => { isHoveringModel = false; });
}

window.addEventListener('resize', handleResize);

// 실행
// 메인 초기화 실행
document.addEventListener('DOMContentLoaded', () => {
    initThree();
    animate();
});
// DOM이 이미 완성된 상태일 경우 예외 처리
if (document.readyState !== 'loading') {
    initThree();
    animate();
