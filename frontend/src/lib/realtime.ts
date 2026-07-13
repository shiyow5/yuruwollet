import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Realtime の再認証間隔。
 * 発行 Supabase JWT の TTL は 45 分なので、それより十分短くする。
 */
export const REALTIME_AUTH_REFRESH_MS = 10 * 60 * 1000;

export type RealtimeStatus = 'connecting' | 'connected' | 'error';

export interface SubscribeOptions {
  /** 購読するテーブル (public スキーマ) */
  table: 'wishlist_items';
  /** household スコープに絞る (RLS に加えた二重の絞り込み) */
  householdId: string;
  /** 変更を受け取ったとき（INSERT/UPDATE/DELETE いずれも） */
  onChange: () => void;
  /** 接続状態が変わったとき */
  onStatus: (status: RealtimeStatus) => void;
}

/**
 * テーブルの変更を購読する。戻り値を呼ぶと購読解除する。
 *
 * supabase-js の落とし穴への対処:
 * - `SupabaseClient` は初期化時に `realtime.setAuth(token)` を **明示トークン付き** で呼ぶため、
 *   内部の `_manuallySetToken` が立ち、以後 `RealtimeChannel` は
 *   `if (!socket._isManualToken()) socket.setAuth()` の再認証をスキップし続ける。
 *   自前発行 JWT は 45 分で失効するので、そのままだと realtime は**数十分後に静かに死ぬ**。
 *   → 購読前に **引数なしの `setAuth()`** を呼んでコールバック方式に戻し、さらに定期的に呼び直す。
 * - 切断中に起きた変更はイベントとして届かない。
 *   → 購読が確立した（再接続を含む）タイミングで必ず `onChange` を呼び、取り直させる。
 */
export function subscribeToTable(
  client: SupabaseClient<Database>,
  { table, householdId, onChange, onStatus }: SubscribeOptions,
): () => void {
  let disposed = false;
  let channel: RealtimeChannel | null = null;

  // 引数なし = accessToken コールバック方式（毎回フレッシュな JWT を取りに行く）
  const reauth = () => client.realtime.setAuth();

  /**
   * 定期再認証。/api/session やネットワークが一時的に落ちると setAuth() は reject する。
   * 握り潰すと unhandled rejection になる上、**購読は「接続中」に見えたまま認証だけ腐る**。
   * 失敗は必ず表に出す。
   */
  const refreshAuth = async () => {
    try {
      await reauth();
    } catch {
      if (!disposed) onStatus('error');
    }
  };

  void (async () => {
    try {
      await reauth();
    } catch {
      // 認証に失敗しても購読は試みる（サーバ側で弾かれれば onStatus('error') になる）
      if (!disposed) onStatus('error');
    }
    if (disposed) return;

    channel = client
      .channel(`${table}:${householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `household_id=eq.${householdId}`,
        },
        () => onChange(),
      )
      .subscribe((status) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          onStatus('connected');
          // 切断中の変更を取りこぼさないよう、購読確立のたびに取り直す
          onChange();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          onStatus('error');
        }
      });
  })();

  const timer = setInterval(() => void refreshAuth(), REALTIME_AUTH_REFRESH_MS);

  return () => {
    disposed = true;
    clearInterval(timer);
    if (channel) void client.removeChannel(channel);
  };
}
