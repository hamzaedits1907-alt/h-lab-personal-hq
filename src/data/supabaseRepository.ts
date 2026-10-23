import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/app/env';
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
import { AppError, MediaInUseError } from './errors';
import {
  projectToRow,
  rowToBlock,
  rowToInvalidBlock,
  rowToMedia,
  rowToProject,
  rowToSettings,
  settingsToRow,
  type BlockRow,
  type MediaRow,
  type ProjectRow,
  type SettingsRow,
} from './mappers';
import type { AuthState, Repository } from './repository';
import { getSupabase } from './supabaseClient';
import {
  MEDIA_EXTENSIONS,
  parse,
  onlyProvided,
  validateBlockPatch,
  validateMediaUpload,
  validateNewBlock,
  type BlockPatch,
  type NewBlockInput,
} from './validation';

/** Translate a PostgREST/Postgres error into something the owner can act on. */
export function toAppError(error: PostgrestError | { message: string; code?: string }, doing: string): AppError {
  const code = 'code' in error ? (error.code ?? '') : '';
  const msg = error.message ?? '';
  if (code === '23505') {
    const what = /anchor/.test(msg) ? 'section address' : /slug/.test(msg) ? 'project address' : 'value';
    return new AppError('conflict', `That ${what} is already in use. Choose a different one.`);
  }
  if (code === '23503' || /still in use/i.test(msg)) {
    return new AppError('in-use', 'That item is still referenced elsewhere on the site.');
  }
  if (code === '23514') return new AppError('validation', 'The database rejected one of the values. Check the form for errors.');
  if (code === 'PGRST204' || /repo_url/.test(msg)) {
    return new AppError('config', 'The database is missing the latest migration (0004_project_repo_url.sql). Apply it, then try again.');
  }
  if (code === 'PGRST116') {
    return new AppError('unauthorized', `Nothing was saved. The item was not found or you are not allowed to change it.`);
  }
  if (code === '42501' || code === 'PGRST301' || /row-level security|not authorized|permission denied|jwt/i.test(msg)) {
    return new AppError('unauthorized', 'You are not allowed to do that. Sign in again with the admin account.');
  }
  if (code === '' && /fetch|network|load failed/i.test(msg)) {
    return new AppError('network', `Could not reach the database while ${doing}. Check your connection and try again.`);
  }
  return new AppError('unknown', `Failed ${doing}: ${msg || 'unknown error'}`);
}

function check<T>(res: { data: T | null; error: PostgrestError | null }, doing: string): T {
  if (res.error) throw toAppError(res.error, doing);
  if (res.data === null || res.data === undefined) throw new AppError('not-found', `Nothing came back while ${doing}.`);
  return res.data;
}

export class SupabaseRepository implements Repository {
  readonly kind = 'supabase' as const;
  private readonly sb: SupabaseClient;
  private readonly bucket: string;

  constructor(client: SupabaseClient = getSupabase(), bucket: string = env.bucket) {
    this.sb = client;
    this.bucket = bucket;
  }

  /* --------------------------------- read --------------------------------- */

  async loadSite(): Promise<SiteData> {
    const [settings, blocks, projects, media] = await Promise.all([
      this.sb.from('hlab_site_settings').select('*').eq('id', 1).maybeSingle(),
      this.sb.from('hlab_content_blocks').select('*').order('position').order('created_at'),
      this.sb.from('hlab_projects').select('*').order('position').order('created_at'),
      this.sb.from('hlab_media').select('*'),
    ]);
    if (settings.error) throw toAppError(settings.error, 'loading the site');
    if (blocks.error) throw toAppError(blocks.error, 'loading sections');
    if (projects.error) throw toAppError(projects.error, 'loading projects');
    if (media.error) throw toAppError(media.error, 'loading media');

    const blockRows = (blocks.data ?? []) as BlockRow[];
    const typed: ContentBlock[] = [];
    const invalid = [];
    for (const row of blockRows) {
      const b = rowToBlock(row);
      if (b) typed.push(b);
      else invalid.push(rowToInvalidBlock(row));
    }

    return {
      settings: settings.data ? rowToSettings(settings.data as SettingsRow) : null,
      blocks: typed,
      invalidBlocks: invalid,
      projects: ((projects.data ?? []) as ProjectRow[]).map(rowToProject),
      media: Object.fromEntries(((media.data ?? []) as MediaRow[]).map((m) => [m.id, rowToMedia(m)])),
    };
  }

  mediaUrl(item: Pick<MediaItem, 'storagePath'>): string {
    return this.sb.storage.from(this.bucket).getPublicUrl(item.storagePath).data.publicUrl;
  }

