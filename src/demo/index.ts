import { lazy } from 'react';

/**
 * `null` in every production build. The condition is spelled out here (not read from a
 * shared object) so Vite replaces `import.meta.env.MODE` at build time and removes the
 * dynamic import, DemoBar and the demo credentials from the production bundle.
 * `scripts/verify-build.ts` fails the build if any trace survives.
 */
export const DemoBar =
  import.meta.env.MODE !== 'production' && import.meta.env.VITE_DEMO_MODE === 'true' ? lazy(() => import('./DemoBar')) : null;
