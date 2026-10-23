# Contributing

Thanks for helping improve Slop San Francisco. Small, focused fixes are welcome.

## Try it and report a bug

Use the [playable demo](https://unable12.github.io/slop-sanfrancisco/), or run locally:

```bash
node tools/serve.mjs
```

Open http://127.0.0.1:8080 in a WebGPU-capable browser. Use Node.js 22 or newer. No runtime npm install is needed.
For a report, include the street or landmark, movement mode, browser/GPU if known, steps to reproduce, and a
screenshot or short clip. Mention quality, fog and time settings when they affect the issue.

## Send a change

1. Fork the repository and create a branch for one change.
2. Read the relevant modules in [the architecture guide](docs/ARCHITECTURE.md). Preserve the existing
   vanilla JavaScript/IIFE structure; a new framework or physics engine is not needed for a small fix.
3. Keep simulation and rendering behavior separate where practical. Terrain/grade APIs are authoritative
   for height; shared collision geometry is authoritative for player body clearance.
4. Run the checks below. Add meaningful regression coverage for behavior changes, and before/after
   screenshots for visual changes. Explain what changed, why, and any limits in the pull request.

```bash
node --test --test-concurrency=1 tests/*.test.cjs tests/*.test.mjs
node tools/build-static.mjs
node tools/check-static.mjs
```

Full tests include simulated rides and can take several minutes. Avoid running multiple performance-sensitive
suites at once. Do not loosen test thresholds to make failures disappear; report the environment and result.

## Data and assets

Runtime data is committed. Offline data regeneration is separate and requires the dependencies in `tools/`;
see [data sources](docs/data-sources.md). Do not commit raw downloads, credentials, `node_modules`, `dist`, or
large recording exports. Preserve provenance and all attribution when changing generated geography.

The code is MIT-licensed. Geographic inputs and derived data retain their own source-specific terms in
[NOTICE.md](NOTICE.md). Keep upstream copyright notices. Original or appropriately licensed contributions only.

## Scope

The current focus is a reliable, approachable demo: startup, navigation, visual defects, performance and
clear documentation. Discuss large feature additions in an issue before investing in them. Detailed tree
collisions, pedestrian reactions and other simulation expansions are optional future work.

Historical phase plans and maintainer handover notes document how the project was built. They are not
requirements for an external contributor to complete before submitting a focused fix.
