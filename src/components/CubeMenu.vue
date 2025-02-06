<template>
  <!-- The canvas fills the parent -->
  <canvas ref="canvasRef" class="three-canvas"></canvas>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue';
import * as THREE from 'three';
import gsap from 'gsap';
import { useRouter } from 'vue-router';

// Cube state: "idle" (initial rotated cube), "net" (unfolded cube net),
// "transitioning" (animation in progress), "menu" (final menu state).
type CubeState = 'idle' | 'net' | 'transitioning' | 'menu';
let currentState: CubeState = 'idle';

const canvasRef = ref<HTMLCanvasElement | null>(null);
const router = useRouter();

// Three.js essentials
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let cubeGroup: THREE.Group; // group that holds the cube faces
let edgeGroup: THREE.Group; // group that holds the canted edges
let raycaster: THREE.Raycaster;
let mouse: THREE.Vector2;
let animationFrameId: number;

const cubeSize = 1;

// Define face properties
interface FaceData {
  name: string;       // identifier (used for navigation)
  label: string;      // text label for the subpage
  mesh: THREE.Mesh;
  // positions/rotations for different states:
  cubePosition: THREE.Vector3;
  cubeRotation: THREE.Euler;
  netPosition: THREE.Vector3;
  netRotation: THREE.Euler;
  menuPosition: THREE.Vector3;
  menuRotation: THREE.Euler;
}

const faces: FaceData[] = [];

// Colors for the cube faces (chromatic theme)
const faceColors = {
  front: 0xff6b6b,    // reddish
  right: 0x6bc1ff,    // blueish
  left: 0x6bff95,     // greenish
  top: 0xfff56b,      // yellowish
  bottom: 0xb66bff,   // purple-ish
  back: 0xff9d6b      // orange-ish
};

// Map face names to subpage labels/route names.
const faceMappings: { [key: string]: string } = {
  front: 'Web',
  right: '3D',
  left: 'Fullstack',
  top: 'About',
  bottom: 'Projects',
  back: 'Contact'
};

// Helper: Create a plane mesh for a face.
function createFace(color: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(cubeSize, cubeSize);
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  return new THREE.Mesh(geometry, material);
}

// EDGE SETUP /////////////////////////////////////////////////////////

// Thickness for the edge boxes
const edgeThickness = 0.05;
// Grey color for edges (feel free to change)
const edgeColor = 0x888888;

// Create an edge mesh given its orientation and center position.
function createEdge(orientation: 'x' | 'y' | 'z', center: THREE.Vector3): THREE.Mesh {
  let geometry: THREE.BoxGeometry;
  if (orientation === 'x') {
    // edge along x-axis (length=1)
    geometry = new THREE.BoxGeometry(1, edgeThickness, edgeThickness);
  } else if (orientation === 'y') {
    // edge along y-axis
    geometry = new THREE.BoxGeometry(edgeThickness, 1, edgeThickness);
  } else {
    // edge along z-axis
    geometry = new THREE.BoxGeometry(edgeThickness, edgeThickness, 1);
  }
  const material = new THREE.MeshBasicMaterial({
    color: edgeColor,
    transparent: true,
    opacity: 1
  });
  const edgeMesh = new THREE.Mesh(geometry, material);
  edgeMesh.position.copy(center);
  // Mark this mesh so the raycaster will ignore it.
  edgeMesh.userData.isEdge = true;
  return edgeMesh;
}

// Helper: Animate opacity for all edge meshes.
function setEdgeOpacity(value: number, duration: number) {
  edgeGroup.children.forEach(child => {
    const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
    gsap.to(mat, { opacity: value, duration, ease: "power2.inOut" });
  });
}

