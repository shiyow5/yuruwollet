import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransactionList } from './TransactionList';
import type { Category, Transaction } from '../../lib/ledger/types';

const categories: Category[] = [
  {
    id: 'c1',
    household_id: 'main',
    kind: 'expense',
    name: '食費',
    icon: 'restaurant',
    sort_order: 0,
    is_system: false,
    is_default: false,
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const txn: Transaction = {
  id: 't1',
  household_id: 'main',
  owner_member_id: 'yururi',
  type: 'expense',
  amount: 4500,
  category_id: 'c1',
  memo: 'スーパー',
  occurred_on: '2026-07-10',
  is_system_generated: false,
  subscription_id: null,
  created_at: '2026-07-10T05:30:00Z',
  updated_at: '2026-07-10T05:30:00Z',
};

describe('TransactionList', () => {
  it('loading 中はスケルトン', () => {
    const { container } = render(
      <TransactionList transactions={[]} categories={categories} loading />,
    );
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('error 時はエラー表示（空メッセージにしない）', () => {
    render(
      <TransactionList
        transactions={[]}
        categories={categories}
        error
        emptyMessage="まだ記録がありません"
      />,
    );
    expect(screen.getByText('記録を読み込めませんでした')).toBeInTheDocument();
    expect(screen.queryByText('まだ記録がありません')).toBeNull();
  });

  it('0 件は emptyMessage', () => {
    render(<TransactionList transactions={[]} categories={categories} emptyMessage="空です" />);
    expect(screen.getByText('空です')).toBeInTheDocument();
  });

  it('取引を描画する', () => {
    render(<TransactionList transactions={[txn]} categories={categories} />);
    expect(screen.getByText('スーパー')).toBeInTheDocument();
    expect(screen.getByText('- ¥4,500')).toBeInTheDocument();
  });
});
