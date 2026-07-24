import { useState } from 'react';
import { Button, Card, Icon, Input, Skeleton } from '../../components/ui';
import { formatYen } from '../../lib/format';
import { validateOpeningBalance } from '../../lib/savings/schema';
import { selectableAccounts } from '../../lib/ledger/accounts';
import { useAccounts } from '../ledger/hooks';
import {
  useAccountBalances,
  useAccountOpenings,
  useUpsertAccountOpening,
} from '../shared/accountBalances';

interface Props {
  /** 表示対象のメンバー（自分/相手タブ）。 */
  memberId: string;
  /** 自分のタブなら true（初期残高を編集できる）。相手のタブは閲覧のみ。 */
  canWrite: boolean;
}

/**
 * 口座ごとの現在残高（#102）。口座残高 = 口座初期残高 + その口座の収支。
 * accounts は世帯共有だが残高はメンバー別なので、表示対象メンバーで絞る。
 * 自分のタブでは各口座の初期残高をその場で編集できる。
 */
export function AccountBalancesCard({ memberId, canWrite }: Props) {
  const accountsQ = useAccounts();
  const balancesQ = useAccountBalances();
  const openingsQ = useAccountOpenings();
  const upsert = useUpsertAccountOpening();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (accountsQ.isError) {
    return (
      <Card>
        <p role="alert" className="text-label-sm text-error">
          口座を取得できませんでした。時間をおいて再度お試しください。
        </p>
      </Card>
    );
  }

  if (accountsQ.isLoading) {
    return (
      <Card>
        <Skeleton className="h-32 rounded-2xl" />
      </Card>
    );
  }

  const accounts = selectableAccounts(accountsQ.data ?? []);
  // 初期残高が未取得/失敗のまま編集させると、prefill が 0 になり「保存」で本物の
  // 初期残高を 0 に上書きしてしまう。取得できるまで金額表示と編集導線を伏せる。
  const openingsReady = !openingsQ.isError && !openingsQ.isLoading;

  const balanceFor = (accountId: string): number | null =>
    balancesQ.data?.find((b) => b.account_id === accountId && b.member_id === memberId)?.balance ??
    null;
  const openingFor = (accountId: string): number =>
    openingsQ.data?.find((o) => o.account_id === accountId && o.member_id === memberId)
      ?.opening_balance ?? 0;

  function openEditor(accountId: string) {
    setText(String(openingFor(accountId)));
    setError(null);
    setEditingId(accountId);
  }

  function handleSave(accountId: string) {
    const result = validateOpeningBalance(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    upsert.mutate(
      { accountId, openingBalance: result.value },
      { onSuccess: () => setEditingId(null) },
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-headline-md text-body-lg font-medium text-custom-text">
          口座ごとの残高
        </h3>
        <p className="text-label-sm text-custom-text/70">
          口座の残高 = 口座の初期残高 + その口座の収入 − 支出。
        </p>
      </div>

      {accounts.length === 0 ? (
        <p className="text-label-sm text-custom-text/70">口座がありません。</p>
      ) : (
        <ul className="flex flex-col divide-y divide-custom-text/10">
          {accounts.map((account) => {
            const balance = balanceFor(account.id);
            const editing = editingId === account.id;
            return (
              <li key={account.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-custom-accent/10 text-custom-accent">
                      <Icon name={account.icon ?? 'account_balance_wallet'} size={20} />
                    </div>
                    <span className="truncate text-body-md font-medium text-custom-text">
                      {account.name}
                    </span>
                  </div>
                  <span className="shrink-0 text-body-md text-custom-text">
                    {/* 取得失敗/読込中に ¥0 を実データとして見せない */}
                    {balancesQ.isError || balancesQ.isLoading || balance == null
                      ? '—'
                      : formatYen(balance)}
                  </span>
                </div>

                {canWrite &&
                  openingsReady &&
                  (editing ? (
                    <div className="flex flex-col gap-2">
                      <Input
                        label={`${account.name}の初期残高`}
                        id={`opening-${account.id}`}
                        inputMode="numeric"
                        placeholder="0"
                        value={text}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `opening-${account.id}-error` : undefined}
                        onChange={(e) => setText(e.target.value)}
                      />
                      {error && (
                        <p
                          id={`opening-${account.id}-error`}
                          role="alert"
                          className="text-label-sm text-error"
                        >
                          {error}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          fullWidth
                          disabled={upsert.isPending}
                          onClick={() => setEditingId(null)}
                        >
                          キャンセル
                        </Button>
                        <Button
                          fullWidth
                          disabled={upsert.isPending}
                          onClick={() => handleSave(account.id)}
                        >
                          {upsert.isPending ? '保存中…' : '保存'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-label-sm text-custom-text/70">
                        初期残高 {formatYen(openingFor(account.id))}
                      </span>
                      <button
                        type="button"
                        aria-label={`${account.name}の初期残高を変える`}
                        onClick={() => openEditor(account.id)}
                        className="shrink-0 text-label-sm text-primary underline"
                      >
                        初期残高を変える
                      </button>
                    </div>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      {upsert.isError && (
        <p role="alert" className="text-label-sm text-error">
          初期残高を保存できませんでした。再度お試しください。
        </p>
      )}
    </Card>
  );
}
