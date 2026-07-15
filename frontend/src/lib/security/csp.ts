/**
 * Content-Security-Policy と `_headers` の生成（#41）。
 *
 * **なぜビルド時に生成するのか**: connect-src には Supabase のオリジンが要るが、
 * これは環境ごとに違う（本番は `https://<ref>.supabase.co`、ローカルは `http://127.0.0.1:54321`）。
 * `public/_headers` に静的に置くと本番の Supabase を書けず、REST も Realtime も CSP で落ちる。
 * `VITE_SUPABASE_URL` が判るビルド時に組み立てて dist へ出す。
 *
 * **締めすぎると本番だけ真っ白になる。** ここを触るときは csp.test.ts の理由コメントを読むこと。
 */

/** Google のプロフィール画像ホスト。**avatar.ts の isDisplayableAvatarUrl と一致させること。** */
const AVATAR_HOSTS = ['https://googleusercontent.com', 'https://*.googleusercontent.com'];

/**
 * Supabase の URL から connect-src に載せるオリジンを作る。
 *
 * REST は https/http、Realtime は wss/ws。**両方要る**（片方だけだと Realtime が黙って死ぬ）。
 * 壊れた URL は投げる。黙って握り潰すと「connect-src が self だけ」の CSP が本番に出て、
 * アプリが全くデータを読めなくなる。
 */
export function supabaseOrigins(supabaseUrl: string): [string, string] {
  const url = new URL(supabaseUrl);
  const ws = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return [url.origin, `${ws}//${url.host}`];
}

/** CSP を 1 行で組み立てる。 */
export function buildCsp(supabaseUrl: string): string {
  const [httpOrigin, wsOrigin] = supabaseOrigins(supabaseUrl);

  const policy: Record<string, string[]> = {
    'default-src': ["'self'"],
    // ビルド後の index.html にインラインスクリプトは無い（外部 module script のみ）。
    // ここに 'unsafe-inline' を足すと XSS 耐性が実質ゼロになる。絶対に緩めない。
    'script-src': ["'self'"],
    // ProgressBar の style={{width}}、Recharts の style 属性がある。
    // style の inline はスクリプトと違い実害が小さいので許す。
    'style-src': ["'self'", "'unsafe-inline'"],
    // フォントは CSS に url(data:font/woff2...) で埋め込まれている。
    // data: を落とすと Material Symbols が読めず、アイコンが文字列で表示される。
    'font-src': ["'self'", 'data:'],
    'img-src': ["'self'", 'data:', ...AVATAR_HOSTS],
    // REST + Realtime。/api/session は same-origin なので 'self'。
    // Access の再ログインは **トップレベル遷移**で起きるので connect-src には要らない。
    'connect-src': ["'self'", httpOrigin, wsOrigin],
    'manifest-src': ["'self'"],
    // service worker（/sw.js, #55）は same-origin。省略すると script-src → default-src の
    // 'self' にフォールバックして今も動くが、SW を意図的に許可していることを明示しておく
    // （将来 default-src を締めても SW 登録が黙って壊れないように）。外部 worker は許可しない。
    'worker-src': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };

  return Object.entries(policy)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

/**
 * 本番で付けるセキュリティヘッダ一式。
 *
 * `_headers`（Cloudflare Pages）と `vite preview`（E2E）の**両方がこれを使う**。
 * 1 つの出所にしておかないと、E2E が本番と違う CSP の下で回り、
 * 「テストは緑なのに本番だけ真っ白」を検出できない。
 */
export function securityHeaders(supabaseUrl: string): Record<string, string> {
  return {
    'Content-Security-Policy': buildCsp(supabaseUrl),
    // HTTPS 以外で来させない。pages.dev は元々 HTTPS のみだが明示する。
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  };
}

/**
 * Cloudflare Pages の `_headers` ファイルの中身を作る。
 * 1 行 1 ヘッダ。CSP は改行できないので 1 行に収める。
 */
export function buildHeadersFile(supabaseUrl: string): string {
  const headers = Object.entries(securityHeaders(supabaseUrl)).map(([k, v]) => `  ${k}: ${v}`);

  return [
    '# **自動生成。手で編集しない。**',
    '# frontend/src/lib/security/csp.ts + vite.config.ts のプラグインが生成する。',
    '# connect-src に Supabase のオリジンが要るため、ビルド時にしか組み立てられない。',
    '/*',
    ...headers,
    '',
  ].join('\n');
}
