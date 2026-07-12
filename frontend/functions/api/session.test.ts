// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { generateKeyPair, exportJWK } from 'jose';
import { onRequest } from './session';

interface TestEnv {
  SUPABASE_URL?: string;
  SUPABASE_JWT_SECRET?: string;
  SUPABASE_SIGNING_KEY?: string;
  EMAIL_YURURI?: string;
  EMAIL_SHIYOWO?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  DEV_BYPASS_EMAIL?: string;
}

const baseEnv: TestEnv = {
  SUPABASE_URL: 'https://ref.supabase.co',
  SUPABASE_JWT_SECRET: 'test-secret-at-least-32-characters-long-xxxx',
  EMAIL_YURURI: 'yururi@example.com',
  EMAIL_SHIYOWO: 'shiyowo@example.com',
  ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com',
  ACCESS_AUD: 'aud-tag',
};

function ctx(env: TestEnv, init: RequestInit = {}) {
  return {
    request: new Request('https://yuruwollet.shiyow.dev/api/session', init),
    env,
  } as Parameters<typeof onRequest>[0];
}

describe('onRequest /api/session', () => {
  it('POST は 405', async () => {
    const res = await onRequest(ctx(baseEnv, { method: 'POST' }));
    expect(res.status).toBe(405);
  });

  it('署名資格 (SIGNING_KEY / JWT_SECRET) が無ければ 500', async () => {
    const res = await onRequest(ctx({ ...baseEnv, SUPABASE_JWT_SECRET: undefined }));
    expect(res.status).toBe(500);
  });

  it('SUPABASE_URL 未設定は 500', async () => {
    const res = await onRequest(ctx({ ...baseEnv, SUPABASE_URL: undefined }));
    expect(res.status).toBe(500);
  });

  it('dev bypass で 200 + 発行 JWT とメンバー情報', async () => {
    const res = await onRequest(ctx({ ...baseEnv, DEV_BYPASS_EMAIL: 'yururi@example.com' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      supabase_jwt: string;
      member: { id: string; displayName: string };
      household_id: string;
    };
    expect(body.member).toEqual({ id: 'yururi', displayName: 'ゆるり' });
    expect(body.household_id).toBe('main');
    expect(typeof body.supabase_jwt).toBe('string');
  });

  it('SUPABASE_SIGNING_KEY (ES256) でも 200', async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(privateKey)), alg: 'ES256', kid: 'k1' };
    const env: TestEnv = {
      ...baseEnv,
      SUPABASE_JWT_SECRET: undefined,
      SUPABASE_SIGNING_KEY: JSON.stringify(jwk),
      DEV_BYPASS_EMAIL: 'yururi@example.com',
    };
    const res = await onRequest(ctx(env));
    expect(res.status).toBe(200);
  });

  it('token 無し + bypass 無しは 403', async () => {
    const res = await onRequest(ctx(baseEnv));
    expect(res.status).toBe(403);
  });

  it('未登録の bypass email は 403', async () => {
    const res = await onRequest(ctx({ ...baseEnv, DEV_BYPASS_EMAIL: 'stranger@example.com' }));
    expect(res.status).toBe(403);
  });
});
