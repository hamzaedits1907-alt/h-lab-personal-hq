import {
  mediaAltSchema,
  projectInputSchema,
  settingsInputSchema,
  type BlockType,
  type ChangeEntry,
  type ContentBlock,
  type LocalizedText,
  type MediaItem,
  type MediaUsage,
  type Project,
  type ProjectInput,
  type SettingsInput,
  type SiteData,
  type SiteSettings,
} from '@/content/schema';
import { seedBlocks, seedProjects, seedSettings } from '@/content/seed';
import { DEMO_EMAIL, DEMO_PASSWORD } from './demoCredentials';
import { AppError, MediaInUseError } from './errors';
import type { AuthState, Repository } from './repository';
import {
  MEDIA_EXTENSIONS,
  parse,
  validateBlockPatch,
  validateMediaUpload,
  validateNewBlock,
  type BlockPatch,
  type NewBlockInput,
} from './validation';

/**
 * Browser-only repository for development and automated tests. It mirrors the
 * rules the database enforces (unique addresses, validation, media-in-use
 * protection) but offers NO security: data lives in this browser's storage.
 * It is never reachable in a production build (see src/app/env.ts).
 */

export { DEMO_EMAIL, DEMO_PASSWORD };

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

interface State {
  settings: SiteSettings;
  blocks: ContentBlock[];
  projects: Project[];
  media: MediaItem[];
  changes: ChangeEntry[];
  nextChangeId: number;
}

const DATA_KEY = 'hlab-demo-data-v1';
const AUTH_KEY = 'hlab-demo-auth-v1';

function seedState(): State {
  const now = new Date().toISOString();
  return {
    settings: { ...parse(settingsInputSchema, seedSettings), updatedAt: now },
    blocks: seedBlocks.map((b) => ({
      id: b.id,
      type: b.type,
      anchor: b.anchor,
      adminLabel: b.adminLabel,
      position: b.position,
      isVisible: b.isVisible,
      content: b.content,
      createdAt: now,
      updatedAt: now,
    })) as ContentBlock[],
    projects: seedProjects.map((p) => ({ ...p, createdAt: now, updatedAt: now })),
    media: [],
    changes: [],
    nextChangeId: 1,
  };
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new AppError('unknown', 'Could not read that file.'));
    r.readAsDataURL(file);
  });
}

export class DemoRepository implements Repository {
  readonly kind = 'demo' as const;
  private readonly storage: StorageLike;
  private readonly listeners = new Set<(s: AuthState) => void>();

  constructor(storage: StorageLike = defaultStorage()) {
    this.storage = storage;
  }

  /* ------------------------------ persistence ------------------------------ */

  private load(): State {
    try {
      const raw = this.storage.getItem(DATA_KEY);
      if (raw) {
        const state = JSON.parse(raw) as State;
        // Records saved before `repoUrl` existed stay valid.
        state.projects = state.projects.map((p) => ({ ...p, repoUrl: p.repoUrl ?? null }));
        return state;
      }
    } catch {
      /* fall through to a fresh seed */
    }
    const fresh = seedState();
    this.save(fresh);
    return fresh;
  }

  private save(state: State): void {
    try {
      this.storage.setItem(DATA_KEY, JSON.stringify(state));
    } catch {
      throw new AppError('unknown', 'Demo storage is full. Remove some images and try again.');
    }
  }

  private log(state: State, table: string, rowId: string | null, action: ChangeEntry['action'], summary: string): void {
    state.changes.unshift({ id: state.nextChangeId++, table, rowId, action, summary, at: new Date().toISOString() });
    state.changes.length = Math.min(state.changes.length, 100);
  }

  /** Reset to the starter content (demo/testing only). */
  reset(): void {
    this.storage.removeItem(DATA_KEY);
  }

  private requireAdmin(): void {
    if (this.storage.getItem(AUTH_KEY) !== 'admin') {
      throw new AppError('unauthorized', 'You are not allowed to do that. Sign in again with the admin account.');
    }
  }

  /* ---------------------------------- read --------------------------------- */

  async loadSite(): Promise<SiteData> {
    const s = this.load();
    const admin = this.storage.getItem(AUTH_KEY) === 'admin';
    const sortByPos = <T extends { position: number }>(a: T[]) => [...a].sort((x, y) => x.position - y.position);
    return structuredClone({
      settings: s.settings,
      blocks: sortByPos(s.blocks).filter((b) => admin || b.isVisible),
      invalidBlocks: [],
      projects: sortByPos(s.projects).filter((p) => admin || p.isVisible),
      media: Object.fromEntries(s.media.map((m) => [m.id, m])),
    });
  }

  mediaUrl(item: Pick<MediaItem, 'storagePath'>): string {
    return item.storagePath;
  }

  /* ---------------------------------- auth --------------------------------- */

  async getAuthState(): Promise<AuthState> {
    return this.storage.getItem(AUTH_KEY) === 'admin'
      ? { status: 'signed-in', userId: 'demo-admin', email: DEMO_EMAIL, isAdmin: true }
      : { status: 'signed-out' };
  }

