import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SubscriptionForm } from './SubscriptionForm';

const fx = { rate: 150, rateDate: '2026-07-13' };

describe('SubscriptionForm', () => {
  it('JPY 入力を検証して onSubmit に正規化ドラフトを渡す', () => {
    const onSubmit = vi.fn();
    render(<SubscriptionForm fxRate={fx} submitLabel="追加" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText('Netflix など'), { target: { value: 'Netflix' } });
    fireEvent.change(screen.getByPlaceholderText('1490'), { target: { value: '1,490' } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: 'Netflix',
      currency: 'JPY',
      originalAmount: 1490,
      cycle: 'monthly',
      status: 'active',
    });
  });

  it('USD は月換算の概算をプレビューする', () => {
    render(<SubscriptionForm fxRate={fx} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'ドル' }));
    fireEvent.change(screen.getByPlaceholderText('9.99'), { target: { value: '10' } });
    // 10 USD × 150 = ¥1,500（概算）
    expect(screen.getByText(/月換算 ¥1,500（概算）/)).toBeInTheDocument();
  });

  it('為替未取得(fxRate=null)では USD を登録できない', () => {
    const onSubmit = vi.fn();
    render(<SubscriptionForm fxRate={null} submitLabel="追加" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('tab', { name: 'ドル' }));
    fireEvent.change(screen.getByPlaceholderText('Netflix など'), { target: { value: 'ChatGPT' } });
    fireEvent.change(screen.getByPlaceholderText('9.99'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/為替レートが未取得/)).toBeInTheDocument();
  });

  it('サービス名が空だと検証エラー', () => {
    const onSubmit = vi.fn();
    render(<SubscriptionForm fxRate={fx} submitLabel="追加" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText('1490'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('サービス名を入力してください')).toBeInTheDocument();
  });

  // モーダル内のフォームのタブは幅いっぱいのままにする（タップしやすさ優先）。
  // SegmentedControl の既定を自然幅にしたので、fullWidth を渡し忘れると静かに縮む。
  it('フォーム内のタブは幅いっぱい（fullWidth の付け忘れを落とす）', () => {
    render(<SubscriptionForm fxRate={fx} onSubmit={vi.fn()} />);
    const lists = screen.getAllByRole('tablist');
    expect(lists.length).toBeGreaterThanOrEqual(2); // 通貨 / 周期
    for (const list of lists) {
      expect(list).toHaveClass('w-full');
      expect(list).not.toHaveClass('w-fit');
    }
  });
});
