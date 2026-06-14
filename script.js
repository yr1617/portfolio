import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'; 

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

// 🌟 우리가 원하는 고정 종횡비 (가로/세로 비율, 예: 1.0은 1:1 정방형)
// 브라우저 CSS가 이 비율을 무시하고 늘려도, 이 비율대로 캔버스 내부를 그립니다.
const TARGET_ASPECT = 1.0; 

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
    ✨ 하이퍼 크롬을 위한 가상 스튜디오 환경 맵 생성 (백업용 고대비 버전)
════════════════════════════════════════ */
const setupEnvironmentMap = (targetScene, targetRenderer) => {
    const envScene = new THREE.Scene();
    
    // 1. 전면 하이라이트를 만들어줄 강력한 대형 반사판
    const plate1 = new THREE.Mesh(
        new THREE.PlaneGeometry(60, 60),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    plate1.position.set(0, 15, 35);
    plate1.lookAt(0, 0, 0);
    envScene.add(plate1);

    // 2. 좌측 측면 메탈 라인을 날카롭게 살려줄 백색 반사판
    const plate2 = new THREE.Mesh(
        new THREE.PlaneGeometry(25, 70),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    plate2.position.set(-30, 20, 10);
    plate2.lookAt(0, 0, 0);
    envScene.add(plate2);

    // 3. 우측 모서리에 강렬한 하이라이트를 더해줄 반사판
    const plate3 = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 50),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    plate3.position.set(30, -5, 20);
    plate3.lookAt(0, 0, 0);
    envScene.add(plate3);

    // 4. 상단 천장 조명판
    const plate4 = new THREE.Mesh(
        new THREE.PlaneGeometry(70, 70),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    plate4.position.set(0, 40, 0);
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
    
    return envMapTexture;
};

// 일반 조명 밸런스 설정
const setupEnvironment = (targetScene) => {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.05); 
    targetScene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);   
    keyLight.position.set(5, 10, 8);
    targetScene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);   
    fillLight.position.set(-8, 5, 5);
    targetScene.add(fillLight);
};

