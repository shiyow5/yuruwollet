import { Button, Modal, Skeleton } from '../../components/ui';
import type { Account } from '../../lib/ledger/types';
import { useAccountUsage } from './hooks';

interface Props {
  /** null なら閉じている */
  account: Account | null;
  deleting?: boolean;
  archiving?: boolean;
  onCancel: () => void;
  onDelete: () => void;
  onArchive: () => void;
}

/**
 * アカウント（在り処）削除の確認（#98）。
 *
 * アカウントは取引から参照される（FK `on delete restrict`）。**取引で使われていると削除できない。**
 * それを消す前に伝え、使用中なら「削除」ではなく「アーカイブ」に誘導する。
 * カテゴリ削除ダイアログ（#75）と同じ方針で、黙って FK エラーを見せない。
 */
export function DeleteAccountDialog({
  account,
  deleting,
  archiving,
  onCancel,
  onDelete,
  onArchive,
}: Props) {
  const { data: usage, isLoading, isError } = useAccountUsage(account?.id ?? null);

  if (account === null) return null;

  const inUse = (usage ?? 0) > 0;
  const busy = deleting || archiving;

  return (
    <Modal open label="アカウントを削除" onClose={onCancel}>
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="font-headline-md text-body-lg font-medium text-custom-text">
            「{account.name}」を削除しますか？
          </h3>

          {isLoading ? (
            <Skeleton className="mt-2 h-5 w-56" />
          ) : isError ? (
            // 取得できないときは「未使用（=削除可）」に倒さない。取り消せない操作なので、
            // 使用状況が不明なら削除させないのが安全（カテゴリ削除ダイアログと同じ）。
            <p role="alert" className="mt-1 text-body-md text-error">
              使用状況を確認できませんでした。時間をおいて再度お試しください。
            </p>
          ) : inUse ? (
            <p className="mt-1 text-body-md text-custom-text/70">
              このアカウントは <strong>{usage} 件</strong>の記録で使われているため、削除できません。
              <span className="mt-1 block text-label-sm text-custom-text/70">
                アーカイブすれば、これまでの記録はそのまま残り、新しい入力の選択肢からは消えます。
              </span>
            </p>
          ) : (
            <p className="mt-1 text-body-md text-custom-text/70">
              まだどの記録にも使われていません。削除できます。
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onCancel} disabled={busy}>
            キャンセル
          </Button>
          {isLoading || isError ? null : inUse ? (
            <Button fullWidth onClick={onArchive} disabled={busy}>
              {archiving ? 'アーカイブ中…' : 'アーカイブする'}
            </Button>
          ) : (
            <Button fullWidth onClick={onDelete} disabled={busy}>
              {deleting ? '削除中…' : '削除する'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
