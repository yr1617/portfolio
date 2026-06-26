import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

/* ════════════════════════════════════════
    ENGINE CLEANUP
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
const TARGET_ASPECT = 1.0;

const displayShell = document.querySelector('.landing-display-shell') || document.querySelector('#landing-display');
const follower     = document.querySelector('.cursor-follower');

const pointer = {
    x: window.innerWidth * 0.5, y: window.innerHeight * 0.5,
    tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5
};
const clamp01 = v => Math.max(0, Math.min(1, v));

/* ════════════════════════════════════════
    THREE.JS
════════════════════════════════════════ */
const setupEnvironmentMap = (targetScene, targetRenderer) => {
    const envScene = new THREE.Scene();
    const makePlate = (w, h, color, pos, lookAt) => {
        const m = new THREE.Mesh(
            new THREE.PlaneGeometry(w, h),
            new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
        );
        m.position.set(...pos);
        if (lookAt) m.lookAt(0,0,0); else m.rotation.x = Math.PI/2;
        envScene.add(m);
    };
    makePlate(60,60,0xffffff,[0,15,35],true);
    makePlate(25,70,0xffffff,[-30,20,10],true);
    makePlate(20,50,0xffffff,[30,-5,20],true);
    makePlate(70,70,0xffffff,[0,40,0],false);
    const pmrem = new THREE.PMREMGenerator(targetRenderer);
    pmrem.compileEquirectangularShader();
    const tex = pmrem.fromScene(envScene).texture;
    targetScene.environment = tex;
    envScene.traverse(c => { if (c.isMesh) { c.geometry.dispose(); c.material.dispose(); } });
    pmrem.dispose();
    return tex;
};

const setupEnvironment = (targetScene) => {
    targetScene.add(new THREE.AmbientLight(0xffffff, 0.05));
    const k = new THREE.DirectionalLight(0xffffff, 1.2);
    k.position.set(5,10,8); targetScene.add(k);
    const f = new THREE.DirectionalLight(0xffffff, 0.4);
    f.position.set(-8,5,5); targetScene.add(f);
};

const initThree = () => {
    const canvasTarget = document.querySelector('#landing-display');
    if (!canvasTarget) return;
    let canvas = document.querySelector('#model-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'model-canvas';
        canvasTarget.appendChild(canvas);
    }
    const cw = canvasTarget.clientWidth || 600;
    scene = new THREE.Scene();
    renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true, powerPreference:'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(cw, cw / TARGET_ASPECT);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.75;
    camera = new THREE.PerspectiveCamera(38, TARGET_ASPECT, 0.1, 100);
    camera.position.set(0, 0, 5.8);
    handleResize();

    const applyModel = (envMap) => {
        setupEnvironment(scene);
        const loader = new GLTFLoader();
        const draco  = new DRACOLoader();
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        loader.setDRACOLoader(draco);
        loader.load('./modeling.glb', (gltf) => {
            if (!gltf?.scene) return;
            const model = gltf.scene;
            const mat = new THREE.MeshPhysicalMaterial({
                color:0xffffff, metalness:1.0, roughness:0.0,
                clearcoat:1.0, clearcoatRoughness:0.0,
                envMap, envMapIntensity:4.5, side:THREE.FrontSide
            });
            model.traverse(c => { if (c.isMesh) { c.material=mat; c.castShadow=false; c.receiveShadow=false; } });
            const box = new THREE.Box3().setFromObject(model);
            const centre = new THREE.Vector3(); box.getCenter(centre);
            const size   = new THREE.Vector3(); box.getSize(size);
            const scale  = 2.9 / Math.max(size.x, size.y, size.z);
            model.scale.setScalar(scale);
            model.position.set(-centre.x*scale, -centre.y*scale, -centre.z*scale);
            model.rotation.set(Math.PI*0.38, Math.PI*0.05, Math.PI*0.12);
            modelAnchor = new THREE.Group();
            modelAnchor.add(model);
            modelAnchor.position.set(0, 0.35, 0);
            scene.add(modelAnchor);
            const sl = document.querySelector('#site-loader');
            if (sl) sl.classList.add('is-loaded');
            setTimeout(handleResize, 60);
        }, undefined, err => console.warn('모델 로딩 실패:', err));
    };

    new RGBELoader().load('./studio.hdr',
        (hdr) => {
            const pmrem = new THREE.PMREMGenerator(renderer);
            pmrem.compileEquirectangularShader();
            const envMap = pmrem.fromEquirectangular(hdr).texture;
            hdr.dispose(); pmrem.dispose();
            scene.environment = envMap;
            applyModel(envMap);
        },
        undefined,
        () => applyModel(setupEnvironmentMap(scene, renderer))
    );

    if (displayShell) {
        new ResizeObserver(() => requestAnimationFrame(handleResize)).observe(displayShell);
    }
};

const handleResize = () => {
    if (!renderer || !camera || !displayShell) return;
    const w = displayShell.clientWidth || displayShell.offsetWidth || 600;
    const h = w / TARGET_ASPECT;
    if (!w || !h) return;
    camera.aspect = TARGET_ASPECT;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
};

