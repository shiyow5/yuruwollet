import { describe, it, expect } from 'vitest';
import { pwaOptions, SHELL_GLOB_PATTERNS, FORBIDDEN_PRECACHE_TOKENS } from './pwa-config';

/**
 * #55: service worker を入れて Android の自動インストールを可能にする。
 *
 * ここで守るのは **セキュリティ不変条件**（受け入れ条件: 本番の JWT・二人分の家計データを
 * 端末にキャッシュしない）と、**Cloudflare Access との両立**（ログイン 302 を SW が食わない）。
 * どれも「設定を 1 行変えると静かに壊れる」ので、実装の単一の出所（pwa-config.ts）を突き合わせる。
 */
describe('pwaOptions (#55 PWA service worker)', () => {
  it('手書き site.webmanifest を使い続ける（プラグインに生成させない）', () => {
    // プラグイン生成の <link rel=manifest> には crossorigin=use-credentials が無く、
    // Access 下では manifest 取得が 302 され「ホーム画面に追加」でアイコン・テーマ色が効かない。
    // 既存の index.html の手書きリンク（credentials 付き）を壊さないため manifest:false。
    expect(pwaOptions.manifest).toBe(false);
  });

  it('登録スクリプトをインライン注入しない（CSP script-src self を壊さない）', () => {
    // injectRegister:'inline' は index.html にインライン <script> を差し込み、本番 CSP の
    // script-src 'self'（unsafe-inline 無し）に弾かれて SW が登録されない。
    // null にして main.tsx が import する virtual:pwa-register から登録する（外部 module script = self）。
    // （'auto' は virtual module を import 済みなら null 相当だが、二重登録回避のため明示的に null。）
    expect(pwaOptions.injectRegister).toBeNull();
  });

  it('navigateFallback を無効化する（Access のトップレベル遷移を SW が食わない）', () => {
    // vite-plugin-pwa の既定は "index.html"。残すと未ログインでも SW が古いシェルを返し、
    // Access のログイン 302（トップレベル遷移で起きる）に到達できず再ログイン不能になる。
    // このアプリは Supabase 必須でオフラインでは元々使えないので、シェルのオフライン提供は捨てる。
    expect(pwaOptions.workbox?.navigateFallback).toBeNull();
  });

  it('runtimeCaching を設定しない（/api の JWT・Supabase の家計データを一切キャッシュしない）', () => {
    // runtimeCaching が無ければ precache に無い全リクエスト（/api/session=JWT, Supabase=データ）は
    // SW を素通りしてネットワークへ抜ける。端末にトークン・家計データを残さない（#55 の核心）。
    expect(pwaOptions.workbox?.runtimeCaching).toBeUndefined();
  });

  it('precache 対象はアプリシェルの静的アセットだけ', () => {
    expect(pwaOptions.workbox?.globPatterns).toEqual([...SHELL_GLOB_PATTERNS]);
  });

  it('precache の glob に機微データ/遷移を含む拡張子・パスを含めない', () => {
    // html(遷移フォールバック) / json・webmanifest(データ) / api を precache しない不変条件。
    for (const pattern of SHELL_GLOB_PATTERNS) {
      for (const token of FORBIDDEN_PRECACHE_TOKENS) {
        expect(pattern).not.toContain(token);
      }
    }
  });

  it('開発では SW を無効化する（HMR と干渉させない）', () => {
    expect(pwaOptions.devOptions?.enabled).toBe(false);
  });

  it('新しい SW を自動有効化する（消えたチャンク 404 を避ける・#12 の preloadError と補完）', () => {
    expect(pwaOptions.registerType).toBe('autoUpdate');
  });
});
