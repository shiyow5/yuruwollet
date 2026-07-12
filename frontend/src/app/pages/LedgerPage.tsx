import { useState } from 'react';
import { Button, Card, Fab, Icon, Modal } from '../../components/ui';
import { addMonths, formatMonthLabel, jstMonthStart, jstToday } from '../../lib/format';
import type { Transaction, TransactionDraft } from '../../lib/ledger/types';
import { MemberTabs } from '../../features/ledger/MemberTabs';
import { TransactionForm, type TransactionFormValues } from '../../features/ledger/TransactionForm';
import { TransactionList } from '../../features/ledger/TransactionList';
import { CategoryManager } from '../../features/ledger/CategoryManager';
import {
  useCategories,
  useCreateTransaction,
  useDeleteTransaction,
  useMemberOptions,
  useMonthTransactions,
  useUpdateTransaction,
} from '../../features/ledger/hooks';

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; txn: Transaction }
  | { kind: 'categories' };

export function LedgerPage() {
  const { options, selfId } = useMemberOptions();
  const [viewMemberId, setViewMemberId] = useState<string | null>(null);
  const [month, setMonth] = useState(() => jstMonthStart());
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });

  const activeMember = viewMemberId ?? selfId ?? '';
  const canWrite = activeMember !== '' && activeMember === selfId;
  // 追加フォームの既定日付: 選択中の月が当月なら今日、それ以外はその月の初日
  // （過去/未来の月を見ているときに当月へ書き込んで「消える」のを防ぐ）
  const createDefaultDate = month === jstMonthStart() ? jstToday() : month;

  const { data: categories = [] } = useCategories();
  const { data: transactions = [], isLoading } = useMonthTransactions(activeMember, month);
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();
  const deleteTransaction = useDeleteTransaction();

  function closeModal() {
    setModal({ kind: 'none' });
  }

  function handleCreate(draft: TransactionDraft) {
    createTransaction.mutate(draft, { onSuccess: closeModal });
  }

  function handleUpdate(id: string, draft: TransactionDraft) {
    updateTransaction.mutate({ id, draft }, { onSuccess: closeModal });
  }

  function handleDelete(txn: Transaction) {
    if (window.confirm('この記録を削除しますか？')) {
      deleteTransaction.mutate(txn.id);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <h2 className="font-headline-md text-headline-md font-bold text-custom-text">家計簿</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MemberTabs options={options} value={activeMember} onChange={setViewMemberId} />
          <MonthNav
            month={month}
            onPrev={() => setMonth((m) => addMonths(m, -1))}
            onNext={() => setMonth((m) => addMonths(m, 1))}
          />
        </div>
      </header>

      <Card className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h3 className="font-headline-md text-headline-md text-custom-text">
            {formatMonthLabel(month)}の記録
          </h3>
          <Button variant="ghost" onClick={() => setModal({ kind: 'categories' })}>
            <Icon name="tune" size={20} />
            カテゴリ
          </Button>
        </div>
        <TransactionList
          transactions={transactions}
          categories={categories}
          loading={isLoading}
          emptyMessage={
            canWrite ? 'まだ記録がありません。右下の＋から追加してね' : 'この月の記録はありません'
          }
          onEdit={canWrite ? (txn) => setModal({ kind: 'edit', txn }) : undefined}
          onDelete={canWrite ? handleDelete : undefined}
        />
      </Card>

      {canWrite && <Fab label="収支を追加" onClick={() => setModal({ kind: 'create' })} />}

      <Modal open={modal.kind === 'create'} onClose={closeModal} label="収支を追加">
        <h3 className="mb-6 font-headline-md text-headline-md text-custom-text">収支を追加</h3>
        <TransactionForm
          categories={categories}
          initial={{ occurredOn: createDefaultDate }}
          submitLabel="追加"
          submitting={createTransaction.isPending}
          onSubmit={handleCreate}
          onCancel={closeModal}
        />
      </Modal>

      <Modal open={modal.kind === 'edit'} onClose={closeModal} label="収支を編集">
        {modal.kind === 'edit' && (
          <>
            <h3 className="mb-6 font-headline-md text-headline-md text-custom-text">収支を編集</h3>
            <TransactionForm
              categories={categories}
              initial={toFormValues(modal.txn)}
              submitLabel="更新"
              submitting={updateTransaction.isPending}
              onSubmit={(draft) => handleUpdate(modal.txn.id, draft)}
              onCancel={closeModal}
            />
          </>
        )}
      </Modal>

      <Modal
        open={modal.kind === 'categories'}
        onClose={closeModal}
        label="カテゴリ管理"
        className="max-h-[85vh] overflow-y-auto"
      >
        <CategoryManager />
        <Button variant="secondary" fullWidth className="mt-6" onClick={closeModal}>
          閉じる
        </Button>
      </Modal>
    </section>
  );
}

function toFormValues(txn: Transaction): Partial<TransactionFormValues> {
  return {
    type: txn.type,
    amount: String(txn.amount),
    categoryId: txn.category_id ?? '',
    occurredOn: txn.occurred_on,
    memo: txn.memo,
  };
}

function MonthNav({
  month,
  onPrev,
  onNext,
}: {
  month: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="前の月"
        onClick={onPrev}
        className="flex h-9 w-9 items-center justify-center rounded-full text-custom-text/60 transition hover:bg-black/5"
      >
        <Icon name="chevron_left" size={22} />
      </button>
      <span className="min-w-[6rem] text-center font-label-sm text-label-sm text-custom-text">
        {formatMonthLabel(month)}
      </span>
      <button
        type="button"
        aria-label="次の月"
        onClick={onNext}
        className="flex h-9 w-9 items-center justify-center rounded-full text-custom-text/60 transition hover:bg-black/5"
      >
        <Icon name="chevron_right" size={22} />
      </button>
    </div>
  );
}
