import { NavLink } from 'react-router';
import { Icon } from '../ui/Icon';
import { cn } from '../../lib/cn';
import { navItems } from './navItems';

/** デスクトップ用の横並びナビ（md 以上で表示） */
export function DesktopNav() {
  return (
    <nav className="hidden items-center gap-1 md:flex">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-full px-4 py-2 font-label-sm text-label-sm transition',
              isActive
                ? 'bg-custom-accent/15 text-accent-text'
                : 'text-custom-text/70 hover:text-custom-text',
            )
          }
        >
          <Icon name={item.icon} size={20} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
