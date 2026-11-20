// Solmar City — three.js renderer, camera, lights, sky, sun, shadows.
// The renderer is created once; updateCamera keeps the camera behind the
// player (snapping to its target on the first frame so a slow headless
// render never reads as top-down).

import * as THREE from 'three';
import { CONFIG } from './config.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b5d6);
  scene.fog = new THREE.Fog(0x9fc3dd, CONFIG.fogNear, CONFIG.fogFar);

  // Sky dome: a big gradient sphere, back side, so the horizon is never void.
  const skyGeo = new THREE.SphereGeometry(900, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x3f7fc1) },
      mid: { value: new THREE.Color(0x9fcbe8) },
      low: { value: new THREE.Color(0xf6cf8e) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low;' +
      'void main(){ float h = normalize(vP).y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.65, h)) : mix(low, mid, smoothstep(-0.08, 0.12, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Hemisphere fill: strong, so shadowed asphalt reads as road, not a void.
  const hemi = new THREE.HemisphereLight(0xbfd9ee, 0x8a7f6a, CONFIG.hemisphereIntensity);
  scene.add(hemi);

  // Afternoon sun with shadows and a visible halo disc.
  const sunAngle = (CONFIG.sunAzimuth * Math.PI) / 180;
  const sunElev = (CONFIG.sunElevation * Math.PI) / 180;
  const sunDir = new THREE.Vector3(
    Math.cos(sunElev) * Math.sin(sunAngle),
    Math.sin(sunElev),
    Math.cos(sunElev) * Math.cos(sunAngle),
  );
  const sun = new THREE.DirectionalLight(0xfff2d0, CONFIG.sunIntensity);
  sun.position.copy(sunDir).multiplyScalar(300);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({
      color: 0xfff6c8,
      transparent: true,
      opacity: 0.85,
      fog: false,
      depthWrite: false,
    }),
  );
  halo.position.copy(sunDir).multiplyScalar(820);
  halo.lookAt(0, 0, 0);
  scene.add(halo);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);
  camera.position.set(0, 30, 40);

  function resize(width, height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  // Camera behind the player: target = player pos + up, eye = target -
  // forward * distance + height. Snaps on the first frame, then lerps.
  let firstFrame = true;
  function updateCamera(playerPos, heading) {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const tx = playerPos.x;
    const ty = playerPos.y + 1.6;
    const tz = playerPos.z;
    const ex = tx - fx * CONFIG.cameraDistance;
    const ey = ty + CONFIG.cameraHeight;
    const ez = tz - fz * CONFIG.cameraDistance;
    if (firstFrame || CONFIG.cameraSnapFirstFrame) {
      camera.position.set(ex, ey, ez);
      firstFrame = false;
    } else {
      camera.position.x += (ex - camera.position.x) * 0.12;
      camera.position.y += (ey - camera.position.y) * 0.12;
      camera.position.z += (ez - camera.position.z) * 0.12;
    }
    camera.lookAt(tx, ty, tz);
  }

  return { renderer, scene, camera, sun, resize, updateCamera };
}
