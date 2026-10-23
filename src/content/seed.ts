/**
 * Starter content. This is DATA, not UI: it is written to the database once
 * (by supabase/migrations/0003_seed_starter_content.sql, generated from this
 * file by `npm run seed:sql`) and then lives in the database where the owner
 * edits it. It is also what the browser-only demo mode starts from.
 *
 * It is never used as a fallback when the database is unreachable.
 */
import type { BlockContentMap, BlockType, ProjectInput, SettingsInput } from './schema';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export interface SeedBlock<T extends BlockType = BlockType> {
  id: string;
  type: T;
  anchor: string;
  adminLabel: string;
  position: number;
  isVisible: boolean;
  content: BlockContentMap[T];
}

export interface SeedProject extends ProjectInput {
  id: string;
  position: number;
}

export const seedSettings: SettingsInput = {
  siteName: 'H/LAB',
  brandText: 'H/LAB',
  contactEmail: null,
  socialLinks: [],
  nav: [
    { id: 'nav-projects', label: { en: 'Projects', tr: 'Projeler' }, target: '#projects' },
    { id: 'nav-about', label: { en: 'About', tr: 'Hakkında' }, target: '#about' },
    { id: 'nav-exploring', label: { en: 'Exploring', tr: 'Keşifler' }, target: '#exploring' },
    { id: 'nav-contact', label: { en: 'Contact', tr: 'İletişim' }, target: '#contact' },
  ],
  footer: {
    text: { en: 'Built by hand. Always in progress.', tr: 'Elle yapıldı. Hep yapım aşamasında.' },
    copyright: { en: '© {year} {site}', tr: '© {year} {site}' },
  },
  seo: {
    title: { en: 'H/LAB — Personal Project HQ', tr: 'H/LAB — Kişisel Proje Merkezi' },
    description: {
      en: 'A small lab for personal software: AI workspaces, desktop tools, games and simulations.',
      tr: 'Kişisel yazılımlar için küçük bir laboratuvar: yapay zekâ, masaüstü araçları, oyunlar ve simülasyonlar.',
    },
  },
  ui: {
    labels: {
      viewProject: { en: 'View project', tr: 'Projeyi gör' },
      visitProject: { en: 'Visit project', tr: 'Projeye git' },
      close: { en: 'Close', tr: 'Kapat' },
      allProjects: { en: 'All', tr: 'Tümü' },
      skipToContent: { en: 'Skip to content', tr: 'İçeriğe geç' },
      language: { en: 'Language', tr: 'Dil' },
      menu: { en: 'Menu', tr: 'Menü' },
      noProjects: { en: 'No projects to show yet.', tr: 'Henüz gösterilecek proje yok.' },
      emailMe: { en: 'Email', tr: 'E-posta' },
      noContact: { en: 'Contact details will appear here soon.', tr: 'İletişim bilgileri yakında burada olacak.' },
      comingSoonTitle: { en: 'Coming soon', tr: 'Çok yakında' },
      comingSoonBody: {
        en: 'This site is being prepared. Please check back shortly.',
        tr: 'Bu site hazırlanıyor. Lütfen kısa süre sonra tekrar bakın.',
      },
      previewBanner: {
        en: 'Preview: unpublished changes and hidden items are visible only to you.',
        tr: 'Önizleme: yayınlanmamış değişiklikler ve gizli öğeler yalnızca size görünür.',
      },
    },
    statusLabels: {
      active: { en: 'Active', tr: 'Aktif' },
      experiment: { en: 'Experiment', tr: 'Deney' },
      paused: { en: 'Paused', tr: 'Durduruldu' },
      completed: { en: 'Completed', tr: 'Tamamlandı' },
    },
  },
  languages: ['en'],
  defaultLanguage: 'en',
  isPublished: true,
  accent: 'mint',
  theme: 'dark',
  background: 'orbits',
  animation: 'full',
  profileMediaId: null,
  ogMediaId: null,
};

