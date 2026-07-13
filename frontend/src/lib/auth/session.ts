import { SignJWT, jwtVerify, importJWK, type JWTVerifyGetKey, type KeyLike, type JWK } from 'jose';
import { isDisplayableAvatarUrl } from '../avatar';

/** Access で認証された 1 メンバー (ゆるり / しよを) */
export interface Member {
  memberId: string;
  householdId: string;
  displayName: string;
}

/** Supabase JWT の署名資格。ES256(新規プロジェクトの signing key) または HS256(旧 JWT secret) */
export interface SigningKey {
  alg: 'ES256' | 'HS256';
  /** HS256: 秘密のバイト列 / ES256: インポート済み秘密鍵 */
  key: KeyLike | Uint8Array;
  /** ES256 の場合、Supabase JWKS と突き合わせる kid */
  kid?: string;
}

export interface SessionConfig {
  /** Cloudflare Access Application Audience (AUD) タグ */
  accessAud: string;
  /** Access の issuer (team domain) */
  accessIssuer: string;
  /** Supabase JWT の署名資格 */
  signingKey: SigningKey;
  /** 発行 JWT の iss (例: https://<ref>.supabase.co/auth/v1) */
  supabaseIssuer: string;
  /** email(小文字) → Member の写像 */
  members: Record<string, Member>;
  /** 発行 JWT の有効期間 (秒) */
  ttlSeconds: number;
}

/**
 * env から署名資格を解決する。
 * SUPABASE_SIGNING_KEY(ES256 秘密 JWK JSON) を優先し、無ければ SUPABASE_JWT_SECRET(HS256)。
 * どちらも無ければ 500。
 */
export async function resolveSigningKey(opts: {
  signingKeyJwk?: string;
  jwtSecret?: string;
}): Promise<SigningKey> {
  if (opts.signingKeyJwk) {
    const jwk = JSON.parse(opts.signingKeyJwk) as JWK;
    const key = await importJWK(jwk, jwk.alg ?? 'ES256');
    return { alg: 'ES256', key, kid: jwk.kid };
  }
  if (opts.jwtSecret) {
    return { alg: 'HS256', key: new TextEncoder().encode(opts.jwtSecret) };
  }
  throw new SessionError('no supabase signing credential configured', 500);
}

export interface SessionResult {
  supabaseJwt: string;
  expiresAt: number;
  /** avatarUrl は **任意**。Access の picture クレームは best-effort で届かないことがある */
  member: { id: string; displayName: string; avatarUrl?: string };
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

/** Access JWT から取り出す本人情報 */
export interface AccessIdentity {
  /** 小文字化した email。認証の主キー */
  email: string;
  /** Google のプロフィール画像。**無いことの方が普通**（下記） */
  avatarUrl?: string;
}

/**
 * Access JWT の `custom.picture` から画像 URL を取り出す。
 *
 * Cloudflare は custom クレームの配送を **"on a best-effort basis"** と明記している
 * （届かないことがある）。**無い経路が通常経路**として扱うこと。
 * https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/application-token/
 *
 * `<img src>` に流すので、許可した URL だけを通す（判定は lib/avatar.ts と共有する。
 * 許可リストが 2 箇所にあると必ずズレる）。
 */
export function extractAvatarUrl(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const custom = (payload as { custom?: unknown }).custom;
  if (typeof custom !== 'object' || custom === null) return undefined;
  const picture = (custom as { picture?: unknown }).picture;
  return isDisplayableAvatarUrl(picture) ? picture : undefined;
}

/**
 * Access JWT を検証して本人情報を取り出す。
 *
 * email だけでなく画像も返すのは、JWT を 2 回検証しないため
 * （payload を関数内に閉じ込めると、picture を取るのに再検証が必要になる）。
 */
export async function verifyAccessIdentity(
  token: string,
  key: AccessKey,
  cfg: Pick<SessionConfig, 'accessAud' | 'accessIssuer'>,
): Promise<AccessIdentity> {
  const { payload } = await jwtVerify(token, key, {
    audience: cfg.accessAud,
    issuer: cfg.accessIssuer,
  });
  const email = typeof payload.email === 'string' ? payload.email : undefined;
  if (!email) {
    throw new SessionError('access token has no email claim');
  }
  return { email: email.toLowerCase(), avatarUrl: extractAvatarUrl(payload) };
}

/** email から Member を引く (未登録は 403) */
export function mapEmailToMember(email: string, members: Record<string, Member>): Member {
  const member = members[email.toLowerCase()];
  if (!member) {
    throw new SessionError('unknown member email');
  }
  return member;
}

/** Member 向けの短命 Supabase JWT を発行 (ES256 / HS256) */
export async function mintSupabaseJwt(
  member: Member,
  cfg: Pick<SessionConfig, 'signingKey' | 'supabaseIssuer' | 'ttlSeconds'>,
): Promise<{ token: string; expiresAt: number }> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + cfg.ttlSeconds;
  const header: { alg: string; typ: string; kid?: string } = {
    alg: cfg.signingKey.alg,
    typ: 'JWT',
  };
  if (cfg.signingKey.kid) {
    header.kid = cfg.signingKey.kid;
  }
  const token = await new SignJWT({
    role: 'authenticated',
    household_id: member.householdId,
    member_id: member.memberId,
  })
    .setProtectedHeader(header)
    .setSubject(member.memberId)
    .setAudience('authenticated')
    .setIssuer(cfg.supabaseIssuer)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(cfg.signingKey.key);
  return { token, expiresAt };
}

