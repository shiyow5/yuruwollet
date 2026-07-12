import { createRemoteJWKSet } from 'jose';
import {
  createSession,
  SessionError,
  type Member,
  type SessionConfig,
} from '../../src/lib/auth/session';

interface Env {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  SUPABASE_URL?: string;
  SUPABASE_JWT_SECRET?: string;
  EMAIL_YURURI?: string;
  EMAIL_SHIYOWO?: string;
  /** ローカル / CI のみ: Access ヘッダが無い時にこの email を信頼する */
  DEV_BYPASS_EMAIL?: string;
  SESSION_TTL_SECONDS?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

const HOUSEHOLD_ID = 'main';
const DEFAULT_TTL_SECONDS = 2700; // 45 分

function buildMembers(env: Env): Record<string, Member> {
  const members: Record<string, Member> = {};
  if (env.EMAIL_YURURI) {
    members[env.EMAIL_YURURI.toLowerCase()] = {
      memberId: 'yururi',
      householdId: HOUSEHOLD_ID,
      displayName: 'ゆるり',
    };
  }
  if (env.EMAIL_SHIYOWO) {
    members[env.EMAIL_SHIYOWO.toLowerCase()] = {
      memberId: 'shiyowo',
      householdId: HOUSEHOLD_ID,
      displayName: 'しよを',
    };
  }
  return members;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/** GET /api/session — Access JWT を検証し Supabase JWT を発行 */
export const onRequest = async (context: PagesContext): Promise<Response> => {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return json(405, { error: 'method not allowed' });
  }

  try {
    if (!env.SUPABASE_JWT_SECRET || !env.SUPABASE_URL) {
      throw new SessionError('server not configured', 500);
    }

    const cfg: SessionConfig = {
      accessAud: env.ACCESS_AUD ?? '',
      accessIssuer: env.ACCESS_TEAM_DOMAIN ?? '',
      supabaseJwtSecret: env.SUPABASE_JWT_SECRET,
      supabaseIssuer: `${env.SUPABASE_URL}/auth/v1`,
      members: buildMembers(env),
      ttlSeconds: env.SESSION_TTL_SECONDS ? Number(env.SESSION_TTL_SECONDS) : DEFAULT_TTL_SECONDS,
    };

    const session = await createSession(request, cfg, {
      // JWKS の取得は Access token がある時だけ遅延評価される (dev bypass 時は呼ばれない)
      getAccessKey: () =>
        createRemoteJWKSet(new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`)),
      devBypassEmail: env.DEV_BYPASS_EMAIL,
    });

    return json(200, {
      supabase_jwt: session.supabaseJwt,
      expires_at: session.expiresAt,
      member: session.member,
      household_id: session.householdId,
    });
  } catch (err) {
    const status = err instanceof SessionError ? err.status : 403;
    return json(status, { error: status >= 500 ? 'server error' : 'forbidden' });
  }
};
