import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    ENGINE RE-INIT PROTECTION & CLEANUP
════════════════════════════════════════ */
if (window.animFrameId) {
    cancelAnimationFrame(window.animFrameId);
    window.animFrameId = null;
}

// 전역 상태 변수들 선언
let scene, camera, renderer, modelAnchor;
let mouseX = 0, mouseY = 0;
let isHoveringModel = false;
let clock = 0;
const rotState = { x: 0, y: 0 };

const displayShell = document.querySelector('.landing-display-shell') || document.querySelector('#landing-display');
const follower = document.querySelector('.cursor-follower');
const navLinks = document.querySelectorAll('.topnav a[data-target]');
const sections = [];

// 마우스 및 포인터 보간(Lerp) 트래킹 시스템용 상태 변수
const pointer = {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.5,
    tx: window.innerWidth * 0.5,
    ty: window.innerHeight * 0.5
};
const clamp01 = v => Math.max(0, Math.min(1, v));

/* ════════════════════════════════════════
    ✨ 하이퍼 크롬을 위한 가상 스튜디오 환경 맵 생성 (대비 극대화 버전)
════════════════════════════════════════ */
const setupEnvironmentMap = (targetScene, targetRenderer) => {
    const envScene = new THREE.Scene();
    
    // 🌟 [수정 사항] 단순 흰색 배경광(AmbientLight)을 삭제하여 안 비치는 곳을 어둡게 만듭니다.
    // const baseLight = new THREE.AmbientLight(0xffffff, 1.0);
    // envScene.add(baseLight);

    // 🌟 [수정 사항] 반사판들의 색상을 순백색(0xffffff)으로 올려 하이라이트를 더 쨍하게 만듭니다.

    // 1. 전면 하이라이트를 만들어줄 강력한 대형 반사판
    const plate1 = new THREE.Mesh(
        new THREE.PlaneGeometry(50, 50),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }) // 색상 쨍하게 조정
    );
    plate1.position.set(0, 10, 30);
    plate1.lookAt(0, 0, 0);
    envScene.add(plate1);

    // 2. 좌측 측면 메탈 라인을 살려줄 백색 반사판
    const plate2 = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 60),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }) // 색상 쨍하게 조정
    );
    plate2.position.set(-25, 15, 10);
    plate2.lookAt(0, 0, 0);
    envScene.add(plate2);

    // 3. 우측 모서리에 날카로운 광택을 더해줄 고대비 흑백 반사판
    const plate3 = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 50),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }) // 색상 쨍하게 조정
    );
    plate3.position.set(25, -5, 15);
    plate3.lookAt(0, 0, 0);
    envScene.add(plate3);

    // 4. 상단 천장 조명판
    const plate4 = new THREE.Mesh(
        new THREE.PlaneGeometry(60, 60),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }) // 색상 쨍하게 조정
    );
    plate4.position.set(0, 35, 0);
    plate4.rotation.x = Math.PI / 2;
    envScene.add(plate4);

    const pmremGenerator = new THREE.PMREMGenerator(targetRenderer);
    pmremGenerator.compileEquirectangularShader();
    const envMapTexture = pmremGenerator.fromScene(envScene).texture;
    
    targetScene.environment = envMapTexture;
    if (targetScene.environment) {
        targetScene.environment.needsUpdate = true;
    }
    
    envScene.traverse((child) => {
        if (child.isMesh) {
            child.geometry.dispose();
            child.material.dispose();
        }
    });
    pmremGenerator.dispose();
};

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

