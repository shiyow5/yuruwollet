import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Card, Modal } from '../../components/ui';
import { useSessionContext } from '../../lib/auth/session-context';
import { useProfiles } from '../shared/members';
import { logout } from '../../lib/auth/logout';

/** ログイン中のアカウントと、ログアウト。 */
export function AccountCard() {
  const session = useSessionContext();
  const profiles = useProfiles();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const member = session.status === 'authenticated' ? session.session.member : null;
  // email は profiles にしか無い（Access JWT の email はサーバー側で member に写像して捨てている）
  const email = (profiles.data ?? []).find((p) => p.member_id === member?.id)?.email ?? null;

  function handleLogout() {
    // 遷移前に、セッションに紐づくキャッシュを捨てる（logout の中で順序を保証している）
    void logout({ clearCaches: () => queryClient.clear() });
  }

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 shrink-0">
          {/* 未認証でも枠は出す（E2E / セッション取得失敗でもレイアウトが崩れない） */}
          <Avatar
            name={member?.displayName ?? ''}
            memberId={member?.id ?? ''}
            src={member?.avatarUrl}
          />
        </div>
        <div className="min-w-0">
          <p className="font-headline-md text-body-lg font-medium text-custom-text">
            {member?.displayName ?? 'ログイン情報を取得できません'}
          </p>
          <p className="truncate text-label-sm text-custom-text/70">{email ?? '—'}</p>
        </div>
      </div>

      {/* ログアウト自体はセッションを必要としない。**セッションが取れていなくても押せる**
          （むしろ、おかしくなったときの復旧手段として押せる必要がある）。 */}
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        ログアウト
      </Button>

      {/* 誤タップのコストが大きい: 30日の Access セッションを破棄して Google で再認証になる */}
      <Modal open={confirming} label="ログアウト" onClose={() => setConfirming(false)}>
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="font-headline-md text-body-lg font-medium text-custom-text">
              ログアウトしますか？
            </h3>
            <p className="mt-1 text-body-md text-custom-text/70">
              次に開くときは Google でログインし直します。
            </p>
            {/*
              Access のログアウトは CF_Authorization を消すが、**Google のセッションは消えない**。
              Cloudflare の Google IdP には prompt パラメータが無く（API スキーマ上、prompt は
              Entra ID 専用）、Access 側から再認証を強制する手段が存在しない。
              黙っていると「ログアウトしたのにすぐ入れる」と混乱するので、先に伝える。
            */}
            <p className="mt-2 text-label-sm text-custom-text/70">
              ブラウザの Google のログイン状態は残ります。同じ端末では、ログインボタンを押すだけで
              入り直せます。
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setConfirming(false)}>
              キャンセル
            </Button>
            <Button fullWidth onClick={handleLogout}>
              ログアウトする
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
