# Architecture

## Stack

React 19 · TypeScript (strict) · Vite · React Router · Zod · Supabase (Auth, Postgres, Storage) · Netlify · GitHub. Plain CSS with design tokens, system fonts only (no font licensing or network requests).

## Repository layout

```
src/
  content/        schema.ts (Zod + types)  seed.ts  defaults.ts  localize.ts
  data/           repository.ts (interface)  supabaseRepository.ts  demoRepository.ts
                  mappers.ts  validation.ts  errors.ts  supabaseClient.ts
  app/            providers: Repository, Auth, Site, Language, Theme, SEO, env
  site/           public page: blocks.tsx  projects.tsx  SitePage.tsx  ui.tsx
  admin/          AdminApp (guard, layout, login)  pages/*  feedback.tsx  ui.tsx  media.tsx
  styles/         global.css (tokens)  site.css  admin.css (admin chunk only)
supabase/migrations/   0001 schema+RLS · 0002 storage · 0003 starter content (generated)
scripts/          generate-seed.ts  verify-build.ts  serve-dist.mjs
tests/            unit/ (Vitest + Testing Library)   db/ (PGlite RLS tests)
e2e/              Playwright (Chrome) against the built bundle
```

## Data flow

```
React components ──► Repository (interface) ──► SupabaseRepository ──► Supabase (RLS enforced)
                                           └─► DemoRepository (dev/tests only, localStorage)
```

Components never contain content; they render the `SiteData` returned by `repository.loadSite()` (`settings`, `blocks`, `projects`, `media`). Every admin save goes `form → Zod validation → repository → database → reload`, and the UI reports success only when the repository promise resolves.

The **Supabase repository** treats "zero rows affected" as failure (RLS silently filters `UPDATE`/`DELETE`), so a denied write can never look like a saved one.

### Reading defensively

Stored jsonb is re-validated on read. A block whose content no longer matches its type is *not rendered* and is listed in the admin so it can be fixed or deleted (`invalidBlocks`). Bad appearance values fall back to defaults; unsafe links are dropped at render time. A failed load shows an error with retry and **never** substitutes starter data.

## Database model

| Table | Notes |
| --- | --- |
| `admins` | `user_id` → `auth.users`. Clients can read only their own row; **no** insert/update/delete policy or grant. |
| `site_settings` | Singleton row (`id = 1`). Identity, contact, `social_links`, `nav`, `footer`, `seo`, `ui` (jsonb), languages, publish flag, appearance enums, profile/OG media FKs. |
| `content_blocks` | `type` (8 values), unique `anchor`, `admin_label`, `content` jsonb, `position`, `is_visible`. Allowed top-level keys per type are enforced by a `CHECK` function. |
| `projects` | `slug` unique, `title`, localized `summary`/`description`, `status`, `tags[]`, `url` and `repo_url` (https only, both nullable; `repo_url` added by migration 0004), `cover_media_id` FK, `position`, `is_visible`. |
| `media` | Metadata for files in the `site-media` bucket: path, mime (jpeg/png/webp/avif), size ≤ 5 MB, dimensions, localized `alt`. |
| `change_log` | Admin-only audit trail written by triggers; capped at ~500 rows. Powers *Recent changes*. |

RPCs (SECURITY INVOKER, so RLS still applies): `reorder_projects`, `reorder_blocks`, `media_usage`, `delete_media`. `is_admin()` is the one SECURITY DEFINER helper.

**Referential safety for media:** project covers and settings images use `ON DELETE RESTRICT` foreign keys. Block content references media by id inside jsonb (no FK possible), so `delete_media` checks `media_usage()` first and refuses; the UI shows exactly where the image is used.

**Validation is layered:** Zod in the browser (field-level messages) → Zod again inside the repository (never trust the caller) → Postgres `CHECK` constraints (shape, sizes, enums, https-only URLs, slugs). The DB cannot fully re-implement every Zod rule, so on *read* the app validates again.

## Localization

`LocalizedText = { en?: string; tr?: string }` is the single shape for translatable text, in jsonb columns and block content. `pick(text, lang, default)` resolves *requested → default → any*. Language choice persists in `localStorage`; only enabled languages are offered. Admin forms edit one language at a time (`LangTabs`); the draft holds all languages so switching tabs loses nothing.

Complete: data model, public switch, admin editing, fallbacks. **Not** automated: translation (the owner writes it), per-language URLs (single URL, language chosen client-side), per-language SEO tags for non-JS crawlers.

## Appearance

`accent | theme | background | animation` are enums in the database (CHECK), in Zod and in CSS. They become `data-*` attributes on `<html>`; CSS maps each to design tokens. Nothing arbitrary can reach a stylesheet. `public/boot.js` re-applies the last values before first paint to avoid a theme flash (values are allow-listed again there). `prefers-reduced-motion` always wins over the animation setting.

## Performance

- Admin is a lazy chunk with its own CSS; visitors never download it.
- Public JS ≈ 187 kB gzipped total (React 95, supabase-js 54, app 38). `supabase-js` is the largest avoidable cost; public reads could move to plain `fetch` later.
- Images: `loading="lazy"`, `decoding="async"`, intrinsic `width/height` (no layout shift); uploads are validated and large images downsized/re-encoded to WebP client-side.
- Animation is `transform`/`opacity` only; the pointer parallax is `rAF`-throttled and skipped on touch/reduced motion.
- Hashed assets are cached immutably; `index.html` is always revalidated (`netlify.toml`).

## SEO and sharing — honest limitation

Title, description, Open Graph and Twitter tags are updated in the browser from the database. Crawlers that don't execute JavaScript (many link-preview bots) only see the static tags in `index.html`. If rich previews matter, add a Netlify Edge Function or a prerender step that injects these tags from the public `site_settings` row. This is not implemented.

## Demo mode

`npm run dev:demo` / `npm run build:demo` use `DemoRepository` (localStorage, fixed credentials) so the UI can be developed and browser-tested without Supabase. It mirrors the database's rules but offers **no security**. It is excluded from production by construction: the check `import.meta.env.MODE !== 'production'` is inlined so the bundler removes the demo repository, its credentials and the sign-in hint from `dist/`; `npm run build` fails (`scripts/verify-build.ts`) if any marker survives.

## Testing strategy

| Layer | Tool | What it proves |
| --- | --- | --- |
| Schemas, helpers | Vitest | Validation, link safety, localization, seed integrity (committed SQL == generated) |
| Repository contract | Vitest | Authorization, ordering, visibility, media protection, change log (demo backend) |
| Supabase repository | Vitest + fake client | Row mapping, error translation, "no success on failure" |
| UI | Testing Library | Public rendering from records, safe rendering of hostile text, admin auth guard, edit/save/validation/reorder/delete flows, unsaved-change guard |
| **Database policies** | **PGlite (real Postgres)** | Runs the real migrations: anon/non-admin/admin privileges, RLS, constraints, RPCs, storage policies |
| Browser | Playwright + Chrome | Built bundle under the production CSP: no console errors, mobile overflow, menu, dialog, keyboard, reduced motion, admin flows |

Not covered by automation: PostgREST/GoTrue/Storage API behaviour against a live Supabase project (the PGlite harness stubs `auth.uid()` and the storage tables). Use the smoke test in DEPLOYMENT.md.
