// Solmar City — procedural city.
// A deterministic sun-soaked coastal city on a road grid: ~100 buildings
// with procedural facades, sidewalks, a beach with water, palms, lamps,
// traffic lights, drifting clouds, benches, hydrants, bus shelters,
// billboards and named places. Built from a seed; same seed, same city.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeRandom } from './random.js';

const HALF = CONFIG.worldSize / 2; // 250
const STEP = CONFIG.roadSpacing; // 50
const ROAD_W = CONFIG.roadWidth; // 10

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function facadeTexture(colorHex, rng) {
  const color = '#' + colorHex.toString(16).padStart(6, '0');
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    // Subtle vertical shading.
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, 0, 8, h);
    ctx.fillRect(w - 8, 0, 8, h);
    // Window grid; some windows lit warm yellow.
    const cols = 4;
    const rows = 8;
    const ww = 18;
    const wh = 16;
    const gx = (w - cols * ww) / (cols + 1);
    const gy = (h - rows * wh) / (rows + 1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng.chance(0.28);
        ctx.fillStyle = lit ? '#ffd97a' : '#2c3542';
        ctx.fillRect(gx + c * (ww + gx), gy + r * (wh + gy), ww, wh);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(gx + c * (ww + gx), gy + r * (wh + gy), ww, 4);
      }
    }
  });
}

function textTexture(lines, bg, fg, width, height) {
  return canvasTexture(width, height, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((line, i) => {
      const size = n === 1 ? Math.floor(h * 0.42) : Math.floor(h * 0.3);
      ctx.font = 'bold ' + size + 'px Arial, sans-serif';
      ctx.fillText(line, w / 2, h * ((i + 1) / (n + 1)));
    });
  });
}

