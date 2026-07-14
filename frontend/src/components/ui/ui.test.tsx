import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Avatar,
  Icon,
  Button,
  Card,
  Chip,
  Input,
  Select,
  SegmentedControl,
  ProgressBar,
  StatTile,
  IconTile,
  Fab,
  EmptyState,
  Skeleton,
  Modal,
} from './index';

describe('Button', () => {
  it('type 既定は button・クリックできる', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>押す</Button>);
    const btn = screen.getByRole('button', { name: '押す' });
    expect(btn).toHaveAttribute('type', 'button');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });
  it('secondary variant のクラス', () => {
    render(<Button variant="secondary">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('text-custom-accent');
  });
});

describe('Chip', () => {
  it('tone のクラスを付与', () => {
    render(<Chip tone="accent">利用中</Chip>);
    expect(screen.getByText('利用中')).toHaveClass('text-custom-accent');
  });
  it('caution tone は amber', () => {
    render(<Chip tone="caution">無料体験中</Chip>);
    expect(screen.getByText('無料体験中')).toHaveClass('text-amber-700');
  });
});

describe('Input', () => {
  it('label を描画し入力を受け付ける', () => {
    render(<Input label="実際の残高" placeholder="0" />);
    expect(screen.getByText('実際の残高')).toBeInTheDocument();
    const input = screen.getByPlaceholderText('0');
    fireEvent.change(input, { target: { value: '5000' } });
    expect(input).toHaveValue('5000');
  });
});

describe('Select', () => {
  it('label と options を描画し選択できる', () => {
    const onChange = vi.fn();
    render(
      <Select label="カテゴリ" value="" onChange={onChange}>
        <option value="">未選択</option>
        <option value="c1">食費</option>
      </Select>,
    );
    expect(screen.getByText('カテゴリ')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c1' } });
    expect(onChange).toHaveBeenCalled();
  });
});

describe('SegmentedControl', () => {
  const options = [
    { value: 'want', label: 'ほしい物' },
    { value: 'place', label: '行きたい場所' },
  ] as const;

  it('選択中に aria-selected、変更で onChange', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={[...options]} value="want" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: 'ほしい物' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: '行きたい場所' }));
    expect(onChange).toHaveBeenCalledWith('place');
  });
  it('ariaLabel でグループにアクセシブルネームを付与', () => {
    render(
      <SegmentedControl options={[...options]} value="want" onChange={vi.fn()} ariaLabel="通貨" />,
    );
    expect(screen.getByRole('tablist', { name: '通貨' })).toBeInTheDocument();
  });

  // inline-flex は `flex flex-col` の親に置かれると align-items:stretch で横いっぱいに
  // 引き伸ばされる。タブが画面幅まで伸びきってアンバランスになっていた。
  // 既定では伸ばさず、フォーム内だけ fullWidth で明示的に伸ばす。
  it('既定では親に引き伸ばされない', () => {
    render(<SegmentedControl options={[...options]} value="want" onChange={vi.fn()} />);
    const list = screen.getByRole('tablist');
    expect(list).toHaveClass('w-fit');
    expect(list).not.toHaveClass('w-full');
  });

  it('fullWidth で幅いっぱいになる（モーダル内のフォーム用）', () => {
    render(<SegmentedControl options={[...options]} value="want" onChange={vi.fn()} fullWidth />);
    const list = screen.getByRole('tablist');
    expect(list).toHaveClass('w-full');
    expect(list).not.toHaveClass('w-fit');
  });

  // w-fit は max-content なので、選択肢が多いと狭い画面で親からはみ出す
  // （ウィッシュリストの 3 択が 360px で溢れる）。上限は必ず親幅にする。
  it('親より広くならない', () => {
    render(<SegmentedControl options={[...options]} value="want" onChange={vi.fn()} />);
    expect(screen.getByRole('tablist')).toHaveClass('max-w-full');
  });
});

