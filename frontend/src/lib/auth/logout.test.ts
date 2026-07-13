import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ACCESS_LOGOUT_URL, logout } from './logout';
import { fetchSession, getFreshSupabaseToken, resetSessionCache } from './session-client';

function sessionResponse() {
  return {
    ok: true,
    json: async () => ({
      supabase_jwt: 'jwt',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      member: { id: 'yururi', displayName: 'ゆるり' },
      household_id: 'main',
    }),
  } as unknown as Response;
}

describe('logout', () => {
  beforeEach(() => {
    resetSessionCache();
  });

  it('Cloudflare Access のログアウト URL へフルページ遷移する', async () => {
    const navigate = vi.fn();
    await logout({ navigate });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(ACCESS_LOGOUT_URL);
    expect(ACCESS_LOGOUT_URL).toBe('/cdn-cgi/access/logout');
  });

  // キャッシュを捨てないと、遷移がブロックされた場合に古い JWT が生き続ける。
  // realtime の 10 分タイマーが setAuth() でそれを使い回してしまう。
  it('Supabase JWT のキャッシュを捨てる', async () => {
    const fetchImpl = vi.fn(async () => sessionResponse());
    await fetchSession(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // キャッシュが効いていることをまず確認（2 回目は叩かない）
    await getFreshSupabaseToken(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await logout({ navigate: vi.fn() });

    // 捨てられていれば、次の取得で /api/session を叩き直す
    await getFreshSupabaseToken(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('渡された追加キャッシュ（TanStack Query など）も捨てる', async () => {
    const clearCaches = vi.fn();
    await logout({ clearCaches, navigate: vi.fn() });
    expect(clearCaches).toHaveBeenCalledTimes(1);
  });

  // 遷移してからキャッシュを捨てても、遷移でページが消えるので実行されない。
  // **捨ててから遷移する**（順序が契約）。
  it('キャッシュを捨ててから遷移する', async () => {
    const order: string[] = [];
    const fetchImpl = vi.fn(async () => sessionResponse());
    await fetchSession(fetchImpl);

    await logout({
      clearCaches: () => order.push('clear'),
      navigate: () => order.push('navigate'),
    });

    // キャッシュが空になっていることを、順序の最後で確認する
    await getFreshSupabaseToken(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // = セッションキャッシュは捨てられていた
    expect(order).toEqual(['clear', 'navigate']);
  });

  it('clearCaches を渡さなくても動く', async () => {
    const navigate = vi.fn();
    await expect(logout({ navigate })).resolves.toBeUndefined();
    expect(navigate).toHaveBeenCalledWith(ACCESS_LOGOUT_URL);
  });

  // 本番で実際に走るのは navigate 未指定の経路（既定の window.location.assign）。
  // ここを検証しないと、既定の遷移が壊れていても気づけない。
  it('navigate 未指定なら window.location.assign へフルページ遷移する', async () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign },
    });

    try {
      await logout();
      expect(assign).toHaveBeenCalledWith('/cdn-cgi/access/logout');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });
});
