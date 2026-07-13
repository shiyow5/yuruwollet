import { useState } from 'react';
import { Button, Card, Chip, EmptyState, Input, Skeleton } from '../../components/ui';
import { formatYen } from '../../lib/format';
import { validateTargetAmount } from '../../lib/savings/schema';
import { isAchieved, remainingToGoal } from '../../lib/savings/progress';
import type { SavingsProgress } from '../../lib/savings/types';
import { GoalRing } from './GoalRing';
import { useSavingsProgress, useSaveSavingsGoal, useDeleteSavingsGoal } from './hooks';

interface Props {
  memberId: string;
  month: string;
  /** 自分の目標だけ編集できる（相手の分は閲覧のみ） */
  canWrite: boolean;
}

export function GoalCard({ memberId, month, canWrite }: Props) {
  const { data: progress, isLoading, isError } = useSavingsProgress(memberId, month);
  const save = useSaveSavingsGoal(month);
  const remove = useDeleteSavingsGoal(month);

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function openEditor(current: SavingsProgress | null) {
    setText(current ? String(current.target_amount) : '');
    setError(null);
    setEditing(true);
  }

  function handleSave() {
    const result = validateTargetAmount(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    save.mutate(result.value, { onSuccess: () => setEditing(false) });
  }

  if (isError) {
    return (
      <Card>
        <p role="alert" className="text-label-sm text-error">
          目標貯金を取得できませんでした。時間をおいて再度お試しください。
        </p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <Skeleton className="h-48 rounded-2xl" />
      </Card>
    );
  }

  const goal = progress ?? null;

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="font-headline-md text-body-lg font-medium text-custom-text">
          今月の目標貯金
        </h3>
        {goal && isAchieved(goal.saved, goal.target_amount) && <Chip tone="success">達成！</Chip>}
      </div>

      {save.isError && (
        <p role="alert" className="text-label-sm text-error">
          目標を保存できませんでした。再度お試しください。
        </p>
      )}
      {remove.isError && (
        <p role="alert" className="text-label-sm text-error">
          目標を取り消せませんでした。再度お試しください。
        </p>
      )}

      {/*
        canWrite を必ず条件に入れる。書込先は常に **自分の** member_id なので、
        相手タブで編集フォームが出たまま保存されると、相手の画面を見ながら
        自分の目標を書き換えてしまう。
      */}
      {editing && canWrite ? (
        <div className="flex flex-col gap-4">
          <div>
            <Input
              label="目標額"
              id="goal-target"
              inputMode="numeric"
              placeholder="30000"
              value={text}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'goal-target-error' : undefined}
              onChange={(e) => setText(e.target.value)}
            />
            {error && (
              <p id="goal-target-error" role="alert" className="mt-1 text-label-sm text-error">
                {error}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              fullWidth
              disabled={save.isPending}
              onClick={() => setEditing(false)}
            >
              キャンセル
            </Button>
            <Button fullWidth disabled={save.isPending} onClick={handleSave}>
              {save.isPending ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      ) : goal ? (
        <div className="flex flex-col items-center gap-4">
          <GoalRing saved={goal.saved} target={goal.target_amount} />

          <p className="text-body-md text-custom-text/70">
            {isAchieved(goal.saved, goal.target_amount)
              ? '目標を達成しました！'
              : `目標まであと ${formatYen(remainingToGoal(goal.saved, goal.target_amount))}`}
          </p>
          {goal.saved < 0 && (
            <p className="text-label-sm text-error">今月は支出が収入を上回っています</p>
          )}

          {canWrite && (
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => openEditor(goal)}>
                目標を変える
              </Button>
              <Button
                variant="secondary"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {remove.isPending ? '取り消し中…' : '目標をやめる'}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <EmptyState
            icon="savings"
            title="今月の目標はまだありません"
            description={
              canWrite
                ? '目標を決めると、今月の貯金の進み具合が見えます'
                : 'この人は今月の目標を設定していません'
            }
          />
          {canWrite && <Button onClick={() => openEditor(null)}>目標を決める</Button>}
        </div>
      )}
    </Card>
  );
}