/* ════════════════════════════════════════
    ANIMATION LOOP
════════════════════════════════════════ */
const animate = () => {
    window.animFrameId = requestAnimationFrame(animate);
    clock += 0.01;
    pointer.x += (pointer.tx - pointer.x) * 0.12;
    pointer.y += (pointer.ty - pointer.y) * 0.12;
    if (follower) {
        follower.style.left = `${pointer.x}px`;
        follower.style.top  = `${pointer.y}px`;
    }
    if (renderer && scene && camera) {
        if (modelAnchor) {
            if (isHoveringModel) {
                rotState.x += (-mouseY*0.45 - rotState.x)*0.08;
                rotState.y += ( mouseX*0.55 - rotState.y)*0.08;
            } else {
                rotState.x += (0 - rotState.x)*0.05;
                rotState.y += 0.004;
            }
            modelAnchor.rotation.x = rotState.x;
            modelAnchor.rotation.y = rotState.y;
            modelAnchor.position.y = 0.35 + Math.sin(clock*0.8)*0.05;
        }
        renderer.render(scene, camera);
    }
};

/* ════════════════════════════════════════
    (3) NAV — 활성화 기능 완전 제거
════════════════════════════════════════ */
const setupNav = () => {
    // 활성화 밑줄/is-active 클래스 동작 없음
    // nav 링크의 data-switch-tab 처리만 유지 (탭 전환)
};

/* ════════════════════════════════════════
    (4) TAB INTERFACE
════════════════════════════════════════ */
let revealObserver;

const reobserveRevealCards = (container) => {
    if (!revealObserver) return;
    container.querySelectorAll('.reveal-card:not(.is-visible)')
             .forEach(c => revealObserver.observe(c));
};

const setupTabs = () => {
    const tabBtns   = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    const switchTab = (id) => {
        tabBtns.forEach(b => {
            const on = b.dataset.tab === id;
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-selected', String(on));
        });
        tabPanels.forEach(p => {
            if (p.id === `tab-${id}`) {
                p.classList.add('is-entering');
                p.style.display = 'block';
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    p.classList.add('is-active');
                    p.classList.remove('is-entering');
                    reobserveRevealCards(p);
                }));
            } else {
                p.classList.remove('is-active', 'is-entering');
                p.style.display = '';
            }
        });
        // (6) 탭 전환 시 최상단으로 즉시 스크롤
        const tabRoot = document.getElementById('tab-root');
        if (tabRoot) {
            tabRoot.scrollIntoView({ behavior: 'instant', block: 'start' });
        } else {
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
    };

    tabBtns.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    document.querySelectorAll('[data-switch-tab]').forEach(link => {
        link.addEventListener('click', () => switchTab(link.dataset.switchTab));
    });
};

/* ════════════════════════════════════════
    (2) 업무 시 나의 강점 — 산포형 드래그+3D플립 카드
════════════════════════════════════════ */
const STRENGTH_DATA = [
    { keyword: '차분함',    icon: '◈', desc: '흥분하지 않고 상황을 먼저 파악합니다. 급박한 데드라인 상황에서도 우선순위를 정리하고 침착하게 대응해 팀의 안정을 유지합니다.' },
    { keyword: '성실함',    icon: '✦', desc: '작은 디테일도 끝까지 챙깁니다. 완성도를 높이기 위해 반복 수정을 마다하지 않으며, 꾸준한 루틴으로 결과물의 질을 쌓아갑니다.' },
    { keyword: '유연한 사고', icon: '⬡', desc: '피드백을 방어적으로 받아들이지 않습니다. 다양한 관점을 열린 자세로 수용하고, 더 나은 방향을 찾는 데 에너지를 씁니다.' },
    { keyword: '사용자 중심', icon: '✧', desc: '기능보다 경험을 먼저 생각합니다. 서비스를 사용하는 사람의 맥락에서 출발해 불편함을 찾고, 자연스러운 흐름을 설계합니다.' },
    { keyword: '친절한 소통', icon: '◇', desc: '협업 과정에서 갈등을 최소화하는 커뮤니케이션 방식을 추구합니다. 의견 충돌 시에도 상대방의 의도를 먼저 이해하려 노력합니다.' }
];

// 초기 산포 레이아웃
// scatter-wrap: width 100%(~800px), height 480px
// 카드: 150×210px → 5장이 여유 있게 분산되도록
// 컨테이너 너비를 ~800px로 가정, 우측 여백 고려해 최대 x ~580
const SCATTER_LAYOUT = [
    { x:  10, y:  20, rot: -11 },   // 좌상단
    { x: 215, y:   8, rot:   5 },   // 중상단
    { x: 430, y:  18, rot:  14 },   // 우상단
    { x:  90, y: 240, rot:  -6 },   // 좌하단
    { x: 330, y: 225, rot:   9 },   // 중하단
];