describe('ProgressBar', () => {
  it('割合を 0..100 にクランプ', () => {
    const { rerender } = render(<ProgressBar value={0.5} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    rerender(<ProgressBar value={2} max={1} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    rerender(<ProgressBar value={-1} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    rerender(<ProgressBar value={5} max={0} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  // 1 枚のカードに progressbar が 2 本並ぶと、名前が無いと読み上げが
  // 「progressbar 87%」「progressbar 100%」となり、どちらが今月か判らない。
  it('label を渡すとアクセシブルネームが付く', () => {
    render(<ProgressBar value={0.87} label="今月の支出" />);
    expect(screen.getByRole('progressbar', { name: '今月の支出' })).toHaveAttribute(
      'aria-valuenow',
      '87',
    );
  });

  it('label 未指定なら aria-label は付かない', () => {
    render(<ProgressBar value={0.5} />);
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-label');
  });
});

describe('StatTile / Card / Icon / IconTile / EmptyState / Skeleton', () => {
  it('StatTile は label と value', () => {
    render(<StatTile label="今月の収入" value="¥450,000" />);
    expect(screen.getByText('今月の収入')).toBeInTheDocument();
    expect(screen.getByText('¥450,000')).toBeInTheDocument();
  });
  it('Card は children を描画', () => {
    render(<Card>中身</Card>);
    expect(screen.getByText('中身')).toBeInTheDocument();
  });
  it('Icon はシンボル名を描画', () => {
    render(<Icon name="restaurant" filled />);
    expect(screen.getByText('restaurant')).toBeInTheDocument();
  });
  it('IconTile はアイコンを内包', () => {
    render(<IconTile name="home" />);
    expect(screen.getByText('home')).toBeInTheDocument();
  });
  it('EmptyState は title/description', () => {
    render(<EmptyState title="まだありません" description="追加してね" />);
    expect(screen.getByText('まだありません')).toBeInTheDocument();
    expect(screen.getByText('追加してね')).toBeInTheDocument();
  });
  it('Skeleton が描画される', () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstChild).toHaveClass('animate-pulse');
  });
});

describe('Fab', () => {
  it('aria-label とクリック', () => {
    const onClick = vi.fn();
    render(<Fab label="追加" onClick={onClick} />);
    const btn = screen.getByRole('button', { name: '追加' });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('Modal', () => {
  it('open=false では何も描画しない', () => {
    render(
      <Modal open={false}>
        <p>本文</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('open=true で本文を表示、背景クリックで onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>本文</p>
      </Modal>,
    );
    expect(screen.getByText('本文')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('locked では背景クリックしても onClose しない', () => {
    const onClose = vi.fn();
    render(
      <Modal open locked onClose={onClose}>
        <p>本文</p>
      </Modal>,
    );
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });
  it('内側クリックは伝播しない', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>本文</p>
      </Modal>,
    );
    fireEvent.click(screen.getByText('本文'));
    expect(onClose).not.toHaveBeenCalled();
  });
  it('label でアクセシブルネームを付与', () => {
    render(
      <Modal open label="収支を追加">
        <p>本文</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: '収支を追加' })).toBeInTheDocument();
  });
  it('Escape で onClose、locked では無視', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal open onClose={onClose}>
        <button>ok</button>
      </Modal>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();

    onClose.mockClear();
    rerender(
      <Modal open locked onClose={onClose}>
        <button>ok</button>
      </Modal>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
  it('open 時に最初のフォーカス可能要素へフォーカス', () => {
    render(
      <Modal open label="t">
        <button>最初</button>
        <button>次</button>
      </Modal>,
    );
    expect(screen.getByRole('button', { name: '最初' })).toHaveFocus();
  });
  it('Tab がパネル内で循環する（フォーカストラップ）', () => {
    render(
      <Modal open label="t">
        <button>a</button>
        <button>b</button>
      </Modal>,
    );
    const first = screen.getByRole('button', { name: 'a' });
    const last = screen.getByRole('button', { name: 'b' });
    last.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });
  it('親再レンダー（onClose の identity 変化）でフォーカスを奪わない', () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} label="t">
        <button>a</button>
        <button>b</button>
      </Modal>,
    );
    const last = screen.getByRole('button', { name: 'b' });
    last.focus();
    expect(last).toHaveFocus();
    // 親が別の onClose 関数で再レンダー（open/locked は不変）
    rerender(
      <Modal open onClose={() => {}} label="t">
        <button>a</button>
        <button>b</button>
      </Modal>,
    );
    // effect が再実行されて先頭へフォーカスを戻していない
    expect(last).toHaveFocus();
  });
});

describe('Avatar', () => {
  // Access の picture クレームは公式に best-effort。**画像が出ないのが通常経路**。
  it('画像 URL が無ければ頭文字を出す', () => {
    render(<Avatar name="ゆるり" memberId="yururi" />);
    expect(screen.getByText('ゆ')).toBeInTheDocument();
  });

  it('メンバー色を当てる', () => {
    const { container } = render(<Avatar name="ゆるり" memberId="yururi" />);
    expect(container.firstElementChild).toHaveClass('bg-member-yururi');
  });

  it('https の画像 URL があれば img を出す', () => {
    const { container } = render(
      <Avatar name="ゆるり" memberId="yururi" src="https://lh3.googleusercontent.com/a/x" />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://lh3.googleusercontent.com/a/x');
    expect(screen.queryByText('ゆ')).toBeNull();
  });

  // <img src> に javascript: を流さない（CSP がまだ無いので、ここが唯一の関門）
  it('https でない URL は使わず頭文字にフォールバックする', () => {
    const { container } = render(
      <Avatar name="ゆるり" memberId="yururi" src="javascript:alert(1)" />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('ゆ')).toBeInTheDocument();
  });

  it('画像の読み込みに失敗したら頭文字にフォールバックする', () => {
    const { container } = render(
      <Avatar name="しよを" memberId="shiyowo" src="https://lh3.googleusercontent.com/a/x" />,
    );
    const img = container.querySelector('img')!;
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('し')).toBeInTheDocument();
  });
});
