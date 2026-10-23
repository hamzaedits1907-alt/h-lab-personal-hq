import { useRepository } from '@/app/RepositoryContext';
import { useSite, useSiteData } from '@/app/SiteContext';
import type { SettingsInput, SiteSettings } from '@/content/schema';
import { useDraft, useSaver, useUnsavedGuard } from './feedback';

export function settingsToInput(s: SiteSettings): SettingsInput {
  const { updatedAt: _updatedAt, ...rest } = s;
  void _updatedAt;
  return rest;
}

/**
 * Edit a subset of the settings row. On save, the draft is merged onto the
 * LATEST stored settings so two admin pages can never overwrite each other's fields.
 */
export function useSettingsSection<K extends keyof SettingsInput>(keys: readonly K[]) {
  const repo = useRepository();
  const { reload } = useSite();
  const data = useSiteData();
  if (!data?.settings) throw new Error('Settings are not loaded');

  const pick = (s: SettingsInput) => Object.fromEntries(keys.map((k) => [k, s[k]])) as Pick<SettingsInput, K>;
  const draft = useDraft<Pick<SettingsInput, K>>(pick(settingsToInput(data.settings)));
  const saver = useSaver();
  const guard = useUnsavedGuard(draft.dirty);

  const save = () =>
    saver.run(async () => {
      const fresh = await reload();
      const base = settingsToInput(fresh?.settings ?? (data.settings as SiteSettings));
      const saved = await repo.saveSettings({ ...base, ...draft.value });
      draft.commit(pick(settingsToInput(saved)));
      await reload();
    });

  return { draft, saver, save, guard, settings: data.settings, data };
}
