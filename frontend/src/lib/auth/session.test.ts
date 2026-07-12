// @vitest-environment node
import { describe, expect, it, beforeAll } from 'vitest';
import { SignJWT, jwtVerify, generateKeyPair } from 'jose';

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;
import {
  extractAccessToken,
  verifyAccessEmail,
  mapEmailToMember,
  mintSupabaseJwt,
  createSession,
  SessionError,
  type SessionConfig,
} from './session';

const members = {
  'yururi@example.com': { memberId: 'yururi', householdId: 'main', displayName: 'ゆるり' },
  'shiyowo@example.com': { memberId: 'shiyowo', householdId: 'main', displayName: 'しよを' },
};

const cfg: SessionConfig = {
  accessAud: 'test-aud-tag',
  accessIssuer: 'https://team.cloudflareaccess.com',
  supabaseJwtSecret: 'test-secret-at-least-32-characters-long-xxxx',
  supabaseIssuer: 'https://ref.supabase.co/auth/v1',
  members,
  ttlSeconds: 2700,
};

let accessPub: KeyPair['publicKey'];
let accessPriv: KeyPair['privateKey'];

// 本番の createRemoteJWKSet 相当: 引数を無視して公開鍵を返す JWKS リゾルバ
const keyResolver = () => accessPub;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  accessPub = publicKey;
  accessPriv = privateKey;
});

async function signAccessToken(
  email: string,
  overrides: { aud?: string; iss?: string; exp?: string | number } = {},
): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256' })
    .setAudience(overrides.aud ?? cfg.accessAud)
    .setIssuer(overrides.iss ?? cfg.accessIssuer)
    .setIssuedAt()
    .setExpirationTime(overrides.exp ?? '5m')
    .sign(accessPriv);
}

function requestWith(headers: Record<string, string>): Request {
  return new Request('https://yuruwollet.shiyow.dev/api/session', { headers });
}

describe('extractAccessToken', () => {
  it('Cf-Access-Jwt-Assertion ヘッダを優先', () => {
    expect(extractAccessToken(requestWith({ 'Cf-Access-Jwt-Assertion': 'abc' }))).toBe('abc');
  });
  it('ヘッダが無ければ CF_Authorization Cookie', () => {
    expect(extractAccessToken(requestWith({ Cookie: 'a=1; CF_Authorization=xyz; b=2' }))).toBe(
      'xyz',
    );
  });
  it('どちらも無ければ null', () => {
    expect(extractAccessToken(requestWith({}))).toBeNull();
  });
});

describe('verifyAccessEmail', () => {
  it('正しい token から email を小文字で取得', async () => {
    const token = await signAccessToken('YuRuRi@Example.com');
    await expect(verifyAccessEmail(token, keyResolver, cfg)).resolves.toBe('yururi@example.com');
  });
  it('aud 不一致は拒否', async () => {
    const token = await signAccessToken('yururi@example.com', { aud: 'wrong-aud' });
    await expect(verifyAccessEmail(token, keyResolver, cfg)).rejects.toThrow();
  });
  it('iss 不一致は拒否', async () => {
    const token = await signAccessToken('yururi@example.com', { iss: 'https://evil.example' });
    await expect(verifyAccessEmail(token, keyResolver, cfg)).rejects.toThrow();
  });
  it('期限切れは拒否', async () => {
    const token = await signAccessToken('yururi@example.com', {
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    await expect(verifyAccessEmail(token, keyResolver, cfg)).rejects.toThrow();
  });
  it('email クレームが無い場合は SessionError', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setAudience(cfg.accessAud)
      .setIssuer(cfg.accessIssuer)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(accessPriv);
    await expect(verifyAccessEmail(token, keyResolver, cfg)).rejects.toThrow(SessionError);
  });
});

describe('mapEmailToMember', () => {
  it('大文字小文字を無視して引ける', () => {
    expect(mapEmailToMember('ShiyoWo@Example.com', members).memberId).toBe('shiyowo');
  });
  it('未登録 email は SessionError(403)', () => {
    try {
      mapEmailToMember('stranger@example.com', members);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SessionError);
      expect((e as SessionError).status).toBe(403);
    }
  });
});

describe('mintSupabaseJwt', () => {
  it('Supabase が期待するクレームで署名される', async () => {
    const { token, expiresAt } = await mintSupabaseJwt(members['yururi@example.com'], cfg);
    const secret = new TextEncoder().encode(cfg.supabaseJwtSecret);
    const { payload } = await jwtVerify(token, secret, { audience: 'authenticated' });
    expect(payload.role).toBe('authenticated');
    expect(payload.household_id).toBe('main');
    expect(payload.member_id).toBe('yururi');
    expect(payload.sub).toBe('yururi');
    expect(payload.iss).toBe(cfg.supabaseIssuer);
    expect(payload.exp).toBe(expiresAt);
  });
});

describe('createSession', () => {
  const getAccessKey = () => keyResolver;

  it('有効な Access token でセッションを発行し、発行 JWT は検証可能', async () => {
    const token = await signAccessToken('yururi@example.com');
    const session = await createSession(requestWith({ 'Cf-Access-Jwt-Assertion': token }), cfg, {
      getAccessKey,
    });
    expect(session.member).toEqual({ id: 'yururi', displayName: 'ゆるり' });
    expect(session.householdId).toBe('main');
    const secret = new TextEncoder().encode(cfg.supabaseJwtSecret);
    const { payload } = await jwtVerify(session.supabaseJwt, secret);
    expect(payload.member_id).toBe('yururi');
  });

  it('token 無し + devBypassEmail でセッション発行 (getAccessKey は呼ばれない)', async () => {
    let called = false;
    const session = await createSession(requestWith({}), cfg, {
      getAccessKey: () => {
        called = true;
        return keyResolver;
      },
      devBypassEmail: 'shiyowo@example.com',
    });
    expect(called).toBe(false);
    expect(session.member.id).toBe('shiyowo');
  });

  it('token 無し + bypass 無しは SessionError(403)', async () => {
    await expect(createSession(requestWith({}), cfg, { getAccessKey })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('未登録 email は拒否', async () => {
    const token = await signAccessToken('stranger@example.com');
    await expect(
      createSession(requestWith({ 'Cf-Access-Jwt-Assertion': token }), cfg, { getAccessKey }),
    ).rejects.toBeInstanceOf(SessionError);
  });
});
