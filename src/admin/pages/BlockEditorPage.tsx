import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRepository } from '@/app/RepositoryContext';
import { useSite, useSiteData } from '@/app/SiteContext';
import {
  BLOCK_TYPE_INFO,
  type BlockContentMap,
  type BlockType,
  type ContentBlock,
} from '@/content/schema';
import { FieldErrorsProvider, useDraft, useSaver, useUnsavedGuard } from '../feedback';
import { ImageRef, MediaPicker } from '../media';
import {
  EmptyState,
  LangTabs,
  ListEditor,
  LocalizedField,
  Notice,
  PageHeader,
  Panel,
  SaveBar,
  TagInput,
  TextField,
  Toggle,
  useEditLang,
} from '../ui';

type Edit = ReturnType<typeof useEditLang>;
interface FormProps<T extends BlockType> {
  content: BlockContentMap[T];
  onChange: (c: BlockContentMap[T]) => void;
  edit: Edit;
}

export function BlockEditorPage() {
  const { id } = useParams();
  const data = useSiteData();
  if (!data) return null;
  const block = data.blocks.find((b) => b.id === id);
  if (!block) {
    return (
      <EmptyState title="Section not found">
        It may have been deleted. <Link to="/admin/sections">Back to sections</Link>
      </EmptyState>
    );
  }
  return <BlockForm key={block.id} block={block} />;
}

function BlockForm({ block }: { block: ContentBlock }) {
  const repo = useRepository();
  const { reload } = useSite();
  const edit = useEditLang();
  const saver = useSaver();

  const draft = useDraft({
    adminLabel: block.adminLabel,
    anchor: block.anchor,
    isVisible: block.isVisible,
    content: block.content as BlockContentMap[BlockType],
  });
  const guard = useUnsavedGuard(draft.dirty);
  const f = draft.value;

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    void saver.run(async () => {
      const saved = await repo.updateBlock(block.id, block.type, {
        adminLabel: f.adminLabel,
        anchor: f.anchor,
        isVisible: f.isVisible,
        content: f.content,
      });
      await reload();
      draft.commit({ adminLabel: saved.adminLabel, anchor: saved.anchor, isVisible: saved.isVisible, content: saved.content });
    }, 'Section saved');
  };

  const setContent = (content: BlockContentMap[BlockType]) => draft.update({ content });

  // The type-specific form. Each variant is narrowed by `block.type`.
  let fields: ReactNode;
  // The switch below narrows by `block.type`, which is also the type of `f.content`.
  const props = <T extends BlockType>() => ({ edit, onChange: setContent, content: f.content }) as unknown as FormProps<T>;
  switch (block.type) {
    case 'hero':
      fields = <HeroForm {...props<'hero'>()} />;
      break;
    case 'projects':
      fields = <ProjectsForm {...props<'projects'>()} />;
      break;
    case 'about':
      fields = <AboutForm {...props<'about'>()} />;
      break;
    case 'tags':
      fields = <TagsForm {...props<'tags'>()} />;
      break;
    case 'exploring':
      fields = <ExploringForm {...props<'exploring'>()} />;
      break;
    case 'gallery':
      fields = <GalleryForm {...props<'gallery'>()} />;
      break;
    case 'contact':
      fields = <ContactForm {...props<'contact'>()} />;
      break;
    case 'text':
      fields = <TextForm {...props<'text'>()} />;
      break;
  }

  return (
    <form onSubmit={save} noValidate>
      {guard}
      <PageHeader
        title={`Edit section: ${block.adminLabel}`}
        subtitle={BLOCK_TYPE_INFO[block.type].description}
        actions={
          <>
            <Link className="a-btn a-btn--small" to="/admin/sections">
              ← All sections
            </Link>
            <a className="a-btn a-btn--small" href={`/?preview=1#${block.anchor}`} target="_blank" rel="noopener">
              Preview
            </a>
          </>
        }
      />
      <FieldErrorsProvider value={saver.fields}>
        {saver.error && saver.error.code === 'validation' && <Notice kind="error">{saver.error.message}</Notice>}
        <LangTabs languages={edit.languages} lang={edit.lang} onChange={edit.setLang} />
        <Panel title="Content">{fields}</Panel>
        <Panel title="Section settings">
          <TextField label="Name (only you see this)" name="adminLabel" required value={f.adminLabel} onChange={(adminLabel) => draft.update({ adminLabel })} />
          <TextField
            label="Address (anchor)"
            name="anchor"
            required
            value={f.anchor}
            hint="Used for navigation links like #projects. Lowercase letters, numbers and hyphens."
            onChange={(anchor) => draft.update({ anchor })}
          />
          <Toggle label="Show on the site" checked={f.isVisible} onChange={(isVisible) => draft.update({ isVisible })} hint="Hidden sections are visible only to you, in preview." />
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
        saveLabel="Save section"
      />
    </form>
  );
}

