// Lazy-loaded 3D scene (Clients particles + Contact ring). Loaded by index.html
// only when #clients / #contact approach the viewport.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';


// ============================================================
//   THREE.JS SCENE — Scroll-driven 3D
// ============================================================

const canvas = document.getElementById('scene3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });

// Stable canvas size. On mobile the browser toolbar slides in/out while
// scrolling and fires a stream of resize events (innerHeight changes by
// ~80px). Re-allocating the renderer + bloom render targets on each one
// stalled the main thread and made scrolling stutter whenever the 3D
// scene was active. We size once against the LARGE viewport (toolbars
// collapsed) and only resize when the width really changes (rotation /
// desktop window resize).
const isCoarse = window.matchMedia('(pointer: coarse)').matches;
function largeViewportHeight() {
  let h = window.innerHeight;
  try {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:100lvh;visibility:hidden;pointer-events:none;';
    document.body.appendChild(probe);
    const ph = probe.offsetHeight;
    document.body.removeChild(probe);
    if (ph >= h) h = ph;
  } catch (e) {}
  return h;
}
let viewW = window.innerWidth;
let viewH = isCoarse ? largeViewportHeight() : window.innerHeight;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isCoarse ? 1.5 : 2));
renderer.setSize(viewW, viewH, false); // CSS controls the displayed size
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, viewW / viewH, 0.1, 100);
camera.position.set(0, 0, 5);

// ---- Post-processing (bloom) ----
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(viewW, viewH), 0.6, 0.4, 0.85);
composer.addPass(bloom);

// ---- Colors ----
const GOLD = new THREE.Color('#F5C518');
const GOLD_DIM = new THREE.Color('#D4A812');
const WHITE = new THREE.Color('#F4F4F4');
const DARK = new THREE.Color('#0A0A0B');

// NOTE: Objects 1 (Hero icosahedron), 2 (About torus knot), and 3
// (Services octahedra) have been removed — Hero/About/Services are now
// a single video-driven "journey" section (see the journey script
// block further down) and no longer need their own decorative 3D
// objects or scroll-fade logic. Clients (Object 4) and Contact
// (Object 5) below are unchanged.

// ============================================================
//   OBJECT 4 — Clients: Particle field (dots grid)
// ============================================================
const particleCount = 200;
const particleGeo = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
const scales = new Float32Array(particleCount);
for (let i = 0; i < particleCount; i++) {
  positions[i * 3] = (Math.random() - 0.5) * 12;
  positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
  positions[i * 3 + 2] = (Math.random() - 0.5) * 4 - 2;
  scales[i] = Math.random();
}
particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particleGeo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
const particleMat = new THREE.PointsMaterial({
  color: GOLD,
  size: 0.03,
  transparent: true,
  opacity: 0,
  sizeAttenuation: true,
});
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

// ============================================================
//   OBJECT 5 — Contact: Ring pulse
// ============================================================
// The camera's FOV is fixed vertically, so on a narrow/portrait
// viewport the same world-space ring covers proportionally more of
// the (narrower) screen width — on mobile it was rendering oversized
// and drifting across the contact form fields. Shrink and dim it on
// narrow viewports to keep it a background accent rather than an
// overlay on the form.
const ringIsMobileViewport = window.innerWidth <= 768;
const ringMobileScale = ringIsMobileViewport ? 0.5 : 1;
const ringMobileOpacityScale = ringIsMobileViewport ? 0.45 : 1;
const ringGeo = new THREE.RingGeometry(1.2 * ringMobileScale, 1.35 * ringMobileScale, 64);
const ringMat = new THREE.MeshBasicMaterial({
  color: GOLD,
  transparent: true,
  opacity: 0,
  side: THREE.DoubleSide,
});
const ring = new THREE.Mesh(ringGeo, ringMat);
ring.position.set(0, 0, -3);
scene.add(ring);

// ============================================================
//   LIGHTS
// ============================================================
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);
const pointLight = new THREE.PointLight(GOLD, 1.5, 20);
pointLight.position.set(3, 3, 5);
scene.add(pointLight);
const pointLight2 = new THREE.PointLight(WHITE, 0.5, 15);
pointLight2.position.set(-3, -2, 4);
scene.add(pointLight2);

// ============================================================
//   MOUSE TRACKING
// ============================================================
const mouse = { x: 0, y: 0, sx: 0, sy: 0 }; // x/y = world, sx/sy = screen NDC
const raycaster = new THREE.Raycaster();
const mousePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const intersectPoint = new THREE.Vector3();

window.addEventListener('mousemove', (e) => {
  mouse.sx = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.sy = -(e.clientY / window.innerHeight) * 2 + 1;
  // Project mouse into 3D world at z=0
  raycaster.setFromCamera(new THREE.Vector2(mouse.sx, mouse.sy), camera);
  raycaster.ray.intersectPlane(mousePlane, intersectPoint);
  mouse.x = intersectPoint.x;
  mouse.y = intersectPoint.y;
}, { passive: true });

// Hover state for cursor
let hoveredObject = null;
const raycasterObjects = [ring];

// ============================================================
//   SCROLL STATE
// ============================================================
let scrollY = 0;
let targetScrollY = 0;
const sections = ['hero', 'about', 'services', 'clients', 'contact'];
const sectionEls = sections.map(id => document.getElementById(id));

// Smooth lerp helper
function lerp(a, b, t) { return a + (b - a) * t; }
const smoothMouse = { x: 0, y: 0 };

function getScrollProgress() {
  const totalHeight = document.body.scrollHeight - window.innerHeight;
  return totalHeight > 0 ? window.scrollY / totalHeight : 0;
}

