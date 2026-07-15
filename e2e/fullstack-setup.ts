/**
 * full-stack E2E の前提チェック（#6）。
 *
 * ローカル supabase が起動していないと、/api/session の JWT 発行自体は成功する（署名は HS256 で
 * supabase を要らない）のに、アプリの REST/Realtime だけが接続拒否で落ち、全テストが「なぜか
 * データが出ない」と不可解に失敗する。ここで到達性を先に確認し、原因を明示して止める。
 */
const SUPABASE_URL = 'http://127.0.0.1:54321';

async function globalSetup(): Promise<void> {
  try {
    // どんな HTTP ステータスでも「応答した = 起動している」。接続拒否だけを検出したい。
    await fetch(`${SUPABASE_URL}/rest/v1/`);
  } catch (err) {
    throw new Error(
      `ローカル supabase (${SUPABASE_URL}) に到達できません。full-stack E2E の前に ` +
        '`supabase start` && `supabase db reset` を実行してください。' +
        `（原因: ${err instanceof Error ? err.message : String(err)}）`,
    );
  }
}

export default globalSetup;