export const seedBlocks: SeedBlock[] = [
  {
    id: id(101),
    type: 'hero',
    anchor: 'top',
    adminLabel: 'Hero',
    position: 1,
    isVisible: true,
    content: {
      eyebrow: { en: 'Personal Project HQ', tr: 'Kişisel Proje Merkezi' },
      headline: { en: 'Projects in progress, ideas in orbit.', tr: 'Süren projeler, yörüngedeki fikirler.' },
      description: {
        en: 'A small lab for personal software: AI workspaces, desktop tools, games and simulations.',
        tr: 'Kişisel yazılımlar için küçük bir laboratuvar: yapay zekâ, masaüstü araçları, oyunlar ve simülasyonlar.',
      },
      primaryCta: { label: { en: 'Explore projects', tr: 'Projeleri keşfet' }, target: '#projects' },
      secondaryCta: { label: { en: 'About', tr: 'Hakkında' }, target: '#about' },
    },
  } satisfies SeedBlock<'hero'>,
  {
    id: id(102),
    type: 'projects',
    anchor: 'projects',
    adminLabel: 'Projects',
    position: 2,
    isVisible: true,
    content: {
      heading: { en: 'Projects', tr: 'Projeler' },
      intro: {
        en: 'Some are active, some are experiments, some are resting.',
        tr: 'Bazıları aktif, bazıları deney, bazıları dinleniyor.',
      },
      showFilters: true,
    },
  } satisfies SeedBlock<'projects'>,
  {
    id: id(103),
    type: 'about',
    anchor: 'about',
    adminLabel: 'About',
    position: 3,
    isVisible: true,
    content: {
      heading: { en: 'About', tr: 'Hakkında' },
      body: {
        en: 'H/LAB is where I keep my personal projects: AI tools, desktop software, games and simulations. Everything here is a work in progress.',
        tr: 'H/LAB, kişisel projelerimi topladığım yer: yapay zekâ araçları, masaüstü yazılımları, oyunlar ve simülasyonlar. Buradaki her şey yapım aşamasında.',
      },
      interests: [
        { en: 'AI tools', tr: 'Yapay zekâ araçları' },
        { en: 'Desktop software', tr: 'Masaüstü yazılımları' },
        { en: 'Browsers', tr: 'Tarayıcılar' },
        { en: 'Games', tr: 'Oyunlar' },
        { en: 'Simulation', tr: 'Simülasyon' },
      ],
      showProfileImage: true,
    },
  } satisfies SeedBlock<'about'>,
  {
    id: id(104),
    type: 'exploring',
    anchor: 'exploring',
    adminLabel: 'Currently exploring',
    position: 4,
    isVisible: true,
    content: {
      heading: { en: 'Currently exploring', tr: 'Şu an keşfettiklerim' },
      intro: { en: '', tr: '' },
      items: [
        {
          title: { en: 'Context-aware assistants', tr: 'Bağlamı anlayan asistanlar' },
          note: { en: 'AI that understands what you are doing.', tr: 'Ne yaptığınızı anlayan yapay zekâ.' },
        },
        {
          title: { en: 'Fast, light software', tr: 'Hızlı, hafif yazılımlar' },
          note: { en: 'Performance as a feature.', tr: 'Özellik olarak performans.' },
        },
        {
          title: { en: 'Immersive worlds', tr: 'Sürükleyici dünyalar' },
          note: { en: 'Simulation and game ideas.', tr: 'Simülasyon ve oyun fikirleri.' },
        },
      ],
    },
  } satisfies SeedBlock<'exploring'>,
  {
    id: id(105),
    type: 'contact',
    anchor: 'contact',
    adminLabel: 'Contact',
    position: 5,
    isVisible: true,
    content: {
      heading: { en: 'Get in touch', tr: 'İletişim' },
      body: { en: 'Say hello by email or through the links here.', tr: 'E-posta ile veya buradaki bağlantılar üzerinden merhaba deyin.' },
      emailLabel: { en: 'Email', tr: 'E-posta' },
      showSocial: true,
    },
  } satisfies SeedBlock<'contact'>,
];

