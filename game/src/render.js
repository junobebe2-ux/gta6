// three.js renderer, camera, lights, sky and sun. The camera follows
// behind the player; it snaps to the player when it is far from its
// target instead of gliding across the map (for example from the title
// orbit when a game starts).
import * as THREE from 'three';

export function createRender() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.id = 'game-canvas';
  document.getElementById('game-root').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc8ea, 220, 700);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(0, 40, 120);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.2);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -280;
  sun.shadow.camera.right = 280;
  sun.shadow.camera.top = 280;
  sun.shadow.camera.bottom = -280;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // Sun with a halo: a bright disc plus a soft radial glow sprite.
  const sunGroup = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(14, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }),
  );
  disc.position.copy(sun.position).normalize().multiplyScalar(500);
  disc.lookAt(0, 0, 0);
  sunGroup.add(disc);
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = 128; haloCanvas.height = 128;
  const hc = haloCanvas.getContext('2d');
  const grad = hc.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,244,190,0.9)');
  grad.addColorStop(0.4, 'rgba(255,240,170,0.35)');
  grad.addColorStop(1, 'rgba(255,240,170,0)');
  hc.fillStyle = grad;
  hc.fillRect(0, 0, 128, 128);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(haloCanvas), transparent: true, fog: false, depthWrite: false,
  }));
  halo.scale.set(180, 180, 1);
  halo.position.copy(disc.position);
  sunGroup.add(halo);
  scene.add(sunGroup);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, sun };
}

const _target = new THREE.Vector3();
const _camPos = new THREE.Vector3();

export function updateCamera(S, dt) {
  const cam = S.render.camera;
  const p = S.player;
  if (S.mode === 'title') {
    // Slow orbit over the city while the title screen is up.
    const t = S.time * 0.05;
    cam.position.set(Math.cos(t) * 190, 90, Math.sin(t) * 190);
    cam.lookAt(0, 0, 0);
    return;
  }
  const fwdX = Math.sin(p.angle);
  const fwdZ = -Math.cos(p.angle);
  const dist = S.shotCamera ? 14 : 10;
  const height = S.shotCamera ? 7 : 5;
  _target.set(p.x + fwdX * 6, 1.5, p.z + fwdZ * 6);
  _camPos.set(p.x - fwdX * dist, height, p.z - fwdZ * dist);
  if (cam.position.distanceTo(_camPos) > 30 || S.cameraSnap) {
    cam.position.copy(_camPos);
    S.cameraSnap = false;
  } else {
    cam.position.lerp(_camPos, Math.min(1, dt * 6));
  }
  cam.lookAt(_target);
}
