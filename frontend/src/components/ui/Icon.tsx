import { cn } from '../../lib/cn';

interface IconProps {
  name: string;
  className?: string;
  filled?: boolean;
  size?: number;
}

/** Material Symbols (Outlined) アイコン */
export function Icon({ name, className, filled = false, size = 24 }: IconProps) {
  return (
    <span
      className={cn('material-symbols-outlined select-none leading-none', className)}
      style={{ fontSize: size, fontVariationSettings: `'FILL' ${filled ? 1 : 0}` }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