export function buildCity(scene, seed) {
  const rng = makeRandom(seed);
  const colliders = [];
  const clouds = [];
  const group = new THREE.Group();
  scene.add(group);

  const lambert = (color, opts) => new THREE.MeshLambertMaterial({ color, ...(opts || {}) });

  // --- Ground base (grass) ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.worldSize + 300, CONFIG.worldSize + 300),
    lambert(CONFIG.grassColor),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // --- Roads + sidewalks ---
  const roadMat = lambert(CONFIG.asphaltColor);
  const walkMat = lambert(CONFIG.sidewalkColor);
  const roadLines = [];
  for (let i = -HALF; i <= HALF; i += STEP) roadLines.push(i);
  for (const c of roadLines) {
    // Asphalt strips along x and z.
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.worldSize, ROAD_W), roadMat);
    rx.rotation.x = -Math.PI / 2;
    rx.position.set(0, 0, c);
    rx.receiveShadow = true;
    group.add(rx);
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, CONFIG.worldSize), roadMat);
    rz.rotation.x = -Math.PI / 2;
    rz.position.set(c, 0, 0);
    rz.receiveShadow = true;
    group.add(rz);
    // Sidewalks: two strips each side of each road.
    for (const off of [-ROAD_W / 2 - 1, ROAD_W / 2 + 1]) {
      const sx = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.worldSize, CONFIG.sidewalkWidth), walkMat);
      sx.rotation.x = -Math.PI / 2;
      sx.position.set(0, 0.01, c + off);
      sx.receiveShadow = true;
      group.add(sx);
      const sz = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.sidewalkWidth, CONFIG.worldSize), walkMat);
      sz.rotation.x = -Math.PI / 2;
      sz.position.set(c + off, 0.01, 0);
      sz.receiveShadow = true;
      group.add(sz);
    }
  }

  // --- Dashed centre lines (one InstancedMesh for all roads) ---
  const dashGeo = new THREE.BoxGeometry(0.4, 0.02, 3);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5f0dc });
  const dashPositions = [];
  for (const c of roadLines) {
    for (let p = -HALF + 6; p < HALF - 3; p += 8) {
      dashPositions.push([p, c, 0]);
      dashPositions.push([c, p, 1]);
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashPositions.length);
  const m4 = new THREE.Matrix4();
  dashPositions.forEach(([a, b, dir], i) => {
    // Dashes run ALONG the road: rotate 90 deg for roads along x (long
    // in x), no rotation for roads along z (long in z). Position is
    // (a, b) for both: [p, c] on an x-road, [c, p] on a z-road.
    m4.makeRotationY(dir === 0 ? Math.PI / 2 : 0);
    m4.setPosition(a, 0.03, b);
    dashes.setMatrixAt(i, m4);
  });
  dashes.instanceMatrix.needsUpdate = true;
  group.add(dashes);

  // --- Beach + water (south edge, z near +HALF) ---
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.worldSize, 34),
    lambert(CONFIG.sandColor),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, HALF - 17);
  sand.receiveShadow = true;
  group.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.worldSize + 300, 220),
    new THREE.MeshLambertMaterial({ color: CONFIG.waterColor, transparent: true, opacity: 0.9 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.01, HALF + 110);
  group.add(water);

  // --- Buildings (~100, 2 per block, deterministic) ---
  const facadeMats = [];
  for (const color of CONFIG.facadeColors) {
    const variants = [];
    for (let v = 0; v < 3; v++) variants.push(facadeTexture(color, rng));
    variants.forEach((tex) => {
      facadeMats.push(new THREE.MeshLambertMaterial({ map: tex }));
    });
  }
  const roofMat = lambert(0x6b6560);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  let buildingCount = 0;
  const blockCentres = [];
  for (let bx = -HALF + STEP / 2; bx < HALF; bx += STEP) {
    for (let bz = -HALF + STEP / 2; bz < HALF; bz += STEP) {
      blockCentres.push([bx, bz]);
    }
  }
  for (const [bx, bz] of blockCentres) {
    // South row is beach, not buildings.
    if (bz > HALF - STEP) continue;
    for (let slot = 0; slot < 2; slot++) {
      if (rng.chance(0.45)) continue; // thin out to ~100 buildings
      const w = rng.range(9, 15);
      const d = rng.range(9, 15);
      const h = rng.range(9, 36);
      const ox = slot === 0 ? -8 : 8;
      const oz = rng.range(-8, 8);
      const x = bx + ox + rng.range(-3, 3);
      const z = bz + oz;
      const mat = facadeMats[Math.floor(rng.next() * facadeMats.length)];
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.scale.set(w, h, d);
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      const roof = new THREE.Mesh(boxGeo, roofMat);
      roof.scale.set(w + 0.6, 0.5, d + 0.6);
      roof.position.set(x, h + 0.25, z);
      roof.castShadow = true;
      group.add(roof);
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      buildingCount += 1;
    }
  }

  // --- Palms (beach + scattered) ---
  const trunkMat = lambert(0x7a5a38);
  const frondMat = lambert(0x3f7a3a);
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 5, 6);
  const frondGeo = new THREE.ConeGeometry(2.2, 2.5, 6);
  function palm(x, z) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 2.5, z);
    trunk.castShadow = true;
    group.add(trunk);
    for (let i = 0; i < 5; i++) {
      const frond = new THREE.Mesh(frondGeo, frondMat);
      const a = (i / 5) * Math.PI * 2;
      frond.position.set(x + Math.cos(a) * 1.1, 5.4, z + Math.sin(a) * 1.1);
      frond.rotation.z = Math.cos(a) * 0.9;
      frond.rotation.x = -Math.sin(a) * 0.9;
      frond.castShadow = true;
      group.add(frond);
    }
  }
  for (let i = 0; i < 24; i++) {
    const x = -HALF + 10 + rng.next() * (CONFIG.worldSize - 20);
    const z = rng.chance(0.6) ? HALF - 28 + rng.next() * 18 : -HALF + 10 + rng.next() * (CONFIG.worldSize - 20);
    palm(x, z);
  }

  // --- Street lamps (along roads) ---
  const poleMat = lambert(0x3a3f45);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
  for (const c of roadLines) {
    for (let p = -HALF + 25; p < HALF; p += 50) {
      const lx = c + ROAD_W / 2 + 2.4;
      const lz = p;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(lx, 3, lz);
      pole.castShadow = true;
      group.add(pole);
      const head = new THREE.Mesh(headGeo, lampMat);
      head.position.set(lx, 6.2, lz);
      group.add(head);
    }
  }

  // --- Traffic lights at 10 intersections ---
  const lightPoleMat = lambert(0x2e3238);
  const lightBoxMat = lambert(0x1c1e22);
  const redMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  const greenMat = new THREE.MeshBasicMaterial({ color: 0x34c759 });
  const amberMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
  const lightPoleGeo = new THREE.CylinderGeometry(0.14, 0.18, 5.5, 6);
  const lightBoxGeo = new THREE.BoxGeometry(0.7, 1.8, 0.5);
  const bulbGeo = new THREE.SphereGeometry(0.2, 8, 6);
  for (let i = 0; i < 10; i++) {
    const cx = roadLines[Math.floor(rng.next() * roadLines.length)];
    const cz = roadLines[Math.floor(rng.next() * roadLines.length)];
    const x = cx + ROAD_W / 2 + 1.5;
    const z = cz - ROAD_W / 2 - 1.5;
    const pole = new THREE.Mesh(lightPoleGeo, lightPoleMat);
    pole.position.set(x, 2.75, z);
    pole.castShadow = true;
    group.add(pole);
    const box = new THREE.Mesh(lightBoxGeo, lightBoxMat);
    box.position.set(x, 5.6, z);
    group.add(box);
    const mats = [redMat, amberMat, greenMat];
    mats.forEach((mat, k) => {
      const bulb = new THREE.Mesh(bulbGeo, mat);
      bulb.position.set(x, 6.15 - k * 0.55, z + 0.28);
      group.add(bulb);
    });
  }

  // --- Drifting clouds ---
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const puffGeo = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Group();
    const puffs = 2 + Math.floor(rng.next() * 3);
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Mesh(puffGeo, cloudMat);
      puff.scale.set(rng.range(6, 12), rng.range(2.5, 4), rng.range(5, 8));
      puff.position.set(p * rng.range(5, 8) - puffs * 3, rng.range(-1, 1), rng.range(-3, 3));
      cloud.add(puff);
    }
    cloud.position.set(rng.range(-HALF, HALF), rng.range(70, 110), rng.range(-HALF, HALF));
    group.add(cloud);
    clouds.push({ obj: cloud, speed: rng.range(0.6, 1.6) });
  }

  // --- Benches, hydrants, bus shelters ---
  const benchMat = lambert(0x8a6a45);
  const benchSeatGeo = new THREE.BoxGeometry(2.2, 0.12, 0.6);
  const benchBackGeo = new THREE.BoxGeometry(2.2, 0.7, 0.1);
  const benchLegGeo = new THREE.BoxGeometry(0.12, 0.45, 0.5);
  for (let i = 0; i < 12; i++) {
    const x = rng.range(-HALF + 10, HALF - 10);
    const z = roadLines[Math.floor(rng.next() * roadLines.length)] + ROAD_W / 2 + 2;
    const seat = new THREE.Mesh(benchSeatGeo, benchMat);
    seat.position.set(x, 0.5, z);
    seat.castShadow = true;
    group.add(seat);
    const back = new THREE.Mesh(benchBackGeo, benchMat);
    back.position.set(x, 0.9, z - 0.28);
    group.add(back);
    for (const dx of [-0.9, 0.9]) {
      const leg = new THREE.Mesh(benchLegGeo, poleMat);
      leg.position.set(x + dx, 0.22, z);
      group.add(leg);
    }
  }
  const hydrantMat = lambert(0xc22e2e);
  const hydrantGeo = new THREE.CylinderGeometry(0.28, 0.34, 0.9, 8);
  const hydrantCapGeo = new THREE.SphereGeometry(0.28, 8, 6);
  for (let i = 0; i < 12; i++) {
    const x = rng.range(-HALF + 10, HALF - 10);
    const z = roadLines[Math.floor(rng.next() * roadLines.length)] - ROAD_W / 2 - 2;
    const body = new THREE.Mesh(hydrantGeo, hydrantMat);
    body.position.set(x, 0.45, z);
    body.castShadow = true;
    group.add(body);
    const cap = new THREE.Mesh(hydrantCapGeo, hydrantMat);
    cap.position.set(x, 0.95, z);
    group.add(cap);
  }
  const shelterRoofMat = lambert(0x3f6d8e);
  const shelterRoofGeo = new THREE.BoxGeometry(4.5, 0.15, 2);
  const shelterPostGeo = new THREE.BoxGeometry(0.15, 2.4, 0.15);
  for (let i = 0; i < 4; i++) {
    const x = rng.range(-HALF + 20, HALF - 20);
    const z = roadLines[Math.floor(rng.next() * roadLines.length)] + ROAD_W / 2 + 3.4;
    const roof = new THREE.Mesh(shelterRoofGeo, shelterRoofMat);
    roof.position.set(x, 2.5, z);
    roof.castShadow = true;
    group.add(roof);
    for (const dx of [-2, 2]) {
      for (const dz of [-0.8, 0.8]) {
        const post = new THREE.Mesh(shelterPostGeo, poleMat);
        post.position.set(x + dx, 1.2, z + dz);
        group.add(post);
      }
    }
    const seat = new THREE.Mesh(benchSeatGeo, benchMat);
    seat.position.set(x, 0.5, z);
    group.add(seat);
  }

  // --- Billboards (5 named) ---
  const billboards = [
    { text: ['SOLMAR CITY'], bg: '#12233d', fg: '#ffd97a', x: -180, z: -180 },
    { text: ["RICO'S GARAGE"], bg: '#3d1220', fg: '#ffb3c1', x: 180, z: -120 },
    { text: ['PALMS MOTEL'], bg: '#0f3d2e', fg: '#b8f0d0', x: -120, z: 120 },
    { text: ['SOLMAR BEACH'], bg: '#0e4a5e', fg: '#bfe8f5', x: 60, z: 200 },
    { text: ['TACO PALMS'], bg: '#5e2a0e', fg: '#ffd9a0', x: 200, z: 60 },
  ];
  const boardPostGeo = new THREE.BoxGeometry(0.3, 6, 0.3);
  for (const b of billboards) {
    const tex = textTexture(b.text, b.bg, b.fg, 512, 192);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 5.2),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    board.position.set(b.x, 8.5, b.z);
    board.rotation.y = rng.next() * Math.PI;
    board.castShadow = true;
    group.add(board);
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 5.2),
      lambert(0x222222),
    );
    back.position.copy(board.position);
    back.rotation.y = board.rotation.y + Math.PI;
    group.add(back);
    for (const dx of [-5, 5]) {
      const post = new THREE.Mesh(boardPostGeo, poleMat);
      post.position.set(b.x + dx * Math.cos(board.rotation.y), 3, b.z - dx * Math.sin(board.rotation.y));
      group.add(post);
    }
    colliders.push({ minX: b.x - 1, maxX: b.x + 1, minZ: b.z - 1, maxZ: b.z + 1 });
  }

  // --- Named places: ground pads + signs ---
  const places = {
    garage: { x: -175, z: -75, label: "RICO'S GARAGE" },
    docks: { x: 225, z: -25, label: 'THE DOCKS' },
    motel: { x: -125, z: 125, label: 'PALMS MOTEL' },
    bank: { x: 25, z: -25, label: 'SOLMAR BANK' },
    safehouse: { x: -175, z: 175, label: 'SAFEHOUSE' },
    beach: { x: 25, z: 225, label: 'SOLMAR BEACH' },
    taco: { x: 175, z: 75, label: 'TACO PALMS' },
  };
  const padGeo = new THREE.PlaneGeometry(16, 16);
  const signGeo = new THREE.PlaneGeometry(8, 2.4);
  for (const key of Object.keys(places)) {
    const p = places[key];
    const pad = new THREE.Mesh(padGeo, new THREE.MeshLambertMaterial({ color: 0x6a7f96, transparent: true, opacity: 0.55 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(p.x, 0.04, p.z);
    pad.receiveShadow = true;
    group.add(pad);
    const tex = textTexture([p.label], '#1c2733', '#f5f0dc', 512, 160);
    const sign = new THREE.Mesh(signGeo, new THREE.MeshLambertMaterial({ map: tex }));
    sign.position.set(p.x, 3.4, p.z);
    sign.rotation.y = Math.PI / 4;
    group.add(sign);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 6), poleMat);
    post.position.set(p.x, 1.2, p.z);
    group.add(post);
  }

  function stepClouds(dt) {
    for (const c of clouds) {
      c.obj.position.x += c.speed * dt;
      if (c.obj.position.x > HALF + 60) c.obj.position.x = -HALF - 60;
    }
  }

  return { group, colliders, places, buildingCount, stepClouds };
}
