# H/LAB — Product Spec

**H/LAB** is a personal project HQ: a compact one-page portfolio plus a private admin panel that lets the owner manage everything the public sees without touching code.

## Goals (in priority order)

1. Exceptional design and responsive behaviour.
2. Short, clear public copy. The site is understood at a glance.
3. Smooth, tasteful, interruptible animation; full reduced-motion support.
4. Real content management through a private admin panel.
5. Secure authentication and database-enforced authorization.
6. Reliable GitHub → Netlify deployment.

## Public site (`/`)

One page assembled from **blocks** the owner controls (order, visibility, content):

| Block | Purpose |
| --- | --- |
| Hero | Eyebrow, headline (last word highlighted), description, two buttons, animated orbital artwork |
| Project grid | Cards from the Projects table, status filters, detail dialog (`/?project=<slug>`) |
| About | Short intro, interest chips, optional profile image |
| Tags / skills | Compact chip list |
| Currently exploring | Short numbered list of current focus areas |
| Image gallery | Responsive grid from the media library |
| Contact | Email + social links. **No form** (nothing pretends to send messages) |
| Custom text | Heading + plain paragraphs |

Header (brand mark + logo text, navigation, language switch, mobile menu) and footer (brand, text, links, copyright) are driven by settings.

Each project may have a cover image, a live **Open project** link and a separate **Source code** link; any combination, including none. Clicking a card opens a detail dialog (cover, summary, status, tags, link buttons) that works the same on desktop and mobile.

Projects have a status — **active, experiment, paused, completed** — shown as a labelled pill and usable as a filter.

### Seeded starter content (editable, not hardcoded in UI)

Project Genius · Project Browser · Project-Frame (paused) · JARVIS · Edward · Lufthansa Launcher · Project Genesis, plus neutral Hero/About/Exploring/Contact blocks. Statuses other than Project-Frame's are placeholders for the owner to set. No biographical facts are invented; contact email and social links start empty and the dashboard says so.

## Admin panel (`/admin`)

Owner only. No registration. Pages:

- **Dashboard** — real counts, setup checklist, recent changes (from a private change log). No analytics are shown because none are collected.
- **Projects** — create, edit, duplicate, delete (confirmed), status, visibility, tags, external URL, cover image + alt text, reorder.
- **Sections** — add / edit / reorder / show / hide / delete the eight block types; typed forms per block.
- **Media** — upload, replace, alt text, delete (blocked while referenced), format/size validation.
- **Appearance** — accent (5), theme (3), background (3), animation (3), profile image. Previews live, saved on demand.
- **Site text** — navigation, status labels, interface labels, footer.
- **Settings** — site name, logo text, contact email, social links, SEO title/description, share image, languages, published/draft.

### Save and preview workflow

- Saving shows *Saving…*; success is reported **only after the database confirms** the write. Failures keep the draft and show the reason.
- Unsaved changes are detected; leaving the page (route change or closing the tab) warns first.
- Destructive actions (delete project/section/image, unpublish site) require confirmation.
- **Preview** opens `/?preview=1` for the signed-in admin: hidden projects/sections and an unpublished site become visible, clearly marked. Items are published by switching *Show on the site*. (There is no separate draft copy of an already-published item; see Limitations.)

## Localization

English and Turkish. The owner chooses which languages are published (one or both) and a default. Every piece of text is stored per language; editing one language never touches the other and disabling a language never deletes its text. Visitors on a bilingual site get a language switch; missing translations fall back to the default language. Starter Turkish text is included and should be reviewed before enabling.

## Non-goals

Visitor analytics, comments, contact forms, multi-user roles, rich-text/HTML content, a theme builder.

## Known limitations

- Social-share crawlers that do not run JavaScript see the static meta tags in `index.html`, not the SEO fields edited in admin (see ARCHITECTURE.md → SEO).
- Published items are edited live; there is no per-item draft-vs-published version history.
- Reordering uses up/down buttons (keyboard friendly) rather than drag and drop.
- Images are served as uploaded (the client downsizes large uploads to WebP); Supabase's paid image-transformation service is not used.
