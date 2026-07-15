import { describe, expect, it } from 'vitest';
import { buildCsp, buildHeadersFile, supabaseOrigins } from './csp';
import { isDisplayableAvatarUrl } from '../avatar';

const PROD = 'https://bkceryraotiiatickspm.supabase.co';

/** ディレクティブ名 → 値の配列 に分解する（順序に依存せず中身を見るため）。 */
function directives(csp: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of csp.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out[name] = values;
  }
  return out;
}

describe('supabaseOrigins', () => {
  it('https の URL から https と wss のオリジンを作る', () => {
    expect(supabaseOrigins(PROD)).toEqual([
      'https://bkceryraotiiatickspm.supabase.co',
      'wss://bkceryraotiiatickspm.supabase.co',
    ]);
  });

  // ローカルは http。ws:// にしないと Realtime が CSP で落ちる
  it('http のローカル URL では ws を使う', () => {
    expect(supabaseOrigins('http://127.0.0.1:54321')).toEqual([
      'http://127.0.0.1:54321',
      'ws://127.0.0.1:54321',
    ]);
  });

  // パスやスラッシュが混ざっても connect-src はオリジンだけを見る
  it('パスや末尾スラッシュを落としてオリジンだけにする', () => {
    expect(supabaseOrigins('https://ref.supabase.co/rest/v1/')).toEqual([
      'https://ref.supabase.co',
      'wss://ref.supabase.co',
    ]);
  });

  it('URL として壊れていたら投げる（黙って緩い CSP を出さない）', () => {
    expect(() => supabaseOrigins('not-a-url')).toThrow();
  });
});

describe('buildCsp', () => {
  const d = directives(buildCsp(PROD));

  it('既定は self に閉じる', () => {
    expect(d['default-src']).toEqual(["'self'"]);
  });

  // インラインスクリプトはビルド後の HTML に無い（確認済み）。ここを緩めない。
  it('script-src に unsafe-inline / unsafe-eval を入れない', () => {
    expect(d['script-src']).toEqual(["'self'"]);
  });

  // ProgressBar の style={{width}} や Recharts が style 属性を使う
  it('style-src は inline を許す（style 属性を使っているため）', () => {
    expect(d['style-src']).toContain("'self'");
    expect(d['style-src']).toContain("'unsafe-inline'");
  });

  // **ビルド後の CSS はフォントを url(data:font/woff2...) で埋め込む。**
  // data: を落とすと Material Symbols が読めず、アイコンが "add" 等の文字列で出る。
  it('font-src に data: を含む（フォントが CSS に data URI で埋まっているため）', () => {
    expect(d['font-src']).toContain("'self'");
    expect(d['font-src']).toContain('data:');
  });

  it('connect-src に Supabase の https と wss を含む', () => {
    expect(d['connect-src']).toContain("'self'");
    expect(d['connect-src']).toContain('https://bkceryraotiiatickspm.supabase.co');
    expect(d['connect-src']).toContain('wss://bkceryraotiiatickspm.supabase.co');
  });

  it('クリックジャッキング・base 乗っ取り・object を塞ぐ', () => {
    expect(d['frame-ancestors']).toEqual(["'none'"]);
    expect(d['object-src']).toEqual(["'none'"]);
    expect(d['base-uri']).toEqual(["'self'"]);
    expect(d['form-action']).toEqual(["'self'"]);
  });

  it('manifest は self（Access 配下で読む）', () => {
    expect(d['manifest-src']).toEqual(["'self'"]);
  });

  // service worker（#55）は same-origin の /sw.js。外部 worker は許可しない。
  it('worker-src は self（same-origin の SW だけ許可する）', () => {
    expect(d['worker-src']).toEqual(["'self'"]);
  });
});

// **CSP と avatar.ts の許可ホストがずれると、検証を通ったアバターが CSP で落ちる。**
// avatar.ts は *.googleusercontent.com（lh3/lh4/lh5/lh6）と裸の googleusercontent.com を通す。
describe('img-src は avatar.ts が通すホストを覆う', () => {
  const imgSrc = directives(buildCsp(PROD))['img-src'];

  it('Google のプロフィール画像ホストを許可する', () => {
    expect(imgSrc).toContain('https://*.googleusercontent.com');
    expect(imgSrc).toContain('https://googleusercontent.com');
  });

  it('avatar.ts が通す lh5 も CSP の対象に入っている', () => {
    // avatar.ts 側が lh3 以外も通すことの確認（片方だけ狭めると本番でアバターが消える）
    expect(isDisplayableAvatarUrl('https://lh5.googleusercontent.com/a/y')).toBe(true);
    expect(imgSrc).toContain('https://*.googleusercontent.com');
  });

  it('self と data: を許可し、任意の https は許可しない', () => {
    expect(imgSrc).toContain("'self'");
    expect(imgSrc).toContain('data:');
    expect(imgSrc).not.toContain('https:');
    expect(imgSrc).not.toContain('*');
  });
});

describe('buildHeadersFile', () => {
  const file = buildHeadersFile(PROD);

  it('/* に対して CSP と HSTS と既存のヘッダを出す', () => {
    expect(file).toContain('/*');
    expect(file).toContain('Content-Security-Policy: ');
    expect(file).toContain('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    expect(file).toContain('X-Content-Type-Options: nosniff');
    expect(file).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(file).toContain('X-Frame-Options: DENY');
    expect(file).toContain('Permissions-Policy: ');
  });

  // _headers は「1 行 1 ヘッダ」。CSP を改行すると壊れる
  it('CSP を 1 行に収める', () => {
    const line = file.split('\n').find((l) => l.includes('Content-Security-Policy:'));
    expect(line).toBeDefined();
    expect(line).toContain("default-src 'self'");
    expect(line).toContain('connect-src');
  });
});
