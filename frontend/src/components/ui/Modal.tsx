import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface Props {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  /** true で背景クリック/Escape によるクローズを無効化（24日の壁のロック用） */
  locked?: boolean;
  /** ダイアログのアクセシブルネーム（スクリーンリーダー向け） */
  label?: string;
}

// `tabindex="-1"` を除くのは button/input 等にも効かせる必要がある。裸の `button` だけだと、
// roving tabindex（APG のグリッド/リストボックス）で -1 にした要素まで拾い、
// フォーカストラップが全部を tab stop に戻してしまう（#88 の IconPicker で踏んだ）。
const FOCUSABLE = [
  'button',
  '[href]',
  'input',
  'select',
  'textarea',
  '[tabindex]',
]
  .map((s) => `${s}:not([tabindex="-1"])`)
  .join(', ');

export function Modal({ open, onClose, children, className, locked = false, label }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  // onClose は親の再レンダーで identity が変わりやすい。ref 経由で参照し、
  // フォーカス管理 effect の依存に含めない（開いている間に再フォーカスで入力を奪わないため）。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // 初期フォーカスを最初のフォーカス可能要素（無ければパネル）へ移す
    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !locked) {
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      // フォーカストラップ: パネル内の端で循環させる
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('disabled'),
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, locked]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={() => {
        if (!locked) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'w-full max-w-sm rounded-3xl bg-surface-container-lowest p-8 shadow-xl outline-none',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
