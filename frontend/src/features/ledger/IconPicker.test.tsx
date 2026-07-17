import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { IconPicker } from './IconPicker';
import { CATEGORY_ICON_GROUPS } from '../../lib/icons/palette';

/**
 * #9 のフィードバック対応: 76 個のアイコンを 248px の内部スクロール箱から選ぶ形をやめ、
 * 「今のアイコン 1 個 → タップで全画面シート」にする。
 * 入れ子スクロールを消しつつ、アイコンは絵のまま選べる状態を保つのが要件。
 */
describe('IconPicker', () => {
  it('閉じている間はグリッドを描かない（フォームが伸びない）', () => {
    render(<IconPicker value="restaurant" onChange={vi.fn()} />);
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    // 76 個ぶんのボタンがフォームに埋まっていないこと
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('今選ばれているアイコンを 1 つだけ見せる', () => {
    const { container } = render(<IconPicker value="restaurant" onChange={vi.fn()} />);
    // Icon は aria-hidden でコードポイントを描くので、data-icon で確かめる
    const shown = container.querySelectorAll('[data-icon]');
    expect(shown).toHaveLength(1);
    expect(shown[0].getAttribute('data-icon')).toBe('restaurant');
  });

  it('タップするとシートが開き、全グループが出る', () => {
    render(<IconPicker value="restaurant" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /アイコンを選ぶ/ }));

    expect(screen.getByRole('dialog', { name: 'アイコンを選ぶ' })).toBeInTheDocument();
    for (const g of CATEGORY_ICON_GROUPS) {
      expect(screen.getByText(g.group)).toBeInTheDocument();
    }
  });

  it('選択中のアイコンが aria-checked で分かる', () => {
    render(<IconPicker value="restaurant" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /アイコンを選ぶ/ }));

    const group = screen.getByRole('radiogroup', { name: 'アイコンを選ぶ' });
    expect(within(group).getByRole('radio', { name: 'restaurant' })).toBeChecked();
  });

  it('選ぶと onChange が呼ばれ、シートが閉じる（選んだら用は済む）', () => {
    const onChange = vi.fn();
    render(<IconPicker value="restaurant" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /アイコンを選ぶ/ }));

    const target = CATEGORY_ICON_GROUPS[0].icons[1];
    fireEvent.click(screen.getByRole('radio', { name: target }));

    expect(onChange).toHaveBeenCalledWith(target);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('選ばずに閉じても onChange は呼ばれない', () => {
    const onChange = vi.fn();
    render(<IconPicker value="restaurant" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /アイコンを選ぶ/ }));
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('パレット外の値でも落ちない（既存データの保険）', () => {
    render(<IconPicker value="not_in_palette" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /アイコンを選ぶ/ }));
    const group = screen.getByRole('radiogroup', { name: 'アイコンを選ぶ' });
    // どれも選択状態にならないだけで、開ける
    expect(within(group).queryAllByRole('radio', { checked: true })).toHaveLength(0);
  });
});
