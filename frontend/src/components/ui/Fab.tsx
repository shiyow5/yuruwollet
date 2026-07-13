import type { ButtonHTMLAttributes } from 'react';
import { Icon } from './Icon';
import { cn } from '../../lib/cn';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: string;
  label: string;
}

/** 追加用フローティングアクションボタン */
export function Fab({ icon = 'add', label, className, ...props }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        // ボトムナビの上に浮く。ナビがセーフエリアぶん高くなるので、こちらも同じだけ持ち上げる
        'fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-[calc(1.25rem+env(safe-area-inset-right))] z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-custom-accent text-on-primary shadow-lg transition hover:opacity-90 md:bottom-8',
        className,
      )}
      {...props}
    >
      <Icon name={icon} size={28} />
    </button>
  );
}
