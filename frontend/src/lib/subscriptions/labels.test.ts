import { describe, expect, it } from 'vitest';
import { STATUS_LABELS, CURRENCY_LABELS, CYCLE_LABELS } from './labels';

describe('subscription labels', () => {
  it('ステータス表示', () => {
    expect(STATUS_LABELS.active).toBe('利用中');
    expect(STATUS_LABELS.trial).toBe('無料体験中');
    expect(STATUS_LABELS.considering_cancel).toBe('解約検討中');
  });
  it('通貨/サイクル表示', () => {
    expect(CURRENCY_LABELS.USD).toContain('USD');
    expect(CYCLE_LABELS.yearly).toBe('毎年');
  });
});
