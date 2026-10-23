import { BLOCK_CONTENT_SCHEMAS, type BlockContentMap, type BlockType } from './schema';

/** Neutral starter content for a newly added section. The owner replaces it in the editor. */
export function defaultBlockContent<T extends BlockType>(type: T): BlockContentMap[T] {
  const raw: Record<BlockType, unknown> = {
    hero: {
      eyebrow: { en: 'Eyebrow' },
      headline: { en: 'A short, memorable headline' },
      description: { en: 'One or two sentences about what you do.' },
      primaryCta: { label: { en: 'Explore' }, target: '#projects' },
      secondaryCta: { label: { en: 'About' }, target: '#about' },
    },
    projects: { heading: { en: 'Projects' }, intro: { en: '' }, showFilters: true },
    about: { heading: { en: 'About' }, body: { en: 'Write a short introduction.' }, interests: [], showProfileImage: true },
    tags: { heading: { en: 'Skills' }, tags: [] },
    exploring: { heading: { en: 'Currently exploring' }, intro: { en: '' }, items: [] },
    gallery: { heading: { en: 'Gallery' }, images: [] },
    contact: { heading: { en: 'Get in touch' }, body: { en: '' }, emailLabel: { en: 'Email' }, showSocial: true },
    text: { heading: { en: 'Heading' }, body: { en: 'Write something here.' } },
  };
  return BLOCK_CONTENT_SCHEMAS[type].parse(raw[type]) as BlockContentMap[T];
}
