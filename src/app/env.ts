/**
 * Public client configuration. Only the Supabase URL and the anon/publishable
 * key belong here; both are designed to be visible in the browser.
 */
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  bucket: (import.meta.env.VITE_SUPABASE_BUCKET ?? 'site-media').trim() || 'site-media',
  hasSupabase: /^https:\/\/[^\s]+$/.test(url) && anonKey.length > 20,
  /**
   * Demo mode keeps everything in this browser's localStorage and is only ever
   * honoured outside production builds (`vite --mode demo`). `MODE` is replaced
   * at build time, so a production bundle cannot be switched into demo mode.
   */
  demo: import.meta.env.MODE !== 'production' && import.meta.env.VITE_DEMO_MODE === 'true',
};

/** A service-role key in a public variable is always a configuration mistake. */
export function looksLikeServiceRoleKey(key: string): boolean {
  try {
    const payload = JSON.parse(atob(key.split('.')[1] ?? '')) as { role?: string };
    return payload.role === 'service_role';
  } catch {
    return key.startsWith('sb_secret_');
  }
}
