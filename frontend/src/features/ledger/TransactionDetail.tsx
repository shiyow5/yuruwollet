import { Modal } from '../../components/ui';
import { formatSignedYen, formatMonthDay } from '../../lib/format';
import { resolveCategory } from '../../lib/ledger/categories';
import { resolveAccount } from '../../lib/ledger/accounts';
import type { Account, Category, Transaction } from '../../lib/ledger/types';

interface Props {
  /** null なら閉じている */
  txn: Transaction | null;
  categories: Category[];
  accounts: Account[];
  onClose: () => void;
}

/** 取引の種類（手入力 / 残高調整 / サブスクの支払い）を人間語で返す。 */
function kindLabel(txn: Transaction): string {
  if (txn.is_system_generated) return '残高調整（自動）';
  if (txn.subscription_id !== null) return 'サブスクの支払い';
  return '手入力';
}

/**
 * 取引 1 件の詳細（#105）。一覧の行をタップすると開く読み取り専用シート。
 * 在り処（アカウント, #98）や記録の種類など、一覧では省いている情報もここで見せる。
 * 編集・削除は従来どおり一覧の行のボタンから行う（この詳細は情報表示に徹する）。
 */
export function TransactionDetail({ txn, categories, accounts, onClose }: Props) {
  if (txn === null) return null;

  const category = resolveCategory(categories, txn.category_id);
  const account = resolveAccount(accounts, txn.account_id);
  const isIncome = txn.type === 'income';

  return (
    <Modal open label="取引の詳細" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div>
          <span className="font-label-sm text-label-sm text-custom-text/70">
            {isIncome ? '収入' : '支出'}
          </span>
          <p
            className={
              isIncome
                ? 'font-headline-md text-headline-md font-bold text-custom-accent'
                : 'font-headline-md text-headline-md font-bold text-custom-text'
            }
          >
            {formatSignedYen(txn.amount, txn.type)}
          </p>
        </div>

        <dl className="flex flex-col divide-y divide-custom-text/10 rounded-2xl bg-surface-container-high px-4">
          <DetailRow label="カテゴリ" value={category.name} />
          <DetailRow label="アカウント（在り処）" value={account.name} />
          <DetailRow label="日付" value={formatMonthDay(txn.occurred_on)} />
          {txn.memo.trim() !== '' && <DetailRow label="メモ" value={txn.memo} />}
          <DetailRow label="記録の種類" value={kindLabel(txn)} />
        </dl>
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
