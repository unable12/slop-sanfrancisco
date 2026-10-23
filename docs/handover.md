# Handover (2026-10-23, Phase 6 complete)

## First task next session

Start Phase 7 (`docs/phases/phase-7-ui-polish-release.md`). Phase 6's fog-cost gate now passes.
The SF title, loading screen, camera presets and basic map labels are already done: inspect the existing UI
before repeating those tasks. Begin with map hillshade/terrain context, then pause/settings and quality presets,
accessibility, WebGPU fallback, attribution and final acceptance. Phase 7 has not been started or published.

## State and pending commit

The earlier quick fixes are committed as `eafcf9a`. All Phase 6 work remains in the working tree for Kamil to
commit. The final, path-limited command is the newest batch in `docs/commits.md`; the earlier Phase 6 checkpoint
is superseded. No Git write command was run by this session.

- Data: 8 m city terrain, 32 m USGS horizon terrain, 161,645 footprint boxes, 113,474 regional tree/canopy
  instances, 4 m land cover and mapped centreline paint. 366 derived assets, 18.16 MB total, largest 2.48 MB.
- Runtime: `js/region.js` replaces `boroughs.js`, with instancing, cached terrain LODs, 50 m core fade,
  terrain-aware flight bounds, ferries and cargo scenery. Ground driving remains in the detailed core.
- Atmosphere: Clear / Light haze / Marine layer, analytic 200 ± 40 m ceiling, westward density gradient,
  advected variation, sun dimming, stronger Golden Gate chop, pier foam and night bridge lamps.
- Fog optimisation: the existing aerial/marine equations now use resolved reversed-Z scene depth in
  `js/post-processing.js`, inside the final colour graph and bloom prefilter. No extra render target or
  ray marching. Depth zero is sky and gets directional marine horizon haze. Scene materials do not repeat fog.
- Validation: **160/160 tests**, including numerical fog quadrature and camera/depth reconstruction. Six final
  1280×720 images in `docs/review/p6/`. All seven final benches: 119–120 fps. Whole-city flight:
  120 fps; retained heap after idle: 855 MB.
- Fog GPU cost: three same-page paired comparisons give +0.262, +0.852 and -0.655 ms upper-median deltas.
  The worst is below the unchanged <1 ms target. Negative values and individual outliers reflect timer/clock
  noise; all blocks are saved. This is a median-cost result on this machine, not a per-frame guarantee.

## Reproduce

```bash
node --test --test-concurrency=1 tests/*.test.cjs tests/*.test.mjs
node tools/serve.mjs
```

Use `?bench=twin-peaks-view&fog=marine&time=midday&gpuTiming=1&fogCompare=1&benchIdle=1` for the
40 s paired comparison (ABBAABBA, five-second blocks, first second discarded). Optional `&cam=x,y,z,yaw,pitch`
fixes another view. Normal `?bench` paths last 20 s. All benches render at 1280×720, DPR 1. The `benchIdle`
option leaves the scene resident and reports heap after 20 s idle; this is not forced GC. Raw multi-gigabyte
readings during repeated navigation include garbage and must not be called retained scene memory.
`?fog=off` bypasses fog composition; Clear intentionally retains light aerial haze.

Final GPU evidence: `docs/review/p6/fog-final-benchmarks.json`; earlier unsuccessful and exploratory runs are
retained separately. Full method and results: `docs/perf-log.md`. Gallery poses: `docs/review/p6/shots.json`.
`&capture=1` pauses after GPU completion and exposes a 1280×720 PNG as a visible image for review/export.

For data regeneration, use `node --max-old-space-size=8192 tools/geo-region.mjs`; raw fetch commands and
provenance are in `docs/data-sources.md`. Raw downloads remain ignored. `data/terrain-region.bin` remains a
historical Phase 5 artifact; the runtime loads the full regional terrain instead.

## Tooling and remaining limitations

Headless Chrome repeatedly stalled at `renderer.init()`. Use the in-app browser fallback rather than repeating
those attempts. The image download helper also stalled; reading the visible capture image's data URL and
saving it locally worked. No temporary animated preview tabs should be left running during benchmarks.

- The outer city is simplified scenery, without a new walk/drive network or regional building colliders.
- Four-metre land-cover edges are visible close up; coarse terrain LOD can hide small bits of road paint.
- Transparent effects without depth writes inherit the opaque surface's fog depth, a screen-space approximation.
- Vessel dimensions/speeds, canopy densities/heights and facade colours are estimates. Only one cargo anchor
  qualified for water clearance. Oakland has measured terrain, without a fabricated skyline.
- Phase 5 model-detail limitations and Phase 4 transit collision limits remain outside Phase 6.

Decisions P6-1 through P6-5 are in `PLAN.md` §10. Token usage is unknown.
