repo: qt/qt3d
branch: dev
path: tests/manual/planets-qml/images/solarsystemscope/

## Last sync
date: 2026-07-26T14:30:30Z

### Updated in this project
- Read qunabu/Gravity@main (README, index.html, src/scene/scale.ts) as reference for the orbit view — no files copied
- Adopting its two scale models: visual radial remap (d = B·AU^0.62) + logarithmic body-size map
- Rebuilt planet-engine.js around real data: axial tilt, oblateness, sidereal spin, equatorial rings with planet shadow, real moon systems

## Reference repos
- qunabu/Gravity@main — solar-system scale model + procedural sun inspiration (read only)

## Screen map
| Screen | Repo files |
| Little Worlds.dc.html — Milky Way tab | images2k/*.jpg, images2k/earthclouds.png (Saturn's rings are now procedural — no ring texture) |

## Sync history
- 2026-07-26T12:34:17Z qt/qt3d@dev — copied 2K solarsystemscope planet textures (CC-BY 4.0) into images2k/
- 2026-07-26T12:29:49Z jeromeetienne/threex.planets@master — initial 1K textures (since replaced)
