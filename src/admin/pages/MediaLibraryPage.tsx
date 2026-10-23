import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useRepository } from '@/app/RepositoryContext';
import { useSite, useSiteData } from '@/app/SiteContext';
import type { LocalizedText, MediaItem, MediaUsage } from '@/content/schema';
import { AppError, MediaInUseError, errorMessage } from '@/data/errors';
import { formatBytes } from '@/data/validation';
import { FieldErrorsProvider, Modal, useConfirm, useDraft, useSaver } from '../feedback';
import { MediaThumb, useMediaUpload } from '../media';
import { EmptyState, LangTabs, LocalizedField, Notice, PageHeader, Panel, useEditLang } from '../ui';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';

function usageHref(u: MediaUsage): string {
  if (u.kind === 'project') return `/admin/projects/${u.refId}`;
  if (u.kind === 'block') return `/admin/sections/${u.refId}`;
  return '/admin/appearance';
}

export function MediaLibraryPage() {
  const data = useSiteData();
  const edit = useEditLang();
  const { upload, busy } = useMediaUpload();
  const saver = useSaver();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState<LocalizedText>({});
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ item: MediaItem; usages: MediaUsage[] } | null>(null);
  if (!data) return null;

  const items = Object.values(data.media).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Choose an image first.');
      return;
    }
    setError(null);
    const ok = await saver.run(async () => {
      await upload(file, alt);
    }, 'Image uploaded');
    if (ok) {
      setFile(null);
      setAlt({});
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <PageHeader title="Media library" subtitle="Images are public: anyone with the link can view them. Do not upload anything private." />

      <form onSubmit={submit} noValidate>
        <Panel title="Upload an image" hint="JPEG, PNG, WebP or AVIF up to 5 MB. Large images are downsized and converted to WebP in your browser.">
          <FieldErrorsProvider value={saver.fields}>
            <LangTabs languages={edit.languages} lang={edit.lang} onChange={edit.setLang} />
            <div className="a-field">
              <label className="a-label" htmlFor="media-file">
                Image file
              </label>
              <input
                id="media-file"
                ref={fileRef}
                className="a-input"
                type="file"
                accept={ACCEPT}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError(null);
                }}
                aria-describedby={error ? 'media-file-error' : undefined}
              />
              {error && (
                <p id="media-file-error" className="a-error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <LocalizedField
              label="Alt text"
              name="alt"
              value={alt}
              onChange={setAlt}
              lang={edit.lang}
              defaultLanguage={edit.defaultLanguage}
              hint="Describe the image for screen readers. Leave empty only for purely decorative images."
            />
            {saver.error && <Notice kind="error">{saver.error.message}</Notice>}
            <div>
              <button type="submit" className="a-btn a-btn--primary" disabled={busy || !file}>
                {busy ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </FieldErrorsProvider>
        </Panel>
      </form>

      {items.length === 0 ? (
        <EmptyState title="No images yet">Upload one above. Project covers, the profile image and galleries all use this library.</EmptyState>
      ) : (
        <ul className="a-mediagrid">
          {items.map((m) => (
            <MediaCard key={m.id} item={m} edit={edit} onBlocked={(usages) => setBlocked({ item: m, usages })} />
          ))}
        </ul>
      )}

      {blocked && (
        <Modal title="This image is still in use" onClose={() => setBlocked(null)} labelledBy="blocked-title">
          <div className="a-modal__body">
            <p>It can’t be deleted because removing it would leave gaps on the site. Remove or replace it in these places first:</p>
            <ul className="a-usage">
              {blocked.usages.map((u) => (
                <li key={`${u.kind}-${u.refId}-${u.label}`}>
                  <Link to={usageHref(u)} onClick={() => setBlocked(null)}>
                    {u.kind === 'project' ? 'Project' : u.kind === 'block' ? 'Section' : 'Setting'}: {u.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="a-modal__actions">
            <button type="button" className="a-btn" onClick={() => setBlocked(null)} autoFocus>
              OK
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function MediaCard({
  item,
  edit,
  onBlocked,
}: {
  item: MediaItem;
  edit: ReturnType<typeof useEditLang>;
  onBlocked: (u: MediaUsage[]) => void;
}) {
  const repo = useRepository();
  const { reload } = useSite();
  const confirm = useConfirm();
  const draft = useDraft<LocalizedText>(item.alt);
  const saver = useSaver();
  const { replace, busy } = useMediaUpload();
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const missingAlt = !item.alt.en?.trim() && !item.alt.tr?.trim();

  const saveAlt = (e: FormEvent) => {
    e.preventDefault();
    void saver.run(async () => {
      const saved = await repo.updateMediaAlt(item.id, draft.value);
      draft.commit(saved.alt);
      await reload();
    }, 'Alt text saved');
  };

  const onReplace = async (file: File | undefined) => {
    if (!file) return;
    setReplaceError(null);
    const yes = await confirm({
      title: 'Replace this image?',
      message: 'Everywhere this image is used on the site will show the new file.',
      confirmLabel: 'Replace',
    });
    if (!yes) {
      if (replaceRef.current) replaceRef.current.value = '';
      return;
    }
    try {
      await replace(item.id, file);
    } catch (e) {
      setReplaceError(errorMessage(e));
    } finally {
      if (replaceRef.current) replaceRef.current.value = '';
    }
  };

  const remove = async () => {
    try {
      const usages = await repo.getMediaUsage(item.id);
      if (usages.length > 0) return onBlocked(usages);
      const yes = await confirm({
        title: 'Delete this image?',
        message: 'The file will be removed permanently. This cannot be undone.',
        confirmLabel: 'Delete image',
        danger: true,
      });
      if (!yes) return;
      await saver.run(async () => {
        await repo.deleteMedia(item.id);
        await reload();
      }, 'Image deleted');
    } catch (e) {
      if (e instanceof MediaInUseError) return onBlocked(e.usages.map((u) => ({ ...u, kind: u.kind as MediaUsage['kind'] })));
      setReplaceError(e instanceof AppError ? e.message : errorMessage(e));
    }
  };

  return (
    <li className="a-media">
      <div className="a-media__preview">
        <MediaThumb item={item} />
      </div>
      <form className="a-media__body" onSubmit={saveAlt} noValidate>
        <p className="a-hint">
          {formatBytes(item.sizeBytes)}
          {item.width && item.height ? ` · ${item.width}×${item.height}` : ''} · {item.mimeType.replace('image/', '').toUpperCase()}
        </p>
        {missingAlt && <span className="pill pill--warn">No alt text</span>}
        <FieldErrorsProvider value={saver.fields}>
          <LocalizedField
            label="Alt text"
            name="alt"
            value={draft.value}
            onChange={draft.setValue}
            lang={edit.lang}
            defaultLanguage={edit.defaultLanguage}
          />
        </FieldErrorsProvider>
        {saver.error && (
          <p className="a-error" role="alert">
            {saver.error.message}
          </p>
        )}
        {replaceError && (
          <p className="a-error" role="alert">
            {replaceError}
          </p>
        )}
        <div className="a-row__actions">
          <button type="submit" className="a-btn a-btn--small a-btn--primary" disabled={!draft.dirty || saver.saving}>
            {saver.saving ? 'Saving…' : 'Save alt text'}
          </button>
          <label className="a-btn a-btn--small">
            {busy ? 'Replacing…' : 'Replace file'}
            <input ref={replaceRef} type="file" accept={ACCEPT} className="visually-hidden" disabled={busy} aria-label="Replace image file" onChange={(e) => void onReplace(e.target.files?.[0])} />
          </label>
          <button type="button" className="a-btn a-btn--small a-btn--danger-quiet" onClick={() => void remove()} disabled={saver.saving}>
            Delete
          </button>
        </div>
      </form>
    </li>
  );
}
