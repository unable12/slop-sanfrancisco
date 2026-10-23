# Phase 7 review

Review the SF map, destination labels, pause menu and quality controls. 171/171 serial tests pass; the final native dialog follow-up passes 20/20 focused checks.
No console warnings/errors were observed. Native UI captures use the app's actual viewport;
scene captures use the fixed 1280×720 review mode. See [acceptance](../../acceptance.md) and [performance](../../perf-log.md).

- [Map](map.png): city terrain relief, north-up geography, bridge geometry and landmark markers. Neighborhood labels appear at closer zoom.
- [Settings](settings.png): centered pause dialog, time/fog/traffic/quality and shadow controls, attribution and keyboard focus.
- [Golden Gate arrival](golden-gate.png): the measured Marine Dr flight destination, facing the bridge.
- [WebGPU fallback](webgpu-fallback.png): readable recovery instructions and retry; inactive HUD controls are inert.

Known limits: the regional city is simplified flight scenery; waypoint lines show direct bearings, not navigable road routes.
The map's neighborhood labels use official Analysis Neighborhood names, which may differ from local informal district names.
Quality changes can briefly compile shaders. The local package is prepared, but no release has been tagged or published.
