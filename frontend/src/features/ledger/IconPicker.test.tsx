import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { IconPicker } from './IconPicker';
import { CATEGORY_ICON_GROUPS, CATEGORY_ICONS, DEFAULT_CATEGORY_ICON } from '../../lib/icons/palette';

/**
 * #88: 76 個のアイコンを 248px の内部スクロール箱から選ぶ形をやめ、
 * 「今のアイコン 1 個 → タップでシート」にする。
 *
 * role は **listbox/option**（radiogroup ではない）。理由は IconPicker.tsx のコメント参照:
 * APG 準拠の radiogroup は矢印キー移動が即選択になるが、ここは選ぶと閉じるので
 * 「矢印を押した瞬間にシートが閉じる」ことになり両立しない。
 */
describe('IconPicker', () => {
  const flat = CATEGORY_ICON_GROUPS.flatMap((g) => g.icons);

  it('閉じている間はグリッドを描かない（フォームが伸びない）', () => {
    render(<IconPicker value="restaurant" onChange={vi.fn()} />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('今選ばれているアイコンを 1 つだけ見せる', () => {
    const { container } = render(<IconPicker value="restaurant" onChange={vi.fn()} />);
    const shown = container.querySelectorAll('[data-icon]');
    expect(shown).toHaveLength(1);
    expect(shown[0].getAttribute('data-icon')).toBe('restaurant');
  });

  it('label を変えると読み上げ名も変わる（見えている文字に固定されない）', () => {
    render(<IconPicker value="restaurant" onChange={vi.fn()} label="通知アイコン" />);
    expect(screen.getByRole('button', { name: /^通知アイコン/ })).toBeInTheDocument();
  });

  it('タップするとシートが開き、全グループが出る', () => {
    render(<IconPicker value="restaurant" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /アイコン/ }));

    expect(screen.getByRole('dialog', { name: 'アイコンを選ぶ' })).toBeInTheDocument();
    for (const g of CATEGORY_ICON_GROUPS) {
      expect(screen.getByRole('group', { name: g.group })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('option')).toHaveLength(CATEGORY_ICONS.length);
  });

  it('選択中のアイコンが aria-selected で分かる', () => {
    render(<IconPicker value="restaurant" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /アイコン/ }));

    const box = screen.getByRole('listbox');
    expect(within(box).getByRole('option', { name: 'restaurant' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('選ぶと onChange が呼ばれ、シートが閉じる（選んだら用は済む）', () => {
    const onChange = vi.fn();
    render(<IconPicker value="restaurant" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /アイコン/ }));

    const target = flat[1];
    fireEvent.click(screen.getByRole('option', { name: target }));

    expect(onChange).toHaveBeenCalledWith(target);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('選ばずに閉じても onChange は呼ばれない', () => {
    const onChange = vi.fn();
    render(<IconPicker value="restaurant" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /アイコン/ }));
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('キーボード', () => {
    it('開くと選択中のアイコンにフォーカスが載る（閉じるボタンではない）', () => {
      render(<IconPicker value="restaurant" onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /アイコン/ }));

      expect(screen.getByRole('option', { name: 'restaurant' })).toHaveFocus();
    });

    it('タブ移動は 1 回で抜ける（76 個が tab stop にならない）', () => {
      render(<IconPicker value="restaurant" onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /アイコン/ }));

      const tabbable = screen.getAllByRole('option').filter((el) => el.tabIndex === 0);
      expect(tabbable).toHaveLength(1);
      expect(tabbable[0]).toHaveAccessibleName('restaurant');
    });

    it('矢印キーはフォーカスだけ動かし、選択も閉じもしない', () => {
      const onChange = vi.fn();
      render(<IconPicker value={flat[0]} onChange={onChange} />);
      fireEvent.click(screen.getByRole('button', { name: /アイコン/ }));

      fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowRight' });

      expect(screen.getByRole('option', { name: flat[1] })).toHaveFocus();
      // ここが radiogroup との決定的な違い: 矢印では確定しない
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('矢印はグループをまたいで動く（見た目の並び順どおり）', () => {
      render(<IconPicker value={CATEGORY_ICON_GROUPS[0].icons.at(-1)!} onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /アイコン/ }));

      fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowRight' });

      expect(screen.getByRole('option', { name: CATEGORY_ICON_GROUPS[1].icons[0] })).toHaveFocus();
    });

    it('Home / End で先頭と末尾へ飛ぶ', () => {
      render(<IconPicker value="restaurant" onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /アイコン/ }));
      const box = screen.getByRole('listbox');

      fireEvent.keyDown(box, { key: 'End' });
      expect(screen.getByRole('option', { name: flat.at(-1)! })).toHaveFocus();

      fireEvent.keyDown(box, { key: 'Home' });
      expect(screen.getByRole('option', { name: flat[0] })).toHaveFocus();
    });

    it('端で止まる（先頭で ← しても回り込まない）', () => {
      render(<IconPicker value={flat[0]} onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /アイコン/ }));

      fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowLeft' });

      expect(screen.getByRole('option', { name: flat[0] })).toHaveFocus();
    });
  });

  describe('パレット外の値（旧データの保険）', () => {
    it('トリガーは既定アイコンにフォールバックする（英単語が生で出ない）', () => {
      const { container } = render(<IconPicker value="not_in_palette" onChange={vi.fn()} />);
      expect(container.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe(
        DEFAULT_CATEGORY_ICON,
      );
    });

    it('シートは開けて、どれも選択状態にならない', () => {
      render(<IconPicker value="not_in_palette" onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /アイコン/ }));

      const box = screen.getByRole('listbox');
      expect(within(box).queryByRole('option', { selected: true })).not.toBeInTheDocument();
      // フォーカスは行き場を失わず先頭へ
      expect(screen.getByRole('option', { name: flat[0] })).toHaveFocus();
    });
  });
});
