import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatYen } from '../../lib/format';
import type { Slice } from '../../lib/charts/types';

interface Props {
  data: Slice[];
}

export function DonutChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((slice) => (
              <Cell key={slice.name} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => formatYen(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>

      {/* 中心の合計。凡例ぶんの高さを避けて円の中心に重ねる */}
      <div className="pointer-events-none absolute inset-x-0 top-[86px] flex flex-col items-center">
        <span className="text-label-sm text-custom-text/70">合計</span>
        <span className="font-headline-md text-body-lg font-medium text-custom-text">
          {formatYen(total)}
        </span>
      </div>
    </div>
  );
}