/* ════════════════════════════════════════
    📦 THREE.JS 코어 빌드 및 레이아웃 최적화
════════════════════════════════════════ */
const initThree = () => {
    const canvasTarget = document.querySelector('#landing-display');
    if (!canvasTarget) return;

    let canvas = document.querySelector('#model-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'model-canvas';
        canvasTarget.appendChild(canvas);
    }

    // 🌟 렌더러와 카메라는 clientWidth/Height가 아닌, 우리가 정한 고정 비율(TARGET_ASPECT)을 사용해 초기화합니다.
    const containerWidth = canvasTarget.clientWidth || 600;
    const initialHeight = containerWidth / TARGET_ASPECT;

    scene = new THREE.Scene();

    renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // 🌟 초기 크기도 clientHeight 대신 TARGET_ASPECT 비율을 강제 적용합니다.
    renderer.setSize(containerWidth, initialHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping      = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.75; 

    // 🌟 카메라도 TARGET_ASPECT 비율을 사용해 초기화합니다.
    camera = new THREE.PerspectiveCamera(38, TARGET_ASPECT, 0.1, 100);
    camera.position.set(0, 0, 5.8);

    // 기동 즉시 가로세로 동기화 엔진 1회 즉시 실행 (비율 교정)
    handleResize();

    const applyModelMaterial = (envMap) => {
        setupEnvironment(scene);

        const loader = new GLTFLoader();
        const draco  = new DRACOLoader();
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        loader.setDRACOLoader(draco);

        loader.load(
            './modeling.glb',
            (gltf) => {
                if (!gltf || !gltf.scene) return;
                const model = gltf.scene;

                const chromeMaterial = new THREE.MeshPhysicalMaterial({
                    color:              0xffffff,     
                    metalness:          1.0,          
                    roughness:          0.0,          
                    clearcoat:          1.0,          
                    clearcoatRoughness: 0.0,          
                    envMap:             envMap,
                    envMapIntensity:    4.5,          
                    side:               THREE.FrontSide
                });

                model.traverse((child) => {
                    if (child.isMesh) {
                        child.material      = chromeMaterial;
                        child.castShadow    = false;
                        child.receiveShadow = false;
                    }
                });

                // 모델 규격 계산 및 정렬 보정
                const box    = new THREE.Box3().setFromObject(model);
                const centre = new THREE.Vector3();
                box.getCenter(centre);
                const size   = new THREE.Vector3();
                box.getSize(size);
                
                const maxDim     = Math.max(size.x, size.y, size.z);
                const targetBounds = 2.9;
                const scale      = targetBounds / maxDim;

                model.scale.setScalar(scale);
                model.position.set(-centre.x * scale, -centre.y * scale, -centre.z * scale);
                model.rotation.set(Math.PI * 0.38, Math.PI * 0.05, Math.PI * 0.12);

                modelAnchor = new THREE.Group();
                modelAnchor.add(model);
                modelAnchor.position.set(0, 0.35, 0);
                scene.add(modelAnchor);

                const siteLoader = document.querySelector('#site-loader');
                if (siteLoader) siteLoader.classList.add('is-loaded');

                // 모델 안착 시점에 레이아웃 마이크로 튠업
                setTimeout(handleResize, 60);
            },
            undefined,
            (err) => { console.warn('모델 로딩 실패:', err); }
        );
    };

    // studio.hdr 비동기 로딩 및 Fallback 연동
    const rgbeLoader = new RGBELoader();
    rgbeLoader.load(
        './studio.hdr',
        (hdrTexture) => {
            const pmrem = new THREE.PMREMGenerator(renderer);
            pmrem.compileEquirectangularShader();
            const envMap = pmrem.fromEquirectangular(hdrTexture).texture;
            hdrTexture.dispose();
            pmrem.dispose();

            scene.environment = envMap;
            applyModelMaterial(envMap);
        },
        undefined,
        () => {
            const generatedEnvMap = setupEnvironmentMap(scene, renderer);
            applyModelMaterial(generatedEnvMap);
        }
    );

    // ResizeObserver 엔진 구동 (애니메이션 타이밍 버그 방지를 위해 requestAnimationFrame 래핑)
    if (displayShell) {
        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(handleResize);
        });
        resizeObserver.observe(displayShell);
    }
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
            if (isHoveringModel) {
                const targetX = -mouseY * 0.45;
                const targetY = mouseX * 0.55;
                rotState.x += (targetX - rotState.x) * 0.08;
                rotState.y += (targetY - rotState.y) * 0.08;
            } else {
                rotState.x += (0 - rotState.x) * 0.05;
                rotState.y += 0.004; 
            }
            modelAnchor.rotation.x = rotState.x;
            modelAnchor.rotation.y = rotState.y;
            
            modelAnchor.position.y = 0.35 + Math.sin(clock * 0.8) * 0.05; 
        }
        renderer.render(scene, camera);
    }
};

// 🌟 [핵심 수정] 자바스크립트로 세로 찌그러짐 원천 차단 핸들러
const handleResize = () => {
    if (!renderer || !camera || !displayShell) return;
    
    // 🌟 CSS가 레이아웃을 왜곡시키더라도, 브라우저가 제공하는 clientWidth만 믿습니다.
    const width = displayShell.clientWidth || displayShell.offsetWidth || 600;
    
    // 🌟 clientHeight를 무시하고, 자바스크립트 내에서 우리가 원하는 비율(TARGET_ASPECT)로 높이를 강제 재계산합니다.
    const forcedHeight = width / TARGET_ASPECT; 
    
    if (width === 0 || forcedHeight === 0) return; 

    // 🌟 카메라는 TARGET_ASPECT 비율을 고수합니다.
    camera.aspect = TARGET_ASPECT; 
    camera.updateProjectionMatrix(); 
    
    // 🌟 렌더러 세로 버퍼 크기도 우리가 강제 재계산한 forcedHeight로 설정합니다.
    renderer.setSize(width, forcedHeight); 
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
    // 브라우저 레이아웃 스택 안정화 후 최종 뷰포트 교정
    setTimeout(handleResize, 150); 
};
