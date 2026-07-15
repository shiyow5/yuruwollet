import { Button, Modal, Skeleton } from '../../components/ui';
import type { Category } from '../../lib/ledger/types';
import { useCategoryUsage } from './hooks';

interface Props {
  /** null なら閉じている */
  category: Category | null;
  deleting?: boolean;
  archiving?: boolean;
  onCancel: () => void;
  onDelete: () => void;
  onArchive: () => void;
}

/**
 * カテゴリ削除の確認（#75）。
 *
 * カテゴリは取引から参照される（FK `on delete restrict`）。**取引で使われていると削除できない。**
 * それを消す前に伝え、使用中なら「削除」ではなく「アーカイブ」に誘導する。
 * 黙って FK エラーを見せない。
 */
export function DeleteCategoryDialog({
  category,
  deleting,
  archiving,
  onCancel,
  onDelete,
  onArchive,
}: Props) {
  const { data: usage, isLoading, isError } = useCategoryUsage(category?.id ?? null);

  if (category === null) return null;

  const inUse = (usage ?? 0) > 0;
  const busy = deleting || archiving;

  return (
    <Modal open label="カテゴリを削除" onClose={onCancel}>
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="font-headline-md text-body-lg font-medium text-custom-text">
            「{category.name}」を削除しますか？
          </h3>

          {isLoading ? (
            <Skeleton className="mt-2 h-5 w-56" />
          ) : isError ? (
            // **取得できないときは「未使用（=削除可）」に倒さない。** 取り消せない操作なので、
            // 使用状況が不明なら削除させないのが安全（0 件と区別できない undefined を消せる、にしない）。
            <p role="alert" className="mt-1 text-body-md text-error">
              使用状況を確認できませんでした。時間をおいて再度お試しください。
            </p>
          ) : inUse ? (
            // 使われているカテゴリを消すと FK restrict で失敗する。事前にアーカイブへ誘導する。
            <p className="mt-1 text-body-md text-custom-text/70">
              このカテゴリは <strong>{usage} 件</strong>の記録で使われているため、削除できません。
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
