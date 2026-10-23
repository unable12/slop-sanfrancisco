# Local release audit — 2026-10-23

No publication, remote change, commit or tag was performed. `tools/build-static.mjs` creates an ignored `dist/`
with HTML/CSS/JS, the core binaries, regional assets, LICENSE and NOTICE. Three.js remains pinned to the existing CDN.
Serve the package over HTTPS or localhost. Precompression is left to the eventual host, so binary response handling stays unchanged.

| Source category | Bytes (before final review images) |
|---|---:|
| JavaScript, including generated geography | 3,691,064 |
| CSS | 37,655 |
| Derived data, excluding ignored raw inputs | 60,409,676 |
| Existing review evidence plus initial P7 captures | 22,052,597 |

Sizes are an audit snapshot; small source/document edits may change totals. The generated local package occupies approximately
67 MiB of filesystem blocks. Largest derived asset: `groundmask-core.bin`, 23,891,844 bytes; terrain-core is 11,956,000 bytes;
buildings-core is 3,829,740 bytes. New `sf-places.js` is 688,302 bytes. No runtime asset exceeds 50 MB.
Raw source data and `dist/` are verified ignored. No hosting limit has been supplied, so no hosting-specific split is needed.

The neighborhood generator was rerun against the same raw snapshot and produced identical bytes:
`8ad00e89ff53a5e9b41f76eae07cf219d93cf691cc5f4b090fdbdf9f834d0207` (SHA-256 of `js/sf-places.js`).

After reviewing, accepting and committing this build, Kamil may create the local release tag:

```bash
git tag v0.1.0
```

Do not tag an older commit before the Phase 7 changes are committed. Nothing is pushed by this command.
