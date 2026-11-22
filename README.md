[![Solmar City](https://make.fun/badge/gta6-01.svg?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Rank](https://make.fun/badge/gta6-01/junobebe2-ux/gta6/rank.svg?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Reward](https://make.fun/badge/gta6-01/junobebe2-ux/gta6/reward.svg?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar City

An open-world crime game in the spirit of GTA 6, built for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01). Playable offline in a desktop browser from static files — no network requests, no build step. Original everything: no Rockstar name, logo, character, map or asset.

Drive and walk a procedural sun-soaked coastal city, steal cars, dodge traffic and pedestrians, raise your wanted level and lose the heat, and pull off four story missions — from stealing your first wheels at Rico's Garage to robbing the Bank and escaping to the Safehouse.

## Run it

```sh
node serve.ts
# open http://127.0.0.1:8080/
```

Or open `game/index.html` through any static file server. `node main.ts` builds the entry dossier into `$MAKEFUN_OUTPUT_DIR` (default `/output`).

## Controls

W A S D drive & walk · E enter / exit car · F punch · Click shoot · Space handbrake · Shift run · Esc pause.

## Missions

1. **First Wheels** — steal a car and walk into Rico's Garage ($200)
2. **The Package** — pick up a package and deliver it to the Docks within 100 seconds ($350)
3. **Heat** — raise your wanted level to 3 stars, then lose the heat ($500)
4. **The Big Score** — rob the Bank, then escape to the Safehouse ($1,500)

Progress saves to localStorage; Continue restores cash and missions exactly.
