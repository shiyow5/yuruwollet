import { EmptyState } from '../../components/ui/EmptyState';

interface Props {
  title: string;
  phase: string;
  icon?: string;
}

export function PagePlaceholder({ title, phase, icon = 'construction' }: Props) {
  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-headline-md text-headline-md font-bold text-custom-text">{title}</h2>
      <EmptyState icon={icon} title={`${phase} で実装予定`} />
    </section>
  );
}
