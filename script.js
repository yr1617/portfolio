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
    };

    tabBtns.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    document.querySelectorAll('[data-switch-tab]').forEach(link => {
        link.addEventListener('click', () => switchTab(link.dataset.switchTab));
    });
};

/* ════════════════════════════════════════
    (1) 타로 카드 뒤집기 인터랙션
════════════════════════════════════════ */
const STRENGTH_DATA = [
    { keyword: '차분함',    desc: '흥분하지 않고 상황을 먼저 파악합니다. 급박한 데드라인 상황에서도 우선순위를 정리하고 침착하게 대응해 팀의 안정을 유지합니다.' },
    { keyword: '성실함',    desc: '작은 디테일도 끝까지 챙깁니다. 완성도를 높이기 위해 반복 수정을 마다하지 않으며, 꾸준한 루틴으로 결과물의 질을 쌓아갑니다.' },
    { keyword: '유연한 사고', desc: '피드백을 방어적으로 받아들이지 않습니다. 다양한 관점을 열린 자세로 수용하고, 더 나은 방향을 찾는 데 에너지를 씁니다.' },
    { keyword: '사용자 중심', desc: '기능보다 경험을 먼저 생각합니다. 서비스를 사용하는 사람의 맥락에서 출발해 불편함을 찾고, 자연스러운 흐름을 설계합니다.' },
    { keyword: '친절한 소통', desc: '협업 과정에서 갈등을 최소화하는 커뮤니케이션 방식을 추구합니다. 의견 충돌 시에도 상대방의 의도를 먼저 이해하려 노력합니다.' }
];

const TAROT_SYMBOLS = ['✦', '◈', '⬡', '✧', '◇'];
const FAN_ROTS  = [-16, -8, 0, 8, 16];   // 부채꼴 각도
const FAN_TX    = [-10, -5, 0, 5, 10];   // 미세 X 오프셋

const setupTarotCards = () => {
    const deck        = document.getElementById('tarot-deck');
    const revealArea  = document.getElementById('tarot-reveal-area');
    const placeholder = document.getElementById('tarot-placeholder');
    if (!deck || !revealArea) return;

    const cardWraps = [];

    STRENGTH_DATA.forEach((item, i) => {
        // 래퍼
        const wrap = document.createElement('div');
        wrap.className = 'tarot-card-wrap';
        wrap.style.setProperty('--fan-rot', `${FAN_ROTS[i]}deg`);
        wrap.style.setProperty('--fan-tx',  `${FAN_TX[i]}px`);
        wrap.style.setProperty('--fan-z',   String(i + 1));
        wrap.setAttribute('tabindex', '0');
        wrap.setAttribute('role', 'button');
        wrap.setAttribute('aria-label', `강점 카드 ${i+1}: ${item.keyword}`);

        // 내부 3D 컨테이너
        const inner = document.createElement('div');
        inner.className = 'tarot-card-inner';

        // 뒷면
        const back = document.createElement('div');
        back.className = 'tarot-face tarot-back';
        back.innerHTML = `
            <div class="tarot-back-pattern">
                <span class="tarot-back-symbol">${TAROT_SYMBOLS[i]}</span>
            </div>`;

        // 앞면
        const front = document.createElement('div');
        front.className = 'tarot-face tarot-front';
        front.innerHTML = `
            <span class="tarot-front-num">${String(i+1).padStart(2,'0')}</span>
            <span class="tarot-front-keyword">${item.keyword}</span>
            <span class="tarot-front-deco">${TAROT_SYMBOLS[i]}</span>`;

        inner.appendChild(back);
        inner.appendChild(front);
        wrap.appendChild(inner);
        deck.appendChild(wrap);
        cardWraps.push(wrap);

        // 클릭 핸들러
        const handleClick = () => {
            if (wrap.classList.contains('is-flipped')) return;

            // 1) 플립 애니메이션
            wrap.classList.add('is-flipping');

            // 2) 이미 뒤집힌 카드 접기
            cardWraps.forEach((w, j) => {
                if (j !== i && w.classList.contains('is-flipping')) {
                    w.classList.remove('is-flipping');
                }
                w.classList.toggle('is-flipped', j !== i && w.classList.contains('is-flipping'));
            });

            // 3) 공개 영역 업데이트 (딜레이로 flip 중간 시점)
            setTimeout(() => {
                if (placeholder) placeholder.style.display = 'none';

                // 기존 revealed 제거
                revealArea.querySelectorAll('.tarot-revealed').forEach(el => el.remove());

                const revealed = document.createElement('div');
                revealed.className = 'tarot-revealed';
                revealed.innerHTML = `
                    <p class="revealed-num">STRENGTH ${String(i+1).padStart(2,'0')}</p>
                    <p class="revealed-keyword">${item.keyword}</p>
                    <p class="revealed-desc">${item.desc}</p>`;
                revealArea.appendChild(revealed);
            }, 320);
        };

        wrap.addEventListener('click', handleClick);
        wrap.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') handleClick(); });
    });
};