/* --------------------------- per-type forms ---------------------------- */

function L({ edit, ...p }: { edit: Edit; label: string; name: string; value: Record<string, string | undefined>; onChange: (v: never) => void; multiline?: boolean; rows?: number; hint?: ReactNode }) {
  return <LocalizedField {...p} lang={edit.lang} defaultLanguage={edit.defaultLanguage} onChange={p.onChange as never} />;
}

function HeroForm({ content: c, onChange, edit }: FormProps<'hero'>) {
  const set = (patch: Partial<typeof c>) => onChange({ ...c, ...patch });
  return (
    <>
      <L edit={edit} label="Eyebrow" name="eyebrow" value={c.eyebrow} onChange={(eyebrow) => set({ eyebrow })} />
      <L edit={edit} label="Headline" name="headline" value={c.headline} onChange={(headline) => set({ headline })} hint="The last word is highlighted in the accent style." />
      <L edit={edit} label="Description" name="description" multiline rows={3} value={c.description} onChange={(description) => set({ description })} />
      <fieldset className="a-fieldset">
        <legend>Primary button</legend>
        <L edit={edit} label="Button text" name="primaryCta.label" value={c.primaryCta.label} onChange={(label) => set({ primaryCta: { ...c.primaryCta, label } })} />
        <TextField label="Button link" name="primaryCta.target" value={c.primaryCta.target} hint="#section-address or https://… Leave the text empty to hide the button." onChange={(target) => set({ primaryCta: { ...c.primaryCta, target } })} />
      </fieldset>
      <fieldset className="a-fieldset">
        <legend>Secondary button</legend>
        <L edit={edit} label="Button text" name="secondaryCta.label" value={c.secondaryCta.label} onChange={(label) => set({ secondaryCta: { ...c.secondaryCta, label } })} />
        <TextField label="Button link" name="secondaryCta.target" value={c.secondaryCta.target} onChange={(target) => set({ secondaryCta: { ...c.secondaryCta, target } })} />
      </fieldset>
    </>
  );
}

function ProjectsForm({ content: c, onChange, edit }: FormProps<'projects'>) {
  return (
    <>
      <L edit={edit} label="Heading" name="heading" value={c.heading} onChange={(heading) => onChange({ ...c, heading })} />
      <L edit={edit} label="Intro" name="intro" value={c.intro} onChange={(intro) => onChange({ ...c, intro })} />
      <Toggle label="Show status filters" checked={c.showFilters} onChange={(showFilters) => onChange({ ...c, showFilters })} />
      <p className="a-hint">
        The cards come from your <Link to="/admin/projects">projects</Link>.
      </p>
    </>
  );
}

function AboutForm({ content: c, onChange, edit }: FormProps<'about'>) {
  return (
    <>
      <L edit={edit} label="Heading" name="heading" value={c.heading} onChange={(heading) => onChange({ ...c, heading })} />
      <L edit={edit} label="Text" name="body" multiline rows={6} value={c.body} onChange={(body) => onChange({ ...c, body })} hint="Plain text. A blank line starts a new paragraph." />
      <ListEditor
        title="Interests"
        items={c.interests}
        max={16}
        addLabel="Add interest"
        blank={{}}
        onChange={(interests) => onChange({ ...c, interests })}
        render={(item, i, set) => (
          <L edit={edit} label={`Interest ${i + 1}`} name={`interests.${i}`} value={item} onChange={set} />
        )}
      />
      <Toggle label="Show profile image" checked={c.showProfileImage} onChange={(showProfileImage) => onChange({ ...c, showProfileImage })} hint="Choose the image under Appearance." />
    </>
  );
}