const setupTarotCards = () => {
    const section = document.getElementById('strengths');
    if (!section) return;

    // 기존 요소 제거
    const oldWrap = section.querySelector('.tarot-wrap');
    if (oldWrap) oldWrap.remove();
    const oldScatter = section.querySelector('.scatter-wrap');
    if (oldScatter) oldScatter.remove();
    const oldHint = section.querySelector('.tarot-hint');
    if (oldHint) oldHint.remove();

    // 힌트 텍스트 완전 비움
    const hint = document.createElement('p');
    hint.className = 'scatter-hint';
    hint.textContent = '';
    section.appendChild(hint);

    // 산포 컨테이너
    const scatter = document.createElement('div');
    scatter.className = 'scatter-wrap';
    section.appendChild(scatter);

    STRENGTH_DATA.forEach((item, i) => {
        const card = document.createElement('div');
        card.className = 'scatter-card';
        
        // ─── [수정] 뭉침 해결을 위한 초기 부채꼴 분산 좌표 계산 ───
        const containerWidth = scatter.offsetWidth || 800;
        const centerX = containerWidth / 2;
        
        // 5장이 중앙을 기준으로 이격되도록 픽셀값 직접 계산
        const offsets = [-260, -90, 80, 250, 420]; 
        const rotations = [-14, -6, 2, 10, 18];     
        
        // left와 top을 시작부터 %가 아닌 순수 px 좌표로 고정
        const initialLeft = centerX + offsets[i] - 75; // 75는 카드 너비 절반
        const initialTop = 100; // 상단 여백 px 고정
        
        card.style.left = `${initialLeft}px`;
        card.style.top = `${initialTop}px`;
        card.style.transform = `rotate(${rotations[i]}deg)`;
        card.style.setProperty('--sc-rot', `${rotations[i]}deg`);
        card.style.zIndex = String(i + 1);

        const inner = document.createElement('div');
        inner.className = 'scatter-card-inner';

        // 뒷면 (초기: 아이콘 + 키워드)
        const back = document.createElement('div');
        back.className = 'scatter-face scatter-back';
        back.innerHTML = `
            <span class="sc-icon">${item.icon}</span>
            <span class="sc-keyword">${item.keyword}</span>`;

        // 앞면 (클릭 후: 키워드 + 설명)
        const front = document.createElement('div');
        front.className = 'scatter-face scatter-front';
        front.innerHTML = `
            <span class="sc-icon-sm">${item.icon}</span>
            <span class="sc-keyword-front">${item.keyword}</span>
            <p class="sc-desc">${item.desc}</p>`;

        inner.appendChild(back);
        inner.appendChild(front);
        card.appendChild(inner);
        scatter.appendChild(card);

        // ── 드래그 + 클릭 구분 (순수 px 연산으로 에러 방지) ──
        let isDragging = false;
        let dragStarted = false;
        let startX, startY, cardStartLeft, cardStartTop;
        let velX = 0, velY = 0, lastX, lastY;
        let rafId;

        const onMouseDown = (e) => {
            if (e.button !== 0) return;
            isDragging  = true;
            dragStarted = false;
            startX = e.clientX; startY = e.clientY;
            cardStartLeft = parseFloat(card.style.left) || initialLeft;
            cardStartTop  = parseFloat(card.style.top)  || initialTop;
            lastX = e.clientX; lastY = e.clientY;
            velX  = 0; velY = 0;
            card.style.zIndex    = '100';
            card.style.transition = 'none';
            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (!dragStarted && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                dragStarted = true;
            }
            if (dragStarted) {
                velX = e.clientX - lastX;
                velY = e.clientY - lastY;
                lastX = e.clientX; lastY = e.clientY;

                // [2] 드래그 범위를 scatter-wrap 컨테이너 안으로 제한
                const cardW  = card.offsetWidth  || 150;
                const cardH  = card.offsetHeight || 210;
                const maxLeft = scatter.offsetWidth  - cardW;
                const maxTop  = scatter.offsetHeight - cardH;

                const clampedLeft = Math.max(0, Math.min(maxLeft, cardStartLeft + dx));
                const clampedTop  = Math.max(0, Math.min(maxTop,  cardStartTop  + dy));

                card.style.left = `${clampedLeft}px`;
                card.style.top  = `${clampedTop}px`;
            }
        };

        const onMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            if (dragStarted) {
                // 관성 효과 (범위 제한 유지)
                let vx = velX * 3.2, vy = velY * 3.2;
                let cl = parseFloat(card.style.left) || initialLeft;
                let ct = parseFloat(card.style.top)  || initialTop;
                const cardW   = card.offsetWidth  || 150;
                const cardH   = card.offsetHeight || 210;
                const maxLeft = scatter.offsetWidth  - cardW;
                const maxTop  = scatter.offsetHeight - cardH;
                cancelAnimationFrame(rafId);
                const inertia = () => {
                    vx *= 0.80; vy *= 0.80;
                    cl = Math.max(0, Math.min(maxLeft, cl + vx));
                    ct = Math.max(0, Math.min(maxTop,  ct + vy));
                    card.style.left = `${cl}px`;
                    card.style.top  = `${ct}px`;
                    // 범위 끝에 닿으면 속도 감쇠
                    if (cl <= 0 || cl >= maxLeft) vx = 0;
                    if (ct <= 0 || ct >= maxTop)  vy = 0;
                    if (Math.abs(vx) > 0.3 || Math.abs(vy) > 0.3) {
                        rafId = requestAnimationFrame(inertia);
                    } else {
                        card.style.zIndex = String(i + 1);
                    }
                };
                rafId = requestAnimationFrame(inertia);
            } else {
                // 클릭 → 3D 플립
                card.style.zIndex = String(i + 10);
                inner.classList.toggle('is-flipped');
            }
        };

        card.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup',   onMouseUp);
    });
};