// EDGE DEFINITIONS (12 edges of a cube)
// Using cube centered at (0,0,0) with side length 1, the edge centers:
const edgesData = [
  // Edges along the x-axis
  { orientation: 'x' as const, center: new THREE.Vector3(0, -0.5, -0.5) },
  { orientation: 'x' as const, center: new THREE.Vector3(0,  0.5, -0.5) },
  { orientation: 'x' as const, center: new THREE.Vector3(0, -0.5,  0.5) },
  { orientation: 'x' as const, center: new THREE.Vector3(0,  0.5,  0.5) },
  // Edges along the y-axis
  { orientation: 'y' as const, center: new THREE.Vector3(0.5, 0, -0.5) },
  { orientation: 'y' as const, center: new THREE.Vector3(-0.5, 0, -0.5) },
  { orientation: 'y' as const, center: new THREE.Vector3(0.5, 0,  0.5) },
  { orientation: 'y' as const, center: new THREE.Vector3(-0.5, 0,  0.5) },
  // Edges along the z-axis
  { orientation: 'z' as const, center: new THREE.Vector3(-0.5, -0.5, 0) },
  { orientation: 'z' as const, center: new THREE.Vector3(0.5, -0.5, 0) },
  { orientation: 'z' as const, center: new THREE.Vector3(0.5,  0.5, 0) },
  { orientation: 'z' as const, center: new THREE.Vector3(-0.5,  0.5, 0) },
];

// INITIALIZATION /////////////////////////////////////////////////////

function init() {
  // Create scene with a dark background.
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  // Set up camera.
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 3;

  // Renderer.
  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value!,
    alpha: true,
    antialias: true
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Create cubeGroup and set its initial rotation so a corner is facing the camera.
  cubeGroup = new THREE.Group();
  // Rotate so that the cube's diagonal is facing the camera:
  cubeGroup.rotation.x = -Math.atan(Math.sqrt(2)); // ≈ -54.74° in radians
  cubeGroup.rotation.y = Math.PI / 4;               // 45° in radians
  scene.add(cubeGroup);

  // Create and add the edge group to cubeGroup.
  edgeGroup = new THREE.Group();
  cubeGroup.add(edgeGroup);
  edgesData.forEach(edgeDef => {
    const edgeMesh = createEdge(edgeDef.orientation, edgeDef.center);
    edgeGroup.add(edgeMesh);
  });
  // (Initial state: edges are opaque.)

  // Set up raycaster.
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Create and position the six cube faces.
  // FRONT face
  const front = createFace(faceColors.front);
  front.position.set(0, 0, cubeSize / 2);
  cubeGroup.add(front);
  faces.push({
    name: 'front',
    label: faceMappings.front,
    mesh: front,
    cubePosition: front.position.clone(),
    cubeRotation: front.rotation.clone(),
    netPosition: new THREE.Vector3(-0.5, 0, 0),
    netRotation: new THREE.Euler(0, 0, 0),
    menuPosition: new THREE.Vector3(0, 1.5, 0),
    menuRotation: new THREE.Euler(0, 0, 0)
  });

  // RIGHT face
  const right = createFace(faceColors.right);
  right.position.set(cubeSize / 2, 0, 0);
  right.rotation.set(0, Math.PI / 2, 0);
  cubeGroup.add(right);
  faces.push({
    name: 'right',
    label: faceMappings.right,
    mesh: right,
    cubePosition: right.position.clone(),
    cubeRotation: right.rotation.clone(),
    netPosition: new THREE.Vector3(0.5, 0, 0),
    netRotation: new THREE.Euler(0, 0, 0),
    menuPosition: new THREE.Vector3(0, -0.5, 0),
    menuRotation: new THREE.Euler(0, 0, 0)
  });

  // LEFT face
  const left = createFace(faceColors.left);
  left.position.set(-cubeSize / 2, 0, 0);
  left.rotation.set(0, -Math.PI / 2, 0);
  cubeGroup.add(left);
  faces.push({
    name: 'left',
    label: faceMappings.left,
    mesh: left,
    cubePosition: left.position.clone(),
    cubeRotation: left.rotation.clone(),
    netPosition: new THREE.Vector3(-1.5, 0, 0),
    netRotation: new THREE.Euler(0, 0, 0),
    menuPosition: new THREE.Vector3(0, 0.5, 0),
    menuRotation: new THREE.Euler(0, 0, 0)
  });

  // TOP face
  const topFace = createFace(faceColors.top);
  topFace.position.set(0, cubeSize / 2, 0);
  topFace.rotation.set(-Math.PI / 2, 0, 0);
  cubeGroup.add(topFace);
  faces.push({
    name: 'top',
    label: faceMappings.top,
    mesh: topFace,
    cubePosition: topFace.position.clone(),
    cubeRotation: topFace.rotation.clone(),
    netPosition: new THREE.Vector3(-0.5, 1, 0),
    netRotation: new THREE.Euler(0, 0, 0),
    menuPosition: new THREE.Vector3(0, 2.5, 0),
    menuRotation: new THREE.Euler(0, 0, 0)
  });

  // BOTTOM face
  const bottom = createFace(faceColors.bottom);
  bottom.position.set(0, -cubeSize / 2, 0);
  bottom.rotation.set(Math.PI / 2, 0, 0);
  cubeGroup.add(bottom);
  faces.push({
    name: 'bottom',
    label: faceMappings.bottom,
    mesh: bottom,
    cubePosition: bottom.position.clone(),
    cubeRotation: bottom.rotation.clone(),
    netPosition: new THREE.Vector3(-0.5, -1, 0),
    netRotation: new THREE.Euler(0, 0, 0),
    menuPosition: new THREE.Vector3(0, -1.5, 0),
    menuRotation: new THREE.Euler(0, 0, 0)
  });

  // BACK face
  const back = createFace(faceColors.back);
  back.position.set(0, 0, -cubeSize / 2);
  back.rotation.set(0, Math.PI, 0);
  cubeGroup.add(back);
  faces.push({
    name: 'back',
    label: faceMappings.back,
    mesh: back,
    cubePosition: back.position.clone(),
    cubeRotation: back.rotation.clone(),
    netPosition: new THREE.Vector3(1.5, 0, 0),
    netRotation: new THREE.Euler(0, 0, 0),
    menuPosition: new THREE.Vector3(0, -2.5, 0),
    menuRotation: new THREE.Euler(0, 0, 0)
  });

  // Add an ambient light.
  const ambient = new THREE.AmbientLight(0xffffff, 1);
  scene.add(ambient);

  window.addEventListener('resize', onWindowResize, false);
  canvasRef.value!.addEventListener('click', onCanvasClick, false);
  // (Optional: add touch event handling for mobile.)
  canvasRef.value!.addEventListener('touchstart', onCanvasTouch, false);
}

