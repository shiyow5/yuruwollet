import { Button, Chip, Icon } from '../../components/ui';
import { isSafeUrl } from '../../lib/wishlist/schema';
import { genreIcon, statusLabel, statusTone, completeLabel } from '../../lib/wishlist/labels';
import type { WishlistItem } from '../../lib/wishlist/types';

interface Props {
  item: WishlistItem;
  /** 登録者の表示名（ゆるり / しよを）。解決できなければ member_id を出す。 */
  registrantName: string;
  busy?: boolean;
  onComplete: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export function WishlistItemCard({
  item,
  registrantName,
  busy,
  onComplete,
  onRestore,
  onDelete,
}: Props) {
  // 保存済みの URL でも描画前に必ず検証する。
  // 検証を追加する前のデータや、DB を直接触られた場合に javascript: が残りうるため。
  const safeUrl = item.url && isSafeUrl(item.url) ? item.url : null;

  return (
    <li className="flex gap-4 rounded-2xl bg-surface-container-lowest p-5 ring-1 ring-custom-text/5">
      <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-container-high sm:flex">
        <Icon name={genreIcon(item.genre)} className="text-custom-text/60" />
      </div>

      <div className="flex min-w-0 flex-grow flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 break-words font-headline-md text-body-lg font-medium text-custom-text">
            {item.title}
          </h3>
          <Chip tone={statusTone(item.status)}>{statusLabel(item.genre, item.status)}</Chip>
        </div>

        {item.memo && <p className="break-words text-body-md text-custom-text/70">{item.memo}</p>}

        {safeUrl && (
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 truncate text-label-sm text-accent-text underline"
          >
            <Icon name="link" className="text-sm" />
            <span className="truncate">{safeUrl}</span>
          </a>
        )}

        <div className="flex items-center gap-1 text-label-sm text-custom-text/70">
          <Icon name="person_add" className="text-sm" />
          <span>{registrantName}</span>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {item.archived ? (
            <Button variant="secondary" disabled={busy} onClick={() => onRestore(item.id)}>
              リストに戻す
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => onComplete(item.id)}>
              {completeLabel(item.genre)}
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={busy}
            aria-label={`${item.title} を削除`}
            onClick={() => onDelete(item.id)}
          >
            削除
          </Button>
        </div>
      </div>
    </li>
  );
}
