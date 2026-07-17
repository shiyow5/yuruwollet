import { Link } from 'react-router';
import { Avatar } from '../ui/Avatar';
import { DesktopNav } from './DesktopNav';
import { useSessionContext } from '../../lib/auth/session-context';

export function TopAppBar() {
  const session = useSessionContext();
  const member = session.status === 'authenticated' ? session.session.member : null;

  return (
    <header className="sticky top-0 z-30 flex w-full items-center justify-between gap-4 bg-custom-bg/90 px-5 py-5 backdrop-blur md:px-16">
      <Link to="/" className="font-headline-md text-headline-md font-bold text-custom-accent">
        yuruwollet
      </Link>
      <div className="flex items-center gap-2">
        <DesktopNav />
        {/*
          いま誰としてログインしているかを、どのページでも見えるようにする
          （これまでホームの見出し以外では分からず、相手タブを見ているときに混乱していた）。
          クリックで設定へ。歯車は置かない（/mypage を指していてボトムナビと重複していた）。

          **セッションが取れていなくても必ず描く。** これが /settings への唯一の導線なので、
          認証済みのときだけ描くと未認証時に到達不能なルートになる
          （E2E は Pages Functions を起動しないため、そこでは常に未認証）。
        */}
        <Link
          to="/settings"
          aria-label={member ? `${member.displayName} としてログイン中` : '設定'}
          className="flex h-11 w-11 items-center justify-center rounded-full p-0.5 text-custom-text hover:bg-black/5"
        >
          <Avatar
            name={member?.displayName ?? ''}
            memberId={member?.id ?? ''}
            src={member?.avatarUrl}
          />
        </Link>
      </div>
    </header>
  );
}
