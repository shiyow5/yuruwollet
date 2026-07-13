import { useState } from 'react';
import { Avatar, Button, Card, Input, Skeleton } from '../../components/ui';
import { formatYen } from '../../lib/format';
import { validateOpeningBalance } from '../../lib/savings/schema';
import { useProfiles, useMemberBalances } from '../shared/members';
import { useSessionContext } from '../../lib/auth/session-context';
import { selectBalance } from '../../lib/ledger/members';
import { useUpdateOpeningBalance } from '../savings/hooks';

interface Props {
  selfId: string;
}

/** プロフィール（固定名 + メール）と、初期残高の設定。 */
export function ProfileCard({ selfId }: Props) {
  const session = useSessionContext();
  const profiles = useProfiles();
  const balances = useMemberBalances();
  const update = useUpdateOpeningBalance();

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const me = (profiles.data ?? []).find((p) => p.member_id === selfId) ?? null;
  const balance = balances.data ? selectBalance(balances.data, selfId) : null;

  function openEditor() {
    setText(me ? String(me.opening_balance) : '');
    setError(null);
    setEditing(true);
  }

  function handleSave() {
    const result = validateOpeningBalance(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    update.mutate(result.value, { onSuccess: () => setEditing(false) });
  }

  if (profiles.isError) {
    return (
      <Card>
        <p role="alert" className="text-label-sm text-error">
          プロフィールを取得できませんでした。時間をおいて再度お試しください。
        </p>
      </Card>
    );
  }

  if (profiles.isLoading || !me) {
    return (
      <Card>
        <Skeleton className="h-32 rounded-2xl" />
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 shrink-0">
          {/* 画像は **自分の分しか無い**（Access JWT の picture クレームは本人のものだけ）。
              ProfileCard は自分のプロフィールしか出さないので、セッションのものを渡してよい。
              画像が無ければ Avatar が頭文字にフォールバックする。 */}
          <Avatar
            name={me.display_name}
            memberId={me.member_id}
            src={session.status === 'authenticated' ? session.session.member.avatarUrl : undefined}
          />
        </div>
        <div className="min-w-0">
          <p className="font-headline-md text-body-lg font-medium text-custom-text">
            {me.display_name}
          </p>
          {me.email && <p className="truncate text-label-sm text-custom-text/60">{me.email}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-surface-container-high p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-label-sm text-custom-text/60">初期残高</span>
          <span className="text-body-md font-medium text-custom-text">
            {formatYen(me.opening_balance)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-label-sm text-custom-text/60">現在の残高</span>
          <span className="text-body-md text-custom-text">
            {/* 取得失敗/読込中に ¥0 を「実データ」として見せない */}
            {balances.isError || balances.isLoading || balance == null ? '—' : formatYen(balance)}
          </span>
        </div>
        <p className="text-label-sm text-custom-text/50">
          現在の残高 = 初期残高 + これまでの収入 − 支出。
          初期残高を変えると現在の残高もそのぶん動きます。
        </p>

        {update.isError && (
          <p role="alert" className="text-label-sm text-error">
            初期残高を保存できませんでした。再度お試しください。
          </p>
        )}

        {editing ? (
          <div className="flex flex-col gap-3">
            <div>
              <Input
                label="初期残高"
                id="opening-balance"
                inputMode="numeric"
                placeholder="0"
                value={text}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'opening-balance-error' : undefined}
                onChange={(e) => setText(e.target.value)}
              />
              {error && (
                <p
                  id="opening-balance-error"
                  role="alert"
                  className="mt-1 text-label-sm text-error"
                >
                  {error}
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                fullWidth
                disabled={update.isPending}
                onClick={() => setEditing(false)}
              >
                キャンセル
              </Button>
              <Button fullWidth disabled={update.isPending} onClick={handleSave}>
                {update.isPending ? '保存中…' : '保存'}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={openEditor}>
            初期残高を変える
          </Button>
        )}
      </div>
    </Card>
  );
}
