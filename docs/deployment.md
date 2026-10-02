# Deployment

The canonical demo is [GitHub Pages](https://avi-patel-1.github.io/Smart-Factory-Digital-Twin/). It runs the simulation in the browser and needs no server API.

Install with `npm ci`. Run `npm run lint`, `npm test`, `npm run test:py` and `npm run build`. Preview using `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`. Shut down with Ctrl-C. Node 24/25 and Python 3.12 are supported by the documented workflow; Git is required to identify the build.

The verification workflow checks pull requests and feature branches. The Pages workflow checks main, uses the committed historian fixture, builds the static site and publishes `dist/`. Pages must use GitHub Actions as its source. Deployment permissions are scoped to Pages; no database or API secret is needed.

`vite.config.ts` uses the relative base `./`, which supports the repository Pages path. All navigation stays in the app, so refreshing a screen reloads the entry point and restores the explicitly saved run.

`version.json` is generated from the actual build checkout and includes the full source SHA, package version, build time and whether tracked source was dirty. CI checks that its source revision matches the checkout. `SHA256SUMS` lists the built files and their hashes. Verify the public manifest and primary workflow after deployment; a successful upload alone does not establish that the app works.

The Python test regenerates the fixture in temporary storage and checks its KPIs and alarm windows against the bundled JSON. CI does not rewrite tracked SQLite files: binary headers can vary by SQLite library version even when the rows match.
