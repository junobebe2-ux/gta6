// Procedural Solmar City: road grid, buildings with procedural facades,
// beach and water, palms, lamps, traffic lights, billboards and clouds.
// Deterministic from the seed. Also owns the building collision boxes
// (AABBs) and the road helpers the drivers and physics use.
import * as THREE from 'three';
import { C } from './config.js';
import { pick, range, rangeInt } from './random.js';

export const ROADS = [];
for (let i = 0; i <= 10; i++) ROADS.push(-250 + i * 50);

export function nearestRoad(v) {
  let best = ROADS[0];
  for (const r of ROADS) if (Math.abs(r - v) < Math.abs(best - v)) best = r;
  return best;
}

export function onRoad(x, z) {
  return Math.min(Math.abs(x - nearestRoad(x)), Math.abs(z - nearestRoad(z))) < 7;
}

const FACADE_COLORS = [
  '#e8b04b', '#d96a4f', '#7fae8e', '#6a8fc7', '#c7b299',
  '#e07856', '#9a7fc7', '#5fae9e', '#e8e0c8', '#b85c5c',
];

function facadeTexture(color) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 256);
  // Slight vertical shade so faces read as lit.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // Window grid.
  g.fillStyle = 'rgba(30,40,60,0.85)';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 4; c++) {
      if ((r * 4 + c) % 5 === 0) continue; // a few dark windows stay lit
      g.fillRect(10 + c * 30, 12 + r * 30, 18, 20);
    }
  }
  g.fillStyle = 'rgba(255,220,120,0.9)';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 4; c++) {
      if ((r * 4 + c) % 5 === 0) g.fillRect(10 + c * 30, 12 + r * 30, 18, 20);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function textTexture(text, bg, fg) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg;
  g.font = 'bold 56px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCity(S) {
  const rng = S.rng;
  const scene = S.render.scene;
  S.buildings = [];
  S.clouds = [];
  S.places = {
    garage: { x: C.garage.x, z: C.garage.z, name: "Rico's Garage" },
    docks: { x: C.docks.x, z: C.docks.z, name: 'The Docks' },
    bank: { x: C.bank.x, z: C.bank.z, name: 'The Bank' },
    safehouse: { x: C.safehouse.x, z: C.safehouse.z, name: 'Safehouse' },
    motel: { x: 175, z: -175, name: 'Palms Motel' },
    taco: { x: 175, z: 175, name: 'Taco Palms' },
    beach: { x: 0, z: -240, name: 'Solmar Beach' },
  };

  // Ground (sidewalk tone) + asphalt road strips with dashed centrelines.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshStandardMaterial({ color: 0xb5aa98 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const roadCv = document.createElement('canvas');
  roadCv.width = 64; roadCv.height = 64;
  const rg = roadCv.getContext('2d');
  rg.fillStyle = '#3a3a40';
  rg.fillRect(0, 0, 64, 64);
  rg.fillStyle = '#e8e8d8';
  rg.fillRect(30, 8, 4, 24);
  const roadTex = new THREE.CanvasTexture(roadCv);
  roadTex.wrapS = THREE.RepeatWrapping;
  roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.repeat.set(1, 20);
  roadTex.colorSpace = THREE.SRGBColorSpace;
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex });
  for (const r of ROADS) {
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(500, C.roadWidth), roadMat);
    rx.rotation.x = -Math.PI / 2;
    rx.position.set(0, 0.02, r);
    rx.receiveShadow = true;
    scene.add(rx);
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(C.roadWidth, 500), roadMat);
    rz.rotation.x = -Math.PI / 2;
    rz.position.set(r, 0.02, 0);
    rz.receiveShadow = true;
    scene.add(rz);
  }

  // Beach sand strip and the water beyond the north edge.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 24),
    new THREE.MeshStandardMaterial({ color: 0xe8d8a8 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, -238);
  sand.receiveShadow = true;
  scene.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(520, 90),
    new THREE.MeshStandardMaterial({ color: 0x2a7ab8, transparent: true, opacity: 0.9 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, -295);
  scene.add(water);

  // Facade textures, one per colour.
  const facadeMats = FACADE_COLORS.map((c) => new THREE.MeshStandardMaterial({ map: facadeTexture(c) }));

  function addBuilding(x, z, w, d, h, opts = {}) {
    const mat = opts.mat || pick(rng, facadeMats);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    S.buildings.push({
      x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2,
      enterable: !!opts.enterable, name: opts.name || null,
    });
    return m;
  }

  // Named places first, with the exact geometry the missions need.
  // Rico's Garage: a 2.8 m walkway (x -176.4..-173.6) runs from road z=-50
  // to the marker at (-175,-75). A car (radius 1.8 m, needs 3.6 m) cannot
  // fit; the player on foot can. The block is sealed on the south side.
  addBuilding(-185.2, -75.5, 17.6, 45, 20);
  addBuilding(-164.8, -75.5, 17.6, 45, 24);
  addBuilding(-175, -92, 20, 12, 8, { name: "Rico's Garage", enterable: true });
  // Garage sign over the walkway.
  const gSign = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 4),
    new THREE.MeshBasicMaterial({ map: textTexture("RICO'S GARAGE", '#274a7a', '#ffd24a') }),
  );
  gSign.position.set(-175, 9, -52);
  scene.add(gSign);

  // The Bank: corner buildings, central plaza, 14 m driveways west and
  // south so a car can reach the hold marker at (75,75). The southwest
  // corner stays open — the escape route drives diagonally from the
  // plaza centre to (50,50), and a building on that diagonal wedges the
  // car. The east driveway stays open too: a tall Bank block in the
  // middle of it wedged the car against its west face after the hold.
  addBuilding(88, 62, 12, 12, 26);
  addBuilding(62, 88, 12, 12, 14);
  addBuilding(88, 88, 12, 12, 22);
  const bSign = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 3.5),
    new THREE.MeshBasicMaterial({ map: textTexture('BANK', '#1a2a4a', '#e8e0c8') }),
  );
  bSign.position.set(82.5, 12, 88);
  bSign.rotation.y = -Math.PI / 2;
  scene.add(bSign);

  // Palms Motel, Taco Palms, Safehouse.
  addBuilding(175, -175, 26, 16, 12, { name: 'Palms Motel' });
  const mSign = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 4.5),
    new THREE.MeshBasicMaterial({ map: textTexture('PALMS MOTEL', '#7a2a4a', '#ffe9a8') }),
  );
  mSign.position.set(175, 10, -166);
  scene.add(mSign);
  addBuilding(175, 175, 20, 14, 9, { name: 'Taco Palms' });
  const tSign = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 3.5),
    new THREE.MeshBasicMaterial({ map: textTexture('TACO PALMS', '#2a7a3a', '#ffe9a8') }),
  );
  tSign.position.set(175, 8, 167);
  scene.add(tSign);
  addBuilding(-225, 225, 16, 16, 8, { name: 'Safehouse' });

  // The Docks: crates and a pier near the beach road.
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a });
  for (const [cx, cz, s] of [[214, -222, 4], [218, -228, 3], [186, -224, 3.5], [210, -232, 3]]) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
    crate.position.set(cx, s / 2, cz);
    crate.castShadow = true;
    scene.add(crate);
  }
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(8, 1, 26),
    new THREE.MeshStandardMaterial({ color: 0x6a4a2a }),
  );
  pier.position.set(200, 0.5, -258);
  pier.castShadow = true;
  scene.add(pier);

  // Every other block: one or two buildings.
  const special = new Set(['-175,-75', '75,75', '175,-175', '175,175', '-225,225']);
  for (let bx = -225; bx <= 225; bx += 50) {
    for (let bz = -225; bz <= 225; bz += 50) {
      if (bz === -225) continue; // beach row: sand, palms, no buildings
      if (special.has(`${bx},${bz}`)) continue;
      const jx = range(rng, -6, 6);
      const jz = range(rng, -6, 6);
      const w = range(rng, 16, 26);
      const d = range(rng, 16, 26);
      const h = range(rng, 10, 30);
      addBuilding(bx + jx, bz + jz, w, d, h);
      if (rng() < 0.3) {
        const w2 = range(rng, 8, 14);
        const d2 = range(rng, 8, 14);
        const h2 = range(rng, 6, 14);
        const sx = bx + (jx >= 0 ? -14 : 14);
        const sz = bz + (jz >= 0 ? -14 : 14);
        if (Math.abs(sx) < 240 && Math.abs(sz) < 240) addBuilding(sx, sz, w2, d2, h2);
      }
    }
  }

  // Palms: beach row plus scattered sidewalk palms.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x3a8a4a });
  function addPalm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 5, 6), trunkMat);
    trunk.position.y = 2.5;
    trunk.castShadow = true;
    g.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.8, 7), frondMat);
    crown.position.y = 5.6;
    crown.castShadow = true;
    g.add(crown);
    g.position.set(x, 0, z);
    scene.add(g);
  }
  for (let x = -240; x <= 240; x += 24) addPalm(x + range(rng, -4, 4), -232);
  for (let i = 0; i < 30; i++) {
    const rx = pick(rng, ROADS) + pick(rng, [-8, 8]);
    const rz = range(rng, -220, 220);
    if (Math.abs(rx) < 244 && Math.abs(rz) < 220) addPalm(rx, rz);
  }

  // Street lamps at every other intersection, traffic lights at eight.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2b8, emissive: 0xffe9a0, emissiveIntensity: 0.8 });
  for (let ix = 0; ix < ROADS.length; ix++) {
    for (let iz = 0; iz < ROADS.length; iz++) {
      if ((ix + iz) % 2 !== 0) continue;
      const x = ROADS[ix];
      const z = ROADS[iz];
      if (Math.abs(x) > 240 || Math.abs(z) > 240 || z < -220) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), poleMat);
      pole.position.set(x + 7, 3, z + 7);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
      lamp.position.set(x + 7, 6.2, z + 7);
      scene.add(lamp);
    }
  }
  const lightMats = {
    red: new THREE.MeshStandardMaterial({ color: 0xcc2222, emissive: 0xcc2222, emissiveIntensity: 0.9 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xccaa22, emissive: 0xccaa22, emissiveIntensity: 0.4 }),
    green: new THREE.MeshStandardMaterial({ color: 0x22aa44, emissive: 0x22aa44, emissiveIntensity: 0.9 }),
  };
  const lightSpots = [[-100, -100], [0, -100], [100, 0], [-100, 100], [0, 100], [100, 100], [-200, 0], [200, 0]];
  for (const [lx, lz] of lightSpots) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7, 6), poleMat);
    pole.position.set(lx + 7, 3.5, lz + 7);
    scene.add(pole);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, 0.4), poleMat);
    bar.position.set(lx + 7, 7.2, lz + 7);
    scene.add(bar);
    const rl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lightMats.red);
    rl.position.set(lx + 7, 7.6, lz + 7);
    scene.add(rl);
    const yl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lightMats.yellow);
    yl.position.set(lx + 7, 7.2, lz + 7);
    scene.add(yl);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lightMats.green);
    gl.position.set(lx + 7, 6.8, lz + 7);
    scene.add(gl);
  }

  // Benches, hydrants, bus shelters.
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a });
  const hydMat = new THREE.MeshStandardMaterial({ color: 0xcc2222 });
  for (let i = 0; i < 16; i++) {
    const bx = pick(rng, ROADS) + pick(rng, [-8, 8]);
    const bz = range(rng, -210, 210);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.8), benchMat);
    bench.position.set(bx, 0.45, bz);
    bench.castShadow = true;
    scene.add(bench);
  }
  for (let i = 0; i < 14; i++) {
    const hx = pick(rng, ROADS) + pick(rng, [-8, 8]);
    const hz = range(rng, -210, 210);
    const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.9, 8), hydMat);
    hyd.position.set(hx, 0.45, hz);
    hyd.castShadow = true;
    scene.add(hyd);
  }
  for (const [sx, sz] of [[-50, -50], [50, 50], [-150, 150], [150, -150], [0, 150], [150, 50]]) {
    const shelter = new THREE.Mesh(
      new THREE.BoxGeometry(5, 0.2, 2),
      new THREE.MeshStandardMaterial({ color: 0x2a6a8a }),
    );
    shelter.position.set(sx, 2.6, sz);
    scene.add(shelter);
    for (const dx of [-2.2, 2.2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.6, 0.15), poleMat);
      post.position.set(sx + dx, 1.3, sz);
      scene.add(post);
    }
  }

  // Billboards naming places in the city.
  const boards = [
    ["SOLMAR BEACH", -100, -224, 0],
    ["PALMS MOTEL", 150, -190, Math.PI / 2],
    ["TACO PALMS", 190, 150, -Math.PI / 2],
    ["THE DOCKS", 190, -200, -Math.PI / 2],
    ["RICO'S GARAGE", -190, -60, Math.PI / 2],
    ["SOLMAR CITY", 0, 224, Math.PI],
  ];
  for (const [text, bx, bz, ry] of boards) {
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 5),
      new THREE.MeshBasicMaterial({ map: textTexture(text, '#1a2a4a', '#ffd24a') }),
    );
    board.position.set(bx, 8, bz);
    board.rotation.y = ry;
    scene.add(board);
    for (const dx of [-8, 8]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 8, 0.4), poleMat);
      post.position.set(bx + dx * Math.cos(ry), 4, bz - dx * Math.sin(ry));
      scene.add(post);
    }
  }

  // Drifting clouds.
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const n = rangeInt(rng, 2, 3);
    for (let j = 0; j < n; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 6, 12), 8, 6), cloudMat);
      s.position.set(j * 10 - n * 5, range(rng, -1, 1), range(rng, -3, 3));
      s.scale.y = 0.45;
      g.add(s);
    }
    g.position.set(range(rng, -240, 240), range(rng, 70, 110), range(rng, -240, 240));
    scene.add(g);
    S.clouds.push({ group: g, speed: range(rng, 0.5, 1.5) });
  }
}