function getSectionProgress(index) {
  const el = sectionEls[index];
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const viewH = window.innerHeight;
  // 0 = section just entered bottom, 1 = section just left top
  return 1 - (rect.top + rect.height) / (viewH + rect.height);
}

window.addEventListener('scroll', () => { targetScrollY = window.scrollY; }, { passive: true });
targetScrollY = scrollY = window.scrollY;

// ============================================================
//   ANIMATION LOOP
// ============================================================
const clock = new THREE.Clock();

// Per-object hover state
const hoverState = {
  ring: 0,
};

function animate() {
  requestAnimationFrame(animate);

  // Skip the expensive WebGL render entirely while the user is nowhere
  // near the Clients/Contact sections that actually use it — this scene
  // sits behind everything as a fixed full-screen canvas, so rendering
  // it while the Journey section (or anything else) covers the screen
  // is pure wasted GPU/CPU work that competes with scroll responsiveness.
  const clientsEl = sectionEls[3];
  const contactEl = sectionEls[4];
  const viewH = window.innerHeight;
  const nearViewport = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.bottom > -viewH * 1.5 && r.top < viewH * 2.5;
  };
  if (!nearViewport(clientsEl) && !nearViewport(contactEl)) {
    return;
  }

  const t = clock.getElapsedTime();

  // Smooth scroll interpolation
  scrollY += (targetScrollY - scrollY) * 0.08;

  // Smooth mouse interpolation (follows cursor with lag)
  smoothMouse.x = lerp(smoothMouse.x, mouse.x, 0.06);
  smoothMouse.y = lerp(smoothMouse.y, mouse.y, 0.06);

  const totalScroll = getScrollProgress();
  const s3 = getSectionProgress(3); // clients
  const s4 = getSectionProgress(4); // contact

  // ---- Camera: parallax + mouse follow ----
  camera.position.y = lerp(camera.position.y, -totalScroll * 2, 0.05);
  camera.position.x = lerp(camera.position.x, Math.sin(totalScroll * Math.PI) * 0.5 + smoothMouse.x * 0.3, 0.04);
  camera.lookAt(0, camera.position.y, 0);

  // ================================================================
  //  CLIENTS: Particles — mouse force field (push away)
  // ================================================================
  const clientsFade = THREE.MathUtils.clamp((s3 - 0.1) * 3, 0, 1) * (1 - THREE.MathUtils.clamp((s3 - 0.85) * 6, 0, 1));
  particleMat.opacity = clientsFade * 0.35;
  particles.rotation.y = t * 0.05 + s3 * Math.PI * 0.5;
  particles.rotation.x = Math.sin(t * 0.1) * 0.1;

  // Displace particles near mouse
  const posAttr = particleGeo.getAttribute('position');
  for (let i = 0; i < particleCount; i++) {
    const px = posAttr.getX(i);
    const py = posAttr.getY(i);
    const pdist = Math.hypot(smoothMouse.x - px, smoothMouse.y - py);
    if (pdist < 1.5) {
      const force = (1 - pdist / 1.5) * 0.02;
      const angle = Math.atan2(py - smoothMouse.y, px - smoothMouse.x);
      posAttr.setX(i, px + Math.cos(angle) * force);
      posAttr.setY(i, py + Math.sin(angle) * force);
    }
    // Gently return to original position
    const origX = positions[i * 3];
    const origY = positions[i * 3 + 1];
    posAttr.setX(i, lerp(posAttr.getX(i), origX, 0.005));
    posAttr.setY(i, lerp(posAttr.getY(i), origY, 0.005));
  }
  posAttr.needsUpdate = true;

  // ================================================================
  //  CONTACT: Ring — pulse intensifies on hover
  // ================================================================
  const contactFade = THREE.MathUtils.clamp((s4 - 0.2) * 3, 0, 1);
  const ringDist = Math.hypot(smoothMouse.x - ring.position.x, smoothMouse.y - ring.position.y);
  const ringHover = Math.max(0, 1 - ringDist / 2.5);
  hoverState.ring = lerp(hoverState.ring, ringHover, 0.06);

  ringMat.opacity = contactFade * (0.15 + hoverState.ring * 0.15) * ringMobileOpacityScale;
  const ringPulseSpeed = 0.8 + hoverState.ring * 3;
  const ringScale = (1 + Math.sin(t * ringPulseSpeed) * 0.15) * (1 + hoverState.ring * 0.2);
  ring.scale.setScalar(ringScale);
  ring.rotation.x = Math.PI * 0.5 + Math.sin(t * 0.3) * 0.2;
  ring.rotation.z = t * (0.1 + hoverState.ring * 0.3);

  // ================================================================
  //  CURSOR — change on hover
  // ================================================================
  const isOverObject = hoverState.ring > 0.1;
  canvas.style.cursor = isOverObject ? 'grab' : 'default';

  // ================================================================
  //  BLOOM — intensify on hover
  // ================================================================
  bloom.strength = lerp(bloom.strength, 0.6 + hoverState.ring * 0.5, 0.05);

  // ---- Render ----
  composer.render();
}

animate();

// ============================================================
//   RESIZE
// ============================================================
let resizeTimer = null;
window.addEventListener('resize', () => {
  // Height-only changes on touch devices are the browser toolbar — ignore.
  if (isCoarse && window.innerWidth === viewW) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    viewW = window.innerWidth;
    viewH = isCoarse ? largeViewportHeight() : window.innerHeight;
    camera.aspect = viewW / viewH;
    camera.updateProjectionMatrix();
    renderer.setSize(viewW, viewH, false);
    composer.setSize(viewW, viewH);
  }, 150);
});


export {};
