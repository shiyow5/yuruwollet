import type { Transaction, TransactionDraft } from './types';

export interface OptimisticContext {
  id: string;
  householdId: string;
  ownerMemberId: string;
  /** ISO 文字列。楽観行の created_at/updated_at に使う。 */
  createdAt: string;
}

const OPTIMISTIC_PREFIX = 'optimistic-';

/** 楽観 id を生成する（衝突しない接頭辞付き）。 */
export function optimisticId(uuid: string): string {
  return `${OPTIMISTIC_PREFIX}${uuid}`;
}

/** サーバー確定前の楽観 id か判定する。 */
export function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX);
}

/** 検証済みドラフトから、キャッシュに差し込む楽観 Transaction を作る純関数。 */
export function makeOptimisticTransaction(
  draft: TransactionDraft,
  ctx: OptimisticContext,
): Transaction {
  return {
    id: ctx.id,
    household_id: ctx.householdId,
    owner_member_id: ctx.ownerMemberId,
    type: draft.type,
    amount: draft.amount,
    category_id: draft.categoryId,
    memo: draft.memo,
    occurred_on: draft.occurredOn,
    is_system_generated: false,
    created_at: ctx.createdAt,
    updated_at: ctx.createdAt,
  };
}

/** 取引リストの先頭に 1 件差し込む（既存は不変・新配列を返す）。 */
export function prependTransaction(
  list: Transaction[] | undefined,
  txn: Transaction,
): Transaction[] {
  return [txn, ...(list ?? [])];
}
