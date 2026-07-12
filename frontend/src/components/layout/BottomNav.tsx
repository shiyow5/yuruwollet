import { NavLink } from 'react-router';
import { Icon } from '../ui/Icon';
import { cn } from '../../lib/cn';
import { navItems } from './navItems';

/** モバイル用ボトムナビ（md 以上では非表示） */
export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around rounded-t-xl border-t border-black/5 bg-white px-2 py-3 shadow-lg md:hidden">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className="flex flex-1 flex-col items-center gap-1 py-1"
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  'flex items-center justify-center rounded-xl px-6 py-1',
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
                  'font-label-sm text-[10px]',
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
