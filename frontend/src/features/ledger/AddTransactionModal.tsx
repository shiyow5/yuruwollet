import { Modal } from '../../components/ui';
import type { TransactionDraft, TxnType } from '../../lib/ledger/types';
import { TransactionForm } from './TransactionForm';
import { useAccounts, useCategories, useCreateTransaction } from './hooks';

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * 既定の日付。**必須**。
   *
   * optional にして内部で jstToday() にフォールバックすると、呼び出し側が渡し忘れても
   * 型で捕まらず、「過去月を見ながら追加したら当月に書かれて一覧から消える」退行が
   * 実行時まで隠れる。lib/ledger/defaults の defaultOccurredOn() の戻り値を渡すこと。
   */
  defaultDate: string;
  initialType?: TxnType;
}

/**
 * 収支の追加モーダル。カテゴリ取得・作成 mutation・エラー文言・成功時クローズを
 * ここに閉じ込め、ページ側は「開閉 state」と「既定日付」だけを持つ。
 * ホーム（#36）と家計簿の両方から同じものを開く。
 */
export function AddTransactionModal({
  open,
  onClose,
  defaultDate,
  initialType = 'expense',
}: Props) {
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const createTransaction = useCreateTransaction();

  // 閉じるときに mutation の状態を捨てる。捨てないと、失敗 → 閉じる → 開き直す で
  // 前回のエラーバナーが出たままになる（mutation state がページの寿命で生きているため）。
  function close() {
    createTransaction.reset();
    onClose();
  }

  function handleCreate(draft: TransactionDraft) {
    createTransaction.mutate(draft, { onSuccess: close });
  }

  return (
    <Modal open={open} onClose={close} label="収支を追加">
      <h3 className="mb-6 font-headline-md text-headline-md text-custom-text">収支を追加</h3>
      <TransactionForm
        categories={categories}
        accounts={accounts}
        initial={{ occurredOn: defaultDate, type: initialType }}
        submitLabel="追加"
        submitting={createTransaction.isPending}
        submitError={
          createTransaction.isError
            ? '保存に失敗しました。通信環境を確認して再度お試しください。'
            : null
        }
        onSubmit={handleCreate}
        onCancel={close}
      />
    </Modal>
  );
}
