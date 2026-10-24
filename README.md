# Slop San Francisco

**Made by [@unable0_](https://x.com/unable0_)**. Based on [mrdoob’s Slop New York](https://github.com/mrdoob/slop-newyork).

**[play the demo →](https://unable12.github.io/slop-sanfrancisco/)** · [contribute](CONTRIBUTING.md)

San Francisco in your browser. Walk, drive a Waymo, cycle or fly a helicopter through real hills, city traffic and fog.
Requires a browser with WebGPU enabled.

**Market Street**

![A Waymo driving along Market Street in Slop San Francisco](docs/media/waymo-market.gif)

**Above Salesforce Tower**

![A helicopter passing beside Salesforce Tower above downtown San Francisco](docs/media/helicopter-salesforce.gif)

*Captured in the engine using staged camera and vehicle paths. [Capture details](docs/media/README.md).*

| Downtown core | Wider city scenery |
|:---:|:---:|
| **15,735** building records | **154,870** regional buildings |
| Detailed streets, terrain and building collisions | Simplified buildings across San Francisco |

Counts describe the datasets, not buildings visible at once. [Core data](docs/reports/building-types-core.md) · [Regional data](docs/reports/region.md).

## How it was built

A static HTML/CSS/JavaScript app using Three.js, WebGPU and TSL shaders. No application backend or runtime bundler.

1. **Build the geography offline.** Tools fetch DataSF streets, building footprints, curbs, tree inventories and
   other city layers, OpenStreetMap geometry/tags, and USGS elevation. The pipeline projects them into one local
   coordinate frame, records source provenance and writes compact runtime arrays and binary terrain/building data.
2. **Put the city on its hills.** Terrain height queries place streets, sidewalks, buildings and moving actors
   on the same surface. Grade-separation metadata handles tunnels, freeway decks and streets below structures.
3. **Generate the detailed core.** Building footprints become procedural masses and neighborhood-specific facades.
   Dedicated landmark models supply the skyline; inventory trees, transit lines and street furniture add detail.
   The player Waymo uses its own detailed body, wheels and sensor geometry.
4. **Extend the view across the bay.** Regional terrain and simplified building instances fill the wider city.
   Instancing, distance culling and terrain levels of detail control the rendering workload. Marine fog is composed
   from scene depth, with time-of-day lighting, reflections and bloom.
5. **Drive through a connected street network.** Lanes, turn connectors, signals and grouped-junction right-of-way
   support traffic and assisted driving. The ride uses the same player controller as manual driving.
6. **Handle contact and sound.** Exact building outlines and a shared car footprint handle wall contact and
   safe placement. Small movement steps prevent tunneling; contact retains wall sliding. Web Audio synthesizes
   movement and ride sounds locally. The map, pause menu and responsive toolbar share the same runtime state.


More detail: [architecture](docs/ARCHITECTURE.md) · [data sources](docs/data-sources.md) · [Waymo model](docs/vehicles/waymo.md) · [performance](docs/perf-log.md).

## Run locally

With Node.js 22 or newer:

```bash
node tools/serve.mjs
```

Open http://127.0.0.1:8080. Runtime data is included, so no install is needed. Internet access is required for Three.js from the pinned CDN.

<details>
<summary>Keyboard controls</summary>

| Key | Action |
|---|---|
| `1` `2` `3` `4` | Walk, drive, cycle, fly |
| `W` `A` `S` `D` or arrow keys | Move and steer |
| `Shift` | Sprint or boost |
| `Space` / `E`, `Q` / `C` | Helicopter up and down |
| `V` | Change camera |
| `M` | Map |
| `R` | Reset to a nearby clear road |
| `Esc` | Pause/settings |
| `H` | Hide/show the HUD |

</details>

## Scope

Ground exploration stays in the detailed downtown core; the wider region is scenery for flying. Assisted driving
follows one curated route. Tree and pedestrian impacts are not simulated, and some road/terrain seams remain.

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests and pull requests.
[Data pipeline](docs/data-sources.md) · [Deployment](docs/deployment.md).

## License and credits

Code: [MIT](LICENSE). Original work by mrdoob; San Francisco contributions by [@unable0_](https://x.com/unable0_).
Geographic data retains its own terms: DataSF (PDDL/CC0), USGS elevation (public domain) and
© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL).
See [NOTICE.md](NOTICE.md) for attribution. The Waymo depiction is independent procedural artwork.
