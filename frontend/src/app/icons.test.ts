import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * サイトアイコンは「参照はあるがファイルが無い」「サイズ宣言と実物が食い違う」で
 * 静かに壊れる（ビルドは通り、タブに白紙アイコンが出るだけ）。実物を読んで突き合わせる。
 */

const root = resolve(__dirname, '../..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

function publicFile(name: string): Buffer {
  return readFileSync(resolve(root, 'public', name));
}

/** PNG の IHDR から実寸を読む（幅・高さは 8 バイトのシグネチャ + 8 バイトの後） */
function pngSize(buf: Buffer): { width: number; height: number } {
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** PNG の color type（IHDR の 10 バイト目）。4 と 6 がアルファを持つ。 */
function pngHasAlpha(buf: Buffer): boolean {
  const colorType = buf.readUInt8(25);
  return colorType === 4 || colorType === 6;
}

/**
 * ICO に入っている画像の一辺を列挙する。
 * ICO は PNG とは別物のコンテナ（ICONDIR + ICONDIRENTRY の配列）なので、
 * PNG のヘッダを読むヘルパは使えない。幅・高さの 0 は 256 を意味する。
 */
function icoSizes(buf: Buffer): number[] {
  expect(buf.readUInt16LE(0), 'ICO の reserved が 0 でない').toBe(0);
  expect(buf.readUInt16LE(2), 'ICO の type が 1 (icon) でない').toBe(1);

  const count = buf.readUInt16LE(4);
  return Array.from({ length: count }, (_unused, i) => {
    const entry = 6 + i * 16;
    return buf.readUInt8(entry) || 256;
  }).sort((a, b) => a - b);
}

describe('サイトアイコン', () => {
  it('index.html が favicon / apple-touch-icon / manifest / theme-color を参照する', () => {
    expect(html).toContain('rel="icon" type="image/svg+xml" href="/favicon.svg"');
    expect(html).toContain('href="/favicon.ico"');
    expect(html).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');
    // Cloudflare Access が全パスをゲートしているので、クッキーの無いリクエストは
    // ログイン画面へ 302 される。**manifest の取得は既定でクッキーを送らない**
    // （HTML 仕様の CORS settings attribute: crossorigin を省略すると credentials は omit）。
    // use-credentials が無いと、ログイン済みでも manifest だけ取得に失敗する。
    expect(html).toContain('rel="manifest" href="/site.webmanifest" crossorigin="use-credentials"');
    // ブラウザの UI 色（Android の Chrome ではアドレスバーが染まる）
    expect(html).toContain('name="theme-color" content="#769cbf"');
  });

  it('index.html が参照するアイコンが実在する', () => {
    for (const name of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'site.webmanifest']) {
      expect(() => publicFile(name), `${name} が無い`).not.toThrow();
    }
  });

  it('favicon.svg がテーマ色を使ったベクタである', () => {
    const svg = publicFile('favicon.svg').toString('utf8');
    expect(svg).toContain('<svg');
    // viewBox が無いと解像度に追従しない
    expect(svg).toMatch(/viewBox="0 0 64 64"/);
    expect(svg.toLowerCase()).toContain('#769cbf');
  });

  it('apple-touch-icon は 180×180（iOS のホーム画面）', () => {
    expect(pngSize(publicFile('apple-touch-icon.png'))).toEqual({ width: 180, height: 180 });
  });

  // 角丸で作ると角が透明になり、iOS のホーム画面では **黒く** 描画される。
  // 角丸は iOS が自分で被せるので、こちらは不透明の正方形を渡す。
  it('apple-touch-icon は不透明（透過は iOS で黒い角になる）', () => {
    expect(pngHasAlpha(publicFile('apple-touch-icon.png'))).toBe(false);
  });

  // index.html は sizes="16x16 32x32 48x48" と宣言している。
  // 実物にその 3 つが入っているかは、ICO のコンテナを読まないと分からない。
  it('favicon.ico に 16/32/48 が入っている（index.html の宣言どおり）', () => {
    expect(icoSizes(publicFile('favicon.ico'))).toEqual([16, 32, 48]);
  });

  describe('site.webmanifest', () => {
    const manifest = JSON.parse(publicFile('site.webmanifest').toString('utf8'));

    it('PWA に必要なフィールドを持つ', () => {
      expect(manifest.name).toBe('yuruwollet');
      expect(manifest.short_name).toBeTruthy();
      // ホーム画面から開いたときに URL バーを出さない
      expect(manifest.display).toBe('standalone');
      expect(manifest.start_url).toBe('/');
      expect(manifest.theme_color).toBe('#769cbf');
      expect(manifest.background_color).toBeTruthy();
    });

    it('宣言したアイコンが実在し、実寸が宣言どおり', () => {
      expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

      for (const icon of manifest.icons) {
        const buf = publicFile(icon.src.replace(/^\//, ''));
        const [w, h] = icon.sizes.split('x').map(Number);
        expect(pngSize(buf), `${icon.src} の実寸が宣言 (${icon.sizes}) と違う`).toEqual({
          width: w,
          height: h,
        });
      }
    });

    it('maskable アイコンを持つ（Android のアイコン形状に合わせて切り抜かれる）', () => {
      const maskable = manifest.icons.filter((i: { purpose?: string }) =>
        i.purpose?.split(' ').includes('maskable'),
      );
      expect(maskable.length).toBeGreaterThanOrEqual(1);
      // maskable は 192 以上でないと切り抜き後に粗くなる
      for (const icon of maskable) {
        expect(Number(icon.sizes.split('x')[0])).toBeGreaterThanOrEqual(192);
      }
    });
  });
});