/* ════════════════════════════════════════
    (1) My Story — SVG 세로 S자 곡선 로드맵
════════════════════════════════════════ */
const ROADMAP_DATA = [
    {
        step: 'STEP 01', title: '마이스터고 선택',
        body: '막연하게 "예쁜 것을 만들고 싶다"는 생각에서 출발해 미림마이스터고를 선택했습니다. 이론보다 실무를 직접 부딪혀 배우는 환경을 원했고, UI·UX 디자이너가 되겠다는 목표를 구체화했습니다.'
    },
    {
        step: 'STEP 02', title: '디자인 기본기 학습',
        body: '피그마의 기본 도형조차 어색했던 입학 초기부터 브랜딩, 포스터, GUI 아이콘, 디자인 시스템까지 차근차근 쌓아 왔습니다. 반복 수정과 피드백을 통해 디테일 감각을 키웠습니다.'
    },
    {
        step: 'STEP 03', title: '서비스 기획 및 협업 경험',
        body: '급식 패스, 투데인트(미림 해커톤) 등 팀 프로젝트를 통해 서비스 플로우 설계부터 UI 제작까지 전 과정을 경험했습니다. 부드러운 소통으로 협업 분위기를 유지하는 법을 배웠습니다.'
    },
    {
        step: 'STEP 04', title: 'AI 활용 & 앞으로의 목표',
        body: 'AI ESG 교육 이수를 통해 AI 도구를 디자인 워크플로에 접목하는 방법을 탐색했습니다. 단기적으로는 피그마 스킬 강화, 중장기적으로는 프로덕트 디자이너로 성장하는 것이 목표입니다.'
    }
];

