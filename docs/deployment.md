# GitHub Pages deployment

- Playable demo: https://unable12.github.io/slop-sanfrancisco/
- Source: https://github.com/unable12/slop-sanfrancisco
- Workflow: [pages.yml](../.github/workflows/pages.yml)

## Automatic publishing

The repository uses GitHub Pages with **GitHub Actions** as its publishing source. Pushes to `main` or a
manual **Run workflow** build the site with Node.js 22. Official actions are pinned to commit revisions.
The build job runs startup, settings and collision checks, rebuilds `dist/` from scratch and verifies all
415 referenced application/data/license assets. Only the `dist/` artifact is uploaded. Deployment has
Pages/OIDC permission; the build job only has repository read permission. No repository secret is required.

The package contains runtime HTML/CSS/JS, binary city/region data and license notices. It excludes raw GIS
downloads, Git history, documentation, recordings, offline tools and dependencies. `.nojekyll` prevents
unneeded Jekyll processing. Relative paths support the `/slop-sanfrancisco/` project prefix. Three.js loads
from the existing pinned jsDelivr URL; the browser needs network access and WebGPU support.

## Verify a release

1. Run `node --test --test-concurrency=1 tests/*.test.cjs tests/*.test.mjs` for a full local regression.
2. Run `node tools/build-static.mjs && node tools/check-static.mjs`.
3. Commit and push. Check **Actions → Publish playable demo** for the deployment result.
4. Open the HTTPS demo, wait for the city to load, and check movement, map/settings and the first-ride card.
   Check the browser console for missing assets or runtime errors. CI validates packaging but does not replace
   this real WebGPU browser check.

For local package inspection with the development server, visit http://127.0.0.1:8080/dist/ after building.
The `/dist/` prefix also exercises project-relative URLs. To revert a bad release, revert its source change
on `main` and push; the same workflow redeploys the previous behavior. Avoid force-pushing release history.

## Scope and cost

This is a static demo with no backend, account system or paid API dependency. Public-repository GitHub Pages
hosting is available on GitHub Free. GitHub imposes site/bandwidth limits; check the current
[Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) if traffic grows.
Repository visibility and a custom domain are account settings, not controlled by this workflow.
