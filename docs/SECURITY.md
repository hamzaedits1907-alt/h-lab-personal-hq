# Security

## Model

One owner, no public accounts. Authorization is enforced **in the database** (Row-Level Security + grants); the admin UI hiding a button is a convenience, never the control.

| Actor | Can |
| --- | --- |
| Anonymous visitor | Read published projects/blocks, settings, media metadata. Nothing else: no writes, no `hlab_admins`, no `hlab_change_log`, no RPCs, no storage listing. |
| Signed-in, **not** in `hlab_admins` | Exactly the same as a visitor. `UPDATE`/`DELETE` affect zero rows, `INSERT` is rejected, RPCs raise `not authorized`, storage writes are rejected. |
| Admin (`public.hlab_admins` row) | Read everything, write projects/blocks/media/settings, upload/replace/delete in the `hlab-media` bucket, read `hlab_change_log`. Still cannot insert/delete the settings singleton or modify `hlab_admins` through the API. |

These rules are exercised against the real migrations in `tests/db/policies.test.ts` (35 tests).

## Admin identity

- `public.hlab_admins(user_id)` is separate from any profile data. Clients may `SELECT` only their own row. There is **no** INSERT/UPDATE/DELETE grant or policy, so nobody can promote themselves.
- The first admin is created by the owner in the Supabase SQL editor (runs with elevated rights, outside the API). See ADMIN_GUIDE.md.
- `hlab_is_admin()` is `SECURITY DEFINER` with `search_path = ''`, and checks `auth.uid()`.
- Disable public sign-ups in Supabase anyway. If a stranger did register, they would be an ordinary authenticated user (see table) and the admin route would show "Not authorized".

## Sharing a Supabase project with another app

All H/LAB objects are namespaced (`hlab_*` tables/functions/indexes/triggers, `hlab: ` policies, `hlab-media` bucket) and admin rights come from `public.hlab_admins` / `hlab_is_admin()`, so another app's `hlab_is_admin()`, `profiles`, buckets and admin roles are neither used nor modified, and an admin of the other app has no H/LAB rights (and vice versa). Media metadata is public only while something published references it; unreferenced or hidden uploads are visible to admins only. H/LAB changes no auth settings. Note that Supabase Auth users are shared project-wide, so anyone who can sign up to the other app has an account, but without a `hlab_admins` row they are an ordinary visitor. All covered by `tests/db/isolation.test.ts`.

## Secrets

- The browser receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the anon/publishable key, which is designed to be public and is limited by RLS).
- **Never** put the `service_role`/secret key in a `VITE_*` variable, in GitHub, or in Netlify build variables: anything `VITE_*` is compiled into the public JavaScript. The app refuses to start if the configured key decodes to `role: service_role`, and `npm run build` fails if a secret-key pattern or privileged JWT appears in `dist/`.
- `.gitignore` excludes `.env*` (except `.env.example`/`.env.demo`, which contain no secrets).
- The service-role key is not needed by this project at all.

## Storage

Bucket `hlab-media`: public by URL (so `<img>` works), 5 MB limit, MIME allow-list jpeg/png/webp/avif (**no SVG**, which can carry script). No anonymous `SELECT` policy → the bucket cannot be listed. Insert/update/delete/select policies require `hlab_is_admin()` **and** `bucket_id = 'hlab-media'`. File names are server-generated (`uploads/<random uuid>.<ext>`); user-supplied names are never used. The client additionally checks magic bytes so a renamed text/SVG file is rejected before upload. Everything uploaded is publicly retrievable by URL, so don't upload private images.

## Content safety (XSS)

- All text is rendered by React as text. There is no `dangerouslySetInnerHTML`, no Markdown/HTML parsing, and no content field that accepts HTML or script.
- Block `content` is validated by per-type Zod schemas (unknown keys are stripped), constrained again by a Postgres `CHECK` (allowed keys per type), and re-validated on read.
- Links are allow-listed: `https://`, `mailto:`, or in-page `#anchor`. `javascript:`, `data:`, `http:` are rejected on write (Zod + DB `CHECK` for project URLs) **and** dropped at render time. External links use `target=_blank rel="noopener noreferrer"`.
- Appearance values are fixed enums (DB `CHECK`, Zod, CSS attribute selectors).

## HTTP hardening (`netlify.toml`)

`Content-Security-Policy` (`script-src 'self'`, no inline scripts, `connect-src`/`img-src` limited to self + `*.supabase.co`, `frame-ancestors 'none'`, `object-src 'none'`), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS, `COOP`. The Playwright suite runs the production bundle under this exact CSP with zero violations. The admin page sets `noindex`.

## Authentication notes

- Email + password via Supabase Auth; failures return a generic message.
- Sessions use supabase-js defaults (localStorage). Because the CSP forbids third-party and inline script, XSS exposure of the token is minimized, but not impossible; use a strong, unique password.
- **Recommended:** enable MFA (TOTP) for the owner account in Supabase, and set a strong minimum password length.

## Residual risks and checklist

- [ ] Sign-ups disabled in Supabase (Authentication → Sign In / Providers).
- [ ] Owner account has a strong unique password (and MFA).
- [ ] Only the anon key is configured in Netlify; service-role key stored nowhere in this project.
- [ ] Netlify Deploy Previews: previews that point at the production Supabase project read (and, for a signed-in admin, can write) production data. Use a separate Supabase project for the *Deploy Preview* context if you want isolation (DEPLOYMENT.md).
- Rate limiting of sign-in attempts is Supabase's responsibility (configure under Authentication → Rate Limits).
- The public contact email is visible to scrapers by design.
- No live Supabase project was available while building: the policies are verified in a real Postgres (PGlite) with stubbed `auth`/`storage`, not against hosted Supabase. Run the smoke test in DEPLOYMENT.md once after setup.
