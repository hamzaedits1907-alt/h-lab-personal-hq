// Runs scripts/live-smoke.ts through Vite so `@/` aliases and import.meta.env resolve like in the app.
import { createServer } from 'vite';

const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
try {
  await server.ssrLoadModule('/scripts/live-smoke.ts');
} finally {
  await server.close();
}
