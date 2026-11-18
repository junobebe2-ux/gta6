// The renderer: a WebGL canvas, the chase camera, and the cheap effects — one reused
// particle cloud for explosions and dust, one reused line for gunshot tracers, one
// reused point light for muzzle flashes and blasts. The camera sits behind the player
// (or the car), orbits with the mouse, and eases back to straight behind.
import * as THREE from 'three';

const PARTICLE_MAX = 320;

export function createRender(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);

  // Particles: one THREE.Points. Dead particles are parked far below the city.
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PARTICLE_MAX * 3);
  const pCol = new Float32Array(PARTICLE_MAX * 3);
  for (let i = 0; i < PARTICLE_MAX; i += 1) pPos[i * 3 + 1] = -999;
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({ size: 0.55, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95 }),
  );
  points.frustumCulled = false;
  scene.add(points);
  const particles = [];
  for (let i = 0; i < PARTICLE_MAX; i += 1) {
    particles.push({ alive: false, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1 });
  }
  let pNext = 0;

  // Tracer: one line, reused for every shot.
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracer = new THREE.Line(
    tracerGeo,
    new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }),
  );
  tracer.frustumCulled = false;
  scene.add(tracer);
  let tracerLife = 0;

  // Flash light, reused for muzzle flashes and explosions.
  const flash = new THREE.PointLight(0xffc832, 0, 26, 1.6);
  scene.add(flash);
  let flashLife = 0;

  let camYaw = 0;
  let camPitch = 0.32;
  let camDist = 8;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return {
    scene,
    camera,
    renderer,
    resize,
    /** The mouse orbit offset, so on-foot movement can follow the camera. */
    getCamYaw() {
      return camYaw;
    },
    /** Orbit the camera with the mouse drag (pixels since last frame). */
    orbit(dx, dy) {
      camYaw -= dx * 0.004;
      camPitch = Math.max(0.08, Math.min(0.9, camPitch + dy * 0.003));
    },
    /** Chase camera: focus is {x, z, heading}; mode 'foot' or 'car'. */
    updateCamera(focus, mode, dt) {
      const dist = mode === 'car' ? 12 : 7.5;
      const height = mode === 'car' ? 4.6 : 3.4;
      camDist += (dist - camDist) * Math.min(1, dt * 3);
      // The camera trails behind the focus heading, plus the mouse orbit offset.
      const yaw = focus.heading + Math.PI + camYaw;
      const ease = Math.min(1, dt * 6);
      const tx = focus.x + Math.sin(yaw) * camDist;
      const tz = focus.z + Math.cos(yaw) * camDist;
      const ty = height + Math.sin(camPitch) * camDist * 0.4;
      camera.position.x += (tx - camera.position.x) * ease;
      camera.position.y += (ty - camera.position.y) * ease;
      camera.position.z += (tz - camera.position.z) * ease;
      camera.lookAt(focus.x + Math.sin(focus.heading) * 2, mode === 'car' ? 1.6 : 1.4, focus.z + Math.cos(focus.heading) * 2);
      // The orbit offset eases back to straight behind when the mouse rests.
      camYaw *= Math.max(0, 1 - dt * 0.25);
    },
    burst(x, y, z, color, count, speed, up) {
      const c = new THREE.Color(color);
      for (let i = 0; i < count; i += 1) {
        const idx = pNext;
        const p = particles[idx];
        pNext = (pNext + 1) % PARTICLE_MAX;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * speed;
        p.alive = true;
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = Math.cos(a) * r;
        p.vz = Math.sin(a) * r;
        p.vy = Math.random() * up;
        p.life = 0;
        p.maxLife = 0.5 + Math.random() * 0.7;
        pPos[idx * 3] = x;
        pPos[idx * 3 + 1] = y;
        pPos[idx * 3 + 2] = z;
        pCol[idx * 3] = c.r;
        pCol[idx * 3 + 1] = c.g;
        pCol[idx * 3 + 2] = c.b;
      }
    },
    updateParticles(dt) {
      for (let i = 0; i < PARTICLE_MAX; i += 1) {
        const p = particles[i];
        if (!p.alive) continue;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.alive = false;
          pPos[i * 3 + 1] = -999;
          continue;
        }
        p.vy -= 9 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.05) {
          p.y = 0.05;
          p.vy *= -0.3;
          p.vx *= 0.7;
          p.vz *= 0.7;
        }
        pPos[i * 3] = p.x;
        pPos[i * 3 + 1] = p.y;
        pPos[i * 3 + 2] = p.z;
      }
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.color.needsUpdate = true;
      if (tracerLife > 0) {
        tracerLife -= dt;
        tracer.material.opacity = Math.max(0, tracerLife / 0.09);
      }
      if (flashLife > 0) {
        flashLife -= dt;
        flash.intensity = Math.max(0, flashLife * 60);
      }
    },
    shootTracer(from, to) {
      const arr = tracerGeo.attributes.position.array;
      arr[0] = from.x;
      arr[1] = from.y;
      arr[2] = from.z;
      arr[3] = to.x;
      arr[4] = to.y;
      arr[5] = to.z;
      tracerGeo.attributes.position.needsUpdate = true;
      tracerLife = 0.09;
      tracer.material.opacity = 0.9;
    },
    flashAt(x, y, z, color, strength) {
      flash.position.set(x, y, z);
      flash.color.setHex(color);
      flash.intensity = strength;
      flashLife = 0.16;
    },
    render() {
      renderer.render(scene, camera);
    },
  };
}
