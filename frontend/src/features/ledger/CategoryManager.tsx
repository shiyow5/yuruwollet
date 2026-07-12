import { useState } from 'react';
import { Button, Icon, Input, SegmentedControl } from '../../components/ui';
import { validateCategoryForm } from '../../lib/ledger/schema';
import { userCategories } from '../../lib/ledger/categories';
import type { Category, TxnType } from '../../lib/ledger/types';
import { useCategories, useCreateCategory, useArchiveCategory } from './hooks';

const KIND_OPTIONS = [
  { value: 'expense' as const, label: '支出' },
  { value: 'income' as const, label: '収入' },
];

/** カテゴリの追加とソフトアーカイブを行う管理パネル。 */
export function CategoryManager() {
  const { data: categories = [] } = useCategories();
  const createCategory = useCreateCategory();
  const archiveCategory = useArchiveCategory();

  const [kind, setKind] = useState<TxnType>('expense');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [error, setError] = useState<string | null>(null);

  const active = userCategories(categories).filter((c) => !c.is_archived);
  const expense = active.filter((c) => c.kind === 'expense');
  const income = active.filter((c) => c.kind === 'income');

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
        setIcon('');
      },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <h3 className="font-headline-md text-headline-md text-custom-text">カテゴリ管理</h3>

      <form className="flex flex-col gap-4" onSubmit={handleAdd} aria-label="カテゴリ追加フォーム">
        <SegmentedControl options={KIND_OPTIONS} value={kind} onChange={setKind} />
        <Input
          label="カテゴリ名"
          placeholder="食費 / 給与 など"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="アイコン（Material Symbols 名・任意）"
          placeholder="restaurant"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
        />
        {error && (
          <p role="alert" className="font-label-sm text-label-sm text-error">
            {error}
          </p>
        )}
        <Button type="submit" fullWidth disabled={createCategory.isPending}>
          {createCategory.isPending ? '追加中…' : 'カテゴリを追加'}
        </Button>
      </form>

      <CategoryGroup
        title="支出カテゴリ"
        categories={expense}
        onArchive={(id) => archiveCategory.mutate(id)}
      />
      <CategoryGroup
        title="収入カテゴリ"
        categories={income}
        onArchive={(id) => archiveCategory.mutate(id)}
      />
    </div>
  );
}

function CategoryGroup({
  title,
  categories,
  onArchive,
}: {
  title: string;
  categories: Category[];
  onArchive: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h4 className="font-label-sm text-label-sm uppercase tracking-[0.2em] text-custom-text/60">
        {title}
      </h4>
      {categories.length === 0 ? (
        <p className="font-label-sm text-label-sm text-custom-text/40">まだありません</p>
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
                aria-label={`${c.name} をアーカイブ`}
                onClick={() => onArchive(c.id)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-custom-text/40 transition hover:bg-error/10 hover:text-error"
              >
                <Icon name="archive" size={20} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