  onAuthChange(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async emit(): Promise<void> {
    const state = await this.getAuthState();
    this.listeners.forEach((l) => l(state));
  }

  async signIn(email: string, password: string): Promise<void> {
    if (email.trim().toLowerCase() !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
      throw new AppError('unauthorized', 'Incorrect email or password.');
    }
    this.storage.setItem(AUTH_KEY, 'admin');
    await this.emit();
  }

  async signOut(): Promise<void> {
    this.storage.removeItem(AUTH_KEY);
    await this.emit();
  }

  /* -------------------------------- settings ------------------------------- */

  async saveSettings(input: SettingsInput): Promise<SiteSettings> {
    this.requireAdmin();
    const value = parse(settingsInputSchema, input, 'The settings');
    const s = this.load();
    for (const id of [value.profileMediaId, value.ogMediaId]) {
      if (id && !s.media.some((m) => m.id === id)) throw new AppError('validation', 'Selected image no longer exists.');
    }
    s.settings = { ...value, updatedAt: new Date().toISOString() };
    this.log(s, 'site_settings', '1', 'update', 'site settings');
    this.save(s);
    return structuredClone(s.settings);
  }

  /* -------------------------------- sections ------------------------------- */

  async createBlock(input: NewBlockInput): Promise<ContentBlock> {
    this.requireAdmin();
    const v = validateNewBlock(input);
    const s = this.load();
    if (s.blocks.some((b) => b.anchor === v.anchor)) {
      throw new AppError('conflict', 'That section address is already in use. Choose a different one.');
    }
    const now = new Date().toISOString();
    const block = {
      id: crypto.randomUUID(),
      type: v.type,
      anchor: v.anchor,
      adminLabel: v.adminLabel,
      isVisible: v.isVisible,
      content: v.content,
      position: Math.max(0, ...s.blocks.map((b) => b.position)) + 1,
      createdAt: now,
      updatedAt: now,
    } as ContentBlock;
    s.blocks.push(block);
    this.log(s, 'content_blocks', block.id, 'insert', block.adminLabel);
    this.save(s);
    return structuredClone(block);
  }

  async updateBlock(id: string, type: BlockType, patch: BlockPatch): Promise<ContentBlock> {
    this.requireAdmin();
    const v = validateBlockPatch(type, patch);
    const s = this.load();
    const i = s.blocks.findIndex((b) => b.id === id);
    const existing = s.blocks[i];
    if (!existing) throw new AppError('unauthorized', 'Nothing was saved. The section was not found.');
    if (v.anchor && s.blocks.some((b) => b.id !== id && b.anchor === v.anchor)) {
      throw new AppError('conflict', 'That section address is already in use. Choose a different one.');
    }
    const next = { ...existing, ...v, updatedAt: new Date().toISOString() } as ContentBlock;
    s.blocks[i] = next;
    this.log(s, 'content_blocks', id, 'update', next.adminLabel);
    this.save(s);
    return structuredClone(next);
  }

  async deleteBlock(id: string): Promise<void> {
    this.requireAdmin();
    const s = this.load();
    const b = s.blocks.find((x) => x.id === id);
    if (!b) throw new AppError('unauthorized', 'Nothing was deleted. The section was not found.');
    s.blocks = s.blocks.filter((x) => x.id !== id);
    this.log(s, 'content_blocks', id, 'delete', b.adminLabel);
    this.save(s);
  }

  async reorderBlocks(ids: string[]): Promise<void> {
    this.requireAdmin();
    const s = this.load();
    s.blocks.forEach((b) => {
      const i = ids.indexOf(b.id);
      if (i >= 0) b.position = i + 1;
    });
    this.save(s);
  }

  /* -------------------------------- projects ------------------------------- */

  private checkCover(s: State, id: string | null | undefined) {
    if (id && !s.media.some((m) => m.id === id)) throw new AppError('validation', 'Selected cover image no longer exists.');
  }

  async createProject(input: ProjectInput): Promise<Project> {
    this.requireAdmin();
    const v = parse(projectInputSchema, input, 'The project');
    const s = this.load();
    if (s.projects.some((p) => p.slug === v.slug)) {
      throw new AppError('conflict', 'That project address is already in use. Choose a different one.');
    }
    this.checkCover(s, v.coverMediaId);
    const now = new Date().toISOString();
    const project: Project = {
      ...v,
      id: crypto.randomUUID(),
      position: Math.max(0, ...s.projects.map((p) => p.position)) + 1,
      createdAt: now,
      updatedAt: now,
    };
    s.projects.push(project);
    this.log(s, 'projects', project.id, 'insert', project.title);
    this.save(s);
    return structuredClone(project);
  }

  async updateProject(id: string, patch: Partial<ProjectInput>): Promise<Project> {
    this.requireAdmin();
    const v = parse(projectInputSchema.partial(), patch, 'The project');
    const s = this.load();
    const i = s.projects.findIndex((p) => p.id === id);
    const existing = s.projects[i];
    if (!existing) throw new AppError('unauthorized', 'Nothing was saved. The project was not found.');
    if (v.slug && s.projects.some((p) => p.id !== id && p.slug === v.slug)) {
      throw new AppError('conflict', 'That project address is already in use. Choose a different one.');
    }
    this.checkCover(s, v.coverMediaId);
    const next: Project = { ...existing, ...v, updatedAt: new Date().toISOString() };
    s.projects[i] = next;
    this.log(s, 'projects', id, 'update', next.title);
    this.save(s);
    return structuredClone(next);
  }

  async deleteProject(id: string): Promise<void> {
    this.requireAdmin();
    const s = this.load();
    const p = s.projects.find((x) => x.id === id);
    if (!p) throw new AppError('unauthorized', 'Nothing was deleted. The project was not found.');
    s.projects = s.projects.filter((x) => x.id !== id);
    this.log(s, 'projects', id, 'delete', p.title);
    this.save(s);
  }

  async reorderProjects(ids: string[]): Promise<void> {
    this.requireAdmin();
    const s = this.load();
    s.projects.forEach((p) => {
      const i = ids.indexOf(p.id);
      if (i >= 0) p.position = i + 1;
    });
    this.save(s);
  }

  /* ---------------------------------- media -------------------------------- */

  async uploadMedia(file: File, alt: LocalizedText, dims?: { width: number; height: number } | null): Promise<MediaItem> {
    this.requireAdmin();
    const altValue = parse(mediaAltSchema, alt, 'The alt text');
    const mime = await validateMediaUpload(file);
    const dataUrl = await readFileAsDataUrl(file);
    const s = this.load();
    const now = new Date().toISOString();
    const item: MediaItem = {
      id: crypto.randomUUID(),
      storagePath: dataUrl,
      mimeType: mime,
      sizeBytes: file.size,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      alt: altValue,
      createdAt: now,
      updatedAt: now,
    };
    s.media.push(item);
    this.log(s, 'media', item.id, 'insert', `uploads/${item.id}.${MEDIA_EXTENSIONS[mime]}`);
    this.save(s);
    return structuredClone(item);
  }

  async replaceMediaFile(id: string, file: File, dims?: { width: number; height: number } | null): Promise<MediaItem> {
    this.requireAdmin();
    const mime = await validateMediaUpload(file);
    const dataUrl = await readFileAsDataUrl(file);
    const s = this.load();
    const i = s.media.findIndex((m) => m.id === id);
    const existing = s.media[i];
    if (!existing) throw new AppError('not-found', 'That image no longer exists.');
    const next: MediaItem = {
      ...existing,
      storagePath: dataUrl,
      mimeType: mime,
      sizeBytes: file.size,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      updatedAt: new Date().toISOString(),
    };
    s.media[i] = next;
    this.log(s, 'media', id, 'update', 'replaced file');
    this.save(s);
    return structuredClone(next);
  }

  async updateMediaAlt(id: string, alt: LocalizedText): Promise<MediaItem> {
    this.requireAdmin();
    const altValue = parse(mediaAltSchema, alt, 'The alt text');
    const s = this.load();
    const i = s.media.findIndex((m) => m.id === id);
    const existing = s.media[i];
    if (!existing) throw new AppError('not-found', 'That image no longer exists.');
    const next = { ...existing, alt: altValue, updatedAt: new Date().toISOString() };
    s.media[i] = next;
    this.save(s);
    return structuredClone(next);
  }

  private usageOf(s: State, id: string): MediaUsage[] {
    const out: MediaUsage[] = [];
    for (const p of s.projects) if (p.coverMediaId === id) out.push({ kind: 'project', refId: p.id, label: p.title });
    for (const b of s.blocks) if (JSON.stringify(b.content).includes(id)) out.push({ kind: 'block', refId: b.id, label: b.adminLabel });
    if (s.settings.profileMediaId === id) out.push({ kind: 'settings', refId: '1', label: 'Profile image' });
    if (s.settings.ogMediaId === id) out.push({ kind: 'settings', refId: '1', label: 'Share image' });
    return out;
  }

  async getMediaUsage(id: string): Promise<MediaUsage[]> {
    this.requireAdmin();
    return this.usageOf(this.load(), id);
  }

  async deleteMedia(id: string): Promise<void> {
    this.requireAdmin();
    const s = this.load();
    const usages = this.usageOf(s, id);
    if (usages.length > 0) throw new MediaInUseError(usages);
    if (!s.media.some((m) => m.id === id)) throw new AppError('not-found', 'That image no longer exists.');
    s.media = s.media.filter((m) => m.id !== id);
    this.log(s, 'media', id, 'delete', 'image');
    this.save(s);
  }

  /* ------------------------------ admin extras ------------------------------ */

  async listChanges(limit = 8): Promise<ChangeEntry[]> {
    this.requireAdmin();
    return structuredClone(this.load().changes.slice(0, limit));
  }
}

function defaultStorage(): StorageLike {
  try {
    return window.localStorage;
  } catch {
    return new MemoryStorage();
  }
}
