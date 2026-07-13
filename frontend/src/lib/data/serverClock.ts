import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';

/**
 * サーバが見ている JST の今日（'YYYY-MM-DD'）。
 *
 * 24日の壁の表示ゲートは端末時計ではなくこれで判定する。端末時計が遅れていると
 * 壁がそもそも開かず、その月の残高確認を丸ごと素通りできてしまうため
 * （サーバ側の 24日ガードは「早すぎる確定」しか止められない）。
 */
export async function getServerToday(client: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await client.rpc('jst_today');
  if (error) throw new Error(`サーバの日付を取得できませんでした: ${error.message}`);
  return data as string;
}
