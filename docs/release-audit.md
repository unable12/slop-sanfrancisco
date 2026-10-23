# Release audit — 2026-10-23

## Historical Phase 7 packaging snapshot

At this earlier snapshot, no publication, remote change, commit or tag was performed. `tools/build-static.mjs` creates an ignored `dist/`
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


## Public-demo release preparation

User explicitly authorized publishing the source and the playable demo on GitHub Pages. The maintainer's
commit/push convention is overridden for this publication task. All other historical source/data attribution
is retained; no history rewrite is required. Standard MIT grant/disclaimer and upstream notice remain intact.

A local scan of all 998 reachable Git blobs (135,549,220 bytes) found no matches for high-confidence private-key,
GitHub-token, AWS-access-key, OpenAI-style service-key or Slack-token patterns. No `.env`, private-key or
credential files are tracked. This is a bounded pattern scan, not a guarantee that every possible secret is absent.
Raw downloads, dependency folders, generated packages and recording exports are ignored. Historical project
notes and contributor/commit identities remain part of the public source history.

The new clean package verifier checks 415 referenced assets, project-relative paths, SFB1 binary headers and
license notices. Generated `dist/` excludes Git history, tools, raw data, docs and recordings. Official GitHub
Actions are pinned to commit revisions with read-only build and scoped Pages/OIDC deployment permissions.
No new application dependencies or third-party uploaded assets were introduced.

Release validation before publication: full serial suite **198/198 passed**, no retries, 159.6 seconds.
All three full-city traffic seeds retained zero contacts/overlaps. The exact Pages subset passed **16/16**.
Packaged app loaded successfully at `/dist/` in the actual WebGPU browser with no warnings/errors.
Documentation links, syntax, artifact checks and whitespace checks passed. Hosted verification follows the
first successful deployment; its workflow/run status is the authoritative publication record.