const project = (
  n: number,
  position: number,
  p: Omit<ProjectInput, 'url' | 'coverMediaId' | 'isVisible' | 'description'> & {
    description: ProjectInput['description'];
  },
): SeedProject => ({ id: id(200 + n), position, url: null, coverMediaId: null, isVisible: true, ...p });

export const seedProjects: SeedProject[] = [
  project(1, 1, {
    slug: 'project-genius',
    title: 'Project Genius',
    summary: { en: 'A personal AI workspace.', tr: 'Kişisel bir yapay zekâ çalışma alanı.' },
    description: {
      en: 'A personal AI workspace for thinking, writing and building in one place.',
      tr: 'Düşünmek, yazmak ve üretmek için tek yerde toplanan kişisel bir yapay zekâ çalışma alanı.',
    },
    status: 'active',
    tags: ['AI', 'Workspace'],
  }),
  project(2, 2, {
    slug: 'project-browser',
    title: 'Project Browser',
    summary: { en: 'A performance-focused browser.', tr: 'Performans odaklı bir tarayıcı.' },
    description: {
      en: 'A browser project built around speed and a light footprint.',
      tr: 'Hız ve düşük kaynak kullanımı etrafında şekillenen bir tarayıcı projesi.',
    },
    status: 'active',
    tags: ['Browser', 'Performance'],
  }),
  project(3, 3, {
    slug: 'project-frame',
    title: 'Project-Frame',
    summary: { en: 'An AI-assisted video editor.', tr: 'Yapay zekâ destekli bir video düzenleyici.' },
    description: {
      en: 'An AI-assisted video editor. Currently paused.',
      tr: 'Yapay zekâ destekli bir video düzenleyici. Şu an durdurulmuş durumda.',
    },
    status: 'paused',
    tags: ['AI', 'Video'],
  }),
  project(4, 4, {
    slug: 'jarvis',
    title: 'JARVIS',
    summary: { en: 'A personal desktop command center.', tr: 'Kişisel bir masaüstü komuta merkezi.' },
    description: {
      en: 'A personal command center for the desktop: one place to control and check on everything.',
      tr: 'Masaüstü için kişisel bir komuta merkezi: her şeyi tek yerden kontrol etmek için.',
    },
    status: 'active',
    tags: ['Desktop', 'Automation'],
  }),
  project(5, 5, {
    slug: 'edward',
    title: 'Edward',
    summary: { en: 'A contextual desktop AI companion.', tr: 'Bağlamı anlayan bir masaüstü yapay zekâ yoldaşı.' },
    description: {
      en: 'A desktop AI companion that pays attention to what you are working on.',
      tr: 'Üzerinde çalıştığınız şeye dikkat eden bir masaüstü yapay zekâ yoldaşı.',
    },
    status: 'experiment',
    tags: ['AI', 'Desktop'],
  }),
  project(6, 6, {
    slug: 'lufthansa-launcher',
    title: 'Lufthansa Launcher',
    summary: { en: 'A gaming and community launcher.', tr: 'Oyun ve topluluk başlatıcısı.' },
    description: {
      en: 'A launcher that brings games and their community together.',
      tr: 'Oyunları ve toplulukları bir araya getiren bir başlatıcı.',
    },
    status: 'active',
    tags: ['Games', 'Community'],
  }),
  project(7, 7, {
    slug: 'project-genesis',
    title: 'Project Genesis',
    summary: { en: 'An immersive simulation.', tr: 'Sürükleyici bir simülasyon.' },
    description: {
      en: 'An immersive simulation project exploring what a living world can feel like.',
      tr: 'Yaşayan bir dünyanın nasıl hissettirebileceğini araştıran sürükleyici bir simülasyon projesi.',
    },
    status: 'experiment',
    tags: ['Simulation', 'Games'],
  }),
];
