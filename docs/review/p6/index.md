# Phase 6 review

1280×720 PNG captures from the actual WebGPU renderer, at the poses in `shots.json`.
Use a query from that file plus `&capture=1` to reproduce a fixed-resolution still even in a narrow browser tab.
The debug capture waits for the submitted GPU work, freezes animation and exposes the rendered PNG as an image.

| Shot | Review |
|---|---|
| [Twin Peaks, clear](twin-peaks-clear.png) | Real citywide heights and footprints, tree cover and the Marin horizon |
| [Twin Peaks, marine layer](twin-peaks-marine-layer.png) | The hilltop remains above the white layer while lower streets disappear |
| [Ocean Beach fog](ocean-beach-fog.png) | The western shoreline has low visibility inside the layer |
| [Embarcadero, clear](embarcadero-clear.png) | Existing core streets, trees and facades remain detailed |
| [Golden Gate from Crissy, fog](golden-gate-from-crissy-fog.png) | Bridge towers and cables recede through dense fog over the water |
| [Bay Bridge at night](bay-bridge-night.png) | Bridge lamps, city windows and the night bay |

Performance measurements and limitations are in `../../perf-log.md`. The headless probe's GPU initialisation
stalled repeatedly; these captures use the in-app browser, while `?bench` still renders at 1280×720.

Known visual limits:
- The regional city is scenery: rectangular footprint approximations, coarse tree crowns and a 4 m land-cover mask.
  Close views outside the detailed core show blocky road edges and simplified buildings.
- Dashed regional centre markings are estimates. Their draping uses the 8 m source terrain; coarse terrain LOD can
  hide small portions of paint on steep ground.
- Dense marine fog deliberately obscures the distant Golden Gate from ground level. From above the layer,
  the tops of taller hills remain visible; the bridge is a small silhouette at citywide distances.
- Oakland has real hills and a cargo ship, but no invented city skyline. Only one water-tested ship anchor qualifies.
- Ferries follow real OSM paths, but their geometry, speed and departure phases are illustrative.
- Transparent effects without depth writes inherit fog from the opaque surface behind them.

Validation: 160 tests; all seven final benches 119–120 fps; whole-city flight 120 fps and 855 MB heap after idle collection.
The final depth-composited fog passes: worst paired median +0.852 ms across three viewpoints at 1280×720.
Individual GPU pairs remain noisy; the full measurements and method are recorded in the performance log.
Final fog evidence: [fog-final-benchmarks.json](fog-final-benchmarks.json).
Final runtime reruns: [final-runtime-benchmarks.json](final-runtime-benchmarks.json).
Earlier benchmark history: [browser-benchmarks.json](browser-benchmarks.json); tests: [tests.txt](tests.txt).
