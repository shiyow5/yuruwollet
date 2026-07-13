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
 * 毎月24日の残高確認の壁。JST 24日以降、当月が未確定なら全画面ロックで表示する。
 * 決定時にアプリの計算残高との差額を確認し、RPC で原子的に「残高調整」を計上する。
 */
export function BalanceWall({ now = getNow() }: Props) {
  const session = useSessionContext();
  const selfId = session.status === 'authenticated' ? session.session.member.id : '';
  const month = jstMonthStart(now);

  const { data: checkpoint, isLoading: cpLoading } = useCurrentCheckpoint(selfId, month);
  const { data: balances = [], isLoading: balLoading, isError: balError } = useMemberBalances();
  const skip = useSkipCheckpoint();
  const confirm = useConfirmCheckpoint();

  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const [actualText, setActualText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ actual: number; diff: number } | null>(null);

  const computed = selectBalance(balances, selfId);

  // 判定に必要なデータが揃うまでは出さない（ちらつき防止）
  const ready = selfId !== '' && !cpLoading && !balLoading;
  if (!ready || !shouldShowWall(now, checkpoint ?? null)) return null;

  function handleDecide() {
    const result = validateActualBalance(actualText);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (computed == null) {
      setError('現在の残高を取得できませんでした。時間をおいて再度お試しください。');
      return;
    }
    setError(null);
    const diff = computeDiff(result.value, computed);
    if (diff === 0) {
      // ズレ無し → 確認ダイアログ無しでそのまま確定（RPC は取引を挿入しない）
      confirm.mutate(result.value);
      return;
    }
    setPending({ actual: result.value, diff });
    setStep('confirm');
  }

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
            <Button fullWidth disabled={confirm.isPending} onClick={handleDecide}>
              {confirm.isPending ? '確定中…' : '決定'}
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
              <dd className="text-body-md text-custom-text">{formatYen(computed ?? 0)}</dd>
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