/* ════════════════════════════════════════
    📦 THREE.JS 코어 빌드 및 레이아웃 최적화
════════════════════════════════════════ */
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
    renderer.toneMappingExposure = 1.6; // 대비와 하이라이트 선명도 증폭

    camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0, 5.8);

    setupEnvironmentMap(scene, renderer);
    setupEnvironment(scene);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 3.0);
    dirLight1.position.set(5, 15, 10);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight2.position.set(-10, 5, 5);
    scene.add(dirLight2);

    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/libs/draco/');
    loader.setDRACOLoader(draco);

    loader.load(
        './modeling.glb',
        (gltf) => {
            if (!gltf || !gltf.scene) return;
            const model = gltf.scene;

            // 거울처럼 주변 광택을 완벽 반사시키는 하이퍼 실버 크롬 재질 세팅 (needsUpdate 명시)
            const chromeMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                metalness: 1.0,
                roughness: 0.03,
                envMap: scene.environment,
                envMapIntensity: 6.0,      // 반사 하이라이트 감도 가속
                side: THREE.DoubleSide
            });

            model.traverse((child) => {
                if (child.isMesh) {
                    child.material = chromeMaterial;
                    child.material.needsUpdate = true; // 재질 업데이트 강제
                    child.castShadow = false;
                    child.receiveShadow = false;
                }
            });

            const box = new THREE.Box3().setFromObject(model);
            const center = new THREE.Vector3();
            box.getCenter(center);
            const size = new THREE.Vector3();
            box.getSize(size);

            const maxDim = Math.max(size.x, size.y, size.z);
            
            // 이전 수정 사항 유지: 모델 크기 상향(2.9) 및 위치 상향 오프셋
            const targetBounds = 2.9; 
            const scale = targetBounds / maxDim;

            model.scale.setScalar(scale);
            model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
            model.rotation.set(Math.PI * 0.38, Math.PI * 0.05, Math.PI * 0.12);

            modelAnchor = new THREE.Group();
            modelAnchor.add(model);
            
            // 이전 수정 사항 유지: 기본 앵커 Y 좌표 상향
            modelAnchor.position.set(0, 0.35, 0); 
            scene.add(modelAnchor);

            const siteLoader = document.querySelector('#site-loader');
            if (siteLoader) siteLoader.classList.add('is-loaded');
        },
        undefined,
        (err) => { console.warn('모델 로딩 실패:', err); }
    );
};

