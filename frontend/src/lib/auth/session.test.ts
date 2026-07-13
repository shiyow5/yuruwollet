// @vitest-environment node
import { describe, expect, it, beforeAll } from 'vitest';
import { SignJWT, jwtVerify, generateKeyPair, exportJWK } from 'jose';
import {
  extractAccessToken,
  verifyAccessEmail,
  mapEmailToMember,
  mintSupabaseJwt,
  resolveSigningKey,
  createSession,
  isAccessConfigured,
  SessionError,
  type SessionConfig,
  type SigningKey,
} from './session';

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

const members = {
  'yururi@example.com': { memberId: 'yururi', householdId: 'main', displayName: 'ゆるり' },
  'shiyowo@example.com': { memberId: 'shiyowo', householdId: 'main', displayName: 'しよを' },
};

const HS256_SECRET = 'test-secret-at-least-32-characters-long-xxxx';

const cfg: SessionConfig = {
  accessAud: 'test-aud-tag',
  accessIssuer: 'https://team.cloudflareaccess.com',
  signingKey: { alg: 'HS256', key: new TextEncoder().encode(HS256_SECRET) },
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

describe('resolveSigningKey', () => {
  it('SUPABASE_JWT_SECRET から HS256 を解決', async () => {
    const sk = await resolveSigningKey({ jwtSecret: HS256_SECRET });
    expect(sk.alg).toBe('HS256');
  });
  it('ES256 秘密 JWK から ES256 を解決 (kid 付き)', async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(privateKey)), alg: 'ES256', kid: 'kid-123' };
    const sk = await resolveSigningKey({ signingKeyJwk: JSON.stringify(jwk) });
    expect(sk.alg).toBe('ES256');
    expect(sk.kid).toBe('kid-123');
  });
  it('どちらも無ければ SessionError(500)', async () => {
    await expect(resolveSigningKey({})).rejects.toMatchObject({ status: 500 });
  });
});

describe('mintSupabaseJwt', () => {
  it('HS256: Supabase が期待するクレームで署名される', async () => {
    const { token, expiresAt } = await mintSupabaseJwt(members['yururi@example.com'], cfg);
    const { payload } = await jwtVerify(token, new TextEncoder().encode(HS256_SECRET), {
      audience: 'authenticated',
    });
    expect(payload.role).toBe('authenticated');
    expect(payload.household_id).toBe('main');
    expect(payload.member_id).toBe('yururi');
    expect(payload.sub).toBe('yururi');
    expect(payload.iss).toBe(cfg.supabaseIssuer);
    expect(payload.exp).toBe(expiresAt);
  });

  it('ES256: 公開鍵で検証でき kid ヘッダを含む', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(privateKey)), alg: 'ES256', kid: 'kid-xyz' };
    const signingKey: SigningKey = await resolveSigningKey({ signingKeyJwk: JSON.stringify(jwk) });
    const { token } = await mintSupabaseJwt(members['shiyowo@example.com'], { ...cfg, signingKey });
    const { payload, protectedHeader } = await jwtVerify(token, publicKey);
    expect(protectedHeader.alg).toBe('ES256');
    expect(protectedHeader.kid).toBe('kid-xyz');
    expect(payload.member_id).toBe('shiyowo');
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
    const { payload } = await jwtVerify(
      session.supabaseJwt,
      new TextEncoder().encode(HS256_SECRET),
    );
    expect(payload.member_id).toBe('yururi');
  });

  // ローカル/CI は ACCESS_AUD / ACCESS_TEAM_DOMAIN が未設定 → '' になる
  const devCfg: SessionConfig = { ...cfg, accessAud: '', accessIssuer: '' };

  it('token 無し + devBypassEmail でセッション発行 (getAccessKey は呼ばれない)', async () => {
    let called = false;
    const session = await createSession(requestWith({}), devCfg, {
      getAccessKey: () => {
        called = true;
        return keyResolver;
      },
      devBypassEmail: 'shiyowo@example.com',
    });
    expect(called).toBe(false);
    expect(session.member.id).toBe('shiyowo');
  });

  // バイパスは「Access ヘッダが無いリクエストをそのまま信頼する」ものなので、
  // 本番で DEV_BYPASS_EMAIL を消し忘れると、Access を迂回できる経路
  // （Access の対象外になっている *.pages.dev など）から誰でもログインできてしまう。
  // 「消し忘れないこと」に頼らず、Access が設定されていたら構造的に効かないようにする。
  it('Access が設定されていれば devBypassEmail は効かない（本番での消し忘れを無害化）', async () => {
    await expect(
      createSession(requestWith({}), cfg, {
        getAccessKey,
        devBypassEmail: 'shiyowo@example.com',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('isAccessConfigured は AUD と team domain の両方が揃ったときだけ true', () => {
    expect(isAccessConfigured(cfg)).toBe(true);
    expect(isAccessConfigured(devCfg)).toBe(false);
    expect(isAccessConfigured({ accessAud: 'aud', accessIssuer: '' })).toBe(false);
    expect(isAccessConfigured({ accessAud: '', accessIssuer: 'https://x' })).toBe(false);
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
