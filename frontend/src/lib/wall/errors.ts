/**
 * confirm_balance_checkpoint RPC の拒否理由。
 * RPC は「ユーザーが画面で承認した内容がまだ有効か」をサーバ側で検証し、
 * 崩れていれば SQLSTATE (PostgREST の PTxxx 規約) で理由を返す。
 */
export type ConfirmErrorKind = 'not_open' | 'already_confirmed' | 'stale' | 'unknown';

/** RPC が返した SQLSTATE を UI が分岐できる種別に写像する。 */
export function classifyConfirmError(code: string | null | undefined): ConfirmErrorKind {
  switch (code) {
    case 'PT403':
      return 'not_open'; // サーバ時刻ではまだ 24日前
    case 'PT409':
      return 'already_confirmed'; // 別タブ/端末が先に確定済み
    case 'PT412':
      return 'stale'; // 承認後に残高が動いた（差額が変わっている）
    default:
      return 'unknown';
  }
}

export function confirmErrorMessage(kind: ConfirmErrorKind): string {
  switch (kind) {
    case 'stale':
      return '残高が変わりました。もう一度確認してください。';
    case 'already_confirmed':
      return '今月の残高はすでに確定済みです。';
    case 'not_open':
      return '残高確認は毎月24日からです。';
    case 'unknown':
      return '残高の確定に失敗しました。再度お試しください。';
  }
}

export class ConfirmCheckpointError extends Error {
  readonly kind: ConfirmErrorKind;

  constructor(kind: ConfirmErrorKind, message: string) {
    super(message);
    this.name = 'ConfirmCheckpointError';
    this.kind = kind;
  }
}

/** 例外から拒否理由を取り出す（想定外の例外は unknown）。 */
export function kindOfConfirmError(error: unknown): ConfirmErrorKind {
  return error instanceof ConfirmCheckpointError ? error.kind : 'unknown';
}
