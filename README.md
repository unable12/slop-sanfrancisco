# Slop San Francisco

**Walk the hills. Drive Market Street. Fly above the skyline.**

A data-built San Francisco running in your browser with [three.js](https://threejs.org/), WebGPU and TSL.
Explore on foot, by bike, in a Waymo robotaxi or by helicopter—or take the assisted ride from the Ferry Building to Nob Hill.

![A Waymo driving along Market Street in Slop San Francisco](docs/media/waymo-market.gif)

### A city, from street level to skyline

| Detailed downtown core | Wider city scenery | Ways to explore |
|:---:|:---:|:---:|
| **15,735** building records | **154,870** regional buildings | **4** movement modes |
| Real streets, curbs, terrain and collisions | San Francisco, with Marin and the East Bay on the horizon | Walk · Drive · Cycle · Fly |

The counts describe the committed datasets, not buildings visible in one frame. Regional buildings use simplified
geometry; the detailed core has the driving network and collisions. Sources: [core building audit](docs/reports/building-types-core.md)
and [regional data report](docs/reports/region.md).

![A helicopter passing beside Salesforce Tower above downtown San Francisco](docs/media/helicopter-salesforce.gif)

- **A complete first ride:** passenger pickup, turn guidance, junction right-of-way, hill climbing and drop-off at Nob Hill.
- **A living city:** cars, buses, pedestrians, surface transit, ferries and changing light.
- **San Francisco's terrain:** real hills, recognizable landmarks, marine fog and a searchable terrain map.
- **A detailed player Waymo:** dedicated crossover body, roof/fender sensors, modeled grille, split-spoke wheels and clearcoat paint. [Model notes](docs/vehicles/waymo.md).
- **Sound in every mode:** footsteps, bicycle motion, electric motor/road noise and helicopter rotor/wind.

*These silent loops are cinematic captures from the running engine, with staged vehicle and camera paths.
[Capture details and reproduction](docs/media/README.md).*

Derived from [slop-newyork](https://github.com/mrdoob/slop-newyork) by mrdoob. City data comes from OpenStreetMap,
DataSF and USGS; see [sources and attribution](docs/data-sources.md). [Release review](docs/acceptance.md)
is recorded separately. No public demo has been published.

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

## Ferry Building to Nob Hill

Choose **First ride**, then **Start at the Ferry Building**. Stop in the amber ring and pick up your passenger.
Assisted driving follows connected street lanes through Washington, Sansome and California Street, obeying signals
and yielding to traffic. The map shows the actual route; the ride card gives the next turn and remaining distance.
Allow 5–12 minutes depending on traffic. Stop at Nob Hill and choose **Drop off passenger** to finish.

**Take the wheel** (or a movement key) switches to manual driving. **Resume assisted driving** returns control;
**Recover** appears when you leave the route. Changing mode or teleporting ends the ride. Closing the ride card
keeps the trip running; Settings and the full map pause the city.

The toolbar's **Sound** button works everywhere: rotor and wind when flying, footsteps while walking,
chain/tire sound when cycling, and an electric motor hum and road noise when driving. The ride adds door,
turn and arrival chimes. Audio is synthesized locally, starts only after a click, and mutes while paused or
in a hidden tab. Starting a ride enables sound unless you have explicitly muted it. Sound starts off after reload.

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
