import { useState } from 'react';
import { Button, Input, Modal } from '../../components/ui';
import { formatYen, jstMonthStart } from '../../lib/format';
import { getNow } from '../../lib/clock';
import { useSessionContext } from '../../lib/auth/session-context';
import { selectBalance } from '../../lib/ledger/members';
import { useMemberBalances } from '../shared/members';
import {
  shouldShowWall,
  computeDiff,
  diffMessage,
  diffDirectionLabel,
} from '../../lib/wall/schedule';
import { validateActualBalance } from '../../lib/wall/validate';
import { useCurrentCheckpoint, useSkipCheckpoint, useConfirmCheckpoint } from './hooks';

interface Props {
  /** テスト/E2E 用の注入クロック（既定は ?now= を尊重する実時刻） */
  now?: Date;
}

/**
 * 毎月24日の残高確認の壁（表示ゲート）。
 * JST 24日以降・当月が未確定のときだけ WallDialog をマウントする。
 * checkpoint の取得に失敗したときは**ロックしない**（確認済みの人を締め出さないため fail-open）。
 */
export function BalanceWall({ now = getNow() }: Props) {
  const session = useSessionContext();
  const selfId = session.status === 'authenticated' ? session.session.member.id : '';
  const month = jstMonthStart(now);

  const {
    data: checkpoint,
    isLoading: cpLoading,
    isError: cpError,
  } = useCurrentCheckpoint(selfId, month);
  const { isLoading: balLoading } = useMemberBalances();

  const ready = selfId !== '' && !cpLoading && !balLoading;
  if (!ready || cpError || !shouldShowWall(now, checkpoint ?? null)) return null;

  // 可視のときだけマウント → 閉じるたびに入力/確認 state が初期化される
  return <WallDialog selfId={selfId} month={month} />;
}

function WallDialog({ selfId, month }: { selfId: string; month: string }) {
  const { isError: balError, refetch } = useMemberBalances();
  const skip = useSkipCheckpoint();
  const confirm = useConfirmCheckpoint();

  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const [actualText, setActualText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState<{ actual: number; diff: number } | null>(null);

  async function handleDecide() {
    const result = validateActualBalance(actualText);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setChecking(true);
    // 差額判定はキャッシュではなく最新残高で行う
    // （古い残高のまま「差額0」と誤判定して確認なしに調整が入るのを防ぐ）
    const fresh = await refetch();
    setChecking(false);
    const latest = fresh.data ? selectBalance(fresh.data, selfId) : null;
    if (latest == null) {
      setError('現在の残高を取得できませんでした。時間をおいて再度お試しください。');
      return;
    }
    const diff = computeDiff(result.value, latest);
    if (diff === 0) {
      // ズレ無し → 確認ダイアログ無しで確定（RPC も取引を挿入しない）
      confirm.mutate(result.value);
      return;
    }
    setPending({ actual: result.value, diff });
    setStep('confirm');
  }

  const busy = checking || confirm.isPending;

  return (
    <Modal open locked label="今月の残高確認">
      {step === 'input' || !pending ? (
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-custom-text">
              明日は給料日！
            </h2>
            <p className="mt-2 text-body-md text-custom-text/70">
              今月のお財布の残高を数えて入力してね！
            </p>
          </div>

          <div>
            <Input
              label="実際の残高"
              id="wall-actual"
              inputMode="numeric"
              placeholder="0"
              value={actualText}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'wall-actual-error' : undefined}
              onChange={(e) => setActualText(e.target.value)}
            />
            {error && (
              <p id="wall-actual-error" role="alert" className="mt-1 text-label-sm text-error">
                {error}
              </p>
            )}
          </div>

          {balError && (
            <p role="alert" className="text-label-sm text-error">
              現在の残高を取得できませんでした。通信環境を確認してください。
            </p>
          )}
          {confirm.isError && (
            <p role="alert" className="text-label-sm text-error">
              残高の確定に失敗しました。再度お試しください。
            </p>
          )}
          {skip.isError && (
            <p role="alert" className="text-label-sm text-error">
              スキップを保存できませんでした。再度お試しください。
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button
              variant="secondary"
              fullWidth
              disabled={skip.isPending}
              onClick={() => skip.mutate(month)}
            >
              {skip.isPending ? '保存中…' : '後で数える'}
            </Button>
            <Button fullWidth disabled={busy} onClick={handleDecide}>
              {busy ? '確認中…' : '決定'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <h2 className="font-headline-md text-headline-md font-bold text-custom-text">
            残高のズレを確認
          </h2>
          <p className="text-body-md text-custom-text">{diffMessage(pending.diff)}</p>
          <p className="text-label-sm text-custom-text/60">{diffDirectionLabel(pending.diff)}</p>

          <dl className="flex flex-col gap-1 rounded-2xl bg-surface-container-high p-4">
            <div className="flex justify-between">
              <dt className="text-label-sm text-custom-text/60">アプリの計算</dt>
              <dd className="text-body-md text-custom-text">
                {formatYen(pending.actual - pending.diff)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-label-sm text-custom-text/60">実際の残高</dt>
              <dd className="text-body-md font-medium text-custom-text">
                {formatYen(pending.actual)}
              </dd>
            </div>
          </dl>

          {confirm.isError && (
            <p role="alert" className="text-label-sm text-error">
              残高の確定に失敗しました。再度お試しください。
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setStep('input');
                setPending(null);
              }}
            >
              いいえ
            </Button>
            <Button
              fullWidth
              disabled={confirm.isPending}
              onClick={() => confirm.mutate(pending.actual)}
            >
              {confirm.isPending ? '確定中…' : 'はい'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
