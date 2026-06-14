@@ -2,7 +2,7 @@ import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// 애니메이션 프레임 전역 관리
// 기존 애니메이션 루프 및 잔여 데이터 완벽 제거
if (window.animFrameId) {
    cancelAnimationFrame(window.animFrameId);
    window.animFrameId = null;
@@ -17,49 +17,89 @@ const rotState = { x: 0, y: 0 };
const displayShell = document.querySelector('.landing-display-shell') || document.querySelector('#landing-display');

/* ════════════════════════════════════════
    ✨ 메탈 텍스처를 살려주는 초간결 조명/환경 시스템
    ✨ 하이퍼 크롬을 위한 가상 스튜디오 환경 맵 생성
════════════════════════════════════════ */
const setupEnvironment = (targetScene) => {
    // 사방에서 들어오는 은은한 기본 빛 (진흙처럼 어두워지는 현상 방지)
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
const setupEnvironmentMap = (targetScene, targetRenderer) => {
    // 흑화 현상을 막고 금속면에 반사될 고대비 불빛 판들을 가상 공간에 배치합니다.
    const envScene = new THREE.Scene();
    
    // 은은한 전체 배경 베이스광
    const baseLight = new THREE.AmbientLight(0xffffff, 1.0);
    envScene.add(baseLight);

    // 1. 전면 하이라이트를 만들어줄 강력한 대형 반사판
    const plate1 = new THREE.Mesh(
        new THREE.PlaneGeometry(50, 50),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    plate1.position.set(0, 10, 30);
    plate1.lookAt(0, 0, 0);
    envScene.add(plate1);

    // 2. 좌측 측면 메탈 라인을 살려줄 백색 반사판
    const plate2 = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 60),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    plate2.position.set(-25, 15, 10);
    plate2.lookAt(0, 0, 0);
    envScene.add(plate2);

    // 3. 우측 모서리에 날카로운 광택을 더해줄 고대비 흑백 반사판
    const plate3 = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 50),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    plate3.position.set(25, -5, 15);
    plate3.lookAt(0, 0, 0);
    envScene.add(plate3);

    // 4. 상단 천장 조명판
    const plate4 = new THREE.Mesh(
        new THREE.PlaneGeometry(60, 60),
        new THREE.MeshBasicMaterial({ color: 0xdddddd, side: THREE.DoubleSide })
    );
    plate4.position.set(0, 35, 0);
    plate4.rotation.x = Math.PI / 2;
    envScene.add(plate4);

    // 가상 스튜디오 풍경을 360도 환경 텍스처(PMREM)로 램에 굽습니다.
    const pmremGenerator = new THREE.PMREMGenerator(targetRenderer);
    pmremGenerator.compileEquirectangularShader();
    const envMapTexture = pmremGenerator.fromScene(envScene).texture;
    
    // 메인 씬의 환경 맵으로 등록 (이제 메탈 재질이 이 가상 스튜디오를 반사합니다)
    targetScene.environment = envMapTexture;
    
    // 메모리 해제 및 정리
    envScene.traverse((child) => {
        if (child.isMesh) {
            child.geometry.dispose();
            child.material.dispose();
        }
    });
    pmremGenerator.dispose();
};

/* ════════════════════════════════════════
    📦 THREE.JS 완전 초기화 (물리적 캔버스 리셋 방식)
    📦 THREE.JS 코어 빌드 및 레이아웃 최적화
════════════════════════════════════════ */
const initThree = () => {
    if (!displayShell) return;

    // 1. 유령 모델 원천 차단: 기존에 있던 캔버스를 완전히 파괴하고 새로 만듭니다.
    // 중복 캔버스 충돌 방지 및 초기화
    const oldCanvas = document.querySelector('#model-canvas');
    if (oldCanvas) oldCanvas.remove();

    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'model-canvas';
    // CSS 레이아웃에 맞춰 꽉 차게 설정
    newCanvas.style.width = '100%';
    newCanvas.style.height = '100%';
    displayShell.appendChild(newCanvas);

    // 2. CSS 배치와 폰트가 다 완료된 시점의 크기를 정확하게 측정
    const width = displayShell.clientWidth || 650;
    const height = displayShell.clientHeight || 650;

    // 3. Three 세팅 빌드
    scene = new THREE.Scene();

    renderer = new THREE.WebGLRenderer({
@@ -72,15 +112,25 @@ const initThree = () => {
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4; // 칙칙함을 날려버릴 밝기 보정
    renderer.toneMappingExposure = 1.5; // 메탈이 더 밝고 쨍하게 빛나도록 노출 가속

    // 4. 왜곡 방지 카메라 스케일 고정
    // 📐 [잘림 방지 설계 1] 카메라 거리를 5.2에서 5.8로 뒤로 한 걸음 물려 시야각 확보
    camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0, 5.2);
    camera.position.set(0, 0, 5.8);

    // 환경 맵 스튜디오 가동
    setupEnvironmentMap(scene, renderer);

    // 입체감을 극대화할 보조 직사광선 추가
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 3.0);
    dirLight1.position.set(5, 15, 10);
    scene.add(dirLight1);

    setupEnvironment(scene);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight2.position.set(-10, 5, 5);
    scene.add(dirLight2);

    // 5. GLTF 로드
    // GLTF 로더 엔진 가동
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/libs/draco/');
@@ -92,44 +142,46 @@ const initThree = () => {
            if (!gltf || !gltf.scene) return;
            const model = gltf.scene;

            // 눈이 부시도록 반짝이는 은빛 하이퍼 크롬 재질 강제 주입
            // 🌟 반사광을 극대화하여 거울처럼 반짝이게 만드는 하이퍼 실버 크롬 재질
            const chromeMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                metalness: 0.98,          // 메탈 100%에 가깝게
                roughness: 0.08,          // 매끄러운 표면
                envMapIntensity: 2.0,
                color: 0xffffff,          // 순백색 베이스 (탁한 회색 기운 삭제)
                metalness: 1.0,           // 금속성 100% 완전 메탈
                roughness: 0.03,          // 표면을 유리처럼 매끄럽게 깎아 반사 선명도 극대화
                envMapIntensity: 5.0,     // 환경 맵 반사광 세기를 5배로 증폭
                side: THREE.DoubleSide
            });

            model.traverse((child) => {
                if (child.isMesh) {
                    child.material = chromeMaterial;
                    child.castShadow = false;
                    child.receiveShadow = false;
                }
            });

            // 바운딩 박스로 중심점 및 크기 정상화 (누워버리거나 묻히는 버그 방지)
            // 바운딩 박스를 기준으로 중앙 정렬
            const box = new THREE.Box3().setFromObject(model);
            const center = new THREE.Vector3();
            box.getCenter(center);
            const size = new THREE.Vector3();
            box.getSize(size);

            const maxDim = Math.max(size.x, size.y, size.z);
            const targetBounds = 3.3; 
            // 📐 [잘림 방지 설계 2] 모델 크기 타겟 비율을 3.3에서 2.6으로 줄여 화면 내부 안전존에 안착
            const targetBounds = 2.6; 
            const scale = targetBounds / maxDim;

            model.scale.setScalar(scale);
            // 원본 모델의 꼬인 좌표축을 정중앙(0,0,0)으로 강제 일치시킵니다.
            model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

            // 처음 기획했던 얼짱 각도로 정면 고정
            // 시그니처 얼짱 각도 셋팅
            model.rotation.set(Math.PI * 0.38, Math.PI * 0.05, Math.PI * 0.12);

            modelAnchor = new THREE.Group();
            modelAnchor.add(model);
            scene.add(modelAnchor);

            // 로더 제거
            // 로딩 스크린 해제
            const siteLoader = document.querySelector('#site-loader');
            if (siteLoader) siteLoader.classList.add('is-loaded');
        },
@@ -139,7 +191,7 @@ const initThree = () => {
};

/* ════════════════════════════════════════
    🔄 루프 애니메이션 및 반응형 이벤트
    🔄 루프 애니메이션 및 인터랙션
════════════════════════════════════════ */
const animate = () => {
    window.animFrameId = requestAnimationFrame(animate);
@@ -148,20 +200,18 @@ const animate = () => {
    if (renderer && scene && camera) {
        if (modelAnchor) {
            if (isHoveringModel) {
                // 마우스 트래킹 반응
                const targetX = -mouseY * 0.35;
                const targetY = mouseX * 0.45;
                rotState.x += (targetX - rotState.x) * 0.08;
                rotState.y += (targetY - rotState.y) * 0.08;
            } else {
                // 평상시 은은한 자동 회전
                rotState.x += (0 - rotState.x) * 0.05;
                rotState.y += 0.004;
                rotState.y += 0.004; // 부드러운 기본 자동 회전
            }
            modelAnchor.rotation.x = rotState.x;
            modelAnchor.rotation.y = rotState.y;
            // 상하 부드러운 둥둥 가속도 효과
            modelAnchor.position.y = Math.sin(clock * 0.8) * 0.04;
            // 상하로 부드럽게 유영하는 효과 추가
            modelAnchor.position.y = Math.sin(clock * 0.8) * 0.05;
        }
        renderer.render(scene, camera);
    }
@@ -177,7 +227,6 @@ const handleResize = () => {
    camera.updateProjectionMatrix();
};

// 마우스 위치 갱신 및 마우스 팔로워 연동
window.addEventListener('mousemove', (e) => {
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
@@ -198,7 +247,6 @@ if (displayShell) {

window.addEventListener('resize', handleResize);

// 🔥 핵심 변경점: HTML 레이아웃과 CSS가 완전히 로드되어 배치된 후 비로소 단 '한 번만' 렌더링 엔진을 가동합니다.
window.onload = () => {
    initThree();
    animate();
    // ──────────────────────────────────────────────────────────
// 🌟 여기 위쪽은 기존에 작성해 두신 원래 코드 수백 줄이 그대로 살아있어야 합니다!
// ──────────────────────────────────────────────────────────

// 기존 코드를 보호하기 위해 완전히 독립된 공간(IIFE)을 만들어 별만 따로 실행합니다.
(function () {
    let scene, camera, renderer, modelAnchor;
    let mX = 0, mY = 0;
    let isHover = false;
    let clockTime = 0;
    const currentRot = { x: 0, y: 0 };

    // 별이 들어갈 레이아웃 박스 찾기
    const shell = document.querySelector('.landing-display-shell') || document.querySelector('#landing-display');
    if (!shell) return; 

    // 크롬 반사용 가상 환경 맵 설정
    const buildEnv = (tScene, tRender) => {
        const eScene = new THREE.Scene();
        eScene.add(new THREE.AmbientLight(0xffffff, 1.5));
        const p1 = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        p1.position.set(0, 15, 35); p1.lookAt(0, 0, 0); eScene.add(p1);
        const p2 = new THREE.Mesh(new THREE.PlaneGeometry(40, 80), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        p2.position.set(-35, 20, 15); p2.lookAt(0, 0, 0); eScene.add(p2);
        const p3 = new THREE.Mesh(new THREE.PlaneGeometry(30, 60), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        p3.position.set(35, -5, 20); p3.lookAt(0, 0, 0); eScene.add(p3);
        const pmrem = new THREE.PMREMGenerator(tRender);
        pmrem.compileEquirectangularShader();
        tScene.environment = pmrem.fromScene(eScene).texture;
        eScene.traverse(c => { if (c.isMesh) { c.geometry.dispose(); c.material.dispose(); } });
        pmrem.dispose();
    };

    const startThreeSpace = () => {
        const oldCanvas = document.querySelector('#model-canvas');
        if (oldCanvas) oldCanvas.remove();

        const canvas = document.createElement('canvas');
        canvas.id = 'model-canvas';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        shell.appendChild(canvas);

        scene = new THREE.Scene();
        renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(shell.clientWidth, shell.clientHeight);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.7;

        camera = new THREE.PerspectiveCamera(38, shell.clientWidth / shell.clientHeight, 0.1, 100);
        camera.position.set(0, 0, 5.8);

        buildEnv(scene, renderer);

        // 조명 사방 배치 (별이 까맣게 나오는 현상 방지)
        const l1 = new THREE.DirectionalLight(0xffffff, 3.5); l1.position.set(0, 5, 15); scene.add(l1);
        const l2 = new THREE.DirectionalLight(0xffffff, 2.0); l2.position.set(-15, 10, 5); scene.add(l2);
        const l3 = new THREE.DirectionalLight(0xffffff, 2.0); l3.position.set(15, -10, 5); scene.add(l3);

        // CDN 전역 객체를 사용하여 기존 import 코드와 충돌을 완전히 피함
        const loader = new THREE.GLTFLoader();
        const draco = new THREE.DRACOLoader();
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        loader.setDRACOLoader(draco);

        loader.load(
            './modeling.glb',
            (gltf) => {
                if (!gltf || !gltf.scene) return;
                const model = gltf.scene;

                const chromeMat = new THREE.MeshStandardMaterial({
                    color: 0xffffff,          
                    metalness: 1.0,           
                    roughness: 0.01,          
                    envMapIntensity: 5.5,     
                    side: THREE.DoubleSide
                });

                model.traverse(child => { if (child.isMesh) child.material = chromeMat; });

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
                
                // 기존 로딩창이 남아있다면 강제 제거
                const loaderEl = document.querySelector('#site-loader');
                if (loaderEl) loaderEl.style.display = 'none';
            },
            undefined,
            (err) => { console.warn('모델 로딩 실패:', err); }
        );
    };

    const loop = () => {
        requestAnimationFrame(loop);
        clockTime += 0.01;

        if (renderer && scene && camera && modelAnchor) {
            if (isHover) {
                const tx = -mY * 0.35; const ty = mX * 0.45;
                currentRot.x += (tx - currentRot.x) * 0.08; currentRot.y += (ty - currentRot.y) * 0.08;
            } else {
                currentRot.x += (0 - currentRot.x) * 0.05; currentRot.y += 0.004;
            }
            modelAnchor.rotation.x = currentRot.x; modelAnchor.rotation.y = currentRot.y;
            modelAnchor.position.y = Math.sin(clockTime * 0.8) * 0.05;
            renderer.render(scene, camera);
        }
    };

    window.addEventListener('mousemove', (e) => {
        mX = (e.clientX / window.innerWidth) * 2 - 1;
        mY = -(e.clientY / window.innerHeight) * 2 + 1;
    }, { passive: true });

    shell.addEventListener('pointerenter', () => { isHover = true; });
    shell.addEventListener('pointerleave', () => { isHover = false; });

    window.addEventListener('resize', () => {
        if (!renderer || !camera || !shell) return;
        renderer.setSize(shell.clientWidth, shell.clientHeight);
        camera.aspect = shell.clientWidth / shell.clientHeight;
        camera.updateProjectionMatrix();
    });

    // 기존 UI 로드가 꼬이지 않도록 0.1초 대기 후 안전하게 실행
    setTimeout(() => {
        startThreeSpace();
        loop();
    }, 100);
})();
