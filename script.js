import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    ENGINE RE-INIT PROTECTION
════════════════════════════════════════ */
if (window.animFrameId) {
  cancelAnimationFrame(window.animFrameId);
  window.animFrameId = null;
}
if (window.threeRenderer) {
  window.threeRenderer.dispose();
  window.threeRenderer = null;
}
window.threeScene    = null;
window.threeCamera   = null;
window.modelAnchor   = null;
window.__threeInitialized = false;

/* ════════════════════════════════════════
    DOM REFS & 전역 변수
════════════════════════════════════════ */
const landing        = document.querySelector('.landing');
const landingCanvas  = document.querySelector('.landing-canvas');
const landingDisplay = document.querySelector('#landing-display');
const modelCanvas    = document.querySelector('#model-canvas');
const follower       = document.querySelector('.cursor-follower');
const navLinks       = document.querySelectorAll('.topnav a[data-target]');
const sections       = [];

const eliminateFakeModels = () => {
  ['#crystal-fallback','#codex-3d','.fallback-layer','.crystal-backup','#three-debug-hud'].forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.style.setProperty('display','none','important');
  });
};

const mouse = { x: 0, y: 0 };
const pointer = {
  x: window.innerWidth * 0.5,  y: window.innerHeight * 0.5,
  tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5
};
const clamp01 = v => Math.max(0, Math.min(1, v));

const rotState = { x: 0, y: 0 };
let isHoveringModel = false; 

