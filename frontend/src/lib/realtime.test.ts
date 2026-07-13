import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { subscribeToTable, REALTIME_AUTH_REFRESH_MS } from './realtime';
import type { Database } from './database.types';

type Handler = (payload: unknown) => void;
type StatusCb = (status: string) => void;

function makeRealtimeMock() {
  const calls = {
    setAuth: [] as unknown[],
    channelTopics: [] as string[],
    onArgs: [] as unknown[],
    removed: [] as unknown[],
  };
  let handler: Handler | null = null;
  let statusCb: StatusCb | null = null;

  const channel = {
    on: (event: string, filter: unknown, h: Handler) => {
      calls.onArgs.push({ event, filter });
      handler = h;
      return channel;
    },
    subscribe: (cb: StatusCb) => {
      statusCb = cb;
      return channel;
    },
  };

  const client = {
    realtime: {
      setAuth: vi.fn(async (token?: string) => {
        calls.setAuth.push(token);
      }),
    },
    channel: (topic: string) => {
      calls.channelTopics.push(topic);
      return channel;
    },
    removeChannel: vi.fn((c: unknown) => {
      calls.removed.push(c);
    }),
  } as unknown as SupabaseClient<Database>;

  return {
    client,
    calls,
    emitChange: () => handler?.({}),
    emitStatus: (s: string) => statusCb?.(s),
  };
}

describe('subscribeToTable', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('household でフィルタしたチャンネルを購読する', async () => {
    const rt = makeRealtimeMock();
    const onChange = vi.fn();
    const onStatus = vi.fn();
    subscribeToTable(rt.client, {
      table: 'wishlist_items',
      householdId: 'main',
      onChange,
      onStatus,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(rt.calls.channelTopics).toEqual(['wishlist_items:main']);
    expect(rt.calls.onArgs[0]).toEqual({
      event: 'postgres_changes',
      filter: {
        event: '*',
        schema: 'public',
        table: 'wishlist_items',
        filter: 'household_id=eq.main',
      },
    });
  });

  // supabase-js は初期化時に setAuth(token) を明示トークンで呼ぶため、
  // 以後チャンネルは再認証をスキップし続ける。引数なしで呼び直してコールバック方式に戻す。
  it('購読前に引数なしの setAuth() でコールバック方式に戻す', async () => {
    const rt = makeRealtimeMock();
    subscribeToTable(rt.client, {
      table: 'wishlist_items',
      householdId: 'main',
      onChange: vi.fn(),
      onStatus: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(rt.client.realtime.setAuth).toHaveBeenCalledTimes(1);
    expect(rt.calls.setAuth).toEqual([undefined]); // 明示トークンを渡さない
  });

  // 発行 JWT は TTL 45 分。放置すると realtime だけ静かに失効する。
  it('JWT の失効前に定期的に再認証する', async () => {
    const rt = makeRealtimeMock();
    subscribeToTable(rt.client, {
      table: 'wishlist_items',
      householdId: 'main',
      onChange: vi.fn(),
      onStatus: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(rt.client.realtime.setAuth).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(REALTIME_AUTH_REFRESH_MS);
    expect(rt.client.realtime.setAuth).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(REALTIME_AUTH_REFRESH_MS);
    expect(rt.client.realtime.setAuth).toHaveBeenCalledTimes(3);
  });

  it('再認証の間隔は JWT の TTL(45分) より十分短い', () => {
    expect(REALTIME_AUTH_REFRESH_MS).toBeLessThan(45 * 60 * 1000);
  });

  it('変更イベントで onChange を呼ぶ', async () => {
    const rt = makeRealtimeMock();
    const onChange = vi.fn();
    subscribeToTable(rt.client, {
      table: 'wishlist_items',
      householdId: 'main',
      onChange,
      onStatus: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(0);

    rt.emitChange();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  // 切断中の変更はイベントとして届かない → 購読確立のたびに取り直す
  it('購読が確立したら connected にし、取りこぼし防止のため onChange も呼ぶ', async () => {
    const rt = makeRealtimeMock();
    const onChange = vi.fn();
    const onStatus = vi.fn();
    subscribeToTable(rt.client, {
      table: 'wishlist_items',
      householdId: 'main',
      onChange,
      onStatus,
    });
    await vi.advanceTimersByTimeAsync(0);

    rt.emitStatus('SUBSCRIBED');
    expect(onStatus).toHaveBeenCalledWith('connected');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])('%s は error 状態にする', async (status) => {
    const rt = makeRealtimeMock();
    const onStatus = vi.fn();
    subscribeToTable(rt.client, {
      table: 'wishlist_items',
      householdId: 'main',
      onChange: vi.fn(),
      onStatus,
    });
    await vi.advanceTimersByTimeAsync(0);

    rt.emitStatus(status);
    expect(onStatus).toHaveBeenCalledWith('error');
  });

  it('解除するとチャンネルを閉じ、再認証タイマーも止める', async () => {
    const rt = makeRealtimeMock();
    const onChange = vi.fn();
    const stop = subscribeToTable(rt.client, {
      table: 'wishlist_items',
      householdId: 'main',
      onChange,
      onStatus: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(0);

    stop();
    expect(rt.client.removeChannel).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(REALTIME_AUTH_REFRESH_MS * 3);
    expect(rt.client.realtime.setAuth).toHaveBeenCalledTimes(1); // 初回のみ
  });

  // 購読確立前に解除された場合、チャンネルを作りっぱなしにしない
  it('setAuth の解決前に解除されたらチャンネルを作らない', async () => {
    const rt = makeRealtimeMock();
    const stop = subscribeToTable(rt.client, {
      table: 'wishlist_items',
      householdId: 'main',
      onChange: vi.fn(),
      onStatus: vi.fn(),
    });
    stop(); // setAuth の await が解決する前に解除
    await vi.advanceTimersByTimeAsync(0);

    expect(rt.calls.channelTopics).toEqual([]);
    expect(rt.client.removeChannel).not.toHaveBeenCalled();
  });
});
