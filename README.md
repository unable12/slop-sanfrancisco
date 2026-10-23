# Slop San Francisco

![The Transamerica Pyramid over the Financial District, with the bay behind](docs/review/p5/p5-transamerica-mid.jpg)

San Francisco in the browser, built with [three.js](https://threejs.org/), WebGPURenderer and TSL. Walk, drive, cycle or fly
through the city's north-east quarter on its real hills. The streets, curbs and building heights come from real data, and
the cars stop at the real signals and stop signs.

Derived from [slop-newyork](https://github.com/mrdoob/slop-newyork) by mrdoob. The detailed north-east core is surrounded
by simplified city scenery, Marin and the East Bay, with marine fog and ferries. Phase 7 adds the terrain map, official
neighborhood labels, destination shortcuts, pause/settings and quality presets. Release review is recorded in
[the acceptance report](docs/acceptance.md). No public demo has been published.

## Run it

You need Node and a browser with WebGPU (a recent Chrome or Edge). There's no install or build step.

```bash
node tools/serve.mjs
```

Then open http://127.0.0.1:8080. three.js loads from a CDN, so the first start needs internet.

## Controls

| Key | |
|---|---|
| `1` `2` `3` `4` | Walk, drive, cycle, fly |
| `W` `A` `S` `D` or arrow keys | Move and steer |
| `Shift` | Sprint or boost |
| `Space` / `E`, `Q` / `C` | Helicopter up and down |
| `V` | Change camera |
| `M` | Map |
| `R` | Reset to a nearby clear road |
| `Esc` | Pause/settings; close the map or an open menu |
| `H` | Hide/show the HUD |

Use the Teleport menu (top right) to jump to the Ferry Building, Coit Tower, Lombard Street, Oracle Park and other landmarks.
Use the Fog menu for Clear, Light haze or Marine layer (`?fog=clear|haze|marine`). Helicopters can explore
the wider region; walking and driving remain in the detailed north-east core. Destinations marked “Fly” switch to the helicopter.

Settings pause the simulation and offer time, fog, downtown traffic density, shadows and Low/Medium/High quality.
Automatic quality samples three seconds after startup. Low removes reflections and sun shadows and limits regional buildings
to 3 km; Medium uses 5 km; High uses 8.5 km. Use `?quality=low|medium|high` for a repeatable comparison.
The map supports search, pan, zoom and click-to-teleport. Outside the driving core, map arrivals switch to flight.

## Regenerate data

Runtime data is committed; these commands are only needed to rebuild it. Install the offline tool dependencies in `tools/`
with `npm ci --prefix tools`, then fetch the source snapshots (network access and substantial disk space required):

```bash
node tools/fetch-geodata.mjs --box core
node tools/fetch-geodata.mjs --box city
node tools/fetch-geodata.mjs --box landmarks
node tools/fetch-horizon.mjs
node --max-old-space-size=8192 tools/build-geodata.mjs core
node --max-old-space-size=8192 tools/geo-region.mjs
curl --fail 'https://data.sfgov.org/resource/j2bu-swwd.geojson' -o data/raw/neighborhoods-p7.geojson
node tools/geo-neighborhoods.mjs
```

Use the same snapshots/hashes for reproducibility. See [data sources](docs/data-sources.md) and
[architecture](docs/ARCHITECTURE.md). The optional `node tools/build-static.mjs` creates a local `dist/` package; it does not deploy.

## Limitations

Traffic rules and signals are approximations. Facade styles use neighborhood tables, not surveys of each building.
The wider city is simplified scenery without the core’s full driving network or building collisions. Marine fog is a
screen-space depth approximation for transparent objects. Performance results apply to the measured machine; browser and
GPU support vary. A clear error screen explains unavailable WebGPU. No crash camera shake is added; reduced-motion settings
suppress decorative CSS animation.

## Tests

```bash
node --test tests/*.test.cjs tests/*.test.mjs
```

## License and data

The code is under the [MIT License](LICENSE). The data comes from City and County of San Francisco / DataSF (PDDL/CC0), USGS 3DEP and
© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). See [NOTICE.md](NOTICE.md).