const setupTimeline = () => {
    const wrap = document.getElementById('timeline-wrap');
    if (!wrap) return;

    // ── 레이아웃: 좌측 SVG 로드맵 | 우측 패널 (팝업이 여기에 표시됨) ──
    wrap.removeAttribute('style');
    wrap.innerHTML = '';
    wrap.style.cssText = `
        display: grid;
        grid-template-columns: 340px 1fr;
        gap: 32px;
        align-items: start;
        width: 100%;
        max-width: 820px;
        margin: 0 auto;
        padding: 20px 0;
    `;

    // ── CSS 주입 ──
    const styleTag = document.createElement('style');
    styleTag.textContent = `
        .roadmap-svg-new { width: 100%; height: auto; display: block; }
        .rm-label-step  { font-size: 10px !important; font-weight: 700; fill: var(--sub, #dbff86) !important; letter-spacing: 0.05em; }
        .rm-label-title { font-size: 12px !important; font-weight: 600; fill: #ffffff !important; }

        /* 우측 사이드 패널 */
        .rm-side-panel {
            position: sticky;
            top: 110px;
            min-height: 160px;
            background: rgba(20, 21, 25, 0.92);
            border: 1px solid rgba(93, 53, 163, 0.45);
            border-radius: 16px;
            padding: 20px 18px;
            backdrop-filter: blur(10px);
            transition: border-color 0.25s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .rm-side-panel.has-content {
            border-color: rgba(170, 233, 97, 0.4);
            align-items: flex-start;
            justify-content: flex-start;
        }
        .rm-side-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            color: rgba(183, 176, 166, 0.35);
            font-size: 0.78rem;
            text-align: center;
            line-height: 1.6;
            font-family: var(--eng-font, monospace);
            letter-spacing: 0.04em;
        }
        .rm-side-empty-icon { font-size: 1.3rem; opacity: 0.4; }
        .rm-side-content { width: 100%; animation: side-in 0.28s ease forwards; }
        @keyframes side-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .rm-side-step {
            font-size: 0.6rem; font-weight: 700; letter-spacing: 0.22em;
            text-transform: uppercase; color: var(--sub, #dbff86);
            margin: 0 0 8px; font-family: var(--eng-font, monospace);
        }
        .rm-side-title {
            font-size: 0.95rem; font-weight: 700; color: #ffffff;
            margin: 0 0 12px; line-height: 1.3;
        }
        .rm-side-body {
            font-size: 0.78rem; color: rgba(209, 203, 220, 0.88);
            line-height: 1.65; margin: 0;
            border-top: 1px solid rgba(255,255,255,0.07);
            padding-top: 10px;
        }
    `;
    wrap.appendChild(styleTag);

    // ── 좌측: SVG 래퍼 ──
    const svgWrap = document.createElement('div');
    svgWrap.style.position = 'relative';
    wrap.appendChild(svgWrap);

    // ── 우측: 사이드 패널 (로드맵 바깥, 오른쪽) ──
    const panel = document.createElement('div');
    panel.className = 'rm-side-panel';
    panel.innerHTML = `
        <div class="rm-side-empty">
            <span class="rm-side-empty-icon">✦</span>
            <p>노드를 클릭하거나<br>마우스를 올리면<br>상세 내용이 표시됩니다</p>
        </div>
        <div class="rm-side-content" style="display:none;"></div>`;
    wrap.appendChild(panel);

    const sideEmpty   = panel.querySelector('.rm-side-empty');
    const sideContent = panel.querySelector('.rm-side-content');

    // 패널에 내용 표시
    const showPanel = (data) => {
        sideEmpty.style.display   = 'none';
        sideContent.style.display = 'block';
        sideContent.style.animation = 'none';
        void sideContent.offsetHeight;
        sideContent.style.animation = '';
        sideContent.innerHTML = `
            <p class="rm-side-step">${data.step}</p>
            <h3 class="rm-side-title">${data.title}</h3>
            <p class="rm-side-body">${data.body}</p>`;
        panel.classList.add('has-content');
    };

    const hidePanel = () => {
        if (state.pinned !== -1) return; // 핀 고정 중이면 유지
        sideEmpty.style.display   = 'block';
        sideContent.style.display = 'none';
        panel.classList.remove('has-content');
    };

    // SVG
    const VW = 320, VH = 500;
    const nodes = [
        { x:  72, y:  70 },
        { x: 248, y: 185 },
        { x:  72, y: 320 },
        { x: 248, y: 435 },
    ];

    const cx = (a, b) => {
        const midY = (a.y + b.y) / 2;
        return `C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y}`;
    };
    const pathD = [
        `M ${nodes[0].x} ${nodes[0].y}`,
        cx(nodes[0], nodes[1]),
        cx(nodes[1], nodes[2]),
        cx(nodes[2], nodes[3]),
    ].join(' ');

    const ns  = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'roadmap-svg-new');
    svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);

    const track = document.createElementNS(ns, 'path');
    track.setAttribute('d', pathD); track.setAttribute('class', 'rm-track');
    svg.appendChild(track);

    const prog = document.createElementNS(ns, 'path');
    prog.setAttribute('d', pathD); prog.setAttribute('class', 'rm-progress');
    svg.appendChild(prog);

    const state      = { pinned: -1 };
    const nodeGroups = [];

    nodes.forEach((pt, i) => {
        const data   = ROADMAP_DATA[i];
        const isLeft = pt.x < VW / 2;

        const g = document.createElementNS(ns, 'g');
        g.setAttribute('class', 'rm-node-g');
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
        g.setAttribute('aria-label', `${data.step}: ${data.title}`);

        const hit = document.createElementNS(ns, 'circle');
        hit.setAttribute('cx', pt.x); hit.setAttribute('cy', pt.y);
        hit.setAttribute('r', '24'); hit.setAttribute('fill', 'transparent');
        g.appendChild(hit);

        const ring = document.createElementNS(ns, 'circle');
        ring.setAttribute('cx', pt.x); ring.setAttribute('cy', pt.y);
        ring.setAttribute('r', '13'); ring.setAttribute('class', 'rm-ring');
        g.appendChild(ring);

        const dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
        dot.setAttribute('r', '4.5'); dot.setAttribute('class', 'rm-dot');
        g.appendChild(dot);

        svg.appendChild(g);
        nodeGroups.push({ g, ring, dot });

        // 레이블
        const lx     = isLeft ? pt.x + 20 : pt.x - 20;
        const anchor = isLeft ? 'start'   : 'end';

        const stepT = document.createElementNS(ns, 'text');
        stepT.setAttribute('x', lx); stepT.setAttribute('y', pt.y - 9);
        stepT.setAttribute('text-anchor', anchor);
        stepT.setAttribute('class', 'rm-label-step');
        stepT.textContent = data.step;
        svg.appendChild(stepT);

        const titleT = document.createElementNS(ns, 'text');
        titleT.setAttribute('x', lx); titleT.setAttribute('y', pt.y + 6);
        titleT.setAttribute('text-anchor', anchor);
        titleT.setAttribute('class', 'rm-label-title');
        titleT.textContent = data.title;
        svg.appendChild(titleT);

        // 인터랙션
        let hoverTimer;

        const activateNode = () => {
            ring.classList.add('rm-ring--active');
            dot.classList.add('rm-dot--active');
        };
        const deactivateNode = () => {
            ring.classList.remove('rm-ring--active', 'rm-ring--pinned');
            dot.classList.remove('rm-dot--active');
        };

        g.addEventListener('mouseenter', () => {
            clearTimeout(hoverTimer);
            activateNode();
            showPanel(data);
        });
        g.addEventListener('mouseleave', () => {
            hoverTimer = setTimeout(() => {
                if (state.pinned !== i) {
                    deactivateNode();
                    hidePanel();
                }
            }, 200);
        });

        g.addEventListener('click', (e) => {
            e.stopPropagation();
            if (state.pinned === i) {
                // 핀 해제
                state.pinned = -1;
                deactivateNode();
                hidePanel();
            } else {
                // 다른 노드 핀 해제
                nodeGroups.forEach(({ ring: r, dot: d }, j) => {
                    if (j !== i) {
                        r.classList.remove('rm-ring--active', 'rm-ring--pinned');
                        d.classList.remove('rm-dot--active');
                    }
                });
                state.pinned = i;
                activateNode();
                ring.classList.add('rm-ring--pinned');
                showPanel(data);
            }
        });
    });

    // 외부 클릭 → 핀 해제
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.rm-node-g')) {
            if (state.pinned !== -1) {
                const { ring: r, dot: d } = nodeGroups[state.pinned];
                r.classList.remove('rm-ring--active', 'rm-ring--pinned');
                d.classList.remove('rm-dot--active');
                state.pinned = -1;
            }
            sideEmpty.style.display   = 'block';
            sideContent.style.display = 'none';
            panel.classList.remove('has-content');
        }
    });

    // ESC 키로 핀 해제
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.pinned !== -1) {
            const { ring: r, dot: d } = nodeGroups[state.pinned];
            r.classList.remove('rm-ring--active', 'rm-ring--pinned');
            d.classList.remove('rm-dot--active');
            state.pinned = -1;
            hidePanel();
        }
    });

    svgWrap.appendChild(svg);
};

