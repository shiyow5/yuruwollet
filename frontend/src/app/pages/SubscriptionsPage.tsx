import { useState } from 'react';
import { Card, Fab, Modal, StatTile } from '../../components/ui';
import { formatYen } from '../../lib/format';
import { MemberTabs } from '../../features/shared/MemberTabs';
import { useMemberOptions } from '../../features/shared/members';
import {
  SubscriptionForm,
  type SubscriptionFormValues,
} from '../../features/subscriptions/SubscriptionForm';
import { SubscriptionList } from '../../features/subscriptions/SubscriptionList';
import { DeleteSubscriptionDialog } from '../../features/subscriptions/DeleteSubscriptionDialog';
import {
  useSubscriptions,
  useSubscriptionMonthlyTotal,
  useLatestFxRate,
  useCreateSubscription,
  useUpdateSubscription,
  useDeleteSubscription,
} from '../../features/subscriptions/hooks';
import type { Subscription, SubscriptionDraft } from '../../lib/subscriptions/types';

type ModalState = { kind: 'none' } | { kind: 'create' } | { kind: 'edit'; sub: Subscription };

export function SubscriptionsPage() {
  const { options, selfId } = useMemberOptions();
  const [viewMemberId, setViewMemberId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });

  const activeMember = viewMemberId ?? selfId ?? '';
  const canWrite = activeMember !== '' && activeMember === selfId;

  const { data: subscriptions = [], isLoading, isError } = useSubscriptions(activeMember);
  const {
    data: monthlyTotal = 0,
    isLoading: totalLoading,
    isError: totalError,
  } = useSubscriptionMonthlyTotal(activeMember);
  const { data: fxRate = null } = useLatestFxRate();

  // 取得失敗/読み込み中は 0円/0件 を「実データ」として見せず — 表示
  const totalDisplay = totalError || totalLoading ? '—' : formatYen(monthlyTotal);
  const countDisplay = isError || isLoading ? '—' : `${subscriptions.length}件`;
  const createSub = useCreateSubscription();
  const updateSub = useUpdateSubscription();
  const deleteSub = useDeleteSubscription();

  function closeModal() {
    setModal({ kind: 'none' });
  }

  function handleMemberChange(id: string) {
    setViewMemberId(id);
    setModal({ kind: 'none' });
  }

  function handleCreate(draft: SubscriptionDraft) {
    createSub.mutate(draft, { onSuccess: closeModal });
  }

  function handleUpdate(id: string, draft: SubscriptionDraft) {
    updateSub.mutate({ id, draft }, { onSuccess: closeModal });
  }

  // 削除は window.confirm では足りない（#71）。
  // 「支払い記録が家計簿に残る」ことを伝え、消すかどうかを選ばせる必要がある。
  const [deleting, setDeleting] = useState<Subscription | null>(null);

  function handleConfirmDelete(deletePayments: boolean) {
    if (!deleting) return;
    deleteSub.mutate({ id: deleting.id, deletePayments }, { onSuccess: () => setDeleting(null) });
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md font-bold text-custom-text">
            サブスク管理
          </h2>
          <p className="text-body-md text-custom-text/70">月々の固定費をスマートに把握。</p>
        </div>
        <MemberTabs options={options} value={activeMember} onChange={handleMemberChange} />
      </header>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <StatTile label="今月の合計（月換算）" value={totalDisplay} />
        <StatTile label="登録中のサービス" value={countDisplay} />
      </div>

      <Card className="flex flex-col gap-6">
        {deleteSub.isError && (
          <p role="alert" className="font-label-sm text-label-sm text-error">
            削除に失敗しました。通信環境を確認して再度お試しください。
          </p>
        )}
        <SubscriptionList
          subscriptions={subscriptions}
          loading={isLoading}
          error={isError}
          emptyMessage={
            canWrite
              ? 'まだサブスクがありません。右下の＋から追加してね'
              : 'この人のサブスクはありません'
          }
          onEdit={canWrite ? (sub) => setModal({ kind: 'edit', sub }) : undefined}
          onDelete={canWrite ? setDeleting : undefined}
        />
      </Card>

      {canWrite && <Fab label="サブスクを追加" onClick={() => setModal({ kind: 'create' })} />}

      <Modal
        open={modal.kind === 'create' && canWrite}
        onClose={closeModal}
        label="サブスクを追加"
        className="max-h-[85vh] overflow-y-auto"
      >
        <h3 className="mb-6 font-headline-md text-headline-md text-custom-text">サブスクを追加</h3>
        <SubscriptionForm
          fxRate={fxRate}
          submitLabel="追加"
          submitting={createSub.isPending}
          submitError={
            createSub.isError ? '保存に失敗しました。通信環境を確認して再度お試しください。' : null
          }
          onSubmit={handleCreate}
          onCancel={closeModal}
        />
      </Modal>

      <Modal
        open={modal.kind === 'edit' && canWrite}
        onClose={closeModal}
        label="サブスクを編集"
        className="max-h-[85vh] overflow-y-auto"
      >
        {modal.kind === 'edit' && (
          <>
            <h3 className="mb-6 font-headline-md text-headline-md text-custom-text">
              サブスクを編集
            </h3>
            <SubscriptionForm
              fxRate={fxRate}
              initial={toFormValues(modal.sub)}
              submitLabel="更新"
              submitting={updateSub.isPending}
              submitError={
                updateSub.isError
                  ? '更新に失敗しました。通信環境を確認して再度お試しください。'
                  : null
              }
              onSubmit={(draft) => handleUpdate(modal.sub.id, draft)}
              onCancel={closeModal}
            />
          </>
        )}
      </Modal>
      <DeleteSubscriptionDialog
        subscription={deleting}
        deleting={deleteSub.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={handleConfirmDelete}
      />
    </section>
  );
}

function toFormValues(sub: Subscription): Partial<SubscriptionFormValues> {
  return {
    name: sub.name,
    currency: sub.currency,
    amount: String(sub.original_amount),
    cycle: sub.cycle,
    nextRenewalDate: sub.next_renewal_date,
    status: sub.status,
  };
}
