import { Link } from 'react-router';
import { Icon } from '../ui/Icon';
import { DesktopNav } from './DesktopNav';

export function TopAppBar() {
  return (
    <header className="sticky top-0 z-30 flex w-full items-center justify-between gap-4 bg-custom-bg/90 px-5 py-5 backdrop-blur md:px-16">
      <Link to="/" className="font-headline-md text-headline-md font-bold text-custom-accent">
        yuruwollet
      </Link>
      <div className="flex items-center gap-2">
        <DesktopNav />
        <Link
          to="/mypage"
          aria-label="設定"
          className="flex h-11 w-11 items-center justify-center rounded-full text-custom-text hover:bg-black/5"
        >
          <Icon name="settings" />
        </Link>
      </div>
    </header>
  );
}
