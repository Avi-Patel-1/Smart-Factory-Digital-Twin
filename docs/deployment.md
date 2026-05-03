# Deployment

The project is configured for GitHub Pages as a static Vite site.

## Local Commands

```bash
npm install
npm run data:historian
npm run dev
npm run test:py
npm run test
npm run build
npm run preview
```

## GitHub Pages Workflow

The workflow at `.github/workflows/deploy.yml` installs dependencies, runs tests, generates static historian data, builds the project, uploads `dist`, and deploys to GitHub Pages.

Repository setup:

1. Push the project to GitHub.
2. Open repository Settings.
3. Enable Pages.
4. Choose GitHub Actions as the Pages source.
5. Push to `main` or run the workflow manually.

Files in `public/data/` are copied to `dist/data/` during the Vite build. The Python historian step refreshes those static JSON/CSV files before Pages publishes the site.

## Vite Base Path

`vite.config.ts` uses:

```ts
base: './'
```

That keeps built asset links relative and avoids hardcoding a repository name. If a host requires an absolute base path, update `base` in `vite.config.ts`, rebuild, and redeploy.
