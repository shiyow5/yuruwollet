import { describe, expect, it } from 'vitest';
import {
  listProfiles,
  getMemberBalances,
  getMonthlySummary,
  getCategoryBreakdown,
} from './aggregates';
import { makeSupabaseMock, argsOf } from '../../test/supabaseMock';
import type { MemberBalance, MonthlySummary } from '../ledger/types';

describe('listProfiles', () => {
  it('member_id 昇順で取得', async () => {
    const rows = [{ member_id: 'shiyowo' }, { member_id: 'yururi' }];
    const { client, queries } = makeSupabaseMock({ profiles: { data: rows, error: null } });
    const result = await listProfiles(client);
    expect(result).toEqual(rows);
    expect(argsOf(queries.profiles, 'order')).toEqual(['member_id', { ascending: true }]);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({ profiles: { data: null, error: { message: 'e' } } });
    await expect(listProfiles(client)).rejects.toThrow(/e/);
  });
});

describe('getMemberBalances', () => {
  it('残高ビューを取得', async () => {
    const rows: MemberBalance[] = [
      { household_id: 'main', member_id: 'yururi', display_name: 'ゆるり', balance: 342500 },
    ];
    const { client } = makeSupabaseMock({ v_member_balances: { data: rows, error: null } });
    expect(await getMemberBalances(client)).toEqual(rows);
  });

  it('null は空配列', async () => {
    const { client } = makeSupabaseMock({ v_member_balances: { data: null, error: null } });
    expect(await getMemberBalances(client)).toEqual([]);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      v_member_balances: { data: null, error: { message: 'b' } },
    });
    await expect(getMemberBalances(client)).rejects.toThrow(/b/);
  });
});

describe('getMonthlySummary', () => {
  it('member×月 で single 取得', async () => {
    const summary: MonthlySummary = {
      household_id: 'main',
      member_id: 'yururi',
      month: '2026-07-01',
      income: 450000,
      expense: 107500,
      net: 342500,
    };
    const { client, queries } = makeSupabaseMock({
      v_monthly_summary: { data: summary, error: null },
    });
    const result = await getMonthlySummary(client, 'yururi', '2026-07-01');
    expect(result).toEqual(summary);
    const eqCalls = queries.v_monthly_summary.calls.filter((c) => c.method === 'eq');
    expect(eqCalls.map((c) => c.args)).toEqual([
      ['member_id', 'yururi'],
      ['month', '2026-07-01'],
    ]);
    expect(queries.v_monthly_summary.calls.some((c) => c.method === 'maybeSingle')).toBe(true);
  });

  it('該当なしは null をそのまま返す', async () => {
    const { client } = makeSupabaseMock({ v_monthly_summary: { data: null, error: null } });
    expect(await getMonthlySummary(client, 'yururi', '2026-07-01')).toBeNull();
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      v_monthly_summary: { data: null, error: { message: 'ms' } },
    });
    await expect(getMonthlySummary(client, 'yururi', '2026-07-01')).rejects.toThrow(/ms/);
  });
});

describe('getCategoryBreakdown', () => {
  it('member×月 で取得', async () => {
    const rows = [
      {
        household_id: 'main',
        member_id: 'yururi',
        month: '2026-07-01',
        category_id: 'c1',
        category_name: '食費',
        category_icon: 'restaurant',
        type: 'expense' as const,
        total: 42000,
      },
    ];
    const { client, queries } = makeSupabaseMock({
      v_category_breakdown: { data: rows, error: null },
    });
    const result = await getCategoryBreakdown(client, 'yururi', '2026-07-01');
    expect(result).toEqual(rows);
    const eqCalls = queries.v_category_breakdown.calls.filter((c) => c.method === 'eq');
    expect(eqCalls.map((c) => c.args)).toEqual([
      ['member_id', 'yururi'],
      ['month', '2026-07-01'],
    ]);
  });

  it('error は投げる', async () => {
    const { client } = makeSupabaseMock({
      v_category_breakdown: { data: null, error: { message: 'cb' } },
    });
    await expect(getCategoryBreakdown(client, 'yururi', '2026-07-01')).rejects.toThrow(/cb/);
  });
});