/** Access の設定状態。 */
export type AccessMode =
  /** AUD と team domain が揃っている = 本番。Access token を必須にする。 */
  | 'enforced'
  /** どちらも無い = ローカル/CI。dev バイパスを許す。 */
  | 'unconfigured'
  /** 片方だけある = 設定ミス。**判断できないので拒否する**。 */
  | 'partial';

/**
 * Access の設定状態を判定する。
 *
 * dev バイパスは「Access ヘッダが無いリクエストをそのまま信頼する」ものなので、
 * 本番で DEV_BYPASS_EMAIL が残っていると、Access を迂回して到達できる経路
 * （例: Access の対象外になっている `*.pages.dev`）から**誰でもログインできてしまう**。
 *
 * ここで **片方だけ設定されている状態を 'unconfigured' に倒してはいけない**。
 * 本番の環境変数は「Access を作ってから後で入れる」ため、AUD だけ入れて team domain を
 * 入れ忘れた瞬間や、片方を打ち間違えた瞬間に、バイパスが生き返ってしまう。
 * 中途半端な設定は**設定ミスとして拒否する**（fail closed）。
 */
export function accessMode(cfg: Pick<SessionConfig, 'accessAud' | 'accessIssuer'>): AccessMode {
  const hasAud = cfg.accessAud !== '';
  const hasIssuer = cfg.accessIssuer !== '';
  if (hasAud && hasIssuer) return 'enforced';
  if (!hasAud && !hasIssuer) return 'unconfigured';
  return 'partial';
}

/**
 * リクエストからセッションを生成する。
 * Access JWT があれば検証、無ければ devBypassEmail(Access 未設定のときのみ) を使用。
 */
export async function createSession(
  request: Request,
  cfg: SessionConfig,
  opts: { getAccessKey: () => AccessKey; devBypassEmail?: string },
): Promise<SessionResult> {
  const mode = accessMode(cfg);
  if (mode === 'partial') {
    // 片方だけ設定されている = 本番のつもりで設定を誤っている可能性が高い。
    // バイパスを許すと認証が丸ごと外れるので、何もせず落とす。
    throw new SessionError('incomplete Access configuration', 500);
  }

  const token = extractAccessToken(request);
  // Access を設定した環境ではバイパスを無効化する（本番での消し忘れを無害にする）
  const bypass = mode === 'unconfigured' ? opts.devBypassEmail : undefined;

  let identity: AccessIdentity;
  if (token) {
    identity = await verifyAccessIdentity(token, opts.getAccessKey(), cfg);
  } else if (bypass) {
    // dev バイパスには JWT が無い → 画像も無い（ローカルは常に頭文字表示になる。これが正常）
    identity = { email: bypass.toLowerCase() };
  } else {
    throw new SessionError('missing Access token');
  }

  const member = mapEmailToMember(identity.email, cfg.members);
  const { token: supabaseJwt, expiresAt } = await mintSupabaseJwt(member, cfg);
  return {
    supabaseJwt,
    expiresAt,
    member: {
      id: member.memberId,
      displayName: member.displayName,
      // 画像が無くてもセッションは有効。認証には一切影響しない
      ...(identity.avatarUrl ? { avatarUrl: identity.avatarUrl } : {}),
    },
    householdId: member.householdId,
  };
}
