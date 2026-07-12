const yenNumber = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });

const JST = 'Asia/Tokyo';
const jstTime = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const jstMonthDay = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST,
  month: 'long',
  day: 'numeric',
});
const jstIsoDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: JST,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * JPY 金額を「¥1,234」形式に整形する。JPY は小数を持たないため四捨五入する。
 * 通貨記号は環境非依存にするため自前で付与する。
 */
export function formatYen(amount: number): string {
  return `¥${yenNumber.format(Math.round(amount))}`;
}

/** 収入/支出の符号付き表示（例: 支出 → 「- ¥4,500」, 収入 → 「+ ¥280,000」）。 */
export function formatSignedYen(amount: number, type: 'income' | 'expense'): string {
  const sign = type === 'income' ? '+' : '-';
  return `${sign} ${formatYen(Math.abs(amount))}`;
}

/** 「¥1,234」等の入力文字列を数値に。無効なら NaN。 */
export function parseAmount(input: string): number {
  const cleaned = input.replace(/[¥￥,\s]/g, '');
  if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return NaN;
  }
  return Number(cleaned);
}

/** JST 基準の暦日を epoch day 連番に変換（日差分計算用） */
function jstEpochDay(d: Date): number {
  const iso = jstIsoDay.format(d); // YYYY-MM-DD
  return Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 86_400_000);
}

/** JST の「今日」を 'YYYY-MM-DD' で返す（フォーム日付の既定値・occurred_on 用）。 */
export function jstToday(now: Date = new Date()): string {
  return jstIsoDay.format(now);
}

/**
 * occurred_on（'YYYY-MM-DD' の日付のみ・JST 暦日）の相対表示。時刻は持たない。
 * 今日/昨日/N日前/M月D日。台帳の実日付（記録時刻ではなく）を見せるために使う。
 */
export function relativeDay(isoDate: string, now: Date = new Date()): string {
  const occurredDay = Math.floor(new Date(`${isoDate}T00:00:00Z`).getTime() / 86_400_000);
  const diffDays = jstEpochDay(now) - occurredDay;
  if (diffDays <= 0) return '今日';
  if (diffDays === 1) return '昨日';
  if (diffDays < 7) return `${diffDays}日前`;
  const parts = isoDate.split('-');
  return `${Number(parts[1])}月${Number(parts[2])}日`;
}

/** 'YYYY-MM-DD'（または ISO 文字列先頭）から、その月の初日 'YYYY-MM-01' を返す純関数。 */
export function monthStartOf(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

/** JST の当月初日 'YYYY-MM-01' を返す（月次サマリ/カテゴリ内訳の絞り込みキー）。 */
export function jstMonthStart(now: Date = new Date()): string {
  return monthStartOf(jstToday(now));
}

/** 'YYYY-MM-01' に n か月（負値可）を加えた月初 'YYYY-MM-01' を返す純関数。 */
export function addMonths(monthStart: string, n: number): string {
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(5, 7)); // 1-12
  const zeroBased = year * 12 + (month - 1) + n;
  const y = Math.floor(zeroBased / 12);
  const m = (zeroBased % 12) + 1;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
}

/** 'YYYY-MM-01' を「YYYY年M月」表示に整形する。 */
export function formatMonthLabel(monthStart: string): string {
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(5, 7));
  return `${year}年${month}月`;
}

/**
 * タイムライン用の相対日付（JST）。
 * 今日→「今日, HH:MM」, 昨日→「昨日, HH:MM」, 7日未満→「N日前」, それ以前→「M月D日」。
 */
export function relativeDate(input: Date | string, now: Date = new Date()): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  const diffDays = jstEpochDay(now) - jstEpochDay(d);
  if (diffDays <= 0) {
    return `今日, ${jstTime.format(d)}`;
  }
  if (diffDays === 1) {
    return `昨日, ${jstTime.format(d)}`;
  }
  if (diffDays < 7) {
    return `${diffDays}日前`;
  }
  return jstMonthDay.format(d);
}
