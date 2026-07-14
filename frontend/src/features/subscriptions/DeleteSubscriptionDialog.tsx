import { useEffect, useState } from 'react';
import { Button, Modal, Skeleton } from '../../components/ui';
import { formatYen } from '../../lib/format';
import type { Subscription } from '../../lib/subscriptions/types';
import { useSubscriptionPayments } from './hooks';

interface Props {
  /** null なら閉じている */
  subscription: Subscription | null;
  deleting?: boolean;
  onCancel: () => void;
  onConfirm: (deletePayments: boolean) => void;
}

/**
 * サブスクの削除確認（#71）。
 *
 * **「消したのに支出が残っている」と驚かせないのが目的。**
 * サブスクを消しても、それが台帳に作った支払いは既定では残る
 * （FK が on delete set null。¥1,234 は実際に払ったお金なので、
 * 解約しても支出の事実と残高からは消さないのが既定として正しい）。
 * それを**消す前に伝え**、消したい人だけが明示的に消せるようにする。
 */
export function DeleteSubscriptionDialog({ subscription, deleting, onCancel, onConfirm }: Props) {
  const [alsoDeletePayments, setAlsoDeletePayments] = useState(false);
  const { data: payments, isLoading } = useSubscriptionPayments(subscription?.id ?? null);

  // 開き直したときにチェックが残らないようにする（前のサブスクの意図を引き継がない）
  useEffect(() => {
    setAlsoDeletePayments(false);
  }, [subscription?.id]);

  if (subscription === null) return null;

  const count = payments?.count ?? 0;
  const hasPayments = count > 0;

  return (
    <Modal open label="サブスクを削除" onClose={onCancel}>
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="font-headline-md text-body-lg font-medium text-custom-text">
            「{subscription.name}」を削除しますか？
          </h3>

          {isLoading ? (
            <Skeleton className="mt-2 h-5 w-64" />
          ) : hasPayments ? (
            <p className="mt-1 text-body-md text-custom-text/60">
              このサブスクの支払い記録が <strong>{count} 件</strong>（計{' '}
              {formatYen(payments?.total ?? 0)}）家計簿にあります。
            </p>
          ) : (
            <p className="mt-1 text-body-md text-custom-text/60">
              まだ支払いは記録されていません。
            </p>
          )}
        </div>

        {hasPayments && (
          <>
            <label className="flex items-start gap-3 rounded-2xl bg-surface-container-high p-4">
              <input
                type="checkbox"
                checked={alsoDeletePayments}
                onChange={(e) => setAlsoDeletePayments(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-custom-accent"
              />
              <span className="text-body-md text-custom-text">
                支払い記録も一緒に消す
                <span className="mt-1 block text-label-sm text-custom-text/50">
                  {alsoDeletePayments
                    ? `家計簿から ${count} 件（計 ${formatYen(payments?.total ?? 0)}）が消え、残高もその分もどります。`
                    : '外すと、支払いは「ただの支出」として家計簿に残ります（実際に払ったお金なので、残高は変わりません）。あとから家計簿で消せます。'}
                </span>
              </span>
            </label>
          </>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onCancel} disabled={deleting}>
            キャンセル
          </Button>
          <Button fullWidth onClick={() => onConfirm(alsoDeletePayments)} disabled={deleting}>
            {deleting ? '削除中…' : '削除する'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
