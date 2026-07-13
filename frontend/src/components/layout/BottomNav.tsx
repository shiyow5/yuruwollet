import { NavLink } from 'react-router';
import { Icon } from '../ui/Icon';
import { cn } from '../../lib/cn';
import { navItems } from './navItems';

/** モバイル用ボトムナビ（md 以上では非表示） */
export function BottomNav() {
  return (
    // 画面が 6 つあるので、1 項目あたりの幅を切り詰める。
    // アイコンの丸みを px-6 のままにすると 1 項目 72px 必要になり、
    // 360px 幅の端末で 6 項目 (432px) が収まらず溢れる。
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center rounded-t-xl border-t border-black/5 bg-white px-1 py-2 shadow-lg md:hidden">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1"
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  'flex items-center justify-center rounded-xl px-3 py-0.5',
                  isActive && 'bg-custom-accent/20',
                )}
              >
                <Icon
                  name={item.icon}
                  filled={isActive}
                  className={isActive ? 'text-custom-accent' : 'text-custom-text/40'}
                />
              </span>
              <span
                className={cn(
                  'w-full truncate text-center font-label-sm text-[10px] leading-tight',
                  isActive ? 'font-bold text-custom-accent' : 'text-custom-text/40',
                )}
              >
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
