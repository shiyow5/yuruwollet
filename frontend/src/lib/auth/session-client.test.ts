import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fetchSession, getFreshSupabaseToken, resetSessionCache } from './session-client';

function mockResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

const sample = (expiresAt: number) => ({
  supabase_jwt: 'jwt-token',
  expires_at: expiresAt,
  member: { id: 'yururi', displayName: 'ゆるり' },
  household_id: 'main',
});

beforeEach(() => {
  resetSessionCache();
});

describe('fetchSession', () => {
  it('レスポンスを SessionInfo に写像する', async () => {
    const fetchImpl = vi.fn(async () => mockResponse(sample(9999999999)));
    const info = await fetchSession(fetchImpl as unknown as typeof fetch);
    expect(info.supabaseJwt).toBe('jwt-token');
    expect(info.member).toEqual({ id: 'yururi', displayName: 'ゆるり' });
    expect(info.householdId).toBe('main');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('非 2xx は例外', async () => {
    const fetchImpl = vi.fn(async () => mockResponse({}, false, 403));
    await expect(fetchSession(fetchImpl as unknown as typeof fetch)).rejects.toThrow('403');
  });
});

describe('getFreshSupabaseToken', () => {
  it('有効期限が遠ければキャッシュを使い再取得しない', async () => {
    const far = Math.floor(Date.now() / 1000) + 3600;
    const fetchImpl = vi.fn(async () => mockResponse(sample(far)));
    const t1 = await getFreshSupabaseToken(fetchImpl as unknown as typeof fetch);
    const t2 = await getFreshSupabaseToken(fetchImpl as unknown as typeof fetch);
    expect(t1).toBe('jwt-token');
    expect(t2).toBe('jwt-token');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('有効期限が近ければ再取得する', async () => {
    const near = Math.floor(Date.now() / 1000) + 30;
    const fetchImpl = vi.fn(async () => mockResponse(sample(near)));
    await getFreshSupabaseToken(fetchImpl as unknown as typeof fetch);
    await getFreshSupabaseToken(fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
