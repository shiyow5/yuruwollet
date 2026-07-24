import { jstToday, formatYen } from '../format';
import type { Checkpoint } from './types';

/** 給料日前日 = 残高を数える日 */
export const WALL_DAY = 24;

/** JST 暦日（1-31）。today は 'YYYY-MM-DD'。 */
export function dayOfMonth(today: string): number {
  return Number(today.slice(8, 10));
}

/**
 * 24日の壁を表示するかを判定する純関数。
 *
 * today は **サーバの JST 日付**（取得できないときのみ端末時計にフォールバック）。
 * 端末時計が遅れていると壁がそもそも開かず、24日の確認を丸ごと素通りできてしまうため、
 * 表示ゲートの判定にクライアントの日付を使わない。
 *
 * - JST 24日未満は表示しない
 * - **confirmed（その月を確定済み）なら表示しない。それ以外は表示する。**
 *
 * 「後で数える」は DB に skipped を残さず、その場で閉じるだけの一時操作にした（#106）。
 * 一度スキップしても、確定するまではその月内（24日〜月末）はアプリを開くたび／日をまたぐ
 * たびに壁を出す。壁を閉じている間の抑制は BalanceWall のローカル state が担う。
 */
export function shouldShowWall(today: string, checkpoint: Checkpoint | null): boolean {
  if (dayOfMonth(today) < WALL_DAY) return false;
  return checkpoint?.status !== 'confirmed';
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
