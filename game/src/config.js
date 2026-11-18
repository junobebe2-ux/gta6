// Every tuning number, colour and city constant in one place. Solmar City is a sun-soaked
// coastal city on a road grid: roads every PITCH metres, buildings filling the blocks between
// them, a beach on the east edge. Nothing here names a real place or a commercial game.
export const CITY = {
  pitch: 56, // road centre to road centre
  roadHalf: 6, // half the road width (roads are 12 m wide)
  grid: 4, // roads at -4..4 * pitch
  bound: 252, // the playable edge; the beach lies just past it
  blockInset: 2, // sidewalks eat this much of each block edge
};

export const STEP = 1 / 60; // fixed simulation step, 60 updates a second

export const PLAYER = {
  walkSpeed: 6.5,
  runSpeed: 10.5,
  radius: 0.7,
  health: 100,
  punchRange: 2.4,
  punchDamage: 34,
  shootRange: 70,
  shootDamage: 34,
  shootCooldown: 0.22,
  regenDelay: 8,
  regenRate: 6,
};

export const CAR = {
  accel: 16,
  brake: 30,
  reverseAccel: 10,
  maxSpeed: 34,
  maxReverse: 10,
  steer: 1.9,
  grip: 6,
  radius: 2.1,
  health: 100,
};

export const TRAFFIC = { cars: 20, speedMin: 7, speedMax: 12 };
export const PARKED = { count: 14 };
export const PEDS = { count: 16, walkSpeed: 1.6, runSpeed: 4.5 };

export const WANTED = {
  max: 5,
  stealCar: 1, // stealing an occupied car; an empty parked car is free
  hitPed: 1,
  shoot: 1,
  killCop: 2,
  explodeCar: 1,
  decayDelay: 10, // seconds with no police near and no crime before the level drops
  decayEvery: 6, // seconds per star lost while cooling down
  bustedHold: 3, // seconds a cop must hold the player on foot to bust them
  policeCarPerStar: 1,
  maxPoliceCars: 4,
  footCopsAt: 2,
  maxFootCops: 2,
};

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    giver: 'Rico',
    story: 'Rico needs a driver he can trust. Steal a car — any car — and bring it to the garage on Palm Row.',
    objective: 'Steal a car and drive to the garage',
    reward: 200,
  },
  {
    id: 'the-package',
    title: 'The Package',
    giver: 'Rico',
    story: 'A package is waiting at the docks. Pick it up and drop it at the motel before the heat catches up with you.',
    objective: 'Pick up the package, then deliver it to the motel',
    reward: 350,
    timeLimit: 100,
  },
  {
    id: 'heat',
    title: 'Heat',
    giver: 'Rico',
    story: 'The cops are onto the crew. Get yourself a 3-star wanted level, then shake them and go quiet.',
    objective: 'Reach 3 stars, then lose the cops',
    reward: 500,
  },
  {
    id: 'the-big-score',
    title: 'The Big Score',
    giver: 'Rico',
    story: 'One last job: the Solmar National Bank. Grab the cash and get to the safehouse. This is the one they will remember.',
    objective: 'Rob the bank, then escape to the safehouse',
    reward: 1500,
  },
];

export const PALETTE = {
  sky: 0x8ec9ee,
  skyHorizon: 0xf6d9a0,
  sun: 0xfff2c0,
  fog: 0xd8e4ee,
  asphalt: 0x3a3f46,
  sidewalk: 0x9aa0a3,
  sand: 0xe8d29a,
  water: 0x2f7fb8,
  grass: 0x6fae5e,
  building: [0xf2e3c6, 0xe8b48a, 0xf6d9a0, 0xdfe8ee, 0xe8a08a, 0xcfe0d8, 0xf0c98a, 0xd8c2e0],
  glass: 0x9fc8e8,
  player: 0x2f6fb8,
  police: 0x1c2733,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save lives between visits (this browser only). */
export const SAVE_KEY = 'solmar-city.save.v1';
