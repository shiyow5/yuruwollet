import { Icon, Skeleton } from '../../components/ui';
import { formatYen } from '../../lib/format';
import { selectBalance } from '../../lib/ledger/members';
import { useMemberBalances } from '../../features/shared/members';
import type { TxnType } from '../../lib/ledger/types';

interface Props {
  memberId: string;
  /** 自分の残高を見ているか（収入/支出の追加導線を出すか） */
  canAdd?: boolean;
  /**
   * 追加ボタンが押されたことを親に上げる。
   * **ここで mutation や useCategories を呼ばないこと。** BalanceHero は残高表示の
   * コンポーネントで、テストも SessionContext やデータ層のモック無しで描画している。
   */
  onAdd?: (type: TxnType) => void;
}

/** 現在の残高ヒーロー（テンプレ fixed_nav_update の残高セクション）。 */
export function BalanceHero({ memberId, canAdd = false, onAdd }: Props) {
  const { data: balances, isLoading, isError } = useMemberBalances();
  // 取得失敗時に ¥0 を残高として見せない（data は undefined のまま）
  const balance = balances ? selectBalance(balances, memberId) : null;

  return (
    <section className="flex flex-col items-center justify-center py-8">
      <h2 className="mb-4 font-label-sm text-label-sm uppercase tracking-[0.2em] text-custom-text/60">
        現在の残高
      </h2>
      {isLoading ? (
        <Skeleton className="mb-8 h-14 w-56" />
      ) : isError ? (
        <p role="alert" className="mb-8 text-body-md text-error">
          残高を取得できませんでした
        </p>
      ) : (
        <div className="mb-8 text-[56px] font-bold leading-none tracking-tight text-custom-accent">
          {formatYen(balance ?? 0)}
        </div>
      )}
      {canAdd && (
        <div className="flex w-full max-w-sm gap-4">
          <button
            type="button"
            onClick={() => onAdd?.('income')}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-custom-accent px-6 py-4 font-label-sm text-label-sm text-on-primary shadow-sm transition hover:opacity-90"
          >
            <Icon name="add" size={20} />
            収入
          </button>
          <button
            type="button"
            onClick={() => onAdd?.('expense')}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-custom-accent/20 bg-white px-6 py-4 font-label-sm text-label-sm text-custom-accent shadow-sm transition hover:bg-custom-accent/5"
          >
            <Icon name="send" size={20} />
            支出
          </button>
        </div>
      )}
    </section>
  );
}
