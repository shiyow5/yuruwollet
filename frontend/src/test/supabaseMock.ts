import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/database.types';

export interface QueryResult {
  data: unknown;
  /** code は PostgREST が返す SQLSTATE（RPC の拒否理由の判別に使う）。 */
  error: { message: string; code?: string } | null;
}

export interface RecordedCall {
  method: string;
  args: unknown[];
}

export interface MockQuery {
  calls: RecordedCall[];
  result: QueryResult;
}

const CHAIN_METHODS = [
  'select',
  'insert',
  'update',
  'delete',
  'upsert',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'is',
  'match',
  'filter',
  'contains',
  'order',
  'limit',
  'range',
];
const TERMINAL_METHODS = ['single', 'maybeSingle'];

/**
 * supabase-js の fluent クエリビルダを模した最小モック。
 * - すべてのチェーンメソッドは同じビルダを返し、呼び出しを calls に記録する。
 * - ビルダは thenable なので `await` すると設定済みの result に解決する。
 * - queries[table] から呼び出し履歴を検証できる。
 */
export function makeSupabaseMock(
  resultByTable: Record<string, QueryResult>,
  rpcByName: Record<string, QueryResult> = {},
): {
  client: SupabaseClient<Database>;
  queries: Record<string, MockQuery>;
  rpcs: Record<string, MockQuery>;
} {
  const queries: Record<string, MockQuery> = {};
  const rpcs: Record<string, MockQuery> = {};

  function makeBuilder(result: QueryResult, into: MockQuery): Record<string, unknown> {
    const builder: Record<string, unknown> = {
      then: (resolve: (v: QueryResult) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    for (const m of [...CHAIN_METHODS, ...TERMINAL_METHODS]) {
      builder[m] = (...args: unknown[]) => {
        into.calls.push({ method: m, args });
        return builder;
      };
    }
    return builder;
  }

  const client = {
    from: (table: string) => {
      const result = resultByTable[table] ?? { data: null, error: null };
      const q: MockQuery = { calls: [], result };
      queries[table] = q;
      return makeBuilder(result, q);
    },
    rpc: (name: string, args?: unknown) => {
      const result = rpcByName[name] ?? { data: null, error: null };
      const q: MockQuery = { calls: [{ method: 'rpc', args: [name, args] }], result };
      rpcs[name] = q;
      return makeBuilder(result, q);
    },
  } as unknown as SupabaseClient<Database>;

  return { client, queries, rpcs };
}

/** queries[table].calls から特定メソッドの最初の呼び出し引数を取り出す（テスト補助）。 */
export function argsOf(q: MockQuery, method: string): unknown[] | undefined {
  return q.calls.find((c) => c.method === method)?.args;
}
