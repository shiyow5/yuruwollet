import { formatYen } from '../../lib/format';
import { progressPct, savedLabel, isAchieved } from '../../lib/savings/progress';

interface Props {
  saved: number;
  target: number;
}

const SIZE = 160;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

/** 目標貯金の進捗リング。実額は丸めず、リングの長さだけ 0-100% に収める。 */
export function GoalRing({ saved, target }: Props) {
  const pct = progressPct(saved, target);
  const achieved = isAchieved(saved, target);
  const overspent = saved < 0;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      role="img"
      aria-label={`目標 ${formatYen(target)} に対して ${savedLabel(saved)}（${pct}%）`}
    >
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-black/5"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - pct / 100)}
          className={
            achieved ? 'stroke-emerald-500 transition-all' : 'stroke-custom-accent transition-all'
          }
        />
      </svg>

      <div className="absolute flex flex-col items-center">
        <span
          className={`font-headline-md text-headline-md font-bold ${
            overspent ? 'text-error' : 'text-custom-text'
          }`}
        >
          {savedLabel(saved)}
        </span>
        <span className="text-label-sm text-custom-text/70">/ {formatYen(target)}</span>
      </div>
    </div>
  );
}