/* ════════════════════════════════════════
    (5) 세로형 타임라인
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

    ROADMAP_DATA.forEach((data, i) => {
        const isOdd  = i % 2 === 0;     // 0, 2번: 텍스트 왼쪽
        const item   = document.createElement('div');
        item.className = `tl-item ${isOdd ? 'odd' : 'even'}`;

        // 툴팁
        const tooltip = document.createElement('div');
        tooltip.className = 'tl-tooltip';
        tooltip.innerHTML = `
            <button class="tl-tooltip-close" aria-label="닫기">✕</button>
            <p class="tl-tooltip-step">${data.step}</p>
            <h3 class="tl-tooltip-title">${data.title}</h3>
            <p class="tl-tooltip-body">${data.body}</p>`;

        // 노드 컬럼
        const nodeCol = document.createElement('div');
        nodeCol.className = 'tl-node-col';
        const node = document.createElement('button');
        node.className = 'tl-node';
        node.innerHTML = `<span class="tl-node-num">${i+1}</span>`;
        node.setAttribute('aria-label', `${data.step}: ${data.title}`);
        node.setAttribute('type', 'button');
        nodeCol.appendChild(node);
        nodeCol.appendChild(tooltip);

        // 텍스트 블록
        const textBlock = document.createElement('div');
        textBlock.className = isOdd ? 'tl-text-left' : 'tl-text-right';
        textBlock.innerHTML = `
            <p class="tl-step-label">${data.step}</p>
            <h3 class="tl-title">${data.title}</h3>`;

        const empty = document.createElement('div');
        empty.className = 'tl-empty';

        if (isOdd) {
            item.appendChild(textBlock);
            item.appendChild(nodeCol);
            item.appendChild(empty);
        } else {
            item.appendChild(empty);
            item.appendChild(nodeCol);
            item.appendChild(textBlock);
        }

        wrap.appendChild(item);

        // ── 인터랙션 ──
        let pinned = false;
        let hoverTimer;

        const showTooltip = () => {
            clearTimeout(hoverTimer);
            tooltip.classList.add('is-visible');
            node.classList.add('is-hover');
            item.classList.add('is-active');
        };
        const hideTooltip = () => {
            if (pinned) return;
            tooltip.classList.remove('is-visible');
            node.classList.remove('is-hover');
            item.classList.remove('is-active');
        };
        const closeTooltip = () => {
            pinned = false;
            tooltip.classList.remove('is-visible');
            node.classList.remove('is-hover', 'is-pinned');
            item.classList.remove('is-active');
        };

        // 호버
        node.addEventListener('mouseenter', showTooltip);
        node.addEventListener('mouseleave', () => {
            hoverTimer = setTimeout(hideTooltip, 160);
        });
        tooltip.addEventListener('mouseenter', () => {
            clearTimeout(hoverTimer);
            tooltip.classList.add('is-visible');
        });
        tooltip.addEventListener('mouseleave', () => {
            hoverTimer = setTimeout(hideTooltip, 160);
        });

        // 클릭: 고정/해제
        node.addEventListener('click', () => {
            if (pinned) {
                closeTooltip();
            } else {
                pinned = true;
                showTooltip();
                node.classList.add('is-pinned');
            }
        });

        // ✕ 닫기
        const closeBtn = tooltip.querySelector('.tl-tooltip-close');
        if (closeBtn) closeBtn.addEventListener('click', closeTooltip);

        // ESC
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && pinned) closeTooltip();
        });
    });

    // 외부 클릭으로 고정 해제
    document.addEventListener('click', e => {
        if (!e.target.closest('.tl-node') && !e.target.closest('.tl-tooltip')) {
            wrap.querySelectorAll('.tl-node.is-pinned').forEach(n => {
                n.classList.remove('is-hover','is-pinned');
                const tt = n.parentElement.querySelector('.tl-tooltip');
                if (tt) tt.classList.remove('is-visible');
                n.closest('.tl-item')?.classList.remove('is-active');
            });
        }
    });
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
        desc:'브랜드 아이덴티티 작업의 일환으로 모디곰 캐릭터 브랜드의 BI 포스터를 제작하였습니다. 브랜드의 핵심 가치를 시각적으로 표현하고, 타입과 일러스트레이션의 조화를 통해 완성도 높은 그래픽 결과물을 도출했습니다.',
        role:'기획 · 그래픽 디자인 · 타입 설계',tools:['Adobe Photoshop','Adobe Illustrator']},
    p2:{img:'project2.jpg',category:'교과 프로젝트',period:'2025',
        title:'맛집 지도 서비스 제작 프로젝트 [MZ]',
        desc:'사용자 주변의 맛집을 직관적으로 탐색할 수 있는 지도 기반 서비스 UI를 설계하였습니다. 사용자 인터뷰와 경쟁사 분석을 통해 핵심 기능을 정의하고, 피그마로 와이어프레임부터 고해상도 프로토타입까지 제작했습니다.',
        role:'UX 리서치 · UI 디자인 · 프로토타이핑',tools:['Figma','FigJam']},
    p3:{img:'project3.png',category:'동아리 활동',period:'2026',
        title:'급식 티켓팅 서비스 제작 프로젝트 [급식 패스]',
        desc:'학교 급식 대기 시간을 줄이기 위한 사전 예약 서비스를 기획하고 디자인하였습니다. 팀원들과 함께 문제 정의부터 서비스 플로우 설계, UI 제작까지 전 과정을 담당했습니다.',
        role:'서비스 기획 · UI 디자인 · 팀 협업',tools:['Figma','FigJam','Notion']},
    p4:{img:'project4.png',category:'동아리 활동 · 해커톤',period:'2025',
        title:'컬러워크 기록 서비스 제작 프로젝트 [투데인트]',
        desc:'하루에 한 번 컬러로 감정을 기록하는 웰니스 서비스입니다. 미림 해커톤에서 팀으로 기획부터 디자인까지 완성하였으며, 감성적인 색상 기반 UX와 심플한 인터페이스를 중점적으로 설계했습니다.',
        role:'서비스 기획 · UI/UX 디자인 · 브랜딩',tools:['Figma','FigJam']},
    p5:{img:'project5.png',category:'동아리 활동',period:'2026',
        title:'JS 스터디 홍보 게시물 제작',
        desc:'동아리 내 JavaScript 스터디 모집을 위한 SNS 홍보 게시물을 제작하였습니다. 정보 전달의 명확성과 시각적 매력을 동시에 고려한 그래픽 디자인 결과물입니다.',
        role:'그래픽 디자인 · 콘텐츠 제작',tools:['Adobe Photoshop','Figma']},
    p6:{img:'project6.jpg',category:'교과 프로젝트',period:'2025',
        title:'GUI 스타일별 아이콘 제작 프로젝트',
        desc:'Flat, Neumorphism, Glassmorphism, 3D 등 다양한 GUI 스타일을 분석하고, 각 스타일에 맞는 아이콘 세트를 직접 제작하였습니다.',
        role:'UI 디자인 · 아이콘 디자인',tools:['Figma','Adobe Illustrator']},
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
