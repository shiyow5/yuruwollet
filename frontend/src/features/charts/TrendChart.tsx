import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatYen } from '../../lib/format';
import type { TrendPoint } from '../../lib/charts/types';

interface Props {
  data: TrendPoint[];
}

const AXIS = { fontSize: 11, fill: '#25271f99' };

/** 収支推移: 収入/支出の棒 + 収支(net)の折れ線。 */
export function TrendChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#25271f14" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v: number) => (v === 0 ? '0' : `${Math.round(v / 1000)}k`)}
        />
        <Tooltip formatter={(v) => formatYen(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="収入" fill="#8fbf9f" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expense" name="支出" fill="#d99a9a" radius={[4, 4, 0, 0]} />
        <Line
          type="monotone"
          dataKey="net"
          name="収支"
          stroke="#769cbf"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** 貯金履歴: 目標 vs 実績。 */
export function SavingsHistoryChart({
  data,
}: {
  data: { label: string; target: number; saved: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#25271f14" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v: number) => (v === 0 ? '0' : `${Math.round(v / 1000)}k`)}
        />
        <Tooltip formatter={(v) => formatYen(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="target" name="目標" fill="#c9d6e2" radius={[4, 4, 0, 0]} />
        <Bar dataKey="saved" name="実績" fill="#769cbf" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
