import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { getFreshSupabaseToken } from './auth/session-client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
// ローカル supabase の公開 demo anon key (全環境共通の公開値)。本番は VITE_SUPABASE_ANON_KEY で上書き。
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

/**
 * supabase-js クライアント。accessToken プロバイダが /api/session の発行 JWT を供給する。
 * Supabase Auth のセッションは使わない (Cloudflare Access + Worker 発行トークンが真実)。
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    accessToken: async () => getFreshSupabaseToken(),
    auth: { autoRefreshToken: false, persistSession: false },
  },
);
