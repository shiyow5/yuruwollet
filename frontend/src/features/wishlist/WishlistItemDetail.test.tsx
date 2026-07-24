import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WishlistItemDetail } from './WishlistItemDetail';
import type { WishlistItem } from '../../lib/wishlist/types';

function item(over: Partial<WishlistItem> = {}): WishlistItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    household_id: 'main',
    registrant_id: 'yururi',
    genre: 'want',
    title: 'コーヒーメーカー',
    url: null,
    memo: '',
    status: 'planned',
    archived: false,
    created_at: '2026-07-13T01:00:00Z',
    updated_at: '2026-07-13T01:00:00Z',
    ...over,
  };
}

describe('WishlistItemDetail（#105）', () => {
  it('null なら何も描かない', () => {
    const { container } = render(
      <WishlistItemDetail item={null} registrantName="ゆるり" onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('タイトル・ジャンル・登録者・メモを表示する', () => {
    render(
      <WishlistItemDetail
        item={item({ memo: '全自動がいい' })}
        registrantName="ゆるり"
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'ウィッシュの詳細' });
    expect(dialog).toHaveTextContent('コーヒーメーカー');
    expect(dialog).toHaveTextContent('ほしい物');
    expect(dialog).toHaveTextContent('ゆるり');
    expect(dialog).toHaveTextContent('全自動がいい');
  });

  it('安全な URL はリンクで出す', () => {
    render(
      <WishlistItemDetail
        item={item({ url: 'https://example.com/x' })}
        registrantName="ゆるり"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/x');
  });

  it('危険な URL はリンクにしない', () => {
    render(
      <WishlistItemDetail
        item={item({ url: 'javascript:alert(1)' })}
        registrantName="ゆるり"
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
  });
});
