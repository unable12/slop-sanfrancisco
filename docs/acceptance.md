# Phase 7 acceptance — 2026-10-23

Implementation and local release preparation are ready for review. **User acceptance and the release tag remain open.**
This report does not claim a completed end-to-end driving run or publication.

| Criterion | Evidence / status |
|---|---|
| Static WebGPU startup | IAB fallback on the same machine as P6, no observed console errors/warnings. Recorded startup phase totals 5.183–5.972 s, under 25 s. Headless initialization limitation remains documented. |
| Street ≥75 fps; aerial/hill ≥60 fps | All seven High paths: 119–120 fps at 1280×720; Low and Medium whole-city paths: 120 fps. Browser capped at 120 Hz. See `perf-log.md` and raw gallery logs. |
| Heap ≤1.2 GB | Retained scene after idle: 709–863 MB. Raw observed end-of-run allocations reached 2,281 MB before collection; strict peak usage is not proven below 1.2 GB. |
| Terrain map and labels | Cached 8 m relief, north-up compass, bridges, official 41 Analysis Neighborhood polygons, search, all landmark destinations. Western arrivals switch to flight. Map screenshot in gallery. |
| Safe destination coordinates | Automated tests check core roads and regional measured street segments, destination/button parity, headings, map region bounds and shared arrival resets. Golden Gate flight arrival captured at runtime. |
| Pause and accessibility | Native settings dialog pauses simulation, resets controls, traps and restores focus. Map also traps focus and blocks driving keys. Existing touch and reduced-motion behavior retained. |
| Quality and recovery | Automatic 3 s selection with manual override; all three presets benchmarked. Low removes SSR and shadows. WebGPU-unavailable screen visually verified using the forced `?webgpu=0` path with inert HUD and retry. |
| Tests | 171/171 pass in the final serial suite (67.7 s), recorded in `review/p7/tests.txt`. After the final native map dialog fix, all 20 map/boot/visible-text checks passed again. |
| Data/license/package | README, NOTICE, source provenance and architecture updated; deterministic neighborhood rebuild; local package succeeds and excludes raw inputs. See `release-audit.md`. |
| Full Ferry → California → Nob Hill → Russian Hill drive in traffic | **Open user acceptance item.** Existing collision, terrain pitch, safe-arrival and ten-minute traffic tests pass. Camera-path benchmarks do not exercise player driving and are not substituted for this run. |
| Landmark recognition / final look | P5/P6 galleries plus P7 Golden Gate arrival and UI gallery supplied; final subjective approval remains with Kamil. |
| Tag / publication | No Git write commands or deployment. Kamil commits; `git tag v0.1.0` only after accepting and committing. |

## Review requested

Open the [gallery](review/p7/index.md). Try the pause menu, map and flight destinations, then drive from the Ferry Building
along California St over Nob Hill and into Russian Hill with normal traffic. Report any sticking, floating, clipping or
camera issues. The release gate stays open until this review is accepted, as required by P7.9.

Known limits: region scenery lacks the detailed core's driving network/colliders; waypoint bearings are not road navigation;
quality changes may briefly compile shaders; automated FPS selection is a startup sample rather than a continuous adaptation.
