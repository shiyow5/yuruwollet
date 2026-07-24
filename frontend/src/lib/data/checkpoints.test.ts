import { describe, expect, it } from 'vitest';
import {
  getCurrentCheckpoint,
  skipCheckpoint,
  confirmCheckpoint,
  adjustBalanceNow,
} from './checkpoints';
import { makeSupabaseMock, argsOf } from '../../test/supabaseMock';
import type { Checkpoint } from '../wall/types';

function cp(over: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: 'cp1',
    household_id: 'main',
    member_id: 'yururi',
    checkpoint_month: '2026-07-01',
    actual: 50000,
    computed: 45000,
    diff: 5000,
    status: 'confirmed',
    created_at: '2026-07-24T01:00:00Z',
    updated_at: '2026-07-24T01:00:00Z',
    ...over,
  };
}

describe('getCurrentCheckpoint', () => {
  it('member×月 で取得', async () => {
    const row = cp();
    const { client, queries } = makeSupabaseMock({
      balance_checkpoints: { data: row, error: null },
    });
    expect(await getCurrentCheckpoint(client, 'yururi', '2026-07-01')).toEqual(row);
    const eqCalls = queries.balance_checkpoints.calls.filter((c) => c.method === 'eq');
    expect(eqCalls.map((c) => c.args)).toEqual([
      ['member_id', 'yururi'],
      ['checkpoint_month', '2026-07-01'],
    ]);
    expect(queries.balance_checkpoints.calls.some((c) => c.method === 'maybeSingle')).toBe(true);
  });

  it('無ければ null', async () => {
    const { client } = makeSupabaseMock({ balance_checkpoints: { data: null, error: null } });
    expect(await getCurrentCheckpoint(client, 'yururi', '2026-07-01')).toBeNull();
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      balance_checkpoints: { data: null, error: { message: 'boom' } },
    });
    await expect(getCurrentCheckpoint(client, 'yururi', '2026-07-01')).rejects.toThrow(/boom/);
  });
});

describe('skipCheckpoint', () => {
  it('status=skipped を onConflict 付きで upsert', async () => {
    const { client, queries } = makeSupabaseMock({
      balance_checkpoints: { data: null, error: null },
    });
    await skipCheckpoint(client, {
      householdId: 'main',
      memberId: 'yururi',
      month: '2026-07-01',
    });
    const args = argsOf(queries.balance_checkpoints, 'upsert');
    expect(args?.[0]).toEqual({
      household_id: 'main',
      member_id: 'yururi',
      checkpoint_month: '2026-07-01',
      status: 'skipped',
    });
    expect(args?.[1]).toEqual({ onConflict: 'household_id,member_id,checkpoint_month' });
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      balance_checkpoints: { data: null, error: { message: 'rls' } },
    });
    await expect(
      skipCheckpoint(client, { householdId: 'main', memberId: 'yururi', month: '2026-07-01' }),
    ).rejects.toThrow(/rls/);
  });
});

describe('confirmCheckpoint', () => {
  it('実際の残高と「ユーザーが見た計算残高」の両方を RPC に渡す', async () => {
    const row = cp();
    const { client, rpcs } = makeSupabaseMock(
      {},
      { confirm_balance_checkpoint: { data: row, error: null } },
    );
    expect(await confirmCheckpoint(client, { actual: 50000, expectedComputed: 45000 })).toEqual(
      row,
    );
    expect(rpcs.confirm_balance_checkpoint.calls[0]).toEqual({
      method: 'rpc',
      args: ['confirm_balance_checkpoint', { p_actual: 50000, p_expected_computed: 45000 }],
    });
  });

  it.each([
    ['PT403', 'not_open'],
    ['PT409', 'already_confirmed'],
    ['PT412', 'stale'],
    ['P0001', 'unknown'],
  ])('SQLSTATE %s を種別 %s の ConfirmCheckpointError にする', async (code, kind) => {
    const { client } = makeSupabaseMock(
      {},
      { confirm_balance_checkpoint: { data: null, error: { message: 'nope', code } } },
    );
    await expect(
      confirmCheckpoint(client, { actual: 50000, expectedComputed: 45000 }),
    ).rejects.toMatchObject({ kind, name: 'ConfirmCheckpointError' });
  });
});

describe('adjustBalanceNow（#99）', () => {
  it('actual と expectedComputed を adjust_balance_now RPC に渡し、差額を返す', async () => {
    const { client, rpcs } = makeSupabaseMock(
      {},
      { adjust_balance_now: { data: 5000, error: null } },
    );
    expect(await adjustBalanceNow(client, { actual: 50000, expectedComputed: 45000 })).toBe(5000);
    expect(rpcs.adjust_balance_now.calls[0]).toEqual({
      method: 'rpc',
      args: ['adjust_balance_now', { p_actual: 50000, p_expected_computed: 45000 }],
    });
  });

  it('差額 0 でも 0 を返す（取引は挿入されない）', async () => {
    const { client } = makeSupabaseMock({}, { adjust_balance_now: { data: 0, error: null } });
    expect(await adjustBalanceNow(client, { actual: 45000, expectedComputed: 45000 })).toBe(0);
  });

  it.each([
    ['PT412', 'stale'],
    ['PT400', 'unknown'],
    ['P0001', 'unknown'],
  ])('SQLSTATE %s を種別 %s の ConfirmCheckpointError にする', async (code, kind) => {
    const { client } = makeSupabaseMock(
      {},
      { adjust_balance_now: { data: null, error: { message: 'nope', code } } },
    );
    await expect(
      adjustBalanceNow(client, { actual: 50000, expectedComputed: 45000 }),
    ).rejects.toMatchObject({ kind, name: 'ConfirmCheckpointError' });
  });
});
