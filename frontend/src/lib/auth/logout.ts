import { resetSessionCache } from './session-client';

/**
 * Cloudflare Access のログアウト。Cloudflare のエッジが処理するパスで、
 * アプリ側にルートは要らない（= ローカルの vite / E2E の preview には存在しない）。
 */
export const ACCESS_LOGOUT_URL = '/cdn-cgi/access/logout';

interface Options {
  /** セッションに紐づく他のキャッシュ（TanStack Query など）を捨てる */
  clearCaches?: () => void;
  /** 遷移の実行。テストから注入するためのシーム */
  navigate?: (url: string) => void;
}

/**
 * ログアウトする。
 *
 * **SPA 内で「ログアウト状態」を作らず、フルページ遷移する。**
 * SPA のまま状態だけ落としても、realtime の 10 分タイマー（setAuth → getFreshSupabaseToken）
 * と TanStack Query の refetch が /api/session を叩き、**捨てたキャッシュを再充填する**。
 * Access のクッキーはまだ生きているので、それは成功してしまう。
 * 遷移すればプロセスごと消える。
 *
 * ただし遷移の**前に**キャッシュを捨てる。順序が逆だと、遷移でページが消えて実行されない。
 * （遷移がブロックされた場合の保険でもあり、テストで観測できる契約でもある）
 */
export async function logout({ clearCaches, navigate = assign }: Options = {}): Promise<void> {
  resetSessionCache();
  try {
    clearCaches?.();
  } finally {
    // **キャッシュ破棄が失敗しても必ず遷移する。**
    // ここで例外が抜けると navigate に到達せず、Access のクッキーが生き残ったまま
    // 「ログアウトしたつもり」になる（ボタンは押せたのに何も起きない）。
    // 共有端末で家計簿を開く前提のアプリなので、黙って失敗するのが一番まずい。
    navigate(ACCESS_LOGOUT_URL);
  }
}

function assign(url: string): void {
  window.location.assign(url);
}
