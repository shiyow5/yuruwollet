import { Icon } from './Icon';

interface Props {
  icon?: string;
  title: string;
  description?: string;
}

export function EmptyState({ icon = 'inbox', title, description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Icon name={icon} size={40} className="text-custom-text/30" />
      <p className="text-body-md font-medium text-custom-text/70">{title}</p>
      {description && <p className="text-label-sm text-custom-text/70">{description}</p>}
    </div>
  );
}
