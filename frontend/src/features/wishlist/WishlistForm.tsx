import { useState } from 'react';
import { Button, Input, SegmentedControl } from '../../components/ui';
import { parseWishlistForm, type WishlistFormValues } from '../../lib/wishlist/schema';
import { GENRES, genreLabel } from '../../lib/wishlist/labels';
import type { WishGenre } from '../../lib/wishlist/types';

interface Props {
  /** 開いているタブのジャンルを初期値にする */
  initialGenre: WishGenre;
  submitting?: boolean;
  submitError?: string | null;
  onSubmit: (value: { genre: WishGenre; title: string; url: string; memo: string }) => void;
  onCancel: () => void;
}

const GENRE_OPTIONS = GENRES.map((g) => ({ value: g, label: genreLabel(g) }));

/** ウィッシュリスト追加フォーム（プレゼンテーショナル）。 */
export function WishlistForm({ initialGenre, submitting, submitError, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<WishlistFormValues>({
    genre: initialGenre,
    title: '',
    url: '',
    memo: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof WishlistFormValues, string>>>({});

  function set<K extends keyof WishlistFormValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = parseWishlistForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(result.value);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
      <h2 className="font-headline-md text-headline-md font-bold text-custom-text">追加する</h2>

      <SegmentedControl
        fullWidth
        ariaLabel="ジャンル"
        options={GENRE_OPTIONS}
        value={values.genre as WishGenre}
        onChange={(g) => set('genre', g)}
      />

      <div>
        <Input
          label="タイトル"
          id="wish-title"
          value={values.title}
          placeholder={values.genre === 'want' ? '新しいコーヒーメーカー' : '海辺のカフェ'}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? 'wish-title-error' : undefined}
          onChange={(e) => set('title', e.target.value)}
        />
        {errors.title && (
          <p id="wish-title-error" role="alert" className="mt-1 text-label-sm text-error">
            {errors.title}
          </p>
        )}
      </div>

      <div>
        <Input
          label="URL（任意）"
          id="wish-url"
          inputMode="url"
          value={values.url}
          placeholder="https://"
          aria-invalid={errors.url ? true : undefined}
          aria-describedby={errors.url ? 'wish-url-error' : undefined}
          onChange={(e) => set('url', e.target.value)}
        />
        {errors.url && (
          <p id="wish-url-error" role="alert" className="mt-1 text-label-sm text-error">
            {errors.url}
          </p>
        )}
      </div>

      <div>
        <Input
          label="メモ（任意）"
          id="wish-memo"
          value={values.memo}
          aria-invalid={errors.memo ? true : undefined}
          aria-describedby={errors.memo ? 'wish-memo-error' : undefined}
          onChange={(e) => set('memo', e.target.value)}
        />
        {errors.memo && (
          <p id="wish-memo-error" role="alert" className="mt-1 text-label-sm text-error">
            {errors.memo}
          </p>
        )}
      </div>

      {submitError && (
        <p role="alert" className="text-label-sm text-error">
          {submitError}
        </p>
      )}

      <div className="flex gap-3 pt-1">
        <Button
          type="button"
          variant="secondary"
          fullWidth
          disabled={submitting}
          onClick={onCancel}
        >
          キャンセル
        </Button>
        <Button type="submit" fullWidth disabled={submitting}>
          {submitting ? '追加中…' : '追加'}
        </Button>
      </div>
    </form>
  );
}
