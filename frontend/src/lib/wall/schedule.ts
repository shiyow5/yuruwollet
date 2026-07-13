import { jstToday, formatYen } from '../format';
import type { Checkpoint } from './types';

/** 給料日前日 = 残高を数える日 */
export const WALL_DAY = 24;

/** JST 暦日（1-31） */
export function jstDayOfMonth(now: Date): number {
  return Number(jstToday(now).slice(8, 10));
}

/**
 * 24日の壁を表示するかを判定する純関数。
 * - JST 24日未満は表示しない
 * - 当月の checkpoint が無ければ表示
 * - confirmed なら表示しない（その月は確認済み）
 * - skipped: その skip が「今日」なら表示しない。前日以前の skip なら再表示（25日以降も催促）
 */
export function shouldShowWall(now: Date, checkpoint: Checkpoint | null): boolean {
  const today = jstToday(now);
  if (Number(today.slice(8, 10)) < WALL_DAY) return false;
  if (!checkpoint) return true;
  if (checkpoint.status === 'confirmed') return false;
  // skipped: スキップした JST 日付が今日より前なら再表示
  const skippedOn = jstToday(new Date(checkpoint.updated_at));
  return skippedOn < today;
}

/**
 * 次の JST 日付境界（翌日 00:00 JST）までのミリ秒。
 * SPA を開いたまま 23日→24日 をまたいだときに壁を出すため、この時刻に再評価する。
 */
export function msUntilNextJstDay(now: Date): number {
  const todayJstMidnight = new Date(`${jstToday(now)}T00:00:00+09:00`).getTime();
  const nextJstMidnight = todayJstMidnight + 86_400_000;
  return Math.max(1000, nextJstMidnight - now.getTime());
}

/** 実際の残高 − アプリの計算残高。 */
export function computeDiff(actual: number, computed: number): number {
  return actual - computed;
}

/** 差額の確認文言（仕様準拠）。 */
export function diffMessage(diff: number): string {
  return `アプリの計算と【${formatYen(Math.abs(diff))}】ズレています。このまま実際の残高に合わせますか？`;
}

/** 調整の向き（RPC は diff>0 を収入、diff<0 を支出として計上する）。 */
export function diffDirectionLabel(diff: number): string {
  if (diff > 0) return '実際の残高の方が多いため、収入として調整します';
  if (diff < 0) return '実際の残高の方が少ないため、支出として調整します';
  return 'ズレはありません';
}
