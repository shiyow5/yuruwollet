import { Chip, Icon, type ChipTone } from '../../components/ui';
import { formatYen, formatMonthDay } from '../../lib/format';
import { STATUS_LABELS } from '../../lib/subscriptions/labels';
import { isApproximate } from '../../lib/subscriptions/fx';
import type { Subscription, SubStatus } from '../../lib/subscriptions/types';

const STATUS_TONES: Record<SubStatus, ChipTone> = {
  active: 'accent',
  trial: 'caution',
  considering_cancel: 'warning',
};

interface Props {
  sub: Subscription;
  onEdit?: (sub: Subscription) => void;
  onDelete?: (sub: Subscription) => void;
}

/** サブスク 1 件の行表示（月換算 ¥/月・次回更新日・ステータス）。 */
export function SubscriptionItem({ sub, onEdit, onDelete }: Props) {
  const monthly = sub.monthly_amount_jpy ?? 0;
  const approx = isApproximate(sub.currency);

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-black/5 bg-surface-container-lowest p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-custom-accent/10 text-custom-accent">
          <Icon name="subscriptions" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate font-headline-md text-headline-md font-semibold text-custom-text">
            {sub.name}
          </h3>
          <p className="font-body-md text-body-md text-custom-text/70">
            {formatYen(monthly)}
            <span className="text-custom-text/70"> /月{approx ? '（概算）' : ''}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-black/5 pt-4 sm:justify-end sm:border-none sm:pt-0">
        <div className="flex items-center gap-3">
          <span className="font-label-sm text-label-sm text-custom-text/70">
            次回更新日: {formatMonthDay(sub.next_renewal_date)}
          </span>
          <Chip tone={STATUS_TONES[sub.status]}>{STATUS_LABELS[sub.status]}</Chip>
        </div>
        {(onEdit || onDelete) && (
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                type="button"
                aria-label="編集"
                onClick={() => onEdit(sub)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-custom-text/60 transition hover:bg-black/5"
              >
                <Icon name="edit" size={20} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                aria-label="削除"
                onClick={() => onDelete(sub)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-custom-text/60 transition hover:bg-error/10 hover:text-error"
              >
                <Icon name="delete" size={20} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
