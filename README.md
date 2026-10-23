# H/LAB — Personal Project HQ

A dark, minimal creative-tech portfolio with a private admin panel. React + TypeScript + Vite, Supabase (Auth, Postgres, Storage), deployed on Netlify.

- Public one-page site built from editable **blocks** (hero, projects, about, exploring, gallery, contact, text…).
- Private **`/admin`**: projects, sections, media, appearance, site text, settings. English/Turkish.
- Authorization lives in the database (Row-Level Security). No public sign-up.

## Quick start

```bash
npm ci
npm run dev:demo   # try everything locally, no Supabase needed (demo login shown on /admin/login)
npm run check      # typecheck + tests + production build
```

For a real deployment follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), then create the first admin with [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md).

## Docs

[Product spec](docs/PRODUCT_SPEC.md) · [Architecture](docs/ARCHITECTURE.md) · [Admin guide](docs/ADMIN_GUIDE.md) · [Security](docs/SECURITY.md) · [Deployment](docs/DEPLOYMENT.md)

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` / `dev:demo` | Dev server (real Supabase / browser-only demo data) |
| `npm run build` | Typecheck, production build to `dist/`, then verify the bundle has no demo code or secrets |
| `npm test` | Unit/component tests + database policy tests (real Postgres via PGlite) |
| `npm run test:e2e` | Builds the demo bundle and runs Playwright (Chrome) against it under the production CSP |
| `npm run seed:sql` | Regenerates `supabase/migrations/0003_seed_starter_content.sql` from `src/content/seed.ts` |
