import { useState } from 'react';
import { Button, Icon, Input } from '../../components/ui';
import { validateAccountForm } from '../../lib/ledger/schema';
import { ACCOUNT_ICON_GROUPS, DEFAULT_ACCOUNT_ICON, isAccountIcon } from '../../lib/icons/palette';

// フォームの既定アイコン。中立な「財布」にする（CategoryManager が 'label' を使うのと同じ発想）。
// schema の accountDraftSchema の既定と揃える。DEFAULT_ACCOUNT_ICON は IconPicker のフォールバック用。
const FORM_DEFAULT_ICON = 'account_balance_wallet';
import type { Account } from '../../lib/ledger/types';
import {
  useAccounts,
  useCreateAccount,
  useArchiveAccount,
  useUnarchiveAccount,
  useDeleteAccount,
} from './hooks';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { IconPicker } from './IconPicker';

/**
 * アカウント（在り処: 現金 / 銀行 / クレカ / PayPay 等）の追加・アーカイブ・削除（#98）。
 *
 * カテゴリ管理（CategoryManager）と同型だが、収入/支出で分けないので種別トグルは無い。
 * また system/default の保護が無いため、テンプレも含め全アカウントに削除ボタンを出す
 * （使用中は DeleteAccountDialog が FK restrict を事前に説明してアーカイブへ誘導）。
 */
export function AccountManager() {
  const { data: accounts = [] } = useAccounts();
  const createAccount = useCreateAccount();
  const archiveAccount = useArchiveAccount();
  const unarchiveAccount = useUnarchiveAccount();
  const deleteAccount = useDeleteAccount();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState(FORM_DEFAULT_ICON);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);

  const active = accounts.filter((a) => !a.is_archived);
  const archived = accounts.filter((a) => a.is_archived);

  function restore(id: string) {
    setActionError(null);
    unarchiveAccount.mutate(id, {
      onError: () => setActionError('復元に失敗しました。再度お試しください。'),
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    setActionError(null);
    deleteAccount.mutate(deleting.id, {
      onSuccess: () => setDeleting(null),
      onError: () => setActionError('削除に失敗しました。再度お試しください。'),
    });
  }

  function archiveFromDialog() {
    if (!deleting) return;
    setActionError(null);
    archiveAccount.mutate(deleting.id, {
      onSuccess: () => setDeleting(null),
      onError: () => setActionError('アーカイブに失敗しました。再度お試しください。'),
    });
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const result = validateAccountForm({ name, icon });
    if (!result.ok) {
      setError(result.errors.name ?? 'アカウントを追加できません');
      return;
    }
    setError(null);
    createAccount.mutate(result.value, {
      onSuccess: () => {
        setName('');
        setIcon(FORM_DEFAULT_ICON);
      },
      onError: () => {
        setError('追加できませんでした。同じ名前のアカウントが既にあるかもしれません。');
      },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <h3 className="font-headline-md text-headline-md text-custom-text">
        アカウント（お金の在り処）
      </h3>
      <p className="font-label-sm text-label-sm text-custom-text/70">
        収支の「在り処」（現金・銀行・クレカ・○○ペイなど）を登録できます。ログイン用アカウントとは別です。
      </p>

      <form
        className="flex flex-col gap-4"
        onSubmit={handleAdd}
        aria-label="アカウント追加フォーム"
      >
        <Input
          label="アカウント名"
          placeholder="現金 / ○○銀行 / △△カード など"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <IconPicker
          value={icon}
          onChange={setIcon}
          groups={ACCOUNT_ICON_GROUPS}
          isValid={isAccountIcon}
          fallbackIcon={DEFAULT_ACCOUNT_ICON}
        />
        {error && (
          <p role="alert" className="font-label-sm text-label-sm text-error">
            {error}
          </p>
        )}
        <Button type="submit" fullWidth disabled={createAccount.isPending}>
          {createAccount.isPending ? '追加中…' : 'アカウントを追加'}
        </Button>
      </form>

      {actionError && (
        <p role="alert" className="font-label-sm text-label-sm text-error">
          {actionError}
        </p>
      )}

      <AccountGroup
        title="アカウント"
        accounts={active}
        actionIcon="delete"
        actionVerb="削除"
        actionHover="hover:bg-error/10 hover:text-error"
        onAction={(a) => setDeleting(a)}
      />
      {archived.length > 0 && (
        <AccountGroup
          title="アーカイブ済"
          accounts={archived}
          actionIcon="unarchive"
          actionVerb="復元"
          actionHover="hover:bg-custom-accent/10 hover:text-custom-accent"
          onAction={(a) => restore(a.id)}
        />
      )}

      <DeleteAccountDialog
        account={deleting}
        deleting={deleteAccount.isPending}
        archiving={archiveAccount.isPending}
        onCancel={() => setDeleting(null)}
        onDelete={confirmDelete}
        onArchive={archiveFromDialog}
      />
    </div>
  );
}

function AccountGroup({
  title,
  accounts,
  actionIcon,
  actionVerb,
  actionHover,
  onAction,
}: {
  title: string;
  accounts: Account[];
  actionIcon: string;
  actionVerb: string;
  actionHover: string;
  onAction: (account: Account) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h4 className="font-label-sm text-label-sm uppercase tracking-[0.2em] text-custom-text/70">
        {title}
      </h4>
      {accounts.length === 0 ? (
        <p className="font-label-sm text-label-sm text-custom-text/70">まだありません</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-2xl bg-surface-container-high px-4 py-3"
            >
              <span className="flex items-center gap-3">
                <Icon
                  name={a.icon ?? 'account_balance_wallet'}
                  size={20}
                  className="text-custom-accent"
                />
                <span className="font-body-md text-body-md text-custom-text">{a.name}</span>
              </span>
              <button
                type="button"
                aria-label={`${a.name} を${actionVerb}`}
                onClick={() => onAction(a)}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-custom-text/60 transition ${actionHover}`}
              >
                <Icon name={actionIcon} size={20} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