  /* --------------------------------- auth --------------------------------- */

  private async stateFor(user: { id: string; email?: string | undefined } | null | undefined): Promise<AuthState> {
    if (!user) return { status: 'signed-out' };
    const { data, error } = await this.sb.rpc('hlab_is_admin');
    return { status: 'signed-in', userId: user.id, email: user.email ?? '', isAdmin: !error && data === true };
  }

  async getAuthState(): Promise<AuthState> {
    const { data } = await this.sb.auth.getSession();
    return this.stateFor(data.session?.user);
  }

  onAuthChange(listener: (state: AuthState) => void): () => void {
    const { data } = this.sb.auth.onAuthStateChange((_event, session) => {
      // Never call back into supabase synchronously inside this callback.
      setTimeout(() => {
        void this.stateFor(session?.user).then(listener);
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      if (/fetch|network/i.test(error.message)) throw toAppError({ message: error.message }, 'signing in');
      // Deliberately generic: do not reveal whether the email exists.
      throw new AppError('unauthorized', 'Incorrect email or password.');
    }
  }

  async signOut(): Promise<void> {
    const { error } = await this.sb.auth.signOut();
    if (error) throw toAppError(error, 'signing out');
  }

  /* ------------------------------- settings ------------------------------- */

  async saveSettings(input: SettingsInput): Promise<SiteSettings> {
    const value = parse(settingsInputSchema, input, 'The settings');
    const res = await this.sb.from('hlab_site_settings').update(settingsToRow(value)).eq('id', 1).select('*').single();
    return rowToSettings(check(res, 'saving settings') as SettingsRow);
  }

  /* ------------------------------- sections ------------------------------- */

  private async nextPosition(table: 'hlab_content_blocks' | 'hlab_projects'): Promise<number> {
    const { data, error } = await this.sb.from(table).select('position').order('position', { ascending: false }).limit(1);
    if (error) throw toAppError(error, 'preparing the new item');
    return ((data?.[0] as { position: number } | undefined)?.position ?? 0) + 1;
  }

  async createBlock(input: NewBlockInput): Promise<ContentBlock> {
    const v = validateNewBlock(input);
    const position = await this.nextPosition('hlab_content_blocks');
    const res = await this.sb
      .from('hlab_content_blocks')
      .insert({ type: v.type, anchor: v.anchor, admin_label: v.adminLabel, content: v.content, is_visible: v.isVisible, position })
      .select('*')
      .single();
    const block = rowToBlock(check(res, 'creating the section') as BlockRow);
    if (!block) throw new AppError('unknown', 'The section was saved but could not be read back.');
    return block;
  }

  async updateBlock(id: string, type: BlockType, patch: BlockPatch): Promise<ContentBlock> {
    const v = validateBlockPatch(type, patch);
    const row: Record<string, unknown> = {};
    if (v.anchor !== undefined) row.anchor = v.anchor;
    if (v.adminLabel !== undefined) row.admin_label = v.adminLabel;
    if (v.isVisible !== undefined) row.is_visible = v.isVisible;
    if (v.content !== undefined) row.content = v.content;
    const res = await this.sb.from('hlab_content_blocks').update(row).eq('id', id).select('*').single();
    const block = rowToBlock(check(res, 'saving the section') as BlockRow);
    if (!block) throw new AppError('unknown', 'The section was saved but could not be read back.');
    return block;
  }

  async deleteBlock(id: string): Promise<void> {
    const res = await this.sb.from('hlab_content_blocks').delete().eq('id', id).select('id');
    const rows = check(res, 'deleting the section');
    if (rows.length === 0) throw new AppError('unauthorized', 'Nothing was deleted. The section was not found or you are not allowed to delete it.');
  }

  async reorderBlocks(ids: string[]): Promise<void> {
    const { error } = await this.sb.rpc('hlab_reorder_blocks', { p_ids: ids });
    if (error) throw toAppError(error, 'saving the order');
  }

  /* -------------------------------- projects ------------------------------- */

  async createProject(input: ProjectInput): Promise<Project> {
    const v = parse(projectInputSchema, input, 'The project');
    const position = await this.nextPosition('hlab_projects');
    const res = await this.sb
      .from('hlab_projects')
      .insert({ ...projectToRow(v), position })
      .select('*')
      .single();
    return rowToProject(check(res, 'creating the project') as ProjectRow);
  }

  async updateProject(id: string, patch: Partial<ProjectInput>): Promise<Project> {
    const v = onlyProvided(parse(projectInputSchema.partial(), patch, 'The project'), patch);
    const res = await this.sb.from('hlab_projects').update(projectToRow(v)).eq('id', id).select('*').single();
    return rowToProject(check(res, 'saving the project') as ProjectRow);
  }

  async deleteProject(id: string): Promise<void> {
    const res = await this.sb.from('hlab_projects').delete().eq('id', id).select('id');
    const rows = check(res, 'deleting the project');
    if (rows.length === 0) throw new AppError('unauthorized', 'Nothing was deleted. The project was not found or you are not allowed to delete it.');
  }

  async reorderProjects(ids: string[]): Promise<void> {
    const { error } = await this.sb.rpc('hlab_reorder_projects', { p_ids: ids });
    if (error) throw toAppError(error, 'saving the order');
  }

  /* --------------------------------- media --------------------------------- */

  private async putObject(file: File): Promise<{ path: string; mime: string }> {
    const mime = await validateMediaUpload(file);
    const path = `uploads/${crypto.randomUUID()}.${MEDIA_EXTENSIONS[mime]}`;
    const { error } = await this.sb.storage
      .from(this.bucket)
      .upload(path, file, { contentType: mime, cacheControl: '31536000', upsert: false });
    if (error) throw toAppError(error, 'uploading the image');
    return { path, mime };
  }

  private async removeObject(path: string): Promise<void> {
    // Best effort: an orphaned file is harmless, a failed user action is not.
    await this.sb.storage.from(this.bucket).remove([path]).catch(() => undefined);
  }

  async uploadMedia(file: File, alt: LocalizedText, dims?: { width: number; height: number } | null): Promise<MediaItem> {
    const altValue = parse(mediaAltSchema, alt, 'The alt text');
    const { path, mime } = await this.putObject(file);
    const res = await this.sb
      .from('hlab_media')
      .insert({
        storage_path: path,
        mime_type: mime,
        size_bytes: file.size,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
        alt: altValue,
      })
      .select('*')
      .single();
    if (res.error) {
      await this.removeObject(path);
      throw toAppError(res.error, 'saving the image');
    }
    return rowToMedia(res.data as MediaRow);
  }

  async replaceMediaFile(id: string, file: File, dims?: { width: number; height: number } | null): Promise<MediaItem> {
    const { data: old, error: readError } = await this.sb.from('hlab_media').select('storage_path').eq('id', id).single();
    if (readError) throw toAppError(readError, 'finding the image');
    const { path, mime } = await this.putObject(file);
    const res = await this.sb
      .from('hlab_media')
      .update({ storage_path: path, mime_type: mime, size_bytes: file.size, width: dims?.width ?? null, height: dims?.height ?? null })
      .eq('id', id)
      .select('*')
      .single();
    if (res.error) {
      await this.removeObject(path);
      throw toAppError(res.error, 'replacing the image');
    }
    await this.removeObject((old as { storage_path: string }).storage_path);
    return rowToMedia(res.data as MediaRow);
  }

  async updateMediaAlt(id: string, alt: LocalizedText): Promise<MediaItem> {
    const altValue = parse(mediaAltSchema, alt, 'The alt text');
    const res = await this.sb.from('hlab_media').update({ alt: altValue }).eq('id', id).select('*').single();
    return rowToMedia(check(res, 'saving alt text') as MediaRow);
  }

  async getMediaUsage(id: string): Promise<MediaUsage[]> {
    const res = await this.sb.rpc('hlab_media_usage', { p_media_id: id });
    const rows = check(res, 'checking where the image is used') as { kind: MediaUsage['kind']; ref_id: string; label: string }[];
    return rows.map((r) => ({ kind: r.kind, refId: r.ref_id, label: r.label }));
  }

  async deleteMedia(id: string): Promise<void> {
    const usages = await this.getMediaUsage(id);
    if (usages.length > 0) throw new MediaInUseError(usages);
    const res = await this.sb.rpc('hlab_delete_media', { p_media_id: id });
    if (res.error) {
      if (res.error.code === '23503') throw new MediaInUseError(await this.getMediaUsage(id));
      throw toAppError(res.error, 'deleting the image');
    }
    await this.removeObject(res.data as string);
  }

  /* ------------------------------ admin extras ------------------------------ */

  async listChanges(limit = 8): Promise<ChangeEntry[]> {
    const res = await this.sb.from('hlab_change_log').select('*').order('at', { ascending: false }).limit(limit);
    const rows = check(res, 'loading recent changes') as {
      id: number;
      table_name: string;
      row_id: string | null;
      action: ChangeEntry['action'];
      summary: string;
      at: string;
    }[];
    return rows.map((r) => ({ id: r.id, table: r.table_name.replace(/^hlab_/, ''), rowId: r.row_id, action: r.action, summary: r.summary, at: r.at }));
  }
}