// Handle window resizing.
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Render loop.
function animate() {
  // In idle state, add a subtle bounce and pulse.
  if (currentState === 'idle') {
    const time = Date.now() * 0.002;
    cubeGroup.position.y = Math.sin(time * 0.8) * 0.1;
    const scale = 1 + Math.sin(time * 0.5) * 0.03;
    cubeGroup.scale.set(scale, scale, scale);
  }
  renderer.render(scene, camera);
  animationFrameId = requestAnimationFrame(animate);
}

// Click handler.
function onCanvasClick(event: MouseEvent) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(cubeGroup.children, true);

  if (intersects.length > 0) {
    // Ignore clicks on the canted edges.
    const clickedMesh = intersects[0].object as THREE.Mesh;
    if (clickedMesh.userData.isEdge) return;

    if (currentState === 'idle') {
      unfoldCubeNet();
    } else if (currentState === 'net' || currentState === 'menu') {
      const face = faces.find(f => f.mesh === clickedMesh);
      if (face) {
        transitionToMenuAndNavigate(face);
      }
    }
  }
}

// Touch handler for mobile (treat as click).
function onCanvasTouch(event: TouchEvent) {
  event.preventDefault();
  const touch = event.touches[0];
  const syntheticEvent = new MouseEvent('click', {
    clientX: touch.clientX,
    clientY: touch.clientY,
    bubbles: true,
    cancelable: true
  });
  onCanvasClick(syntheticEvent);
}

