import type { FormEvent } from 'react';
import { LANGS, LANG_NAMES, type Lang, type SocialLink } from '@/content/schema';
import { FieldErrorsProvider, useConfirm } from '../feedback';
import { ImageField } from '../media';
import { LangTabs, ListEditor, LocalizedField, Notice, PageHeader, Panel, SaveBar, SelectField, TextField, Toggle, useEditLang } from '../ui';
import { useSettingsSection } from '../settingsForm';

export function SettingsPage() {
  const { draft, saver, save, guard } = useSettingsSection([
    'siteName',
    'brandText',
    'contactEmail',
    'socialLinks',
    'seo',
    'ogMediaId',
    'languages',
    'defaultLanguage',
    'isPublished',
  ] as const);
  const edit = useEditLang();
  const confirm = useConfirm();
  const f = draft.value;

  const toggleLang = (l: Lang, on: boolean) => {
    const languages = on ? LANGS.filter((x) => x === l || f.languages.includes(x)) : f.languages.filter((x) => x !== l);
    if (languages.length === 0) return; // at least one language must stay enabled
    draft.update({ languages, defaultLanguage: languages.includes(f.defaultLanguage) ? f.defaultLanguage : (languages[0] as Lang) });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.isPublished && draft.saved.isPublished) {
      const yes = await confirm({
        title: 'Unpublish the site?',
        message: 'Visitors will see a “coming soon” page until you publish again. Your content is kept.',
        confirmLabel: 'Unpublish',
        danger: true,
      });
      if (!yes) return;
    }
    void save();
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      {guard}
      <PageHeader title="Settings" subtitle="Identity, contact details, search and sharing, and languages." />
      <FieldErrorsProvider value={saver.fields}>
        {saver.error && saver.error.code === 'validation' && <Notice kind="error">{saver.error.message}</Notice>}
        <LangTabs languages={edit.languages} lang={edit.lang} onChange={edit.setLang} />

        <Panel title="Publishing">
          <Toggle
            label="Site is published"
            checked={f.isPublished}
            onChange={(isPublished) => draft.update({ isPublished })}
            hint="When off, visitors see a “coming soon” page. You can still preview everything while signed in."
          />
        </Panel>

        <Panel title="Identity">
          <TextField label="Site name" name="siteName" required value={f.siteName} onChange={(siteName) => draft.update({ siteName })} hint="Used for accessibility and the browser tab fallback." />
          <TextField label="Logo text" name="brandText" required value={f.brandText} onChange={(brandText) => draft.update({ brandText })} hint="Shown next to the mark in the header and footer. Up to 24 characters." />
        </Panel>

        <Panel title="Contact">
          <TextField
            label="Contact email"
            name="contactEmail"
            type="email"
            value={f.contactEmail ?? ''}
            hint="Shown as a mailto link in the Contact section. Leave empty to hide it. Publishing an address exposes it to spam bots."
            onChange={(v) => draft.update({ contactEmail: v.trim() === '' ? null : v })}
          />
          <ListEditor<SocialLink>
            title="Social and project links"
            items={f.socialLinks}
            max={12}
            addLabel="Add link"
            blank={{ label: '', url: 'https://' }}
            onChange={(socialLinks) => draft.update({ socialLinks })}
            render={(item, i, set) => (
              <>
                <TextField label={`Link ${i + 1} name`} name={`socialLinks.${i}.label`} value={item.label} placeholder="GitHub" onChange={(label) => set({ ...item, label })} />
                <TextField label={`Link ${i + 1} address`} name={`socialLinks.${i}.url`} type="url" value={item.url} placeholder="https://github.com/…" onChange={(url) => set({ ...item, url })} />
              </>
            )}
          />
        </Panel>

        <Panel title="Search and sharing" hint="Used by search engines and when the link is shared. Static crawlers see the defaults in index.html; see docs/ARCHITECTURE.md.">
          <LocalizedField label="Page title" name="seo.title" value={f.seo.title} lang={edit.lang} defaultLanguage={edit.defaultLanguage} onChange={(title) => draft.update({ seo: { ...f.seo, title } })} hint="Up to 70 characters." />
          <LocalizedField
            label="Description"
            name="seo.description"
            multiline
            rows={3}
            value={f.seo.description}
            lang={edit.lang}
            defaultLanguage={edit.defaultLanguage}
            onChange={(description) => draft.update({ seo: { ...f.seo, description } })}
            hint="Up to 200 characters."
          />
          <ImageField label="Share image (Open Graph)" value={f.ogMediaId} onChange={(ogMediaId) => draft.update({ ogMediaId })} hint="Recommended 1200×630." />
        </Panel>

        <Panel title="Languages" hint="Publish English, Turkish, or both. Content in each language is stored separately; turning one off never deletes it.">
          <fieldset className="a-fieldset">
            <legend>Published languages</legend>
            {LANGS.map((l) => (
              <Toggle key={l} label={LANG_NAMES[l]} checked={f.languages.includes(l)} onChange={(on) => toggleLang(l, on)} disabled={f.languages.length === 1 && f.languages.includes(l)} />
            ))}
          </fieldset>
          <SelectField
            label="Default language"
            name="defaultLanguage"
            value={f.defaultLanguage}
            options={f.languages.map((l) => ({ value: l, label: LANG_NAMES[l] }))}
            hint="Used when a visitor’s language is not available, and as the fallback for untranslated text."
            onChange={(defaultLanguage) => draft.update({ defaultLanguage })}
          />
          <Notice kind="info">Starter Turkish text is included for the seeded content, but please review it before enabling Turkish. New content you add needs its own translation.</Notice>
        </Panel>
      </FieldErrorsProvider>
      <SaveBar
        dirty={draft.dirty}
        saving={saver.saving}
        error={saver.error?.message}
        onDiscard={() => {
          draft.discard();
          saver.clearError();
        }}
        saveLabel="Save settings"
      />
    </form>
  );
}
