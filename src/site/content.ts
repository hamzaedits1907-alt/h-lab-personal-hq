import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useIsAdmin } from '@/app/AuthContext';
import { useSiteData } from '@/app/SiteContext';
import type { ContentBlock, Project, SiteSettings } from '@/content/schema';

/** Preview mode: an authenticated admin viewing `/?preview=1` also sees hidden items and an unpublished site. */
export function usePreview(): boolean {
  const [params] = useSearchParams();
  const isAdmin = useIsAdmin();
  return isAdmin && params.get('preview') === '1';
}

export interface VisibleContent {
  settings: SiteSettings | null;
  blocks: ContentBlock[];
  projects: Project[];
  preview: boolean;
}

const EMPTY: VisibleContent = { settings: null, blocks: [], projects: [], preview: false };

/** What the public page should render: published items only, unless previewing as admin. */
export function useVisibleContent(): VisibleContent {
  const data = useSiteData();
  const preview = usePreview();
  return useMemo(() => {
    if (!data) return EMPTY;
    return {
      settings: data.settings,
      blocks: preview ? data.blocks : data.blocks.filter((b) => b.isVisible),
      projects: preview ? data.projects : data.projects.filter((p) => p.isVisible),
      preview,
    };
  }, [data, preview]);
}
