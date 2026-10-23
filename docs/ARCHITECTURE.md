# Runtime architecture

Slop San Francisco is a static application. `index.html` imports pinned Three.js/WebGPU/TSL modules from jsDelivr,
then loads ordered IIFEs sharing `window.NYC` (the inherited internal namespace). There is no bundler or application server.

| Layer | Main modules | Responsibility |
|---|---|---|
| Data | `sf-geodata`, `sf-places`, `data-loader`, `terrain` | Generated vector geography, official neighborhoods and destinations, SFB1 arrays, height/normal/ground queries |
| Detailed core | `sf-ground`, `terrain-mesh`, `drape`, `buildings`, `sf-buildings` | Terrain LOD, curbs, footprint buildings, facade styles and collision geometry |
| Region | `region` | City/horizon terrain, measured simplified buildings, instancing helpers, vegetation and distance culling |
| Transport | `road-network`, `grade-separation`, `traffic`, `sf-transit` | Street lanes, junction controls, tunnels/freeways, traffic and transit |
| Landmarks | `landmarks`, `sf-bridges` | Site-specific procedural models and bridge structure |
| Rendering | `lighting`, `tsl-materials`, `post-processing`, `scene-culling` | Sky/sun, materials, depth-composited fog, reflections/bloom and visibility |
| Interaction | `controllers`, `cameras`, `touch-controls` | Walking/driving/cycling/flight, safe arrivals, camera presets and touch input |
| UI | `city-config`, `sf-map`, `settings` | Place labels, cached terrain map, search, teleports, native pause dialog and quality selection |
| Integration | `main` | Boot order, animation, shared collision world, UI wiring, quality graph selection and benchmark harness |

Core terrain and street geometry load first; regional terrain joins after the core road network is built so distant
land cannot accidentally extend the driving network. Ground modes stay in the detailed core. Map clicks and destinations
outside it switch to flight. Height sampling always goes through the runtime terrain/grade-separation APIs.

The map computes its 8 m city hillshade lazily once, then caches static canvases per viewport. Dynamic markers are separate.
Quality presets change regional draw distances, reflection resolution and sun shadows. Low selects a separate postprocessing
graph without SSR. Automatic quality samples three seconds after startup; manual selection remains authoritative.
The pause dialog stops simulation, clears held controls, traps focus natively and restores focus on resume.

Offline tools in `tools/` turn DataSF/OSM/USGS inputs into committed runtime arrays. Raw inputs are ignored and carry provenance
in their manifest; `sf-places.js` also embeds its neighborhood source hash. `node:test` tests use the production modules in VM
harnesses, with data/runtime integration checks. Browser benchmarks and review captures cover actual WebGPU rendering.
