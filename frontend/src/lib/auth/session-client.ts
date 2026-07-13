export interface SessionInfo {
  supabaseJwt: string;
  expiresAt: number;
  /** avatarUrl は任意。Access の picture クレームは best-effort で届かないことがある */
  member: { id: string; displayName: string; avatarUrl?: string };
  householdId: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';
const REFRESH_MARGIN_SECONDS = 60;

const cache: { info: SessionInfo | null } = { info: null };

/**
 * キャッシュを捨てる。
 *
 * ログアウト（lib/auth/logout.ts）からも呼ぶので、テスト専用ではない。
 * これを残したままだと、遷移がブロックされたときに古い JWT が生き続け、
 * realtime の 10 分タイマーがそれを使い回してしまう。
 */
export function resetSessionCache(): void {
  cache.info = null;
}

/** /api/session を叩いてセッションを取得しキャッシュする */
export async function fetchSession(fetchImpl: typeof fetch = fetch): Promise<SessionInfo> {
  const res = await fetchImpl(`${API_BASE}/session`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`session request failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    supabase_jwt: string;
    expires_at: number;
    member: { id: string; displayName: string; avatarUrl?: string };
    household_id: string;
  };
  cache.info = {
    supabaseJwt: data.supabase_jwt,
    expiresAt: data.expires_at,
    member: data.member,
    householdId: data.household_id,
  };
  return cache.info;
}

/** 有効な Supabase JWT を返す (期限が近ければ再取得)。supabase-js の accessToken プロバイダ用 */
export async function getFreshSupabaseToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (!cache.info || cache.info.expiresAt - now < REFRESH_MARGIN_SECONDS) {
    await fetchSession(fetchImpl);
  }
  // fetchSession 成功後は必ず info が入る
  return cache.info!.supabaseJwt;
}
