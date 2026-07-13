import { describe, expect, it } from 'vitest';
import {
  ConfirmCheckpointError,
  classifyConfirmError,
  confirmErrorMessage,
  kindOfConfirmError,
} from './errors';

describe('classifyConfirmError', () => {
  it('RPC の SQLSTATE を種別に写像する', () => {
    expect(classifyConfirmError('PT403')).toBe('not_open');
    expect(classifyConfirmError('PT409')).toBe('already_confirmed');
    expect(classifyConfirmError('PT412')).toBe('stale');
  });

  it('未知のコード・欠落は unknown', () => {
    expect(classifyConfirmError('P0001')).toBe('unknown');
    expect(classifyConfirmError(undefined)).toBe('unknown');
    expect(classifyConfirmError(null)).toBe('unknown');
  });
});

describe('confirmErrorMessage', () => {
  it('種別ごとに次の行動が分かる文言を返す', () => {
    expect(confirmErrorMessage('stale')).toContain('残高が変わりました');
    expect(confirmErrorMessage('already_confirmed')).toContain('確定済み');
    expect(confirmErrorMessage('not_open')).toContain('24日');
    expect(confirmErrorMessage('unknown')).toContain('失敗');
  });
});

describe('kindOfConfirmError', () => {
  it('ConfirmCheckpointError から種別を取り出す', () => {
    const e = new ConfirmCheckpointError('stale', 'boom');
    expect(kindOfConfirmError(e)).toBe('stale');
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe('boom');
  });

  it('他の例外は unknown', () => {
    expect(kindOfConfirmError(new Error('boom'))).toBe('unknown');
    expect(kindOfConfirmError(null)).toBe('unknown');
  });
});
