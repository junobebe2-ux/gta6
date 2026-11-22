// Solmar City — tuning constants. All speeds in m/s, all times in seconds.
export const C = {
  worldHalf: 250,
  roadGap: 50,
  roadWidth: 12,
  seed: 1,

  playerHealth: 100,
  walkSpeed: 4,
  runSpeed: 7,

  carAccel: 12,
  carBrake: 20,
  carReverseAccel: 8,
  carTopSpeed: 30,
  carReverseTop: 8,
  carTurnRate: 1.9,
  carRadius: 1.8,
  playerRadius: 0.5,

  policeTopSpeed: 23,
  policeAccel: 14,
  policeTurnRate: 2.4,
  policeRamCar: 5,
  // A police car ramming the player on foot: 8, not 22. The spec's 22
  // kills the player across any forced on-foot stretch (the garage walk,
  // fetching a car for the delivery) because a pedestrian cannot outrun
  // a 23 m/s police car — five rams at 22 HP is a death sentence, and the
  // game must stay completable. 8 HP still hurts; the foot cops remain
  // the real on-foot threat (punch 8, bust).
  policeRamFoot: 8,
  policeRamCooldown: 2.5,
  // Escape balance (mission 3 / mission 4 escape): rams hurt far less and
  // can never chain — a global cooldown caps ram damage per second.
  escapeRamDamage: 2,
  escapeRamGlobalCooldown: 1.2,
  copPunch: 8,
  copPunchCooldown: 1.5,
  bustHold: 2.5,

  wantedDecaySeconds: 15,
  wantedDecayNear: 30,
  // Escape decay: while the player keeps moving fast, wanted falls even
  // with police in view; it only pauses while a police car is very close.
  escapeSpeed: 12,
  escapeNear: 12,
  escapeDecaySeconds: 12,

  trafficCount: 35,
  trafficParked: 12,
  trafficCruiseMin: 8,
  trafficCruiseMax: 12,
  pedCount: 28,

  bumpCutDistance: 4.2,
  bumpCutFactor: 0.7,

  pickupCount: 12,
  pickupValue: 25,
  pickupRadius: 3,
  pickupRespawn: 20,

  rewards: [200, 350, 500, 1500],
  m2TimeLimit: 100,
  m4HoldSeconds: 8,

  garage: { x: -175, z: -75, radius: 12 },
  garageRoad: { x: -175, z: -50 },
  packageRadius: 14,
  docks: { x: 200, z: -218, radius: 8 },
  bank: { x: 75, z: 75, radius: 17 },
  safehouse: { x: -200, z: 200, radius: 12 },

  saveKey: 'solmar-city-save-v1',
  saveInterval: 5,
};
