import { cn } from '../../lib/cn';
import { iconGlyph } from '../../lib/icons/codepoints';

interface IconProps {
  name: string;
  className?: string;
  filled?: boolean;
  size?: number;
}

/** Material Symbols (Outlined) アイコン。サブセット済みフォントをコードポイントで描く（#9）。 */
export function Icon({ name, className, filled = false, size = 24 }: IconProps) {
  return (
    <span
      className={cn('material-symbols-outlined select-none leading-none', className)}
      style={{ fontSize: size, fontVariationSettings: `'FILL' ${filled ? 1 : 0}` }}
      data-icon={name}
      aria-hidden="true"
    >
      {iconGlyph(name)}
    </span>
  );
}
