import { SegmentedControl } from '../../components/ui';
import type { MemberOption } from '../../lib/ledger/members';

interface Props {
  options: MemberOption[];
  value: string;
  onChange: (memberId: string) => void;
  className?: string;
}

/** 自分/相手の閲覧切替タブ。相手が居ない（選択肢1つ以下）なら何も出さない。 */
export function MemberTabs({ options, value, onChange, className }: Props) {
  if (options.length <= 1) return null;
  return (
    <SegmentedControl
      className={className}
      options={options.map((o) => ({ value: o.memberId, label: o.label }))}
      value={value}
      onChange={onChange}
      // radiogroup にはアクセシブルネームが要る（#18 レビュー）。選択肢が人名なので、
      // グループ名が無いと「誰のデータを表示するかの切替」だと分からない。
      ariaLabel="表示するメンバー"
    />
  );
}
