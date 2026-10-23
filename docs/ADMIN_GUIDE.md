# Admin Guide

## 1. Create the first admin (one time)

There is no sign-up form by design. The admin is a normal Supabase Auth user whose id is listed in the H/LAB-only table `public.hlab_admins`. This is independent of any other application's admin roles in the same Supabase project, and the app can never change that table. Do this *after* the migrations have been applied (DEPLOYMENT.md §1).

1. **Create the user** (pick one):
   - *Authentication* → *Users* → **Add user** → **Create new user** (tick **Auto Confirm User**); or
   - sign up once through the project's public sign-up endpoint with a strong random password.
   Do **not** change global sign-up/provider settings if the project is shared with another app.
2. **Grant H/LAB admin** — *SQL Editor* (or `npx supabase db query --linked -f ...`) with the exact email (replace it):

   ```sql
   insert into public.hlab_admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```

   Check it: this must return exactly one row, your id:

   ```sql
   select a.user_id, u.email from public.hlab_admins a join auth.users u on u.id = a.user_id;
   ```
3. Open `https://<your-site>/admin`, sign in. If you see **Not authorized**, step 2 did not match your email.
4. Recommended: enable MFA on this account.

To add or remove an admin later, use the same SQL (`insert into` / `delete from public.hlab_admins`). Being an admin of another app in the same project gives **no** H/LAB rights, and vice versa.

## 2. Day-to-day

### Dashboard
Counts and a setup checklist (contact email, links, description, alt text…), plus the latest changes. Nothing here is estimated; if a number looks wrong, the data is wrong.

### Projects
- **New project** starts hidden. Fill in title, status, summary, details, tags; add an optional `https://` link; choose a cover image and describe it (alt text).
- **Links** (both optional): *Project link* (live site or app, shown as **Open project**) and *Source code link* (GitHub etc., shown as **Source code**). Each button appears on the site only when its link is filled in and starts with `https://`; clear a field to remove the button.
- **Cover image**: *Choose image* opens the media library (pick an existing image or upload a new one). The preview shows what you picked; it is attached when you press **Save project**. *Remove* clears it (the project then shows generated artwork). Always fill in the alt text. Without a cover the project looks fine too.
- Details are plain text; a blank line starts a new paragraph. Don't paste private notes, keys or internal URLs: the text is public.
- The **address (slug)** appears in links (`/?project=my-project`). Changing it breaks old links.
- On the list: change **status** from the dropdown, **show/hide** with the switch, reorder with ↑ ↓, **Duplicate** (creates a hidden copy), **Delete** (asks first).

### Sections
Each block of the home page. **Add section** → pick a type and a name (the name is only for you). New sections start hidden. Edit the fields, switch **Show on the site**, save. Reorder with ↑ ↓.
- *Hero* buttons need a link: `#projects` (a section's address) or `https://…`. Empty button text hides the button.
- *Projects* shows your visible projects; status filters are optional.
- Navigation links (Site text) to a hidden or missing section are automatically left out for visitors.

### Media
Upload JPEG/PNG/WebP/AVIF up to 5 MB; larger images are downsized to WebP automatically. Always add **alt text** (a short description for screen readers). **Replace file** updates the image everywhere it's used. **Delete** is refused while the image is used on the site, and tells you where, so nothing breaks silently.

### Appearance
Accent colour, theme, background, animation, profile image. Choices preview immediately; they go live when you press **Save appearance**. Visitors who prefer reduced motion never see animation.

### Site text
Navigation labels/links, status labels (“Active”, “Paused”…), small interface labels, footer text and copyright (`{year}` and `{site}` are filled in automatically).

### Settings
Publish/draft switch, site name, logo text, contact email, social links (GitHub, community…), search/share title, description and image, languages.

## 3. Turkish and English

*Settings → Languages* → enable **Türkçe** and save. Every editor now shows an **Editing: English | Türkçe** switch; each language is stored separately and falls back to the default when empty (the English text appears as the placeholder to translate from). Visitors see an EN/TR switch. Turning a language off hides it without deleting anything. Starter Turkish text is provided; review it before enabling.

## 4. Saving, previewing, undoing

- The bar at the bottom shows **All changes saved**, **Unsaved changes**, **Saving…** or **Not saved** with the reason. A green “saved” message appears only after the database confirms.
- If saving fails your edits stay on screen. Fix the highlighted field or retry.
- Leaving with unsaved changes asks first.
- **Preview** (top bar) opens the site as you'd see it signed in: hidden items and an unpublished site are visible, marked with a banner. Visitors never see them.
- There is no undo/history for published content; **Recent changes** on the dashboard records what changed and when, not the previous values. Use Supabase's database backups for recovery.

## 5. If something looks wrong

| Symptom | Cause / fix |
| --- | --- |
| “Not authorized” after sign-in | Account isn't in `public.hlab_admins` (§1 step 2). |
| Admin pages say settings are missing | Migrations not applied (DEPLOYMENT.md §1). |
| A section shows “content is invalid” on the Sections page | Its stored content no longer matches its type (e.g. edited directly in SQL). Delete and re-add it. |
| Can't delete an image | It's still used; follow the links shown, remove it there, retry. |
| Site shows “We could not load this site” | Database/network issue. Nothing is lost; retry. Check Supabase project status. |
