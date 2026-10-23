import type {
  BlockType,
  ChangeEntry,
  ContentBlock,
  LocalizedText,
  MediaItem,
  MediaUsage,
  Project,
  ProjectInput,
  SettingsInput,
  SiteData,
  SiteSettings,
} from '@/content/schema';
import type { BlockPatch, NewBlockInput } from './validation';

export type AuthState =
  | { status: 'signed-out' }
  | { status: 'signed-in'; userId: string; email: string; isAdmin: boolean };

/**
 * Everything the app needs from a backend. There are two implementations:
 * the Supabase one (production) and a browser-only demo one (development).
 *
 * Implementations MUST NOT report success until the backend has confirmed the
 * write, and MUST throw AppError for anything the owner should see.
 */
export interface Repository {
  readonly kind: 'supabase' | 'demo';

  /* ----- read ----- */
  /** Loads settings, blocks, projects and media. Visitors only receive published rows. */
  loadSite(): Promise<SiteData>;
  mediaUrl(item: Pick<MediaItem, 'storagePath'>): string;

  /* ----- auth ----- */
  getAuthState(): Promise<AuthState>;
  onAuthChange(listener: (state: AuthState) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;

  /* ----- settings ----- */
  saveSettings(input: SettingsInput): Promise<SiteSettings>;

  /* ----- sections ----- */
  createBlock(input: NewBlockInput): Promise<ContentBlock>;
  updateBlock(id: string, type: BlockType, patch: BlockPatch): Promise<ContentBlock>;
  deleteBlock(id: string): Promise<void>;
  /** Persist a new order. `ids` is the complete desired order. */
  reorderBlocks(ids: string[]): Promise<void>;

  /* ----- projects ----- */
  createProject(input: ProjectInput): Promise<Project>;
  updateProject(id: string, patch: Partial<ProjectInput>): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  reorderProjects(ids: string[]): Promise<void>;

  /* ----- media ----- */
  uploadMedia(file: File, alt: LocalizedText, dims?: { width: number; height: number } | null): Promise<MediaItem>;
  replaceMediaFile(id: string, file: File, dims?: { width: number; height: number } | null): Promise<MediaItem>;
  updateMediaAlt(id: string, alt: LocalizedText): Promise<MediaItem>;
  getMediaUsage(id: string): Promise<MediaUsage[]>;
  /** Throws MediaInUseError (and deletes nothing) if the image is referenced anywhere. */
  deleteMedia(id: string): Promise<void>;

  /* ----- admin extras ----- */
  listChanges(limit?: number): Promise<ChangeEntry[]>;
}
