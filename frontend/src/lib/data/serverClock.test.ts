import { describe, expect, it } from 'vitest';
import { getServerToday } from './serverClock';
import { makeSupabaseMock } from '../../test/supabaseMock';

describe('getServerToday', () => {
  it('jst_today RPC の日付を返す', async () => {
    const { client, rpcs } = makeSupabaseMock(
      {},
      { jst_today: { data: '2026-07-24', error: null } },
    );
    expect(await getServerToday(client)).toBe('2026-07-24');
    expect(rpcs.jst_today.calls[0].args[0]).toBe('jst_today');
  });

  it('error は投げる（端末時計へフォールバックする判断は呼び出し側）', async () => {
    const { client } = makeSupabaseMock(
      {},
      { jst_today: { data: null, error: { message: 'down' } } },
    );
    await expect(getServerToday(client)).rejects.toThrow(/down/);
  });
});