/* ════════════════════════════════════════
    폴더 GUI
════════════════════════════════════════ */
const FOLDER_DATA = {
    academic:{title:'교과 프로젝트 경험',path:'~/archive/academic/',items:[
        {text:'학생 마음 건강 콘텐츠 공모전, 포스터 부문 참여',highlight:false},
        {text:'포토샵 아트워크 & 브랜딩 굿즈 제작 프로젝트',highlight:false},
        {text:'멜론 광고 영상 제작 프로젝트 [공유하는 마음]',highlight:false},
        {text:'맛집 지도 서비스 제작 프로젝트 [MZ]',highlight:true},
        {text:'그래픽 포스터 제작 프로젝트 [모디곰 BI 포스터]',highlight:true},
        {text:'학교 아이덴티티 반영 패턴디자인 제작 프로젝트',highlight:false},
        {text:'흥부전 픽토그램 디자인 프로젝트',highlight:false},
        {text:'GUI 스타일별 아이콘 제작 프로젝트',highlight:true},
        {text:'OTT 서비스 디자인 시스템 컴포넌트 및 디자인 시스템 제작 프로젝트',highlight:true},
        {text:'패션 종합 어플리케이션 [MFF] 창업 계획서 작성 프로젝트',highlight:false},
    ]},
    club:{title:'교내 활동 · 동아리 활동',path:'~/archive/club/',items:[
        {text:'급식 티켓팅 서비스 제작 프로젝트 [급식 패스]',highlight:true},
        {text:'미림 해커톤 / 컬러워크 기록 서비스 제작 프로젝트 [투데인트]',highlight:true},
        {text:'AI ESG 교육 이수',highlight:false},
        {text:'JS 스터디 홍보 게시물 제작',highlight:true},
    ]},
    personal:{title:'개인 프로젝트 경험',path:'~/archive/personal/',items:[
        {text:'컵에 끼우는 화상 방지용 실리콘 차단물로 창업 아이디어 경진 대회 참여',highlight:false},
        {text:'(진행중) 하루 한번 면접 질문 서비스 제작 프로젝트 [모디곰]',highlight:true},
    ]},
    books:{title:'독서 경험',path:'~/archive/books/',items:[
        {text:'< 라면집도 디자이너가 하면 다르다 > — 강범규',highlight:true},
        {text:'< 디자인 구구단 > — 에이핫',highlight:false},
        {text:'< (UX/UI 디자이너를 위한) 실무 피그마 > — 클레어정',highlight:true},
        {text:'< (비전공자를 위한 이해할 수 있는) IT 지식 > — 최원영',highlight:false},
        {text:'< 1일 1로그 100일 완성 IT 지식 > — 브라이언 W. 커니핸',highlight:false},
        {text:'< 폰트의 비밀 > — 고바야시 아키라',highlight:true},
        {text:'< 갱부 > — 나쓰메 소세키',highlight:false},
    ]},
    cert:{title:'자격취득내용',path:'~/archive/cert/',items:[
        {text:'GTQ 1급',highlight:false},
        {text:'ITQ 한글 A급, PPT C급',highlight:false},
    ]},
    awards:{title:'수상 이력',path:'~/archive/awards/',items:[
        {text:'신입생 대표 선서, 학교장 장학금',highlight:true},
        {text:'1학년 1학기 일본어 교과우수상 수상',highlight:false},
        {text:'피그마 재즈 대상 수상',highlight:true},
        {text:'AI ESG 교육 이수 수료증',highlight:false},
    ]},
};

