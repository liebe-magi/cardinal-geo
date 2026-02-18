import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Supabase client — only created if env vars are present
// Uses a custom lock function to avoid Navigator Lock API timeouts
// when the browser tab is backgrounded and then restored.
// Auto token refresh is disabled here and managed manually via
// startAutoRefresh() / stopAutoRefresh() in the auth store's
// visibility change handler.
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: false,
          lock: async <R>(
            _name: string,
            _acquireTimeout: number,
            fn: () => Promise<R>,
          ): Promise<R> => {
            return await fn();
          },
        },
      })
    : null;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}
