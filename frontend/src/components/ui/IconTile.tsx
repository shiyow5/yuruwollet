import { Icon } from './Icon';
import { cn } from '../../lib/cn';

interface Props {
  name: string;
  className?: string;
  filled?: boolean;
  size?: number;
}

/** 角丸背景付きのアイコン枠（履歴/カテゴリ行の先頭など） */
export function IconTile({ name, className, filled, size = 24 }: Props) {
  return (
    <div
      className={cn(
        'flex h-12 w-12 items-center justify-center rounded-2xl bg-custom-accent/10 text-accent-text',
        className,
      )}
    >
      <Icon name={name} filled={filled} size={size} />
    </div>
  );
}
