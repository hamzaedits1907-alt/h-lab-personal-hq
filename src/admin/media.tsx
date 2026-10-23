import { useMemo, useRef, useState } from 'react';
import { useRepository } from '@/app/RepositoryContext';
import { useSite, useSiteData } from '@/app/SiteContext';
import { useLanguage } from '@/app/LanguageContext';
import type { LocalizedText, MediaItem } from '@/content/schema';
import { AppError } from '@/data/errors';
import { formatBytes, validateMediaUpload } from '@/data/validation';
import { Modal, useToast } from './feedback';

const MAX_EDGE = 2400;
const RESIZE_ABOVE_BYTES = 1.5 * 1024 * 1024;

export interface PreparedImage {
  file: File;
  width: number | null;
  height: number | null;
}

/**
 * Validates the upload (type, size, real file signature), then downsizes large
 * images and re-encodes them as WebP so the public site stays fast. Falls back
 * to the original file wherever the browser cannot decode or encode it.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  await validateMediaUpload(file);
  if (typeof createImageBitmap !== 'function') return { file, width: null, height: null };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { file, width: null, height: null };
  }
  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  if (scale === 1 && file.size <= RESIZE_ABOVE_BYTES) {
    bitmap.close();
    return { file, width, height };
  }

  try {
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { file, width, height };
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
    if (blob && blob.type === 'image/webp' && blob.size < file.size) {
      return { file: new File([blob], 'image.webp', { type: 'image/webp' }), width: w, height: h };
    }
    return { file, width, height };
  } finally {
    bitmap.close();
  }
}

/** Upload helper shared by the media library and the picker. Resolves with the stored item. */
export function useMediaUpload() {
  const repo = useRepository();
  const { reload } = useSite();
  const [busy, setBusy] = useState(false);

  const upload = async (file: File, alt: LocalizedText = {}): Promise<MediaItem> => {
    setBusy(true);
    try {
      const prepared = await prepareImage(file);
      const item = await repo.uploadMedia(prepared.file, alt, prepared.width && prepared.height ? { width: prepared.width, height: prepared.height } : null);
      await reload();
      return item;
    } finally {
      setBusy(false);
    }
  };

  const replace = async (id: string, file: File): Promise<MediaItem> => {
    setBusy(true);
    try {
      const prepared = await prepareImage(file);
      const item = await repo.replaceMediaFile(id, prepared.file, prepared.width && prepared.height ? { width: prepared.width, height: prepared.height } : null);
      await reload();
      return item;
    } finally {
      setBusy(false);
    }
  };

  return { upload, replace, busy };
}

export function MediaThumb({ item, className = '' }: { item: MediaItem; className?: string }) {
  const repo = useRepository();
  const { t } = useLanguage();
  return (
    <img
      className={`a-thumb ${className}`}
      src={repo.mediaUrl(item)}
      alt={t(item.alt)}
      width={item.width ?? undefined}
      height={item.height ?? undefined}
      loading="lazy"
      decoding="async"
    />
  );
}

export function ImageRef({ id, empty = 'No image' }: { id: string | null; empty?: string }) {
  const data = useSiteData();
  const item = id ? data?.media[id] : undefined;
  if (!item) {
    return <span className="a-thumb a-thumb--empty">{id ? 'Missing' : empty}</span>;
  }
  return <MediaThumb item={item} />;
}

/** Modal to choose an existing image or upload a new one. */
export function MediaPicker({
  title = 'Choose an image',
  selectedId,
  onSelect,
  onClose,
  allowNone = true,
}: {
  title?: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  allowNone?: boolean;
}) {
  const data = useSiteData();
  const { upload, busy } = useMediaUpload();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(
    () => Object.values(data?.media ?? {}).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data],
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const item = await upload(file);
      toast.success('Image uploaded. Add alt text in the media library.');
      onSelect(item.id);
    } catch (e) {
      setError(e instanceof AppError ? e.message : 'Upload failed.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Modal title={title} onClose={onClose} wide labelledBy="picker-title">
      <div className="a-picker">
        <div className="a-picker__bar">
          <label className="a-btn a-btn--small">
            {busy ? 'Uploading…' : 'Upload new'}
            <input
              ref={fileRef}
              type="file"
              className="visually-hidden"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={busy}
              onChange={(e) => void onFile(e.target.files?.[0])}
              aria-label="Upload a new image"
            />
          </label>
          {allowNone && (
            <button type="button" className="a-btn a-btn--small" onClick={() => onSelect(null)} disabled={selectedId === null}>
              Remove image
            </button>
          )}
          <span className="a-hint">JPEG, PNG, WebP or AVIF, up to {formatBytes(5 * 1024 * 1024)}.</span>
        </div>
        {error && (
          <p className="a-error" role="alert">
            {error}
          </p>
        )}
        {items.length === 0 ? (
          <p className="a-hint">The media library is empty. Upload an image to get started.</p>
        ) : (
          <ul className="a-picker__grid">
            {items.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={`a-picker__item ${m.id === selectedId ? 'is-selected' : ''}`}
                  aria-pressed={m.id === selectedId}
                  aria-label={`Select image ${m.alt.en || m.alt.tr || m.id.slice(0, 8)}`}
                  onClick={() => onSelect(m.id)}
                >
                  <MediaThumb item={m} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="a-modal__actions">
          <button type="button" className="a-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** A labelled button + preview that opens the picker. */
export function ImageField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="a-field">
      <span className="a-label">{label}</span>
      <div className="a-imagefield">
        <ImageRef id={value} />
        <div className="a-imagefield__actions">
          <button type="button" className="a-btn a-btn--small" onClick={() => setOpen(true)}>
            {value ? 'Change image' : 'Choose image'}
          </button>
          {value && (
            <button type="button" className="a-btn a-btn--small" onClick={() => onChange(null)}>
              Remove
            </button>
          )}
        </div>
      </div>
      {hint && <p className="a-hint">{hint}</p>}
      {open && (
        <MediaPicker
          title={label}
          selectedId={value}
          onSelect={(id) => {
            onChange(id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