const setupFolderGUI = () => {
    const grid  = document.getElementById('desktop-grid');
    const modal = document.getElementById('folder-modal');
    const mClose= document.getElementById('modal-close');
    const mBack = document.getElementById('modal-backdrop');
    const mTitle= document.getElementById('modal-title');
    const mPath = document.getElementById('modal-path');
    const mBody = document.getElementById('modal-body');
    if (!grid || !modal) return;
    let sel = null;

    const openModal = (key) => {
        const d = FOLDER_DATA[key]; if (!d) return;
        mTitle.textContent = d.title; mPath.textContent = d.path;
        const lbl = document.createElement('p'); lbl.className='modal-section-title'; lbl.textContent='FILES';
        const ul  = document.createElement('ul'); ul.className='modal-file-list';
        d.items.forEach(item => {
            const li = document.createElement('li');
            li.className = 'modal-file-item'+(item.highlight?' is-highlight':'');
            const ic = document.createElement('span'); ic.className='file-icon';
            ic.textContent = item.highlight ? '★' : '›';
            Object.assign(ic.style,{display:'inline-flex',alignItems:'center',justifyContent:'center'});
            const tx = document.createElement('span'); tx.textContent = item.text;
            li.append(ic, tx); ul.appendChild(li);
        });
        mBody.innerHTML=''; mBody.append(lbl, ul);
        modal.classList.add('is-open'); document.body.style.overflow='hidden';
    };
    const closeModal = () => { modal.classList.remove('is-open'); document.body.style.overflow=''; };

    grid.addEventListener('click', e => {
        const item = e.target.closest('.folder-item');
        if (!item) { if(sel){sel.classList.remove('is-selected');sel=null;} return; }
        if(sel&&sel!==item) sel.classList.remove('is-selected');
        item.classList.add('is-selected'); sel=item;
    });
    grid.addEventListener('dblclick', e => {
        const item = e.target.closest('.folder-item'); if(!item) return;
        item.classList.add('is-opening');
        setTimeout(()=>item.classList.remove('is-opening'),200);
        openModal(item.dataset.folder);
    });
    if(mClose) mClose.addEventListener('click', closeModal);
    if(mBack)  mBack.addEventListener('click', closeModal);
    document.addEventListener('keydown', e=>{if(e.key==='Escape'&&modal.classList.contains('is-open'))closeModal();});
};

/* ════════════════════════════════════════
    프로젝트 상세 모달
════════════════════════════════════════ */
const PROJECT_DATA = {
    p1:{img:'project1.jpg',category:'교과 프로젝트',period:'2026',
        title:'그래픽 포스터 제작 프로젝트 [모디곰 BI 포스터]',
        desc:'직접 기획한 앱 서비스인 모디곰의 브랜드 아이덴티티 포스터를 제작하였습니다. 브랜드의 핵심 가치를 시각적으로 표현하고, AI를 활용한 3D 그래픽을 활용해 결과물의 완성도를 높였습니다.',
        role:'서비스 기획, 그래픽 디자인, 브랜딩',tools:['Adobe Photoshop','Adobe Illustrator','Gemini']},
    p2:{img:'project2.jpg',category:'교과 프로젝트',period:'2025',
        title:'맛집 지도 서비스 제작 프로젝트 [MZ]',
        desc:'사용자 주변의 맛집을 직관적으로 탐색할 수 있는 지도 기반 서비스의 UI와 로고를 제작하였습니다. 맛집 서비스 레퍼런스 수집을 통해 핵심 기능을 정의하고, 피그마를 활용하여 와이어프레임부터 최종 시안까지 제작했습니다.',
        role:'UI 디자인, 로고 디자인',tools:['Figma','Adobe Illustrator','Notion']},
    p3:{img:'project3.png',category:'동아리 활동',period:'2026',
        title:'급식 티켓팅 서비스 제작 프로젝트 [급식 패스]',
        desc:'기숙사생들이 먹지 않은 조식과 석식을, 통학생들이 예매할 수 있게 하여 잔반 문제를 해결하기 위해 제작한 앱 서비스입니다. 팀원들과 함께 문제 정의부터 서비스 플로우 설계, UI 제작까지 전 과정을 함께 진행하였습니다.',
        role:'로고 디자인, 서비스 기획, UI 디자인',tools:['Figma','Adobe Illustrator','Notion']},
    p4:{img:'project4.png',category:'동아리 활동 · 해커톤',period:'2025',
        title:'컬러워크 기록 서비스 제작 프로젝트 [투데인트]',
        desc:'투데인트는 산책하며 특정 색을 집중해 찾아보는 방법인 \'컬러워크\'를 날짜별로 기록할 수 있는 서비스입니다. 미림 해커톤에서 기획부터 디자인까지 완성하였습니다. 감성적인 색상 기반 UX와 심플한 인터페이스를 중점적으로 설계했습니다.',
        role:'브랜딩, UI/UX 디자인, 서비스 기획',tools:['Figma','Adobe Illustrator','Notion']},
    p5:{img:'project5.png',category:'동아리 활동',period:'2026',
        title:'JS 스터디 홍보 게시물 제작',
        desc:'전공 동아리 JS 스터디의 홍보 게시물을 제작하였습니다. 홍보 포스터와 SNS 홍보 게시물을 디자인하였으며 정보 전달의 명확성과 시각적 매력을 동시에 고려하였습니다.',
        role:'그래픽 디자인, 콘텐츠 제작',tools:['Adobe Illustrator','Figma']},
    p6:{img:'project6.jpg',category:'교과 프로젝트',period:'2025',
        title:'GUI 스타일별 아이콘 제작 프로젝트',
        desc:'Dot Pixel, Skeuomorphism, Flat, Material, Brutalism, Glassmorphism 여섯 가지의 GUI 스타일을 분석하고, 각 스타일에 맞는 아이콘 세트를 직접 제작하였습니다.',
        role:'아이콘 디자인',tools:['Figma']},
};

