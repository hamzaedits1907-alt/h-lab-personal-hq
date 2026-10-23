import type { z } from 'zod';
import { AppError } from './errors';
import {
  BLOCK_CONTENT_SCHEMAS,
  MEDIA_MAX_BYTES,
  MEDIA_MIME_TYPES,
  anchorSchema,
  blockMetaSchema,
  type BlockType,
  type BlockContentMap,
} from '@/content/schema';

/** Parse with Zod and convert failures to an AppError the UI can map onto fields. */
export function parse<S extends z.ZodType>(schema: S, value: unknown, what = 'The form'): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!(key in fields)) fields[key] = issue.message;
  }
  const first = result.error.issues[0];
  const where = first && first.path.length ? ` (${first.path.join(' › ')})` : '';
  throw new AppError('validation', `${what} has errors: ${first?.message ?? 'invalid value'}${where}`, fields);
}

export interface NewBlockInput {
  type: BlockType;
  anchor: string;
  adminLabel: string;
  isVisible: boolean;
  content: unknown;
}

export interface BlockPatch {
  anchor?: string;
  adminLabel?: string;
  isVisible?: boolean;
  content?: unknown;
}

export function validateNewBlock(input: NewBlockInput) {
  const meta = parse(blockMetaSchema, input, 'The section');
  const content = parse(BLOCK_CONTENT_SCHEMAS[input.type], input.content, 'The section content');
  return { ...meta, type: input.type, content: content as BlockContentMap[BlockType] };
}

export function validateBlockPatch(type: BlockType, patch: BlockPatch) {
  const out: { anchor?: string; adminLabel?: string; isVisible?: boolean; content?: BlockContentMap[BlockType] } = {};
  if (patch.anchor !== undefined) out.anchor = parse(anchorSchema, patch.anchor, 'The section');
  if (patch.adminLabel !== undefined) {
    out.adminLabel = parse(blockMetaSchema.shape.adminLabel, patch.adminLabel, 'The section');
  }
  if (patch.isVisible !== undefined) out.isVisible = patch.isVisible;
  if (patch.content !== undefined) {
    out.content = parse(BLOCK_CONTENT_SCHEMAS[type], patch.content, 'The section content') as BlockContentMap[BlockType];
  }
  return out;
}

/* ---------------------------- media files ---------------------------- */

export const MEDIA_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Cheap checks on the declared type and size. */
export function validateMediaFile(file: { type: string; size: number; name?: string }): void {
  if (!(MEDIA_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new AppError('validation', 'Unsupported file type. Use JPEG, PNG, WebP or AVIF.', { file: 'type' });
  }
  if (file.size <= 0) throw new AppError('validation', 'That file is empty.', { file: 'size' });
  if (file.size > MEDIA_MAX_BYTES) {
    throw new AppError('validation', `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MEDIA_MAX_BYTES)}.`, {
      file: 'size',
    });
  }
}

async function readHead(blob: Blob, n: number): Promise<Uint8Array> {
  const slice = blob.slice(0, n);
  if (typeof slice.arrayBuffer === 'function') return new Uint8Array(await slice.arrayBuffer());
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(slice);
  });
}

/** Identify an image by its first bytes, ignoring what the browser or filename claims. */
export async function sniffImageType(blob: Blob): Promise<(typeof MEDIA_MIME_TYPES)[number] | null> {
  const b = await readHead(blob, 16);
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp' && (ascii(8, 12) === 'avif' || ascii(8, 12) === 'avis')) return 'image/avif';
  return null;
}

/** Full validation: declared type/size, and that the bytes really are that image type. */
export async function validateMediaUpload(file: File | Blob & { name?: string }): Promise<(typeof MEDIA_MIME_TYPES)[number]> {
  validateMediaFile(file);
  const sniffed = await sniffImageType(file);
  if (!sniffed) throw new AppError('validation', 'That file does not look like a supported image.', { file: 'content' });
  if (sniffed !== file.type) {
    throw new AppError('validation', 'The file contents do not match its type.', { file: 'content' });
  }
  return sniffed;
}

/**
 * Keep only the keys the caller actually sent. `schema.partial()` still applies field
 * defaults (e.g. `repoUrl` -> null), which would silently wipe stored values on a partial update.
 */
export function onlyProvided<T extends object>(parsed: T, patch: object): Partial<T> {
  const sent = new Set(Object.keys(patch));
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => sent.has(k))) as Partial<T>;
}
