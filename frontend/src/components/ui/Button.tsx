import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

const base =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 font-label-sm text-label-sm transition disabled:pointer-events-none disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-custom-accent text-on-primary shadow-sm hover:opacity-90',
  secondary:
    'border border-custom-accent/20 bg-white text-custom-accent shadow-sm hover:bg-custom-accent/5',
  ghost: 'text-custom-accent hover:bg-custom-accent/5',
};

export function Button({
  variant = 'primary',
  fullWidth = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], fullWidth && 'w-full', className)}
      {...props}
    />
  );
}