function TagsForm({ content: c, onChange, edit }: FormProps<'tags'>) {
  return (
    <>
      <L edit={edit} label="Heading" name="heading" value={c.heading} onChange={(heading) => onChange({ ...c, heading })} />
      <TagInput label="Tags" name="tags" max={30} value={c.tags} onChange={(tags) => onChange({ ...c, tags })} />
    </>
  );
}

function ExploringForm({ content: c, onChange, edit }: FormProps<'exploring'>) {
  return (
    <>
      <L edit={edit} label="Heading" name="heading" value={c.heading} onChange={(heading) => onChange({ ...c, heading })} />
      <L edit={edit} label="Intro (optional)" name="intro" value={c.intro} onChange={(intro) => onChange({ ...c, intro })} />
      <ListEditor
        title="Items"
        items={c.items}
        max={10}
        addLabel="Add item"
        blank={{ title: {}, note: {} }}
        onChange={(items) => onChange({ ...c, items })}
        render={(item, i, set) => (
          <>
            <L edit={edit} label={`Item ${i + 1} title`} name={`items.${i}.title`} value={item.title} onChange={(title) => set({ ...item, title })} />
            <L edit={edit} label={`Item ${i + 1} note`} name={`items.${i}.note`} value={item.note} onChange={(note) => set({ ...item, note })} />
          </>
        )}
      />
    </>
  );
}

function GalleryForm({ content: c, onChange, edit }: FormProps<'gallery'>) {
  const [picking, setPicking] = useState(false);
  return (
    <>
      <L edit={edit} label="Heading" name="heading" value={c.heading} onChange={(heading) => onChange({ ...c, heading })} />
      <ListEditor
        title="Images"
        items={c.images}
        max={12}
        hideAdd
        blank={{ mediaId: '' }}
        onChange={(images) => onChange({ ...c, images })}
        render={(item) => <ImageRef id={item.mediaId} />}
      />
      <button type="button" className="a-btn a-btn--small" disabled={c.images.length >= 12} onClick={() => setPicking(true)}>
        Add image
      </button>
      {picking && (
        <MediaPicker
          title="Add an image"
          selectedId={null}
          allowNone={false}
          onClose={() => setPicking(false)}
          onSelect={(id) => {
            if (id) onChange({ ...c, images: [...c.images, { mediaId: id }] });
            setPicking(false);
          }}
        />
      )}
    </>
  );
}

function ContactForm({ content: c, onChange, edit }: FormProps<'contact'>) {
  return (
    <>
      <L edit={edit} label="Heading" name="heading" value={c.heading} onChange={(heading) => onChange({ ...c, heading })} />
      <L edit={edit} label="Text" name="body" multiline rows={3} value={c.body} onChange={(body) => onChange({ ...c, body })} />
      <L edit={edit} label="Email label" name="emailLabel" value={c.emailLabel} onChange={(emailLabel) => onChange({ ...c, emailLabel })} />
      <Toggle label="Show social links" checked={c.showSocial} onChange={(showSocial) => onChange({ ...c, showSocial })} />
      <p className="a-hint">
        Your email and links are managed in <Link to="/admin/settings">Settings</Link>. There is no contact form.
      </p>
    </>
  );
}

function TextForm({ content: c, onChange, edit }: FormProps<'text'>) {
  return (
    <>
      <L edit={edit} label="Heading" name="heading" value={c.heading} onChange={(heading) => onChange({ ...c, heading })} />
      <L edit={edit} label="Text" name="body" multiline rows={8} value={c.body} onChange={(body) => onChange({ ...c, body })} hint="Plain text only. A blank line starts a new paragraph." />
    </>
  );
}
