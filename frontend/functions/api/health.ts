export interface HealthPayload {
  status: 'ok';
  service: 'yuruwollet';
}

export function buildHealth(): HealthPayload {
  return { status: 'ok', service: 'yuruwollet' };
}

/**
 * Cloudflare Pages Function: `GET /api/health`
 * Phase 2 で @cloudflare/workers-types による厳密な型付け + Access 検証に発展させる。
 */
export const onRequest = (): Response =>
  new Response(JSON.stringify(buildHealth()), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