// Resolve a circle (x, z, radius) against every building AABB, pushing it
// out along the smallest penetration axis. `onFoot` skips buildings
// flagged enterable (the garage: the player walks in, cars cannot).
export function resolveBuildings(S, x, z, radius, onFoot) {
  for (const b of S.buildings) {
    if (onFoot && b.enterable) continue;
    const cx = Math.max(b.x0, Math.min(x, b.x1));
    const cz = Math.max(b.z0, Math.min(z, b.z1));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      x += dx * push;
      z += dz * push;
    } else {
      // Centre inside the box: push out along the smallest exit.
      const exits = [
        [b.x0 - radius - x, 0], [b.x1 + radius - x, 0],
        [0, b.z0 - radius - z], [0, b.z1 + radius - z],
      ];
      let best = exits[0];
      let bestLen = Math.abs(best[0]) + Math.abs(best[1]);
      for (const e of exits) {
        const len = Math.abs(e[0]) + Math.abs(e[1]);
        if (len < bestLen) { best = e; bestLen = len; }
      }
      x += best[0];
      z += best[1];
    }
  }
  return { x, z };
}

export function clampWorld(x, z) {
  const m = C.worldHalf - 2;
  return { x: Math.max(-m, Math.min(m, x)), z: Math.max(-m, Math.min(m, z)) };
}
