import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, looksLikeServiceRoleKey } from '@/app/env';
import { AppError } from './errors';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!env.hasSupabase) {
    throw new AppError(
      'config',
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see docs/DEPLOYMENT.md).',
    );
  }
  if (looksLikeServiceRoleKey(env.supabaseAnonKey)) {
    // Refuse to run rather than ship a privileged key to every visitor.
    throw new AppError(
      'config',
      'A service-role/secret key was provided as the public key. Replace it with the anon/publishable key.',
    );
  }
  client ??= createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}
