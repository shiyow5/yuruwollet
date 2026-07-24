import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransactionDetail } from './TransactionDetail';
import type { Account, Category, Transaction } from '../../lib/ledger/types';

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

const accounts: Account[] = [
  {
    id: 'a1',
    household_id: 'main',
    name: '楽天カード',
    icon: 'credit_card',
    sort_order: 0,
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    household_id: 'main',
    owner_member_id: 'yururi',
    type: 'expense',
    amount: 4500,
    category_id: 'c1',
    account_id: 'a1',
    memo: 'スーパー',
    occurred_on: '2026-07-13',
    is_system_generated: false,
    subscription_id: null,
    created_at: '2026-07-13T05:30:00Z',
    updated_at: '2026-07-13T05:30:00Z',
    ...over,
  };
}

describe('TransactionDetail（#105）', () => {
  it('null なら何も描かない', () => {
    const { container } = render(
      <TransactionDetail
        txn={null}
        categories={categories}
        accounts={accounts}
        onClose={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('カテゴリ・在り処・日付・メモ・種類を表示する', () => {
    render(
      <TransactionDetail
        txn={txn()}
        categories={categories}
        accounts={accounts}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: '取引の詳細' });
    expect(dialog).toHaveTextContent('支出');
    expect(dialog).toHaveTextContent('¥4,500');
    expect(dialog).toHaveTextContent('食費');
    // 在り処（アカウント, #98）が詳細に出る
    expect(dialog).toHaveTextContent('楽天カード');
    expect(dialog).toHaveTextContent('スーパー');
    expect(dialog).toHaveTextContent('手入力');
  });

  it('在り処 未設定は「未設定」と出す', () => {
    render(
      <TransactionDetail
        txn={txn({ account_id: null })}
        categories={categories}
        accounts={accounts}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('未設定');
  });

  it('残高調整（自動）は種類でそう表示する', () => {
    render(
      <TransactionDetail
        txn={txn({ is_system_generated: true, category_id: null })}
        categories={categories}
        accounts={accounts}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('残高調整（自動）');
  });

  it('閉じるで onClose を呼ぶ', () => {
    const onClose = vi.fn();
    render(
      <TransactionDetail
        txn={txn()}
        categories={categories}
        accounts={accounts}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
