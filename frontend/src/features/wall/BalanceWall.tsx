import { useEffect, useState } from 'react';
import { Button, Input, Modal } from '../../components/ui';
import { formatYen, jstToday, monthStartOf } from '../../lib/format';
import { clockOverrideDate } from '../../lib/clock';
import { useSessionContext } from '../../lib/auth/session-context';
import { selectBalance } from '../../lib/ledger/members';
import { useMemberBalances } from '../shared/members';
import {
  shouldShowWall,
  msUntilNextJstDay,
  computeDiff,
  diffMessage,
  diffDirectionLabel,
} from '../../lib/wall/schedule';
import { validateActualBalance } from '../../lib/wall/validate';
import { confirmErrorMessage, kindOfConfirmError } from '../../lib/wall/errors';
import {
  useServerToday,
  useCurrentCheckpoint,
  useSkipCheckpoint,
  useConfirmCheckpoint,
} from './hooks';

interface Props {
  /**
   * テスト用の端末時計。表示ゲートは通常サーバ日付で判定するため、
   * これはサーバ日付が取れないときのフォールバックに使われるだけ。
   * E2E で日付ごと偽装するには `?now=YYYY-MM-DD`（開発/E2E ビルドのみ有効）を使う。
   */
  now?: Date;
}

/** ユーザーが承認する内容。computed は確認画面に出した「アプリの計算」＝ CAS の期待値。 */
interface Pending {
  actual: number;
  computed: number;
  diff: number;
}

/**
 * 毎月24日の残高確認の壁（表示ゲート）。
 * JST 24日以降・当月が未確定のときだけ WallDialog をマウントする。
 * checkpoint の取得に失敗したときは**ロックしない**（確認済みの人を締め出さないため fail-open）。
 */
export function BalanceWall({ now: injectedNow }: Props) {
  const session = useSessionContext();
  // 開発/E2E の `?now=` 偽装。効いている間はサーバ日付を問い合わせず、偽装日付だけで判定する。
  const override = clockOverrideDate();
  const fixed = injectedNow ?? override;

  // サーバ日付が取れないときのフォールバック用。日付境界で再評価する。
  const [clock, setClock] = useState<Date>(() => fixed ?? new Date());
  const now = fixed ?? clock;

  useEffect(() => {
    if (fixed) return; // 固定クロック（テスト/E2E）は進めない
    const timer = setTimeout(() => setClock(new Date()), msUntilNextJstDay(clock) + 1000);
    return () => clearTimeout(timer);
  }, [fixed, clock]);

  const selfId = session.status === 'authenticated' ? session.session.member.id : '';

  // 表示ゲートはサーバの JST 日付で判定する。端末時計が **遅れて** いると壁がそもそも開かず、
  // その月の残高確認を丸ごと素通りできてしまうため（サーバの 24日ガードは早すぎる確定しか止められない）。
  // 取得できないときだけ端末時計にフォールバックする（壁が永久に出ないより良い）。
  const serverToday = useServerToday(override == null);
  // 再取得が失敗しても serverToday.data には前回成功時の日付が残る。
  // それを使い続けると、日付境界の再取得が落ちたタブが古い日付のまま壁を出さなくなるため、
  // isError のときは必ず端末時計に落とす（意図したフォールバックを効かせる）。
  const today =
    serverToday.isError || !serverToday.data ? jstToday(now) : (serverToday.data as string);
  const month = monthStartOf(today);

  const {
    data: checkpoint,
    isLoading: cpLoading,
    isError: cpError,
  } = useCurrentCheckpoint(selfId, month);

  // 残高の読み込みは待たない（遅い/ハングした残高取得でロックが効かなくなるのを防ぐ）。
  // 差額判定は WallDialog 側で必ず最新残高を取り直して行う。
  if (
    selfId === '' ||
    serverToday.isLoading ||
    cpLoading ||
    cpError ||
    !shouldShowWall(today, checkpoint ?? null)
  ) {
    return null;
  }

  // 可視のときだけマウントし、月が変わったら key で作り直す
  // → 閉じたとき・月をまたいだときに入力/確認 state が必ず初期化される
  return <WallDialog key={month} selfId={selfId} month={month} />;
}

function WallDialog({ selfId, month }: { selfId: string; month: string }) {
  const { isError: balError, refetch } = useMemberBalances();
  const skip = useSkipCheckpoint();
  const confirm = useConfirmCheckpoint();

  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const [actualText, setActualText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  /**
   * ユーザーが承認した (computed, actual) の組をそのまま RPC に渡す。
   * 承認後に残高が動いていたらサーバが PT412 で弾くので、
   * ユーザーが見ていないズレが黙って調整されることはない。
   */
  function submit(p: Pending) {
    confirm.mutate(
      { actual: p.actual, expectedComputed: p.computed },
      {
        onError: (e) => {
          // stale = 残高が動いた。入力画面に戻して最新残高で数え直させる。
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
    // 差額判定はキャッシュではなく最新残高で行う
    // （古い残高のまま「差額0」と誤判定して確認なしに調整が入るのを防ぐ）
    const fresh = await refetch();
    setChecking(false);
    // 再取得が失敗した場合、fresh.data には「前回成功時の古い残高」が残る。
    // それで差額を計算すると stale 判定になるため、必ずエラーとして扱う。
    const computed = fresh.isError || !fresh.data ? null : selectBalance(fresh.data, selfId);
    if (computed == null) {
      setError('現在の残高を取得できませんでした。時間をおいて再度お試しください。');
      return;
    }
    const diff = computeDiff(result.value, computed);
    if (diff === 0) {
      // ズレ無し → 確認ダイアログ無しで確定（RPC も取引を挿入しない）
      submit({ actual: result.value, computed, diff });
      return;
    }
    setPending({ actual: result.value, computed, diff });
    setStep('confirm');
  }

  const busy = checking || confirm.isPending;
  const confirmError = confirm.isError
    ? confirmErrorMessage(kindOfConfirmError(confirm.error))
    : null;

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
          {confirmError && (
            <p role="alert" className="text-label-sm text-error">
              {confirmError}
            </p>
          )}
          {skip.isError && (
            <p role="alert" className="text-label-sm text-error">
              スキップを保存できませんでした。再度お試しください。
            </p>
          )}

          <div className="flex gap-3 pt-1">
            {/* 決定の残高再取得中にスキップされると、確定と競合するため両方を排他にする */}
            <Button
              variant="secondary"
              fullWidth
              disabled={skip.isPending || busy}
              onClick={() => skip.mutate(month)}
            >
              {skip.isPending ? '保存中…' : '後で数える'}
            </Button>
            <Button fullWidth disabled={busy || skip.isPending} onClick={handleDecide}>
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
              <dd className="text-body-md text-custom-text">{formatYen(pending.computed)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-label-sm text-custom-text/60">実際の残高</dt>
              <dd className="text-body-md font-medium text-custom-text">
                {formatYen(pending.actual)}
              </dd>
            </div>
          </dl>

          {confirmError && (
            <p role="alert" className="text-label-sm text-error">
              {confirmError}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            {/* 確定中に「いいえ」でキャンセルできるように見せない（RPC は止められない） */}
            <Button
              variant="secondary"
              fullWidth
              disabled={confirm.isPending}
              onClick={() => {
                setStep('input');
                setPending(null);
              }}
            >
              いいえ
            </Button>
            <Button fullWidth disabled={confirm.isPending} onClick={() => submit(pending)}>
              {confirm.isPending ? '確定中…' : 'はい'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
