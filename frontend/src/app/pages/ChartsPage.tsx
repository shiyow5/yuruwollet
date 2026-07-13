import { lazy, Suspense } from 'react';
import { Card, Skeleton } from '../../components/ui';

/**
 * Recharts はここでだけ読み込む。
 * 静的 import にすると、ホームや台帳を開くだけの人にもチャートライブラリを配ることになる。
 */
const ChartsBoard = lazy(() =>
  import('../../features/charts/ChartsBoard').then((m) => ({ default: m.ChartsBoard })),
);

function ChartsFallback() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="グラフを読み込み中">
      <Card>
        <Skeleton className="h-56 rounded-2xl" />
      </Card>
      <Card>
        <Skeleton className="h-56 rounded-2xl" />
      </Card>
    </div>
  );
}

export function ChartsPage() {
  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="font-headline-md text-headline-md font-bold text-custom-text">グラフ</h2>
        <p className="text-body-md text-custom-text/60">お金の流れを、ひと目で。</p>
      </header>

      <Suspense fallback={<ChartsFallback />}>
        <ChartsBoard />
      </Suspense>
    </section>
  );
}
