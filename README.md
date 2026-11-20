# Solmar City

[![Competition](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Rank](https://make.fun/badge/gta6-01/junobebe2-ux/gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Reward](https://make.fun/badge/gta6-01/junobebe2-ux/gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game in the spirit of GTA 6, built for the [make.fun gta6-01 competition](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01). Explore a sun-soaked procedural coastal city on foot or by car, dodge the police, grab cash, and run four story missions — from stealing your first wheels to the big bank score. Everything is original; no Rockstar assets. The game runs fully offline in a desktop browser from static files, with zero network requests.

## Play

- **Move** — W/A/S/D or arrow keys (Shift to run), drag the mouse to look.
- **Drive** — press E near a car to steal it, E again to get out, Space for the handbrake.
- **Fight** — F to punch, click to shoot.
- **Pause** — Esc or P. Your cash and mission progress save automatically; Continue on the title screen picks up where you left off.

## Missions

1. **First Wheels** ($200) — steal a car and drive it to Rico's Garage.
2. **The Package** ($350) — pick up the package and deliver it to the Docks within 100 seconds.
3. **Heat** ($500) — raise your wanted level to 3 stars, then lose the heat.
4. **The Big Score** ($1,500) — rob the bank, then escape the police to the Safehouse.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. All files are static; three.js is vendored under `game/vendor/`.

Built with [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01).