/* ════════════════════════════════════════
    LANDING CANVAS BACKGROUND
════════════════════════════════════════ */
const setupLandingCanvas = () => {
  if (!landing || !landingCanvas) return null;
  const ctx = landingCanvas.getContext('2d');
  if (!ctx) return null;
  let state = { width: 0, height: 0, dpr: 1 };

  const resize = () => {
    const rect = landing.getBoundingClientRect();
    state.width  = rect.width;
    state.height = rect.height;
    state.dpr    = Math.min(window.devicePixelRatio || 1, 1.5);
    
    landingCanvas.width  = Math.max(1, Math.floor(rect.width  * state.dpr));
    landingCanvas.height = Math.max(1, Math.floor(rect.height * state.dpr));
    landingCanvas.style.width  = `${rect.width}px`;
    landingCanvas.style.height = `${rect.height}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  };

  const draw = () => {
    const { width, height } = state;
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const rect = landing.getBoundingClientRect();
    const px = pointer.x - rect.left;
    const py = pointer.y - rect.top;
    const glow = ctx.createRadialGradient(px, py, 0, px, py, Math.max(width, height) * 0.52);
    glow.addColorStop(0,   'rgba(255,255,255,0.09)');
    glow.addColorStop(0.3, 'rgba(160,110,255,0.04)');
    glow.addColorStop(1,   'rgba(16,16,18,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  };

  resize();
  return { resize, draw };
};

let landingCanvasCtrl = null;

const updateLandingVars = () => {
  if (!landing) return;
  const rect = landing.getBoundingClientRect();
  const x = ((pointer.x - rect.left) / Math.max(rect.width,  1)) * 100;
  const y = ((pointer.y - rect.top)  / Math.max(rect.height, 1)) * 100;
  landing.style.setProperty('--pointer-x', `${clamp01(x/100)*100}%`);
  landing.style.setProperty('--pointer-y', `${clamp01(y/100)*100}%`);
};

/* ════════════════════════════════════════
    강한 대비를 만드는 하이퍼 크롬 스튜디오 환경 (광량 대폭 강화)
════════════════════════════════════════ */
const generatePureEnvironment = (renderer) => {
  const scene = new THREE.Scene();
  scene.background = null;

  // 완벽한 우주적 고대비를 위해 배경 구체는 블랙 세팅
  const roomGeo = new THREE.SphereGeometry(60, 16, 16);
  const roomMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
  const room = new THREE.Mesh(roomGeo, roomMat);
  scene.add(room);

  // 1. 상단 초강력 하이라이트 박스광
  const topLight = new THREE.Mesh(
    new THREE.BoxGeometry(60, 4, 60),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  );
  topLight.position.set(0, 30, -5);
  scene.add(topLight);

  // 2. 정면 우측 - 메인 칼날 반사판 (별의 에지를 하얗게 비춰줄 주광)
  const frontRight = new THREE.Mesh(
    new THREE.BoxGeometry(15, 50, 15),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  );
  frontRight.position.set(25, 10, 25);
  frontRight.rotation.y = -Math.PI / 4;
  scene.add(frontRight);

  // 3. 정면 좌측 - 보조 은빛 반사판
  const frontLeft = new THREE.Mesh(
    new THREE.BoxGeometry(6, 50, 25),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  );
  frontLeft.position.set(-25, 5, 20);
  frontLeft.rotation.y = Math.PI / 4;
  scene.add(frontLeft);

  // 4. 하단 반사광 - 바닥면 음영을 지우고 테두리를 살려주는 화이트 링
  const bottomLight = new THREE.Mesh(
    new THREE.TorusGeometry(30, 3, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  );
  bottomLight.position.set(0, -25, 0);
  bottomLight.rotation.x = Math.PI / 2;
  scene.add(bottomLight);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromScene(scene);
  pmrem.dispose();
  rt.texture.mapping = THREE.CubeReflectionMapping;
  return rt.texture;
};

/* ════════════════════════════════════════
    THREE.JS MAIN CORE (새까맣게 타는 현상 방지 로직 주입)
════════════════════════════════════════ */
const initThree = () => {
  if (!modelCanvas || window.__threeInitialized) return;
  window.__threeInitialized = true;

  window.threeScene = new THREE.Scene();

  const shell = landingDisplay || { offsetWidth: 650, offsetHeight: 650 };
  const W = shell.offsetWidth;
  const H = shell.offsetHeight;

  window.threeRenderer = new THREE.WebGLRenderer({
    canvas: modelCanvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  window.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  window.threeRenderer.setSize(W, H);
  window.threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  
  // ACESFilmic 노출 설정을 더 극대화하여 메탈의 화이트 하이라이트를 한계까지 인상시킴
  window.threeRenderer.toneMapping = THREE.ACESFilmicToneMapping; 
  window.threeRenderer.toneMappingExposure = 2.2; 

  // 환경맵이 먹히지 않는 비상 상황을 대비한 고광량 3중 직사광 인공 배치
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 8.0);
  dirLight1.position.set(20, 25, 20);
  window.threeScene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 4.0);
  dirLight2.position.set(-20, -10, 15);
  window.threeScene.add(dirLight2);

  const dirLight3 = new THREE.DirectionalLight(0xffffff, 3.0);
  dirLight3.position.set(0, 10, -20);
  window.threeScene.add(dirLight3);

  // 찰흙 같은 어둠을 걷어내기 위해 전체적인 최저 밝기(Ambient)를 크게 상향
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2); 
  window.threeScene.add(ambientLight);

  window.threeCamera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
  window.threeCamera.position.set(0, 0, 5.0);

  const envTexture = generatePureEnvironment(window.threeRenderer);
  window.threeScene.environment = envTexture;

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/libs/draco/');
  loader.setDRACOLoader(draco);

  loader.load(
    `./modeling.glb?v=${Math.random()}`,
    (gltf) => {
      if (!gltf || !gltf.scene) { hideSiteLoader(); return; }
      if (window.modelAnchor) window.threeScene.remove(window.modelAnchor);

      const model = gltf.scene;

      // 🌟 [핵심 수정] 겉돌지 않고 무조건 적용되는 거울 질감의 실버 크롬 마테리얼 정의
      const hyperChromeMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,          
        metalness: 0.98,          // 리얼 메탈 바디 구축
        roughness: 0.04,          // 거울면처럼 매끄럽게 떨어지는 수치
        envMapIntensity: 6.0,     // 가상 환경 스튜디오 빛을 극한으로 흡수하도록 세팅
        side: THREE.DoubleSide
      });

      // 🚨 모델 내부 노드 깊숙한 곳까지 탐색하여 재질 무조건 덮어쓰기 강제 실행
      model.traverse((child) => {
        if (child.isMesh) {
          child.material = hyperChromeMat;
          child.material.needsUpdate = true;
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });

      // 가장 덩어리감이 잘 느껴지는 비스듬한 앵글 배치
      model.rotation.set(Math.PI * 0.38, Math.PI * 0.05, Math.PI * 0.12); 
      model.updateMatrixWorld(true);

      // 크기 최적화 스케일링
      const box = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size = new THREE.Vector3();
      box.getSize(size);
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const BOUNDS = 3.6; 
      const scale = BOUNDS / maxDim;
      model.scale.setScalar(scale);

      model.position.set(-centre.x * scale, -centre.y * scale, -centre.z * scale);

      window.modelAnchor = new THREE.Group();
      window.modelAnchor.add(model);
      window.modelAnchor.position.set(0, 0, 0); 
      
      window.threeScene.add(window.modelAnchor);

      eliminateFakeModels();
      hideSiteLoader();
    },
    undefined,
    (err) => {
      console.warn('GLB 로드 실패', err);
      hideSiteLoader();
    }
  );
};

const hideSiteLoader = () => {
  const siteLoader = document.querySelector('#site-loader');
  if (siteLoader) {
    setTimeout(() => siteLoader.classList.add('is-loaded'), 500);
  }
};

const resizeThree = () => {
  if (!window.threeRenderer || !window.threeCamera) return;
  
  const shell = landingDisplay || { offsetWidth: 650, offsetHeight: 650 };
  const W = shell.offsetWidth;
  const H = shell.offsetHeight;

  window.threeRenderer.setSize(W, H);
  window.threeCamera.aspect = W / H;
  window.threeCamera.updateProjectionMatrix();
};

/* ════════════════════════════════════════
    SCROLL INDICATOR
════════════════════════════════════════ */
const buildSectionMap = () => {
  navLinks.forEach(link => {
    const id = link.getAttribute('data-target');
    const el = document.getElementById(id);
    if (el) sections.push({ link, el, id, progress: link.querySelector('.nav-progress') });
  });
};

const updateNavProgress = () => {
  const scrollY     = window.scrollY;
  const winH        = window.innerHeight;
  const docH        = document.documentElement.scrollHeight;
  const headerH      = 92;

  let activeIdx = -1;
  let maxCoverage = -1;

  sections.forEach((sec, i) => {
    const rect  = sec.el.getBoundingClientRect();
    const top   = rect.top + scrollY - headerH;
    const bot   = top + rect.height;

    const visTop  = Math.max(scrollY, top);
    const visBot  = Math.min(scrollY + winH, bot);
    const overlap = Math.max(0, visBot - visTop);
    const coverage = overlap / Math.max(rect.height, 1);

    if (coverage > maxCoverage) {
      maxCoverage = coverage;
      activeIdx   = i;
    }
  });

  const isAtBottom = (scrollY + winH >= docH - 8);

  sections.forEach((sec, i) => {
    if (i !== activeIdx) {
      sec.progress.style.setProperty('--nav-p', '0');
      sec.link.classList.remove('is-active');
      return;
    }

    sec.link.classList.add('is-active');

    const rect     = sec.el.getBoundingClientRect();
    const secTop   = rect.top + scrollY - headerH;
    const secH     = rect.height;

    const scrolledInSection = scrollY - secTop;
    const totalScrollableRange = secH - (i === sections.length - 1 ? winH - headerH : 100);
    let raw = totalScrollableRange > 0 ? scrolledInSection / totalScrollableRange : 0;
    
    if (scrolledInSection + winH >= secH + 80) raw = 1.0;
    if (isAtBottom && i === sections.length - 1) raw = 1.0;

    sec.progress.style.setProperty('--nav-p', clamp01(raw).toFixed(4));
  });
};

/* ════════════════════════════════════════
    MAIN ANIMATION LOOP
════════════════════════════════════════ */
let clock = 0;

const animate = () => {
  window.animFrameId = requestAnimationFrame(animate);
  clock = Date.now() * 0.001;

  pointer.x += (pointer.tx - pointer.x) * 0.12;
  pointer.y += (pointer.ty - pointer.y) * 0.12;

  if (follower) {
    follower.style.left = `${pointer.x}px`;
    follower.style.top  = `${pointer.y}px`;
  }

  updateLandingVars();
  if (landingCanvasCtrl && landingCanvasCtrl.draw) landingCanvasCtrl.draw();

  if (window.threeRenderer && window.threeScene && window.threeCamera) {
    if (window.modelAnchor && window.modelAnchor.rotation) {
      let targetX = 0;
      let targetY = 0;

      if (isHoveringModel) {
        targetX = -mouse.y * 0.25;
        targetY = mouse.x * 0.35;
        
        rotState.x += (targetX - rotState.x) * 0.1;
        rotState.y += (targetY - rotState.y) * 0.1;
      } else {
        rotState.x += (0 - rotState.x) * 0.05;
        rotState.y += 0.004; 
      }

      window.modelAnchor.rotation.x = rotState.x;
      window.modelAnchor.rotation.y = rotState.y;
      window.modelAnchor.position.y = Math.sin(clock * 0.6) * 0.03; 
    }
    window.threeRenderer.render(window.threeScene, window.threeCamera);
  }
};

/* ════════════════════════════════════════
    HOVER & POINTER EVENTS
════════════════════════════════════════ */
const setupHoverEvents = () => {
  window.addEventListener('mousemove', (e) => {
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;
    
    if (isHoveringModel) {
      const winW = window.innerWidth || 1;
      const winH = window.innerHeight || 1;
      mouse.x = (e.clientX / winW) * 2 - 1;
      mouse.y = -(e.clientY / winH) * 2 + 1;
    }
  }, { passive: true });

  const displayShell = document.querySelector('.landing-display-shell');
  if (displayShell) {
    displayShell.addEventListener('pointerenter', () => { isHoveringModel = true; });
    displayShell.addEventListener('pointerleave', () => { isHoveringModel = false; });
  }
};

/* ════════════════════════════════════════
    FOLDER GUI ARCHIVE INTERACTION
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
  const grid       = document.getElementById('desktop-grid');
  const modal      = document.getElementById('folder-modal');
  const modalClose = document.getElementById('modal-close');
  const modalBack  = document.getElementById('modal-backdrop');
  const modalTitle = document.getElementById('modal-title');
  const modalPath  = document.getElementById('modal-path');
  const modalBody  = document.getElementById('modal-body');

  if (!grid || !modal) return;

  let selectedItem = null;

  const openModal = (folderKey) => {
    const data = FOLDER_DATA[folderKey];
    if (!data) return;

    modalTitle.textContent = data.title;
    modalPath.textContent  = data.path;

    const sectionLabel = document.createElement('p');
    sectionLabel.className   = 'modal-section-title';
    sectionLabel.textContent = 'FILES';

    const list = document.createElement('ul');
    list.className = 'modal-file-list';

    data.items.forEach(item => {
      const li    = document.createElement('li');
      li.className = 'modal-file-item' + (item.highlight ? ' is-highlight' : '');

      const icon  = document.createElement('span');
      icon.className   = 'file-icon';
      icon.textContent = item.highlight ? '★' : '›';

      const text  = document.createElement('span');
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
  if (modalBack) modalBack.addEventListener('click',  closeModal);
};

/* ════════════════════════════════════════
    SCROLL REVEAL CARD
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
    CORE INIT ENTRY
════════════════════════════════════════ */
const initAll = () => {
  landingCanvasCtrl = setupLandingCanvas();
  setupHoverEvents();
  eliminateFakeModels();
  buildSectionMap();
  setupReveal();
  setupFolderGUI();

  initThree();
  animate();

  window.addEventListener('scroll', () => {
    updateNavProgress();
    const spotlight = document.querySelector('.page-spotlight');
    if (spotlight) {
      const px = (pointer.x / window.innerWidth)  * 100;
      const py = (pointer.y / window.innerHeight) * 100;
      spotlight.style.setProperty('--page-pointer-x', `${px}%`);
      spotlight.style.setProperty('--page-pointer-y', `${py}%`);
    }
  }, { passive: true });

  updateNavProgress();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}

window.addEventListener('resize', () => {
  if (landingCanvasCtrl && typeof landingCanvasCtrl.resize === 'function') {
    landingCanvasCtrl.resize();
  }
  resizeThree();
  updateNavProgress();
});
