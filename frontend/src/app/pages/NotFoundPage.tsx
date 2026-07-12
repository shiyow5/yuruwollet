import { Link } from 'react-router';
import { EmptyState } from '../../components/ui/EmptyState';

export function NotFoundPage() {
  return (
    <section className="flex flex-col items-center gap-4">
      <EmptyState icon="sentiment_dissatisfied" title="ページが見つかりません" />
      <Link to="/" className="font-label-sm text-label-sm text-custom-accent hover:underline">
        ホームに戻る
      </Link>
    </section>
  );
}