/* ════════════════════════════════════════
    🔄 루프 애니메이션 및 인터랙션 엔진
════════════════════════════════════════ */
const animate = () => {
    window.animFrameId = requestAnimationFrame(animate);
    clock += 0.01;

    // 마우스 커서 부드러운 Lerp 보간 연산 엔진
    pointer.x += (pointer.tx - pointer.x) * 0.12;
    pointer.y += (pointer.ty - pointer.y) * 0.12;

    if (follower) {
        follower.style.left = `${pointer.x}px`;
        follower.style.top  = `${pointer.y}px`;
    }

    if (renderer && scene && camera) {
        if (modelAnchor) {
            // 이전 수정 사항 유지: 마우스 호버 인터랙션 엔진
            if (isHoveringModel) {
                const targetX = -mouseY * 0.45;
                const targetY = mouseX * 0.55;
                rotState.x += (targetX - rotState.x) * 0.08;
                rotState.y += (targetY - rotState.y) * 0.08;
            } else {
                rotState.x += (0 - rotState.x) * 0.05;
                rotState.y += 0.004; // 기본 자동 부드러운 전방향 회전
            }
            modelAnchor.rotation.x = rotState.x;
            modelAnchor.rotation.y = rotState.y;
            
            // 이전 수정 사항 유지: 상하 안정적 유영
            modelAnchor.position.y = 0.35 + Math.sin(clock * 0.8) * 0.05; 
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
    ✨ NAV PROGRESS SCROLL INDICATOR ENGINE
════════════════════════════════════════ */
const buildSectionMap = () => {
    navLinks.forEach(link => {
        const id = link.getAttribute('data-target');
        const el = document.getElementById(id);
        if (el) sections.push({ link, el, id, progress: link.querySelector('.nav-progress') });
    });
};

const updateNavProgress = () => {
    const scrollY = window.scrollY;
    const winH = window.innerHeight;
    const docH = document.documentElement.scrollHeight;
    const headerH = 92;

    let activeIdx = -1;
    let maxCoverage = -1;

    sections.forEach((sec, i) => {
        const rect = sec.el.getBoundingClientRect();
        const top = rect.top + scrollY - headerH;
        const bot = top + rect.height;

        const visTop = Math.max(scrollY, top);
        const visBot = Math.min(scrollY + winH, bot);
        const overlap = Math.max(0, visBot - visTop);
        const coverage = overlap / Math.max(rect.height, 1);

        if (coverage > maxCoverage) {
            maxCoverage = coverage;
            activeIdx = i;
        }
    });

    const isAtBottom = (scrollY + winH >= docH - 8);

    sections.forEach((sec, i) => {
        if (i !== activeIdx) {
            if (sec.progress) sec.progress.style.setProperty('--nav-p', '0');
            sec.link.classList.remove('is-active');
            return;
        }

        sec.link.classList.add('is-active');

        const rect = sec.el.getBoundingClientRect();
        const secTop = rect.top + scrollY - headerH;
        const secH = rect.height;

        const scrolledInSection = scrollY - secTop;
        const totalScrollableRange = secH - (i === sections.length - 1 ? winH - headerH : 100);
        let raw = totalScrollableRange > 0 ? scrolledInSection / totalScrollableRange : 0;
        
        if (scrolledInSection + winH >= secH + 80) raw = 1.0;
        if (isAtBottom && i === sections.length - 1) raw = 1.0;

        if (sec.progress) sec.progress.style.setProperty('--nav-p', clamp01(raw).toFixed(4));
    });
};

/* ════════════════════════════════════════
    📂 FOLDER GUI ARCHIVE INTERACTION
════════════════════════════════════════ */
const FOLDER_DATA = {
    academic: {
        title: '교과 프로젝트 경험',
        path:  '~/archive/academic/',
        items: [
            { text: '학생 마음 건강 콘텐츠 공모전, 포스터 부문 참여', highlight: false },
            { text: '포토샵 아트워크 & 브랜딩 굿즈 제작 프로젝트', highlight: false },
            { text: '멜론 광고 영상 제작 프로젝트 [공유하는 마음]', highlight: false },
            { text: '맛집 지도 서비스 제작 프로젝트 [MZ]', highlight: true },
            { text: '그래픽 포스터 제작 프로젝트 [모디곰 BI 포스터]', highlight: true },
            { text: '학교 아이덴티티 반영 패턴디자인 제작 프로젝트', highlight: false },
            { text: '흥부전 픽토그램 디자인 프로젝트', highlight: false },
            { text: 'GUI 스타일별 아이콘 제작 프로젝트', highlight: true },
            { text: 'OTT 서비스 디자인 시스템 컴포넌트 및 디자인 시스템 제작 프로젝트', highlight: true },
            { text: '패션 종합 어플리케이션 [MFF] 창업 계획서 작성 프로젝트', highlight: false },
        ]
    },
    club: {
        title: '교내 활동 · 동아리 활동',
        path:  '~/archive/club/',
        items: [
            { text: '급식 티켓팅 서비스 제작 프로젝트 [급식 패스]', highlight: true },
            { text: '미림 해커톤 / 컬러워크 기록 서비스 제작 프로젝트 [투데인트]', highlight: true },
            { text: 'AI ESG 교육 이수', highlight: false },
            { text: 'JS 스터디 홍보 게시물 제작', highlight: true },
        ]
    },
    personal: {
        title: '개인 프로젝트 경험',
        path:  '~/archive/personal/',
        items: [
            { text: '컵에 끼우는 화상 방지용 실리콘 차단물로 창업 아이디어 경진 대회 참여', highlight: false },
            { text: '(진행중) 하루 한번 면접 질문 서비스 제작 프로젝트 [모디곰]', highlight: true },
        ]
    },
    books: {
        title: '독서 경험',
        path:  '~/archive/books/',
        items: [
            { text: '< 라면집도 디자이너가 하면 다르다 > — 강범규', highlight: true },
            { text: '< 디자인 구구단 > — 에이핫', highlight: false },
            { text: '< (UX/UI 디자이너를 위한) 실무 피그마 > — 클레어정', highlight: true },
            { text: '< (비전공자를 위한 이해할 수 있는) IT 지식 > — 최원영', highlight: false },
            { text: '< 1일 1로그 100일 완성 IT 지식 > — 브라이언 W. 커니핸', highlight: false },
            { text: '< 폰트의 비밀 > — 고바야시 아키라', highlight: true },
            { text: '< 갱부 > — 나쓰메 소세키', highlight: false },
        ]
    },
    cert: {
        title: '자격취득내용',
        path:  '~/archive/cert/',
        items: [
            { text: 'GTQ 1급', highlight: false },
            { text: 'ITQ 한글 A급, PPT C급', highlight: false },
        ]
    },
    awards: {
        title: '수상 이력',
        path:  '~/archive/awards/',
        items: [
            { text: '신입생 대표 선서, 학교장 장학금', highlight: true },
            { text: '1학년 1학기 일본어 교과우수상 수상', highlight: false },
            { text: '피그마 재즈 대상 수상', highlight: true },
            { text: 'AI ESG 교육 이수 수료증', highlight: false },
        ]
    }
};

const setupFolderGUI = () => {
    const grid = document.getElementById('desktop-grid');
    const modal = document.getElementById('folder-modal');
    const modalClose = document.getElementById('modal-close');
    const modalBack = document.getElementById('modal-backdrop');
    const modalTitle = document.getElementById('modal-title');
    const modalPath = document.getElementById('modal-path');
    const modalBody = document.getElementById('modal-body');

    if (!grid || !modal) return;
    let selectedItem = null;

    const openModal = (folderKey) => {
        const data = FOLDER_DATA[folderKey];
        if (!data) return;

        modalTitle.textContent = data.title;
        modalPath.textContent = data.path;

        const sectionLabel = document.createElement('p');
        sectionLabel.className = 'modal-section-title';
        sectionLabel.textContent = 'FILES';

        const list = document.createElement('ul');
        list.className = 'modal-file-list';

        data.items.forEach(item => {
            const li = document.createElement('li');
            li.className = 'modal-file-item' + (item.highlight ? ' is-highlight' : '');

            const icon = document.createElement('span');
            icon.className = 'file-icon';
            icon.textContent = item.highlight ? '★' : '›';
            
            // 이전 수정 사항 유지: 폴더 아이콘 원 내부 중앙 정렬
            icon.style.display = 'inline-flex';
            icon.style.alignItems = 'center';
            icon.style.justifyContent = 'center';

            const text = document.createElement('span');
            text.textContent = item.text;

            li.appendChild(icon);
            li.appendChild(text);
            list.appendChild(li);
        });

        modalBody.innerHTML = '';
        modalBody.appendChild(sectionLabel);
        modalBody.appendChild(list);

        modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    };

    const closeModal = () => {
        modal.classList.remove('is-open');
        document.body.style.overflow = '';
    };

    grid.addEventListener('click', (e) => {
        const item = e.target.closest('.folder-item');
        if (!item) {
            if (selectedItem) {
                selectedItem.classList.remove('is-selected');
                selectedItem = null;
            }
            return;
        }
        if (selectedItem && selectedItem !== item) {
            selectedItem.classList.remove('is-selected');
        }
        item.classList.add('is-selected');
        selectedItem = item;
    });

    grid.addEventListener('dblclick', (e) => {
        const item = e.target.closest('.folder-item');
        if (!item) return;
        item.classList.add('is-opening');
        setTimeout(() => item.classList.remove('is-opening'), 200);
        openModal(item.dataset.folder);
    });

    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modalBack) modalBack.addEventListener('click', closeModal);
};

/* ════════════════════════════════════════
    ✨ SCROLL REVEAL CARD ENGINE
════════════════════════════════════════ */
const setupReveal = () => {
    const cards = document.querySelectorAll('.reveal-card');
    if (!cards.length) return;
    const obs = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    obs.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.1, rootMargin: '0px 0px -8% 0px' }
    );
    cards.forEach(c => obs.observe(c));
};

