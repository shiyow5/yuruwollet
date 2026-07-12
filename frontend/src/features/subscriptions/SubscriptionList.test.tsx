import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubscriptionList } from './SubscriptionList';
import type { Subscription } from '../../lib/subscriptions/types';

const sub: Subscription = {
  id: 's1',
  household_id: 'main',
  owner_member_id: 'yururi',
  name: 'Netflix',
  currency: 'JPY',
  original_amount: 1490,
  amount_jpy: 1490,
  fx_rate: null,
  fx_rate_date: null,
  cycle: 'monthly',
  next_renewal_date: '2026-08-15',
  status: 'trial',
  monthly_amount_jpy: 1490,
  created_at: '2026-07-13T00:00:00Z',
  updated_at: '2026-07-13T00:00:00Z',
};

describe('SubscriptionList', () => {
  it('loading 中はスケルトン', () => {
    const { container } = render(<SubscriptionList subscriptions={[]} loading />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('error 時はエラー表示（空メッセージにしない）', () => {
    render(<SubscriptionList subscriptions={[]} error emptyMessage="まだサブスクがありません" />);
    expect(screen.getByText('サブスクを読み込めませんでした')).toBeInTheDocument();
    expect(screen.queryByText('まだサブスクがありません')).toBeNull();
  });

  it('0 件は emptyMessage', () => {
    render(<SubscriptionList subscriptions={[]} emptyMessage="空です" />);
    expect(screen.getByText('空です')).toBeInTheDocument();
  });

  it('サブスクを描画（trial は概算なし・ステータス表示）', () => {
    render(<SubscriptionList subscriptions={[sub]} />);
    expect(screen.getByText('Netflix')).toBeInTheDocument();
    expect(screen.getByText('無料体験中')).toBeInTheDocument();
    expect(screen.getByText('¥1,490')).toBeInTheDocument();
  });

  it('USD は概算ラベルを付ける', () => {
    render(
      <SubscriptionList
        subscriptions={[{ ...sub, currency: 'USD', fx_rate: 150, fx_rate_date: '2026-07-13' }]}
      />,
    );
    expect(screen.getByText(/\/月（概算）/)).toBeInTheDocument();
  });
});
