// Solmar City: a sun-soaked coastal city built from a seeded RNG. Roads on a
// grid, buildings filling the blocks between them, a beach and water on the east
// edge, palms, lamps and traffic lights. It also owns the collision boxes (every
// building is an AABB) and the road helpers the traffic and police AI drive on.
// Nothing here is copied from a real map or a commercial game.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';

const ROADS = [];
for (let i = -CITY.grid; i <= CITY.grid; i += 1) ROADS.push(i * CITY.pitch);

// A canvas turned into a texture, for facades, roads, sky and signs.
function paintTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function facadeTexture(baseHex, litWindows) {
  return paintTexture(128, 256, (g, w, h) => {
    g.fillStyle = baseHex;
    g.fillRect(0, 0, w, h);
    // A grid of glass panes, a few of them lit.
    const cols = 4;
    const rows = 9;
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const lit = litWindows && (r * 7 + c * 3) % 5 === 0;
        g.fillStyle = lit ? '#ffe9a8' : '#7fa8c8';
        g.fillRect(c * cw + cw * 0.22, r * ch + ch * 0.25, cw * 0.56, ch * 0.5);
      }
    }
    // Ground floor: a dark shopfront band and a door.
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, h - 26, w, 26);
    g.fillStyle = '#5a4632';
    g.fillRect(w / 2 - 10, h - 24, 20, 24);
  });
}

function roadTexture() {
  return paintTexture(64, 256, (g, w, h) => {
    g.fillStyle = '#3a3f46';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2e3238';
    for (let i = 0; i < 40; i += 1) g.fillRect((i * 37) % w, (i * 53) % h, 3, 3);
    // Dashed centre line.
    g.fillStyle = '#e8c85a';
    for (let y = 0; y < h; y += 32) g.fillRect(w / 2 - 2, y, 4, 18);
  });
}

function skyTexture() {
  return paintTexture(4, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#6fb2e8');
    grad.addColorStop(0.55, '#a8d2f0');
    grad.addColorStop(0.8, '#f6d9a0');
    grad.addColorStop(1, '#f2c184');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function waterTexture() {
  const tex = paintTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#2f7fb8';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 24; i += 1) g.fillRect((i * 47) % w, (i * 31) % h, 18, 2);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

/** A painted sign face for a billboard: big invented-brand text on a flat colour. */
function signTexture(bg, fg, lines) {
  return paintTexture(256, 128, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = 6;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = fg;
    g.font = 'bold 40px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((line, i) => {
      g.fillText(line, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 46);
    });
  });
}