/* ════════════════════════════════════════
    ✨ EVENT LISTENERS & INTERACTION SYSTEM
════════════════════════════════════════ */
window.addEventListener('mousemove', (e) => {
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;

    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    mouseX = (e.clientX / width) * 2 - 1;
    mouseY = -(e.clientY / height) * 2 + 1;
}, { passive: true });

if (displayShell) {
    displayShell.addEventListener('pointerenter', () => { isHoveringModel = true; });
    displayShell.addEventListener('pointerleave', () => { isHoveringModel = false; });
}

window.addEventListener('resize', () => {
    handleResize();
    updateNavProgress();
});

window.addEventListener('scroll', () => {
    updateNavProgress();
    const spotlight = document.querySelector('.page-spotlight');
    if (spotlight) {
        const px = (pointer.x / window.innerWidth) * 100;
        const py = (pointer.y / window.innerHeight) * 100;
        spotlight.style.setProperty('--page-pointer-x', `${px}%`);
        spotlight.style.setProperty('--page-pointer-y', `${py}%`);
    }
}, { passive: true });

/* ════════════════════════════════════════
    🔥 INITIALIZATION ON LOAD
════════════════════════════════════════ */
window.onload = () => {
    buildSectionMap();
    setupFolderGUI();
    setupReveal();
    initThree();
    animate();
    updateNavProgress();
};
