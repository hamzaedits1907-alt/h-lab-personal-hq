import type { FormEvent } from 'react';
import { PROJECT_STATUSES, UI_LABEL_KEYS, type LocalizedText, type NavItem } from '@/content/schema';
import { FieldErrorsProvider } from '../feedback';
import { LangTabs, ListEditor, LocalizedField, Notice, PageHeader, Panel, SaveBar, TextField, useEditLang } from '../ui';
import { useSettingsSection } from '../settingsForm';

const LABEL_NAMES: Record<(typeof UI_LABEL_KEYS)[number], string> = {
  viewProject: 'Card link: “View project”',
  visitProject: 'Window button: “Open project”',
  sourceCode: 'Window button: “Source code”',
  newTab: 'Screen-reader note: opens in a new tab',
  close: 'Close button',
  allProjects: 'Filter: “All”',
  skipToContent: 'Skip link (screen readers)',
  language: 'Language switch label',
  menu: 'Mobile menu button label',
  noProjects: 'Message when there are no projects',
  emailMe: 'Fallback email label',
  noContact: 'Message when there are no contact details',
  comingSoonTitle: 'Draft page title',
  comingSoonBody: 'Draft page text',
  previewBanner: 'Preview banner text',
};

export function SiteTextPage() {
  const { draft, saver, save, guard } = useSettingsSection(['nav', 'footer', 'ui'] as const);
  const edit = useEditLang();
  const f = draft.value;
  const L = (p: { label: string; name: string; value: LocalizedText; onChange: (v: LocalizedText) => void; hint?: string }) => (
    <LocalizedField key={p.name} {...p} lang={edit.lang} defaultLanguage={edit.defaultLanguage} />
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save();
  };

  return (
    <form onSubmit={submit} noValidate>
      {guard}
      <PageHeader title="Site text" subtitle="Navigation, labels and footer. Headlines and body text live in each section." />
      <FieldErrorsProvider value={saver.fields}>
        {saver.error && saver.error.code === 'validation' && <Notice kind="error">{saver.error.message}</Notice>}
        <LangTabs languages={edit.languages} lang={edit.lang} onChange={edit.setLang} />

        <Panel title="Navigation" hint="Links that point to a section that is hidden or missing are not shown to visitors.">
          <ListEditor<NavItem>
            title="Menu item"
            items={f.nav}
            max={10}
            addLabel="Add menu item"
            blank={{ id: 'new', label: {}, target: '#' }}
            onChange={(nav) => draft.update({ nav: nav.map((n, i) => (n.id === 'new' ? { ...n, id: `nav-${Date.now().toString(36)}${i}` } : n)) })}
            render={(item, i, set) => (
              <>
                {L({ label: `Label ${i + 1}`, name: `nav.${i}.label`, value: item.label, onChange: (label) => set({ ...item, label }) })}
                <TextField label={`Link ${i + 1}`} name={`nav.${i}.target`} value={item.target} hint="#section-address or https://…" onChange={(target) => set({ ...item, target })} />
              </>
            )}
          />
        </Panel>

        <Panel title="Project status labels">
          {PROJECT_STATUSES.map((s) =>
            L({
              label: s[0]!.toUpperCase() + s.slice(1),
              name: `ui.statusLabels.${s}`,
              value: f.ui.statusLabels[s] ?? {},
              onChange: (v) => draft.update({ ui: { ...f.ui, statusLabels: { ...f.ui.statusLabels, [s]: v } } }),
            }),
          )}
        </Panel>

        <Panel title="Footer">
          {L({ label: 'Footer text', name: 'footer.text', value: f.footer.text, onChange: (text) => draft.update({ footer: { ...f.footer, text } }) })}
          {L({
            label: 'Copyright line',
            name: 'footer.copyright',
            value: f.footer.copyright,
            hint: 'Use {year} for the current year and {site} for the site name.',
            onChange: (copyright) => draft.update({ footer: { ...f.footer, copyright } }),
          })}
        </Panel>

        <Panel title="Interface labels" hint="Small pieces of text used around the site. If you clear one, a built-in English fallback is used.">
          {UI_LABEL_KEYS.map((k) =>
            L({
              label: LABEL_NAMES[k],
              name: `ui.labels.${k}`,
              value: f.ui.labels[k] ?? {},
              onChange: (v) => draft.update({ ui: { ...f.ui, labels: { ...f.ui.labels, [k]: v } } }),
            }),
          )}
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
        saveLabel="Save site text"
      />
    </form>
  );
}
