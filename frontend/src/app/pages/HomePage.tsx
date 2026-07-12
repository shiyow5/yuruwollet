import { useSession } from '../../lib/auth/useSession';
import { EmptyState } from '../../components/ui/EmptyState';

export function HomePage() {
  const session = useSession();
  const name = session.status === 'authenticated' ? session.session.member.displayName : null;

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="font-headline-md text-headline-md font-bold text-custom-text">
          {name ? `おかえり、${name} さん` : 'ホーム'}
        </h2>
        <p className="text-body-md text-custom-text/60">今日もおつかれさま</p>
      </div>
      <EmptyState icon="dashboard" title="ダッシュボードは Phase 4 で実装予定" />
    </section>
  );
}