const setupProjectModal = () => {
    const modal  = document.getElementById('pj-modal');
    const back   = document.getElementById('pj-modal-backdrop');
    const close  = document.getElementById('pj-modal-close');
    const imgEl  = document.getElementById('pj-modal-img');
    const catEl  = document.getElementById('pj-modal-category');
    const perEl  = document.getElementById('pj-modal-period');
    const titEl  = document.getElementById('pj-modal-title');
    const desEl  = document.getElementById('pj-modal-desc');
    const rolEl  = document.getElementById('pj-modal-role');
    const toolEl = document.getElementById('pj-modal-tools');
    if (!modal) return;

    const open = (key) => {
        const d = PROJECT_DATA[key]; if (!d) return;
        imgEl.src=d.img; imgEl.alt=d.title;
        catEl.textContent=d.category; perEl.textContent=d.period;
        titEl.textContent=d.title; desEl.textContent=d.desc; rolEl.textContent=d.role;
        toolEl.innerHTML='';
        d.tools.forEach(t=>{
            const span=document.createElement('span'); span.className='pj-tag'; span.textContent=t; toolEl.appendChild(span);
        });
        modal.classList.add('is-open'); document.body.style.overflow='hidden';
    };
    const closeModal = () => { modal.classList.remove('is-open'); document.body.style.overflow=''; };

    document.addEventListener('click', e => {
        const card = e.target.closest('.pj-clickable'); if(card) open(card.dataset.project);
    });
    document.addEventListener('keydown', e => {
        if(e.key==='Enter'){const c=document.activeElement?.closest('.pj-clickable');if(c)open(c.dataset.project);}
        if(e.key==='Escape'&&modal.classList.contains('is-open'))closeModal();
    });
    if(close) close.addEventListener('click', closeModal);
    if(back)  back.addEventListener('click',  closeModal);
};

/* ════════════════════════════════════════
    SCROLL REVEAL
════════════════════════════════════════ */
const setupReveal = () => {
    const cards = document.querySelectorAll('.reveal-card');
    if (!cards.length) return;
    revealObserver = new IntersectionObserver(
        entries => entries.forEach(e => {
            if (e.isIntersecting) { e.target.classList.add('is-visible'); revealObserver.unobserve(e.target); }
        }),
        { threshold: 0.08, rootMargin: '0px 0px -6% 0px' }
    );
    cards.forEach(c => revealObserver.observe(c));
};

/* ════════════════════════════════════════
    EVENTS
════════════════════════════════════════ */
window.addEventListener('mousemove', e => {
    pointer.tx = e.clientX; pointer.ty = e.clientY;
    mouseX = (e.clientX/window.innerWidth)*2-1;
    mouseY = -(e.clientY/window.innerHeight)*2+1;
}, { passive: true });

if (displayShell) {
    displayShell.addEventListener('pointerenter', () => { isHoveringModel=true; });
    displayShell.addEventListener('pointerleave', () => { isHoveringModel=false; });
}
window.addEventListener('resize', () => { handleResize(); });
window.addEventListener('scroll', () => {
    const sp = document.querySelector('.page-spotlight');
    if (sp) {
        sp.style.setProperty('--page-pointer-x', `${(pointer.x/window.innerWidth)*100}%`);
        sp.style.setProperty('--page-pointer-y', `${(pointer.y/window.innerHeight)*100}%`);
    }
}, { passive: true });

/* ════════════════════════════════════════
    INIT
════════════════════════════════════════ */
window.onload = () => {
    setupNav();
    setupTabs();
    setupTarotCards();    // (1) 타로 카드
    setupTimeline();      // (5) 세로 타임라인
    setupFolderGUI();
    setupProjectModal();
    setupReveal();
    initThree();
    animate();
    setTimeout(handleResize, 150);
};
/* ==========================================================================
   최종 수정본: 파일 맨 밑에 그대로 추가하시면 됩니다.
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // 로드맵 항목 클릭 시 옆에 밀착된 팝업 표시 전용 토글
    document.querySelectorAll('.timeline-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.stopPropagation();
            const isActive = this.classList.contains('is-active');
            document.querySelectorAll('.timeline-item').forEach(i => i.classList.remove('is-active'));
            if (!isActive) {
                this.classList.add('is-active');
            }
        });
    });
    // 바깥 클릭 시 팝업 닫기
    document.addEventListener('click', () => {
        document.querySelectorAll('.timeline-item').forEach(i => i.classList.remove('is-active'));
    });
});
