import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface Props {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  /** true で背景クリックによるクローズを無効化（24日の壁のロック用） */
  locked?: boolean;
}

export function Modal({ open, onClose, children, className, locked = false }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (!locked) onClose?.();
      }}
    >
      <div
        className={cn(
          'w-full max-w-sm rounded-3xl bg-surface-container-lowest p-8 shadow-xl',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