export function buildCity(scene, rng) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);
  const m4 = new THREE.Matrix4();

  // Sky: a warm gradient, a sun disc with a halo, and slow clouds.
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(PALETTE.fog, 260, 720);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(64, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.28, fog: false }),
  );
  halo.position.set(320, 260, -380);
  halo.lookAt(0, 0, 0);
  group.add(halo);
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(26, 24),
    new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false }),
  );
  sun.position.set(320, 260, -380);
  sun.lookAt(0, 0, 0);
  group.add(sun);

  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
  const clouds = [];
  for (let i = 0; i < 14; i += 1) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rng.range(8, 16), 10, 8), cloudMat);
      puff.position.set(j * rng.range(8, 14) - 12, rng.range(-2, 2), rng.range(-4, 4));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(rng.range(-320, 320), rng.range(120, 170), rng.range(-320, 320));
    group.add(cloud);
    clouds.push(cloud);
  }

  // Light: a warm sun with a shadow box that follows the player, plus a sky bounce.
  const sunLight = new THREE.DirectionalLight(0xfff0d0, 2.6);
  sunLight.position.set(120, 180, 60);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.left = -110;
  sunLight.shadow.camera.right = 110;
  sunLight.shadow.camera.top = 110;
  sunLight.shadow.camera.bottom = -110;
  sunLight.shadow.camera.near = 20;
  sunLight.shadow.camera.far = 520;
  sunLight.shadow.bias = -0.0015;
  scene.add(sunLight);
  scene.add(sunLight.target);
  scene.add(new THREE.HemisphereLight(0xbfd9ee, 0x8a7a5e, 0.9));

  // Ground: sidewalks everywhere, roads as dark strips with lane dashes.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshLambertMaterial({ color: 0x9aa0a3 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const stripTex = roadTexture();
  stripTex.wrapS = THREE.RepeatWrapping;
  stripTex.wrapT = THREE.RepeatWrapping;
  const roadLen = CITY.grid * 2 * CITY.pitch + CITY.roadHalf * 2;
  for (const c of ROADS) {
    const texV = stripTex.clone();
    texV.needsUpdate = true;
    texV.repeat.set(1, roadLen / 28);
    const vertical = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.roadHalf * 2, roadLen),
      new THREE.MeshLambertMaterial({ map: texV }),
    );
    vertical.rotation.x = -Math.PI / 2;
    vertical.position.set(c, 0.02, 0);
    vertical.receiveShadow = true;
    group.add(vertical);
    const texH = stripTex.clone();
    texH.needsUpdate = true;
    texH.repeat.set(1, roadLen / 28);
    const horizontal = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.roadHalf * 2, roadLen),
      new THREE.MeshLambertMaterial({ map: texH }),
    );
    horizontal.rotation.x = -Math.PI / 2;
    horizontal.rotation.z = Math.PI / 2;
    horizontal.position.set(0, 0.01, c);
    horizontal.receiveShadow = true;
    group.add(horizontal);
  }

  // Buildings: one sidewalk slab per block, one or two buildings standing on it.
  const slabMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
  const slabGeo = new THREE.PlaneGeometry(CITY.pitch - CITY.roadHalf * 2, CITY.pitch - CITY.roadHalf * 2);
  const facadeMats = PALETTE.building.map((base) => {
    const tex = facadeTexture(`#${base.toString(16).padStart(6, '0')}`, true);
    tex.wrapS = THREE.RepeatWrapping;
    return new THREE.MeshLambertMaterial({ map: tex });
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4640 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);

  // The bank: a wide stone building at the city centre, the target of the last mission.
  const bank = { x: 28, z: 28, w: 34, d: 26, h: 26 };
  const bankMat = new THREE.MeshLambertMaterial({ color: 0xe8dcc0 });
  const bankRoof = new THREE.MeshLambertMaterial({ color: 0xc8a040 });
  const bankMesh = new THREE.Mesh(boxGeo, [bankMat, bankMat, bankRoof, roofMat, bankMat, bankMat]);
  bankMesh.scale.set(bank.w, bank.h, bank.d);
  bankMesh.position.set(bank.x, 0.05, bank.z);
  bankMesh.castShadow = true;
  bankMesh.receiveShadow = true;
  group.add(bankMesh);
  colliders.push({ minX: bank.x - bank.w / 2, maxX: bank.x + bank.w / 2, minZ: bank.z - bank.d / 2, maxZ: bank.z + bank.d / 2 });

  for (let bi = -CITY.grid; bi < CITY.grid; bi += 1) {
    for (let bj = -CITY.grid; bj < CITY.grid; bj += 1) {
      const bx = bi * CITY.pitch + CITY.pitch / 2;
      const bz = bj * CITY.pitch + CITY.pitch / 2;
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(bx, 0.05, bz);
      slab.receiveShadow = true;
      group.add(slab);

      // The centre block holds the bank; skip its other buildings.
      if (bi === 0 && bj === 0) continue;
      const distCentre = Math.hypot(bx, bz) / (CITY.grid * CITY.pitch);
      const split = rng.next() < 0.55;
      const lots = split ? 2 : 1;
      for (let lot = 0; lot < lots; lot += 1) {
        const along = split ? (lot === 0 ? -1 : 1) : 0;
        const horizontal = rng.next() < 0.5;
        const w = horizontal ? rng.range(15, 20) : rng.range(15, 38);
        const d = horizontal ? rng.range(15, 38) : rng.range(15, 20);
        const cx = bx + (horizontal ? along * 11 : rng.range(-6, 6));
        const cz = bz + (horizontal ? rng.range(-6, 6) : along * 11);
        const h = Math.max(9, rng.range(10, 34) + (1 - distCentre) * rng.range(8, 34));
        const mat = facadeMats[Math.floor(rng.next() * facadeMats.length)];
        const mesh = new THREE.Mesh(boxGeo, [mat, mat, roofMat, roofMat, mat, mat]);
        mesh.scale.set(w, h, d);
        mesh.position.set(cx, 0.05, cz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
      }
    }
  }

  // Beach and water on the east edge.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 760),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CITY.bound + 45, 0.03, 0);
  sand.receiveShadow = true;
  group.add(sand);
  const waterTex = waterTexture();
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 760),
    new THREE.MeshLambertMaterial({ map: waterTex }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(CITY.bound + 90 + 210, 0.01, 0);
  group.add(water);

  // Palms: instanced trunks and crowns along the sidewalks and the beach.
  const palmSpots = [];
  for (let i = 0; i < 46; i += 1) {
    const bi = rng.int(-CITY.grid, CITY.grid - 1);
    const bj = rng.int(-CITY.grid, CITY.grid - 1);
    const bx = bi * CITY.pitch + CITY.pitch / 2 + rng.pick([-20, 20]);
    const bz = bj * CITY.pitch + CITY.pitch / 2 + rng.pick([-20, 20]);
    palmSpots.push([bx, bz]);
  }
  for (let i = 0; i < 8; i += 1) palmSpots.push([CITY.bound + rng.range(8, 60), rng.range(-220, 220)]);
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.4, 6);
  trunkGeo.translate(0, 2.7, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const crownGeo = new THREE.IcosahedronGeometry(2.1, 0);
  crownGeo.scale(1, 0.45, 1);
  crownGeo.translate(0, 5.8, 0);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
  palmSpots.forEach(([x, z], i) => {
    m4.makeTranslation(x, 0.05, z);
    trunks.setMatrixAt(i, m4);
    crowns.setMatrixAt(i, m4);
  });
  trunks.castShadow = true;
  crowns.castShadow = true;
  group.add(trunks);
  group.add(crowns);

  // Street lamps along the roads.
  const lampSpots = [];
  for (const c of ROADS) {
    for (let s = -224; s <= 224; s += 56) {
      lampSpots.push([c + 7.5, s]);
      lampSpots.push([c - 7.5, s + 28]);
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6.4, 6);
  poleGeo.translate(0, 3.2, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c313a });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const headGeo = new THREE.SphereGeometry(0.32, 8, 6);
  headGeo.translate(0, 6.5, 0);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0x554400 });
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    m4.makeTranslation(x, 0.05, z);
    poles.setMatrixAt(i, m4);
    heads.setMatrixAt(i, m4);
  });
  group.add(poles);
  group.add(heads);

  // Traffic lights at the central intersections.
  const lightPoleMat = new THREE.MeshLambertMaterial({ color: 0x22262e });
  const redMat = new THREE.MeshLambertMaterial({ color: 0xc23b2e, emissive: 0x4a0f08 });
  const greenMat = new THREE.MeshLambertMaterial({ color: 0x2e9e5b, emissive: 0x0a3a18 });
  for (const ix of [-112, -56, 0, 56, 112]) {
    for (const iz of [-112, -56, 0, 56, 112]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 5.2, 6), lightPoleMat);
      pole.position.set(ix + 7.5, 2.6, iz + 7.5);
      group.add(pole);
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), lightPoleMat);
      housing.position.set(ix + 7.5, 5.0, iz + 7.5);
      group.add(housing);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), rng.next() < 0.5 ? greenMat : redMat);
      lamp.position.set(ix + 7.5, 5.3, iz + 7.5);
      group.add(lamp);
    }
  }

  // Street props: benches and hydrants on the sidewalks, bus shelters at the kerb,
  // and big painted billboards over the avenues. All invented brands, all decorative
  // (no colliders — the poles stand clear of the driving line). Anything placed near
  // a block is pushed out of the buildings first, so no prop hides inside a wall.
  function clearOfBuildings(x, z, pad) {
    for (const b of colliders) {
      if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) {
        const pl = x - (b.minX - pad);
        const pr = (b.maxX + pad) - x;
        const pt = z - (b.minZ - pad);
        const pb = (b.maxZ + pad) - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = b.minX - pad;
        else if (m === pr) x = b.maxX + pad;
        else if (m === pt) z = b.minZ - pad;
        else z = b.maxZ + pad;
      }
    }
    return { x, z };
  }
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const metalMat = new THREE.MeshLambertMaterial({ color: 0x2c313a });
  const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  const benchSeatGeo = new THREE.BoxGeometry(1.9, 0.12, 0.55);
  const benchBackGeo = new THREE.BoxGeometry(1.9, 0.62, 0.1);
  const benchLegGeo = new THREE.BoxGeometry(0.12, 0.42, 0.5);
  for (let i = 0; i < 12; i += 1) {
    // A sidewalk spot 20 m from a block centre, pushed out of any building.
    const bi = rng.int(-CITY.grid, CITY.grid - 1);
    const bj = rng.int(-CITY.grid, CITY.grid - 1);
    const bx = bi * CITY.pitch + CITY.pitch / 2;
    const bz = bj * CITY.pitch + CITY.pitch / 2;
    const edge = rng.int(0, 3);
    const off = 20;
    let px;
    let pz;
    if (edge === 0) { px = bx - off; pz = bz + rng.range(-16, 16); }
    else if (edge === 1) { px = bx + off; pz = bz + rng.range(-16, 16); }
    else if (edge === 2) { px = bx + rng.range(-16, 16); pz = bz - off; }
    else { px = bx + rng.range(-16, 16); pz = bz + off; }
    const s = clearOfBuildings(px, pz, 1.2);
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(benchSeatGeo, woodMat);
    seat.position.y = 0.46;
    seat.castShadow = true;
    const back = new THREE.Mesh(benchBackGeo, woodMat);
    back.position.set(0, 0.8, -0.24);
    back.castShadow = true;
    const legL = new THREE.Mesh(benchLegGeo, metalMat);
    legL.position.set(-0.8, 0.21, 0);
    const legR = new THREE.Mesh(benchLegGeo, metalMat);
    legR.position.set(0.8, 0.21, 0);
    bench.add(seat, back, legL, legR);
    bench.position.set(s.x, 0.05, s.z);
    bench.rotation.y = (Math.PI / 2) * rng.int(0, 3);
    group.add(bench);
  }
  const hydrantGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.7, 8);
  const hydrantCapGeo = new THREE.SphereGeometry(0.2, 8, 6);
  for (let i = 0; i < 12; i += 1) {
    const ix = ROADS[rng.int(0, ROADS.length - 1)];
    const iz = ROADS[rng.int(0, ROADS.length - 1)];
    const spot = clearOfBuildings(ix + rng.pick([-8.5, 8.5]), iz + rng.pick([-8.5, 8.5]), 0.8);
    const hydrant = new THREE.Group();
    const body = new THREE.Mesh(hydrantGeo, hydrantMat);
    body.position.y = 0.35;
    body.castShadow = true;
    const cap = new THREE.Mesh(hydrantCapGeo, hydrantMat);
    cap.position.y = 0.78;
    hydrant.add(body, cap);
    hydrant.position.set(spot.x, 0.05, spot.z);
    group.add(hydrant);
  }
  // Bus shelters: two posts, a roof panel and a bench, facing the road.
  const shelterRoofGeo = new THREE.BoxGeometry(4.4, 0.14, 1.8);
  const shelterPostGeo = new THREE.BoxGeometry(0.14, 2.6, 0.14);
  const shelterGlassMat = new THREE.MeshLambertMaterial({ color: 0x9fc8e8, transparent: true, opacity: 0.45 });
  for (const [sx, sz, rot] of [[-48, 8.5, 0], [64, -8.5, Math.PI], [8.5, 120, Math.PI / 2], [-8.5, -176, -Math.PI / 2]]) {
    const spot = clearOfBuildings(sx, sz, 2.5);
    const shelter = new THREE.Group();
    const roof = new THREE.Mesh(shelterRoofGeo, metalMat);
    roof.position.y = 2.6;
    roof.castShadow = true;
    const postL = new THREE.Mesh(shelterPostGeo, metalMat);
    postL.position.set(-2, 1.3, 0);
    const postR = new THREE.Mesh(shelterPostGeo, metalMat);
    postR.position.set(2, 1.3, 0);
    const back = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.4, 0.08), shelterGlassMat);
    back.position.set(0, 1.4, -0.8);
    const seat = new THREE.Mesh(benchSeatGeo, woodMat);
    seat.position.set(0, 0.46, -0.5);
    shelter.add(roof, postL, postR, back, seat);
    shelter.position.set(spot.x, 0.05, spot.z);
    shelter.rotation.y = rot;
    group.add(shelter);
  }
  // Billboards: painted panels on twin poles, high enough for traffic to pass under.
  const billboardPoleGeo = new THREE.CylinderGeometry(0.18, 0.22, 7.6, 8);
  const billboardAds = [
    ['#c23b2e', '#ffe9a8', ['SOLMAR', 'CITY']],
    ['#2f6fb8', '#ffffff', ["RICO'S", 'GARAGE']],
    ['#3f8f4f', '#ffe9a8', ['PALMS', 'MOTEL']],
    ['#e8a020', '#1c2733', ['SOLMAR', 'BEACH']],
    ['#8a6fd8', '#ffffff', ['TACO', 'PALMS']],
  ];
  const billboardSpots = [[65, -119], [-119, 65], [119, 175], [-175, -119], [175, -65]];
  billboardAds.forEach(([bg, fg, lines], i) => {
    const [bx, bz] = billboardSpots[i];
    const spot = clearOfBuildings(bx, bz, 6);
    const tex = signTexture(bg, fg, lines);
    const faceMat = new THREE.MeshLambertMaterial({ map: tex });
    const backMat = new THREE.MeshLambertMaterial({ color: 0x2c313a });
    const board = new THREE.Group();
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(11, 5.5, 0.35),
      [backMat, backMat, backMat, backMat, faceMat, backMat],
    );
    panel.position.y = 10.2;
    panel.castShadow = true;
    const poleL = new THREE.Mesh(billboardPoleGeo, metalMat);
    poleL.position.set(-4.4, 3.8, 0);
    const poleR = new THREE.Mesh(billboardPoleGeo, metalMat);
    poleR.position.set(4.4, 3.8, 0);
    board.add(panel, poleL, poleR);
    board.position.set(spot.x, 0.05, spot.z);
    board.rotation.y = Math.atan2(-spot.x, -spot.z); // face the city centre
    group.add(board);
  });

  // Named places the missions send the player to.
  const places = {
    garage: { x: -168, z: 112, label: "Rico's Garage" },
    docks: { x: 210, z: -168, label: 'The Docks' },
    motel: { x: 112, z: 168, label: 'The Palms Motel' },
    bank: { x: 28, z: 52, label: 'Solmar National Bank' },
    safehouse: { x: -224, z: -224, label: 'Safehouse' },
    beach: { x: 280, z: 40, label: 'Solmar Beach' },
  };

  return {
    colliders,
    places,
    sunLight,
    roads: ROADS,
    /** Push a circle out of every building it overlaps; returns the corrected position. */
    collideCircle(x, z, r) {
      let nx = x;
      let nz = z;
      for (const b of colliders) {
        const cx = Math.max(b.minX, Math.min(nx, b.maxX));
        const cz = Math.max(b.minZ, Math.min(nz, b.maxZ));
        const dx = nx - cx;
        const dz = nz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          nx = cx + (dx / d) * r;
          nz = cz + (dz / d) * r;
        } else if (d2 <= 0.0001) {
          // Centre inside the box: push out along the smallest penetration.
          const pl = nx - b.minX;
          const pr = b.maxX - nx;
          const pt = nz - b.minZ;
          const pb = b.maxZ - nz;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) nx = b.minX - r;
          else if (m === pr) nx = b.maxX + r;
          else if (m === pt) nz = b.minZ - r;
          else nz = b.maxZ + r;
        }
      }
      // The city edge is a soft wall (except the beach road east, which ends at the sand).
      nx = Math.max(-CITY.bound - 8, Math.min(CITY.bound + 64, nx));
      nz = Math.max(-CITY.bound - 8, Math.min(CITY.bound + 8, nz));
      return { x: nx, z: nz };
    },
    /** A random point on a road, for spawning traffic. */
    roadPoint() {
      const axis = rng.next() < 0.5 ? 'x' : 'z';
      const coord = ROADS[Math.floor(rng.next() * ROADS.length)];
      const along = rng.range(-220, 220);
      return axis === 'x' ? { x: along, z: coord } : { x: coord, z: along };
    },
    /** A random point on a sidewalk, for spawning pedestrians. */
    sidewalkPoint() {
      const bi = rng.int(-CITY.grid, CITY.grid - 1);
      const bj = rng.int(-CITY.grid, CITY.grid - 1);
      const bx = bi * CITY.pitch + CITY.pitch / 2;
      const bz = bj * CITY.pitch + CITY.pitch / 2;
      const edge = rng.int(0, 3);
      const off = 21;
      if (edge === 0) return { x: bx - off, z: bz + rng.range(-18, 18) };
      if (edge === 1) return { x: bx + off, z: bz + rng.range(-18, 18) };
      if (edge === 2) return { x: bx + rng.range(-18, 18), z: bz - off };
      return { x: bx + rng.range(-18, 18), z: bz + off };
    },
    /** Keep the sun's shadow box centred on the player. */
    followSun(x, z) {
      sunLight.position.set(x + 120, 180, z + 60);
      sunLight.target.position.set(x, 0, z);
    },
    /** Slow ambient motion: clouds drift, water shimmers. */
    update(dt, t) {
      for (const cloud of clouds) {
        cloud.position.x += dt * 1.5;
        if (cloud.position.x > 360) cloud.position.x = -360;
      }
      waterTex.offset.x = t * 0.004;
      waterTex.offset.y = t * 0.002;
    },
  };
}
