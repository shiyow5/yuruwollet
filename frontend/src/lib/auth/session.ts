import { SignJWT, jwtVerify, type JWTVerifyGetKey } from 'jose';

/** Access で認証された 1 メンバー (ゆるり / しよを) */
export interface Member {
  memberId: string;
  householdId: string;
  displayName: string;
}

export interface SessionConfig {
  /** Cloudflare Access Application Audience (AUD) タグ */
  accessAud: string;
  /** Access の issuer (team domain) */
  accessIssuer: string;
  /** Supabase JWT の署名鍵 (ローカル/HS256)。本番は署名鍵に差し替え */
  supabaseJwtSecret: string;
  /** 発行 JWT の iss (例: https://<ref>.supabase.co/auth/v1) */
  supabaseIssuer: string;
  /** email(小文字) → Member の写像 */
  members: Record<string, Member>;
  /** 発行 JWT の有効期間 (秒) */
  ttlSeconds: number;
}

export interface SessionResult {
  supabaseJwt: string;
  expiresAt: number;
  member: { id: string; displayName: string };
  householdId: string;
}

/** jose の jwtVerify に渡す鍵リゾルバ (本番は createRemoteJWKSet, テストは公開鍵を返す関数) */
export type AccessKey = JWTVerifyGetKey;

/** ステータスコードを持つ想定内エラー */
export class SessionError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = 'SessionError';
    this.status = status;
  }
}

/** リクエストから Access JWT を取り出す (ヘッダ優先, Cookie フォールバック) */
export function extractAccessToken(request: Request): string | null {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie');
  if (cookie) {
    const match = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

/** Access JWT を検証して email クレームを取り出す (小文字化) */
export async function verifyAccessEmail(
  token: string,
  key: AccessKey,
  cfg: Pick<SessionConfig, 'accessAud' | 'accessIssuer'>,
): Promise<string> {
  const { payload } = await jwtVerify(token, key, {
    audience: cfg.accessAud,
    issuer: cfg.accessIssuer,
  });
  const email = typeof payload.email === 'string' ? payload.email : undefined;
  if (!email) {
    throw new SessionError('access token has no email claim');
  }
  return email.toLowerCase();
}

/** email から Member を引く (未登録は 403) */
export function mapEmailToMember(email: string, members: Record<string, Member>): Member {
  const member = members[email.toLowerCase()];
  if (!member) {
    throw new SessionError('unknown member email');
  }
  return member;
}

/** Member 向けの短命 Supabase JWT を発行 (HS256) */
export async function mintSupabaseJwt(
  member: Member,
  cfg: Pick<SessionConfig, 'supabaseJwtSecret' | 'supabaseIssuer' | 'ttlSeconds'>,
): Promise<{ token: string; expiresAt: number }> {
  const secret = new TextEncoder().encode(cfg.supabaseJwtSecret);
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + cfg.ttlSeconds;
  const token = await new SignJWT({
    role: 'authenticated',
    household_id: member.householdId,
    member_id: member.memberId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(member.memberId)
    .setAudience('authenticated')
    .setIssuer(cfg.supabaseIssuer)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(secret);
  return { token, expiresAt };
}

/**
 * リクエストからセッションを生成する。
 * Access JWT があれば検証、無ければ devBypassEmail(ローカル/CI) を使用。
 */
export async function createSession(
  request: Request,
  cfg: SessionConfig,
  opts: { getAccessKey: () => AccessKey; devBypassEmail?: string },
): Promise<SessionResult> {
  const token = extractAccessToken(request);
  let email: string;
  if (token) {
    email = await verifyAccessEmail(token, opts.getAccessKey(), cfg);
  } else if (opts.devBypassEmail) {
    email = opts.devBypassEmail.toLowerCase();
  } else {
    throw new SessionError('missing Access token');
  }

  const member = mapEmailToMember(email, cfg.members);
  const { token: supabaseJwt, expiresAt } = await mintSupabaseJwt(member, cfg);
  return {
    supabaseJwt,
    expiresAt,
    member: { id: member.memberId, displayName: member.displayName },
    householdId: member.householdId,
  };
}
