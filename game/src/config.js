// Solmar City — shared constants.
// Every number the game tunes lives here so later phases read one place.

export const CONFIG = Object.freeze({
  // World
  worldSize: 500, // metres, square city from -250 to +250 on x and z
  roadSpacing: 50, // metres between road centrelines
  blockSize: 40, // metres of buildable block between roads
  roadWidth: 10, // metres of asphalt per road
  sidewalkWidth: 2, // metres of pavement each side of a road

  // Player (on foot)
  playerWalkSpeed: 6, // m/s
  playerRunSpeed: 10, // m/s while Shift is held
  playerRadius: 0.6, // metres, collision cylinder
  playerHeight: 1.8, // metres

  // Camera (third person, behind the player)
  cameraHeight: 4.5, // metres above the player
  cameraDistance: 8, // metres behind the player
  cameraSnapFirstFrame: true,

  // Wanted level and police
  wantedMax: 5,
  wantedDecayDistance: 30, // metres: no police within this for...
  wantedDecayTime: 10, // ...seconds, then wanted drops by one
  policeRamDamageCar: 5, // damage when the player is in a car
  policeRamDamageFoot: 22, // damage when the player is on foot
  policeRamCooldown: 2.5, // seconds per police car
  policeTopSpeed: 14, // m/s

  // Car-to-car bump rule: speed cut only for NON-police cars
  bumpDistance: 4.2, // metres
  bumpSpeedCut: 0.3, // 30% cut while a non-police car is within range

  // Cash pickups
  pickupCount: 12,
  pickupValue: 25, // dollars each
  pickupRespawn: 20, // seconds after collection

  // Missions (rewards in dollars, story order)
  missionRewards: [200, 350, 500, 1500],
  packageTimeLimit: 100, // seconds for mission 2

  // Save
  saveKey: 'solmar-city-save-v1',

  // Sky and light
  hemisphereIntensity: 1.6, // strong fill so shadowed asphalt never reads as a void
  sunIntensity: 2.2,
  sunElevation: 38, // degrees above the horizon
  sunAzimuth: 135, // degrees, afternoon sun from the south-east
  fogNear: 180,
  fogFar: 520,

  // City look
  asphaltColor: 0x5c5c66, // dark grey, light enough to read as road in shadow
  sidewalkColor: 0x9a9a94,
  sandColor: 0xd9c28a,
  waterColor: 0x2e7f9e,
  grassColor: 0x5d8a4a,
  facadeColors: [
    0xe8dcc8, // warm cream
    0xd9a066, // terracotta
    0x8fb8c9, // pale blue
    0xc96f6f, // dusty rose
    0x9db98a, // sage green
    0xe6c25a, // sunny yellow
    0x7a9cc6, // sky blue
    0xd98cb3, // pink
    0xb8b0a0, // stone grey
    0xf2ede4, // off white
  ],
});