// Animate from idle (folded, rotated cube) to unfolded cube net.
function unfoldCubeNet() {
  console.log('Unfolding cube net');
  currentState = 'transitioning';

  // Animate the cube group rotation back to 0.
  gsap.to(cubeGroup.rotation, { x: 0, y: 0, duration: 1, ease: "power2.inOut" });
  // Animate position and scale (if needed) back to defaults.
  gsap.to(cubeGroup.position, { y: 0, duration: 0.5, ease: "power2.inOut" });
  gsap.to(cubeGroup.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: "power2.inOut" });

  // Animate each face from its cube state to its net state.
  faces.forEach(face => {
    gsap.to(face.mesh.position, {
      x: face.netPosition.x,
      y: face.netPosition.y,
      z: face.netPosition.z,
      duration: 1,
      ease: "power2.inOut"
    });
    gsap.to(face.mesh.rotation, {
      x: face.netRotation.x,
      y: face.netRotation.y,
      z: face.netRotation.z,
      duration: 1,
      ease: "power2.inOut"
    });
  });
  // At the same time, fade the edges from opaque (1) to transparent (0).
  setEdgeOpacity(0, 1);

  // After animations complete, update the state.
  gsap.delayedCall(1, () => { currentState = 'net'; });
}

// Animate the transition when a face is selected (to navigate).
function transitionToMenuAndNavigate(selectedFace: FaceData) {
  if (currentState !== 'net' && currentState !== 'menu') return;
  currentState = 'transitioning';

  const tl = gsap.timeline();

  // Ensure edges are opaque during the folding animation.
  tl.call(() => { setEdgeOpacity(1, 0); }, null, 0);

  // Step 1: Fold the cube (animate each face back to its cube state).
  faces.forEach(face => {
    tl.to(face.mesh.position, {
      x: face.cubePosition.x,
      y: face.cubePosition.y,
      z: face.cubePosition.z,
      duration: 0.5,
      ease: "power2.inOut"
    }, 0);
    tl.to(face.mesh.rotation, {
      x: face.cubeRotation.x,
      y: face.cubeRotation.y,
      z: face.cubeRotation.z,
      duration: 0.5,
      ease: "power2.inOut"
    }, 0);
  });

  // Step 2: Scale down and move the whole group to a menu position.
  // (Adjust these values based on your design; here, for example, we move to (-2.5, 1.5, 0)).
  tl.to(cubeGroup.scale, { x: 0.5, y: 0.5, z: 0.5, duration: 0.5, ease: "power2.inOut" }, 0.6);
  tl.to(cubeGroup.position, { x: -2.5, y: 1.5, z: 0, duration: 0.5, ease: "power2.inOut" }, 0.6);

  // Step 3: Unfold the cube into a vertical menu.
  faces.forEach(face => {
    tl.to(face.mesh.position, {
      x: face.menuPosition.x,
      y: face.menuPosition.y,
      z: face.menuPosition.z,
      duration: 0.5,
      ease: "power2.inOut"
    }, 1.2);
    tl.to(face.mesh.rotation, {
      x: face.menuRotation.x,
      y: face.menuRotation.y,
      z: face.menuRotation.z,
      duration: 0.5,
      ease: "power2.inOut"
    }, 1.2);
  });
  // As the menu unfolds, fade edges back out (transparent).
  tl.to({}, { duration: 0.5, onStart: () => { setEdgeOpacity(0, 0.5); } }, 1.2);

  // After animations, update state and navigate.
  tl.call(() => {
    currentState = 'menu';
    let routePath = '/';
    switch (selectedFace.name) {
      case 'front': routePath = '/web'; break;
      case 'right': routePath = '/3d'; break;
      case 'left': routePath = '/fullstack'; break;
      case 'top': routePath = '/about'; break;
      case 'bottom': routePath = '/projects'; break;
      case 'back': routePath = '/contact'; break;
      default: routePath = '/';
    }
    router.push(routePath);
  });
}

onMounted(() => {
  init();
  animate();
});

onUnmounted(() => {
  cancelAnimationFrame(animationFrameId);
  window.removeEventListener('resize', onWindowResize);
  if (canvasRef.value) {
    canvasRef.value.removeEventListener('click', onCanvasClick);
    canvasRef.value.removeEventListener('touchstart', onCanvasTouch);
  }
});
</script>

<style lang="scss" scoped>
.three-canvas {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  width: 100%;
  height: 100%;
  display: block;
}
</style>
