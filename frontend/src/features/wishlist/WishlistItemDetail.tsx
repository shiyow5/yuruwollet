import { Chip, Icon, Modal } from '../../components/ui';
import { formatMonthDay } from '../../lib/format';
import { isSafeUrl } from '../../lib/wishlist/schema';
import { genreLabel, statusLabel, statusTone } from '../../lib/wishlist/labels';
import type { WishlistItem } from '../../lib/wishlist/types';

interface Props {
  /** null なら閉じている */
  item: WishlistItem | null;
  /** 登録者の表示名（ゆるり / しよを） */
  registrantName: string;
  onClose: () => void;
}

/**
 * ウィッシュ 1 件の詳細（#105）。カードのタイトルをタップすると開く読み取り専用シート。
 * 「買った！」「リストに戻す」「削除」は従来どおりカードのボタンから行う。
 */
export function WishlistItemDetail({ item, registrantName, onClose }: Props) {
  if (item === null) return null;

  // 保存済みでも描画前に必ず検証する（javascript: 等が残っている可能性）。
  const safeUrl = item.url && isSafeUrl(item.url) ? item.url : null;

  return (
    <Modal open label="ウィッシュの詳細" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words font-headline-md text-headline-md font-bold text-custom-text">
            {item.title}
          </h2>
          <Chip tone={statusTone(item.status)}>{statusLabel(item.genre, item.status)}</Chip>
        </div>

        <dl className="flex flex-col divide-y divide-custom-text/10 rounded-2xl bg-surface-container-high px-4">
          <DetailRow label="ジャンル" value={genreLabel(item.genre)} />
          <DetailRow label="登録者" value={registrantName} />
          {item.memo.trim() !== '' && <DetailRow label="メモ" value={item.memo} />}
          <DetailRow label="登録日" value={formatMonthDay(item.created_at.slice(0, 10))} />
        </dl>

        {safeUrl && (
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 break-all text-label-sm text-primary underline"
          >
            <Icon name="link" className="text-sm" />
            <span className="break-all">{safeUrl}</span>
          </a>
        )}
      </div>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="shrink-0 text-label-sm text-custom-text/70">{label}</dt>
      <dd className="min-w-0 break-words text-right text-body-md text-custom-text">{value}</dd>
    </div>
  );
}
