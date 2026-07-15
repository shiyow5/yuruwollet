import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemberTabs } from './MemberTabs';
import type { MemberOption } from '../../lib/ledger/members';

const options: MemberOption[] = [
  { memberId: 'yururi', label: 'ゆるり', isSelf: true },
  { memberId: 'shiyowo', label: 'しよを', isSelf: false },
];

describe('MemberTabs', () => {
  it('相手が居ない（選択肢1つ以下）なら何も描画しない', () => {
    const { container } = render(
      <MemberTabs options={[options[0]]} value="yururi" onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // radiogroup にはアクセシブルネームが要る（#18 レビュー）。選択肢が人名なので、
  // グループ名が無いと「誰のデータを表示するかの切替」だと SR 利用者に伝わらない。
  it('名前付き radiogroup として自分/相手を出す', () => {
    render(<MemberTabs options={options} value="yururi" onChange={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: '表示するメンバー' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ゆるり' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'しよを' })).toHaveAttribute('aria-checked', 'false');
  });
});
