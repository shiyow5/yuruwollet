import { useMemo, useState } from 'react';
import { EmptyState, Fab, Modal, SegmentedControl, Skeleton } from '../../components/ui';
import { GENRES, tabLabel } from '../../lib/wishlist/labels';
import type { WishTab, WishGenre } from '../../lib/wishlist/types';
import { useProfiles } from '../shared/members';
import { WishlistForm } from './WishlistForm';
import { WishlistItemCard } from './WishlistItemCard';
import {
  useWishlist,
  useWishlistRealtime,
  useCreateWishlistItem,
  useCompleteWishlistItem,
  useRestoreWishlistItem,
  useDeleteWishlistItem,
} from './hooks';

const TABS: WishTab[] = [...GENRES, 'archive'];
const TAB_OPTIONS = TABS.map((t) => ({ value: t, label: tabLabel(t) }));

const EMPTY: Record<WishTab, { title: string; description: string }> = {
  want: { title: 'ほしい物はまだありません', description: '「＋」から二人のほしい物を追加してね' },
  place: {
    title: '行きたい場所はまだありません',
    description: '「＋」から二人で行きたい場所を追加してね',
  },
  archive: {
    title: '思い出はまだありません',
    description: '「買った！」「行った！」を押すとここに残ります',
  },
};

export function WishlistBoard() {
  const [tab, setTab] = useState<WishTab>('want');
  const [formOpen, setFormOpen] = useState(false);

  const archived = tab === 'archive';
  const list = useWishlist(archived);
  const realtime = useWishlistRealtime();
  const profiles = useProfiles();

  const create = useCreateWishlistItem();
  const complete = useCompleteWishlistItem();
  const restore = useRestoreWishlistItem();
  const remove = useDeleteWishlistItem();

  const nameOf = useMemo(() => {
    const byId = new Map((profiles.data ?? []).map((p) => [p.member_id, p.display_name]));
    return (memberId: string) => byId.get(memberId) ?? memberId;
  }, [profiles.data]);

  // 思い出タブはジャンル横断。現役タブは開いているジャンルだけ。
  const items = (list.data ?? []).filter((i) => archived || i.genre === tab);

  const mutating = create.isPending || complete.isPending || restore.isPending || remove.isPending;
  const mutationError = complete.error ?? restore.error ?? remove.error;

  function handleCreate(value: { genre: WishGenre; title: string; url: string; memo: string }) {
    create.mutate(value, { onSuccess: () => setFormOpen(false) });
  }

  return (
    <div className="flex flex-col gap-6">
      <SegmentedControl
        ariaLabel="表示するリスト"
        options={TAB_OPTIONS}
        value={tab}
        onChange={setTab}
      />

      {/* 同期が黙って止まらないようにする（相手の変更が反映されていない可能性を伝える） */}
      {realtime === 'error' && (
        <p role="status" className="text-label-sm text-custom-text/60">
          リアルタイム同期が切れています。最新の状態は再読み込みで確認してください。
        </p>
      )}

      {mutationError && (
        <p role="alert" className="text-label-sm text-error">
          {mutationError instanceof Error ? mutationError.message : '操作に失敗しました'}
        </p>
      )}

      {list.isError ? (
        <p role="alert" className="text-label-sm text-error">
          ウィッシュリストを取得できませんでした。時間をおいて再度お試しください。
        </p>
      ) : list.isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={tab === 'archive' ? 'photo_album' : 'favorite'}
          title={EMPTY[tab].title}
          description={EMPTY[tab].description}
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <WishlistItemCard
              key={item.id}
              item={item}
              registrantName={nameOf(item.registrant_id)}
              busy={mutating}
              onComplete={complete.mutate}
              onRestore={restore.mutate}
              onDelete={remove.mutate}
            />
          ))}
        </ul>
      )}

      <Fab icon="add" label="ウィッシュを追加" onClick={() => setFormOpen(true)} />

      {formOpen && (
        <Modal open label="ウィッシュを追加" onClose={() => setFormOpen(false)}>
          <WishlistForm
            initialGenre={archived ? 'want' : tab}
            submitting={create.isPending}
            submitError={create.isError ? '追加できませんでした。再度お試しください。' : null}
            onSubmit={handleCreate}
            onCancel={() => setFormOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}
