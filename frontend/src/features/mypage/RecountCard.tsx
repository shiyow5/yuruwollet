import { useState } from 'react';
import { Button, Card, Input, Modal } from '../../components/ui';
import { formatYen } from '../../lib/format';
import { selectBalance } from '../../lib/ledger/members';
import { validateActualBalance } from '../../lib/wall/validate';
import { computeDiff, diffMessage, diffDirectionLabel } from '../../lib/wall/schedule';
import { kindOfConfirmError, confirmErrorMessage } from '../../lib/wall/errors';
import { useMemberBalances } from '../shared/members';
import { useAdjustBalanceNow } from '../wall/hooks';

interface Pending {
  actual: number;
  computed: number;
  diff: number;
}

/**
 * 任意のタイミングで残高を数え直すカード（#99）。
 *
 * 毎月24日の壁は「後で数える」を押すと当月は出てこなくなる。ここから **いつでも**
 * 実残高を入力して差額を残高調整に反映できる。壁（月次 checkpoint）とは独立していて、
 * ここで数え直しても24日の壁の表示・再表示には影響しない（adjust_balance_now は
 * checkpoint を触らない）。自分の残高だけを対象にする。
 */
export function RecountCard({ selfId }: { selfId: string }) {
  const [open, setOpen] = useState(false);
  const balances = useMemberBalances();
  const computed = balances.data ? selectBalance(balances.data, selfId) : null;

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="font-headline-md text-headline-md text-custom-text">残高の数え直し</h3>
          <p className="mt-1 text-body-md text-custom-text/70">
            お財布を数えて、アプリの残高とのズレをいつでも直せます。
          </p>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-surface-container-high px-4 py-3">
          <span className="text-label-sm text-custom-text/70">アプリの計算残高</span>
          <span className="font-headline-md text-body-lg font-medium text-custom-text">
            {computed == null ? '—' : formatYen(computed)}
          </span>
        </div>

        <Button fullWidth onClick={() => setOpen(true)}>
          残高を数え直す
        </Button>
      </div>

      {open && <RecountDialog selfId={selfId} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function RecountDialog({ selfId, onClose }: { selfId: string; onClose: () => void }) {
  const { isError: balError, refetch } = useMemberBalances();
  const adjust = useAdjustBalanceNow();

  const [step, setStep] = useState<'input' | 'confirm' | 'done'>('input');
  const [actualText, setActualText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [resultDiff, setResultDiff] = useState<number | null>(null);

  function commit(p: Pending) {
    adjust.mutate(
      { actual: p.actual, expectedComputed: p.computed },
      {
        onSuccess: () => {
          setResultDiff(p.diff);
          setStep('done');
        },
        onError: (e) => {
          // stale = 承認後に残高が動いた。入力に戻して最新残高で数え直させる。
          if (kindOfConfirmError(e) === 'stale') {
            setStep('input');
            setPending(null);
          }
        },
      },
    );
  }

  async function handleDecide() {
    const result = validateActualBalance(actualText);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setChecking(true);
    // 差額はキャッシュではなく最新残高で判定する（古い残高で「ズレ0」と誤判定しない）。
    const fresh = await refetch();
    setChecking(false);
    const computed = fresh.isError || !fresh.data ? null : selectBalance(fresh.data, selfId);
    if (computed == null) {
      setError('現在の残高を取得できませんでした。時間をおいて再度お試しください。');
      return;
    }
    const diff = computeDiff(result.value, computed);
    if (diff === 0) {
      // ズレ無し → 調整取引は作らない（RPC も呼ばない）。そのまま完了扱いにする。
      setResultDiff(0);
      setStep('done');
      return;
    }
    setPending({ actual: result.value, computed, diff });
    setStep('confirm');
  }

  const busy = checking || adjust.isPending;
  const adjustError = adjust.isError ? confirmErrorMessage(kindOfConfirmError(adjust.error)) : null;

  return (
    <Modal open label="残高の数え直し" onClose={onClose}>
      {step === 'done' ? (
        <div className="flex flex-col gap-5">
          <h2 className="font-headline-md text-headline-md font-bold text-custom-text">
            {resultDiff === 0 ? 'ズレはありませんでした' : '残高を合わせました'}
          </h2>
          <p className="text-body-md text-custom-text/70">
            {resultDiff === 0
              ? 'アプリの計算と実際の残高は一致しています。'
              : `${diffDirectionLabel(resultDiff ?? 0)}（${formatYen(Math.abs(resultDiff ?? 0))}）。`}
          </p>
          <Button fullWidth onClick={onClose}>
            閉じる
          </Button>
        </div>
      ) : step === 'input' || !pending ? (
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-custom-text">
              残高を数え直す
            </h2>
            <p className="mt-2 text-body-md text-custom-text/70">
              いまのお財布の残高を数えて入力してね。
            </p>
          </div>

          <div>
            <Input
              label="実際の残高"
              id="recount-actual"
              inputMode="numeric"
              placeholder="0"
              value={actualText}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'recount-actual-error' : undefined}
              onChange={(e) => setActualText(e.target.value)}
            />
            {error && (
              <p id="recount-actual-error" role="alert" className="mt-1 text-label-sm text-error">
                {error}
              </p>
            )}
          </div>

          {balError && (
            <p role="alert" className="text-label-sm text-error">
              現在の残高を取得できませんでした。通信環境を確認してください。
            </p>
          )}
          {adjustError && (
            <p role="alert" className="text-label-sm text-error">
              {adjustError}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth disabled={busy} onClick={onClose}>
              キャンセル
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
          <p className="text-label-sm text-custom-text/70">{diffDirectionLabel(pending.diff)}</p>

          <dl className="flex flex-col gap-1 rounded-2xl bg-surface-container-high p-4">
            <div className="flex justify-between">
              <dt className="text-label-sm text-custom-text/70">アプリの計算</dt>
              <dd className="text-body-md text-custom-text">{formatYen(pending.computed)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-label-sm text-custom-text/70">実際の残高</dt>
              <dd className="text-body-md font-medium text-custom-text">
                {formatYen(pending.actual)}
              </dd>
            </div>
          </dl>

          {adjustError && (
            <p role="alert" className="text-label-sm text-error">
              {adjustError}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button
              variant="secondary"
              fullWidth
              disabled={adjust.isPending}
              onClick={() => {
                setStep('input');
                setPending(null);
              }}
            >
              いいえ
            </Button>
            <Button fullWidth disabled={adjust.isPending} onClick={() => commit(pending)}>
              {adjust.isPending ? '調整中…' : 'はい'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
