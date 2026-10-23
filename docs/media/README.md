# Showcase media

Two silent cinematic clips captured from the actual Three.js/WebGPU scene at 1280 × 720, 30 fps:

- **Market Street:** a Waymo tracking shot, midday/light haze.
- **Salesforce Tower:** a helicopter flyby, midday/clear, with the downtown skyline and bay.

The README uses 5-second, 576 × 324, 10 fps GIF excerpts. Full 14-second H.264 MP4s are exported to
`shots/showcase/` (ignored) and delivered separately on the Desktop. No third-party footage or music is used.
The titles and data attribution are composited into the captured canvas. Vehicle/camera paths are staged,
and road traffic is disabled for these cinematics; they are not autonomous-driving acceptance evidence.
Normal gameplay is unaffected unless `showcase` is explicitly present in the URL.

## Reproduce

Run `node tools/serve.mjs 8081`, then open either:

- `http://127.0.0.1:8081/?quality=high&time=midday&showcase=car&hud=0`
- `http://127.0.0.1:8081/?quality=high&time=midday&fog=clear&showcase=heli&hud=0`

Wait for **Shot ready**, click **Record 14-second clip**, then download the recording. Keep the tab visible
while recording. This opt-in developer tool is not included in the static release package.

With FFmpeg installed, run from the repository root:

```bash
bash tools/dev/export-showcase.sh /path/to/car.webm waymo-market
bash tools/dev/export-showcase.sh /path/to/heli.webm helicopter-salesforce
```

## Counts

- **15,735 core building records:** `GEO.data.buildings.count` in `js/sf-geodata.js`, also documented in
  [the core audit](../reports/building-types-core.md). Landmark replacement can change the final drawn meshes.
- **154,870 regional buildings:** `buildings.stats.buildings` in `data/region/manifest.json`, also documented
  in [the regional report](../reports/region.md). These become 161,645 box instances; boxes are not buildings.
- The regional export excludes the core plus a 60 m margin. Neither count means all buildings are drawn
  simultaneously or that regional scenery has the core's collision/driving detail.

The README, GIFs and showcase code were committed in `e17d6c8`. Full MP4 exports remain on the Desktop
and in ignored `shots/showcase/`, intentionally outside Git. No social post or public demo deployment was performed.

The Market Street GIF and MP4 were refreshed after the player Waymo detail pass. The latest Desktop
exports use `slop-sf-waymo-market-detailed.mp4` and `waymo-market-detailed.gif`; the originals are retained.

## Clear Waymo tracking angle

The revised Market Street camera stays 1.5 m toward the roadway from the vehicle, 9 m behind and
3 m above ground, looking 3 m ahead. The previous sidewalk-side sweep (4.5–6.3 m lateral offset)
allowed trunks and foliage to cross the foreground. The new shot retains all scene trees.
The latest Desktop delivery is `slop-sf-waymo-market-clear-view.mp4` with `waymo-market-clear-view.gif`.

Verified 28 frames at half-second intervals across the 13.933-second H.264 export: no tree foreground
obstruction of the car in those samples. Output remains 1280×720 at 30 fps.

The car-cohesion revision was recorded again with the same clear roadway angle. Latest Desktop
files: `slop-sf-waymo-market-cohesive.mp4` and `waymo-market-cohesive.gif`. The README uses that
revised car too. This export is 14.000 seconds; 28 half-second frame samples were inspected.
