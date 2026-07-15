import { useState } from 'react';
import { Button, Icon, Input, SegmentedControl } from '../../components/ui';
import { validateCategoryForm } from '../../lib/ledger/schema';
import { isDeletable, userCategories } from '../../lib/ledger/categories';
import type { Category, TxnType } from '../../lib/ledger/types';
import {
  useCategories,
  useCreateCategory,
  useArchiveCategory,
  useUnarchiveCategory,
  useDeleteCategory,
} from './hooks';
import { DeleteCategoryDialog } from './DeleteCategoryDialog';
import { IconPicker } from './IconPicker';

const KIND_OPTIONS = [
  { value: 'expense' as const, label: '支出' },
  { value: 'income' as const, label: '収入' },
];

/** カテゴリの追加・アーカイブ・削除を行う管理パネル。 */
export function CategoryManager() {
  const { data: categories = [] } = useCategories();
  const createCategory = useCreateCategory();
  const archiveCategory = useArchiveCategory();
  const unarchiveCategory = useUnarchiveCategory();
  const deleteCategory = useDeleteCategory();

  const [kind, setKind] = useState<TxnType>('expense');
  const [name, setName] = useState('');
  // 既定は 'label'（パレット内の汎用アイコン）。ピッカーで選び直せる。
  const [icon, setIcon] = useState('label');
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // 削除確認ダイアログの対象（ユーザー追加カテゴリのみ）
  const [deleting, setDeleting] = useState<Category | null>(null);

  const userCats = userCategories(categories);
  const active = userCats.filter((c) => !c.is_archived);
  const archived = userCats.filter((c) => c.is_archived);
  const expense = active.filter((c) => c.kind === 'expense');
  const income = active.filter((c) => c.kind === 'income');

  function archive(id: string) {
    setActionError(null);
    archiveCategory.mutate(id, {
      onError: () => setActionError('アーカイブに失敗しました。再度お試しください。'),
    });
  }

  function restore(id: string) {
    setActionError(null);
    unarchiveCategory.mutate(id, {
      onError: () => setActionError('復元に失敗しました。再度お試しください。'),
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    setActionError(null);
    deleteCategory.mutate(deleting.id, {
      onSuccess: () => setDeleting(null),
      onError: () => setActionError('削除に失敗しました。再度お試しください。'),
    });
  }

  // 削除ダイアログで「使われているのでアーカイブ」を選んだとき
  function archiveFromDialog() {
    if (!deleting) return;
    setActionError(null);
    archiveCategory.mutate(deleting.id, {
      onSuccess: () => setDeleting(null),
      onError: () => setActionError('アーカイブに失敗しました。再度お試しください。'),
    });
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const result = validateCategoryForm({ kind, name, icon });
    if (!result.ok) {
      setError(result.errors.name ?? result.errors.kind ?? 'カテゴリを追加できません');
      return;
    }
    setError(null);
    createCategory.mutate(result.value, {
      onSuccess: () => {
        setName('');
        setIcon('label');
      },
      onError: () => {
        setError('追加できませんでした。同じ名前のカテゴリが既にあるかもしれません。');
      },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <h3 className="font-headline-md text-headline-md text-custom-text">カテゴリ管理</h3>

      <form className="flex flex-col gap-4" onSubmit={handleAdd} aria-label="カテゴリ追加フォーム">
        <SegmentedControl
          fullWidth
          options={KIND_OPTIONS}
          value={kind}
          onChange={setKind}
          ariaLabel="カテゴリの種別"
        />
        <Input
          label="カテゴリ名"
          placeholder="食費 / 給与 など"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <IconPicker value={icon} onChange={setIcon} />
        {error && (
          <p role="alert" className="font-label-sm text-label-sm text-error">
            {error}
          </p>
        )}
        <Button type="submit" fullWidth disabled={createCategory.isPending}>
          {createCategory.isPending ? '追加中…' : 'カテゴリを追加'}
        </Button>
      </form>

      {actionError && (
        <p role="alert" className="font-label-sm text-label-sm text-error">
          {actionError}
        </p>
      )}

      <ActiveCategoryGroup
        title="支出カテゴリ"
        categories={expense}
        onArchive={archive}
        onDelete={setDeleting}
      />
      <ActiveCategoryGroup
        title="収入カテゴリ"
        categories={income}
        onArchive={archive}
        onDelete={setDeleting}
      />
      {archived.length > 0 && (
        <CategoryGroup
          title="アーカイブ済"
          categories={archived}
          actionIcon="unarchive"
          actionVerb="復元"
          actionHover="hover:bg-custom-accent/10 hover:text-custom-accent"
          onAction={restore}
        />
      )}

      <DeleteCategoryDialog
        category={deleting}
        deleting={deleteCategory.isPending}
        archiving={archiveCategory.isPending}
        onCancel={() => setDeleting(null)}
        onDelete={confirmDelete}
        onArchive={archiveFromDialog}
      />
    </div>
  );
}

/**
 * アクティブなカテゴリのグループ。
 * ユーザー追加（isDeletable）は削除ボタン、デフォルト/システムはアーカイブボタンを出す。
 */
function ActiveCategoryGroup({
  title,
  categories,
  onArchive,
  onDelete,
}: {
  title: string;
  categories: Category[];
  onArchive: (id: string) => void;
  onDelete: (category: Category) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h4 className="font-label-sm text-label-sm uppercase tracking-[0.2em] text-custom-text/70">
        {title}
      </h4>
      {categories.length === 0 ? (
        <p className="font-label-sm text-label-sm text-custom-text/70">まだありません</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {categories.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-2xl bg-surface-container-high px-4 py-3"
            >
              <span className="flex items-center gap-3">
                <Icon name={c.icon ?? 'label'} size={20} className="text-custom-accent" />
                <span className="font-body-md text-body-md text-custom-text">{c.name}</span>
              </span>
              {isDeletable(c) ? (
                <button
                  type="button"
                  aria-label={`${c.name} を削除`}
                  onClick={() => onDelete(c)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-custom-text/60 transition hover:bg-error/10 hover:text-error"
                >
                  <Icon name="delete" size={20} />
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={`${c.name} をアーカイブ`}
                  onClick={() => onArchive(c.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-custom-text/60 transition hover:bg-error/10 hover:text-error"
                >
                  <Icon name="archive" size={20} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CategoryGroup({
  title,
  categories,
  actionIcon,
  actionVerb,
  actionHover,
  onAction,
}: {
  title: string;
  categories: Category[];
  actionIcon: string;
  actionVerb: string;
  actionHover: string;
  onAction: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h4 className="font-label-sm text-label-sm uppercase tracking-[0.2em] text-custom-text/70">
        {title}
      </h4>
      {categories.length === 0 ? (
        <p className="font-label-sm text-label-sm text-custom-text/70">まだありません</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {categories.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-2xl bg-surface-container-high px-4 py-3"
            >
              <span className="flex items-center gap-3">
                <Icon name={c.icon ?? 'label'} size={20} className="text-custom-accent" />
                <span className="font-body-md text-body-md text-custom-text">{c.name}</span>
              </span>
              <button
                type="button"
                aria-label={`${c.name} を${actionVerb}`}
                onClick={() => onAction(c.id)}
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
