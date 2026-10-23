# Deployment

Nothing here has been run against a live Supabase project, GitHub remote or Netlify site yet: those require your accounts. Follow the steps below once, in order.

## 0. Local development

```bash
npm ci
npm run dev:demo      # full UI with browser-only data (no Supabase). Demo login: demo@hlab.local / demo-password
npm run dev           # real mode; needs .env.local (see below)
npm run check         # typecheck + unit/db tests + production build + bundle safety check
npm run test:e2e      # builds the demo bundle and runs Playwright in Chrome
```

Requires Node ≥ 20 (`.nvmrc` pins 22).

## 1. Supabase

1. Create a project at supabase.com. Note the **Project URL** and the **anon / publishable** key (*Project Settings → API*). Do **not** use or copy the service-role / secret key anywhere.
2. Apply the migrations **in order**. Either:
   - *SQL Editor*: paste and run `supabase/migrations/0001_core_schema.sql`, then `0002_storage.sql`, then `0003_seed_starter_content.sql`; or
   - Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.

   `0003` only inserts into empty tables, so re-running it never overwrites edits. If you change `src/content/seed.ts`, regenerate it with `npm run seed:sql`.
3. Check *Storage*: a public bucket **site-media** exists (5 MB, images only).
4. Create the first admin: ADMIN_GUIDE.md §1 (disable sign-ups, create user, insert into `public.admins`).

## 2. Environment variables

Only two, both public-safe:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable key |

Local: copy `.env.example` to `.env.local` and fill in. (`.env.local` is git-ignored.) These are inlined at build time; changing them needs a rebuild.

## 3. GitHub

The project folder is not yet a connected repository. With your account:

```bash
git init -b main            # skip if already initialised
git add -A && git commit -m "Initial commit: H/LAB"
# create an EMPTY repo on github.com first (no README/licence), then:
git remote add origin https://github.com/<you>/<repo>.git
git remote -v               # confirm it's the repo you expect
git push -u origin main
```

Before pushing, confirm `git status` shows no `.env*` files (other than `.env.example`, `.env.demo`). `.github/workflows/ci.yml` runs type-check, unit + DB-policy tests and the production build on every push/PR.

## 4. Netlify

1. *Add new site → Import an existing project → GitHub →* pick the repo.
2. Settings are read from `netlify.toml`: build `npm run build`, publish `dist`, Node 22, SPA fallback, security headers. Leave the UI fields as detected.
3. *Site configuration → Environment variables*: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (scope: all, or see previews below). Never add a service-role key.
4. Deploy. Then *Domain management* for a custom domain.
5. **Supabase custom domain?** Add it to `connect-src`/`img-src` in the CSP in `netlify.toml`.

### Deploy Previews

Netlify builds every pull request as a Deploy Preview using the same config, so you can review UI changes before merging. A preview uses whatever Supabase project its environment variables point to. By default that's production: previews show production content, and the admin signed in on a preview can edit production data. For isolation, create a second Supabase project (apply the same migrations), and in Netlify set different values for the **Deploy Preview** context (*Environment variables → edit → Different value for each deploy context*).

## 5. Smoke test (do this once after the first deploy)

Because the database policies were verified in an emulated Postgres, confirm them on the real project:

1. Open the site signed out. Content from the database appears; no errors in the browser console.
2. Open `/admin` signed out → redirected to login.
3. Sign in with the admin account → Dashboard shows “Connected to the database”.
4. Edit a project title → *Save* → reload the public site in a private window: the change is there.
5. Upload an image, use it as a project cover, try to delete it from Media → refused with the usage list.
6. Hide a project → gone from the signed-out site; visible at `/?preview=1` when signed in.
7. (Authorization) Try a forbidden write with only the public anon key. Replace `URL` and `ANON`:
   ```bash
   curl -X PATCH "$URL/rest/v1/projects?slug=eq.jarvis" \n     -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \n     -H "Content-Type: application/json" -H "Prefer: return=representation" \n     -d '{"title":"hacked"}'
   ```
   It must fail with a permission error (anon has no UPDATE privilege), and the project title must be unchanged.
8. Dashboard → Recent changes lists your edits.

## 6. Troubleshooting

| Problem | Fix |
| --- | --- |
| Site says “Not configured yet” | The two env vars are missing at build time. Add them and redeploy. |
| “This site isn't set up yet” | Migrations not applied (no `site_settings` row). |
| `/admin/...` is a 404 on refresh | SPA redirect missing; ensure `netlify.toml` is at the repo root. |
| Images don't load | CSP: the Supabase host must match `https://*.supabase.co`. |
| Build fails `verify-build` | A demo marker or key-like string reached `dist/`; the message names the file. |

## 7. Remaining external steps (owner)

Create the Supabase project and admin, create the GitHub repo, connect Netlify, set the two env vars, run the smoke test, then replace the placeholder content (contact email, links, statuses, copy).
